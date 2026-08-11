"""
Tests — correctifs des défauts « école 1 » (chantier multi-écoles).

Plusieurs fonctions internes portaient `etablissement_id: int = 1` et leurs
appelants ne passaient pas l'argument : chaque établissement se voyait donc
appliquer les paramètres de notation de l'établissement 1. Ces tests
verrouillent le fait que les paramètres lus sont bien ceux de l'établissement
demandé, et que la valeur 1 n'est plus jamais un repli implicite.

ADAPTÉ À LA FUSION DU MOTEUR DE NOTATION
----------------------------------------
Ce fichier visait à l'origine des fonctions de `app.api.evaluations`. Elles
vivent désormais dans `app.services.notation`, source unique partagée avec le
portail enseignant — les importer d'ici garde exactement la même couverture.

Deux d'entre elles ont disparu avec la règle métier qu'elles portaient :

* `get_poids_evaluations` lisait `notation.poids_{ecrit,oral,composition}`,
  trois catégories figées en dur. Les écoles configurent maintenant un
  coefficient par TYPE d'évaluation, par cycle
  (`notation.coef_type.{cycle}.{code}`) — d'où le remplacement par
  `get_types_evaluation_coefficients`, qui prend le même `etablissement_id`.
* `coefficient_pour_evaluation` en dérivait ; le coefficient d'une épreuve se
  résout aujourd'hui via `coefficient_effectif`, qui ne lit plus aucun
  paramètre d'établissement (il reçoit la table des coefficients déjà résolue).
  Le contrôle « pas de repli sur l'école 1 » porte donc sur la fonction qui lit
  réellement la configuration.

L'intention du test est inchangée : aucun repli implicite, et les réglages
d'une école ne débordent jamais sur une autre.
"""
import inspect
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models.academique import Etablissement, ParametreEtablissement, TypeEvaluation
from app.services.notation import (
    get_bareme_defaut_cycle, get_bulletin_display_flags, get_lettres_config,
    get_mention, get_notation_seuils, get_rang_mode, get_seuil_passage,
    get_types_evaluation_coefficients,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def deux_etablissements(db: Session):
    """École A avec des seuils/coefficients personnalisés, école B sans réglage."""
    uid = _uid()
    a = Etablissement(code=f"DEF-A-{uid}", nom=f"École A {uid}", type_etablissement="LYCEE")
    b = Etablissement(code=f"DEF-B-{uid}", nom=f"École B {uid}", type_etablissement="LYCEE")
    db.add_all([a, b])
    db.commit()
    db.refresh(a)
    db.refresh(b)

    # Seuils de mentions volontairement très différents des valeurs par défaut
    for cle, valeur in [
        ("notation.mention.college.tb", "18"),
        ("notation.mention.college.b", "17"),
        ("notation.mention.college.ab", "16"),
        ("notation.mention.college.p", "15"),
    ]:
        db.add(ParametreEtablissement(
            etablissement_id=a.etablissement_id, categorie="NOTATION", cle=cle, valeur=valeur,
        ))
    db.commit()
    return a, b


class TestParametreObligatoire:
    """Aucune de ces fonctions ne doit plus pouvoir être appelée sans
    établissement : un défaut ferait silencieusement retomber sur l'école 1."""

    @pytest.mark.parametrize("fonction", [
        get_notation_seuils, get_mention, get_bulletin_display_flags,
        get_types_evaluation_coefficients, get_bareme_defaut_cycle,
        get_seuil_passage, get_lettres_config, get_rang_mode,
    ])
    def test_etablissement_id_est_sans_valeur_par_defaut(self, fonction):
        param = inspect.signature(fonction).parameters["etablissement_id"]
        assert param.default is inspect.Parameter.empty, (
            f"{fonction.__name__} a de nouveau une valeur par défaut pour "
            f"etablissement_id ({param.default!r}) — repli silencieux possible."
        )


class TestSeuilsEtCoefficientsParEtablissement:
    def test_seuils_lus_pour_le_bon_etablissement(self, db: Session, deux_etablissements):
        a, b = deux_etablissements

        seuils_a = get_notation_seuils(db, "college", a.etablissement_id)
        assert seuils_a == {"tb": 18.0, "b": 17.0, "ab": 16.0, "p": 15.0}

        # L'école B n'a rien configuré : elle garde les valeurs par défaut et
        # n'hérite JAMAIS de celles de A.
        seuils_b = get_notation_seuils(db, "college", b.etablissement_id)
        assert seuils_b != seuils_a

    def test_coefficients_de_type_lus_pour_le_bon_etablissement(
        self, db: Session, deux_etablissements
    ):
        """Remplace l'ancien test sur les poids Écrit/Oral/Composition.

        Même propriété vérifiée : la surcharge d'une école ne franchit pas la
        frontière de l'établissement.
        """
        a, b = deux_etablissements
        type_compo = db.query(TypeEvaluation).filter(TypeEvaluation.code == "COMPO").first()
        if type_compo is None:
            pytest.skip("Référentiel des types d'évaluation non amorcé dans cette base")

        db.add(ParametreEtablissement(
            etablissement_id=a.etablissement_id, categorie="NOTATION",
            cle="notation.coef_type.college.COMPO", valeur="7",
        ))
        db.commit()

        coefs_a = get_types_evaluation_coefficients(db, a.etablissement_id, "college")
        coefs_b = get_types_evaluation_coefficients(db, b.etablissement_id, "college")

        assert coefs_a[type_compo.type_eval_id] == 7.0
        # B n'a rien surchargé : elle garde le coefficient de référence du type,
        # et ne récupère jamais le 7 de A.
        assert coefs_b[type_compo.type_eval_id] == float(type_compo.coefficient or 1)
        assert coefs_b[type_compo.type_eval_id] != 7.0

    def test_mention_calculee_avec_les_seuils_de_son_etablissement(self, db: Session, deux_etablissements):
        a, b = deux_etablissements

        # 16.5 : « ASSEZ BIEN » chez A (seuil ab=16, b=17), « TRÈS BIEN » chez B
        # (seuils par défaut). Avant correction, les deux écoles recevaient la
        # même mention, celle calculée avec les seuils de l'établissement 1.
        assert get_mention(16.5, db, "college", a.etablissement_id) == "ASSEZ BIEN"
        assert get_mention(16.5, db, "college", b.etablissement_id) == "TRÈS BIEN"
