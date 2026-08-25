// Profil ADMIN : connexion + tournée back-office (dashboard, élèves,
// enseignants, classes, stats d'évaluation) + une lecture lourde occasionnelle
// (notes centralisées d'une classe). Reproduit un directeur qui « fait le tour ».
import { sleep } from 'k6';
import { get, ok } from '../../lib/http.js';
import { loginAuth } from '../../lib/auth.js';
import { rand } from '../../lib/data.js';

export function runAdmin(etab) {
    if (!etab || !etab.admins || etab.admins.length === 0) return;
    const acc = rand(etab.admins);
    const token = loginAuth(acc.identifiant, acc.mot_de_passe);
    if (!token) return;

    const e = etab.etablissement_id;
    const a = etab.annee_id;

    ok(get(`/api/dashboard?etablissement_id=${e}&annee_id=${a}`, token, 'light', 'admin_dashboard'), 'dashboard');
    sleep(1);
    ok(get(`/api/eleves?etablissement_id=${e}&annee_id=${a}&statut=ACTIF&limit=50`, token, 'light', 'admin_eleves'), 'eleves');
    sleep(1);
    ok(get(`/api/enseignants?limit=50`, token, 'light', 'admin_enseignants'), 'enseignants');
    sleep(1);
    ok(get(`/api/classes?etablissement_id=${e}&annee_id=${a}&limit=100`, token, 'light', 'admin_classes'), 'classes');
    sleep(1);
    ok(get(`/api/evaluations/centralisation/stats`, token, 'light', 'admin_stats_eval'), 'stats-eval');
    sleep(1);

    // Lecture LOURDE occasionnelle : le tableau élèves × matières d'une classe.
    if (etab.classe_ids && etab.classe_ids.length && Math.random() < 0.3) {
        const c = rand(etab.classe_ids);
        // trimestre_id inconnu côté k6 : on tente 1 ; en staging on peut fournir
        // un trimestre valide via le dataset. Un 404 « période » reste mesurable.
        ok(get(`/api/evaluations/classe/${c}/notes-centralisees?trimestre_id=${etab.trimestre_id || 1}`, token, 'heavy', 'admin_notes_centralisees'), 'notes-centralisees');
        sleep(1);
    }
}
