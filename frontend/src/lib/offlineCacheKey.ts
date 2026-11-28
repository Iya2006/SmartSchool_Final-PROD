/**
 * Clé sous laquelle le Service Worker range une réponse API en cache.
 *
 * Deux règles, utilisées par src/app/sw.ts (plugin `cacheKeyWillBeUsed`) :
 *
 * 1. Les paramètres anti-cache (`_t=<horodatage>`) sont retirés : sans ça,
 *    chaque appel produit une URL inédite et rien n'est jamais retrouvé
 *    hors-ligne.
 * 2. La clé est cloisonnée par compte : le cache est indexé par URL seule,
 *    alors que la réponse dépend du jeton (rôle, école). Sur un poste partagé,
 *    un compte ne doit jamais se voir servir la réponse d'un autre. Le compte
 *    est lu dans le JWT envoyé avec la requête (lecture seule, aucune
 *    vérification de signature : c'est le serveur qui fait foi, ici on ne fait
 *    que trier). Un fragment `#` ne suffirait pas : l'API Cache l'ignore à la
 *    comparaison, d'où un paramètre de requête interne.
 */

export const PARAMETRES_IGNORES = ['_t'];
export const PARAM_CLOISON = '__ss_compte';
export const CLOISON_SANS_COMPTE = 'public';

function decoderBase64Url(segment: string): string {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const complet = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binaire = atob(complet);
    const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(octets);
}

/**
 * `type:sub:etablissement` lu dans le jeton, ou `null` si l'en-tête est absent
 * ou illisible. `type` est indispensable : un utilisateur, un enseignant, un
 * parent et un élève peuvent porter le même `sub`. L'établissement l'est
 * aussi : un super-admin garde son `sub` en passant d'une école à l'autre.
 */
export function compteDuJeton(authorization: string | null | undefined): string | null {
    if (!authorization) return null;
    const jeton = authorization.replace(/^Bearer\s+/i, '').trim();
    const morceaux = jeton.split('.');
    if (morceaux.length !== 3) return null;
    try {
        const charge = JSON.parse(decoderBase64Url(morceaux[1]));
        if (charge?.sub === undefined || charge?.sub === null) return null;
        const type = charge.type ?? 'inconnu';
        const etablissement = charge.etablissement_id ?? '-';
        return `${type}:${charge.sub}:${etablissement}`;
    } catch {
        return null;
    }
}

export function cleDeCacheApi(url: string, authorization: string | null | undefined): string {
    const u = new URL(url);
    for (const p of PARAMETRES_IGNORES) u.searchParams.delete(p);
    u.searchParams.set(PARAM_CLOISON, compteDuJeton(authorization) ?? CLOISON_SANS_COMPTE);
    u.hash = '';
    return u.toString();
}

/** Toute requête vers l'API, quelle que soit son origine : le frontend et
 * l'API vivent sur deux domaines différents en production. */
export function estRequeteApi(url: URL): boolean {
    return url.pathname.startsWith('/api/');
}
