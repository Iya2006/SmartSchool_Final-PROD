"""
SMARTSCHOOL — Moteur de notation (source unique de vérité).

Remplace l'ancien système figé en dur (3 catégories Écrit/Oral/Composition,
poids 1/1/2, "seule la meilleure note par catégorie compte") par un calcul
entièrement piloté par la configuration de chaque école.

Règle de calcul, deux étages de coefficients, moyenne pondérée classique
à chaque étage :

  1. Moyenne d'une matière = Σ(moyenne_du_type × coef_du_type) / Σ(coef_du_type)
     où moyenne_du_type = moyenne simple des notes de ce type d'évaluation.
  2. Moyenne générale     = Σ(moyenne_matière × coef_matière) / Σ(coef_matière)

Le coefficient d'un type d'évaluation est réglable PAR CYCLE (primaire /
collège / lycée) : au primaire tout peut valoir 1 alors qu'au collège la
composition pèse plus lourd. Cf. `get_types_evaluation_coefficients`.

Ce module ne contient AUCUNE règle métier codée en dur : tout vient de
ss_types_evaluation, ss_classe_matieres et ss_parametres.

Contrainte de performance : toute fonction qui traite plusieurs élèves reçoit
des données préchargées en lot. Aucune requête ne doit être émise dans une
boucle sur les élèves ou les évaluations (les pages Centralisation/Bulletins
sont devenues inutilisables par le passé à cause de ça).
"""
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.academique import (
    AnneeScolaire, Bulletin, BulletinLigne, Classe, ClasseMatiere, Cycle,
    Eleve, Evaluation, Inscription, Matiere, Niveau, Note,
    ParametreEtablissement, PeriodeEpreuve, Trimestre, TypeEvaluation,
)

# Codes de cycle (ss_cycles.code) -> clé utilisée par le frontend et ss_parametres
_CYCLE_CODE_TO_KEY = {"PRM": "primaire", "CLG": "college", "LYC": "lycee"}

# Barème par défaut quand rien n'est configuré nulle part
BAREME_DEFAUT = 20.0

# Règle d'agrégation des épreuves dans la moyenne d'une matière.
# PAR_TYPE : les évaluations d'un même type sont moyennées entre elles, puis
#            le type est pondéré une fois — leur nombre ne change pas son poids.
# PAR_EPREUVE : chaque épreuve pèse son coefficient individuellement.
# Le défaut reproduit le comportement historique : changer ce réglage ne doit
# jamais être un effet de bord d'une mise à jour.
MODE_PAR_TYPE = "PAR_TYPE"
MODE_PAR_EPREUVE = "PAR_EPREUVE"
MODE_AGREGATION_DEFAUT = MODE_PAR_TYPE

# Seuils de mentions par défaut, alignés sur les valeurs par défaut du frontend
# (frontend/src/app/parametres/notation/page.tsx — state `mentions`).
_SEUILS_MENTIONS_DEFAUT = {
    "primaire": {"tb": 9.0, "b": 7.0, "ab": 6.0, "p": 5.0},
    "college": {"tb": 16.0, "b": 14.0, "ab": 12.0, "p": 10.0},
    "lycee": {"tb": 16.0, "b": 14.0, "ab": 12.0, "p": 10.0},
}


_MOIS_FR = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]
_UN_JOUR = timedelta(days=1)


# ════════════════════════════════════════════════════════════
# Calendrier : quel mois appartient à quelle période
# ════════════════════════════════════════════════════════════

def calendrier_mois(db: Session, annee_id: int) -> List[dict]:
    """Mois de l'année scolaire, avec la période à laquelle chacun appartient.

    Une évaluation « du mois de janvier » doit tomber dans la période qui
    contient janvier, pas dans celle que l'utilisateur a laissée sélectionnée à
    l'écran. Le rattachement se déduit des dates des périodes (`ss_trimestres`),
    jamais d'une table de correspondance figée : chaque école découpe son année
    comme elle veut, et le nombre de périodes est libre.

    Un mois à cheval sur deux périodes est rattaché à celle qui en couvre le
    plus de jours. Les mois de vacances, couverts par aucune période, sont
    renvoyés avec `trimestre_id = None` : ils restent visibles (l'école voit
    pourquoi ils sont indisponibles) mais ne peuvent pas accueillir d'épreuve.
    """
    annee = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_id).first()
    if not annee:
        return []
    periodes = db.query(Trimestre).filter(
        Trimestre.annee_id == annee_id
    ).order_by(Trimestre.numero).all()

    mois = []
    annee_civile, numero_mois = annee.date_debut.year, annee.date_debut.month
    while date(annee_civile, numero_mois, 1) <= annee.date_fin:
        debut = date(annee_civile, numero_mois, 1)
        fin = (date(annee_civile + (numero_mois == 12), (numero_mois % 12) + 1, 1)
               - _UN_JOUR)

        # Période retenue = celle qui couvre le plus de jours de ce mois.
        meilleure, meilleur_recouvrement = None, 0
        for p in periodes:
            jours = (min(fin, p.date_fin) - max(debut, p.date_debut)).days + 1
            if jours > meilleur_recouvrement:
                meilleure, meilleur_recouvrement = p, jours

        mois.append({
            "cle": "%04d-%02d" % (annee_civile, numero_mois),
            "libelle": "%s %d" % (_MOIS_FR[numero_mois - 1], annee_civile),
            "date_debut": debut.isoformat(),
            "date_fin": fin.isoformat(),
            "trimestre_id": meilleure.trimestre_id if meilleure else None,
            "trimestre": meilleure.libelle if meilleure else None,
            "trimestre_statut": meilleure.statut if meilleure else None,
            "disponible": bool(meilleure) and meilleure.statut != "CLOTURE",
        })
        annee_civile, numero_mois = (
            (annee_civile + 1, 1) if numero_mois == 12 else (annee_civile, numero_mois + 1)
        )
    return mois


def periode_pour_date(db: Session, annee_id: int, jour: date) -> Optional[Trimestre]:
    """Période contenant cette date, ou None si elle tombe hors de toute période."""
    return db.query(Trimestre).filter(
        Trimestre.annee_id == annee_id,
        Trimestre.date_debut <= jour,
        Trimestre.date_fin >= jour,
    ).order_by(Trimestre.numero).first()


def verifier_date_dans_periode(db: Session, trimestre: Trimestre, jour: date) -> None:
    """Refuse une épreuve datée hors de la période à laquelle on la rattache.

    Sans ce contrôle, une « évaluation du mois de janvier » peut être
    enregistrée avec la date du jour et rattachée au 1er trimestre : le libellé,
    la date et la période racontent alors trois histoires différentes, et le
    bulletin de période agrège des épreuves qui n'en font pas partie.
    """
    if not trimestre or not jour:
        return
    if trimestre.date_debut <= jour <= trimestre.date_fin:
        return
    reelle = periode_pour_date(db, trimestre.annee_id, jour)
    indice = (
        " Cette date appartient à %s." % reelle.libelle if reelle
        else " Cette date ne tombe dans aucune période de l'année scolaire."
    )
    raise ValueError(
        "Date du %s hors de %s (%s → %s).%s" % (
            jour.strftime("%d/%m/%Y"), trimestre.libelle,
            trimestre.date_debut.strftime("%d/%m/%Y"),
            trimestre.date_fin.strftime("%d/%m/%Y"), indice,
        )
    )


# ════════════════════════════════════════════════════════════
# Contexte : cycle, établissement
# ════════════════════════════════════════════════════════════

def get_cycle_key(classe_id: int, db: Session) -> str:
    """Clé de cycle ('primaire'/'college'/'lycee') d'une classe, via Classe → Niveau → Cycle."""
    row = (
        db.query(Cycle.code)
        .join(Niveau, Niveau.cycle_id == Cycle.cycle_id)
        .join(Classe, Classe.niveau_id == Niveau.niveau_id)
        .filter(Classe.classe_id == classe_id)
        .first()
    )
    return _CYCLE_CODE_TO_KEY.get(row[0] if row else None, "college")


def get_etablissement_id(db: Session, classe_id: int) -> int:
    """Établissement d'une classe.

    Toujours dérivé de la donnée réelle : le moteur ne code jamais en dur
    `etablissement_id=1`, contrairement au reste de l'application (dette
    existante, cf. MIGRATION_NOTES.md) — sans quoi une seconde école
    hériterait silencieusement des réglages de la première.
    """
    row = db.query(Classe.etablissement_id).filter(Classe.classe_id == classe_id).first()
    return row[0] if row else 1


# ════════════════════════════════════════════════════════════
# Règle d'agrégation des épreuves (par cycle)
# ════════════════════════════════════════════════════════════

def get_mode_agregation(
    db: Session, etablissement_id: int, cycle_key: Optional[str] = None
) -> str:
    """Règle choisie par l'école pour agréger les épreuves d'une matière.

    Paramètre `notation.mode_agregation.{cycle}` (catégorie NOTATION), valeurs
    `PAR_TYPE` ou `PAR_EPREUVE`. Réglable par cycle : le primaire, qui fait
    souvent une seule évaluation par période, n'a pas les mêmes habitudes que
    le lycée qui en enchaîne plusieurs.

    Une valeur inconnue en base retombe sur le défaut plutôt que de faire
    échouer un calcul de bulletin.
    """
    if not cycle_key:
        return MODE_AGREGATION_DEFAUT
    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "NOTATION",
        ParametreEtablissement.cle == f"notation.mode_agregation.{cycle_key}",
    ).first()
    if param and param.valeur in (MODE_PAR_TYPE, MODE_PAR_EPREUVE):
        return param.valeur
    return MODE_AGREGATION_DEFAUT


# ════════════════════════════════════════════════════════════
# Coefficients des types d'évaluation (par cycle)
# ════════════════════════════════════════════════════════════

def get_types_evaluation_coefficients(
    db: Session, etablissement_id: int, cycle_key: Optional[str] = None
) -> Dict[int, float]:
    """{type_eval_id: coefficient effectif} en deux requêtes, jamais en boucle.

    Le coefficient de référence vit sur ss_types_evaluation.coefficient. Une
    école peut le surcharger par cycle via le paramètre
    `notation.coef_type.{cycle}.{code}` (catégorie NOTATION) — c'est ce qui
    permet à la composition de peser 2 au collège et 1 au primaire.
    """
    types = db.query(TypeEvaluation).all()
    coefs = {t.type_eval_id: float(t.coefficient or 1) for t in types}

    if not cycle_key:
        return coefs

    prefix = f"notation.coef_type.{cycle_key}."
    surcharges = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "NOTATION",
        ParametreEtablissement.cle.like(f"{prefix}%"),
    ).all()
    if not surcharges:
        return coefs

    par_code = {t.code: t.type_eval_id for t in types}
    for p in surcharges:
        code = p.cle[len(prefix):]
        type_eval_id = par_code.get(code)
        if type_eval_id is None:
            continue
        try:
            coefs[type_eval_id] = float(p.valeur)
        except (TypeError, ValueError):
            continue
    return coefs


def coefficient_effectif(evaluation: Evaluation, type_coefs: Dict[int, float]) -> float:
    """Coefficient d'une évaluation : surcharge ponctuelle si présente, sinon celui de son type.

    Note : `est_coefficientee` n'intervient PAS ici. Ce drapeau porte sur les
    coefficients des MATIÈRES (Maths 4, Dessin 1...), appliqués un étage plus
    haut dans la moyenne générale — voir `coefficient_matiere_effectif`.
    """
    if evaluation.coefficient_override is not None:
        return float(evaluation.coefficient_override)
    return type_coefs.get(evaluation.type_eval_id, 1.0)


def coefficient_matiere_effectif(
    coefficient_configure: float, evaluations_matiere: List[Evaluation]
) -> float:
    """Coefficient d'une matière dans la moyenne générale.

    Répond à la case "Coefficienter cette évaluation ?" posée à la création :
    cochée, les coefficients définis pour la classe s'appliquent ; décochée,
    toutes les matières comptent pour 1 — sans jamais modifier les coefficients
    de référence, qui restent valables pour les autres évaluations.

    Sur un calcul qui mélange des évaluations coefficientées et non
    coefficientées, les coefficients configurés l'emportent : le "tout à 1" ne
    vaut que pour un ensemble entièrement non coefficienté (typiquement une
    composition consultée seule).
    """
    if evaluations_matiere and all(
        getattr(ev, "est_coefficientee", "O") == "N" for ev in evaluations_matiere
    ):
        return 1.0
    return coefficient_configure


# ════════════════════════════════════════════════════════════
# Barème
# ════════════════════════════════════════════════════════════

def get_bareme_defaut_cycle(db: Session, etablissement_id: int, cycle_key: str) -> float:
    """Barème par défaut de l'école pour un cycle (`notation.bareme.{cycle}`)."""
    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "NOTATION",
        ParametreEtablissement.cle == f"bareme.{cycle_key}",
    ).first()
    if param and param.valeur:
        try:
            valeur = float(param.valeur)
            if valeur > 0:
                return valeur
        except (TypeError, ValueError):
            pass
    return BAREME_DEFAUT


def get_bareme_effectif(
    db: Session, classe_id: int, matiere_id: int,
    cycle_key: Optional[str] = None, etablissement_id: Optional[int] = None,
) -> float:
    """Barème d'une nouvelle évaluation, du plus spécifique au plus général :
    ClasseMatiere.note_sur → Matiere.note_sur → notation.bareme.{cycle} → 20.
    """
    row = db.query(ClasseMatiere.note_sur).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.matiere_id == matiere_id,
    ).first()
    if row and row[0]:
        return float(row[0])

    row = db.query(Matiere.note_sur).filter(Matiere.matiere_id == matiere_id).first()
    if row and row[0]:
        return float(row[0])

    if etablissement_id is None:
        etablissement_id = get_etablissement_id(db, classe_id)
    if cycle_key is None:
        cycle_key = get_cycle_key(classe_id, db)
    return get_bareme_defaut_cycle(db, etablissement_id, cycle_key)


def normaliser_note(valeur: float, note_sur: float, echelle_cible: float = BAREME_DEFAUT) -> float:
    """Ramène une note sur l'échelle cible, quel que soit le barème d'origine.

    Généralise l'ancien code qui ne savait traiter que /20 et /10 : une école
    en /100 obtenait des moyennes fausses.
    """
    if not note_sur or note_sur <= 0:
        return valeur
    if note_sur == echelle_cible:
        return valeur
    return valeur * echelle_cible / note_sur


def valider_note(valeur, note_sur, contexte: str = "") -> Optional[float]:
    """Vérifie qu'une note tient dans son barème, avant écriture en base.

    Sans ce garde-fou, une saisie sur un mauvais barème passe silencieusement
    et ne se voit qu'au bulletin : une note de 20 enregistrée sur une épreuve
    notée /1 remonte à 400/20 après normalisation, et fausse tout le
    classement de la classe sans qu'aucune erreur ne soit levée.

    Retourne la note en float, ou None si elle est absente (élève absent).
    """
    if valeur is None or valeur == "":
        return None
    try:
        valeur = float(valeur)
    except (TypeError, ValueError):
        raise ValueError(f"Note invalide{contexte}: « {valeur} » n'est pas un nombre.")
    if valeur < 0:
        raise ValueError(f"Note invalide{contexte}: une note ne peut pas être négative.")
    maxi = float(note_sur) if note_sur else BAREME_DEFAUT
    if valeur > maxi:
        raise ValueError(
            f"Note invalide{contexte}: {valeur:g} dépasse le barème de l'épreuve "
            f"(/{maxi:g}). Corrigez la note, ou le barème de l'évaluation."
        )
    return valeur


# ════════════════════════════════════════════════════════════
# Mentions et appréciations
# ════════════════════════════════════════════════════════════

def get_notation_seuils(db=None, cycle: str = "college", etablissement_id: int = 1) -> dict:
    """Seuils de mentions par cycle (`notation.mention.{cycle}.{tb|b|ab|p}`)."""
    seuils = dict(_SEUILS_MENTIONS_DEFAUT.get(cycle, _SEUILS_MENTIONS_DEFAUT["college"]))
    if db is not None:
        try:
            prefix = f"notation.mention.{cycle}."
            params = db.query(ParametreEtablissement).filter(
                ParametreEtablissement.etablissement_id == etablissement_id,
                ParametreEtablissement.categorie == "NOTATION",
                ParametreEtablissement.cle.like(f"{prefix}%"),
            ).all()
            for p in params:
                key = p.cle.replace(prefix, "")
                if key in seuils:
                    seuils[key] = float(p.valeur)
        except Exception:
            pass
    return seuils


def get_mention(moyenne: float, db=None, cycle: str = "college", etablissement_id: int = 1) -> str:
    s = get_notation_seuils(db, cycle, etablissement_id)
    if moyenne >= s["tb"]:
        return "TRÈS BIEN"
    if moyenne >= s["b"]:
        return "BIEN"
    if moyenne >= s["ab"]:
        return "ASSEZ BIEN"
    if moyenne >= s["p"]:
        return "PASSABLE"
    return "INSUFFISANT"


def get_appreciation(moyenne: float, note_sur: float = BAREME_DEFAUT) -> str:
    """Appréciation textuelle, proportionnelle au barème (fonctionne pour /10, /20, /100)."""
    if not note_sur or note_sur <= 0:
        note_sur = BAREME_DEFAUT
    ratio = moyenne / note_sur
    if ratio >= 0.8:
        return "Très Bien"
    if ratio >= 0.7:
        return "Bien"
    if ratio >= 0.6:
        return "Assez Bien"
    if ratio >= 0.5:
        return "Passable"
    return "Insuffisant"


# ════════════════════════════════════════════════════════════
# Préchargement (anti-N+1)
# ════════════════════════════════════════════════════════════

def precharger_notes(db: Session, evaluation_ids: List[int]) -> Dict[Tuple[int, int], Note]:
    """Toutes les notes d'un lot d'évaluations en UNE requête.
    À appeler avant toute boucle sur les élèves."""
    if not evaluation_ids:
        return {}
    rows = db.query(Note).filter(Note.evaluation_id.in_(evaluation_ids)).all()
    return {(n.evaluation_id, n.inscription_id): n for n in rows}


# ════════════════════════════════════════════════════════════
# Moyennes
# ════════════════════════════════════════════════════════════

def moyenne_matiere_eleve(
    evaluations: List[Evaluation],
    inscription_id: int,
    notes_lookup: Dict[Tuple[int, int], Note],
    type_coefs: Dict[int, float],
    echelle_cible: float = BAREME_DEFAUT,
    mode_agregation: str = MODE_AGREGATION_DEFAUT,
) -> Tuple[Optional[float], int]:
    """Moyenne d'un élève dans une matière, sur un ensemble d'évaluations.

    Deux règles d'agrégation coexistent dans les écoles guinéennes, et elles
    ne donnent pas le même résultat dès qu'une période compte plusieurs
    évaluations du même type. Avec deux évaluations (coef. 1) et une
    composition (coef. 2) :

      MODE_PAR_TYPE     (moyenne des 2 évaluations × 1 + composition × 2) ÷ 3
      MODE_PAR_EPREUVE  (éval1 × 1 + éval2 × 1 + composition × 2) ÷ 4

    En « par type », le nombre d'évaluations ne change pas leur poids face à
    la composition ; en « par épreuve », si. C'est à l'école de trancher —
    voir `get_mode_agregation`.

    Les absences et les notes non saisies sont ignorées (elles ne comptent pas
    comme des zéros), et un type absent ne pèse rien : pas de division par un
    coefficient fictif.

    Retourne (moyenne arrondie ou None, nombre de notes prises en compte).
    """
    # {type_eval_id: [(note_normalisée, coefficient), ...]}
    par_type: Dict[int, List[Tuple[float, float]]] = {}
    nb_notes = 0

    for ev in evaluations:
        note = notes_lookup.get((ev.evaluation_id, inscription_id))
        if not note or note.valeur is None or note.est_absent == "O":
            continue
        nb_notes += 1
        valeur = normaliser_note(float(note.valeur), float(ev.note_sur or echelle_cible), echelle_cible)
        par_type.setdefault(ev.type_eval_id, []).append(
            (valeur, coefficient_effectif(ev, type_coefs))
        )

    if not par_type:
        return None, 0

    total_points = 0.0
    total_coef = 0.0

    if mode_agregation == MODE_PAR_EPREUVE:
        # Chaque épreuve pèse son propre coefficient : deux évaluations
        # comptent donc deux fois plus qu'une seule face à la composition.
        for valeurs in par_type.values():
            for valeur, coef in valeurs:
                total_points += valeur * coef
                total_coef += coef
    else:
        for valeurs in par_type.values():
            # Un type compte pour UNE note dans la moyenne, quel que soit le
            # nombre d'évaluations de ce type : ses notes sont d'abord moyennées
            # entre elles, puis le résultat est pondéré une seule fois par le
            # coefficient du type. Le coefficient est identique pour toutes les
            # évaluations d'un même type, sauf surcharge ponctuelle sur l'une
            # d'elles — d'où la moyenne des coefficients plutôt qu'une valeur figée.
            coef_type = sum(c for _, c in valeurs) / len(valeurs)
            moyenne_type = sum(v for v, _ in valeurs) / len(valeurs)
            total_points += moyenne_type * coef_type
            total_coef += coef_type

    if total_coef <= 0:
        return None, nb_notes
    return round(total_points / total_coef, 2), nb_notes


def detail_par_type_matiere(
    db: Session, classe_id: int, matiere_id: int, trimestre_id: int, inscription_id: int,
    echelle_cible: float = BAREME_DEFAUT,
) -> List[dict]:
    """Détail des notes par type d'évaluation pour une matière d'un élève.

    Remplace l'ancien détail figé à 3 colonnes Écrit/Oral/Composition : la
    liste retournée suit les types réellement utilisés par l'école.
    Utilisé par le bulletin PDF.
    """
    evals = db.query(Evaluation).filter(
        Evaluation.classe_id == classe_id,
        Evaluation.matiere_id == matiere_id,
        Evaluation.trimestre_id == trimestre_id,
        Evaluation.statut == "CENTRALISEE",
    ).all()
    if not evals:
        return []

    etablissement_id = get_etablissement_id(db, classe_id)
    cycle_key = get_cycle_key(classe_id, db)
    type_coefs = get_types_evaluation_coefficients(db, etablissement_id, cycle_key)
    types = {t.type_eval_id: t for t in db.query(TypeEvaluation).all()}
    notes_lookup = precharger_notes(db, [ev.evaluation_id for ev in evals])

    par_type: Dict[int, List[float]] = {}
    for ev in evals:
        note = notes_lookup.get((ev.evaluation_id, inscription_id))
        if not note or note.valeur is None or note.est_absent == "O":
            continue
        par_type.setdefault(ev.type_eval_id, []).append(
            normaliser_note(float(note.valeur), float(ev.note_sur or echelle_cible), echelle_cible)
        )

    detail = []
    for type_eval_id, valeurs in par_type.items():
        t = types.get(type_eval_id)
        detail.append({
            "type_eval_id": type_eval_id,
            "code": t.code if t else "?",
            "libelle": t.libelle if t else "?",
            "coefficient": type_coefs.get(type_eval_id, 1.0),
            "moyenne": round(sum(valeurs) / len(valeurs), 2),
        })
    detail.sort(key=lambda d: d["libelle"])
    return detail


def detail_par_type_classe(
    db: Session, classe_id: int, trimestre_id: Optional[int], inscription_id: int,
    echelle_cible: float = BAREME_DEFAUT,
) -> Dict[int, List[dict]]:
    """Comme `detail_par_type_matiere`, mais pour TOUTES les matières d'un coup.

    Version en lot destinée au bulletin PDF, qui affichait auparavant ce détail
    en interrogeant la base matière par matière (une requête d'évaluations + une
    requête de notes par ligne du bulletin).

    `trimestre_id=None` (bulletin annuel) couvre toutes les périodes de l'année.
    Retourne {matiere_id: [{type_eval_id, code, libelle, coefficient, moyenne}]}.
    """
    query = db.query(Evaluation).filter(
        Evaluation.classe_id == classe_id,
        Evaluation.statut == "CENTRALISEE",
    )
    if trimestre_id is not None:
        query = query.filter(Evaluation.trimestre_id == trimestre_id)
    evals = query.all()
    if not evals:
        return {}

    etablissement_id = get_etablissement_id(db, classe_id)
    cycle_key = get_cycle_key(classe_id, db)
    type_coefs = get_types_evaluation_coefficients(db, etablissement_id, cycle_key)
    types = {t.type_eval_id: t for t in db.query(TypeEvaluation).all()}
    notes_lookup = precharger_notes(db, [ev.evaluation_id for ev in evals])

    # {matiere_id: {type_eval_id: [notes normalisées]}}
    brut: Dict[int, Dict[int, List[float]]] = {}
    for ev in evals:
        note = notes_lookup.get((ev.evaluation_id, inscription_id))
        if not note or note.valeur is None or note.est_absent == "O":
            continue
        brut.setdefault(ev.matiere_id, {}).setdefault(ev.type_eval_id, []).append(
            normaliser_note(float(note.valeur), float(ev.note_sur or echelle_cible), echelle_cible)
        )

    resultat: Dict[int, List[dict]] = {}
    for matiere_id, par_type in brut.items():
        lignes = []
        for type_eval_id, valeurs in par_type.items():
            t = types.get(type_eval_id)
            lignes.append({
                "type_eval_id": type_eval_id,
                "code": t.code if t else "?",
                "libelle": t.libelle if t else "?",
                "coefficient": type_coefs.get(type_eval_id, 1.0),
                "moyenne": round(sum(valeurs) / len(valeurs), 2),
            })
        lignes.sort(key=lambda d: d["libelle"])
        resultat[matiere_id] = lignes
    return resultat


# ════════════════════════════════════════════════════════════
# Calcul de période (trimestre / semestre)
# ════════════════════════════════════════════════════════════

def epreuves_retenues_periode(
    db: Session, classe_id: int, trimestre_id: int
) -> Optional[List[int]]:
    """Épreuves que l'école a retenues pour le résultat officiel d'une période.

    Retourne None quand l'école n'a rien choisi : le calcul prend alors toutes
    les évaluations centralisées de la période, comportement historique. Une
    liste vide n'est jamais renvoyée — si l'école a tout décoché, il n'y a plus
    de sélection enregistrée et on repasse au comportement par défaut.
    """
    lignes = db.query(PeriodeEpreuve.evaluation_id).filter(
        PeriodeEpreuve.classe_id == classe_id,
        PeriodeEpreuve.trimestre_id == trimestre_id,
    ).all()
    return [row[0] for row in lignes] or None


def calculer_resultats_periode(
    db: Session,
    classe_id: int,
    trimestre_id: int,
    *,
    evaluation_ids: Optional[List[int]] = None,
    session_ids: Optional[List[int]] = None,
    statuts_inclus: Optional[List[str]] = None,
    persist: bool = False,
) -> dict:
    """Moteur unique des résultats d'une période.

    `persist=False` : simple aperçu (suivi mensuel par exemple), n'écrit rien.
    `persist=True`  : alimente les bulletins de la période (Bulletin +
                      BulletinLigne), avec rangs et statistiques de classe.

    `evaluation_ids` / `session_ids` restreignent le calcul à une sélection
    d'évaluations — c'est ce qui permet à l'école de sortir un classement
    intermédiaire sur les seules évaluations qu'elle choisit, sans toucher aux
    résultats officiels de la période.

    Sans sélection explicite, on applique celle que l'école a enregistrée pour
    la période (`ss_periode_epreuves`) ; sans enregistrement non plus, toutes
    les évaluations centralisées comptent.
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise ValueError("Classe non trouvée")

    etablissement_id = classe.etablissement_id
    cycle_key = get_cycle_key(classe_id, db)
    echelle = get_bareme_defaut_cycle(db, etablissement_id, cycle_key)
    if statuts_inclus is None:
        statuts_inclus = ["CENTRALISEE"]

    cms = db.query(ClasseMatiere).filter(
        ClasseMatiere.classe_id == classe_id,
        ClasseMatiere.est_active == "O",
    ).all()
    matieres = {
        m.matiere_id: m
        for m in db.query(Matiere).filter(
            Matiere.matiere_id.in_([cm.matiere_id for cm in cms])
        ).all()
    } if cms else {}

    matieres_info = {}
    for cm in cms:
        mat = matieres.get(cm.matiere_id)
        if not mat:
            continue
        matieres_info[mat.matiere_id] = {
            "libelle": mat.libelle,
            "coefficient": float(cm.coefficient) if cm.coefficient else float(mat.coefficient_defaut or 1),
        }

    # Sélection explicite de l'appelant (classement de suivi sur telle épreuve)
    # ou, à défaut, sélection enregistrée par l'école pour cette période.
    selection_ecole = None
    if not evaluation_ids and not session_ids:
        selection_ecole = epreuves_retenues_periode(db, classe_id, trimestre_id)

    query = db.query(Evaluation).filter(
        Evaluation.classe_id == classe_id,
        Evaluation.trimestre_id == trimestre_id,
        Evaluation.statut.in_(statuts_inclus),
    )
    if evaluation_ids:
        query = query.filter(Evaluation.evaluation_id.in_(evaluation_ids))
    if session_ids:
        query = query.filter(Evaluation.session_id.in_(session_ids))
    if selection_ecole is not None:
        query = query.filter(Evaluation.evaluation_id.in_(selection_ecole))
    toutes_evals = query.all()

    evals_by_matiere: Dict[int, List[Evaluation]] = {mat_id: [] for mat_id in matieres_info}
    for ev in toutes_evals:
        if ev.matiere_id in evals_by_matiere:
            evals_by_matiere[ev.matiere_id].append(ev)

    notes_lookup = precharger_notes(db, [ev.evaluation_id for ev in toutes_evals])
    type_coefs = get_types_evaluation_coefficients(db, etablissement_id, cycle_key)
    mode_agregation = get_mode_agregation(db, etablissement_id, cycle_key)

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE",
    ).all()
    effectif = len(inscriptions)

    # Identité des élèves, en une requête : un classement doit pouvoir
    # s'afficher seul, sans que l'appelant ait à recharger la classe pour
    # traduire des inscription_id en noms.
    eleves = {
        e.eleve_id: e for e in db.query(Eleve).filter(
            Eleve.eleve_id.in_([i.eleve_id for i in inscriptions])
        ).all()
    } if inscriptions else {}

    bulletins_data = []
    for insc in inscriptions:
        total_coef = 0.0
        total_points = 0.0
        lignes_data = []

        for mat_id, mat_info in matieres_info.items():
            evals_matiere = evals_by_matiere.get(mat_id, [])
            moy_mat, _nb = moyenne_matiere_eleve(
                evals_matiere, insc.inscription_id, notes_lookup, type_coefs, echelle,
                mode_agregation,
            )
            coef_matiere = coefficient_matiere_effectif(mat_info["coefficient"], evals_matiere)
            if moy_mat is not None:
                total_coef += coef_matiere
                total_points += moy_mat * coef_matiere
            lignes_data.append({
                "matiere_id": mat_id,
                "matiere": mat_info["libelle"],
                "moyenne_matiere": moy_mat,
                "coefficient": coef_matiere,
                "appreciation": get_appreciation(moy_mat, echelle) if moy_mat is not None else None,
            })

        el = eleves.get(insc.eleve_id)
        bulletins_data.append({
            "inscription_id": insc.inscription_id,
            "eleve_id": insc.eleve_id,
            "nom": el.nom if el else None,
            "prenom": el.prenom if el else None,
            "matricule": el.matricule if el else None,
            "moyenne_generale": round(total_points / total_coef, 2) if total_coef > 0 else None,
            "total_points": round(total_points, 2),
            "total_coefficients": total_coef,
            "lignes": lignes_data,
        })

    bulletins_data.sort(key=lambda x: x["moyenne_generale"] or 0, reverse=True)
    for idx, bd in enumerate(bulletins_data):
        bd["rang"] = idx + 1
        bd["mention"] = (
            get_mention(bd["moyenne_generale"], db, cycle_key, etablissement_id)
            if bd["moyenne_generale"] is not None else None
        )

    stats_matieres = {}
    for mat_id in matieres_info:
        vals = [
            l["moyenne_matiere"]
            for b in bulletins_data
            for l in b["lignes"]
            if l["matiere_id"] == mat_id and l["moyenne_matiere"] is not None
        ]
        stats_matieres[mat_id] = {
            "moyenne": round(sum(vals) / len(vals), 2) if vals else None,
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
        }

    # Épreuves réellement prises en compte : indispensable pour que l'école
    # sache sur quoi porte un classement (« ordre de mérite de janvier »
    # n'a pas le même sens qu'un classement de fin de trimestre).
    types_libelles = {
        t.type_eval_id: t.libelle for t in db.query(TypeEvaluation).all()
    }
    epreuves = {}
    for ev in toutes_evals:
        cle = f"S{ev.session_id}" if ev.session_id else f"E{ev.evaluation_id}"
        if cle not in epreuves:
            epreuves[cle] = {
                "libelle": ev.libelle,
                "type": types_libelles.get(ev.type_eval_id, ""),
                "date": str(ev.date_evaluation) if ev.date_evaluation else None,
                "session_id": ev.session_id,
                "nb_matieres": 0,
                "est_coefficientee": getattr(ev, "est_coefficientee", "O"),
            }
        epreuves[cle]["nb_matieres"] += 1

    resultat = {
        "classe": classe.libelle,
        "classe_id": classe_id,
        "trimestre_id": trimestre_id,
        "effectif": effectif,
        "echelle": echelle,
        "resultats": bulletins_data,
        "stats_matieres": stats_matieres,
        "epreuves": sorted(epreuves.values(), key=lambda e: e["date"] or ""),
        # Règle d'agrégation réellement appliquée : sans elle, deux écoles
        # voyant des moyennes différentes sur les mêmes notes n'ont aucun
        # moyen de savoir pourquoi.
        "mode_agregation": mode_agregation,
        "persiste": persist,
    }

    if not persist:
        return resultat

    bulletins_crees = 0
    for bd in bulletins_data:
        existing = db.query(Bulletin).filter(
            Bulletin.inscription_id == bd["inscription_id"],
            Bulletin.trimestre_id == trimestre_id,
        ).first()

        if existing:
            existing.moyenne_generale = bd["moyenne_generale"]
            existing.rang = bd["rang"]
            existing.effectif_classe = effectif
            existing.mention = bd["mention"]
            existing.statut = "CALCULE"
            bulletin = existing
            db.query(BulletinLigne).filter(
                BulletinLigne.bulletin_id == existing.bulletin_id
            ).delete()
        else:
            bulletin = Bulletin(
                inscription_id=bd["inscription_id"],
                trimestre_id=trimestre_id,
                type_bulletin="TRIMESTRIEL",
                moyenne_generale=bd["moyenne_generale"],
                rang=bd["rang"],
                effectif_classe=effectif,
                mention=bd["mention"],
                statut="CALCULE",
            )
            db.add(bulletin)
            db.flush()
            bulletins_crees += 1

        for l in bd["lignes"]:
            stats = stats_matieres.get(l["matiere_id"], {})
            db.add(BulletinLigne(
                bulletin_id=bulletin.bulletin_id,
                matiere_id=l["matiere_id"],
                moyenne_matiere=l["moyenne_matiere"],
                moyenne_classe=stats.get("moyenne"),
                note_min=stats.get("min"),
                note_max=stats.get("max"),
                coefficient=l["coefficient"],
                appreciation=l["appreciation"],
            ))

    db.commit()
    resultat["bulletins_crees"] = bulletins_crees
    resultat["bulletins_total"] = len(bulletins_data)
    return resultat


# ════════════════════════════════════════════════════════════
# Consultation familiale (portails parent et élève)
# ════════════════════════════════════════════════════════════

def epreuves_consultables(db: Session, classe_id: int, trimestre_id: int) -> List[dict]:
    """Épreuves qu'une famille peut consulter sur une période.

    Uniquement les épreuves **entièrement centralisées** : tant que toutes les
    matières d'une composition ne sont pas remontées, un classement partiel
    donnerait un rang faux, que la famille prendrait pour définitif.
    """
    evals = db.query(Evaluation).filter(
        Evaluation.classe_id == classe_id,
        Evaluation.trimestre_id == trimestre_id,
    ).all()
    types = {t.type_eval_id: t.libelle for t in db.query(TypeEvaluation).all()}

    groupes: Dict[str, dict] = {}
    for ev in evals:
        cle = f"S{ev.session_id}" if ev.session_id else f"E{ev.evaluation_id}"
        g = groupes.setdefault(cle, {
            "cle": cle,
            "libelle": ev.libelle,
            "type": types.get(ev.type_eval_id, ""),
            "date": ev.date_evaluation.isoformat() if ev.date_evaluation else None,
            "evaluation_ids": [],
            "nb_matieres": 0,
            "nb_centralisees": 0,
        })
        g["evaluation_ids"].append(ev.evaluation_id)
        g["nb_matieres"] += 1
        if ev.statut == "CENTRALISEE":
            g["nb_centralisees"] += 1

    return sorted(
        (g for g in groupes.values() if g["nb_centralisees"] == g["nb_matieres"]),
        key=lambda g: g["date"] or "",
    )


def resultat_eleve_sur_epreuves(
    db: Session,
    classe_id: int,
    trimestre_id: int,
    inscription_id: int,
    *,
    evaluation_ids: Optional[List[int]] = None,
    flags: Optional[dict] = None,
) -> Optional[dict]:
    """Résultat d'UN élève sur une sélection d'épreuves, avec son rang.

    Destinée aux portails parent et élève : un parent doit pouvoir regarder le
    classement de son enfant sur le seul mois de janvier, sur une composition,
    ou sur toute la période. Le rang n'a de sens que rapporté à la classe
    entière — celle-ci est donc calculée, mais **seule la ligne de l'élève est
    renvoyée** : jamais les moyennes ni les noms des camarades.

    `flags` (get_bulletin_display_flags) est respecté : une école qui a choisi
    de masquer le rang ou la mention sur les bulletins ne doit pas les voir
    réapparaître ici.

    Retourne None si l'élève n'a aucune note sur ces épreuves.
    """
    res = calculer_resultats_periode(
        db, classe_id, trimestre_id,
        evaluation_ids=evaluation_ids, persist=False,
    )
    ligne = next(
        (r for r in res["resultats"] if r["inscription_id"] == inscription_id), None
    )
    if not ligne or ligne["moyenne_generale"] is None:
        return None

    flags = flags or {}
    montre_rang = flags.get("show_rang", True)
    moyennes = [r["moyenne_generale"] for r in res["resultats"] if r["moyenne_generale"] is not None]

    return {
        "moyenne_generale": ligne["moyenne_generale"],
        "rang": ligne["rang"] if montre_rang else None,
        "effectif": res["effectif"] if montre_rang and flags.get("show_effectif", True) else None,
        "mention": ligne["mention"] if flags.get("show_mention", True) else None,
        # Repères de classe, sans jamais nommer d'autre élève.
        "moyenne_classe": round(sum(moyennes) / len(moyennes), 2) if moyennes else None,
        "meilleure_moyenne": max(moyennes) if moyennes and montre_rang else None,
        "matieres": [
            {
                "matiere": l["matiere"],
                "moyenne": l["moyenne_matiere"],
                "coefficient": l["coefficient"],
                "appreciation": l["appreciation"],
            }
            for l in ligne["lignes"] if l["moyenne_matiere"] is not None
        ],
        "epreuves": res.get("epreuves", []),
        "mode_agregation": res.get("mode_agregation"),
        "echelle": res.get("echelle"),
    }


# ════════════════════════════════════════════════════════════
# Calcul annuel
# ════════════════════════════════════════════════════════════

def resultats_annuels_bulk(db: Session, inscription_ids: List[int]) -> Dict[int, dict]:
    """Moyenne annuelle et détail par matière d'un lot d'inscriptions.

    **Moyenne générale annuelle = somme des moyennes de période ÷ nombre de
    périodes.** C'est la règle que l'école annonce aux familles, et elle reste
    juste quel que soit le nombre de périodes (2 ou 3) et quel que soit le
    nombre d'épreuves de chacune.

    Elle n'est volontairement PAS recalculée à partir des matières : dès qu'une
    matière manque à une période (option abandonnée, matière introduite en
    cours d'année), repondérer les matières donne un résultat différent de la
    moyenne des bulletins que la famille a déjà reçus. Entre les deux, c'est le
    chiffre déjà communiqué qui fait foi.

    Le détail par matière reste calculé — le bulletin annuel affiche bien une
    ligne par matière — mais il sert l'affichage, pas la moyenne générale.
    """
    if not inscription_ids:
        return {}
    rows = db.query(BulletinLigne, Bulletin.inscription_id).join(
        Bulletin, BulletinLigne.bulletin_id == Bulletin.bulletin_id
    ).filter(
        Bulletin.inscription_id.in_(inscription_ids),
        Bulletin.type_bulletin != "ANNUEL",
        BulletinLigne.moyenne_matiere.isnot(None),
    ).all()

    par_inscription: Dict[int, Dict[int, List[Tuple[float, float]]]] = {}
    for ligne, inscription_id in rows:
        par_matiere = par_inscription.setdefault(inscription_id, {})
        par_matiere.setdefault(ligne.matiere_id, []).append(
            (float(ligne.moyenne_matiere), float(ligne.coefficient or 1))
        )

    # Moyennes générales de période, telles qu'elles figurent sur les bulletins
    moyennes_periode: Dict[int, List[float]] = {}
    for b in db.query(Bulletin).filter(
        Bulletin.inscription_id.in_(inscription_ids),
        Bulletin.type_bulletin != "ANNUEL",
        Bulletin.moyenne_generale.isnot(None),
    ).all():
        moyennes_periode.setdefault(b.inscription_id, []).append(float(b.moyenne_generale))

    resultats: Dict[int, dict] = {}
    for inscription_id, par_matiere in par_inscription.items():
        details = []
        total_points = 0.0
        total_coef = 0.0
        for matiere_id, valeurs in par_matiere.items():
            moyenne_annuelle_matiere = sum(v for v, _ in valeurs) / len(valeurs)
            coef = valeurs[-1][1]  # constant sur l'année en pratique
            total_points += moyenne_annuelle_matiere * coef
            total_coef += coef
            details.append({
                "matiere_id": matiere_id,
                "moyenne_matiere": round(moyenne_annuelle_matiere, 2),
                "coefficient": coef,
                "nb_periodes": len(valeurs),
            })

        periodes = moyennes_periode.get(inscription_id, [])
        if not periodes:
            continue
        resultats[inscription_id] = {
            "moyenne": round(sum(periodes) / len(periodes), 2),
            "nb_periodes": len(periodes),
            "moyennes_periodes": [round(m, 2) for m in periodes],
            "total_points": round(total_points, 2),
            "total_coefficients": total_coef,
            "lignes": details,
        }
    return resultats


def calculer_resultats_annuels(
    db: Session, classe_id: int, *, persist: bool = False,
) -> dict:
    """Résultats annuels d'une classe : moyenne, rang, mention par élève.

    `persist=True` crée/actualise en plus le bulletin annuel
    (type_bulletin='ANNUEL', trimestre_id=NULL) et ses lignes — ce bulletin
    n'existait pas jusqu'ici, seul le trimestriel était généré.
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise ValueError("Classe non trouvée")

    etablissement_id = classe.etablissement_id
    cycle_key = get_cycle_key(classe_id, db)

    inscriptions = db.query(Inscription).filter(
        Inscription.classe_id == classe_id,
        Inscription.statut == "ACTIVE",
    ).all()
    effectif = len(inscriptions)
    resultats_bulk = resultats_annuels_bulk(db, [i.inscription_id for i in inscriptions])

    lignes_par_inscription = {}
    donnees = []
    for insc in inscriptions:
        r = resultats_bulk.get(insc.inscription_id)
        lignes_par_inscription[insc.inscription_id] = r["lignes"] if r else []
        donnees.append({
            "inscription_id": insc.inscription_id,
            "moyenne_generale": r["moyenne"] if r else None,
            "total_points": r["total_points"] if r else None,
            "total_coefficients": r["total_coefficients"] if r else None,
            # Le détail qui justifie la moyenne annuelle : sans lui, une famille
            # qui recompte à la main ne peut pas retrouver le chiffre.
            "nb_periodes": r["nb_periodes"] if r else 0,
            "moyennes_periodes": r["moyennes_periodes"] if r else [],
        })

    donnees.sort(key=lambda x: x["moyenne_generale"] or 0, reverse=True)
    for idx, d in enumerate(donnees):
        d["rang"] = idx + 1
        d["mention"] = (
            get_mention(d["moyenne_generale"], db, cycle_key, etablissement_id)
            if d["moyenne_generale"] is not None else None
        )

    stats_matieres: Dict[int, dict] = {}
    toutes_lignes: Dict[int, List[float]] = {}
    for lignes in lignes_par_inscription.values():
        for l in lignes:
            toutes_lignes.setdefault(l["matiere_id"], []).append(l["moyenne_matiere"])
    for matiere_id, vals in toutes_lignes.items():
        stats_matieres[matiere_id] = {
            "moyenne": round(sum(vals) / len(vals), 2) if vals else None,
            "min": min(vals) if vals else None,
            "max": max(vals) if vals else None,
        }

    resultat = {
        "classe": classe.libelle,
        "classe_id": classe_id,
        "effectif": effectif,
        "resultats": donnees,
        "stats_matieres": stats_matieres,
        "persiste": persist,
    }

    if not persist:
        return resultat

    echelle = get_bareme_defaut_cycle(db, etablissement_id, cycle_key)
    bulletins_crees = 0
    for d in donnees:
        existing = db.query(Bulletin).filter(
            Bulletin.inscription_id == d["inscription_id"],
            Bulletin.type_bulletin == "ANNUEL",
        ).first()

        if existing:
            existing.moyenne_generale = d["moyenne_generale"]
            existing.rang = d["rang"]
            existing.effectif_classe = effectif
            existing.mention = d["mention"]
            existing.statut = "CALCULE"
            bulletin = existing
            db.query(BulletinLigne).filter(
                BulletinLigne.bulletin_id == existing.bulletin_id
            ).delete()
        else:
            bulletin = Bulletin(
                inscription_id=d["inscription_id"],
                trimestre_id=None,
                type_bulletin="ANNUEL",
                moyenne_generale=d["moyenne_generale"],
                rang=d["rang"],
                effectif_classe=effectif,
                mention=d["mention"],
                statut="CALCULE",
            )
            db.add(bulletin)
            db.flush()
            bulletins_crees += 1

        for l in lignes_par_inscription.get(d["inscription_id"], []):
            stats = stats_matieres.get(l["matiere_id"], {})
            db.add(BulletinLigne(
                bulletin_id=bulletin.bulletin_id,
                matiere_id=l["matiere_id"],
                moyenne_matiere=l["moyenne_matiere"],
                moyenne_classe=stats.get("moyenne"),
                note_min=stats.get("min"),
                note_max=stats.get("max"),
                coefficient=l["coefficient"],
                appreciation=get_appreciation(l["moyenne_matiere"], echelle),
            ))

    db.commit()
    resultat["bulletins_crees"] = bulletins_crees
    resultat["bulletins_total"] = len(donnees)
    return resultat


# ════════════════════════════════════════════════════════════
# Affichage des bulletins
# ════════════════════════════════════════════════════════════

def get_bulletin_display_flags(db: Session, etablissement_id: int = 1) -> dict:
    """Réglages "quoi afficher sur le bulletin" — source unique partagée par le
    PDF, le portail élève, le portail parent et la page admin /bulletins.

    Deux pages Paramètres écrivent potentiellement ce réglage : Notation >
    Affichage Bulletins (categorie NOTATION, clés `display.*`) et Documents
    (categorie DOCUMENTS, clés `champ_*`) — elles vivaient chacune dans leur
    coin sans jamais se voir, d'où les toggles qui semblaient sans effet selon
    la page utilisée. `notation.display.*` prend le dessus quand présent ;
    sinon on retombe sur `documents.champ_*`.
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
            documents_settings.get("champ_moyenne_classe", "true") == "true"
            or documents_settings.get("champ_min_max", "true") == "true"
        )),
    }
