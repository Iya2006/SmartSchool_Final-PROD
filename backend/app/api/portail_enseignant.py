"""
SMARTSCHOOL API — Portail Enseignant
Dashboard: emploi du temps, classes, eleves, notes, absences
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password, hash_password
from app.core.auth import get_current_user
from app.models.academique import (
    Enseignant, Affectation, CreneauEmploi, Classe, Matiere, Niveau,
    Note, Evaluation, Inscription, Eleve, Presence, Trimestre, TypeEvaluation,
    AnneeScolaire, RessourcePedagogique
)

router = APIRouter(prefix="/api/portail-enseignant", tags=["Portail Enseignant"])


# ── Dépendance de sécurité : ownership check ───────────────────────────────────────
async def _enseignant_auth(
    enseignant_id: int,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Vérifie que le token JWT appartient à cet enseignant (ou à un admin).
    Protège contre l'OWASP Broken Access Control sur le portail enseignant.
    """
    role = current_user.get("role", "")
    token_type = current_user.get("type", "")
    # Admins peuvent accéder à toutes les données
    if role in {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "INFORMATICIEN"}:
        return current_user
    # Portail enseignant : le token doit correspondre à l'enseignant_id demandé
    if token_type == "enseignant" and str(current_user.get("sub", "")) == str(enseignant_id):
        return current_user
    raise HTTPException(
        status_code=403,
        detail="Accès refusé : vous ne pouvez consulter que vos propres données",
    )


# ── Schémas ──
class ChangePasswordRequest(BaseModel):
    ancien_mdp: Optional[str] = None
    nouveau_mdp: str


# ================================================================
# CHANGER MOT DE PASSE ENSEIGNANT
# ================================================================
@router.put("/{enseignant_id}/changer-mot-de-passe")
def changer_mot_de_passe(enseignant_id: int, data: ChangePasswordRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Permet à l'enseignant de changer son mot de passe."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    # Vérifier l'ancien mot de passe si existant
    if ens.mot_de_passe:
        if not data.ancien_mdp:
            raise HTTPException(400, "L'ancien mot de passe est requis")
        if not verify_password(data.ancien_mdp, ens.mot_de_passe):
            raise HTTPException(401, "Ancien mot de passe incorrect")

    # Validation du nouveau
    if len(data.nouveau_mdp) < 6:
        raise HTTPException(400, "Le nouveau mot de passe doit faire au moins 6 caractères")

    ens.mot_de_passe = hash_password(data.nouveau_mdp)
    db.commit()
    return {"message": "Mot de passe modifié avec succès"}


# ================================================================
# RÉFÉRENTIELS (Trimestres + Types d'évaluation)
# ================================================================
@router.get("/referentiels/trimestres")
def get_trimestres(db: Session = Depends(get_db)):
    """Liste des trimestres de l'année courante."""
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.est_courante == "O").first()
    if not annee:
        return []
    trimestres = db.query(Trimestre).filter(
        Trimestre.annee_id == annee.annee_id
    ).order_by(Trimestre.numero).all()
    return [{"trimestre_id": t.trimestre_id, "code": t.code, "libelle": t.libelle,
             "numero": t.numero, "date_debut": str(t.date_debut), "date_fin": str(t.date_fin),
             "statut": t.statut} for t in trimestres]


@router.get("/referentiels/types-evaluation")
def get_types_evaluation(db: Session = Depends(get_db)):
    """Liste des types d'évaluation actifs."""
    types = db.query(TypeEvaluation).filter(TypeEvaluation.statut == "ACTIF").all()
    return [{"type_eval_id": t.type_eval_id, "code": t.code, "libelle": t.libelle,
             "poids_pourcentage": float(t.poids_pourcentage)} for t in types]


# ================================================================
# HISTORIQUE DES ÉVALUATIONS
# ================================================================
@router.get("/{enseignant_id}/evaluations")
def get_evaluations(enseignant_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Historique des évaluations créées par cet enseignant."""
    evals = db.query(Evaluation).filter(
        Evaluation.enseignant_id == enseignant_id
    ).order_by(desc(Evaluation.date_evaluation)).limit(50).all()
    result = []
    for ev in evals:
        mat = db.query(Matiere).filter(Matiere.matiere_id == ev.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
        tri = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
        nb_notes = db.query(func.count(Note.note_id)).filter(Note.evaluation_id == ev.evaluation_id).scalar() or 0
        moy = db.query(func.avg(Note.valeur)).filter(
            Note.evaluation_id == ev.evaluation_id, Note.est_absent == "N"
        ).scalar()
        result.append({
            "evaluation_id": ev.evaluation_id,
            "libelle": ev.libelle,
            "date_evaluation": str(ev.date_evaluation) if ev.date_evaluation else None,
            "matiere": mat.libelle if mat else "?",
            "classe": cls.libelle if cls else "?",
            "trimestre": tri.libelle if tri else "?",
            "note_sur": float(ev.note_sur or 20),
            "coefficient": float(ev.coefficient or 1),
            "nb_notes": nb_notes,
            "moyenne": round(float(moy), 2) if moy else None,
            "statut": ev.statut,
        })
    return result


# ================================================================
# HISTORIQUE DES APPELS
# ================================================================
@router.get("/{enseignant_id}/historique-appels")
def get_historique_appels(enseignant_id: int, classe_id: int = None, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Historique des appels faits par cet enseignant (via ses classes)."""
    from datetime import date, timedelta

    # Get classes where this teacher is assigned
    aff_query = db.query(Affectation.classe_id).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.statut == "ACTIVE"
    )
    if classe_id:
        aff_query = aff_query.filter(Affectation.classe_id == classe_id)
    classe_ids = [r[0] for r in aff_query.distinct().all()]

    if not classe_ids:
        return []

    # Get inscriptions in those classes
    inscriptions = db.query(Inscription.inscription_id, Inscription.classe_id).filter(
        Inscription.classe_id.in_(classe_ids),
        Inscription.statut == "ACTIVE"
    ).all()
    insc_ids = [i.inscription_id for i in inscriptions]
    insc_to_classe = {i.inscription_id: i.classe_id for i in inscriptions}

    if not insc_ids:
        return []

    # Get presences from last 30 days
    since = date.today() - timedelta(days=30)
    presences = db.query(Presence).filter(
        Presence.inscription_id.in_(insc_ids),
        Presence.date_presence >= since
    ).order_by(desc(Presence.date_presence)).all()

    # Group by date + classe + demi_journee
    from collections import defaultdict
    groups = defaultdict(lambda: {"presents": 0, "absents": 0, "retards": 0, "total": 0})
    for p in presences:
        cid = insc_to_classe.get(p.inscription_id, 0)
        key = f"{p.date_presence}|{cid}|{p.demi_journee}"
        groups[key]["total"] += 1
        if p.statut_presence == "PRESENT":
            groups[key]["presents"] += 1
        elif p.statut_presence in ("ABSENT", "ABSENT_JUSTIFIE"):
            groups[key]["absents"] += 1
        elif p.statut_presence == "RETARD":
            groups[key]["retards"] += 1

    result = []
    for key, stats in sorted(groups.items(), reverse=True):
        date_str, cid_str, dj = key.split("|")
        cls = db.query(Classe).filter(Classe.classe_id == int(cid_str)).first()
        result.append({
            "date": date_str,
            "classe": cls.libelle if cls else "?",
            "classe_id": int(cid_str),
            "demi_journee": dj,
            **stats,
        })
    return result


# ================================================================
# NOTE : Le login de l'enseignant se fait via /api/auth/login (JWT unifié).
# L'ancien endpoint POST /login (sans JWT, sans hash cohérent) a été retiré
# car il n'était plus utilisé par le frontend et exposait les données d'un
# enseignant à partir de son seul numéro de téléphone.
# ================================================================
# DASHBOARD ENSEIGNANT
# ================================================================
@router.get("/{enseignant_id}/dashboard")
def enseignant_dashboard(enseignant_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Dashboard complet de l'enseignant."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    # Get affectations (classes + matieres)
    affectations = db.query(
        Affectation.affectation_id,
        Affectation.nb_heures_semaine,
        Classe.classe_id,
        Classe.code.label("classe_code"),
        Classe.libelle.label("classe_libelle"),
        Classe.effectif_actuel.label("effectif"),
        Matiere.matiere_id,
        Matiere.libelle.label("matiere"),
        Matiere.coefficient_defaut.label("coefficient"),
        Niveau.libelle.label("niveau"),
    ).join(Classe, Affectation.classe_id == Classe.classe_id
    ).join(Matiere, Affectation.matiere_id == Matiere.matiere_id
    ).join(Niveau, Classe.niveau_id == Niveau.niveau_id
    ).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.statut == "ACTIVE"
    ).all()

    classes_data = []
    total_heures = 0
    total_eleves = 0
    classes_set = set()

    for a in affectations:
        heures = float(a.nb_heures_semaine or 0)
        total_heures += heures
        eff = a.effectif or 0
        if a.classe_id not in classes_set:
            total_eleves += eff
            classes_set.add(a.classe_id)

        # Count notes given for this class+matiere
        nb_notes = db.query(func.count(Note.note_id)).join(
            Evaluation, Note.evaluation_id == Evaluation.evaluation_id
        ).join(
            Inscription, Note.inscription_id == Inscription.inscription_id
        ).filter(
            Evaluation.matiere_id == a.matiere_id,
            Inscription.classe_id == a.classe_id,
            Inscription.statut == "ACTIVE"
        ).scalar() or 0

        classes_data.append({
            "affectation_id": a.affectation_id,
            "classe_id": a.classe_id,
            "classe_code": a.classe_code,
            "classe": a.classe_libelle,
            "niveau": a.niveau,
            "matiere_id": a.matiere_id,
            "matiere": a.matiere,
            "coefficient": float(a.coefficient or 1),
            "heures_semaine": heures,
            "effectif": eff,
            "nb_notes": nb_notes,
        })

    # Get schedule count
    nb_creneaux = db.query(func.count(CreneauEmploi.creneau_id)).filter(
        CreneauEmploi.enseignant_id == enseignant_id,
        CreneauEmploi.statut == "ACTIVE"
    ).scalar() or 0

    return {
        "enseignant": {
            "enseignant_id": ens.enseignant_id,
            "nom": ens.nom,
            "prenom": ens.prenom,
            "matricule": ens.matricule,
            "telephone": ens.telephone,
            "email": ens.email,
            "specialite": ens.specialite,
            "diplome": ens.diplome_plus_eleve,
            "type_contrat": ens.type_contrat,
            "date_embauche": str(ens.date_embauche) if ens.date_embauche else None,
            "statut": ens.statut,
            "photo_url": ens.photo_url,
            "sexe": ens.sexe,
            "date_naissance": str(ens.date_naissance) if ens.date_naissance else None,
            "lieu_naissance": getattr(ens, 'lieu_naissance', None),
            "adresse": getattr(ens, 'adresse', None),
            "nom_urgence": getattr(ens, 'nom_urgence', None),
            "telephone_urgence": getattr(ens, 'telephone_urgence', None),
        },
        "affectations": classes_data,
        "stats": {
            "nb_classes": len(classes_set),
            "nb_matieres": len(set(a.matiere_id for a in affectations)),
            "total_heures": total_heures,
            "total_eleves": total_eleves,
            "nb_creneaux": nb_creneaux,
        }
    }


# ================================================================
# EMPLOI DU TEMPS ENSEIGNANT
# ================================================================
@router.get("/{enseignant_id}/emploi-du-temps")
def get_edt_enseignant(enseignant_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Emploi du temps personnel de l'enseignant."""
    creneaux = db.query(CreneauEmploi).filter(
        CreneauEmploi.enseignant_id == enseignant_id,
        CreneauEmploi.statut == "ACTIVE"
    ).order_by(CreneauEmploi.jour, CreneauEmploi.heure_debut).all()

    result = []
    for c in creneaux:
        mat = db.query(Matiere).filter(Matiere.matiere_id == c.matiere_id).first()
        cl = db.query(Classe).filter(Classe.classe_id == c.classe_id).first()
        result.append({
            "jour": c.jour,
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "matiere": mat.libelle if mat else "?",
            "classe": cl.libelle if cl else "?",
            "classe_code": cl.code if cl else "?",
            "salle": c.salle,
        })
    return result


# ================================================================
# ÉLÈVES D'UNE CLASSE (pour saisie notes / absences)
# ================================================================
@router.get("/{enseignant_id}/classe/{classe_id}/eleves")
def get_eleves_classe(enseignant_id: int, classe_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Liste des élèves d'une classe avec notes et absences."""
    # Verify teacher is assigned to this class
    aff = db.query(Affectation).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.classe_id == classe_id,
        Affectation.statut == "ACTIVE"
    ).first()
    if not aff:
        raise HTTPException(403, "Vous n'êtes pas affecté à cette classe")

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()

    eleves = []
    for insc in inscriptions:
        eleve = db.query(Eleve).filter(Eleve.eleve_id == insc.eleve_id).first()
        if not eleve:
            continue

        # Get notes for this student in teacher's subject
        notes = db.query(
            Note.valeur, Note.est_absent,
            Evaluation.libelle.label("eval_libelle"),
            Evaluation.note_sur, Evaluation.date_evaluation,
        ).join(Evaluation, Note.evaluation_id == Evaluation.evaluation_id
        ).filter(
            Note.inscription_id == insc.inscription_id,
            Evaluation.matiere_id == aff.matiere_id,
        ).order_by(desc(Evaluation.date_evaluation)).all()

        notes_data = [{
            "note": float(n.valeur) if n.valeur else None,
            "note_sur": float(n.note_sur) if n.note_sur else 20,
            "evaluation": n.eval_libelle,
            "est_absent": n.est_absent == "O",
            "date": str(n.date_evaluation) if n.date_evaluation else None,
        } for n in notes]

        # Calculate average
        valid = [n for n in notes_data if n["note"] is not None and not n["est_absent"]]
        moyenne = round(sum(n["note"] for n in valid) / len(valid), 2) if valid else None

        # Absences count
        nb_absences = db.query(func.count(Presence.presence_id)).filter(
            Presence.inscription_id == insc.inscription_id,
            Presence.statut_presence.in_(["ABSENT", "ABSENT_JUSTIFIE"])
        ).scalar() or 0

        eleves.append({
            "eleve_id": eleve.eleve_id,
            "inscription_id": insc.inscription_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "sexe": eleve.sexe,
            "notes": notes_data,
            "moyenne": moyenne,
            "nb_notes": len(notes_data),
            "nb_absences": nb_absences,
        })

    eleves.sort(key=lambda x: (x["nom"], x["prenom"]))
    return eleves


# ================================================================
# SAISIE DE L'APPEL (PRESENCES)
# ================================================================
class PresenceItem(BaseModel):
    inscription_id: int
    statut: str  # PRESENT, ABSENT, RETARD

class AppelRequest(BaseModel):
    classe_id: int
    demi_journee: str  # MATIN ou APRES_MIDI
    presences: list[PresenceItem]


@router.post("/{enseignant_id}/presences")
def enregistrer_appel(enseignant_id: int, data: AppelRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Enregistrer l'appel pour une classe (bulk upsert)."""
    # Vérifier que l'enseignant est affecté à cette classe
    aff = db.query(Affectation).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.classe_id == data.classe_id,
        Affectation.statut == "ACTIVE"
    ).first()
    if not aff:
        raise HTTPException(403, "Vous n'êtes pas affecté à cette classe")

    from datetime import date
    today = date.today()
    created = 0
    updated = 0

    for p in data.presences:
        # Vérifier si une présence existe déjà pour cet élève aujourd'hui
        existing = db.query(Presence).filter(
            Presence.inscription_id == p.inscription_id,
            Presence.date_presence == today,
            Presence.demi_journee == data.demi_journee,
        ).first()

        if existing:
            existing.statut_presence = p.statut
            updated += 1
        else:
            new_presence = Presence(
                inscription_id=p.inscription_id,
                date_presence=today,
                demi_journee=data.demi_journee,
                statut_presence=p.statut,
                est_justifie="N",
            )
            db.add(new_presence)
            created += 1

    db.commit()
    return {
        "message": f"Appel enregistré: {created} créés, {updated} mis à jour",
        "date": str(today),
        "total": len(data.presences),
    }


# ================================================================
# SAISIE DES NOTES (créer évaluation + sauvegarder notes)
# ================================================================
class NoteItem(BaseModel):
    inscription_id: int
    valeur: Optional[float] = None
    est_absent: bool = False

class SaisieNotesRequest(BaseModel):
    classe_id: int
    matiere_id: int
    trimestre_id: Optional[int] = None
    type_evaluation_id: Optional[int] = None
    libelle: str  # ex: "Devoir 1", "Interrogation 2"
    note_sur: float = 20
    coefficient: float = 1
    notes: list[NoteItem]


@router.post("/{enseignant_id}/notes")
def saisir_notes(enseignant_id: int, data: SaisieNotesRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Créer une évaluation et sauvegarder toutes les notes en une seule opération."""
    # Vérifier affectation
    aff = db.query(Affectation).filter(
        Affectation.enseignant_id == enseignant_id,
        Affectation.classe_id == data.classe_id,
        Affectation.matiere_id == data.matiere_id,
        Affectation.statut == "ACTIVE"
    ).first()
    if not aff:
        raise HTTPException(403, "Vous n'êtes pas affecté à cette classe/matière")

    from datetime import date

    # 1. Créer l'évaluation
    evaluation = Evaluation(
        classe_id=data.classe_id,
        matiere_id=data.matiere_id,
        enseignant_id=enseignant_id,
        trimestre_id=data.trimestre_id or 1,
        type_eval_id=data.type_evaluation_id or 1,
        libelle=data.libelle,
        date_evaluation=date.today(),
        note_sur=data.note_sur,
        coefficient=data.coefficient,
        statut="PUBLIEE",
    )
    db.add(evaluation)
    db.flush()  # Pour obtenir l'evaluation_id

    # 2. Sauvegarder les notes
    count = 0
    for n in data.notes:
        note = Note(
            evaluation_id=evaluation.evaluation_id,
            inscription_id=n.inscription_id,
            valeur=n.valeur if not n.est_absent else None,
            est_absent="O" if n.est_absent else "N",
        )
        db.add(note)
        count += 1

    db.commit()
    return {
        "message": f"Évaluation '{data.libelle}' créée avec {count} notes",
        "evaluation_id": evaluation.evaluation_id,
        "nb_notes": count,
    }


# ================================================================
# DÉTAIL D'UNE ÉVALUATION (liste des notes, stats)
# ================================================================
@router.get("/{enseignant_id}/evaluations/{evaluation_id}/notes")
def get_detail_evaluation(enseignant_id: int, evaluation_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Retourne toutes les notes d'une évaluation avec stats détaillées."""
    ev = db.query(Evaluation).filter(
        Evaluation.evaluation_id == evaluation_id,
        Evaluation.enseignant_id == enseignant_id
    ).first()
    if not ev:
        raise HTTPException(404, "Évaluation non trouvée ou non autorisée")

    mat = db.query(Matiere).filter(Matiere.matiere_id == ev.matiere_id).first()
    cls = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    tri = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
    type_ev = db.query(TypeEvaluation).filter(TypeEvaluation.type_eval_id == ev.type_eval_id).first()

    # Notes avec info élève
    notes_query = db.query(
        Note.note_id,
        Note.inscription_id,
        Note.valeur,
        Note.est_absent,
        Note.observation,
        Eleve.eleve_id,
        Eleve.nom,
        Eleve.prenom,
        Eleve.matricule,
        Eleve.sexe,
    ).join(
        Inscription, Note.inscription_id == Inscription.inscription_id
    ).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Note.evaluation_id == evaluation_id
    ).order_by(Eleve.nom, Eleve.prenom).all()

    notes_list = []
    valid_notes = []
    nb_absents = 0

    for n in notes_query:
        val = float(n.valeur) if n.valeur else None
        is_absent = n.est_absent == "O"
        if is_absent:
            nb_absents += 1
        elif val is not None:
            valid_notes.append(val)

        notes_list.append({
            "note_id": n.note_id,
            "inscription_id": n.inscription_id,
            "eleve_id": n.eleve_id,
            "nom": n.nom,
            "prenom": n.prenom,
            "matricule": n.matricule,
            "sexe": n.sexe,
            "valeur": val,
            "est_absent": is_absent,
            "observation": n.observation,
        })

    # Stats
    moyenne = round(sum(valid_notes) / len(valid_notes), 2) if valid_notes else None
    note_min = min(valid_notes) if valid_notes else None
    note_max = max(valid_notes) if valid_notes else None

    return {
        "evaluation": {
            "evaluation_id": ev.evaluation_id,
            "libelle": ev.libelle,
            "date_evaluation": str(ev.date_evaluation) if ev.date_evaluation else None,
            "matiere": mat.libelle if mat else "?",
            "matiere_id": ev.matiere_id,
            "classe": cls.libelle if cls else "?",
            "classe_id": ev.classe_id,
            "trimestre": tri.libelle if tri else "?",
            "trimestre_id": ev.trimestre_id,
            "type_evaluation": type_ev.libelle if type_ev else "?",
            "note_sur": float(ev.note_sur or 20),
            "coefficient": float(ev.coefficient or 1),
            "statut": ev.statut,
        },
        "notes": notes_list,
        "stats": {
            "total_eleves": len(notes_list),
            "nb_notes_saisies": len(valid_notes),
            "nb_absents": nb_absents,
            "moyenne": moyenne,
            "note_min": note_min,
            "note_max": note_max,
        }
    }


# ================================================================
# MODIFICATION DES NOTES EN BATCH (enseignant)
# ================================================================
class NoteUpdateItem(BaseModel):
    note_id: int
    valeur: Optional[float] = None
    est_absent: bool = False
    observation: Optional[str] = None

class BatchNotesUpdateRequest(BaseModel):
    notes: list[NoteUpdateItem]


@router.put("/{enseignant_id}/evaluations/{evaluation_id}/notes")
def update_notes_batch_enseignant(
    enseignant_id: int, evaluation_id: int,
    data: BatchNotesUpdateRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)
):
    """Modifier les notes d'une évaluation en batch (enseignant)."""
    ev = db.query(Evaluation).filter(
        Evaluation.evaluation_id == evaluation_id,
        Evaluation.enseignant_id == enseignant_id
    ).first()
    if not ev:
        raise HTTPException(404, "Évaluation non trouvée ou non autorisée")

    if ev.statut == "CENTRALISEE":
        raise HTTPException(400, "Cette évaluation a déjà été centralisée. Contactez l'administrateur.")

    updated = 0
    for item in data.notes:
        note = db.query(Note).filter(
            Note.note_id == item.note_id,
            Note.evaluation_id == evaluation_id
        ).first()
        if note:
            note.valeur = item.valeur if not item.est_absent else None
            note.est_absent = "O" if item.est_absent else "N"
            note.observation = item.observation
            updated += 1

    db.commit()

    # Recalculer stats
    valid = db.query(Note.valeur).filter(
        Note.evaluation_id == evaluation_id,
        Note.est_absent == "N",
        Note.valeur.isnot(None)
    ).all()
    vals = [float(v[0]) for v in valid]
    moy = round(sum(vals) / len(vals), 2) if vals else None

    return {
        "message": f"{updated} notes mises à jour",
        "moyenne": moy,
        "nb_modifiees": updated,
    }


# ================================================================
# CENTRALISER UNE ÉVALUATION (envoi vers admin)
# ================================================================
@router.put("/{enseignant_id}/evaluations/{evaluation_id}/centraliser")
def centraliser_evaluation(enseignant_id: int, evaluation_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    """Change le statut de l'évaluation à CENTRALISEE — l'admin peut maintenant la voir."""
    ev = db.query(Evaluation).filter(
        Evaluation.evaluation_id == evaluation_id,
        Evaluation.enseignant_id == enseignant_id
    ).first()
    if not ev:
        raise HTTPException(404, "Évaluation non trouvée ou non autorisée")

    if ev.statut == "CENTRALISEE":
        return {"message": "Cette évaluation est déjà centralisée", "statut": "CENTRALISEE"}

    # Vérifier qu'il y a au moins 1 note saisie
    nb_notes = db.query(func.count(Note.note_id)).filter(
        Note.evaluation_id == evaluation_id,
        Note.est_absent == "N",
        Note.valeur.isnot(None)
    ).scalar() or 0
    if nb_notes == 0:
        raise HTTPException(400, "Impossible de centraliser sans aucune note saisie")

    ev.statut = "CENTRALISEE"
    db.commit()

    mat = db.query(Matiere).filter(Matiere.matiere_id == ev.matiere_id).first()
    cls = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()

    return {
        "message": f"✅ Évaluation '{ev.libelle}' centralisée avec succès ({nb_notes} notes)",
        "evaluation_id": ev.evaluation_id,
        "matiere": mat.libelle if mat else "?",
        "classe": cls.libelle if cls else "?",
        "statut": "CENTRALISEE",
    }


# ================================================================
# RESSOURCES PÉDAGOGIQUES (LIENS ET DOCUMENTS)
# ================================================================

class RessourceCreate(BaseModel):
    titre: str
    description: Optional[str] = None
    url: str
    type_ressource: str = "LIEN"
    categorie: str = "AUTRE"

@router.get("/{enseignant_id}/ressources")
def get_ressources_enseignant(enseignant_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    from app.models.academique import RessourcePedagogique
    res = db.query(RessourcePedagogique).filter(RessourcePedagogique.enseignant_id == enseignant_id).order_by(desc(RessourcePedagogique.date_creation)).all()
    return [{
        "ressource_id": r.ressource_id,
        "titre": r.titre,
        "description": r.description,
        "url": r.url,
        "type": r.type_ressource,
        "categorie": r.categorie,
        "date": r.date_creation.strftime("%d/%m/%Y") if r.date_creation else None,
    } for r in res]

@router.post("/{enseignant_id}/ressources")
def create_ressource_enseignant(enseignant_id: int, data: RessourceCreate, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    from app.models.academique import RessourcePedagogique, Enseignant
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens: raise HTTPException(404, "Enseignant non trouvé")
    
    nouvelle_ressource = RessourcePedagogique(
        enseignant_id=enseignant_id,
        etablissement_id=ens.etablissement_id,
        titre=data.titre,
        description=data.description,
        url=data.url,
        type_ressource=data.type_ressource,
        categorie=data.categorie
    )
    db.add(nouvelle_ressource)
    db.commit()
    db.refresh(nouvelle_ressource)
    return {"message": "Ressource ajoutée avec succès", "ressource_id": nouvelle_ressource.ressource_id}

@router.delete("/{enseignant_id}/ressources/{ressource_id}")
def delete_ressource_enseignant(enseignant_id: int, ressource_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    from app.models.academique import RessourcePedagogique
    r = db.query(RessourcePedagogique).filter(RessourcePedagogique.ressource_id == ressource_id, RessourcePedagogique.enseignant_id == enseignant_id).first()
    if not r: raise HTTPException(404, "Ressource introuvable")
    db.delete(r)
    db.commit()
    return {"message": "Ressource supprimée"}

