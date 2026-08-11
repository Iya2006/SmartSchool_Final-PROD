"""
Tests — Lot 9 passe A (chantier multi-écoles) : isolation par établissement
des modules Matières/Programme et Évaluations/Notes/Bulletins.

Points sensibles couverts :
- `POST /matieres/attribuer-programme` écrivait sur TOUTES les classes de la
  plateforme (2e écriture massive cross-école du chantier, après le PUT
  coefficients du Lot 7) ;
- `POST /matieres/auto-generation` créait les cycles manquants avec
  `etablissement_id=1` CODÉ EN DUR ;
- les notes, moyennes, bulletins et leurs PDF étaient accessibles par simple
  devinette d'ID.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Bulletin, Classe, ClasseMatiere, Cycle, Eleve, Enseignant,
    Etablissement, Evaluation, Inscription, Matiere, Niveau, Note, Trimestre,
    TypeEvaluation, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _type_eval(db: Session) -> TypeEvaluation:
    """TypeEvaluation est GLOBAL (décision produit) — partagé entre écoles."""
    te = db.query(TypeEvaluation).filter(TypeEvaluation.code == "L9DEV").first()
    if not te:
        te = TypeEvaluation(code="L9DEV", libelle="Devoir (test L9)", poids_pourcentage=100)
        db.add(te); db.commit(); db.refresh(te)
    return te


class Ecole:
    def __init__(self, db: Session, suffix: str, niveau_code: str | None = None):
        uid = _uid()
        self.etab = Etablissement(code=f"L9A-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.trimestre = Trimestre(
            annee_id=self.annee.annee_id, code=f"T1-{uid}", libelle="Trimestre 1", numero=1,
            date_debut=date(2025, 9, 1), date_fin=date(2025, 12, 20), statut="EN_COURS",
        )
        db.add(self.trimestre); db.commit(); db.refresh(self.trimestre)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(
            cycle_id=self.cycle.cycle_id, code=niveau_code or f"NV{uid}", libelle="6e", ordre=1,
        )
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere = Matiere(cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Maths", note_sur=20)
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        self.classe_matiere = ClasseMatiere(
            classe_id=self.classe.classe_id, matiere_id=self.matiere.matiere_id,
            coefficient=2, nb_heures_semaine=4, est_active="O",
        )
        db.add(self.classe_matiere); db.commit(); db.refresh(self.classe_matiere)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L9AENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"93000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L9A{uid}", nom_utilisateur=f"l9a.admin.{uid}",
            email=f"l9a.admin.{uid}@smartschool.gn", telephone=f"94000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def eleve_inscrit(self, db: Session) -> tuple[Eleve, Inscription]:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L9AELV-{uid}",
            nom="Diallo", prenom=f"E{uid}", date_naissance=date(2012, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        return eleve, insc

    def evaluation(self, db: Session) -> Evaluation:
        ev = Evaluation(
            matiere_id=self.matiere.matiere_id, classe_id=self.classe.classe_id,
            trimestre_id=self.trimestre.trimestre_id, type_eval_id=_type_eval(db).type_eval_id,
            enseignant_id=self.enseignant.enseignant_id, libelle=f"Devoir {_uid()}",
            date_evaluation=date(2025, 10, 1), note_sur=20, coefficient=1, statut="CENTRALISEE",
        )
        db.add(ev); db.commit(); db.refresh(ev)
        return ev


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ══════════════════════════════════════════════════════════════
# MATIÈRES
# ══════════════════════════════════════════════════════════════

class TestMatieresIsolation:
    def test_liste_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MLA"), Ecole(db, "MLB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.get("/api/matieres", headers=headers)
        assert resp.status_code == 200
        ids = {m["matiere_id"] for m in resp.json()}
        assert a.matiere.matiere_id in ids
        assert b.matiere.matiere_id not in ids

    def test_get_matiere_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MGA"), Ecole(db, "MGB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/matieres/{b.matiere.matiere_id}", headers=headers).status_code == 404

    def test_update_matiere_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MUA"), Ecole(db, "MUB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.put(
            f"/api/matieres/{b.matiere.matiere_id}",
            json={"cycle_id": b.cycle.cycle_id, "code": "PIRATE", "libelle": "Piraté"},
            headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(b.matiere)
        assert b.matiere.libelle != "Piraté"

    def test_delete_matiere_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MDA"), Ecole(db, "MDB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.delete(f"/api/matieres/{b.matiere.matiere_id}", headers=headers).status_code == 404
        assert db.query(Matiere).filter(Matiere.matiere_id == b.matiere.matiere_id).first() is not None

    def test_create_matiere_dans_cycle_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MCA"), Ecole(db, "MCB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            "/api/matieres",
            json={"cycle_id": b.cycle.cycle_id, "code": f"X{_uid()}", "libelle": "Injectée"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_matieres_par_classe_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MPA"), Ecole(db, "MPB")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/matieres/classe/{b.classe.classe_id}", headers=headers).status_code == 404

    def test_ajouter_matiere_a_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MAA"), Ecole(db, "MAB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            f"/api/matieres/classe/{b.classe.classe_id}/matiere",
            json={"matiere_id": b.matiere.matiere_id},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_stats_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "MSA"), Ecole(db, "MSB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.get("/api/matieres/stats", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total_matieres"] == 1
        assert resp.json()["classes_total"] == 1


class TestAttributionProgrammeMassive:
    """La 2e écriture massive cross-école du chantier."""

    def test_attribuer_programme_ne_touche_pas_les_autres_ecoles(self, client: TestClient, db: Session):
        # Niveau "7EME" a un programme configuré côté serveur (NIVEAU_TO_PROGRAMME)
        a = Ecole(db, "APA", niveau_code="7EME")
        b = Ecole(db, "APB", niveau_code="7EME")
        headers = _headers(client, a.admin.nom_utilisateur)

        nb_b_avant = db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == b.classe.classe_id
        ).count()

        resp = client.post("/api/matieres/attribuer-programme", headers=headers)
        assert resp.status_code in (201, 404)  # 404 si aucune matière du programme n'existe encore

        nb_b_apres = db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == b.classe.classe_id
        ).count()
        assert nb_b_apres == nb_b_avant, "L'école B ne doit jamais être modifiée"

    def test_attribuer_programme_classe_cross_ecole_404(self, client: TestClient, db: Session):
        a = Ecole(db, "APCA", niveau_code="7EME")
        b = Ecole(db, "APCB", niveau_code="7EME")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/matieres/attribuer-programme-classe/{b.classe.classe_id}", headers=headers)
        assert resp.status_code == 404
        # Le programme de B n'a pas été effacé (la route supprime avant de réattribuer)
        assert db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == b.classe.classe_id
        ).count() == 1

    def test_auto_generation_cree_cycles_dans_la_bonne_ecole(self, client: TestClient, db: Session):
        """Avant : Cycle(etablissement_id=1) codé en dur."""
        a = Ecole(db, "AGA")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/matieres/auto-generation", headers=headers)
        assert resp.status_code == 201, resp.text

        cycles_crees = db.query(Cycle).filter(
            Cycle.etablissement_id == a.etab.etablissement_id, Cycle.code.in_(["PRM", "CLG", "LYC"])
        ).all()
        assert len(cycles_crees) == 3, "Les 3 cycles doivent appartenir à l'école appelante"


# ══════════════════════════════════════════════════════════════
# ÉVALUATIONS / NOTES / BULLETINS
# ══════════════════════════════════════════════════════════════

class TestEvaluationsIsolation:
    def test_liste_evaluations_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ELA"), Ecole(db, "ELB")
        ev_a, ev_b = a.evaluation(db), b.evaluation(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/evaluations", headers=headers)
        assert resp.status_code == 200
        ids = {e["evaluation_id"] for e in resp.json()}
        assert ev_a.evaluation_id in ids
        assert ev_b.evaluation_id not in ids

    def test_centralisees_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ECA"), Ecole(db, "ECB")
        ev_a, ev_b = a.evaluation(db), b.evaluation(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/evaluations/centralisees", headers=headers)
        assert resp.status_code == 200
        ids = {e["evaluation_id"] for e in resp.json()}
        assert ev_a.evaluation_id in ids
        assert ev_b.evaluation_id not in ids

    def test_notes_evaluation_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ENA"), Ecole(db, "ENB")
        ev_b = b.evaluation(db)
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/evaluations/{ev_b.evaluation_id}/notes", headers=headers).status_code == 404

    def test_initialiser_notes_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EIA"), Ecole(db, "EIB")
        ev_b = b.evaluation(db)
        b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/evaluations/{ev_b.evaluation_id}/initialiser", headers=headers)
        assert resp.status_code == 404
        assert db.query(Note).filter(Note.evaluation_id == ev_b.evaluation_id).count() == 0

    def test_create_evaluation_dans_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ECRA"), Ecole(db, "ECRB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/evaluations",
            json={
                "matiere_id": b.matiere.matiere_id, "classe_id": b.classe.classe_id,
                "trimestre_id": b.trimestre.trimestre_id, "type_eval_id": _type_eval(db).type_eval_id,
                "enseignant_id": b.enseignant.enseignant_id, "libelle": "Injectée",
                "date_evaluation": "2025-10-01",
            },
            headers=headers,
        )
        assert resp.status_code == 404

    def test_batch_update_notes_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EBA"), Ecole(db, "EBB")
        ev_b = b.evaluation(db)
        _, insc_b = b.eleve_inscrit(db)
        note_b = Note(evaluation_id=ev_b.evaluation_id, inscription_id=insc_b.inscription_id, valeur=10, est_absent="N")
        db.add(note_b); db.commit(); db.refresh(note_b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/evaluations/{ev_b.evaluation_id}/notes/batch-update",
            json={"notes": [{"note_id": note_b.note_id, "valeur": 20, "est_absent": False}]},
            headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(note_b)
        assert float(note_b.valeur) == 10

    def test_calculer_moyennes_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EMA"), Ecole(db, "EMB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.post(
            f"/api/evaluations/classe/{b.classe.classe_id}/calculer-moyennes?trimestre_id={b.trimestre.trimestre_id}",
            headers=headers,
        )
        assert resp.status_code == 404

    def test_notes_centralisees_classe_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ENCA"), Ecole(db, "ENCB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.get(
            f"/api/evaluations/classe/{b.classe.classe_id}/notes-centralisees?trimestre_id={b.trimestre.trimestre_id}",
            headers=headers,
        )
        assert resp.status_code == 404


class TestNotesRouterIsolation:
    def _note_de(self, db: Session, ecole: Ecole) -> Note:
        ev = ecole.evaluation(db)
        _, insc = ecole.eleve_inscrit(db)
        n = Note(evaluation_id=ev.evaluation_id, inscription_id=insc.inscription_id, valeur=12, est_absent="N")
        db.add(n); db.commit(); db.refresh(n)
        return n

    def test_update_note_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "NUA"), Ecole(db, "NUB")
        note_b = self._note_de(db, b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(f"/api/notes/{note_b.note_id}", json={"valeur": 19}, headers=headers)
        assert resp.status_code == 404
        db.refresh(note_b)
        assert float(note_b.valeur) == 12

    def test_create_note_sur_inscription_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "NCA"), Ecole(db, "NCB")
        ev_b = b.evaluation(db)
        _, insc_b = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/notes",
            json={"evaluation_id": ev_b.evaluation_id, "inscription_id": insc_b.inscription_id, "valeur": 20},
            headers=headers,
        )
        assert resp.status_code == 404


class TestBulletinsIsolation:
    def _bulletin_de(self, db: Session, ecole: Ecole) -> Bulletin:
        _, insc = ecole.eleve_inscrit(db)
        b = Bulletin(
            inscription_id=insc.inscription_id, trimestre_id=ecole.trimestre.trimestre_id,
            moyenne_generale=14, rang=1, statut="BROUILLON",
        )
        db.add(b); db.commit(); db.refresh(b)
        return b

    def test_publier_bulletin_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BPA"), Ecole(db, "BPB")
        bulletin_b = self._bulletin_de(db, b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(f"/api/evaluations/bulletins/{bulletin_b.bulletin_id}/publier", headers=headers)
        assert resp.status_code == 404
        db.refresh(bulletin_b)
        assert bulletin_b.statut == "BROUILLON"

    def test_decision_bulletin_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BDA"), Ecole(db, "BDB")
        bulletin_b = self._bulletin_de(db, b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/evaluations/bulletins/{bulletin_b.bulletin_id}/decision",
            json={"decision": "REDOUBLE"}, headers=headers,
        )
        assert resp.status_code == 404

    def test_pdf_bulletin_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BPDFA"), Ecole(db, "BPDFB")
        bulletin_b = self._bulletin_de(db, b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/evaluations/bulletins/{bulletin_b.bulletin_id}/pdf", headers=headers)
        assert resp.status_code == 404

    def test_pdf_async_bulletin_cross_ecole_404(self, client: TestClient, db: Session):
        """Ce contrôle ne peut pas être délégué au worker : il reçoit
        l'etablissement_id réel de la classe, donc sa vérification passait."""
        a, b = Ecole(db, "BASYA"), Ecole(db, "BASYB")
        bulletin_b = self._bulletin_de(db, b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/evaluations/bulletins/{bulletin_b.bulletin_id}/pdf-async", headers=headers)
        assert resp.status_code == 404

    def test_bulletins_classe_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BCA"), Ecole(db, "BCB")
        headers = _headers(client, a.admin.nom_utilisateur)
        resp = client.get(
            f"/api/evaluations/classe/{b.classe.classe_id}/bulletins?trimestre_id={b.trimestre.trimestre_id}",
            headers=headers,
        )
        assert resp.status_code == 404

    def test_publier_tout_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BPTA"), Ecole(db, "BPTB")
        bulletin_b = self._bulletin_de(db, b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/evaluations/classe/{b.classe.classe_id}/bulletins/publier-tout?trimestre_id={b.trimestre.trimestre_id}",
            headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(bulletin_b)
        assert bulletin_b.statut == "BROUILLON"


class TestSuperAdminPlateformeRefuse:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l9a.super.{uid}",
            email=f"l9a.super.{uid}@smartschool.gn", telephone=f"95000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        assert client.get("/api/matieres", headers=headers).status_code == 403
        assert client.get("/api/evaluations", headers=headers).status_code == 403
