"""
SMARTSCHOOL — Pointage QR Code Élèves (Entrée/Sortie de l'établissement)
Distinct de l'appel en classe (Presence) : ce module gère la présence physique
à l'école (portail d'entrée), indépendamment des cours suivis.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from datetime import date, datetime, time
from pydantic import BaseModel
from typing import List, Optional

from app.core.database import get_db
from app.models.academique import PointageEleve, Eleve, Inscription

router = APIRouter(prefix="/api/pointage-eleves", tags=["Pointage Élèves (QR)"])


# ============================================================================
# SCHEMAS
# ============================================================================

class ScanEleveRequest(BaseModel):
    qr_data: str           # matricule de l'élève
    action_type: str = "AUTO"   # "ARRIVEE", "DEPART", "AUTO"

class ScanEleveResponse(BaseModel):
    success: bool
    message: str
    action: str
    eleve: dict
    heure: str


# ============================================================================
# SCAN QR CODE
# ============================================================================

@router.post("/scan", response_model=ScanEleveResponse)
def scan_eleve_qr(request: ScanEleveRequest, db: Session = Depends(get_db)):
    """
    Enregistre l'arrivée ou le départ d'un élève à l'établissement via QR Code (matricule).
    Ce pointage est indépendant de l'appel en classe fait par l'enseignant.
    """
    qr_data = request.qr_data.strip()

    # Identifier l'élève par son matricule
    eleve = db.query(Eleve).filter(Eleve.matricule == qr_data).first()
    if not eleve:
        raise HTTPException(
            status_code=404,
            detail=f"Code QR invalide — aucun élève avec le matricule : {qr_data}"
        )

    aujourd_hui = date.today()
    maintenant = datetime.now().time()

    # Chercher l'inscription active pour récupérer la classe
    insc = db.query(Inscription).filter(
        Inscription.eleve_id == eleve.eleve_id,
        Inscription.statut == "ACTIVE"
    ).first()
    classe_code = ""
    if insc:
        from app.models.academique import Classe
        cls = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
        classe_code = cls.code if cls else ""

    eleve_info = {
        "nom": f"{eleve.prenom} {eleve.nom}",
        "matricule": eleve.matricule,
        "classe": classe_code,
        "photo": eleve.photo_url or ""
    }

    # Chercher pointage existant aujourd'hui
    pointage = db.query(PointageEleve).filter(
        PointageEleve.eleve_id == eleve.eleve_id,
        PointageEleve.date_pointage == aujourd_hui
    ).first()

    if not pointage:
        if request.action_type == "DEPART":
            return ScanEleveResponse(
                success=False,
                message="Veuillez d'abord enregistrer l'arrivée de l'élève.",
                action="ERREUR",
                eleve=eleve_info,
                heure=maintenant.strftime("%H:%M:%S")
            )
        # Premier scan : Arrivée à l'école
        nouveau_pointage = PointageEleve(
            eleve_id=eleve.eleve_id,
            etablissement_id=getattr(eleve, 'etablissement_id', None),
            date_pointage=aujourd_hui,
            heure_arrivee=maintenant,
            statut="PRESENT"
        )
        db.add(nouveau_pointage)
        db.commit()
        return ScanEleveResponse(
            success=True,
            message=f"Bienvenue {eleve.prenom} ! Arrivée enregistrée.",
            action="ARRIVEE",
            eleve=eleve_info,
            heure=maintenant.strftime("%H:%M:%S")
        )

    elif pointage.heure_depart is None:
        if request.action_type == "ARRIVEE":
            return ScanEleveResponse(
                success=False,
                message=f"Arrivée déjà enregistrée à {pointage.heure_arrivee.strftime('%H:%M') if pointage.heure_arrivee else '-'}.",
                action="DEJA_ENREGISTRE",
                eleve=eleve_info,
                heure=pointage.heure_arrivee.strftime("%H:%M:%S") if pointage.heure_arrivee else "-"
            )
        # Deuxième scan : Départ
        pointage.heure_depart = maintenant
        pointage.statut = "PARTI"
        db.commit()
        return ScanEleveResponse(
            success=True,
            message=f"Au revoir {eleve.prenom} ! Départ enregistré.",
            action="DEPART",
            eleve=eleve_info,
            heure=maintenant.strftime("%H:%M:%S")
        )

    else:
        return ScanEleveResponse(
            success=False,
            message="Arrivée et départ déjà enregistrés pour aujourd'hui.",
            action="DEJA_ENREGISTRE",
            eleve=eleve_info,
            heure=pointage.heure_depart.strftime("%H:%M:%S")
        )


# ============================================================================
# HISTORIQUE ET STATS
# ============================================================================

@router.get("/historique")
def get_historique_pointage_eleves(
    db: Session = Depends(get_db),
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None,
    recherche: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """Historique des pointages élèves, paginé."""
    if not date_debut:
        date_debut = date.today()
    if not date_fin:
        date_fin = date.today()

    query = db.query(PointageEleve).filter(
        PointageEleve.date_pointage >= date_debut,
        PointageEleve.date_pointage <= date_fin
    ).order_by(PointageEleve.date_pointage.desc(), PointageEleve.heure_arrivee.desc())

    total = query.count()
    pointages = query.offset(skip).limit(limit).all()

    resultats = []
    for p in pointages:
        eleve = db.query(Eleve).filter(Eleve.eleve_id == p.eleve_id).first()
        if not eleve:
            continue

        nom = f"{eleve.prenom} {eleve.nom}"
        matricule = eleve.matricule

        # Filtre recherche
        if recherche:
            q = recherche.lower()
            if q not in nom.lower() and q not in matricule.lower():
                continue

        insc = db.query(Inscription).filter(
            Inscription.eleve_id == p.eleve_id,
            Inscription.statut == "ACTIVE"
        ).first()
        classe_code = ""
        if insc:
            from app.models.academique import Classe
            cls = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
            classe_code = cls.code if cls else ""

        resultats.append({
            "pointage_id": p.pointage_id,
            "date": p.date_pointage.isoformat(),
            "heure_arrivee": p.heure_arrivee.strftime("%H:%M:%S") if p.heure_arrivee else None,
            "heure_depart": p.heure_depart.strftime("%H:%M:%S") if p.heure_depart else None,
            "statut": p.statut,
            "eleve": {
                "nom": nom,
                "matricule": matricule,
                "classe": classe_code,
                "photo": eleve.photo_url or ""
            }
        })

    return {"total": total, "data": resultats}


@router.get("/stats")
def get_stats_pointage_eleves(
    db: Session = Depends(get_db),
    date_debut: Optional[date] = None,
    date_fin: Optional[date] = None
):
    """Statistiques de pointage élèves pour une période."""
    if not date_debut:
        date_debut = date.today()
    if not date_fin:
        date_fin = date.today()

    # Total élèves actifs
    total_eleves = db.query(func.count(Eleve.eleve_id)).filter(
        Eleve.statut == "ACTIF"
    ).scalar() or 0

    pointages = db.query(PointageEleve).filter(
        PointageEleve.date_pointage >= date_debut,
        PointageEleve.date_pointage <= date_fin
    ).all()

    total_pointages = len(pointages)
    total_arrivees = sum(1 for p in pointages if p.heure_arrivee)
    total_departs = sum(1 for p in pointages if p.heure_depart)

    return {
        "kpis": {
            "total_eleves_actifs": total_eleves,
            "total_pointages": total_pointages,
            "presents": total_arrivees,
            "total_arrivees": total_arrivees,
            "total_departs": total_departs,
        }
    }


# ============================================================================
# APPEL DU JOUR (VUE ADMIN)
# ============================================================================

@router.get("/appel-du-jour")
def get_appel_du_jour(
    db: Session = Depends(get_db),
    date_cible: Optional[date] = None
):
    """
    Vue Admin : état des appels faits par les enseignants pour la journée.
    Retourne pour chaque classe : enseignant principal, heure du dernier appel,
    nombre de présents/absents, et si l'appel a été fait.
    """
    from app.models.academique import Classe, Enseignant, Affectation, Presence, Inscription, Niveau
    from sqlalchemy import distinct

    if not date_cible:
        date_cible = date.today()

    # Récupérer toutes les classes
    classes = db.query(Classe).filter(Classe.statut == "ACTIVE").all()

    resultats = []
    for cls in classes:
        # Trouver l'enseignant principal (est_principal = 'O')
        aff_principal = db.query(Affectation).filter(
            Affectation.classe_id == cls.classe_id,
            Affectation.statut == "ACTIVE",
            Affectation.est_principal == "O"
        ).first()

        enseignant_nom = "—"
        if aff_principal:
            ens = db.query(Enseignant).filter(
                Enseignant.enseignant_id == aff_principal.enseignant_id
            ).first()
            if ens:
                enseignant_nom = f"{ens.prenom} {ens.nom}"

        # Compter les inscriptions actives dans cette classe
        total_inscrits = db.query(func.count(Inscription.inscription_id)).filter(
            Inscription.classe_id == cls.classe_id,
            Inscription.statut == "ACTIVE"
        ).scalar() or 0

        # Chercher les présences pour cette classe aujourd'hui
        presences_du_jour = db.query(Presence).join(
            Inscription, Presence.inscription_id == Inscription.inscription_id
        ).filter(
            Inscription.classe_id == cls.classe_id,
            Presence.date_presence == date_cible
        ).all()

        appel_fait = len(presences_du_jour) > 0
        nb_presents = sum(1 for p in presences_du_jour if p.statut_presence == "PRESENT")
        nb_absents = sum(1 for p in presences_du_jour if p.statut_presence in ("ABSENT", "RETARD"))
        demi_journee = presences_du_jour[0].demi_journee if presences_du_jour else None

        resultats.append({
            "classe_id": cls.classe_id,
            "classe_code": cls.code,
            "classe_libelle": cls.libelle,
            "effectif": total_inscrits,
            "enseignant_principal": enseignant_nom,
            "appel_fait": appel_fait,
            "nb_presents": nb_presents,
            "nb_absents": nb_absents,
            "demi_journee": demi_journee,
            "taux_presence": round((nb_presents / max(1, len(presences_du_jour))) * 100, 1) if appel_fait else None,
        })

    # Trier : classes avec appel fait en premier
    resultats.sort(key=lambda x: (not x["appel_fait"], x["classe_code"]))

    stats = {
        "date": date_cible.isoformat(),
        "total_classes": len(resultats),
        "classes_appelees": sum(1 for r in resultats if r["appel_fait"]),
        "classes_non_appelees": sum(1 for r in resultats if not r["appel_fait"]),
    }

    return {"stats": stats, "classes": resultats}
