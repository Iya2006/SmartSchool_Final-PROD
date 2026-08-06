'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { queryClient, TWENTY_FOUR_HOURS } from '@/lib/queryClient';

const STORAGE_KEY = 'smartschool-query-cache';

// `createSyncStoragePersister` a besoin de `window.localStorage`, qui
// n'existe pas côté serveur (SSR/Next.js). On protège donc sa création.
const persister = typeof window !== 'undefined'
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: STORAGE_KEY,
    })
    : null;

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    // Pas de persistance possible côté serveur : on retombe sur un simple
    // QueryClientProvider pour que le rendu SSR fonctionne quand même.
    if (!persister) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    }

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, maxAge: TWENTY_FOUR_HOURS }}
        >
            {children}
        </PersistQueryClientProvider>
    );
}
