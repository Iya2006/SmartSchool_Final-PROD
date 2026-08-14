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
    (Lot 9) : une inscription d'une autre école glissée dans le lot ne reçoit
    aucune présence. Vérification et recherche des présences déjà existantes
    faites par lot (IN), pas par une requête par élève dans la boucle — sans
    quoi une classe de plusieurs dizaines d'élèves déclenchait jusqu'à 2
    requêtes par élève à chaque appel.
    """
    if not presences:
        return {"message": "0 présences enregistrées"}

    inscription_ids = {p.inscription_id for p in presences}
    inscriptions = {
        i.inscription_id: i for i in db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id.in_(inscription_ids), Classe.etablissement_id == etablissement_id)
        .all()
    }
    if inscription_ids - inscriptions.keys():
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    premiere_inscription = inscriptions[presences[0].inscription_id]
    verifier_annee_modifiable(db, premiere_inscription.annee_id)

    dates = {p.date_presence for p in presences}
    existantes = {
        (pr.inscription_id, pr.date_presence, pr.demi_journee): pr
        for pr in db.query(Presence).filter(
            Presence.inscription_id.in_(inscription_ids),
            Presence.date_presence.in_(dates),
        ).all()
    }

    count = 0
    for p in presences:
        existing = existantes.get((p.inscription_id, p.date_presence, p.demi_journee))
        if existing:
            existing.statut_presence = p.statut_presence
            existing.motif = p.motif
        else:
            db.add(Presence(**p.model_dump()))
        count += 1
    db.commit()
    return {"message": f"{count} présences enregistrées"}


def _demi_journees_de_classe(debut: date_type, fin: date_type) -> int:
    """Le nombre de demi-journées ouvrées entre deux dates, samedi et dimanche
    exclus. C'est le dénominateur d'un taux de présence : sans lui, on ne
    divise que par ce qui a été saisi."""
    from datetime import timedelta

    jours, jour = 0, debut
    while jour <= fin:
        if jour.weekday() < 5:
            jours += 1
        jour += timedelta(days=1)
    return jours * 2


@router.get("/presences/stats")
def stats_presences(
    classe_id: Optional[int] = None,
    debut: Optional[date_type] = None,
    fin: Optional[date_type] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """L'assiduité sur une période, y compris quand l'école ne note QUE les absences.

    DEUX DÉFAUTS CORRIGÉS ICI

    1. La fenêtre était figée à « les 30 derniers jours », sans que rien ne le
       dise : une école qui ouvre cet écran en août — donc pendant les
       vacances — lisait des zéros partout et concluait à une panne. Une école
       raisonne par année scolaire, pas en jours glissants. La fenêtre est
       désormais l'année en cours, bornée à aujourd'hui, et se règle.

    2. `taux_presence` valait `presents / lignes saisies`. Or la plupart des
       écoles ne saisissent QUE les absences : la présence est la règle, elle
       n'est pas pointée élève par élève. Le taux affiché était alors 0 %
       avec 6 219 absences enregistrées sur l'année — un chiffre que le
       surveillant ne pouvait que croire faux. Le dénominateur est maintenant
       ce qui était ATTENDU : effectif actif × demi-journées ouvrées.
    """
    from app.models.academique import AnneeScolaire

    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id,
        AnneeScolaire.est_courante == "O",
    ).first()
    aujourdhui = date_type.today()
    debut = debut or (annee.date_debut if annee else aujourdhui.replace(month=1, day=1))
    fin = fin or min(annee.date_fin if annee else aujourdhui, aujourdhui)
    if fin < debut:
        raise HTTPException(400, "La date de fin précède la date de début.")

    query = db.query(Presence).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Presence.date_presence >= debut,
        Presence.date_presence <= fin,
    )
    effectif = db.query(func.count(Inscription.inscription_id)).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id, Inscription.statut == "ACTIVE"
    )

    if classe_id:
        query = query.filter(Inscription.classe_id == classe_id)
        effectif = effectif.filter(Inscription.classe_id == classe_id)

    saisies = query.count()
    presents_saisis = query.filter(Presence.statut_presence == "PRESENT").count()
    absents = query.filter(Presence.statut_presence == "ABSENT").count()
    retards = query.filter(Presence.statut_presence == "RETARD").count()
    non_justifiees = query.filter(
        Presence.statut_presence == "ABSENT", Presence.est_justifie != "O"
    ).count()

    attendu = (effectif.scalar() or 0) * _demi_journees_de_classe(debut, fin)
    # Si l'école pointe réellement chaque présence, le total attendu vaut au
    # moins ce qu'elle a saisi : on ne veut pas d'un taux supérieur à 100 %.
    attendu = max(attendu, saisies)

    return {
        "debut": debut,
        "fin": fin,
        "attendu": attendu,
        "total": saisies,
        "presents": max(0, attendu - absents) if attendu else presents_saisis,
        "absents": absents,
        "absences_non_justifiees": non_justifiees,
        "retards": retards,
        "taux_presence": round((attendu - absents) / attendu * 100, 1) if attendu else 0,
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
