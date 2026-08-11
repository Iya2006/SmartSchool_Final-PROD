"""
API pour le module Examens & Évaluations
- Upload de sujets par les enseignants
- Gestion des sujets côté admin
- Construction et publication de l'emploi des examens
"""

import os
import shutil
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement
from app.models.academique import (
    SujetExamen, EmploiExamen, CreneauExamen, DemandeEmploi,
    Message, Enseignant, Matiere, Classe, Cycle, ClasseMatiere, Affectation
)

router = APIRouter(prefix="/api/examens", tags=["Examens"])

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "sujets")
os.makedirs(UPLOAD_DIR, exist_ok=True)


ADMIN_TIER_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU"}


def _charger_sujet_ou_404(db: Session, sujet_id: int, etablissement_id: int) -> SujetExamen:
    """Charge un sujet en vérifiant qu'il appartient à l'établissement
    appelant (via son auteur, seule relation fiable — voir SujetExamen).
    404 (pas 403) pour ne jamais confirmer l'existence d'un sujet d'une
    autre école."""
    sujet = (
        db.query(SujetExamen)
        .join(Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id)
        .filter(SujetExamen.sujet_id == sujet_id, Enseignant.etablissement_id == etablissement_id)
        .first()
    )
    if not sujet:
        raise HTTPException(404, "Sujet non trouvé")
    return sujet


def _verifier_auteur_sujet(sujet: SujetExamen, current_user: dict) -> None:
    """En plus de l'établissement, un enseignant ne doit gérer que SES
    PROPRES sujets (le scénario de fuite avant-examen explicitement visé :
    un enseignant ne doit jamais pouvoir consulter/télécharger/modifier le
    sujet d'un collègue). Les comptes admin-tier de l'établissement
    contournent cette restriction (rôle déjà vérifié en amont par
    EXAMENS_ROLES au niveau du routeur)."""
    role = current_user.get("role", "")
    if role in ADMIN_TIER_ROLES:
        return
    if current_user.get("type") == "enseignant" and str(current_user.get("sub", "")) == str(sujet.enseignant_id):
        return
    raise HTTPException(403, "Accès refusé : ce sujet appartient à un autre enseignant")


# ================================================================
# SUJETS D'EXAMEN
# ================================================================

@router.post("/sujets/upload", status_code=201)
async def upload_sujet(
    fichier: UploadFile = File(...),
    enseignant_id: int = Form(...),
    matiere_id: int = Form(...),
    trimestre: int = Form(...),
    titre: str = Form(...),
    duree_minutes: int = Form(...),
    classe_id: Optional[int] = Form(None),
    demande_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Upload d'un sujet d'examen par un enseignant.
    Le sujet est immédiatement envoyé à l'administration (statut ENVOYE)
    et un message de notification est créé pour l'admin.
    """
    # Validate — l'enseignant doit appartenir à l'établissement appelant, et
    # un compte enseignant ne peut déposer un sujet que sous sa propre
    # identité (jamais au nom d'un collègue) ; un admin peut déposer pour
    # n'importe quel enseignant de SON établissement.
    ens = db.query(Enseignant).filter(
        Enseignant.enseignant_id == enseignant_id, Enseignant.etablissement_id == etablissement_id
    ).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")
    if current_user.get("role") not in ADMIN_TIER_ROLES:
        if current_user.get("type") != "enseignant" or str(current_user.get("sub", "")) != str(enseignant_id):
            raise HTTPException(403, "Vous ne pouvez déposer un sujet que sous votre propre identité")

    mat = (
        db.query(Matiere)
        .join(Cycle, Cycle.cycle_id == Matiere.cycle_id)
        .filter(Matiere.matiere_id == matiere_id, Cycle.etablissement_id == etablissement_id)
        .first()
    )
    if not mat:
        raise HTTPException(404, "Matière non trouvée")

    if classe_id is not None:
        classe_valide = db.query(Classe.classe_id).filter(
            Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
        ).first()
        if not classe_valide:
            raise HTTPException(404, "Classe non trouvée")

    if trimestre not in [1, 2, 3]:
        raise HTTPException(400, "Le trimestre doit être 1, 2 ou 3")

    # Check file type
    allowed_types = [
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg", "image/png", "image/webp"
    ]
    if fichier.content_type and fichier.content_type not in allowed_types:
        raise HTTPException(400, f"Type de fichier non autorisé: {fichier.content_type}")

    # Save file
    ext = os.path.splitext(fichier.filename)[1] if fichier.filename else ".pdf"
    safe_name = f"sujet_{enseignant_id}_{matiere_id}_T{trimestre}_{int(datetime.now().timestamp())}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(file_path, "wb") as buffer:
        content = await fichier.read()
        buffer.write(content)

    # Create record — directly ENVOYE (no draft step needed from portal)
    now = datetime.now()
    sujet = SujetExamen(
        demande_id=demande_id,
        enseignant_id=enseignant_id,
        matiere_id=matiere_id,
        classe_id=classe_id,
        trimestre=trimestre,
        titre=titre,
        fichier_nom=fichier.filename or safe_name,
        fichier_path=safe_name,
        fichier_type=ext.replace(".", ""),
        fichier_taille=len(content),
        duree_minutes=duree_minutes,
        statut="ENVOYE",
        date_envoi=now,
    )
    db.add(sujet)
    db.flush()  # get sujet_id before creating message

    # Create notification message to admin
    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=demande_id,
        expediteur_type="ENSEIGNANT",
        expediteur_id=enseignant_id,
        destinataire_type="ADMIN",
        objet_type="EXAMENS",
        sujet=f"Sujet déposé — {mat.libelle} (T{trimestre})",
        contenu=(
            f"{ens.prenom} {ens.nom} a déposé le sujet \u00ab {titre} \u00bb "
            f"pour la matière {mat.libelle} — Trimestre {trimestre}, "
            f"durée {duree_minutes} min (fichier : {fichier.filename or safe_name})."
        )
    )
    db.add(msg)
    db.commit()
    db.refresh(sujet)

    return {
        "message": f"Sujet \u00ab {titre} \u00bb envoyé à l'administration avec succès.",
        "sujet_id": sujet.sujet_id,
        "fichier_nom": sujet.fichier_nom,
        "statut": "ENVOYE"
    }


@router.get("/sujets")
def get_sujets(
    enseignant_id: Optional[int] = None,
    trimestre: Optional[int] = None,
    statut: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste des sujets - filtrable par enseignant, trimestre, statut.
    Toujours restreinte à l'établissement appelant. Un compte enseignant ne
    voit que ses propres sujets (le paramètre enseignant_id, s'il tente de
    désigner un collègue, est ignoré) ; un admin peut filtrer par n'importe
    quel enseignant de son établissement."""
    query = db.query(SujetExamen).join(Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id).filter(
        Enseignant.etablissement_id == etablissement_id
    )
    if current_user.get("role") not in ADMIN_TIER_ROLES and current_user.get("type") == "enseignant":
        query = query.filter(SujetExamen.enseignant_id == current_user.get("sub"))
    elif enseignant_id:
        query = query.filter(SujetExamen.enseignant_id == enseignant_id)
    if trimestre:
        query = query.filter(SujetExamen.trimestre == trimestre)
    if statut:
        query = query.filter(SujetExamen.statut == statut)

    sujets = query.order_by(SujetExamen.date_depot.desc()).all()
    result = []
    for s in sujets:
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == s.enseignant_id).first()
        mat = db.query(Matiere).filter(Matiere.matiere_id == s.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == s.classe_id).first() if s.classe_id else None
        result.append({
            "sujet_id": s.sujet_id,
            "demande_id": s.demande_id,
            "enseignant_id": s.enseignant_id,
            "enseignant_nom": f"{ens.prenom} {ens.nom}" if ens else "?",
            "enseignant_specialite": ens.specialite if ens else None,
            "matiere_id": s.matiere_id,
            "matiere_code": mat.code if mat else "?",
            "matiere_libelle": mat.libelle if mat else "?",
            "classe_id": s.classe_id,
            "classe_libelle": cls.libelle if cls else None,
            "trimestre": s.trimestre,
            "titre": s.titre,
            "fichier_nom": s.fichier_nom,
            "fichier_path": s.fichier_path,
            "fichier_type": s.fichier_type,
            "fichier_taille": s.fichier_taille,
            "duree_minutes": s.duree_minutes,
            "statut": s.statut,
            "commentaire": s.commentaire,
            "date_depot": str(s.date_depot) if s.date_depot else None,
            "date_envoi": str(s.date_envoi) if s.date_envoi else None,
        })
    return result


@router.put("/sujets/{sujet_id}/envoyer")
def envoyer_sujet(
    sujet_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """L'enseignant envoie son sujet à l'admin."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    if sujet.statut not in ["BROUILLON", "REJETE"]:
        raise HTTPException(400, f"Le sujet est déjà '{sujet.statut}', impossible de l'envoyer.")

    sujet.statut = "ENVOYE"
    sujet.date_envoi = datetime.now()

    # Create notification message to admin
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == sujet.enseignant_id).first()
    mat = db.query(Matiere).filter(Matiere.matiere_id == sujet.matiere_id).first()
    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=sujet.demande_id,
        expediteur_type="ENSEIGNANT",
        expediteur_id=sujet.enseignant_id,
        destinataire_type="ADMIN",
        objet_type="EXAMENS",
        sujet=f"Sujet déposé — {mat.libelle if mat else '?'} (T{sujet.trimestre})",
        contenu=f"{ens.prenom if ens else ''} {ens.nom if ens else ''} a envoyé le sujet '{sujet.titre}' ({sujet.fichier_nom}, {sujet.duree_minutes} min)."
    )
    db.add(msg)
    db.commit()

    return {"message": f"Sujet '{sujet.titre}' envoyé à l'administration.", "statut": "ENVOYE"}


@router.put("/sujets/{sujet_id}/valider")
def valider_sujet(sujet_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """L'admin valide un sujet reçu. Met à jour le statut de la demande si tout est validé."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    sujet.statut = "VALIDE"

    # Check if all sujets for this demande are now validated → mark demande as TRAITE
    if sujet.demande_id:
        sujets_demande = db.query(SujetExamen).filter(
            SujetExamen.demande_id == sujet.demande_id,
            SujetExamen.statut.in_(["ENVOYE", "VALIDE"])
        ).all()
        all_valides = all(s.statut == "VALIDE" or s.sujet_id == sujet_id for s in sujets_demande)
        if all_valides and len(sujets_demande) > 0:
            demande = db.query(DemandeEmploi).filter(
                DemandeEmploi.demande_id == sujet.demande_id
            ).first()
            if demande and demande.statut == "EN_COURS":
                demande.statut = "TRAITE"

    db.commit()
    return {"message": "Sujet validé.", "statut": "VALIDE"}


@router.put("/sujets/{sujet_id}/rejeter")
def rejeter_sujet(sujet_id: int, raison: str = "", db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """L'admin rejette un sujet avec commentaire."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    sujet.statut = "REJETE"
    sujet.commentaire = raison

    # Notify teacher
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == sujet.enseignant_id).first()
    mat = db.query(Matiere).filter(Matiere.matiere_id == sujet.matiere_id).first()
    msg = Message(
        etablissement_id=etablissement_id,
        expediteur_type="ADMIN",
        destinataire_type="ENSEIGNANT",
        destinataire_id=sujet.enseignant_id,
        objet_type="EXAMENS",
        sujet=f"Sujet rejeté — {mat.libelle if mat else '?'} (T{sujet.trimestre})",
        contenu=f"Votre sujet '{sujet.titre}' a été rejeté. Raison: {raison or 'Non spécifiée'}. Veuillez soumettre un nouveau sujet."
    )
    db.add(msg)
    db.commit()
    return {"message": "Sujet rejeté, enseignant notifié."}


@router.delete("/sujets/{sujet_id}")
def supprimer_sujet(
    sujet_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Supprimer un sujet (brouillon ou envoyé uniquement)."""
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    if sujet.statut not in ["BROUILLON", "ENVOYE"]:
        raise HTTPException(400, "Seuls les sujets non validés peuvent être supprimés.")

    # Delete file
    file_path = os.path.join(UPLOAD_DIR, sujet.fichier_path)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(sujet)
    db.commit()
    return {"message": "Sujet supprimé."}


class SujetModifier(BaseModel):
    titre: str
    duree_minutes: int
    trimestre: int


@router.put("/sujets/{sujet_id}/modifier")
def modifier_sujet(
    sujet_id: int,
    data: SujetModifier,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """L'enseignant modifie les métadonnées d'un sujet non encore validé.
    La modification est immédiatement visible côté admin (pas de re-notification).
    """
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    if sujet.statut == "VALIDE":
        raise HTTPException(400, "Un sujet validé ne peut plus être modifié.")
    sujet.titre = data.titre
    sujet.duree_minutes = data.duree_minutes
    sujet.trimestre = data.trimestre
    db.commit()
    return {"message": "Sujet mis à jour.", "sujet_id": sujet_id}


# Serve uploaded files
from fastapi.responses import FileResponse

@router.get("/sujets/{sujet_id}/fichier")
def telecharger_sujet(
    sujet_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Télécharger le fichier d'un sujet.

    Scénario de fuite explicitement visé par ce lot : avant, n'importe quel
    compte EXAMENS_ROLES (y compris un simple enseignant) pouvait télécharger
    le sujet d'un collègue — voire d'une autre école — avant l'examen, sans
    aucune vérification. Désormais : établissement + auteur du sujet
    (ou admin de cet établissement) uniquement.
    """
    sujet = _charger_sujet_ou_404(db, sujet_id, etablissement_id)
    _verifier_auteur_sujet(sujet, current_user)
    file_path = os.path.join(UPLOAD_DIR, sujet.fichier_path)
    if not os.path.exists(file_path):
        raise HTTPException(404, "Fichier non trouvé sur le serveur")
    return FileResponse(file_path, filename=sujet.fichier_nom)


# ================================================================
# STATISTIQUES ADMIN - CENTRE D'ÉVALUATION
# ================================================================

@router.get("/admin/stats")
def get_exam_stats(trimestre: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Statistiques pour le centre d'évaluation admin."""
    q = db.query(SujetExamen).join(Enseignant, Enseignant.enseignant_id == SujetExamen.enseignant_id).filter(
        Enseignant.etablissement_id == etablissement_id
    )
    if trimestre:
        q = q.filter(SujetExamen.trimestre == trimestre)

    all_sujets = q.all()
    total = len(all_sujets)
    brouillons = len([s for s in all_sujets if s.statut == "BROUILLON"])
    envoyes = len([s for s in all_sujets if s.statut == "ENVOYE"])
    valides = len([s for s in all_sujets if s.statut == "VALIDE"])
    rejetes = len([s for s in all_sujets if s.statut == "REJETE"])

    # Enseignants uniques ayant soumis
    ens_ids = set(s.enseignant_id for s in all_sujets if s.statut in ["ENVOYE", "VALIDE"])
    total_enseignants = db.query(Enseignant).filter(
        Enseignant.statut == "ACTIF", Enseignant.etablissement_id == etablissement_id
    ).count()

    return {
        "total_sujets": total,
        "brouillons": brouillons,
        "envoyes": envoyes,
        "valides": valides,
        "rejetes": rejetes,
        "enseignants_soumis": len(ens_ids),
        "total_enseignants": total_enseignants,
        "taux_soumission": round(len(ens_ids) / max(total_enseignants, 1) * 100, 1),
    }


# ================================================================
# EMPLOI DES EXAMENS
# ================================================================

class EmploiExamenCreate(BaseModel):
    trimestre: int
    titre: str
    date_debut: str  # YYYY-MM-DD
    date_fin: str
    demande_id: Optional[int] = None

class CreneauExamenCreate(BaseModel):
    classe_id: int
    matiere_id: int
    date_examen: str  # YYYY-MM-DD
    heure_debut: str
    heure_fin: str
    salle: Optional[str] = None
    surveillant_type: str = "ENSEIGNANT"
    surveillant_id: Optional[int] = None
    surveillant_nom: Optional[str] = None


@router.post("/emploi", status_code=201)
def creer_emploi_examen(data: EmploiExamenCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Créer un emploi du temps d'examen."""
    from datetime import date as date_type
    emploi = EmploiExamen(
        etablissement_id=etablissement_id,
        demande_id=data.demande_id,
        trimestre=data.trimestre,
        titre=data.titre,
        date_debut=datetime.strptime(data.date_debut, "%Y-%m-%d").date(),
        date_fin=datetime.strptime(data.date_fin, "%Y-%m-%d").date(),
    )
    db.add(emploi)
    db.commit()
    db.refresh(emploi)
    return {"message": "Emploi d'examen créé.", "emploi_examen_id": emploi.emploi_examen_id}


@router.get("/emploi")
def lister_emplois_examen(trimestre: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Liste des emplois d'examen."""
    q = db.query(EmploiExamen).filter(EmploiExamen.etablissement_id == etablissement_id)
    if trimestre:
        q = q.filter(EmploiExamen.trimestre == trimestre)
    emplois = q.order_by(EmploiExamen.date_creation.desc()).all()
    result = []
    for e in emplois:
        nb = db.query(CreneauExamen).filter(CreneauExamen.emploi_examen_id == e.emploi_examen_id).count()
        result.append({
            "emploi_examen_id": e.emploi_examen_id,
            "trimestre": e.trimestre,
            "titre": e.titre,
            "date_debut": str(e.date_debut),
            "date_fin": str(e.date_fin),
            "statut": e.statut,
            "nb_creneaux": nb,
            "date_creation": str(e.date_creation) if e.date_creation else None,
        })
    return result


@router.get("/emploi/{emploi_id}")
def get_emploi_examen(emploi_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Détail d'un emploi d'examen avec tous ses créneaux."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")

    creneaux = db.query(CreneauExamen).filter(
        CreneauExamen.emploi_examen_id == emploi_id
    ).order_by(CreneauExamen.date_examen, CreneauExamen.heure_debut).all()

    creneaux_data = []
    for c in creneaux:
        mat = db.query(Matiere).filter(Matiere.matiere_id == c.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == c.classe_id).first()
        surv_nom = c.surveillant_nom
        if c.surveillant_type == "ENSEIGNANT" and c.surveillant_id:
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == c.surveillant_id).first()
            surv_nom = f"{ens.prenom} {ens.nom}" if ens else surv_nom

        creneaux_data.append({
            "creneau_examen_id": c.creneau_examen_id,
            "classe_id": c.classe_id,
            "classe_libelle": cls.libelle if cls else "?",
            "matiere_id": c.matiere_id,
            "matiere_code": mat.code if mat else "?",
            "matiere_libelle": mat.libelle if mat else "?",
            "date_examen": str(c.date_examen),
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "salle": c.salle,
            "surveillant_type": c.surveillant_type,
            "surveillant_id": c.surveillant_id,
            "surveillant_nom": surv_nom,
        })

    return {
        "emploi_examen_id": emploi.emploi_examen_id,
        "trimestre": emploi.trimestre,
        "titre": emploi.titre,
        "date_debut": str(emploi.date_debut),
        "date_fin": str(emploi.date_fin),
        "statut": emploi.statut,
        "creneaux": creneaux_data,
    }


@router.post("/emploi/{emploi_id}/creneaux")
def ajouter_creneau_examen(emploi_id: int, data: CreneauExamenCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Ajouter un créneau à l'emploi d'examen."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")

    # La classe référencée doit appartenir à cet établissement — jamais
    # acceptée aveuglément depuis le body.
    classe_valide = db.query(Classe.classe_id).filter(
        Classe.classe_id == data.classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe_valide:
        raise HTTPException(404, "Classe non trouvée")

    creneau = CreneauExamen(
        emploi_examen_id=emploi_id,
        classe_id=data.classe_id,
        matiere_id=data.matiere_id,
        date_examen=datetime.strptime(data.date_examen, "%Y-%m-%d").date(),
        heure_debut=data.heure_debut,
        heure_fin=data.heure_fin,
        salle=data.salle,
        surveillant_type=data.surveillant_type,
        surveillant_id=data.surveillant_id,
        surveillant_nom=data.surveillant_nom,
    )
    db.add(creneau)
    db.commit()
    db.refresh(creneau)
    return {"message": "Créneau ajouté.", "creneau_examen_id": creneau.creneau_examen_id}


@router.delete("/emploi/{emploi_id}/creneaux/{creneau_id}")
def supprimer_creneau_examen(emploi_id: int, creneau_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Supprimer un créneau d'examen."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")
    c = db.query(CreneauExamen).filter(
        CreneauExamen.creneau_examen_id == creneau_id,
        CreneauExamen.emploi_examen_id == emploi_id
    ).first()
    if not c:
        raise HTTPException(404, "Créneau non trouvé")
    db.delete(c)
    db.commit()
    return {"message": "Créneau supprimé."}


@router.put("/emploi/{emploi_id}/publier")
def publier_emploi_examen(emploi_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Publier l'emploi d'examen et notifier enseignants + élèves."""
    emploi = db.query(EmploiExamen).filter(
        EmploiExamen.emploi_examen_id == emploi_id, EmploiExamen.etablissement_id == etablissement_id
    ).first()
    if not emploi:
        raise HTTPException(404, "Emploi d'examen non trouvé")

    nb = db.query(CreneauExamen).filter(CreneauExamen.emploi_examen_id == emploi_id).count()
    if nb == 0:
        raise HTTPException(400, "Aucun créneau dans cet emploi. Ajoutez des créneaux avant de publier.")

    emploi.statut = "PUBLIE"

    # Send notification to all teachers
    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=emploi.demande_id,
        expediteur_type="ADMIN",
        destinataire_type="TOUS_ENSEIGNANTS",
        objet_type="EXAMENS",
        sujet=f"📋 Emploi des examens publié — T{emploi.trimestre}",
        contenu=f"L'emploi des examens '{emploi.titre}' ({emploi.date_debut} au {emploi.date_fin}) est maintenant disponible. Consultez votre dashboard pour les détails."
    )
    db.add(msg)
    db.commit()

    return {"message": f"Emploi d'examen publié avec {nb} créneaux. Tous les enseignants ont été notifiés."}
