"""
SMARTSCHOOL API — Routes Évaluations, Centralisation des Notes, Calcul Moyennes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.models.academique import (
    Evaluation, Note, Inscription, Eleve, Classe, Matiere,
    Trimestre, TypeEvaluation, Enseignant, ClasseMatiere,
    Affectation, Bulletin, BulletinLigne, AnneeScolaire, ParametreEtablissement,
    Cycle, Niveau, Etablissement
)
from app.schemas.schemas import (
    EvaluationCreate, EvaluationOut, NoteCreate, NoteUpdate, NoteOut,
    TypeEvaluationCreate, TypeEvaluationUpdate, TypeEvaluationOut
)

router = APIRouter(prefix="/api/evaluations", tags=["Évaluations"])


# ════════════════════════════════════════════════════════════
# HELPER: Appréciation automatique
# ════════════════════════════════════════════════════════════
def get_appreciation(moyenne: float, note_sur: float = 20) -> str:
    """Retourne l'appréciation textuelle selon le barème guinéen."""
    if note_sur == 10:
        if moyenne >= 9: return "Très Bien"
        if moyenne >= 7: return "Bien"
        if moyenne >= 6: return "Assez Bien"
        if moyenne >= 5: return "Passable"
        return "Insuffisant"
    else:  # /20
        if moyenne >= 16: return "Très Bien"
        if moyenne >= 14: return "Bien"
        if moyenne >= 12: return "Assez Bien"
        if moyenne >= 10: return "Passable"
        return "Insuffisant"


# Seuils de mentions par défaut, alignés sur les valeurs par défaut du
# frontend (frontend/src/app/parametres/notation/page.tsx — `mentions` state).
_SEUILS_MENTIONS_DEFAUT = {
    'primaire': {'tb': 9.0,  'b': 7.0,  'ab': 6.0,  'p': 5.0},
    'college':  {'tb': 16.0, 'b': 14.0, 'ab': 12.0, 'p': 10.0},
    'lycee':    {'tb': 16.0, 'b': 14.0, 'ab': 12.0, 'p': 10.0},
}

# Codes de cycle (ss_cycles.code) -> clé utilisée par le frontend/les paramètres
_CYCLE_CODE_TO_KEY = {"PRM": "primaire", "CLG": "college", "LYC": "lycee"}


def get_cycle_key(classe_id: int, db: Session) -> str:
    """Retourne la clé de cycle ('primaire'/'college'/'lycee') d'une classe.

    Se base sur Classe -> Niveau -> Cycle.code. Retombe sur 'college' si
    l'information est introuvable (comportement historique inchangé).
    """
    row = (
        db.query(Cycle.code)
        .join(Niveau, Niveau.cycle_id == Cycle.cycle_id)
        .join(Classe, Classe.niveau_id == Niveau.niveau_id)
        .filter(Classe.classe_id == classe_id)
        .first()
    )
    code = row[0] if row else None
    return _CYCLE_CODE_TO_KEY.get(code, "college")


def get_notation_seuils(db=None, cycle: str = "college", etablissement_id: int = 1) -> dict:
    """Lit les seuils de mentions (par cycle) depuis ss_parametres, avec fallback.

    Les clés persistées par la page /parametres/notation sont de la forme
    `notation.mention.{cycle}.{tb|b|ab|p}` — il faut lire exactement ce format
    (auparavant ce code lisait `notation.mention_tres_bien`, qui n'existe pas,
    d'où des mentions toujours calculées avec les valeurs par défaut).
    """
    seuils = dict(_SEUILS_MENTIONS_DEFAUT.get(cycle, _SEUILS_MENTIONS_DEFAUT["college"]))
    if db is not None:
        try:
            prefix = f"notation.mention.{cycle}."
            params = db.query(ParametreEtablissement).filter(
                ParametreEtablissement.etablissement_id == etablissement_id,
                ParametreEtablissement.categorie == 'NOTATION',
                ParametreEtablissement.cle.like(f"{prefix}%"),
            ).all()
            for p in params:
                key = p.cle.replace(prefix, '')
                if key in seuils:
                    seuils[key] = float(p.valeur)
        except Exception:
            pass
    return seuils


def get_mention(moyenne: float, db=None, cycle: str = "college") -> str:
    """Retourne la mention pour le bulletin selon les seuils configurés (par cycle)."""
    s = get_notation_seuils(db, cycle)
    if moyenne >= s['tb']: return "TRÈS BIEN"
    if moyenne >= s['b']:  return "BIEN"
    if moyenne >= s['ab']: return "ASSEZ BIEN"
    if moyenne >= s['p']:  return "PASSABLE"
    return "INSUFFISANT"


# ════════════════════════════════════════════════════════════
# CRUD Évaluations de base
# ════════════════════════════════════════════════════════════

@router.get("")
def list_evaluations(
    classe_id: Optional[int] = None,
    matiere_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    query = db.query(Evaluation)
    if classe_id:
        query = query.filter(Evaluation.classe_id == classe_id)
    if matiere_id:
        query = query.filter(Evaluation.matiere_id == matiere_id)
    if trimestre_id:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)
    return query.order_by(Evaluation.date_evaluation.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=EvaluationOut, status_code=201)
def create_evaluation(data: EvaluationCreate, db: Session = Depends(get_db)):
    ev = Evaluation(**data.model_dump())
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/{evaluation_id}/notes")
def get_notes_evaluation(evaluation_id: int, db: Session = Depends(get_db)):
    results = db.query(
        Note.note_id, Note.valeur, Note.est_absent, Note.observation,
        Eleve.matricule, Eleve.nom, Eleve.prenom
    ).join(
        Inscription, Note.inscription_id == Inscription.inscription_id
    ).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Note.evaluation_id == evaluation_id
    ).order_by(Eleve.nom, Eleve.prenom).all()

    return [
        {
            "note_id": r.note_id, "matricule": r.matricule,
            "nom": r.nom, "prenom": r.prenom,
            "valeur": float(r.valeur) if r.valeur else None,
            "est_absent": r.est_absent, "observation": r.observation
        } for r in results
    ]


@router.post("/{evaluation_id}/initialiser")
def initialiser_notes(evaluation_id: int, db: Session = Depends(get_db)):
    """Crée une ligne de note pour chaque élève inscrit dans la classe de l'évaluation."""
    ev = db.query(Evaluation).filter(Evaluation.evaluation_id == evaluation_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Évaluation non trouvée")

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == ev.classe_id,
        Inscription.statut == "ACTIVE"
    ).all()

    count = 0
    for insc in inscriptions:
        exists = db.query(Note).filter(
            Note.evaluation_id == evaluation_id,
            Note.inscription_id == insc.inscription_id
        ).first()
        if not exists:
            note = Note(evaluation_id=evaluation_id, inscription_id=insc.inscription_id, est_absent="N")
            db.add(note)
            count += 1

    db.commit()
    return {"message": f"{count} notes initialisées"}


# ════════════════════════════════════════════════════════════
# CENTRALISATION DES NOTES — Vue Admin
# ════════════════════════════════════════════════════════════

@router.get("/centralisees")
def get_evaluations_centralisees(
    classe_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Liste toutes les évaluations centralisées (envoyées par les enseignants)."""
    query = db.query(Evaluation).filter(Evaluation.statut == "CENTRALISEE")
    if classe_id:
        query = query.filter(Evaluation.classe_id == classe_id)
    if trimestre_id:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)

    evals = query.order_by(desc(Evaluation.date_evaluation)).all()
    result = []
    for ev in evals:
        mat = db.query(Matiere).filter(Matiere.matiere_id == ev.matiere_id).first()
        cls = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
        tri = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
        ens = db.query(Enseignant).filter(Enseignant.enseignant_id == ev.enseignant_id).first()
        nb_notes = db.query(func.count(Note.note_id)).filter(
            Note.evaluation_id == ev.evaluation_id, Note.est_absent == "N", Note.valeur.isnot(None)
        ).scalar() or 0
        moy = db.query(func.avg(Note.valeur)).filter(
            Note.evaluation_id == ev.evaluation_id, Note.est_absent == "N"
        ).scalar()

        result.append({
            "evaluation_id": ev.evaluation_id,
            "libelle": ev.libelle,
            "date_evaluation": str(ev.date_evaluation) if ev.date_evaluation else None,
            "matiere": mat.libelle if mat else "?",
            "matiere_id": ev.matiere_id,
            "classe": cls.libelle if cls else "?",
            "classe_id": ev.classe_id,
            "trimestre": tri.libelle if tri else "?",
            "trimestre_id": ev.trimestre_id,
            "enseignant": f"{ens.prenom} {ens.nom}" if ens else "?",
            "note_sur": float(ev.note_sur or 20),
            "coefficient": float(ev.coefficient or 1),
            "nb_notes": nb_notes,
            "moyenne": round(float(moy), 2) if moy else None,
            "statut": ev.statut,
        })
    return result


@router.get("/centralisation/stats")
def get_centralisation_stats(trimestre_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Statistiques globales de centralisation."""
    query = db.query(Evaluation)
    if trimestre_id:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)

    total_evals = query.count()
    centralisees = query.filter(Evaluation.statut == "CENTRALISEE").count()
    non_centralisees = query.filter(Evaluation.statut != "CENTRALISEE").count()

    return {
        "total_evaluations": total_evals,
        "centralisees": centralisees,
        "non_centralisees": non_centralisees,
        "taux_centralisation": round(centralisees / total_evals * 100, 1) if total_evals > 0 else 0,
    }


@router.get("/classe/{classe_id}/notes-centralisees")
def get_notes_centralisees_classe(
    classe_id: int,
    trimestre_id: int = 1,
    db: Session = Depends(get_db)
):
    """Vue complète des notes d'une classe : tableau élèves × matières avec moyennes."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    cycle_key = get_cycle_key(classe_id, db)

    # Matières de cette classe
    cms = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.est_active == "O"
    ).all()
    matieres = []
    for cm in cms:
        mat = db.query(Matiere).filter(Matiere.matiere_id == cm.matiere_id).first()
        if mat:
            matieres.append({
                "matiere_id": mat.matiere_id,
                "code": mat.code,
                "libelle": mat.libelle,
                "coefficient": float(cm.coefficient) if cm.coefficient else float(mat.coefficient_defaut or 1),
            })

    # Élèves inscrits
    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()

    eleves_data = []
    for insc in inscriptions:
        eleve = db.query(Eleve).filter(Eleve.eleve_id == insc.eleve_id).first()
        if not eleve:
            continue

        matieres_notes = {}
        total_coef = 0
        total_points = 0

        for mat_info in matieres:
            # Toutes les évaluations centralisées pour cette matière/classe/trimestre
            evals = db.query(Evaluation).filter(
                Evaluation.classe_id == classe_id,
                Evaluation.matiere_id == mat_info["matiere_id"],
                Evaluation.trimestre_id == trimestre_id,
                Evaluation.statut == "CENTRALISEE"
            ).all()

            # Notes de cet élève dans ces évaluations
            total_coef_eval = 0
            total_points_eval = 0
            notes_list = []

            for ev in evals:
                note = db.query(Note).filter(
                    Note.evaluation_id == ev.evaluation_id,
                    Note.inscription_id == insc.inscription_id,
                    Note.est_absent == "N",
                    Note.valeur.isnot(None)
                ).first()
                if note:
                    # Normaliser sur 20 si nécessaire
                    val = float(note.valeur)
                    note_sur = float(ev.note_sur or 20)
                    normalized = val * 20 / note_sur if note_sur != 20 else val
                    coef_eval = float(ev.coefficient or 1)
                    total_coef_eval += coef_eval
                    total_points_eval += normalized * coef_eval
                    notes_list.append({"valeur": val, "note_sur": note_sur, "coef": coef_eval})

            # Moyenne de la matière
            if total_coef_eval > 0:
                moy_mat = round(total_points_eval / total_coef_eval, 2)
                coef_mat = mat_info["coefficient"]
                total_coef += coef_mat
                total_points += moy_mat * coef_mat
            else:
                moy_mat = None

            matieres_notes[str(mat_info["matiere_id"])] = {
                "moyenne": moy_mat,
                "nb_notes": len(notes_list),
                "appreciation": get_appreciation(moy_mat) if moy_mat is not None else None,
            }

        # Moyenne générale pondérée
        moy_gen = round(total_points / total_coef, 2) if total_coef > 0 else None

        eleves_data.append({
            "eleve_id": eleve.eleve_id,
            "inscription_id": insc.inscription_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "sexe": eleve.sexe,
            "matieres": matieres_notes,
            "moyenne_generale": moy_gen,
            "mention": get_mention(moy_gen, db, cycle_key) if moy_gen is not None else None,
        })

    # Trier par moyenne décroissante pour le rang
    eleves_data.sort(key=lambda x: x["moyenne_generale"] or 0, reverse=True)
    for i, e in enumerate(eleves_data):
        e["rang"] = i + 1

    # Stats par matière (moyenne de classe, min, max)
    matieres_stats = {}
    for mat_info in matieres:
        mid = str(mat_info["matiere_id"])
        vals = [e["matieres"].get(mid, {}).get("moyenne") for e in eleves_data if e["matieres"].get(mid, {}).get("moyenne") is not None]
        matieres_stats[mid] = {
            "moyenne_classe": round(sum(vals) / len(vals), 2) if vals else None,
            "note_min": min(vals) if vals else None,
            "note_max": max(vals) if vals else None,
        }

    return {
        "classe": {"classe_id": classe.classe_id, "code": classe.code, "libelle": classe.libelle},
        "matieres": matieres,
        "matieres_stats": matieres_stats,
        "eleves": eleves_data,
        "effectif": len(eleves_data),
    }


# ════════════════════════════════════════════════════════════
# CALCUL DES MOYENNES & GÉNÉRATION BULLETINS
# ════════════════════════════════════════════════════════════

@router.post("/classe/{classe_id}/calculer-moyennes")
def calculer_moyennes(classe_id: int, trimestre_id: int = 1, db: Session = Depends(get_db)):
    """Calcule toutes les moyennes et crée/met à jour les bulletins pour une classe + trimestre."""
    # D'abord récupérer les données via la vue centralisée
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    cycle_key = get_cycle_key(classe_id, db)

    cms = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.est_active == "O"
    ).all()

    matieres_info = {}
    for cm in cms:
        mat = db.query(Matiere).filter(Matiere.matiere_id == cm.matiere_id).first()
        if mat:
            matieres_info[mat.matiere_id] = {
                "libelle": mat.libelle,
                "coefficient": float(cm.coefficient) if cm.coefficient else float(mat.coefficient_defaut or 1),
            }

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()

    effectif = len(inscriptions)
    bulletins_created = 0
    bulletins_data = []

    for insc in inscriptions:
        total_coef = 0
        total_points = 0
        lignes_data = []

        for mat_id, mat_info in matieres_info.items():
            evals = db.query(Evaluation).filter(
                Evaluation.classe_id == classe_id,
                Evaluation.matiere_id == mat_id,
                Evaluation.trimestre_id == trimestre_id,
                Evaluation.statut == "CENTRALISEE"
            ).all()

            coef_eval_total = 0
            points_eval_total = 0

            for ev in evals:
                note = db.query(Note).filter(
                    Note.evaluation_id == ev.evaluation_id,
                    Note.inscription_id == insc.inscription_id,
                    Note.est_absent == "N",
                    Note.valeur.isnot(None)
                ).first()
                if note:
                    val = float(note.valeur)
                    note_sur = float(ev.note_sur or 20)
                    normalized = val * 20 / note_sur if note_sur != 20 else val
                    coef = float(ev.coefficient or 1)
                    coef_eval_total += coef
                    points_eval_total += normalized * coef

            moy_mat = round(points_eval_total / coef_eval_total, 2) if coef_eval_total > 0 else None

            if moy_mat is not None:
                total_coef += mat_info["coefficient"]
                total_points += moy_mat * mat_info["coefficient"]

            lignes_data.append({
                "matiere_id": mat_id,
                "moyenne_matiere": moy_mat,
                "coefficient": mat_info["coefficient"],
                "appreciation": get_appreciation(moy_mat) if moy_mat is not None else None,
            })

        moy_gen = round(total_points / total_coef, 2) if total_coef > 0 else None

        bulletins_data.append({
            "inscription_id": insc.inscription_id,
            "moyenne_generale": moy_gen,
            "lignes": lignes_data,
        })

    # Trier et calculer les rangs
    bulletins_data.sort(key=lambda x: x["moyenne_generale"] or 0, reverse=True)

    # Calculer moyennes de classe par matière
    matieres_class_stats = {}
    for mat_id in matieres_info:
        vals = [
            l["moyenne_matiere"]
            for b in bulletins_data
            for l in b["lignes"]
            if l["matiere_id"] == mat_id and l["moyenne_matiere"] is not None
        ]
        matieres_class_stats[mat_id] = {
            "moyenne": round(sum(vals) / len(vals), 2) if vals else None,
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
        }

    # Créer ou mettre à jour les bulletins
    for rang_idx, bd in enumerate(bulletins_data):
        rang = rang_idx + 1
        mention = get_mention(bd["moyenne_generale"], db, cycle_key) if bd["moyenne_generale"] is not None else None

        # Chercher bulletin existant
        existing = db.query(Bulletin).filter(
            Bulletin.inscription_id == bd["inscription_id"],
            Bulletin.trimestre_id == trimestre_id
        ).first()

        if existing:
            existing.moyenne_generale = bd["moyenne_generale"]
            existing.rang = rang
            existing.effectif_classe = effectif
            existing.mention = mention
            existing.statut = "CALCULE"
            bulletin = existing
            # Supprimer anciennes lignes
            db.query(BulletinLigne).filter(BulletinLigne.bulletin_id == existing.bulletin_id).delete()
        else:
            bulletin = Bulletin(
                inscription_id=bd["inscription_id"],
                trimestre_id=trimestre_id,
                type_bulletin="TRIMESTRIEL",
                moyenne_generale=bd["moyenne_generale"],
                rang=rang,
                effectif_classe=effectif,
                mention=mention,
                statut="CALCULE",
            )
            db.add(bulletin)
            db.flush()
            bulletins_created += 1

        # Créer les lignes du bulletin
        for l in bd["lignes"]:
            stats = matieres_class_stats.get(l["matiere_id"], {})
            ligne = BulletinLigne(
                bulletin_id=bulletin.bulletin_id,
                matiere_id=l["matiere_id"],
                moyenne_matiere=l["moyenne_matiere"],
                moyenne_classe=stats.get("moyenne"),
                note_min=stats.get("min"),
                note_max=stats.get("max"),
                coefficient=l["coefficient"],
                appreciation=l["appreciation"],
            )
            db.add(ligne)

    db.commit()

    return {
        "message": f"✅ Moyennes calculées pour {classe.libelle} — {effectif} bulletins",
        "classe": classe.libelle,
        "effectif": effectif,
        "bulletins_crees": bulletins_created,
        "bulletins_total": len(bulletins_data),
    }


# ════════════════════════════════════════════════════════════
# CONSULTATION DES BULLETINS
# ════════════════════════════════════════════════════════════

@router.get("/classe/{classe_id}/bulletins")
def get_bulletins_classe(classe_id: int, trimestre_id: int = 1, db: Session = Depends(get_db)):
    """Récupère tous les bulletins générés pour une classe + trimestre."""
    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()

    results = []
    for insc in inscriptions:
        bulletin = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id,
            Bulletin.trimestre_id == trimestre_id
        ).first()

        if not bulletin:
            continue

        eleve = db.query(Eleve).filter(Eleve.eleve_id == insc.eleve_id).first()
        if not eleve:
            continue

        # Récupérer les lignes du bulletin
        lignes = db.query(BulletinLigne).filter(
            BulletinLigne.bulletin_id == bulletin.bulletin_id
        ).all()

        lignes_data = []
        total_coef = 0
        for l in lignes:
            mat = db.query(Matiere).filter(Matiere.matiere_id == l.matiere_id).first()
            lignes_data.append({
                "matiere": mat.libelle if mat else "?",
                "matiere_id": l.matiere_id,
                "coefficient": float(l.coefficient) if l.coefficient else 1,
                "moyenne_matiere": float(l.moyenne_matiere) if l.moyenne_matiere is not None else None,
                "moyenne_classe": float(l.moyenne_classe) if l.moyenne_classe is not None else None,
                "note_min": float(l.note_min) if l.note_min is not None else None,
                "note_max": float(l.note_max) if l.note_max is not None else None,
                "appreciation": l.appreciation,
            })
            if l.coefficient:
                total_coef += float(l.coefficient)

        results.append({
            "bulletin_id": bulletin.bulletin_id,
            "eleve_id": eleve.eleve_id,
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "matricule": eleve.matricule,
            "sexe": eleve.sexe,
            "photo": eleve.photo_url,
            "moyenne_generale": float(bulletin.moyenne_generale) if bulletin.moyenne_generale is not None else None,
            "rang": bulletin.rang,
            "effectif_classe": bulletin.effectif_classe,
            "mention": bulletin.mention,
            "decision": bulletin.decision,
            "statut": bulletin.statut,
            "total_coefficient": total_coef,
            "lignes": lignes_data,
        })

    # Trier par rang
    results.sort(key=lambda x: x["rang"] or 999)
    return results


# ════════════════════════════════════════════════════════════
# MISE À JOUR DÉCISION BULLETIN
# ════════════════════════════════════════════════════════════

class BulletinDecisionUpdate(BaseModel):
    decision: Optional[str] = None

@router.put("/bulletins/{bulletin_id}/decision")
def update_bulletin_decision(bulletin_id: int, data: BulletinDecisionUpdate, db: Session = Depends(get_db)):
    """Met à jour la décision du conseil de classe pour un bulletin."""
    bulletin = db.query(Bulletin).filter(Bulletin.bulletin_id == bulletin_id).first()
    if not bulletin:
        raise HTTPException(404, "Bulletin non trouvé")
    bulletin.decision = data.decision
    db.commit()
    return {"message": "✅ Décision enregistrée", "bulletin_id": bulletin_id, "decision": data.decision}


# ════════════════════════════════════════════════════════════
# PUBLICATION BULLETIN (individuel)
# ════════════════════════════════════════════════════════════

@router.put("/bulletins/{bulletin_id}/publier")
def publier_bulletin(bulletin_id: int, db: Session = Depends(get_db)):
    """Publie un bulletin individuel (le rend visible sur le portail parent)."""
    bulletin = db.query(Bulletin).filter(Bulletin.bulletin_id == bulletin_id).first()
    if not bulletin:
        raise HTTPException(404, "Bulletin non trouvé")
    bulletin.statut = "PUBLIE"
    db.commit()
    return {"message": "✅ Bulletin publié", "bulletin_id": bulletin_id, "statut": "PUBLIE"}


@router.put("/bulletins/{bulletin_id}/depublier")
def depublier_bulletin(bulletin_id: int, db: Session = Depends(get_db)):
    """Dépublie un bulletin (le masque du portail parent)."""
    bulletin = db.query(Bulletin).filter(Bulletin.bulletin_id == bulletin_id).first()
    if not bulletin:
        raise HTTPException(404, "Bulletin non trouvé")
    bulletin.statut = "BROUILLON"
    db.commit()
    return {"message": "Bulletin dépublié", "bulletin_id": bulletin_id, "statut": "BROUILLON"}


# ════════════════════════════════════════════════════════════
# PUBLICATION EN MASSE (toute une classe)
# ════════════════════════════════════════════════════════════

@router.put("/classe/{classe_id}/bulletins/publier-tout")
def publier_bulletins_classe(classe_id: int, trimestre_id: int = 1, db: Session = Depends(get_db)):
    """Publie tous les bulletins d'une classe pour un trimestre donné."""
    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()
    count = 0
    for insc in inscriptions:
        bulletin = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id,
            Bulletin.trimestre_id == trimestre_id
        ).first()
        if bulletin and bulletin.statut != "PUBLIE":
            bulletin.statut = "PUBLIE"
            count += 1
    db.commit()
    return {"message": f"✅ {count} bulletin(s) publié(s)", "count": count}


# ════════════════════════════════════════════════════════════
# MODIFICATION NOTES BATCH (admin)
# ════════════════════════════════════════════════════════════

class AdminNoteUpdateItem(BaseModel):
    note_id: int
    valeur: Optional[float] = None
    est_absent: bool = False
    observation: Optional[str] = None

class AdminBatchNotesUpdate(BaseModel):
    notes: list[AdminNoteUpdateItem]


@router.put("/{evaluation_id}/notes/batch-update")
def admin_update_notes_batch(evaluation_id: int, data: AdminBatchNotesUpdate, db: Session = Depends(get_db)):
    """Admin: modifier des notes en batch sur une évaluation."""
    ev = db.query(Evaluation).filter(Evaluation.evaluation_id == evaluation_id).first()
    if not ev:
        raise HTTPException(404, "Évaluation non trouvée")

    updated = 0
    for item in data.notes:
        note = db.query(Note).filter(Note.note_id == item.note_id, Note.evaluation_id == evaluation_id).first()
        if note:
            note.valeur = item.valeur if not item.est_absent else None
            note.est_absent = "O" if item.est_absent else "N"
            note.observation = item.observation
            updated += 1

    db.commit()
    return {"message": f"{updated} notes mises à jour", "nb_modifiees": updated}


# ════════════════════════════════════════════════════════════
# NOTES CRUD (sous-router)
# ════════════════════════════════════════════════════════════
notes_router = APIRouter(prefix="/api/notes", tags=["Notes"])


@notes_router.post("", response_model=NoteOut, status_code=201)
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    note = Note(**data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@notes_router.put("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.note_id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note non trouvée")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(note, key, value)
    db.commit()
    db.refresh(note)
    return note


@notes_router.put("/batch")
def update_notes_batch(notes: List[NoteUpdate], note_ids: List[int], db: Session = Depends(get_db)):
    """Mise à jour en lot des notes (saisie de notes)."""
    updated = 0
    for note_id, data in zip(note_ids, notes):
        note = db.query(Note).filter(Note.note_id == note_id).first()
        if note:
            for key, value in data.model_dump(exclude_unset=True).items():
                setattr(note, key, value)
            updated += 1
    db.commit()
    return {"message": f"{updated} notes mises à jour"}


# ════════════════════════════════════════════════════════════
# TYPE EVALUATION CRUD
# ════════════════════════════════════════════════════════════
@router.get("/types", response_model=List[TypeEvaluationOut])
def get_types_evaluation(db: Session = Depends(get_db)):
    return db.query(TypeEvaluation).all()

@router.post("/types", response_model=TypeEvaluationOut, status_code=201)
def create_type_evaluation(data: TypeEvaluationCreate, db: Session = Depends(get_db)):
    type_ev = TypeEvaluation(**data.model_dump())
    db.add(type_ev)
    db.commit()
    db.refresh(type_ev)
    return type_ev

@router.put("/types/{type_eval_id}", response_model=TypeEvaluationOut)
def update_type_evaluation(type_eval_id: int, data: TypeEvaluationUpdate, db: Session = Depends(get_db)):
    type_ev = db.query(TypeEvaluation).filter(TypeEvaluation.type_eval_id == type_eval_id).first()
    if not type_ev:
        raise HTTPException(status_code=404, detail="Type d'évaluation non trouvé")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(type_ev, key, value)
    db.commit()
    db.refresh(type_ev)
    return type_ev

@router.delete("/types/{type_eval_id}")
def delete_type_evaluation(type_eval_id: int, db: Session = Depends(get_db)):
    type_ev = db.query(TypeEvaluation).filter(TypeEvaluation.type_eval_id == type_eval_id).first()
    if not type_ev:
        raise HTTPException(status_code=404, detail="Type d'évaluation non trouvé")
    
    # Vérifier s'il y a des évaluations liées
    linked_evals_count = db.query(Evaluation).filter(Evaluation.type_eval_id == type_eval_id).count()
    if linked_evals_count > 0:
        raise HTTPException(status_code=400, detail="Impossible de supprimer ce type d'évaluation car il est lié à des évaluations existantes.")
        
    db.delete(type_ev)
    db.commit()
    return {"message": "Type d'évaluation supprimé avec succès"}


# ════════════════════════════════════════════════════════════
# GÉNÉRATION PDF — Bulletin individuel
# ════════════════════════════════════════════════════════════

@router.get("/bulletins/{bulletin_id}/pdf")
def generer_bulletin_pdf(bulletin_id: int, db: Session = Depends(get_db)):
    """Génère le bulletin scolaire au format PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement
    from app.core.documents_settings import (
        get_documents_settings, TEMPLATES_BULLETIN, dessiner_filigrane,
        appreciation_pour_moyenne, _bool
    )
    import io

    # ── Charger le bulletin + jointures ──
    bulletin = db.query(Bulletin).filter(Bulletin.bulletin_id == bulletin_id).first()
    if not bulletin:
        raise HTTPException(404, "Bulletin non trouvé")

    inscription = db.query(Inscription).filter(
        Inscription.inscription_id == bulletin.inscription_id
    ).first()
    if not inscription:
        raise HTTPException(404, "Inscription non trouvée")

    eleve = db.query(Eleve).filter(Eleve.eleve_id == inscription.eleve_id).first()
    classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == bulletin.trimestre_id).first()
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == inscription.annee_id).first()
    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()

    # ── Paramètres documents ──
    settings = get_documents_settings(db, classe.etablissement_id)
    template_key = settings.get("documents.template_bulletin", "classique")
    tmpl = TEMPLATES_BULLETIN.get(template_key, TEMPLATES_BULLETIN["classique"])

    # ── Lignes du bulletin triées par matière ──
    lignes = (
        db.query(BulletinLigne, Matiere)
        .join(Matiere, BulletinLigne.matiere_id == Matiere.matiere_id)
        .filter(BulletinLigne.bulletin_id == bulletin_id)
        .order_by(Matiere.libelle)
        .all()
    )

    # ── Créer le PDF ──
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    largeur, hauteur = A4
    cp = tmpl["couleur_primaire"]
    cs = tmpl["couleur_secondaire"]
    cl = tmpl["couleur_ligne"]

    y = hauteur - 1.5 * cm

    # ── EN-TÊTE ──
    nom_ecole = etablissement.nom if etablissement else "SmartSchool"
    slogan = getattr(etablissement, "slogan", "") or ""

    # "République de Guinée" si activé
    if _bool(settings.get("documents.entete_republique", "true")):
        pdf.setFont(tmpl["police_titre"], 10)
        pdf.setFillColorRGB(*cp)
        pdf.drawCentredString(largeur / 2, y, "RÉPUBLIQUE DE GUINÉE")
        y -= 0.35 * cm
        pdf.setFont(tmpl["police_corps"], 7)
        pdf.drawCentredString(largeur / 2, y, "Travail — Justice — Solidarité")
        y -= 0.6 * cm

    # Logo placeholder + nom école
    if _bool(settings.get("documents.entete_logo", "true")):
        pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
        pdf.rect(1.5 * cm, y - 1.2 * cm, 1.8 * cm, 1.5 * cm)
        pdf.setFont("Helvetica", 7)
        pdf.setFillColorRGB(0.5, 0.5, 0.5)
        pdf.drawCentredString(2.4 * cm, y - 0.5 * cm, "LOGO")

    pdf.setFont(tmpl["police_titre"], tmpl["taille_titre"])
    pdf.setFillColorRGB(*cp)
    pdf.drawCentredString(largeur / 2, y, nom_ecole)
    y -= 0.5 * cm

    if _bool(settings.get("documents.entete_slogan", "true")) and slogan:
        pdf.setFont(tmpl["police_corps"], 8)
        pdf.setFillColorRGB(0.4, 0.4, 0.4)
        pdf.drawCentredString(largeur / 2, y, slogan)
        y -= 0.4 * cm

    # Adresse / contact
    adresse = getattr(etablissement, "adresse", "") or ""
    tel = getattr(etablissement, "telephone", "") or ""
    email = getattr(etablissement, "email", "") or ""
    if adresse:
        pdf.setFont(tmpl["police_corps"], 7)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        pdf.drawCentredString(largeur / 2, y, adresse)
        y -= 0.35 * cm
    if tel or email:
        contact = ""
        if tel:
            contact += f"Tél: {tel}"
        if email:
            contact += f"  |  {email}" if contact else email
        pdf.setFont(tmpl["police_corps"], 7)
        pdf.drawCentredString(largeur / 2, y, contact)
        y -= 0.35 * cm

    y -= 0.3 * cm

    # Titre du bulletin
    pdf.setLineWidth(1.5)
    pdf.setStrokeColorRGB(*cl)
    pdf.line(1.5 * cm, y, largeur - 1.5 * cm, y)
    y -= 0.8 * cm
    pdf.setFont(tmpl["police_titre"], 14)
    pdf.setFillColorRGB(*cp)
    titre_trimestre = trimestre.libelle if trimestre else "Trimestre"
    pdf.drawCentredString(largeur / 2, y, f"BULLETIN DE NOTES — {titre_trimestre}")
    y -= 0.3 * cm
    pdf.setLineWidth(1.5)
    pdf.line(1.5 * cm, y, largeur - 1.5 * cm, y)

    # ── INFOS ÉLÈVE ──
    y -= 0.7 * cm
    pdf.setFont(tmpl["police_corps"], 9)
    pdf.setFillColorRGB(0, 0, 0)
    annee_label = annee.libelle if annee else ""
    pdf.drawString(1.8 * cm, y, f"Élève : {eleve.prenom} {eleve.nom}")
    pdf.drawString(largeur / 2, y, f"Classe : {classe.libelle}")
    y -= 0.4 * cm
    pdf.drawString(1.8 * cm, y, f"Matricule : {eleve.matricule or 'N/A'}")
    pdf.drawString(largeur / 2, y, f"Année : {annee_label}")

    # ── TABLEAU DES NOTES ──
    y -= 0.8 * cm
    marge_gauche = 1.5 * cm
    marge_droite = largeur - 1.5 * cm
    tab_w = marge_droite - marge_gauche

    # Colonnes
    show_rang = _bool(settings.get("documents.champ_rang", "true"))
    show_moy_cl = _bool(settings.get("documents.champ_moyenne_classe", "true"))
    show_minmax = _bool(settings.get("documents.champ_min_max", "true"))

    col_matiere_w = 4.5 * cm
    col_moy_w = 1.8 * cm
    col_coeff_w = 1.2 * cm
    col_extra_w = 1.5 * cm
    col_appr_w = tab_w - col_matiere_w - col_moy_w - col_coeff_w
    if show_moy_cl:
        col_appr_w -= col_extra_w
    if show_minmax:
        col_appr_w -= col_extra_w * 2

    # En-tête du tableau
    row_h = 0.55 * cm
    pdf.setFillColorRGB(*cs)
    pdf.rect(marge_gauche, y - row_h, tab_w, row_h, fill=1, stroke=0)
    pdf.setFillColorRGB(*cp)
    pdf.setFont(tmpl["police_titre"], tmpl["taille_entete_tableau"])

    x = marge_gauche + 0.15 * cm
    pdf.drawString(x, y - 0.38 * cm, "MATIÈRE")
    x += col_matiere_w
    pdf.drawCentredString(x + col_moy_w / 2, y - 0.38 * cm, "MOY")
    x += col_moy_w
    pdf.drawCentredString(x + col_coeff_w / 2, y - 0.38 * cm, "COEF")
    x += col_coeff_w
    if show_moy_cl:
        pdf.drawCentredString(x + col_extra_w / 2, y - 0.38 * cm, "MOY.CL")
        x += col_extra_w
    if show_minmax:
        pdf.drawCentredString(x + col_extra_w / 2, y - 0.38 * cm, "MIN")
        x += col_extra_w
        pdf.drawCentredString(x + col_extra_w / 2, y - 0.38 * cm, "MAX")
        x += col_extra_w
    pdf.drawCentredString(x + col_appr_w / 2, y - 0.38 * cm, "APPRÉCIATION")

    y -= row_h

    # Lignes du tableau
    total_coeff = 0
    total_points = 0
    pdf.setFont(tmpl["police_corps"], tmpl["taille_corps_tableau"])

    for i, (ligne, matiere) in enumerate(lignes):
        if y < 3 * cm:  # new page if needed
            pdf.showPage()
            y = hauteur - 2 * cm
            pdf.setFont(tmpl["police_corps"], tmpl["taille_corps_tableau"])

        # Alternate row background
        if i % 2 == 0:
            pdf.setFillColorRGB(*cs)
            pdf.rect(marge_gauche, y - row_h, tab_w, row_h, fill=1, stroke=0)

        pdf.setFillColorRGB(0, 0, 0)
        x = marge_gauche + 0.15 * cm
        nom_matiere = matiere.libelle if matiere else "?"
        if len(nom_matiere) > 28:
            nom_matiere = nom_matiere[:26] + "…"
        pdf.drawString(x, y - 0.38 * cm, nom_matiere)
        x += col_matiere_w

        moy = float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else 0
        coeff = float(ligne.coefficient) if ligne.coefficient is not None else 1
        total_coeff += coeff
        total_points += moy * coeff

        pdf.drawCentredString(x + col_moy_w / 2, y - 0.38 * cm, f"{moy:.2f}")
        x += col_moy_w
        pdf.drawCentredString(x + col_coeff_w / 2, y - 0.38 * cm, f"{coeff:.0f}")
        x += col_coeff_w

        if show_moy_cl:
            mc = float(ligne.moyenne_classe) if ligne.moyenne_classe is not None else 0
            pdf.drawCentredString(x + col_extra_w / 2, y - 0.38 * cm, f"{mc:.2f}")
            x += col_extra_w
        if show_minmax:
            nmin = float(ligne.note_min) if ligne.note_min is not None else 0
            nmax = float(ligne.note_max) if ligne.note_max is not None else 0
            pdf.drawCentredString(x + col_extra_w / 2, y - 0.38 * cm, f"{nmin:.2f}")
            x += col_extra_w
            pdf.drawCentredString(x + col_extra_w / 2, y - 0.38 * cm, f"{nmax:.2f}")
            x += col_extra_w

        appr = ligne.appreciation or appreciation_pour_moyenne(moy, settings)
        pdf.drawCentredString(x + col_appr_w / 2, y - 0.38 * cm, appr)

        y -= row_h

    # Ligne de séparation fin tableau
    pdf.setStrokeColorRGB(*cl)
    pdf.setLineWidth(1)
    pdf.line(marge_gauche, y, marge_droite, y)

    # ── RÉSUMÉ ──
    y -= 0.7 * cm
    pdf.setFont(tmpl["police_titre"], 11)
    pdf.setFillColorRGB(*cp)
    moy_gen = float(bulletin.moyenne_generale) if bulletin.moyenne_generale is not None else (
        total_points / total_coeff if total_coeff > 0 else 0
    )
    pdf.drawString(1.8 * cm, y, f"Moyenne Générale : {moy_gen:.2f} / 20")

    if show_rang:
        rang_text = f"Rang : {bulletin.rang or 'N/A'}"
        if bulletin.effectif_classe:
            rang_text += f" / {bulletin.effectif_classe}"
        pdf.drawRightString(marge_droite, y, rang_text)

    y -= 0.5 * cm
    mention = bulletin.mention or ""
    if mention:
        pdf.setFont(tmpl["police_titre"], 10)
        pdf.drawString(1.8 * cm, y, f"Mention : {mention}")
    decision = bulletin.decision or ""
    if decision:
        pdf.setFont(tmpl["police_corps"], 9)
        pdf.drawRightString(marge_droite, y, f"Décision : {decision}")

    # ── SIGNATURES ──
    y -= 1.5 * cm
    pdf.setFont(tmpl["police_corps"], 8)
    pdf.setFillColorRGB(0, 0, 0)
    sig_y = y

    sig_positions = []
    if _bool(settings.get("documents.signature_prof", "true")):
        sig_positions.append("Le Professeur Principal")
    if _bool(settings.get("documents.signature_directeur", "true")):
        sig_positions.append("Le Directeur")
    if _bool(settings.get("documents.signature_parent", "true")):
        sig_positions.append("Le Parent")

    if sig_positions:
        spacing = tab_w / len(sig_positions)
        for i, label in enumerate(sig_positions):
            cx = marge_gauche + spacing * i + spacing / 2
            pdf.drawCentredString(cx, sig_y, label)
            pdf.line(cx - 2 * cm, sig_y - 1.2 * cm, cx + 2 * cm, sig_y - 1.2 * cm)

    # ── FILIGRANE ──
    if _bool(settings.get("documents.filigrane_bulletins", "true")):
        dessiner_filigrane(pdf, largeur, hauteur, settings)

    # ── FINALISER ──
    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    nom_fichier = f"bulletin_{eleve.nom}_{eleve.prenom}_{titre_trimestre}.pdf".replace(" ", "_")
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={nom_fichier}"}
    )
