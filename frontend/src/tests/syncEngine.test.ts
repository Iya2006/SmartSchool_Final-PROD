/**
 * Tests de lib/syncEngine.ts — module Offline-First Phase 1.
 *
 * `lib/api` et `lib/offlineQueue` sont mockés pour isoler la logique de
 * rejeu (ordre, gestion des conflits, arrêt propre sur perte réseau,
 * poursuite sur refus serveur) de toute vraie requête HTTP/IndexedDB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn();
vi.mock('@/lib/api', () => ({
    default: { post: (...args: unknown[]) => mockPost(...args) },
}));

interface FakeItem {
    id: string;
    type: 'note' | 'presence';
    endpoint: string;
    payload: unknown;
    statut: string;
    tentatives: number;
    created_at: string;
    derniere_erreur?: string;
}

let queueState: FakeItem[] = [];

vi.mock('@/lib/offlineQueue', () => ({
    listPending: vi.fn(async () => [...queueState].sort((a, b) => a.created_at.localeCompare(b.created_at))),
    markInProgress: vi.fn(async (id: string) => {
        const it = queueState.find((i) => i.id === id);
        if (it) it.statut = 'EN_COURS';
    }),
    markSynced: vi.fn(async (id: string) => {
        queueState = queueState.filter((i) => i.id !== id);
    }),
    markFailed: vi.fn(async (id: string, err: string) => {
        const it = queueState.find((i) => i.id === id);
        if (it) { it.statut = 'ERREUR'; it.tentatives += 1; it.derniere_erreur = err; }
    }),
}));

import { flushQueue, subscribe } from '@/lib/syncEngine';

function item(id: string, endpoint: string, createdAt: string): FakeItem {
    return { id, type: 'note', endpoint, payload: { foo: id }, statut: 'EN_ATTENTE', tentatives: 0, created_at: createdAt };
}

describe('syncEngine.flushQueue', () => {
    beforeEach(() => {
        queueState = [];
        mockPost.mockReset();
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('rejoue les éléments dans leur ordre de création et vide la file en cas de succès', async () => {
        queueState = [
            item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z'),
            item('2', '/api/sync/1/presences', '2026-01-01T00:00:01Z'),
        ];
        mockPost.mockResolvedValue({ data: { conflicts: [] } });

        await flushQueue();

        expect(mockPost).toHaveBeenNthCalledWith(1, '/api/sync/1/notes', { foo: '1' });
        expect(mockPost).toHaveBeenNthCalledWith(2, '/api/sync/1/presences', { foo: '2' });
        expect(queueState).toHaveLength(0);
    });

    it('remonte les conflits renvoyés par le serveur dans le state observable', async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockPost.mockResolvedValue({ data: { conflicts: [{ note_id: 42 }] } });

        let lastState: { lastConflicts: unknown[] } | null = null;
        const unsubscribe = subscribe((s) => { lastState = s; });
        await flushQueue();
        unsubscribe();

        expect(lastState).not.toBeNull();
        expect(lastState!.lastConflicts).toEqual([{ note_id: 42 }]);
    });

    it('arrête le rejeu dès une perte réseau — les éléments restants ne sont ni synchronisés ni marqués en erreur', async () => {
        queueState = [
            item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z'),
            item('2', '/api/sync/1/notes', '2026-01-01T00:00:01Z'),
        ];
        mockPost.mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ERR_NETWORK' }));

        await flushQueue();

        expect(mockPost).toHaveBeenCalledTimes(1);
        expect(queueState).toHaveLength(2);
        expect(queueState.every((i) => i.statut !== 'ERREUR')).toBe(true);
    });

    it('un refus serveur (pas un problème réseau) marque cet élément en erreur et continue avec les suivants', async () => {
        queueState = [
            item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z'),
            item('2', '/api/sync/1/notes', '2026-01-01T00:00:01Z'),
        ];
        mockPost
            .mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Refusé' } } })
            .mockResolvedValueOnce({ data: { conflicts: [] } });

        await flushQueue();

        expect(mockPost).toHaveBeenCalledTimes(2);
        expect(queueState).toHaveLength(1);
        expect(queueState[0].id).toBe('1');
        expect(queueState[0].statut).toBe('ERREUR');
        expect(queueState[0].tentatives).toBe(1);
    });

    it("ne tente rien si navigator.onLine est false", async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];

        await flushQueue();

        expect(mockPost).not.toHaveBeenCalled();
        expect(queueState).toHaveLength(1);
    });

    it('ne fait rien si la file est vide', async () => {
        queueState = [];
        await flushQueue();
        expect(mockPost).not.toHaveBeenCalled();
    });
});
