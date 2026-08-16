"""
Tests — Lot 4 (chantier multi-écoles) : isolation par établissement ET par
enseignant du module Examens.

Scénario explicitement visé par ce lot : avant correction, n'importe quel
compte EXAMENS_ROLES (y compris un simple enseignant) pouvait télécharger le
sujet d'un collègue — voire d'une autre école — avant l'examen, sans aucune
vérification.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, EmploiExamen, Enseignant, Etablissement,
    Matiere, Niveau, SujetExamen, Trimestre, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"L4-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        # Une période réelle est désormais nécessaire pour déposer un sujet :
        # le module n'impose plus « trimestre 1/2/3 » en dur, il résout la
        # période dans le calendrier de l'école (une école à deux semestres
        # n'a pas de T3). Sans période configurée, le dépôt répond 400.
        self.trimestre = Trimestre(
            annee_id=self.annee.annee_id, code=f"T1-{uid}", libelle="1er Trimestre",
            numero=1, date_debut=date(2025, 9, 1), date_fin=date(2025, 12, 20),
            statut="EN_COURS",
        )
        db.add(self.trimestre); db.commit(); db.refresh(self.trimestre)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Secondaire", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere = Matiere(cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Mathématiques")
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L4ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"73000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L4{uid}", nom_utilisateur=f"l4.admin.{uid}",
            email=f"l4.admin.{uid}@smartschool.gn", telephone=f"74000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def ajouter_enseignant(self, db: Session) -> Enseignant:
        uid = _uid()
        ens = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L4ENS2-{uid}",
            nom="Diallo", prenom="Aissatou", sexe="F", telephone=f"75000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(ens); db.commit(); db.refresh(ens)
        return ens


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _creer_sujet(db: Session, enseignant: Enseignant, matiere: Matiere, titre: str = "Devoir") -> SujetExamen:
    sujet = SujetExamen(
        enseignant_id=enseignant.enseignant_id, matiere_id=matiere.matiere_id,
        trimestre=1, titre=titre, fichier_nom="sujet.pdf", fichier_path="fichier_test_inexistant.pdf",
        duree_minutes=60, statut="ENVOYE",
    )
    db.add(sujet); db.commit(); db.refresh(sujet)
    return sujet


class TestTelechargerSujetOwnership:
    """Le scénario de fuite explicitement visé par ce lot."""

    def test_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "TELA")
        ecole_b = Ecole(db, "TELB")
        sujet_b = _creer_sujet(db, ecole_b.enseignant, ecole_b.matiere)
        headers_a = _headers(client, ecole_a.enseignant.matricule)

        resp = client.get(f"/api/examens/sujets/{sujet_b.sujet_id}/fichier", headers=headers_a)
        assert resp.status_code == 404

    def test_cross_enseignant_meme_ecole_403(self, client: TestClient, db: Session):
        ecole = Ecole(db, "TELC")
        collegue = ecole.ajouter_enseignant(db)
        sujet_collegue = _creer_sujet(db, collegue, ecole.matiere)
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.get(f"/api/examens/sujets/{sujet_collegue.sujet_id}/fichier", headers=headers)
        assert resp.status_code == 403

    def test_admin_meme_ecole_autorise(self, client: TestClient, db: Session):
        ecole = Ecole(db, "TELD")
        sujet = _creer_sujet(db, ecole.enseignant, ecole.matiere)
        headers = _headers(client, ecole.admin.nom_utilisateur)

        resp = client.get(f"/api/examens/sujets/{sujet.sujet_id}/fichier", headers=headers)
        # 404 "fichier non trouvé sur le serveur" est acceptable (le fichier
        # réel n'existe pas dans ce test) — ce qui compte est l'ABSENCE de 403.
        assert resp.status_code in (200, 404)
        if resp.status_code == 404:
            assert "serveur" in resp.json()["detail"].lower()

    def test_auteur_lui_meme_autorise(self, client: TestClient, db: Session):
        ecole = Ecole(db, "TELE")
        sujet = _creer_sujet(db, ecole.enseignant, ecole.matiere)
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.get(f"/api/examens/sujets/{sujet.sujet_id}/fichier", headers=headers)
        assert resp.status_code in (200, 404)
        if resp.status_code == 404:
            assert "serveur" in resp.json()["detail"].lower()


class TestUploadSujetOwnership:
    def test_upload_pour_enseignant_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "UPA")
        ecole_b = Ecole(db, "UPB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/examens/sujets/upload",
            data={
                "enseignant_id": ecole_b.enseignant.enseignant_id,
                "matiere_id": ecole_a.matiere.matiere_id,
                "trimestre": 1, "titre": "Test", "duree_minutes": 60,
            },
            files={"fichier": ("sujet.pdf", b"contenu", "application/pdf")},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_enseignant_ne_peut_pas_usurper_un_collegue(self, client: TestClient, db: Session):
        ecole = Ecole(db, "UPC")
        collegue = ecole.ajouter_enseignant(db)
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.post(
            "/api/examens/sujets/upload",
            data={
                "enseignant_id": collegue.enseignant_id,
                "matiere_id": ecole.matiere.matiere_id,
                "trimestre": 1, "titre": "Test", "duree_minutes": 60,
            },
            files={"fichier": ("sujet.pdf", b"contenu", "application/pdf")},
            headers=headers,
        )
        assert resp.status_code == 403

    def test_upload_normal_fonctionne(self, client: TestClient, db: Session):
        ecole = Ecole(db, "UPOK")
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.post(
            "/api/examens/sujets/upload",
            data={
                "enseignant_id": ecole.enseignant.enseignant_id,
                "matiere_id": ecole.matiere.matiere_id,
                "trimestre": 1, "titre": "Devoir surveillé", "duree_minutes": 90,
            },
            files={"fichier": ("sujet.pdf", b"contenu", "application/pdf")},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    def test_upload_avec_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "UPCLA")
        ecole_b = Ecole(db, "UPCLB")
        headers_a = _headers(client, ecole_a.enseignant.matricule)

        resp = client.post(
            "/api/examens/sujets/upload",
            data={
                "enseignant_id": ecole_a.enseignant.enseignant_id,
                "matiere_id": ecole_a.matiere.matiere_id,
                "classe_id": ecole_b.classe.classe_id,
                "trimestre": 1, "titre": "Test", "duree_minutes": 60,
            },
            files={"fichier": ("sujet.pdf", b"contenu", "application/pdf")},
            headers=headers_a,
        )
        assert resp.status_code == 404


class TestListeSujetsIsolee:
    def test_isolee_par_etablissement(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LSTA")
        ecole_b = Ecole(db, "LSTB")
        sujet_a = _creer_sujet(db, ecole_a.enseignant, ecole_a.matiere, titre="Sujet A")
        sujet_b = _creer_sujet(db, ecole_b.enseignant, ecole_b.matiere, titre="Sujet B")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/examens/sujets", headers=headers_a)
        assert resp.status_code == 200
        ids = {s["sujet_id"] for s in resp.json()}
        assert sujet_a.sujet_id in ids
        assert sujet_b.sujet_id not in ids

    def test_enseignant_ne_voit_que_ses_propres_sujets(self, client: TestClient, db: Session):
        ecole = Ecole(db, "LSTC")
        collegue = ecole.ajouter_enseignant(db)
        sujet_propre = _creer_sujet(db, ecole.enseignant, ecole.matiere, titre="Le mien")
        sujet_collegue = _creer_sujet(db, collegue, ecole.matiere, titre="Celui du collègue")
        headers = _headers(client, ecole.enseignant.matricule)

        # Tente explicitement de filtrer sur le collègue — doit être ignoré.
        resp = client.get(f"/api/examens/sujets?enseignant_id={collegue.enseignant_id}", headers=headers)
        assert resp.status_code == 200
        ids = {s["sujet_id"] for s in resp.json()}
        assert sujet_propre.sujet_id in ids
        assert sujet_collegue.sujet_id not in ids


class TestModifierSupprimerOwnership:
    def test_supprimer_sujet_cross_enseignant_refuse(self, client: TestClient, db: Session):
        ecole = Ecole(db, "DELA")
        collegue = ecole.ajouter_enseignant(db)
        sujet = _creer_sujet(db, collegue, ecole.matiere)
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.delete(f"/api/examens/sujets/{sujet.sujet_id}", headers=headers)
        assert resp.status_code == 403
        assert db.query(SujetExamen).filter(SujetExamen.sujet_id == sujet.sujet_id).first() is not None

    def test_modifier_sujet_cross_enseignant_refuse(self, client: TestClient, db: Session):
        ecole = Ecole(db, "MODA")
        collegue = ecole.ajouter_enseignant(db)
        sujet = _creer_sujet(db, collegue, ecole.matiere)
        sujet.statut = "BROUILLON"
        db.commit()
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.put(
            f"/api/examens/sujets/{sujet.sujet_id}/modifier",
            json={"titre": "Piraté", "duree_minutes": 999, "trimestre": 2},
            headers=headers,
        )
        assert resp.status_code == 403


class TestEmploiExamenIsolation:
    def test_creer_et_lister_emploi_isole(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "EMPA")
        ecole_b = Ecole(db, "EMPB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        resp = client.post(
            "/api/examens/emploi",
            json={"trimestre": 1, "titre": "Examens T1", "date_debut": "2026-01-10", "date_fin": "2026-01-20"},
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        emploi_id = resp.json()["emploi_examen_id"]

        resp_liste_b = client.get("/api/examens/emploi", headers=headers_b)
        assert resp_liste_b.status_code == 200
        assert all(e["emploi_examen_id"] != emploi_id for e in resp_liste_b.json())

        resp_detail_b = client.get(f"/api/examens/emploi/{emploi_id}", headers=headers_b)
        assert resp_detail_b.status_code == 404

    def test_ajouter_creneau_avec_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CREA")
        ecole_b = Ecole(db, "CREB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/examens/emploi",
            json={"trimestre": 1, "titre": "Examens T1", "date_debut": "2026-01-10", "date_fin": "2026-01-20"},
            headers=headers_a,
        )
        emploi_id = resp.json()["emploi_examen_id"]

        resp = client.post(
            f"/api/examens/emploi/{emploi_id}/creneaux",
            json={
                "classe_id": ecole_b.classe.classe_id, "matiere_id": ecole_a.matiere.matiere_id,
                "date_examen": "2026-01-12", "heure_debut": "08:00", "heure_fin": "10:00",
            },
            headers=headers_a,
        )
        assert resp.status_code == 404


class TestSuperAdminPlateformeRefuseSurExamens:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l4.super.{uid}",
            email=f"l4.super.{uid}@smartschool.gn", telephone=f"76000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/examens/sujets", headers=headers)
        assert resp.status_code == 403


class TestListeSujetsEnseignantNeTombePasEnErreur:
    """Régression : `GET /api/examens/sujets` renvoyait 500 pour un compte
    enseignant.

    Le filtre « mes propres sujets » comparait la colonne entière
    enseignant_id au « sub » du jeton, qui est une chaîne. PostgreSQL refuse
    « integer = character varying » : le Centre des Examens tombait en erreur
    dès qu'un enseignant ouvrait la liste de ses sujets.
    """

    def test_enseignant_liste_ses_sujets_200(self, client: TestClient, db: Session):
        ecole = Ecole(db, "LISTE")
        _creer_sujet(db, ecole.enseignant, ecole.matiere, titre="Compo maths")
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.get("/api/examens/sujets", headers=headers)
        assert resp.status_code == 200, resp.text
        titres = [s["titre"] for s in resp.json()]
        assert "Compo maths" in titres

    def test_enseignant_ne_voit_que_ses_sujets(self, client: TestClient, db: Session):
        ecole = Ecole(db, "LISTE2")
        collegue = ecole.ajouter_enseignant(db)
        _creer_sujet(db, ecole.enseignant, ecole.matiere, titre="A moi")
        _creer_sujet(db, collegue, ecole.matiere, titre="Au collegue")
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.get("/api/examens/sujets", headers=headers)
        assert resp.status_code == 200, resp.text
        titres = [s["titre"] for s in resp.json()]
        assert "A moi" in titres
        assert "Au collegue" not in titres
