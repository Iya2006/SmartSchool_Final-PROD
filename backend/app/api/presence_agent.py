from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import date, datetime, time
from pydantic import BaseModel
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import PresenceAgent, Enseignant, Utilisateur

router = APIRouter(prefix="/api/presences-agents", tags=["Présences Agents (QR)"])

class ScanRequest(BaseModel):
    qr_data: str
    action_type: str = "AUTO"  # "ARRIVEE", "DEPART", "AUTO"

class ScanResponse(BaseModel):
    success: bool
    message: str
    action: str # "ARRIVEE" | "DEPART" | "DEJA_ENREGISTRE" | "ERREUR"
    agent: dict
    heure: str

@router.post("/scan", response_model=ScanResponse)
def scan_qr_code(request: ScanRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Enregistre l'arrivée ou le départ d'un agent via son code QR (matricule).

    L'agent est résolu DANS l'établissement appelant uniquement (Lot 9) :
    avant, scanner le badge d'un enseignant/personnel d'une autre école
    créait un pointage chez elle et renvoyait son identité.
    """
    qr_data = request.qr_data.strip()

    # 1. Identifier l'agent
    agent = None
    type_agent = ""
    agent_id = 0
    nom_complet = ""
    photo = ""
    role = ""

    # Chercher d'abord dans Enseignant
    enseignant = db.query(Enseignant).filter(
        Enseignant.matricule == qr_data, Enseignant.etablissement_id == etablissement_id
    ).first()
    if enseignant:
        agent = enseignant
        type_agent = "ENSEIGNANT"
        agent_id = enseignant.enseignant_id
        nom_complet = f"{enseignant.prenom} {enseignant.nom}"
        photo = enseignant.photo_url or ""
        role = "Enseignant"
    else:
        # Sinon, chercher dans Personnel (Utilisateur)
        personnel = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == qr_data, Utilisateur.etablissement_id == etablissement_id
        ).first()
        if personnel:
            agent = personnel
            type_agent = "PERSONNEL"
            agent_id = personnel.utilisateur_id
            nom_complet = f"{personnel.prenom} {personnel.nom}"
            # On suppose que l'utilisateur n'a pas forcément de photo, on met vide
            photo = "" 
            role = personnel.role
            
    if not agent:
        raise HTTPException(status_code=404, detail="Code QR invalide ou agent introuvable")
        
    # 2. Vérifier les présences d'aujourd'hui
    aujourd_hui = date.today()
    maintenant = datetime.now().time()
    
    presence = db.query(PresenceAgent).filter(
        PresenceAgent.agent_id == agent_id,
        PresenceAgent.type_agent == type_agent,
        PresenceAgent.date_presence == aujourd_hui
    ).first()
    
    agent_info = {
        "nom": nom_complet,
        "role": role,
        "matricule": qr_data,
        "photo": photo
    }
    
    if not presence:
        if request.action_type == "DEPART":
            return ScanResponse(
                success=False,
                message="Veuillez d'abord enregistrer votre arrivée.",
                action="ERREUR",
                agent=agent_info,
                heure=maintenant.strftime("%H:%M:%S")
            )
            
        # 1er scan : Arrivée
        # etablissement_id désormais peuplé (colonne existante mais jamais
        # renseignée avant le Lot 9 — voir .ai/MULTI_TENANT_PLAN.md).
        nouvelle_presence = PresenceAgent(
            type_agent=type_agent,
            agent_id=agent_id,
            etablissement_id=etablissement_id,
            date_presence=aujourd_hui,
            heure_arrivee=maintenant,
            statut="PRESENT"
        )
        db.add(nouvelle_presence)
        db.commit()
        return ScanResponse(
            success=True,
            message="Heure d'arrivée enregistrée avec succès.",
            action="ARRIVEE",
            agent=agent_info,
            heure=maintenant.strftime("%H:%M:%S")
        )
        
    elif presence.heure_depart is None:
        if request.action_type == "ARRIVEE":
            return ScanResponse(
                success=False,
                message="Arrivée déjà enregistrée pour aujourd'hui.",
                action="DEJA_ENREGISTRE",
                agent=agent_info,
                heure=presence.heure_arrivee.strftime("%H:%M:%S") if presence.heure_arrivee else "-"
            )
            
        # 2ème scan : Départ
        presence.heure_depart = maintenant
        db.commit()
        return ScanResponse(
            success=True,
            message="Heure de départ enregistrée avec succès.",
            action="DEPART",
            agent=agent_info,
            heure=maintenant.strftime("%H:%M:%S")
        )
        
    else:
        # 3ème scan : Déjà enregistré
        return ScanResponse(
            success=False,
            message="Vous avez déjà enregistré votre arrivée et votre départ aujourd'hui.",
            action="DEJA_ENREGISTRE",
            agent=agent_info,
            heure=presence.heure_depart.strftime("%H:%M:%S")
        )

def _filtre_agents_etablissement(db: Session, etablissement_id: int):
    """Restreint une requête PresenceAgent aux agents de cet établissement.

    `agent_id` est polymorphique (Enseignant OU Utilisateur selon
    `type_agent`) : on filtre par les identifiants réels plutôt que par
    `PresenceAgent.etablissement_id`, colonne nullable qui n'était jamais
    peuplée avant le Lot 9 (une ligne historique aurait donc disparu de
    l'historique si on filtrait dessus).
    """
    from sqlalchemy import or_, and_

    ens_ids = [e.enseignant_id for e in db.query(Enseignant.enseignant_id).filter(
        Enseignant.etablissement_id == etablissement_id
    ).all()]
    pers_ids = [u.utilisateur_id for u in db.query(Utilisateur.utilisateur_id).filter(
        Utilisateur.etablissement_id == etablissement_id
    ).all()]

    conditions = []
    if ens_ids:
        conditions.append(and_(PresenceAgent.type_agent == "ENSEIGNANT", PresenceAgent.agent_id.in_(ens_ids)))
    if pers_ids:
        conditions.append(and_(PresenceAgent.type_agent == "PERSONNEL", PresenceAgent.agent_id.in_(pers_ids)))
    if not conditions:
        return False  # aucun agent : ne remonter aucune ligne
    return or_(*conditions)


@router.get("/historique")
def get_historique_presences(
    db: Session = Depends(get_db),
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    recherche: Optional[str] = None,
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Récupère l'historique des présences DE CET ÉTABLISSEMENT, avec filtres.
    """
    query = db.query(PresenceAgent).filter(_filtre_agents_etablissement(db, etablissement_id))

    if date_debut:
        query = query.filter(PresenceAgent.date_presence >= date_debut)
    if date_fin:
        query = query.filter(PresenceAgent.date_presence <= date_fin)
        
    query = query.order_by(PresenceAgent.date_presence.desc(), PresenceAgent.heure_arrivee.desc())
    presences = query.all()
    
    resultats = []
    for p in presences:
        # Récupérer les infos de l'agent
        nom = ""
        matricule = ""
        role = ""
        photo_url = ""
        
        if p.type_agent == "ENSEIGNANT":
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == p.agent_id).first()
            if ens:
                nom = f"{ens.prenom} {ens.nom}"
                matricule = ens.matricule
                role = "Enseignant"
                photo_url = ens.photo_url or ""
        elif p.type_agent == "PERSONNEL":
            pers = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == p.agent_id).first()
            if pers:
                nom = f"{pers.prenom} {pers.nom}"
                matricule = pers.nom_utilisateur
                role = pers.role
                photo_url = pers.photo_url or ""
                
        # Filtre de recherche par nom ou matricule
        if recherche:
            q = recherche.lower()
            if q not in nom.lower() and q not in matricule.lower():
                continue
                
        resultats.append({
            "presence_id": p.presence_id,
            "date": p.date_presence.isoformat(),
            "heure_arrivee": p.heure_arrivee.strftime("%H:%M:%S") if p.heure_arrivee else None,
            "heure_depart": p.heure_depart.strftime("%H:%M:%S") if p.heure_depart else None,
            "statut": p.statut,
            "agent": {
                "nom": nom,
                "matricule": matricule,
                "role": role,
                "photo": photo_url,
                "type": p.type_agent
            }
        })
        
    return resultats


@router.get("/stats")
def get_presences_stats(
    db: Session = Depends(get_db),
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    etablissement_id: int = Depends(require_etablissement),
):
    """Statistiques de présence des agents DE CET ÉTABLISSEMENT."""
    if not date_debut:
        aujourd_hui = date.today()
        date_debut = date(aujourd_hui.year, aujourd_hui.month, 1)
    if not date_fin:
        date_fin = date.today()

    # Total Agents Actifs (Enseignants + Personnel) de cet établissement
    total_enseignants = db.query(func.count(Enseignant.enseignant_id)).filter(
        Enseignant.statut == 'ACTIF', Enseignant.etablissement_id == etablissement_id
    ).scalar() or 0
    total_personnel = db.query(func.count(Utilisateur.utilisateur_id)).filter(
        Utilisateur.statut == 'ACTIF', Utilisateur.etablissement_id == etablissement_id
    ).scalar() or 0
    total_agents = total_enseignants + total_personnel

    # Présences sur la période
    query = db.query(PresenceAgent).filter(
        _filtre_agents_etablissement(db, etablissement_id),
        PresenceAgent.date_presence >= date_debut,
        PresenceAgent.date_presence <= date_fin
    )
    presences = query.all()
    
    total_enregistrements = len(presences)
    jours_uniques = len(set([p.date_presence for p in presences]))
    total_attendus = total_agents * (jours_uniques if jours_uniques > 0 else 1) # Simplification
    absents = total_attendus - total_enregistrements if total_attendus > total_enregistrements else 0
    
    # Présences par jour de semaine
    jours_semaine = {"Lundi": 0, "Mardi": 0, "Mercredi": 0, "Jeudi": 0, "Vendredi": 0, "Samedi": 0}
    for p in presences:
        idx = p.date_presence.weekday()
        jours_noms = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
        if idx < 6: # Ignore dimanche pour simplifier ou l'inclure si besoin
            jours_semaine[jours_noms[idx]] += 1
            
    # Calculer le % par jour
    graphique_jours = []
    for jour, count in jours_semaine.items():
        taux = (count / (total_agents * max(1, jours_uniques/6))) * 100 if total_agents > 0 and jours_uniques > 0 else 0
        graphique_jours.append({"name": jour, "value": round(taux, 1), "count": count})
        
    # Répartition par heure (6h, 7h, 8h...)
    heures = {f"{h}h": 0 for h in range(6, 18)}
    for p in presences:
        if p.heure_arrivee:
            h = p.heure_arrivee.hour
            key = f"{h}h"
            if key in heures:
                heures[key] += 1
                
    graphique_heures = [{"name": k, "value": v} for k, v in heures.items()]
    
    total_arrivees = sum(1 for p in presences if p.heure_arrivee)
    total_departs = sum(1 for p in presences if p.heure_depart)
    
    return {
        "kpis": {
            "total_enregistrements": total_enregistrements,
            "presences": total_enregistrements,
            "absents": absents,
            "taux_presence": round((total_enregistrements / max(1, total_attendus)) * 100, 1) if total_agents > 0 else 0,
            "total_agents": total_agents,
            "total_arrivees": total_arrivees,
            "total_departs": total_departs
        },
        "graphique_jours": graphique_jours,
        "graphique_heures": graphique_heures
    }
