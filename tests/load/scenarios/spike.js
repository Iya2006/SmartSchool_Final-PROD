// SPIKE : hausse BRUTALE puis retour. Mesure la résilience à un pic (rentrée,
// publication des bulletins…). Amplitude paramétrable (défaut modéré pour local).
import { assertNotProd } from '../config/env.js';
import { thresholds } from '../config/thresholds.js';
import { runOneSession } from '../lib/mix.js';

const BAS = parseInt(__ENV.BASE_VUS || '50', 10);
const PIC = parseInt(__ENV.PEAK_VUS || '1000', 10);

export const options = {
    scenarios: {
        spike: {
            executor: 'ramping-vus',
            startVUs: BAS,
            stages: [
                { duration: '1m', target: BAS },   // régime normal
                { duration: '15s', target: PIC },  // PIC brutal
                { duration: '1m', target: PIC },   // tenue du pic
                { duration: '15s', target: BAS },  // retour
                { duration: '1m', target: BAS },   // récupération
                { duration: '15s', target: 0 },
            ],
            gracefulRampDown: '20s',
        },
    },
    thresholds,
};

export function setup() { assertNotProd(); }
export default function () { runOneSession(); }
