// Wrappers HTTP : préfixent BASE_URL, taguent la requête (kind: light|write|
// heavy|auth) pour appliquer des seuils différenciés, et posent le JWT.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from '../config/env.js';

function url(path) {
    return path.startsWith('http') ? path : `${BASE_URL}${path}`;
}

function authHeaders(token, extra) {
    const h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return Object.assign(h, extra || {});
}

// kind ∈ {light, write, heavy, auth} — sert aux thresholds.
export function get(path, token, kind = 'light', name = undefined) {
    return http.get(url(path), {
        headers: authHeaders(token),
        tags: { kind, name: name || path },
    });
}

export function post(path, body, token, kind = 'write', name = undefined) {
    return http.post(url(path), JSON.stringify(body || {}), {
        headers: authHeaders(token),
        tags: { kind, name: name || path },
    });
}

export function put(path, body, token, kind = 'write', name = undefined) {
    return http.put(url(path), JSON.stringify(body || {}), {
        headers: authHeaders(token),
        tags: { kind, name: name || path },
    });
}

export function del(path, token, kind = 'write', name = undefined) {
    return http.del(url(path), null, {
        headers: authHeaders(token),
        tags: { kind, name: name || path },
    });
}

// Check standard : 2xx. Renvoie true/false pour piloter la suite du scénario.
export function ok(res, label) {
    return check(res, {
        [`${label} → 2xx`]: (r) => r.status >= 200 && r.status < 300,
    });
}
