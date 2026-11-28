import { describe, it, expect } from 'vitest';
import { texteErreur } from '@/lib/texteErreur';

const PAR_DEFAUT = "La modification n'a pas pu être enregistrée.";

describe('texteErreur : ce que l’écran dit quand une requête échoue', () => {
    it('le refus expliqué par le serveur est montré tel quel', () => {
        const refus = { isAxiosError: true, message: 'Request failed with status code 409',
            response: { status: 409, data: { detail: 'L’identifiant « 620000000 » est déjà utilisé.' } } };
        expect(texteErreur(refus, PAR_DEFAUT)).toBe('L’identifiant « 620000000 » est déjà utilisé.');
    });

    it('sans réponse, la phrase posée par lib/api.ts (hors ligne, serveur indisponible)', () => {
        const coupure = { isAxiosError: true, message: 'Vous êtes hors ligne : cette modification sera possible au retour de la connexion.' };
        expect(texteErreur(coupure, PAR_DEFAUT)).toBe(coupure.message);
    });

    it('jamais le jargon technique d’un refus sans explication', () => {
        const brut = { isAxiosError: true, message: 'Request failed with status code 400', response: { status: 400, data: {} } };
        expect(texteErreur(brut, PAR_DEFAUT)).toBe(PAR_DEFAUT);
    });

    it('une erreur de programme n’est pas montrée à l’utilisateur', () => {
        expect(texteErreur(new TypeError("Cannot read properties of undefined (reading 'x')"), PAR_DEFAUT)).toBe(PAR_DEFAUT);
        expect(texteErreur(undefined, PAR_DEFAUT)).toBe(PAR_DEFAUT);
    });
});
