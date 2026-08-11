"""
SMARTSCHOOL API — Gestion des Activités du Jour
CRUD complet pour la planification et le suivi des activités quotidiennes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import ActiviteJour
from pydantic import BaseModel
from typing import Optional
from datetime import date

router = APIRouter(prefix="/api/activites", tags=["Activités du Jour"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class ActiviteCreate(BaseModel):
    titre: str
    description: Optional[str] = None
    heure: Optional[str] = "08:00"
    type_activite: str = "GENERALE"
    icone: str = "Activity"
    couleur: str = "#3b82f6"
    date_activite: Optional[date] = None
    created_by: Optional[str] = None


class ActiviteUpdate(BaseModel):
    titre: Optional[str] = None
    description: Optional[str] = None
    heure: Optional[str] = None
    type_activite: Optional[str] = None
    icone: Optional[str] = None
    couleur: Optional[str] = None
    date_activite: Optional[date] = None


def _act_to_dict(a: ActiviteJour) -> dict:
    is_pub = (a.est_actif == "O")
    return {
        "activite_id": a.activite_id,
        "etablissement_id": a.etablissement_id,
        "titre": a.titre,
        "description": a.description,
        "heure": a.heure,
        "type_activite": a.type_activite,
        "icone": a.icone,
        "couleur": a.couleur,
        "est_actif": a.est_actif or "N",
        "statut": "PUBLIE" if is_pub else "BROUILLON",
        "date_activite": str(a.date_activite) if a.date_activite else None,
        "created_by": a.created_by,
        "created_date": str(a.created_date) if a.created_date else None,
    }


# ── GET toutes les activités du jour ──────────────────────────────────────────
def _activite_ou_404(db: Session, activite_id: int, etablissement_id: int) -> ActiviteJour:
    """ActiviteJour a une colonne etablissement_id directe (Lot 9)."""
    a = db.query(ActiviteJour).filter(
        ActiviteJour.activite_id == activite_id, ActiviteJour.etablissement_id == etablissement_id
    ).first()
    if not a:
        raise HTTPException(404, "Activité introuvable")
    return a


@router.get("")
def list_activites(
    date_act: Optional[date] = None,
    uniquement_publies: bool = False,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    q = db.query(ActiviteJour).filter(ActiviteJour.etablissement_id == etablissement_id)
    if date_act:
        q = q.filter(ActiviteJour.date_activite == date_act)
    if uniquement_publies:
        q = q.filter(ActiviteJour.est_actif == "O")
    
    activites = q.order_by(ActiviteJour.heure.asc(), ActiviteJour.activite_id.desc()).all()
    return [_act_to_dict(a) for a in activites]


# ── POST créer une activité ──────────────────────────────────────────────────
@router.post("", status_code=201)
def create_activite(data: ActiviteCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    if not data.date_activite:
        data.date_activite = date.today()
    payload = data.model_dump()
    payload["etablissement_id"] = etablissement_id
    act = ActiviteJour(**payload)
    act.est_actif = "N"  # Default to Draft / Brouillon until published by Admin
    db.add(act)
    db.commit()
    db.refresh(act)
    return _act_to_dict(act)


# ── PUT modifier une activité ─────────────────────────────────────────────────
@router.put("/{activite_id}")
def update_activite(activite_id: int, data: ActiviteUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    a = _activite_ou_404(db, activite_id, etablissement_id)
    update_data = data.model_dump(exclude_none=True)
    update_data.pop("etablissement_id", None)
    for field, val in update_data.items():
        setattr(a, field, val)
    db.commit()
    db.refresh(a)
    return _act_to_dict(a)


# ── POST publier une activité et notifier ─────────────────────────────────────
@router.post("/{activite_id}/publier")
def publier_activite(activite_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    a = _activite_ou_404(db, activite_id, etablissement_id)
    a.est_actif = "O"
    db.commit()
    db.refresh(a)
    try:
        from app.models.academique import SsMessage
        # Extrait de la f-string : un antislash dans une expression de f-string
        # n'est accepté qu'à partir de Python 3.12 et faisait échouer la
        # compilation en 3.11.
        heure_affichee = a.heure or "Aujourd'hui"
        description_affichee = a.description or ""
        msg = SsMessage(
            etablissement_id=a.etablissement_id,
            expediteur_type="ADMIN",
            expediteur_nom="Administration SmartSchool",
            sujet=f"📢 Activité Publiée : {a.titre}",
            contenu=f"Programme du jour : {a.titre}\nHeure : {heure_affichee}\nDescription : {description_affichee}",
            objet="NOTIFICATION_ACTIVITE",
            destinataire_type="TOUS",
            statut="ENVOYE"
        )
        db.add(msg)
        db.commit()
    except Exception as exc:
        print("Notification message note:", exc)

    return _act_to_dict(a)


# ── DELETE supprimer une activité ─────────────────────────────────────────────
@router.delete("/{activite_id}")
def delete_activite(activite_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    a = _activite_ou_404(db, activite_id, etablissement_id)
    db.delete(a)
    db.commit()
    return {"message": "Activité supprimée avec succès"}

