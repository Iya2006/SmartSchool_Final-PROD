// AUTH STORM : connexions concurrentes réalistes sur les 4 portails, en
// arrival-rate (débit de logins/s). On FORCE un vrai login à chaque itération
// (force=true) — on mesure la génération de JWT + le hachage de mot de passe.
//
// ⚠️ Le login est rate-limité (~5/min/IP) : à faire tourner avec
// RATELIMIT_ENABLED=0 sur la cible, sinon on ne mesure que des 429.
import { check } from 'k6';
import { assertNotProd, RATE } from '../config/env.js';
import { ETABS, pickEtab, hasData, rand } from '../lib/data.js';
import { loginAuth, loginParent, loginEleve } from '../lib/auth.js';

export const options = {
    scenarios: {
        auth: {
            executor: 'constant-arrival-rate',
            rate: RATE,             // logins/s (défaut 50 ; monter par paliers)
            timeUnit: '1s',
            duration: __ENV.DURATION || '1m',
            preAllocatedVUs: parseInt(__ENV.PRE_VUS || '100', 10),
            maxVUs: parseInt(__ENV.MAX_VUS || '2000', 10),
        },
    },
    thresholds: {
        'http_req_duration{kind:auth}': ['p(95)<2000', 'p(99)<5000'],
        checks: ['rate>0.99'],
    },
};

export function setup() { assertNotProd(); }

export default function () {
    if (!hasData()) return;
    const etab = pickEtab();
    const r = Math.random();
    let token = null;
    if (r < 0.4 && etab.parents && etab.parents.length) {
        const p = rand(etab.parents); token = loginParent(p.telephone, p.mot_de_passe, true);
    } else if (r < 0.8 && etab.eleves && etab.eleves.length) {
        const e = rand(etab.eleves); token = loginEleve(e.matricule, e.mot_de_passe, true);
    } else if (etab.enseignants && etab.enseignants.length) {
        const en = rand(etab.enseignants); token = loginAuth(en.identifiant, en.mot_de_passe, true);
    } else if (etab.admins && etab.admins.length) {
        const ad = rand(etab.admins); token = loginAuth(ad.identifiant, ad.mot_de_passe, true);
    }
    check(token, { 'JWT obtenu': (t) => !!t });
}
