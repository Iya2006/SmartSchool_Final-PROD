/**
 * La fenêtre invisible de préparation hors-ligne ouvre de vrais écrans : elle
 * ne doit JAMAIS pouvoir écrire, quoi que fasse l'écran au chargement.
 */
import { describe, it, expect, afterEach } from 'vitest';
import api from '@/lib/api';
import { NOM_FENETRE_PREPARATION } from '@/lib/fenetrePreparation';

function intercepteurDeRequete(): (config: any) => any {
    const f = api.interceptors.request.handlers?.[0]?.fulfilled;
    if (!f) throw new Error('Intercepteur de requête introuvable.');
    return f as (config: any) => any;
}

describe('fenêtre de préparation hors-ligne — lecture seule', () => {
    afterEach(() => { window.name = ''; });

    it.each(['post', 'put', 'patch', 'delete'])('refuse un %s', (method) => {
        window.name = NOM_FENETRE_PREPARATION;
        expect(() => intercepteurDeRequete()({ method, url: '/api/eleves', headers: {} })).toThrow(/aucune écriture/);
    });

    it('laisse passer les lectures', () => {
        window.name = NOM_FENETRE_PREPARATION;
        const config = intercepteurDeRequete()({ method: 'get', url: '/api/eleves', headers: {} });
        expect(config.url).toBe('/api/eleves');
    });

    it("ne change rien dans une fenêtre normale", () => {
        const config = intercepteurDeRequete()({ method: 'post', url: '/api/eleves', headers: {} });
        expect(config.method).toBe('post');
    });
});
