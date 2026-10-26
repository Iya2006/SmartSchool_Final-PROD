/**
 * lib/preparationHorsLigne.ts — ce qui est préchargé pour le hors-ligne.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
    createStore: vi.fn(() => 'magasin'),
    get: vi.fn(async (k: string) => memoire.get(k)),
    set: vi.fn(async (k: string, v: unknown) => { memoire.set(k, v); }),
    del: vi.fn(async (k: string) => { memoire.delete(k); }),
    keys: vi.fn(async () => Array.from(memoire.keys())),
}));
vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));

import { ecransDuRole, memoriserLecture, lecturesMemorisees } from '@/lib/preparationHorsLigne';

function jeton(charge: Record<string, unknown>): string {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64url('{}')}.${b64url(JSON.stringify(charge))}.sig`;
}

describe('preparationHorsLigne — écrans du rôle', () => {
    it("l'enseignant reçoit son portail, jamais la comptabilité", () => {
        const ecrans = ecransDuRole({ id: 3, role: 'ENSEIGNANT' });
        expect(ecrans).toContain('/portail-enseignant');
        expect(ecrans.some((e) => e.startsWith('/comptabilite'))).toBe(false);
        expect(ecrans).not.toContain('/dashboard');
    });

    it("l'administrateur reçoit le tableau de bord et les écrans de gestion", () => {
        const ecrans = ecransDuRole({ id: 1, role: 'ADMIN' });
        expect(ecrans).toContain('/dashboard');
        expect(ecrans).toContain('/eleves');
    });
});

describe('preparationHorsLigne — lectures mémorisées', () => {
    beforeEach(() => {
        memoire.clear();
        localStorage.clear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it("mémorise les lectures de l'API, jamais celles de l'authentification", async () => {
        localStorage.setItem('smartschool_token', jeton({ sub: '1', type: 'admin', etablissement_id: 1 }));
        memoriserLecture('/api/eleves?page=2');
        memoriserLecture('/api/auth/me');
        memoriserLecture('/dashboard');
        await vi.advanceTimersByTimeAsync(2500);

        expect(await lecturesMemorisees('admin:1:1')).toEqual(['/api/eleves?page=2']);
    });

    it('range les lectures par compte', async () => {
        localStorage.setItem('smartschool_token', jeton({ sub: '1', type: 'admin', etablissement_id: 1 }));
        memoriserLecture('/api/finance/paiements');
        await vi.advanceTimersByTimeAsync(2500);
        localStorage.setItem('smartschool_token', jeton({ sub: '9', type: 'enseignant', etablissement_id: 1 }));
        memoriserLecture('/api/portail-enseignant/9/dashboard');
        await vi.advanceTimersByTimeAsync(2500);

        expect(await lecturesMemorisees('admin:1:1')).toEqual(['/api/finance/paiements']);
        expect(await lecturesMemorisees('enseignant:9:1')).toEqual(['/api/portail-enseignant/9/dashboard']);
    });
});
