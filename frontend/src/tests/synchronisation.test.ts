/**
 * Écran « Synchronisation » et indicateur du poste : ce que la direction voit
 * pour trancher, et ce que l'utilisateur lit en un coup d'œil.
 */
import { describe, expect, it } from 'vitest';
import { champsEnDesaccord, libelleChamp, valeurLisible } from '@/lib/synchronisation';
import { decrireEtat } from '@/components/IndicateurPoste';

describe('champsEnDesaccord', () => {
    it('ne montre que les champs qui diffèrent, sans les colonnes techniques', () => {
        expect(champsEnDesaccord({
            version_poste: { montant_remise: '50000.00', statut: 'EN_ATTENTE', updated_at: '2026-10-29T08:00:00' },
            version_serveur: { montant_remise: '20000.00', statut: 'EN_ATTENTE', updated_at: '2026-10-29T09:00:00' },
        })).toEqual(['montant_remise']);
    });

    it('montre tout quand une version manque (ligne supprimée ou refusée)', () => {
        expect(champsEnDesaccord({ version_poste: { nom: 'Bah', prenom: 'Awa' }, version_serveur: null }))
            .toEqual(['nom', 'prenom']);
    });
});

describe('libellés', () => {
    it('rend les noms de colonnes lisibles', () => {
        expect(libelleChamp('montant_remise')).toBe('Montant remise');
        expect(libelleChamp('classe_id')).toBe('Classe');
        expect(valeurLisible(null)).toBe('—');
        expect(valeurLisible(['ADMIN'])).toBe('["ADMIN"]');
    });
});

describe('decrireEtat', () => {
    const base = { en_attente: 0, mis_de_cote: 0, a_verifier: 0, derniere_reussite: null, hors_ligne_depuis: null, erreur: null };
    const maintenant = new Date('2026-10-29T12:00:00Z').getTime();

    it('synchronisé : vert, avec l’heure', () => {
        const d = decrireEtat({ ...base, statut: 'SYNCHRONISE', derniere_reussite: '2026-10-29T11:30:00Z' }, maintenant);
        expect(d.ton).toBe('vert');
        expect(d.texte).toMatch(/^Synchronisé à /);
    });

    it('hors ligne : dit combien de changements attendent', () => {
        const d = decrireEtat({ ...base, statut: 'HORS_LIGNE', en_attente: 4, derniere_reussite: '2026-10-28T10:00:00Z' }, maintenant);
        expect(d.texte).toContain('4 changement(s) en attente');
        expect(d.ton).toBe('gris');
    });

    it('plus de 7 jours sans synchronisation : alerte de sauvegarde', () => {
        const d = decrireEtat({ ...base, statut: 'HORS_LIGNE', derniere_reussite: '2026-10-10T10:00:00Z' }, maintenant);
        expect(d.ton).toBe('rouge');
        expect(d.detail).toContain('Plus de 7 jours');
    });

    it('poste retiré : rouge', () => {
        expect(decrireEtat({ ...base, statut: 'REFUSE' }, maintenant).texte).toBe('Poste retiré par la direction');
    });
});
