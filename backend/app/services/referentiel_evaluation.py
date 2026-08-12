"""
Référentiel de départ des types d'évaluation, par école.

Depuis que `TypeEvaluation` appartient à un établissement, une école qui vient
d'être créée n'a aucun type : elle ne pourrait ni créer une épreuve, ni
calculer une moyenne. Ce module lui donne une liste de départ, qu'elle reste
libre de renommer, d'étendre ou de réduire ensuite — sans que cela touche
personne d'autre.

Le contenu de cette liste reproduit exactement ce que la plateforme proposait
quand la table était partagée : mêmes codes, mêmes libellés, mêmes
coefficients, mêmes statuts actif/inactif. Une école qui migre ne voit donc
aucun changement.
"""
from typing import List

from sqlalchemy.orm import Session

from app.models.academique import TypeEvaluation

# (code, libellé, coefficient, statut)
#
# Seuls EVAL et COMPO sont actifs par défaut : c'est le fonctionnement guinéen
# le plus courant (des évaluations dans la période, une composition qui pèse
# double en fin de période). Les autres existent, prêts à être activés par une
# école qui en a l'usage, sans avoir à les recréer.
TYPES_REFERENCE = [
    ("EVAL",          "Évaluation",             1.0, "ACTIF"),
    ("COMPO",         "Composition",            2.0, "ACTIF"),
    ("INTERRO",       "Interrogation",          1.0, "INACTIF"),
    ("EXAMEN",        "Examen",                 1.0, "INACTIF"),
    ("TP",            "Travaux Pratiques",      1.0, "INACTIF"),
    ("ORAL",          "Evaluation Orale",       1.0, "INACTIF"),
    ("EXPOSE",        "Exposé / Présentation",  1.0, "INACTIF"),
    ("PARTICIPATION", "Participation",          1.0, "INACTIF"),
]


def types_manquants(db: Session, etablissement_id: int) -> List[str]:
    """Codes du référentiel que cette école n'a pas (encore)."""
    existants = {
        code for (code,) in db.query(TypeEvaluation.code).filter(
            TypeEvaluation.etablissement_id == etablissement_id
        ).all()
    }
    return [code for code, _, _, _ in TYPES_REFERENCE if code not in existants]


def amorcer_types_evaluation(db: Session, etablissement_id: int) -> int:
    """Donne à une école sa liste de départ. Renvoie le nombre de types créés.

    Idempotent et NON destructif : ne recrée que ce qui manque, et ne touche
    jamais à un type que l'école a déjà renommé ou désactivé. Rejouable sur une
    école existante sans rien écraser.

    Ne commit pas : l'appelant décide de la transaction (la création d'une
    école enchaîne plusieurs écritures qui doivent tomber ensemble).
    """
    manquants = set(types_manquants(db, etablissement_id))
    if not manquants:
        return 0

    for code, libelle, coefficient, statut in TYPES_REFERENCE:
        if code not in manquants:
            continue
        db.add(TypeEvaluation(
            etablissement_id=etablissement_id,
            code=code,
            libelle=libelle,
            coefficient=coefficient,
            statut=statut,
        ))
    db.flush()
    return len(manquants)
