// LOAD : charge « normale » estimée, en VUs constants. VUS/DURATION
// paramétrables — c'est ce scénario qu'on rejoue aux paliers 100/500/1000…
// Montée + palier + descente pour un profil réaliste.
import { assertNotProd, VUS, DURATION } from '../config/env.js';
import { thresholds } from '../config/thresholds.js';
import { runOneSession } from '../lib/mix.js';

export const options = {
    scenarios: {
        load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: VUS },   // montée
                { duration: DURATION, target: VUS }, // palier (stabilisation)
                { duration: '30s', target: 0 },      // descente
            ],
            gracefulRampDown: '20s',
        },
    },
    thresholds,
};

export function setup() { assertNotProd(); }
export default function () { runOneSession(); }
