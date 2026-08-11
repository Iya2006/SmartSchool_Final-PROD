/**
 * File d'attente locale — module Offline-First Phase 1.
 *
 * Utilise `idb-keyval` (déjà une dépendance du projet, jamais branchée avant
 * ce module — voir package.json) comme surcouche légère d'IndexedDB, plutôt
 * que d'ajouter Dexie.js : un seul store simple (clé → objet), suffisant pour
 * le périmètre retenu (notes/présences enseignants, voir le plan approuvé).
 *
 * Chaque entrée correspond à un appel API qui n'a pas pu aboutir faute de
 * réseau ; `syncEngine.ts` la rejoue dès que la connexion revient.
 */
import { get, set, del, keys, createStore } from 'idb-keyval';

// 'notification_read_all' : Étape B, module Notifications (WRITE_OFFLINE_SAFE
// — voir lib/api.ts OFFLINE_QUEUEABLE_ROUTES). Opération globale (pas liée à
// un enseignant/élève précis comme note/presence), naturellement idempotente
// côté serveur.
export type OfflineActionType = 'note' | 'presence' | 'notification_read_all';
// ECHEC_DEFINITIF : l'élément a échoué pour une raison qui ne se résoudra
// pas en le rejouant tel quel (refus métier définitif, ou plafond de
// tentatives atteint sur une erreur serveur transitoire — voir
// lib/syncEngine.ts). Il n'est PLUS retenté automatiquement (voir
// listPending), mais n'est jamais supprimé : listBlocked()/retry()
// permettent de le montrer à l'utilisateur et de forcer une nouvelle
// tentative manuellement.
export type OfflineQueueStatut = 'EN_ATTENTE' | 'EN_COURS' | 'ERREUR' | 'ECHEC_DEFINITIF';

/** Nombre de tentatives automatiques (erreur serveur transitoire) avant de
 * basculer l'élément en ECHEC_DEFINITIF et arrêter de le retenter seul. */
export const MAX_TENTATIVES = 5;

export interface OfflineQueueItem {
    id: string;
    type: OfflineActionType;
    /** Chemin API complet à appeler lors du rejeu, ex: /api/sync/12/notes */
    endpoint: string;
    /** Méthode HTTP à utiliser lors du rejeu. Absent = 'post' (compatibilité
     * avec les entrées notes/présences existantes, créées avant l'ajout de
     * ce champ — voir syncEngine.ts). */
    method?: 'post' | 'put';
    payload: unknown;
    utilisateur_id: number | string;
    /** Métadonnée locale uniquement, jamais renvoyée au serveur : au rejeu,
     * le backend dérive l'établissement du JWT et ignore cette valeur. Facultatif
     * car il n'est pas toujours connaissable côté client (compte plateforme,
     * parent multi-écoles) — on n'invente jamais un établissement par défaut. */
    etablissement_id?: number;
    created_at: string; // ISO 8601
    statut: OfflineQueueStatut;
    tentatives: number;
    derniere_erreur?: string;
}

const store = createStore('smartschool-offline', 'queue');

function generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueue(
    item: Omit<OfflineQueueItem, 'id' | 'created_at' | 'statut' | 'tentatives'>
): Promise<OfflineQueueItem> {
    const full: OfflineQueueItem = {
        ...item,
        id: generateId(),
        created_at: new Date().toISOString(),
        statut: 'EN_ATTENTE',
        tentatives: 0,
    };
    await set(full.id, full, store);
    return full;
}

async function listAll(): Promise<OfflineQueueItem[]> {
    const allKeys = await keys(store);
    const items = await Promise.all(allKeys.map((k) => get<OfflineQueueItem>(k, store)));
    return items
        .filter((i): i is OfflineQueueItem => !!i)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Éléments encore éligibles au rejeu automatique (EN_ATTENTE/EN_COURS/ERREUR
 * sous le plafond de tentatives). Exclut ECHEC_DEFINITIF — c'est justement ce
 * qui empêche syncEngine.flushQueue() de retenter indéfiniment un élément qui
 * ne passera jamais. Triée par ordre de création (les plus anciennes d'abord). */
export async function listPending(): Promise<OfflineQueueItem[]> {
    return (await listAll()).filter((i) => i.statut !== 'ECHEC_DEFINITIF');
}

/** Éléments bloqués (échec définitif) — jamais supprimés automatiquement,
 * affichés à l'utilisateur, rejouables via retry(). */
export async function listBlocked(): Promise<OfflineQueueItem[]> {
    return (await listAll()).filter((i) => i.statut === 'ECHEC_DEFINITIF');
}

export async function countPending(): Promise<number> {
    return (await listPending()).length;
}

export async function countBlocked(): Promise<number> {
    return (await listBlocked()).length;
}

export async function markInProgress(id: string): Promise<void> {
    const item = await get<OfflineQueueItem>(id, store);
    if (!item) return;
    item.statut = 'EN_COURS';
    await set(id, item, store);
}

/** Synchronisation réussie — l'entrée quitte la file. */
export async function markSynced(id: string): Promise<void> {
    await del(id, store);
}

/**
 * Marque un échec. `definitif: true` bascule immédiatement en
 * ECHEC_DEFINITIF (refus métier/permission qui ne se résoudra pas en
 * rejouant le même payload — 403/404/422, ou refus renvoyé dans un corps
 * 200 comme pour les notes, voir syncEngine.ts). Sinon (erreur serveur
 * transitoire, ex: 5xx), l'élément reste ERREUR et sera retenté
 * automatiquement jusqu'à MAX_TENTATIVES, puis bascule à son tour en
 * ECHEC_DEFINITIF.
 */
export async function markFailed(id: string, erreur: string, options?: { definitif?: boolean }): Promise<void> {
    const item = await get<OfflineQueueItem>(id, store);
    if (!item) return;
    item.tentatives += 1;
    item.derniere_erreur = erreur;
    item.statut = options?.definitif || item.tentatives >= MAX_TENTATIVES ? 'ECHEC_DEFINITIF' : 'ERREUR';
    await set(id, item, store);
}

/** Force une nouvelle tentative d'un élément bloqué (ECHEC_DEFINITIF) —
 * reprise manuelle explicite (ex: l'utilisateur a été réaffecté à la
 * classe, ou veut simplement réessayer une erreur serveur transitoire). */
export async function retry(id: string): Promise<void> {
    const item = await get<OfflineQueueItem>(id, store);
    if (!item) return;
    item.statut = 'EN_ATTENTE';
    item.tentatives = 0;
    await set(id, item, store);
}

/** Purge complète — appelée à la déconnexion (voir AuthContext.logout). */
export async function clearAll(): Promise<void> {
    const allKeys = await keys(store);
    await Promise.all(allKeys.map((k) => del(k, store)));
}
