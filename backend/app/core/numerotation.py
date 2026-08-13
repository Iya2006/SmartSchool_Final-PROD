"""
SMARTSCHOOL — Numéros de factures et de reçus.

LE PROBLÈME
-----------
Quatre endroits fabriquaient un numéro de facture, et un cinquième un numéro de
reçu, tous de la même façon : lire ce qui existe, ajouter 1.

    last = db.query(Facture).order_by(Facture.numero_facture.desc()).first()
    numero = f"FAC-{max_num + 1:06d}"

    count = db.query(func.count(Paiement.paiement_id)).scalar()
    numero_recu = f"{prefixe}-{count + 1:06d}"

C'est exactement le défaut déjà corrigé sur les matricules (voir
`app/core/matricules.py`), avec les mêmes trois conséquences :

1. **Course entre deux saisies simultanées.** Les deux lisent le même dernier
   numéro et fabriquent le même. La colonne étant unique en base, rien ne se
   duplique — mais la seconde saisie tombe en erreur 500 sans explication. À
   quatre cents élèves c'est rare ; à un million c'est quotidien.

2. **Réattribution après suppression.** La variante qui compte les lignes
   (`COUNT + 1`) régresse dès qu'une facture est annulée : le numéro libéré est
   réattribué. Or ce numéro figure sur un reçu déjà remis à un parent. Deux
   pièces différentes portant le même numéro, c'est un litige que la
   comptabilité ne peut pas trancher.

3. **Compteur partagé entre les écoles.** La séquence était globale : l'école B
   continuait la numérotation de l'école A. Ses propres factures lui disaient
   donc combien de factures ses concurrentes avaient émises, et sa numérotation
   était trouée par leurs créations.

CE QUI EST POSÉ
---------------
Un compteur **persistant**, un par (école, année scolaire, nature de pièce),
verrouillé le temps de l'incrément. Il ne décroît jamais.

    FAC-3-2025-00042      facture n°42 de l'école 3, année scolaire 2025-2026
    REC-3-2025-00107      reçu n°107 de la même école, même année

Le comptable lit son numéro et sait de quelle année il parle. La séquence
repart à 1 à chaque rentrée — c'est ce qu'attend une comptabilité annuelle —
sans risque de collision, puisque l'année figure dans le numéro.

Le préfixe du reçu reste réglable par l'école (`recu_prefixe` dans
Paramètres > Finance). Le compteur, lui, ne dépend pas du préfixe : changer
« REC » en « RECU » en cours d'année ne remet pas la numérotation à zéro.

LA TABLE RÉUTILISÉE
-------------------
`ss_sequences_matricule` porte déjà un compteur par (établissement, type
d'entité). Le type d'entité est une simple étiquette : on y met `FAC42` /
`REC42` où 42 est l'identifiant de l'année scolaire. Aucune table
supplémentaire, aucune migration de schéma — et un seul mécanisme de compteur
dans le projet plutôt que deux.
"""
import re
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.academique import AnneeScolaire, SequenceMatricule

PREFIXE_FACTURE = "FAC"
PREFIXE_RECU = "REC"

_LARGEUR = 5


def annee_civile(db: Session, annee_id: Optional[int]) -> int:
    """Année civile de RENTRÉE — 2025 pour l'année scolaire 2025-2026.

    C'est le repère qu'utilise une école : « les factures de 2025 » désigne la
    rentrée de septembre 2025, pas l'année calendaire. Prendre la date du jour
    ferait basculer la numérotation au 1er janvier, en plein milieu de l'année
    scolaire.
    """
    if annee_id:
        annee = (
            db.query(AnneeScolaire.date_debut, AnneeScolaire.libelle)
            .filter(AnneeScolaire.annee_id == annee_id)
            .first()
        )
        if annee:
            if annee[0]:
                return annee[0].year
            # Pas de date de début : on retombe sur le premier millésime lisible
            # dans le libellé (« Année Scolaire 2025-2026 »).
            trouve = re.search(r"(20\d{2})", annee[1] or "")
            if trouve:
                return int(trouve.group(1))
    from datetime import date

    return date.today().year


def _numero_suivant(db: Session, etablissement_id: int, cle: str, depart: int) -> int:
    """Incrémente le compteur persistant et le retourne.

    `FOR UPDATE` verrouille la ligne le temps de l'incrément : deux saisies
    simultanées passent l'une après l'autre au lieu de lire la même valeur.
    SQLite ignore ce verrou — sans conséquence, les tests sont mono-connexion.
    """
    sequence = (
        db.query(SequenceMatricule)
        .filter(
            SequenceMatricule.etablissement_id == etablissement_id,
            SequenceMatricule.type_entite == cle,
        )
        .with_for_update()
        .first()
    )
    if sequence is None:
        # Première pièce de cette école pour cette année. On amorce au-dessus de
        # ce qui existe déjà : une base reprise en cours de route ne doit jamais
        # réattribuer un numéro figurant sur un reçu déjà remis.
        sequence = SequenceMatricule(
            etablissement_id=etablissement_id, type_entite=cle, dernier_numero=depart
        )
        db.add(sequence)
        db.flush()

    sequence.dernier_numero += 1
    db.flush()
    return sequence.dernier_numero


def _plus_haut_numero_existant(db: Session, colonne, motif: str) -> int:
    """Plus grand suffixe déjà attribué pour ce motif de numéro.

    Sert uniquement à amorcer un compteur neuf sur une base qui contient déjà
    des pièces au nouveau format. Les anciens formats (« F-2025-0001 »,
    « FAC-000001 ») ne correspondent pas au motif et sont donc ignorés : ils ne
    peuvent pas entrer en collision, l'école et l'année figurant désormais dans
    le numéro.
    """
    lignes = db.query(colonne).filter(colonne.like(motif + "%")).all()
    plus_haut = 0
    for (valeur,) in lignes:
        suffixe = (valeur or "").rsplit("-", 1)[-1]
        if suffixe.isdigit():
            plus_haut = max(plus_haut, int(suffixe))
    return plus_haut


def generer_numero_facture(
    db: Session, etablissement_id: int, annee_id: Optional[int]
) -> str:
    """``FAC-{école}-{année}-{NNNNN}`` — propre à l'école et à l'année."""
    from app.models.academique import Facture

    an = annee_civile(db, annee_id)
    motif = f"{PREFIXE_FACTURE}-{etablissement_id}-{an}-"
    cle = f"{PREFIXE_FACTURE}{annee_id or 0}"[:20]
    depart = _plus_haut_numero_existant(db, Facture.numero_facture, motif)
    numero = _numero_suivant(db, etablissement_id, cle, depart)
    return f"{motif}{numero:0{_LARGEUR}d}"


def generer_numero_recu(
    db: Session,
    etablissement_id: int,
    annee_id: Optional[int],
    prefixe: str = PREFIXE_RECU,
) -> str:
    """``{PRÉFIXE}-{école}-{année}-{NNNNN}``.

    Le préfixe est celui que l'école a choisi dans Paramètres > Finance. Le
    compteur n'en dépend pas : le changer en cours d'année ne repart pas de 1.
    """
    from app.models.academique import Paiement

    prefixe = (prefixe or PREFIXE_RECU).strip().upper()[:8] or PREFIXE_RECU
    an = annee_civile(db, annee_id)
    motif = f"{prefixe}-{etablissement_id}-{an}-"
    cle = f"{PREFIXE_RECU}{annee_id or 0}"[:20]
    depart = _plus_haut_numero_existant(db, Paiement.numero_recu, motif)
    numero = _numero_suivant(db, etablissement_id, cle, depart)
    return f"{motif}{numero:0{_LARGEUR}d}"
