// Profil PARENT : connexion (téléphone) + consultation d'un enfant (notes,
// présences, bulletin, paiements) + notifications.
import { sleep } from 'k6';
import { get, ok } from '../../lib/http.js';
import { loginParent } from '../../lib/auth.js';
import { rand } from '../../lib/data.js';

export function runParent(etab) {
    if (!etab || !etab.parents || etab.parents.length === 0) return;
    const acc = rand(etab.parents);
    const token = loginParent(acc.telephone, acc.mot_de_passe);
    if (!token || !acc.parent_id) return;

    const pid = acc.parent_id;

    // Le tableau de bord parent liste ses enfants.
    ok(get(`/api/portail-parent/${pid}/dashboard`, token, 'light', 'parent_dashboard'), 'dashboard');
    sleep(1);

    const enfant = acc.enfant_ids && acc.enfant_ids.length ? rand(acc.enfant_ids) : null;
    if (enfant) {
        ok(get(`/api/portail-parent/${pid}/enfant/${enfant}/notes`, token, 'light', 'parent_notes'), 'notes');
        sleep(1);
        ok(get(`/api/portail-parent/${pid}/enfant/${enfant}/emploi-du-temps`, token, 'light', 'parent_edt'), 'edt');
        sleep(1);
        ok(get(`/api/portail-parent/${pid}/enfant/${enfant}/bulletin`, token, 'heavy', 'parent_bulletin'), 'bulletin');
        sleep(1);
        ok(get(`/api/portail-parent/${pid}/enfant/${enfant}/absences`, token, 'light', 'parent_absences'), 'absences');
        sleep(1);
    }
    ok(get(`/api/portail-parent/${pid}/fournitures`, token, 'light', 'parent_fournitures'), 'fournitures');
    sleep(1);
}
