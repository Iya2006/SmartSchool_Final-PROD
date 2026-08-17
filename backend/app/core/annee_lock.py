"""
SMARTSCHOOL — Verrouillage réel du cycle de vie d'une année scolaire.

Une fois une année CLOTURE_COMPTABLE ou ARCHIVEE (voir app/api/annee_scolaire.py
pour le cycle de statuts complet), plus AUCUNE mutation ne doit être possible
sur les données rattachées à cette année — comptabilité (Facture/Paiement/
Depense, Phase 1) ET pédagogie (Note/Bulletin/Presence/CreneauEmploi, Phase 3).
Ce module est le point d'appel unique pour ce garde, importé transversalement
par tous les routeurs qui mutent des données rattachées à une année (d'où sa
place dans app/core plutôt que dans un routeur métier comme finance.py, où il
vivait initialement).
"""
from typing import Optional
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import AnneeScolaire, Trimestre

ANNEE_VERROUILLEE = ("CLOTURE_COMPTABLE", "ARCHIVEE")


def get_active_annee_id(db: Session, etablissement_id: int, fallback: int = 1) -> int:
    """Année active DE CETTE ÉCOLE — jamais un `1` codé en dur (qui retombe
    sur l'année 1 d'une AUTRE école dès que la sienne a un id différent,
    cause des "0/0/0" observés en réel). À utiliser en valeur par défaut
    partout où une route accepte `annee_id` en paramètre optionnel."""
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id, AnneeScolaire.est_courante == "O"
    ).first()
    if not annee:
        annee = db.query(AnneeScolaire).filter(
            AnneeScolaire.etablissement_id == etablissement_id
        ).order_by(AnneeScolaire.annee_id.desc()).first()
    return annee.annee_id if annee else fallback


def get_active_trimestre_id(db: Session, etablissement_id: int, fallback: int = 1) -> int:
    """Trimestre actif de l'année active DE CETTE ÉCOLE (même raison que
    `get_active_annee_id` — `Trimestre` est OWNERSHIP, isolé via son
    `annee_id`, voir docs/MULTI_ECOLES_REGLES_DEV.md §5)."""
    annee_id = get_active_annee_id(db, etablissement_id, fallback=0)
    if not annee_id:
        return fallback
    trimestre = db.query(Trimestre).filter(
        Trimestre.annee_id == annee_id, Trimestre.statut == "EN_COURS"
    ).first()
    if not trimestre:
        trimestre = db.query(Trimestre).filter(
            Trimestre.annee_id == annee_id
        ).order_by(Trimestre.numero.desc()).first()
    return trimestre.trimestre_id if trimestre else fallback


def resolve_annee_id(
    annee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
) -> int:
    """Dépendance FastAPI — remplace tout `annee_id: int = 1` en paramètre de
    route. `annee_id` fourni par le client est utilisé tel quel (la route
    reste responsable de vérifier qu'il appartient bien à `etablissement_id`
    si c'est un point sensible) ; sinon résolu vers l'année active de
    l'école de l'appelant plutôt qu'un `1` arbitraire."""
    if annee_id is not None:
        return annee_id
    return get_active_annee_id(db, etablissement_id)


def resolve_trimestre_id(
    trimestre_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
) -> int:
    """Équivalent de `resolve_annee_id` pour `trimestre_id`."""
    if trimestre_id is not None:
        return trimestre_id
    return get_active_trimestre_id(db, etablissement_id)


def verifier_annee_modifiable(db: Session, annee_id: Optional[int]) -> None:
    """
    Lève 403 si l'année est CLOTURE_COMPTABLE ou ARCHIVEE. `annee_id=None`
    laisse passer (ligne historique sans annee_id résolu, ou contexte où
    l'année n'est pas encore déterminable à cet endroit de l'appelant) plutôt
    que de bloquer par excès de prudence sur une donnée ambiguë.
    """
    if annee_id is None:
        return
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()
    if not annee:
        return
    if annee.statut in ANNEE_VERROUILLEE:
        etat = "archivée" if annee.statut == "ARCHIVEE" else "clôturée"
        raise HTTPException(
            status_code=403,
            detail=f"{annee.libelle} est {etat} (lecture seule) — aucune modification n'est possible.",
        )
    # Seule l'année EN COURS accepte des écritures. Une année passée reste
    # consultable mais en LECTURE SEULE — même si son statut est resté
    # « EN_COURS » (activer une nouvelle année ne clôture pas formellement
    # l'ancienne). Sans ça, on pouvait encore encaisser/dépenser sur une année
    # précédente en la consultant. Une année future PLANIFIÉE reste modifiable
    # (préparation), et l'année courante n'est jamais bloquée ici.
    if annee.est_courante != "O" and annee.statut == "EN_COURS":
        # On ne bloque que si une AUTRE année est bien l'année en cours de cette
        # école : ainsi une base où aucune année n'est encore marquée courante
        # (mise en place initiale) n'est pas verrouillée par excès de prudence.
        existe_courante = db.query(AnneeScolaire.annee_id).filter(
            AnneeScolaire.etablissement_id == annee.etablissement_id,
            AnneeScolaire.est_courante == "O",
        ).first()
        if existe_courante:
            raise HTTPException(
                status_code=403,
                detail=f"{annee.libelle} n'est plus l'année en cours (lecture seule) — "
                       "aucune modification n'est possible.",
            )
