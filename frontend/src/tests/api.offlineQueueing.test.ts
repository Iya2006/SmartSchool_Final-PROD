/**
 * Tests de lib/api.ts — mise en file hors-ligne (mettreEnFileSiHorsLigne).
 *
 * Cette logique n'avait jamais eu de test dédié (seulement vérifiée via des
 * checks end-to-end backend, Phase 1) — étendue ici (Étape B, généralisation
 * `OFFLINE_QUEUEABLE_ROUTES` pour supporter PUT et une route sans id dans
 * l'URL comme les notifications), c'est le bon moment pour la couvrir
 * directement : une régression ici casserait silencieusement la mise en file
 * de TOUTES les écritures offline, notes/présences comprises.
 *
 * L'intercepteur de réponse d'axios est récupéré via `interceptors.response
 * .forEach` (API publique d'axios) et invoqué directement avec une erreur
 * construite à la main, plutôt que de simuler une vraie requête HTTP.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import api from '@/lib/api';
import { listPending } from '@/lib/offlineQueue';

function getRejectedHandler(): (error: unknown) => Promise<unknown> {
    const rejected = api.interceptors.response.handlers?.[0]?.rejected;
    if (!rejected) throw new Error("Intercepteur de réponse introuvable — a-t-il été retiré de lib/api.ts ?");
    return rejected as (error: unknown) => Promise<unknown>;
}

function networkError(config: { method: string; url: string; data?: unknown }) {
    return Object.assign(new Error('net'), { code: 'ERR_NETWORK', config });
}

describe('lib/api — mise en file hors-ligne', () => {
    beforeEach(() => {
        memoryStore.clear();
        localStorage.clear();
    });

    it('met en file un POST /api/sync/{id}/notes en échec réseau (non-régression notes)', async () => {
        const rejected = getRejectedHandler();
        const res = (await rejected(
            networkError({ method: 'post', url: '/api/sync/7/notes', data: JSON.stringify({ items: [] }) })
        )) as { status: number };

        expect(res.status).toBe(202);
        const pending = await listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].type).toBe('note');
        expect(pending[0].method).toBe('post');
        expect(pending[0].endpoint).toBe('/api/sync/7/notes');
        expect(pending[0].utilisateur_id).toBe('7');
    });

    it('met en file un POST /api/sync/{id}/presences en échec réseau (non-régression présences)', async () => {
        const rejected = getRejectedHandler();
        await rejected(networkError({ method: 'post', url: '/api/sync/12/presences', data: JSON.stringify({ items: [] }) }));

        const pending = await listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].type).toBe('presence');
        expect(pending[0].utilisateur_id).toBe('12');
    });

    it("met en file un PUT /api/communication/messages/marquer-tous-lus en échec réseau, avec l'utilisateur de la session courante", async () => {
        localStorage.setItem('smartschool_user', JSON.stringify({ id: 42, nom: 'Admin' }));
        const rejected = getRejectedHandler();
        const res = (await rejected(
            networkError({ method: 'put', url: '/api/communication/messages/marquer-tous-lus' })
        )) as { status: number };

        expect(res.status).toBe(202);
        const pending = await listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].type).toBe('notification_read_all');
        expect(pending[0].method).toBe('put');
        expect(pending[0].utilisateur_id).toBe(42);
    });

    it("ne met PAS en file une route non listée (ex: GET quelconque, jamais une lecture)", async () => {
        const rejected = getRejectedHandler();
        await expect(rejected(networkError({ method: 'get', url: '/api/eleves' }))).rejects.toBeDefined();
        expect(await listPending()).toHaveLength(0);
    });

    it("ne met PAS en file une route sensible même en méthode/forme proche (ex: PUT sur finance)", async () => {
        const rejected = getRejectedHandler();
        await expect(
            rejected(networkError({ method: 'put', url: '/api/finance/paiements/1' }))
        ).rejects.toBeDefined();
        expect(await listPending()).toHaveLength(0);
    });

    it("ne met PAS en file un vrai refus serveur (pas un problème réseau) — reste rejeté normalement", async () => {
        const rejected = getRejectedHandler();
        const err = Object.assign(new Error('forbidden'), {
            config: { method: 'post', url: '/api/sync/7/notes', data: '{}' },
            response: { status: 403, data: { detail: 'Refusé' } },
        });
        await expect(rejected(err)).rejects.toBeDefined();
        expect(await listPending()).toHaveLength(0);
    });
});
