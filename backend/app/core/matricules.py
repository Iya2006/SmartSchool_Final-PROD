"""
SMARTSCHOOL — Génération des matricules (chantier multi-écoles).

Source unique pour les matricules élèves et enseignants. Remplace la
génération `f"{PREFIXE}-{count + 1:05d}"` qui était dupliquée dans
`eleves.py` (deux fois) et `enseignants.py`, et qui posait quatre problèmes :

1. **Fuite inter-écoles** : le compteur portait sur un `COUNT` GLOBAL, toutes
   écoles confondues. Une école pouvait donc déduire le volume d'élèves de
   toute la plateforme en lisant ses propres matricules, et sa numérotation
   était trouée par les créations des autres écoles.
2. **Réattribution après suppression** : `COUNT + 1` régresse dès qu'une fiche
   est supprimée. Le matricule libéré était réattribué à un nouvel élève —
   alors qu'il figure sur des cartes imprimées, des bulletins et des archives.
   Quand la fiche existait encore, c'était en prime une `IntegrityError` (500)
   sur l'index unique.
3. **Course entre créations simultanées** : deux inscriptions concurrentes
   lisaient le même `COUNT` et fabriquaient le même matricule.
4. **Numérotation non maîtrisée** : aucune école ne reconnaissait ses propres
   matricules.

Le matricule reste **globalement unique** : c'est indispensable, le login
résout les enseignants et les élèves PAR MATRICULE (`auth.py`). L'unicité vient
de l'identifiant d'établissement inclus dans le préfixe, plus d'un compteur
partagé.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.academique import SequenceMatricule

PREFIXE_ELEVE = "ELV"
PREFIXE_ENSEIGNANT = "ENS"

_LARGEUR = 5


def _numero_suivant(db: Session, modele, prefixe: str, etablissement_id: int) -> int:
    """Incrémente le compteur persistant de cet établissement et le retourne.

    Le compteur est verrouillé le temps de l'incrément (`FOR UPDATE`) pour que
    deux inscriptions simultanées ne reçoivent pas le même numéro. SQLite
    ignore ce verrou : sans conséquence, les tests sont mono-connexion.
    """
    sequence = (
        db.query(SequenceMatricule)
        .filter(
            SequenceMatricule.etablissement_id == etablissement_id,
            SequenceMatricule.type_entite == prefixe,
        )
        .with_for_update()
        .first()
    )

    if sequence is None:
        # Première utilisation pour cette école. On amorce au-dessus des
        # matricules déjà présents : indispensable pour les établissements
        # créés avant l'introduction du compteur, dont les fiches existantes
        # ne doivent jamais voir leur matricule réattribué.
        depart = (
            db.query(func.count(modele.matricule))
            .filter(modele.etablissement_id == etablissement_id)
            .scalar()
            or 0
        )
        sequence = SequenceMatricule(
            etablissement_id=etablissement_id, type_entite=prefixe, dernier_numero=depart
        )
        db.add(sequence)
        db.flush()

    sequence.dernier_numero += 1
    db.flush()
    return sequence.dernier_numero


def generer_matricule(db: Session, modele, prefixe: str, etablissement_id: int) -> str:
    """Matricule propre à l'établissement, globalement unique.

    Format : ``{PREFIXE}-{etablissement_id}-{NNNNN}`` (ex. ``ELV-3-00042``).

    Au-delà de 99 999 fiches pour une même école le suffixe déborde de sa
    largeur : la séquence reste correcte et unique, seul l'alignement visuel
    est perdu (cas non atteint en pratique).
    """
    numero = _numero_suivant(db, modele, prefixe, etablissement_id)
    return f"{prefixe}-{etablissement_id}-{numero:0{_LARGEUR}d}"
