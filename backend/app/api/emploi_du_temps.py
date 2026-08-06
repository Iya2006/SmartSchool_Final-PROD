"""
SMARTSCHOOL API — Emploi du Temps
CRUD complet + Génération intelligente basée sur les matières attribuées
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.annee_lock import verifier_annee_modifiable
from app.models.academique import (
    CreneauEmploi, Classe, Matiere, Enseignant, ClasseMatiere, Niveau
)

router = APIRouter(prefix="/api/emploi-du-temps", tags=["Emploi du Temps"])

JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]
HEURES_SLOTS = [
    ("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00"),
    ("14:00", "15:00"), ("15:00", "16:00"), ("16:00", "17:00"),
]


# ============================================================================
# CRUD CRÉNEAUX
# ============================================================================

@router.get("/classe/{classe_id}")
def get_emploi_du_temps(classe_id: int, db: Session = Depends(get_db)):
    """Retourne l'emploi du temps complet d'une classe sous forme de grille."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")

    creneaux = db.query(CreneauEmploi).filter(
        CreneauEmploi.classe_id == classe_id,
        CreneauEmploi.statut == "ACTIVE"
    ).all()

    result = []
    for c in creneaux:
        mat = db.query(Matiere).filter(Matiere.matiere_id == c.matiere_id).first()
        ens = None
        if c.enseignant_id:
            e = db.query(Enseignant).filter(Enseignant.enseignant_id == c.enseignant_id).first()
            if e:
                ens = {
                    "enseignant_id": e.enseignant_id,
                    "nom": e.nom, "prenom": e.prenom,
                    "specialite": e.specialite
                }
        result.append({
            "creneau_id": c.creneau_id,
            "classe_id": c.classe_id,
            "matiere_id": c.matiere_id,
            "matiere_code": mat.code if mat else "?",
            "matiere_libelle": mat.libelle if mat else "?",
            "matiere_categorie": mat.categorie if mat else None,
            "enseignant": ens,
            "jour": c.jour,
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "salle": c.salle,
        })

    return {
        "classe_id": classe.classe_id,
        "classe_libelle": classe.libelle,
        "nb_creneaux": len(result),
        "creneaux": result,
        "jours": JOURS,
        "heures_slots": HEURES_SLOTS,
    }


@router.post("", status_code=201)
def create_creneau(data: dict, db: Session = Depends(get_db)):
    """Créer un créneau horaire."""
    required = ["classe_id", "matiere_id", "jour", "heure_debut", "heure_fin"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis manquant: {f}")

    jour = data["jour"].upper()
    if jour not in JOURS:
        raise HTTPException(400, f"Jour invalide. Choix: {', '.join(JOURS)}")

    classe = db.query(Classe).filter(Classe.classe_id == data["classe_id"]).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    # Vérifier conflit horaire
    conflict = db.query(CreneauEmploi).filter(
        CreneauEmploi.classe_id == data["classe_id"],
        CreneauEmploi.jour == jour,
        CreneauEmploi.heure_debut == data["heure_debut"],
        CreneauEmploi.statut == "ACTIVE"
    ).first()
    if conflict:
        raise HTTPException(
            409,
            f"Conflit : un créneau existe déjà le {jour} à {data['heure_debut']} pour cette classe."
        )

    creneau = CreneauEmploi(
        classe_id=data["classe_id"],
        matiere_id=data["matiere_id"],
        enseignant_id=data.get("enseignant_id"),
        jour=jour,
        heure_debut=data["heure_debut"],
        heure_fin=data["heure_fin"],
        salle=data.get("salle", ""),
        annee_id=classe.annee_id if classe else data.get("annee_id", 1),
    )
    db.add(creneau)
    db.commit()
    db.refresh(creneau)

    return {"message": "Créneau créé avec succès", "creneau_id": creneau.creneau_id}


@router.put("/{creneau_id}")
def update_creneau(creneau_id: int, data: dict, db: Session = Depends(get_db)):
    """Modifier un créneau."""
    c = db.query(CreneauEmploi).filter(CreneauEmploi.creneau_id == creneau_id).first()
    if not c:
        raise HTTPException(404, "Créneau non trouvé")
    verifier_annee_modifiable(db, c.annee_id)

    if "jour" in data:
        jour = data["jour"].upper()
        if jour not in JOURS:
            raise HTTPException(400, f"Jour invalide")
        # Vérifier conflit si on change jour/heure
        hd = data.get("heure_debut", c.heure_debut)
        conflict = db.query(CreneauEmploi).filter(
            CreneauEmploi.classe_id == c.classe_id,
            CreneauEmploi.jour == jour,
            CreneauEmploi.heure_debut == hd,
            CreneauEmploi.creneau_id != creneau_id,
            CreneauEmploi.statut == "ACTIVE"
        ).first()
        if conflict:
            raise HTTPException(409, f"Conflit horaire le {jour} à {hd}")
        c.jour = jour

    if "heure_debut" in data:
        c.heure_debut = data["heure_debut"]
    if "heure_fin" in data:
        c.heure_fin = data["heure_fin"]
    if "matiere_id" in data:
        c.matiere_id = data["matiere_id"]
    if "enseignant_id" in data:
        c.enseignant_id = data["enseignant_id"]
    if "salle" in data:
        c.salle = data["salle"]

    db.commit()
    return {"message": "Créneau modifié avec succès"}


@router.delete("/{creneau_id}")
def delete_creneau(creneau_id: int, db: Session = Depends(get_db)):
    """Supprimer un créneau."""
    c = db.query(CreneauEmploi).filter(CreneauEmploi.creneau_id == creneau_id).first()
    if not c:
        raise HTTPException(404, "Créneau non trouvé")
    verifier_annee_modifiable(db, c.annee_id)
    db.delete(c)
    db.commit()
    return {"message": "Créneau supprimé"}


# ============================================================================
# GÉNÉRATION AUTOMATIQUE DE L'EMPLOI DU TEMPS
# ============================================================================

@router.post("/auto-generation/{classe_id}", status_code=201)
def auto_generer_emploi(classe_id: int, db: Session = Depends(get_db)):
    """
    Génère automatiquement un emploi du temps pour une classe
    en répartissant ses matières sur les créneaux de la semaine.
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    verifier_annee_modifiable(db, classe.annee_id)

    # Récupérer les matières de la classe
    associations = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.est_active == "O"
    ).all()

    if not associations:
        raise HTTPException(400, "Aucune matière attribuée à cette classe. Attribuez d'abord le programme.")

    # Supprimer l'ancien emploi du temps
    db.query(CreneauEmploi).filter(
        CreneauEmploi.classe_id == classe_id
    ).delete()

    # Construire la liste des créneaux nécessaires par matière
    slots_needed = []
    for assoc in associations:
        mat = db.query(Matiere).filter(Matiere.matiere_id == assoc.matiere_id).first()
        if not mat:
            continue
        nb = assoc.nb_heures_semaine or 1
        for _ in range(nb):
            slots_needed.append({
                "matiere_id": mat.matiere_id,
                "code": mat.code,
                "libelle": mat.libelle,
                "categorie": mat.categorie,
            })

    # Créneaux disponibles
    available_slots = []
    for jour in JOURS:
        for (hd, hf) in HEURES_SLOTS:
            available_slots.append((jour, hd, hf))

    # Répartir les matières
    created = 0
    slot_idx = 0
    for mat_info in slots_needed:
        if slot_idx >= len(available_slots):
            break  # Plus de créneaux disponibles

        jour, hd, hf = available_slots[slot_idx]
        creneau = CreneauEmploi(
            classe_id=classe_id,
            matiere_id=mat_info["matiere_id"],
            jour=jour,
            heure_debut=hd,
            heure_fin=hf,
            salle="",
            annee_id=1,
        )
        db.add(creneau)
        created += 1
        slot_idx += 1

    db.commit()

    return {
        "message": f"Emploi du temps généré : {created} créneaux créés pour {classe.libelle}.",
        "created": created,
        "total_slots_available": len(available_slots),
        "matieres_heures_total": len(slots_needed),
    }


@router.get("/stats")
def get_emploi_stats(db: Session = Depends(get_db)):
    """Statistiques globales sur les emplois du temps."""
    total_creneaux = db.query(CreneauEmploi).filter(CreneauEmploi.statut == "ACTIVE").count()
    classes_avec = db.query(CreneauEmploi.classe_id).distinct().count()
    classes_total = db.query(Classe).filter(Classe.statut == "ACTIVE").count()

    return {
        "total_creneaux": total_creneaux,
        "classes_avec_emploi": classes_avec,
        "classes_total": classes_total,
    }
