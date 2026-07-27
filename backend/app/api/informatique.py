"""
SMARTSCHOOL API — Portail informatique
Inventaire matériel, tickets de panne et salles informatiques.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.academique import EquipementInformatique, TicketInformatique, Salle

router = APIRouter(prefix="/api/informatique", tags=["Informatique"])

IT_WRITE_ROLES = {"SUPER_ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU", "ADMIN", "INFORMATICIEN"}
IT_READ_ROLES = IT_WRITE_ROLES | {"ENSEIGNANT", "OPERATEUR", "SURVEILLANT"}


class EquipementCreate(BaseModel):
    etablissement_id: int = 1
    salle_id: Optional[int] = None
    code: str
    nom: str
    type_equipement: str = "ORDINATEUR"
    marque: Optional[str] = None
    modele: Optional[str] = None
    numero_serie: Optional[str] = None
    etat: str = "BON"
    statut: str = "ACTIF"
    derniere_maintenance: Optional[date] = None
    observation: Optional[str] = None


class TicketCreate(BaseModel):
    etablissement_id: int = 1
    equipement_id: Optional[int] = None
    titre: str
    description: str
    priorite: str = "NORMALE"
    signale_par: Optional[str] = None


def _require_read(current_user: dict):
    role = current_user.get("role", "")
    if role not in IT_READ_ROLES:
        raise HTTPException(status_code=403, detail="Accès informatique interdit")


def _require_write(current_user: dict):
    role = current_user.get("role", "")
    if role not in IT_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Modification informatique interdite")


def _equipement_to_dict(item: EquipementInformatique) -> dict:
    return {
        "equipement_id": item.equipement_id,
        "etablissement_id": item.etablissement_id,
        "salle_id": item.salle_id,
        "code": item.code,
        "nom": item.nom,
        "type_equipement": item.type_equipement,
        "marque": item.marque,
        "modele": item.modele,
        "numero_serie": item.numero_serie,
        "etat": item.etat,
        "statut": item.statut,
        "derniere_maintenance": item.derniere_maintenance,
        "observation": item.observation,
        "created_date": item.created_date,
    }


def _ticket_to_dict(item: TicketInformatique) -> dict:
    return {
        "ticket_id": item.ticket_id,
        "etablissement_id": item.etablissement_id,
        "equipement_id": item.equipement_id,
        "titre": item.titre,
        "description": item.description,
        "priorite": item.priorite,
        "statut": item.statut,
        "signale_par": item.signale_par,
        "assigne_a": item.assigne_a,
        "resolution": item.resolution,
        "date_signalement": item.date_signalement,
        "date_resolution": item.date_resolution,
    }


@router.get("/stats")
def stats_informatique(
    etablissement_id: int = Query(1),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    equipements = db.query(EquipementInformatique).filter(EquipementInformatique.etablissement_id == etablissement_id)
    tickets = db.query(TicketInformatique).filter(TicketInformatique.etablissement_id == etablissement_id)
    salles_info = db.query(Salle).filter(Salle.etablissement_id == etablissement_id, Salle.type_salle == "INFORMATIQUE").count()
    par_etat = equipements.with_entities(EquipementInformatique.etat, func.count(EquipementInformatique.equipement_id).label("total")).group_by(EquipementInformatique.etat).all()
    return {
        "total_equipements": equipements.count(),
        "equipements_en_panne": equipements.filter(EquipementInformatique.etat.in_(["PANNE", "A_REMPLACER"])).count(),
        "tickets_ouverts": tickets.filter(TicketInformatique.statut.in_(["OUVERT", "EN_COURS"])).count(),
        "tickets_critiques": tickets.filter(TicketInformatique.priorite == "URGENTE", TicketInformatique.statut.in_(["OUVERT", "EN_COURS"])).count(),
        "salles_informatiques": salles_info,
        "par_etat": [{"etat": row.etat or "INCONNU", "total": row.total} for row in par_etat],
    }


@router.get("/equipements")
def list_equipements(
    etablissement_id: int = Query(1),
    etat: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    query = db.query(EquipementInformatique).filter(EquipementInformatique.etablissement_id == etablissement_id)
    if etat:
        query = query.filter(EquipementInformatique.etat == etat)
    return [_equipement_to_dict(item) for item in query.order_by(EquipementInformatique.created_date.desc()).limit(limit).all()]


@router.post("/equipements", status_code=201)
def create_equipement(
    data: EquipementCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    existing = db.query(EquipementInformatique).filter(
        EquipementInformatique.etablissement_id == data.etablissement_id,
        EquipementInformatique.code == data.code,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce code équipement existe déjà")
    item = EquipementInformatique(**data.model_dump(), created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")))
    db.add(item)
    db.commit()
    db.refresh(item)
    return _equipement_to_dict(item)


@router.get("/tickets")
def list_tickets(
    etablissement_id: int = Query(1),
    statut: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    query = db.query(TicketInformatique).filter(TicketInformatique.etablissement_id == etablissement_id)
    if statut:
        query = query.filter(TicketInformatique.statut == statut)
    return [_ticket_to_dict(item) for item in query.order_by(TicketInformatique.date_signalement.desc()).limit(limit).all()]


@router.post("/tickets", status_code=201)
def create_ticket(
    data: TicketCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    item = TicketInformatique(
        **data.model_dump(),
        signale_par=data.signale_par or current_user.get("nom", current_user.get("sub", "SYSTEM")),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _ticket_to_dict(item)


@router.put("/tickets/{ticket_id}/resoudre")
def resolve_ticket(
    ticket_id: int,
    resolution: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    item = db.query(TicketInformatique).filter(TicketInformatique.ticket_id == ticket_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    setattr(item, "statut", "RESOLU")
    setattr(item, "resolution", resolution)
    setattr(item, "assigne_a", current_user.get("nom", current_user.get("sub", "SYSTEM")))
    setattr(item, "date_resolution", datetime.utcnow())
    db.commit()
    return {"message": "Ticket résolu"}
