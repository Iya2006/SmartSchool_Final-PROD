"""
SMARTSCHOOL API — Routes Paramétrage (Établissements, Années, Cycles, Niveaux, Matières, Salles)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
import os, shutil, uuid
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.models.academique import (
    Etablissement, AnneeScolaire, Trimestre, Cycle, Niveau, Salle, Matiere,
    ParametreEtablissement
)
from app.schemas.schemas import (
    EtablissementCreate, EtablissementUpdate, EtablissementOut,
    AnneeScolaireCreate, AnneeScolaireUpdate, AnneeScolaireOut,
    TrimestreCreate, TrimestreUpdate, TrimestreOut,
    MatiereCreate, MatiereOut,
    ParametreCreate, ParametreUpdate, ParametreOut
)

router = APIRouter(prefix="/api/parametrage", tags=["Paramétrage"])

# Router PUBLIC (sans JWT) pour les GET nécessaires avant login
public_router = APIRouter(prefix="/api/parametrage", tags=["Paramétrage (Public)"])


# ============================================================================
# ÉTABLISSEMENTS
# ============================================================================
@router.get("/etablissements", response_model=List[EtablissementOut])
def list_etablissements(db: Session = Depends(get_db)):
    return db.query(Etablissement).order_by(Etablissement.nom).all()

# Route publique — accessible sans JWT (page login, portails)
@public_router.get("/etablissements/{id}", response_model=EtablissementOut)
def get_etablissement_public(id: int, db: Session = Depends(get_db)):
    e = db.query(Etablissement).filter(Etablissement.etablissement_id == id).first()
    if not e:
        raise HTTPException(404, "Établissement non trouvé")
    return e

@router.post("/etablissements", response_model=EtablissementOut, status_code=201)
def create_etablissement(data: EtablissementCreate, db: Session = Depends(get_db)):
    e = Etablissement(**data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return e

@router.put("/etablissements/{id}", response_model=EtablissementOut)
def update_etablissement(id: int, data: EtablissementUpdate, db: Session = Depends(get_db)):
    e = db.query(Etablissement).filter(Etablissement.etablissement_id == id).first()
    if not e:
        raise HTTPException(404, "Établissement non trouvé")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


# ============================================================================
# UPLOAD FICHIERS ÉTABLISSEMENT
# ============================================================================
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "etablissements")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/etablissements/{id}/upload/{field}")
async def upload_etablissement_file(id: int, field: str, fichier: UploadFile = File(...), db: Session = Depends(get_db)):
    if field not in ["logo", "favicon", "cachet", "signature", "card_bg", "card_bg_eleve", "card_bg_prof"]:
        raise HTTPException(400, "Champ invalide")

    etablissement = db.query(Etablissement).filter(Etablissement.etablissement_id == id).first()
    if not etablissement:
        raise HTTPException(404, "Établissement non trouvé")

    ext = fichier.filename.split(".")[-1] if "." in fichier.filename else "png"
    filename = f"{id}_{field}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(fichier.file, buffer)

    url_path = f"/uploads/etablissements/{filename}"
    
    if field in ["card_bg", "card_bg_eleve", "card_bg_prof"]:
        cle = "carte.bg_image_url"
        if field == "card_bg_eleve":
            cle = "carte.eleve.bg_image_url"
        elif field == "card_bg_prof":
            cle = "carte.prof.bg_image_url"

        setting = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == id,
            ParametreEtablissement.cle == cle
        ).first()
        if setting:
            setting.valeur = url_path
        else:
            setting = ParametreEtablissement(
                etablissement_id=id,
                categorie="CARTE",
                cle=cle,
                valeur=url_path,
                type_valeur="TEXT"
            )
            db.add(setting)
        db.commit()
    else:
        field_mapping = {
            "logo": "logo_url",
            "favicon": "favicon_url",
            "cachet": "cachet_url",
            "signature": "signature_url"
        }
        setattr(etablissement, field_mapping[field], url_path)
        db.commit()
        db.refresh(etablissement)

    return {"message": f"Fichier {field} uploadé avec succès", "url": url_path}


# ============================================================================
# ANNÉES SCOLAIRES
# ============================================================================
@router.get("/annees", response_model=List[AnneeScolaireOut])
def list_annees(etablissement_id: int = 1, db: Session = Depends(get_db)):
    return db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id
    ).order_by(AnneeScolaire.date_debut.desc()).all()

@router.post("/annees", response_model=AnneeScolaireOut, status_code=201)
def create_annee(data: AnneeScolaireCreate, db: Session = Depends(get_db)):
    a = AnneeScolaire(**data.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return a

@router.put("/annees/{id}", response_model=AnneeScolaireOut)
def update_annee(id: int, data: AnneeScolaireUpdate, db: Session = Depends(get_db)):
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == id).first()
    if not annee:
        raise HTTPException(404, "Année non trouvée")

    payload = data.model_dump(exclude_unset=True)
    if "date_debut" in payload and "date_fin" in payload and payload["date_debut"] > payload["date_fin"]:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    future_date_debut = payload.get("date_debut", annee.date_debut)
    future_date_fin = payload.get("date_fin", annee.date_fin)
    if future_date_debut > future_date_fin:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    for k, v in payload.items():
        setattr(annee, k, v)

    if annee.est_courante == "O":
        db.query(AnneeScolaire).filter(
            AnneeScolaire.etablissement_id == annee.etablissement_id,
            AnneeScolaire.annee_id != id
        ).update({"est_courante": "N"})
        if annee.statut == "PLANIFIEE":
            annee.statut = "EN_COURS"

    db.commit()
    db.refresh(annee)
    return annee

@router.put("/annees/{id}/activer")
def activer_annee(id: int, db: Session = Depends(get_db)):
    """Permet d'activer une année (et désactiver les autres)"""
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == id).first()
    if not annee:
        raise HTTPException(404, "Année non trouvée")
    # Désactiver toutes les autres
    db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == annee.etablissement_id,
        AnneeScolaire.annee_id != id
    ).update({"est_courante": "N"})
    annee.est_courante = "O"
    annee.statut = "EN_COURS"
    db.commit()
    return {"message": f"Année {annee.code} activée"}


# ============================================================================
# TRIMESTRES
# ============================================================================
@router.get("/trimestres", response_model=List[TrimestreOut])
def list_trimestres(annee_id: int = 1, db: Session = Depends(get_db)):
    return db.query(Trimestre).filter(
        Trimestre.annee_id == annee_id
    ).order_by(Trimestre.numero).all()

@router.post("/trimestres", response_model=TrimestreOut, status_code=201)
def create_trimestre(data: TrimestreCreate, db: Session = Depends(get_db)):
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == data.annee_id).first()
    if not annee:
        raise HTTPException(404, "Année scolaire non trouvée")
    if data.date_debut > data.date_fin:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    trimestre = Trimestre(**data.model_dump())
    db.add(trimestre)
    db.commit()
    db.refresh(trimestre)
    return trimestre

@router.put("/trimestres/{id}", response_model=TrimestreOut)
def update_trimestre(id: int, data: TrimestreUpdate, db: Session = Depends(get_db)):
    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == id).first()
    if not trimestre:
        raise HTTPException(404, "Période non trouvée")

    payload = data.model_dump(exclude_unset=True)
    future_date_debut = payload.get("date_debut", trimestre.date_debut)
    future_date_fin = payload.get("date_fin", trimestre.date_fin)
    if future_date_debut > future_date_fin:
        raise HTTPException(400, "La date de début doit être antérieure à la date de fin")

    for k, v in payload.items():
        setattr(trimestre, k, v)

    db.commit()
    db.refresh(trimestre)
    return trimestre

@router.delete("/trimestres/{id}")
def delete_trimestre(id: int, db: Session = Depends(get_db)):
    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == id).first()
    if not trimestre:
        raise HTTPException(404, "Période non trouvée")
    db.delete(trimestre)
    db.commit()
    return {"message": "Période supprimée avec succès"}


# ============================================================================
# CYCLES & NIVEAUX
# ============================================================================
@router.get("/cycles")
def list_cycles(etablissement_id: int = 1, db: Session = Depends(get_db)):
    cycles = db.query(Cycle).filter(
        Cycle.etablissement_id == etablissement_id
    ).order_by(Cycle.ordre).all()

    result = []
    for c in cycles:
        niveaux = db.query(Niveau).filter(
            Niveau.cycle_id == c.cycle_id
        ).order_by(Niveau.ordre).all()

        result.append({
            "cycle_id": c.cycle_id,
            "code": c.code,
            "libelle": c.libelle,
            "ordre": c.ordre,
            "niveaux": [
                {
                    "niveau_id": n.niveau_id,
                    "code": n.code,
                    "libelle": n.libelle,
                    "ordre": n.ordre,
                    "est_examen": n.est_examen
                } for n in niveaux
            ]
        })
    return result


# ============================================================================
# MATIÈRES
# ============================================================================
@router.get("/matieres", response_model=List[MatiereOut])
def list_matieres(cycle_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Matiere)
    if cycle_id:
        query = query.filter(Matiere.cycle_id == cycle_id)
    return query.order_by(Matiere.libelle).all()

@router.post("/matieres", response_model=MatiereOut, status_code=201)
def create_matiere(data: MatiereCreate, db: Session = Depends(get_db)):
    m = Matiere(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m

@router.put("/matieres/{matiere_id}")
def update_matiere(matiere_id: int, data: dict, db: Session = Depends(get_db)):
    """Met à jour le coefficient et/ou note_sur d'une matière."""
    m = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
    if not m:
        raise HTTPException(404, "Matière non trouvée")
    if "coefficient_defaut" in data:
        m.coefficient_defaut = float(data["coefficient_defaut"])
    if "note_sur" in data:
        m.note_sur = float(data["note_sur"])
    db.commit()
    db.refresh(m)
    return {"message": "Matière mise à jour", "matiere_id": matiere_id}

class MatiereBatchUpdateItem(BaseModel):
    matiere_id: int
    coefficient_defaut: Optional[float] = Field(None, gt=0, le=10)
    note_sur: Optional[float] = Field(None, gt=0, le=100)

@router.put("/matieres-batch")
def update_matieres_batch(updates: List[MatiereBatchUpdateItem] = Body(...), db: Session = Depends(get_db)):
    """Mise à jour en lot des coefficients et barèmes des matières."""
    count = 0
    for item in updates:
        m = db.query(Matiere).filter(Matiere.matiere_id == item.matiere_id).first()
        if m:
            if item.coefficient_defaut is not None:
                m.coefficient_defaut = float(item.coefficient_defaut)
            if item.note_sur is not None:
                m.note_sur = float(item.note_sur)
            count += 1
    db.commit()
    return {"message": f"{count} matières mises à jour avec succès"}

@router.post("/matieres/auto-generation", status_code=201)
def auto_generate_matieres_guinee(db: Session = Depends(get_db)):
    """Génère automatiquement les matières du programme Guinéen par cycle (Primaire, Collège, Lycée)"""
    
    # S'assurer que les cycles de base existent
    cycles_base = [
        {"code": "PRM", "libelle": "Primaire", "ordre": 1},
        {"code": "CLG", "libelle": "Collège", "ordre": 2},
        {"code": "LYC", "libelle": "Lycée", "ordre": 3}
    ]
    
    cycle_map = {}
    for cb in cycles_base:
        c = db.query(Cycle).filter(Cycle.code == cb["code"]).first()
        if not c:
            c = Cycle(etablissement_id=1, code=cb["code"], libelle=cb["libelle"], ordre=cb["ordre"])
            db.add(c)
            db.commit()
            db.refresh(c)
        cycle_map[cb["code"]] = c.cycle_id

    # Définition du programme
    matieres_guinee = [
        # =============================================================
        # PRIMAIRE
        # =============================================================
        {"cycle": "PRM", "code": "FRA-P", "libelle": "Français / Langage", "categorie": "Langues", "coef": 5},
        {"cycle": "PRM", "code": "MAT-P", "libelle": "Mathématiques", "categorie": "Sciences", "coef": 4},
        {"cycle": "PRM", "code": "SCT-P", "libelle": "Sciences et Technologie", "categorie": "Sciences", "coef": 2},
        {"cycle": "PRM", "code": "HG-P", "libelle": "Histoire-Géographie", "categorie": "Sciences Sociales", "coef": 2},
        {"cycle": "PRM", "code": "ECM-P", "libelle": "Éducation Civique et Morale", "categorie": "Sciences Sociales", "coef": 1},
        {"cycle": "PRM", "code": "EPS-P", "libelle": "Éducation Physique et Sportive", "categorie": "Pratique", "coef": 1},
        {"cycle": "PRM", "code": "ART-P", "libelle": "Arts (Plastiques, Musique)", "categorie": "Pratique", "coef": 1},
        {"cycle": "PRM", "code": "ANG-P", "libelle": "Anglais (Initiation)", "categorie": "Langues", "coef": 1},

        # =============================================================
        # COLLÈGE (Tronc Commun + LV2)
        # =============================================================
        {"cycle": "CLG", "code": "FRA-C", "libelle": "Français", "categorie": "Langues", "coef": 4},
        {"cycle": "CLG", "code": "MAT-C", "libelle": "Mathématiques", "categorie": "Sciences", "coef": 4},
        {"cycle": "CLG", "code": "HG-C", "libelle": "Histoire-Géographie", "categorie": "Sciences Sociales", "coef": 2},
        {"cycle": "CLG", "code": "PC-C", "libelle": "Physique-Chimie", "categorie": "Sciences", "coef": 3},
        {"cycle": "CLG", "code": "SVT-C", "libelle": "Sciences de la Vie et de la Terre (SVT)", "categorie": "Sciences", "coef": 3},
        {"cycle": "CLG", "code": "ANG-C", "libelle": "Anglais (LV1)", "categorie": "Langues", "coef": 3},
        {"cycle": "CLG", "code": "ECJS-C", "libelle": "Éducation Civique, Juridique et Sociale", "categorie": "Sciences Sociales", "coef": 1},
        {"cycle": "CLG", "code": "EPS-C", "libelle": "Éducation Physique et Sportive", "categorie": "Pratique", "coef": 2},
        {"cycle": "CLG", "code": "TIC-C", "libelle": "Technologie et Informatique (TIC)", "categorie": "Pratique", "coef": 1},
        {"cycle": "CLG", "code": "ART-C", "libelle": "Arts (Plastiques, Musique)", "categorie": "Pratique", "coef": 1},
        {"cycle": "CLG", "code": "ESP-C", "libelle": "Espagnol / Autre (LV2)", "categorie": "Langues", "coef": 2},

        # =============================================================
        # LYCÉE (Profils SM, SE, SS fusionnés pour la configuration)
        # =============================================================
        {"cycle": "LYC", "code": "FRA-L", "libelle": "Français", "categorie": "Langues", "coef": 3},
        {"cycle": "LYC", "code": "MAT-L", "libelle": "Mathématiques (Tronc commun)", "categorie": "Sciences", "coef": 3},
        {"cycle": "LYC", "code": "MATS-L", "libelle": "Mathématiques Spéciales (Profil SM)", "categorie": "Sciences", "coef": 5},
        {"cycle": "LYC", "code": "PC-L", "libelle": "Physique-Chimie", "categorie": "Sciences", "coef": 4},
        {"cycle": "LYC", "code": "PCA-L", "libelle": "Physique-Chimie (Approfondie SM)", "categorie": "Sciences", "coef": 5},
        {"cycle": "LYC", "code": "SVT-L", "libelle": "SVT (Tronc commun)", "categorie": "Sciences", "coef": 3},
        {"cycle": "LYC", "code": "SVTS-L", "libelle": "SVT (Spécialité SE)", "categorie": "Sciences", "coef": 5},
        {"cycle": "LYC", "code": "PHI-L", "libelle": "Philosophie", "categorie": "Sciences Sociales", "coef": 4},
        {"cycle": "LYC", "code": "HG-L", "libelle": "Histoire-Géographie", "categorie": "Sciences Sociales", "coef": 3},
        {"cycle": "LYC", "code": "ANG-L", "libelle": "Anglais (LV1)", "categorie": "Langues", "coef": 2},
        {"cycle": "LYC", "code": "SES-L", "libelle": "Sciences Économiques et Sociales (SES)", "categorie": "Sciences Sociales", "coef": 5},
        {"cycle": "LYC", "code": "ECM-L", "libelle": "Éducation Civique", "categorie": "Sciences Sociales", "coef": 1},
        {"cycle": "LYC", "code": "EPS-L", "libelle": "Éducation Physique et Sportive", "categorie": "Pratique", "coef": 2},
        {"cycle": "LYC", "code": "TIC-L", "libelle": "Informatique (Option)", "categorie": "Pratique", "coef": 1},
    ]

    added_count = 0

    for mat in matieres_guinee:
        c_id = cycle_map.get(mat["cycle"])
        if not c_id: continue

        # Check if already exists
        exists = db.query(Matiere).filter(Matiere.code == mat["code"], Matiere.cycle_id == c_id).first()
        if not exists:
            m = Matiere(
                cycle_id=c_id,
                code=mat["code"],
                libelle=mat["libelle"],
                categorie=mat["categorie"],
                coefficient_defaut=mat["coef"],
                est_obligatoire="O" if "Option" not in mat["libelle"] else "N",
                note_sur=20,
                nb_heures_semaine=2
            )
            db.add(m)
            added_count += 1
            
    db.commit()
    return {"message": f"{added_count} matières du programme Guinéen ont été déployées avec succès sous 3 cycles (Primaire, Collège, Lycée)."}


# ============================================================================
# SALLES
# ============================================================================
@router.get("/salles")
def list_salles(etablissement_id: int = 1, db: Session = Depends(get_db)):
    return db.query(Salle).filter(
        Salle.etablissement_id == etablissement_id
    ).order_by(Salle.code).all()


# ============================================================================
# PARAMÈTRES (SETTINGS)
# ============================================================================
# Route publique — accessible sans JWT (page login, portails)
@public_router.get("/settings", response_model=List[ParametreOut])
def list_parametres_public(etablissement_id: int = 1, categorie: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(ParametreEtablissement).filter(ParametreEtablissement.etablissement_id == etablissement_id)
    if categorie:
        query = query.filter(ParametreEtablissement.categorie == categorie)
    return query.all()

@router.put("/settings")
def update_parametres(etablissement_id: int, settings: List[ParametreCreate], db: Session = Depends(get_db)):
    # Upsert logic
    for s in settings:
        param = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.cle == s.cle
        ).first()
        if param:
            param.valeur = s.valeur
            if s.type_valeur:
                param.type_valeur = s.type_valeur
        else:
            new_param = ParametreEtablissement(**s.model_dump())
            db.add(new_param)
    db.commit()
    return {"message": "Paramètres mis à jour avec succès"}
