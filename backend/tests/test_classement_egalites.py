"""
Le rang d'un élève ne doit pas dépendre de l'ordre dans lequel la base rend
les élèves. Cet ordre n'est pas le même sous PostgreSQL (en ligne) et sous
SQLite (poste hors-ligne) : sans critère pour départager les égalités, le 5e
d'un bulletin imprimé sur le poste pouvait être le 6e du même bulletin en
ligne, et les élèves sans moyenne changeaient de rang d'une base à l'autre
(49e d'un côté, 261e de l'autre, constaté en comparant un poste au cloud).
"""
from sqlalchemy.orm import Session

from app.services.notation import appliquer_rangs, ordre_de_classement

ELEVES = [
    {"inscription_id": 30, "moyenne_generale": 12.5},
    {"inscription_id": 10, "moyenne_generale": 14.0},
    {"inscription_id": 20, "moyenne_generale": 12.5},
    {"inscription_id": 40, "moyenne_generale": None},
    {"inscription_id": 5, "moyenne_generale": None},
]
# Égalités départagées par l'inscription, qui a le même identifiant partout.
ATTENDU = {10: 1, 20: 2, 30: 3, 5: 4, 40: 5}


def test_le_rang_ne_depend_pas_de_l_ordre_rendu_par_la_base(db: Session):
    for ordre in (ELEVES, list(reversed(ELEVES)), ELEVES[2:] + ELEVES[:2]):
        lignes = [dict(e) for e in ordre]
        appliquer_rangs(db, None, lignes, trimestre_id=None, type_bulletin="TRIMESTRIEL", etablissement_id=1)
        assert {e["inscription_id"]: e["rang"] for e in lignes} == ATTENDU


def test_cle_de_classement():
    # Moyenne décroissante, puis inscription croissante ; sans moyenne = 0.
    eleves = [(None, 2), (15, 9), (15, 3), (0, 1), (16.5, 7)]
    assert sorted(eleves, key=lambda e: ordre_de_classement(*e)) == [(16.5, 7), (15, 3), (15, 9), (0, 1), (None, 2)]
