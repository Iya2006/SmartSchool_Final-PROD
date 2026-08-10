/**
 * Tests de hooks/useElevesDeltaCache.ts — Étape C (module pilote).
 *
 * `idb-keyval` mocké en mémoire (comme deltaSync.test.ts/offlineQueue.test.ts),
 * `lib/api` mocké pour simuler les réponses de GET /api/eleves/delta. Teste
 * le hook ET la fonction exportée séparément (syncElevesDeltaCache) contre
 * la vraie logique de lib/deltaSync.ts (pas mockée) — c'est la fusion
 * upsert/suppression qui est le comportement à vérifier ici.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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

import { useElevesDeltaCache, syncElevesDeltaCache, type EleveDeltaItem } from '@/hooks/useElevesDeltaCache';

function eleve(id: number, nom: string): EleveDeltaItem {
    return {
        eleve_id: id, matricule: `ELV-${id}`, nom, prenom: 'Test',
        sexe: 'F', date_naissance: '2010-01-01', statut: 'ACTIF',
    };
}

describe('useElevesDeltaCache', () => {
    beforeEach(() => {
        memoryStore.clear();
        mockGet.mockReset();
        // Étape D : le miroir est chiffré (lib/localEncryption.ts), la clé
        // est dérivée du token courant — sans lui, rien n'est mis en cache
        // (comportement voulu, voir les tests dédiés de localEncryption.test.ts).
        localStorage.setItem('smartschool_token', 'fake-token-for-tests');
    });

    it('démarre avec le miroir local (vide au premier chargement)', async () => {
        const { result } = renderHook(() => useElevesDeltaCache(1, 1));
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.eleves).toEqual([]);
    });

    it('sync() peuple le miroir et met à jour eleves', async () => {
        mockGet.mockResolvedValue({
            data: { items: [eleve(1, 'Bah'), eleve(2, 'Diallo')], deleted_ids: [], sync_at: '2026-01-01T00:00:00Z' },
        });
        const { result } = renderHook(() => useElevesDeltaCache(1, 1));
        await waitFor(() => expect(result.current.loading).toBe(false));

        await result.current.sync();

        // result.current n'est mis à jour qu'au prochain rendu — waitFor
        // relit result.current à chaque tentative (même pattern que
        // useNotifications.test.ts pour markAllAsRead).
        await waitFor(() => expect(result.current.eleves).toHaveLength(2));
        expect(result.current.eleves.map((e) => e.nom).sort()).toEqual(['Bah', 'Diallo']);
        expect(result.current.lastSyncAt).toBe('2026-01-01T00:00:00Z');
    });

    it('un sync suivant met à jour un élève modifié sans le dupliquer', async () => {
        mockGet.mockResolvedValueOnce({
            data: { items: [eleve(1, 'Bah')], deleted_ids: [], sync_at: 'T1' },
        });
        await syncElevesDeltaCache(1, 1);

        mockGet.mockResolvedValueOnce({
            data: { items: [eleve(1, 'Bah-Modifie')], deleted_ids: [], sync_at: 'T2' },
        });
        const { items } = await syncElevesDeltaCache(1, 1);

        expect(items).toHaveLength(1);
        expect(items[0].nom).toBe('Bah-Modifie');
    });

    it('une suppression via delta retire bien l\'élève du miroir', async () => {
        mockGet.mockResolvedValueOnce({
            data: { items: [eleve(1, 'Bah'), eleve(2, 'Diallo')], deleted_ids: [], sync_at: 'T1' },
        });
        await syncElevesDeltaCache(1, 1);

        mockGet.mockResolvedValueOnce({
            data: { items: [], deleted_ids: [1], sync_at: 'T2' },
        });
        const { items } = await syncElevesDeltaCache(1, 1);

        expect(items).toHaveLength(1);
        expect(items[0].nom).toBe('Diallo');
    });

    it('un échec réseau pendant sync() garde le miroir précédent affiché et signale une erreur', async () => {
        mockGet.mockResolvedValueOnce({
            data: { items: [eleve(1, 'Bah')], deleted_ids: [], sync_at: 'T1' },
        });
        const { result } = renderHook(() => useElevesDeltaCache(1, 1));
        await waitFor(() => expect(result.current.loading).toBe(false));
        await result.current.sync();
        await waitFor(() => expect(result.current.eleves).toHaveLength(1));

        mockGet.mockRejectedValueOnce(new Error('network'));
        await result.current.sync();

        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.eleves).toHaveLength(1); // toujours affiché, pas vidé
    });

    it('deux établissements différents ont des miroirs isolés', async () => {
        mockGet.mockResolvedValueOnce({
            data: { items: [eleve(1, 'EcoleA')], deleted_ids: [], sync_at: 'T1' },
        });
        await syncElevesDeltaCache(1, 1);

        mockGet.mockResolvedValueOnce({
            data: { items: [eleve(1, 'EcoleB')], deleted_ids: [], sync_at: 'T1' },
        });
        await syncElevesDeltaCache(2, 1);

        const { result } = renderHook(() => useElevesDeltaCache(1, 1));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.eleves.map((e) => e.nom)).toEqual(['EcoleA']);
    });
});
