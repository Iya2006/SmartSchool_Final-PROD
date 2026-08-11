/**
 * Awareness d'expiration de session hors-ligne — Étape D (§6/§7).
 *
 * §11 du cahier des charges : authentification ≠ autorisation. Ce module
 * ne vérifie RIEN cryptographiquement (il ne connaît pas la clé secrète du
 * serveur) — il lit juste le `exp` du JWT pour donner un SIGNAL à
 * l'utilisateur ("ta session a probablement expiré, reconnecte-toi dès que
 * possible"). Le serveur reste l'unique autorité réelle : toute requête
 * avec un token expiré échoue en 401 dès le retour réseau (déjà géré,
 * lib/api.ts). Ce module ne bloque JAMAIS une écriture offline lui-même —
 * bloquer capturerait moins de données que de laisser la file offline
 * absorber la saisie (elle sera de toute façon validée par le serveur à la
 * synchronisation, refusée proprement si le token est réellement expiré).
 *
 * Durée retenue : celle du JWT lui-même (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`,
 * 480 min en prod — voir backend/.env / docker-compose.prod.yml), PAS une
 * nouvelle durée inventée. Le serveur a déjà défini cette limite ; en
 * choisir une différente côté client ferait du client une autorité
 * concurrente, contraire à "le serveur doit rester l'autorité" (§6).
 */

interface DecodedJwtPayload {
    exp?: number; // secondes Unix, comme tout JWT standard
    [key: string]: unknown;
}

/** Décode la partie payload d'un JWT SANS vérifier la signature — lecture
 * seule, jamais utilisé pour une décision de sécurité réelle. Renvoie
 * `null` si le token est malformé (jamais d'exception). */
function decodePayload(token: string): DecodedJwtPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const json = typeof window !== 'undefined' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
        return JSON.parse(json) as DecodedJwtPayload;
    } catch {
        return null;
    }
}

/** Timestamp d'expiration (ms epoch), ou `null` si indéterminable. */
export function getTokenExpiryMs(token: string | null | undefined): number | null {
    if (!token) return null;
    const payload = decodePayload(token);
    if (!payload?.exp) return null;
    return payload.exp * 1000;
}

/** true si le token semble expiré d'après son propre `exp` — un signal
 * client, pas une vérification. */
export function isTokenLikelyExpired(token: string | null | undefined): boolean {
    const expiryMs = getTokenExpiryMs(token);
    if (expiryMs === null) return false; // indéterminable -> ne pas alarmer à tort
    return Date.now() >= expiryMs;
}

/** Minutes restantes avant expiration probable (négatif si déjà expiré),
 * ou `null` si indéterminable. */
export function minutesUntilExpiry(token: string | null | undefined): number | null {
    const expiryMs = getTokenExpiryMs(token);
    if (expiryMs === null) return null;
    return Math.round((expiryMs - Date.now()) / 60000);
}
