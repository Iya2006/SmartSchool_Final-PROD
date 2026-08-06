import { QueryClient } from '@tanstack/react-query';

/**
 * Client React Query partagé par toute l'application.
 *
 * Les valeurs par défaut sont pensées pour un contexte de connexion
 * internet instable (déploiement en Guinée) :
 * - `staleTime` assez long pour éviter des refetch trop fréquents,
 * - `gcTime` très long pour garder les données en cache même hors-ligne,
 * - `retry` limité pour ne pas bloquer l'UI sur des tentatives répétées,
 * - `refetchOnWindowFocus` désactivé pour économiser de la bande passante,
 * - `networkMode: 'offlineFirst'` pour afficher immédiatement les données
 *   en cache (même sans réseau) et ne rafraîchir en arrière-plan que si la
 *   connexion est disponible.
 */
export const ONE_MINUTE = 60_000;
export const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: ONE_MINUTE,
            gcTime: TWENTY_FOUR_HOURS,
            retry: 2,
            refetchOnWindowFocus: false,
            networkMode: 'offlineFirst',
        },
        mutations: {
            networkMode: 'offlineFirst',
        },
    },
});
