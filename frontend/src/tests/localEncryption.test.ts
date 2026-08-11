/**
 * Tests de lib/localEncryption.ts — Étape D (sécurité locale).
 *
 * Utilise la vraie Web Crypto API (disponible nativement sous Node 19+ /
 * jsdom, pas mockée) — c'est justement le mécanisme cryptographique lui-même
 * qu'il faut vérifier, pas juste son orchestration.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { encryptValue, decryptValue } from '@/lib/localEncryption';

describe('localEncryption', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('chiffre puis déchiffre correctement avec le même token (round-trip)', async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const original = { nom: 'Diallo', adresse: 'Quartier X', groupe_sanguin: 'O+' };

        const encrypted = await encryptValue(original);
        expect(encrypted).not.toBeNull();
        expect(encrypted!.data).not.toEqual([]); // vraiment chiffré, pas un no-op

        const decrypted = await decryptValue(encrypted);
        expect(decrypted).toEqual(original);
    });

    it("le texte chiffré ne contient pas les données en clair (sanity check)", async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const encrypted = await encryptValue({ nom: 'DonnéeSecrèteUnique12345' });
        const asString = JSON.stringify(encrypted);
        expect(asString).not.toContain('DonnéeSecrèteUnique12345');
    });

    it("déchiffrer avec un token DIFFÉRENT (autre utilisateur/session) échoue proprement — pas d'exception, retourne null", async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const encrypted = await encryptValue({ nom: 'Diallo' });

        localStorage.setItem('smartschool_token', 'token-utilisateur-B');
        const decrypted = await decryptValue(encrypted);

        expect(decrypted).toBeNull();
    });

    it('sans session active (pas de token), encryptValue renvoie null plutôt que de stocker en clair', async () => {
        localStorage.removeItem('smartschool_token');
        const encrypted = await encryptValue({ nom: 'Diallo' });
        expect(encrypted).toBeNull();
    });

    it('sans session active, decryptValue renvoie null (jamais d\'exception)', async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const encrypted = await encryptValue({ nom: 'Diallo' });

        localStorage.removeItem('smartschool_token');
        const decrypted = await decryptValue(encrypted);

        expect(decrypted).toBeNull();
    });

    it('decryptValue(null | undefined) renvoie null sans lever d\'exception', async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        await expect(decryptValue(null)).resolves.toBeNull();
        await expect(decryptValue(undefined)).resolves.toBeNull();
    });

    it('deux chiffrements de la même valeur produisent des IV différents (pas de réutilisation de nonce)', async () => {
        localStorage.setItem('smartschool_token', 'token-utilisateur-A');
        const a = await encryptValue({ nom: 'Diallo' });
        const b = await encryptValue({ nom: 'Diallo' });
        expect(a!.iv).not.toEqual(b!.iv);
    });
});
