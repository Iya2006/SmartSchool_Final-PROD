/**
 * Tests de components/QueryProvider.tsx — chiffrement du cache React Query
 * persisté en localStorage.
 *
 * Avant ce correctif, le cache réellement utilisé par l'app (useEleves.ts,
 * toute page sous useQuery) transitait en clair dans
 * localStorage['smartschool-query-cache'] — adresse, groupe sanguin, date
 * de naissance inclus. lib/localEncryption.ts existait déjà mais ne
 * protégeait que le pilote mort useElevesDeltaCache. Ces tests vérifient
 * le branchement réel : serialize()/deserialize() de QueryProvider.tsx,
 * pas le module de chiffrement lui-même (déjà couvert par
 * localEncryption.test.ts).
 *
 * Vraie Web Crypto API (Node 19+/jsdom, pas mockée).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { serialize, deserialize } from '@/components/QueryProvider';
import type { PersistedClient } from '@tanstack/query-persist-client-core';

function fakeClient(extra: Record<string, unknown> = {}): PersistedClient {
    return {
        timestamp: Date.now(),
        buster: '',
        clientState: {
            queries: [
                {
                    queryKey: ['eleves', 1, 1],
                    queryHash: '["eleves",1,1]',
                    state: {
                        data: [{ eleve_id: 1, nom: 'Diallo', adresse: 'Quartier X', groupe_sanguin: 'O+', ...extra }],
                        dataUpdateCount: 1, dataUpdatedAt: Date.now(), error: null, errorUpdateCount: 0,
                        errorUpdatedAt: 0, fetchFailureCount: 0, fetchFailureReason: null, fetchMeta: null,
                        isInvalidated: false, status: 'success', fetchStatus: 'idle',
                    },
                },
            ],
            mutations: [],
        },
    } as unknown as PersistedClient;
}

describe('QueryProvider — chiffrement du cache persisté', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('serialize() puis deserialize() restituent le client exact (round-trip)', async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const client = fakeClient();

        const cached = await serialize(client);
        const restored = await deserialize(cached);

        expect(restored).toEqual(client);
    });

    it("la chaîne persistée ne contient aucune donnée en clair (adresse, groupe sanguin)", async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const cached = await serialize(fakeClient());

        expect(cached).not.toContain('Quartier X');
        expect(cached).not.toContain('O+');
        expect(cached).not.toContain('Diallo');
        expect(cached).not.toContain('eleve_id');
    });

    it('serialize() rejette (ne persiste pas en clair) sans session active', async () => {
        localStorage.removeItem('smartschool_token');
        await expect(serialize(fakeClient())).rejects.toThrow();
    });

    it("deserialize() rejette proprement sur une donnée d'une AUTRE session (token différent)", async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const cached = await serialize(fakeClient());

        localStorage.setItem('smartschool_token', 'token-utilisateur-B');
        await expect(deserialize(cached)).rejects.toThrow();
    });

    it('le format base64 est bien plus compact que l’ancien tableau de nombres', async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const client = fakeClient({ notes: 'x'.repeat(5000) });
        const nouveau = await serialize(client);
        const { encryptValue } = await import('@/lib/localEncryption');
        const ancien = JSON.stringify(await encryptValue(client));
        expect(nouveau.length).toBeLessThan(ancien.length / 2);
    });

    it("deserialize() rejette proprement un cache de l'ancien format (tableau de nombres)", async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const { encryptValue } = await import('@/lib/localEncryption');
        const ancienFormat = JSON.stringify(await encryptValue(fakeClient()));
        await expect(deserialize(ancienFormat)).rejects.toThrow();
    });

    it("deserialize() rejette proprement sur un ancien cache non chiffré (avant ce correctif)", async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const oldPlaintextCache = JSON.stringify(fakeClient());

        await expect(deserialize(oldPlaintextCache)).rejects.toThrow();
    });
});
