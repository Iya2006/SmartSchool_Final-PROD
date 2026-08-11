"""
Tests — Lot 9 passe B (chantier multi-écoles) : isolation du cycle de vie
annuel — promotion, réinscription, emploi du temps, clôture d'année.

Point central : `POST /promotion/annee/{cible}/preparer-classes` était le bug
de CONTAMINATION cross-tenant identifié dès l'audit initial — les classes
clonées conservaient l'`etablissement_id` de la SOURCE, écrivant de la donnée
d'une école dans le périmètre d'une autre.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, ClasseMatiere, CreneauEmploi, Cycle, Eleve,
    Enseignant, Etablissement, Inscription, Matiere, Niveau, Trimestre,
    Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"L9B-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.annee_cible = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}B", libelle=f"2026-2027 {uid}",
            date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="PLANIFIEE",
        )
        db.add(self.annee_cible); db.commit(); db.refresh(self.annee_cible)

        self.trimestre = Trimestre(
            annee_id=self.annee.annee_id, code=f"T1-{uid}", libelle="Trimestre 1", numero=1,
            date_debut=date(2025, 9, 1), date_fin=date(2025, 12, 20), statut="EN_COURS",
        )
        db.add(self.trimestre); db.commit(); db.refresh(self.trimestre)

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
            coefficient=2, nb_heures_semaine=2, est_active="O",
        ))
        db.commit()

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L9BENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"96000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L9B{uid}", nom_utilisateur=f"l9b.admin.{uid}",
            email=f"l9b.admin.{uid}@smartschool.gn", telephone=f"97000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def eleve_inscrit(self, db: Session) -> tuple[Eleve, Inscription]:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L9BELV-{uid}",
            nom="Diallo", prenom=f"E{uid}", date_naissance=date(2012, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        return eleve, insc

    def creneau(self, db: Session) -> CreneauEmploi:
        c = CreneauEmploi(
            classe_id=self.classe.classe_id, matiere_id=self.matiere.matiere_id,
            enseignant_id=self.enseignant.enseignant_id, jour="LUNDI",
            heure_debut="08:00", heure_fin="09:00", annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(c); db.commit(); db.refresh(c)
        return c


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ══════════════════════════════════════════════════════════════
# PROMOTION — dont le bug de contamination
# ══════════════════════════════════════════════════════════════

class TestPreparerClassesContamination:
    """Le bug de contamination cross-tenant identifié dès l'audit initial."""

    def test_preparer_classes_ne_clone_pas_depuis_une_autre_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PCA"), Ecole(db, "PCB")
        headers_a = _headers(client, a.admin.nom_utilisateur)

        # A tente de cloner la structure de l'année de B vers sa propre année cible
        resp = client.post(
            f"/api/promotion/annee/{a.annee_cible.annee_id}/preparer-classes"
            f"?annee_source_id={b.annee.annee_id}",
            headers=headers_a,
        )
        assert resp.status_code == 404, "L'année source d'une autre école doit être refusée"

        # Aucune classe n'a été créée dans l'année cible de A
        assert db.query(Classe).filter(Classe.annee_id == a.annee_cible.annee_id).count() == 0

    def test_preparer_classes_normal_cree_dans_la_bonne_ecole(self, client: TestClient, db: Session):
        a = Ecole(db, "PCOK")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            f"/api/promotion/annee/{a.annee_cible.annee_id}/preparer-classes"
            f"?annee_source_id={a.annee.annee_id}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        nouvelles = db.query(Classe).filter(Classe.annee_id == a.annee_cible.annee_id).all()
        assert len(nouvelles) == 1
        assert nouvelles[0].etablissement_id == a.etab.etablissement_id


class TestPromotionIsolation:
    def test_apercu_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PAA"), Ecole(db, "PAB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/promotion/classe/{b.classe.classe_id}/apercu", headers=headers).status_code == 404

    def test_calculer_resultats_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PRA"), Ecole(db, "PRB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            f"/api/promotion/classe/{b.classe.classe_id}/calculer-resultats",
            json={"annee_cible_id": b.annee_cible.annee_id}, headers=headers,
        )
        assert resp.status_code == 404

    def test_valider_classe_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PVA"), Ecole(db, "PVB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.post(f"/api/promotion/classe/{b.classe.classe_id}/valider", headers=headers).status_code == 404

    def test_valider_tout_annee_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PVTA"), Ecole(db, "PVTB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(f"/api/promotion/annee/{b.annee.annee_id}/valider-tout", headers=headers)
        assert resp.status_code == 404

    def test_etat_annee_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PEA"), Ecole(db, "PEB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/promotion/annee/{b.annee.annee_id}/etat", headers=headers).status_code == 404

    def test_override_decision_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PODA"), Ecole(db, "PODB")
        _, insc_b = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/promotion/eleve/{insc_b.inscription_id}/decision",
            json={"decision": "EXCLU"}, headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(insc_b)
        assert insc_b.decision_fin_annee != "EXCLU"


# ══════════════════════════════════════════════════════════════
# RÉINSCRIPTION
# ══════════════════════════════════════════════════════════════

class TestReinscriptionIsolation:
    def test_liste_campagne_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RCA"), Ecole(db, "RCB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/reinscription/classe-cible/{b.classe.classe_id}", headers=headers).status_code == 404

    def test_confirmer_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RFA"), Ecole(db, "RFB")
        _, insc_b = b.eleve_inscrit(db)
        insc_b.statut_promotion = "VALIDE"
        insc_b.statut_reinscription = "A_REINSCRIRE"
        insc_b.classe_cible_id = b.classe.classe_id
        db.commit()
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/reinscription/{insc_b.inscription_id}/confirmer", headers=headers)
        assert resp.status_code == 404
        db.refresh(insc_b)
        assert insc_b.statut_reinscription == "A_REINSCRIRE"

    def test_changer_statut_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RSA"), Ecole(db, "RSB")
        _, insc_b = b.eleve_inscrit(db)
        insc_b.statut_reinscription = "A_REINSCRIRE"
        db.commit()
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/reinscription/{insc_b.inscription_id}/statut",
            json={"statut": "ABANDON"}, headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(insc_b)
        assert insc_b.statut_reinscription == "A_REINSCRIRE"

    def test_etat_annee_isole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "REA"), Ecole(db, "REB")
        _, insc_b = b.eleve_inscrit(db)
        insc_b.classe_cible_id = b.classe.classe_id
        insc_b.statut_reinscription = "A_REINSCRIRE"
        db.commit()
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/reinscription/etat/{b.annee.annee_id}", headers=headers)
        assert resp.status_code == 200
        # Les classes de B ne sont jamais comptées pour A
        assert resp.json()["total"] == 0


# ══════════════════════════════════════════════════════════════
# EMPLOI DU TEMPS
# ══════════════════════════════════════════════════════════════

class TestEmploiDuTempsIsolation:
    def test_get_emploi_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EGA"), Ecole(db, "EGB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/emploi-du-temps/classe/{b.classe.classe_id}", headers=headers).status_code == 404

    def test_create_creneau_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ECA"), Ecole(db, "ECB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            "/api/emploi-du-temps",
            json={
                "classe_id": b.classe.classe_id, "matiere_id": b.matiere.matiere_id,
                "jour": "LUNDI", "heure_debut": "08:00", "heure_fin": "09:00",
            },
            headers=headers,
        )
        assert resp.status_code == 404

    def test_create_creneau_avec_matiere_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EMA"), Ecole(db, "EMB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            "/api/emploi-du-temps",
            json={
                "classe_id": a.classe.classe_id, "matiere_id": b.matiere.matiere_id,
                "jour": "LUNDI", "heure_debut": "08:00", "heure_fin": "09:00",
            },
            headers=headers,
        )
        assert resp.status_code == 404

    def test_create_creneau_avec_enseignant_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EEA"), Ecole(db, "EEB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            "/api/emploi-du-temps",
            json={
                "classe_id": a.classe.classe_id, "matiere_id": a.matiere.matiere_id,
                "enseignant_id": b.enseignant.enseignant_id,
                "jour": "LUNDI", "heure_debut": "08:00", "heure_fin": "09:00",
            },
            headers=headers,
        )
        assert resp.status_code == 404

    def test_creneau_normal_fonctionne(self, client: TestClient, db: Session):
        a = Ecole(db, "EOK")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            "/api/emploi-du-temps",
            json={
                "classe_id": a.classe.classe_id, "matiere_id": a.matiere.matiere_id,
                "enseignant_id": a.enseignant.enseignant_id,
                "jour": "LUNDI", "heure_debut": "08:00", "heure_fin": "09:00",
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    def test_delete_creneau_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EDA"), Ecole(db, "EDB")
        creneau_b = b.creneau(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/emploi-du-temps/{creneau_b.creneau_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(CreneauEmploi).filter(CreneauEmploi.creneau_id == creneau_b.creneau_id).first() is not None

    def test_auto_generation_cross_ecole_404(self, client: TestClient, db: Session):
        """Cette route supprime l'emploi du temps existant avant de régénérer."""
        a, b = Ecole(db, "EAA"), Ecole(db, "EAB")
        creneau_b = b.creneau(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/emploi-du-temps/auto-generation/{b.classe.classe_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(CreneauEmploi).filter(CreneauEmploi.creneau_id == creneau_b.creneau_id).first() is not None

    def test_stats_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ESA"), Ecole(db, "ESB")
        a.creneau(db)
        b.creneau(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/emploi-du-temps/stats", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total_creneaux"] == 1
        assert resp.json()["classes_total"] == 1


# ══════════════════════════════════════════════════════════════
# ANNÉE SCOLAIRE — clôture
# ══════════════════════════════════════════════════════════════

class TestAnneeScolaireIsolation:
    def test_verification_cloture_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "AVA"), Ecole(db, "AVB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.get(f"/api/annee-scolaire/{b.annee.annee_id}/verification-cloture", headers=headers)
        assert resp.status_code == 404

    def test_cloturer_comptabilite_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ACA"), Ecole(db, "ACB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/annee-scolaire/{b.annee.annee_id}/cloturer-comptabilite", headers=headers)
        assert resp.status_code == 404
        db.refresh(b.annee)
        assert b.annee.statut == "EN_COURS"

    def test_archiver_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "AAA"), Ecole(db, "AAB")
        b.annee.statut = "CLOTURE_COMPTABLE"
        db.commit()
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/annee-scolaire/{b.annee.annee_id}/archiver", headers=headers)
        assert resp.status_code == 404
        db.refresh(b.annee)
        assert b.annee.statut == "CLOTURE_COMPTABLE"


class TestSuperAdminPlateformeRefuse:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l9b.super.{uid}",
            email=f"l9b.super.{uid}@smartschool.gn", telephone=f"98000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        assert client.get("/api/emploi-du-temps/stats", headers=headers).status_code == 403
