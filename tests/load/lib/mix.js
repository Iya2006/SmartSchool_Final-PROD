// Mélange de trafic réaliste : beaucoup de parents/élèves, quelques
// enseignants, peu d'admins. Chaque itération = une « session » d'un rôle
// contre un établissement choisi selon la pondération multi-écoles.
import { pickEtab, hasData } from './data.js';
import { runAdmin } from '../scenarios/profiles/admin.js';
import { runEnseignant } from '../scenarios/profiles/enseignant.js';
import { runParent } from '../scenarios/profiles/parent.js';
import { runEleve } from '../scenarios/profiles/eleve.js';

// Poids des rôles (somme = 1).
const ROLES = [
    { run: runParent, w: 0.40 },
    { run: runEleve, w: 0.40 },
    { run: runEnseignant, w: 0.15 },
    { run: runAdmin, w: 0.05 },
];

export function runOneSession() {
    if (!hasData()) {
        throw new Error('Dataset vide : lance d\'abord scripts/seed_load_data.py (voir README).');
    }
    const etab = pickEtab();
    const r = Math.random();
    let acc = 0;
    for (const role of ROLES) {
        acc += role.w;
        if (r < acc) { role.run(etab); return; }
    }
    ROLES[0].run(etab);
}
