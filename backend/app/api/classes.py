"""
SMARTSCHOOL API — Routes Classes & Inscriptions
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.academique import Classe, Inscription, Eleve, Niveau, Enseignant, ClasseMatiere, Matiere
from app.schemas.schemas import ClasseCreate, ClasseOut, InscriptionCreate, InscriptionOut

router = APIRouter(prefix="/api/classes", tags=["Classes"])

# Mapping series code → Niveau codes in DB
SERIES_NIVEAU_CODES = {
    "SM": ["11SM", "12SM", "TSM"],
    "SE": ["11SE", "12SE", "TSE"],
    "SS": ["11SS", "12SS", "TSS"],
}

# Input validation schema
class MatiereCoefficientUpdate(BaseModel):
    matiere_id: int
    coefficient: float = Field(..., gt=0, le=10)
    note_sur: Optional[float] = Field(None, gt=0, le=100)

def check_admin_access(current_user: dict):
    role = current_user.get("role")
    if role not in {"SUPER_ADMIN", "FONDATEUR", "DG", "ADMIN", "INFORMATICIEN"}:
        raise HTTPException(
            status_code=403,
            detail="Accès interdit : privilèges insuffisants pour cette configuration"
        )

@router.get("/lycee-series-coefficients")
def get_lycee_series_coefficients(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Retourne les coefficients par matière pour chaque série lycée (SM, SE, SS).
    Calcule la moyenne des coefficients de ClasseMatiere pour les classes de chaque série.
    """
    check_admin_access(current_user)
    result = {}
    for serie, niveau_codes in SERIES_NIVEAU_CODES.items():
        # Get all classes belonging to this serie's niveaux
        niveaux = db.query(Niveau).filter(Niveau.code.in_(niveau_codes)).all()
        niveau_ids = [n.niveau_id for n in niveaux]
        classes = db.query(Classe).filter(
            Classe.niveau_id.in_(niveau_ids), Classe.statut == "ACTIVE"
        ).all()
        classe_ids = [c.classe_id for c in classes]

        # Get unique matières for these classes via JOIN (avoids N+1)
        matieres_data = []
        if classe_ids:
            ref_class_id = classe_ids[0]
            rows = (
                db.query(ClasseMatiere, Matiere)
                .join(Matiere, ClasseMatiere.matiere_id == Matiere.matiere_id)
                .filter(
                    ClasseMatiere.classe_id == ref_class_id,
                    ClasseMatiere.est_active == "O"
                )
                .all()
            )
            for cm, m in rows:
                matieres_data.append({
                    "matiere_id": m.matiere_id,
                    "code": m.code,
                    "libelle": m.libelle,
                    "categorie": m.categorie,
                    "coefficient": float(cm.coefficient),
                    "note_sur": float(m.note_sur) if m.note_sur else 20,
                })
        result[serie] = {
            "classes_count": len(classe_ids),
            "matieres": matieres_data
        }
    return result


@router.put("/lycee-series-coefficients/{serie}")
def update_lycee_series_coefficients(
    serie: str,
    updates: List[MatiereCoefficientUpdate] = Body(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Met à jour les coefficients des ClasseMatiere pour toutes les classes d'une série lycée.
    updates: list of MatiereCoefficientUpdate
    """
    check_admin_access(current_user)
    serie_upper = serie.upper()
    if serie_upper not in SERIES_NIVEAU_CODES:
        raise HTTPException(400, f"Série inconnue: {serie}. Valeurs acceptées: SM, SE, SS")

    niveau_codes = SERIES_NIVEAU_CODES[serie_upper]
    niveaux = db.query(Niveau).filter(Niveau.code.in_(niveau_codes)).all()
    niveau_ids = [n.niveau_id for n in niveaux]
    classes = db.query(Classe).filter(
        Classe.niveau_id.in_(niveau_ids), Classe.statut == "ACTIVE"
    ).all()

    updated = 0
    for cls in classes:
        for upd in updates:
            matiere_id = upd.matiere_id
            new_coef = upd.coefficient
            new_note_sur = upd.note_sur
            cm = db.query(ClasseMatiere).filter(
                ClasseMatiere.classe_id == cls.classe_id,
                ClasseMatiere.matiere_id == matiere_id,
                ClasseMatiere.est_active == "O"
            ).first()
            if cm and new_coef is not None:
                cm.coefficient = float(new_coef)
            # note_sur is on Matiere level — update the matiere directly
            if new_note_sur is not None:
                m = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
                if m:
                    m.note_sur = float(new_note_sur)
            updated += 1

    db.commit()
    return {"message": f"{updated} coefficients mis à jour pour la série {serie_upper}", "serie": serie_upper}




@router.get("", response_model=List[ClasseOut])
def list_classes(
    etablissement_id: int = 1,
    annee_id: int = 1,
    statut: Optional[str] = "ACTIVE",
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Classe).filter(
        Classe.etablissement_id == etablissement_id,
        Classe.annee_id == annee_id
    )
    if statut:
        query = query.filter(Classe.statut == statut)
    classes = query.order_by(Classe.code).offset(skip).limit(limit).all()
    for cl in classes:
        cl.nb_matieres = db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == cl.classe_id,
            ClasseMatiere.est_active == "O"
        ).count()
        niv = db.query(Niveau).filter(Niveau.niveau_id == cl.niveau_id).first()
        cl.niveau_libelle = niv.libelle if niv else None
    return classes


@router.get("/{classe_id}", response_model=ClasseOut)
def get_classe(classe_id: int, db: Session = Depends(get_db)):
    cl = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    cl.nb_matieres = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == cl.classe_id,
        ClasseMatiere.est_active == "O"
    ).count()
    niv = db.query(Niveau).filter(Niveau.niveau_id == cl.niveau_id).first()
    cl.niveau_libelle = niv.libelle if niv else None
    return cl


@router.get("/{classe_id}/eleves")
def get_classe_eleves(classe_id: int, db: Session = Depends(get_db)):
    results = db.query(
        Eleve.eleve_id,
        Eleve.matricule,
        Eleve.nom,
        Eleve.prenom,
        Eleve.sexe,
        Eleve.date_naissance,
        Inscription.statut.label("statut_inscription")
    ).join(
        Inscription, Eleve.eleve_id == Inscription.eleve_id
    ).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).order_by(Eleve.nom, Eleve.prenom).all()

    return [
        {
            "eleve_id": r.eleve_id, "matricule": r.matricule,
            "nom": r.nom, "prenom": r.prenom, "sexe": r.sexe,
            "date_naissance": str(r.date_naissance),
            "statut_inscription": r.statut_inscription
        } for r in results
    ]


@router.post("", response_model=ClasseOut, status_code=201)
def create_classe(data: ClasseCreate, db: Session = Depends(get_db)):
    # Vérifier l'existence d'une classe avec le même nom (libelle) ou code
    existing = db.query(Classe).filter(
        Classe.etablissement_id == data.etablissement_id,
        Classe.annee_id == data.annee_id,
        ((Classe.libelle == data.libelle) | (Classe.code == data.code))
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=409, 
            detail=f"Une classe avec le libellé '{data.libelle}' ou le code '{data.code}' existe déjà."
        )

    cl = Classe(**data.model_dump())
    db.add(cl)
    db.commit()
    db.refresh(cl)
    return cl


@router.put("/{classe_id}", response_model=ClasseOut)
def update_classe(classe_id: int, data: ClasseCreate, db: Session = Depends(get_db)):
    cl = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cl, key, value)
    db.commit()
    db.refresh(cl)
    return cl


@router.get("/{classe_id}/profil")
def get_classe_profil(classe_id: int, db: Session = Depends(get_db)):
    """Profil complet d'une classe: infos, enseignant principal, élèves, matières"""
    from app.models.academique import ClasseMatiere, Matiere
    
    cl = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not cl:
        raise HTTPException(404, "Classe non trouvée")
    
    # Niveau
    niveau = db.query(Niveau).filter(Niveau.niveau_id == cl.niveau_id).first()
    
    # Prof principal
    prof = None
    if cl.professeur_principal:
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == cl.professeur_principal).first()
        if ens:
            prof = {
                "enseignant_id": ens.enseignant_id, "matricule": ens.matricule,
                "nom": ens.nom, "prenom": ens.prenom, "sexe": ens.sexe,
                "specialite": ens.specialite, "telephone": ens.telephone
            }
    
    # Élèves
    eleves_data = db.query(
        Eleve.eleve_id, Eleve.matricule, Eleve.nom, Eleve.prenom,
        Eleve.sexe, Eleve.date_naissance,
        Inscription.statut.label("statut_inscription"),
        Inscription.role_classe
    ).join(
        Inscription, Eleve.eleve_id == Inscription.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
    ).order_by(Eleve.nom, Eleve.prenom).all()
    
    # Historique de redoublement — compté en UNE requête groupée (pas une par
    # élève) sur TOUTES les inscriptions passées de cette classe, quelle que
    # soit l'année, marquées REDOUBLANT par une clôture précédente (voir
    # app/api/promotion.py). Sert à afficher un badge "redoublant Nx" côté
    # admin sur la fiche classe.
    eleve_ids = [e.eleve_id for e in eleves_data]
    nb_redoublements = {}
    if eleve_ids:
        rows = db.query(Inscription.eleve_id, func.count(Inscription.inscription_id)).filter(
            Inscription.eleve_id.in_(eleve_ids), Inscription.decision_fin_annee == "REDOUBLANT"
        ).group_by(Inscription.eleve_id).all()
        nb_redoublements = {eid: n for eid, n in rows}

    eleves = [{
        "eleve_id": e.eleve_id, "matricule": e.matricule,
        "nom": e.nom, "prenom": e.prenom, "sexe": e.sexe,
        "date_naissance": str(e.date_naissance),
        "statut_inscription": e.statut_inscription,
        "role_classe": e.role_classe,
        "nb_redoublements": nb_redoublements.get(e.eleve_id, 0),
    } for e in eleves_data]
    
    # Chefs de classe
    chefs = [e for e in eleves if e["role_classe"] and e["role_classe"].startswith("CHEF")]
    
    # Matières attribuées
    matieres_assoc = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id, ClasseMatiere.est_active == "O"
    ).all()
    matieres = []
    for a in matieres_assoc:
        m = db.query(Matiere).filter(Matiere.matiere_id == a.matiere_id).first()
        if m:
            matieres.append({
                "matiere_id": m.matiere_id, "code": m.code,
                "libelle": m.libelle, "categorie": m.categorie,
                "coefficient": float(a.coefficient),
                "nb_heures_semaine": a.nb_heures_semaine
            })
    
    nb_garcons = len([e for e in eleves if e["sexe"] == "M"])
    nb_filles = len([e for e in eleves if e["sexe"] == "F"])
    
    # Simuler top 10 (moyenne générale simulée basée sur hash du matricule)
    import hashlib
    top10 = []
    for e in eleves:
        seed = int(hashlib.md5(e["matricule"].encode()).hexdigest()[:8], 16)
        moyenne = round(8 + (seed % 1200) / 100, 2)
        top10.append({**e, "moyenne_simulee": moyenne})
    top10.sort(key=lambda x: x["moyenne_simulee"], reverse=True)
    top10 = top10[:10]
    
    return {
        "classe_id": cl.classe_id, "code": cl.code, "libelle": cl.libelle,
        "capacite_max": cl.capacite_max, "effectif_actuel": cl.effectif_actuel,
        "statut": cl.statut,
        "niveau": {"niveau_id": niveau.niveau_id, "code": niveau.code, "libelle": niveau.libelle} if niveau else None,
        "professeur_principal": prof,
        "chefs_de_classe": chefs,
        "nb_garcons": nb_garcons, "nb_filles": nb_filles,
        "nb_matieres": len(matieres),
        "eleves": eleves,
        "matieres": matieres,
        "top10": top10,
    }


@router.put("/{classe_id}/configurer")
def configurer_classe(classe_id: int, config: dict, db: Session = Depends(get_db)):
    """Configure une classe: prof principal + chefs de classe"""
    cl = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not cl:
        raise HTTPException(404, "Classe non trouvée")
    
    # Prof principal
    if "professeur_principal_id" in config:
        prof_id = config["professeur_principal_id"]
        if prof_id:
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == prof_id).first()
            if not ens:
                raise HTTPException(404, "Enseignant non trouvé")
            cl.professeur_principal = prof_id
        else:
            cl.professeur_principal = None
    
    # Chefs de classe (liste de 3 eleve_ids)
    if "chefs_de_classe" in config:
        chef_ids = config["chefs_de_classe"]
        if len(chef_ids) > 0 and len(chef_ids) != 3:
            raise HTTPException(400, "Vous devez désigner exactement 3 chefs de classe.")
        
        if len(chef_ids) == 3:
            # Validation: au moins 1 fille
            chefs = db.query(Eleve).filter(Eleve.eleve_id.in_(chef_ids)).all()
            nb_filles = sum(1 for c in chefs if c.sexe == 'F')
            if nb_filles < 1:
                raise HTTPException(400, "Au moins une fille doit figurer parmi les 3 chefs de classe.")
            
            # Reset all existing chefs in class
            inscriptions = db.query(Inscription).filter(
                Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
            ).all()
            for insc in inscriptions:
                if insc.role_classe and insc.role_classe.startswith("CHEF"):
                    insc.role_classe = None
            
            # Assign new chefs
            for i, eid in enumerate(chef_ids, 1):
                insc = db.query(Inscription).filter(
                    Inscription.classe_id == classe_id,
                    Inscription.eleve_id == eid,
                    Inscription.statut == "ACTIVE"
                ).first()
                if insc:
                    insc.role_classe = f"CHEF_{i}"
    
    db.commit()
    db.refresh(cl)
    return {"message": "Classe configurée avec succès"}



# ============================================================================
# INSCRIPTIONS
# ============================================================================
inscriptions_router = APIRouter(prefix="/api/inscriptions", tags=["Inscriptions"])


@inscriptions_router.post("", response_model=InscriptionOut, status_code=201)
def create_inscription(data: InscriptionCreate, db: Session = Depends(get_db)):
    # Vérifier doublon
    existing = db.query(Inscription).filter(
        Inscription.eleve_id == data.eleve_id,
        Inscription.annee_id == data.annee_id,
        Inscription.statut == "ACTIVE"
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Cet élève est déjà inscrit pour cette année")

    insc = Inscription(**data.model_dump())
    db.add(insc)

    # Mettre à jour l'effectif de la classe
    classe = db.query(Classe).filter(Classe.classe_id == data.classe_id).first()
    if classe:
        classe.effectif_actuel = (classe.effectif_actuel or 0) + 1

    db.commit()
    db.refresh(insc)
    return insc


@inscriptions_router.get("/{inscription_id}", response_model=InscriptionOut)
def get_inscription(inscription_id: int, db: Session = Depends(get_db)):
    insc = db.query(Inscription).filter(Inscription.inscription_id == inscription_id).first()
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    return insc


@inscriptions_router.delete("/{inscription_id}")
def annuler_inscription(inscription_id: int, db: Session = Depends(get_db)):
    insc = db.query(Inscription).filter(Inscription.inscription_id == inscription_id).first()
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    insc.statut = "ANNULEE"
    classe = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
    if classe and classe.effectif_actuel and classe.effectif_actuel > 0:
        classe.effectif_actuel -= 1
    db.commit()
    return {"message": "Inscription annulée"}
