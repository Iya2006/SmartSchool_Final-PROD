/**
 * Fenêtre invisible de préparation hors-ligne (voir lib/preparationHorsLigne.ts).
 *
 * Pour qu'un écran jamais ouvert ait aussi ses DONNÉES hors-ligne, la
 * préparation l'ouvre en coulisse : l'écran fait ses propres lectures, que le
 * Service Worker garde au passage. Dans cette fenêtre, l'application doit être
 * strictement passive :
 *   - aucune écriture vers l'API (lib/api.ts les refuse) ;
 *   - ni rejeu de la file offline, ni préparation imbriquée (AppShell.tsx) ;
 *   - pas de persistance du cache React Query, qui écraserait celui de la
 *     fenêtre principale (QueryProvider.tsx).
 *
 * Module sans dépendance, importable partout sans risque de cycle.
 */
export const NOM_FENETRE_PREPARATION = 'smartschool-preparation-hors-ligne';

export function estFenetrePreparation(): boolean {
    return typeof window !== 'undefined' && window.name === NOM_FENETRE_PREPARATION;
}
