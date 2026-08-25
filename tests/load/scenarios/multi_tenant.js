// ISOLATION MULTI-TENANT sous charge. Un admin de l'école A ne doit JAMAIS
// obtenir une ressource de l'école B. Toute fuite = ÉCHEC CRITIQUE (le check
// `isolation` casse le seuil à 100 %).
//
// Principe : A tente d'accéder à des ID appartenant à B → on EXIGE 403/404.
import { check, sleep } from 'k6';
import { get } from '../lib/http.js';
import { loginAuth } from '../lib/auth.js';
import { assertNotProd } from '../config/env.js';
import { ETABS } from '../lib/data.js';
import { isolationThresholds } from '../config/thresholds.js';

export const options = {
    scenarios: {
        isolation: { executor: 'constant-vus', vus: 10, duration: '1m' },
    },
    thresholds: isolationThresholds,
};

export function setup() {
    assertNotProd();
    if (ETABS.length < 2) {
        throw new Error('Le test d\'isolation exige au moins 2 établissements dans le dataset.');
    }
}

function refuse(res) {
    // On accepte 401/403/404 comme « accès correctement refusé ». 200 = FUITE.
    return res.status === 403 || res.status === 404 || res.status === 401;
}

export default function () {
    const a = ETABS[0];
    const b = ETABS[1];
    if (!a.admins || !a.admins.length) return;
    const tokenA = loginAuth(a.admins[0].identifiant, a.admins[0].mot_de_passe);
    if (!tokenA) return;

    // 1) A tente de lire un ÉLÈVE de B.
    if (b.eleve_ids && b.eleve_ids.length) {
        const eleveB = b.eleve_ids[Math.floor(Math.random() * b.eleve_ids.length)];
        const r1 = get(`/api/eleves/${eleveB}`, tokenA, 'light', 'iso_eleve_cross');
        check(r1, { 'isolation élève A→B refusée': (r) => refuse(r) }, { check: 'isolation' });
    }

    // 2) A tente de lire les notes centralisées d'une CLASSE de B.
    if (b.classe_ids && b.classe_ids.length) {
        const classeB = b.classe_ids[Math.floor(Math.random() * b.classe_ids.length)];
        const r2 = get(`/api/evaluations/classe/${classeB}/notes-centralisees?trimestre_id=${b.trimestre_id || 1}`, tokenA, 'light', 'iso_notes_cross');
        check(r2, { 'isolation notes A→B refusée': (r) => refuse(r) }, { check: 'isolation' });
    }

    sleep(1);
}
