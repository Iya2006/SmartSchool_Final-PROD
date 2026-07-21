"""
SMARTSCHOOL API — Devoirs (Homework)
Système de gestion des devoirs : Enseignant assigne → Parent/Élève consulte
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from datetime import datetime
import os, uuid, shutil

from app.core.database import get_db
from app.models.academique import (
    Devoir, Enseignant, Classe, Matiere, Affectation,
    EleveParent, Inscription
)

router = APIRouter(prefix="/api/devoirs", tags=["Devoirs"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "devoirs")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ============================================================================
# ENSEIGNANT : Créer un devoir
# ============================================================================

@router.post("/", status_code=201)
async def creer_devoir(
    enseignant_id: int = Form(...),
    classe_id: int = Form(...),
    matiere_id: int = Form(...),
    titre: str = Form(...),
    description: Optional[str] = Form(None),
    type_devoir: str = Form("EXERCICE"),
    date_limite: Optional[str] = Form(None),
    fichier: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """Créer un nouveau devoir (texte et/ou fichier)."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    fichier_nom = None
    fichier_path = None
    fichier_type = None

    if fichier and fichier.filename:
        ext = os.path.splitext(fichier.filename)[1]
        unique_name = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join(UPLOAD_DIR, unique_name)
        with open(save_path, "wb") as f:
            shutil.copyfileobj(fichier.file, f)
        fichier_nom = fichier.filename
        fichier_path = f"/uploads/devoirs/{unique_name}"
        fichier_type = ext.replace(".", "").lower()

    dl = None
    if date_limite:
        try:
            dl = datetime.strptime(date_limite, "%Y-%m-%d").date()
        except:
            pass

    devoir = Devoir(
        enseignant_id=enseignant_id,
        classe_id=classe_id,
        matiere_id=matiere_id,
        titre=titre,
        description=description,
        type_devoir=type_devoir,
        fichier_nom=fichier_nom,
        fichier_path=fichier_path,
        fichier_type=fichier_type,
        date_limite=dl,
    )
    db.add(devoir)
    db.commit()
    db.refresh(devoir)
    return {"message": "Devoir créé avec succès", "devoir_id": devoir.devoir_id}


# ============================================================================
# ENSEIGNANT : Lister ses devoirs
# ============================================================================

@router.get("/enseignant/{enseignant_id}")
def list_devoirs_enseignant(enseignant_id: int, db: Session = Depends(get_db)):
    """Liste les devoirs créés par un enseignant."""
    devoirs = db.query(Devoir).filter(
        Devoir.enseignant_id == enseignant_id
    ).order_by(desc(Devoir.date_creation)).all()

    result = []
    for d in devoirs:
        classe = db.query(Classe).filter(Classe.classe_id == d.classe_id).first()
        matiere = db.query(Matiere).filter(Matiere.matiere_id == d.matiere_id).first()
        result.append({
            "devoir_id": d.devoir_id,
            "titre": d.titre,
            "description": d.description,
            "type_devoir": d.type_devoir,
            "classe": classe.libelle if classe else "?",
            "classe_id": d.classe_id,
            "matiere": matiere.libelle if matiere else "?",
            "matiere_id": d.matiere_id,
            "fichier_nom": d.fichier_nom,
            "fichier_path": d.fichier_path,
            "fichier_type": d.fichier_type,
            "date_limite": d.date_limite.isoformat() if d.date_limite else None,
            "statut": d.statut,
            "date_creation": d.date_creation.isoformat() if d.date_creation else None,
        })
    return result


# ============================================================================
# ENSEIGNANT : Supprimer un devoir
# ============================================================================

@router.delete("/{devoir_id}")
def supprimer_devoir(devoir_id: int, db: Session = Depends(get_db)):
    """Supprimer un devoir."""
    d = db.query(Devoir).filter(Devoir.devoir_id == devoir_id).first()
    if not d:
        raise HTTPException(404, "Devoir non trouvé")
    # Supprimer le fichier physique
    if d.fichier_path:
        full_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), d.fichier_path.lstrip("/"))
        if os.path.exists(full_path):
            os.remove(full_path)
    db.delete(d)
    db.commit()
    return {"message": "Devoir supprimé"}


# ============================================================================
# PARENT : Voir les devoirs de ses enfants
# ============================================================================

@router.get("/parent/{parent_id}")
def list_devoirs_parent(parent_id: int, db: Session = Depends(get_db)):
    """Liste les devoirs des enfants d'un parent."""
    liens = db.query(EleveParent).filter(EleveParent.parent_id == parent_id).all()
    if not liens:
        return []

    devoirs_set = {}
    for lien in liens:
        # Trouver la classe active de l'enfant
        insc = db.query(Inscription).filter(
            Inscription.eleve_id == lien.eleve_id,
            Inscription.statut == "ACTIVE"
        ).first()
        if not insc:
            continue

        from app.models.academique import Eleve
        eleve = db.query(Eleve).filter(Eleve.eleve_id == lien.eleve_id).first()
        if not eleve:
            continue

        # Devoirs de cette classe
        devoirs = db.query(Devoir).filter(
            Devoir.classe_id == insc.classe_id,
            Devoir.statut == "PUBLIE"
        ).order_by(desc(Devoir.date_creation)).all()

        for d in devoirs:
            if d.devoir_id not in devoirs_set:
                ens = db.query(Enseignant).filter(Enseignant.enseignant_id == d.enseignant_id).first()
                classe = db.query(Classe).filter(Classe.classe_id == d.classe_id).first()
                matiere = db.query(Matiere).filter(Matiere.matiere_id == d.matiere_id).first()
                devoirs_set[d.devoir_id] = {
                    "devoir_id": d.devoir_id,
                    "titre": d.titre,
                    "description": d.description,
                    "type_devoir": d.type_devoir,
                    "enseignant": f"{ens.prenom} {ens.nom}" if ens else "?",
                    "classe": classe.libelle if classe else "?",
                    "matiere": matiere.libelle if matiere else "?",
                    "fichier_nom": d.fichier_nom,
                    "fichier_path": d.fichier_path,
                    "fichier_type": d.fichier_type,
                    "date_limite": d.date_limite.isoformat() if d.date_limite else None,
                    "date_creation": d.date_creation.isoformat() if d.date_creation else None,
                    "eleve_nom": f"{eleve.prenom} {eleve.nom}",
                }

    return sorted(devoirs_set.values(), key=lambda x: x["date_creation"] or "", reverse=True)


# ============================================================================
# ELEVE : Voir ses propres devoirs
# ============================================================================

@router.get("/eleve/{eleve_id}")
def list_devoirs_eleve(eleve_id: int, db: Session = Depends(get_db)):
    """Liste les devoirs publiés pour la classe active de l'élève."""
    # Trouver la classe active
    insc = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut == "ACTIVE"
    ).first()
    if not insc:
        return []

    # Devoirs de cette classe
    devoirs = db.query(Devoir).filter(
        Devoir.classe_id == insc.classe_id,
        Devoir.statut == "PUBLIE"
    ).order_by(desc(Devoir.date_creation)).all()

    result = []
    for d in devoirs:
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == d.enseignant_id).first()
        classe = db.query(Classe).filter(Classe.classe_id == d.classe_id).first()
        matiere = db.query(Matiere).filter(Matiere.matiere_id == d.matiere_id).first()
        result.append({
            "devoir_id": d.devoir_id,
            "titre": d.titre,
            "description": d.description,
            "type_devoir": d.type_devoir,
            "enseignant": f"{ens.prenom} {ens.nom}" if ens else "?",
            "classe": classe.libelle if classe else "?",
            "matiere": matiere.libelle if matiere else "?",
            "fichier_nom": d.fichier_nom,
            "fichier_path": d.fichier_path,
            "fichier_type": d.fichier_type,
            "date_limite": d.date_limite.isoformat() if d.date_limite else None,
            "date_creation": d.date_creation.isoformat() if d.date_creation else None,
        })

    return result
