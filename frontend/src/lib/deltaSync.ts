/**
 * Synchronisation delta générique — Étape C (cache intelligent + sync delta).
 *
 * Ne remplace RIEN de l'existant : Offline Queue (lib/offlineQueue.ts) reste
 * le seul mécanisme d'ÉCRITURE hors-ligne, React Query reste le cache
 * applicatif pour les pages déjà branchées dessus (useEleves.ts, etc.).
 * Ceci est un nouveau mécanisme de LECTURE efficace — ne retélécharger que
 * ce qui a changé depuis la dernière synchronisation — pour des données pas
 * encore couvertes par un cache, voir hooks/useElevesDeltaCache.ts (pilote).
 *
 * Stockage : IndexedDB via idb-keyval, dans une base SÉPARÉE de
 * `smartschool-offline` (la file d'écriture) — volontaire, pas une
 * préférence esthétique. `idb-keyval.createStore()` fait
 * `indexedDB.open(dbName)` SANS numéro de version : `onupgradeneeded` (qui
 * crée l'object store) ne se déclenche que si la base n'existe pas encore.
 * Réutiliser `smartschool-offline` échouerait silencieusement sur tout
 * poste l'ayant déjà (n'importe quel utilisateur de la saisie hors-ligne
 * notes/présences). Un seul object store ('kv', clés préfixées) plutôt que
 * plusieurs, pour la même raison : idb-keyval ne peut créer qu'UN store par
 * `createStore()`, un deuxième appel sur la même base déjà créée
 * échouerait pareil.
 */
import { createStore, get, set, del, keys } from 'idb-keyval';
import api from './api';

const store = createStore('smartschool-sync-cache', 'kv');

function scopeKey(etablissementId: number | string, anneeId?: number | string): string {
    return anneeId !== undefined ? `${etablissementId}:${anneeId}` : `${etablissementId}`;
}

function cursorKey(entityKey: string, etablissementId: number | string, anneeId?: number | string): string {
    return `cursor:${entityKey}:${scopeKey(etablissementId, anneeId)}`;
}

export async function getCursor(
    entityKey: string,
    etablissementId: number | string,
    anneeId?: number | string
): Promise<string | null> {
    const stored = await get<string>(cursorKey(entityKey, etablissementId, anneeId), store);
    return stored ?? null;
}

interface DeltaApiResponse<T> {
    items: T[];
    deleted_ids: number[];
    sync_at: string;
}

export interface DeltaSyncResult<T> {
    items: T[];
    deletedIds: number[];
    syncAt: string;
}

/**
 * Appelle un endpoint delta (`GET {endpoint}?etablissement_id=&annee_id=&since=`,
 * même forme de réponse que backend/app/api/eleves.py:delta_eleves — voir le
 * plan Étape C) et avance le curseur local si l'appel réussit. `since` est
 * omis au premier appel (curseur absent) — l'endpoint le traite comme "renvoie
 * tout", cohérent avec une première synchro.
 */
export async function runDeltaSync<T>(params: {
    entityKey: string;
    endpoint: string;
    etablissementId: number | string;
    anneeId?: number | string;
}): Promise<DeltaSyncResult<T>> {
    const { entityKey, endpoint, etablissementId, anneeId } = params;
    const since = await getCursor(entityKey, etablissementId, anneeId);

    const search = new URLSearchParams({ etablissement_id: String(etablissementId) });
    if (anneeId !== undefined) search.set('annee_id', String(anneeId));
    if (since) search.set('since', since);

    const res = await api.get<DeltaApiResponse<T>>(`${endpoint}?${search.toString()}`);
    const { items, deleted_ids, sync_at } = res.data;

    await set(cursorKey(entityKey, etablissementId, anneeId), sync_at, store);

    return { items, deletedIds: deleted_ids, syncAt: sync_at };
}

// ── Accès générique au store, pour les miroirs locaux par entité ──
// (ex: hooks/useElevesDeltaCache.ts) — clés à préfixer par l'appelant
// (ex: `eleves:${etablissementId}:${eleveId}`) pour ne jamais collisionner
// avec les clés `cursor:...` ci-dessus.
export async function getCached<T>(key: string): Promise<T | undefined> {
    return get<T>(key, store);
}

export async function setCached<T>(key: string, value: T): Promise<void> {
    return set(key, value, store);
}

export async function deleteCached(key: string): Promise<void> {
    return del(key, store);
}

export async function listCachedKeys(): Promise<IDBValidKey[]> {
    return keys(store);
}

/**
 * Purge tout le cache delta (curseurs + miroirs locaux, tout ce qui vit dans
 * `smartschool-sync-cache`) — à appeler à la déconnexion (logout manuel ET
 * expiration 401, voir AuthContext.tsx/lib/api.ts). Cache reconstructible :
 * contrairement à offlineQueue.ts (opérations d'écriture non
 * synchronisées), aucune règle "ne jamais supprimer" ne s'applique ici —
 * c'est justement le but (isolation entre utilisateurs/écoles sur poste
 * partagé, §5 du cahier des charges).
 */
export async function clearSyncCache(): Promise<void> {
    const allKeys = await keys(store);
    await Promise.all(allKeys.map((k) => del(k, store)));
}
