"""
La fiche d'une famille, les messages aux familles et la relance des impayés
SUR UN POSTE INSTALLÉ (instantané de l'école, identifiants du poste) : les
mêmes résultats que sur la base de l'application — même parent relancé, même
texte, même conversation.

La suite de tests tourne sur SQLite. Le comportement sur PostgreSQL a été
vérifié sur la copie de la base (parcours à l'écran, mesure de la relance) :
voir .ai/CORRECTIFS_28_11_2026_RAPPORT.md.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.api.communication import list_messages_parents
from app.api.finance import notifier_impayes
from app.api.portail_parent import UpdateParentRequest, get_profil_parent, update_profil_parent
from app.models.academique import Message, Parent
from tests.test_messages_aux_familles_comptable import Ecole
from tests.test_sync_identifiants import _poste_installe


def _relance(db: Session, ecole: Ecole):
    resultat = notifier_impayes(annee_id=ecole.annee.annee_id, classe_id=None, db=db, etablissement_id=ecole.id)
    envoyes = sorted((m.destinataire_id, m.sujet, m.contenu)
                     for m in db.query(Message).filter(Message.etablissement_id == ecole.id))
    return resultat, envoyes


def _fil(db: Session, ecole: Ecole, parent_id: int) -> list:
    return [m["sujet"] for m in list_messages_parents(
        objet_type="PAIEMENT", parent_id=parent_id, limit=200, db=db,
        current_user={"role": "COMPTABLE", "type": "admin"}, etablissement_id=ecole.id)]


def test_le_poste_relance_et_affiche_comme_le_cloud(db: Session):
    ecole = Ecole(db)
    eleve = ecole.eleve(prenom="Néné")
    ecole.parent(eleve, prenom="Ousmane", lien_parente="PERE")  # rattaché en premier
    mere = ecole.parent(eleve, prenom="Aïssatou", est_contact_principal="O")
    ecole.facture(eleve, 75000, echeance=date(2027, 1, 10))
    ecole.facture(ecole.eleve(prenom="Seul"), 5000)
    personnel = {"type": "admin", "etablissement_id": ecole.id}

    poste = _poste_installe(db, ecole, 1)
    try:
        with Session(poste) as s:
            sur_le_poste = _relance(s, ecole)
            fil_du_poste = _fil(s, ecole, mere.parent_id)
            fiche = get_profil_parent(parent_id=mere.parent_id, _auth=personnel, db=s)
            update_profil_parent(parent_id=mere.parent_id, db=s, _auth=personnel,
                                 data=UpdateParentRequest(profession=" Couturière ", email=""))
            corrigee = s.get(Parent, mere.parent_id)
            assert (corrigee.profession, corrigee.email) == ("Couturière", None)
        sur_le_cloud = _relance(db, ecole)
        fil_du_cloud = _fil(db, ecole, mere.parent_id)
    finally:
        poste.dispose()

    assert sur_le_poste[0] == sur_le_cloud[0]
    assert (sur_le_cloud[0]["nb_notifies"], sur_le_cloud[0]["nb_sans_parent"]) == (1, 1)
    # Même destinataire (le contact principal, pas le premier rattaché), même texte.
    assert sur_le_poste[1] == sur_le_cloud[1]
    assert [destinataire for destinataire, _, _ in sur_le_cloud[1]] == [mere.parent_id]
    assert "75 000 GNF" in sur_le_cloud[1][0][2] and "10/01/2027" in sur_le_cloud[1][0][2]
    assert fil_du_poste == fil_du_cloud == ["Rappel de paiement — Néné Sow"]
    assert [e["prenom"] for e in fiche["enfants"]] == ["Néné"]
