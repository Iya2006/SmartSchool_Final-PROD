// Profil ENSEIGNANT : connexion (via /api/auth/login, JWT unifié) + séances du
// jour + référentiels + emploi du temps + une SAISIE de notes occasionnelle.
import { sleep } from 'k6';
import { get, post, ok } from '../../lib/http.js';
import { loginAuth } from '../../lib/auth.js';
import { rand } from '../../lib/data.js';

export function runEnseignant(etab) {
    if (!etab || !etab.enseignants || etab.enseignants.length === 0) return;
    const acc = rand(etab.enseignants);
    const token = loginAuth(acc.identifiant, acc.mot_de_passe);
    if (!token || !acc.enseignant_id) return;

    const id = acc.enseignant_id;

    ok(get(`/api/portail-enseignant/${id}/seances/jour`, token, 'light', 'ens_seances_jour'), 'seances-jour');
    sleep(1);
    ok(get(`/api/portail-enseignant/referentiels/trimestres`, token, 'light', 'ens_trimestres'), 'trimestres');
    sleep(1);
    ok(get(`/api/portail-enseignant/${id}/evaluations`, token, 'light', 'ens_evaluations'), 'evaluations');
    sleep(1);

    // Consultation des élèves d'une de ses classes.
    if (acc.classe_id) {
        ok(get(`/api/portail-enseignant/${id}/classe/${acc.classe_id}/eleves`, token, 'light', 'ens_eleves_classe'), 'eleves-classe');
        sleep(1);
    }

    // ÉCRITURE occasionnelle : faire l'appel d'une séance en cours (si fournie
    // par le dataset). Laissé prudent : uniquement en staging/local, données
    // synthétiques. On ne force pas si la séance n'est pas connue.
    if (acc.seance_id && acc.roster_inscriptions && Math.random() < 0.2) {
        const items = acc.roster_inscriptions.map((i) => ({ inscription_id: i, statut: 'PRESENT' }));
        ok(post(`/api/portail-enseignant/${id}/seances/${acc.seance_id}/appel`, { items }, token, 'write', 'ens_appel'), 'appel');
        sleep(1);
    }
}
