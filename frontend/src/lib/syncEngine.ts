/**
 * Moteur de synchronisation — module Offline-First Phase 1.
 *
 * Vide la file locale (`offlineQueue.ts`) dès que la connexion revient :
 * détecté via l'événement navigateur `online`, le retour au premier plan de
 * l'onglet (`visibilitychange`), et manuellement au montage du portail
 * enseignant s'il reste des éléments en attente d'une session précédente.
 *
 * Chaque entrée est rejouée dans l'ordre de saisie vers l'endpoint de sync
 * correspondant (voir backend/app/api/sync.py). Si le réseau est encore
 * absent (pas de réponse serveur du tout), on arrête immédiatement — rejouer
 * les entrées suivantes échouerait de façon identique. Si le serveur répond
 * (même par un refus), l'élément est marqué en erreur et on continue avec le
 * suivant : ce n'est pas un problème réseau, pas la peine de bloquer le reste
 * de la file pour ça.
 */
import api from './api';
import { listPending, markInProgress, markSynced, markFailed } from './offlineQueue';

export interface SyncConflict {
    note_id?: number;
    [key: string]: unknown;
}

export interface SyncState {
    syncing: boolean;
    pendingCount: number;
    lastSyncAt: string | null;
    lastConflicts: SyncConflict[];
    lastError: string | null;
}

let state: SyncState = {
    syncing: false,
    pendingCount: 0,
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
    const n = (await listPending()).length;
    state = { ...state, pendingCount: n };
    emit();
    return n;
}

function isNetworkError(err: unknown): boolean {
    const code = (err as { code?: string })?.code;
    const hasResponse = !!(err as { response?: unknown })?.response;
    return code === 'ERR_NETWORK' && !hasResponse;
}

/** Rejoue toute la file. Sûr à appeler plusieurs fois en parallèle (no-op si déjà en cours). */
export async function flushQueue(): Promise<void> {
    if (state.syncing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

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
            const res = await api.post(item.endpoint, item.payload);
            if (Array.isArray(res.data?.conflicts) && res.data.conflicts.length > 0) {
                conflicts.push(...res.data.conflicts);
            }
            await markSynced(item.id);
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
            await markFailed(item.id, message);
        }
    }

    const remaining = await listPending();
    state = {
        syncing: false,
        pendingCount: remaining.length,
        lastSyncAt: new Date().toISOString(),
        lastConflicts: conflicts,
        lastError: null,
    };
    emit();
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
