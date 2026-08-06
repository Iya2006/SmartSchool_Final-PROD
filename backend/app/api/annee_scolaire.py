"""
SMARTSCHOOL API — Cycle de vie de l'année scolaire (Phase 1 de la refonte
clôture/réinscription/tarifs).

AnneeScolaire est désormais l'unique entité "année" — elle remplace
ExerciceComptable (retiré, jamais réellement relié à Facture/Paiement). Cycle
de statut : PLANIFIEE -> EN_COURS -> CLOTURE_COMPTABLE -> ARCHIVEE (Phase 2).

Ce module porte la vérification pré-clôture et la clôture comptable
(verrouillage réel des mutations financières — voir _verifier_annee_modifiable
dans app/api/finance.py, appelé par tous les endpoints de mutation Facture/
Paiement/Depense).
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.academique import (
    AnneeScolaire, Trimestre, Inscription, Bulletin, Facture, BulletinPaie,
)

router = APIRouter(prefix="/api/annee-scolaire", tags=["Année Scolaire — Cycle de vie"])


def _controle(code: str, label: str, severite: str, ok: bool, detail: str) -> dict:
    return {"code": code, "label": label, "severite": severite, "ok": ok, "detail": detail}


@router.get("/{annee_id}/verification-cloture")
def verification_cloture(annee_id: int, db: Session = Depends(get_db)):
    """
    Contrôles avant clôture comptable — chaque contrôle est BLOQUANT (empêche
    la clôture) ou AVERTISSEMENT (affiché mais n'empêche pas). `peut_cloturer`
    est vrai seulement si tous les contrôles BLOQUANT passent.
    """
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()
    if not annee:
        raise HTTPException(404, "Année scolaire non trouvée")

    controles = []

    # ── BLOQUANT : tous les trimestres clôturés ──
    trimestres = db.query(Trimestre).filter(Trimestre.annee_id == annee_id).all()
    non_clotures = [t for t in trimestres if t.statut != "CLOTURE"]
    controles.append(_controle(
        "trimestres_clotures", "Tous les trimestres sont clôturés", "BLOQUANT",
        ok=(len(trimestres) > 0 and len(non_clotures) == 0),
        detail=(
            "Aucun trimestre configuré pour cette année." if not trimestres
            else f"{len(non_clotures)} trimestre(s) encore ouvert(s) : {', '.join(t.libelle for t in non_clotures)}" if non_clotures
            else f"{len(trimestres)} trimestre(s) clôturé(s)."
        ),
    ))

    # ── BLOQUANT : un bulletin PUBLIE par (élève actif × trimestre) ──
    nb_inscriptions = db.query(func.count(Inscription.inscription_id)).filter(
        Inscription.annee_id == annee_id, Inscription.statut == "ACTIVE"
    ).scalar() or 0
    attendu = nb_inscriptions * len(trimestres)
    nb_publies = db.query(func.count(Bulletin.bulletin_id)).join(
        Inscription, Bulletin.inscription_id == Inscription.inscription_id
    ).filter(
        Inscription.annee_id == annee_id, Inscription.statut == "ACTIVE",
        Bulletin.statut == "PUBLIE",
    ).scalar() or 0
    controles.append(_controle(
        "bulletins_publies", "Tous les bulletins sont générés et publiés", "BLOQUANT",
        ok=(attendu > 0 and nb_publies >= attendu),
        detail=(
            "Aucun élève actif ou aucun trimestre configuré." if attendu == 0
            else f"{nb_publies} / {attendu} bulletins publiés (élèves actifs × trimestres)."
        ),
    ))

    # ── AVERTISSEMENT : impayés en attente ──
    factures_impayees = db.query(Facture).filter(
        Facture.annee_id == annee_id, Facture.montant_restant > 0,
        Facture.statut.in_(["EN_ATTENTE", "PARTIELLEMENT_PAYEE", "EN_RETARD"]),
    ).all()
    total_impaye = sum(float(f.montant_restant or 0) for f in factures_impayees)
    controles.append(_controle(
        "impayes", "Aucun impayé en attente", "AVERTISSEMENT",
        ok=(len(factures_impayees) == 0),
        detail=(
            f"{len(factures_impayees)} facture(s) impayée(s) pour un total de {total_impaye:,.0f} GNF — "
            "courant en fin d'année, ne bloque pas techniquement la clôture."
            if factures_impayees else "Aucun impayé."
        ),
    ))

    # ── AVERTISSEMENT : salaires du mois courant ──
    mois_courant = date.today().strftime("%Y-%m")
    non_payes = db.query(func.count(BulletinPaie.bulletin_id)).filter(
        BulletinPaie.mois_concerne == mois_courant, BulletinPaie.statut != "PAYE"
    ).scalar() or 0
    controles.append(_controle(
        "salaires_finalises", f"Salaires du mois en cours ({mois_courant}) finalisés", "AVERTISSEMENT",
        ok=(non_payes == 0),
        detail=f"{non_payes} bulletin(s) de paie non finalisé(s) pour {mois_courant}." if non_payes else "Tous finalisés.",
    ))

    peut_cloturer = all(c["ok"] for c in controles if c["severite"] == "BLOQUANT")
    return {
        "annee_id": annee_id, "annee_libelle": annee.libelle, "annee_statut": annee.statut,
        "date_cloture_comptable": str(annee.date_cloture_comptable) if annee.date_cloture_comptable else None,
        "peut_cloturer": peut_cloturer,
        "controles": controles,
    }


@router.post("/{annee_id}/cloturer-comptabilite")
def cloturer_comptabilite(annee_id: int, db: Session = Depends(get_db)):
    """
    Verrouille définitivement la comptabilité de l'année : plus aucune
    création/modification de Facture/Paiement/Depense n'est possible (voir
    _verifier_annee_modifiable, app/api/finance.py). Toutes les données
    restent consultables. Refuse si un contrôle BLOQUANT de la vérification
    échoue.
    """
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()
    if not annee:
        raise HTTPException(404, "Année scolaire non trouvée")
    if annee.statut in ("CLOTURE_COMPTABLE", "ARCHIVEE"):
        return {"message": f"{annee.libelle} est déjà clôturée.", "statut": annee.statut}

    verif = verification_cloture(annee_id, db)
    if not verif["peut_cloturer"]:
        bloquants = [c["label"] for c in verif["controles"] if c["severite"] == "BLOQUANT" and not c["ok"]]
        raise HTTPException(400, f"Clôture impossible — {', '.join(bloquants)}.")

    annee.statut = "CLOTURE_COMPTABLE"
    annee.date_cloture_comptable = date.today()
    db.commit()
    return {
        "message": f"Comptabilité de {annee.libelle} clôturée — lecture seule à partir de maintenant.",
        "statut": annee.statut,
        "date_cloture_comptable": str(annee.date_cloture_comptable),
    }


@router.post("/{annee_id}/archiver")
def archiver_annee(annee_id: int, db: Session = Depends(get_db)):
    """
    Dernière étape du cycle de vie : classe définitivement l'année (statut
    ARCHIVEE). Nécessite que la comptabilité soit déjà clôturée — le
    verrouillage technique (verifier_annee_modifiable, app/core/annee_lock.py)
    traite CLOTURE_COMPTABLE et ARCHIVEE de façon identique ; cette transition
    est donc sémantique ("année définitivement classée, consultable comme
    archive") plutôt qu'un niveau de verrouillage supplémentaire.
    """
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()
    if not annee:
        raise HTTPException(404, "Année scolaire non trouvée")
    if annee.statut == "ARCHIVEE":
        return {"message": f"{annee.libelle} est déjà archivée.", "statut": annee.statut}
    if annee.statut != "CLOTURE_COMPTABLE":
        raise HTTPException(
            400,
            "La comptabilité de cette année doit être clôturée avant de pouvoir l'archiver "
            "(voir POST /{annee_id}/cloturer-comptabilite).",
        )

    annee.statut = "ARCHIVEE"
    db.commit()
    return {
        "message": f"{annee.libelle} archivée — consultable en lecture seule dans le centre d'historique.",
        "statut": annee.statut,
    }
