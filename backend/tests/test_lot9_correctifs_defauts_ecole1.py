"""
Tests — correctifs des défauts « école 1 » (chantier multi-écoles).

Plusieurs fonctions internes portaient `etablissement_id: int = 1` et leurs
appelants ne passaient pas l'argument : chaque établissement se voyait donc
appliquer les paramètres de notation de l'établissement 1. Ces tests
verrouillent le fait que les paramètres lus sont bien ceux de l'établissement
demandé, et que la valeur 1 n'est plus jamais un repli implicite.
"""
import inspect
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.api.evaluations import (
    coefficient_pour_evaluation, get_bulletin_display_flags, get_mention,
    get_notation_seuils, get_poids_evaluations,
)
from app.models.academique import Etablissement, ParametreEtablissement

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def deux_etablissements(db: Session):
    """École A avec des seuils/poids personnalisés, école B sans réglage."""
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
        ("notation.poids_ecrit", "5"),
        ("notation.poids_oral", "6"),
        ("notation.poids_composition", "7"),
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
        get_notation_seuils, get_poids_evaluations, coefficient_pour_evaluation,
        get_bulletin_display_flags, get_mention,
    ])
    def test_etablissement_id_est_sans_valeur_par_defaut(self, fonction):
        param = inspect.signature(fonction).parameters["etablissement_id"]
        assert param.default is inspect.Parameter.empty, (
            f"{fonction.__name__} a de nouveau une valeur par défaut pour "
            f"etablissement_id ({param.default!r}) — repli silencieux possible."
        )


class TestSeuilsEtPoidsParEtablissement:
    def test_seuils_lus_pour_le_bon_etablissement(self, db: Session, deux_etablissements):
        a, b = deux_etablissements

        seuils_a = get_notation_seuils(db, "college", a.etablissement_id)
        assert seuils_a == {"tb": 18.0, "b": 17.0, "ab": 16.0, "p": 15.0}

        # L'école B n'a rien configuré : elle garde les valeurs par défaut et
        # n'hérite JAMAIS de celles de A.
        seuils_b = get_notation_seuils(db, "college", b.etablissement_id)
        assert seuils_b != seuils_a

    def test_poids_lus_pour_le_bon_etablissement(self, db: Session, deux_etablissements):
        a, b = deux_etablissements

        assert get_poids_evaluations(db, a.etablissement_id) == {
            "ecrite": 5.0, "orale": 6.0, "composition": 7.0,
        }
        assert get_poids_evaluations(db, b.etablissement_id) == {
            "ecrite": 1.0, "orale": 1.0, "composition": 2.0,
        }

    def test_mention_calculee_avec_les_seuils_de_son_etablissement(self, db: Session, deux_etablissements):
        a, b = deux_etablissements

        # 16.5 : « ASSEZ BIEN » chez A (seuil ab=16, b=17), « TRÈS BIEN » chez B
        # (seuils par défaut). Avant correction, les deux écoles recevaient la
        # même mention, celle calculée avec les seuils de l'établissement 1.
        assert get_mention(16.5, db, "college", a.etablissement_id) == "ASSEZ BIEN"
        assert get_mention(16.5, db, "college", b.etablissement_id) == "TRÈS BIEN"
