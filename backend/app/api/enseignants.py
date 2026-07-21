"""
SMARTSCHOOL API — Routes Enseignants (CRUD complet + Emploi du Temps + Affectations)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import List, Optional
from app.core.database import get_db
from app.core.security import hash_password
from app.models.academique import (
    Enseignant, Affectation, Matiere, Classe, ClasseMatiere, CreneauEmploi
)
from app.schemas.schemas import EnseignantCreate, EnseignantUpdate, EnseignantOut

router = APIRouter(prefix="/api/enseignants", tags=["Enseignants"])


@router.get("", response_model=List[EnseignantOut])
def list_enseignants(
    etablissement_id: int = 1,
    statut: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Enseignant).filter(
        Enseignant.etablissement_id == etablissement_id
    )
    if statut:
        query = query.filter(Enseignant.statut == statut)
    if search:
        query = query.filter(
            (Enseignant.nom.ilike(f"%{search}%")) |
            (Enseignant.prenom.ilike(f"%{search}%")) |
            (Enseignant.matricule.ilike(f"%{search}%"))
        )
    return query.order_by(Enseignant.nom).offset(skip).limit(limit).all()


@router.get("/count")
def count_enseignants(etablissement_id: int = 1, db: Session = Depends(get_db)):
    total = db.query(func.count(Enseignant.enseignant_id)).filter(
        Enseignant.etablissement_id == etablissement_id
    ).scalar()
    actifs = db.query(func.count(Enseignant.enseignant_id)).filter(
        Enseignant.etablissement_id == etablissement_id,
        Enseignant.statut == "ACTIF"
    ).scalar()
    vacataires = db.query(func.count(Enseignant.enseignant_id)).filter(
        Enseignant.etablissement_id == etablissement_id,
        Enseignant.type_contrat == "VACATAIRE"
    ).scalar()
    return {"total": total, "actifs": actifs, "vacataires": vacataires}


@router.get("/{enseignant_id}", response_model=EnseignantOut)
def get_enseignant(enseignant_id: int, db: Session = Depends(get_db)):
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")
    return ens


@router.get("/{enseignant_id}/affectations")
def get_affectations(enseignant_id: int, annee_id: int = 1, db: Session = Depends(get_db)):
    results = db.query(
        Affectation.affectation_id,
        Classe.classe_id,
        Classe.code.label("classe_code"),
        Classe.libelle.label("classe"),
        Matiere.matiere_id,
        Matiere.code.label("matiere_code"),
        Matiere.libelle.label("matiere"),
        Affectation.nb_heures_semaine,
        Affectation.est_principal,
        Affectation.statut
    ).join(
        Classe, Affectation.classe_id == Classe.classe_id
    ).join(
        Matiere, Affectation.matiere_id == Matiere.matiere_id
    ).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.annee_id == annee_id
    ).order_by(Classe.code).all()

    return [
        {
            "affectation_id": r.affectation_id,
            "classe_id": r.classe_id,
            "classe_code": r.classe_code,
            "classe": r.classe,
            "matiere_id": r.matiere_id,
            "matiere_code": r.matiere_code,
            "matiere": r.matiere,
            "heures": float(r.nb_heures_semaine) if r.nb_heures_semaine else 0,
            "est_principal": r.est_principal == "O",
            "statut": r.statut
        } for r in results
    ]


# ================================================================
# EMPLOI DU TEMPS PERSONNEL DE L'ENSEIGNANT
# ================================================================

@router.get("/{enseignant_id}/emploi-du-temps")
def get_emploi_enseignant(enseignant_id: int, annee_id: int = 1, db: Session = Depends(get_db)):
    """Retourne l'emploi du temps personnel d'un enseignant (grille semaine)."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    creneaux = db.query(CreneauEmploi).filter(
        CreneauEmploi.enseignant_id == enseignant_id,
        CreneauEmploi.annee_id == annee_id,
        CreneauEmploi.statut == "ACTIVE"
    ).order_by(CreneauEmploi.jour, CreneauEmploi.heure_debut).all()

    result = []
    for c in creneaux:
        mat = db.query(Matiere).filter(Matiere.matiere_id == c.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == c.classe_id).first()
        result.append({
            "creneau_id": c.creneau_id,
            "jour": c.jour,
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "classe_id": c.classe_id,
            "classe": cls.libelle if cls else "?",
            "classe_code": cls.code if cls else "?",
            "matiere_id": c.matiere_id,
            "matiere": mat.libelle if mat else "?",
            "matiere_code": mat.code if mat else "?",
            "salle": c.salle,
        })

    return result


# ================================================================
# DASHBOARD STATS DE L'ENSEIGNANT
# ================================================================

@router.get("/{enseignant_id}/dashboard-stats")
def get_enseignant_stats(enseignant_id: int, annee_id: int = 1, db: Session = Depends(get_db)):
    """Statistiques agrégées de l'enseignant pour son profil/dashboard."""
    # Nombre de classes
    nb_classes = db.query(distinct(Affectation.classe_id)).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).count()

    # Nombre de matières
    nb_matieres = db.query(distinct(Affectation.matiere_id)).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).count()

    # Total heures/semaine
    total_heures = db.query(func.coalesce(func.sum(Affectation.nb_heures_semaine), 0)).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).scalar()

    # Nombre de créneaux dans l'emploi du temps
    nb_creneaux = db.query(CreneauEmploi).filter(
        CreneauEmploi.enseignant_id == enseignant_id,
        CreneauEmploi.annee_id == annee_id,
        CreneauEmploi.statut == "ACTIVE"
    ).count()

    # Classes détaillées
    classes_list = db.query(distinct(Classe.libelle)).join(
        Affectation, Affectation.classe_id == Classe.classe_id
    ).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).all()

    return {
        "nb_classes": nb_classes,
        "nb_matieres": nb_matieres,
        "total_heures_semaine": float(total_heures) if total_heures else 0,
        "nb_creneaux": nb_creneaux,
        "classes": [c[0] for c in classes_list],
    }


# ================================================================
# CRUD AFFECTATIONS
# ================================================================

@router.post("/{enseignant_id}/affectations", status_code=201)
def creer_affectation(enseignant_id: int, data: dict, db: Session = Depends(get_db)):
    """Affecter un enseignant à une classe/matière."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    classe_id = data.get("classe_id")
    matiere_id = data.get("matiere_id")
    annee_id = data.get("annee_id", 1)

    if not classe_id or not matiere_id:
        raise HTTPException(400, "classe_id et matiere_id requis")

    # Verify class and subject exist
    cls = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not cls:
        raise HTTPException(404, "Classe non trouvée")
    mat = db.query(Matiere).filter(Matiere.matiere_id == matiere_id).first()
    if not mat:
        raise HTTPException(404, "Matière non trouvée")

    # Check if affectation already exists
    existing = db.query(Affectation).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.classe_id == classe_id,
        Affectation.matiere_id == matiere_id,
        Affectation.annee_id == annee_id
    ).first()
    if existing:
        raise HTTPException(400, f"Cet enseignant est déjà affecté à {cls.libelle} pour {mat.libelle}")

    # Get heures from ClasseMatiere if available
    cm = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.matiere_id == matiere_id
    ).first()
    nb_heures = cm.nb_heures_semaine if cm else data.get("nb_heures_semaine", 2)

    aff = Affectation(
        enseignant_id=enseignant_id,
        matiere_id=matiere_id,
        classe_id=classe_id,
        annee_id=annee_id,
        nb_heures_semaine=nb_heures,
        est_principal=data.get("est_principal", "O"),
        statut="ACTIVE"
    )
    db.add(aff)
    db.commit()
    db.refresh(aff)

    return {
        "message": f"Affectation créée : {ens.prenom} {ens.nom} → {mat.libelle} en {cls.libelle}",
        "affectation_id": aff.affectation_id,
        "heures": float(nb_heures)
    }


@router.delete("/affectations/{affectation_id}")
def supprimer_affectation(affectation_id: int, db: Session = Depends(get_db)):
    """Supprimer une affectation."""
    aff = db.query(Affectation).filter(Affectation.affectation_id == affectation_id).first()
    if not aff:
        raise HTTPException(404, "Affectation non trouvée")
    db.delete(aff)
    db.commit()
    return {"message": "Affectation supprimée"}


@router.post("", response_model=EnseignantOut, status_code=201)
def create_enseignant(data: EnseignantCreate, db: Session = Depends(get_db)):
    count = db.query(func.count(Enseignant.enseignant_id)).scalar() or 0
    matricule = f"ENS-{count + 1:05d}"
    payload = data.model_dump()
    # Hasher le mot de passe avant stockage
    if payload.get("mot_de_passe"):
        payload["mot_de_passe"] = hash_password(payload["mot_de_passe"])
    ens = Enseignant(**payload, matricule=matricule)
    db.add(ens)
    db.commit()
    db.refresh(ens)
    return ens


@router.put("/{enseignant_id}", response_model=EnseignantOut)
def update_enseignant(enseignant_id: int, data: EnseignantUpdate, db: Session = Depends(get_db)):
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")
    for key, value in data.model_dump(exclude_unset=True).items():
        # Hasher le mot de passe si modifié
        if key == "mot_de_passe" and value:
            value = hash_password(value)
        setattr(ens, key, value)
    db.commit()
    db.refresh(ens)
    return ens


@router.delete("/{enseignant_id}")
def delete_enseignant(enseignant_id: int, db: Session = Depends(get_db)):
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")
    db.delete(ens)
    db.commit()
    return {"message": "Enseignant supprimé"}


# ================================================================
# SALLE DES PROFS — Vue Globale des Affectations
# ================================================================

@router.get("/salle-des-profs/affectations-globales")
def get_affectations_globales(annee_id: int = 1, db: Session = Depends(get_db)):
    """Retourne TOUTES les affectations de l'année — format tableau avec enseignant, classe, matière."""
    from app.models.academique import Niveau, Cycle

    results = db.query(
        Affectation.affectation_id,
        Enseignant.enseignant_id,
        Enseignant.prenom,
        Enseignant.nom,
        Enseignant.matricule,
        Enseignant.specialite,
        Classe.classe_id,
        Classe.code.label("classe_code"),
        Classe.libelle.label("classe_libelle"),
        Matiere.matiere_id,
        Matiere.code.label("matiere_code"),
        Matiere.libelle.label("matiere_libelle"),
        Matiere.categorie.label("matiere_categorie"),
        Affectation.nb_heures_semaine,
        Affectation.est_principal,
        Affectation.statut,
    ).join(
        Enseignant, Affectation.enseignant_id == Enseignant.enseignant_id
    ).join(
        Classe, Affectation.classe_id == Classe.classe_id
    ).join(
        Matiere, Affectation.matiere_id == Matiere.matiere_id
    ).filter(
        Affectation.annee_id == annee_id
    ).order_by(
        Classe.libelle, Matiere.libelle
    ).all()

    return [
        {
            "affectation_id": r.affectation_id,
            "enseignant_id": r.enseignant_id,
            "enseignant_prenom": r.prenom,
            "enseignant_nom": r.nom,
            "enseignant_matricule": r.matricule,
            "enseignant_specialite": r.specialite,
            "enseignant_nom_complet": f"{r.prenom} {r.nom}",
            "classe_id": r.classe_id,
            "classe_code": r.classe_code,
            "classe": r.classe_libelle,
            "matiere_id": r.matiere_id,
            "matiere_code": r.matiere_code,
            "matiere": r.matiere_libelle,
            "matiere_categorie": r.matiere_categorie,
            "heures": float(r.nb_heures_semaine) if r.nb_heures_semaine else 0,
            "est_principal": r.est_principal == "O",
            "statut": r.statut,
        } for r in results
    ]


@router.get("/salle-des-profs/classes-matieres")
def get_classes_avec_matieres(etablissement_id: int = 1, db: Session = Depends(get_db)):
    """Retourne toutes les classes avec leurs matières attribuées — pour le formulaire de la Salle des Profs."""
    from app.models.academique import Niveau, Cycle

    classes = db.query(Classe).filter(
        Classe.statut == "ACTIVE"
    ).order_by(Classe.libelle).all()

    result = []
    for cls in classes:
        niveau = db.query(Niveau).filter(Niveau.niveau_id == cls.niveau_id).first() if cls.niveau_id else None
        cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first() if niveau else None

        # Matières attribuées à cette classe
        cms = db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == cls.classe_id,
            ClasseMatiere.est_active == "O"
        ).all()

        matieres_list = []
        for cm in cms:
            mat = db.query(Matiere).filter(Matiere.matiere_id == cm.matiere_id).first()
            if mat:
                # Chercher si un enseignant est déjà affecté
                aff = db.query(Affectation).filter(
                    Affectation.classe_id == cls.classe_id,
                    Affectation.matiere_id == mat.matiere_id,
                    Affectation.statut == "ACTIVE"
                ).first()
                ens_info = None
                if aff:
                    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == aff.enseignant_id).first()
                    if ens:
                        ens_info = {
                            "enseignant_id": ens.enseignant_id,
                            "nom_complet": f"{ens.prenom} {ens.nom}",
                            "matricule": ens.matricule,
                            "affectation_id": aff.affectation_id,
                        }

                matieres_list.append({
                    "matiere_id": mat.matiere_id,
                    "code": mat.code,
                    "libelle": mat.libelle,
                    "categorie": mat.categorie,
                    "coefficient": float(cm.coefficient) if cm.coefficient else 0,
                    "nb_heures": cm.nb_heures_semaine or 0,
                    "enseignant": ens_info,
                })

        result.append({
            "classe_id": cls.classe_id,
            "code": cls.code,
            "libelle": cls.libelle,
            "cycle": cycle.libelle if cycle else "—",
            "cycle_code": cycle.code if cycle else "—",
            "niveau": niveau.libelle if niveau else "—",
            "nb_matieres": len(matieres_list),
            "nb_affectes": sum(1 for m in matieres_list if m["enseignant"]),
            "matieres": matieres_list,
        })

    return result


@router.get("/salle-des-profs/stats")
def get_salle_des_profs_stats(annee_id: int = 1, db: Session = Depends(get_db)):
    """Statistiques globales pour la Salle des Profs."""
    total_enseignants = db.query(func.count(Enseignant.enseignant_id)).filter(
        Enseignant.statut == "ACTIF"
    ).scalar() or 0

    total_affectations = db.query(func.count(Affectation.affectation_id)).filter(
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).scalar() or 0

    enseignants_affectes = db.query(func.count(distinct(Affectation.enseignant_id))).filter(
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).scalar() or 0

    total_heures = db.query(func.coalesce(func.sum(Affectation.nb_heures_semaine), 0)).filter(
        Affectation.annee_id == annee_id,
        Affectation.statut == "ACTIVE"
    ).scalar() or 0

    # Classes qui ont au moins une matière sans enseignant
    classes_with_matieres = db.query(ClasseMatiere.classe_id, ClasseMatiere.matiere_id).filter(
        ClasseMatiere.est_active == "O"
    ).all()

    total_postes = len(classes_with_matieres)
    postes_pourvus = 0
    for cm in classes_with_matieres:
        aff = db.query(Affectation).filter(
            Affectation.classe_id == cm.classe_id,
            Affectation.matiere_id == cm.matiere_id,
            Affectation.annee_id == annee_id,
            Affectation.statut == "ACTIVE"
        ).first()
        if aff:
            postes_pourvus += 1

    return {
        "total_enseignants": total_enseignants,
        "enseignants_affectes": enseignants_affectes,
        "enseignants_non_affectes": total_enseignants - enseignants_affectes,
        "total_affectations": total_affectations,
        "total_heures_semaine": float(total_heures),
        "total_postes": total_postes,
        "postes_pourvus": postes_pourvus,
        "postes_vacants": total_postes - postes_pourvus,
        "taux_couverture": round((postes_pourvus / total_postes * 100) if total_postes > 0 else 0, 1),
    }

