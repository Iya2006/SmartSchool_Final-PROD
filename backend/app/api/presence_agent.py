import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import date, datetime, time
from pydantic import BaseModel
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import (
    PresenceAgent, Enseignant, Utilisateur, CreneauEmploi, Classe, Matiere,
)

router = APIRouter(prefix="/api/presences-agents", tags=["Présences Agents (QR)"])

_JOURS_MAP = {0: "LUNDI", 1: "MARDI", 2: "MERCREDI", 3: "JEUDI", 4: "VENDREDI", 5: "SAMEDI", 6: "DIMANCHE"}


def _matricule_depuis_qr(qr_data: str) -> str:
    """Identifiant réel encodé dans un badge.

    Les cartes/badges encodent un TEXTE lisible (nom, « Matricule : X », tél,
    adresse, classes…), pas seulement le matricule — voir cartes.py::contenu_qr.
    On en extrait le matricule ; si le QR est déjà un identifiant nu (ancien
    badge ou repli), on le renvoie tel quel.
    """
    txt = (qr_data or "").strip()
    m = re.search(r"Matricule\s*:\s*([^\r\n]+)", txt, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # Pas de ligne « Matricule » : soit un identifiant nu, soit la 1re ligne
    # (le nom) — on garde la valeur brute, la recherche tranchera.
    return txt.splitlines()[0].strip() if txt else txt


def _journee_enseignant(db: Session, type_agent: str, agent_id: int, presence) -> Optional[dict]:
    """Infos de la journée à afficher au pointage d'un enseignant :
    ses cours du jour (emploi du temps) + arrivée/départ + retard éventuel.

    Ne concerne que les enseignants (un agent administratif n'a pas de cours).
    Le retard est calculé par rapport au début de son premier cours du jour.
    """
    if type_agent != "ENSEIGNANT":
        return None
    jour = _JOURS_MAP.get(date.today().weekday())
    rows = (
        db.query(CreneauEmploi, Classe, Matiere)
        .join(Classe, Classe.classe_id == CreneauEmploi.classe_id)
        .join(Matiere, Matiere.matiere_id == CreneauEmploi.matiere_id)
        .filter(
            CreneauEmploi.enseignant_id == agent_id,
            CreneauEmploi.jour == jour,
            CreneauEmploi.statut == "ACTIVE",
        )
        .order_by(CreneauEmploi.heure_debut)
        .all()
    )
    cours = [
        {"heure_debut": c.heure_debut, "heure_fin": c.heure_fin,
         "classe": cl.libelle, "matiere": m.libelle, "salle": c.salle}
        for c, cl, m in rows
    ]
    arrivee = presence.heure_arrivee.strftime("%H:%M") if presence and presence.heure_arrivee else None
    depart = presence.heure_depart.strftime("%H:%M") if presence and presence.heure_depart else None
    retard, minutes_retard = False, 0
    if arrivee and cours:
        try:
            ah, am = map(int, arrivee.split(":"))
            ph, pm = map(int, cours[0]["heure_debut"].split(":"))
            diff = (ah * 60 + am) - (ph * 60 + pm)
            if diff > 0:
                retard, minutes_retard = True, diff
        except (ValueError, TypeError):
            pass
    return {
        "cours": cours,
        "arrivee": arrivee,
        "depart": depart,
        "retard": retard,
        "minutes_retard": minutes_retard,
        "premier_cours": cours[0]["heure_debut"] if cours else None,
    }


class ScanRequest(BaseModel):
    qr_data: str
    action_type: str = "AUTO"  # "ARRIVEE", "DEPART", "AUTO"

class ScanResponse(BaseModel):
    success: bool
    message: str
    action: str # "ARRIVEE" | "DEPART" | "DEJA_ENREGISTRE" | "ERREUR"
    agent: dict
    heure: str
    # Cours du jour + arrivée/retard de l'enseignant (None pour le personnel).
    journee: Optional[dict] = None

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

    # Le badge encode un texte lisible : on en extrait le matricule réel avant
    # toute recherche (sans quoi on cherchait l'agent dont le matricule vaut
    # « Lycée … Matricule : ENS-… Tél : … », qui n'existe évidemment pas).
    cle = _matricule_depuis_qr(qr_data)

    # Chercher d'abord dans Enseignant
    enseignant = db.query(Enseignant).filter(
        Enseignant.matricule == cle, Enseignant.etablissement_id == etablissement_id
    ).first()
    if enseignant:
        agent = enseignant
        type_agent = "ENSEIGNANT"
        agent_id = enseignant.enseignant_id
        nom_complet = f"{enseignant.prenom} {enseignant.nom}"
        photo = enseignant.photo_url or ""
        role = "Enseignant"
    else:
        # Sinon, chercher dans Personnel (Utilisateur) — par matricule extrait
        # OU par nom d'utilisateur (badge encodant l'identifiant nu).
        personnel = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur.in_([cle, qr_data.strip()]),
            Utilisateur.etablissement_id == etablissement_id,
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
        "matricule": cle,
        "photo": photo
    }
    
    if not presence:
        if request.action_type == "DEPART":
            return ScanResponse(
                success=False,
                message="Veuillez d'abord enregistrer votre arrivée.",
                action="ERREUR",
                agent=agent_info,
                heure=maintenant.strftime("%H:%M:%S"),
                journee=_journee_enseignant(db, type_agent, agent_id, None),
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
            heure=maintenant.strftime("%H:%M:%S"),
            journee=_journee_enseignant(db, type_agent, agent_id, nouvelle_presence),
        )

    elif presence.heure_depart is None:
        if request.action_type == "ARRIVEE":
            return ScanResponse(
                success=False,
                message="Arrivée déjà enregistrée pour aujourd'hui.",
                action="DEJA_ENREGISTRE",
                agent=agent_info,
                heure=presence.heure_arrivee.strftime("%H:%M:%S") if presence.heure_arrivee else "-",
                journee=_journee_enseignant(db, type_agent, agent_id, presence),
            )

        # 2ème scan : Départ
        presence.heure_depart = maintenant
        db.commit()
        return ScanResponse(
            success=True,
            message="Heure de départ enregistrée avec succès.",
            action="DEPART",
            agent=agent_info,
            heure=maintenant.strftime("%H:%M:%S"),
            journee=_journee_enseignant(db, type_agent, agent_id, presence),
        )

    else:
        # 3ème scan : Déjà enregistré
        return ScanResponse(
            success=False,
            message="Vous avez déjà enregistré votre arrivée et votre départ aujourd'hui.",
            action="DEJA_ENREGISTRE",
            agent=agent_info,
            heure=presence.heure_depart.strftime("%H:%M:%S"),
            journee=_journee_enseignant(db, type_agent, agent_id, presence),
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


class PointageManuelRequest(BaseModel):
    type_agent: str = "ENSEIGNANT"     # "ENSEIGNANT" | "PERSONNEL"
    agent_id: int
    date_presence: date
    heure_arrivee: Optional[str] = None  # "08:05"
    heure_depart: Optional[str] = None


def _parse_heure(valeur: Optional[str]):
    """« 08:05 » -> time(8, 5). Vide -> None. Format invalide -> 400."""
    if not valeur:
        return None
    try:
        hh, mm = (int(x) for x in valeur.split(":")[:2])
        return time(hh, mm)
    except (ValueError, TypeError):
        raise HTTPException(400, f"Heure invalide : {valeur} (attendu HH:MM)")


@router.post("/manuel")
def pointage_manuel(
    request: PointageManuelRequest,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Saisie MANUELLE d'un pointage, sans scan.

    Pour les situations où le badge/la caméra n'est pas utilisable (pas de
    courant, pas d'appareil) : le surveillant note l'arrivée/le départ à la
    main, éventuellement plus tard, et tout le monde le voit ensuite. Ré-saisir
    le même agent/jour met à jour le pointage existant (pas de doublon).
    """
    if request.type_agent == "ENSEIGNANT":
        agent = db.query(Enseignant).filter(
            Enseignant.enseignant_id == request.agent_id,
            Enseignant.etablissement_id == etablissement_id,
        ).first()
    elif request.type_agent == "PERSONNEL":
        agent = db.query(Utilisateur).filter(
            Utilisateur.utilisateur_id == request.agent_id,
            Utilisateur.etablissement_id == etablissement_id,
        ).first()
    else:
        raise HTTPException(400, "type_agent invalide (ENSEIGNANT ou PERSONNEL)")
    if not agent:
        raise HTTPException(404, "Agent introuvable dans cet établissement")

    t_arr = _parse_heure(request.heure_arrivee)
    t_dep = _parse_heure(request.heure_depart)
    if t_arr is None and t_dep is None:
        raise HTTPException(400, "Renseignez au moins l'heure d'arrivée.")

    presence = db.query(PresenceAgent).filter(
        PresenceAgent.agent_id == request.agent_id,
        PresenceAgent.type_agent == request.type_agent,
        PresenceAgent.date_presence == request.date_presence,
    ).first()
    if presence:
        if t_arr is not None:
            presence.heure_arrivee = t_arr
        if t_dep is not None:
            presence.heure_depart = t_dep
        presence.statut = "PRESENT"
        action = "MODIFIE"
    else:
        presence = PresenceAgent(
            type_agent=request.type_agent,
            agent_id=request.agent_id,
            etablissement_id=etablissement_id,
            date_presence=request.date_presence,
            heure_arrivee=t_arr,
            heure_depart=t_dep,
            statut="PRESENT",
        )
        db.add(presence)
        action = "CREE"
    db.commit()
    db.refresh(presence)
    return {"message": "Pointage manuel enregistré.", "presence_id": presence.presence_id, "action": action}


@router.delete("/{presence_id}")
def supprimer_presence_agent(
    presence_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Supprime un pointage (arrivée + départ du jour) — scanné ou saisi à la main."""
    filtre = _filtre_agents_etablissement(db, etablissement_id)
    if filtre is False:
        raise HTTPException(404, "Pointage introuvable")
    p = db.query(PresenceAgent).filter(
        PresenceAgent.presence_id == presence_id, filtre
    ).first()
    if not p:
        raise HTTPException(404, "Pointage introuvable")
    db.delete(p)
    db.commit()
    return {"message": "Pointage supprimé.", "presence_id": presence_id}


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
