"""
SMARTSCHOOL — Année scolaire en cours d'un établissement.

LE PROBLÈME QUE CE MODULE RÈGLE
-------------------------------
De nombreuses routes portaient `annee_id: int = 1` comme valeur par défaut.
C'était sans conséquence tant qu'une seule école existait : sa première année
scolaire porte l'identifiant 1.

En multi-écoles, c'est devenu un défaut silencieux. La deuxième école inscrite
reçoit une année d'identifiant 2, la troisième 3, et ainsi de suite. Leurs
écrans interrogent pourtant l'année n°1 — qui appartient à quelqu'un d'autre.

    Le comptable de la deuxième école ouvre son tableau de bord.
    Il voit zéro facture, zéro encaissement, zéro impayé.
    Ses données existent pourtant, sous une autre année.

C'est le pendant, sur l'année, du `etablissement_id = 1` que le chantier
multi-écoles a supprimé partout.

L'USAGE
-------
    annee_id = resoudre_annee(db, etablissement_id, annee_id)

`annee_id` fourni par l'appelant est respecté tel quel — il sert à consulter
une année passée. Absent, on prend l'année en cours DE CETTE ÉCOLE.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.academique import AnneeScolaire


def annee_courante_id(db: Session, etablissement_id: int) -> Optional[int]:
    """Année en cours de cette école, ou la plus récente si aucune n'est marquée.

    Renvoie `None` si l'école n'a aucune année : c'est le cas d'un
    établissement tout juste créé. Les appelants doivent alors afficher un
    écran vide plutôt qu'une erreur — l'école n'a effectivement rien à montrer.

    Jamais de `.first()` sans filtre d'établissement : ce serait choisir l'année
    d'une autre école, exactement le défaut corrigé ici.
    """
    base = db.query(AnneeScolaire.annee_id).filter(
        AnneeScolaire.etablissement_id == etablissement_id
    )
    courante = base.filter(AnneeScolaire.est_courante == "O").first()
    if courante:
        return courante[0]
    recente = base.order_by(AnneeScolaire.date_debut.desc()).first()
    return recente[0] if recente else None


def resoudre_annee(
    db: Session,
    etablissement_id: int,
    annee_id: Optional[int] = None,
) -> Optional[int]:
    """Année à utiliser : celle demandée, sinon celle en cours de l'école.

    Une année explicitement demandée est renvoyée telle quelle — c'est ainsi
    qu'on consulte un exercice passé. Le contrôle d'appartenance reste à la
    charge de l'appelant, qui filtre déjà par établissement dans sa requête.
    """
    if annee_id is not None:
        return annee_id
    return annee_courante_id(db, etablissement_id)
