"""
SMARTSCHOOL API — Routes Évaluations, Centralisation des Notes, Calcul Moyennes
"""
from fastapi import APIRouter, Depends, HTTPException, Response
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
from app.core.annee_lock import verifier_annee_modifiable

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
# SYSTÈME GUINÉEN À 3 NOTES — écrite / orale / composition
# ════════════════════════════════════════════════════════════
_POIDS_EVAL_DEFAUT = {"ecrite": 1.0, "orale": 1.0, "composition": 2.0}


def get_poids_evaluations(db: Session, etablissement_id: int = 1) -> dict:
    """Pondérations Écrit/Oral/Composition configurables par l'administrateur
    (Paramètres > Notation), avec les valeurs par défaut officielles guinéennes
    (1 / 1 / 2 — la composition compte double). Le coefficient propre de la
    matière n'intervient JAMAIS ici : il ne sert qu'à pondérer la moyenne de
    matière dans la moyenne générale, un niveau au-dessus (voir calculer_moyennes).
    """
    poids = dict(_POIDS_EVAL_DEFAUT)
    try:
        params = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.categorie == 'NOTATION',
            ParametreEtablissement.cle.in_([
                'notation.poids_ecrit', 'notation.poids_oral', 'notation.poids_composition'
            ]),
        ).all()
        mapping = {'notation.poids_ecrit': 'ecrite', 'notation.poids_oral': 'orale', 'notation.poids_composition': 'composition'}
        for p in params:
            key = mapping.get(p.cle)
            if key:
                poids[key] = float(p.valeur)
    except Exception:
        pass
    return poids


def coefficient_pour_evaluation(db: Session, type_eval_id: int, matiere_id: int, classe_id: int, etablissement_id: int = 1) -> float:
    """Pondération affichée/stockée sur l'évaluation selon sa catégorie (Écrit/
    Oral/Composition configurés dans Paramètres > Notation) — jamais un choix
    manuel de l'enseignant, et jamais le coefficient de la matière (qui ne joue
    qu'au niveau de la moyenne générale, pas ici).
    """
    type_eval = db.query(TypeEvaluation).filter(TypeEvaluation.type_eval_id == type_eval_id).first()
    cat = _categorie_evaluation(type_eval.code if type_eval else None)
    return get_poids_evaluations(db, etablissement_id)[cat]


def _categorie_evaluation(type_eval_code: Optional[str]) -> str:
    """Regroupe les types d'évaluation dans les 3 catégories officielles
    guinéennes : écrite (devoirs/interros/examens/tp/exposé/participation),
    orale, composition."""
    if type_eval_code == "COMPO":
        return "composition"
    if type_eval_code == "ORAL":
        return "orale"
    return "ecrite"


def moyenne_matiere_eleve(evaluations: list, inscription_id: int, notes_lookup: dict, type_codes: dict, poids: dict):
    """Moyenne d'une matière pour un élève, système guinéen à 3 notes.

    Quand plusieurs évaluations tombent dans la même catégorie (ex: plusieurs
    devoirs saisis au fil du trimestre), seule la note la PLUS HAUTE de cette
    catégorie compte — pas leur moyenne (pratique confirmée par l'établissement :
    l'enseignant regroupe ses évaluations et ne retient que la meilleure).
    Pondération Écrit/Oral/Composition configurable (`poids`, voir
    `get_poids_evaluations`) — le coefficient de la matière n'intervient pas ici.
    Si une catégorie n'a aucune note (ex: pas d'oral dans cet établissement), elle
    est simplement absente de la somme — pas de division par un poids fictif.

    `notes_lookup` : dict {(evaluation_id, inscription_id): Note}, préchargé en
    UNE requête par l'appelant (jamais de requête ici — c'est ce qui rendait la
    page Centralisation inutilisable au-delà de quelques dizaines d'élèves).

    Retourne (moyenne_arrondie_ou_None, nb_notes_saisies).
    """
    meilleure_par_categorie = {}
    nb_notes = 0

    for ev in evaluations:
        note = notes_lookup.get((ev.evaluation_id, inscription_id))
        if not note or note.valeur is None or note.est_absent == "O":
            continue
        nb_notes += 1
        val = float(note.valeur)
        note_sur = float(ev.note_sur or 20)
        normalized = val * 20 / note_sur if note_sur != 20 else val
        cat = _categorie_evaluation(type_codes.get(ev.type_eval_id))
        if cat not in meilleure_par_categorie or normalized > meilleure_par_categorie[cat]:
            meilleure_par_categorie[cat] = normalized

    if not meilleure_par_categorie:
        return None, 0

    total_coef = 0.0
    total_points = 0.0
    for cat, note in meilleure_par_categorie.items():
        coef = poids.get(cat, 1.0)
        total_coef += coef
        total_points += note * coef

    return round(total_points / total_coef, 2) if total_coef > 0 else None, nb_notes


def detail_categories_matiere(db: Session, classe_id: int, matiere_id: int, trimestre_id: int, inscription_id: int) -> dict:
    """Détail Écrit/Oral/Composition (meilleure note normalisée /20 de chaque
    catégorie, None si absente) pour UNE matière d'UN élève — utilisé par le
    bulletin PDF pour afficher les 3 notes, pas seulement la moyenne finale.
    """
    evals = db.query(Evaluation).filter(
        Evaluation.classe_id == classe_id,
        Evaluation.matiere_id == matiere_id,
        Evaluation.trimestre_id == trimestre_id,
        Evaluation.statut == "CENTRALISEE"
    ).all()
    type_codes = {t.type_eval_id: t.code for t in db.query(TypeEvaluation).all()}
    detail = {"ecrite": None, "orale": None, "composition": None}
    for ev in evals:
        note = db.query(Note).filter(
            Note.evaluation_id == ev.evaluation_id, Note.inscription_id == inscription_id,
            Note.est_absent == "N", Note.valeur.isnot(None)
        ).first()
        if not note:
            continue
        val = float(note.valeur)
        note_sur = float(ev.note_sur or 20)
        normalized = val * 20 / note_sur if note_sur != 20 else val
        cat = _categorie_evaluation(type_codes.get(ev.type_eval_id))
        if detail[cat] is None or normalized > detail[cat]:
            detail[cat] = normalized
    return detail


def get_bulletin_display_flags(db: Session, etablissement_id: int = 1) -> dict:
    """Réglages "quoi afficher sur le bulletin" — SOURCE UNIQUE partagée par le
    PDF, le portail élève, le portail parent et la page admin /bulletins.

    Deux pages Paramètres écrivent potentiellement ce réglage :
    Notation > Affichage Bulletins (categorie NOTATION, clés `display.*`) et
    Documents (categorie DOCUMENTS, clés `champ_*`) — elles vivaient chacune
    dans leur coin sans jamais se voir, d'où les toggles qui semblaient sans
    effet selon la page utilisée pour les modifier. `notation.display.*`
    prend le dessus quand présent ; sinon on retombe sur `documents.champ_*`.
    """
    notation_display = {}
    try:
        for p in db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.categorie == "NOTATION",
            ParametreEtablissement.cle.like("display.%"),
        ).all():
            notation_display[p.cle.replace("display.", "")] = p.valeur
    except Exception:
        pass

    documents_settings = {}
    try:
        for p in db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.categorie == "DOCUMENTS",
            ParametreEtablissement.cle.in_(["champ_rang", "champ_moyenne_classe", "champ_min_max"]),
        ).all():
            documents_settings[p.cle] = p.valeur
    except Exception:
        pass

    def is_true(v):
        return str(v).lower() in ("true", "1", "oui", "yes")

    return {
        "show_rang": is_true(notation_display.get("rang", documents_settings.get("champ_rang", "true"))),
        "show_mention": is_true(notation_display.get("mention", "true")),
        "show_appreciation": is_true(notation_display.get("appreciation", "true")),
        "show_effectif": is_true(notation_display.get("effectif", "true")),
        "show_stats_matiere": is_true(notation_display.get(
            "stats_matiere",
            documents_settings.get("champ_moyenne_classe", "true") == "true" or documents_settings.get("champ_min_max", "true") == "true"
        )),
    }


def _precharger_notes(db: Session, evaluation_ids: list) -> dict:
    """Précharge toutes les notes d'un lot d'évaluations en UNE requête —
    à utiliser avant toute boucle appelant moyenne_matiere_eleve()."""
    if not evaluation_ids:
        return {}
    rows = db.query(Note).filter(Note.evaluation_id.in_(evaluation_ids)).all()
    return {(n.evaluation_id, n.inscription_id): n for n in rows}


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
    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == data.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(
            status_code=400,
            detail=f"{trimestre.libelle} est clôturé — impossible de créer une nouvelle évaluation pour cette période."
        )
    payload = data.model_dump()
    payload["coefficient"] = coefficient_pour_evaluation(db, payload["type_eval_id"], payload["matiere_id"], payload["classe_id"])
    ev = Evaluation(**payload)
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
    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

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
    response: Response,
    classe_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Liste les évaluations centralisées (envoyées par les enseignants), paginée.

    Réécrit pour éviter le N+1 (6 requêtes par évaluation — matière, classe,
    trimestre, enseignant, nb_notes, moyenne — qui faisait timeout la page
    Centralisation dès que le volume d'évaluations a dépassé quelques dizaines) :
    tout est résolu par des requêtes groupées/en lot, plus jamais une par ligne.
    """
    query = db.query(Evaluation).filter(Evaluation.statut == "CENTRALISEE")
    if classe_id:
        query = query.filter(Evaluation.classe_id == classe_id)
    if trimestre_id:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)

    response.headers["X-Total-Count"] = str(query.count())
    evals = query.order_by(desc(Evaluation.date_evaluation)).offset(skip).limit(limit).all()
    if not evals:
        return []

    eval_ids = [ev.evaluation_id for ev in evals]
    matiere_ids = {ev.matiere_id for ev in evals}
    classe_ids = {ev.classe_id for ev in evals}
    trimestre_ids = {ev.trimestre_id for ev in evals}
    enseignant_ids = {ev.enseignant_id for ev in evals}

    matieres = {m.matiere_id: m for m in db.query(Matiere).filter(Matiere.matiere_id.in_(matiere_ids)).all()}
    classes = {c.classe_id: c for c in db.query(Classe).filter(Classe.classe_id.in_(classe_ids)).all()}
    trimestres_map = {t.trimestre_id: t for t in db.query(Trimestre).filter(Trimestre.trimestre_id.in_(trimestre_ids)).all()}
    enseignants = {e.enseignant_id: e for e in db.query(Enseignant).filter(Enseignant.enseignant_id.in_(enseignant_ids)).all()}

    agg_rows = db.query(
        Note.evaluation_id,
        func.count(Note.note_id).label("nb_notes"),
        func.avg(Note.valeur).label("moyenne"),
    ).filter(
        Note.evaluation_id.in_(eval_ids), Note.est_absent == "N", Note.valeur.isnot(None)
    ).group_by(Note.evaluation_id).all()
    agg_by_eval = {r.evaluation_id: r for r in agg_rows}

    result = []
    for ev in evals:
        mat = matieres.get(ev.matiere_id)
        cls = classes.get(ev.classe_id)
        tri = trimestres_map.get(ev.trimestre_id)
        ens = enseignants.get(ev.enseignant_id)
        agg = agg_by_eval.get(ev.evaluation_id)

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
            "nb_notes": agg.nb_notes if agg else 0,
            "moyenne": round(float(agg.moyenne), 2) if agg and agg.moyenne is not None else None,
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
    eleves_by_id = {e.eleve_id: e for e in db.query(Eleve).filter(
        Eleve.eleve_id.in_([i.eleve_id for i in inscriptions])
    ).all()}

    # Précharger UNE FOIS (hors des boucles élèves/matières) : évaluations par
    # matière, notes de toute la classe, codes de type, pondérations — c'était
    # avant une requête Evaluation + une requête Note PAR (élève × matière),
    # soit ~150 élèves x 10 matières = 1500+ requêtes qui rendaient cette page
    # inutilisable dès que l'effectif dépassait quelques dizaines.
    evals_by_matiere = {}
    all_eval_ids = []
    for mat_info in matieres:
        evals = db.query(Evaluation).filter(
            Evaluation.classe_id == classe_id,
            Evaluation.matiere_id == mat_info["matiere_id"],
            Evaluation.trimestre_id == trimestre_id,
            Evaluation.statut == "CENTRALISEE"
        ).all()
        evals_by_matiere[mat_info["matiere_id"]] = evals
        all_eval_ids.extend(ev.evaluation_id for ev in evals)

    notes_lookup = _precharger_notes(db, all_eval_ids)
    type_codes = {t.type_eval_id: t.code for t in db.query(TypeEvaluation).all()}
    poids = get_poids_evaluations(db, classe.etablissement_id)

    eleves_data = []
    for insc in inscriptions:
        eleve = eleves_by_id.get(insc.eleve_id)
        if not eleve:
            continue

        matieres_notes = {}
        total_coef = 0
        total_points = 0

        for mat_info in matieres:
            evals = evals_by_matiere[mat_info["matiere_id"]]

            # Notes de cet élève dans ces évaluations — système à 3 notes
            # (écrite/orale/composition), meilleure note par catégorie retenue.
            moy_mat, nb_notes = moyenne_matiere_eleve(evals, insc.inscription_id, notes_lookup, type_codes, poids)

            if moy_mat is not None:
                coef_mat = mat_info["coefficient"]
                total_coef += coef_mat
                total_points += moy_mat * coef_mat

            matieres_notes[str(mat_info["matiere_id"])] = {
                "moyenne": moy_mat,
                "nb_notes": nb_notes,
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
    verifier_annee_modifiable(db, classe.annee_id)
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

    # Préchargement en lot (voir get_notes_centralisees_classe pour le détail du
    # problème de perf que ça résout : avant, une requête Evaluation + une
    # requête Note par (élève × matière)).
    evals_by_matiere = {}
    all_eval_ids = []
    for mat_id in matieres_info:
        evals = db.query(Evaluation).filter(
            Evaluation.classe_id == classe_id,
            Evaluation.matiere_id == mat_id,
            Evaluation.trimestre_id == trimestre_id,
            Evaluation.statut == "CENTRALISEE"
        ).all()
        evals_by_matiere[mat_id] = evals
        all_eval_ids.extend(ev.evaluation_id for ev in evals)

    notes_lookup = _precharger_notes(db, all_eval_ids)
    type_codes = {t.type_eval_id: t.code for t in db.query(TypeEvaluation).all()}
    poids = get_poids_evaluations(db, classe.etablissement_id)

    for insc in inscriptions:
        total_coef = 0
        total_points = 0
        lignes_data = []

        for mat_id, mat_info in matieres_info.items():
            evals = evals_by_matiere[mat_id]

            moy_mat, _nb = moyenne_matiere_eleve(evals, insc.inscription_id, notes_lookup, type_codes, poids)

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
def get_bulletins_classe(
    response: Response,
    classe_id: int,
    trimestre_id: int = 1,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Récupère les bulletins générés pour une classe + trimestre, paginés.

    Réécrit en préchargement par lot — avant : 1 requête Bulletin + 1 Eleve +
    1 BulletinLigne (+ 1 Matiere PAR ligne) PAR INSCRIPTION, soit ~2000+
    requêtes pour une classe de 160 élèves.
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()
    insc_ids = [i.inscription_id for i in inscriptions]
    eleve_by_id = {i.inscription_id: i.eleve_id for i in inscriptions}

    bulletins = db.query(Bulletin).filter(
        Bulletin.inscription_id.in_(insc_ids), Bulletin.trimestre_id == trimestre_id
    ).all()
    if not bulletins:
        response.headers["X-Total-Count"] = "0"
        return []

    eleves = {e.eleve_id: e for e in db.query(Eleve).filter(
        Eleve.eleve_id.in_({eleve_by_id[b.inscription_id] for b in bulletins if b.inscription_id in eleve_by_id})
    ).all()}

    # Mêmes réglages "quoi afficher" que le PDF (voir get_bulletin_display_flags)
    # — appliqués ici en nullant les champs désactivés à la source, pour que la
    # modale d'aperçu de cette page (rendu HTML, pas le PDF) reste synchronisée
    # avec Paramètres > Notation > Affichage sans dupliquer la logique côté front.
    flags = get_bulletin_display_flags(db, classe.etablissement_id)

    bulletin_ids = [b.bulletin_id for b in bulletins]
    all_lignes = db.query(BulletinLigne).filter(BulletinLigne.bulletin_id.in_(bulletin_ids)).all()
    matiere_ids = {l.matiere_id for l in all_lignes}
    matieres = {m.matiere_id: m for m in db.query(Matiere).filter(Matiere.matiere_id.in_(matiere_ids)).all()}
    lignes_by_bulletin = {}
    for l in all_lignes:
        lignes_by_bulletin.setdefault(l.bulletin_id, []).append(l)

    results = []
    for bulletin in bulletins:
        eleve_id = eleve_by_id.get(bulletin.inscription_id)
        eleve = eleves.get(eleve_id)
        if not eleve:
            continue

        lignes_data = []
        total_coef = 0
        for l in lignes_by_bulletin.get(bulletin.bulletin_id, []):
            mat = matieres.get(l.matiere_id)
            lignes_data.append({
                "matiere": mat.libelle if mat else "?",
                "matiere_id": l.matiere_id,
                "coefficient": float(l.coefficient) if l.coefficient else 1,
                "moyenne_matiere": float(l.moyenne_matiere) if l.moyenne_matiere is not None else None,
                "moyenne_classe": float(l.moyenne_classe) if l.moyenne_classe is not None and flags["show_stats_matiere"] else None,
                "note_min": float(l.note_min) if l.note_min is not None and flags["show_stats_matiere"] else None,
                "note_max": float(l.note_max) if l.note_max is not None and flags["show_stats_matiere"] else None,
                "appreciation": l.appreciation if flags["show_appreciation"] else None,
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
            "rang": bulletin.rang if flags["show_rang"] else None,
            "effectif_classe": bulletin.effectif_classe if flags["show_rang"] and flags["show_effectif"] else None,
            "mention": bulletin.mention if flags["show_mention"] else None,
            "decision": bulletin.decision,
            "statut": bulletin.statut,
            "total_coefficient": total_coef,
            "lignes": lignes_data,
        })

    # Trier par rang (sur l'ensemble, pas seulement la page — le rang doit
    # rester cohérent quelle que soit la pagination)
    results.sort(key=lambda x: x["rang"] or 999)
    response.headers["X-Total-Count"] = str(len(results))
    # KPIs sur l'ENSEMBLE de la classe (pas seulement la page renvoyée) — sans
    # ça, "Meilleure/Plus faible moyenne" affichées côté frontend ne
    # refléteraient que la page actuellement chargée.
    moyennes = [r["moyenne_generale"] for r in results if r["moyenne_generale"] is not None]
    if moyennes:
        response.headers["X-Meilleure-Moyenne"] = str(max(moyennes))
        response.headers["X-Plus-Faible-Moyenne"] = str(min(moyennes))
        response.headers["X-Moyenne-Classe"] = str(round(sum(moyennes) / len(moyennes), 2))
    return results[skip:skip + limit]


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
    insc = db.query(Inscription).filter(Inscription.inscription_id == bulletin.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
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
    insc = db.query(Inscription).filter(Inscription.inscription_id == bulletin.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    bulletin.statut = "PUBLIE"
    db.commit()
    return {"message": "✅ Bulletin publié", "bulletin_id": bulletin_id, "statut": "PUBLIE"}


@router.put("/bulletins/{bulletin_id}/depublier")
def depublier_bulletin(bulletin_id: int, db: Session = Depends(get_db)):
    """Dépublie un bulletin (le masque du portail parent)."""
    bulletin = db.query(Bulletin).filter(Bulletin.bulletin_id == bulletin_id).first()
    if not bulletin:
        raise HTTPException(404, "Bulletin non trouvé")
    insc = db.query(Inscription).filter(Inscription.inscription_id == bulletin.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    bulletin.statut = "BROUILLON"
    db.commit()
    return {"message": "Bulletin dépublié", "bulletin_id": bulletin_id, "statut": "BROUILLON"}


# ════════════════════════════════════════════════════════════
# PUBLICATION EN MASSE (toute une classe)
# ════════════════════════════════════════════════════════════

@router.put("/classe/{classe_id}/bulletins/publier-tout")
def publier_bulletins_classe(classe_id: int, trimestre_id: int = 1, db: Session = Depends(get_db)):
    """Publie tous les bulletins d'une classe pour un trimestre donné."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    verifier_annee_modifiable(db, classe.annee_id)

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
    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

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
    insc = db.query(Inscription).filter(Inscription.inscription_id == data.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
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
    insc = db.query(Inscription).filter(Inscription.inscription_id == note.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(note, key, value)
    db.commit()
    db.refresh(note)
    return note


@notes_router.put("/batch")
def update_notes_batch(notes: List[NoteUpdate], note_ids: List[int], db: Session = Depends(get_db)):
    """Mise à jour en lot des notes (saisie de notes)."""
    if note_ids:
        premiere_note = db.query(Note).filter(Note.note_id == note_ids[0]).first()
        if premiere_note:
            insc = db.query(Inscription).filter(Inscription.inscription_id == premiere_note.inscription_id).first()
            verifier_annee_modifiable(db, insc.annee_id if insc else None)

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
    import os
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader
    from fastapi.responses import StreamingResponse
    from app.models.academique import Etablissement, Presence
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

    # Fusion Notation > Affichage Bulletins + Documents > Champs bulletin (voir
    # get_bulletin_display_flags — deux pages Paramètres pilotaient auparavant
    # des espaces de clés disjoints, chacune ignorant l'autre).
    _flags = get_bulletin_display_flags(db, classe.etablissement_id)
    show_rang = _flags["show_rang"]
    show_mention = _flags["show_mention"]
    show_appreciation = _flags["show_appreciation"]
    show_effectif = _flags["show_effectif"]
    show_stats_matiere = _flags["show_stats_matiere"]

    # ── Lignes du bulletin triées par matière ──
    lignes = (
        db.query(BulletinLigne, Matiere)
        .join(Matiere, BulletinLigne.matiere_id == Matiere.matiere_id)
        .filter(BulletinLigne.bulletin_id == bulletin_id)
        .order_by(Matiere.libelle)
        .all()
    )

    # ── Statistiques classe (meilleure/plus faible moyenne du trimestre) ──
    moyennes_classe = [
        float(m) for (m,) in db.query(Bulletin.moyenne_generale).join(
            Inscription, Bulletin.inscription_id == Inscription.inscription_id
        ).filter(
            Inscription.classe_id == classe.classe_id,
            Bulletin.trimestre_id == bulletin.trimestre_id,
            Bulletin.moyenne_generale.isnot(None)
        ).all()
    ]
    meilleure_moyenne_classe = max(moyennes_classe) if moyennes_classe else None
    plus_faible_moyenne_classe = min(moyennes_classe) if moyennes_classe else None

    # ── Taux de présence (uniquement si des présences existent réellement pour
    # cette période — on n'affiche jamais un taux fabriqué à partir de rien) ──
    presences_periode = []
    if trimestre:
        presences_periode = db.query(Presence).filter(
            Presence.inscription_id == inscription.inscription_id,
            Presence.date_presence >= trimestre.date_debut,
            Presence.date_presence <= trimestre.date_fin,
        ).all()
    taux_presence = None
    if presences_periode:
        nb_present = sum(1 for p in presences_periode if p.statut_presence == "PRESENT")
        taux_presence = round(nb_present / len(presences_periode) * 100, 1)

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

    # Logo de l'école — lit le fichier réellement uploadé (Etablissement.logo_url)
    # au lieu d'un rectangle "LOGO" statique.
    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    if _bool(settings.get("documents.entete_logo", "true")):
        logo_dessine = False
        if etablissement and getattr(etablissement, "logo_url", None):
            logo_path = os.path.join(backend_root, etablissement.logo_url.lstrip("/").replace("/", os.sep))
            if os.path.isfile(logo_path):
                try:
                    pdf.drawImage(
                        ImageReader(logo_path), 1.5 * cm, y - 1.5 * cm, width=1.8 * cm, height=1.8 * cm,
                        preserveAspectRatio=True, mask='auto', anchor='c'
                    )
                    logo_dessine = True
                except Exception:
                    logo_dessine = False
        if not logo_dessine:
            pdf.setStrokeColorRGB(0.7, 0.7, 0.7)
            pdf.rect(1.5 * cm, y - 1.2 * cm, 1.8 * cm, 1.5 * cm)
            pdf.setFont("Helvetica", 7)
            pdf.setFillColorRGB(0.5, 0.5, 0.5)
            pdf.drawCentredString(2.4 * cm, y - 0.5 * cm, "LOGO")

    # QR code de vérification d'authenticité (coin supérieur droit) — encode
    # l'identifiant du bulletin + le matricule, vérifiable manuellement par un
    # administrateur contre la base (pas de service web dédié pour l'instant).
    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPDF
        qr_payload = f"SMARTSCHOOL|BULLETIN={bulletin_id}|MATRICULE={eleve.matricule}|TRIMESTRE={bulletin.trimestre_id}"
        qr_widget = QrCodeWidget(qr_payload)
        qr_size = 1.8 * cm
        b = qr_widget.getBounds()
        qr_w, qr_h = b[2] - b[0], b[3] - b[1]
        d = Drawing(qr_size, qr_size, transform=[qr_size / qr_w, 0, 0, qr_size / qr_h, 0, 0])
        d.add(qr_widget)
        renderPDF.draw(d, pdf, largeur - 1.5 * cm - qr_size, y - 1.5 * cm)
        pdf.setFont("Helvetica", 5.5)
        pdf.setFillColorRGB(0.5, 0.5, 0.5)
        pdf.drawCentredString(largeur - 1.5 * cm - qr_size / 2, y - 1.65 * cm, "Vérification")
    except Exception:
        pass

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

    # ── INFOS ÉLÈVE (+ photo si disponible) ──
    y -= 0.7 * cm
    photo_dessinee = False
    if getattr(eleve, "photo_url", None):
        photo_path = os.path.join(backend_root, eleve.photo_url.lstrip("/").replace("/", os.sep))
        if os.path.isfile(photo_path):
            try:
                pdf.drawImage(
                    ImageReader(photo_path), largeur - 1.5 * cm - 2 * cm, y - 1.4 * cm,
                    width=2 * cm, height=2.5 * cm, preserveAspectRatio=True, mask='auto', anchor='c'
                )
                photo_dessinee = True
            except Exception:
                photo_dessinee = False

    pdf.setFont(tmpl["police_corps"], 9)
    pdf.setFillColorRGB(0, 0, 0)
    annee_label = annee.libelle if annee else ""
    pdf.drawString(1.8 * cm, y, f"Élève : {eleve.prenom} {eleve.nom}")
    pdf.drawString(largeur / 2, y, f"Classe : {classe.libelle}")
    y -= 0.4 * cm
    pdf.drawString(1.8 * cm, y, f"Matricule : {eleve.matricule or 'N/A'}")
    pdf.drawString(largeur / 2, y, f"Année : {annee_label}")
    if taux_presence is not None:
        y -= 0.4 * cm
        pdf.drawString(1.8 * cm, y, f"Taux de présence : {taux_presence}%")

    if photo_dessinee:
        y -= 0.5 * cm  # la photo dépasse sous le texte, garder de la marge avant le tableau

    # ── TABLEAU DES NOTES ──
    y -= 0.8 * cm
    marge_gauche = 1.5 * cm
    marge_droite = largeur - 1.5 * cm
    tab_w = marge_droite - marge_gauche

    # Colonnes — Écrit/Oral/Composition ajoutés (détail des 3 notes officielles,
    # pas seulement la moyenne finale de matière) + Points (moyenne × coefficient).
    # show_rang résolu plus haut (fusion Notation+Documents) ; moy.classe/min/max
    # pilotés par le même toggle unique "stats_matiere".
    show_moy_cl = show_stats_matiere
    show_minmax = show_stats_matiere

    col_matiere_w = 3.3 * cm
    col_detail_w = 0.85 * cm   # Écrit / Oral / Composition (3 colonnes)
    col_moy_w = 1.3 * cm
    col_coeff_w = 0.9 * cm
    col_pts_w = 1.2 * cm
    col_extra_w = 1.1 * cm     # Moy.Cl / Min / Max
    col_appr_w = tab_w - col_matiere_w - (col_detail_w * 3) - col_moy_w - col_coeff_w - col_pts_w
    if show_moy_cl:
        col_appr_w -= col_extra_w
    if show_minmax:
        col_appr_w -= col_extra_w * 2

    # En-tête du tableau (2 lignes : groupe "NOTES" au-dessus de Écrit/Oral/Compo)
    row_h = 0.55 * cm
    header_h = row_h * 1.7
    pdf.setFillColorRGB(*cs)
    pdf.rect(marge_gauche, y - header_h, tab_w, header_h, fill=1, stroke=0)
    pdf.setFillColorRGB(*cp)
    pdf.setFont(tmpl["police_titre"], tmpl["taille_entete_tableau"])

    x = marge_gauche + 0.15 * cm
    pdf.drawString(x, y - header_h + 0.2 * cm, "MATIÈRE")
    x += col_matiere_w

    detail_x0 = x
    pdf.setFont(tmpl["police_titre"], 6)
    pdf.drawCentredString(detail_x0 + (col_detail_w * 3) / 2, y - 0.35 * cm, "NOTES")
    pdf.setFont(tmpl["police_titre"], tmpl["taille_entete_tableau"] - 1)
    for lbl in ("ÉCR", "ORAL", "COMP"):
        pdf.drawCentredString(x + col_detail_w / 2, y - header_h + 0.2 * cm, lbl)
        x += col_detail_w

    pdf.setFont(tmpl["police_titre"], tmpl["taille_entete_tableau"])
    pdf.drawCentredString(x + col_moy_w / 2, y - header_h + 0.2 * cm, "MOY")
    x += col_moy_w
    pdf.drawCentredString(x + col_coeff_w / 2, y - header_h + 0.2 * cm, "COEF")
    x += col_coeff_w
    pdf.drawCentredString(x + col_pts_w / 2, y - header_h + 0.2 * cm, "PTS")
    x += col_pts_w
    if show_moy_cl:
        pdf.drawCentredString(x + col_extra_w / 2, y - header_h + 0.2 * cm, "MOY.CL")
        x += col_extra_w
    if show_minmax:
        pdf.drawCentredString(x + col_extra_w / 2, y - header_h + 0.2 * cm, "MIN")
        x += col_extra_w
        pdf.drawCentredString(x + col_extra_w / 2, y - header_h + 0.2 * cm, "MAX")
        x += col_extra_w
    if show_appreciation:
        pdf.drawCentredString(x + col_appr_w / 2, y - header_h + 0.2 * cm, "APPRÉC.")

    y -= header_h

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
        if len(nom_matiere) > 22:
            nom_matiere = nom_matiere[:20] + "…"
        pdf.drawString(x, y - 0.38 * cm, nom_matiere)
        x += col_matiere_w

        moy = float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else 0
        coeff = float(ligne.coefficient) if ligne.coefficient is not None else 1
        points = moy * coeff
        total_coeff += coeff
        total_points += points

        detail = detail_categories_matiere(db, classe.classe_id, matiere.matiere_id, bulletin.trimestre_id, inscription.inscription_id)
        pdf.setFont(tmpl["police_corps"], max(6, tmpl["taille_corps_tableau"] - 1))
        for cat in ("ecrite", "orale", "composition"):
            val = detail.get(cat)
            pdf.drawCentredString(x + col_detail_w / 2, y - 0.38 * cm, f"{val:.1f}" if val is not None else "—")
            x += col_detail_w
        pdf.setFont(tmpl["police_corps"], tmpl["taille_corps_tableau"])

        pdf.drawCentredString(x + col_moy_w / 2, y - 0.38 * cm, f"{moy:.2f}")
        x += col_moy_w
        pdf.drawCentredString(x + col_coeff_w / 2, y - 0.38 * cm, f"{coeff:.0f}")
        x += col_coeff_w
        pdf.drawCentredString(x + col_pts_w / 2, y - 0.38 * cm, f"{points:.1f}")
        x += col_pts_w

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

        if show_appreciation:
            appr = ligne.appreciation or appreciation_pour_moyenne(moy, settings)
            pdf.setFont(tmpl["police_corps"], max(6, tmpl["taille_corps_tableau"] - 1))
            pdf.drawCentredString(x + col_appr_w / 2, y - 0.38 * cm, appr)
            pdf.setFont(tmpl["police_corps"], tmpl["taille_corps_tableau"])

        y -= row_h

    # Ligne "TOTAUX"
    pdf.setStrokeColorRGB(*cl)
    pdf.setLineWidth(1)
    pdf.line(marge_gauche, y, marge_droite, y)
    y -= row_h
    pdf.setFont(tmpl["police_titre"], tmpl["taille_corps_tableau"])
    pdf.setFillColorRGB(*cp)
    x = marge_gauche + 0.15 * cm
    pdf.drawString(x, y - 0.38 * cm, "TOTAUX")
    x += col_matiere_w + col_detail_w * 3 + col_moy_w
    pdf.drawCentredString(x + col_coeff_w / 2, y - 0.38 * cm, f"{total_coeff:.0f}")
    x += col_coeff_w
    pdf.drawCentredString(x + col_pts_w / 2, y - 0.38 * cm, f"{total_points:.1f}")
    y -= row_h

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
        if show_effectif and bulletin.effectif_classe:
            rang_text += f" / {bulletin.effectif_classe}"
        pdf.drawRightString(marge_droite, y, rang_text)
    elif show_effectif and bulletin.effectif_classe:
        pdf.drawRightString(marge_droite, y, f"Effectif : {bulletin.effectif_classe}")

    y -= 0.5 * cm
    mention = bulletin.mention or ""
    if show_mention and mention:
        pdf.setFont(tmpl["police_titre"], 10)
        pdf.drawString(1.8 * cm, y, f"Mention : {mention}")
    decision = bulletin.decision or ""
    if decision:
        pdf.setFont(tmpl["police_corps"], 9)
        pdf.drawRightString(marge_droite, y, f"Décision : {decision}")

    # ── STATISTIQUES DE CLASSE (meilleure / plus faible moyenne) ──
    if meilleure_moyenne_classe is not None:
        y -= 0.5 * cm
        pdf.setFont(tmpl["police_corps"], 8)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        pdf.drawString(1.8 * cm, y, f"Meilleure moyenne de la classe : {meilleure_moyenne_classe:.2f}/20")
        pdf.drawRightString(marge_droite, y, f"Plus faible moyenne de la classe : {plus_faible_moyenne_classe:.2f}/20")
        pdf.setFillColorRGB(0, 0, 0)

    # ── GRAPHIQUE DES PERFORMANCES PAR MATIÈRE (élève vs moyenne de classe) ──
    if lignes and y > 5 * cm:
        y -= 0.6 * cm
        pdf.setFont(tmpl["police_titre"], 8)
        pdf.setFillColorRGB(*cp)
        pdf.drawString(1.8 * cm, y, "Performances par matière (vs moyenne de classe)")
        y -= 0.35 * cm
        chart_h = min(0.38 * cm * len(lignes), y - 4.2 * cm)
        chart_top = y
        bar_row_h = chart_h / len(lignes) if lignes else 0.3 * cm
        chart_label_w = 3.2 * cm
        chart_bar_max_w = tab_w - chart_label_w - 1.2 * cm
        for ligne, matiere in lignes:
            moy_e = float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else 0
            moy_c = float(ligne.moyenne_classe) if ligne.moyenne_classe is not None else 0
            by = y - bar_row_h + 0.08 * cm
            lbl = (matiere.libelle if matiere else "?")[:18]
            pdf.setFont(tmpl["police_corps"], 6)
            pdf.setFillColorRGB(0.2, 0.2, 0.2)
            pdf.drawString(marge_gauche, by + 0.05 * cm, lbl)
            bar_x0 = marge_gauche + chart_label_w
            bar_w_e = chart_bar_max_w * min(moy_e, 20) / 20
            bar_w_c = chart_bar_max_w * min(moy_c, 20) / 20
            pdf.setFillColorRGB(0.85, 0.85, 0.9)
            pdf.rect(bar_x0, by - 0.02 * cm, chart_bar_max_w, 0.14 * cm, fill=1, stroke=0)
            pdf.setFillColorRGB(*cp)
            pdf.rect(bar_x0, by - 0.02 * cm, bar_w_e, 0.14 * cm, fill=1, stroke=0)
            pdf.setStrokeColorRGB(0.9, 0.3, 0.3)
            pdf.setLineWidth(1)
            pdf.line(bar_x0 + bar_w_c, by - 0.05 * cm, bar_x0 + bar_w_c, by + 0.17 * cm)
            y -= bar_row_h
        pdf.setFont(tmpl["police_corps"], 5.5)
        pdf.setFillColorRGB(0.5, 0.5, 0.5)
        pdf.drawString(marge_gauche + chart_label_w, y - 0.05 * cm, "▬ Barre = moyenne élève   |   Trait rouge = moyenne de classe")
        y -= 0.35 * cm

    # ── NOTE EXPLICATIVE DU CALCUL ──
    # Sans ça, rien n'indiquait comment la moyenne était obtenue — texte
    # aligné dynamiquement sur la pondération réellement configurée
    # (Paramètres > Notation), pas des valeurs figées dans le code.
    poids_aff = get_poids_evaluations(db, classe.etablissement_id)
    y -= 0.5 * cm
    pdf.setFont("Helvetica-Oblique", 6.5)
    pdf.setFillColorRGB(0.4, 0.4, 0.4)
    pdf.drawString(
        1.8 * cm, y,
        f"Moyenne de matière = (Écrit×{poids_aff['ecrite']:g} + Oral×{poids_aff['orale']:g} + Composition×{poids_aff['composition']:g}) ÷ "
        f"({poids_aff['ecrite']:g} + {poids_aff['orale']:g} + {poids_aff['composition']:g}) — catégorie absente exclue du calcul."
    )
    y -= 0.35 * cm
    pdf.drawString(
        1.8 * cm, y,
        "Moyenne générale = somme (moyenne matière × coefficient matière) ÷ somme des coefficients matières."
    )
    pdf.setFillColorRGB(0, 0, 0)

    # ── APPRÉCIATION GÉNÉRALE (professeur principal) ──
    appreciation_generale = bulletin.appreciation_generale or appreciation_pour_moyenne(moy_gen, settings)
    y -= 0.55 * cm
    pdf.setFont(tmpl["police_titre"], 8)
    pdf.setFillColorRGB(*cp)
    pdf.drawString(1.8 * cm, y, "Appréciation du Professeur Principal :")
    y -= 0.35 * cm
    pdf.setFont(tmpl["police_corps"], 8)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.drawString(1.8 * cm, y, appreciation_generale)

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
            # Cachet de l'établissement sous la signature du Directeur
            if label == "Le Directeur" and etablissement and getattr(etablissement, "cachet_url", None):
                cachet_path = os.path.join(backend_root, etablissement.cachet_url.lstrip("/").replace("/", os.sep))
                if os.path.isfile(cachet_path):
                    try:
                        pdf.saveState()
                        pdf.translate(cx, sig_y - 0.3 * cm)
                        pdf.rotate(-12)
                        pdf.setFillAlpha(0.85)
                        pdf.drawImage(
                            ImageReader(cachet_path), -1.5 * cm, -1.5 * cm, width=3 * cm, height=3 * cm,
                            preserveAspectRatio=True, mask='auto', anchor='c'
                        )
                        pdf.restoreState()
                    except Exception:
                        pass

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
