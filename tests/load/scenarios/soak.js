// SOAK : charge modérée SOUTENUE (long). Objectif = détecter fuites mémoire,
// accumulation Redis/RQ, connexions Postgres non libérées, dégradation lente.
// Durée par défaut 30 min (à monter à plusieurs heures en staging).
import { assertNotProd, VUS } from '../config/env.js';
import { thresholds } from '../config/thresholds.js';
import { runOneSession } from '../lib/mix.js';

const SOAK_DURATION = __ENV.SOAK_DURATION || '30m';

export const options = {
    scenarios: {
        soak: {
            executor: 'constant-vus',
            vus: VUS,            // charge modérée et stable
            duration: SOAK_DURATION,
        },
    },
    thresholds,
};

export function setup() { assertNotProd(); }
export default function () { runOneSession(); }
