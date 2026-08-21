"""
Rattachement d'un élève à un PARENT EXISTANT lors de l'inscription.

Objectif métier : un même parent (2e enfant de la famille) ne doit PAS entraîner
la création d'un second compte parent. Le formulaire propose la liste des parents
déjà enregistrés (GET /api/eleves/parents-existants) et envoie parent.parent_id ;
l'élève est rattaché à ce parent, et les deux enfants apparaissent sous un seul
compte parent.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Etablissement, Niveau,
    Parent, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session, suffix: str):
    uid = _uid()
    etab = Etablissement(code=f"IPE-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CY{uid}", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NV{uid}", libelle="CP", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"CL{uid}", libelle=f"CP {uid}")
    db.add(classe); db.commit(); db.refresh(classe)
    admin = Utilisateur(nom="Admin", prenom=f"I{uid}", nom_utilisateur=f"ipe.admin.{uid}",
                        email=f"ipe.admin.{uid}@smartschool.gn", telephone=f"66690{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, classe, admin


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_deuxieme_enfant_rattache_au_parent_existant(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db, "LINK")
    h = _headers(client, admin.nom_utilisateur)

    # 1er enfant → crée le parent
    r1 = client.post("/api/eleves/inscription-complete", json={
        "nom": "Bah", "prenom": "Aïcha", "sexe": "F", "classe_id": classe.classe_id,
        "parent": {"nom": "Bah", "prenom": "Mamadou", "telephone_1": "620111222", "lien_parente": "PERE"},
    }, headers=h)
    assert r1.status_code == 201, r1.text
    parent_id = r1.json()["parent_id"]
    assert r1.json()["parent"]["is_new"] is True

    # Le parent apparaît dans la liste des parents existants
    r_list = client.get("/api/eleves/parents-existants", headers=h)
    assert r_list.status_code == 200, r_list.text
    ids = {p["parent_id"] for p in r_list.json()}
    assert parent_id in ids
    fiche = next(p for p in r_list.json() if p["parent_id"] == parent_id)
    assert fiche["nb_enfants"] == 1
    assert fiche["telephone_1"] == "620111222"

    # 2e enfant → on SÉLECTIONNE le parent existant (parent_id), pas de nouveau compte
    r2 = client.post("/api/eleves/inscription-complete", json={
        "nom": "Bah", "prenom": "Ibrahima", "sexe": "M", "classe_id": classe.classe_id,
        "parent": {"parent_id": parent_id, "lien_parente": "PERE"},
    }, headers=h)
    assert r2.status_code == 201, r2.text
    assert r2.json()["parent_id"] == parent_id
    assert r2.json()["parent"]["is_new"] is False

    # Un seul compte parent, deux enfants rattachés
    assert db.query(Parent).filter(Parent.etablissement_id == etab.etablissement_id).count() == 1
    liens = db.query(EleveParent).filter(EleveParent.parent_id == parent_id).count()
    assert liens == 2
    fiche2 = next(p for p in client.get("/api/eleves/parents-existants", headers=h).json() if p["parent_id"] == parent_id)
    assert fiche2["nb_enfants"] == 2


def test_parents_existants_isole_par_etablissement(client: TestClient, db: Session):
    etab_a, annee_a, classe_a, admin_a = _ecole(db, "ISOA")
    etab_b, annee_b, classe_b, admin_b = _ecole(db, "ISOB")
    h_a = _headers(client, admin_a.nom_utilisateur)
    h_b = _headers(client, admin_b.nom_utilisateur)

    # Un parent dans l'école A
    r = client.post("/api/eleves/inscription-complete", json={
        "nom": "Sow", "prenom": "Fanta", "sexe": "F", "classe_id": classe_a.classe_id,
        "parent": {"nom": "Sow", "prenom": "Ousmane", "telephone_1": "620999888", "lien_parente": "PERE"},
    }, headers=h_a)
    assert r.status_code == 201, r.text
    parent_a = r.json()["parent_id"]

    # L'école B ne voit pas le parent de l'école A
    assert all(p["parent_id"] != parent_a for p in client.get("/api/eleves/parents-existants", headers=h_b).json())

    # Et l'école B ne peut pas rattacher un élève à un parent de l'école A
    r_bad = client.post("/api/eleves/inscription-complete", json={
        "nom": "X", "prenom": "Y", "sexe": "M", "classe_id": classe_b.classe_id,
        "parent": {"parent_id": parent_a, "lien_parente": "PERE"},
    }, headers=h_b)
    assert r_bad.status_code == 404


def test_recherche_parent_par_nom(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db, "SEARCH")
    h = _headers(client, admin.nom_utilisateur)
    client.post("/api/eleves/inscription-complete", json={
        "nom": "Camara", "prenom": "Sekou", "sexe": "M", "classe_id": classe.classe_id,
        "parent": {"nom": "Traoré", "prenom": "Salif", "telephone_1": "621000111", "lien_parente": "PERE"},
    }, headers=h)

    trouve = client.get("/api/eleves/parents-existants?search=trao", headers=h).json()
    assert any(p["nom"] == "Traoré" for p in trouve)
    absent = client.get("/api/eleves/parents-existants?search=zzzzzz", headers=h).json()
    assert absent == []
