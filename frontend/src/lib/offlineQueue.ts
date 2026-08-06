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

export type OfflineActionType = 'note' | 'presence';
export type OfflineQueueStatut = 'EN_ATTENTE' | 'EN_COURS' | 'ERREUR';

export interface OfflineQueueItem {
    id: string;
    type: OfflineActionType;
    /** Chemin API complet à appeler lors du rejeu, ex: /api/sync/12/notes */
    endpoint: string;
    payload: unknown;
    utilisateur_id: number | string;
    etablissement_id: number;
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

/** Liste triée par ordre de création (les plus anciennes d'abord — on rejoue dans l'ordre de saisie). */
export async function listPending(): Promise<OfflineQueueItem[]> {
    const allKeys = await keys(store);
    const items = await Promise.all(allKeys.map((k) => get<OfflineQueueItem>(k, store)));
    return items
        .filter((i): i is OfflineQueueItem => !!i)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function countPending(): Promise<number> {
    return (await listPending()).length;
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

export async function markFailed(id: string, erreur: string): Promise<void> {
    const item = await get<OfflineQueueItem>(id, store);
    if (!item) return;
    item.statut = 'ERREUR';
    item.tentatives += 1;
    item.derniere_erreur = erreur;
    await set(id, item, store);
}

/** Purge complète — appelée à la déconnexion (voir AuthContext.logout). */
export async function clearAll(): Promise<void> {
    const allKeys = await keys(store);
    await Promise.all(allKeys.map((k) => del(k, store)));
}
