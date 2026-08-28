// STRESS : montée progressive par paliers jusqu'à voir le système se dégrader.
// Les paliers par défaut sont MODÉRÉS (pensés pour un local) ; on les pousse
// plus haut en staging via --env PALIER=... ou en éditant les stages.
import { assertNotProd } from '../config/env.js';
import { thresholds } from '../config/thresholds.js';
import { runOneSession } from '../lib/mix.js';

const MAX = parseInt(__ENV.MAX_VUS || '500', 10);

export const options = {
    scenarios: {
        stress: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: Math.round(MAX * 0.2) },
                { duration: '2m', target: Math.round(MAX * 0.2) },
                { duration: '1m', target: Math.round(MAX * 0.5) },
                { duration: '2m', target: Math.round(MAX * 0.5) },
                { duration: '1m', target: MAX },
                { duration: '2m', target: MAX },
                { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '30s',
        },
    },
    // En stress on veut voir la dégradation, pas faire échouer le run : les
    // seuils servent d'ALERTE, on ne coupe pas (abortOnFail=false par défaut).
    thresholds,
};

export function setup() { assertNotProd(); }
export default function () { runOneSession(); }
