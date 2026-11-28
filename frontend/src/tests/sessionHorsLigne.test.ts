/**
 * Session et données locales (26/10/2026).
 *
 * - La copie de démarrage hors-ligne (années, école, thème) n'appartient qu'à
 *   un compte.
 * - Une session expirée (401) retire le jeton et RIEN d'autre : c'est presque
 *   toujours le même compte qui se reconnecte, souvent après une journée
 *   hors-ligne.
 * - Si c'est un autre compte qui se connecte, les données du précédent sont
 *   purgées.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const magasins = new Map<string, Map<string, unknown>>();
const magasin = (id: string) => {
    if (!magasins.has(id)) magasins.set(id, new Map());
    return magasins.get(id)!;
};
vi.mock('idb-keyval', () => ({
    createStore: vi.fn((db: string, s: string) => `${db}/${s}`),
    get: vi.fn(async (k: string, s: string) => magasin(s).get(k)),
    set: vi.fn(async (k: string, v: unknown, s: string) => { magasin(s).set(k, v); }),
    del: vi.fn(async (k: string, s: string) => { magasin(s).delete(k); }),
    keys: vi.fn(async (s: string) => Array.from(magasin(s).keys())),
}));
vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));

import { lireMemo, ecrireMemo, CLE_MEMO_HORS_LIGNE } from '@/lib/memoHorsLigne';
import { retirerSessionExpiree, preparerNouvelleSession, CLE_COMPTE_PRECEDENT } from '@/lib/sessionCleanup';

function jeton(charge: Record<string, unknown>): string {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(charge))}.sig`;
}

const DIRECTEUR = jeton({ sub: '5', type: 'admin', etablissement_id: 1 });
const DIRECTEUR_RENOUVELE = jeton({ sub: '5', type: 'admin', etablissement_id: 1, exp: 999 });
const COMPTABLE = jeton({ sub: '6', type: 'admin', etablissement_id: 1 });

describe('memoHorsLigne — copie de démarrage liée au compte', () => {
    beforeEach(() => localStorage.clear());

    it('relit les années mémorisées pour le même compte', () => {
        localStorage.setItem('smartschool_token', DIRECTEUR);
        ecrireMemo({ annees: [{ annee_id: 27, libelle: '2026-2027', est_courante: 'O' }] });
        expect(lireMemo()?.annees).toEqual([{ annee_id: 27, libelle: '2026-2027', est_courante: 'O' }]);
    });

    it('survit au renouvellement du jeton du même compte', () => {
        localStorage.setItem('smartschool_token', DIRECTEUR);
        ecrireMemo({ annees: [{ annee_id: 27 }] });
        localStorage.setItem('smartschool_token', DIRECTEUR_RENOUVELE);
        expect(lireMemo()?.annees).toEqual([{ annee_id: 27 }]);
    });

    it("n'est jamais lue par un autre compte", () => {
        localStorage.setItem('smartschool_token', DIRECTEUR);
        ecrireMemo({ annees: [{ annee_id: 27 }] });
        localStorage.setItem('smartschool_token', COMPTABLE);
        expect(lireMemo()).toBeNull();
    });

    it("n'écrit rien sans session", () => {
        ecrireMemo({ annees: [{ annee_id: 27 }] });
        expect(localStorage.getItem(CLE_MEMO_HORS_LIGNE)).toBeNull();
    });
});

describe('sessionCleanup — session expirée puis reconnexion', () => {
    beforeEach(() => {
        localStorage.clear();
        magasins.clear();
        (globalThis as { caches?: unknown }).caches = { keys: async () => [], delete: async () => true };
    });

    it('401 : retire le jeton et le compte, garde la copie de démarrage et note le compte', () => {
        localStorage.setItem('smartschool_token', DIRECTEUR);
        localStorage.setItem('smartschool_user', '{"id":5}');
        ecrireMemo({ annees: [{ annee_id: 27 }] });
        localStorage.setItem('etablissement_nom', 'École A');

        retirerSessionExpiree();

        expect(localStorage.getItem('smartschool_token')).toBeNull();
        expect(localStorage.getItem('smartschool_user')).toBeNull();
        expect(localStorage.getItem(CLE_MEMO_HORS_LIGNE)).not.toBeNull();
        expect(localStorage.getItem('etablissement_nom')).toBe('École A');
        expect(localStorage.getItem(CLE_COMPTE_PRECEDENT)).toBe('admin:5:1');
    });

    it('le même compte se reconnecte : aucune purge', async () => {
        localStorage.setItem('smartschool_token', DIRECTEUR);
        ecrireMemo({ annees: [{ annee_id: 27 }] });
        retirerSessionExpiree();

        await preparerNouvelleSession(DIRECTEUR_RENOUVELE);
        localStorage.setItem('smartschool_token', DIRECTEUR_RENOUVELE);

        expect(lireMemo()?.annees).toEqual([{ annee_id: 27 }]);
        expect(localStorage.getItem(CLE_COMPTE_PRECEDENT)).toBeNull();
    });

    it('un autre compte se connecte : les données du précédent sont purgées', async () => {
        localStorage.setItem('smartschool_token', DIRECTEUR);
        ecrireMemo({ annees: [{ annee_id: 27 }] });
        retirerSessionExpiree();

        await preparerNouvelleSession(COMPTABLE);

        expect(localStorage.getItem(CLE_MEMO_HORS_LIGNE)).toBeNull();
        expect(localStorage.getItem(CLE_COMPTE_PRECEDENT)).toBeNull();
    });
});
