"""
SMARTSCHOOL API — Portail Parent
Dashboard complet : enfants, notes, paiements, messages
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password
from app.core.auth import create_access_token, get_current_user
from app.core.rate_limit import limiter
from app.models.academique import (
    Parent, EleveParent, Eleve, Inscription, Classe, Matiere,
    Note, Evaluation, Bulletin, BulletinLigne, Facture, Paiement, Presence,
    Incident, CreneauEmploi, Enseignant, Affectation, TypeEvaluation, Trimestre,
    Message, EcheanceFacture, TypeFrais, PhotoEnAttente
)

router = APIRouter(prefix="/api/portail-parent", tags=["Portail Parent"])


# ── Dépendance de sécurité : ownership check ──────────────────────────────
async def _parent_auth(
    parent_id: int,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Vérifie que le token JWT appartient à ce parent (ou à un admin).
    Protège contre l'OWASP Broken Access Control sur le portail parent.
    """
    role = current_user.get("role", "")
    token_type = current_user.get("type", "")
    # Admins peuvent accéder à toutes les données
    if role in {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "INFORMATICIEN"}:
        return current_user
    # Portail parent : le token doit correspondre au parent_id demandé
    if token_type == "parent" and str(current_user.get("sub", "")) == str(parent_id):
        return current_user
    raise HTTPException(
        status_code=403,
        detail="Accès refusé : vous ne pouvez consulter que vos propres données",
    )


# ── Schéma login ──
class LoginParentRequest(BaseModel):
    telephone: str
    mot_de_passe: Optional[str] = None


# ================================================================
# IDENTIFICATION PARENT (POST sécurisé + rate limited)
# ================================================================
@router.post("/login")
@limiter.limit("5/minute")
def login_parent(request: Request, data: LoginParentRequest, db: Session = Depends(get_db)):
    """Identification par numéro de téléphone + mot de passe (POST sécurisé)."""
    parent = db.query(Parent).filter(
        (Parent.telephone_1 == data.telephone) | (Parent.telephone_2 == data.telephone)
    ).first()
    if not parent:
        raise HTTPException(404, "Aucun parent trouvé avec ce numéro")

    # Vérifier mot de passe si le parent en a un
    if parent.mot_de_passe:
        if not data.mot_de_passe:
            raise HTTPException(401, "Mot de passe requis")
        if not verify_password(data.mot_de_passe, parent.mot_de_passe):
            raise HTTPException(401, "Mot de passe incorrect")

    # Générer un token JWT pour le portail parent
    token = create_access_token({
        "sub": str(parent.parent_id),
        "type": "parent",
        "nom": parent.nom,
        "prenom": parent.prenom,
    })

    return {
        "token": token,
        "parent_id": parent.parent_id,
        "nom": parent.nom,
        "prenom": parent.prenom,
        "telephone": parent.telephone_1,
        "email": parent.email,
        "profession": parent.profession,
    }


# ================================================================
# DASHBOARD PARENT — VUE D'ENSEMBLE
# ================================================================
@router.get("/{parent_id}/dashboard")
def parent_dashboard(parent_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Dashboard complet du parent : enfants, résultats, paiements."""
    parent = db.query(Parent).filter(Parent.parent_id == parent_id).first()
    if not parent:
        raise HTTPException(404, "Parent non trouvé")

    # Get children via EleveParent
    liens = db.query(EleveParent).filter(EleveParent.parent_id == parent_id).all()
    
    enfants = []
    total_factures = 0
    total_paye = 0
    total_restant = 0
    
    for lien in liens:
        eleve = db.query(Eleve).filter(Eleve.eleve_id == lien.eleve_id).first()
        if not eleve:
            continue
        
        # Get current inscription
        inscription = db.query(Inscription).filter(
            Inscription.eleve_id == eleve.eleve_id,
            Inscription.statut == "ACTIVE"
        ).first()
        
        classe_code = "?"
        classe_libelle = "?"
        if inscription:
            cl = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
            if cl:
                classe_code = cl.code
                classe_libelle = cl.libelle
        
        # Get notes for this child
        notes_data = []
        if inscription:
            notes_raw = db.query(
                Note.valeur,
                Note.est_absent,
                Evaluation.libelle.label("eval_libelle"),
                Evaluation.note_sur,
                Evaluation.coefficient,
                Evaluation.date_evaluation,
                Matiere.libelle.label("matiere"),
            ).join(
                Evaluation, Note.evaluation_id == Evaluation.evaluation_id
            ).join(
                Matiere, Evaluation.matiere_id == Matiere.matiere_id
            ).filter(
                Note.inscription_id == inscription.inscription_id
            ).order_by(desc(Evaluation.date_evaluation)).all()
            
            for n in notes_raw:
                notes_data.append({
                    "matiere": n.matiere,
                    "evaluation": n.eval_libelle,
                    "note": float(n.valeur) if n.valeur else None,
                    "note_sur": float(n.note_sur) if n.note_sur else 20,
                    "coefficient": float(n.coefficient) if n.coefficient else 1,
                    "est_absent": n.est_absent == "O",
                    "date": str(n.date_evaluation) if n.date_evaluation else None,
                })
        
        # Calculate average
        valid_notes = [n for n in notes_data if n["note"] is not None and not n["est_absent"]]
        moyenne = None
        if valid_notes:
            total_w = sum(n["note"] * n["coefficient"] for n in valid_notes)
            total_c = sum(n["coefficient"] for n in valid_notes)
            moyenne = round(total_w / total_c, 2) if total_c > 0 else None
        
        # Get factures for this child (with echeances)
        factures = []
        if inscription:
            facs = db.query(Facture).filter(Facture.inscription_id == inscription.inscription_id).all()
            for f in facs:
                total_factures += float(f.montant_net or f.montant_total or 0)
                total_paye += float(f.montant_paye or 0)
                total_restant += float(f.montant_restant or 0)

                # Fetch echeances for this facture
                echeances_raw = db.query(EcheanceFacture).filter(
                    EcheanceFacture.facture_id == f.facture_id
                ).order_by(EcheanceFacture.date_limite).all()

                # Fetch type_frais label
                tf = db.query(TypeFrais).filter(TypeFrais.type_frais_id == f.type_frais_id).first() if f.type_frais_id else None

                factures.append({
                    "facture_id": f.facture_id,
                    "numero": f.numero_facture,
                    "date": str(f.date_facture) if f.date_facture else None,
                    "montant_total": float(f.montant_net or f.montant_total or 0),
                    "montant_paye": float(f.montant_paye or 0),
                    "montant_restant": float(f.montant_restant or 0),
                    "statut": f.statut,
                    "type_frais": tf.libelle if tf else "N/A",
                    "echeances": [
                        {
                            "echeance_id": e.echeance_id,
                            "libelle": e.libelle,
                            "date_limite": str(e.date_limite) if e.date_limite else None,
                            "montant_attendu": float(e.montant_attendu or 0),
                            "montant_paye": float(e.montant_paye or 0),
                            "statut": e.statut,
                        }
                        for e in echeances_raw
                    ],
                })
        
        # Get paiements for this child
        paiements = []
        if inscription:
            pays = db.query(Paiement).join(
                Facture, Paiement.facture_id == Facture.facture_id
            ).filter(
                Facture.inscription_id == inscription.inscription_id
            ).order_by(desc(Paiement.date_paiement)).all()
            for p in pays:
                paiements.append({
                    "paiement_id": p.paiement_id,
                    "numero_recu": p.numero_recu,
                    "date": str(p.date_paiement) if p.date_paiement else None,
                    "montant": float(p.montant),
                    "mode": p.mode_paiement,
                    "statut": p.statut,
                })
        
        # Get presences
        nb_present = 0
        nb_absent = 0
        if inscription:
            nb_present = db.query(Presence).filter(
                Presence.inscription_id == inscription.inscription_id,
                Presence.statut_presence == "PRESENT"
            ).count()
            nb_absent = db.query(Presence).filter(
                Presence.inscription_id == inscription.inscription_id,
                Presence.statut_presence.in_(["ABSENT", "ABSENT_JUSTIFIE"])
            ).count()

        enfants.append({
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "sexe": eleve.sexe,
            "photo_url": eleve.photo_url,
            "classe_code": classe_code,
            "classe": classe_libelle,
            "lien_parente": lien.lien_parente,
            "notes": notes_data[:10],  # last 10 notes
            "moyenne": moyenne,
            "nb_notes": len(notes_data),
            "factures": factures,
            "paiements": paiements,
            "nb_present": nb_present,
            "nb_absent": nb_absent,
            "statut": eleve.statut,
            "has_pending_photo": db.query(PhotoEnAttente).filter_by(entity_type='eleve', entity_id=eleve.eleve_id, statut='EN_ATTENTE').first() is not None,
        })
    
    return {
        "parent": {
            "parent_id": parent.parent_id,
            "nom": parent.nom,
            "prenom": parent.prenom,
            "telephone": parent.telephone_1,
            "email": parent.email,
            "profession": parent.profession,
            "photo_url": parent.photo_url,
            "has_pending_photo": db.query(PhotoEnAttente).filter_by(entity_type='parent', entity_id=parent.parent_id, statut='EN_ATTENTE').first() is not None,
        },
        "enfants": enfants,
        "finance_resume": {
            "total_factures": total_factures,
            "total_paye": total_paye,
            "total_restant": total_restant,
            "taux": round((total_paye / total_factures * 100), 1) if total_factures > 0 else 0,
        },
        "nb_enfants": len(enfants),
    }


# ================================================================
# DÉTAIL NOTES PAR ENFANT
# ================================================================
@router.get("/{parent_id}/enfant/{eleve_id}/notes")
def get_notes_enfant(parent_id: int, eleve_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Notes détaillées d'un enfant, groupées par matière."""
    # Verify parent-child link
    link = db.query(EleveParent).filter(
        EleveParent.parent_id == parent_id,
        EleveParent.eleve_id == eleve_id
    ).first()
    if not link:
        raise HTTPException(403, "Vous n'avez pas accès à cet élève")
    
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut == "ACTIVE"
    ).first()
    
    if not inscription:
        return {"notes_par_matiere": [], "moyenne_generale": None}
    
    notes_raw = db.query(
        Note.valeur, Note.est_absent, Note.observation,
        Evaluation.libelle.label("eval_libelle"),
        Evaluation.note_sur, Evaluation.coefficient, Evaluation.date_evaluation,
        Matiere.libelle.label("matiere"), Matiere.matiere_id,
    ).join(Evaluation, Note.evaluation_id == Evaluation.evaluation_id
    ).join(Matiere, Evaluation.matiere_id == Matiere.matiere_id
    ).filter(Note.inscription_id == inscription.inscription_id
    ).order_by(Matiere.libelle, desc(Evaluation.date_evaluation)).all()
    
    # Group by subject
    par_matiere = {}
    for n in notes_raw:
        if n.matiere not in par_matiere:
            par_matiere[n.matiere] = {"matiere": n.matiere, "notes": [], "moyenne": None}
        par_matiere[n.matiere]["notes"].append({
            "evaluation": n.eval_libelle,
            "note": float(n.valeur) if n.valeur else None,
            "note_sur": float(n.note_sur) if n.note_sur else 20,
            "coefficient": float(n.coefficient) if n.coefficient else 1,
            "est_absent": n.est_absent == "O",
            "date": str(n.date_evaluation) if n.date_evaluation else None,
            "observation": n.observation,
        })
    
    # Calculate averages per subject
    for mat_data in par_matiere.values():
        valid = [n for n in mat_data["notes"] if n["note"] is not None and not n["est_absent"]]
        if valid:
            total_w = sum(n["note"] * n["coefficient"] for n in valid)
            total_c = sum(n["coefficient"] for n in valid)
            mat_data["moyenne"] = round(total_w / total_c, 2) if total_c > 0 else None
    
    # General average
    all_valid = []
    for md in par_matiere.values():
        for n in md["notes"]:
            if n["note"] is not None and not n["est_absent"]:
                all_valid.append(n)
    
    moyenne_gen = None
    if all_valid:
        tw = sum(n["note"] * n["coefficient"] for n in all_valid)
        tc = sum(n["coefficient"] for n in all_valid)
        moyenne_gen = round(tw / tc, 2) if tc > 0 else None
    
    return {
        "notes_par_matiere": list(par_matiere.values()),
        "moyenne_generale": moyenne_gen,
    }


# ================================================================
# EMPLOI DU TEMPS DE L'ENFANT
# ================================================================
@router.get("/{parent_id}/enfant/{eleve_id}/emploi-du-temps")
def get_edt_enfant(parent_id: int, eleve_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Emploi du temps d'un enfant (via sa classe)."""
    link = db.query(EleveParent).filter(
        EleveParent.parent_id == parent_id,
        EleveParent.eleve_id == eleve_id
    ).first()
    if not link:
        raise HTTPException(403, "Accès refusé")
    
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        return []
    
    creneaux = db.query(CreneauEmploi).filter(
        CreneauEmploi.classe_id == inscription.classe_id,
        CreneauEmploi.statut == "ACTIVE"
    ).order_by(CreneauEmploi.jour, CreneauEmploi.heure_debut).all()
    
    result = []
    for c in creneaux:
        mat = db.query(Matiere).filter(Matiere.matiere_id == c.matiere_id).first()
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == c.enseignant_id).first() if c.enseignant_id else None
        result.append({
            "jour": c.jour,
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "matiere": mat.libelle if mat else "?",
            "enseignant": f"{ens.prenom} {ens.nom}" if ens else "—",
            "salle": c.salle,
        })
    return result


# ================================================================
# BULLETIN D'UN ENFANT (pour le parent)
# ================================================================
@router.get("/{parent_id}/enfant/{eleve_id}/bulletin")
def get_bulletin_enfant(parent_id: int, eleve_id: int, trimestre_id: int = 1, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Bulletin complet d'un enfant, avec lignes par matière."""
    link = db.query(EleveParent).filter(
        EleveParent.parent_id == parent_id,
        EleveParent.eleve_id == eleve_id
    ).first()
    if not link:
        raise HTTPException(403, "Accès refusé")

    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        return None

    bulletin = db.query(Bulletin).filter(
        Bulletin.inscription_id == inscription.inscription_id,
        Bulletin.trimestre_id == trimestre_id,
        Bulletin.statut == "PUBLIE"
    ).first()
    if not bulletin:
        return None

    # Récupérer les lignes du bulletin
    lignes = db.query(BulletinLigne).filter(
        BulletinLigne.bulletin_id == bulletin.bulletin_id
    ).all()
    matiere_ids = {l.matiere_id for l in lignes}
    matieres_by_id = {m.matiere_id: m for m in db.query(Matiere).filter(Matiere.matiere_id.in_(matiere_ids)).all()}

    # Info classe
    cl = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    from app.api.evaluations import get_bulletin_display_flags
    flags = get_bulletin_display_flags(db, cl.etablissement_id if cl else 1)

    matieres = []
    total_coef = 0
    for ligne in lignes:
        mat = matieres_by_id.get(ligne.matiere_id)
        matieres.append({
            "matiere": mat.libelle if mat else "?",
            "coefficient": float(ligne.coefficient) if ligne.coefficient else 1,
            "moyenne_eleve": float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else None,
            "moyenne_classe": float(ligne.moyenne_classe) if ligne.moyenne_classe is not None and flags["show_stats_matiere"] else None,
            "note_min": float(ligne.note_min) if ligne.note_min is not None and flags["show_stats_matiere"] else None,
            "note_max": float(ligne.note_max) if ligne.note_max is not None and flags["show_stats_matiere"] else None,
            "appreciation": ligne.appreciation if flags["show_appreciation"] else None,
        })
        total_coef += float(ligne.coefficient) if ligne.coefficient else 1

    return {
        "bulletin_id": bulletin.bulletin_id,
        "classe": cl.libelle if cl else "?",
        "trimestre_id": trimestre_id,
        "moyenne_generale": float(bulletin.moyenne_generale) if bulletin.moyenne_generale is not None else None,
        "rang": bulletin.rang if flags["show_rang"] else None,
        "effectif_classe": bulletin.effectif_classe if flags["show_rang"] and flags["show_effectif"] else None,
        "mention": bulletin.mention if flags["show_mention"] else None,
        "decision": bulletin.decision,
        "total_coefficient": total_coef,
        "matieres": matieres,
    }


# ================================================================
# ABSENCES DÉTAILLÉES D'UN ENFANT
# ================================================================
@router.get("/{parent_id}/enfant/{eleve_id}/absences")
def get_absences_enfant(parent_id: int, eleve_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Détail des absences d'un enfant."""
    link = db.query(EleveParent).filter(
        EleveParent.parent_id == parent_id,
        EleveParent.eleve_id == eleve_id
    ).first()
    if not link:
        raise HTTPException(403, "Accès refusé")

    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        return {"presences": [], "total_present": 0, "total_absent": 0}

    presences = db.query(Presence).filter(
        Presence.inscription_id == inscription.inscription_id
    ).order_by(desc(Presence.date_presence)).limit(50).all()

    result = []
    for p in presences:
        result.append({
            "date": str(p.date_presence) if p.date_presence else None,
            "statut": p.statut_presence,
            "demi_journee": p.demi_journee,
            "est_justifie": p.est_justifie,
            "motif": p.motif,
            "justification": p.motif,
        })

    nb_present = db.query(Presence).filter(
        Presence.inscription_id == inscription.inscription_id,
        Presence.statut_presence == "PRESENT"
    ).count()
    nb_absent = db.query(Presence).filter(
        Presence.inscription_id == inscription.inscription_id,
        Presence.statut_presence.in_(["ABSENT", "ABSENT_JUSTIFIE"])
    ).count()

    return {
        "presences": result,
        "total_present": nb_present,
        "total_absent": nb_absent,
    }


# ================================================================
# MESSAGERIE PARENT
# ================================================================

@router.get("/{parent_id}/messages")
def get_messages_parent(parent_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Messages reçus et envoyés par un parent."""
    parent = db.query(Parent).filter(Parent.parent_id == parent_id).first()
    if not parent:
        raise HTTPException(404, "Parent non trouvé")

    # Get children IDs for this parent
    liens = db.query(EleveParent).filter(EleveParent.parent_id == parent_id).all()
    children_classe_ids = []
    for lien in liens:
        insc = db.query(Inscription).filter(
            Inscription.eleve_id == lien.eleve_id, Inscription.statut == "ACTIVE"
        ).first()
        if insc:
            children_classe_ids.append(insc.classe_id)

    # Messages sent directly to this parent OR to all parents OR to parent's class
    from sqlalchemy import or_
    filters = [
        (Message.destinataire_type == "PARENT") & (Message.destinataire_id == parent_id),
        (Message.destinataire_type == "TOUS_PARENTS"),
        (Message.destinataire_type == "TOUS"),
    ]
    for cid in children_classe_ids:
        filters.append(
            (Message.destinataire_type == "CLASSE_PARENTS") & (Message.destinataire_id == cid)
        )

    received = db.query(Message).filter(
        or_(*filters)
    ).order_by(desc(Message.date_envoi)).limit(50).all()

    # Messages sent by this parent
    sent = db.query(Message).filter(
        Message.expediteur_type == "PARENT",
        Message.expediteur_id == parent_id
    ).order_by(desc(Message.date_envoi)).limit(20).all()

    def format_msg(m):
        return {
            "message_id": m.message_id,
            "expediteur_type": m.expediteur_type,
            "expediteur_id": m.expediteur_id,
            "destinataire_type": m.destinataire_type,
            "destinataire_id": m.destinataire_id,
            "objet_type": m.objet_type,
            "sujet": m.sujet,
            "contenu": m.contenu,
            "statut": m.statut,
            "date_envoi": str(m.date_envoi) if m.date_envoi else None,
            "date_lecture": str(m.date_lecture) if m.date_lecture else None,
        }

    return {
        "received": [format_msg(m) for m in received],
        "sent": [format_msg(m) for m in sent],
    }


@router.get("/{parent_id}/messages/non-lus")
def count_non_lus_parent(parent_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Nombre de messages non lus."""
    from sqlalchemy import or_

    liens = db.query(EleveParent).filter(EleveParent.parent_id == parent_id).all()
    children_classe_ids = []
    for lien in liens:
        insc = db.query(Inscription).filter(
            Inscription.eleve_id == lien.eleve_id, Inscription.statut == "ACTIVE"
        ).first()
        if insc:
            children_classe_ids.append(insc.classe_id)

    filters = [
        (Message.destinataire_type == "PARENT") & (Message.destinataire_id == parent_id),
        (Message.destinataire_type == "TOUS_PARENTS"),
        (Message.destinataire_type == "TOUS"),
    ]
    for cid in children_classe_ids:
        filters.append(
            (Message.destinataire_type == "CLASSE_PARENTS") & (Message.destinataire_id == cid)
        )

    count = db.query(Message).filter(
        or_(*filters),
        Message.statut == "ENVOYE"
    ).count()

    return {"non_lus": count}


@router.put("/{parent_id}/messages/{message_id}/lire")
def marquer_lu_parent(parent_id: int, message_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Marquer un message comme lu."""
    msg = db.query(Message).filter(Message.message_id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message non trouvé")
    if msg.statut == "ENVOYE":
        from datetime import datetime
        msg.statut = "LU"
        msg.date_lecture = datetime.now()
        db.commit()
    return {"message": "OK"}


class ParentMessageSend(BaseModel):
    sujet: str
    contenu: str
    objet_type: str = "GENERAL"


@router.post("/{parent_id}/messages/envoyer")
def envoyer_message_parent(parent_id: int, data: ParentMessageSend, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Parent envoie un message à l'administration."""
    parent = db.query(Parent).filter(Parent.parent_id == parent_id).first()
    if not parent:
        raise HTTPException(404, "Parent non trouvé")

    msg = Message(
        expediteur_type="PARENT",
        expediteur_id=parent_id,
        destinataire_type="ADMIN",
        destinataire_id=None,
        objet_type=data.objet_type,
        sujet=data.sujet,
        contenu=data.contenu,
    )
    db.add(msg)
    db.commit()
    return {"message": "✅ Message envoyé", "message_id": msg.message_id}


# ================================================================
# PROFIL PARENT DÉTAILLÉ
# ================================================================
@router.get("/{parent_id}/profil")
def get_profil_parent(parent_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Profil complet du parent avec enfants détaillés."""
    parent = db.query(Parent).filter(Parent.parent_id == parent_id).first()
    if not parent:
        raise HTTPException(404, "Parent non trouvé")

    liens = db.query(EleveParent).filter(EleveParent.parent_id == parent_id).all()
    enfants = []
    for lien in liens:
        eleve = db.query(Eleve).filter(Eleve.eleve_id == lien.eleve_id).first()
        if not eleve:
            continue
        inscription = db.query(Inscription).filter(
            Inscription.eleve_id == eleve.eleve_id, Inscription.statut == "ACTIVE"
        ).first()
        classe_lib = "?"
        classe_code = "?"
        niveau = "?"
        if inscription:
            cl = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
            if cl:
                classe_lib = cl.libelle
                classe_code = cl.code

        enfants.append({
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "sexe": eleve.sexe,
            "date_naissance": str(eleve.date_naissance) if eleve.date_naissance else None,
            "lieu_naissance": eleve.lieu_naissance,
            "classe": classe_lib,
            "classe_code": classe_code,
            "lien_parente": lien.lien_parente,
            "statut": eleve.statut,
            "photo_url": eleve.photo_url,
        })

    return {
        "parent_id": parent.parent_id,
        "nom": parent.nom,
        "prenom": parent.prenom,
        "telephone_1": parent.telephone_1,
        "telephone_2": parent.telephone_2,
        "email": parent.email,
        "profession": parent.profession,
        "adresse": parent.adresse,
        "quartier": parent.quartier,
        "sexe": parent.sexe,
        "statut": parent.statut,
        "photo_url": parent.photo_url,
        "has_password": bool(parent.mot_de_passe),
        "nb_enfants": len(enfants),
        "enfants": enfants,
    }


# ================================================================
# CHANGER MOT DE PASSE PARENT
# ================================================================
class ChangePasswordParentRequest(BaseModel):
    ancien_mdp: Optional[str] = None
    nouveau_mdp: str


@router.put("/{parent_id}/changer-mot-de-passe")
def changer_mot_de_passe_parent(parent_id: int, data: ChangePasswordParentRequest, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Permet au parent de changer son mot de passe."""
    from app.core.security import hash_password
    parent = db.query(Parent).filter(Parent.parent_id == parent_id).first()
    if not parent:
        raise HTTPException(404, "Parent non trouvé")

    if parent.mot_de_passe:
        if not data.ancien_mdp:
            raise HTTPException(400, "L'ancien mot de passe est requis")
        if not verify_password(data.ancien_mdp, parent.mot_de_passe):
            raise HTTPException(401, "Ancien mot de passe incorrect")

    if len(data.nouveau_mdp) < 6:
        raise HTTPException(400, "Le nouveau mot de passe doit faire au moins 6 caractères")

    parent.mot_de_passe = hash_password(data.nouveau_mdp)
    db.commit()
    return {"message": "Mot de passe modifié avec succès"}


# ================================================================
# MODIFIER PROFIL PARENT (admin ou self)
# ================================================================
class UpdateParentRequest(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    telephone_1: Optional[str] = None
    telephone_2: Optional[str] = None
    email: Optional[str] = None
    profession: Optional[str] = None
    adresse: Optional[str] = None
    mot_de_passe: Optional[str] = None


@router.put("/{parent_id}/profil")
def update_profil_parent(parent_id: int, data: UpdateParentRequest, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Modifier les informations du parent."""
    parent = db.query(Parent).filter(Parent.parent_id == parent_id).first()
    if not parent:
        raise HTTPException(404, "Parent non trouvé")

    if data.nom is not None: parent.nom = data.nom
    if data.prenom is not None: parent.prenom = data.prenom
    if data.telephone_1 is not None: parent.telephone_1 = data.telephone_1
    if data.telephone_2 is not None: parent.telephone_2 = data.telephone_2
    if data.email is not None: parent.email = data.email
    if data.profession is not None: parent.profession = data.profession
    if data.adresse is not None: parent.adresse = data.adresse
    if data.mot_de_passe is not None and data.mot_de_passe.strip():
        from app.core.security import hash_password
        parent.mot_de_passe = hash_password(data.mot_de_passe.strip())

    db.commit()
    return {"message": "Profil mis à jour avec succès"}


# ── Fournitures scolaires pour les enfants du parent ──
@router.get("/{parent_id}/fournitures")
def fournitures_parent(parent_id: int, _auth: dict = Depends(_parent_auth), db: Session = Depends(get_db)):
    """Retourne les fournitures de chaque enfant inscrit du parent."""
    from app.models.academique import FournitureScolaire
    enfants = db.query(Eleve).join(EleveParent).filter(
        EleveParent.parent_id == parent_id
    ).all()
    result = []
    for enf in enfants:
        inscr = db.query(Inscription).filter(
            Inscription.eleve_id == enf.eleve_id,
            Inscription.statut.in_(["ACTIVE", "INSCRIT"])
        ).first()
        if not inscr:
            continue
        cls = db.query(Classe).filter(Classe.classe_id == inscr.classe_id).first()
        items = db.query(FournitureScolaire).filter(
            FournitureScolaire.classe_id == inscr.classe_id,
            FournitureScolaire.statut == "ACTIF"
        ).order_by(FournitureScolaire.categorie, FournitureScolaire.nom).all()
        result.append({
            "eleve_id": enf.eleve_id,
            "nom": enf.nom,
            "prenom": enf.prenom,
            "classe": cls.libelle if cls else "—",
            "classe_id": inscr.classe_id,
            "fournitures": [
                {
                    "fourniture_id": f.fourniture_id,
                    "nom": f.nom,
                    "description": f.description,
                    "categorie": f.categorie,
                    "quantite": f.quantite,
                    "prix_unitaire": float(f.prix_unitaire) if f.prix_unitaire else None,
                    "unite": f.unite,
                    "obligatoire": f.obligatoire,
                }
                for f in items
            ]
        })
    return result

# ── Téléchargement du reçu PDF pour un parent ─────────────────────────────
# Le router /api/finance est protégé par FINANCE_ROLES : un token parent ne
# peut pas l'appeler. On expose donc le même reçu ici, dans un endpoint dont
# le seul prérequis est d'être authentifié comme parent (ou admin) ET que le
# paiement concerne un enfant de ce parent.
@router.get("/paiements/{paiement_id}/recu-pdf")
def recu_pdf_parent(
    paiement_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Génère et retourne le reçu PDF d'un paiement. Accessible au parent concerné et aux admins."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.lib.units import cm
    from fastapi.responses import StreamingResponse
    import io

    # Récupérer le paiement + facture + inscription + élève + classe
    result = (
        db.query(Paiement, Facture, Inscription, Eleve, Classe)
        .join(Facture, Paiement.facture_id == Facture.facture_id)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .filter(Paiement.paiement_id == paiement_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Paiement non trouvé")

    paiement, facture, inscription, eleve, classe = result

    # Vérification ownership : si le rôle est PARENT, s'assurer que cet élève
    # est bien rattaché au parent connecté. Les admins/comptables passent librement.
    role = current_user.get("role", "")
    if role not in ("ADMIN", "DIRECTEUR", "COMPTABLE", "SECRETAIRE"):
        parent_id = current_user.get("id") or current_user.get("sub")
        if not parent_id:
            raise HTTPException(status_code=403, detail="Accès refusé")
        lien = db.query(EleveParent).filter(
            EleveParent.eleve_id == eleve.eleve_id,
            EleveParent.parent_id == int(parent_id),
        ).first()
        if not lien:
            raise HTTPException(status_code=403, detail="Accès refusé")

    # Récupérer l'établissement
    from app.models.academique import Etablissement
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()
    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    adresse_ecole = getattr(etablissement, "adresse", "") or ""
    tel_ecole = getattr(etablissement, "telephone", "") or ""

    # Type de frais
    type_frais_obj = None
    if facture.type_frais_id:
        type_frais_obj = db.query(TypeFrais).filter(TypeFrais.type_frais_id == facture.type_frais_id).first()
    libelle_type_frais = type_frais_obj.libelle if type_frais_obj else "Frais Scolaires"

    # Date du paiement formatée
    date_str = "—"
    if paiement.date_paiement:
        try:
            date_str = paiement.date_paiement.strftime("%d/%m/%Y")
        except Exception:
            date_str = str(paiement.date_paiement)

    # Générer le PDF
    buffer = io.BytesIO()
    largeur, hauteur = A4
    pdf = pdf_canvas.Canvas(buffer, pagesize=A4)
    y = hauteur - 4.0 * cm

    # En-tête école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.6 * cm
    if adresse_ecole:
        pdf.setFont("Helvetica", 9)
        pdf.drawCentredString(largeur / 2, y, adresse_ecole)
        y -= 0.5 * cm
    if tel_ecole:
        pdf.setFont("Helvetica", 9)
        pdf.drawCentredString(largeur / 2, y, f"Tél : {tel_ecole}")
        y -= 0.5 * cm

    # Ligne de séparation
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)
    y -= 0.6 * cm

    # Titre
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, "REÇU DE PAIEMENT")
    y -= 0.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(largeur / 2, y, f"N° {paiement.numero_recu}")
    y -= 0.8 * cm

    # Section Élève
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE L'ÉLÈVE")
    y -= 0.15 * cm
    pdf.setLineWidth(0.5)
    pdf.setStrokeColorRGB(0.5, 0.5, 0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)
    y -= 0.45 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Nom complet :  {eleve.prenom} {eleve.nom}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Matricule :  {eleve.matricule or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Classe :  {classe.libelle}")
    y -= 0.8 * cm

    # Section Paiement
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "DÉTAILS DU PAIEMENT")
    y -= 0.15 * cm
    pdf.line(2 * cm, y, largeur - 2 * cm, y)
    y -= 0.45 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Motif :  {libelle_type_frais}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant payé :  {float(paiement.montant):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Mode de paiement :  {paiement.mode_paiement or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Date du paiement :  {date_str}")
    y -= 0.5 * cm
    if paiement.reference_externe:
        pdf.drawString(2.5 * cm, y, f"Référence :  {paiement.reference_externe}")
        y -= 0.5 * cm
    y -= 0.3 * cm

    # Section Facture
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "RÉCAPITULATIF")
    y -= 0.15 * cm
    pdf.line(2 * cm, y, largeur - 2 * cm, y)
    y -= 0.45 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"N° Facture :  {facture.numero_facture}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Total facturé :  {float(facture.montant_total):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Total payé :  {float(facture.montant_paye):,.0f} GNF")
    y -= 0.5 * cm
    restant = float(facture.montant_restant or 0)
    pdf.drawString(2.5 * cm, y, f"Reste à payer :  {restant:,.0f} GNF")
    y -= 1.0 * cm

    # Pied de page
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.setFillColorRGB(0.5, 0.5, 0.5)
    pdf.drawCentredString(largeur / 2, 1.5 * cm, "Ce reçu est un document officiel émis par le système de gestion SmartSchool.")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    filename = f"recu_{paiement.numero_recu}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ── Téléchargement de la Facture PDF pour un parent ───────────────────────
@router.get("/factures/{facture_id}/pdf")
def facture_pdf_parent(
    facture_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Génère et retourne la facture PDF. Accessible au parent concerné et aux admins."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.lib.units import cm
    from fastapi.responses import StreamingResponse
    import io

    # Récupérer la facture + inscription + élève + classe
    result = (
        db.query(Facture, Inscription, Eleve, Classe, TypeFrais)
        .join(Inscription, Facture.inscription_id == Inscription.inscription_id)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .outerjoin(TypeFrais, Facture.type_frais_id == TypeFrais.type_frais_id)
        .filter(Facture.facture_id == facture_id)
        .first()
    )

    if not result:
        raise HTTPException(status_code=404, detail="Facture non trouvée")

    facture, inscription, eleve, classe, type_frais = result

    # Vérification ownership
    role = current_user.get("role", "")
    if role not in ("ADMIN", "DIRECTEUR", "COMPTABLE", "SECRETAIRE"):
        parent_id = current_user.get("id") or current_user.get("sub")
        if not parent_id:
            raise HTTPException(status_code=403, detail="Accès refusé")
        lien = db.query(EleveParent).filter(
            EleveParent.eleve_id == eleve.eleve_id,
            EleveParent.parent_id == int(parent_id),
        ).first()
        if not lien:
            raise HTTPException(status_code=403, detail="Accès refusé")

    # Récupérer l'établissement
    from app.models.academique import Etablissement
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()
    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    adresse_ecole = getattr(etablissement, "adresse", "") or ""
    tel_ecole = getattr(etablissement, "telephone", "") or ""
    email_ecole = getattr(etablissement, "email", "") or ""

    # Générer le PDF
    buffer = io.BytesIO()
    largeur, hauteur = A4
    pdf = pdf_canvas.Canvas(buffer, pagesize=A4)
    y = hauteur - 2 * cm

    # En-tête école
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 9)
    if adresse_ecole:
        pdf.drawCentredString(largeur / 2, y, adresse_ecole)
        y -= 0.4 * cm
    if tel_ecole or email_ecole:
        contact = f"Tél: {tel_ecole}" if tel_ecole else ""
        if email_ecole:
            contact += f"  |  Email: {email_ecole}" if contact else f"Email: {email_ecole}"
        pdf.drawCentredString(largeur / 2, y, contact)
        y -= 0.4 * cm

    y -= 0.5 * cm
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(0.2, 0.4, 0.8)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)

    # Titre Facture
    y -= 1.2 * cm
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, "FACTURE")
    y -= 0.8 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(largeur / 2, y, f"N° {facture.numero_facture}")
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(largeur / 2, y, f"Date: {facture.date_facture}")

    # Section Élève
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "INFORMATIONS DE L'ÉLÈVE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.setStrokeColorRGB(0.5, 0.5, 0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    pdf.drawString(2.5 * cm, y, f"Nom complet :  {eleve.prenom} {eleve.nom}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Matricule :  {eleve.matricule or 'N/A'}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Classe :  {classe.libelle}")

    # Section Détails Facture
    y -= 1.5 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2 * cm, y, "DÉTAILS DE LA FACTURE")
    y -= 0.2 * cm
    pdf.setLineWidth(0.5)
    pdf.line(2 * cm, y, largeur - 2 * cm, y)
    
    y -= 0.6 * cm
    pdf.setFont("Helvetica", 10)
    libelle_frais = type_frais.libelle if type_frais else "Frais Scolaires"
    pdf.drawString(2.5 * cm, y, f"Motif :  {libelle_frais}")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Statut :  {facture.statut}")

    y -= 1.0 * cm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(2.5 * cm, y, f"Montant Total : {float(facture.montant_total or 0):,.0f} GNF")
    y -= 0.5 * cm
    if float(facture.montant_remise or 0) > 0:
        pdf.drawString(2.5 * cm, y, f"Remise : -{float(facture.montant_remise):,.0f} GNF")
        y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant Net : {float(facture.montant_net or 0):,.0f} GNF")
    y -= 0.5 * cm
    pdf.drawString(2.5 * cm, y, f"Montant Payé : {float(facture.montant_paye or 0):,.0f} GNF")
    y -= 0.7 * cm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColorRGB(0.8, 0.1, 0.1)
    pdf.drawString(2.5 * cm, y, f"Reste à payer : {float(facture.montant_restant or 0):,.0f} GNF")
    
    pdf.setFillColorRGB(0, 0, 0)

    # Pied de page
    y -= 3 * cm
    pdf.setFont("Helvetica", 9)
    pdf.drawCentredString(largeur / 2, y, "Merci de votre confiance.")
    
    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture_{facture.numero_facture}.pdf"}
    )
