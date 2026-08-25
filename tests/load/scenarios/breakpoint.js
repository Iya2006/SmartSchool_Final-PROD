// BREAKPOINT : on augmente le DÉBIT (arrival-rate) jusqu'à la rupture, puis on
// coupe automatiquement quand les seuils cassent (abortOnFail). C'est le
// scénario qui répond à « à partir de quelle charge ça casse ? ».
//
// On raisonne en REQUÊTES/S (arrival-rate), pas en VUs : c'est la vraie mesure
// de capacité de l'API (cf. §14 de la mission). k6 alloue les VUs nécessaires.
import { assertNotProd } from '../config/env.js';
import { runOneSession } from '../lib/mix.js';

const START_RATE = parseInt(__ENV.START_RATE || '10', 10);   // req/s au départ
const MAX_RATE = parseInt(__ENV.MAX_RATE || '500', 10);      // req/s cible max
const STEP_TIME = __ENV.STEP_TIME || '30s';
const PRE_VUS = parseInt(__ENV.PRE_VUS || '50', 10);
const MAX_VUS = parseInt(__ENV.MAX_VUS || '2000', 10);

export const options = {
    scenarios: {
        breakpoint: {
            executor: 'ramping-arrival-rate',
            startRate: START_RATE,
            timeUnit: '1s',
            preAllocatedVUs: PRE_VUS,
            maxVUs: MAX_VUS,
            stages: [
                { duration: STEP_TIME, target: Math.round(MAX_RATE * 0.1) },
                { duration: STEP_TIME, target: Math.round(MAX_RATE * 0.25) },
                { duration: STEP_TIME, target: Math.round(MAX_RATE * 0.5) },
                { duration: STEP_TIME, target: Math.round(MAX_RATE * 0.75) },
                { duration: STEP_TIME, target: MAX_RATE },
            ],
        },
    },
    // On COUPE dès que ça casse : c'est là qu'est le point de rupture.
    thresholds: {
        http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
        http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '10s' }],
    },
};

export function setup() { assertNotProd(); }
export default function () { runOneSession(); }
