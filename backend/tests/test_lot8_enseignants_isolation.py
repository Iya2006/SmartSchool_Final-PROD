"""
Tests — Lot 8 (chantier multi-écoles) : isolation par établissement du
module Enseignants (CRUD, affectations, Salle des Profs).

Points sensibles couverts : la fiche enseignant expose des données RH
(salaire, RIB, CNI, adresse) ; les écrans « Salle des Profs » agrégeaient
sur toute la plateforme ; les affectations liaient enseignant/classe/matière
sans aucune vérification d'appartenance.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    Affectation, AnneeScolaire, Classe, ClasseMatiere, Cycle, Enseignant,
    Etablissement, Matiere, Niveau, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"L8-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere = Matiere(cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Maths", note_sur=20)
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        db.add(ClasseMatiere(
            classe_id=self.classe.classe_id, matiere_id=self.matiere.matiere_id,
            coefficient=3, nb_heures_semaine=4, est_active="O",
        ))
        db.commit()

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L8ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"89000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
            salaire_base=500000, rib=f"RIB-SECRET-{uid}", numero_cni=f"CNI-{uid}",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L8{uid}", nom_utilisateur=f"l8.admin.{uid}",
            email=f"l8.admin.{uid}@smartschool.gn", telephone=f"90000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def affecter(self, db: Session) -> Affectation:
        aff = Affectation(
            enseignant_id=self.enseignant.enseignant_id, matiere_id=self.matiere.matiere_id,
            classe_id=self.classe.classe_id, annee_id=self.annee.annee_id,
            nb_heures_semaine=4, statut="ACTIVE",
        )
        db.add(aff); db.commit(); db.refresh(aff)
        return aff


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class TestListesIsolees:
    def test_liste_enseignants_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LEA")
        ecole_b = Ecole(db, "LEB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/enseignants", headers=headers_a)
        assert resp.status_code == 200
        ids = {e["enseignant_id"] for e in resp.json()}
        assert ecole_a.enseignant.enseignant_id in ids
        assert ecole_b.enseignant.enseignant_id not in ids

    def test_count_isole(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CTA")
        Ecole(db, "CTB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/enseignants/count", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["total"] == 1


class TestAccesDirectCrossEcoleRefuse:
    def test_get_enseignant_cross_ecole_404(self, client: TestClient, db: Session):
        """La fiche expose salaire/RIB/CNI — ne doit jamais fuiter."""
        ecole_a = Ecole(db, "GEA")
        ecole_b = Ecole(db, "GEB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/enseignants/{ecole_b.enseignant.enseignant_id}", headers=headers_a)
        assert resp.status_code == 404

    def test_affectations_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "AFA")
        ecole_b = Ecole(db, "AFB")
        ecole_b.affecter(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/enseignants/{ecole_b.enseignant.enseignant_id}/affectations", headers=headers_a)
        assert resp.status_code == 404

    def test_emploi_du_temps_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "EDA")
        ecole_b = Ecole(db, "EDB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/enseignants/{ecole_b.enseignant.enseignant_id}/emploi-du-temps", headers=headers_a)
        assert resp.status_code == 404

    def test_dashboard_stats_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "DSA")
        ecole_b = Ecole(db, "DSB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/enseignants/{ecole_b.enseignant.enseignant_id}/dashboard-stats", headers=headers_a)
        assert resp.status_code == 404

    def test_update_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "UEA")
        ecole_b = Ecole(db, "UEB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/enseignants/{ecole_b.enseignant.enseignant_id}",
            json={"salaire_base": 9999999},
            headers=headers_a,
        )
        assert resp.status_code == 404
        db.refresh(ecole_b.enseignant)
        assert float(ecole_b.enseignant.salaire_base) == 500000

    def test_delete_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "DEA")
        ecole_b = Ecole(db, "DEB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.delete(f"/api/enseignants/{ecole_b.enseignant.enseignant_id}", headers=headers_a)
        assert resp.status_code == 404
        assert db.query(Enseignant).filter(
            Enseignant.enseignant_id == ecole_b.enseignant.enseignant_id
        ).first() is not None

    def test_acces_propre_ecole_fonctionne(self, client: TestClient, db: Session):
        ecole = Ecole(db, "OKA")
        headers = _headers(client, ecole.admin.nom_utilisateur)

        assert client.get(f"/api/enseignants/{ecole.enseignant.enseignant_id}", headers=headers).status_code == 200
        assert client.get(f"/api/enseignants/{ecole.enseignant.enseignant_id}/affectations", headers=headers).status_code == 200
        assert client.get(f"/api/enseignants/{ecole.enseignant.enseignant_id}/dashboard-stats", headers=headers).status_code == 200


class TestAffectationsInjection:
    def test_affecter_enseignant_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "IEA")
        ecole_b = Ecole(db, "IEB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            f"/api/enseignants/{ecole_b.enseignant.enseignant_id}/affectations",
            json={"classe_id": ecole_a.classe.classe_id, "matiere_id": ecole_a.matiere.matiere_id,
                  "annee_id": ecole_a.annee.annee_id},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_affecter_vers_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "ICA")
        ecole_b = Ecole(db, "ICB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            f"/api/enseignants/{ecole_a.enseignant.enseignant_id}/affectations",
            json={"classe_id": ecole_b.classe.classe_id, "matiere_id": ecole_a.matiere.matiere_id,
                  "annee_id": ecole_a.annee.annee_id},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_affecter_avec_matiere_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "IMA")
        ecole_b = Ecole(db, "IMB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            f"/api/enseignants/{ecole_a.enseignant.enseignant_id}/affectations",
            json={"classe_id": ecole_a.classe.classe_id, "matiere_id": ecole_b.matiere.matiere_id,
                  "annee_id": ecole_a.annee.annee_id},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_affectation_normale_fonctionne(self, client: TestClient, db: Session):
        ecole = Ecole(db, "AOK")
        headers = _headers(client, ecole.admin.nom_utilisateur)

        resp = client.post(
            f"/api/enseignants/{ecole.enseignant.enseignant_id}/affectations",
            json={"classe_id": ecole.classe.classe_id, "matiere_id": ecole.matiere.matiere_id,
                  "annee_id": ecole.annee.annee_id},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    def test_supprimer_affectation_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "SAA")
        ecole_b = Ecole(db, "SAB")
        aff_b = ecole_b.affecter(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.delete(f"/api/enseignants/affectations/{aff_b.affectation_id}", headers=headers_a)
        assert resp.status_code == 404
        assert db.query(Affectation).filter(
            Affectation.affectation_id == aff_b.affectation_id
        ).first() is not None


class TestSalleDesProfsIsolee:
    def test_affectations_globales_isolees(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "SPA")
        ecole_b = Ecole(db, "SPB")
        aff_a = ecole_a.affecter(db)
        aff_b = ecole_b.affecter(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/enseignants/salle-des-profs/affectations-globales?annee_id={ecole_a.annee.annee_id}",
            headers=headers_a,
        )
        assert resp.status_code == 200
        ids = {a["affectation_id"] for a in resp.json()}
        assert aff_a.affectation_id in ids
        assert aff_b.affectation_id not in ids

    def test_classes_matieres_isolees(self, client: TestClient, db: Session):
        """Cette route déclarait un etablissement_id qu'elle n'utilisait pas."""
        ecole_a = Ecole(db, "CMA")
        ecole_b = Ecole(db, "CMB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/enseignants/salle-des-profs/classes-matieres", headers=headers_a)
        assert resp.status_code == 200
        ids = {c["classe_id"] for c in resp.json()}
        assert ecole_a.classe.classe_id in ids
        assert ecole_b.classe.classe_id not in ids

    def test_stats_isolees(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "STA")
        ecole_b = Ecole(db, "STB")
        ecole_a.affecter(db)
        ecole_b.affecter(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/enseignants/salle-des-profs/stats?annee_id={ecole_a.annee.annee_id}",
            headers=headers_a,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_enseignants"] == 1
        assert data["total_affectations"] == 1
        assert data["total_postes"] == 1


class TestCreationIgnoreEtablissementDuBody:
    def test_create_enseignant_ignore_etablissement_id_body(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CRA")
        ecole_b = Ecole(db, "CRB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/enseignants",
            json={
                "etablissement_id": ecole_b.etab.etablissement_id,  # tentative d'injection
                "nom": "Sylla", "prenom": "Mariama", "sexe": "F", "telephone": f"9100{_uid():05d}",
            },
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["etablissement_id"] == ecole_a.etab.etablissement_id


class TestSuperAdminPlateformeRefuseSurEnseignants:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l8.super.{uid}",
            email=f"l8.super.{uid}@smartschool.gn", telephone=f"92000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/enseignants", headers=headers)
        assert resp.status_code == 403
