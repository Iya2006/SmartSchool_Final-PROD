"""
SMARTSCHOOL API — Fournitures Scolaires
CRUD admin + endpoints publics portails (élève/parent).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from app.core.database import get_db
from app.models.academique import FournitureScolaire, Niveau, Classe
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/api/fournitures", tags=["Fournitures"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class FournitureCreate(BaseModel):
    nom: str
    description: Optional[str] = None
    categorie: str = "MATERIEL"
    quantite: int = 1
    prix_unitaire: Optional[float] = None
    unite: str = "unité"
    niveau_id: Optional[int] = None
    classe_id: Optional[int] = None
    obligatoire: str = "O"
    statut: str = "ACTIF"
    annee_scolaire: str = "2025-2026"
    etablissement_id: int = 1


class FournitureOut(BaseModel):
    fourniture_id: int
    nom: str
    description: Optional[str] = None
    categorie: str
    quantite: int
    prix_unitaire: Optional[float] = None
    unite: str
    niveau_id: Optional[int] = None
    classe_id: Optional[int] = None
    obligatoire: str
    statut: str
    annee_scolaire: str
    etablissement_id: int
    niveau_libelle: Optional[str] = None
    classe_libelle: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _enrich(item: FournitureScolaire, db: Session) -> FournitureOut:
    out = FournitureOut(
        fourniture_id=item.fourniture_id,
        nom=item.nom,
        description=item.description,
        categorie=item.categorie,
        quantite=item.quantite,
        prix_unitaire=float(item.prix_unitaire) if item.prix_unitaire else None,
        unite=item.unite,
        niveau_id=item.niveau_id,
        classe_id=item.classe_id,
        obligatoire=item.obligatoire,
        statut=item.statut,
        annee_scolaire=item.annee_scolaire,
        etablissement_id=item.etablissement_id,
    )
    if item.niveau_id:
        niv = db.query(Niveau).filter(Niveau.niveau_id == item.niveau_id).first()
        out.niveau_libelle = niv.libelle if niv else None
    if item.classe_id:
        cls = db.query(Classe).filter(Classe.classe_id == item.classe_id).first()
        out.classe_libelle = cls.libelle if cls else None
    return out


# ─── Routes ADMIN ────────────────────────────────────────────────────────────

@router.get("", response_model=List[FournitureOut])
def list_fournitures(
    etablissement_id: int = 1,
    categorie: Optional[str] = None,
    niveau_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    statut: Optional[str] = None,
    annee_scolaire: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retourne toutes les fournitures avec les libellés niveau/classe."""
    q = db.query(FournitureScolaire).filter(
        FournitureScolaire.etablissement_id == etablissement_id
    )
    if categorie:
        q = q.filter(FournitureScolaire.categorie == categorie)
    if niveau_id:
        q = q.filter(FournitureScolaire.niveau_id == niveau_id)
    if classe_id:
        cls = db.query(Classe).filter(Classe.classe_id == classe_id).first()
        if cls and cls.niveau_id:
            q = q.filter(
                (FournitureScolaire.classe_id == classe_id) |
                ((FournitureScolaire.niveau_id == cls.niveau_id) & (FournitureScolaire.classe_id.is_(None)))
            )
        else:
            q = q.filter(FournitureScolaire.classe_id == classe_id)
    elif niveau_id:
        q = q.filter(FournitureScolaire.niveau_id == niveau_id)
    if statut:
        q = q.filter(FournitureScolaire.statut == statut)
    if annee_scolaire:
        q = q.filter(FournitureScolaire.annee_scolaire == annee_scolaire)

    items = q.order_by(FournitureScolaire.categorie, FournitureScolaire.nom).all()
    return [_enrich(i, db) for i in items]


@router.get("/stats")
def stats_fournitures(etablissement_id: int = 1, db: Session = Depends(get_db)):
    """KPIs pour le dashboard fournitures."""
    q = db.query(FournitureScolaire).filter(
        FournitureScolaire.etablissement_id == etablissement_id,
        FournitureScolaire.statut == "ACTIF"
    )
    total = q.count()
    obligatoires = q.filter(FournitureScolaire.obligatoire == "O").count()

    cats = db.query(
        FournitureScolaire.categorie,
        func.count(FournitureScolaire.fourniture_id).label("nb")
    ).filter(
        FournitureScolaire.etablissement_id == etablissement_id,
        FournitureScolaire.statut == "ACTIF"
    ).group_by(FournitureScolaire.categorie).all()

    valeur = db.query(
        func.sum(FournitureScolaire.prix_unitaire * FournitureScolaire.quantite)
    ).filter(
        FournitureScolaire.etablissement_id == etablissement_id,
        FournitureScolaire.statut == "ACTIF",
        FournitureScolaire.prix_unitaire.isnot(None)
    ).scalar() or 0

    # Nombre de classes ayant des fournitures
    nb_classes = db.query(FournitureScolaire.classe_id).filter(
        FournitureScolaire.etablissement_id == etablissement_id,
        FournitureScolaire.statut == "ACTIF",
        FournitureScolaire.classe_id.isnot(None)
    ).distinct().count()

    return {
        "total": total,
        "obligatoires": obligatoires,
        "facultatifs": total - obligatoires,
        "valeur_estimee": float(valeur),
        "nb_classes": nb_classes,
        "par_categorie": [{"categorie": c.categorie, "nb": c.nb} for c in cats],
    }


@router.get("/classe/{classe_id}", response_model=List[FournitureOut])
def fournitures_par_classe(classe_id: int, include_inactif: bool = False, db: Session = Depends(get_db)):
    """Fournitures d'une classe spécifique (utilisé par les portails aussi)."""
    cls = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    q = db.query(FournitureScolaire)
    if not include_inactif:
        q = q.filter(FournitureScolaire.statut == "ACTIF")

    if cls and cls.niveau_id:
        q = q.filter(
            (FournitureScolaire.classe_id == classe_id) |
            ((FournitureScolaire.niveau_id == cls.niveau_id) & (FournitureScolaire.classe_id.is_(None)))
        )
    else:
        q = q.filter(FournitureScolaire.classe_id == classe_id)

    items = q.order_by(FournitureScolaire.categorie, FournitureScolaire.nom).all()
    return [_enrich(i, db) for i in items]


@router.get("/{fourniture_id}", response_model=FournitureOut)
def get_fourniture(fourniture_id: int, db: Session = Depends(get_db)):
    f = db.query(FournitureScolaire).filter(
        FournitureScolaire.fourniture_id == fourniture_id
    ).first()
    if not f:
        raise HTTPException(404, "Fourniture non trouvée")
    return _enrich(f, db)


@router.post("", response_model=FournitureOut, status_code=201)
def create_fourniture(data: FournitureCreate, db: Session = Depends(get_db)):
    f = FournitureScolaire(**data.model_dump())
    db.add(f)
    db.commit()
    db.refresh(f)
    return _enrich(f, db)


@router.put("/{fourniture_id}", response_model=FournitureOut)
def update_fourniture(
    fourniture_id: int, data: FournitureCreate, db: Session = Depends(get_db)
):
    f = db.query(FournitureScolaire).filter(
        FournitureScolaire.fourniture_id == fourniture_id
    ).first()
    if not f:
        raise HTTPException(404, "Fourniture non trouvée")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    return _enrich(f, db)


@router.delete("/{fourniture_id}")
def delete_fourniture(fourniture_id: int, db: Session = Depends(get_db)):
    f = db.query(FournitureScolaire).filter(
        FournitureScolaire.fourniture_id == fourniture_id
    ).first()
    if not f:
        raise HTTPException(404, "Fourniture non trouvée")
    db.delete(f)
    db.commit()
    return {"message": "Fourniture supprimée"}


@router.patch("/{fourniture_id}/toggle-statut")
def toggle_statut(fourniture_id: int, db: Session = Depends(get_db)):
    f = db.query(FournitureScolaire).filter(
        FournitureScolaire.fourniture_id == fourniture_id
    ).first()
    if not f:
        raise HTTPException(404, "Fourniture non trouvée")
    f.statut = "INACTIF" if f.statut == "ACTIF" else "ACTIF"
    db.commit()
    return {"statut": f.statut}
