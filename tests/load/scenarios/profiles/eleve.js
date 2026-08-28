// Profil ÉLÈVE : connexion (matricule) + dashboard + notes + emploi du temps +
// devoirs + bulletin.
import { sleep } from 'k6';
import { get, ok } from '../../lib/http.js';
import { loginEleve } from '../../lib/auth.js';
import { rand } from '../../lib/data.js';

export function runEleve(etab) {
    if (!etab || !etab.eleves || etab.eleves.length === 0) return;
    const acc = rand(etab.eleves);
    const token = loginEleve(acc.matricule, acc.mot_de_passe);
    if (!token || !acc.eleve_id) return;

    const id = acc.eleve_id;

    ok(get(`/api/portail-eleve/${id}/dashboard`, token, 'light', 'eleve_dashboard'), 'dashboard');
    sleep(1);
    ok(get(`/api/portail-eleve/${id}/notes`, token, 'light', 'eleve_notes'), 'notes');
    sleep(1);
    ok(get(`/api/portail-eleve/${id}/emploi-du-temps`, token, 'light', 'eleve_edt'), 'edt');
    sleep(1);
    ok(get(`/api/portail-eleve/${id}/bulletin`, token, 'heavy', 'eleve_bulletin'), 'bulletin');
    sleep(1);
}
