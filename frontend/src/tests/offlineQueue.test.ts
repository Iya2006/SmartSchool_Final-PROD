/**
 * Tests de lib/offlineQueue.ts — module Offline-First Phase 1.
 *
 * `idb-keyval` est mocké par un Map en mémoire plutôt que de dépendre d'une
 * vraie/fake IndexedDB : jsdom (l'environnement de test configuré dans
 * vitest.config.ts) n'implémente pas IndexedDB nativement, et l'environnement
 * n'a pas d'accès réseau pour installer un polyfill dédié (fake-indexeddb).
 * Suffisant pour vérifier la LOGIQUE du module — forme des entrées, tri,
 * transitions de statut — qui est ce qui peut réellement casser ici.
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

import {
    enqueue,
    listPending,
    countPending,
    markInProgress,
    markSynced,
    markFailed,
    clearAll,
} from '@/lib/offlineQueue';

const baseItem = {
    type: 'note' as const,
    endpoint: '/api/sync/1/notes',
    payload: { items: [] },
    utilisateur_id: 1,
    etablissement_id: 1,
};

describe('offlineQueue', () => {
    beforeEach(() => {
        memoryStore.clear();
    });

    it("enqueue crée une entrée EN_ATTENTE avec un id unique et un horodatage", async () => {
        const item = await enqueue(baseItem);
        expect(item.id).toBeTruthy();
        expect(item.statut).toBe('EN_ATTENTE');
        expect(item.tentatives).toBe(0);
        expect(item.created_at).toBeTruthy();
        expect(item.endpoint).toBe('/api/sync/1/notes');
    });

    it('deux enqueue successifs génèrent des ids différents', async () => {
        const a = await enqueue(baseItem);
        const b = await enqueue(baseItem);
        expect(a.id).not.toBe(b.id);
    });

    it('listPending trie par date de création croissante (ordre de saisie)', async () => {
        const a = await enqueue(baseItem);
        await new Promise((r) => setTimeout(r, 2));
        const b = await enqueue({ ...baseItem, type: 'presence', endpoint: '/api/sync/1/presences' });

        const pending = await listPending();
        expect(pending.map((i) => i.id)).toEqual([a.id, b.id]);
    });

    it("countPending reflète le nombre d'éléments en file", async () => {
        expect(await countPending()).toBe(0);
        await enqueue(baseItem);
        expect(await countPending()).toBe(1);
        await enqueue(baseItem);
        expect(await countPending()).toBe(2);
    });

    it("markSynced retire l'élément de la file", async () => {
        const item = await enqueue(baseItem);
        await markSynced(item.id);
        expect(await listPending()).toHaveLength(0);
    });

    it("markFailed incrémente les tentatives et enregistre l'erreur, sans retirer l'élément", async () => {
        const item = await enqueue(baseItem);
        await markFailed(item.id, 'Erreur serveur');
        const pending = await listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].statut).toBe('ERREUR');
        expect(pending[0].tentatives).toBe(1);
        expect(pending[0].derniere_erreur).toBe('Erreur serveur');
    });

    it('markFailed répété incrémente les tentatives à chaque appel', async () => {
        const item = await enqueue(baseItem);
        await markFailed(item.id, 'Erreur 1');
        await markFailed(item.id, 'Erreur 2');
        const pending = await listPending();
        expect(pending[0].tentatives).toBe(2);
        expect(pending[0].derniere_erreur).toBe('Erreur 2');
    });

    it('markInProgress passe le statut à EN_COURS', async () => {
        const item = await enqueue(baseItem);
        await markInProgress(item.id);
        const pending = await listPending();
        expect(pending[0].statut).toBe('EN_COURS');
    });

    it('clearAll vide complètement la file', async () => {
        await enqueue(baseItem);
        await enqueue({ ...baseItem, type: 'presence' });
        await clearAll();
        expect(await listPending()).toHaveLength(0);
    });

    it("markSynced/markFailed sur un id inconnu n'échoue pas (no-op silencieux)", async () => {
        await expect(markSynced('id-inexistant')).resolves.not.toThrow();
        await expect(markFailed('id-inexistant', 'x')).resolves.not.toThrow();
    });
});
