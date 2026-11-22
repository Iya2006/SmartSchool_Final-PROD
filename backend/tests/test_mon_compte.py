"""
« Mon compte » : chacun lit sa fiche, corrige ses coordonnées et change son
mot de passe, quel que soit son rôle.

Le directeur de niveau est exclu de la GESTION du personnel (voulu, main.py) :
cette exclusion lui fermait aussi son propre profil, et il ne pouvait même pas
changer son mot de passe. La gestion lui reste fermée.
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import Utilisateur
from tests.test_acces_dashboard_et_personnel_direction import _compte, _ecole, _headers


def test_le_directeur_de_niveau_gere_son_propre_compte(client: TestClient, db: Session):
    etab, _ = _ecole(db)
    dn = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
    entetes = _headers(client, dn.nom_utilisateur)

    fiche = client.get("/api/personnel/me", headers=entetes)
    assert fiche.status_code == 200, fiche.text
    assert fiche.json()["utilisateur_id"] == dn.utilisateur_id

    rep = client.put("/api/personnel/me", headers=entetes, json={"prenom": "Mariama", "telephone": "620111222"})
    assert rep.status_code == 200, rep.text
    db.expire_all()
    assert (db.get(Utilisateur, dn.utilisateur_id).prenom, db.get(Utilisateur, dn.utilisateur_id).telephone) == (
        "Mariama", "620111222")

    rep = client.put("/api/personnel/me/changer-mot-de-passe", headers=entetes,
                     json={"ancien_mdp": "motdepasse123", "nouveau_mdp": "nouveau-secret-42"})
    assert rep.status_code == 200, rep.text
    assert client.post("/api/auth/login", json={"identifiant": dn.nom_utilisateur,
                                                "mot_de_passe": "nouveau-secret-42"}).status_code == 200

    # La gestion du personnel lui reste fermée.
    assert client.get("/api/personnel", headers=entetes).status_code == 403
    assert client.get(f"/api/personnel/{dn.utilisateur_id}", headers=entetes).status_code == 403


def test_mon_compte_ne_touche_que_le_compte_du_jeton(client: TestClient, db: Session):
    etab, _ = _ecole(db)
    moi, autre = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU"), _compte(db, etab.etablissement_id, "ADMIN")
    entetes = _headers(client, moi.nom_utilisateur)

    # Ni rôle, ni statut : seuls nom, prénom, e-mail et téléphone sont pris.
    rep = client.put("/api/personnel/me", headers=entetes, json={"nom": "Camara", "role": "ADMIN", "statut": "INACTIF"})
    assert rep.status_code == 200, rep.text
    db.expire_all()
    assert (db.get(Utilisateur, moi.utilisateur_id).role, db.get(Utilisateur, moi.utilisateur_id).statut) == (
        "DIRECTEUR_NIVEAU", "ACTIF")
    # Un identifiant de connexion d'un autre compte reste refusé.
    assert client.put("/api/personnel/me", headers=entetes, json={"email": autre.email}).status_code == 409
    # Nom vide refusé.
    assert client.put("/api/personnel/me", headers=entetes, json={"nom": "  "}).status_code == 400
    assert db.get(Utilisateur, autre.utilisateur_id).nom == "Bah"
