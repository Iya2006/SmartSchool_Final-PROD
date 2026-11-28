import { describe, it, expect } from 'vitest';
import {
    cleDeCacheApi,
    compteDuJeton,
    estRequeteApi,
    PARAM_CLOISON,
    CLOISON_SANS_COMPTE,
} from '@/lib/offlineCacheKey';

function jeton(charge: Record<string, unknown>): string {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `Bearer ${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(charge))}.signature`;
}

const API = 'https://api.trxsmartschool.com';

describe('offlineCacheKey — clé du cache API du Service Worker', () => {
    it("reconnaît l'API sur un autre domaine que le frontend", () => {
        expect(estRequeteApi(new URL(`${API}/api/eleves?page=1`))).toBe(true);
        expect(estRequeteApi(new URL('https://trxsmartschool.com/dashboard'))).toBe(false);
        expect(estRequeteApi(new URL('https://fonts.gstatic.com/s/inter.woff2'))).toBe(false);
    });

    it('lit type, sub et établissement dans le jeton', () => {
        expect(compteDuJeton(jeton({ sub: '12', type: 'enseignant', etablissement_id: 3 }))).toBe('enseignant:12:3');
        expect(compteDuJeton(jeton({ sub: '1', type: 'admin', etablissement_id: null }))).toBe('admin:1:-');
    });

    it('rend null pour un en-tête absent ou illisible', () => {
        expect(compteDuJeton(null)).toBeNull();
        expect(compteDuJeton('Bearer pas-un-jwt')).toBeNull();
        expect(compteDuJeton('Bearer a.b.c')).toBeNull();
        expect(compteDuJeton(jeton({ type: 'admin' }))).toBeNull();
    });

    it('retire le paramètre anti-cache _t : deux appels successifs donnent la même clé', () => {
        const auth = jeton({ sub: '5', type: 'admin', etablissement_id: 1 });
        const a = cleDeCacheApi(`${API}/api/parametrage/settings?etablissement_id=1&_t=1700000000000`, auth);
        const b = cleDeCacheApi(`${API}/api/parametrage/settings?etablissement_id=1&_t=1700000099999`, auth);
        expect(a).toBe(b);
        expect(a).not.toContain('_t=');
        expect(a).toContain('etablissement_id=1');
    });

    it('cloisonne par compte : même URL, comptes différents, clés différentes', () => {
        const url = `${API}/api/dashboard?annee_id=27`;
        const directeur = cleDeCacheApi(url, jeton({ sub: '5', type: 'admin', etablissement_id: 1 }));
        const enseignantMemeSub = cleDeCacheApi(url, jeton({ sub: '5', type: 'enseignant', etablissement_id: 1 }));
        const autreEcole = cleDeCacheApi(url, jeton({ sub: '5', type: 'admin', etablissement_id: 2 }));
        expect(new Set([directeur, enseignantMemeSub, autreEcole]).size).toBe(3);
    });

    it('garde la même clé quand le jeton du même compte est renouvelé', () => {
        const url = `${API}/api/classes`;
        const avant = cleDeCacheApi(url, jeton({ sub: '9', type: 'admin', etablissement_id: 1, exp: 1 }));
        const apres = cleDeCacheApi(url, jeton({ sub: '9', type: 'admin', etablissement_id: 1, exp: 2 }));
        expect(avant).toBe(apres);
    });

    it('range les requêtes sans compte dans une cloison publique', () => {
        const cle = new URL(cleDeCacheApi(`${API}/api/parametrage/etablissements/1`, null));
        expect(cle.searchParams.get(PARAM_CLOISON)).toBe(CLOISON_SANS_COMPTE);
    });

    it("n'utilise pas de fragment # (ignoré par l'API Cache à la comparaison)", () => {
        const cle = cleDeCacheApi(`${API}/api/eleves#ancre`, jeton({ sub: '1', type: 'admin' }));
        expect(cle).not.toContain('#');
    });
});
