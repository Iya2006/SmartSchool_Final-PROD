"""
SMARTSCHOOL API — Routes Matières & Programme Guinéen
CRUD complet + Génération automatique + Attribution intelligente aux classes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.academique import (
    Matiere, Cycle, Niveau, Classe, ClasseMatiere
)
from app.schemas.schemas import MatiereCreate, MatiereOut

router = APIRouter(prefix="/api/matieres", tags=["Matières & Programme"])


# ============================================================================
# CRUD MATIÈRES
# ============================================================================

@router.get("", response_model=List[MatiereOut])
def list_matieres(cycle_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Matiere)
    if cycle_id:
        query = query.filter(Matiere.cycle_id == cycle_id)
    return query.order_by(Matiere.categorie, Matiere.libelle).all()


@router.get("/stats")
def get_matieres_stats(db: Session = Depends(get_db)):
    """Statistiques globales sur les matières et leur attribution."""
    total_matieres = db.query(Matiere).count()
    total_attributions = db.query(ClasseMatiere).filter(ClasseMatiere.est_active == "O").count()
    classes_avec = db.query(ClasseMatiere.classe_id).distinct().count()
    classes_total = db.query(Classe).filter(Classe.statut == "ACTIVE").count()

    matieres = db.query(Matiere).all()
    par_categorie = {}
    for m in matieres:
        cat = m.categorie or "Autres"
        par_categorie[cat] = par_categorie.get(cat, 0) + 1

    cycles = db.query(Cycle).all()
    par_cycle = {}
    for c in cycles:
        count = db.query(Matiere).filter(Matiere.cycle_id == c.cycle_id).count()
        par_cycle[c.libelle] = count

    return {
        "total_matieres": total_matieres,
        "total_attributions": total_attributions,
        "classes_avec_programme": classes_avec,
        "classes_total": classes_total,
        "par_categorie": par_categorie,
        "par_cycle": par_cycle,
    }


@router.get("/classe/{classe_id}")
def get_matieres_par_classe(classe_id: int, db: Session = Depends(get_db)):
    """Retourne les matières attribuées à une classe donnée."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")

    associations = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.est_active == "O"
    ).all()

    result = []
    for a in associations:
        matiere = db.query(Matiere).filter(Matiere.matiere_id == a.matiere_id).first()
        if matiere:
            result.append({
                "classe_matiere_id": a.classe_matiere_id,
                "matiere_id": matiere.matiere_id,
                "code": matiere.code,
                "libelle": matiere.libelle,
                "categorie": matiere.categorie,
                "coefficient": float(a.coefficient),
                "nb_heures_semaine": a.nb_heures_semaine,
                "est_obligatoire": matiere.est_obligatoire,
            })

    return {
        "classe_id": classe.classe_id,
        "classe_libelle": classe.libelle,
        "nb_matieres": len(result),
        "matieres": result
    }


@router.get("/{matiere_id}", response_model=MatiereOut)
def get_matiere(matiere_id: int, db: Session = Depends(get_db)):
    m = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
    if not m:
        raise HTTPException(404, "Matière non trouvée")
    return m


@router.post("", response_model=MatiereOut, status_code=201)
def create_matiere(data: MatiereCreate, db: Session = Depends(get_db)):
    exists = db.query(Matiere).filter(
        Matiere.code == data.code, Matiere.cycle_id == data.cycle_id
    ).first()
    if exists:
        raise HTTPException(409, f"La matière avec le code '{data.code}' existe déjà dans ce cycle.")
    m = Matiere(**data.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.post("/batch-create", status_code=201)
def batch_create_matieres(data: List[MatiereCreate], db: Session = Depends(get_db)):
    """Crée ou met à jour plusieurs matières en lot."""
    created_count = 0
    updated_count = 0
    for item in data:
        exists = db.query(Matiere).filter(
            Matiere.code == item.code, Matiere.cycle_id == item.cycle_id
        ).first()
        if exists:
            exists.libelle = item.libelle
            exists.categorie = item.categorie
            exists.coefficient_defaut = item.coefficient_defaut
            exists.nb_heures_semaine = item.nb_heures_semaine
            exists.est_obligatoire = item.est_obligatoire
            updated_count += 1
        else:
            m = Matiere(**item.model_dump())
            db.add(m)
            created_count += 1
    db.commit()
    return {"message": f"Opération réussie. {created_count} matières créées, {updated_count} mises à jour.", "created": created_count, "updated": updated_count}


@router.put("/{matiere_id}", response_model=MatiereOut)
def update_matiere(matiere_id: int, data: MatiereCreate, db: Session = Depends(get_db)):
    m = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
    if not m:
        raise HTTPException(404, "Matière non trouvée")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{matiere_id}")
def delete_matiere(matiere_id: int, db: Session = Depends(get_db)):
    m = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
    if not m:
        raise HTTPException(404, "Matière non trouvée")
    # Supprimer les associations classe-matière liées
    db.query(ClasseMatiere).filter(ClasseMatiere.matiere_id == matiere_id).delete()
    db.delete(m)
    db.commit()
    return {"message": f"Matière '{m.libelle}' supprimée avec succès."}


# ============================================================================
# PROGRAMME GUINÉEN COMPLET — Auto-Génération
# ============================================================================

# Dictionnaire complet du programme guinéen par niveau
# Source: validé par l'utilisateur selon le programme officiel guinéen
PROGRAMME_GUINEEN = {

    # ═══════════════════════════════════════════════════════════════
    # PRIMAIRE — 1ère et 2ème Année (CP1 / CP2)
    # 7 matières
    # ═══════════════════════════════════════════════════════════════
    "CP1": [
        {"code": "FRA", "libelle": "Français / Lecture",            "categorie": "Langues",          "coef": 5, "heures": 8},
        {"code": "CAL", "libelle": "Calcul",                        "categorie": "Sciences",         "coef": 4, "heures": 6},
        {"code": "SCO", "libelle": "Science d'Observation",         "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "DES", "libelle": "Dessin / Arts Plastiques",      "categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "MUS", "libelle": "Chant et Musique",              "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],
    "CP2": [
        {"code": "FRA", "libelle": "Français / Lecture",            "categorie": "Langues",          "coef": 5, "heures": 8},
        {"code": "CAL", "libelle": "Calcul",                        "categorie": "Sciences",         "coef": 4, "heures": 6},
        {"code": "SCO", "libelle": "Science d'Observation",         "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "DES", "libelle": "Dessin / Arts Plastiques",      "categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "MUS", "libelle": "Chant et Musique",              "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],

    # ═══════════════════════════════════════════════════════════════
    # PRIMAIRE — 3ème et 4ème Année (CE1 / CE2)
    # 10 matières (ajout Lecture/Écriture, Histoire, Géographie)
    # ═══════════════════════════════════════════════════════════════
    "CE1": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 5, "heures": 7},
        {"code": "LEC", "libelle": "Lecture et Écriture",           "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "CAL", "libelle": "Calcul",                        "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "SCI", "libelle": "Sciences",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "DES", "libelle": "Dessin / Arts Plastiques",      "categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "MUS", "libelle": "Chant et Musique",              "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],
    "CE2": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 5, "heures": 7},
        {"code": "LEC", "libelle": "Lecture et Écriture",           "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "CAL", "libelle": "Calcul",                        "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "SCI", "libelle": "Sciences",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "DES", "libelle": "Dessin / Arts Plastiques",      "categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "MUS", "libelle": "Chant et Musique",              "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],

    # ═══════════════════════════════════════════════════════════════
    # PRIMAIRE — 5ème et 6ème Année (CM1 / CM2)
    # 9 matières (Français complet, Calcul, Sci d'observation, H, G, ECM, Dessin, EPS, Chant)
    # ═══════════════════════════════════════════════════════════════
    "CM1": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 5, "heures": 7},
        {"code": "CAL", "libelle": "Calcul",                        "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "SCO", "libelle": "Sciences d'Observation",        "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "DES", "libelle": "Dessin / Arts Plastiques",      "categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "MUS", "libelle": "Chant et Musique",              "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],
    "CM2": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 5, "heures": 7},
        {"code": "CAL", "libelle": "Calcul",                        "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "SCO", "libelle": "Sciences d'Observation",        "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 1},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "DES", "libelle": "Dessin / Arts Plastiques",      "categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "MUS", "libelle": "Chant et Musique",              "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],

    # ═══════════════════════════════════════════════════════════════
    # COLLÈGE — 7ème, 8ème, 9ème, 10ème Année
    # 12 matières: Français, Maths, Anglais, Physique, Chimie, Biologie,
    #              Histoire, Géographie, ECM, EPS, Dessin, Informatique
    # ═══════════════════════════════════════════════════════════════
    "7EME": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 4, "heures": 5},
        {"code": "MAT", "libelle": "Mathématiques",                 "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "ANG", "libelle": "Anglais",                       "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "PHY", "libelle": "Physique",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "CHI", "libelle": "Chimie",                        "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "BIO", "libelle": "Biologie",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "DES", "libelle": "Dessin",                        "categorie": "Pratique",         "coef": 1, "heures": 1},
        {"code": "INF", "libelle": "Informatique",                  "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],
    "8EME": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 4, "heures": 5},
        {"code": "MAT", "libelle": "Mathématiques",                 "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "ANG", "libelle": "Anglais",                       "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "PHY", "libelle": "Physique",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "CHI", "libelle": "Chimie",                        "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "BIO", "libelle": "Biologie",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "DES", "libelle": "Dessin",                        "categorie": "Pratique",         "coef": 1, "heures": 1},
        {"code": "INF", "libelle": "Informatique",                  "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],
    "9EME": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 4, "heures": 5},
        {"code": "MAT", "libelle": "Mathématiques",                 "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "ANG", "libelle": "Anglais",                       "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "PHY", "libelle": "Physique",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "CHI", "libelle": "Chimie",                        "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "BIO", "libelle": "Biologie",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "DES", "libelle": "Dessin",                        "categorie": "Pratique",         "coef": 1, "heures": 1},
        {"code": "INF", "libelle": "Informatique",                  "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],
    "10EME": [
        {"code": "FRA", "libelle": "Français",                     "categorie": "Langues",          "coef": 4, "heures": 5},
        {"code": "MAT", "libelle": "Mathématiques",                 "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "ANG", "libelle": "Anglais",                       "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "PHY", "libelle": "Physique",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "CHI", "libelle": "Chimie",                        "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "BIO", "libelle": "Biologie",                      "categorie": "Sciences",         "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",                      "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "GEO", "libelle": "Géographie",                    "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "ECM", "libelle": "Éducation Civique et Morale",   "categorie": "Sciences Sociales","coef": 1, "heures": 1},
        {"code": "EPS", "libelle": "Éducation Physique et Sportive","categorie": "Pratique",         "coef": 1, "heures": 2},
        {"code": "DES", "libelle": "Dessin",                        "categorie": "Pratique",         "coef": 1, "heures": 1},
        {"code": "INF", "libelle": "Informatique",                  "categorie": "Pratique",         "coef": 1, "heures": 1},
    ],

    # ═══════════════════════════════════════════════════════════════
    # LYCÉE SÉRIE SM (Sciences Mathématiques) — 11ème, 12ème, Terminale
    # 7 matières: Français, Maths, Anglais, Physique, Chimie, Philosophie, Économie
    # ═══════════════════════════════════════════════════════════════
    "11SM": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 5, "heures": 6},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "PHY", "libelle": "Physique",       "categorie": "Sciences",         "coef": 4, "heures": 4},
        {"code": "CHI", "libelle": "Chimie",         "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 2, "heures": 2},
    ],
    "12SM": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 5, "heures": 6},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "PHY", "libelle": "Physique",       "categorie": "Sciences",         "coef": 4, "heures": 4},
        {"code": "CHI", "libelle": "Chimie",         "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 2, "heures": 2},
    ],
    "TSM": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 5, "heures": 6},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "PHY", "libelle": "Physique",       "categorie": "Sciences",         "coef": 4, "heures": 4},
        {"code": "CHI", "libelle": "Chimie",         "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 2, "heures": 2},
    ],

    # ═══════════════════════════════════════════════════════════════
    # LYCÉE SÉRIE SE (Sciences Expérimentales) — 11ème, 12ème, Terminale
    # 8 matières: Français, Maths, Anglais, Physique, Chimie, Biologie, Philosophie, Économie
    # ═══════════════════════════════════════════════════════════════
    "11SE": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 3, "heures": 4},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "PHY", "libelle": "Physique",       "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "CHI", "libelle": "Chimie",         "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "BIO", "libelle": "Biologie",       "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 2, "heures": 2},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 2, "heures": 2},
    ],
    "12SE": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 3, "heures": 4},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "PHY", "libelle": "Physique",       "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "CHI", "libelle": "Chimie",         "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "BIO", "libelle": "Biologie",       "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 2, "heures": 2},
    ],
    "TSE": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 3, "heures": 4},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "PHY", "libelle": "Physique",       "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "CHI", "libelle": "Chimie",         "categorie": "Sciences",         "coef": 3, "heures": 3},
        {"code": "BIO", "libelle": "Biologie",       "categorie": "Sciences",         "coef": 4, "heures": 5},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 2, "heures": 2},
    ],

    # ═══════════════════════════════════════════════════════════════
    # LYCÉE SÉRIE SS (Sciences Sociales) — 11ème, 12ème, Terminale
    # 7 matières: Français, Maths, Anglais, Histoire, Géographie, Philosophie, Économie
    # PAS de Physique, Chimie, Biologie
    # ═══════════════════════════════════════════════════════════════
    "11SS": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 4},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 2, "heures": 3},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 3},
        {"code": "HIS", "libelle": "Histoire",       "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "GEO", "libelle": "Géographie",     "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 4, "heures": 4},
    ],
    "12SS": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 4},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 2, "heures": 3},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 3},
        {"code": "HIS", "libelle": "Histoire",       "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "GEO", "libelle": "Géographie",     "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 4, "heures": 4},
    ],
    "TSS": [
        {"code": "FRA", "libelle": "Français",      "categorie": "Langues",          "coef": 3, "heures": 3},
        {"code": "MAT", "libelle": "Mathématiques",  "categorie": "Sciences",         "coef": 2, "heures": 3},
        {"code": "ANG", "libelle": "Anglais",        "categorie": "Langues",          "coef": 2, "heures": 2},
        {"code": "HIS", "libelle": "Histoire",       "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "GEO", "libelle": "Géographie",     "categorie": "Sciences Sociales","coef": 3, "heures": 3},
        {"code": "PHI", "libelle": "Philosophie",    "categorie": "Sciences Sociales","coef": 4, "heures": 4},
        {"code": "ECO", "libelle": "Économie",       "categorie": "Sciences Sociales","coef": 4, "heures": 4},
    ],
}

# Mapping Niveau.code => clé programme (flexible pour gérer les variantes)
NIVEAU_TO_PROGRAMME = {
    # Primaire
    "1A": "CP1", "CP1": "CP1",
    "2A": "CP2", "CP2": "CP2",
    "3A": "CE1", "CE1": "CE1",
    "4A": "CE2", "CE2": "CE2",
    "5A": "CM1", "CM1": "CM1",
    "6A": "CM2", "CM2": "CM2",
    # Collège
    "7A": "7EME", "7EME": "7EME", "7": "7EME",
    "8A": "8EME", "8EME": "8EME", "8": "8EME",
    "9A": "9EME", "9EME": "9EME", "9": "9EME",
    "10A": "10EME", "10EME": "10EME", "10": "10EME",
    # Lycée SM
    "11SM": "11SM", "11A-SM": "11SM",
    "12SM": "12SM", "12A-SM": "12SM",
    "TSM": "TSM", "TM-SM": "TSM",
    # Lycée SE
    "11SE": "11SE", "11A-SE": "11SE",
    "12SE": "12SE", "12A-SE": "12SE",
    "TSE": "TSE", "TM-SE": "TSE",
    # Lycée SS
    "11SS": "11SS", "11A-SS": "11SS",
    "12SS": "12SS", "12A-SS": "12SS",
    "TSS": "TSS", "TM-SS": "TSS",
}


@router.post("/auto-generation", status_code=201)
def auto_generate_matieres_guinee(db: Session = Depends(get_db)):
    """Génère automatiquement TOUTES les matières du programme guinéen sous 3 cycles."""
    
    # S'assurer que les cycles existent
    cycles_def = [
        {"code": "PRM", "libelle": "Primaire", "ordre": 1},
        {"code": "CLG", "libelle": "Collège", "ordre": 2},
        {"code": "LYC", "libelle": "Lycée", "ordre": 3},
    ]
    cycle_map = {}
    for cd in cycles_def:
        c = db.query(Cycle).filter(Cycle.code == cd["code"]).first()
        if not c:
            c = Cycle(etablissement_id=1, code=cd["code"], libelle=cd["libelle"], ordre=cd["ordre"])
            db.add(c)
            db.commit()
            db.refresh(c)
        cycle_map[cd["code"]] = c.cycle_id

    # Niveaux du programme liés au cycle
    niveaux_primaire = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"]
    niveaux_college = ["7EME", "8EME", "9EME", "10EME"]
    niveaux_lycee = ["11SM", "12SM", "TSM", "11SE", "12SE", "TSE", "11SS", "12SS", "TSS"]

    def get_cycle_code(niveau_code):
        if niveau_code in niveaux_primaire: return "PRM"
        if niveau_code in niveaux_college: return "CLG"
        if niveau_code in niveaux_lycee: return "LYC"
        return None

    # Collecter toutes les matières uniques par cycle
    unique_matieres = {}  # clé = (cycle_code, code_matiere)
    for niv_code, mats in PROGRAMME_GUINEEN.items():
        cc = get_cycle_code(niv_code)
        if not cc:
            continue
        for mat in mats:
            key = (cc, mat["code"])
            if key not in unique_matieres:
                unique_matieres[key] = {
                    "cycle_id": cycle_map[cc],
                    "code": mat["code"],
                    "libelle": mat["libelle"],
                    "categorie": mat["categorie"],
                    "coefficient_defaut": mat["coef"],
                    "est_obligatoire": "N" if "Option" in mat["libelle"] else "O",
                    "nb_heures_semaine": mat["heures"],
                }

    added = 0
    for (cc, code), data in unique_matieres.items():
        exists = db.query(Matiere).filter(
            Matiere.code == code, Matiere.cycle_id == data["cycle_id"]
        ).first()
        if not exists:
            m = Matiere(
                cycle_id=data["cycle_id"],
                code=data["code"],
                libelle=data["libelle"],
                categorie=data["categorie"],
                coefficient_defaut=data["coefficient_defaut"],
                est_obligatoire=data["est_obligatoire"],
                note_sur=20,
                nb_heures_semaine=data["nb_heures_semaine"],
            )
            db.add(m)
            added += 1

    db.commit()
    total = db.query(Matiere).count()
    return {
        "message": f"{added} nouvelles matières ajoutées. Total: {total} matières dans le système.",
        "added": added,
        "total": total
    }


# ============================================================================
# ATTRIBUTION INTELLIGENTE DES MATIÈRES AUX CLASSES
# ============================================================================

@router.post("/attribuer-programme", status_code=201)
def attribuer_programme_aux_classes(db: Session = Depends(get_db)):
    """
    Attribue intelligemment les matières aux classes existantes en se basant
    sur le niveau (code) de la classe et le programme guinéen.
    """
    classes = db.query(Classe).filter(Classe.statut == "ACTIVE").all()
    if not classes:
        raise HTTPException(404, "Aucune classe active trouvée dans le système.")

    assigned = 0
    skipped = 0
    errors = []

    for classe in classes:
        # Retrouver le niveau de la classe
        niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
        if not niveau:
            errors.append(f"Classe '{classe.libelle}': niveau introuvable")
            continue

        # Trouver le programme correspondant
        programme_key = NIVEAU_TO_PROGRAMME.get(niveau.code)
        if not programme_key:
            errors.append(f"Classe '{classe.libelle}' (niveau {niveau.code}): pas de programme configuré")
            continue

        programme_matieres = PROGRAMME_GUINEEN.get(programme_key, [])
        if not programme_matieres:
            continue

        # Le cycle du niveau
        cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first()
        if not cycle:
            continue

        for mat_def in programme_matieres:
            # Trouver la matière en BD
            matiere = db.query(Matiere).filter(
                Matiere.code == mat_def["code"],
                Matiere.cycle_id == cycle.cycle_id
            ).first()

            if not matiere:
                continue

            # Vérifier si l'association existe déjà
            exists = db.query(ClasseMatiere).filter(
                ClasseMatiere.classe_id == classe.classe_id,
                ClasseMatiere.matiere_id == matiere.matiere_id
            ).first()

            if exists:
                skipped += 1
                continue

            cm = ClasseMatiere(
                classe_id=classe.classe_id,
                matiere_id=matiere.matiere_id,
                coefficient=matiere.coefficient_defaut if matiere.coefficient_defaut is not None else mat_def["coef"],
                nb_heures_semaine=matiere.nb_heures_semaine if matiere.nb_heures_semaine is not None else mat_def["heures"],
                est_active="O"
            )
            db.add(cm)
            assigned += 1

    db.commit()
    return {
        "message": f"{assigned} attributions créées, {skipped} déjà existantes.",
        "assigned": assigned,
        "skipped": skipped,
        "errors": errors
    }


@router.post("/attribuer-programme-classe/{classe_id}")
def attribuer_programme_classe(classe_id: int, db: Session = Depends(get_db)):
    """Attribue automatiquement les matières du programme guinéen à UNE classe spécifique."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")

    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    if not niveau:
        raise HTTPException(400, "Niveau non configuré pour cette classe")

    programme_key = NIVEAU_TO_PROGRAMME.get(niveau.code)
    if not programme_key:
        raise HTTPException(400, f"Aucun programme pour le niveau '{niveau.code}'")

    programme_matieres = PROGRAMME_GUINEEN.get(programme_key, [])
    if not programme_matieres:
        raise HTTPException(400, f"Programme vide pour '{programme_key}'")

    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first()
    if not cycle:
        raise HTTPException(400, "Cycle non trouvé")

    # Supprimer les anciennes attributions de cette classe
    db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == classe_id).delete()

    assigned = 0
    for mat_def in programme_matieres:
        matiere = db.query(Matiere).filter(
            Matiere.code == mat_def["code"],
            Matiere.cycle_id == cycle.cycle_id
        ).first()
        if not matiere:
            continue

        cm = ClasseMatiere(
            classe_id=classe_id,
            matiere_id=matiere.matiere_id,
            coefficient=matiere.coefficient_defaut if matiere.coefficient_defaut is not None else mat_def["coef"],
            nb_heures_semaine=matiere.nb_heures_semaine if matiere.nb_heures_semaine is not None else mat_def["heures"],
            est_active="O"
        )
        db.add(cm)
        assigned += 1

    db.commit()
    return {
        "message": f"{assigned} matières attribuées à {classe.libelle}",
        "assigned": assigned,
        "classe": classe.libelle,
        "niveau": niveau.code
    }


@router.post("/classe/{classe_id}/matiere")
def ajouter_matiere_classe(classe_id: int, data: dict, db: Session = Depends(get_db)):
    """Ajoute manuellement une matière à une classe."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")

    matiere_id = data.get("matiere_id")
    coefficient = data.get("coefficient", 2)
    nb_heures = data.get("nb_heures_semaine", 2)

    matiere = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
    if not matiere:
        raise HTTPException(404, "Matière non trouvée")

    # Vérifier doublon
    exists = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.matiere_id == matiere_id
    ).first()
    if exists:
        raise HTTPException(409, f"{matiere.libelle} est déjà attribuée à cette classe")

    cm = ClasseMatiere(
        classe_id=classe_id,
        matiere_id=matiere_id,
        coefficient=coefficient,
        nb_heures_semaine=nb_heures,
        est_active="O"
    )
    db.add(cm)
    db.commit()
    return {"message": f"{matiere.libelle} ajoutée à {classe.libelle}"}


@router.delete("/classe/{classe_id}/matiere/{matiere_id}")
def retirer_matiere_classe(classe_id: int, matiere_id: int, db: Session = Depends(get_db)):
    """Retire une matière d'une classe."""
    cm = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.matiere_id == matiere_id
    ).first()
    if not cm:
        raise HTTPException(404, "Association non trouvée")

    db.delete(cm)
    db.commit()
    return {"message": "Matière retirée"}


@router.get("/par-cycle/groupes")
def get_matieres_par_cycle_groupes(db: Session = Depends(get_db)):
    """Retourne TOUTES les matières regroupées par cycle (Primaire, Collège, Lycée)
    Utilisé par le modal d'ajout manuel pour un affichage organisé."""
    cycles = db.query(Cycle).order_by(Cycle.ordre).all()
    result = []
    for c in cycles:
        matieres = db.query(Matiere).filter(
            Matiere.cycle_id == c.cycle_id
        ).order_by(Matiere.categorie, Matiere.libelle).all()
        result.append({
            "cycle_id": c.cycle_id,
            "cycle_code": c.code,
            "cycle_libelle": c.libelle,
            "matieres": [
                {
                    "matiere_id": m.matiere_id,
                    "code": m.code,
                    "libelle": m.libelle,
                    "categorie": m.categorie,
                    "coefficient_defaut": float(m.coefficient_defaut) if m.coefficient_defaut else 2,
                    "nb_heures_semaine": m.nb_heures_semaine or 2,
                }
                for m in matieres
            ]
        })
    return result
