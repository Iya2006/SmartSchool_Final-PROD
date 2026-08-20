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
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.academique import SequenceMatricule

PREFIXE_ELEVE = "ELV"
PREFIXE_ENSEIGNANT = "ENS"

_LARGEUR = 5


def code_ecole_matricule(db: Session, etablissement_id: int) -> str:
    """Segment « école » du matricule : le CODE de l'établissement (ex. « GOTCHA »),
    nettoyé (alphanumérique, majuscules). À défaut de code, l'identifiant numérique
    — le matricule reste ainsi toujours propre à une école, donc unique."""
    from app.models.academique import Etablissement
    row = db.query(Etablissement.code).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    code = re.sub(r"[^A-Za-z0-9]", "", (row[0] if row and row[0] else "")).upper()[:12]
    return code or str(etablissement_id)


def _depart_max(db: Session, modele, etablissement_id: int) -> int:
    """Plus grand numéro DÉJÀ attribué (suffixe après le dernier « - »).

    On amorce le compteur là-dessus, jamais sur un `COUNT` : un count régresse
    après une suppression et fait RÉATTRIBUER un matricule déjà porté par une
    fiche existante (source des collisions). Le suffixe est lu quel que soit le
    format (`ELV-7-00042` comme `ELV-GOTCHA-00042`)."""
    plus_haut = 0
    for (m,) in db.query(modele.matricule).filter(
        modele.etablissement_id == etablissement_id
    ).all():
        suffixe = (m or "").rsplit("-", 1)[-1]
        if suffixe.isdigit():
            plus_haut = max(plus_haut, int(suffixe))
    return plus_haut


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
        # Première utilisation pour cette école. On amorce au PLUS GRAND numéro
        # déjà attribué (jamais un COUNT, qui régresse après suppression et
        # réattribue un matricule existant — cause des collisions).
        depart = _depart_max(db, modele, etablissement_id)
        sequence = SequenceMatricule(
            etablissement_id=etablissement_id, type_entite=prefixe, dernier_numero=depart
        )
        db.add(sequence)
        db.flush()

    # Garde-fou : si le compteur avait été amorcé trop bas jadis (ancien bug du
    # COUNT), on ne redescend jamais sous le plus grand numéro réel.
    prochain = max(sequence.dernier_numero, _depart_max(db, modele, etablissement_id)) + 1
    sequence.dernier_numero = prochain
    db.flush()
    return prochain


def generer_matricule(db: Session, modele, prefixe: str, etablissement_id: int) -> str:
    """Matricule propre à l'établissement, globalement unique.

    Format : ``{PREFIXE}-{CODE_ÉCOLE}-{NNNNN}`` (ex. ``ELV-GOTCHA-00042``). Le
    code de l'école rend le matricule lisible et impossible à confondre entre
    deux écoles ; le numéro vient d'un compteur monotone par école.

    Au-delà de 99 999 fiches pour une même école le suffixe déborde de sa
    largeur : la séquence reste correcte et unique, seul l'alignement visuel
    est perdu (cas non atteint en pratique).
    """
    numero = _numero_suivant(db, modele, prefixe, etablissement_id)
    return f"{prefixe}-{code_ecole_matricule(db, etablissement_id)}-{numero:0{_LARGEUR}d}"
