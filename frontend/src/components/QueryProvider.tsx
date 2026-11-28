'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/query-persist-client-core';
import { queryClient, TRENTE_JOURS } from '@/lib/queryClient';
import { chiffrerEnTexte, dechiffrerTexte } from '@/lib/localEncryption';
import { CLE_CACHE_REQUETES, stockageCacheRequetes } from '@/lib/cacheRequetesLocal';
import { estFenetrePreparation } from '@/lib/fenetrePreparation';

// `createSyncStoragePersister` (utilisé avant ce correctif) est deprecie et,
// surtout, n'accepte que des serialize/deserialize SYNCHRONES — incompatible
// avec le chiffrement (Web Crypto est async). `createAsyncStoragePersister`
// est le variant officiel de la meme famille tanstack qui accepte des
// hooks async. Depuis le 26/10/2026, le stockage est IndexedDB et le
// contenu chiffré est encodé en base64 (voir lib/cacheRequetesLocal.ts).
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
    const encrypted = await chiffrerEnTexte(client);
    if (!encrypted) throw new Error('Pas de session active : cache non persiste (evite l\'ecriture en clair).');
    return encrypted;
}

export async function deserialize(cached: string): Promise<PersistedClient> {
    const client = await dechiffrerTexte<PersistedClient>(cached);
    if (!client) throw new Error('Cache local illisible (session differente ou corrompu) : ecarte, resynchronisation complete.');
    return client;
}

// Le stockage vit dans IndexedDB (lib/cacheRequetesLocal.ts), qui n'existe
// pas côté serveur (SSR/Next.js) : création protégée.
const persister = typeof window !== 'undefined'
    ? createAsyncStoragePersister({
        storage: stockageCacheRequetes,
        key: CLE_CACHE_REQUETES,
        serialize,
        deserialize,
    })
    : null;

// Ancienne copie en localStorage (versions précédentes) : elle n'est plus lue,
// on libère la place qu'elle occupe.
if (typeof window !== 'undefined') {
    try { localStorage.removeItem(CLE_CACHE_REQUETES); } catch { /* indisponible */ }
}

export default function QueryProvider({ children }: { children: React.ReactNode }) {
    // Pas de persistance possible côté serveur : on retombe sur un simple
    // QueryClientProvider pour que le rendu SSR fonctionne quand même. Idem dans
    // la fenêtre invisible de préparation hors-ligne : elle partage le même
    // stockage et écraserait le cache de la fenêtre principale.
    if (!persister || estFenetrePreparation()) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    }

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, maxAge: TRENTE_JOURS }}
        >
            {children}
        </PersistQueryClientProvider>
    );
}
