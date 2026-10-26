/**
 * Emplacement du cache React Query persisté (voir components/QueryProvider.tsx).
 *
 * IndexedDB plutôt que localStorage : localStorage est plafonné autour de
 * 5 Mo par site, et le cache est écrit d'un bloc — une seule grosse liste
 * (des milliers d'élèves) suffisait à faire échouer toute la persistance, en
 * silence. IndexedDB n'a pas ce plafond pratique.
 *
 * Module séparé pour que lib/sessionCleanup.ts puisse purger ce cache sans
 * importer un composant React.
 */
import { createStore, del, get, set } from 'idb-keyval';

export const CLE_CACHE_REQUETES = 'smartschool-query-cache';

const magasin = createStore('smartschool-query', 'cache');

export const stockageCacheRequetes = {
    getItem: async (cle: string) => (await get<string>(cle, magasin)) ?? null,
    setItem: (cle: string, valeur: string) => set(cle, valeur, magasin),
    removeItem: (cle: string) => del(cle, magasin),
};

/** Supprime le cache persisté, y compris l'ancienne copie laissée dans
 * localStorage par les versions précédentes. */
export async function effacerCacheRequetes(): Promise<void> {
    try {
        localStorage.removeItem(CLE_CACHE_REQUETES);
    } catch {
        // localStorage indisponible : rien à retirer de ce côté.
    }
    await del(CLE_CACHE_REQUETES, magasin);
}
