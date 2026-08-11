/**
 * Tests de lib/syncEngine.ts — module Offline-First Phase 1.
 *
 * `lib/api` et `lib/offlineQueue` sont mockés pour isoler la logique de
 * rejeu (ordre, gestion des conflits, arrêt propre sur perte réseau,
 * poursuite sur refus serveur) de toute vraie requête HTTP/IndexedDB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequest = vi.fn();
vi.mock('@/lib/api', () => ({
    default: { request: (...args: unknown[]) => mockRequest(...args) },
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
const FAKE_MAX_TENTATIVES = 5;

// Reproduit fidèlement la logique réelle de lib/offlineQueue.ts (statuts,
// plafond de tentatives) pour que les tests exercent la vraie classification
// d'erreurs de syncEngine.ts, pas une version édulcorée du mock.
// Note : la valeur du plafond est répétée en dur ici (5) plutôt que de
// référencer FAKE_MAX_TENTATIVES — vi.mock() est hoisté au-dessus des
// déclarations top-level du fichier, une référence directe lèverait une
// erreur de "temporal dead zone". FAKE_MAX_TENTATIVES (même valeur) reste
// utilisé dans le corps des tests ci-dessous, où ce n'est pas un problème.
vi.mock('@/lib/offlineQueue', () => ({
    MAX_TENTATIVES: 5,
    listPending: vi.fn(async () =>
        [...queueState].filter((i) => i.statut !== 'ECHEC_DEFINITIF').sort((a, b) => a.created_at.localeCompare(b.created_at))
    ),
    listBlocked: vi.fn(async () =>
        [...queueState].filter((i) => i.statut === 'ECHEC_DEFINITIF').sort((a, b) => a.created_at.localeCompare(b.created_at))
    ),
    countBlocked: vi.fn(async () => queueState.filter((i) => i.statut === 'ECHEC_DEFINITIF').length),
    markInProgress: vi.fn(async (id: string) => {
        const it = queueState.find((i) => i.id === id);
        if (it) it.statut = 'EN_COURS';
    }),
    markSynced: vi.fn(async (id: string) => {
        queueState = queueState.filter((i) => i.id !== id);
    }),
    markFailed: vi.fn(async (id: string, err: string, options?: { definitif?: boolean }) => {
        const it = queueState.find((i) => i.id === id);
        if (it) {
            it.tentatives += 1;
            it.derniere_erreur = err;
            it.statut = options?.definitif || it.tentatives >= 5 ? 'ECHEC_DEFINITIF' : 'ERREUR';
        }
    }),
    retry: vi.fn(async (id: string) => {
        const it = queueState.find((i) => i.id === id);
        if (it) { it.statut = 'EN_ATTENTE'; it.tentatives = 0; }
    }),
}));

import { flushQueue, subscribe, retryBlocked, retryAllBlocked } from '@/lib/syncEngine';

function item(id: string, endpoint: string, createdAt: string): FakeItem {
    return { id, type: 'note', endpoint, payload: { foo: id }, statut: 'EN_ATTENTE', tentatives: 0, created_at: createdAt };
}

describe('syncEngine.flushQueue', () => {
    beforeEach(() => {
        queueState = [];
        mockRequest.mockReset();
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('rejoue les éléments dans leur ordre de création et vide la file en cas de succès', async () => {
        queueState = [
            item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z'),
            item('2', '/api/sync/1/presences', '2026-01-01T00:00:01Z'),
        ];
        mockRequest.mockResolvedValue({ data: { conflicts: [] } });

        await flushQueue();

        expect(mockRequest).toHaveBeenNthCalledWith(1, { method: 'post', url: '/api/sync/1/notes', data: { foo: '1' } });
        expect(mockRequest).toHaveBeenNthCalledWith(2, { method: 'post', url: '/api/sync/1/presences', data: { foo: '2' } });
        expect(queueState).toHaveLength(0);
    });

    it('remonte les conflits renvoyés par le serveur dans le state observable', async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockRequest.mockResolvedValue({ data: { conflicts: [{ note_id: 42 }] } });

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
        mockRequest.mockRejectedValueOnce(Object.assign(new Error('net'), { code: 'ERR_NETWORK' }));

        await flushQueue();

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(queueState).toHaveLength(2);
        expect(queueState.every((i) => i.statut !== 'ERREUR')).toBe(true);
    });

    // Mise à jour §21/§24 : un refus HTTP 403/404/422 (permission/donnée
    // introuvable/validation) ne se résoudra JAMAIS en rejouant le même
    // payload — le classer en simple 'ERREUR' rejouable indéfiniment (ancien
    // comportement, testé jusqu'ici) est exactement le bug "retry infini"
    // signalé dans le rapport précédent. Il bascule donc désormais
    // directement en ECHEC_DEFINITIF dès le premier refus (voir
    // isDefinitiveServerError dans syncEngine.ts) : plus jamais rejoué
    // automatiquement, mais toujours présent (jamais supprimé), affiché à
    // l'utilisateur et rejouable manuellement (voir tests retryBlocked
    // ci-dessous). Changement minimal : seule l'assertion de statut change,
    // le comportement "continue avec le suivant" (le vrai objet de ce test)
    // reste identique et est toujours vérifié.
    it('un refus serveur définitif (403) bascule immédiatement en ECHEC_DEFINITIF et continue avec les suivants', async () => {
        queueState = [
            item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z'),
            item('2', '/api/sync/1/notes', '2026-01-01T00:00:01Z'),
        ];
        mockRequest
            .mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Refusé' } } })
            .mockResolvedValueOnce({ data: { conflicts: [] } });

        await flushQueue();

        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(queueState).toHaveLength(1); // jamais supprimé
        expect(queueState[0].id).toBe('1');
        expect(queueState[0].statut).toBe('ECHEC_DEFINITIF');
        expect(queueState[0].tentatives).toBe(1);
    });

    it('un refus serveur transitoire (500) reste ERREUR et rejouable sous le plafond de tentatives', async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockRequest.mockRejectedValueOnce({ response: { status: 500, data: { detail: 'Erreur interne' } } });

        await flushQueue();

        expect(queueState).toHaveLength(1);
        expect(queueState[0].statut).toBe('ERREUR'); // pas ECHEC_DEFINITIF : sera retenté au prochain déclenchement
        expect(queueState[0].tentatives).toBe(1);
    });

    it(`un refus 500 répété ${FAKE_MAX_TENTATIVES} fois bascule en ECHEC_DEFINITIF (n'est plus jamais rejoué automatiquement)`, async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockRequest.mockRejectedValue({ response: { status: 500, data: { detail: 'Erreur interne' } } });

        for (let i = 0; i < FAKE_MAX_TENTATIVES; i++) {
            await flushQueue();
        }

        expect(mockRequest).toHaveBeenCalledTimes(FAKE_MAX_TENTATIVES);
        expect(queueState[0].statut).toBe('ECHEC_DEFINITIF');

        // Un déclenchement supplémentaire ne le retente PAS (exclu de listPending).
        await flushQueue();
        expect(mockRequest).toHaveBeenCalledTimes(FAKE_MAX_TENTATIVES);
    });

    // Correction du bug le plus sérieux trouvé en investiguant §21 : l'ancien
    // code ne vérifiait jamais `resultats[]` dans une réponse 200 de
    // /api/sync/{id}/notes — un item individuellement REFUSE (évaluation
    // déjà centralisée, trimestre clôturé...) était donc marqué "synchronisé"
    // et disparaissait de la file en silence, alors que le serveur ne
    // l'avait PAS appliqué. La saisie hors-ligne de l'enseignant était
    // perdue sans aucune trace.
    it('un refus embarqué dans une réponse 200 (resultats: REFUSE) N\'EST PAS marqué synchronisé — pas de perte silencieuse', async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockRequest.mockResolvedValueOnce({
            data: {
                resultats: [{ note_id: 42, statut: 'REFUSE', detail: 'Évaluation déjà centralisée' }],
                conflicts: [],
                nb_synchronises: 0,
                nb_total: 1,
            },
        });

        await flushQueue();

        expect(queueState).toHaveLength(1); // toujours là — PAS supprimé comme un succès
        expect(queueState[0].statut).toBe('ECHEC_DEFINITIF');
        expect(queueState[0].derniere_erreur).toContain('Évaluation déjà centralisée');
    });

    it('un batch notes avec au moins un OK et un REFUSE reste dans la file (pas de succès partiel silencieux)', async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockRequest.mockResolvedValueOnce({
            data: {
                resultats: [
                    { note_id: 1, statut: 'OK' },
                    { note_id: 2, statut: 'REFUSE', detail: 'Note hors du périmètre de cet enseignant' },
                ],
                conflicts: [],
                nb_synchronises: 1,
                nb_total: 2,
            },
        });

        await flushQueue();

        expect(queueState).toHaveLength(1);
        expect(queueState[0].statut).toBe('ECHEC_DEFINITIF');
    });

    it('une réponse 200 sans resultats (ex: /presences) est traitée comme un succès normal', async () => {
        queueState = [item('1', '/api/sync/1/presences', '2026-01-01T00:00:00Z')];
        mockRequest.mockResolvedValueOnce({
            data: { message: 'Appel synchronisé', nb_synchronises: 3, nb_total: 3 },
        });

        await flushQueue();

        expect(queueState).toHaveLength(0);
    });

    it('retryBlocked() remet un élément bloqué en attente et relance la synchronisation', async () => {
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];
        mockRequest.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Refusé' } } });
        await flushQueue();
        expect(queueState[0].statut).toBe('ECHEC_DEFINITIF');

        mockRequest.mockResolvedValueOnce({ data: { conflicts: [] } });
        await retryBlocked('1');

        expect(queueState).toHaveLength(0); // resynchronisé avec succès cette fois
    });

    it('retryAllBlocked() relance tous les éléments bloqués en une fois', async () => {
        queueState = [
            item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z'),
            item('2', '/api/sync/1/notes', '2026-01-01T00:00:01Z'),
        ];
        mockRequest
            .mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Refusé' } } })
            .mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Refusé' } } });
        await flushQueue();
        expect(queueState.every((i) => i.statut === 'ECHEC_DEFINITIF')).toBe(true);

        mockRequest.mockResolvedValue({ data: { conflicts: [] } });
        await retryAllBlocked();

        expect(queueState).toHaveLength(0);
    });

    it("ne tente rien si navigator.onLine est false", async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        queueState = [item('1', '/api/sync/1/notes', '2026-01-01T00:00:00Z')];

        await flushQueue();

        expect(mockRequest).not.toHaveBeenCalled();
        expect(queueState).toHaveLength(1);
    });

    it('ne fait rien si la file est vide', async () => {
        queueState = [];
        await flushQueue();
        expect(mockRequest).not.toHaveBeenCalled();
    });
});
