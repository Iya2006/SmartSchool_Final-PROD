"""
SMARTSCHOOL — API Gestion du Personnel
Couvre tous les rôles : FONDATEUR, DG, DIRECTEUR_NIVEAU, ADMIN, COMPTABLE,
BIBLIOTHECAIRE, INFORMATICIEN, SURVEILLANT, AGENT_ENTRETIEN, GARDIEN, OPERATEUR...
Support du cumul de rôles via roles_secondaires (JSONB).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
import hashlib

from app.core.database import get_db
from app.models.academique import Utilisateur
from app.schemas.schemas import PersonnelCreate, PersonnelUpdate, PersonnelOut
from app.core.security import hash_password

router = APIRouter(prefix="/api/personnel", tags=["Personnel"])


# ─── Helpers ───────────────────────────────────────────────────────────────────
ROLES_AVEC_ACCES = {
    "SUPER_ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU",
    "ADMIN", "COMPTABLE", "BIBLIOTHECAIRE", "INFORMATICIEN", "SURVEILLANT", "OPERATEUR"
}

ROLES_SANS_ACCES = {"AGENT_ENTRETIEN", "GARDIEN", "CHAUFFEUR", "AUTRE"}


def _row_to_dict(p: Utilisateur) -> dict:
    """Sérialise un Utilisateur en dict compatible avec PersonnelOut."""
    return {
        "utilisateur_id": p.utilisateur_id,
        "etablissement_id": p.etablissement_id,
        "nom": p.nom,
        "prenom": p.prenom,
        "sexe": p.sexe,
        "photo_url": p.photo_url,
        "telephone": p.telephone,
        "email": p.email,
        "role": p.role,
        "roles_secondaires": p.roles_secondaires or [],
        "statut": p.statut,
        "nom_utilisateur": p.nom_utilisateur,
        "type_contrat": p.type_contrat,
        "date_embauche": str(p.date_embauche) if p.date_embauche else None,
        "salaire_base": float(p.salaire_base) if p.salaire_base else 0,
        "taux_horaire": float(p.taux_horaire) if p.taux_horaire else 0,
        "prime_mensuelle": float(p.prime_mensuelle) if p.prime_mensuelle else 0,
        "heures_hebdo": p.heures_hebdo or 0,
        "rib": p.rib,
        "mode_paiement_salaire": p.mode_paiement_salaire,
        "date_naissance": str(p.date_naissance) if p.date_naissance else None,
        "lieu_naissance": p.lieu_naissance,
        "adresse": p.adresse,
        "numero_cni": p.numero_cni,
        "created_date": str(p.created_date) if p.created_date else None,
    }


# ─── LISTE du personnel ────────────────────────────────────────────────────────
@router.get("", summary="Lister tout le personnel")
def list_personnel(
    etablissement_id: int = Query(...),
    role: Optional[str] = Query(None, description="Filtrer par rôle principal"),
    statut: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Recherche par nom/prénom"),
    db: Session = Depends(get_db)
):
    """Retourne la liste du personnel non-enseignant avec filtres optionnels."""
    query = db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == etablissement_id
    )
    if role:
        query = query.filter(Utilisateur.role == role)
    if statut:
        query = query.filter(Utilisateur.statut == statut)
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Utilisateur.nom.ilike(search),
                Utilisateur.prenom.ilike(search),
                Utilisateur.telephone.ilike(search)
            )
        )
    personnel = query.order_by(Utilisateur.role, Utilisateur.nom).all()
    return [_row_to_dict(p) for p in personnel]


# ─── Récapitulatif par rôle ────────────────────────────────────────────────────
@router.get("/stats", summary="Statistiques du personnel par rôle")
def stats_personnel(etablissement_id: int = Query(...), db: Session = Depends(get_db)):
    """Compte le nombre de membres par rôle principal et le total des salaires."""
    rows = db.query(
        Utilisateur.role,
        func.count(Utilisateur.utilisateur_id).label("total"),
        func.coalesce(func.sum(Utilisateur.salaire_base), 0).label("masse_salariale")
    ).filter(
        Utilisateur.etablissement_id == etablissement_id
    ).group_by(Utilisateur.role).all()

    return [
        {"role": r.role, "total": r.total, "masse_salariale": float(r.masse_salariale)}
        for r in rows
    ]


# ─── DÉTAIL d'un membre du personnel ──────────────────────────────────────────
@router.get("/{personnel_id}", summary="Détail d'un membre du personnel")
def get_personnel(personnel_id: int, db: Session = Depends(get_db)):
    p = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == personnel_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
    return _row_to_dict(p)


# ─── CRÉER un nouveau membre du personnel ─────────────────────────────────────
@router.post("", status_code=201, summary="Créer un membre du personnel")
def create_personnel(data: PersonnelCreate, db: Session = Depends(get_db)):
    """
    Crée un nouveau membre du personnel.
    - Si mot_de_passe fourni → compte système créé, accès logiciel activé.
    - Si mot_de_passe absent → staff technique sans accès (nettoyeurs, gardiens…).
    - roles_secondaires → liste JSON permettant le cumul de rôles.
    """
    # Génération du login si non fourni mais rôle avec accès
    nom_utilisateur = data.nom_utilisateur
    if data.role in ROLES_AVEC_ACCES and not nom_utilisateur and data.mot_de_passe:
        base = f"{data.prenom[:2].lower()}.{data.nom.lower()}"
        # Vérifie unicité
        count = db.query(func.count(Utilisateur.utilisateur_id)).filter(
            Utilisateur.nom_utilisateur.ilike(f"{base}%")
        ).scalar() or 0
        nom_utilisateur = base if count == 0 else f"{base}{count + 1}"

    # Vérifie unicité du login si fourni
    if nom_utilisateur:
        existing = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == nom_utilisateur
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Le nom d'utilisateur '{nom_utilisateur}' est déjà utilisé."
            )

    payload = data.model_dump(exclude={"nom_utilisateur", "mot_de_passe"})
    mot_de_passe_hashed = hash_password(data.mot_de_passe) if data.mot_de_passe else None

    p = Utilisateur(
        **payload,
        nom_utilisateur=nom_utilisateur,
        mot_de_passe=mot_de_passe_hashed
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    result = _row_to_dict(p)
    # Retourner le mot de passe en clair (une seule fois) si créé
    result["mot_de_passe_clair"] = data.mot_de_passe if data.mot_de_passe else None
    return result


# ─── METTRE À JOUR un membre du personnel ────────────────────────────────────
@router.put("/{personnel_id}", summary="Modifier un membre du personnel")
def update_personnel(personnel_id: int, data: PersonnelUpdate, db: Session = Depends(get_db)):
    p = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == personnel_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")

    update_data = data.model_dump(exclude_unset=True)

    # Hash mot de passe si modifié
    if "mot_de_passe" in update_data and update_data["mot_de_passe"]:
        update_data["mot_de_passe"] = hash_password(update_data["mot_de_passe"])
    elif "mot_de_passe" in update_data and not update_data["mot_de_passe"]:
        del update_data["mot_de_passe"]  # Pas de mise à zéro

    # Vérifier unicité du login si modifié
    if "nom_utilisateur" in update_data and update_data["nom_utilisateur"]:
        existing = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == update_data["nom_utilisateur"],
            Utilisateur.utilisateur_id != personnel_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Le nom d'utilisateur '{update_data['nom_utilisateur']}' est déjà utilisé."
            )

    for key, value in update_data.items():
        setattr(p, key, value)

    db.commit()
    db.refresh(p)
    return _row_to_dict(p)


# ─── ARCHIVER / Changer le statut ─────────────────────────────────────────────
@router.patch("/{personnel_id}/statut", summary="Changer le statut d'un membre")
def change_statut(
    personnel_id: int,
    statut: str = Query(..., description="ACTIF, INACTIF, SUSPENDU, CONGE"),
    db: Session = Depends(get_db)
):
    p = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == personnel_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
    p.statut = statut
    db.commit()
    return {"message": f"Statut mis à jour : {statut}", "utilisateur_id": personnel_id}


# ─── SUPPRIMER un membre du personnel ─────────────────────────────────────────
@router.delete("/{personnel_id}", summary="Supprimer un membre du personnel")
def delete_personnel(personnel_id: int, db: Session = Depends(get_db)):
    p = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == personnel_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
    db.delete(p)
    db.commit()
    return {"message": "Membre supprimé avec succès"}


# ─── LISTE pour le paiement des salaires ──────────────────────────────────────
@router.get("/salaires/liste", summary="Liste du personnel avec salaires pour la comptabilité")
def liste_salaires(etablissement_id: int = Query(...), db: Session = Depends(get_db)):
    """Retourne uniquement les membres avec un salaire > 0, pour le Centre de Décaissement."""
    rows = db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == etablissement_id,
        Utilisateur.statut == "ACTIF",
        Utilisateur.salaire_base > 0
    ).order_by(Utilisateur.role, Utilisateur.nom).all()
    return [_row_to_dict(p) for p in rows]
