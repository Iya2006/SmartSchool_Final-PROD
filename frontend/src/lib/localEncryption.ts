/**
 * Chiffrement local léger — Étape D (sécurité locale).
 *
 * MENACE CIBLÉE, PRÉCISÉMENT : quelqu'un qui inspecte le contenu
 * d'IndexedDB (DevTools sur un poste partagé sans session active, ou
 * lecture directe des fichiers du profil navigateur) SANS avoir le JWT en
 * cours. Cette menace justifie le chiffrement.
 *
 * CE QUE ÇA NE PROTÈGE PAS, EXPLICITEMENT : du JavaScript malveillant
 * exécuté dans l'origine de l'application (il aurait accès au même
 * `localStorage['smartschool_token']` que ce module, donc à la même clé
 * dérivée — chiffrer les données ne change rien pour cette menace-là).
 * Ne pas présenter ce mécanisme comme réglant ce deuxième cas.
 *
 * Modèle de clé (décision actée avec l'utilisateur, §4 : ne jamais stocker
 * la clé à part des données chiffrées) : dérivée du JWT courant via HKDF,
 * jamais persistée nulle part — recalculée à la volée à chaque chiffrement/
 * déchiffrement depuis `localStorage['smartschool_token']` (déjà là,
 * déjà le fondement de l'authentification de toute l'app). Conséquence
 * volontaire et utile : si le token change (autre utilisateur, autre
 * session), déchiffrer d'anciennes données échoue proprement (l'AES-GCM
 * détecte l'échec d'authentification) — une couche de défense
 * supplémentaire en cas d'oubli de purge, pas le mécanisme principal
 * d'isolation (qui reste lib/sessionCleanup.ts).
 *
 * Périmètre : appliqué au miroir élèves du cache delta (Étape C,
 * hooks/useElevesDeltaCache.ts) — données personnelles (adresse, groupe
 * sanguin, date de naissance). PAS encore appliqué à offlineQueue.ts (la
 * file d'écriture notes/présences déjà en production) : retrofit
 * volontairement différé, risque de régression sur un mécanisme déjà
 * fiable et quotidiennement utilisé — à traiter dans une passe dédiée si
 * ce mécanisme est validé sur le pilote.
 */

export interface EncryptedPayload {
    iv: number[];
    data: number[];
}

function hasWebCrypto(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle;
}

function currentToken(): string | null {
    return typeof window !== 'undefined' ? localStorage.getItem('smartschool_token') : null;
}

async function deriveKey(token: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(token), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: enc.encode('smartschool-local-cache-v1'),
            info: enc.encode('idb-encryption'),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Chiffre `value`. Renvoie `null` si aucune session active (pas de token)
 * ou si Web Crypto est indisponible (contexte non sécurisé, vieux
 * navigateur) — l'appelant doit alors traiter le cas comme "ne pas mettre
 * en cache" plutôt que de stocker en clair par défaut.
 */
export async function encryptValue<T>(value: T): Promise<EncryptedPayload | null> {
    const token = currentToken();
    if (!token || !hasWebCrypto()) return null;

    const key = await deriveKey(token);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    return { iv: Array.from(iv), data: Array.from(new Uint8Array(ciphertext)) };
}

/**
 * Déchiffre `payload`. Renvoie `null` si absent, si aucune session active,
 * si Web Crypto est indisponible, OU si le déchiffrement échoue (mauvaise
 * clé — token différent de celui utilisé pour chiffrer). Jamais d'erreur
 * levée : un miroir local illisible doit être traité comme un cache vide
 * (force une resynchronisation complète), pas comme une panne applicative.
 */
export async function decryptValue<T>(payload: EncryptedPayload | null | undefined): Promise<T | null> {
    if (!payload) return null;
    const token = currentToken();
    if (!token || !hasWebCrypto()) return null;

    try {
        const key = await deriveKey(token);
        const iv = new Uint8Array(payload.iv);
        const data = new Uint8Array(payload.data);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return JSON.parse(new TextDecoder().decode(plaintext)) as T;
    } catch {
        return null;
    }
}
