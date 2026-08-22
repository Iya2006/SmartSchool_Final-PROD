"""
SMARTSCHOOL API — Routes Évaluations, Centralisation des Notes, Calcul Moyennes

Toute la logique de calcul (coefficients, moyennes, mentions, barèmes) vit dans
app/services/notation.py — source unique partagée avec portail_enseignant.py.
Ce module ne fait qu'exposer les routes HTTP.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import List, Optional
from datetime import date
from pydantic import BaseModel
from app.core.database import get_db
from app.models.academique import (
    Evaluation, EvaluationSession, Note, Inscription, Eleve, Classe, Matiere,
    Trimestre, TypeEvaluation, Enseignant, ClasseMatiere,
    Affectation, Bulletin, BulletinLigne, AnneeScolaire, ParametreEtablissement,
    Cycle, Niveau, Etablissement, PeriodeEpreuve
)
from app.schemas.schemas import (
    EvaluationCreate, EvaluationOut, NoteCreate, NoteUpdate, NoteOut,
    TypeEvaluationCreate, TypeEvaluationUpdate, TypeEvaluationOut,
    EvaluationSessionCreate, EvaluationSessionUpdate, EvaluationSessionOut,
    EvaluationUpdate
)
from app.core.annee_lock import verifier_annee_modifiable
from app.core.auth import require_etablissement
from app.services.notation import (
    calendrier_mois,
    epreuves_retenues_periode,
    periode_pour_date,
    verifier_date_dans_periode,
    calculer_resultats_annuels,
    calculer_resultats_periode,
    coefficient_effectif,
    coefficient_matiere_effectif,
    detail_par_type_classe,
    detail_par_type_matiere,
    get_bareme_defaut_cycle,
    get_appreciation,
    get_bareme_effectif,
    get_bulletin_display_flags,
    get_cycle_key,
    get_etablissement_id,
    get_mention,
    get_mode_agregation,
    get_notation_seuils,
    get_lettres_config,
    get_types_evaluation_coefficients,
    lettre_pour_note,
    moyenne_matiere_eleve,
    normaliser_note,
    precharger_notes as _precharger_notes,
    valider_note,
)

router = APIRouter(prefix="/api/evaluations", tags=["Évaluations"])


# ── Helpers d'isolation (Lot 9) ───────────────────────────────────────────
# Evaluation, Note, Bulletin et Trimestre n'ont pas de colonne
# etablissement_id : ils sont OWNERSHIP via Classe (ou AnneeScolaire pour
# Trimestre) — voir .ai/MULTI_TENANT_PLAN.md section E. Les helpers
# renvoient 404 (pas 403) pour ne pas confirmer l'existence d'une ressource
# d'une autre école.

def _classe_ou_404(db: Session, classe_id: int, etablissement_id: int) -> Classe:
    c = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return c


def _periode_ou_404(db: Session, trimestre_id: int, etablissement_id: int) -> Trimestre:
    """La période, à condition qu'elle appartienne bien à l'école appelante.

    POURQUOI CE CONTRÔLE EXISTE
    ---------------------------
    Le calcul des moyennes acceptait n'importe quel `trimestre_id`, et prenait
    même `1` par défaut quand l'appelant n'en envoyait aucun. Une école dont
    les périodes portent les identifiants 4 et 5 calculait donc ses bulletins
    sur le 1er trimestre d'une AUTRE école : aucune évaluation ne
    correspondait, et le bouton « Calculer les moyennes » créait des bulletins
    vides, sans moyenne et sans rang, en annonçant sa réussite.

    Trouvé en base : 63 bulletins d'élèves de TrillionX rattachés au 1er
    trimestre du Lycée d'Excellence de Conakry. Le fondateur voyait un bouton
    qui « ne prenait pas » ; il prenait, mais sur la mauvaise période.

    `Trimestre` ne porte pas d'établissement : il se lit par son année.
    """
    periode = (
        db.query(Trimestre)
        .join(AnneeScolaire, AnneeScolaire.annee_id == Trimestre.annee_id)
        .filter(
            Trimestre.trimestre_id == trimestre_id,
            AnneeScolaire.etablissement_id == etablissement_id,
        )
        .first()
    )
    if not periode:
        raise HTTPException(status_code=404, detail="Période non trouvée")
    return periode


def _evaluation_ou_404(db: Session, evaluation_id: int, etablissement_id: int) -> Evaluation:
    ev = (
        db.query(Evaluation)
        .join(Classe, Classe.classe_id == Evaluation.classe_id)
        .filter(Evaluation.evaluation_id == evaluation_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Évaluation non trouvée")
    return ev


def _bulletin_ou_404(db: Session, bulletin_id: int, etablissement_id: int) -> Bulletin:
    b = (
        db.query(Bulletin)
        .join(Inscription, Inscription.inscription_id == Bulletin.inscription_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Bulletin.bulletin_id == bulletin_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Bulletin non trouvé")
    return b


def _session_ou_404(db: Session, session_id: int, etablissement_id: int) -> EvaluationSession:
    """EvaluationSession porte etablissement_id, mais on ne s'y fie pas seul :
    la classe reste la source de vérité (la colonne est dénormalisée). 404 pour
    ne pas confirmer l'existence de la session d'une autre école."""
    s = (
        db.query(EvaluationSession)
        .join(Classe, Classe.classe_id == EvaluationSession.classe_id)
        .filter(
            EvaluationSession.session_id == session_id,
            Classe.etablissement_id == etablissement_id,
        )
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    return s


# ── Note d'architecture (fusion multi-écoles) ──────────────────────────
# Les helpers de calcul que ce fichier portait (get_appreciation,
# get_cycle_key, get_notation_seuils, get_mention, get_poids_evaluations,
# coefficient_pour_evaluation, moyenne_matiere_eleve,
# detail_categories_matiere, get_bulletin_display_flags, _precharger_notes)
# ne sont PAS réintroduits ici : ils vivent désormais dans
# app/services/notation.py et sont importés en haut de ce module. Les y
# redéfinir masquerait le moteur central et rouvrirait la divergence
# silencieuse déjà constatée entre ce fichier et portail_enseignant.py.
# Leur durcissement multi-écoles (etablissement_id obligatoire) est reporté
# dans le moteur.


# ════════════════════════════════════════════════════════════
# CRUD Évaluations de base
# ════════════════════════════════════════════════════════════

@router.get("")
def list_evaluations(
    classe_id: Optional[int] = None,
    matiere_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    annee_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(Evaluation).join(Classe, Classe.classe_id == Evaluation.classe_id).filter(
        Classe.etablissement_id == etablissement_id
    )
    if classe_id:
        query = query.filter(Evaluation.classe_id == classe_id)
    if matiere_id:
        query = query.filter(Evaluation.matiere_id == matiere_id)
    if trimestre_id:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)
    # Filtre par année (via la classe) : sans lui, la nouvelle année affichait
    # encore les évaluations/compositions de l'an dernier.
    if annee_id is not None:
        query = query.filter(Classe.annee_id == annee_id)
    return query.order_by(Evaluation.date_evaluation.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=EvaluationOut, status_code=201)
def create_evaluation(data: EvaluationCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Crée une évaluation mono-matière (le chemin groupé multi-matières est
    `POST /sessions`)."""
    # La classe cible doit appartenir à cet établissement — sinon une
    # évaluation (et donc des notes) pouvait être créée dans une autre école.
    classe = _classe_ou_404(db, data.classe_id, etablissement_id)
    # Ce garde-fou manquait ici alors qu'il est appliqué partout ailleurs dans
    # ce module : une année archivée laissait créer des évaluations.
    verifier_annee_modifiable(db, classe.annee_id)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == data.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(
            status_code=400,
            detail=f"{trimestre.libelle} est clôturé — impossible de créer une nouvelle évaluation pour cette période."
        )
    try:
        verifier_date_dans_periode(db, trimestre, data.date_evaluation)
    except ValueError as e:
        raise HTTPException(400, str(e))

    payload = data.model_dump()
    cycle_key = get_cycle_key(data.classe_id, db)

    # Barème : résolu depuis la configuration de l'école si l'appelant n'impose rien
    if not payload.get("note_sur"):
        payload["note_sur"] = get_bareme_effectif(
            db, data.classe_id, data.matiere_id, cycle_key, etablissement_id
        )

    type_coefs = get_types_evaluation_coefficients(db, etablissement_id, cycle_key)
    payload["coefficient"] = type_coefs.get(payload["type_eval_id"], 1.0)

    ev = Evaluation(**payload)
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/{evaluation_id}/notes")
def get_notes_evaluation(evaluation_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    _evaluation_ou_404(db, evaluation_id, etablissement_id)
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
def initialiser_notes(evaluation_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Crée une ligne de note pour chaque élève inscrit dans la classe de l'évaluation."""
    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
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

# Recherche insensible aux accents : personne ne tape « Mathématiques » ni
# « 8ème » avec leurs accents dans une barre de recherche. Sans ça, chercher
# « Mathematiques » ne renvoyait rien du tout.
_ACCENTS = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿ"
_SANS = "aaaaaaceeeeiiiinooooouuuuyy"


def _dépouiller(texte: str) -> str:
    """Retire les accents d'un terme saisi, côté Python."""
    table = str.maketrans(_ACCENTS + _ACCENTS.upper(), _SANS + _SANS.upper())
    return texte.translate(table)


def _sans_accents(colonne, db: Session):
    """Même dépouillement, côté base — via translate() natif de Postgres.

    Les autres moteurs (SQLite en test) n'ont pas cette fonction : on retombe
    alors sur la colonne brute, la recherche reste fonctionnelle mais devient
    sensible aux accents.
    """
    dialecte = getattr(getattr(db, "bind", None), "dialect", None)
    if dialecte is not None and dialecte.name == "postgresql":
        return func.translate(colonne, _ACCENTS + _ACCENTS.upper(), _SANS + _SANS.upper())
    return colonne


@router.get("/centralisees")
def get_evaluations_centralisees(
    response: Response,
    classe_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    statut: Optional[str] = None,
    q: Optional[str] = None,
    annee_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste les évaluations d'une classe/période, paginée.

    `q` recherche sur l'intitulé, la matière, la classe et l'enseignant.

    `statut` filtre sur un état précis (PLANIFIEE, PUBLIEE, CENTRALISEE) ;
    sans lui, toutes les évaluations sont retournées — l'administration doit
    voir les compositions qu'elle vient de créer, pas seulement celles déjà
    remontées par les enseignants.

    Réécrit pour éviter le N+1 (6 requêtes par évaluation — matière, classe,
    trimestre, enseignant, nb_notes, moyenne — qui faisait timeout la page
    Centralisation dès que le volume d'évaluations a dépassé quelques dizaines) :
    tout est résolu par des requêtes groupées/en lot, plus jamais une par ligne.
    """
    # La jointure sur Classe porte l'isolation : une évaluation appartient à
    # l'école de sa classe. Le statut, lui, reste un filtre libre — l'écran
    # Centralisation affiche aussi les épreuves annulées ou publiées.
    query = db.query(Evaluation).join(Classe, Classe.classe_id == Evaluation.classe_id).filter(
        Classe.etablissement_id == etablissement_id
    )
    if statut:
        query = query.filter(Evaluation.statut == statut)
    if classe_id:
        query = query.filter(Evaluation.classe_id == classe_id)
    if trimestre_id:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)
    # Filtre par année (via la classe) : sans lui, l'écran affichait encore les
    # compositions de l'an dernier dans la nouvelle année.
    if annee_id is not None:
        query = query.filter(Classe.annee_id == annee_id)

    # Recherche sur toute la base, pas seulement sur la page affichée : avec une
    # pagination à 50 lignes et près de mille évaluations, un filtre appliqué
    # côté navigateur ne trouvait une épreuve que si elle était déjà à l'écran.
    if q and q.strip():
        terme = q.strip()
        query = (
            query.outerjoin(Matiere, Matiere.matiere_id == Evaluation.matiere_id)
            # Classe est déjà jointe plus haut (isolation) : la rejoindre ici
            # dupliquerait la table et fausserait le compte.
            .outerjoin(Enseignant, Enseignant.enseignant_id == Evaluation.enseignant_id)
            .filter(or_(*[
                _sans_accents(colonne, db).ilike(f"%{_dépouiller(terme)}%")
                for colonne in (
                    Evaluation.libelle, Matiere.libelle, Classe.libelle,
                    Enseignant.nom, Enseignant.prenom,
                )
            ]))
        )

    # ── ON PAGINE DES ÉPREUVES, PAS DES LIGNES DE MATIÈRE ────────────────────
    # Une composition couvre les onze matières d'une classe : elle compte pour
    # UNE épreuve à l'écran, et l'école la compte comme une. Paginer les
    # évaluations donnait « 2 674 » sous une liste qui n'affichait que 238
    # lignes, et une page de 50 se réduisait à 4 ou 5 lignes selon le nombre de
    # matières — donc des pages de taille imprévisible.
    #
    # La clé de regroupement est un entier : la session quand il y en a une,
    # sinon l'opposé de l'identifiant de l'évaluation. Les identifiants étant
    # strictement positifs, les deux espaces ne peuvent pas se recouvrir.
    groupe = func.coalesce(Evaluation.session_id, -Evaluation.evaluation_id)
    epreuves = query.with_entities(
        groupe.label("groupe"),
        func.max(Evaluation.date_evaluation).label("jour"),
    ).group_by(groupe)

    response.headers["X-Total-Count"] = str(
        db.query(func.count()).select_from(epreuves.subquery()).scalar() or 0
    )
    page = [
        r.groupe for r in epreuves.order_by(desc("jour")).offset(skip).limit(limit).all()
    ]
    if not page:
        return []
    # Toutes les matières des épreuves de la page : une composition arrive
    # entière, jamais coupée en deux pages.
    evals = query.filter(groupe.in_(page)).order_by(desc(Evaluation.date_evaluation)).all()
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
            # Permet au frontend de regrouper les évaluations d'une même
            # composition en une seule ligne plutôt qu'une par matière.
            "session_id": ev.session_id,
            # Nécessaires pour pré-remplir le formulaire de correction d'une
            # épreuve : sans eux, corriger un barème repartait d'un champ vide.
            "type_eval_id": ev.type_eval_id,
            "enseignant_id": ev.enseignant_id,
            "est_coefficientee": getattr(ev, "est_coefficientee", "O"),
            "coefficient_override": (
                float(ev.coefficient_override) if ev.coefficient_override is not None else None
            ),
        })
    return result


@router.get("/centralisation/stats")
def get_centralisation_stats(trimestre_id: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Statistiques de centralisation POUR CET ÉTABLISSEMENT."""
    query = db.query(Evaluation).join(Classe, Classe.classe_id == Evaluation.classe_id).filter(
        Classe.etablissement_id == etablissement_id
    )
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
    trimestre_id: int = Query(..., description="Période consultée"),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Vue complète des notes d'une classe : tableau élèves × matières avec moyennes."""
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    _periode_ou_404(db, trimestre_id, etablissement_id)
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
    etablissement_id = classe.etablissement_id
    type_coefs = get_types_evaluation_coefficients(db, etablissement_id, cycle_key)
    echelle = get_bareme_defaut_cycle(db, etablissement_id, cycle_key)
    # Même règle d'agrégation que le calcul officiel : le tableau affiché doit
    # montrer exactement les moyennes qui finiront sur le bulletin.
    mode_agregation = get_mode_agregation(db, etablissement_id, cycle_key)

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

            # Moyenne pondérée par type d'évaluation (cf. services/notation.py)
            moy_mat, nb_notes = moyenne_matiere_eleve(
                evals, insc.inscription_id, notes_lookup, type_coefs, echelle,
                mode_agregation
            )

            if moy_mat is not None:
                coef_mat = coefficient_matiere_effectif(mat_info["coefficient"], evals)
                total_coef += coef_mat
                total_points += moy_mat * coef_mat

            matieres_notes[str(mat_info["matiere_id"])] = {
                "moyenne": moy_mat,
                "nb_notes": nb_notes,
                "appreciation": get_appreciation(moy_mat, echelle) if moy_mat is not None else None,
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
            "mention": get_mention(moy_gen, db, cycle_key, etablissement_id) if moy_gen is not None else None,
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
def calculer_moyennes(
    classe_id: int,
    trimestre_id: int = Query(..., description="Période à calculer"),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Calcule les moyennes de la période et alimente les bulletins de la classe.

    Le calcul lui-même vit dans services/notation.py — partagé avec l'aperçu
    intermédiaire (`/resultats-intermediaires`) pour qu'un chiffre affiché avant
    publication soit exactement celui qui finira sur le bulletin.

    `trimestre_id` est obligatoire et doit être une période DE CETTE ÉCOLE :
    voir `_periode_ou_404`. Il valait `1` par défaut, ce qui faisait calculer
    en silence sur la période d'un autre établissement.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)

    trimestre = _periode_ou_404(db, trimestre_id, etablissement_id)
    if trimestre.statut == "CLOTURE":
        raise HTTPException(
            400,
            f"{trimestre.libelle} est cloture - impossible de recalculer les moyennes de cette periode."
        )

    res = calculer_resultats_periode(db, classe_id, trimestre_id, persist=True)
    return {
        "message": f"Moyennes calculees pour {res['classe']} - {res['effectif']} bulletins",
        "classe": res["classe"],
        "effectif": res["effectif"],
        "bulletins_crees": res["bulletins_crees"],
        "bulletins_total": res["bulletins_total"],
    }


def _enqueue(fonction, *args, timeout: int, etablissement_id: int):
    """Met une tâche en file, ou échoue franchement si Redis est indisponible.

    Une tâche perdue silencieusement n'est jamais acceptable : contrairement au
    cache (app/core/cache.py), l'appelant doit savoir que le calcul n'a pas été
    accepté. Même contrat que `generer_bulletin_pdf_async`.

    Pas de `Retry` ici, à la différence du PDF de bulletin : ces calculs
    écrivent en base et leurs seuls échecs plausibles (période clôturée entre
    temps, classe déplacée d'établissement) sont définitifs — les rejouer
    retarderait le passage en FAILED sans aucune chance de succès.

    `meta["etablissement_id"]` est OBLIGATOIRE : `GET /api/tasks/{id}` compare
    ce champ à l'établissement du demandeur et refuse par défaut une tâche qui
    ne le porte pas. Sans lui, la tâche part bien mais son résultat devient
    illisible — y compris pour celui qui l'a lancée.
    """
    from app.core.task_queue import get_queue
    try:
        return get_queue().enqueue(
            fonction, *args, job_timeout=timeout, result_ttl=86400, failure_ttl=86400,
            meta={"etablissement_id": etablissement_id},
        )
    except Exception as exc:
        raise HTTPException(503, f"File de tâches indisponible : {exc}")


@router.post("/classe/{classe_id}/calculer-moyennes-async")
def calculer_moyennes_async(
    classe_id: int,
    trimestre_id: int = Query(..., description="Période à calculer"),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Version asynchrone du calcul de période — suivre via GET /api/tasks/{id}.

    C'est le seul calcul du module qui grossit avec l'effectif : sur une classe
    de 160 élèves et 12 matières, la version synchrone tient la connexion HTTP
    ouverte plusieurs dizaines de secondes. L'endpoint synchrone reste en place
    pour les petites classes et les recalculs ponctuels.

    Les contrôles refaits ici (classe, année, période clôturée) évitent de
    mettre en file un calcul voué à échouer ; le worker les refait de son côté,
    car l'état peut changer entre la mise en file et l'exécution.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)

    trimestre = _periode_ou_404(db, trimestre_id, etablissement_id)
    if trimestre.statut == "CLOTURE":
        raise HTTPException(
            400,
            f"{trimestre.libelle} est clôturé — impossible de recalculer les moyennes de cette période.",
        )

    from app.tasks.notation_tasks import calculer_periode_task
    job = _enqueue(
        calculer_periode_task, classe_id, trimestre_id, etablissement_id,
        timeout=600, etablissement_id=etablissement_id,
    )
    return {
        "task_id": job.id,
        "status": "PENDING",
        "message": f"Calcul de {trimestre.libelle} mis en file pour {classe.libelle}.",
    }


@router.post("/classe/{classe_id}/calculer-moyennes-annuelles-async")
def calculer_moyennes_annuelles_async(
    classe_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Version asynchrone du calcul annuel — suivre via GET /api/tasks/{id}."""
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)

    from app.tasks.notation_tasks import calculer_annuel_task
    job = _enqueue(calculer_annuel_task, classe_id, etablissement_id,
                   timeout=600, etablissement_id=etablissement_id)
    return {
        "task_id": job.id,
        "status": "PENDING",
        "message": f"Calcul annuel mis en file pour {classe.libelle}.",
    }


@router.post("/classe/{classe_id}/bulletins/generer-pdf-async")
def generer_bulletins_classe_async(
    classe_id: int,
    trimestre_id: Optional[int] = None,
    type_bulletin: str = "TRIMESTRIEL",
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Génère en une fois les PDF de tous les bulletins d'une classe.

    Imprimer une classe entière déclenchait jusqu'ici autant d'appels HTTP que
    d'élèves, chacun reconstruisant son PDF pendant la requête. Ce lot est
    exactement le cas que la génération asynchrone d'un bulletin unique
    préparait sans le couvrir.

    Suivre l'avancement via GET /api/tasks/{id} : le résultat liste les
    fichiers produits et, séparément, les élèves en échec.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)

    # On vérifie ici qu'il y a quelque chose à imprimer : mettre en file un lot
    # vide ne renverrait l'erreur qu'après un aller-retour sur la file.
    query = db.query(func.count(Bulletin.bulletin_id)).join(
        Inscription, Inscription.inscription_id == Bulletin.inscription_id
    ).filter(
        Inscription.classe_id == classe_id,
        Bulletin.type_bulletin == type_bulletin,
    )
    query = (query.filter(Bulletin.trimestre_id == trimestre_id)
             if trimestre_id else query.filter(Bulletin.trimestre_id.is_(None)))
    nb = query.scalar() or 0
    if nb == 0:
        raise HTTPException(
            400, "Aucun bulletin à imprimer : calculez d'abord les moyennes de la période."
        )

    from app.tasks.notation_tasks import generer_bulletins_classe_task
    job = _enqueue(
        generer_bulletins_classe_task,
        classe_id, etablissement_id, trimestre_id, type_bulletin,
        timeout=1800, etablissement_id=etablissement_id,
    )
    return {
        "task_id": job.id,
        "status": "PENDING",
        "nb_bulletins": nb,
        "message": f"Génération de {nb} bulletins mise en file pour {classe.libelle}.",
    }


@router.get("/classe/{classe_id}/resultats-intermediaires")
def resultats_intermediaires(
    classe_id: int,
    trimestre_id: int,
    evaluation_ids: Optional[str] = None,
    session_ids: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Classement de suivi, à la demande, sans rien écrire en base.

    Permet à l'école de sortir un classement mensuel sur une sélection
    d'évaluations sans toucher aux bulletins officiels de la période. Les
    identifiants sont passés en liste séparée par des virgules.
    """
    def _ids(v: Optional[str]) -> Optional[List[int]]:
        if not v:
            return None
        try:
            return [int(x) for x in v.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(400, "Liste d'identifiants invalide")

    _classe_ou_404(db, classe_id, etablissement_id)

    # Le classement de SUIVI se calcule dès que les notes sont saisies, sans
    # attendre la centralisation officielle : une évaluation « Publiée » (notes
    # remplies par l'enseignant) doit déjà donner une moyenne et un rang. Le
    # calcul officiel des bulletins, lui, ne retient toujours que les épreuves
    # centralisées — c'est une autre route (calculer-moyennes, persist=True).
    return calculer_resultats_periode(
        db, classe_id, trimestre_id,
        evaluation_ids=_ids(evaluation_ids),
        session_ids=_ids(session_ids),
        persist=False,
        # Le suivi doit refléter TOUTE épreuve qui a des notes, y compris une
        # évaluation encore « Planifiée » remplie côté administration : le
        # classement ne dépend pas du statut, seulement de l'existence des notes.
        statuts_inclus=["PLANIFIEE", "PUBLIEE", "CENTRALISEE", "CALCULE"],
    )


# ════════════════════════════════════════════════════════════
# CALENDRIER — quel mois appartient à quelle période
# ════════════════════════════════════════════════════════════

@router.get("/calendrier/mois")
def get_calendrier_mois(annee_id: Optional[int] = None, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Mois de l'année scolaire et période à laquelle chacun appartient.

    Sert à ce que l'école choisisse « Janvier » plutôt qu'une date brute : le
    rattachement à la bonne période en découle, au lieu de dépendre de ce qui
    était sélectionné à l'écran.
    """
    if annee_id is None:
        annee = (db.query(AnneeScolaire).filter(AnneeScolaire.est_courante == "O").first()
                 or db.query(AnneeScolaire).order_by(desc(AnneeScolaire.annee_id)).first())
        if not annee:
            raise HTTPException(404, "Aucune année scolaire configurée")
        annee_id = annee.annee_id
    return {"annee_id": annee_id, "mois": calendrier_mois(db, annee_id)}


# ════════════════════════════════════════════════════════════
# ÉPREUVES D'UNE PÉRIODE — ce qui compte pour le résultat officiel
# ════════════════════════════════════════════════════════════

@router.get("/classe/{classe_id}/periode/{trimestre_id}/epreuves")
def lister_epreuves_periode(classe_id: int, trimestre_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Épreuves disponibles sur la période, et lesquelles comptent pour le résultat.

    `retenue` indique si l'épreuve entre dans le calcul officiel. Tant que
    l'école n'a rien choisi, tout ce qui est centralisé compte (`selection_
    personnalisee` à false) : c'est le comportement par défaut, pas un choix
    implicite qu'on lui prêterait.
    """
    _classe_ou_404(db, classe_id, etablissement_id)

    evals = db.query(Evaluation).filter(
        Evaluation.classe_id == classe_id,
        Evaluation.trimestre_id == trimestre_id,
    ).all()
    types = {
        t.type_eval_id: t for t in db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == etablissement_id
        ).all()
    }
    retenues = epreuves_retenues_periode(db, classe_id, trimestre_id)
    personnalisee = retenues is not None
    retenues_set = set(retenues or [])

    # Regroupement par épreuve : une composition est une seule épreuve, même si
    # elle porte 12 évaluations (une par matière).
    epreuves = {}
    for ev in evals:
        cle = f"S{ev.session_id}" if ev.session_id else f"E{ev.evaluation_id}"
        e = epreuves.setdefault(cle, {
            "cle": cle,
            "session_id": ev.session_id,
            "evaluation_ids": [],
            "libelle": ev.libelle,
            "type_eval_id": ev.type_eval_id,
            "type": types[ev.type_eval_id].libelle if ev.type_eval_id in types else "",
            "coefficient_type": float(types[ev.type_eval_id].coefficient or 1) if ev.type_eval_id in types else 1.0,
            "date_evaluation": ev.date_evaluation.isoformat() if ev.date_evaluation else None,
            "est_coefficientee": ev.est_coefficientee,
            "nb_matieres": 0,
            "nb_centralisees": 0,
        })
        e["evaluation_ids"].append(ev.evaluation_id)
        e["nb_matieres"] += 1
        if ev.statut == "CENTRALISEE":
            e["nb_centralisees"] += 1

    liste = sorted(epreuves.values(), key=lambda e: e["date_evaluation"] or "")
    for e in liste:
        e["centralisee"] = e["nb_centralisees"] == e["nb_matieres"]
        e["retenue"] = (
            all(i in retenues_set for i in e["evaluation_ids"]) if personnalisee
            else e["centralisee"]
        )

    return {
        "classe_id": classe_id,
        "trimestre_id": trimestre_id,
        "selection_personnalisee": personnalisee,
        "epreuves": liste,
    }


class SelectionEpreuves(BaseModel):
    evaluation_ids: List[int]


@router.put("/classe/{classe_id}/periode/{trimestre_id}/epreuves")
def definir_epreuves_periode(
    classe_id: int, trimestre_id: int,
    data: SelectionEpreuves, db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Enregistre les épreuves qui comptent pour le résultat officiel de la période.

    Le résultat d'une période n'est pas forcément « tout ce qui a été noté » :
    deux évaluations sans composition, une composition seule, ou toute autre
    combinaison — c'est l'école qui décide, et le choix reste tracé.

    Liste vide = retour au comportement par défaut (tout ce qui est centralisé).
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — la sélection ne peut plus être modifiée.")

    # On refuse une sélection qui déborde de la période : sinon le résultat
    # d'un trimestre pourrait inclure une épreuve d'un autre.
    if data.evaluation_ids:
        valides = {
            row[0] for row in db.query(Evaluation.evaluation_id).filter(
                Evaluation.classe_id == classe_id,
                Evaluation.trimestre_id == trimestre_id,
                Evaluation.evaluation_id.in_(data.evaluation_ids),
            ).all()
        }
        hors_periode = set(data.evaluation_ids) - valides
        if hors_periode:
            raise HTTPException(
                400,
                f"Évaluations hors de cette classe/période : {sorted(hors_periode)}",
            )

    db.query(PeriodeEpreuve).filter(
        PeriodeEpreuve.classe_id == classe_id,
        PeriodeEpreuve.trimestre_id == trimestre_id,
    ).delete(synchronize_session=False)
    for evaluation_id in set(data.evaluation_ids):
        db.add(PeriodeEpreuve(
            classe_id=classe_id, trimestre_id=trimestre_id, evaluation_id=evaluation_id,
        ))
    db.commit()

    if not data.evaluation_ids:
        return {
            "message": "Sélection effacée : toutes les évaluations centralisées comptent à nouveau.",
            "selection_personnalisee": False, "nb_evaluations": 0,
        }
    return {
        "message": f"{len(set(data.evaluation_ids))} évaluations retenues pour cette période.",
        "selection_personnalisee": True, "nb_evaluations": len(set(data.evaluation_ids)),
    }


@router.post("/classe/{classe_id}/calculer-moyennes-annuelles")
def calculer_moyennes_annuelles(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Calcule les résultats annuels et génère les bulletins annuels de la classe.

    Agrège les bulletins de période déjà calculés — à lancer une fois toutes
    les périodes de l'année calculées.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)

    res = calculer_resultats_annuels(db, classe_id, persist=True)
    return {
        "message": f"Moyennes annuelles calculées pour {res['classe']} — {res['effectif']} bulletins",
        "classe": res["classe"],
        "effectif": res["effectif"],
        "bulletins_crees": res["bulletins_crees"],
        "bulletins_total": res["bulletins_total"],
    }


@router.get("/classe/{classe_id}/resultats-annuels")
def apercu_resultats_annuels(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Aperçu des résultats annuels sans générer les bulletins."""
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    res = calculer_resultats_annuels(db, classe_id, persist=False)

    # Une classe d'examen doit s'annoncer comme telle dès cet aperçu : sans ça,
    # l'écran de fin d'année n'a aucun moyen de savoir qu'il doit proposer la
    # saisie du résultat ministériel.
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    res["classe_examen"] = bool(niveau and niveau.est_examen == "O")
    res["examen_national"] = niveau.examen_national if niveau else None
    return res


@router.get("/classe/{classe_id}/fiche-annuelle/pdf")
def fiche_resultats_annuels_pdf(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Fiche de résultats de fin d'année d'une classe, prête à imprimer.

    Une seule feuille qui répond aux questions qu'on pose réellement en fin
    d'année : qui est classé où, avec quelle moyenne par période, quelle
    mention, et — pour une classe d'examen — quel résultat national. Les
    chiffres de tête (moyenne de classe, taux atteignant le seuil de passage,
    répartition des mentions) évitent d'avoir à recompter à la main.
    """
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane
    from app.models.academique import ResultatOfficielExamen
    from app.services.notation import ORDRE_MENTIONS
    import io as _io, os

    classe = _classe_ou_404(db, classe_id, etablissement_id)

    res = calculer_resultats_annuels(db, classe_id, persist=False)
    lignes = [r for r in res["resultats"] if r["moyenne_generale"] is not None]
    if not lignes:
        raise HTTPException(
            400,
            "Aucun résultat annuel : calculez d'abord les moyennes de chaque période, "
            "puis les résultats annuels.",
        )

    periodes = res["periodes"]
    synthese = res["synthese"]
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    classe_examen = bool(niveau and niveau.est_examen == "O")
    examen_national = (niveau.examen_national if niveau else None) or "Examen national"

    officiels = {}
    if classe_examen:
        officiels = {
            o.inscription_id: o for o in db.query(ResultatOfficielExamen).filter(
                ResultatOfficielExamen.inscription_id.in_(
                    [r["inscription_id"] for r in lignes]
                )
            ).all()
        }

    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == classe.annee_id).first()
    settings = get_documents_settings(db, classe.etablissement_id)

    buffer = _io.BytesIO()
    largeur, hauteur = landscape(A4)
    pdf = canvas.Canvas(buffer, pagesize=landscape(A4))
    cp = (0.16, 0.20, 0.45)
    cs = (0.94, 0.95, 0.98)
    marge_g, marge_d = 1.2 * cm, largeur - 1.2 * cm

    # Colonnes : rang, matricule, élève, une par période, moyenne, mention,
    # et le résultat de l'examen quand la classe en passe un.
    col_rang, col_mat, col_periode = 1.3 * cm, 2.6 * cm, 2.1 * cm
    col_moy, col_mention = 2.4 * cm, 3.0 * cm
    col_examen = 2.6 * cm if classe_examen else 0
    col_eleve = (marge_d - marge_g) - (
        col_rang + col_mat + col_periode * len(periodes) + col_moy + col_mention + col_examen
    )

    def entete():
        y = hauteur - 1.1 * cm
        logo = (etablissement.logo_url if etablissement else None) or settings.get("documents.logo_url")
        if logo:
            chemin = str(logo).lstrip("/")
            if os.path.exists(chemin):
                try:
                    pdf.drawImage(ImageReader(chemin), 1.2 * cm, y - 1.5 * cm,
                                  width=1.8 * cm, height=1.8 * cm, mask="auto")
                except Exception:
                    pass
        pdf.setFont("Helvetica-Bold", 8)
        pdf.setFillColorRGB(0.35, 0.35, 0.35)
        pdf.drawCentredString(largeur / 2, y, "RÉPUBLIQUE DE GUINÉE — Travail · Justice · Solidarité")
        y -= 0.45 * cm
        pdf.setFont("Helvetica-Bold", 13)
        pdf.setFillColorRGB(*cp)
        pdf.drawCentredString(largeur / 2, y, (etablissement.nom if etablissement else "Établissement").upper())
        y -= 0.5 * cm
        pdf.setFont("Helvetica-Bold", 12)
        pdf.setFillColorRGB(0, 0, 0)
        pdf.drawCentredString(
            largeur / 2, y,
            "FICHE DE RÉSULTATS DE FIN D'ANNÉE — %s%s" % (
                classe.libelle, " — %s" % annee.libelle if annee else ""),
        )
        y -= 0.42 * cm
        pdf.setFont("Helvetica", 8)
        pdf.setFillColorRGB(0.4, 0.4, 0.4)
        pdf.drawCentredString(
            largeur / 2, y,
            "Moyenne annuelle = somme des moyennes de période ÷ nombre de périodes"
            + ("  ·  Classe d'examen %s : le résultat national décide seul du passage." % examen_national
               if classe_examen else ""),
        )
        return y - 0.55 * cm

    def bandeau(y):
        """Les quatre chiffres qu'un directeur regarde en premier."""
        cartes = [
            ("EFFECTIF", str(res["effectif"])),
            ("MOYENNE DE CLASSE", "%.2f" % synthese["moyenne_classe"] if synthese["moyenne_classe"] is not None else "—"),
            ("≥ %.0f DE MOYENNE" % synthese["seuil_passage"],
             "%d / %d  (%.0f%%)" % (synthese["atteignent_seuil"], synthese["evalues"], synthese["taux_reussite"] or 0)),
            ("PREMIER DE LA CLASSE", synthese["premier"] or "—"),
        ]
        if classe_examen:
            admis = sum(1 for o in officiels.values() if o.resultat == "ADMIS")
            non_admis = len(officiels) - admis
            attente = res["effectif"] - len(officiels)
            cartes.append((
                examen_national.upper(),
                "%d admis · %d non admis%s" % (
                    admis, non_admis, " · %d en attente" % attente if attente else "")
                if officiels else "aucun résultat saisi",
            ))
        w = (marge_d - marge_g) / len(cartes)
        h = 1.15 * cm
        for i, (titre, valeur) in enumerate(cartes):
            x = marge_g + i * w
            pdf.setFillColorRGB(*cs)
            pdf.rect(x + 0.06 * cm, y - h, w - 0.12 * cm, h, fill=1, stroke=0)
            pdf.setFont("Helvetica", 6.5)
            pdf.setFillColorRGB(0.42, 0.45, 0.55)
            pdf.drawString(x + 0.25 * cm, y - 0.38 * cm, titre)
            # Taille réduite plutôt que texte coupé : « 6 admis · 4 non admis ·
            # 2 en attente » tronqué à 26 caractères mentirait sur le décompte.
            texte = str(valeur)
            pdf.setFont("Helvetica-Bold", 9.5 if len(texte) <= 24 else 7.5)
            pdf.setFillColorRGB(*cp)
            pdf.drawString(x + 0.25 * cm, y - 0.85 * cm, texte[:40])
        return y - h - 0.5 * cm

    def entete_tableau(y):
        pdf.setFillColorRGB(*cp)
        pdf.rect(marge_g, y - 0.55 * cm, marge_d - marge_g, 0.55 * cm, fill=1, stroke=0)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.setFillColorRGB(1, 1, 1)
        ty = y - 0.37 * cm
        x = marge_g
        pdf.drawCentredString(x + col_rang / 2, ty, "RANG"); x += col_rang
        pdf.drawString(x + 0.1 * cm, ty, "MATRICULE"); x += col_mat
        pdf.drawString(x + 0.1 * cm, ty, "NOM ET PRÉNOM"); x += col_eleve
        for p in periodes:
            # "1er Trimestre" ne tient pas : on garde l'essentiel (T1, S2...)
            court = "".join(c for c in p["libelle"] if c.isdigit()) or str(p["numero"])
            prefixe = "S" if "emestre" in p["libelle"] else "T"
            pdf.drawCentredString(x + col_periode / 2, ty, "%s%s" % (prefixe, court)); x += col_periode
        pdf.drawCentredString(x + col_moy / 2, ty, "MOY. AN."); x += col_moy
        pdf.drawCentredString(x + col_mention / 2, ty, "MENTION"); x += col_mention
        if classe_examen:
            pdf.drawCentredString(x + col_examen / 2, ty, examen_national.upper()[:10])
        return y - 0.55 * cm

    y = bandeau(entete())
    y = entete_tableau(y)
    row_h = 0.48 * cm

    for idx, l in enumerate(lignes):
        if y < 3.2 * cm:
            pdf.showPage()
            y = entete_tableau(entete())
        if idx % 2 == 1:
            pdf.setFillColorRGB(0.975, 0.98, 0.99)
            pdf.rect(marge_g, y - row_h, marge_d - marge_g, row_h, fill=1, stroke=0)

        ty = y - 0.32 * cm
        x = marge_g
        pdf.setFont("Helvetica-Bold", 8)
        pdf.setFillColorRGB(*cp)
        pdf.drawCentredString(x + col_rang / 2, ty, str(l["rang"])); x += col_rang
        pdf.setFont("Helvetica", 7)
        pdf.setFillColorRGB(0.35, 0.35, 0.35)
        pdf.drawString(x + 0.1 * cm, ty, (l["matricule"] or "—")[:12]); x += col_mat
        pdf.setFont("Helvetica", 8)
        pdf.setFillColorRGB(0, 0, 0)
        pdf.drawString(x + 0.1 * cm, ty, ("%s %s" % (l["nom"] or "", l["prenom"] or "")).strip()[:34])
        x += col_eleve

        par_periode = {p["trimestre_id"]: p["moyenne"] for p in l["periodes"]}
        pdf.setFont("Helvetica", 7.5)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        for p in periodes:
            v = par_periode.get(p["trimestre_id"])
            pdf.drawCentredString(x + col_periode / 2, ty, "%.2f" % v if v is not None else "—")
            x += col_periode

        moy = l["moyenne_generale"]
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColorRGB(*((0.65, 0.12, 0.12) if moy < synthese["seuil_passage"] else (0, 0, 0)))
        pdf.drawCentredString(x + col_moy / 2, ty, "%.2f" % moy); x += col_moy
        pdf.setFont("Helvetica", 7)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        pdf.drawCentredString(x + col_mention / 2, ty, (l["mention"] or "—")[:14]); x += col_mention

        if classe_examen:
            o = officiels.get(l["inscription_id"])
            libelle = "ADMIS" if o and o.resultat == "ADMIS" else ("NON ADMIS" if o else "en attente")
            pdf.setFont("Helvetica-Bold" if o else "Helvetica-Oblique", 7.5)
            pdf.setFillColorRGB(*(
                (0.05, 0.45, 0.3) if o and o.resultat == "ADMIS"
                else (0.65, 0.12, 0.12) if o else (0.55, 0.55, 0.55)))
            pdf.drawCentredString(x + col_examen / 2, ty, libelle)

        pdf.setStrokeColorRGB(0.9, 0.92, 0.95)
        pdf.setLineWidth(0.4)
        pdf.line(marge_g, y - row_h, marge_d, y - row_h)
        y -= row_h

    # Répartition des mentions + signatures
    y -= 0.6 * cm
    if y < 2.6 * cm:
        pdf.showPage()
        y = hauteur - 2.5 * cm
    pdf.setFont("Helvetica-Bold", 8)
    pdf.setFillColorRGB(*cp)
    pdf.drawString(marge_g, y, "Répartition des mentions")
    y -= 0.4 * cm
    pdf.setFont("Helvetica", 7.5)
    pdf.setFillColorRGB(0.3, 0.3, 0.3)
    pdf.drawString(marge_g, y, "   ".join(
        "%s : %d" % (m, synthese["mentions"].get(m, 0)) for m in ORDRE_MENTIONS
    ))
    y -= 0.9 * cm
    pdf.setFont("Helvetica", 8)
    pdf.setFillColorRGB(0.25, 0.25, 0.25)
    tiers = (marge_d - marge_g) / 3
    for i, libelle in enumerate(["Le Professeur Principal", "Le Directeur des Études", "Le Directeur"]):
        x = marge_g + i * tiers
        pdf.line(x, y, x + tiers - 1.2 * cm, y)
        pdf.drawString(x, y - 0.35 * cm, libelle)

    try:
        dessiner_filigrane(pdf, settings, largeur, hauteur)
    except Exception:
        pass

    pdf.save()
    buffer.seek(0)
    nom_fichier = ("fiche_resultats_annuels_%s.pdf" % classe.libelle).replace(" ", "_")
    return StreamingResponse(
        buffer, media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=%s" % nom_fichier},
    )


# ════════════════════════════════════════════════════════════
# SESSIONS D'ÉVALUATION — création groupée multi-matières
# ════════════════════════════════════════════════════════════

@router.post("/sessions", status_code=201)
def creer_session_evaluation(data: EvaluationSessionCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Crée une composition (ou toute évaluation) pour toutes les matières d'un coup.

    Une composition couvre normalement toutes les matières de la classe le même
    jour : l'école remplit un seul écran, le système crée une évaluation par
    matière, toutes rattachées à la session.
    """
    classe = db.query(Classe).filter(Classe.classe_id == data.classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    verifier_annee_modifiable(db, classe.annee_id)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == data.trimestre_id).first()
    if not trimestre:
        raise HTTPException(404, "Période non trouvée")
    if trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — impossible d'y créer une évaluation.")

    # Une épreuve datée hors de sa période fausserait le bulletin de période
    # tout en paraissant normale à l'écran.
    try:
        verifier_date_dans_periode(db, trimestre, data.date_evaluation)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Le type doit appartenir à l'école appelante : désigner celui d'une
    # autre école reviendrait à lui emprunter son coefficient de référence.
    type_eval = db.query(TypeEvaluation).filter(
        TypeEvaluation.type_eval_id == data.type_eval_id,
        TypeEvaluation.etablissement_id == etablissement_id,
    ).first()
    if not type_eval:
        raise HTTPException(404, "Type d'évaluation non trouvé")

    cms = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == data.classe_id,
        ClasseMatiere.est_active == "O",
    ).all()
    matiere_ids = [cm.matiere_id for cm in cms]
    if data.matiere_ids:
        demandees = set(data.matiere_ids)
        inconnues = demandees - set(matiere_ids)
        if inconnues:
            raise HTTPException(
                400,
                f"Matières non enseignées dans cette classe : {sorted(inconnues)}"
            )
        matiere_ids = [m for m in matiere_ids if m in demandees]
    if not matiere_ids:
        raise HTTPException(400, "Aucune matière active pour cette classe.")

    etablissement_id = classe.etablissement_id
    cycle_key = get_cycle_key(data.classe_id, db)
    coefficient_type = get_types_evaluation_coefficients(
        db, etablissement_id, cycle_key
    ).get(data.type_eval_id, 1.0)

    session = EvaluationSession(
        classe_id=data.classe_id,
        trimestre_id=data.trimestre_id,
        type_eval_id=data.type_eval_id,
        etablissement_id=etablissement_id,
        libelle=data.libelle,
        date_evaluation=data.date_evaluation,
        note_sur=data.note_sur,
        est_coefficientee=data.est_coefficientee,
        enseignant_id=data.enseignant_id,
        statut="PLANIFIEE",
    )
    db.add(session)
    db.flush()

    # Un enseignant doit être renseigné sur chaque évaluation : on prend celui
    # affecté à la matière dans cette classe, sinon celui indiqué sur la session.
    affectations = {
        a.matiere_id: a.enseignant_id
        for a in db.query(Affectation).filter(
            Affectation.classe_id == data.classe_id,
            Affectation.statut == "ACTIVE",
        ).all()
    }

    creees = []
    for matiere_id in matiere_ids:
        enseignant_id = affectations.get(matiere_id) or data.enseignant_id
        if not enseignant_id:
            raise HTTPException(
                400,
                f"Aucun enseignant affecté à la matière {matiere_id} : précisez un enseignant pour la session.",
            )
        note_sur = data.note_sur or get_bareme_effectif(
            db, data.classe_id, matiere_id, cycle_key, etablissement_id
        )
        ev = Evaluation(
            classe_id=data.classe_id,
            matiere_id=matiere_id,
            trimestre_id=data.trimestre_id,
            type_eval_id=data.type_eval_id,
            enseignant_id=enseignant_id,
            libelle=data.libelle,
            date_evaluation=data.date_evaluation,
            note_sur=note_sur,
            coefficient=coefficient_type,
            statut="PLANIFIEE",
            session_id=session.session_id,
            est_coefficientee=data.est_coefficientee,
        )
        db.add(ev)
        db.flush()
        creees.append(ev.evaluation_id)

    db.commit()
    return {
        "message": f"{len(creees)} évaluations créées pour « {data.libelle} »",
        "session_id": session.session_id,
        "evaluation_ids": creees,
    }


@router.get("/sessions")
def lister_sessions(
    classe_id: Optional[int] = None,
    trimestre_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    # Isolation portée par la classe, pas par la colonne dénormalisée : une
    # session ne peut apparaître ici que si sa classe est bien de cette école.
    query = db.query(EvaluationSession).join(
        Classe, Classe.classe_id == EvaluationSession.classe_id
    ).filter(Classe.etablissement_id == etablissement_id)
    if classe_id:
        query = query.filter(EvaluationSession.classe_id == classe_id)
    if trimestre_id:
        query = query.filter(EvaluationSession.trimestre_id == trimestre_id)
    sessions = query.order_by(desc(EvaluationSession.date_evaluation)).all()
    if not sessions:
        return []

    # Comptages groupés — jamais une requête par session
    types = {
        t.type_eval_id: t.libelle for t in db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == etablissement_id
        ).all()
    }
    compte = dict(
        db.query(Evaluation.session_id, func.count(Evaluation.evaluation_id))
        .filter(Evaluation.session_id.in_([s.session_id for s in sessions]))
        .group_by(Evaluation.session_id).all()
    )
    return [
        {
            "session_id": s.session_id,
            "classe_id": s.classe_id,
            "trimestre_id": s.trimestre_id,
            "type_eval_id": s.type_eval_id,
            "type_libelle": types.get(s.type_eval_id, "?"),
            "libelle": s.libelle,
            "date_evaluation": s.date_evaluation,
            "note_sur": float(s.note_sur) if s.note_sur else None,
            "est_coefficientee": s.est_coefficientee,
            "statut": s.statut,
            "nb_evaluations": compte.get(s.session_id, 0),
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
def detail_session(session_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    session = _session_ou_404(db, session_id, etablissement_id)

    evals = db.query(Evaluation).filter(Evaluation.session_id == session_id).all()
    matieres = {
        m.matiere_id: m.libelle
        for m in db.query(Matiere).filter(
            Matiere.matiere_id.in_([e.matiere_id for e in evals])
        ).all()
    } if evals else {}
    nb_notes = dict(
        db.query(Note.evaluation_id, func.count(Note.note_id))
        .filter(Note.evaluation_id.in_([e.evaluation_id for e in evals]),
                Note.valeur.isnot(None))
        .group_by(Note.evaluation_id).all()
    ) if evals else {}

    return {
        "session_id": session.session_id,
        "classe_id": session.classe_id,
        "trimestre_id": session.trimestre_id,
        "type_eval_id": session.type_eval_id,
        "libelle": session.libelle,
        "date_evaluation": session.date_evaluation,
        "est_coefficientee": session.est_coefficientee,
        "statut": session.statut,
        "evaluations": [
            {
                "evaluation_id": e.evaluation_id,
                "matiere_id": e.matiere_id,
                "matiere": matieres.get(e.matiere_id, "?"),
                "note_sur": float(e.note_sur) if e.note_sur else None,
                "statut": e.statut,
                "nb_notes": nb_notes.get(e.evaluation_id, 0),
            }
            for e in evals
        ],
    }


@router.put("/sessions/{session_id}")
def modifier_session(session_id: int, data: EvaluationSessionUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    session = _session_ou_404(db, session_id, etablissement_id)
    classe = db.query(Classe).filter(Classe.classe_id == session.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == session.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — modification impossible.")

    evals = db.query(Evaluation).filter(Evaluation.session_id == session_id).all()
    if data.libelle is not None:
        session.libelle = data.libelle
        for e in evals:
            e.libelle = data.libelle
    if data.date_evaluation is not None:
        # Même contrôle qu'à la création : une composition déplacée hors de sa
        # période compterait dans un trimestre auquel elle n'appartient pas.
        try:
            verifier_date_dans_periode(db, trimestre, data.date_evaluation)
        except ValueError as e:
            raise HTTPException(400, str(e))
        session.date_evaluation = data.date_evaluation
        for e in evals:
            e.date_evaluation = data.date_evaluation
    if data.note_sur is not None:
        if data.note_sur <= 0:
            raise HTTPException(400, "Le barème doit être strictement positif")
        _verifier_bareme_compatible(db, [e.evaluation_id for e in evals], data.note_sur)
        session.note_sur = data.note_sur
        for e in evals:
            e.note_sur = data.note_sur
    if data.type_eval_id is not None:
        if not db.query(TypeEvaluation).filter(
            TypeEvaluation.type_eval_id == data.type_eval_id,
            TypeEvaluation.etablissement_id == etablissement_id,
        ).first():
            raise HTTPException(404, "Type d'évaluation introuvable")
        session.type_eval_id = data.type_eval_id
        for e in evals:
            e.type_eval_id = data.type_eval_id
    if data.est_coefficientee is not None:
        session.est_coefficientee = data.est_coefficientee
        # Propagé sur les évaluations filles : le moteur de calcul lit ce
        # drapeau sur l'évaluation, sans jointure vers la session.
        for e in evals:
            e.est_coefficientee = data.est_coefficientee
    # `coefficient_override` absent du corps = ne pas y toucher ; envoyé à null
    # = revenir au coefficient du type. Sans cette distinction, une surcharge
    # posée par erreur ne pouvait plus jamais être retirée.
    if "coefficient_override" in data.model_fields_set:
        if data.coefficient_override is not None and data.coefficient_override <= 0:
            raise HTTPException(400, "Le coefficient doit être strictement positif")
        for e in evals:
            e.coefficient_override = data.coefficient_override
    if data.statut is not None:
        session.statut = data.statut
        for e in evals:
            e.statut = data.statut

    db.commit()
    return {"message": "Session mise à jour", "session_id": session_id}


@router.delete("/sessions/{session_id}")
def supprimer_session(session_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    session = _session_ou_404(db, session_id, etablissement_id)
    classe = db.query(Classe).filter(Classe.classe_id == session.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    evals = db.query(Evaluation).filter(Evaluation.session_id == session_id).all()
    eval_ids = [e.evaluation_id for e in evals]
    if any(e.statut == "CENTRALISEE" for e in evals):
        raise HTTPException(
            400,
            "Des notes de cette session sont déjà centralisées — suppression impossible."
        )
    if eval_ids:
        db.query(Note).filter(Note.evaluation_id.in_(eval_ids)).delete(synchronize_session=False)
        db.query(Evaluation).filter(Evaluation.session_id == session_id).delete(synchronize_session=False)
    db.delete(session)
    db.commit()
    return {"message": f"Session supprimée ({len(eval_ids)} évaluations)"}


# ════════════════════════════════════════════════════════════
# CORRECTION ET SUPPRESSION D'UNE ÉPREUVE
# ════════════════════════════════════════════════════════════
# Une épreuve créée avec la mauvaise date, le mauvais barème ou le mauvais type
# était définitive : rien dans l'interface ne permettait de la corriger ni de
# l'effacer, et aucune route ne supprimait une évaluation isolée.

def _epreuve_modifiable(db: Session, ev: Evaluation) -> Classe:
    """Garde-fous communs : année ouverte, période non clôturée."""
    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)
    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — modification impossible.")
    return classe


def _verifier_bareme_compatible(db: Session, evaluation_ids: List[int], note_sur: float) -> None:
    """Refuse un barème inférieur à une note déjà saisie.

    Abaisser le barème sous une note existante ne lèverait aucune erreur : la
    note serait simplement normalisée au-dessus du maximum et gonflerait la
    moyenne. C'est exactement le mécanisme qui avait produit des moyennes de
    250/20 sur cette base.
    """
    if not evaluation_ids or not note_sur or note_sur <= 0:
        return
    maxi = db.query(func.max(Note.valeur)).filter(
        Note.evaluation_id.in_(evaluation_ids),
        Note.valeur.isnot(None),
    ).scalar()
    if maxi is not None and float(maxi) > float(note_sur):
        raise HTTPException(
            400,
            f"Barème refusé : une note de {float(maxi):g} est déjà saisie, "
            f"elle ne tiendrait pas dans un barème sur {float(note_sur):g}. "
            "Corrigez d'abord les notes concernées.",
        )


@router.put("/{evaluation_id}", response_model=EvaluationOut)
def modifier_evaluation(evaluation_id: int, data: EvaluationUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Corrige une épreuve : libellé, date, barème, type, enseignant, coefficient.

    La date reste contrôlée contre les bornes de sa période — corriger une
    épreuve ne doit pas permettre de la déplacer hors du trimestre auquel elle
    compte, ce que la création interdit déjà.
    """
    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
    _epreuve_modifiable(db, ev)

    if data.date_evaluation is not None:
        trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
        try:
            verifier_date_dans_periode(db, trimestre, data.date_evaluation)
        except ValueError as e:
            raise HTTPException(400, str(e))
        ev.date_evaluation = data.date_evaluation

    if data.note_sur is not None:
        if data.note_sur <= 0:
            raise HTTPException(400, "Le barème doit être strictement positif")
        _verifier_bareme_compatible(db, [evaluation_id], data.note_sur)
        ev.note_sur = data.note_sur

    if data.type_eval_id is not None:
        if not db.query(TypeEvaluation).filter(
            TypeEvaluation.type_eval_id == data.type_eval_id,
            TypeEvaluation.etablissement_id == etablissement_id,
        ).first():
            raise HTTPException(404, "Type d'évaluation introuvable")
        ev.type_eval_id = data.type_eval_id

    if data.libelle is not None:
        ev.libelle = data.libelle
    if data.enseignant_id is not None:
        ev.enseignant_id = data.enseignant_id
    if data.est_coefficientee is not None:
        ev.est_coefficientee = "N" if data.est_coefficientee in ("N", "false", False) else "O"
    if "coefficient_override" in data.model_fields_set:
        # null = retour au coefficient du type (voir modifier_session)
        if data.coefficient_override is not None and data.coefficient_override <= 0:
            raise HTTPException(400, "Le coefficient doit être strictement positif")
        ev.coefficient_override = data.coefficient_override

    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/{evaluation_id}")
def supprimer_evaluation(evaluation_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Supprime une épreuve et ses notes.

    Refusée quand l'épreuve est centralisée : ses notes sont entrées dans des
    bulletins déjà calculés, et les effacer laisserait des moyennes que plus
    rien ne justifie. Le bon geste dans ce cas est de passer l'épreuve en
    ANNULEE (`PUT /{id}/statut`), qui la sort du calcul sans détruire la saisie.
    """
    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
    _epreuve_modifiable(db, ev)

    if ev.statut == "CENTRALISEE":
        raise HTTPException(
            400,
            "Cette épreuve est centralisée : ses notes comptent déjà dans les "
            "bulletins. Passez-la en « Annulée » pour l'exclure du calcul sans "
            "perdre la saisie.",
        )

    nb_notes = db.query(func.count(Note.note_id)).filter(
        Note.evaluation_id == evaluation_id
    ).scalar() or 0
    db.query(Note).filter(Note.evaluation_id == evaluation_id).delete(synchronize_session=False)
    db.query(PeriodeEpreuve).filter(
        PeriodeEpreuve.evaluation_id == evaluation_id
    ).delete(synchronize_session=False)

    session_id = ev.session_id
    db.delete(ev)
    db.flush()

    # Une session vidée de toutes ses matières n'a plus d'objet : la laisser
    # ferait apparaître une composition fantôme dans la liste des épreuves.
    session_supprimee = False
    if session_id:
        restantes = db.query(func.count(Evaluation.evaluation_id)).filter(
            Evaluation.session_id == session_id
        ).scalar() or 0
        if restantes == 0:
            db.query(EvaluationSession).filter(
                EvaluationSession.session_id == session_id
            ).delete(synchronize_session=False)
            session_supprimee = True

    db.commit()
    return {
        "message": f"Épreuve supprimée ({nb_notes} note(s) effacée(s))",
        "evaluation_id": evaluation_id,
        "notes_supprimees": nb_notes,
        "session_supprimee": session_supprimee,
    }


@router.put("/{evaluation_id}/coefficient")
def modifier_coefficient_evaluation(
    evaluation_id: int, data: dict, db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Surcharge ponctuelle du coefficient d'une évaluation.

    `coefficient_override = null` rétablit le coefficient de son type.
    """
    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — modification impossible.")

    valeur = data.get("coefficient_override")
    if valeur is not None:
        try:
            valeur = float(valeur)
        except (TypeError, ValueError):
            raise HTTPException(400, "Coefficient invalide")
        if valeur <= 0:
            raise HTTPException(400, "Le coefficient doit être strictement positif")
    ev.coefficient_override = valeur

    if "est_coefficientee" in data:
        ev.est_coefficientee = "N" if data["est_coefficientee"] in (False, "N", "false") else "O"

    db.commit()
    return {
        "message": "Coefficient mis à jour",
        "evaluation_id": evaluation_id,
        "coefficient_override": valeur,
        "est_coefficientee": ev.est_coefficientee,
    }


# ════════════════════════════════════════════════════════════
# CONSULTATION DES BULLETINS
# ════════════════════════════════════════════════════════════

@router.get("/classe/{classe_id}/bulletins")
def get_bulletins_classe(
    response: Response,
    classe_id: int,
    trimestre_id: Optional[int] = None,
    type_bulletin: str = "TRIMESTRIEL",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Récupère les bulletins générés pour une classe, paginés.

    `type_bulletin=ANNUEL` retourne les bulletins annuels (sans période) ;
    sinon `trimestre_id` sélectionne la période (1 par défaut, comportement
    historique conservé pour les appelants existants).

    Réécrit en préchargement par lot — avant : 1 requête Bulletin + 1 Eleve +
    1 BulletinLigne (+ 1 Matiere PAR ligne) PAR INSCRIPTION, soit ~2000+
    requêtes pour une classe de 160 élèves.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE"
    ).all()
    insc_ids = [i.inscription_id for i in inscriptions]
    eleve_by_id = {i.inscription_id: i.eleve_id for i in inscriptions}

    bulletins_query = db.query(Bulletin).filter(Bulletin.inscription_id.in_(insc_ids))
    if type_bulletin == "ANNUEL":
        bulletins_query = bulletins_query.filter(Bulletin.type_bulletin == "ANNUEL")
    else:
        bulletins_query = bulletins_query.filter(
            Bulletin.trimestre_id == (trimestre_id if trimestre_id is not None else 1)
        )
    bulletins = bulletins_query.all()
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
    # Notation par lettres : réglage par cycle, sans effet tant que l'école ne
    # l'active pas — `lettre` vaut alors null et l'affichage ne change pas.
    cycle_key = get_cycle_key(classe_id, db)
    echelle = get_bareme_defaut_cycle(db, classe.etablissement_id, cycle_key)
    lettres = get_lettres_config(db, classe.etablissement_id, cycle_key)

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
                "lettre": lettre_pour_note(
                    float(l.moyenne_matiere) if l.moyenne_matiere is not None else None,
                    lettres, echelle,
                ),
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
            "lettre_generale": lettre_pour_note(
                float(bulletin.moyenne_generale) if bulletin.moyenne_generale is not None else None,
                lettres, echelle,
            ),
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
def update_bulletin_decision(bulletin_id: int, data: BulletinDecisionUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Met à jour la décision du conseil de classe pour un bulletin."""
    bulletin = _bulletin_ou_404(db, bulletin_id, etablissement_id)
    insc = db.query(Inscription).filter(Inscription.inscription_id == bulletin.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    bulletin.decision = data.decision
    db.commit()
    return {"message": "✅ Décision enregistrée", "bulletin_id": bulletin_id, "decision": data.decision}


# ════════════════════════════════════════════════════════════
# PUBLICATION BULLETIN (individuel)
# ════════════════════════════════════════════════════════════

@router.put("/bulletins/{bulletin_id}/publier")
def publier_bulletin(bulletin_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Publie un bulletin individuel (le rend visible sur le portail parent)."""
    bulletin = _bulletin_ou_404(db, bulletin_id, etablissement_id)
    insc = db.query(Inscription).filter(Inscription.inscription_id == bulletin.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    bulletin.statut = "PUBLIE"
    db.commit()
    return {"message": "✅ Bulletin publié", "bulletin_id": bulletin_id, "statut": "PUBLIE"}


@router.put("/bulletins/{bulletin_id}/depublier")
def depublier_bulletin(bulletin_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Dépublie un bulletin (le masque du portail parent)."""
    bulletin = _bulletin_ou_404(db, bulletin_id, etablissement_id)
    insc = db.query(Inscription).filter(Inscription.inscription_id == bulletin.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    bulletin.statut = "BROUILLON"
    db.commit()
    return {"message": "Bulletin dépublié", "bulletin_id": bulletin_id, "statut": "BROUILLON"}


# ════════════════════════════════════════════════════════════
# PUBLICATION EN MASSE (toute une classe)
# ════════════════════════════════════════════════════════════

@router.put("/classe/{classe_id}/bulletins/publier-tout")
def publier_bulletins_classe(classe_id: int, trimestre_id: int = Query(..., description="Période à publier"), db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Publie tous les bulletins d'une classe pour une période donnée."""
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    verifier_annee_modifiable(db, classe.annee_id)
    _periode_ou_404(db, trimestre_id, etablissement_id)

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


@router.put("/{evaluation_id}/statut")
def changer_statut_evaluation(evaluation_id: int, data: dict, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Change le statut d'une évaluation (PLANIFIEE / PUBLIEE / CENTRALISEE).

    Pendant : seules les évaluations CENTRALISEE entrent dans le calcul des
    moyennes. L'équivalent côté enseignant est
    `PUT /api/portail-enseignant/{id}/evaluations/{id}/centraliser`.
    """
    STATUTS = {"PLANIFIEE", "PUBLIEE", "CENTRALISEE", "ANNULEE"}
    statut = (data.get("statut") or "").upper()
    if statut not in STATUTS:
        raise HTTPException(400, f"Statut invalide. Valeurs acceptées : {', '.join(sorted(STATUTS))}")

    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == ev.trimestre_id).first()
    if trimestre and trimestre.statut == "CLOTURE":
        raise HTTPException(400, f"{trimestre.libelle} est clôturé — modification impossible.")

    if statut == "CENTRALISEE":
        # Centraliser une évaluation sans note fausserait les moyennes : la
        # matière compterait alors qu'aucun élève n'a été évalué.
        nb = db.query(Note).filter(Note.evaluation_id == evaluation_id, Note.valeur.isnot(None)).count()
        if nb == 0:
            raise HTTPException(400, "Impossible de centraliser : aucune note saisie.")

    ev.statut = statut
    db.commit()
    return {"message": f"Évaluation passée en {statut}", "evaluation_id": evaluation_id, "statut": statut}


@router.put("/{evaluation_id}/notes/batch-update")
def admin_update_notes_batch(evaluation_id: int, data: AdminBatchNotesUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Admin: modifier des notes en batch sur une évaluation."""
    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
    classe = db.query(Classe).filter(Classe.classe_id == ev.classe_id).first()
    verifier_annee_modifiable(db, classe.annee_id if classe else None)

    # Toutes les notes sont validées AVANT d'en écrire une seule : une saisie
    # partiellement enregistrée serait plus difficile à rattraper pour la
    # secrétaire qu'un refus net de tout le lot.
    valeurs = {}
    for item in data.notes:
        if item.est_absent:
            valeurs[item.note_id] = None
            continue
        try:
            valeurs[item.note_id] = valider_note(item.valeur, ev.note_sur)
        except ValueError as e:
            raise HTTPException(400, str(e))

    updated = 0
    for item in data.notes:
        note = db.query(Note).filter(Note.note_id == item.note_id, Note.evaluation_id == evaluation_id).first()
        if note:
            note.valeur = valeurs[item.note_id]
            note.est_absent = "O" if item.est_absent else "N"
            note.observation = item.observation
            updated += 1

    # Une évaluation qui reçoit des notes n'est plus « planifiée » : on la passe
    # « publiée », exactement comme lorsque l'enseignant la remplit. Sans ça,
    # une composition remplie côté administration restait PLANIFIEE et
    # n'apparaissait pas comme telle.
    if updated and ev.statut == "PLANIFIEE":
        ev.statut = "PUBLIEE"

    db.commit()
    return {"message": f"{updated} notes mises à jour", "nb_modifiees": updated}


# ════════════════════════════════════════════════════════════
# NOTES CRUD (sous-router)
# ════════════════════════════════════════════════════════════
notes_router = APIRouter(prefix="/api/notes", tags=["Notes"])


def _verifier_valeur_note(
    db: Session, evaluation_id: Optional[int], valeur, etablissement_id: int
) -> None:
    """Refuse une note hors barème sur ce sous-router aussi.

    Ces routes CRUD sont le chemin le moins utilisé (l'interface passe par les
    lots), mais elles écrivent dans la même table : les laisser sans contrôle
    rouvrirait la porte que `valider_note` ferme ailleurs.

    L'évaluation de référence est cherchée dans l'école appelante : sans ce
    filtre, un identifiant d'une autre école aurait imposé SON barème au
    contrôle (une note refusée ici, acceptée là).
    """
    if valeur is None or evaluation_id is None:
        return
    ev = _evaluation_ou_404(db, evaluation_id, etablissement_id)
    try:
        valider_note(valeur, ev.note_sur if ev else None)
    except ValueError as e:
        raise HTTPException(400, str(e))


def _note_ou_404(db: Session, note_id: int, etablissement_id: int) -> Note:
    """Note est OWNERSHIP via Inscription -> Classe."""
    note = (
        db.query(Note)
        .join(Inscription, Inscription.inscription_id == Note.inscription_id)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Note.note_id == note_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note non trouvée")
    return note


@notes_router.post("", response_model=NoteOut, status_code=201)
def create_note(data: NoteCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    # L'inscription cible doit appartenir à cet établissement — sinon une
    # note pouvait être posée sur l'élève d'une autre école.
    insc = (
        db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id == data.inscription_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not insc:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    verifier_annee_modifiable(db, insc.annee_id)
    _verifier_valeur_note(db, data.evaluation_id, getattr(data, "valeur", None), etablissement_id)
    note = Note(**data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@notes_router.put("/{note_id}", response_model=NoteOut)
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    note = _note_ou_404(db, note_id, etablissement_id)
    insc = db.query(Inscription).filter(Inscription.inscription_id == note.inscription_id).first()
    verifier_annee_modifiable(db, insc.annee_id if insc else None)
    champs = data.model_dump(exclude_unset=True)
    if "valeur" in champs:
        _verifier_valeur_note(db, note.evaluation_id, champs["valeur"], etablissement_id)
    for key, value in champs.items():
        setattr(note, key, value)
    db.commit()
    db.refresh(note)
    return note


@notes_router.put("/batch")
def update_notes_batch(notes: List[NoteUpdate], note_ids: List[int], db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Mise à jour en lot des notes (saisie de notes).

    Chaque note est vérifiée individuellement : avant le Lot 9, un seul
    note_id d'une autre école glissé dans la liste était modifié sans
    contrôle (et seule la PREMIÈRE note servait au verrou d'année).
    """
    if note_ids:
        premiere_note = _note_ou_404(db, note_ids[0], etablissement_id)
        insc = db.query(Inscription).filter(Inscription.inscription_id == premiere_note.inscription_id).first()
        verifier_annee_modifiable(db, insc.annee_id if insc else None)

    updated = 0
    for note_id, data in zip(note_ids, notes):
        # Chaque note du lot est vérifiée, pas seulement la première : un
        # identifiant d'une autre école glissé en 2ᵉ position doit être refusé.
        note = _note_ou_404(db, note_id, etablissement_id)
        champs = data.model_dump(exclude_unset=True)
        if "valeur" in champs:
            _verifier_valeur_note(db, note.evaluation_id, champs["valeur"], etablissement_id)
        for key, value in champs.items():
            setattr(note, key, value)
        updated += 1
    db.commit()
    return {"message": f"{updated} notes mises à jour"}


# ════════════════════════════════════════════════════════════
# TYPE EVALUATION CRUD
# ════════════════════════════════════════════════════════════
# Chaque école a SA liste de types (Composition, Interrogation, Oral…) et la
# nomme comme elle l'entend. Cette table était partagée : renommer un type dans
# une école changeait l'intitulé des colonnes de bulletin de toutes les autres.
# Voir migration 2026_08_notation_09_type_evaluation_etablissement.py.
#
# Le POIDS de chaque type reste réglable par cycle, en plus, via
# `notation.coef_type.{cycle}.{code}` — cf. get_types_evaluation_coefficients.

def _type_evaluation_ou_404(db: Session, type_eval_id: int, etablissement_id: int) -> TypeEvaluation:
    t = db.query(TypeEvaluation).filter(
        TypeEvaluation.type_eval_id == type_eval_id,
        TypeEvaluation.etablissement_id == etablissement_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Type d'évaluation non trouvé")
    return t


@router.get("/types", response_model=List[TypeEvaluationOut])
def get_types_evaluation(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    return db.query(TypeEvaluation).filter(
        TypeEvaluation.etablissement_id == etablissement_id
    ).order_by(TypeEvaluation.type_eval_id).all()


@router.post("/types", response_model=TypeEvaluationOut, status_code=201)
def create_type_evaluation(
    data: TypeEvaluationCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    payload = data.model_dump()
    # L'établissement vient du jeton, jamais du corps de la requête.
    payload["etablissement_id"] = etablissement_id
    # Le code n'est unique QUE dans l'école : le doublon se vérifie donc ici,
    # sinon l'index remonterait une erreur 500 illisible pour l'utilisateur.
    if db.query(TypeEvaluation).filter(
        TypeEvaluation.etablissement_id == etablissement_id,
        TypeEvaluation.code == payload["code"],
    ).first():
        raise HTTPException(
            409, f"Le code « {payload['code']} » est déjà utilisé par un autre type dans votre établissement."
        )
    type_ev = TypeEvaluation(**payload)
    db.add(type_ev)
    db.commit()
    db.refresh(type_ev)
    return type_ev


@router.put("/types/{type_eval_id}", response_model=TypeEvaluationOut)
def update_type_evaluation(
    type_eval_id: int,
    data: TypeEvaluationUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    type_ev = _type_evaluation_ou_404(db, type_eval_id, etablissement_id)
    champs = data.model_dump(exclude_unset=True)
    nouveau_code = champs.get("code")
    if nouveau_code and nouveau_code != type_ev.code:
        if db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == etablissement_id,
            TypeEvaluation.code == nouveau_code,
            TypeEvaluation.type_eval_id != type_eval_id,
        ).first():
            raise HTTPException(
                409, f"Le code « {nouveau_code} » est déjà utilisé par un autre type dans votre établissement."
            )
    for key, value in champs.items():
        setattr(type_ev, key, value)
    db.commit()
    db.refresh(type_ev)
    return type_ev


@router.delete("/types/{type_eval_id}")
def delete_type_evaluation(
    type_eval_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    type_ev = _type_evaluation_ou_404(db, type_eval_id, etablissement_id)

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

@router.get("/classe/{classe_id}/classement/pdf")
def generer_fiche_classement_pdf(
    classe_id: int,
    trimestre_id: Optional[int] = None,
    evaluation_ids: Optional[str] = None,
    session_ids: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Fiche de classement de la classe, prête à imprimer.

    Une page A4 paysage : en-tête établissement, tableau des élèves classés
    avec la note de chaque matière, la moyenne, le rang et la mention, puis
    les statistiques de la classe et les signatures.

    Sans `evaluation_ids`/`session_ids`, la fiche porte sur toute la période ;
    avec, elle porte sur la sélection (résultat d'une composition précise,
    sans toucher aux bulletins).
    """
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm
    from reportlab.lib.utils import ImageReader
    from app.core.documents_settings import get_documents_settings, dessiner_filigrane
    import io as _io, os

    classe = _classe_ou_404(db, classe_id, etablissement_id)

    def _ids(v):
        if not v:
            return None
        try:
            return [int(x) for x in v.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(400, "Liste d'identifiants invalide")

    if trimestre_id is None:
        tri = (db.query(Trimestre).filter(Trimestre.statut == "EN_COURS").first()
               or db.query(Trimestre).order_by(Trimestre.numero).first())
        trimestre_id = tri.trimestre_id if tri else 1

    res = calculer_resultats_periode(
        db, classe_id, trimestre_id,
        evaluation_ids=_ids(evaluation_ids), session_ids=_ids(session_ids),
        persist=False,
    )
    resultats = res.get("resultats", [])
    if not resultats:
        raise HTTPException(400, "Aucun résultat à imprimer : aucune note centralisée pour cette période.")

    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == classe.etablissement_id
    ).first()
    trimestre = db.query(Trimestre).filter(Trimestre.trimestre_id == trimestre_id).first()
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == classe.annee_id).first()
    settings = get_documents_settings(db, classe.etablissement_id)

    inscriptions = {
        i.inscription_id: i for i in db.query(Inscription).filter(
            Inscription.inscription_id.in_([r["inscription_id"] for r in resultats])
        ).all()
    }
    eleves = {
        e.eleve_id: e for e in db.query(Eleve).filter(
            Eleve.eleve_id.in_([i.eleve_id for i in inscriptions.values()])
        ).all()
    }

    # Colonnes matières : uniquement celles réellement notées
    notees = {
        l["matiere_id"] for r in resultats for l in r["lignes"]
        if l["moyenne_matiere"] is not None
    }
    matieres_cols = [l for l in resultats[0]["lignes"] if l["matiere_id"] in notees]

    # En-têtes : le code de la matière (FRA, MAT...) tient dans une colonne
    # étroite là où le libellé se ferait couper au milieu d'un mot. Le libellé
    # complet est rappelé en légende sous le tableau.
    codes_matiere = {
        m.matiere_id: m.code
        for m in db.query(Matiere).filter(Matiere.matiere_id.in_(notees)).all()
    }

    buffer = _io.BytesIO()
    largeur, hauteur = landscape(A4)
    pdf = canvas.Canvas(buffer, pagesize=landscape(A4))
    cp = (0.16, 0.20, 0.45)
    cs = (0.94, 0.95, 0.98)

    def entete():
        y = hauteur - 1.2 * cm
        logo = (etablissement.logo_url if etablissement else None) or settings.get("documents.logo_url")
        if logo:
            chemin = str(logo).lstrip("/")
            if os.path.exists(chemin):
                try:
                    pdf.drawImage(ImageReader(chemin), 1.2 * cm, y - 1.5 * cm,
                                  width=1.8 * cm, height=1.8 * cm, mask="auto")
                except Exception:
                    pass
        pdf.setFont("Helvetica-Bold", 8)
        pdf.setFillColorRGB(0.35, 0.35, 0.35)
        pdf.drawCentredString(largeur / 2, y, "RÉPUBLIQUE DE GUINÉE — Travail · Justice · Solidarité")
        y -= 0.45 * cm
        pdf.setFont("Helvetica-Bold", 13)
        pdf.setFillColorRGB(*cp)
        pdf.drawCentredString(largeur / 2, y, (etablissement.nom if etablissement else "Établissement").upper())
        y -= 0.42 * cm
        pdf.setFont("Helvetica", 8)
        pdf.setFillColorRGB(0.4, 0.4, 0.4)
        coords = " · ".join(x for x in [
            etablissement.adresse if etablissement else None,
            etablissement.telephone if etablissement else None,
        ] if x)
        if coords:
            pdf.drawCentredString(largeur / 2, y, coords)
            y -= 0.4 * cm
        pdf.setFont("Helvetica-Bold", 12)
        pdf.setFillColorRGB(0, 0, 0)
        periode = trimestre.libelle if trimestre else "Période"
        pdf.drawCentredString(
            largeur / 2, y,
            "CLASSEMENT PAR ORDRE DE MÉRITE — %s — %s" % (classe.libelle, periode)
        )
        y -= 0.4 * cm
        # Sur quelles épreuves porte ce classement : un « ordre de mérite de
        # janvier » n'a pas le même sens qu'un classement de fin de trimestre.
        epreuves = res.get("epreuves") or []
        if epreuves:
            détail = " + ".join(
                "%s (%s)" % (e["libelle"], e["type"]) if e["type"] else e["libelle"]
                for e in epreuves
            )
            pdf.setFont("Helvetica-Oblique", 8.5)
            pdf.setFillColorRGB(0.2, 0.2, 0.2)
            texte = "D'après : %s" % détail
            if pdf.stringWidth(texte, "Helvetica-Oblique", 8.5) > largeur - 4 * cm:
                texte = texte[:150] + "..."
            pdf.drawCentredString(largeur / 2, y, texte)
            y -= 0.38 * cm
        pdf.setFont("Helvetica", 8.5)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        coef_info = ""
        if epreuves and all(e.get("est_coefficientee") == "N" for e in epreuves):
            coef_info = " · Sans coefficients de matière"
        # Les écoles nomment leur année tantôt « 2025-2026 », tantôt « Année
        # Scolaire 2025-2026 » : on ne préfixe que si le libellé ne le fait pas.
        lib_annee = (annee.libelle if annee else "") or ""
        if lib_annee and not lib_annee.lower().startswith("année"):
            lib_annee = "Année scolaire %s" % lib_annee
        pdf.drawCentredString(largeur / 2, y, "%s · Effectif : %s élèves · Édité le %s%s" % (
            lib_annee,
            res["effectif"],
            date.today().strftime("%d/%m/%Y"),
            coef_info,
        ))
        return y - 0.5 * cm

    marge = 1.0 * cm
    tab_w = largeur - 2 * marge
    # Colonne matricule élargie : les matricules réels (ex. ELV-LYCETOK-00003,
    # 17 caractères) ne tenaient pas dans 2 cm et débordaient sur le nom.
    col_rang, col_mat, col_nom = 1.0 * cm, 2.8 * cm, 4.6 * cm
    col_moy, col_mention = 1.5 * cm, 2.2 * cm
    reste = tab_w - (col_rang + col_mat + col_nom + col_moy + col_mention)
    col_matiere = reste / max(len(matieres_cols), 1)

    def entete_tableau(y):
        pdf.setFillColorRGB(*cp)
        pdf.rect(marge, y - 0.95 * cm, tab_w, 0.95 * cm, fill=1, stroke=0)
        pdf.setFillColorRGB(1, 1, 1)
        pdf.setFont("Helvetica-Bold", 7.5)
        x = marge + 0.1 * cm
        pdf.drawString(x, y - 0.62 * cm, "RG")
        x += col_rang
        pdf.drawString(x, y - 0.62 * cm, "MATRICULE")
        x += col_mat
        pdf.drawString(x, y - 0.62 * cm, "NOM ET PRÉNOM")
        x += col_nom
        for l in matieres_cols:
            code = codes_matiere.get(l["matiere_id"], l["matiere"][:6])
            pdf.setFont("Helvetica-Bold", 8)
            pdf.drawCentredString(x + col_matiere / 2, y - 0.5 * cm, code[:8])
            pdf.setFont("Helvetica", 5.5)
            pdf.drawCentredString(x + col_matiere / 2, y - 0.82 * cm, "coef %g" % l["coefficient"])
            x += col_matiere
        pdf.setFont("Helvetica-Bold", 7.5)
        pdf.drawCentredString(x + col_moy / 2, y - 0.62 * cm, "MOY.")
        x += col_moy
        pdf.drawCentredString(x + col_mention / 2, y - 0.62 * cm, "MENTION")
        return y - 0.95 * cm

    y = entete()
    y = entete_tableau(y)
    row_h = 0.52 * cm

    for idx, r in enumerate(resultats):
        if y < 3.4 * cm:
            pdf.showPage()
            y = entete_tableau(entete())
        insc = inscriptions.get(r["inscription_id"])
        el = eleves.get(insc.eleve_id) if insc else None

        if idx % 2 == 0:
            pdf.setFillColorRGB(*cs)
            pdf.rect(marge, y - row_h, tab_w, row_h, fill=1, stroke=0)

        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont("Helvetica-Bold", 8)
        x = marge + 0.1 * cm
        pdf.drawString(x, y - 0.36 * cm, str(r["rang"]))
        x += col_rang
        # Matricule affiché EN ENTIER sans déborder : on réduit la police juste
        # ce qu'il faut pour qu'il tienne dans sa colonne (et, tout à la fin
        # seulement, on tronque si un matricule est vraiment démesuré).
        mat = (el.matricule if el else "") or ""
        mat_font = 7.0
        largeur_dispo = col_mat - 0.2 * cm
        while mat_font > 5.0 and pdf.stringWidth(mat, "Helvetica", mat_font) > largeur_dispo:
            mat_font -= 0.5
        while mat and pdf.stringWidth(mat, "Helvetica", mat_font) > largeur_dispo:
            mat = mat[:-1]
        pdf.setFont("Helvetica", mat_font)
        pdf.drawString(x, y - 0.36 * cm, mat)
        x += col_mat
        # Le nom aussi est borné à sa colonne, pour ne pas empiéter sur les
        # matières quand il est très long.
        pdf.setFont("Helvetica", 8)
        nom = ("%s %s" % (el.nom, el.prenom)) if el else ("#%s" % r["inscription_id"])
        nom = nom[:30]
        while nom and pdf.stringWidth(nom, "Helvetica", 8) > col_nom - 0.2 * cm:
            nom = nom[:-1]
        pdf.drawString(x, y - 0.36 * cm, nom)
        x += col_nom

        par_matiere = {l["matiere_id"]: l["moyenne_matiere"] for l in r["lignes"]}
        pdf.setFont("Helvetica", 7)
        for l in matieres_cols:
            v = par_matiere.get(l["matiere_id"])
            if v is not None and v < 10:
                pdf.setFillColorRGB(0.75, 0.15, 0.15)
            pdf.drawCentredString(x + col_matiere / 2, y - 0.36 * cm,
                                  ("%.1f" % v) if v is not None else "—")
            pdf.setFillColorRGB(0, 0, 0)
            x += col_matiere

        pdf.setFont("Helvetica-Bold", 8.5)
        moy = r["moyenne_generale"]
        if moy is not None and moy < 10:
            pdf.setFillColorRGB(0.75, 0.15, 0.15)
        pdf.drawCentredString(x + col_moy / 2, y - 0.36 * cm,
                              ("%.2f" % moy) if moy is not None else "—")
        pdf.setFillColorRGB(0, 0, 0)
        x += col_moy
        pdf.setFont("Helvetica", 6.5)
        pdf.drawCentredString(x + col_mention / 2, y - 0.36 * cm, (r["mention"] or "")[:14])

        y -= row_h

    # ── Légende des codes matière ──
    y -= 0.35 * cm
    pdf.setFont("Helvetica", 6.2)
    pdf.setFillColorRGB(0.42, 0.42, 0.42)
    legende = "   ".join(
        "%s = %s" % (codes_matiere.get(l["matiere_id"], "?"), l["matiere"])
        for l in matieres_cols
    )
    # Repli sur plusieurs lignes : une ligne unique déborderait de la page
    mots, ligne_courante = legende.split("   "), ""
    for mot in mots:
        essai = (ligne_courante + "   " + mot) if ligne_courante else mot
        if pdf.stringWidth(essai, "Helvetica", 6.2) > (largeur - 2 * marge):
            pdf.drawString(marge, y, ligne_courante)
            y -= 0.3 * cm
            ligne_courante = mot
        else:
            ligne_courante = essai
    if ligne_courante:
        pdf.drawString(marge, y, ligne_courante)
        y -= 0.3 * cm

    moyennes = [r["moyenne_generale"] for r in resultats if r["moyenne_generale"] is not None]
    y -= 0.3 * cm
    pdf.setStrokeColorRGB(*cp)
    pdf.setLineWidth(1)
    pdf.line(marge, y, largeur - marge, y)
    y -= 0.55 * cm
    if moyennes:
        moy_cl = sum(moyennes) / len(moyennes)
        admis = len([m for m in moyennes if m >= 10])
        pdf.setFont("Helvetica-Bold", 8.5)
        pdf.setFillColorRGB(*cp)
        pdf.drawString(marge, y, "STATISTIQUES DE LA CLASSE")
        pdf.setFont("Helvetica", 8.5)
        pdf.setFillColorRGB(0, 0, 0)
        pdf.drawString(marge + 4.8 * cm, y,
                       "Moyenne de la classe : %.2f/20      Plus forte : %.2f      Plus faible : %.2f      "
                       "Moyennes >= 10 : %d/%d (%d%%)" % (
                           moy_cl, max(moyennes), min(moyennes),
                           admis, len(moyennes), admis * 100 // len(moyennes)))
        y -= 1.4 * cm

    pdf.setFont("Helvetica", 8)
    pdf.setFillColorRGB(0.35, 0.35, 0.35)
    for i, label in enumerate(["Le Professeur Principal", "Le Directeur des Études", "Le Chef d'Établissement"]):
        x = marge + i * (tab_w / 3)
        pdf.line(x, y + 0.05 * cm, x + 4.5 * cm, y + 0.05 * cm)
        pdf.drawString(x, y - 0.4 * cm, label)

    dessiner_filigrane(pdf, largeur, hauteur, settings)
    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    nom_fichier = ("classement_%s_%s.pdf" % (
        classe.libelle, trimestre.libelle if trimestre else "periode")).replace(" ", "_")
    return StreamingResponse(
        buffer, media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=%s" % nom_fichier},
    )


def _build_bulletin_pdf_bytes(bulletin_id: int, db: Session):
    """Construit le PDF d'un bulletin — logique extraite telle quelle de
    l'ancienne fonction monolithique `generer_bulletin_pdf` (Étape F).
    Réutilisée à l'identique par la route GET synchrone ci-dessous ET par
    la tâche worker asynchrone (app/tasks/bulletin_tasks.py) : aucune
    dépendance à un contexte de requête HTTP, juste `bulletin_id` + une
    session DB, renvoie (octets PDF, nom de fichier suggéré) au lieu d'une
    StreamingResponse.
    """
    import os
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader
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
    # NULL pour un bulletin annuel, qui couvre toute l'année et non une période
    trimestre = db.query(Trimestre).filter(
        Trimestre.trimestre_id == bulletin.trimestre_id
    ).first() if bulletin.trimestre_id else None
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
    # Barème réel du cycle : le bulletin affichait « / 20 » en dur, y compris
    # pour une école du primaire qui note sur 10.
    _cycle_key_bulletin = get_cycle_key(classe.classe_id, db)
    echelle_lettres = get_bareme_defaut_cycle(db, classe.etablissement_id, _cycle_key_bulletin)
    lettres_cfg = get_lettres_config(db, classe.etablissement_id, _cycle_key_bulletin)

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

    # ── Statistiques classe (meilleure/plus faible moyenne de la période) ──
    # `trimestre_id IS NULL` pour un bulletin annuel : comparer avec `= NULL`
    # ne remonte jamais rien, et le bulletin annuel sortait sans ses repères de
    # classe alors que le trimestriel les affichait.
    _q_stats = db.query(Bulletin.moyenne_generale).join(
        Inscription, Bulletin.inscription_id == Inscription.inscription_id
    ).filter(
        Inscription.classe_id == classe.classe_id,
        Bulletin.type_bulletin == bulletin.type_bulletin,
        Bulletin.moyenne_generale.isnot(None),
    )
    _q_stats = (_q_stats.filter(Bulletin.trimestre_id == bulletin.trimestre_id)
                if bulletin.trimestre_id else _q_stats.filter(Bulletin.trimestre_id.is_(None)))
    moyennes_classe = [float(m) for (m,) in _q_stats.all()]
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

    # ── Bulletin annuel : d'où vient la moyenne, et résultat de l'examen ──
    # Sur un bulletin annuel, la seule question de la famille est « comment
    # arrive-t-on à ce chiffre ». On rappelle donc les moyennes de période qui
    # le composent. Pour une classe d'examen (6ème/10ème/Terminale), on rappelle
    # aussi que c'est le résultat national — pas cette moyenne — qui décide.
    periodes_annuelles, resultat_officiel = [], None
    if bulletin.type_bulletin == "ANNUEL":
        from app.models.academique import ResultatOfficielExamen
        for b_per, trim in db.query(Bulletin, Trimestre).join(
            Trimestre, Bulletin.trimestre_id == Trimestre.trimestre_id
        ).filter(
            Bulletin.inscription_id == inscription.inscription_id,
            Bulletin.type_bulletin != "ANNUEL",
            Bulletin.moyenne_generale.isnot(None),
        ).order_by(Trimestre.numero, Trimestre.date_debut).all():
            periodes_annuelles.append((trim.libelle, float(b_per.moyenne_generale)))
        resultat_officiel = db.query(ResultatOfficielExamen).filter(
            ResultatOfficielExamen.inscription_id == inscription.inscription_id
        ).first()

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

    # QR du bulletin — encode un TEXTE LISIBLE (scanné par un téléphone, il
    # affiche directement l'essentiel) : nom de l'ÉCOLE (plus « SMARTSCHOOL »),
    # n° du bulletin, élève, classe, PÉRIODE RÉELLE (« 1er Trimestre »,
    # « 1er Semestre » selon le calendrier de l'école, ou « Bulletin annuel »),
    # moyenne, rang et statut Admis/Échoué. Toutes les valeurs viennent de la
    # base, jamais un ID brut ni « None ».
    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        from reportlab.graphics import renderPDF

        if (bulletin.type_bulletin or "").upper() == "ANNUEL" or trimestre is None:
            _periode_lbl = "Bulletin annuel"
        else:
            _periode_lbl = trimestre.libelle or "Période"

        _echelle = float(echelle_lettres or 20)
        _moy = bulletin.moyenne_generale
        if _moy is not None:
            _moy_val = float(_moy)
            _statut = "ADMIS" if _moy_val >= _echelle / 2.0 else "ÉCHOUÉ"
            _moy_txt = f"{_moy_val:.2f} / {int(_echelle)}"
        else:
            _statut, _moy_txt = "—", "—"
        if bulletin.rang and bulletin.effectif_classe:
            _rang_txt = f"{bulletin.rang} / {bulletin.effectif_classe}"
        elif bulletin.rang:
            _rang_txt = str(bulletin.rang)
        else:
            _rang_txt = "—"

        qr_payload = "\n".join([
            nom_ecole,
            "BULLETIN",
            f"N° : {bulletin.bulletin_id}",
            f"Élève : {eleve.prenom} {eleve.nom}",
            f"Matricule : {eleve.matricule}",
            f"Classe : {classe.libelle}",
            f"Période : {_periode_lbl}",
            f"Moyenne : {_moy_txt}",
            f"Rang : {_rang_txt}",
            f"Statut : {_statut}",
        ])
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
    if bulletin.type_bulletin == "ANNUEL":
        titre_periode = f"ANNUEL {annee.libelle}" if annee else "ANNUEL"
    else:
        titre_periode = trimestre.libelle if trimestre else "Trimestre"
    pdf.drawCentredString(largeur / 2, y, f"BULLETIN DE NOTES — {titre_periode}")
    y -= 0.3 * cm
    pdf.setLineWidth(1.5)
    pdf.line(1.5 * cm, y, largeur - 1.5 * cm, y)

    # ── INFOS ÉLÈVE (+ photo si disponible) ──
    y -= 0.7 * cm
    photo_dessinee = False
    photo_bottom = None
    if getattr(eleve, "photo_url", None):
        photo_path = os.path.join(backend_root, eleve.photo_url.lstrip("/").replace("/", os.sep))
        if os.path.isfile(photo_path):
            try:
                # Cadrée dans le coin haut-droit du bloc élève : son haut affleure
                # la ligne « Élève : … » et elle descend en regard de Matricule/Année.
                photo_bottom = y - 1.85 * cm
                pdf.drawImage(
                    ImageReader(photo_path), largeur - 1.5 * cm - 2 * cm, photo_bottom,
                    width=2 * cm, height=2.4 * cm, preserveAspectRatio=True, mask='auto', anchor='c'
                )
                photo_dessinee = True
            except Exception:
                photo_dessinee = False
                photo_bottom = None

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

    if photo_dessinee and photo_bottom is not None:
        # Le tableau démarre TOUJOURS sous la photo, quel que soit le nombre de
        # lignes d'infos (avec ou sans taux de présence) — plus de chevauchement.
        y = min(y - 0.3 * cm, photo_bottom - 0.2 * cm)

    # ── TABLEAU DES NOTES ──
    y -= 0.8 * cm
    marge_gauche = 1.5 * cm
    marge_droite = largeur - 1.5 * cm
    tab_w = marge_droite - marge_gauche

    # Colonnes — Écrit/Oral/Composition ajoutés (détail des 3 notes officielles,
    # pas seulement la moyenne finale de matière) + Points (moyenne × coefficient).
    # show_rang résolu plus haut (fusion Notation+Documents) ; moy.classe/min/max
    # pilotés par le même toggle unique "stats_matiere".
    # Le bulletin d'un élève ne porte plus de statistiques de classe :
    # moyenne de classe, min et max répondaient à « où en est la classe ? »,
    # pas à « où en est mon enfant ? ». Ces chiffres restent disponibles pour
    # l'école sur la fiche de classement et dans le tableau de centralisation.
    show_moy_cl = False
    show_minmax = False

    # Détail par type d'évaluation : les colonnes suivent les types réellement
    # utilisés par l'école (plus de trio figé Écrit/Oral/Composition). Chargé en
    # lot pour tout le bulletin — c'était auparavant une requête par matière.
    detail_par_matiere = detail_par_type_classe(
        db, classe.classe_id, bulletin.trimestre_id, inscription.inscription_id
    )
    types_presents = {}
    for lignes_detail in detail_par_matiere.values():
        for d in lignes_detail:
            types_presents.setdefault(d["type_eval_id"], d["libelle"])
    # Au-delà de 4 types la largeur de page ne suit plus : on garde les plus
    # fréquents et le reste bascule dans la moyenne de matière uniquement.
    MAX_COLONNES_DETAIL = 4
    types_ordonnes = sorted(types_presents.items(), key=lambda kv: kv[1])[:MAX_COLONNES_DETAIL]
    nb_detail = len(types_ordonnes)

    col_matiere_w = 3.3 * cm
    col_detail_w = (2.55 * cm / nb_detail) if nb_detail else 0  # même largeur totale qu'avant
    col_coeff_w = 1.6 * cm
    col_moy_w = 1.6 * cm
    # La colonne « Points » (moyenne × coefficient) disparaît de la grille : elle
    # se déduit des deux colonnes voisines et n'apporte rien à la lecture ligne
    # par ligne. Le total de points reste affiché dans la synthèse en bas.
    col_extra_w = 1.1 * cm
    col_appr_w = tab_w - col_matiere_w - (col_detail_w * nb_detail) - col_moy_w - col_coeff_w

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

    if nb_detail:
        detail_x0 = x
        pdf.setFont(tmpl["police_titre"], 6)
        pdf.drawCentredString(detail_x0 + (col_detail_w * nb_detail) / 2, y - 0.35 * cm, "NOTES")
        pdf.setFont(tmpl["police_titre"], tmpl["taille_entete_tableau"] - 1)
        for _tid, libelle in types_ordonnes:
            # Abrégé sur 4 caractères : "Composition" -> "COMP", "Évaluation" -> "ÉVAL"
            pdf.drawCentredString(x + col_detail_w / 2, y - header_h + 0.2 * cm, libelle[:4].upper())
            x += col_detail_w

    pdf.setFont(tmpl["police_titre"], tmpl["taille_entete_tableau"])
    # « COEFFICIENT » en toutes lettres débordait sur la colonne voisine à
    # cette largeur : abrégé, comme le reste des en-têtes du tableau.
    pdf.drawCentredString(x + col_coeff_w / 2, y - header_h + 0.2 * cm, "COEF.")
    x += col_coeff_w
    pdf.drawCentredString(x + col_moy_w / 2, y - header_h + 0.2 * cm, "MOYENNE")
    x += col_moy_w
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

        if nb_detail:
            par_type = {
                d["type_eval_id"]: d["moyenne"]
                for d in detail_par_matiere.get(matiere.matiere_id if matiere else -1, [])
            }
            pdf.setFont(tmpl["police_corps"], max(6, tmpl["taille_corps_tableau"] - 1))
            for tid, _lbl in types_ordonnes:
                val = par_type.get(tid)
                pdf.drawCentredString(x + col_detail_w / 2, y - 0.38 * cm, f"{val:.1f}" if val is not None else "—")
                x += col_detail_w
            pdf.setFont(tmpl["police_corps"], tmpl["taille_corps_tableau"])

        pdf.drawCentredString(x + col_coeff_w / 2, y - 0.38 * cm, f"{coeff:.0f}")
        x += col_coeff_w
        # La lettre suit la note quand l'école a activé la notation par lettres
        # pour ce cycle ; sinon le tableau est inchangé.
        lettre_mat = lettre_pour_note(moy, lettres_cfg, echelle_lettres)
        pdf.drawCentredString(
            x + col_moy_w / 2, y - 0.38 * cm,
            f"{moy:.2f}  {lettre_mat}" if lettre_mat else f"{moy:.2f}",
        )
        x += col_moy_w

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
    # Colonnes dans l'ordre du tableau : coefficient, puis moyenne. Le total de
    # points, qui occupait sa propre colonne, est rappelé dans la synthèse.
    x += col_matiere_w + col_detail_w * nb_detail
    pdf.drawCentredString(x + col_coeff_w / 2, y - 0.38 * cm, f"{total_coeff:.0f}")
    x += col_coeff_w
    pdf.drawCentredString(x + col_moy_w / 2, y - 0.38 * cm, f"{total_points:.1f} pts")
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
    _lettre_gen = lettre_pour_note(moy_gen, lettres_cfg, echelle_lettres)
    pdf.drawString(
        1.8 * cm, y,
        "Moyenne Générale : %.2f / %g%s" % (
            moy_gen, echelle_lettres, f"   ({_lettre_gen})" if _lettre_gen else ""),
    )

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

    # ── BULLETIN ANNUEL : détail du calcul + résultat de l'examen national ──
    if periodes_annuelles:
        y -= 0.6 * cm
        pdf.setFont(tmpl["police_titre"], 8)
        pdf.setFillColorRGB(*cp)
        pdf.drawString(1.8 * cm, y, "Moyennes des périodes")
        y -= 0.4 * cm
        pdf.setFont(tmpl["police_corps"], 8)
        pdf.setFillColorRGB(0.2, 0.2, 0.2)
        detail = "   |   ".join(f"{lib} : {val:.2f}" for lib, val in periodes_annuelles)
        pdf.drawString(1.8 * cm, y, detail)
        y -= 0.35 * cm
        pdf.setFont(tmpl["police_corps"], 7)
        pdf.setFillColorRGB(0.45, 0.45, 0.45)
        pdf.drawString(
            1.8 * cm, y,
            "Moyenne annuelle = somme des moyennes de période ÷ %d période(s)"
            % len(periodes_annuelles),
        )
        pdf.setFillColorRGB(0, 0, 0)

    if resultat_officiel is not None:
        y -= 0.55 * cm
        libelle_examen = resultat_officiel.examen_national or "Examen national"
        admis = resultat_officiel.resultat == "ADMIS"
        pdf.setFont(tmpl["police_titre"], 9)
        pdf.setFillColorRGB(*((0.05, 0.45, 0.3) if admis else (0.65, 0.12, 0.12)))
        pdf.drawString(
            1.8 * cm, y,
            "%s : %s" % (libelle_examen, "ADMIS" if admis else "NON ADMIS"),
        )
        pdf.setFont(tmpl["police_corps"], 7)
        pdf.setFillColorRGB(0.45, 0.45, 0.45)
        pdf.drawRightString(
            marge_droite, y,
            "Résultat officiel du Ministère — seul décisif pour le passage",
        )
        pdf.setFillColorRGB(0, 0, 0)

    # ── STATISTIQUES DE CLASSE (meilleure / plus faible moyenne) ──
    if meilleure_moyenne_classe is not None:
        y -= 0.5 * cm
        pdf.setFont(tmpl["police_corps"], 8)
        pdf.setFillColorRGB(0.3, 0.3, 0.3)
        pdf.drawString(1.8 * cm, y, "Meilleure moyenne de la classe : %.2f/%g" % (meilleure_moyenne_classe, echelle_lettres))
        pdf.drawRightString(marge_droite, y, "Plus faible moyenne de la classe : %.2f/%g" % (plus_faible_moyenne_classe, echelle_lettres))
        pdf.setFillColorRGB(0, 0, 0)

    # ── GRAPHIQUE DES PERFORMANCES PAR MATIÈRE (élève vs moyenne de classe) ──
    if lignes and y > 5 * cm:
        y -= 0.6 * cm
        pdf.setFont(tmpl["police_titre"], 8)
        pdf.setFillColorRGB(*cp)
        pdf.drawString(1.8 * cm, y, "Performances par matière (vs moyenne de classe)")
        y -= 0.5 * cm  # respiration sous le titre
        n_lignes = len(lignes)
        chart_label_w = 3.2 * cm
        chart_bar_max_w = tab_w - chart_label_w - 1.2 * cm
        bar_h = 0.14 * cm
        # Hauteur de ligne UNIFORME et aérée, bornée pour laisser la place à la
        # note + aux signatures en bas (donc jamais de débordement/chevauchement).
        row_h = max(0.30 * cm, min(0.44 * cm, (y - 4.4 * cm) / max(n_lignes, 1)))
        for ligne, matiere in lignes:
            moy_e = float(ligne.moyenne_matiere) if ligne.moyenne_matiere is not None else 0
            moy_c = float(ligne.moyenne_classe) if ligne.moyenne_classe is not None else 0
            # Barre CENTRÉE verticalement dans sa ligne, libellé aligné dessus.
            bar_y = (y - row_h) + (row_h - bar_h) / 2
            lbl = (matiere.libelle if matiere else "?")[:18]
            pdf.setFont(tmpl["police_corps"], 6)
            pdf.setFillColorRGB(0.2, 0.2, 0.2)
            pdf.drawString(marge_gauche, bar_y + bar_h / 2 - 0.055 * cm, lbl)
            bar_x0 = marge_gauche + chart_label_w
            bar_w_e = chart_bar_max_w * min(moy_e, echelle_lettres) / echelle_lettres
            bar_w_c = chart_bar_max_w * min(moy_c, echelle_lettres) / echelle_lettres
            pdf.setFillColorRGB(0.85, 0.85, 0.9)
            pdf.rect(bar_x0, bar_y, chart_bar_max_w, bar_h, fill=1, stroke=0)
            pdf.setFillColorRGB(*cp)
            pdf.rect(bar_x0, bar_y, bar_w_e, bar_h, fill=1, stroke=0)
            pdf.setStrokeColorRGB(0.9, 0.3, 0.3)
            pdf.setLineWidth(1)
            pdf.line(bar_x0 + bar_w_c, bar_y - 0.035 * cm, bar_x0 + bar_w_c, bar_y + bar_h + 0.035 * cm)
            y -= row_h
        y -= 0.22 * cm  # écart clair AVANT la légende (fini le chevauchement)
        pdf.setFont(tmpl["police_corps"], 5.5)
        pdf.setFillColorRGB(0.5, 0.5, 0.5)
        pdf.drawString(marge_gauche + chart_label_w, y, "▬ Barre = moyenne élève   |   Trait rouge = moyenne de classe")
        y -= 0.35 * cm

    # ── NOTE EXPLICATIVE DU CALCUL ──
    # Sans ça, rien n'indiquait comment la moyenne était obtenue — texte
    # aligné dynamiquement sur la pondération réellement configurée
    # (Paramètres > Notation), pas des valeurs figées dans le code.
    if types_ordonnes:
        _coefs_types = get_types_evaluation_coefficients(
            db, classe.etablissement_id, get_cycle_key(classe.classe_id, db)
        )
        _termes = " + ".join(
            f"{lbl}×{_coefs_types.get(tid, 1):g}" for tid, lbl in types_ordonnes
        )
        _somme = " + ".join(f"{_coefs_types.get(tid, 1):g}" for tid, _lbl in types_ordonnes)
        formule_matiere = (
            f"Moyenne de matière = ({_termes}) ÷ ({_somme}) — type sans note exclu du calcul."
        )
    else:
        formule_matiere = "Moyenne de matière = moyenne pondérée des types d'évaluation configurés."
    y -= 0.5 * cm
    pdf.setFont("Helvetica-Oblique", 6.5)
    pdf.setFillColorRGB(0.4, 0.4, 0.4)
    pdf.drawString(1.8 * cm, y, formule_matiere)
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

    # `titre_periode` et non `titre_trimestre` : le bulletin peut aussi être
    # annuel, auquel cas il n'y a pas de trimestre à nommer.
    nom_fichier = f"bulletin_{eleve.nom}_{eleve.prenom}_{titre_periode}.pdf".replace(" ", "_")
    return buffer.getvalue(), nom_fichier


@router.get("/bulletins/{bulletin_id}/pdf")
def generer_bulletin_pdf(bulletin_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Génère le bulletin scolaire au format PDF.

    Comportement observable inchangé, hormis l'isolation ajoutée au Lot 9 :
    le bulletin doit appartenir à l'établissement appelant (avant, tout
    bulletin_id deviné produisait le PDF complet — notes, moyennes, rang —
    d'un élève de n'importe quelle école).
    """
    import io
    from fastapi.responses import StreamingResponse

    _bulletin_ou_404(db, bulletin_id, etablissement_id)
    pdf_bytes, nom_fichier = _build_bulletin_pdf_bytes(bulletin_id, db)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={nom_fichier}"}
    )


@router.post("/bulletins/{bulletin_id}/pdf-async")
def generer_bulletin_pdf_async(bulletin_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Version asynchrone (Étape F) — met la génération en file au lieu de
    bloquer la requête HTTP. Ne remplace PAS l'endpoint synchrone
    ci-dessus (toujours utile pour un seul bulletin ponctuel) ; utile
    surtout en préparation d'une génération en masse future.

    ISOLATION (Lot 9) : le bulletin doit appartenir à l'établissement
    appelant. Ce contrôle est indispensable et ne peut PAS être délégué au
    worker : celui-ci reçoit l'`etablissement_id` réel de la classe du
    bulletin, donc sa propre vérification passait toujours — un bulletin_id
    d'une autre école aurait bien été généré. Le contrôle du worker reste
    une défense en profondeur contre un payload forgé, pas ce contrôle-ci.
    """
    from app.core.task_queue import get_queue
    from app.tasks.bulletin_tasks import generate_bulletin_pdf_task
    from rq.job import Retry

    bulletin = _bulletin_ou_404(db, bulletin_id, etablissement_id)
    inscription = db.query(Inscription).filter(
        Inscription.inscription_id == bulletin.inscription_id
    ).first()
    classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first() if inscription else None
    if not classe:
        raise HTTPException(404, "Classe introuvable pour ce bulletin")

    try:
        # Limite connue, trouvée en validant réellement F (pas avant) : ce
        # Retry(max=3) s'applique à TOUTE exception, y compris le rejet
        # PermissionError (isolation multi-école, bulletin_tasks.py) qui ne
        # réussira jamais en retentant — la tâche mettra donc ~130s (10+30+90)
        # à atteindre FAILED au lieu d'échouer immédiatement. Impact réel nul
        # aujourd'hui : `classe.etablissement_id` ci-dessus est toujours la
        # valeur réelle et fraîchement lue en base au moment de l'enqueue (ce
        # seul appelant ne peut donc pas déclencher ce rejet en pratique — la
        # vérification dans le worker est une défense en profondeur, pas un
        # chemin normal). Non corrigé maintenant : nécessiterait un exception
        # handler RQ dédié aux erreurs métier définitives, hors du périmètre
        # minimal de cette validation — à construire si un futur appelant de
        # generate_bulletin_pdf_task peut réellement déclencher ce cas.
        job = get_queue().enqueue(
            generate_bulletin_pdf_task,
            bulletin_id,
            classe.etablissement_id,
            retry=Retry(max=3, interval=[10, 30, 90]),
            job_timeout=120,
            result_ttl=86400,
            failure_ttl=86400,
            # Permet à GET /api/tasks/{id} de vérifier que le demandeur du
            # statut relève bien de l'établissement de la tâche (Lot 11).
            meta={"etablissement_id": classe.etablissement_id},
        )
    except Exception as exc:
        # Redis indisponible au moment de la mise en file : ne JAMAIS faire
        # semblant que la tâche a été acceptée (contrairement au comportement
        # volontairement permissif de app/core/cache.py, adapté à un cache
        # mais pas à une file — voir le plan Étape F).
        raise HTTPException(503, f"File de tâches indisponible : {exc}")

    return {"task_id": job.id, "status": "PENDING"}
