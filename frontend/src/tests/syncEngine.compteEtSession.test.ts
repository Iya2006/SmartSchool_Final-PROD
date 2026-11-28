/**
 * lib/syncEngine.ts — rejeu limité au compte connecté, et pause (sans échec)
 * quand la session a expiré.
 *
 * Sur un poste partagé, la saisie d'un enseignant ne doit jamais partir sous le
 * jeton d'un autre. Et après une journée hors-ligne, la session (8 h) a souvent
 * expiré : la saisie n'y est pour rien, elle doit attendre la reconnexion au
 * lieu d'être classée « échec définitif ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('@/lib/api', () => ({
    default: { request: (...args: unknown[]) => mockRequest(...args) },
}));

interface FakeItem {
    id: string;
    endpoint: string;
    payload: unknown;
    statut: string;
    tentatives: number;
    created_at: string;
    compte?: string;
}

let file: FakeItem[] = [];

vi.mock('@/lib/offlineQueue', () => ({
    MAX_TENTATIVES: 5,
    listPending: vi.fn(async () => file.filter((i) => i.statut !== 'ECHEC_DEFINITIF')),
    listBlocked: vi.fn(async () => file.filter((i) => i.statut === 'ECHEC_DEFINITIF')),
    countBlocked: vi.fn(async () => file.filter((i) => i.statut === 'ECHEC_DEFINITIF').length),
    markInProgress: vi.fn(async (id: string) => {
        const it = file.find((i) => i.id === id);
        if (it) it.statut = 'EN_COURS';
    }),
    markSynced: vi.fn(async (id: string) => {
        file = file.filter((i) => i.id !== id);
    }),
    markFailed: vi.fn(async (id: string, _e: string, o?: { definitif?: boolean }) => {
        const it = file.find((i) => i.id === id);
        if (it) {
            it.tentatives += 1;
            it.statut = o?.definitif ? 'ECHEC_DEFINITIF' : 'ERREUR';
        }
    }),
    retry: vi.fn(async (id: string) => {
        const it = file.find((i) => i.id === id);
        if (it) { it.statut = 'EN_ATTENTE'; it.tentatives = 0; }
    }),
}));

import { flushQueue, subscribe, type SyncState } from '@/lib/syncEngine';

function jeton(charge: Record<string, unknown>): string {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(charge))}.sig`;
}

function element(id: string, compte?: string): FakeItem {
    return { id, endpoint: `/api/sync/1/notes?e=${id}`, payload: {}, statut: 'EN_ATTENTE', tentatives: 0, created_at: `2026-10-26T00:00:0${id}Z`, compte };
}

describe('syncEngine — compte et session', () => {
    beforeEach(() => {
        file = [];
        mockRequest.mockReset();
        localStorage.clear();
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        localStorage.setItem('smartschool_token', jeton({ sub: '7', type: 'enseignant', etablissement_id: 1 }));
    });

    it("ne rejoue que les saisies du compte connecté (et les anciennes saisies sans compte)", async () => {
        file = [element('1', 'enseignant:7:1'), element('2', 'enseignant:8:1'), element('3')];
        mockRequest.mockResolvedValue({ data: {} });

        await flushQueue();

        const envoyes = mockRequest.mock.calls.map((c) => c[0].url);
        expect(envoyes).toEqual(['/api/sync/1/notes?e=1', '/api/sync/1/notes?e=3']);
        // La saisie de l'autre enseignant reste en attente, intacte.
        expect(file.map((i) => [i.id, i.statut])).toEqual([['2', 'EN_ATTENTE']]);
    });

    it("session expirée (401) : rejeu mis en pause, saisie remise en attente sans échec compté", async () => {
        file = [element('1', 'enseignant:7:1'), element('2', 'enseignant:7:1')];
        mockRequest.mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401, data: {} } }));
        let dernier: SyncState | null = null;
        const stop = subscribe((s) => { dernier = s; });

        await flushQueue();
        stop();

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(file.map((i) => [i.id, i.statut, i.tentatives])).toEqual([
            ['1', 'EN_ATTENTE', 0],
            ['2', 'EN_ATTENTE', 0],
        ]);
        expect(dernier!.lastError).toMatch(/session expirée/i);
    });

    it('un vrai refus (403) reste un échec définitif, comme avant', async () => {
        file = [element('1', 'enseignant:7:1')];
        mockRequest.mockRejectedValue(Object.assign(new Error('403'), { response: { status: 403, data: { detail: 'Refusé' } } }));

        await flushQueue();

        expect(file[0].statut).toBe('ECHEC_DEFINITIF');
    });
});
