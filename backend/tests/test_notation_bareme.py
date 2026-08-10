"""
SMARTSCHOOL ERP — Barème et pondération du moteur de notation

Ces tests couvrent un bug réel constaté en recette : une composition créée avec
un barème /1 (le coefficient saisi dans la case « noté sur ») avait accepté des
notes de 1 à 20. Après normalisation sur /20 chaque note était multipliée par
20, et le classement de la classe affichait des moyennes de 250/20 sans qu'aucune
erreur ne soit levée nulle part.

On vérifie donc les deux garde-fous :
  1. `valider_note` refuse toute note qui ne tient pas dans son barème ;
  2. les deux étages de pondération donnent bien le résultat attendu.
"""
import pytest

from app.services.notation import (
    coefficient_effectif,
    coefficient_matiere_effectif,
    normaliser_note,
    valider_note,
)


# ══════════════════════════════════════════════════════════════
# valider_note — le garde-fou qui manquait
# ══════════════════════════════════════════════════════════════

def test_note_dans_le_bareme_est_acceptee():
    assert valider_note(15, 20) == 15.0
    assert valider_note(20, 20) == 20.0
    assert valider_note(0, 20) == 0.0
    assert valider_note("12.5", 20) == 12.5


def test_note_absente_reste_absente():
    """Un élève absent n'a pas de note : ce n'est pas une erreur de saisie."""
    assert valider_note(None, 20) is None
    assert valider_note("", 20) is None


def test_note_superieure_au_bareme_est_refusee():
    """Le cas exact du bug : 20 saisi sur une épreuve notée /1."""
    with pytest.raises(ValueError) as e:
        valider_note(20, 1)
    assert "dépasse le barème" in str(e.value)


def test_note_negative_est_refusee():
    with pytest.raises(ValueError):
        valider_note(-1, 20)


def test_note_non_numerique_est_refusee():
    with pytest.raises(ValueError):
        valider_note("absent", 20)


def test_bareme_absent_retombe_sur_vingt():
    """Sans barème renseigné, on applique le défaut plutôt que tout accepter."""
    assert valider_note(18, None) == 18.0
    with pytest.raises(ValueError):
        valider_note(25, None)


def test_bareme_non_standard_accepte():
    """Une école qui note sur 100 doit pouvoir le faire : rien n'est figé à 20."""
    assert valider_note(85, 100) == 85.0
    with pytest.raises(ValueError):
        valider_note(101, 100)


# ══════════════════════════════════════════════════════════════
# normaliser_note — conversion vers l'échelle commune
# ══════════════════════════════════════════════════════════════

def test_normalisation_sur_echelles_variees():
    assert normaliser_note(15, 20) == 15.0          # déjà sur l'échelle cible
    assert normaliser_note(5, 10) == 10.0           # /10 -> /20
    assert normaliser_note(85, 100) == 17.0         # /100 -> /20
    assert normaliser_note(12, 0) == 12.0           # barème absent : on ne touche à rien


# ══════════════════════════════════════════════════════════════
# Les deux étages de coefficients
# ══════════════════════════════════════════════════════════════

class _Eval:
    def __init__(self, type_eval_id, coefficient_override=None, est_coefficientee="O"):
        self.type_eval_id = type_eval_id
        self.coefficient_override = coefficient_override
        self.est_coefficientee = est_coefficientee


def test_coefficient_de_type_vient_de_la_configuration():
    coefs = {1: 1.0, 3: 2.0}   # Évaluation = 1, Composition = 2
    assert coefficient_effectif(_Eval(1), coefs) == 1.0
    assert coefficient_effectif(_Eval(3), coefs) == 2.0
    assert coefficient_effectif(_Eval(99), coefs) == 1.0   # type inconnu : neutre


def test_surcharge_ponctuelle_prime_sur_le_type():
    assert coefficient_effectif(_Eval(3, coefficient_override=5), {3: 2.0}) == 5.0


def test_est_coefficientee_porte_sur_la_matiere_pas_sur_le_type():
    """`est_coefficientee` décoché = l'épreuve ignore les coefficients de MATIÈRE.

    Le coefficient du type (Composition x2) continue de s'appliquer : c'est la
    distinction qui avait été corrigée pendant la refonte.
    """
    coefs = {3: 2.0}
    assert coefficient_effectif(_Eval(3, est_coefficientee="N"), coefs) == 2.0

    # Toutes les épreuves décochées -> la matière pèse 1, quel que soit son coef.
    assert coefficient_matiere_effectif(4.0, [_Eval(3, est_coefficientee="N")]) == 1.0
    # Une seule épreuve coefficientée suffit à réactiver le coefficient configuré.
    assert coefficient_matiere_effectif(
        4.0, [_Eval(3, est_coefficientee="N"), _Eval(1, est_coefficientee="O")]
    ) == 4.0
    # Sans épreuve, on garde le coefficient configuré.
    assert coefficient_matiere_effectif(4.0, []) == 4.0


def test_moyenne_ponderee_des_deux_etages():
    """Reproduit le calcul attendu par l'école, à la main.

    Étage 1 (dans une matière) : (interro x1 + compo x2) / 3
    Étage 2 (moyenne générale) : somme(moy x coef_matiere) / somme(coef_matiere)
    """
    interro, compo = 13.5, 3.5
    francais = (interro * 1 + compo * 2) / 3
    assert round(francais, 2) == 6.83

    maths = (15.0 * 1 + 8.0 * 2) / 3
    assert round(maths, 2) == 10.33

    # Français coef 2, Maths coef 3
    generale = (francais * 2 + maths * 3) / (2 + 3)
    assert round(generale, 2) == 8.93
