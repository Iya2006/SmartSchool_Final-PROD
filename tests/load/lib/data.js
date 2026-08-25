// Charge le dataset synthétique généré par scripts/seed_load_data.py.
// SharedArray : le fichier n'est parsé qu'UNE fois et partagé entre tous les
// VUs (sinon 10 000 VUs chargeraient 10 000 copies en mémoire).
import { SharedArray } from 'k6/data';
import { DATA_FILE } from '../config/env.js';

// Structure attendue de accounts.json :
// { etablissements: [ {
//     code, admins:[{identifiant,mot_de_passe}], enseignants:[{identifiant,mot_de_passe}],
//     parents:[{telephone,mot_de_passe}], eleves:[{matricule,mot_de_passe}],
//     classe_ids:[int], eleve_ids:[int], enseignant_ids:[int], parent_ids:[int]
// } ] }
export const ETABS = new SharedArray('etablissements', function () {
    try {
        const raw = open(DATA_FILE);
        const parsed = JSON.parse(raw);
        return parsed.etablissements || [];
    } catch (e) {
        // Pas de dataset : les scénarios qui en dépendent le signaleront.
        return [];
    }
});

export function hasData() {
    return ETABS.length > 0;
}

// Choisit un établissement selon une répartition pondérée (multi-écoles) :
// A 20%, B 20%, C 15%, D 15%, E 10%, reste 20% (cf. §10 de la mission).
const WEIGHTS = [0.20, 0.20, 0.15, 0.15, 0.10];
export function pickEtab() {
    if (ETABS.length === 0) return null;
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < Math.min(WEIGHTS.length, ETABS.length); i++) {
        acc += WEIGHTS[i];
        if (r < acc) return ETABS[i];
    }
    // « reste » : un établissement au hasard au-delà des 5 premiers, sinon un des 5.
    const rest = ETABS.slice(5);
    const pool = rest.length ? rest : ETABS;
    return pool[Math.floor(Math.random() * pool.length)];
}

export function rand(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}
