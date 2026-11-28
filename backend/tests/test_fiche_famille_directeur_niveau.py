"""
La fiche d'une famille, pour le directeur de niveau (décision du fondateur,
22/11/2026).

Il a l'écran Familles, mais le serveur lui refusait la fiche d'un parent (403) :
elle restait vide, et « Modifier » échouait sans rien dire. Il la lit et la
corrige désormais comme la direction. Le reste du portail parent (paiements,
notes, messages du parent) lui reste fermé : la caisse ne se délègue pas.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import Eleve, EleveParent, Enseignant, Parent
from tests.test_acces_dashboard_et_personnel_direction import _compte, _ecole, _headers, _uid


def _eleve(db: Session, etablissement_id: int, prenom: str = "Aminata") -> Eleve:
    uid = _uid()
    e = Eleve(etablissement_id=etablissement_id, matricule=f"FDN-{uid}", nom="Barry", prenom=prenom,
              date_naissance=date(2014, 3, 1), sexe="F", statut="ACTIF")
    db.add(e); db.commit(); db.refresh(e)
    return e


def _parent(db: Session, etablissement_id: int, telephone: str = None) -> Parent:
    uid = _uid()
    p = Parent(etablissement_id=etablissement_id, nom="Barry", prenom=f"Mamadou{uid}",
               telephone_1=telephone or f"62400{uid:04d}", statut="ACTIF")
    db.add(p); db.commit(); db.refresh(p)
    return p


def _lier(db: Session, parent: Parent, eleve: Eleve) -> None:
    db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="PERE"))
    db.commit()


def _famille(db: Session, etablissement_id: int):
    eleve, parent = _eleve(db, etablissement_id), _parent(db, etablissement_id)
    _lier(db, parent, eleve)
    return parent, eleve


def test_le_directeur_de_niveau_lit_et_corrige_la_fiche(client: TestClient, db: Session):
    etab, _ = _ecole(db)
    entetes = _headers(client, _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU").nom_utilisateur)
    parent, eleve = _famille(db, etab.etablissement_id)

    fiche = client.get(f"/api/portail-parent/{parent.parent_id}/profil", headers=entetes)
    assert fiche.status_code == 200, fiche.text
    assert fiche.json()["nb_enfants"] == 1
    assert fiche.json()["enfants"][0]["eleve_id"] == eleve.eleve_id

    # Le formulaire renvoie tous les champs, vides compris.
    rep = client.put(f"/api/portail-parent/{parent.parent_id}/profil", headers=entetes, json={
        "nom": "Barry", "prenom": "Mamadou", "telephone_1": parent.telephone_1, "telephone_2": "",
        "email": "", "profession": " Commerçant ", "adresse": "", "mot_de_passe": "",
    })
    assert rep.status_code == 200, rep.text
    db.expire_all()
    corrige = db.get(Parent, parent.parent_id)
    assert (corrige.prenom, corrige.profession) == ("Mamadou", "Commerçant")
    # Vide = non renseigné, jamais une chaîne vide (unicité des e-mails).
    assert (corrige.telephone_2, corrige.email, corrige.adresse) == (None, None, None)


def test_une_famille_d_une_autre_ecole_reste_introuvable(client: TestClient, db: Session):
    etab_a, _ = _ecole(db)
    etab_b, _ = _ecole(db)
    entetes = _headers(client, _compte(db, etab_a.etablissement_id, "DIRECTEUR_NIVEAU").nom_utilisateur)
    parent_b, _ = _famille(db, etab_b.etablissement_id)

    assert client.get(f"/api/portail-parent/{parent_b.parent_id}/profil", headers=entetes).status_code == 404
    rep = client.put(f"/api/portail-parent/{parent_b.parent_id}/profil", headers=entetes, json={"nom": "Pirate"})
    assert rep.status_code == 404
    db.expire_all()
    assert db.get(Parent, parent_b.parent_id).nom == "Barry"


def test_le_reste_du_portail_parent_lui_reste_ferme(client: TestClient, db: Session):
    etab, _ = _ecole(db)
    entetes = _headers(client, _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU").nom_utilisateur)
    parent, _ = _famille(db, etab.etablissement_id)

    # Tableau de bord du parent : ses factures et paiements.
    assert client.get(f"/api/portail-parent/{parent.parent_id}/dashboard", headers=entetes).status_code == 403
    assert client.get(f"/api/portail-parent/{parent.parent_id}/messages", headers=entetes).status_code == 403


def test_les_roles_sans_l_ecran_familles_n_ont_pas_la_fiche(client: TestClient, db: Session):
    etab, _ = _ecole(db)
    parent, _ = _famille(db, etab.etablissement_id)
    for role in ("COMPTABLE", "SURVEILLANT", "BIBLIOTHECAIRE"):
        entetes = _headers(client, _compte(db, etab.etablissement_id, role).nom_utilisateur)
        assert client.get(f"/api/portail-parent/{parent.parent_id}/profil", headers=entetes).status_code == 403, role


def test_la_fiche_ne_montre_que_les_enfants_de_l_ecole(client: TestClient, db: Session):
    """Comme l'annuaire (Cas B) : un lien ancien vers un enfant d'une autre
    école ne doit jamais l'exposer ici."""
    etab_a, _ = _ecole(db)
    etab_b, _ = _ecole(db)
    entetes = _headers(client, _compte(db, etab_a.etablissement_id, "ADMIN").nom_utilisateur)
    parent, enfant_a = _famille(db, etab_a.etablissement_id)
    _lier(db, parent, _eleve(db, etab_b.etablissement_id, prenom="Ailleurs"))

    fiche = client.get(f"/api/portail-parent/{parent.parent_id}/profil", headers=entetes)
    assert fiche.status_code == 200, fiche.text
    assert [e["eleve_id"] for e in fiche.json()["enfants"]] == [enfant_a.eleve_id]
    assert fiche.json()["nb_enfants"] == 1


def test_les_identifiants_de_connexion_restent_uniques(client: TestClient, db: Session):
    etab, _ = _ecole(db)
    entetes = _headers(client, _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU").nom_utilisateur)
    premier, _ = _famille(db, etab.etablissement_id)
    second, _ = _famille(db, etab.etablissement_id)

    # Le téléphone d'un autre parent de l'école : 409, rien n'est écrit.
    rep = client.put(f"/api/portail-parent/{second.parent_id}/profil", headers=entetes,
                     json={"telephone_1": premier.telephone_1, "prenom": "Changé"})
    assert rep.status_code == 409, rep.text
    db.expire_all()
    assert db.get(Parent, second.parent_id).prenom != "Changé"

    # Nom vide : 400.
    rep = client.put(f"/api/portail-parent/{second.parent_id}/profil", headers=entetes, json={"nom": "  "})
    assert rep.status_code == 400, rep.text


def test_une_fiche_ancienne_se_corrige_malgre_un_doublon_existant(client: TestClient, db: Session):
    """Un enseignant porte déjà le téléphone de ce parent (donnée d'avant le
    contrôle). Corriger le nom du parent, sans toucher au téléphone, ne doit
    pas être bloqué par ce doublon : seule une valeur NOUVELLE est vérifiée."""
    etab, _ = _ecole(db)
    entetes = _headers(client, _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU").nom_utilisateur)
    parent, _ = _famille(db, etab.etablissement_id)
    db.add(Enseignant(etablissement_id=etab.etablissement_id, matricule=f"FDN-ENS-{_uid()}", nom="Barry",
                      prenom="Ousmane", sexe="M", telephone=parent.telephone_1,
                      mot_de_passe=hash_password("motdepasse123"), statut="ACTIF"))
    db.commit()

    rep = client.put(f"/api/portail-parent/{parent.parent_id}/profil", headers=entetes,
                     json={"nom": "Barry-Diallo", "telephone_1": parent.telephone_1})
    assert rep.status_code == 200, rep.text
    db.expire_all()
    assert db.get(Parent, parent.parent_id).nom == "Barry-Diallo"
