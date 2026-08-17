"""
SMARTSCHOOL — Référentiel scolaire guinéen : cycles et niveaux, PAR ÉCOLE.

Pourquoi ce service
-------------------
Une école fraîchement créée n'avait ni cycle ni niveau. Or une **classe** exige
un niveau, et un niveau appartient à un cycle : sans eux, l'écran « Nouvelle
classe » échouait, et les matières restaient vides puisqu'elles se rattachent
elles aussi à un cycle. L'école était donc inutilisable en sortie d'inscription.

Le référentiel existait déjà, mais dans `seed_classes_guinee.py` : un script
autonome écrit avant le chantier multi-écoles, qui ne connaît pas la notion
d'établissement. Ce module reprend ses données telles quelles et les rend
utilisables **par école**, sur le même modèle que
`referentiel_evaluation.py` (`*_manquants` / `amorcer_*`).

Structure officielle guinéenne :
    Primaire  : 1re à 6e année, examen CEE en 6e
    Collège   : 7e à 10e année, examen BEPC en 10e
    Lycée     : 11e, 12e et Terminale, en séries SE / SM / SS, BAC en Terminale
"""
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.academique import Cycle, Niveau

CYCLES_REFERENCE = [
    {"code": "PRM", "libelle": "Primaire", "ordre": 1, "duree_annees": 6},
    {"code": "CLG", "libelle": "Collège", "ordre": 2, "duree_annees": 4},
    {"code": "LYC", "libelle": "Lycée", "ordre": 3, "duree_annees": 3},
]

# Le type d'établissement choisi à l'inscription décide des cycles créés : une
# école primaire ne doit voir QUE des niveaux primaires, etc. « Complexe » couvre
# tout. « Autre » (type inconnu / hors programme guinéen) reçoit tout par défaut,
# pour ne jamais laisser une école sans aucun niveau — elle supprimera ce qu'elle
# n'utilise pas. Un type non listé retombe sur ce même défaut « tout ».
CYCLES_PAR_TYPE = {
    "PRIMAIRE": ["PRM"],
    "COLLEGE": ["CLG"],
    "LYCEE": ["LYC"],
    "COMPLEXE": ["PRM", "CLG", "LYC"],
    "AUTRE": ["PRM", "CLG", "LYC"],
}
CYCLES_PAR_DEFAUT = ["PRM", "CLG", "LYC"]


def cycles_autorises(type_etablissement: Optional[str]) -> List[str]:
    """Codes de cycles à créer pour ce type d'établissement."""
    return CYCLES_PAR_TYPE.get((type_etablissement or "").upper(), CYCLES_PAR_DEFAUT)

NIVEAUX_REFERENCE = [
    # --- PRIMAIRE ---
    {"cycle": "PRM", "code": "1A", "libelle": "1ère Année", "ordre": 1, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "2A", "libelle": "2ème Année", "ordre": 2, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "3A", "libelle": "3ème Année", "ordre": 3, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "4A", "libelle": "4ème Année", "ordre": 4, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "5A", "libelle": "5ème Année", "ordre": 5, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "6A", "libelle": "6ème Année", "ordre": 6, "est_examen": "O", "examen": "CEE"},
    # --- COLLÈGE ---
    {"cycle": "CLG", "code": "7A", "libelle": "7ème Année", "ordre": 7, "est_examen": "N", "examen": None},
    {"cycle": "CLG", "code": "8A", "libelle": "8ème Année", "ordre": 8, "est_examen": "N", "examen": None},
    {"cycle": "CLG", "code": "9A", "libelle": "9ème Année", "ordre": 9, "est_examen": "N", "examen": None},
    {"cycle": "CLG", "code": "10A", "libelle": "10ème Année", "ordre": 10, "est_examen": "O", "examen": "BEPC"},
    # --- LYCÉE ---
    {"cycle": "LYC", "code": "11SE", "libelle": "11ème Année SE", "ordre": 11, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "11SM", "libelle": "11ème Année SM", "ordre": 12, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "11SS", "libelle": "11ème Année SS", "ordre": 13, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "12SE", "libelle": "12ème Année SE", "ordre": 14, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "12SM", "libelle": "12ème Année SM", "ordre": 15, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "12SS", "libelle": "12ème Année SS", "ordre": 16, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "TSE", "libelle": "Terminale SE", "ordre": 17, "est_examen": "O", "examen": "BAC"},
    {"cycle": "LYC", "code": "TSM", "libelle": "Terminale SM", "ordre": 18, "est_examen": "O", "examen": "BAC"},
    {"cycle": "LYC", "code": "TSS", "libelle": "Terminale SS", "ordre": 19, "est_examen": "O", "examen": "BAC"},
]


def cycles_manquants(db: Session, etablissement_id: int) -> List[str]:
    """Codes de cycles du référentiel que cette école n'a pas encore."""
    presents = {
        c for (c,) in db.query(Cycle.code)
        .filter(Cycle.etablissement_id == etablissement_id).all()
    }
    return [c["code"] for c in CYCLES_REFERENCE if c["code"] not in presents]


def niveaux_manquants(db: Session, etablissement_id: int) -> List[str]:
    """Codes de niveaux du référentiel que cette école n'a pas encore."""
    presents = {
        code for (code,) in db.query(Niveau.code)
        .join(Cycle, Cycle.cycle_id == Niveau.cycle_id)
        .filter(Cycle.etablissement_id == etablissement_id).all()
    }
    return [n["code"] for n in NIVEAUX_REFERENCE if n["code"] not in presents]


def amorcer_referentiel_scolaire(db: Session, etablissement_id: int,
                                 type_etablissement: Optional[str] = None) -> dict:
    """Crée les cycles et niveaux manquants de CETTE école, selon son type.

    Le type (Primaire / Collège / Lycée / Complexe / Autre) restreint les cycles
    créés : une école primaire ne reçoit que le cycle primaire. `type=None` (ou
    inconnu) crée tout — utilisé quand on veut juste compléter un référentiel
    sans supposer de restriction.

    Idempotent : ce qui existe déjà n'est ni recréé ni modifié. Une école qui a
    renommé ou supprimé un niveau garde son choix — on ne complète que ce qui
    manque, on ne réaligne jamais sur le référentiel.
    """
    autorises = cycles_autorises(type_etablissement) if type_etablissement else CYCLES_PAR_DEFAUT
    cycles_a_creer = [c for c in CYCLES_REFERENCE if c["code"] in autorises]
    niveaux_a_creer = [n for n in NIVEAUX_REFERENCE if n["cycle"] in autorises]

    cycles_par_code = {}
    crees_cycles = 0

    for reference in cycles_a_creer:
        cycle = db.query(Cycle).filter(
            Cycle.etablissement_id == etablissement_id,
            Cycle.code == reference["code"],
        ).first()
        if cycle is None:
            cycle = Cycle(etablissement_id=etablissement_id, **reference)
            db.add(cycle)
            db.flush()
            crees_cycles += 1
        cycles_par_code[reference["code"]] = cycle.cycle_id

    crees_niveaux = 0
    for reference in niveaux_a_creer:
        cycle_id = cycles_par_code[reference["cycle"]]
        existe = db.query(Niveau.niveau_id).filter(
            Niveau.cycle_id == cycle_id, Niveau.code == reference["code"]
        ).first()
        if existe:
            continue
        db.add(Niveau(
            cycle_id=cycle_id,
            code=reference["code"],
            libelle=reference["libelle"],
            ordre=reference["ordre"],
            est_examen=reference["est_examen"],
            examen_national=reference["examen"],
        ))
        crees_niveaux += 1

    return {"cycles": crees_cycles, "niveaux": crees_niveaux}
