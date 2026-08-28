// SMOKE : charge minimale. Objectif = vérifier que les scripts, l'auth et les
// endpoints répondent. Ne mesure PAS la capacité.
import { assertNotProd } from '../config/env.js';
import { thresholds } from '../config/thresholds.js';
import { runOneSession } from '../lib/mix.js';

export const options = {
    scenarios: {
        smoke: { executor: 'constant-vus', vus: 2, duration: '30s' },
    },
    thresholds,
};

export function setup() { assertNotProd(); }
export default function () { runOneSession(); }
