"""
Tests — création et suppression d'une classe.

Deux défauts constatés en production :

1. `POST /api/classes` ne vérifiait ni le niveau ni l'année. Un `niveau_id`
   inexistant provoquait une violation de clé étrangère non capturée, donc un
   **500** illisible — c'est ce que voyaient les écoles neuves, qui n'ont
   encore aucun cycle. Pire : un niveau appartenant à une AUTRE école était
   accepté, la classe se retrouvant rattachée au niveau d'autrui.

2. Aucune route de suppression n'existait (405) : une classe saisie par erreur
   restait définitivement dans l'établissement.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(
            code=f"CLS-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE",
        )
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="7ème", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"C{uid}", nom_utilisateur=f"cls.admin.{uid}",
            email=f"cls.admin.{uid}@smartschool.gn", telephone=f"69100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def classe(self, db: Session) -> Classe:
        uid = _uid()
        c = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"7ème A {uid}", statut="ACTIVE",
        )
        db.add(c); db.commit(); db.refresh(c)
        return c


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _corps(ecole: Ecole, niveau_id: int, suffixe: str) -> dict:
    return {
        "etablissement_id": ecole.etab.etablissement_id,
        "annee_id": ecole.annee.annee_id,
        "niveau_id": niveau_id,
        "code": f"C{suffixe}{_uid()}",
        "libelle": f"Classe {suffixe}",
    }


class TestCreationValidee:
    def test_niveau_inexistant_donne_404_et_non_500(self, client: TestClient, db: Session):
        a = Ecole(db, "NIA")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/classes", json=_corps(a, 999999, "X"), headers=headers)
        assert resp.status_code == 404, resp.text
        assert "Niveau" in resp.json()["detail"]

    def test_niveau_dune_autre_ecole_refuse(self, client: TestClient, db: Session):
        """Le point de sécurité : sans ce contrôle, la classe était rattachée
        au niveau d'un autre établissement."""
        a, b = Ecole(db, "NAA"), Ecole(db, "NAB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/classes", json=_corps(a, b.niveau.niveau_id, "Y"), headers=headers)
        assert resp.status_code == 404, resp.text
        assert db.query(Classe).filter(Classe.niveau_id == b.niveau.niveau_id).count() == 0

    def test_annee_dune_autre_ecole_refusee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ANA"), Ecole(db, "ANB")
        headers = _headers(client, a.admin.nom_utilisateur)

        corps = _corps(a, a.niveau.niveau_id, "Z")
        corps["annee_id"] = b.annee.annee_id
        resp = client.post("/api/classes", json=corps, headers=headers)
        assert resp.status_code == 404, resp.text

    def test_creation_legitime_fonctionne(self, client: TestClient, db: Session):
        a = Ecole(db, "OKA")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/classes", json=_corps(a, a.niveau.niveau_id, "OK"), headers=headers)
        assert resp.status_code == 201, resp.text
        assert resp.json()["etablissement_id"] == a.etab.etablissement_id


class TestSuppression:
    def test_classe_vide_supprimee(self, client: TestClient, db: Session):
        a = Ecole(db, "SUA")
        cl = a.classe(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/classes/{cl.classe_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        assert db.query(Classe).filter(Classe.classe_id == cl.classe_id).first() is None

    def test_classe_avec_eleves_refusee(self, client: TestClient, db: Session):
        """Supprimer emporterait notes et présences : on refuse en disant
        précisément ce qui bloque."""
        a = Ecole(db, "SUB")
        cl = a.classe(db)
        uid = _uid()
        eleve = Eleve(
            etablissement_id=a.etab.etablissement_id, matricule=f"CLSELV-{uid}",
            nom="Diallo", prenom="Test", date_naissance=date(2012, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        db.add(Inscription(
            eleve_id=eleve.eleve_id, classe_id=cl.classe_id,
            annee_id=a.annee.annee_id, statut="ACTIVE",
        ))
        db.commit()

        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.delete(f"/api/classes/{cl.classe_id}", headers=headers)
        assert resp.status_code == 409, resp.text
        assert "inscription" in resp.json()["detail"].lower()
        assert db.query(Classe).filter(Classe.classe_id == cl.classe_id).first() is not None

    def test_classe_dune_autre_ecole_refusee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "SUC"), Ecole(db, "SUD")
        cl_b = b.classe(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/classes/{cl_b.classe_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(Classe).filter(Classe.classe_id == cl_b.classe_id).first() is not None
