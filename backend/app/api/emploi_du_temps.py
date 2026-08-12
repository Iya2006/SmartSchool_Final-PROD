"""
SMARTSCHOOL API — Emploi du Temps
CRUD complet + Génération intelligente basée sur les matières attribuées
"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.annee_lock import verifier_annee_modifiable
from app.core.auth import require_etablissement
from app.models.academique import (
    CreneauEmploi, Classe, Matiere, Enseignant, ClasseMatiere, Niveau, Affectation, Cycle,
    ParametreEtablissement,
)

router = APIRouter(prefix="/api/emploi-du-temps", tags=["Emploi du Temps"])


# ── Helpers d'isolation (Lot 9) ───────────────────────────────────────────
# CreneauEmploi est OWNERSHIP via sa Classe.

def _classe_ou_404(db: Session, classe_id: int, etablissement_id: int) -> Classe:
    c = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not c:
        raise HTTPException(404, "Classe non trouvée")
    return c


def _creneau_ou_404(db: Session, creneau_id: int, etablissement_id: int) -> CreneauEmploi:
    c = (
        db.query(CreneauEmploi)
        .join(Classe, Classe.classe_id == CreneauEmploi.classe_id)
        .filter(CreneauEmploi.creneau_id == creneau_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not c:
        raise HTTPException(404, "Créneau non trouvé")
    return c


def _verifier_matiere_et_enseignant(db: Session, matiere_id, enseignant_id, etablissement_id: int) -> None:
    """Matiere est OWNERSHIP via Cycle ; Enseignant a une colonne directe."""
    if matiere_id:
        ok = (
            db.query(Matiere.matiere_id)
            .join(Cycle, Cycle.cycle_id == Matiere.cycle_id)
            .filter(Matiere.matiere_id == matiere_id, Cycle.etablissement_id == etablissement_id)
            .first()
        )
        if not ok:
            raise HTTPException(404, "Matière non trouvée")
    if enseignant_id:
        ok = db.query(Enseignant.enseignant_id).filter(
            Enseignant.enseignant_id == enseignant_id,
            Enseignant.etablissement_id == etablissement_id,
        ).first()
        if not ok:
            raise HTTPException(404, "Enseignant non trouvé")

JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]

# Grille horaire par défaut — utilisée tant que l'établissement n'a rien
# configuré (voir _get_grille_horaire ci-dessous). Reproduit exactement
# l'ancien HEURES_SLOTS codé en dur + la pause déjeuner explicitée comme un
# segment PAUSE : comportement identique pour toute école n'ayant jamais
# ouvert la configuration, aucune régression visuelle.
GRILLE_HORAIRE_DEFAUT = [
    {"type": "COURS", "heure_debut": "08:00", "heure_fin": "09:00"},
    {"type": "COURS", "heure_debut": "09:00", "heure_fin": "10:00"},
    {"type": "COURS", "heure_debut": "10:00", "heure_fin": "11:00"},
    {"type": "COURS", "heure_debut": "11:00", "heure_fin": "12:00"},
    {"type": "PAUSE", "heure_debut": "12:00", "heure_fin": "14:00", "libelle": "Pause déjeuner"},
    {"type": "COURS", "heure_debut": "14:00", "heure_fin": "15:00"},
    {"type": "COURS", "heure_debut": "15:00", "heure_fin": "16:00"},
    {"type": "COURS", "heure_debut": "16:00", "heure_fin": "17:00"},
]


def _get_grille_horaire(db: Session, etablissement_id: int) -> list[dict]:
    """Grille horaire configurée par l'établissement (Paramètres > Emploi du
    temps), ou la grille par défaut si rien n'a encore été configuré.
    Stockée via le mécanisme générique existant (ParametreEtablissement,
    déjà utilisé pour NOTATION/FINANCE/CALENDRIER/THEME) — pas de nouvelle
    table, pas de nouvelle route d'écriture : la configuration se fait via
    PUT /api/parametrage/settings (categorie=EMPLOI_DU_TEMPS)."""
    p = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "EMPLOI_DU_TEMPS",
        ParametreEtablissement.cle == "grille_horaire",
    ).first()
    if not p:
        return GRILLE_HORAIRE_DEFAUT
    try:
        segments = json.loads(p.valeur)
        if not isinstance(segments, list) or not segments:
            return GRILLE_HORAIRE_DEFAUT
        return segments
    except (ValueError, TypeError):
        return GRILLE_HORAIRE_DEFAUT


# ============================================================================
# CRUD CRÉNEAUX
# ============================================================================

@router.get("/classe/{classe_id}")
def get_emploi_du_temps(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Retourne l'emploi du temps complet d'une classe sous forme de grille."""
    classe = _classe_ou_404(db, classe_id, etablissement_id)

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
        # Tous les segments (COURS + PAUSE) de la grille configurée par
        # l'établissement — le frontend construit les lignes de créneaux ET
        # les bandeaux de pause à partir de cette seule liste.
        "heures_slots": _get_grille_horaire(db, etablissement_id),
    }


@router.post("", status_code=201)
def create_creneau(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Créer un créneau horaire.

    Classe, matière et enseignant référencés sont vérifiés appartenir à
    l'établissement appelant (Lot 9) — avant, un créneau pouvait être posé
    dans l'emploi du temps d'une autre école, avec la matière et
    l'enseignant de n'importe quelle école.
    """
    required = ["classe_id", "matiere_id", "jour", "heure_debut", "heure_fin"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis manquant: {f}")

    jour = data["jour"].upper()
    if jour not in JOURS:
        raise HTTPException(400, f"Jour invalide. Choix: {', '.join(JOURS)}")

    classe = _classe_ou_404(db, data["classe_id"], etablissement_id)
    _verifier_matiere_et_enseignant(db, data.get("matiere_id"), data.get("enseignant_id"), etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)

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
        annee_id=classe.annee_id,
    )
    db.add(creneau)
    db.commit()
    db.refresh(creneau)

    return {"message": "Créneau créé avec succès", "creneau_id": creneau.creneau_id}


@router.put("/{creneau_id}")
def update_creneau(creneau_id: int, data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Modifier un créneau."""
    c = _creneau_ou_404(db, creneau_id, etablissement_id)
    _verifier_matiere_et_enseignant(db, data.get("matiere_id"), data.get("enseignant_id"), etablissement_id)
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
def delete_creneau(creneau_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Supprimer un créneau."""
    c = _creneau_ou_404(db, creneau_id, etablissement_id)
    verifier_annee_modifiable(db, c.annee_id)
    db.delete(c)
    db.commit()
    return {"message": "Créneau supprimé"}


# ============================================================================
# GÉNÉRATION AUTOMATIQUE DE L'EMPLOI DU TEMPS
# ============================================================================

@router.post("/auto-generation/{classe_id}", status_code=201)
def auto_generer_emploi(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Génère automatiquement un emploi du temps pour une classe
    en répartissant ses matières sur les créneaux de la semaine.

    Attention : cette route SUPPRIME l'emploi du temps existant de la classe
    avant de régénérer — sans la vérification d'établissement ajoutée au
    Lot 9, elle permettait d'effacer l'emploi du temps d'une autre école.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
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
        
        aff = db.query(Affectation).filter(
            Affectation.classe_id == classe_id,
            Affectation.matiere_id == mat.matiere_id,
            Affectation.statut == "ACTIVE"
        ).first()
        ens_id = aff.enseignant_id if aff else None

        nb = assoc.nb_heures_semaine or 1
        for _ in range(nb):
            slots_needed.append({
                "matiere_id": mat.matiere_id,
                "code": mat.code,
                "libelle": mat.libelle,
                "categorie": mat.categorie,
                "enseignant_id": ens_id,
            })

    # Créneaux disponibles — uniquement les segments COURS de la grille
    # configurée par l'établissement (les segments PAUSE ne reçoivent
    # jamais de créneau). Respecte donc les durées personnalisées définies
    # par l'admin (ex. un segment de 2h reste un seul créneau de 2h).
    grille = _get_grille_horaire(db, etablissement_id)
    available_slots = []
    for jour in JOURS:
        for segment in grille:
            if segment.get("type") == "COURS":
                available_slots.append((jour, segment["heure_debut"], segment["heure_fin"]))

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
            enseignant_id=mat_info["enseignant_id"],
            jour=jour,
            heure_debut=hd,
            heure_fin=hf,
            salle="",
            annee_id=classe.annee_id,
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
def get_emploi_stats(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Statistiques sur les emplois du temps POUR CET ÉTABLISSEMENT."""
    creneaux_etab = db.query(CreneauEmploi).join(
        Classe, Classe.classe_id == CreneauEmploi.classe_id
    ).filter(Classe.etablissement_id == etablissement_id)
    total_creneaux = creneaux_etab.filter(CreneauEmploi.statut == "ACTIVE").count()
    classes_avec = db.query(CreneauEmploi.classe_id).join(
        Classe, Classe.classe_id == CreneauEmploi.classe_id
    ).filter(Classe.etablissement_id == etablissement_id).distinct().count()
    classes_total = db.query(Classe).filter(
        Classe.statut == "ACTIVE", Classe.etablissement_id == etablissement_id
    ).count()

    return {
        "total_creneaux": total_creneaux,
        "classes_avec_emploi": classes_avec,
        "classes_total": classes_total,
    }
