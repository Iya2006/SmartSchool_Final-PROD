/**
 * Purge unifiée des données locales sensibles à une session — utilisée par
 * AuthContext.logout() (déconnexion volontaire) ET l'intercepteur 401 de
 * lib/api.ts (session expirée).
 *
 * Avant l'Étape C, ces deux chemins de "déconnexion" divergeaient (trouvé
 * par l'audit du cache/delta sync) : le logout manuel purgeait Cache
 * Storage et la file offline (conditionnellement), le 401 automatique ne
 * touchait aucun des deux (seulement `localStorage.clear()`). Sur un poste
 * partagé, un utilisateur dont le token expire pouvait donc laisser des
 * réponses API en Cache Storage accessibles à la session suivante.
 * Centralisé ici pour que les deux chemins ne puissent plus dériver l'un de
 * l'autre.
 *
 * `offlineQueue`/`deltaSync` sont importés dynamiquement (pas en haut de ce
 * fichier) : `deltaSync.ts` importe `api.ts`, et ce module est lui-même
 * importé par `api.ts` — un import statique créerait un cycle. Même
 * pattern déjà utilisé dans lib/api.ts pour `offlineQueue`.
 */
import { compteDuJeton } from './offlineCacheKey';

/** Compte dont la session vient d'expirer (voir `retirerSessionExpiree`). */
export const CLE_COMPTE_PRECEDENT = 'smartschool_compte_precedent';

/**
 * Session expirée (401) : on retire le jeton, rien d'autre.
 *
 * Avant le 26/10/2026, un 401 effaçait tout (caches, copie de démarrage). Or
 * avec des sessions de 8 h, c'est exactement ce qui arrive à une école qui a
 * travaillé toute une journée hors-ligne : en retrouvant le réseau, elle
 * perdait ses données locales au moment même où elle allait synchroniser.
 * Dans l'immense majorité des cas, c'est le même compte qui se reconnecte ;
 * s'il s'agit d'un autre, `preparerNouvelleSession` purge alors les données
 * du précédent. La file offline n'est jamais touchée ici.
 */
export function retirerSessionExpiree(): void {
    const jeton = localStorage.getItem('smartschool_token');
    const compte = jeton ? compteDuJeton(`Bearer ${jeton}`) : null;
    if (compte) localStorage.setItem(CLE_COMPTE_PRECEDENT, compte);
    localStorage.removeItem('smartschool_token');
    localStorage.removeItem('smartschool_user');
    sessionStorage.clear();
}

/** À appeler à chaque connexion réussie, avec le nouveau jeton. */
export async function preparerNouvelleSession(nouveauJeton: string): Promise<void> {
    const precedent = localStorage.getItem(CLE_COMPTE_PRECEDENT);
    localStorage.removeItem(CLE_COMPTE_PRECEDENT);
    if (precedent && precedent !== compteDuJeton(`Bearer ${nouveauJeton}`)) {
        await purgeLocalSessionData();
    }
}

export async function purgeLocalSessionData(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
        if (typeof caches !== 'undefined') {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.filter((name) => name.startsWith('smartschool-')).map((name) => caches.delete(name))
            );
        }
    } catch {
        // Cache Storage indisponible — ne doit jamais bloquer la déconnexion.
    }

    try {
        // La file d'attente offline (notes/présences non synchronisées)
        // n'est PAS purgée aveuglément — une opération non synchronisée ne
        // doit jamais être perdue silencieusement. Si des éléments restent
        // en attente, on les laisse en base.
        const { listPending, clearAll } = await import('./offlineQueue');
        const pending = await listPending();
        if (pending.length === 0) {
            await clearAll();
        }
    } catch {
        // IndexedDB indisponible — ne doit jamais bloquer la déconnexion.
    }

    try {
        // Cache delta (Étape C) : reconstructible, purgé sans condition
        // contrairement à la file offline ci-dessus.
        const { clearSyncCache } = await import('./deltaSync');
        await clearSyncCache();
    } catch {
        // idem — jamais bloquant.
    }

    try {
        // Cache React Query persisté (IndexedDB) et dernières valeurs de
        // démarrage hors-ligne (années, école, thème).
        const { effacerCacheRequetes } = await import('./cacheRequetesLocal');
        await effacerCacheRequetes();
        const { effacerMemo } = await import('./memoHorsLigne');
        effacerMemo();
    } catch {
        // idem — jamais bloquant.
    }
}
