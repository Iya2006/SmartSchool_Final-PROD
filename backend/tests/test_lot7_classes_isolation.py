"""
Tests — Lot 7 (chantier multi-écoles) : isolation par établissement des
modules Classes et Inscriptions.

Vérifie en particulier la vulnérabilité en écriture la plus massive du
chantier : PUT /lycee-series-coefficients/{serie} écrivait sur TOUTES les
classes de série lycée de TOUTE la plateforme.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, ClasseMatiere, Cycle, Eleve, Enseignant,
    Etablissement, Inscription, Matiere, Niveau, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str, niveau_code: str | None = None):
        uid = _uid()
        self.etab = Etablissement(code=f"L7-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Lycée", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        # niveau_code permet de partager un même code de série (ex. "TSM")
        # entre deux écoles — c'est précisément ce qui rendait la fuite
        # possible sur les routes lycee-series-coefficients.
        self.niveau = Niveau(
            cycle_id=self.cycle.cycle_id, code=niveau_code or f"NV{uid}",
            libelle="Terminale", ordre=1,
        )
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"TSM {uid}",
            statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere = Matiere(cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Maths", note_sur=20)
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        self.classe_matiere = ClasseMatiere(
            classe_id=self.classe.classe_id, matiere_id=self.matiere.matiere_id,
            coefficient=3, est_active="O",
        )
        db.add(self.classe_matiere); db.commit(); db.refresh(self.classe_matiere)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L7ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"86000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L7{uid}", nom_utilisateur=f"l7.admin.{uid}",
            email=f"l7.admin.{uid}@smartschool.gn", telephone=f"87000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def ajouter_eleve(self, db: Session, sexe="F") -> Eleve:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L7ELV-{uid}",
            nom="Diallo", prenom=f"E{uid}", date_naissance=date(2010, 1, 1),
            sexe=sexe, statut="ACTIF",
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


class TestSeriesLyceeCoefficients:
    """La vulnérabilité en écriture la plus massive du chantier."""

    def test_update_coefficients_ne_touche_pas_les_autres_ecoles(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "SMA", niveau_code="TSM")
        ecole_b = Ecole(db, "SMB", niveau_code="TSM")  # même code de série
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        coef_b_avant = float(ecole_b.classe_matiere.coefficient)

        resp = client.put(
            "/api/classes/lycee-series-coefficients/SM",
            json=[{"matiere_id": ecole_a.matiere.matiere_id, "coefficient": 9}],
            headers=headers_a,
        )
        assert resp.status_code == 200, resp.text

        db.refresh(ecole_a.classe_matiere)
        db.refresh(ecole_b.classe_matiere)
        assert float(ecole_a.classe_matiere.coefficient) == 9
        assert float(ecole_b.classe_matiere.coefficient) == coef_b_avant

    def test_update_avec_matiere_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "MTA", niveau_code="TSM")
        ecole_b = Ecole(db, "MTB", niveau_code="TSM")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        note_sur_b_avant = float(ecole_b.matiere.note_sur)

        resp = client.put(
            "/api/classes/lycee-series-coefficients/SM",
            json=[{"matiere_id": ecole_b.matiere.matiere_id, "coefficient": 5, "note_sur": 40}],
            headers=headers_a,
        )
        assert resp.status_code == 403

        db.refresh(ecole_b.matiere)
        assert float(ecole_b.matiere.note_sur) == note_sur_b_avant

    def test_get_coefficients_isole(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "GCA", niveau_code="TSM")
        Ecole(db, "GCB", niveau_code="TSM")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/classes/lycee-series-coefficients", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["SM"]["classes_count"] == 1


class TestClassesIsolation:
    def test_liste_classes_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LCA")
        ecole_b = Ecole(db, "LCB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/classes?annee_id={ecole_a.annee.annee_id}", headers=headers_a)
        assert resp.status_code == 200
        ids = {c["classe_id"] for c in resp.json()}
        assert ecole_a.classe.classe_id in ids
        assert ecole_b.classe.classe_id not in ids

    def test_get_classe_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "GCLA")
        ecole_b = Ecole(db, "GCLB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/classes/{ecole_b.classe.classe_id}", headers=headers_a)
        assert resp.status_code == 404

    def test_get_classe_eleves_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CEA")
        ecole_b = Ecole(db, "CEB")
        eleve_b = ecole_b.ajouter_eleve(db)
        ecole_b.inscrire(db, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/classes/{ecole_b.classe.classe_id}/eleves", headers=headers_a)
        assert resp.status_code == 404

    def test_get_profil_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "PRA")
        ecole_b = Ecole(db, "PRB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/classes/{ecole_b.classe.classe_id}/profil", headers=headers_a)
        assert resp.status_code == 404

    def test_update_classe_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "UCA")
        ecole_b = Ecole(db, "UCB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/classes/{ecole_b.classe.classe_id}",
            json={
                "etablissement_id": ecole_a.etab.etablissement_id,
                "annee_id": ecole_b.annee.annee_id, "niveau_id": ecole_b.niveau.niveau_id,
                "code": "PIRATE", "libelle": "Piraté",
            },
            headers=headers_a,
        )
        assert resp.status_code == 404
        db.refresh(ecole_b.classe)
        assert ecole_b.classe.libelle != "Piraté"

    def test_create_classe_ignore_etablissement_id_body(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CCA")
        ecole_b = Ecole(db, "CCB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/classes",
            json={
                "etablissement_id": ecole_b.etab.etablissement_id,  # tentative d'injection
                "annee_id": ecole_a.annee.annee_id, "niveau_id": ecole_a.niveau.niveau_id,
                "code": f"NEW{_uid()}", "libelle": "Nouvelle classe",
            },
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["etablissement_id"] == ecole_a.etab.etablissement_id


class TestConfigurerClasse:
    def test_prof_principal_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "PPA")
        ecole_b = Ecole(db, "PPB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/classes/{ecole_a.classe.classe_id}/configurer",
            json={"professeur_principal_id": ecole_b.enseignant.enseignant_id},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_chefs_de_classe_autre_ecole_refuses(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CHA")
        ecole_b = Ecole(db, "CHB")
        e1 = ecole_a.ajouter_eleve(db, sexe="F")
        e2 = ecole_a.ajouter_eleve(db, sexe="M")
        e_autre = ecole_b.ajouter_eleve(db, sexe="M")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/classes/{ecole_a.classe.classe_id}/configurer",
            json={"chefs_de_classe": [e1.eleve_id, e2.eleve_id, e_autre.eleve_id]},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_configurer_classe_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CFA")
        ecole_b = Ecole(db, "CFB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/classes/{ecole_b.classe.classe_id}/configurer",
            json={"professeur_principal_id": None},
            headers=headers_a,
        )
        assert resp.status_code == 404


class TestInscriptionsIsolation:
    def test_create_inscription_eleve_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "IEA")
        ecole_b = Ecole(db, "IEB")
        eleve_b = ecole_b.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/inscriptions",
            json={
                "eleve_id": eleve_b.eleve_id, "classe_id": ecole_a.classe.classe_id,
                "annee_id": ecole_a.annee.annee_id,
            },
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_create_inscription_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "ICA2")
        ecole_b = Ecole(db, "ICB2")
        eleve_a = ecole_a.ajouter_eleve(db)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/inscriptions",
            json={
                "eleve_id": eleve_a.eleve_id, "classe_id": ecole_b.classe.classe_id,
                "annee_id": ecole_a.annee.annee_id,
            },
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_get_inscription_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "GIA")
        ecole_b = Ecole(db, "GIB")
        eleve_b = ecole_b.ajouter_eleve(db)
        insc_b = ecole_b.inscrire(db, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/inscriptions/{insc_b.inscription_id}", headers=headers_a)
        assert resp.status_code == 404

    def test_annuler_inscription_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "AIA")
        ecole_b = Ecole(db, "AIB")
        eleve_b = ecole_b.ajouter_eleve(db)
        insc_b = ecole_b.inscrire(db, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.delete(f"/api/inscriptions/{insc_b.inscription_id}", headers=headers_a)
        assert resp.status_code == 404
        db.refresh(insc_b)
        assert insc_b.statut == "ACTIVE"

    def test_inscription_normale_fonctionne(self, client: TestClient, db: Session):
        ecole = Ecole(db, "IOK")
        eleve = ecole.ajouter_eleve(db)
        headers = _headers(client, ecole.admin.nom_utilisateur)

        resp = client.post(
            "/api/inscriptions",
            json={
                "eleve_id": eleve.eleve_id, "classe_id": ecole.classe.classe_id,
                "annee_id": ecole.annee.annee_id,
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text


class TestSuperAdminPlateformeRefuseSurClasses:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l7.super.{uid}",
            email=f"l7.super.{uid}@smartschool.gn", telephone=f"88000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/classes", headers=headers)
        assert resp.status_code == 403
