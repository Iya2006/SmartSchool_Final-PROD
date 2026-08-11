"""
Tests — Lot 6 (chantier multi-écoles) : isolation par établissement du
module Élèves.

Couvre les accès directs par ID (GET/PUT/DELETE, historique, dossier,
certificat PDF) et les créations où le client fournissait librement
l'établissement (POST /eleves, POST /inscription-complete).
"""
from datetime import date

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
        self.etab = Etablissement(code=f"L6-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Secondaire", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L6{uid}", nom_utilisateur=f"l6.admin.{uid}",
            email=f"l6.admin.{uid}@smartschool.gn", telephone=f"84000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def ajouter_eleve(self, db: Session, nom="Diallo", prenom="Fatoumata") -> Eleve:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L6ELV-{uid}",
            nom=nom, prenom=prenom, date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        return eleve

    def inscrire(self, db: Session, eleve: Eleve) -> Inscription:
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        return insc


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class TestListesIsolees:
    def test_liste_eleves_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LSTA")
        ecole_b = Ecole(db, "LSTB")
        eleve_a = ecole_a.ajouter_eleve(db)
        eleve_b = ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/eleves?limit=500", headers=headers_a)
        assert resp.status_code == 200
        ids = {e["eleve_id"] for e in resp.json()}
        assert eleve_a.eleve_id in ids
        assert eleve_b.eleve_id not in ids

    def test_count_isole(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CNTA")
        ecole_b = Ecole(db, "CNTB")
        ecole_a.ajouter_eleve(db)
        ecole_b.ajouter_eleve(db)
        ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/eleves/count", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_delta_isole(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "DLTA")
        ecole_b = Ecole(db, "DLTB")
        eleve_a = ecole_a.ajouter_eleve(db)
        eleve_b = ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/eleves/delta", headers=headers_a)
        assert resp.status_code == 200
        ids = {e["eleve_id"] for e in resp.json()["items"]}
        assert eleve_a.eleve_id in ids
        assert eleve_b.eleve_id not in ids


class TestAccesDirectCrossEcoleRefuse:
    def test_get_eleve_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "GETA")
        ecole_b = Ecole(db, "GETB")
        eleve_b = ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/eleves/{eleve_b.eleve_id}", headers=headers_a)
        assert resp.status_code == 404

    def test_update_eleve_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "UPDA")
        ecole_b = Ecole(db, "UPDB")
        eleve_b = ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(f"/api/eleves/{eleve_b.eleve_id}", json={"nom": "Piraté"}, headers=headers_a)
        assert resp.status_code == 404
        db.refresh(eleve_b)
        assert eleve_b.nom != "Piraté"

    def test_delete_eleve_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "DELA")
        ecole_b = Ecole(db, "DELB")
        eleve_b = ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.delete(f"/api/eleves/{eleve_b.eleve_id}", headers=headers_a)
        assert resp.status_code == 404
        assert db.query(Eleve).filter(Eleve.eleve_id == eleve_b.eleve_id).first() is not None

    def test_historique_inscriptions_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "HISA")
        ecole_b = Ecole(db, "HISB")
        eleve_b = ecole_b.ajouter_eleve(db)
        ecole_b.inscrire(db, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/eleves/{eleve_b.eleve_id}/inscriptions", headers=headers_a)
        assert resp.status_code == 404

    def test_dossier_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "DOSA")
        ecole_b = Ecole(db, "DOSB")
        eleve_b = ecole_b.ajouter_eleve(db)
        insc_b = ecole_b.inscrire(db, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/eleves/{eleve_b.eleve_id}/dossier/{insc_b.inscription_id}", headers=headers_a
        )
        assert resp.status_code == 404

    def test_certificat_pdf_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CRTA")
        ecole_b = Ecole(db, "CRTB")
        eleve_b = ecole_b.ajouter_eleve(db)
        ecole_b.inscrire(db, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/eleves/{eleve_b.eleve_id}/certificat-scolarite/pdf?annee_id={ecole_b.annee.annee_id}",
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_acces_propre_ecole_fonctionne(self, client: TestClient, db: Session):
        ecole = Ecole(db, "OKA")
        eleve = ecole.ajouter_eleve(db)
        headers = _headers(client, ecole.admin.nom_utilisateur)

        resp = client.get(f"/api/eleves/{eleve.eleve_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["eleve_id"] == eleve.eleve_id


class TestCreationIgnoreEtablissementDuBody:
    def test_create_eleve_ignore_etablissement_id_body(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CRA")
        ecole_b = Ecole(db, "CRB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/eleves",
            json={
                "etablissement_id": ecole_b.etab.etablissement_id,  # tentative d'injection
                "nom": "Sylla", "prenom": "Mariama",
                "date_naissance": "2013-05-04", "sexe": "F",
            },
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["etablissement_id"] == ecole_a.etab.etablissement_id

    def test_inscription_complete_ignore_etablissement_id_body(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "ICA")
        ecole_b = Ecole(db, "ICB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/eleves/inscription-complete",
            json={
                "etablissement_id": ecole_b.etab.etablissement_id,  # tentative d'injection
                "nom": "Barry", "prenom": "Alpha", "sexe": "M",
                "date_naissance": "2012-03-03",
                "annee_id": ecole_a.annee.annee_id,
                "classe_id": ecole_a.classe.classe_id,
            },
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        eleve = db.query(Eleve).filter(Eleve.eleve_id == resp.json()["eleve_id"]).first()
        assert eleve.etablissement_id == ecole_a.etab.etablissement_id

    def test_inscription_complete_classe_autre_ecole_refusee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "ICCA")
        ecole_b = Ecole(db, "ICCB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/eleves/inscription-complete",
            json={
                "nom": "Kante", "prenom": "Sory", "sexe": "M",
                "date_naissance": "2012-03-03",
                "annee_id": ecole_a.annee.annee_id,
                "classe_id": ecole_b.classe.classe_id,  # classe d'une autre école
            },
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_update_eleve_vers_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "UPCA")
        ecole_b = Ecole(db, "UPCB")
        eleve_a = ecole_a.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/eleves/{eleve_a.eleve_id}",
            json={"classe_id": ecole_b.classe.classe_id},
            headers=headers_a,
        )
        assert resp.status_code == 404


class TestSuperAdminPlateformeRefuseSurEleves:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l6.super.{uid}",
            email=f"l6.super.{uid}@smartschool.gn", telephone=f"85000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/eleves", headers=headers)
        assert resp.status_code == 403
