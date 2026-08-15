"""
SMARTSCHOOL API — Communication & Demandes d'Emploi du Temps
Système de messagerie Admin <-> Enseignants + Collecte de disponibilités
+ Génération automatique d'emplois du temps basée sur les disponibilités validées
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func
from typing import Dict, Optional
from datetime import datetime
import json

from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement, require_roles, ADMIN_TIER_ROLES
from app.core.annee_courante import resoudre_annee
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

# Ce routeur n'était protégé que par get_current_user (aucun rôle), à la
# différence de finance/comptabilité/personnel/examens — voir Lot 5 du
# chantier multi-écoles. Les routes de gestion admin (répertoire parents,
# validation de disponibilités, création de demandes...) exigent désormais
# explicitement un rôle admin-tier ; les routes partagées admin/enseignant
# (messagerie interne, dépôt de disponibilités) restent ouvertes aux deux,
# avec vérification d'établissement + d'ownership.
_require_admin = require_roles(*ADMIN_TIER_ROLES)


def _est_admin_tier(current_user: dict) -> bool:
    return current_user.get("role") in ADMIN_TIER_ROLES


# ============================================================================
# MESSAGES
# ============================================================================

@router.get("/messages")
def list_messages(
    role: str = "ADMIN",
    enseignant_id: Optional[int] = None,
    objet_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste les messages selon le rôle (ADMIN ou ENSEIGNANT).
    Toujours restreinte à l'établissement appelant. Un compte enseignant ne
    peut jamais consulter la messagerie d'un collègue en changeant
    enseignant_id — sa propre identité prévaut toujours."""
    q = db.query(Message).filter(Message.etablissement_id == etablissement_id)

    if role == "ADMIN":
        if not _est_admin_tier(current_user):
            raise HTTPException(403, "Accès réservé à l'administration")
        q = q.filter(or_(
            Message.expediteur_type == "ADMIN",
            Message.destinataire_type == "ADMIN"
        ))
    elif role == "ENSEIGNANT":
        if not _est_admin_tier(current_user):
            if current_user.get("type") != "enseignant":
                raise HTTPException(403, "Accès réservé aux enseignants")
            enseignant_id = int(current_user.get("sub"))
        if not enseignant_id:
            raise HTTPException(400, "enseignant_id requis")

        # Récupérer les classes de l'enseignant pour les messages CLASSE_ENSEIGNANTS
        classes_ens = db.query(Affectation.classe_id).filter(
            Affectation.enseignant_id == enseignant_id,
            Affectation.statut == "ACTIVE"
        ).all()
        classe_ids = [c[0] for c in classes_ens]

        filters = [
            (Message.expediteur_type == "ENSEIGNANT") & (Message.expediteur_id == enseignant_id),
            Message.destinataire_type == "TOUS_ENSEIGNANTS",
            Message.destinataire_type == "TOUS",
            (Message.destinataire_type == "ENSEIGNANT") & (Message.destinataire_id == enseignant_id),
        ]
        for cid in classe_ids:
            filters.append((Message.destinataire_type == "CLASSE_ENSEIGNANTS") & (Message.destinataire_id == cid))

        q = q.filter(or_(*filters))
    else:
        raise HTTPException(400, "role doit être 'ADMIN' ou 'ENSEIGNANT'")

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
        elif m.expediteur_type == "PARENT" and m.expediteur_id:
            # Sans ça, un message d'un parent s'affichait « Administration » dans
            # la boîte du professeur — impossible de savoir qui écrit.
            from app.models.academique import Parent as _P
            p = db.query(_P).filter(_P.parent_id == m.expediteur_id).first()
            if p:
                exp_name = f"{p.prenom} {p.nom} (parent)"

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
def send_message(
    data: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Envoyer un message (Admin ou Enseignant)."""
    required = ["expediteur_type", "destinataire_type", "sujet"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis: {f}")

    expediteur_type = data["expediteur_type"]
    expediteur_id = data.get("expediteur_id")

    # Un enseignant ne peut envoyer un message que sous sa propre identité —
    # jamais au nom d'un collègue.
    if expediteur_type == "ENSEIGNANT" and not _est_admin_tier(current_user):
        if current_user.get("type") != "enseignant":
            raise HTTPException(403, "Seul un enseignant peut envoyer un message expediteur_type=ENSEIGNANT")
        expediteur_id = int(current_user.get("sub"))
    if expediteur_type == "ENSEIGNANT" and expediteur_id:
        ens_valide = db.query(Enseignant.enseignant_id).filter(
            Enseignant.enseignant_id == expediteur_id, Enseignant.etablissement_id == etablissement_id
        ).first()
        if not ens_valide:
            raise HTTPException(404, "Enseignant expéditeur introuvable")

    destinataire_type = data["destinataire_type"]
    destinataire_id = data.get("destinataire_id")
    if destinataire_type in ("ENSEIGNANT", "CLASSE_ENSEIGNANTS") and destinataire_id:
        model = Enseignant if destinataire_type == "ENSEIGNANT" else Classe
        id_col = Enseignant.enseignant_id if destinataire_type == "ENSEIGNANT" else Classe.classe_id
        valide = db.query(id_col).filter(id_col == destinataire_id, model.etablissement_id == etablissement_id).first()
        if not valide:
            raise HTTPException(404, "Destinataire introuvable pour cet établissement")

    msg = Message(
        etablissement_id=etablissement_id,
        demande_id=data.get("demande_id"),
        expediteur_type=expediteur_type,
        expediteur_id=expediteur_id,
        destinataire_type=destinataire_type,
        destinataire_id=destinataire_id,
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
def marquer_tous_lus(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Marquer tous les messages non lus destinés à l'admin comme lus."""
    count = db.query(Message).filter(
        Message.statut == "ENVOYE",
        Message.expediteur_type != "ADMIN",
        Message.etablissement_id == etablissement_id,
    ).update({"statut": "LU", "date_lecture": datetime.now()})
    db.commit()
    return {"marked": count}


@router.put("/messages/{message_id}/lire")
def marquer_lu(message_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Marquer un message comme lu."""
    m = db.query(Message).filter(
        Message.message_id == message_id, Message.etablissement_id == etablissement_id
    ).first()
    if not m:
        raise HTTPException(404, "Message not found")
    m.statut = "LU"
    m.date_lecture = datetime.now()
    db.commit()
    return {"message": "Message marqué comme lu"}


# ============================================================================
# DEMANDES D'EMPLOI DU TEMPS
# ============================================================================

@router.get("/demandes", dependencies=[Depends(_require_admin)])
def list_demandes(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Liste toutes les demandes de disponibilité / examens."""
    demandes = db.query(DemandeEmploi).filter(
        DemandeEmploi.etablissement_id == etablissement_id
    ).order_by(desc(DemandeEmploi.date_creation)).all()
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


@router.post("/demandes", status_code=201, dependencies=[Depends(_require_admin)])
def creer_demande(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Créer une demande de collecte de disponibilité.
    Envoie automatiquement un message à tous les enseignants DE CET ÉTABLISSEMENT
    (destinataire_type="TOUS_ENSEIGNANTS" est désormais toujours interprété comme
    "tous les enseignants de l'établissement du message", jamais de la plateforme).
    """
    if "titre" not in data:
        raise HTTPException(400, "Titre requis")

    classes_str = data.get("classes_concernees", "TOUTES")
    if isinstance(classes_str, list):
        # Les classes explicitement listées doivent appartenir à cet
        # établissement — jamais acceptées aveuglément depuis le body.
        if classes_str:
            trouvees = {c.classe_id for c in db.query(Classe.classe_id).filter(
                Classe.classe_id.in_(classes_str), Classe.etablissement_id == etablissement_id
            ).all()}
            if trouvees != set(classes_str):
                raise HTTPException(403, "Classe(s) invalide(s) pour cet établissement")
        classes_str = json.dumps(classes_str)

    demande = DemandeEmploi(
        etablissement_id=etablissement_id,
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
        etablissement_id=etablissement_id,
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


@router.get("/demandes/{demande_id}", dependencies=[Depends(_require_admin)])
def get_demande_detail(demande_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Détail d'une demande — disponibilités (EMPLOI) ou sujets (EXAMENS)."""
    d = db.query(DemandeEmploi).filter(
        DemandeEmploi.demande_id == demande_id, DemandeEmploi.etablissement_id == etablissement_id
    ).first()
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
def get_mes_disponibilites(
    enseignant_id: int,
    demande_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Un enseignant récupère ses disponibilités soumises.
    Un compte enseignant ne peut consulter que les siennes ; un admin peut
    consulter celles de n'importe quel enseignant de son établissement."""
    ens_valide = db.query(Enseignant.enseignant_id).filter(
        Enseignant.enseignant_id == enseignant_id, Enseignant.etablissement_id == etablissement_id
    ).first()
    if not ens_valide:
        raise HTTPException(404, "Enseignant introuvable")
    if not _est_admin_tier(current_user):
        if current_user.get("type") != "enseignant" or str(current_user.get("sub", "")) != str(enseignant_id):
            raise HTTPException(403, "Vous ne pouvez consulter que vos propres disponibilités")

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
def soumettre_disponibilites(
    data: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """
    Un enseignant soumet ses disponibilités pour une demande.
    data: { demande_id, enseignant_id, slots: [{classe_id, jour, heure_debut, heure_fin}] }
    """
    required = ["demande_id", "enseignant_id", "slots"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis: {f}")

    demande = db.query(DemandeEmploi).filter(
        DemandeEmploi.demande_id == data["demande_id"], DemandeEmploi.etablissement_id == etablissement_id
    ).first()
    if not demande:
        raise HTTPException(404, "Demande non trouvée")

    ens_id = data["enseignant_id"]
    ens = db.query(Enseignant).filter(
        Enseignant.enseignant_id == ens_id, Enseignant.etablissement_id == etablissement_id
    ).first()
    if not ens:
        raise HTTPException(404, "Enseignant introuvable")
    # Un enseignant ne peut soumettre que SES PROPRES disponibilités — jamais
    # au nom d'un collègue (sauf admin de l'établissement).
    if not _est_admin_tier(current_user):
        if current_user.get("type") != "enseignant" or str(current_user.get("sub", "")) != str(ens_id):
            raise HTTPException(403, "Vous ne pouvez soumettre que vos propres disponibilités")

    # Chaque classe référencée dans les créneaux doit appartenir à cet
    # établissement — jamais acceptée aveuglément depuis le body.
    classe_ids_slots = {slot["classe_id"] for slot in data["slots"] if slot.get("classe_id")}
    if classe_ids_slots:
        trouvees = {c.classe_id for c in db.query(Classe.classe_id).filter(
            Classe.classe_id.in_(classe_ids_slots), Classe.etablissement_id == etablissement_id
        ).all()}
        if trouvees != classe_ids_slots:
            raise HTTPException(403, "Classe(s) invalide(s) pour cet établissement")

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
    ens_name = f"{ens.prenom} {ens.nom}"
    msg = Message(
        etablissement_id=etablissement_id,
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

@router.put("/disponibilites/{dispo_id}/valider", dependencies=[Depends(_require_admin)])
def valider_disponibilite(dispo_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Admin valide une disponibilité."""
    d = (
        db.query(Disponibilite)
        .join(Classe, Classe.classe_id == Disponibilite.classe_id)
        .filter(Disponibilite.disponibilite_id == dispo_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
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


@router.put("/disponibilites/{dispo_id}/rejeter", dependencies=[Depends(_require_admin)])
def rejeter_disponibilite(dispo_id: int, data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Admin rejette une disponibilité avec commentaire."""
    d = (
        db.query(Disponibilite)
        .join(Classe, Classe.classe_id == Disponibilite.classe_id)
        .filter(Disponibilite.disponibilite_id == dispo_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not d:
        raise HTTPException(404, "Disponibilité non trouvée")

    d.statut = "REJETEE"
    d.commentaire_admin = data.get("raison", "")
    db.commit()

    # Notify teacher
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == d.enseignant_id).first()
    cls = db.query(Classe).filter(Classe.classe_id == d.classe_id).first()
    msg = Message(
        etablissement_id=etablissement_id,
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


@router.put("/disponibilites/valider-tout/{demande_id}", dependencies=[Depends(_require_admin)])
def valider_toutes_dispos(demande_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Admin valide toutes les disponibilités soumises d'une demande (sans conflit)."""
    demande = db.query(DemandeEmploi).filter(
        DemandeEmploi.demande_id == demande_id, DemandeEmploi.etablissement_id == etablissement_id
    ).first()
    if not demande:
        raise HTTPException(404, "Demande non trouvée")

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

@router.post("/demandes/{demande_id}/generer-emplois", status_code=201, dependencies=[Depends(_require_admin)])
def generer_emplois_depuis_dispos(demande_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Génère les emplois du temps pour toutes les classes concernées
    en utilisant les disponibilités VALIDÉES des enseignants.
    """
    demande = db.query(DemandeEmploi).filter(
        DemandeEmploi.demande_id == demande_id, DemandeEmploi.etablissement_id == etablissement_id
    ).first()
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

    annee_id = resoudre_annee(db, etablissement_id, None)
    if annee_id is None:
        raise HTTPException(
            400, "Aucune annee scolaire ouverte : impossible de generer un emploi du temps."
        )

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
                annee_id=annee_id,
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

@router.get("/parents-list", dependencies=[Depends(_require_admin)])
def get_parents_list(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Liste les parents ayant au moins un enfant dans CET établissement,
    avec UNIQUEMENT leurs enfants de cet établissement.
    Retourne parent_id, nom, prenom, telephone, enfants[{nom, prenom, classe}].

    AVANT LE LOT 5 : cette route retournait l'annuaire complet de TOUS les
    parents de TOUTE la plateforme, sans restriction de rôle — l'une des
    fuites les plus sévères identifiées dans l'audit initial (nom, téléphone,
    email, profession de chaque parent + noms/classes de chaque enfant).
    Corrigé en deux temps : (1) restreint aux rôles admin-tier, (2) le
    roster est dérivé strictement des ÉLÈVES de cet établissement (jamais du
    Parent lui-même, qui n'a pas de colonne établissement — voir Cas B :
    un parent avec des enfants dans plusieurs écoles n'expose ici QUE ses
    enfants de cette école, jamais ceux d'une autre).

    Réécrit en préchargement par lot (requêtes fixes) — voir la règle N+1
    déjà établie sur ce projet.
    """
    from app.models.academique import Parent, EleveParent, Eleve, Inscription, Classe

    eleves_etab = db.query(Eleve).filter(Eleve.etablissement_id == etablissement_id).all()
    eleve_ids = [e.eleve_id for e in eleves_etab]
    eleves_par_id: Dict[int, Eleve] = {e.eleve_id: e for e in eleves_etab}
    if not eleve_ids:
        return []

    liens = db.query(EleveParent).filter(EleveParent.eleve_id.in_(eleve_ids)).all()
    if not liens:
        return []
    parent_ids = list({lien.parent_id for lien in liens})
    liens_par_parent: Dict[int, list] = {}
    for lien in liens:
        liens_par_parent.setdefault(lien.parent_id, []).append(lien)

    parents = db.query(Parent).filter(
        Parent.parent_id.in_(parent_ids), Parent.statut == "ACTIF"
    ).order_by(Parent.nom).all()

    inscriptions_actives: Dict[int, Inscription] = {}
    for insc in db.query(Inscription).filter(
        Inscription.eleve_id.in_(eleve_ids), Inscription.statut == "ACTIVE"
    ).all():
        inscriptions_actives[insc.eleve_id] = insc

    classe_ids = list({insc.classe_id for insc in inscriptions_actives.values()})
    classes_par_id: Dict[int, Classe] = {}
    if classe_ids:
        classes_par_id = {c.classe_id: c for c in db.query(Classe).filter(Classe.classe_id.in_(classe_ids)).all()}

    result = []
    for p in parents:
        enfants = []
        for lien in liens_par_parent.get(p.parent_id, []):
            eleve = eleves_par_id.get(lien.eleve_id)
            if not eleve:
                continue
            insc = inscriptions_actives.get(eleve.eleve_id)
            classe = classes_par_id.get(insc.classe_id) if insc else None
            enfants.append({
                "eleve_id": eleve.eleve_id,
                "nom": eleve.nom,
                "prenom": eleve.prenom,
                "matricule": eleve.matricule,
                "classe": classe.libelle if classe else "?",
                "classe_id": classe.classe_id if classe else None,
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


@router.get("/messages-parents", dependencies=[Depends(_require_admin)])
def list_messages_parents(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Liste les messages échangés avec les parents (pour l'admin).

    Préchargement par lot (parents + classes en 2 requêtes fixes) au lieu
    d'une requête par message dans la boucle — même correctif que
    get_parents_list, même règle N+1 déjà établie sur ce projet.
    """
    from app.models.academique import Parent, Classe

    msgs = db.query(Message).filter(
        Message.etablissement_id == etablissement_id,
        or_(
            Message.destinataire_type.in_(["PARENT", "TOUS_PARENTS", "CLASSE_PARENTS"]),
            Message.expediteur_type == "PARENT",
        )
    ).order_by(desc(Message.date_envoi)).limit(200).all()

    parent_ids = {m.expediteur_id for m in msgs if m.expediteur_type == "PARENT" and m.expediteur_id}
    parent_ids |= {m.destinataire_id for m in msgs if m.destinataire_type == "PARENT" and m.destinataire_id}
    parents_par_id: Dict[int, Parent] = {}
    if parent_ids:
        parents_par_id = {p.parent_id: p for p in db.query(Parent).filter(Parent.parent_id.in_(parent_ids)).all()}

    classe_ids = {m.destinataire_id for m in msgs if m.destinataire_type == "CLASSE_PARENTS" and m.destinataire_id}
    classes_par_id: Dict[int, Classe] = {}
    if classe_ids:
        classes_par_id = {c.classe_id: c for c in db.query(Classe).filter(Classe.classe_id.in_(classe_ids)).all()}

    result = []
    for m in msgs:
        exp_name = "Administration"
        if m.expediteur_type == "PARENT" and m.expediteur_id:
            parent = parents_par_id.get(m.expediteur_id)
            if parent:
                exp_name = f"{parent.prenom} {parent.nom}"

        dest_name = "?"
        if m.destinataire_type == "TOUS_PARENTS":
            dest_name = "Tous les parents"
        elif m.destinataire_type == "CLASSE_PARENTS" and m.destinataire_id:
            cl = classes_par_id.get(m.destinataire_id)
            dest_name = f"Parents de {cl.libelle}" if cl else "Classe ?"
        elif m.destinataire_type == "PARENT" and m.destinataire_id:
            parent = parents_par_id.get(m.destinataire_id)
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


@router.post("/messages-parents", status_code=201, dependencies=[Depends(_require_admin)])
def send_message_to_parents(data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Admin envoie un message aux parents.
    data: { destinataire_type: PARENT|TOUS_PARENTS|CLASSE_PARENTS,
            destinataire_id: parent_id|classe_id|null,
            objet_type, sujet, contenu }

    AVANT LE LOT 5 : "TOUS_PARENTS" partait vers TOUS les parents de TOUTE
    la plateforme (Message n'avait pas de colonne établissement). Un message
    ciblé sur un parent_id ou un classe_id n'était pas non plus vérifié
    appartenir à cet établissement."""
    from app.models.academique import Parent, EleveParent, Eleve

    required = ["destinataire_type", "sujet"]
    for f in required:
        if f not in data:
            raise HTTPException(400, f"Champ requis: {f}")

    dest_type = data["destinataire_type"]
    if dest_type not in ["PARENT", "TOUS_PARENTS", "CLASSE_PARENTS"]:
        raise HTTPException(400, "destinataire_type invalide")

    destinataire_id = data.get("destinataire_id")
    if dest_type == "CLASSE_PARENTS":
        if not destinataire_id or not db.query(Classe.classe_id).filter(
            Classe.classe_id == destinataire_id, Classe.etablissement_id == etablissement_id
        ).first():
            raise HTTPException(404, "Classe introuvable pour cet établissement")
    elif dest_type == "PARENT":
        # Le parent doit avoir au moins un enfant dans CET établissement —
        # jamais accepté aveuglément depuis le body (Cas B : un parent
        # multi-écoles ne doit recevoir un message "au nom de cette école"
        # que s'il y a réellement un enfant).
        a_un_enfant_ici = destinataire_id and db.query(EleveParent).join(
            Eleve, Eleve.eleve_id == EleveParent.eleve_id
        ).filter(
            EleveParent.parent_id == destinataire_id, Eleve.etablissement_id == etablissement_id
        ).first()
        if not a_un_enfant_ici:
            raise HTTPException(404, "Parent introuvable pour cet établissement")

    msg = Message(
        etablissement_id=etablissement_id,
        expediteur_type="ADMIN",
        expediteur_id=None,
        destinataire_type=dest_type,
        destinataire_id=destinataire_id,
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

@router.get("/parents/stats", dependencies=[Depends(_require_admin)])
def get_parents_stats(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """KPIs globaux pour l'en-tête de la page Familles — indépendants de la
    pagination/recherche de l'annuaire (agrégats SQL, aucune boucle Python).
    Comme /parents-list : scopé aux parents ayant un enfant dans CET
    établissement, et ne compte que CES enfants-là (Cas B : jamais les
    enfants d'un même parent inscrits dans une autre école)."""
    eleve_ids_subq = db.query(Eleve.eleve_id).filter(Eleve.etablissement_id == etablissement_id).subquery()
    parent_ids_ici = db.query(EleveParent.parent_id).filter(
        EleveParent.eleve_id.in_(db.query(eleve_ids_subq))
    ).distinct().subquery()

    total_parents = db.query(func.count(Parent.parent_id)).filter(
        Parent.statut == "ACTIF", Parent.parent_id.in_(db.query(parent_ids_ici))
    ).scalar() or 0
    total_enfants = db.query(func.count(EleveParent.eleve_parent_id)).filter(
        EleveParent.eleve_id.in_(db.query(eleve_ids_subq))
    ).scalar() or 0
    avec_password = db.query(func.count(Parent.parent_id)).filter(
        Parent.statut == "ACTIF", Parent.mot_de_passe.isnot(None),
        Parent.parent_id.in_(db.query(parent_ids_ici))
    ).scalar() or 0
    avec_email = db.query(func.count(Parent.parent_id)).filter(
        Parent.statut == "ACTIF", Parent.email.isnot(None), Parent.email != "",
        Parent.parent_id.in_(db.query(parent_ids_ici))
    ).scalar() or 0
    return {
        "total_parents": total_parents,
        "total_enfants": total_enfants,
        "avec_password": avec_password,
        "avec_email": avec_email,
    }


@router.get("/parents/annuaire", dependencies=[Depends(_require_admin)])
def get_parents_annuaire(
    response: Response,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Retourne la liste des parents avec infos de base + nombre d'enfants, paginée.
    Comme /parents-list : scopé aux parents ayant un enfant dans CET
    établissement, et n'expose que CES enfants-là (Cas B).

    Réécrit pour éviter le N+1 (jusqu'à 4 requêtes PAR PARENT — liens, élève,
    inscription, classe) qui faisait timeout la page Familles dès que le nombre
    de parents a dépassé quelques centaines (2753 parents réels dans cette base).
    """
    eleve_ids_etab_subq = db.query(Eleve.eleve_id).filter(Eleve.etablissement_id == etablissement_id).subquery()
    parent_ids_ici_subq = db.query(EleveParent.parent_id).filter(
        EleveParent.eleve_id.in_(db.query(eleve_ids_etab_subq))
    ).distinct().subquery()

    query = db.query(Parent).filter(
        Parent.statut == "ACTIF", Parent.parent_id.in_(db.query(parent_ids_ici_subq))
    )
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (Parent.nom.ilike(like)) | (Parent.prenom.ilike(like)) |
            (Parent.telephone_1.ilike(like)) | (Parent.email.ilike(like))
        )

    response.headers["X-Total-Count"] = str(query.count())
    parents = query.order_by(Parent.prenom, Parent.nom).offset(skip).limit(limit).all()
    if not parents:
        return []

    parent_ids = [p.parent_id for p in parents]
    # Liens restreints aux enfants de CET établissement — jamais les
    # enfants d'un même parent inscrits ailleurs (Cas B).
    liens = db.query(EleveParent).join(Eleve, Eleve.eleve_id == EleveParent.eleve_id).filter(
        EleveParent.parent_id.in_(parent_ids), Eleve.etablissement_id == etablissement_id
    ).all()
    eleve_ids = {l.eleve_id for l in liens}

    eleves = {e.eleve_id: e for e in db.query(Eleve).filter(Eleve.eleve_id.in_(eleve_ids)).all()}
    inscriptions = {
        i.eleve_id: i for i in db.query(Inscription).filter(
            Inscription.eleve_id.in_(eleve_ids), Inscription.statut == "ACTIVE"
        ).all()
    }
    classe_ids = {i.classe_id for i in inscriptions.values()}
    classes = {c.classe_id: c for c in db.query(Classe).filter(Classe.classe_id.in_(classe_ids)).all()}

    liens_by_parent = {}
    for lien in liens:
        liens_by_parent.setdefault(lien.parent_id, []).append(lien)

    result = []
    for p in parents:
        enfants_list = []
        for lien in liens_by_parent.get(p.parent_id, []):
            eleve = eleves.get(lien.eleve_id)
            if not eleve:
                continue
            insc = inscriptions.get(eleve.eleve_id)
            classe_lib = classes[insc.classe_id].libelle if insc and insc.classe_id in classes else "—"
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
