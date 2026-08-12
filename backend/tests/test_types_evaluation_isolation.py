"""
Tests — les types d'évaluation appartiennent à chaque école.

`ss_types_evaluation` (Composition, Interrogation, Oral…) était une table
partagée par toute la plateforme. Le POIDS de ces types était déjà réglable par
école, mais pas leur NOM ni leur EXISTENCE : une école qui renommait
« Composition » en « Devoir de synthèse » changeait l'intitulé des colonnes de
bulletin de toutes les autres, sans que personne chez elles n'ait rien touché.

Ce n'était pas une fuite de données, c'était une école qui décidait pour les
autres. Ces tests verrouillent la séparation.
"""
import pytest
from sqlalchemy.orm import Session

from app.api.evaluations import (
    create_type_evaluation, delete_type_evaluation, get_types_evaluation,
    update_type_evaluation,
)
from app.models.academique import Etablissement, ParametreEtablissement, TypeEvaluation
from app.schemas.schemas import TypeEvaluationCreate, TypeEvaluationUpdate
from app.services.notation import get_types_evaluation_coefficients
from app.services.referentiel_evaluation import (
    TYPES_REFERENCE, amorcer_types_evaluation, types_manquants,
)
from fastapi import HTTPException

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def deux_ecoles(db: Session):
    """Deux écoles, chacune amorcée avec sa propre liste de types."""
    uid = _uid()
    a = Etablissement(code=f"TYP-A-{uid}", nom=f"École A {uid}", type_etablissement="LYCEE")
    b = Etablissement(code=f"TYP-B-{uid}", nom=f"École B {uid}", type_etablissement="LYCEE")
    db.add_all([a, b])
    db.commit()
    db.refresh(a)
    db.refresh(b)

    amorcer_types_evaluation(db, a.etablissement_id)
    amorcer_types_evaluation(db, b.etablissement_id)
    db.commit()

    yield a, b

    for etab in (a, b):
        db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etab.etablissement_id
        ).delete(synchronize_session=False)
        db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == etab.etablissement_id
        ).delete(synchronize_session=False)
        db.delete(etab)
    db.commit()


class TestAmorcage:
    def test_une_ecole_neuve_recoit_sa_liste_de_depart(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        types = db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == a.etablissement_id
        ).all()
        assert len(types) == len(TYPES_REFERENCE)
        codes = {t.code for t in types}
        assert {"EVAL", "COMPO"} <= codes
        # Le fonctionnement guinéen courant : composition qui pèse double.
        compo = next(t for t in types if t.code == "COMPO")
        assert float(compo.coefficient) == 2.0
        assert compo.statut == "ACTIF"

    def test_amorcage_rejouable_sans_doublon(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        avant = db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == a.etablissement_id
        ).count()
        assert amorcer_types_evaluation(db, a.etablissement_id) == 0
        db.commit()
        assert db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == a.etablissement_id
        ).count() == avant

    def test_amorcage_ne_reecrit_pas_un_type_deja_personnalise(self, db: Session, deux_ecoles):
        """Le point sensible : rejouer l'amorçage ne doit pas défaire le
        travail d'une école qui a renommé ses types."""
        a, _ = deux_ecoles
        compo = db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == a.etablissement_id,
            TypeEvaluation.code == "COMPO",
        ).first()
        compo.libelle = "Devoir de synthèse"
        db.commit()

        amorcer_types_evaluation(db, a.etablissement_id)
        db.commit()
        db.refresh(compo)
        assert compo.libelle == "Devoir de synthèse"
        assert types_manquants(db, a.etablissement_id) == []


class TestIsolation:
    def test_chaque_ecole_ne_voit_que_ses_types(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        types_a = get_types_evaluation(db, a.etablissement_id)
        types_b = get_types_evaluation(db, b.etablissement_id)

        assert {t.type_eval_id for t in types_a} & {t.type_eval_id for t in types_b} == set()
        assert all(t.etablissement_id == a.etablissement_id for t in types_a)

    def test_renommer_chez_a_ne_change_rien_chez_b(self, db: Session, deux_ecoles):
        """LE test qui justifie tout ce chantier."""
        a, b = deux_ecoles
        compo_a = next(t for t in get_types_evaluation(db, a.etablissement_id) if t.code == "COMPO")

        update_type_evaluation(
            compo_a.type_eval_id,
            TypeEvaluationUpdate(libelle="Devoir de synthèse"),
            db, a.etablissement_id,
        )

        compo_b = next(t for t in get_types_evaluation(db, b.etablissement_id) if t.code == "COMPO")
        assert compo_b.libelle == "Composition"

    def test_modifier_le_type_d_une_autre_ecole_repond_404(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        compo_b = next(t for t in get_types_evaluation(db, b.etablissement_id) if t.code == "COMPO")

        with pytest.raises(HTTPException) as exc:
            update_type_evaluation(
                compo_b.type_eval_id, TypeEvaluationUpdate(libelle="Pirate"),
                db, a.etablissement_id,
            )
        # 404 et non 403 : on ne confirme pas l'existence du type d'à côté.
        assert exc.value.status_code == 404
        db.rollback()
        db.refresh(compo_b)
        assert compo_b.libelle == "Composition"

    def test_supprimer_le_type_d_une_autre_ecole_repond_404(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        # TP est inactif et sans évaluation liée : supprimable en principe.
        tp_b = next(t for t in get_types_evaluation(db, b.etablissement_id) if t.code == "TP")

        with pytest.raises(HTTPException) as exc:
            delete_type_evaluation(tp_b.type_eval_id, db, a.etablissement_id)
        assert exc.value.status_code == 404
        db.rollback()
        assert db.query(TypeEvaluation).filter(
            TypeEvaluation.type_eval_id == tp_b.type_eval_id
        ).first() is not None

    def test_creation_rattachee_a_l_appelant_meme_si_le_corps_dit_autre_chose(
        self, db: Session, deux_ecoles
    ):
        a, b = deux_ecoles
        cree = create_type_evaluation(
            TypeEvaluationCreate(code=f"DEVMAISON", libelle="Devoir maison", coefficient=1),
            db, a.etablissement_id,
        )
        assert cree.etablissement_id == a.etablissement_id
        # Invisible chez B.
        assert all(t.code != "DEVMAISON" for t in get_types_evaluation(db, b.etablissement_id))

    def test_deux_ecoles_peuvent_avoir_le_meme_code(self, db: Session, deux_ecoles):
        """L'unicité du code est passée de globale à par école : sans cela,
        deux écoles ne pourraient pas avoir chacune leur « COMPO »."""
        a, b = deux_ecoles
        codes_a = {t.code for t in get_types_evaluation(db, a.etablissement_id)}
        codes_b = {t.code for t in get_types_evaluation(db, b.etablissement_id)}
        assert "COMPO" in codes_a and "COMPO" in codes_b

    def test_code_duplique_dans_la_meme_ecole_refuse(self, db: Session, deux_ecoles):
        a, _ = deux_ecoles
        with pytest.raises(HTTPException) as exc:
            create_type_evaluation(
                TypeEvaluationCreate(code="COMPO", libelle="Doublon", coefficient=1),
                db, a.etablissement_id,
            )
        assert exc.value.status_code == 409
        db.rollback()


class TestCoefficientsDuMoteur:
    def test_le_moteur_ne_lit_que_les_types_de_l_ecole(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        coefs_a = get_types_evaluation_coefficients(db, a.etablissement_id, "college")
        coefs_b = get_types_evaluation_coefficients(db, b.etablissement_id, "college")

        ids_a = {t.type_eval_id for t in get_types_evaluation(db, a.etablissement_id)}
        assert set(coefs_a) == ids_a
        assert set(coefs_a) & set(coefs_b) == set()

    def test_surcharge_de_coefficient_par_cycle_reste_isolee(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        compo_a = next(t for t in get_types_evaluation(db, a.etablissement_id) if t.code == "COMPO")
        compo_b = next(t for t in get_types_evaluation(db, b.etablissement_id) if t.code == "COMPO")

        db.add(ParametreEtablissement(
            etablissement_id=a.etablissement_id, categorie="NOTATION",
            cle="notation.coef_type.college.COMPO", valeur="5",
        ))
        db.commit()

        assert get_types_evaluation_coefficients(db, a.etablissement_id, "college")[compo_a.type_eval_id] == 5.0
        assert get_types_evaluation_coefficients(db, b.etablissement_id, "college")[compo_b.type_eval_id] == 2.0
