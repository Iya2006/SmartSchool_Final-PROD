// Connexions aux 4 portails. Le login enseignant passe par /api/auth/login
// (JWT unifié), comme l'admin. Parent = téléphone, Élève = matricule.
//
// Cache par identifiant dans le VU : on ne se relogue pas à chaque itération
// (sinon on teste surtout le login, et on se fait rate-limiter). Le scénario
// auth.js, lui, force un vrai login à chaque fois pour mesurer l'auth.
import { post, ok } from './http.js';

const cache = {}; // { cle: token } — local au VU (module rechargé par VU)

function extractToken(res) {
    try {
        const b = res.json();
        return b.token || b.access_token || null;
    } catch (e) {
        return null;
    }
}

// --- Login « unifié » (admin + enseignant) : identifiant + mot_de_passe ---
export function loginAuth(identifiant, mot_de_passe, force = false) {
    const cle = `auth:${identifiant}`;
    if (!force && cache[cle]) return cache[cle];
    const res = post('/api/auth/login', { identifiant, mot_de_passe }, null, 'auth', 'login_auth');
    ok(res, 'login (auth)');
    const t = extractToken(res);
    if (t) cache[cle] = t;
    return t;
}

export function loginParent(telephone, mot_de_passe, force = false) {
    const cle = `parent:${telephone}`;
    if (!force && cache[cle]) return cache[cle];
    const res = post('/api/portail-parent/login', { telephone, mot_de_passe }, null, 'auth', 'login_parent');
    ok(res, 'login (parent)');
    const t = extractToken(res);
    if (t) cache[cle] = t;
    return t;
}

export function loginEleve(matricule, mot_de_passe, force = false) {
    const cle = `eleve:${matricule}`;
    if (!force && cache[cle]) return cache[cle];
    const res = post('/api/portail-eleve/login', { matricule, mot_de_passe }, null, 'auth', 'login_eleve');
    ok(res, 'login (élève)');
    const t = extractToken(res);
    if (t) cache[cle] = t;
    return t;
}
