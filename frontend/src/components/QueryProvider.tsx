'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import { queryClient, TWENTY_FOUR_HOURS } from '@/lib/queryClient';
import { encryptValue, decryptValue, type EncryptedPayload } from '@/lib/localEncryption';

const STORAGE_KEY = 'smartschool-query-cache';

// `createSyncStoragePersister` (utilisé avant ce correctif) est deprecie et,
// surtout, n'accepte que des serialize/deserialize SYNCHRONES — incompatible
// avec le chiffrement (Web Crypto est async). `createAsyncStoragePersister`
// est le variant officiel de la meme famille tanstack qui accepte des
// hooks async ; c'est le seul changement necessaire, le stockage reste
// `window.localStorage`.
//
// Chiffrement reutilise tel quel depuis lib/localEncryption.ts (deja
// construit et valide pour le pilote useElevesDeltaCache, jamais branche
// sur le cache reellement utilise par l'app jusqu'ici) — donnees
// personnelles (adresse, groupe sanguin, date de naissance...) qui
// transitaient en clair dans localStorage pendant toute session active.
// Si aucune session (pas de token) ou Web Crypto indisponible : on leve
// une erreur plutot que d'ecrire en clair — le persister avale l'erreur
// silencieusement (voir node_modules/@tanstack/query-async-storage-persister,
// trySave catch), donc pas de crash, juste rien de persiste ce cycle-la.
export async function serialize(client: PersistedClient): Promise<string> {
    const encrypted = await encryptValue(client);
    if (!encrypted) throw new Error('Pas de session active : cache non persiste (evite l\'ecriture en clair).');
    return JSON.stringify(encrypted);
}

export async function deserialize(cached: string): Promise<PersistedClient> {
    const payload = JSON.parse(cached) as EncryptedPayload;
    const client = await decryptValue<PersistedClient>(payload);
    if (!client) throw new Error('Cache local illisible (session differente ou corrompu) : ecarte, resynchronisation complete.');
    return client;
}

// `createAsyncStoragePersister` a besoin de `window.localStorage`, qui
// n'existe pas côté serveur (SSR/Next.js). On protège donc sa création.
const persister = typeof window !== 'undefined'
    ? createAsyncStoragePersister({
        storage: window.localStorage,
        key: STORAGE_KEY,
        serialize,
        deserialize,
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
