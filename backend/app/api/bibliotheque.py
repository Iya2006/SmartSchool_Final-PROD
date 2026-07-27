"""
SMARTSCHOOL API — Bibliothèque scolaire
Catalogue, exemplaires, prêts et statistiques partagés par tous les portails.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.academique import Ouvrage, Exemplaire, Emprunt
from app.schemas.schemas import (
    OuvrageCreate,
    OuvrageUpdate,
    OuvrageOut,
    ExemplaireCreate,
    ExemplaireOut,
    EmpruntCreate,
    EmpruntOut,
)

router = APIRouter(prefix="/api/bibliotheque", tags=["Bibliothèque"])

BIBLIOTHEQUE_WRITE_ROLES = {
    "SUPER_ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU", "ADMIN", "BIBLIOTHECAIRE"
}
BIBLIOTHEQUE_READ_ROLES = BIBLIOTHEQUE_WRITE_ROLES | {
    "ENSEIGNANT", "PARENT", "ELEVE", "SURVEILLANT", "OPERATEUR", "INFORMATICIEN"
}


def _require_read(current_user: dict):
    role = current_user.get("role", "")
    if role not in BIBLIOTHEQUE_READ_ROLES:
        raise HTTPException(status_code=403, detail="Accès bibliothèque interdit")


def _require_write(current_user: dict):
    role = current_user.get("role", "")
    if role not in BIBLIOTHEQUE_WRITE_ROLES:
        raise HTTPException(status_code=403, detail="Modification bibliothèque interdite")


def _ouvrage_to_dict(o: Ouvrage) -> dict:
    return {
        "ouvrage_id": o.ouvrage_id,
        "etablissement_id": o.etablissement_id,
        "isbn": o.isbn,
        "code_interne": o.code_interne,
        "titre": o.titre,
        "auteur": o.auteur,
        "editeur": o.editeur,
        "annee_publication": o.annee_publication,
        "categorie": o.categorie,
        "sous_categorie": o.sous_categorie,
        "langue": o.langue,
        "niveau_cible": o.niveau_cible,
        "matiere_associee": o.matiere_associee,
        "nb_exemplaires": o.nb_exemplaires or 0,
        "nb_disponibles": o.nb_disponibles or 0,
        "resume": o.resume,
        "couverture_url": o.couverture_url,
        "emplacement": o.emplacement,
        "statut": o.statut,
        "created_date": o.created_date,
    }


@router.get("/ouvrages", response_model=list[OuvrageOut])
def list_ouvrages(
    etablissement_id: int = Query(1),
    q: Optional[str] = None,
    categorie: Optional[str] = None,
    statut: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    query = db.query(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id)
    if q:
        pattern = f"%{q}%"
        query = query.filter(or_(Ouvrage.titre.ilike(pattern), Ouvrage.auteur.ilike(pattern), Ouvrage.code_interne.ilike(pattern)))
    if categorie:
        query = query.filter(Ouvrage.categorie == categorie)
    if statut:
        query = query.filter(Ouvrage.statut == statut)
    return [_ouvrage_to_dict(o) for o in query.order_by(Ouvrage.created_date.desc()).limit(limit).all()]


@router.get("/stats")
def stats_bibliotheque(
    etablissement_id: int = Query(1),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_read(current_user)
    base = db.query(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id)
    total_ouvrages = base.count()
    total_exemplaires = db.query(func.coalesce(func.sum(Ouvrage.nb_exemplaires), 0)).filter(Ouvrage.etablissement_id == etablissement_id).scalar() or 0
    total_disponibles = db.query(func.coalesce(func.sum(Ouvrage.nb_disponibles), 0)).filter(Ouvrage.etablissement_id == etablissement_id).scalar() or 0
    emprunts_en_cours = db.query(Emprunt).join(Exemplaire).join(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id, Emprunt.statut.in_(["EN_COURS", "EN_RETARD"])).count()
    retards = db.query(Emprunt).join(Exemplaire).join(Ouvrage).filter(Ouvrage.etablissement_id == etablissement_id, Emprunt.statut == "EN_RETARD").count()
    categories = db.query(Ouvrage.categorie, func.count(Ouvrage.ouvrage_id)).filter(Ouvrage.etablissement_id == etablissement_id).group_by(Ouvrage.categorie).all()
    return {
        "total_ouvrages": total_ouvrages,
        "total_exemplaires": int(total_exemplaires),
        "total_disponibles": int(total_disponibles),
        "emprunts_en_cours": emprunts_en_cours,
        "retards": retards,
        "categories": [{"categorie": c or "AUTRE", "total": n} for c, n in categories],
    }


@router.post("/ouvrages", response_model=OuvrageOut, status_code=201)
def create_ouvrage(
    data: OuvrageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    existing = db.query(Ouvrage).filter(
        Ouvrage.etablissement_id == data.etablissement_id,
        Ouvrage.code_interne == data.code_interne,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ce code interne existe déjà pour cet établissement")

    nb_initial = max(0, data.nb_exemplaires_initial or 0)
    payload = data.model_dump(exclude={"nb_exemplaires_initial"})
    ouvrage = Ouvrage(
        **payload,
        nb_exemplaires=nb_initial,
        nb_disponibles=nb_initial,
        created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")),
    )
    db.add(ouvrage)
    db.flush()

    for index in range(nb_initial):
        code = f"{data.code_interne}-{index + 1:03d}"
        db.add(Exemplaire(
            ouvrage_id=ouvrage.ouvrage_id,
            code_exemplaire=code,
            etat="BON",
            statut="DISPONIBLE",
            date_acquisition=date.today(),
            created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")),
        ))

    db.commit()
    db.refresh(ouvrage)
    return _ouvrage_to_dict(ouvrage)


@router.put("/ouvrages/{ouvrage_id}", response_model=OuvrageOut)
def update_ouvrage(
    ouvrage_id: int,
    data: OuvrageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    ouvrage = db.query(Ouvrage).filter(Ouvrage.ouvrage_id == ouvrage_id).first()
    if not ouvrage:
        raise HTTPException(status_code=404, detail="Ouvrage introuvable")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ouvrage, key, value)
    ouvrage.modified_by = current_user.get("nom", current_user.get("sub", "SYSTEM"))
    db.commit()
    db.refresh(ouvrage)
    return _ouvrage_to_dict(ouvrage)


@router.post("/exemplaires", response_model=ExemplaireOut, status_code=201)
def create_exemplaire(
    data: ExemplaireCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    ouvrage = db.query(Ouvrage).filter(Ouvrage.ouvrage_id == data.ouvrage_id).first()
    if not ouvrage:
        raise HTTPException(status_code=404, detail="Ouvrage introuvable")
    code = data.code_exemplaire or f"{ouvrage.code_interne}-{(ouvrage.nb_exemplaires or 0) + 1:03d}"
    if db.query(Exemplaire).filter(Exemplaire.code_exemplaire == code).first():
        raise HTTPException(status_code=400, detail="Ce code exemplaire existe déjà")
    ex = Exemplaire(**data.model_dump(exclude={"code_exemplaire"}), code_exemplaire=code, created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")))
    db.add(ex)
    current_total = int(getattr(ouvrage, "nb_exemplaires", 0) or 0)
    current_available = int(getattr(ouvrage, "nb_disponibles", 0) or 0)
    setattr(ouvrage, "nb_exemplaires", current_total + 1)
    if data.statut == "DISPONIBLE":
        setattr(ouvrage, "nb_disponibles", current_available + 1)
    db.commit()
    db.refresh(ex)
    return ex


@router.post("/emprunts", response_model=EmpruntOut, status_code=201)
def create_emprunt(
    data: EmpruntCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_write(current_user)
    if not data.eleve_id and not data.enseignant_id:
        raise HTTPException(status_code=400, detail="Un emprunteur élève ou enseignant est requis")
    ex = db.query(Exemplaire).filter(Exemplaire.exemplaire_id == data.exemplaire_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exemplaire introuvable")
    if getattr(ex, "statut", None) != "DISPONIBLE":
        raise HTTPException(status_code=400, detail="Cet exemplaire n'est pas disponible")
    emprunt = Emprunt(**data.model_dump(), created_by=current_user.get("nom", current_user.get("sub", "SYSTEM")))
    setattr(ex, "statut", "EMPRUNTE")
    if ex.ouvrage:
        current_available = int(getattr(ex.ouvrage, "nb_disponibles", 0) or 0)
        setattr(ex.ouvrage, "nb_disponibles", max(current_available - 1, 0))
    db.add(emprunt)
    db.commit()
    db.refresh(emprunt)
    return emprunt
