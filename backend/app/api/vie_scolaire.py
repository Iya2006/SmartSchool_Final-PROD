"""
SMARTSCHOOL API — Routes Vie Scolaire (Présences, Incidents)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date as date_type
from app.core.database import get_db
from app.core.annee_lock import verifier_annee_modifiable
from app.core.auth import require_etablissement
from app.models.academique import Presence, Incident, Inscription, Classe, Eleve
from app.schemas.schemas import (
    PresenceCreate, PresenceOut, IncidentCreate, IncidentOut
)

router = APIRouter(prefix="/api/vie-scolaire", tags=["Vie Scolaire"])


def _inscription_ou_404(db: Session, inscription_id: int, etablissement_id: int) -> Inscription:
    """Inscription est OWNERSHIP via sa Classe (Lot 9)."""
    insc = (
        db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id == inscription_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    return insc


# ============================================================================
# PRÉSENCES
# ============================================================================
@router.get("/presences")
def list_presences(
    classe_id: int = None,
    date_presence: Optional[str] = None,
    demi_journee: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(
        Presence.presence_id,
        Presence.date_presence,
        Presence.demi_journee,
        Presence.statut_presence,
        Presence.est_justifie,
        Presence.motif,
        Eleve.matricule,
        Eleve.nom,
        Eleve.prenom
    ).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).join(
        Classe, Classe.classe_id == Inscription.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id
    )

    if classe_id:
        query = query.filter(Inscription.classe_id == classe_id)
    if date_presence:
        query = query.filter(Presence.date_presence == date_presence)
    if demi_journee:
        query = query.filter(Presence.demi_journee == demi_journee)

    results = query.order_by(Eleve.nom, Eleve.prenom).all()
    return [
        {
            "presence_id": r.presence_id,
            "date": str(r.date_presence),
            "demi_journee": r.demi_journee,
            "statut": r.statut_presence,
            "justifie": r.est_justifie,
            "motif": r.motif,
            "matricule": r.matricule,
            "eleve": f"{r.nom} {r.prenom}"
        } for r in results
    ]


@router.post("/presences/batch")
def saisie_presences_batch(presences: List[PresenceCreate], db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Saisie en lot des présences pour une classe.

    CHAQUE inscription est vérifiée appartenir à l'établissement appelant
    (Lot 9) : avant, seule la PREMIÈRE servait au verrou d'année et aucune
    n'était vérifiée — une inscription d'une autre école glissée dans le lot
    recevait sa présence sans contrôle.
    """
    if presences:
        premiere_inscription = _inscription_ou_404(db, presences[0].inscription_id, etablissement_id)
        verifier_annee_modifiable(db, premiere_inscription.annee_id)

    count = 0
    for p in presences:
        _inscription_ou_404(db, p.inscription_id, etablissement_id)
        existing = db.query(Presence).filter(
            Presence.inscription_id == p.inscription_id,
            Presence.date_presence == p.date_presence,
            Presence.demi_journee == p.demi_journee
        ).first()
        if existing:
            existing.statut_presence = p.statut_presence
            existing.motif = p.motif
        else:
            presence = Presence(**p.model_dump())
            db.add(presence)
        count += 1
    db.commit()
    return {"message": f"{count} présences enregistrées"}


@router.get("/presences/stats")
def stats_presences(
    classe_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(Presence).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Presence.date_presence >= func.current_date() - 30
    )

    if classe_id:
        query = query.filter(Inscription.classe_id == classe_id)

    total = query.count()
    presents = query.filter(Presence.statut_presence == "PRESENT").count()
    absents = query.filter(Presence.statut_presence == "ABSENT").count()
    retards = query.filter(Presence.statut_presence == "RETARD").count()

    return {
        "total": total,
        "presents": presents,
        "absents": absents,
        "retards": retards,
        "taux_presence": round(presents / total * 100, 1) if total > 0 else 0
    }


# ============================================================================
# INCIDENTS
# ============================================================================
@router.get("/incidents", response_model=List[IncidentOut])
def list_incidents(
    gravite: Optional[str] = None,
    statut: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(Incident).filter(
        Incident.etablissement_id == etablissement_id
    )
    if gravite:
        query = query.filter(Incident.gravite == gravite)
    if statut:
        query = query.filter(Incident.statut == statut)
    return query.order_by(Incident.date_incident.desc()).offset(skip).limit(limit).all()


@router.post("/incidents", response_model=IncidentOut, status_code=201)
def create_incident(data: IncidentCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    payload = data.model_dump()
    # etablissement_id imposé par le compte authentifié, et l'élève concerné
    # (si fourni) doit appartenir à cette école (Lot 9).
    payload["etablissement_id"] = etablissement_id
    if payload.get("eleve_id") and not db.query(Eleve.eleve_id).filter(
        Eleve.eleve_id == payload["eleve_id"], Eleve.etablissement_id == etablissement_id
    ).first():
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    inc = Incident(**payload)
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return inc


@router.put("/incidents/{incident_id}/traiter")
def traiter_incident(incident_id: int, decision: str, traite_par: str, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    inc = db.query(Incident).filter(
        Incident.incident_id == incident_id, Incident.etablissement_id == etablissement_id
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    inc.statut = "TRAITE"
    db.commit()
    return {"message": "Incident traité"}


@router.get("/incidents/stats")
def stats_incidents(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    query = db.query(Incident).filter(
        Incident.etablissement_id == etablissement_id,
        Incident.date_incident >= func.current_date() - 90
    )

    total = query.count()
    par_gravite = query.with_entities(
        Incident.gravite,
        func.count(Incident.incident_id).label("count")
    ).group_by(Incident.gravite).all()

    par_type = query.with_entities(
        Incident.type_incident,
        func.count(Incident.incident_id).label("count")
    ).group_by(Incident.type_incident).order_by(
        func.count(Incident.incident_id).desc()
    ).limit(5).all()

    return {
        "total_incidents": total,
        "par_gravite": [{"gravite": r.gravite, "count": r.count} for r in par_gravite],
        "top_types": [{"type": r.type_incident, "count": r.count} for r in par_type]
    }
