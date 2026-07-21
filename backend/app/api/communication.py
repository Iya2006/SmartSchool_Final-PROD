"""
SMARTSCHOOL API — Communication & Demandes d'Emploi du Temps
Système de messagerie Admin <-> Enseignants + Collecte de disponibilités
+ Génération automatique d'emplois du temps basée sur les disponibilités validées
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from typing import Optional
from datetime import datetime
import json

from app.core.database import get_db
from app.models.academique import (
    Message, DemandeEmploi, Disponibilite, Enseignant,
    Classe, ClasseMatiere, Matiere, Affectation, CreneauEmploi,
    SujetExamen, Parent, EleveParent, Eleve, Inscription
)

router = APIRouter(prefix="/api/communication", tags=["Communication"])

JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]
HEURES_SLOTS = [
    ("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00"),
    ("14:00", "15:00"), ("15:00", "16:00"), ("16:00", "17:00"),
]
OBJET_TYPES = ["EMPLOI", "DISCIPLINE", "GENERAL", "REUNION", "EXAMENS"]


# ============================================================================
# MESSAGES
# ============================================================================

@router.get("/messages")
def list_messages(
    role: str = "ADMIN",
    enseignant_id: Optional[int] = None,
    objet_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Liste les messages selon le rôle (ADMIN ou ENSEIGNANT)."""
    q = db.query(Message)

    if role == "ADMIN":
        q = q.filter(or_(
            Message.expediteur_type == "ADMIN",
            Message.destinataire_type == "ADMIN"
        ))
    elif role == "ENSEIGNANT" and enseignant_id:
        q = q.filter(or_(
            Message.expediteur_id == enseignant_id,
            Message.destinataire_type == "TOUS_ENSEIGNANTS",
            Message.destinataire_id == enseignant_id,
        ))

    if objet_type:
        q = q.filter(Message.objet_type == objet_type)

    msgs = q.order_by(desc(Message.date_envoi)).limit(100).all()

    result = []
    for m in msgs:
        exp_name = "Administration"
        if m.expediteur_type == "ENSEIGNANT" and m.expediteur_id:
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == m.expediteur_id).first()
            if ens:
                exp_name = f"{ens.prenom} {ens.nom}"

        result.append({
            "message_id": m.message_id,
            "demande_id": m.demande_id,
            "expediteur_type": m.expediteur_type,
            "expediteur_id": m.expediteur_id,
            "expediteur_nom": exp_name,
            "destinataire_type": m.destinataire_type,
            "destinataire_id": m.destinataire_id,
            "objet_type": m.objet_type,
            "sujet": m.sujet,
            "contenu": m.contenu,
            "parent_message_id": m.parent_message_id,
            "statut": m.statut,
            "date_envoi": m.date_envoi.isoformat() if m.date_envoi else None,
            "date_lecture": m.date_lecture.isoformat() if m.date_lecture else None,
        })

    return result


@router.post("/messages", status_code=201)
def send_message(data: dict, db: Session = Depends(get_db)):
    """Envoyer un message (Admin ou Enseignant)."""
    required = ["expediteur_type", "destinataire_type", "sujet"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis: {f}")

    msg = Message(
        demande_id=data.get("demande_id"),
        expediteur_type=data["expediteur_type"],
        expediteur_id=data.get("expediteur_id"),
        destinataire_type=data["destinataire_type"],
        destinataire_id=data.get("destinataire_id"),
        objet_type=data.get("objet_type", "GENERAL"),
        sujet=data["sujet"],
        contenu=data.get("contenu", ""),
        parent_message_id=data.get("parent_message_id"),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"message": "Message envoyé", "message_id": msg.message_id}


@router.put("/messages/marquer-tous-lus")
def marquer_tous_lus(db: Session = Depends(get_db)):
    """Marquer tous les messages non lus destinés à l'admin comme lus."""
    count = db.query(Message).filter(
        Message.statut == "ENVOYE",
        Message.expediteur_type != "ADMIN"
    ).update({"statut": "LU", "date_lecture": datetime.now()})
    db.commit()
    return {"marked": count}


@router.put("/messages/{message_id}/lire")
def marquer_lu(message_id: int, db: Session = Depends(get_db)):
    """Marquer un message comme lu."""
    m = db.query(Message).filter(Message.message_id == message_id).first()
    if not m:
        raise HTTPException(404, "Message not found")
    m.statut = "LU"
    m.date_lecture = datetime.now()
    db.commit()
    return {"message": "Message marqué comme lu"}


# ============================================================================
# DEMANDES D'EMPLOI DU TEMPS
# ============================================================================

@router.get("/demandes")
def list_demandes(db: Session = Depends(get_db)):
    """Liste toutes les demandes de disponibilité / examens."""
    demandes = db.query(DemandeEmploi).order_by(desc(DemandeEmploi.date_creation)).all()
    result = []
    for d in demandes:
        if d.objet_type == "EXAMENS":
            # Count sujets for EXAMENS type
            sujets_q = db.query(SujetExamen).filter(SujetExamen.demande_id == d.demande_id)
            nb_sujets = sujets_q.count()
            nb_sujets_envoyes = sujets_q.filter(SujetExamen.statut.in_(["ENVOYE", "VALIDE"])).count()
            nb_sujets_valides = sujets_q.filter(SujetExamen.statut == "VALIDE").count()
            ens_uniques = db.query(SujetExamen.enseignant_id).filter(
                SujetExamen.demande_id == d.demande_id,
                SujetExamen.statut.in_(["ENVOYE", "VALIDE", "REJETE"])
            ).distinct().count()
            result.append({
                "demande_id": d.demande_id,
                "titre": d.titre,
                "description": d.description,
                "objet_type": d.objet_type,
                "classes_concernees": d.classes_concernees,
                "trimestre": getattr(d, 'trimestre', None),
                "statut": d.statut,
                "date_creation": d.date_creation.isoformat() if d.date_creation else None,
                "date_cloture": d.date_cloture.isoformat() if d.date_cloture else None,
                "nb_disponibilites": nb_sujets,
                "nb_validees": nb_sujets_valides,
                "nb_enseignants_repondu": ens_uniques,
                "nb_sujets_envoyes": nb_sujets_envoyes,
            })
        else:
            # Count disponibilités for EMPLOI and other types
            nb_dispos = db.query(Disponibilite).filter(Disponibilite.demande_id == d.demande_id).count()
            nb_validees = db.query(Disponibilite).filter(
                Disponibilite.demande_id == d.demande_id, Disponibilite.statut == "VALIDEE"
            ).count()
            ens_uniques = db.query(Disponibilite.enseignant_id).filter(
                Disponibilite.demande_id == d.demande_id
            ).distinct().count()
            result.append({
                "demande_id": d.demande_id,
                "titre": d.titre,
                "description": d.description,
                "objet_type": d.objet_type,
                "classes_concernees": d.classes_concernees,
                "trimestre": getattr(d, 'trimestre', None),
                "statut": d.statut,
                "date_creation": d.date_creation.isoformat() if d.date_creation else None,
                "date_cloture": d.date_cloture.isoformat() if d.date_cloture else None,
                "nb_disponibilites": nb_dispos,
                "nb_validees": nb_validees,
                "nb_enseignants_repondu": ens_uniques,
            })
    return result


@router.post("/demandes", status_code=201)
def creer_demande(data: dict, db: Session = Depends(get_db)):
    """
    Créer une demande de collecte de disponibilité.
    Envoie automatiquement un message à tous les enseignants.
    """
    if "titre" not in data:
        raise HTTPException(400, "Titre requis")

    classes_str = data.get("classes_concernees", "TOUTES")
    if isinstance(classes_str, list):
        classes_str = json.dumps(classes_str)

    demande = DemandeEmploi(
        titre=data["titre"],
        description=data.get("description", ""),
        objet_type=data.get("objet_type", "EMPLOI"),
        classes_concernees=classes_str,
        trimestre=data.get("trimestre"),
    )
    db.add(demande)
    db.commit()
    db.refresh(demande)

    # Send message to all teachers
    msg = Message(
        demande_id=demande.demande_id,
        expediteur_type="ADMIN",
        destinataire_type="TOUS_ENSEIGNANTS",
        objet_type=data.get("objet_type", "EMPLOI"),
        sujet=data["titre"],
        contenu=data.get("description", ""),
    )
    db.add(msg)
    db.commit()

    return {
        "message": "Demande créée et notification envoyée à tous les enseignants.",
        "demande_id": demande.demande_id
    }


@router.get("/demandes/{demande_id}")
def get_demande_detail(demande_id: int, db: Session = Depends(get_db)):
    """Détail d'une demande — disponibilités (EMPLOI) ou sujets (EXAMENS)."""
    d = db.query(DemandeEmploi).filter(DemandeEmploi.demande_id == demande_id).first()
    if not d:
        raise HTTPException(404, "Demande not found")

    if d.objet_type == "EXAMENS":
        # ── EXAMENS: return sujets grouped by enseignant ──
        sujets = db.query(SujetExamen).filter(SujetExamen.demande_id == demande_id).all()
        par_enseignant = {}
        for s in sujets:
            eid = s.enseignant_id
            if eid not in par_enseignant:
                ens = db.query(Enseignant).filter(Enseignant.enseignant_id == eid).first()
                par_enseignant[eid] = {
                    "enseignant_id": eid,
                    "nom": ens.nom if ens else "?",
                    "prenom": ens.prenom if ens else "?",
                    "specialite": ens.specialite if ens else None,
                    "sujets": [],
                    "nb_valides": 0,
                    "nb_envoyes": 0,
                    "nb_rejetes": 0,
                }
            mat = db.query(Matiere).filter(Matiere.matiere_id == s.matiere_id).first()
            par_enseignant[eid]["sujets"].append({
                "sujet_id": s.sujet_id,
                "matiere_libelle": mat.libelle if mat else "?",
                "matiere_code": mat.code if mat else "?",
                "titre": s.titre,
                "fichier_nom": s.fichier_nom,
                "fichier_taille": s.fichier_taille,
                "duree_minutes": s.duree_minutes,
                "statut": s.statut,
                "date_envoi": str(s.date_envoi) if s.date_envoi else None,
            })
            if s.statut == "VALIDE":
                par_enseignant[eid]["nb_valides"] += 1
            elif s.statut == "ENVOYE":
                par_enseignant[eid]["nb_envoyes"] += 1
            elif s.statut == "REJETE":
                par_enseignant[eid]["nb_rejetes"] += 1

        return {
            "demande_id": d.demande_id,
            "titre": d.titre,
            "description": d.description,
            "objet_type": d.objet_type,
            "trimestre": getattr(d, 'trimestre', None),
            "classes_concernees": d.classes_concernees,
            "statut": d.statut,
            "date_creation": d.date_creation.isoformat() if d.date_creation else None,
            "enseignants": list(par_enseignant.values()),
        }
    else:
        # ── EMPLOI / OTHER: return disponibilités ──
        dispos = db.query(Disponibilite).filter(Disponibilite.demande_id == demande_id).all()
        par_enseignant = {}
        for disp in dispos:
            eid = disp.enseignant_id
            if eid not in par_enseignant:
                ens = db.query(Enseignant).filter(Enseignant.enseignant_id == eid).first()
                par_enseignant[eid] = {
                    "enseignant_id": eid,
                    "nom": ens.nom if ens else "?",
                    "prenom": ens.prenom if ens else "?",
                    "specialite": ens.specialite if ens else None,
                    "slots": [],
                    "nb_validees": 0,
                    "nb_rejetees": 0,
                }
            cls = db.query(Classe).filter(Classe.classe_id == disp.classe_id).first()
            slot = {
                "disponibilite_id": disp.disponibilite_id,
                "classe_id": disp.classe_id,
                "classe_libelle": cls.libelle if cls else "?",
                "jour": disp.jour,
                "heure_debut": disp.heure_debut,
                "heure_fin": disp.heure_fin,
                "statut": disp.statut,
                "commentaire_admin": disp.commentaire_admin,
            }
            par_enseignant[eid]["slots"].append(slot)
            if disp.statut == "VALIDEE":
                par_enseignant[eid]["nb_validees"] += 1
            elif disp.statut == "REJETEE":
                par_enseignant[eid]["nb_rejetees"] += 1

        return {
            "demande_id": d.demande_id,
            "titre": d.titre,
            "description": d.description,
            "objet_type": d.objet_type,
            "classes_concernees": d.classes_concernees,
            "statut": d.statut,
            "date_creation": d.date_creation.isoformat() if d.date_creation else None,
            "enseignants": list(par_enseignant.values()),
        }


# ============================================================================
# DISPONIBILITÉS (Teacher side)
# ============================================================================

@router.get("/disponibilites/enseignant/{enseignant_id}")
def get_mes_disponibilites(enseignant_id: int, demande_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Un enseignant récupère ses disponibilités soumises."""
    q = db.query(Disponibilite).filter(Disponibilite.enseignant_id == enseignant_id)
    if demande_id:
        q = q.filter(Disponibilite.demande_id == demande_id)
    dispos = q.all()
    result = []
    for disp in dispos:
        cls = db.query(Classe).filter(Classe.classe_id == disp.classe_id).first()
        result.append({
            "disponibilite_id": disp.disponibilite_id,
            "demande_id": disp.demande_id,
            "classe_id": disp.classe_id,
            "classe_libelle": cls.libelle if cls else "?",
            "jour": disp.jour,
            "heure_debut": disp.heure_debut,
            "heure_fin": disp.heure_fin,
            "statut": disp.statut,
            "commentaire_admin": disp.commentaire_admin,
        })
    return result


@router.post("/disponibilites", status_code=201)
def soumettre_disponibilites(data: dict, db: Session = Depends(get_db)):
    """
    Un enseignant soumet ses disponibilités pour une demande.
    data: { demande_id, enseignant_id, slots: [{classe_id, jour, heure_debut, heure_fin}] }
    """
    required = ["demande_id", "enseignant_id", "slots"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis: {f}")

    demande = db.query(DemandeEmploi).filter(DemandeEmploi.demande_id == data["demande_id"]).first()
    if not demande:
        raise HTTPException(404, "Demande non trouvée")

    ens_id = data["enseignant_id"]
    # Remove old submissions for this teacher/demande
    db.query(Disponibilite).filter(
        Disponibilite.demande_id == data["demande_id"],
        Disponibilite.enseignant_id == ens_id
    ).delete()

    created = 0
    for slot in data["slots"]:
        jour = slot.get("jour", "").upper()
        if jour not in JOURS:
            continue
        d = Disponibilite(
            demande_id=data["demande_id"],
            enseignant_id=ens_id,
            classe_id=slot["classe_id"],
            jour=jour,
            heure_debut=slot["heure_debut"],
            heure_fin=slot["heure_fin"],
        )
        db.add(d)
        created += 1

    db.commit()

    # Send notification to admin
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == ens_id).first()
    ens_name = f"{ens.prenom} {ens.nom}" if ens else "Enseignant"
    msg = Message(
        demande_id=data["demande_id"],
        expediteur_type="ENSEIGNANT",
        expediteur_id=ens_id,
        destinataire_type="ADMIN",
        objet_type="EMPLOI",
        sujet=f"Disponibilités soumises — {ens_name}",
        contenu=f"{ens_name} a soumis {created} créneaux de disponibilité.",
    )
    db.add(msg)
    db.commit()

    return {"message": f"{created} créneaux de disponibilité enregistrés.", "created": created}


# ============================================================================
# VALIDATION DES DISPONIBILITÉS (Admin)
# ============================================================================

@router.put("/disponibilites/{dispo_id}/valider")
def valider_disponibilite(dispo_id: int, db: Session = Depends(get_db)):
    """Admin valide une disponibilité."""
    d = db.query(Disponibilite).filter(Disponibilite.disponibilite_id == dispo_id).first()
    if not d:
        raise HTTPException(404, "Disponibilité non trouvée")

    # Check conflicts: same class, same jour, same heure, different teacher already validated
    conflict = db.query(Disponibilite).filter(
        Disponibilite.demande_id == d.demande_id,
        Disponibilite.classe_id == d.classe_id,
        Disponibilite.jour == d.jour,
        Disponibilite.heure_debut == d.heure_debut,
        Disponibilite.statut == "VALIDEE",
        Disponibilite.disponibilite_id != dispo_id,
    ).first()
    if conflict:
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == conflict.enseignant_id).first()
        raise HTTPException(
            409,
            f"Conflit : ce créneau est déjà validé pour {ens.prenom} {ens.nom if ens else ''} dans cette classe."
        )

    d.statut = "VALIDEE"
    db.commit()
    return {"message": "Disponibilité validée"}


@router.put("/disponibilites/{dispo_id}/rejeter")
def rejeter_disponibilite(dispo_id: int, data: dict, db: Session = Depends(get_db)):
    """Admin rejette une disponibilité avec commentaire."""
    d = db.query(Disponibilite).filter(Disponibilite.disponibilite_id == dispo_id).first()
    if not d:
        raise HTTPException(404, "Disponibilité non trouvée")

    d.statut = "REJETEE"
    d.commentaire_admin = data.get("raison", "")
    db.commit()

    # Notify teacher
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == d.enseignant_id).first()
    cls = db.query(Classe).filter(Classe.classe_id == d.classe_id).first()
    msg = Message(
        demande_id=d.demande_id,
        expediteur_type="ADMIN",
        destinataire_type="ENSEIGNANT",
        destinataire_id=d.enseignant_id,
        objet_type="EMPLOI",
        sujet=f"Disponibilité rejetée — {cls.libelle if cls else ''} {d.jour} {d.heure_debut}",
        contenu=data.get("raison", "Veuillez adapter votre disponibilité."),
    )
    db.add(msg)
    db.commit()

    return {"message": "Disponibilité rejetée, enseignant notifié"}


@router.put("/disponibilites/valider-tout/{demande_id}")
def valider_toutes_dispos(demande_id: int, db: Session = Depends(get_db)):
    """Admin valide toutes les disponibilités soumises d'une demande (sans conflit)."""
    dispos = db.query(Disponibilite).filter(
        Disponibilite.demande_id == demande_id,
        Disponibilite.statut == "SOUMISE"
    ).all()

    validated = 0
    conflicts = 0
    for d in dispos:
        conflict = db.query(Disponibilite).filter(
            Disponibilite.demande_id == demande_id,
            Disponibilite.classe_id == d.classe_id,
            Disponibilite.jour == d.jour,
            Disponibilite.heure_debut == d.heure_debut,
            Disponibilite.statut == "VALIDEE",
            Disponibilite.disponibilite_id != d.disponibilite_id,
        ).first()
        if conflict:
            conflicts += 1
        else:
            d.statut = "VALIDEE"
            validated += 1

    db.commit()
    return {"message": f"{validated} validées, {conflicts} conflits détectés.", "validated": validated, "conflicts": conflicts}


# ============================================================================
# GÉNÉRATION AUTOMATIQUE DEPUIS LES DISPONIBILITÉS VALIDÉES
# ============================================================================

@router.post("/demandes/{demande_id}/generer-emplois", status_code=201)
def generer_emplois_depuis_dispos(demande_id: int, db: Session = Depends(get_db)):
    """
    Génère les emplois du temps pour toutes les classes concernées
    en utilisant les disponibilités VALIDÉES des enseignants.
    """
    demande = db.query(DemandeEmploi).filter(DemandeEmploi.demande_id == demande_id).first()
    if not demande:
        raise HTTPException(404, "Demande non trouvée")

    # Get validated availabilities
    dispos_validees = db.query(Disponibilite).filter(
        Disponibilite.demande_id == demande_id,
        Disponibilite.statut == "VALIDEE"
    ).all()

    if not dispos_validees:
        raise HTTPException(400, "Aucune disponibilité validée. Validez d'abord les disponibilités des enseignants.")

    # Group by class
    par_classe = {}
    for d in dispos_validees:
        cid = d.classe_id
        if cid not in par_classe:
            par_classe[cid] = []
        par_classe[cid].append(d)

    total_created = 0
    classes_generated = []

    for classe_id, dispos in par_classe.items():
        cls = db.query(Classe).filter(Classe.classe_id == classe_id).first()
        if not cls:
            continue

        # Delete existing timetable for this class
        db.query(CreneauEmploi).filter(CreneauEmploi.classe_id == classe_id).delete()

        # Get class subjects with their teacher assignments
        class_matieres = db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == classe_id,
            ClasseMatiere.est_active == "O"
        ).all()
        matiere_ids = [cm.matiere_id for cm in class_matieres]

        # For each validated dispo, find which subject this teacher teaches in this class
        created_for_class = 0
        for d in dispos:
            # Find what subject this teacher teaches in this class
            affectation = db.query(Affectation).filter(
                Affectation.enseignant_id == d.enseignant_id,
                Affectation.classe_id == classe_id,
                Affectation.statut == "ACTIVE"
            ).first()

            matiere_id = affectation.matiere_id if affectation else None

            # If no affectation, try to match by class subjects
            if not matiere_id and matiere_ids:
                matiere_id = matiere_ids[created_for_class % len(matiere_ids)]

            if not matiere_id:
                continue

            # Check no conflict exists already
            existing = db.query(CreneauEmploi).filter(
                CreneauEmploi.classe_id == classe_id,
                CreneauEmploi.jour == d.jour,
                CreneauEmploi.heure_debut == d.heure_debut,
                CreneauEmploi.statut == "ACTIVE"
            ).first()
            if existing:
                continue

            creneau = CreneauEmploi(
                classe_id=classe_id,
                matiere_id=matiere_id,
                enseignant_id=d.enseignant_id,
                jour=d.jour,
                heure_debut=d.heure_debut,
                heure_fin=d.heure_fin,
                annee_id=1,
            )
            db.add(creneau)
            created_for_class += 1

        total_created += created_for_class
        classes_generated.append({
            "classe_id": classe_id,
            "classe_libelle": cls.libelle,
            "creneaux_crees": created_for_class,
        })

    # Update demande status
    demande.statut = "EMPLOIS_GENERES"
    db.commit()

    return {
        "message": f"Emplois du temps générés : {total_created} créneaux pour {len(classes_generated)} classes.",
        "total_created": total_created,
        "classes": classes_generated,
    }


@router.get("/objet-types")
def get_objet_types():
    """Liste des types d'objet de communication."""
    return [
        {"code": "EMPLOI", "label": "📅 Emploi du Temps", "color": "#0d9488"},
        {"code": "DISCIPLINE", "label": "⚖️ Discipline", "color": "#dc2626"},
        {"code": "GENERAL", "label": "📢 Général", "color": "#3b82f6"},
        {"code": "REUNION", "label": "🤝 Réunion", "color": "#7c3aed"},
        {"code": "EXAMENS", "label": "📝 Examens", "color": "#f59e0b"},
        {"code": "PAIEMENT", "label": "💰 Paiement", "color": "#059669"},
        {"code": "BULLETIN", "label": "📄 Bulletin", "color": "#ea580c"},
    ]


# ============================================================================
# COMMUNICATION PARENTS — Admin side
# ============================================================================

@router.get("/parents-list")
def get_parents_list(db: Session = Depends(get_db)):
    """Liste tous les parents avec leurs enfants (pour l'admin).
    Retourne parent_id, nom, prenom, telephone, enfants[{nom, prenom, classe}]."""
    from app.models.academique import Parent, EleveParent, Eleve, Inscription, Classe
    parents = db.query(Parent).filter(Parent.statut == "ACTIF").order_by(Parent.nom).all()
    result = []
    for p in parents:
        liens = db.query(EleveParent).filter(EleveParent.parent_id == p.parent_id).all()
        enfants = []
        for lien in liens:
            eleve = db.query(Eleve).filter(Eleve.eleve_id == lien.eleve_id).first()
            if not eleve:
                continue
            insc = db.query(Inscription).filter(
                Inscription.eleve_id == eleve.eleve_id, Inscription.statut == "ACTIVE"
            ).first()
            classe_lib = "?"
            classe_id = None
            if insc:
                cl = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
                if cl:
                    classe_lib = cl.libelle
                    classe_id = cl.classe_id
            enfants.append({
                "eleve_id": eleve.eleve_id,
                "nom": eleve.nom,
                "prenom": eleve.prenom,
                "matricule": eleve.matricule,
                "classe": classe_lib,
                "classe_id": classe_id,
                "lien_parente": lien.lien_parente,
            })
        result.append({
            "parent_id": p.parent_id,
            "nom": p.nom,
            "prenom": p.prenom,
            "telephone": p.telephone_1,
            "email": p.email,
            "profession": p.profession,
            "nb_enfants": len(enfants),
            "enfants": enfants,
        })
    return result


@router.get("/messages-parents")
def list_messages_parents(db: Session = Depends(get_db)):
    """Liste les messages échangés avec les parents (pour l'admin)."""
    from app.models.academique import Parent

    msgs = db.query(Message).filter(
        or_(
            Message.destinataire_type.in_(["PARENT", "TOUS_PARENTS", "CLASSE_PARENTS"]),
            Message.expediteur_type == "PARENT",
        )
    ).order_by(desc(Message.date_envoi)).limit(200).all()

    result = []
    for m in msgs:
        exp_name = "Administration"
        if m.expediteur_type == "PARENT" and m.expediteur_id:
            parent = db.query(Parent).filter(Parent.parent_id == m.expediteur_id).first()
            if parent:
                exp_name = f"{parent.prenom} {parent.nom}"

        dest_name = "?"
        if m.destinataire_type == "TOUS_PARENTS":
            dest_name = "Tous les parents"
        elif m.destinataire_type == "CLASSE_PARENTS" and m.destinataire_id:
            from app.models.academique import Classe
            cl = db.query(Classe).filter(Classe.classe_id == m.destinataire_id).first()
            dest_name = f"Parents de {cl.libelle}" if cl else "Classe ?"
        elif m.destinataire_type == "PARENT" and m.destinataire_id:
            parent = db.query(Parent).filter(Parent.parent_id == m.destinataire_id).first()
            dest_name = f"{parent.prenom} {parent.nom}" if parent else "Parent ?"
        elif m.destinataire_type == "ADMIN":
            dest_name = "Administration"

        result.append({
            "message_id": m.message_id,
            "expediteur_type": m.expediteur_type,
            "expediteur_id": m.expediteur_id,
            "expediteur_nom": exp_name,
            "destinataire_type": m.destinataire_type,
            "destinataire_id": m.destinataire_id,
            "destinataire_nom": dest_name,
            "objet_type": m.objet_type,
            "sujet": m.sujet,
            "contenu": m.contenu,
            "statut": m.statut,
            "date_envoi": m.date_envoi.isoformat() if m.date_envoi else None,
        })

    return result


@router.post("/messages-parents", status_code=201)
def send_message_to_parents(data: dict, db: Session = Depends(get_db)):
    """Admin envoie un message aux parents.
    data: { destinataire_type: PARENT|TOUS_PARENTS|CLASSE_PARENTS,
            destinataire_id: parent_id|classe_id|null,
            objet_type, sujet, contenu }"""
    required = ["destinataire_type", "sujet"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis: {f}")

    dest_type = data["destinataire_type"]
    if dest_type not in ["PARENT", "TOUS_PARENTS", "CLASSE_PARENTS"]:
        raise HTTPException(400, "destinataire_type invalide")

    msg = Message(
        expediteur_type="ADMIN",
        expediteur_id=None,
        destinataire_type=dest_type,
        destinataire_id=data.get("destinataire_id"),
        objet_type=data.get("objet_type", "GENERAL"),
        sujet=data["sujet"],
        contenu=data.get("contenu", ""),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"message": "Message envoyé aux parents", "message_id": msg.message_id}


# ============================================================================
# RÉPERTOIRE PARENTS (pour page Familles admin)
# ============================================================================

@router.get("/parents/annuaire")
def get_parents_annuaire(db: Session = Depends(get_db)):
    """Retourne la liste de tous les parents avec infos de base + nombre d'enfants."""
    parents = db.query(Parent).filter(Parent.statut == "ACTIF").order_by(Parent.prenom, Parent.nom).all()
    result = []
    for p in parents:
        # Compter les enfants via EleveParent
        liens = db.query(EleveParent).filter(EleveParent.parent_id == p.parent_id).all()
        enfants_list = []
        for lien in liens:
            eleve = db.query(Eleve).filter(Eleve.eleve_id == lien.eleve_id).first()
            if not eleve:
                continue
            # Trouver la classe actuelle
            insc = db.query(Inscription).filter(
                Inscription.eleve_id == eleve.eleve_id,
                Inscription.statut == "ACTIVE"
            ).first()
            classe_lib = "—"
            if insc:
                cl = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
                if cl:
                    classe_lib = cl.libelle
            enfants_list.append({
                "eleve_id": eleve.eleve_id,
                "nom": eleve.nom,
                "prenom": eleve.prenom,
                "matricule": eleve.matricule,
                "sexe": eleve.sexe,
                "classe": classe_lib,
                "lien_parente": lien.lien_parente,
                "statut": eleve.statut,
            })
        result.append({
            "parent_id": p.parent_id,
            "nom": p.nom,
            "prenom": p.prenom,
            "telephone": p.telephone_1,
            "telephone_1": p.telephone_1,
            "telephone_2": p.telephone_2,
            "email": p.email,
            "profession": p.profession,
            "adresse": p.adresse,
            "statut": p.statut,
            "has_password": bool(p.mot_de_passe),
            "nb_enfants": len(enfants_list),
            "enfants": enfants_list,
        })
    return result
