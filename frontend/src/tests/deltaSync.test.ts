/**
 * Tests de lib/deltaSync.ts — Étape C (synchronisation delta).
 *
 * `idb-keyval` est mocké par un Map en mémoire (même pattern que
 * offlineQueue.test.ts) ; `lib/api` est mocké pour isoler la logique de
 * curseur/appel de la vraie requête HTTP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const memoryStore = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
    createStore: vi.fn(() => 'fake-store'),
    get: vi.fn(async (key: string) => memoryStore.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
        memoryStore.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
        memoryStore.delete(key);
    }),
    keys: vi.fn(async () => Array.from(memoryStore.keys())),
}));

const mockGet = vi.fn();
vi.mock('@/lib/api', () => ({
    default: { get: (...args: unknown[]) => mockGet(...args) },
}));

import { runDeltaSync, getCursor, getCached, setCached, deleteCached, clearSyncCache } from '@/lib/deltaSync';

describe('deltaSync', () => {
    beforeEach(() => {
        memoryStore.clear();
        mockGet.mockReset();
    });

    it("première synchro (aucun curseur) : n'envoie pas de `since`", async () => {
        mockGet.mockResolvedValue({ data: { items: [{ id: 1 }], deleted_ids: [], sync_at: '2026-01-01T00:00:00Z' } });

        await runDeltaSync({ entityKey: 'eleves', endpoint: '/api/eleves/delta', etablissementId: 1, anneeId: 1 });

        const calledUrl = mockGet.mock.calls[0][0] as string;
        expect(calledUrl).toContain('etablissement_id=1');
        expect(calledUrl).toContain('annee_id=1');
        expect(calledUrl).not.toContain('since=');
    });

    it('synchro suivante : envoie le `since` du dernier sync_at reçu', async () => {
        mockGet.mockResolvedValueOnce({ data: { items: [], deleted_ids: [], sync_at: '2026-01-01T10:00:00Z' } });
        await runDeltaSync({ entityKey: 'eleves', endpoint: '/api/eleves/delta', etablissementId: 1, anneeId: 1 });

        mockGet.mockResolvedValueOnce({ data: { items: [], deleted_ids: [], sync_at: '2026-01-01T11:00:00Z' } });
        await runDeltaSync({ entityKey: 'eleves', endpoint: '/api/eleves/delta', etablissementId: 1, anneeId: 1 });

        const secondCallUrl = mockGet.mock.calls[1][0] as string;
        expect(secondCallUrl).toContain(`since=${encodeURIComponent('2026-01-01T10:00:00Z')}`);
    });

    it('le curseur est isolé par entité + établissement + année (pas de collision)', async () => {
        mockGet.mockResolvedValueOnce({ data: { items: [], deleted_ids: [], sync_at: 'A' } });
        await runDeltaSync({ entityKey: 'eleves', endpoint: '/e', etablissementId: 1, anneeId: 1 });

        mockGet.mockResolvedValueOnce({ data: { items: [], deleted_ids: [], sync_at: 'B' } });
        await runDeltaSync({ entityKey: 'eleves', endpoint: '/e', etablissementId: 2, anneeId: 1 });

        expect(await getCursor('eleves', 1, 1)).toBe('A');
        expect(await getCursor('eleves', 2, 1)).toBe('B');
    });

    it('retourne items/deletedIds/syncAt tels que renvoyés par le serveur', async () => {
        mockGet.mockResolvedValue({
            data: { items: [{ eleve_id: 1, nom: 'Bah' }], deleted_ids: [42], sync_at: '2026-01-01T00:00:00Z' },
        });

        const result = await runDeltaSync({ entityKey: 'eleves', endpoint: '/e', etablissementId: 1, anneeId: 1 });

        expect(result.items).toEqual([{ eleve_id: 1, nom: 'Bah' }]);
        expect(result.deletedIds).toEqual([42]);
        expect(result.syncAt).toBe('2026-01-01T00:00:00Z');
    });

    it('une erreur réseau ne met PAS à jour le curseur (retentera avec le même `since` la prochaine fois)', async () => {
        mockGet.mockResolvedValueOnce({ data: { items: [], deleted_ids: [], sync_at: 'CURSEUR-INITIAL' } });
        await runDeltaSync({ entityKey: 'eleves', endpoint: '/e', etablissementId: 1, anneeId: 1 });

        mockGet.mockRejectedValueOnce(new Error('network'));
        await expect(
            runDeltaSync({ entityKey: 'eleves', endpoint: '/e', etablissementId: 1, anneeId: 1 })
        ).rejects.toThrow();

        expect(await getCursor('eleves', 1, 1)).toBe('CURSEUR-INITIAL');
    });

    it('getCached/setCached/deleteCached permettent un miroir générique par clé', async () => {
        await setCached('eleves:1:42', { nom: 'Test' });
        expect(await getCached('eleves:1:42')).toEqual({ nom: 'Test' });
        await deleteCached('eleves:1:42');
        expect(await getCached('eleves:1:42')).toBeUndefined();
    });

    it('clearSyncCache vide tout (curseurs ET miroirs) sans rien laisser', async () => {
        mockGet.mockResolvedValue({ data: { items: [], deleted_ids: [], sync_at: 'X' } });
        await runDeltaSync({ entityKey: 'eleves', endpoint: '/e', etablissementId: 1, anneeId: 1 });
        await setCached('eleves:1:42', { nom: 'Test' });

        await clearSyncCache();

        expect(await getCursor('eleves', 1, 1)).toBeNull();
        expect(await getCached('eleves:1:42')).toBeUndefined();
        expect(memoryStore.size).toBe(0);
    });
});
