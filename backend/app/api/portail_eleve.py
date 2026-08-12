"""
SMARTSCHOOL API — Portail Élève
Dashboard personnel : notes, absences, emploi du temps, bulletin, messages
"""
import os
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, desc, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_password, hash_password
from app.core.auth import create_access_token, get_current_user
from app.core.rate_limit import limiter
from app.models.academique import (
    Eleve, Inscription, Classe, Matiere,
    Note, Evaluation, Bulletin, BulletinLigne, Facture, Paiement, Presence,
    CreneauEmploi, Enseignant, Affectation, Trimestre, Message,
    RessourcePedagogique, FournitureScolaire, Devoir,
)

router = APIRouter(prefix="/api/portail-eleve", tags=["Portail Élève"])

# Mot de passe par défaut — configurable via variable d'environnement
DEFAULT_PASSWORD = os.getenv("ELEVE_DEFAULT_PASSWORD", "smartschool")


# Rôles qui peuvent consulter le portail d'un autre — dans leur école.
ADMIN_PORTAIL_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "INFORMATICIEN"}


# ── Dépendance de sécurité : ownership check ─────────────────────────
async def _eleve_auth(
    eleve_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Vérifie que le token JWT appartient à cet élève (ou à un admin DE SON ÉCOLE).

    Protège contre l'OWASP Broken Access Control sur le portail élève.

    Le raccourci « les admins voient tout » datait du mono-établissement : un
    administrateur de l'école A pouvait lire les notes, le bulletin et le
    classement de n'importe quel élève de la plateforme en passant son
    identifiant. Son périmètre s'arrête désormais à son école.
    """
    role = current_user.get("role", "")
    token_type = current_user.get("type", "")
    if role in ADMIN_PORTAIL_ROLES:
        etablissement_id = current_user.get("etablissement_id")
        if etablissement_id is None:
            # SUPER_ADMIN plateforme : il doit d'abord entrer dans une école
            # (POST /api/auth/etablissement-actif), comme partout ailleurs.
            raise HTTPException(
                403, "Établissement non déterminé pour ce compte : choisissez un établissement."
            )
        existe = db.query(Eleve.eleve_id).filter(
            Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
        ).first()
        if not existe:
            # 404 et non 403 : ne jamais confirmer qu'un élève existe ailleurs.
            raise HTTPException(404, "Élève non trouvé")
        return current_user
    # Portail élève : le token doit correspondre à l'eleve_id demandé
    if token_type == "eleve" and str(current_user.get("sub", "")) == str(eleve_id):
        return current_user
    raise HTTPException(
        status_code=403,
        detail="Accès refusé : vous ne pouvez consulter que vos propres données",
    )


# ── Schéma login ──
class LoginEleveRequest(BaseModel):
    matricule: str
    mot_de_passe: Optional[str] = None


# ================================================================
# IDENTIFICATION ÉLÈVE (POST sécurisé + rate limited)
# ================================================================
@router.post("/login")
@limiter.limit("5/minute")
def login_eleve(request: Request, data: LoginEleveRequest, db: Session = Depends(get_db)):
    """Connexion par matricule + mot de passe (défaut: smartschool)."""
    eleve = db.query(Eleve).filter(Eleve.matricule == data.matricule).first()
    if not eleve:
        raise HTTPException(404, "Aucun élève trouvé avec ce matricule")

    mdp_saisi = data.mot_de_passe or ""
    if eleve.mot_de_passe:
        # Mot de passe personnalisé — vérification bcrypt
        if not verify_password(mdp_saisi, eleve.mot_de_passe):
            raise HTTPException(401, "Mot de passe incorrect")
    else:
        # Aucun MDP défini → mot de passe par défaut
        if mdp_saisi != DEFAULT_PASSWORD:
            raise HTTPException(401, "Mot de passe incorrect")

    token = create_access_token({
        "sub": str(eleve.eleve_id),
        "type": "eleve",
        "nom": eleve.nom,
        "prenom": eleve.prenom,
    })

    return {
        "token": token,
        "eleve_id": eleve.eleve_id,
        "nom": eleve.nom,
        "prenom": eleve.prenom,
        "matricule": eleve.matricule,
        "photo_url": eleve.photo_url,
    }


# ================================================================
# DASHBOARD ÉLÈVE — VUE D'ENSEMBLE
# ================================================================
@router.get("/{eleve_id}/dashboard")
def eleve_dashboard(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Dashboard complet de l'élève : notes, absences, factures résumées."""
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")

    # Inscription active
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut == "ACTIVE"
    ).first()

    classe_code = "?"
    classe_libelle = "?"
    classe_id = None
    if inscription:
        cl = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
        if cl:
            classe_code = cl.code
            classe_libelle = cl.libelle
            classe_id = cl.classe_id

    # Notes récentes
    notes_data = []
    moyenne = None
    nb_notes = 0
    if inscription:
        notes_raw = db.query(
            Note.valeur, Note.est_absent,
            Evaluation.libelle.label("eval_libelle"),
            Evaluation.note_sur, Evaluation.coefficient, Evaluation.date_evaluation,
            Matiere.libelle.label("matiere"),
        ).join(Evaluation, Note.evaluation_id == Evaluation.evaluation_id
        ).join(Matiere, Evaluation.matiere_id == Matiere.matiere_id
        ).filter(Note.inscription_id == inscription.inscription_id
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

        nb_notes = len(notes_data)
        valid = [n for n in notes_data if n["note"] is not None and not n["est_absent"]]
        if valid:
            tw = sum(n["note"] * n["coefficient"] for n in valid)
            tc = sum(n["coefficient"] for n in valid)
            moyenne = round(tw / tc, 2) if tc > 0 else None

    # Absences
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

    # Finance
    total_factures = 0
    total_paye = 0
    total_restant = 0
    factures_list = []
    paiements_list = []
    if inscription:
        facs = db.query(Facture).filter(Facture.inscription_id == inscription.inscription_id).all()
        for f in facs:
            total_factures += float(f.montant_net or f.montant_total or 0)
            total_paye += float(f.montant_paye or 0)
            total_restant += float(f.montant_restant or 0)
            factures_list.append({
                "facture_id": f.facture_id,
                "numero": f.numero_facture,
                "date": str(f.date_facture) if f.date_facture else None,
                "montant_total": float(f.montant_net or f.montant_total or 0),
                "montant_paye": float(f.montant_paye or 0),
                "montant_restant": float(f.montant_restant or 0),
                "statut": f.statut,
            })
        # Get paiements
        pays = db.query(Paiement).join(
            Facture, Paiement.facture_id == Facture.facture_id
        ).filter(
            Facture.inscription_id == inscription.inscription_id
        ).order_by(desc(Paiement.date_paiement)).all()
        for p in pays:
            paiements_list.append({
                "paiement_id": p.paiement_id,
                "numero_recu": p.numero_recu,
                "date": str(p.date_paiement) if p.date_paiement else None,
                "montant": float(p.montant),
                "mode": p.mode_paiement,
                "statut": p.statut,
            })

    # Emploi du temps du jour
    jours_map = {0: "LUNDI", 1: "MARDI", 2: "MERCREDI", 3: "JEUDI", 4: "VENDREDI", 5: "SAMEDI", 6: "DIMANCHE"}
    aujourd_hui = jours_map.get(date.today().weekday(), "LUNDI")
    cours_du_jour = []
    if inscription:
        creneaux = db.query(CreneauEmploi, Matiere, Enseignant)\
            .join(Matiere, CreneauEmploi.matiere_id == Matiere.matiere_id)\
            .outerjoin(Enseignant, CreneauEmploi.enseignant_id == Enseignant.enseignant_id)\
            .filter(
                CreneauEmploi.classe_id == inscription.classe_id,
                CreneauEmploi.jour == aujourd_hui,
                CreneauEmploi.statut == "ACTIVE"
            ).order_by(CreneauEmploi.heure_debut).all()
        for c, mat, ens in creneaux:
            cours_du_jour.append({
                "heure_debut": c.heure_debut,
                "heure_fin": c.heure_fin,
                "matiere": mat.libelle if mat else "?",
                "enseignant": f"{ens.prenom} {ens.nom}" if ens else "—",
                "salle": c.salle,
            })

    # Messages non lus
    filters_non_lus = [
        (Message.destinataire_type == "ELEVE") & (Message.destinataire_id == eleve_id),
        Message.destinataire_type == "TOUS"
    ]
    if classe_id:
        filters_non_lus.append((Message.destinataire_type == "CLASSE") & (Message.destinataire_id == classe_id))

    nb_messages_non_lus = db.query(Message).filter(
        or_(*filters_non_lus),
        Message.statut == "ENVOYE"
    ).count()

    return {
        "eleve": {
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "sexe": eleve.sexe,
            "photo_url": eleve.photo_url,
            "date_naissance": str(eleve.date_naissance) if eleve.date_naissance else None,
            "lieu_naissance": eleve.lieu_naissance,
            "statut": eleve.statut,
            "classe_code": classe_code,
            "classe": classe_libelle,
            "classe_id": classe_id,
        },
        "moyenne": moyenne,
        "nb_notes": nb_notes,
        "nb_present": nb_present,
        "nb_absent": nb_absent,
        "taux_presence": round(nb_present / (nb_present + nb_absent) * 100, 1) if (nb_present + nb_absent) > 0 else 100,
        "finance": {
            "total_factures": total_factures,
            "total_paye": total_paye,
            "total_restant": total_restant,
            "taux": round((total_paye / total_factures * 100), 1) if total_factures > 0 else 0,
            "factures": factures_list,
            "paiements": paiements_list,
        },
        "cours_du_jour": cours_du_jour,
        "notes_recentes": notes_data[:8],
        "nb_messages_non_lus": nb_messages_non_lus,
    }


# ================================================================
# NOTES PAR MATIÈRE
# ================================================================
@router.get("/{eleve_id}/notes")
def get_notes_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Notes groupées par matière."""
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
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

    par_matiere: dict = {}
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

    for md in par_matiere.values():
        valid = [n for n in md["notes"] if n["note"] is not None and not n["est_absent"]]
        if valid:
            tw = sum(n["note"] * n["coefficient"] for n in valid)
            tc = sum(n["coefficient"] for n in valid)
            md["moyenne"] = round(tw / tc, 2) if tc > 0 else None

    all_valid = [n for md in par_matiere.values() for n in md["notes"]
                 if n["note"] is not None and not n["est_absent"]]
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
# EMPLOI DU TEMPS
# ================================================================
@router.get("/{eleve_id}/emploi-du-temps")
def get_edt_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Emploi du temps complet de l'élève via sa classe."""
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        return []

    creneaux = db.query(CreneauEmploi, Matiere, Enseignant)\
        .join(Matiere, CreneauEmploi.matiere_id == Matiere.matiere_id)\
        .outerjoin(Enseignant, CreneauEmploi.enseignant_id == Enseignant.enseignant_id)\
        .filter(
            CreneauEmploi.classe_id == inscription.classe_id,
            CreneauEmploi.statut == "ACTIVE"
        ).order_by(CreneauEmploi.jour, CreneauEmploi.heure_debut).all()

    result = []
    for c, mat, ens in creneaux:
        result.append({
            "jour": c.jour,
            "heure_debut": c.heure_debut,
            "heure_fin": c.heure_fin,
            "matiere": mat.libelle if mat else "?",
            "matiere_code": mat.code if mat else "?",
            "enseignant": f"{ens.prenom} {ens.nom}" if ens else "—",
            "salle": c.salle,
        })
    return result


# ================================================================
# ABSENCES
# ================================================================
@router.get("/{eleve_id}/absences")
def get_absences_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Historique des absences/présences de l'élève."""
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        return {"presences": [], "total_present": 0, "total_absent": 0}

    presences = db.query(Presence).filter(
        Presence.inscription_id == inscription.inscription_id
    ).order_by(desc(Presence.date_presence)).limit(60).all()

    result = [{"date": str(p.date_presence), "statut": p.statut_presence, "justification": p.motif}
              for p in presences]

    nb_present = db.query(Presence).filter(
        Presence.inscription_id == inscription.inscription_id,
        Presence.statut_presence == "PRESENT"
    ).count()
    nb_absent = db.query(Presence).filter(
        Presence.inscription_id == inscription.inscription_id,
        Presence.statut_presence.in_(["ABSENT", "ABSENT_JUSTIFIE"])
    ).count()

    return {"presences": result, "total_present": nb_present, "total_absent": nb_absent}


# ================================================================
# CLASSEMENT SUR UNE ÉPREUVE OU UNE PÉRIODE
# ================================================================

def _inscription_active(db: Session, eleve_id: int) -> Inscription:
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE"
    ).first()
    if not inscription:
        raise HTTPException(404, "Aucune inscription active")
    return inscription


@router.get("/{eleve_id}/epreuves")
def get_epreuves_eleve(
    eleve_id: int, trimestre_id: int = 1,
    _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db),
):
    """Épreuves consultables sur la période (uniquement celles centralisées)."""
    from app.services.notation import epreuves_consultables

    inscription = _inscription_active(db, eleve_id)
    return {
        "trimestre_id": trimestre_id,
        "epreuves": epreuves_consultables(db, inscription.classe_id, trimestre_id),
    }


@router.get("/{eleve_id}/classement")
def get_classement_eleve(
    eleve_id: int, trimestre_id: int = 1,
    evaluation_ids: Optional[str] = None,
    _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db),
):
    """Résultat et rang de l'élève sur une sélection d'épreuves.

    `evaluation_ids` absent = toute la période. Le calcul porte sur la classe
    entière (sans quoi le rang n'a pas de sens), mais seule la ligne de l'élève
    est renvoyée — aucune donnée d'un camarade ne sort d'ici.
    """
    from app.api.evaluations import get_bulletin_display_flags
    from app.services.notation import (
        get_bareme_defaut_cycle, get_cycle_key, get_lettres_config, lettre_pour_note,
    )
    from app.services.notation import resultat_eleve_sur_epreuves

    inscription = _inscription_active(db, eleve_id)
    ids = None
    if evaluation_ids:
        try:
            ids = [int(x) for x in evaluation_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(400, "Liste d'identifiants invalide")

    classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    if not classe:
        # Jamais de repli sur l'école 1 : cela appliquerait les réglages
        # d'affichage d'une autre école au classement.
        raise HTTPException(404, "Classe introuvable pour cette inscription")
    flags = get_bulletin_display_flags(db, classe.etablissement_id)

    return resultat_eleve_sur_epreuves(
        db, inscription.classe_id, trimestre_id, inscription.inscription_id,
        evaluation_ids=ids, flags=flags,
    )


# ================================================================
# BULLETIN
# ================================================================
@router.get("/{eleve_id}/bulletin")
def get_bulletin_eleve(eleve_id: int, trimestre_id: int = 1, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Bulletin publié de l'élève."""
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

    from app.api.evaluations import get_bulletin_display_flags
    cl_for_flags = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    if not cl_for_flags:
        # Ne JAMAIS retomber sur l'établissement 1 (ancien `else 1`) : cela
        # appliquait les réglages d'affichage d'une autre école au bulletin.
        raise HTTPException(404, "Classe introuvable pour cette inscription")
    _etab = cl_for_flags.etablissement_id
    flags = get_bulletin_display_flags(db, _etab)
    # Notation par lettres : la famille doit lire la même chose que le
    # bulletin papier, sinon la lettre n'existe que sur le PDF.
    _cycle = get_cycle_key(inscription.classe_id, db)
    _echelle = get_bareme_defaut_cycle(db, _etab, _cycle)
    _lettres = get_lettres_config(db, _etab, _cycle)

    lignes = db.query(BulletinLigne, Matiere)\
        .join(Matiere, BulletinLigne.matiere_id == Matiere.matiere_id)\
        .filter(BulletinLigne.bulletin_id == bulletin.bulletin_id).all()
    matieres = []
    for ligne, mat in lignes:
        matieres.append({
            "matiere": mat.libelle if mat else "?",
            "coefficient": float(ligne.coefficient) if ligne.coefficient else 1,
            "moyenne_eleve": float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else None,
            "moyenne_classe": float(ligne.moyenne_classe) if ligne.moyenne_classe is not None and flags["show_stats_matiere"] else None,
            "note_min": float(ligne.note_min) if ligne.note_min is not None and flags["show_stats_matiere"] else None,
            "note_max": float(ligne.note_max) if ligne.note_max is not None and flags["show_stats_matiere"] else None,
            "appreciation": ligne.appreciation if flags["show_appreciation"] else None,
            "lettre": lettre_pour_note(
                float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else None,
                _lettres, _echelle,
            ),
        })

    cl = cl_for_flags
    tri = db.query(Trimestre).filter(Trimestre.trimestre_id == trimestre_id).first()

    return {
        "bulletin_id": bulletin.bulletin_id,
        "classe": cl.libelle if cl else "?",
        "trimestre": tri.libelle if tri else f"Trimestre {trimestre_id}",
        "trimestre_id": trimestre_id,
        "moyenne_generale": float(bulletin.moyenne_generale) if bulletin.moyenne_generale is not None else None,
        "lettre_generale": lettre_pour_note(
            float(bulletin.moyenne_generale) if bulletin.moyenne_generale is not None else None,
            _lettres, _echelle,
        ),
        "rang": bulletin.rang if flags["show_rang"] else None,
        # Le portail élève affiche rang+effectif dans une seule phrase
        # ("Xe sur Y") — on ne peut pas montrer l'effectif seul sans le rang,
        # donc son affichage suit celui du rang (show_effectif seul seul ne
        # suffit pas à activer cette phrase composée).
        "effectif_classe": bulletin.effectif_classe if flags["show_rang"] and flags["show_effectif"] else None,
        "mention": bulletin.mention if flags["show_mention"] else None,
        "decision": bulletin.decision,
        "matieres": matieres,
    }


# ================================================================
# MESSAGES
# ================================================================
@router.get("/{eleve_id}/enseignants")
def get_enseignants_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Liste les enseignants de la classe de l'élève pour la sélection de destinataire."""
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")

    insc = db.query(Inscription).filter(Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE").first()
    if not insc:
        return []

    affs = db.query(Affectation, Enseignant, Matiere).join(
        Enseignant, Affectation.enseignant_id == Enseignant.enseignant_id
    ).join(
        Matiere, Affectation.matiere_id == Matiere.matiere_id
    ).filter(
        Affectation.classe_id == insc.classe_id
    ).all()

    result = []
    seen = set()
    for aff, ens, mat in affs:
        if ens.enseignant_id not in seen:
            seen.add(ens.enseignant_id)
            result.append({
                "enseignant_id": ens.enseignant_id,
                "nom": ens.nom,
                "prenom": ens.prenom,
                "specialite": ens.specialite or mat.libelle,
                "matiere": mat.libelle
            })
    return result


@router.get("/{eleve_id}/messages")
def get_messages_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Messages reçus et envoyés par l'élève."""
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")

    insc = db.query(Inscription).filter(Inscription.eleve_id == eleve_id, Inscription.statut == "ACTIVE").first()
    filters = [
        (Message.destinataire_type == "ELEVE") & (Message.destinataire_id == eleve_id),
        Message.destinataire_type == "TOUS",
        Message.destinataire_type == "TOUS_ELEVES"
    ]
    if insc:
        filters.append((Message.destinataire_type == "CLASSE") & (Message.destinataire_id == insc.classe_id))
        filters.append((Message.destinataire_type == "CLASSE_ELEVES") & (Message.destinataire_id == insc.classe_id))

    received = db.query(Message).filter(or_(*filters)).order_by(desc(Message.date_envoi)).limit(50).all()
    sent = db.query(Message).filter(
        Message.expediteur_type == "ELEVE",
        Message.expediteur_id == eleve_id
    ).order_by(desc(Message.date_envoi)).limit(20).all()

    def fmt(m):
        exp_nom = "Administration"
        if m.expediteur_type == "ENSEIGNANT" and m.expediteur_id:
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == m.expediteur_id).first()
            if ens:
                exp_nom = f"M. / Mme {ens.prenom} {ens.nom}"
        elif m.expediteur_type == "ELEVE" and m.expediteur_id:
            el = db.query(Eleve).filter(Eleve.eleve_id == m.expediteur_id).first()
            if el:
                exp_nom = f"{el.prenom} {el.nom}"

        dest_nom = "Administration"
        if m.destinataire_type == "ENSEIGNANT" and m.destinataire_id:
            ens = db.query(Enseignant).filter(Enseignant.enseignant_id == m.destinataire_id).first()
            if ens:
                dest_nom = f"M. / Mme {ens.prenom} {ens.nom}"

        return {
            "message_id": m.message_id,
            "expediteur_type": m.expediteur_type,
            "expediteur_id": m.expediteur_id,
            "expediteur_nom": exp_nom,
            "destinataire_type": m.destinataire_type,
            "destinataire_id": m.destinataire_id,
            "destinataire_nom": dest_nom,
            "sujet": m.sujet,
            "contenu": m.contenu,
            "statut": m.statut,
            "date_envoi": str(m.date_envoi) if m.date_envoi else None,
        }

    return {"received": [fmt(m) for m in received], "sent": [fmt(m) for m in sent]}


class EleveMessageSend(BaseModel):
    sujet: str
    contenu: str
    destinataire_type: Optional[str] = "ADMIN"
    destinataire_id: Optional[int] = None


@router.post("/{eleve_id}/messages/envoyer")
def envoyer_message_eleve(eleve_id: int, data: EleveMessageSend, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Élève envoie un message à l'administration ou à un professeur."""
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")

    dest_type = data.destinataire_type or "ADMIN"
    dest_id = data.destinataire_id if dest_type == "ENSEIGNANT" else None

    msg = Message(
        etablissement_id=eleve.etablissement_id,
        expediteur_type="ELEVE", expediteur_id=eleve_id,
        destinataire_type=dest_type, destinataire_id=dest_id,
        sujet=data.sujet, contenu=data.contenu,
    )
    db.add(msg)
    db.commit()
    return {"message": "✅ Message envoyé", "message_id": msg.message_id}


@router.put("/{eleve_id}/messages/{message_id}/lire")
def marquer_lu_eleve(eleve_id: int, message_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    msg = db.query(Message).filter(Message.message_id == message_id).first()
    if not msg:
        raise HTTPException(404, "Message non trouvé")
    if msg.statut == "ENVOYE":
        msg.statut = "LU"
        msg.date_lecture = datetime.now()
        db.commit()
    return {"message": "OK"}


# ================================================================
# CHANGER MOT DE PASSE
# ================================================================
class ChangePasswordRequest(BaseModel):
    ancien_mdp: Optional[str] = None
    nouveau_mdp: str


@router.put("/{eleve_id}/changer-mot-de-passe")
def changer_mot_de_passe_eleve(eleve_id: int, data: ChangePasswordRequest, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")
    if eleve.mot_de_passe:
        if not data.ancien_mdp:
            raise HTTPException(400, "L'ancien mot de passe est requis")
        if not verify_password(data.ancien_mdp, eleve.mot_de_passe):
            raise HTTPException(401, "Ancien mot de passe incorrect")
    if len(data.nouveau_mdp) < 6:
        raise HTTPException(400, "Le mot de passe doit faire au moins 6 caractères")
    eleve.mot_de_passe = hash_password(data.nouveau_mdp)
    db.commit()
    return {"message": "Mot de passe modifié avec succès"}


# ── Fournitures scolaires de l'élève (par son inscription active) ──
@router.get("/{eleve_id}/fournitures")
def get_fournitures_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Retourne les fournitures actives pour la classe de l'élève."""
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut.in_(["ACTIVE", "INSCRIT"])
    ).first()
    if not inscription:
        return []
    
    items = db.query(FournitureScolaire).filter(
        FournitureScolaire.classe_id == inscription.classe_id,
        FournitureScolaire.statut == "ACTIF"
    ).order_by(FournitureScolaire.categorie, FournitureScolaire.nom).all()
    return [
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


# ── Fournitures scolaires de la classe ──
@router.get("/fournitures/{classe_id}")
def fournitures_classe_eleve(classe_id: int, _auth: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retourne les fournitures actives pour la classe de l'élève (authentifié)."""
    items = db.query(FournitureScolaire).filter(
        FournitureScolaire.classe_id == classe_id,
        FournitureScolaire.statut == "ACTIF"
    ).order_by(FournitureScolaire.categorie, FournitureScolaire.nom).all()
    return [
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


# ================================================================
# RESSOURCES PÉDAGOGIQUES (LIENS ET DOCUMENTS)
# ================================================================
@router.get("/{eleve_id}/ressources")
def get_ressources_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Récupère les ressources (liens, docs) pour l'établissement de l'élève."""
    eleve = db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first()
    if not eleve:
        raise HTTPException(404, "Élève introuvable")

    # On renvoie les ressources de son établissement pour le MVP
    res = db.query(RessourcePedagogique, Enseignant.nom, Enseignant.prenom)\
            .join(Enseignant, RessourcePedagogique.enseignant_id == Enseignant.enseignant_id)\
            .filter(RessourcePedagogique.etablissement_id == eleve.etablissement_id)\
            .order_by(desc(RessourcePedagogique.date_creation)).limit(100).all()

    return [{
        "ressource_id": r.RessourcePedagogique.ressource_id,
        "titre": r.RessourcePedagogique.titre,
        "description": r.RessourcePedagogique.description,
        "url": r.RessourcePedagogique.url,
        "type": r.RessourcePedagogique.type_ressource,
        "categorie": r.RessourcePedagogique.categorie,
        "date": r.RessourcePedagogique.date_creation.strftime("%d/%m/%Y") if r.RessourcePedagogique.date_creation else None,
        "auteur": f"{r.prenom} {r.nom}"
    } for r in res]


# ================================================================
# CAHIER DE TEXTES / DEVOIRS
# ================================================================
@router.get("/{eleve_id}/devoirs")
def get_devoirs_eleve(eleve_id: int, _auth: dict = Depends(_eleve_auth), db: Session = Depends(get_db)):
    """Récupère les devoirs et tâches pour la classe de l'élève."""
    inscription = db.query(Inscription).filter(
        Inscription.eleve_id == eleve_id,
        Inscription.statut.in_(["ACTIVE", "INSCRIT"])
    ).first()
    
    if not inscription:
        return []
        
    try:
        devoirs = db.query(
            Devoir,
            Matiere.libelle.label('matiere_libelle'),
            Enseignant.nom.label('ens_nom'),
            Enseignant.prenom.label('ens_prenom'),
        ).outerjoin(
            Matiere, Devoir.matiere_id == Matiere.matiere_id
        ).outerjoin(
            Enseignant, Devoir.enseignant_id == Enseignant.enseignant_id
        ).filter(
            Devoir.classe_id == inscription.classe_id
        ).order_by(desc(Devoir.date_creation)).limit(50).all()
            
        return [{
            "devoir_id": d[0].devoir_id,
            "titre": d[0].titre,
            "description": d[0].description,
            "type_devoir": d[0].type_devoir,
            "date_limite": d[0].date_limite.isoformat() if d[0].date_limite else None,
            "fichier_path": d[0].fichier_path,
            "matiere": d.matiere_libelle or "Matière inconnue",
            "enseignant": f"{d.ens_prenom or ''} {d.ens_nom or ''}".strip() or "Enseignant inconnu"
        } for d in devoirs]
    except Exception as e:
        import logging
        logging.error(f"Erreur chargement devoirs élève {eleve_id}: {e}")
        return []
