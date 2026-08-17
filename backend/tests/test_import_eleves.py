"""
Import en masse des élèves (Excel/CSV).

Un fichier peut mélanger toutes les classes : chaque élève est créé (matricule
auto, mot de passe par défaut) et inscrit dans la classe indiquée. Les lignes
dont la classe est introuvable ou la date invalide sont ignorées avec une raison,
sans bloquer les autres.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"IMP-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
        date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code="PRM", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="2ème année", ordre=2)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"C2-{uid}", libelle="2eme annee", statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    admin = Utilisateur(
        nom="Admin", prenom=f"I{uid}", nom_utilisateur=f"imp.admin.{uid}",
        email=f"imp.admin.{uid}@smartschool.gn", telephone=f"66600{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, classe, admin


def test_import_cree_les_eleves_et_ignore_les_classes_inconnues(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)

    csv = (
        "Nom;Prénom;Sexe;Date de naissance;Lieu de naissance;Téléphone;E-mail;Adresse;Groupe sanguin;Classe\n"
        "Camara;Mariam;F;12/03/2015;Conakry;620000000;;Madina;O+;2eme annee\n"
        "Bah;Ousmane;M;01/01/2014;;;;;;Classe Fantome\n"
        ";SansNom;M;01/01/2014;;;;;;2eme annee\n"
    )
    r = client.post(
        "/api/eleves/import",
        files={"fichier": ("eleves.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["crees"] == 1
    assert len(data["ignorees"]) == 2  # classe fantôme + nom manquant

    eleve = db.query(Eleve).filter(
        Eleve.etablissement_id == etab.etablissement_id, Eleve.nom == "Camara"
    ).first()
    assert eleve is not None
    assert eleve.matricule  # attribué automatiquement
    assert verify_password("12345678", eleve.mot_de_passe)  # mot de passe par défaut
    insc = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).first()
    assert insc is not None and insc.classe_id == classe.classe_id and insc.annee_id == annee.annee_id
    assert insc.type_inscription == "REINSCRIPTION"


def test_import_dry_run_n_ecrit_rien(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)
    csv = (
        "Nom;Prénom;Sexe;Date de naissance;Classe\n"
        "Sylla;Fatou;F;05/05/2015;2eme annee\n"
    )
    r = client.post(
        "/api/eleves/import?dry_run=true",
        files={"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["crees"] == 1
    # Rien écrit en base.
    assert db.query(Eleve).filter(Eleve.etablissement_id == etab.etablissement_id).count() == 0
