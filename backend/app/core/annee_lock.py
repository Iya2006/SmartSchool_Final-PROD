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
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.academique import AnneeScolaire

ANNEE_VERROUILLEE = ("CLOTURE_COMPTABLE", "ARCHIVEE")


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
    if annee and annee.statut in ANNEE_VERROUILLEE:
        etat = "archivée" if annee.statut == "ARCHIVEE" else "clôturée"
        raise HTTPException(
            status_code=403,
            detail=f"{annee.libelle} est {etat} (lecture seule) — aucune modification n'est possible.",
        )
