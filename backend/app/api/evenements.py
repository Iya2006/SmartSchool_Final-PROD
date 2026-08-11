"""
SMARTSCHOOL API — Gestion des Événements Scolaires
CRUD complet : réunions, examens, fêtes, interclasses, congés, etc.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import Evenement
from pydantic import BaseModel
from typing import Optional
from datetime import date

router = APIRouter(prefix="/api/evenements", tags=["Événements"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class EvenementCreate(BaseModel):
    titre: str
    description: Optional[str] = None
    type_evenement: str = "AUTRE"
    date_debut: date
    date_fin: Optional[date] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    lieu: Optional[str] = None
    cible: str = "TOUS"
    couleur: Optional[str] = None
    statut: str = "PLANIFIE"
    created_by: Optional[str] = None


class EvenementUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    type_evenement: Optional[str] = None
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    lieu: Optional[str] = None
    cible: Optional[str] = None
    couleur: Optional[str] = None
    statut: Optional[str] = None


def _evt_to_dict(e: Evenement) -> dict:
    return {
        "evenement_id": e.evenement_id,
        "etablissement_id": e.etablissement_id,
        "titre": e.titre,
        "description": e.description,
        "type_evenement": e.type_evenement,
        "date_debut": str(e.date_debut) if e.date_debut else None,
        "date_fin": str(e.date_fin) if e.date_fin else None,
        "heure_debut": e.heure_debut,
        "heure_fin": e.heure_fin,
        "lieu": e.lieu,
        "cible": e.cible,
        "couleur": e.couleur,
        "statut": e.statut,
        "created_by": e.created_by,
        "created_date": str(e.created_date) if e.created_date else None,
    }


# ── GET tous les événements ───────────────────────────────────────────────────
def _evenement_ou_404(db: Session, evenement_id: int, etablissement_id: int) -> Evenement:
    """Evenement a une colonne etablissement_id directe (Lot 9)."""
    e = db.query(Evenement).filter(
        Evenement.evenement_id == evenement_id, Evenement.etablissement_id == etablissement_id
    ).first()
    if not e:
        raise HTTPException(404, "Événement introuvable")
    return e


@router.get("")
def list_evenements(
    a_venir: bool = False,
    type_evenement: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    q = db.query(Evenement).filter(Evenement.etablissement_id == etablissement_id)
    if a_venir:
        q = q.filter(Evenement.date_debut >= func.current_date())
    if type_evenement:
        q = q.filter(Evenement.type_evenement == type_evenement)
    evts = q.order_by(Evenement.date_debut.asc()).all()
    return [_evt_to_dict(e) for e in evts]


# ── GET un événement ──────────────────────────────────────────────────────────
@router.get("/{evenement_id}")
def get_evenement(evenement_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    return _evt_to_dict(_evenement_ou_404(db, evenement_id, etablissement_id))


# ── POST créer un événement ──────────────────────────────────────────────────
@router.post("", status_code=201)
def create_evenement(data: EvenementCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    payload = data.model_dump()
    payload["etablissement_id"] = etablissement_id
    evt = Evenement(**payload)
    db.add(evt)
    db.commit()
    db.refresh(evt)
    return _evt_to_dict(evt)


# ── PUT modifier un événement ─────────────────────────────────────────────────
@router.put("/{evenement_id}")
def update_evenement(evenement_id: int, data: EvenementUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    e = _evenement_ou_404(db, evenement_id, etablissement_id)
    update_data = data.model_dump(exclude_none=True)
    update_data.pop("etablissement_id", None)
    for field, val in update_data.items():
        setattr(e, field, val)
    db.commit()
    db.refresh(e)
    return _evt_to_dict(e)


# ── POST publier un événement et notifier ─────────────────────────────────────
@router.post("/{evenement_id}/publier")
def publier_evenement(evenement_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    e = _evenement_ou_404(db, evenement_id, etablissement_id)
    e.statut = "PUBLIE"
    db.commit()
    db.refresh(e)
    try:
        from app.models.academique import SsMessage
        msg = SsMessage(
            etablissement_id=e.etablissement_id,
            expediteur_type="ADMIN",
            expediteur_nom="Administration SmartSchool",
            sujet=f"📢 Événement Publié : {e.titre}",
            contenu=f"L'administration a publié un nouvel événement : {e.titre}\nDate : {e.date_debut}\nLieu : {e.lieu or 'Établissement'}\nAudience : {e.cible}",
            objet="NOTIFICATION_EVENEMENT",
            destinataire_type=e.cible if e.cible in ["PARENTS", "ENSEIGNANTS", "ELEVES"] else "TOUS",
            statut="ENVOYE"
        )
        db.add(msg)
        db.commit()
    except Exception as exc:
        print("Notification message note:", exc)

    return _evt_to_dict(e)


# ── DELETE supprimer un événement ─────────────────────────────────────────────
@router.delete("/{evenement_id}")
def delete_evenement(evenement_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    e = _evenement_ou_404(db, evenement_id, etablissement_id)
    db.delete(e)
    db.commit()
    return {"message": "Événement supprimé avec succès"}

