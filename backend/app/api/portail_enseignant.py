"""
SMARTSCHOOL API — Portail Enseignant
Dashboard: emploi du temps, classes, eleves, notes, absences
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import Optional, List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password, hash_password
from app.core.auth import get_current_user, require_etablissement
from app.models.academique import (
    Enseignant, Affectation, CreneauEmploi, Classe, Matiere, Niveau, Cycle,
    Note, Evaluation, Inscription, Eleve, Presence, Trimestre, TypeEvaluation,
    AnneeScolaire, RessourcePedagogique, ClasseMatiere, ParametreEtablissement
)
from app.core.annee_lock import verifier_annee_modifiable
# Moteur de notation partagé avec evaluations.py — ne jamais redéfinir
# localement une logique de coefficient/moyenne : les deux copies avaient
# déjà divergé une première fois.
from app.services.notation import (
    get_bareme_effectif,
    get_cycle_key,
    get_types_evaluation_coefficients,
    valider_note,
)

router = APIRouter(prefix="/api/portail-enseignant", tags=["Portail Enseignant"])


# ── Dépendance de sécurité : ownership check ───────────────────────────────────────
# Rôles qui peuvent consulter le portail d'un autre — dans leur école.
ADMIN_PORTAIL_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "INFORMATICIEN"}


async def _enseignant_auth(
    enseignant_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Vérifie que le token JWT appartient à cet enseignant (ou à un admin DE SON ÉCOLE).

    Protège contre l'OWASP Broken Access Control sur le portail enseignant.

    Le raccourci « les admins voient tout » datait du mono-établissement : un
    administrateur de l'école A pouvait consulter les classes, les épreuves et
    les notes de n'importe quel enseignant de la plateforme — et en saisir en
    son nom. Son périmètre s'arrête désormais à son école.
    """
    role = current_user.get("role", "")
    token_type = current_user.get("type", "")
    if role in ADMIN_PORTAIL_ROLES:
        etablissement_id = current_user.get("etablissement_id")
        if etablissement_id is None:
            raise HTTPException(
                403, "Établissement non déterminé pour ce compte : choisissez un établissement."
            )
        existe = db.query(Enseignant.enseignant_id).filter(
            Enseignant.enseignant_id == enseignant_id,
            Enseignant.etablissement_id == etablissement_id,
        ).first()
        if not existe:
            # 404 : ne jamais confirmer qu'un enseignant existe ailleurs.
            raise HTTPException(404, "Enseignant non trouvé")
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
def get_trimestres(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Périodes de l'année courante DE SON ÉCOLE.

    Sans le filtre, `est_courante == "O"` renvoyait l'année de la première
    école venue : l'enseignant se voyait proposer le calendrier du voisin.
    """
    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id,
        AnneeScolaire.est_courante == "O",
    ).first()
    if not annee:
        return []
    trimestres = db.query(Trimestre).filter(
        Trimestre.annee_id == annee.annee_id
    ).order_by(Trimestre.numero).all()
    return [{"trimestre_id": t.trimestre_id, "code": t.code, "libelle": t.libelle,
             "numero": t.numero, "date_debut": str(t.date_debut), "date_fin": str(t.date_fin),
             "statut": t.statut} for t in trimestres]


@router.get("/referentiels/types-evaluation")
def get_types_evaluation(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste des types d'évaluation actifs DE SON ÉCOLE.

    Chaque école nomme ses types comme elle l'entend : sans ce filtre,
    l'enseignant se serait vu proposer ceux du voisin.
    """
    types = db.query(TypeEvaluation).filter(
        TypeEvaluation.etablissement_id == etablissement_id,
        TypeEvaluation.statut == "ACTIF",
    ).order_by(TypeEvaluation.type_eval_id).all()
    # `coefficient` est ce que le moteur lit vraiment ; `poids_pourcentage` est
    # une colonne morte conservée pour compat (cf. MIGRATION_NOTES). L'écran de
    # saisie affichait le pourcentage mort et parlait de « meilleure note » —
    # une règle qui n'existe plus. On renvoie le coefficient réel.
    return [{"type_eval_id": t.type_eval_id, "code": t.code, "libelle": t.libelle,
             "coefficient": float(t.coefficient) if t.coefficient is not None else 1.0,
             "poids_pourcentage": float(t.poids_pourcentage) if t.poids_pourcentage is not None else None}
            for t in types]


# ================================================================
# HISTORIQUE DES ÉVALUATIONS
# ================================================================
@router.get("/{enseignant_id}/evaluations")
def get_evaluations(
    enseignant_id: int,
    classe_id: Optional[int] = None,
    matiere_id: Optional[int] = None,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    """Évaluations de cet enseignant — celles que l'administration a créées et
    lui a rattachées (une par matière lors d'une composition).

    Filtrable par classe et matière : c'est ce que l'écran de saisie utilise
    pour proposer à l'enseignant la liste des évaluations à remplir pour la
    classe/matière qu'il a ouverte, plutôt que de lui en faire créer une.
    """
    query = db.query(Evaluation).filter(Evaluation.enseignant_id == enseignant_id)
    if classe_id:
        query = query.filter(Evaluation.classe_id == classe_id)
    if matiere_id:
        query = query.filter(Evaluation.matiere_id == matiere_id)
    evals = query.order_by(desc(Evaluation.date_evaluation)).limit(50).all()
    result = []
    for ev in evals:
        mat = db.query(Matiere).filter(Matiere.matiere_id == ev.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
        tri = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
        type_ev = db.query(TypeEvaluation).filter(TypeEvaluation.type_eval_id == ev.type_eval_id).first()
        nb_notes = db.query(func.count(Note.note_id)).filter(Note.evaluation_id == ev.evaluation_id).scalar() or 0
        nb_saisies = db.query(func.count(Note.note_id)).filter(
            Note.evaluation_id == ev.evaluation_id,
            or_(Note.valeur.isnot(None), Note.est_absent == "O"),
        ).scalar() or 0
        moy = db.query(func.avg(Note.valeur)).filter(
            Note.evaluation_id == ev.evaluation_id, Note.est_absent == "N"
        ).scalar()
        result.append({
            "evaluation_id": ev.evaluation_id,
            "libelle": ev.libelle,
            "date_evaluation": str(ev.date_evaluation) if ev.date_evaluation else None,
            "classe_id": ev.classe_id,
            "matiere_id": ev.matiere_id,
            "trimestre_id": ev.trimestre_id,
            "type_libelle": type_ev.libelle if type_ev else None,
            "matiere": mat.libelle if mat else "?",
            "classe": cls.libelle if cls else "?",
            "trimestre": tri.libelle if tri else "?",
            "note_sur": float(ev.note_sur or 20),
            "coefficient": float(ev.coefficient or 1),
            "nb_notes": nb_notes,
            "nb_saisies": nb_saisies,
            "moyenne": round(float(moy), 2) if moy else None,
            "statut": ev.statut,
        })
    return result


# ================================================================
# PAIEMENTS (SALAIRES)
# ================================================================
@router.get("/{enseignant_id}/paiements")
def get_historique_paiements(enseignant_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    from app.models.academique import Depense, BulletinPaie, Enseignant
    
    # Historique depuis Depense + BulletinPaie
    depenses = db.query(Depense).filter(
        Depense.fournisseur == f"ENS_{enseignant_id}",
        Depense.categorie == "SALAIRES",
        Depense.statut == "VALIDE"
    ).order_by(Depense.date_depense.desc()).all()
    
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    
    historique = []
    for dep in depenses:
        bulletin = None
        if dep.reference and dep.reference.isdigit():
            bulletin = db.query(BulletinPaie).filter(BulletinPaie.bulletin_id == int(dep.reference)).first()
        
        historique.append({
            "depense_id": dep.depense_id,
            "bulletin_id": bulletin.bulletin_id if bulletin else None,
            "date": dep.date_depense.isoformat() if dep.date_depense else None,
            "montant": float(dep.montant),
            "libelle": dep.libelle,
            "statut": dep.statut,
            "salaire_base": float(bulletin.salaire_base) if bulletin else float(ens.salaire_base or 0),
            "total_primes": float(bulletin.total_primes) if bulletin else float(ens.prime_mensuelle or 0),
            "total_absences": float(bulletin.total_absences) if bulletin else 0,
            "total_avances": float(bulletin.total_avances) if bulletin else 0,
            "net_a_payer": float(bulletin.net_a_payer) if bulletin else float(dep.montant),
            "details_absences": bulletin.details_absences if bulletin else None
        })
    return historique

@router.get("/{enseignant_id}/paiements/{bulletin_id}")
def get_bulletin_detail(enseignant_id: int, bulletin_id: int, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db)):
    from app.models.academique import BulletinPaie, Prime, AbsencePersonnel, Enseignant, Employe
    from fastapi import HTTPException
    
    bulletin = db.query(BulletinPaie).filter(BulletinPaie.bulletin_id == bulletin_id).first()
    if not bulletin:
        raise HTTPException(status_code=404, detail="Bulletin introuvable")
        
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    emp_mirror = db.query(Employe).filter(Employe.source_ref == f"ENS_{enseignant_id}").first()
    
    if bulletin.employe_id != emp_mirror.employe_id:
        raise HTTPException(status_code=403, detail="Accès refusé à ce bulletin")
        
    primes = db.query(Prime).filter(Prime.employe_id == bulletin.employe_id, Prime.mois_concerne == bulletin.mois_concerne).all()
    
    return {
        "bulletin": {
            "bulletin_id": bulletin.bulletin_id,
            "mois_concerne": bulletin.mois_concerne,
            "net_a_payer": float(bulletin.net_a_payer),
            "date_paiement": bulletin.date_paiement.isoformat() if bulletin.date_paiement else None,
            "mode_paiement": bulletin.mode_paiement,
            "salaire_base": float(bulletin.salaire_base),
            "total_primes": float(bulletin.total_primes),
            "total_absences": float(bulletin.total_absences),
            "total_avances": float(bulletin.total_avances)
        },
        "employe": {
            "nom": ens.nom,
            "prenom": ens.prenom,
            "poste": "Enseignant",
            "type_contrat": ens.type_contrat or "Prestataire"
        },
        "details": {
            "primes": [{"montant": float(p.montant), "motif": p.motif} for p in primes],
            "details_absences_texte": bulletin.details_absences
        }
    }

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
        Cycle.code.label("cycle_code"),
    ).join(Classe, Affectation.classe_id == Classe.classe_id
    ).join(Matiere, Affectation.matiere_id == Matiere.matiere_id
    ).join(Niveau, Classe.niveau_id == Niveau.niveau_id
    ).join(Cycle, Niveau.cycle_id == Cycle.cycle_id
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
            "cycle_code": a.cycle_code,
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

    # Classes de MATERNELLE dont il est titulaire (lien par professeur principal,
    # pas d'affectation matière). Comptées dans les stats pour ne pas afficher
    # « 0 classe » à un enseignant qui gère bien une classe de maternelle.
    classes_maternelle = [
        {
            "classe_id": c.classe_id, "classe": c.libelle,
            "classe_code": c.code, "niveau": n.libelle,
            "effectif": c.effectif_actuel or 0,
        }
        for c, n in db.query(Classe, Niveau).join(
            Niveau, Classe.niveau_id == Niveau.niveau_id
        ).filter(
            Classe.professeur_principal == enseignant_id,
            Niveau.evaluation_simple == "O",
        ).order_by(Classe.libelle).all()
    ]
    total_eleves_mat = sum(m["effectif"] for m in classes_maternelle)

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
        # Classes de MATERNELLE dont l'enseignant est titulaire : pas d'affectation
        # matière en maternelle (aucune note), le lien se fait par professeur
        # principal. Le portail affiche pour elles la saisie Admis/Non.
        "classes_maternelle": classes_maternelle,
        "stats": {
            "nb_classes": len(classes_set) + len(classes_maternelle),
            "nb_matieres": len(set(a.matiere_id for a in affectations)),
            "total_heures": total_heures,
            "total_eleves": total_eleves + total_eleves_mat,
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
    classe = db.query(Classe).filter(Classe.classe_id == data.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

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

def _type_eval_par_defaut(db: Session, etablissement_id: int) -> int:
    """Type d'évaluation à utiliser quand l'enseignant n'en précise aucun.

    Cherche le type générique "EVAL" (Évaluation), sinon le premier type actif.
    Remplace un `type_eval_id or 1` qui supposait qu'un type utilisable portait
    forcément l'identifiant 1.

    Les helpers `_categorie_evaluation` / `_coefficient_pour_evaluation` que ce
    fichier portait ont disparu : la pondération n'est plus figée sur trois
    catégories Écrit/Oral/Composition, elle vient des coefficients de type
    configurés par l'école et calculés par `app/services/notation.py`.

    """
    base = db.query(TypeEvaluation).filter(
        TypeEvaluation.etablissement_id == etablissement_id,
        TypeEvaluation.statut == "ACTIF",
    )
    t = base.filter(TypeEvaluation.code == "EVAL").first()
    if not t:
        t = base.order_by(TypeEvaluation.type_eval_id).first()
    if not t:
        raise HTTPException(400, "Aucun type d'évaluation actif n'est configuré pour l'établissement.")
    return t.type_eval_id


class NoteItem(BaseModel):
    inscription_id: int
    valeur: Optional[float] = None
    est_absent: bool = False

class SaisieNotesRequest(BaseModel):
    classe_id: int
    matiere_id: int
    trimestre_id: Optional[int] = None
    type_evaluation_id: Optional[int] = None
    libelle: str  # texte libre saisi par l'école, ex: "Évaluation de Janvier"
    note_sur: Optional[float] = None  # None => barème configuré pour la classe/matière
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
    classe = db.query(Classe).filter(Classe.classe_id == data.classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe introuvable")
    verifier_annee_modifiable(db, classe.annee_id)

    if data.trimestre_id:
        trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == data.trimestre_id).first()
        if trimestre and trimestre.statut == "CLOTURE":
            raise HTTPException(400, f"{trimestre.libelle} est clôturé — impossible de saisir de nouvelles notes pour cette période.")

    from datetime import date

    type_eval_id = data.type_evaluation_id or _type_eval_par_defaut(db, classe.etablissement_id)
    # `classe` est garanti non nul (404 plus haut) : pas de repli sur l'école 1,
    # qui appliquait à tous les enseignants les pondérations d'une autre école.
    etablissement_id = classe.etablissement_id
    cycle_key = get_cycle_key(data.classe_id, db)
    coefficient = get_types_evaluation_coefficients(db, etablissement_id, cycle_key).get(type_eval_id, 1.0)
    note_sur = data.note_sur or get_bareme_effectif(
        db, data.classe_id, data.matiere_id, cycle_key, etablissement_id
    )

    # Barème vérifié avant de créer quoi que ce soit : sinon une note hors
    # barème laisse derrière elle une évaluation vide, à supprimer à la main.
    valeurs = []
    for n in data.notes:
        try:
            valeurs.append(None if n.est_absent else valider_note(n.valeur, note_sur))
        except ValueError as e:
            raise HTTPException(400, str(e))

    # 1. Créer l'évaluation
    evaluation = Evaluation(
        classe_id=data.classe_id,
        matiere_id=data.matiere_id,
        enseignant_id=enseignant_id,
        trimestre_id=data.trimestre_id or 1,
        type_eval_id=type_eval_id,
        libelle=data.libelle,
        date_evaluation=date.today(),
        note_sur=note_sur,
        coefficient=coefficient,
        statut="PUBLIEE",
    )
    db.add(evaluation)
    db.flush()  # Pour obtenir l'evaluation_id

    # 2. Sauvegarder les notes
    count = 0
    for n, valeur in zip(data.notes, valeurs):
        note = Note(
            evaluation_id=evaluation.evaluation_id,
            inscription_id=n.inscription_id,
            valeur=valeur,
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


class RemplirNotesRequest(BaseModel):
    notes: list[NoteItem]


@router.post("/{enseignant_id}/evaluations/{evaluation_id}/saisir")
def remplir_evaluation(
    enseignant_id: int, evaluation_id: int,
    data: RemplirNotesRequest, _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """Remplir une évaluation DÉJÀ CRÉÉE par l'administration.

    L'enseignant ne crée rien : l'administration crée l'évaluation/composition,
    l'enseignant saisit seulement les notes de celle qui lui est rattachée. Le
    barème vient de l'évaluation (configuré en amont), l'enseignant ne le touche
    pas. Upsert par (évaluation, élève) : on peut revenir corriger.
    """
    ev = db.query(Evaluation).filter(
        Evaluation.evaluation_id == evaluation_id,
        Evaluation.enseignant_id == enseignant_id,
    ).first()
    if not ev:
        raise HTTPException(404, "Évaluation non trouvée ou non autorisée")
    if ev.statut == "CENTRALISEE":
        raise HTTPException(400, "Cette évaluation a déjà été centralisée. Contactez l'administrateur.")

    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    if classe:
        verifier_annee_modifiable(db, classe.annee_id)
    if ev.trimestre_id:
        trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
        if trimestre and trimestre.statut == "CLOTURE":
            raise HTTPException(400, f"{trimestre.libelle} est clôturé — impossible de saisir des notes pour cette période.")

    note_sur = float(ev.note_sur or 20)
    # Toutes les notes validées AVANT d'en écrire une seule.
    valeurs = []
    for n in data.notes:
        try:
            valeurs.append(None if n.est_absent else valider_note(n.valeur, note_sur))
        except ValueError as e:
            raise HTTPException(400, str(e))

    count = 0
    for n, valeur in zip(data.notes, valeurs):
        note = db.query(Note).filter(
            Note.evaluation_id == evaluation_id,
            Note.inscription_id == n.inscription_id,
        ).first()
        if note:
            note.valeur = valeur
            note.est_absent = "O" if n.est_absent else "N"
        else:
            db.add(Note(
                evaluation_id=evaluation_id,
                inscription_id=n.inscription_id,
                valeur=valeur,
                est_absent="O" if n.est_absent else "N",
            ))
        count += 1

    # Une évaluation planifiée passe « publiée » dès qu'elle est remplie.
    if ev.statut == "PLANIFIEE":
        ev.statut = "PUBLIEE"

    db.commit()
    return {
        "message": f"{count} note(s) enregistrée(s) pour « {ev.libelle} »",
        "evaluation_id": evaluation_id,
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
    # Pas de filtre d'établissement ici, volontairement : `ev` est déjà borné à
    # l'enseignant appelant, et son type appartient donc à la même école par
    # construction. Ajouter un filtre ne fermerait rien et masquerait le libellé
    # sur toute donnée héritée.
    type_ev = db.query(TypeEvaluation).filter(TypeEvaluation.type_eval_id == ev.type_eval_id).first()

    # Notes avec info élève
    notes_query = db.query(
        Note.note_id,
        Note.inscription_id,
        Note.valeur,
        Note.est_absent,
        Note.observation,
        Note.updated_at,
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
            # Consommé par le module offline-first (base_updated_at, voir
            # app/api/sync.py) pour détecter si la note a changé sur le
            # serveur depuis la dernière lecture locale de cet enseignant.
            "updated_at": n.updated_at.isoformat() if n.updated_at else None,
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

    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — impossible de modifier des notes pour cette période.")

    valeurs = {}
    for item in data.notes:
        try:
            valeurs[item.note_id] = None if item.est_absent else valider_note(item.valeur, ev.note_sur)
        except ValueError as e:
            raise HTTPException(400, str(e))

    updated = 0
    for item in data.notes:
        note = db.query(Note).filter(
            Note.note_id == item.note_id,
            Note.evaluation_id == evaluation_id
        ).first()
        if note:
            note.valeur = valeurs[item.note_id]
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

    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

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


# ================================================================
# SIGNALEMENT ET LIAISON PARENT D'ÉLÈVE
# ================================================================

class SignalerEnfantData(BaseModel):
    nom_enfant: str
    prenom_enfant: Optional[str] = ""
    classe_detail: Optional[str] = ""
    remarque: Optional[str] = ""


@router.post("/{enseignant_id}/signaler-enfant")
def signaler_enfant_enseignant(
    enseignant_id: int,
    data: SignalerEnfantData,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db)
):
    """Envoie une demande de raccordement Parent à l'Administration pour l'enfant de l'enseignant."""
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    sujet = f"Signalement Enfant — Prof. {ens.prenom} {ens.nom}"
    details = f"Nom: {data.nom_enfant}"
    if data.prenom_enfant:
        details += f" {data.prenom_enfant}"
    if data.classe_detail:
        details += f" ({data.classe_detail})"

    contenu = (
        f"L'enseignant {ens.prenom} {ens.nom} ({ens.specialite or 'Enseignant'}) "
        f"déclare être le parent de l'élève : {details}.\n"
        f"Remarque / Précisions : {data.remarque or 'Aucune'}.\n\n"
        f"Merci d'effectuer le raccordement du compte Parent correspondant au système."
    )

    msg = Message(
        etablissement_id=ens.etablissement_id,
        expediteur_type="ENSEIGNANT",
        expediteur_id=enseignant_id,
        destinataire_type="ADMIN",
        objet_type="GENERAL",
        sujet=sujet,
        contenu=contenu,
    )
    db.add(msg)
    db.commit()

    return {"message": "✅ Signalement transmis à la direction.", "message_id": msg.message_id}


@router.get("/{enseignant_id}/mes-enfants")
def get_enfants_enseignant(
    enseignant_id: int,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db)
):
    """Retourne la liste des enfants raccordés à l'enseignant s'il a un profil Parent actif."""
    from app.models.academique import Parent, EleveParent, Eleve, Inscription, Classe
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens:
        raise HTTPException(404, "Enseignant non trouvé")

    # Chercher un compte Parent ayant le même email ou numéro de téléphone
    parent = None
    if ens.email:
        parent = db.query(Parent).filter(Parent.email == ens.email).first()
    if not parent and ens.telephone:
        parent = db.query(Parent).filter(
            or_(Parent.telephone_1 == ens.telephone, Parent.telephone_2 == ens.telephone)
        ).first()

    if not parent:
        return {"est_parent": False, "enfants": []}

    liens = db.query(EleveParent, Eleve).join(Eleve, EleveParent.eleve_id == Eleve.eleve_id).filter(
        EleveParent.parent_id == parent.parent_id
    ).all()

    enfants = []
    for lien, el in liens:
        insc = db.query(Inscription, Classe).join(Classe, Inscription.classe_id == Classe.classe_id).filter(
            Inscription.eleve_id == el.eleve_id, Inscription.statut == "ACTIVE"
        ).first()

        enfants.append({
            "eleve_id": el.eleve_id,
            "nom": el.nom,
            "prenom": el.prenom,
            "matricule": el.matricule,
            "lien_parente": lien.lien_parente,
            "classe": insc[1].libelle if insc else "Non inscrit",
        })

    return {"est_parent": True, "parent_id": parent.parent_id, "enfants": enfants}


# ════════════════════════════════════════════════════════════
# L'INSTITUTEUR DU PRIMAIRE PILOTE SA CLASSE DE BOUT EN BOUT
# ════════════════════════════════════════════════════════════
#
# Au collège et au lycée, un professeur tient UNE matière dans plusieurs
# classes : il saisit ses notes, et c'est tout. Les moyennes, les bulletins et
# les résultats de fin d'année agrègent le travail de douze collègues — ce
# n'est le rôle d'aucun d'entre eux.
#
# Au primaire, c'est l'inverse : l'instituteur tient UNE classe et y assure
# TOUTES les matières. Les moyennes de sa classe ne dépendent que de ses
# propres notes. L'obliger à passer par le secrétariat pour calculer ce qu'il
# a lui-même noté n'ajoute aucun contrôle, seulement un délai — et dans les
# petites écoles, l'instituteur EST l'administration.
#
# La règle est vérifiable, pas déclarative : cycle primaire, ET l'enseignant
# est affecté à TOUTES les matières actives de la classe. Un professeur de
# sport qui passe dans une classe de primaire ne remplit pas cette condition
# et ne pilote rien.

def _classe_pilotee_par(db: Session, enseignant_id: int, classe_id: int) -> Classe:
    """La classe, à condition que cet enseignant en soit l'instituteur.

    Lève 403 sinon, en disant pourquoi — un refus qui n'explique pas se lit
    comme une panne.
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")

    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens or ens.etablissement_id != classe.etablissement_id:
        # 404 et non 403 : ne jamais confirmer qu'une classe existe ailleurs.
        raise HTTPException(404, "Classe non trouvée")

    if get_cycle_key(classe_id, db) != "primaire":
        raise HTTPException(
            403,
            "Le calcul des moyennes et les bulletins d'une classe du secondaire "
            "reviennent à l'administration : ils rassemblent les notes de tous "
            "les professeurs de la classe, pas seulement les vôtres.",
        )

    matieres_classe = {
        cm.matiere_id for cm in db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == classe_id, ClasseMatiere.est_active == "O"
        ).all()
    }
    mes_matieres = {
        a.matiere_id for a in db.query(Affectation).filter(
            Affectation.enseignant_id == enseignant_id,
            Affectation.classe_id == classe_id,
            Affectation.statut == "ACTIVE",
        ).all()
    }
    if not matieres_classe or not matieres_classe.issubset(mes_matieres):
        raise HTTPException(
            403,
            "Vous n'êtes pas l'instituteur de cette classe : vous n'y assurez "
            "pas toutes les matières.",
        )
    return classe


def _periode_de_la_classe(db: Session, classe: Classe, trimestre_id: int) -> Trimestre:
    """La période demandée, à condition d'appartenir à l'année de la classe."""
    periode = db.query(Trimestre).filter(
        Trimestre.trimestre_id == trimestre_id,
        Trimestre.annee_id == classe.annee_id,
    ).first()
    if not periode:
        raise HTTPException(404, "Période non trouvée")
    return periode


@router.get("/{enseignant_id}/classe/{classe_id}/pilotage")
def pilotage_classe(
    enseignant_id: int, classe_id: int,
    _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """Ce que cet enseignant a le droit de faire sur cette classe.

    L'interface s'en sert pour afficher — ou non — les onglets Moyennes,
    Bulletins et Résultats de fin d'année. Une porte visible mais fermée
    décourage plus qu'une porte absente.
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    cycle = get_cycle_key(classe_id, db)
    try:
        _classe_pilotee_par(db, enseignant_id, classe_id)
    except HTTPException as refus:
        return {
            "classe_id": classe_id, "classe": classe.libelle, "cycle": cycle,
            "peut_saisir_notes": True,
            "peut_calculer_moyennes": False,
            "peut_voir_bulletins": False,
            "peut_calculer_resultats_annuels": False,
            "motif": refus.detail,
        }
    return {
        "classe_id": classe_id, "classe": classe.libelle, "cycle": cycle,
        "peut_saisir_notes": True,
        "peut_calculer_moyennes": True,
        "peut_voir_bulletins": True,
        "peut_calculer_resultats_annuels": True,
        "motif": "Vous êtes l'instituteur de cette classe : vous y assurez "
                 "toutes les matières.",
    }


@router.post("/{enseignant_id}/classe/{classe_id}/calculer-moyennes")
def calculer_moyennes_instituteur(
    enseignant_id: int, classe_id: int, trimestre_id: int,
    _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """L'instituteur calcule les moyennes de sa propre classe."""
    from app.services.notation import calculer_resultats_periode

    classe = _classe_pilotee_par(db, enseignant_id, classe_id)
    verifier_annee_modifiable(db, classe.annee_id)
    periode = _periode_de_la_classe(db, classe, trimestre_id)
    if periode.statut == "CLOTURE":
        raise HTTPException(
            400, f"{periode.libelle} est clôturé — le calcul n'est plus possible."
        )

    res = calculer_resultats_periode(db, classe_id, trimestre_id, persist=True)
    return {
        "message": f"Moyennes calculées pour {res['classe']} — {res['effectif']} bulletins",
        "classe": res["classe"],
        "effectif": res["effectif"],
        "bulletins_total": res["bulletins_total"],
    }


@router.post("/{enseignant_id}/classe/{classe_id}/resultats-annuels")
def resultats_annuels_instituteur(
    enseignant_id: int, classe_id: int,
    _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """L'instituteur arrête les résultats de fin d'année de sa classe."""
    from app.services.notation import calculer_resultats_annuels

    classe = _classe_pilotee_par(db, enseignant_id, classe_id)
    verifier_annee_modifiable(db, classe.annee_id)
    res = calculer_resultats_annuels(db, classe_id, persist=True)
    return {
        "message": f"Résultats annuels calculés pour {classe.libelle}",
        "classe": classe.libelle,
        "effectif": res.get("effectif"),
        "resultats": res.get("resultats", []),
    }


@router.get("/{enseignant_id}/classe/{classe_id}/bulletins")
def bulletins_instituteur(
    enseignant_id: int, classe_id: int, trimestre_id: Optional[int] = None,
    _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """Bulletins de la classe de l'instituteur. Sans période : les annuels."""
    from app.models.academique import Bulletin

    classe = _classe_pilotee_par(db, enseignant_id, classe_id)
    filtre = (
        Bulletin.trimestre_id == _periode_de_la_classe(db, classe, trimestre_id).trimestre_id
        if trimestre_id else Bulletin.type_bulletin == "ANNUEL"
    )
    lignes = (
        db.query(Bulletin, Eleve)
        .join(Inscription, Inscription.inscription_id == Bulletin.inscription_id)
        .join(Eleve, Eleve.eleve_id == Inscription.eleve_id)
        .filter(Inscription.classe_id == classe_id, filtre)
        .order_by(Bulletin.rang.is_(None), Bulletin.rang)
        .all()
    )
    return {
        "classe": classe.libelle,
        "trimestre_id": trimestre_id,
        "type": "TRIMESTRIEL" if trimestre_id else "ANNUEL",
        "bulletins": [
            {
                "bulletin_id": b.bulletin_id,
                "eleve_id": e.eleve_id,
                "nom": e.nom, "prenom": e.prenom, "matricule": e.matricule,
                "moyenne_generale": (
                    float(b.moyenne_generale) if b.moyenne_generale is not None else None
                ),
                "rang": b.rang, "mention": b.mention, "statut": b.statut,
            }
            for b, e in lignes
        ],
    }



# ================================================================
# MATERNELLE — saisie Admis/Non + appréciation, par l'enseignant
# ================================================================

def _classe_maternelle_du_prof(db: Session, enseignant_id: int, classe_id: int):
    """La classe de maternelle dont cet enseignant est le titulaire, sinon 403/404.

    La maternelle n'a pas de matières/notes : le guard « instituteur du primaire »
    (_classe_pilotee_par) ne s'applique pas. Le titulaire est ici le professeur
    principal de la classe (ou, à défaut, un enseignant affecté à la classe).
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    if not ens or ens.etablissement_id != classe.etablissement_id:
        raise HTTPException(404, "Classe non trouvée")
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    if not niveau or niveau.evaluation_simple != "O":
        raise HTTPException(403, "Cet écran est réservé aux classes de maternelle.")
    est_titulaire = classe.professeur_principal == enseignant_id or db.query(
        Affectation.affectation_id
    ).filter(
        Affectation.classe_id == classe_id,
        Affectation.enseignant_id == enseignant_id,
        Affectation.statut == "ACTIVE",
    ).first() is not None
    if not est_titulaire:
        raise HTTPException(403, "Vous n'êtes pas l'enseignant de cette classe.")
    return classe, niveau


@router.get("/{enseignant_id}/classe/{classe_id}/maternelle")
def maternelle_lister(
    enseignant_id: int, classe_id: int,
    _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """Liste les enfants d'une classe de maternelle avec leur Admis/Non + appréciation."""
    from app.models.academique import ResultatOfficielExamen
    classe, niveau = _classe_maternelle_du_prof(db, enseignant_id, classe_id)
    section_au_dessus = db.query(Niveau.niveau_id).filter(
        Niveau.cycle_id == niveau.cycle_id, Niveau.ordre > niveau.ordre
    ).first()
    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE",
    ).order_by(Eleve.nom, Eleve.prenom).all()
    ids = [i.inscription_id for i, _ in inscriptions]
    officiels = {}
    if ids:
        officiels = {
            r.inscription_id: r
            for r in db.query(ResultatOfficielExamen).filter(
                ResultatOfficielExamen.inscription_id.in_(ids)
            ).all()
        }
    return {
        "classe": {"classe_id": classe.classe_id, "libelle": classe.libelle},
        "section": niveau.libelle,
        # Attestation de fin de cycle : seulement la dernière section (Grande Section).
        "attestation_possible": section_au_dessus is None,
        "eleves": [
            {
                "inscription_id": i.inscription_id,
                "eleve_id": e.eleve_id,
                "nom": e.nom, "prenom": e.prenom, "matricule": e.matricule,
                "resultat": officiels[i.inscription_id].resultat if i.inscription_id in officiels else None,
                "observation": officiels[i.inscription_id].observation if i.inscription_id in officiels else None,
            }
            for i, e in inscriptions
        ],
    }


class _MaternelleItem(BaseModel):
    inscription_id: int
    resultat: str            # ADMIS | NON_ADMIS
    observation: Optional[str] = None


class _MaternelleSaisie(BaseModel):
    resultats: List[_MaternelleItem]


@router.post("/{enseignant_id}/classe/{classe_id}/maternelle")
def maternelle_saisir(
    enseignant_id: int, classe_id: int, data: _MaternelleSaisie,
    _auth: dict = Depends(_enseignant_auth), db: Session = Depends(get_db),
):
    """Enregistre Admis/Non + appréciation pour les enfants de la classe.

    Rejouable (met à jour un résultat déjà saisi). Chaque inscription doit
    appartenir à CETTE classe — pas moyen de saisir pour une autre.
    """
    from app.models.academique import ResultatOfficielExamen
    classe, niveau = _classe_maternelle_du_prof(db, enseignant_id, classe_id)
    verifier_annee_modifiable(db, classe.annee_id)

    valides = ("ADMIS", "NON_ADMIS")
    invalides = [r.resultat for r in data.resultats if r.resultat not in valides]
    if invalides:
        raise HTTPException(400, f"Résultat invalide {sorted(set(invalides))} — attendus : {list(valides)}")
    if not data.resultats:
        return {"message": "Aucun résultat à enregistrer.", "enregistres": 0}

    ids_classe = {
        i for (i,) in db.query(Inscription.inscription_id).filter(
            Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
        ).all()
    }
    hors = [r.inscription_id for r in data.resultats if r.inscription_id not in ids_classe]
    if hors:
        raise HTTPException(404, f"Inscriptions hors de cette classe : {sorted(hors)}")

    ens = db.query(Enseignant).filter(Enseignant.enseignant_id == enseignant_id).first()
    saisi_par = f"{ens.prenom} {ens.nom}".strip() if ens else None
    existants = {
        r.inscription_id: r
        for r in db.query(ResultatOfficielExamen).filter(
            ResultatOfficielExamen.inscription_id.in_([r.inscription_id for r in data.resultats])
        ).all()
    }
    n = 0
    for item in data.resultats:
        obs = (item.observation or "").strip() or None
        existant = existants.get(item.inscription_id)
        if existant:
            existant.resultat = item.resultat
            existant.observation = obs
            existant.saisi_par = saisi_par
        else:
            db.add(ResultatOfficielExamen(
                inscription_id=item.inscription_id, examen_national=None,
                resultat=item.resultat, observation=obs, saisi_par=saisi_par,
            ))
        n += 1
    db.commit()
    return {"message": f"{n} résultat(s) enregistré(s).", "enregistres": n}
