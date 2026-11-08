/**
 * Tests de lib/api.ts — reprise automatique des coupures passagères.
 *
 * Mesuré depuis Conakry : la liaison perd des paquets par bouffées. Un appel
 * sur trente n'aboutit pas, un tiers dépasse la seconde, et les sites témoins
 * (Google, GitHub) ralentissent en même temps — c'est la liaison, pas le
 * serveur. Sans reprise, le premier appel malchanceux affichait « Serveur
 * indisponible » alors que tout fonctionnait.
 *
 * **Le test qui compte le plus ici est celui qui vérifie qu'un encaissement
 * n'est JAMAIS rejoué.** Si le serveur a enregistré le paiement et que seule
 * sa réponse s'est perdue, un second envoi encaisse le même tarif deux fois.
 * Rendre l'application plus tolérante aux coupures ne doit pas se payer en
 * double prélèvement sur le parent d'un élève.
 *
 * L'intercepteur est récupéré et invoqué directement, comme dans
 * `api.offlineQueueing.test.ts`, plutôt que de simuler un vrai échange HTTP.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

type Config = { method: string; url: string; data?: unknown; __reprises?: number };

function getRejectedHandler(): (error: unknown) => Promise<unknown> {
    const rejected = api.interceptors.response.handlers?.[0]?.rejected;
    if (!rejected) throw new Error("Intercepteur de réponse introuvable — a-t-il été retiré de lib/api.ts ?");
    return rejected as (error: unknown) => Promise<unknown>;
}

function erreurReseau(config: Config) {
    return Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config });
}

function erreurDelaiDepasse(config: Config) {
    return Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED', config });
}

function erreurStatut(statut: number, config: Config) {
    return Object.assign(new Error(`Request failed with status code ${statut}`), {
        config,
        response: { status: statut, data: {} },
    });
}

function enLigne(valeur: boolean) {
    Object.defineProperty(navigator, 'onLine', { value: valeur, configurable: true });
}

describe('lib/api — reprise automatique', () => {
    beforeEach(() => {
        memoryStore.clear();
        localStorage.clear();
        enLigne(true);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        enLigne(true);
    });

    // ── Ce qui doit être rejoué ──────────────────────────────────────────

    it('rejoue une lecture coupée par le réseau et rend le succès à l’appelant', async () => {
        const rejouer = vi.spyOn(api, 'request').mockResolvedValue({ data: ['eleve'], status: 200 } as never);

        const res = await getRejectedHandler()(erreurReseau({ method: 'get', url: '/api/eleves' }));

        expect(rejouer).toHaveBeenCalledTimes(1);
        expect(res).toEqual({ data: ['eleve'], status: 200 });
    });

    it('rejoue une lecture quand l’hébergeur répond 503 à la place du serveur', async () => {
        const rejouer = vi.spyOn(api, 'request').mockResolvedValue({ data: {}, status: 200 } as never);

        await getRejectedHandler()(erreurStatut(503, { method: 'get', url: '/api/classes' }));

        expect(rejouer).toHaveBeenCalledTimes(1);
    });

    it('rejoue une connexion — c’est l’écran où l’utilisateur voyait le message', async () => {
        const rejouer = vi.spyOn(api, 'request').mockResolvedValue({ data: { token: 'jwt' }, status: 200 } as never);

        const res = (await getRejectedHandler()(
            erreurReseau({ method: 'post', url: '/api/auth/login', data: '{}' })
        )) as { data: { token: string } };

        expect(rejouer).toHaveBeenCalledTimes(1);
        expect(res.data.token).toBe('jwt');
    });

    it('compte ses tentatives, pour que le budget soit tenu', async () => {
        vi.spyOn(api, 'request').mockResolvedValue({ data: {}, status: 200 } as never);
        const config: Config = { method: 'get', url: '/api/eleves' };

        await getRejectedHandler()(erreurReseau(config));

        expect(config.__reprises).toBe(1);
    });

    // ── Ce qui ne doit JAMAIS être rejoué ────────────────────────────────

    it('ne rejoue JAMAIS un encaissement : le risque est de prélever deux fois', async () => {
        const rejouer = vi.spyOn(api, 'request');

        await expect(
            getRejectedHandler()(erreurReseau({ method: 'post', url: '/api/finance/paiements', data: '{}' }))
        ).rejects.toThrow('Serveur indisponible. Réessayez dans un instant.');

        expect(rejouer).not.toHaveBeenCalled();
    });

    it('ne rejoue JAMAIS un encaissement groupé — une classe entière serait prélevée deux fois', async () => {
        const rejouer = vi.spyOn(api, 'request');

        await expect(
            getRejectedHandler()(
                erreurReseau({ method: 'post', url: '/api/finance/encaissements-groupes', data: '{}' })
            )
        ).rejects.toThrow();

        expect(rejouer).not.toHaveBeenCalled();
    });

    it('ne rejoue pas une suppression ni une modification, faute de pouvoir prouver qu’elles sont rejouables', async () => {
        const rejouer = vi.spyOn(api, 'request');

        await expect(getRejectedHandler()(erreurReseau({ method: 'delete', url: '/api/eleves/4' }))).rejects.toThrow();
        await expect(
            getRejectedHandler()(erreurReseau({ method: 'put', url: '/api/eleves/4', data: '{}' }))
        ).rejects.toThrow();

        expect(rejouer).not.toHaveBeenCalled();
    });

    it('ne rejoue pas un refus métier : 404 et 400 veulent dire quelque chose', async () => {
        const rejouer = vi.spyOn(api, 'request');

        await expect(getRejectedHandler()(erreurStatut(404, { method: 'get', url: '/api/eleves/999' }))).rejects.toThrow();
        await expect(getRejectedHandler()(erreurStatut(400, { method: 'get', url: '/api/eleves?x=y' }))).rejects.toThrow();

        expect(rejouer).not.toHaveBeenCalled();
    });

    it('s’arrête quand le budget est épuisé, et affiche alors le message', async () => {
        const rejouer = vi.spyOn(api, 'request');

        await expect(
            getRejectedHandler()(erreurReseau({ method: 'get', url: '/api/eleves', __reprises: 4 }))
        ).rejects.toThrow('Serveur indisponible. Réessayez dans un instant.');

        expect(rejouer).not.toHaveBeenCalled();
    });

    it('n’insiste pas quand l’appareil se sait hors-ligne : insister ne sert à rien', async () => {
        enLigne(false);
        const rejouer = vi.spyOn(api, 'request');

        await expect(getRejectedHandler()(erreurReseau({ method: 'get', url: '/api/eleves' }))).rejects.toThrow(
            /hors-ligne/
        );

        expect(rejouer).not.toHaveBeenCalled();
    });

    it('ne rejoue un délai dépassé qu’une seule fois : quatre fois trente secondes seraient pires que l’erreur', async () => {
        const rejouer = vi.spyOn(api, 'request').mockResolvedValue({ data: {}, status: 200 } as never);

        await getRejectedHandler()(erreurDelaiDepasse({ method: 'get', url: '/api/bulletins' }));
        expect(rejouer).toHaveBeenCalledTimes(1);

        await expect(
            getRejectedHandler()(erreurDelaiDepasse({ method: 'get', url: '/api/bulletins', __reprises: 1 }))
        ).rejects.toThrow('Le serveur met trop de temps à répondre. Réessayez dans un instant.');
        expect(rejouer).toHaveBeenCalledTimes(1);
    });
});
