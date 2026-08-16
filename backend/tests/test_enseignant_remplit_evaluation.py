"""
Tests — L'enseignant REMPLIT une évaluation créée par l'administration.

Chantier B : l'enseignant ne crée plus d'évaluation, il choisit parmi celles
que l'administration lui a rattachées (une par matière lors d'une composition)
et saisit seulement les notes. On vérifie ici le nouvel endpoint de remplissage
(upsert par inscription) et le filtre par classe/matière de la liste.
"""
from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, ClasseMatiere, Cycle, Eleve, Enseignant,
    Etablissement, Evaluation, Affectation, Inscription, Matiere, Niveau,
    Note, Trimestre, TypeEvaluation,
)

_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


class Scenario:
    """Une école avec une classe, une matière, un enseignant affecté, deux
    élèves, et une évaluation créée par l'administration pour cet enseignant."""

    def __init__(self, db: Session):
        uid = _uid()
        self.etab = Etablissement(code=f"REMP-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle="2025-2026",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.trimestre = Trimestre(
            annee_id=self.annee.annee_id, code=f"T1-{uid}", libelle="1er Trimestre",
            numero=1, date_debut=date(2025, 9, 1), date_fin=date(2025, 12, 20), statut="EN_COURS",
        )
        db.add(self.trimestre); db.commit(); db.refresh(self.trimestre)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)
        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)
        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle="6e A", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere = Matiere(cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Maths", note_sur=20)
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)
        db.add(ClasseMatiere(
            classe_id=self.classe.classe_id, matiere_id=self.matiere.matiere_id,
            coefficient=2, nb_heures_semaine=4, est_active="O",
        )); db.commit()

        self.type_eval = TypeEvaluation(
            etablissement_id=self.etab.etablissement_id, code=f"EV{uid}", libelle="Évaluation",
            coefficient=1, statut="ACTIF",
        )
        db.add(self.type_eval); db.commit(); db.refresh(self.type_eval)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"620{uid:06d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)
        db.add(Affectation(
            enseignant_id=self.enseignant.enseignant_id, matiere_id=self.matiere.matiere_id,
            classe_id=self.classe.classe_id, annee_id=self.annee.annee_id,
            nb_heures_semaine=4, statut="ACTIVE",
        )); db.commit()

        # Deux élèves inscrits.
        self.inscriptions = []
        for i in range(2):
            euid = _uid()
            eleve = Eleve(
                etablissement_id=self.etab.etablissement_id, matricule=f"ELV-{euid}",
                nom=f"Diallo{i}", prenom="Aissatou", sexe="F", date_naissance=date(2014, 1, 1),
                statut="ACTIF",
            )
            db.add(eleve); db.commit(); db.refresh(eleve)
            insc = Inscription(
                eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id,
                annee_id=self.annee.annee_id, statut="ACTIVE",
            )
            db.add(insc); db.commit(); db.refresh(insc)
            self.inscriptions.append(insc)

        # Évaluation créée par l'administration, rattachée à l'enseignant.
        self.evaluation = Evaluation(
            matiere_id=self.matiere.matiere_id, classe_id=self.classe.classe_id,
            trimestre_id=self.trimestre.trimestre_id, type_eval_id=self.type_eval.type_eval_id,
            enseignant_id=self.enseignant.enseignant_id, libelle="Composition du 1er trimestre",
            date_evaluation=date(2025, 11, 15), note_sur=20, coefficient=1, statut="PLANIFIEE",
        )
        db.add(self.evaluation); db.commit(); db.refresh(self.evaluation)


def _mock(enseignant_id: int):
    return patch("app.core.auth.decode_token", return_value={
        "sub": str(enseignant_id), "type": "enseignant", "nom": "Ens",
    })


def _headers():
    return {"Authorization": "Bearer fake_enseignant"}


class TestEnseignantRemplitEvaluation:

    def test_liste_filtree_par_classe_matiere(self, client: TestClient, db: Session):
        s = Scenario(db)
        with _mock(s.enseignant.enseignant_id):
            r = client.get(
                f"/api/portail-enseignant/{s.enseignant.enseignant_id}/evaluations"
                f"?classe_id={s.classe.classe_id}&matiere_id={s.matiere.matiere_id}",
                headers=_headers(),
            )
        assert r.status_code == 200, r.text
        ids = [e["evaluation_id"] for e in r.json()]
        assert s.evaluation.evaluation_id in ids

    def test_remplir_puis_corriger(self, client: TestClient, db: Session):
        s = Scenario(db)
        i0, i1 = s.inscriptions[0].inscription_id, s.inscriptions[1].inscription_id

        with _mock(s.enseignant.enseignant_id):
            # Première saisie : une note, un absent.
            r = client.post(
                f"/api/portail-enseignant/{s.enseignant.enseignant_id}/evaluations/{s.evaluation.evaluation_id}/saisir",
                json={"notes": [
                    {"inscription_id": i0, "valeur": 15, "est_absent": False},
                    {"inscription_id": i1, "valeur": None, "est_absent": True},
                ]},
                headers=_headers(),
            )
        assert r.status_code == 200, r.text
        assert r.json()["nb_notes"] == 2

        note0 = db.query(Note).filter(Note.evaluation_id == s.evaluation.evaluation_id, Note.inscription_id == i0).first()
        assert note0 is not None and float(note0.valeur) == 15
        note1 = db.query(Note).filter(Note.evaluation_id == s.evaluation.evaluation_id, Note.inscription_id == i1).first()
        assert note1 is not None and note1.est_absent == "O"

        # L'évaluation planifiée est passée publiée.
        db.refresh(s.evaluation)
        assert s.evaluation.statut == "PUBLIEE"

        # Deuxième passage : on corrige la note du premier (upsert, pas de doublon).
        with _mock(s.enseignant.enseignant_id):
            r = client.post(
                f"/api/portail-enseignant/{s.enseignant.enseignant_id}/evaluations/{s.evaluation.evaluation_id}/saisir",
                json={"notes": [{"inscription_id": i0, "valeur": 18, "est_absent": False}]},
                headers=_headers(),
            )
        assert r.status_code == 200, r.text
        nb = db.query(Note).filter(Note.evaluation_id == s.evaluation.evaluation_id, Note.inscription_id == i0).count()
        assert nb == 1
        db.refresh(note0)
        assert float(note0.valeur) == 18

    def test_classement_se_calcule_des_les_notes_saisies(self, client: TestClient, db: Session):
        """Le classement de suivi donne une moyenne dès que l'enseignant a
        rempli les notes (évaluation « Publiée »), sans attendre la
        centralisation."""
        from app.services.notation import calculer_resultats_periode
        s = Scenario(db)
        i0, i1 = s.inscriptions[0].inscription_id, s.inscriptions[1].inscription_id
        with _mock(s.enseignant.enseignant_id):
            client.post(
                f"/api/portail-enseignant/{s.enseignant.enseignant_id}/evaluations/{s.evaluation.evaluation_id}/saisir",
                json={"notes": [
                    {"inscription_id": i0, "valeur": 16, "est_absent": False},
                    {"inscription_id": i1, "valeur": 12, "est_absent": False},
                ]},
                headers=_headers(),
            )
        res = calculer_resultats_periode(
            db, s.classe.classe_id, s.trimestre.trimestre_id,
            evaluation_ids=[s.evaluation.evaluation_id], persist=False,
            statuts_inclus=["PUBLIEE", "CENTRALISEE", "CALCULE"],
        )
        moyennes = {e["inscription_id"]: e["moyenne_generale"] for e in res["resultats"]}
        assert moyennes[i0] is not None and moyennes[i0] > 0
        assert moyennes[i1] is not None and moyennes[i1] > 0
        # Le mieux noté est premier.
        assert moyennes[i0] > moyennes[i1]

    def test_note_hors_bareme_refusee(self, client: TestClient, db: Session):
        s = Scenario(db)
        with _mock(s.enseignant.enseignant_id):
            r = client.post(
                f"/api/portail-enseignant/{s.enseignant.enseignant_id}/evaluations/{s.evaluation.evaluation_id}/saisir",
                json={"notes": [{"inscription_id": s.inscriptions[0].inscription_id, "valeur": 25, "est_absent": False}]},
                headers=_headers(),
            )
        assert r.status_code == 400  # 25 > barème 20

    def test_autre_enseignant_ne_remplit_pas(self, client: TestClient, db: Session):
        s = Scenario(db)
        autre = Enseignant(
            etablissement_id=s.etab.etablissement_id, matricule=f"ENS-X{_uid()}",
            nom="X", prenom="Y", sexe="M", telephone=f"621{_uid():06d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(autre); db.commit(); db.refresh(autre)
        with _mock(autre.enseignant_id):
            r = client.post(
                f"/api/portail-enseignant/{autre.enseignant_id}/evaluations/{s.evaluation.evaluation_id}/saisir",
                json={"notes": [{"inscription_id": s.inscriptions[0].inscription_id, "valeur": 10, "est_absent": False}]},
                headers=_headers(),
            )
        assert r.status_code == 404  # l'évaluation n'est pas la sienne


class TestClassementSurEvaluationPlanifiee:
    """Une composition remplie côté ADMINISTRATION reste PLANIFIEE ; son
    classement de suivi doit quand même sortir les moyennes."""

    def test_moyenne_calculee_meme_si_planifiee(self, client: TestClient, db: Session):
        from app.services.notation import calculer_resultats_periode
        s = Scenario(db)  # evaluation créée en statut PLANIFIEE
        # Notes posées directement (comme un remplissage admin qui ne change
        # pas le statut de l'évaluation).
        for insc, val in zip(s.inscriptions, [14, 11]):
            db.add(Note(evaluation_id=s.evaluation.evaluation_id,
                        inscription_id=insc.inscription_id, valeur=val, est_absent="N"))
        db.commit()
        assert s.evaluation.statut == "PLANIFIEE"

        res = calculer_resultats_periode(
            db, s.classe.classe_id, s.trimestre.trimestre_id,
            evaluation_ids=[s.evaluation.evaluation_id], persist=False,
            statuts_inclus=["PLANIFIEE", "PUBLIEE", "CENTRALISEE", "CALCULE"],
        )
        moys = {e["inscription_id"]: e["moyenne_generale"] for e in res["resultats"]}
        assert all(v is not None and v > 0 for v in moys.values()), moys
