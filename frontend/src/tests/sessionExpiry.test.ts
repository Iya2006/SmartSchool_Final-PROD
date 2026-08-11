/**
 * Tests de lib/sessionExpiry.ts — Étape D (§6/§7).
 *
 * Ne vérifie QUE la lecture du `exp` d'un JWT (aucune validation
 * cryptographique — ce module n'en fait jamais, voir son commentaire
 * d'en-tête) : c'est un signal client, pas une décision de sécurité.
 */
import { describe, it, expect } from 'vitest';
import { getTokenExpiryMs, isTokenLikelyExpired, minutesUntilExpiry } from '@/lib/sessionExpiry';

function makeToken(expSecondsFromNow: number): string {
    const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
    const payload = Buffer.from(JSON.stringify({ sub: '1', exp })).toString('base64url');
    return `header.${payload}.signature`;
}

describe('sessionExpiry', () => {
    it('un token dont exp est dans le futur n\'est pas considéré expiré', () => {
        const token = makeToken(3600); // +1h
        expect(isTokenLikelyExpired(token)).toBe(false);
    });

    it('un token dont exp est dans le passé est considéré expiré', () => {
        const token = makeToken(-60); // -1min
        expect(isTokenLikelyExpired(token)).toBe(true);
    });

    it('un token absent (null/undefined) n\'est jamais considéré expiré (indéterminable, ne pas alarmer à tort)', () => {
        expect(isTokenLikelyExpired(null)).toBe(false);
        expect(isTokenLikelyExpired(undefined)).toBe(false);
    });

    it('un token malformé (pas 3 segments) n\'est jamais considéré expiré', () => {
        expect(isTokenLikelyExpired('pasunjwt')).toBe(false);
        expect(getTokenExpiryMs('pasunjwt')).toBeNull();
    });

    it('un token sans champ exp renvoie expiryMs=null', () => {
        const payload = Buffer.from(JSON.stringify({ sub: '1' })).toString('base64url');
        const token = `header.${payload}.signature`;
        expect(getTokenExpiryMs(token)).toBeNull();
        expect(isTokenLikelyExpired(token)).toBe(false);
    });

    it('minutesUntilExpiry renvoie une valeur positive proche pour un token valide', () => {
        const token = makeToken(600); // +10min
        const minutes = minutesUntilExpiry(token);
        expect(minutes).not.toBeNull();
        expect(minutes!).toBeGreaterThan(8);
        expect(minutes!).toBeLessThanOrEqual(10);
    });

    it('minutesUntilExpiry renvoie une valeur négative pour un token déjà expiré', () => {
        const token = makeToken(-600); // -10min
        const minutes = minutesUntilExpiry(token);
        expect(minutes).not.toBeNull();
        expect(minutes!).toBeLessThan(0);
    });
});
