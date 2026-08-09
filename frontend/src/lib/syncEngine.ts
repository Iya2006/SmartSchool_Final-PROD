/**
 * Moteur de synchronisation — module Offline-First Phase 1.
 *
 * Vide la file locale (`offlineQueue.ts`) dès que la connexion revient :
 * détecté via l'événement navigateur `online`, le retour au premier plan de
 * l'onglet (`visibilitychange`), et manuellement au montage du portail
 * enseignant s'il reste des éléments en attente d'une session précédente.
 *
 * Chaque entrée est rejouée dans l'ordre de saisie vers l'endpoint de sync
 * correspondant (voir backend/app/api/sync.py). Trois issues possibles :
 *
 * - Pas de réponse serveur du tout (réseau absent) : on arrête IMMÉDIATEMENT,
 *   l'élément et les suivants restent EN_ATTENTE — rejouer échouerait de
 *   façon identique, et ce n'est pas un échec de l'élément lui-même.
 * - Le serveur répond par un refus (HTTP 403/404/422, ou — cas particulier
 *   de /api/sync/{id}/notes — un 200 dont `resultats` contient des entrées
 *   REFUSE/INTROUVABLE : le batch a été traité mais PAS appliqué pour cet
 *   item précis). Rejouer le même payload ne changera pas la décision du
 *   serveur : l'élément est marqué ECHEC_DEFINITIF (voir offlineQueue.ts),
 *   jamais supprimé, affiché à l'utilisateur, rejouable manuellement.
 * - Le serveur répond par une erreur transitoire (5xx, timeout applicatif...) :
 *   l'élément est marqué ERREUR et sera retenté automatiquement au prochain
 *   déclenchement, jusqu'à `MAX_TENTATIVES` — au-delà, il bascule aussi en
 *   ECHEC_DEFINITIF plutôt que d'être retenté indéfiniment.
 *
 * Dans tous les cas, on continue avec l'élément suivant : un item en échec
 * ne doit jamais bloquer le reste de la file.
 */
import api from './api';
import { listPending, listBlocked, markInProgress, markSynced, markFailed, countBlocked, retry as retryItem } from './offlineQueue';

export interface SyncConflict {
    note_id?: number;
    [key: string]: unknown;
}

export interface SyncState {
    syncing: boolean;
    pendingCount: number;
    blockedCount: number;
    lastSyncAt: string | null;
    lastConflicts: SyncConflict[];
    lastError: string | null;
}

let state: SyncState = {
    syncing: false,
    pendingCount: 0,
    blockedCount: 0,
    lastSyncAt: null,
    lastConflicts: [],
    lastError: null,
};

type Listener = (s: SyncState) => void;
const listeners = new Set<Listener>();

function emit() {
    listeners.forEach((l) => l(state));
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
}

export async function refreshPendingCount(): Promise<number> {
    const [pending, blocked] = await Promise.all([listPending(), countBlocked()]);
    state = { ...state, pendingCount: pending.length, blockedCount: blocked };
    emit();
    return pending.length;
}

function isNetworkError(err: unknown): boolean {
    const code = (err as { code?: string })?.code;
    const hasResponse = !!(err as { response?: unknown })?.response;
    return code === 'ERR_NETWORK' && !hasResponse;
}

// Refus qui ne se résoudra PAS en rejouant le même payload — retenter serait
// pure perte de temps (et cacherait le vrai problème à l'utilisateur plus
// longtemps). 401 inclus par prudence : l'intercepteur global (lib/api.ts)
// déconnecte déjà l'utilisateur sur un 401, donc un nouveau essai automatique
// n'aurait de toute façon aucune chance d'aboutir avant une reconnexion.
const DEFINITIVE_HTTP_STATUSES = new Set([401, 403, 404, 422]);

function isDefinitiveServerError(err: unknown): boolean {
    const status = (err as { response?: { status?: number } })?.response?.status;
    return status !== undefined && DEFINITIVE_HTTP_STATUSES.has(status);
}

interface NotesSyncResult {
    note_id?: number;
    statut?: string;
    detail?: string;
}

/**
 * Cas particulier de /api/sync/{id}/notes : un batch peut renvoyer HTTP 200
 * tout en refusant CERTAINS items (évaluation déjà centralisée, trimestre
 * clôturé, note hors périmètre...) via `resultats[].statut`. Sans cette
 * vérification, `flushQueue` traiterait un refus embarqué dans un 200 comme
 * un succès et supprimerait l'élément — la saisie hors-ligne de l'enseignant
 * disparaîtrait silencieusement. /api/sync/{id}/presences n'a pas ce champ
 * (upsert direct, pas de refus par item) : `resultats` y est simplement
 * absent, la fonction ne renvoie rien dans ce cas.
 */
function extractRefusals(data: unknown): string[] | null {
    const resultats = (data as { resultats?: NotesSyncResult[] })?.resultats;
    if (!Array.isArray(resultats)) return null;
    const refuses = resultats.filter((r) => r.statut === 'REFUSE' || r.statut === 'INTROUVABLE');
    if (refuses.length === 0) return null;
    return refuses.map((r) => `note ${r.note_id ?? '?'} : ${r.detail || r.statut}`);
}

/** Rejoue toute la file. Sûr à appeler plusieurs fois en parallèle (no-op si déjà en cours). */
export async function flushQueue(): Promise<void> {
    if (state.syncing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    try {
        await flushQueueUnsafe();
    } catch {
        // §16 (Étape D) : une panne IndexedDB (quota dépassé, base bloquée/
        // corrompue...) pendant le rejeu ne doit jamais devenir un rejet de
        // promesse non géré — flushQueue est souvent appelée en
        // "fire-and-forget" (`void flushQueue()` dans startAutoSync). Panne
        // de cache/synchro ≠ panne applicative : l'utilisateur garde son
        // interface fonctionnelle, la synchro sera retentée normalement au
        // prochain déclenchement.
        state = { ...state, syncing: false, lastError: "Synchronisation impossible (stockage local indisponible)." };
        emit();
    }
}

async function flushQueueUnsafe(): Promise<void> {
    const pending = await listPending();
    if (pending.length === 0) {
        state = { ...state, pendingCount: 0 };
        emit();
        return;
    }

    state = { ...state, syncing: true, lastError: null };
    emit();

    const conflicts: SyncConflict[] = [];

    for (const item of pending) {
        await markInProgress(item.id);
        try {
            // `method` absent = entrée créée avant son ajout au schéma
            // (notes/présences existantes) → toujours POST, comportement
            // inchangé. Les nouvelles routes (ex: notifications) précisent
            // explicitement 'put'.
            const res = await api.request({ method: item.method ?? 'post', url: item.endpoint, data: item.payload });
            if (Array.isArray(res.data?.conflicts) && res.data.conflicts.length > 0) {
                conflicts.push(...res.data.conflicts);
            }
            const refusals = extractRefusals(res.data);
            if (refusals) {
                // Le serveur a répondu 200 mais a refusé cet item précis (voir
                // extractRefusals) — surtout ne PAS appeler markSynced, sinon
                // la saisie refusée disparaît de la file en se faisant passer
                // pour un succès.
                await markFailed(item.id, refusals.join(' ; '), { definitif: true });
            } else {
                await markSynced(item.id);
            }
        } catch (err) {
            if (isNetworkError(err)) {
                // Réseau de nouveau absent en cours de rejeu — on arrête là,
                // cet item et les suivants resteront EN_ATTENTE pour la
                // prochaine tentative.
                state = { ...state, syncing: false, lastError: 'Connexion perdue pendant la synchronisation.' };
                emit();
                await refreshPendingCount();
                return;
            }
            const message =
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                'Échec de la synchronisation de cet élément.';
            await markFailed(item.id, message, { definitif: isDefinitiveServerError(err) });
        }
    }

    const [remaining, blocked] = await Promise.all([listPending(), countBlocked()]);
    state = {
        syncing: false,
        pendingCount: remaining.length,
        blockedCount: blocked,
        lastSyncAt: new Date().toISOString(),
        lastConflicts: conflicts,
        lastError: null,
    };
    emit();
}

/** Reprise manuelle d'un élément bloqué (ECHEC_DEFINITIF) — réinitialise ses
 * tentatives et relance immédiatement une synchronisation. Utilisé par
 * l'indicateur de statut pour laisser l'utilisateur forcer un nouvel essai
 * après un refus (ex: une fois réaffecté à la classe, ou pour retenter une
 * erreur serveur transitoire sans attendre le prochain retour réseau). */
export async function retryBlocked(id: string): Promise<void> {
    await retryItem(id);
    await refreshPendingCount();
    await flushQueue();
}

/** Comme retryBlocked, mais pour tous les éléments bloqués d'un coup — utilisé
 * par le bouton "Réessayer" de l'indicateur quand blockedCount > 0. */
export async function retryAllBlocked(): Promise<void> {
    const blocked = await listBlocked();
    await Promise.all(blocked.map((item) => retryItem(item.id)));
    await refreshPendingCount();
    await flushQueue();
}

let started = false;

/** À appeler une fois (ex: montage du portail enseignant). Retourne une fonction de nettoyage. */
export function startAutoSync(): () => void {
    if (typeof window === 'undefined') return () => {};

    void refreshPendingCount().then((n) => {
        if (n > 0) void flushQueue();
    });

    const onOnline = () => void flushQueue();
    const onVisibility = () => {
        if (document.visibilityState === 'visible') void flushQueue();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    started = true;

    return () => {
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
        started = false;
    };
}

export function isAutoSyncStarted(): boolean {
    return started;
}
