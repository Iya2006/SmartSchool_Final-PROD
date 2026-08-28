// SYNC STORM : des milliers d'enseignants reviennent en ligne EN MÊME TEMPS et
// rejouent leurs saisies hors-ligne (notes + présences). Mesure la capacité du
// backend à absorber les synchronisations simultanées.
//
// Endpoints réels : POST /api/sync/{enseignant_id}/notes et /presences.
// Auth : token enseignant. Un note_id inconnu renvoie « INTROUVABLE » (200) —
// le chemin, l'auth et l'écriture sont tout de même exercés ; fournir de vrais
// note_ids via le dataset pour un test fidèle.
import { check, sleep } from 'k6';
import { post } from '../lib/http.js';
import { loginAuth } from '../lib/auth.js';
import { assertNotProd, RATE } from '../config/env.js';
import { pickEtab, hasData, rand } from '../lib/data.js';

export const options = {
    scenarios: {
        // Pic brutal de synchronisations : arrival-rate qui grimpe puis tient.
        sync_storm: {
            executor: 'ramping-arrival-rate',
            startRate: Math.max(1, Math.round(RATE * 0.1)),
            timeUnit: '1s',
            preAllocatedVUs: parseInt(__ENV.PRE_VUS || '100', 10),
            maxVUs: parseInt(__ENV.MAX_VUS || '3000', 10),
            stages: [
                { duration: '20s', target: Math.round(RATE * 0.5) },
                { duration: '10s', target: RATE },   // tout le monde revient en ligne
                { duration: '1m', target: RATE },     // tenue
                { duration: '20s', target: 0 },
            ],
        },
    },
    thresholds: {
        'http_req_duration{kind:write}': ['p(95)<3000', 'p(99)<8000'],
        http_req_failed: ['rate<0.05'],
    },
};

export function setup() { assertNotProd(); }

export default function () {
    if (!hasData()) return;
    const etab = pickEtab();
    if (!etab.enseignants || !etab.enseignants.length) return;
    const acc = rand(etab.enseignants);
    const token = loginAuth(acc.identifiant, acc.mot_de_passe);
    if (!token || !acc.enseignant_id) return;

    // Batch de notes à rejouer (vrais note_ids si le dataset les fournit).
    const noteIds = acc.note_ids && acc.note_ids.length ? acc.note_ids.slice(0, 20) : [1, 2, 3];
    const items = noteIds.map((id) => ({ note_id: id, valeur: 12, est_absent: false }));
    const r = post(`/api/sync/${acc.enseignant_id}/notes`, { items }, token, 'write', 'sync_notes');
    check(r, { 'sync notes répond': (x) => x.status === 200 || x.status === 207 });

    sleep(0.5);
}
