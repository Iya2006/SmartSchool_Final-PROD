"""
Correction et suppression d'une épreuve.

Une épreuve créée avec la mauvaise date, le mauvais barème ou le mauvais type
était définitive : aucune route ne supprimait une évaluation isolée, et le
`PUT` de session ne savait changer ni le barème ni le type — précisément les
deux erreurs de saisie les plus fréquentes.

Les garde-fous comptent autant que les gestes eux-mêmes : abaisser un barème
sous une note déjà saisie gonflerait la moyenne sans lever d'erreur, et
supprimer une épreuve centralisée laisserait des bulletins que plus rien ne
justifie.
"""
from datetime import date

import pytest

from app.api.evaluations import (
    _verifier_bareme_compatible, modifier_evaluation, supprimer_evaluation,
)
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Enseignant, Evaluation, Inscription,
    Matiere, Niveau, Note, Trimestre, TypeEvaluation,
)
from app.schemas.schemas import EvaluationUpdate
from fastapi import HTTPException

ETAB = 1


@pytest.fixture
def epreuve(db):
    """Une évaluation isolée, notée sur 20, avec deux notes saisies."""
    annee = AnneeScolaire(
        etablissement_id=ETAB, code="E-2025", libelle="Epreuve 2025-2026",
        date_debut=date(2025, 9, 1), date_fin=date(2026, 6, 30),
        statut="EN_COURS", est_courante="N",
    )
    cycle = Cycle(etablissement_id=ETAB, code="CLG-E", libelle="Collège Épreuve", ordre=91)
    db.add_all([annee, cycle])
    db.flush()
    niveau = Niveau(cycle_id=cycle.cycle_id, code="8E", libelle="8ème Épreuve", ordre=91)
    trimestre = Trimestre(
        annee_id=annee.annee_id, code="TE1", libelle="1er Trimestre", numero=1,
        date_debut=date(2025, 10, 1), date_fin=date(2025, 12, 20), statut="EN_COURS",
    )
    type_eval = TypeEvaluation(code="EVE", libelle="Éval Épreuve",
                               coefficient=1, statut="ACTIF")
    db.add_all([niveau, trimestre, type_eval])
    db.flush()
    matiere = Matiere(cycle_id=cycle.cycle_id, code="MATE", libelle="Maths Épreuve")
    enseignant = Enseignant(etablissement_id=ETAB, matricule="ENS-E",
                            nom="PROF", prenom="Épreuve", sexe="F",
                            telephone="000", statut="ACTIF", est_admin="N")
    db.add_all([matiere, enseignant])
    db.flush()
    classe = Classe(
        etablissement_id=ETAB, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code="8E1", libelle="8ème Épreuve 1", statut="ACTIVE",
    )
    db.add(classe)
    db.flush()

    ev = Evaluation(
        classe_id=classe.classe_id, matiere_id=matiere.matiere_id,
        trimestre_id=trimestre.trimestre_id, type_eval_id=type_eval.type_eval_id,
        enseignant_id=enseignant.enseignant_id, libelle="Évaluation d'Octobre",
        date_evaluation=date(2025, 10, 15), note_sur=20, statut="PLANIFIEE",
    )
    db.add(ev)
    db.flush()

    notes = []
    for i, valeur in enumerate((14.0, 18.0)):
        eleve = Eleve(etablissement_id=ETAB, matricule=f"E-{i}", nom="EPR", prenom=str(i),
                      date_naissance=date(2012, 1, 1), sexe="M", statut="ACTIF")
        db.add(eleve)
        db.flush()
        insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
                           annee_id=annee.annee_id, statut="ACTIVE")
        db.add(insc)
        db.flush()
        note = Note(evaluation_id=ev.evaluation_id, inscription_id=insc.inscription_id,
                    valeur=valeur, est_absent="N")
        db.add(note)
        notes.append((eleve, insc, note))
    db.commit()

    yield {"db": db, "ev": ev, "classe": classe, "trimestre": trimestre,
           "type_eval": type_eval, "matiere": matiere}

    db.query(Note).filter(Note.evaluation_id == ev.evaluation_id).delete(synchronize_session=False)
    db.query(Evaluation).filter(Evaluation.evaluation_id == ev.evaluation_id).delete(
        synchronize_session=False)
    for eleve, insc, _ in notes:
        db.delete(insc)
        db.delete(eleve)
    for o in (classe, enseignant, type_eval, matiere, trimestre, niveau, cycle, annee):
        db.delete(o)
    db.commit()


class TestCorrection:
    def test_corriger_libelle_et_bareme(self, epreuve):
        db, ev = epreuve["db"], epreuve["ev"]
        modifier_evaluation(
            ev.evaluation_id,
            EvaluationUpdate(libelle="Évaluation d'Octobre (corrigée)", note_sur=40),
            db,
        )
        db.refresh(ev)
        assert ev.libelle == "Évaluation d'Octobre (corrigée)"
        assert float(ev.note_sur) == 40

    def test_date_hors_periode_refusee(self, epreuve):
        # Le contrôle de la création doit valoir aussi pour la correction :
        # sinon on déplace après coup une épreuve dans un autre trimestre.
        db, ev = epreuve["db"], epreuve["ev"]
        with pytest.raises(HTTPException) as exc:
            modifier_evaluation(
                ev.evaluation_id, EvaluationUpdate(date_evaluation=date(2026, 3, 1)), db,
            )
        assert exc.value.status_code == 400

    def test_bareme_sous_une_note_existante_refuse(self, epreuve):
        # La note la plus haute vaut 18 : passer le barème à 10 la rendrait
        # supérieure au maximum et gonflerait la moyenne après normalisation.
        db, ev = epreuve["db"], epreuve["ev"]
        with pytest.raises(HTTPException) as exc:
            modifier_evaluation(ev.evaluation_id, EvaluationUpdate(note_sur=10), db)
        assert exc.value.status_code == 400
        assert "18" in exc.value.detail
        db.refresh(ev)
        assert float(ev.note_sur) == 20  # inchangé

    def test_bareme_nul_refuse(self, epreuve):
        db, ev = epreuve["db"], epreuve["ev"]
        with pytest.raises(HTTPException):
            modifier_evaluation(ev.evaluation_id, EvaluationUpdate(note_sur=0), db)

    def test_type_inexistant_refuse(self, epreuve):
        db, ev = epreuve["db"], epreuve["ev"]
        with pytest.raises(HTTPException) as exc:
            modifier_evaluation(ev.evaluation_id, EvaluationUpdate(type_eval_id=999999), db)
        assert exc.value.status_code == 404

    def test_surcharge_de_coefficient_puis_retrait(self, epreuve):
        db, ev = epreuve["db"], epreuve["ev"]
        modifier_evaluation(ev.evaluation_id, EvaluationUpdate(coefficient_override=3), db)
        db.refresh(ev)
        assert float(ev.coefficient_override) == 3

        # `null` explicite = revenir au coefficient du type. Sans cette
        # distinction, une surcharge posée par erreur restait à vie.
        modifier_evaluation(
            ev.evaluation_id,
            EvaluationUpdate.model_validate({"coefficient_override": None}), db,
        )
        db.refresh(ev)
        assert ev.coefficient_override is None

    def test_coefficient_negatif_refuse(self, epreuve):
        db, ev = epreuve["db"], epreuve["ev"]
        with pytest.raises(HTTPException):
            modifier_evaluation(ev.evaluation_id, EvaluationUpdate(coefficient_override=-1), db)


class TestVerificationBareme:
    def test_bareme_egal_a_la_note_max_accepte(self, epreuve):
        _verifier_bareme_compatible(epreuve["db"], [epreuve["ev"].evaluation_id], 18)

    def test_sans_evaluation_ne_fait_rien(self, epreuve):
        _verifier_bareme_compatible(epreuve["db"], [], 1)


class TestSuppression:
    def test_supprimer_efface_l_epreuve_et_ses_notes(self, epreuve):
        db, ev = epreuve["db"], epreuve["ev"]
        eval_id = ev.evaluation_id
        res = supprimer_evaluation(eval_id, db)

        assert res["notes_supprimees"] == 2
        assert db.query(Evaluation).filter(Evaluation.evaluation_id == eval_id).first() is None
        assert db.query(Note).filter(Note.evaluation_id == eval_id).count() == 0

    def test_epreuve_centralisee_refusee(self, epreuve):
        # Ses notes comptent déjà dans des bulletins : le bon geste est de
        # l'annuler, pas de l'effacer.
        db, ev = epreuve["db"], epreuve["ev"]
        ev.statut = "CENTRALISEE"
        db.commit()
        with pytest.raises(HTTPException) as exc:
            supprimer_evaluation(ev.evaluation_id, db)
        assert exc.value.status_code == 400
        assert "Annulée" in exc.value.detail
        assert db.query(Note).filter(Note.evaluation_id == ev.evaluation_id).count() == 2

    def test_epreuve_inexistante(self, epreuve):
        with pytest.raises(HTTPException) as exc:
            supprimer_evaluation(999999, epreuve["db"])
        assert exc.value.status_code == 404
