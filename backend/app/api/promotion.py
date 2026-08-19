"""
SMARTSCHOOL API — Clôture d'année scolaire & Promotion des élèves (V2)

Phase 2 de la refonte clôture/réinscription/tarifs (voir app/api/annee_scolaire.py
pour la Phase 1 — clôture comptable). Ce module ne gère QUE la préparation de la
promotion : calcul des résultats annuels par élève (moyenne, total de points,
rang, décision Admis/Redoublant/Exclu/Diplômé), proposition de classe cible pour
l'année suivante, et validation explicite avant tout figeage. Il ne crée JAMAIS
la nouvelle inscription de l'année suivante — c'est le rôle exclusif de la
réinscription V2 (app/api/reinscription.py), volontairement indépendante,
déclenchée par la réinscription effective de chaque famille.

Séquence d'utilisation : calculer-resultats (classe ou année entière) → ajuster
manuellement au besoin (decision, choisir-filiere) → valider (classe ou année
entière, verrouille définitivement et ouvre la campagne de réinscription).
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, Dict, List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import (
    Classe, Niveau, Cycle, Inscription, Eleve, AnneeScolaire,
    Bulletin, BulletinLigne, ParametreEtablissement, ResultatOfficielExamen,
)
from app.services.notation import (
    get_seuil_passage,
    resultats_annuels_bulk as _resultats_annuels_bulk,
)

router = APIRouter(prefix="/api/promotion", tags=["Promotion & Clôture d'année"])


# ── Helpers d'isolation (Lot 9) ───────────────────────────────────────────

def _classe_ou_404(db: Session, classe_id: int, etablissement_id: int) -> Classe:
    c = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not c:
        raise HTTPException(404, "Classe non trouvée")
    return c


def _annee_ou_404(db: Session, annee_id: int, etablissement_id: int, libelle: str = "Année") -> AnneeScolaire:
    a = db.query(AnneeScolaire).filter(
        AnneeScolaire.annee_id == annee_id, AnneeScolaire.etablissement_id == etablissement_id
    ).first()
    if not a:
        raise HTTPException(404, f"{libelle} non trouvée")
    return a


def _annee_suivante_id(db: Session, etablissement_id: int, annee_source_id: int) -> Optional[int]:
    """L'année scolaire qui suit immédiatement `annee_source_id` dans cette école.

    Sert à re-décider une classe d'examen dès la saisie du résultat officiel :
    on a besoin de l'année cible pour résoudre la classe de redoublement. On la
    déduit de la source (la plus proche année dont la rentrée est postérieure),
    sans dépendre d'un paramètre passé par l'écran appelant — la saisie du
    résultat vient parfois de la page « Résultats de fin d'année », qui ne
    connaît pas l'année cible.
    """
    src = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_source_id).first()
    if not src:
        return None
    nxt = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id,
        AnneeScolaire.date_debut > src.date_debut,
    ).order_by(AnneeScolaire.date_debut.asc()).first()
    return nxt.annee_id if nxt else None


def _inscription_ou_404(db: Session, inscription_id: int, etablissement_id: int) -> Inscription:
    """Inscription est OWNERSHIP via sa Classe."""
    insc = (
        db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id == inscription_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not insc:
        raise HTTPException(404, "Inscription non trouvée")
    return insc

CODE_CYCLE_KEY = {"PRM": "primaire", "CLG": "college", "LYC": "lycee"}
# EN_ATTENTE_RESULTAT_OFFICIEL : classe d'examen dont le résultat ministériel
# n'est pas encore saisi — bloque la validation de la classe.
DECISIONS_VALIDES = (
    "ADMIS", "REDOUBLANT", "EN_ATTENTE_FILIERE", "EXCLU", "DIPLOME",
    "EN_ATTENTE_RESULTAT_OFFICIEL",
)
# Décisions qui entrent en campagne de réinscription à la validation (statut_reinscription
# = A_REINSCRIRE) — EN_ATTENTE_FILIERE en fait partie : ces élèves seront réinscrits, juste
# après avoir choisi leur série au moment de la réinscription (voir reinscription.py).
DECISIONS_AVEC_SUITE = ("ADMIS", "REDOUBLANT", "EN_ATTENTE_FILIERE")
# Décisions qui DOIVENT avoir une classe_cible_id résolue pour que `valider` accepte la
# classe. EN_ATTENTE_FILIERE en est délibérément exclu : ne pas avoir de classe cible est
# son état normal et attendu à ce stade — le choix de filière n'intervient qu'à la
# réinscription, jamais comme préalable à la validation de la promotion.
DECISIONS_NECESSITANT_CLASSE_CIBLE = ("ADMIS", "REDOUBLANT")


def _get_notation_param(db: Session, etablissement_id: int, cle: str, default):
    param = db.query(ParametreEtablissement).filter(
        ParametreEtablissement.etablissement_id == etablissement_id,
        ParametreEtablissement.categorie == "NOTATION",
        ParametreEtablissement.cle == cle,
    ).first()
    if not param or param.valeur is None:
        return default
    if isinstance(default, bool):
        return param.valeur == "true"
    if isinstance(default, (int, float)):
        try:
            return float(param.valeur)
        except (TypeError, ValueError):
            return default
    return param.valeur


def _niveau_suivant(db: Session, niveau: Niveau) -> Optional[Niveau]:
    """
    Retourne le Niveau suivant dans la séquence de promotion, ou None si :
    - c'est la frontière Collège → Lycée (nécessite un choix de série,
      traité séparément par l'appelant, voir `frontiere_lycee`) ;
    - c'est un niveau Terminale (fin du cursus → décision DIPLOME).

    Séquence réelle observée en base : Primaire (ordre 1-6, linéaire) →
    Collège (ordre 1-4, linéaire) → Lycée, qui se scinde en 3 séries
    (SE/SM/SS) dont les niveaux sont numérotés 11-19 avec un écart constant
    de +3 d'une année à l'autre au sein d'une même série (11xx→12xx→Txx).
    """
    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first()
    if not cycle:
        return None

    if cycle.code == "MAT":
        # Petite → Moyenne → Grande section (ordre 1→2→3), puis Grande Section
        # mène à la 1ère Année du primaire de la MÊME école. Sans primaire
        # (école maternelle seule, non prévue ici), pas de niveau suivant.
        if niveau.ordre < 3:
            return db.query(Niveau).filter(
                Niveau.cycle_id == niveau.cycle_id, Niveau.ordre == niveau.ordre + 1
            ).first()
        primaire = db.query(Cycle).filter(
            Cycle.code == "PRM", Cycle.etablissement_id == cycle.etablissement_id
        ).first()
        if not primaire:
            return None
        return db.query(Niveau).filter(Niveau.cycle_id == primaire.cycle_id, Niveau.ordre == 1).first()

    if cycle.code == "PRM":
        if niveau.ordre < 6:
            return db.query(Niveau).filter(
                Niveau.cycle_id == niveau.cycle_id, Niveau.ordre == niveau.ordre + 1
            ).first()
        college = db.query(Cycle).filter(
            Cycle.code == "CLG", Cycle.etablissement_id == cycle.etablissement_id
        ).first()
        if not college:
            return None
        return db.query(Niveau).filter(Niveau.cycle_id == college.cycle_id, Niveau.ordre == 1).first()

    if cycle.code == "CLG":
        if niveau.ordre < 4:
            return db.query(Niveau).filter(
                Niveau.cycle_id == niveau.cycle_id, Niveau.ordre == niveau.ordre + 1
            ).first()
        return None  # frontière vers le Lycée : choix de série requis

    if cycle.code == "LYC":
        ordre_suivant = niveau.ordre + 3
        if ordre_suivant > 19:
            return None  # Terminale -> fin de cursus (diplôme)
        return db.query(Niveau).filter(
            Niveau.cycle_id == niveau.cycle_id, Niveau.ordre == ordre_suivant
        ).first()

    return None


def _get_classe_active(db: Session, niveau_id: int, annee_id: int, etablissement_id: int) -> Optional[Classe]:
    return db.query(Classe).filter(
        Classe.niveau_id == niveau_id,
        Classe.annee_id == annee_id,
        Classe.etablissement_id == etablissement_id,
        Classe.statut == "ACTIVE",
    ).first()


def _code_et_libelle_libres(db: Session, etablissement_id: int, annee_id: int,
                            base_code: str, base_libelle: str) -> tuple:
    """Un couple (code, libellé) non déjà pris dans l'année cible.

    La création de classe refuse un doublon de code OU de libellé dans une même
    année (voir create_classe) : on désambiguïse avec un suffixe numérique
    plutôt que de faire échouer la préparation sur une collision rare.
    """
    rows = db.query(Classe.code, Classe.libelle).filter(
        Classe.etablissement_id == etablissement_id, Classe.annee_id == annee_id,
    ).all()
    codes = {c for c, _ in rows}
    libelles = {l for _, l in rows}
    code, libelle, i = base_code, base_libelle, 2
    while code in codes or libelle in libelles:
        code, libelle = f"{base_code}-{i}", f"{base_libelle} ({i})"
        i += 1
    return code, libelle


def _cycle_key_pour_classe(db: Session, classe: Classe):
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first() if niveau else None
    cycle_key = CODE_CYCLE_KEY.get(cycle.code if cycle else "", "college")
    return niveau, cycle, cycle_key


def _cycle_existe(db: Session, code: str, etablissement_id: int) -> bool:
    """Cette école possède-t-elle ce cycle (PRM/CLG/LYC) ?"""
    return db.query(Cycle.cycle_id).filter(
        Cycle.etablissement_id == etablissement_id, Cycle.code == code
    ).first() is not None


def _situation_niveau(db: Session, niveau: Optional[Niveau], cycle: Optional[Cycle],
                      etablissement_id: int) -> dict:
    """Caractérise un niveau pour la décision de fin d'année.

    Factorise un calcul qui vivait en double (aperçu et calcul persisté) et
    ajoute `est_examen` : pour un niveau d'examen national (6e/CEE, 10e/BEPC,
    Terminale/BAC), le passage ne dépend pas de la moyenne interne mais du
    résultat publié par le Ministère (voir ss_resultats_officiels_examen).

    « Terminal » dépend de l'ÉCOLE, pas seulement du niveau : une école qui
    s'arrête au primaire (pas de collège) voit sa 6e année comme fin de cursus
    (CEE → DIPLÔMÉ), et une école qui s'arrête au collège (pas de lycée) voit
    sa 10e année comme fin de cursus (BEPC → DIPLÔMÉ). Sans ça, l'élève admis
    du dernier niveau n'avait aucune classe cible et bloquait la clôture. La
    frontière vers le lycée n'existe que si le lycée existe réellement.
    """
    est_prm_dernier = bool(cycle and niveau and cycle.code == "PRM" and niveau.ordre == 6)
    est_clg_dernier = bool(cycle and niveau and cycle.code == "CLG" and niveau.ordre == 4)
    est_lyc_terminal = bool(cycle and niveau and cycle.code == "LYC" and niveau.ordre + 3 > 19)

    a_college = _cycle_existe(db, "CLG", etablissement_id)
    a_lycee = _cycle_existe(db, "LYC", etablissement_id)

    est_terminal = (
        est_lyc_terminal
        or (est_prm_dernier and not a_college)
        or (est_clg_dernier and not a_lycee)
    )
    est_examen = bool(niveau and niveau.est_examen == "O")
    # Maternelle : jugée admis/non SANS moyenne, décidée par l'enseignant.
    evaluation_simple = bool(niveau and niveau.evaluation_simple == "O")
    return {
        # Frontière Collège→Lycée uniquement si un lycée existe pour accueillir.
        "est_frontiere_lycee": est_clg_dernier and a_lycee,
        "est_terminal": est_terminal,
        "est_examen": est_examen,
        "evaluation_simple": evaluation_simple,
        # Passage décidé par un résultat admis/non saisi (examen national OU
        # maternelle), pas par la moyenne interne. Même brique dans les deux cas.
        "decision_par_resultat": est_examen or evaluation_simple,
        "examen_national": niveau.examen_national if niveau else None,
    }


def _resultats_officiels_bulk(db: Session, inscription_ids: List[int]) -> Dict[int, ResultatOfficielExamen]:
    """Résultats ministériels d'un lot d'inscriptions, en une requête."""
    if not inscription_ids:
        return {}
    return {
        r.inscription_id: r
        for r in db.query(ResultatOfficielExamen).filter(
            ResultatOfficielExamen.inscription_id.in_(inscription_ids)
        ).all()
    }


def _decision_classe_examen(resultat: Optional[ResultatOfficielExamen], est_terminal: bool) -> str:
    """Décision d'un élève de classe d'examen, à partir du seul résultat officiel.

    Tant que le Ministère n'a pas publié (ou que la saisie n'est pas faite),
    l'élève reste en attente : sa moyenne interne, examens blancs compris, n'a
    aucune valeur décisionnelle ici.
    """
    if resultat is None:
        return "EN_ATTENTE_RESULTAT_OFFICIEL"
    if resultat.resultat == "ADMIS":
        return "DIPLOME" if est_terminal else "ADMIS"
    return "REDOUBLANT"


@router.get("/classe/{classe_id}/apercu")
def apercu_cloture_classe(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Aperçu de la situation de fin d'année pour chaque élève de la classe. Si
    `calculer-resultats` a déjà tourné pour cette classe, lit l'état persisté
    (source de vérité une fois calculé) ; sinon calcule à la volée sans rien
    écrire (aperçu avant le tout premier calcul).
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    niveau, cycle, cycle_key = _cycle_key_pour_classe(db, classe)
    if not niveau:
        raise HTTPException(404, "Niveau introuvable pour cette classe")

    redoublement_actif = _get_notation_param(db, classe.etablissement_id, f"notation.redoublement_actif.{cycle_key}", True)
    seuil = get_seuil_passage(db, classe.etablissement_id, cycle_key)
    niveau_suivant = _niveau_suivant(db, niveau)
    situation = _situation_niveau(db, niveau, cycle, classe.etablissement_id)
    est_frontiere_lycee = situation["est_frontiere_lycee"]
    est_terminal = situation["est_terminal"]
    est_examen = situation["est_examen"]
    decision_par_resultat = situation["decision_par_resultat"]

    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE",
    ).order_by(Eleve.nom, Eleve.prenom).all()

    deja_calcule = any(insc.statut_promotion for insc, _ in inscriptions)
    resultats_calc = {} if deja_calcule else _resultats_annuels_bulk(
        db, [insc.inscription_id for insc, _ in inscriptions]
    )
    resultats_officiels = _resultats_officiels_bulk(
        db, [insc.inscription_id for insc, _ in inscriptions]
    ) if decision_par_resultat else {}

    eleves = []
    for insc, eleve in inscriptions:
        officiel = resultats_officiels.get(insc.inscription_id)
        if deja_calcule:
            moyenne, total_points, rang = insc.moyenne_annuelle, insc.total_points, insc.rang_final
            moyenne = float(moyenne) if moyenne is not None else None
            total_points = float(total_points) if total_points is not None else None
            decision = insc.decision_fin_annee
        else:
            r = resultats_calc.get(insc.inscription_id, {})
            moyenne, total_points, rang = r.get("moyenne"), r.get("total_points"), None
            if decision_par_resultat:
                # Décision par résultat admis/non (examen national OU maternelle) :
                # ni la moyenne ni le seuil n'interviennent. Pour la maternelle,
                # est_terminal=False → un admis passe à la section/année suivante.
                decision = _decision_classe_examen(officiel, est_terminal)
            elif est_terminal:
                decision = "DIPLOME"
            elif redoublement_actif and moyenne is not None and moyenne < seuil:
                decision = "REDOUBLANT"
            elif est_frontiere_lycee:
                decision = "EN_ATTENTE_FILIERE"
            else:
                decision = "ADMIS"
        # Informatif seulement désormais — le choix de filière ne se fait plus dans cette
        # vue (retiré du wizard, voir Phase 5) mais l'indicateur reste utile à l'affichage.
        necessite_choix_serie = decision == "EN_ATTENTE_FILIERE" and not insc.classe_cible_id

        eleves.append({
            "eleve_id": eleve.eleve_id,
            "inscription_id": insc.inscription_id,
            "nom": eleve.nom, "prenom": eleve.prenom, "matricule": eleve.matricule,
            "moyenne_annuelle": moyenne,
            "total_points": total_points,
            "rang": rang,
            "decision": decision,
            "necessite_choix_serie": necessite_choix_serie,
            "classe_cible_id": insc.classe_cible_id,
            "statut_promotion": insc.statut_promotion,
            "resultat_officiel": officiel.resultat if officiel else None,
        })

    return {
        "classe": {"classe_id": classe.classe_id, "libelle": classe.libelle},
        "niveau_suivant": {"niveau_id": niveau_suivant.niveau_id, "libelle": niveau_suivant.libelle} if niveau_suivant else None,
        "frontiere_lycee": est_frontiere_lycee,
        "terminal": est_terminal,
        # Classe d'examen : le frontend doit proposer la saisie du résultat
        # ministériel au lieu de s'appuyer sur le seuil de redoublement.
        "classe_examen": est_examen,
        "examen_national": situation["examen_national"],
        "en_attente_resultat_officiel": sum(
            1 for e in eleves if e["decision"] == "EN_ATTENTE_RESULTAT_OFFICIEL"
        ),
        "seuil_redoublement": seuil,
        "redoublement_actif": redoublement_actif,
        "deja_calcule": deja_calcule,
        "eleves": eleves,
    }


def _calculer_resultats_classe_core(
    db: Session, classe: Classe, annee_cible_id: int, classe_cache: Dict[tuple, Optional[Classe]]
) -> dict:
    """
    Calcule et PERSISTE la proposition de fin d'année pour chaque élève ACTIVE
    de la classe dont la promotion n'est pas encore VALIDE (rejouable sans
    risque tant que non validé — un nouvel appel recalcule et écrase
    entièrement moyenne/points/rang/décision/cible ; les ajustements manuels
    faits AVANT un nouveau calcul sont donc perdus — l'ordre d'usage prévu est
    calculer UNE FOIS par classe puis ajuster, pas l'inverse).
    Ne crée AUCUNE Inscription — seulement la proposition (niveau_cible_id/
    classe_cible_id), matérialisée plus tard par la réinscription V2.
    """
    niveau, cycle, cycle_key = _cycle_key_pour_classe(db, classe)
    redoublement_actif = _get_notation_param(db, classe.etablissement_id, f"notation.redoublement_actif.{cycle_key}", True)
    seuil = get_seuil_passage(db, classe.etablissement_id, cycle_key)
    niveau_suivant = _niveau_suivant(db, niveau) if niveau else None
    situation = _situation_niveau(db, niveau, cycle, classe.etablissement_id)
    est_frontiere_lycee = situation["est_frontiere_lycee"]
    est_terminal = situation["est_terminal"]
    decision_par_resultat = situation["decision_par_resultat"]

    def classe_active_cached(niveau_id: int) -> Optional[Classe]:
        key = (niveau_id, annee_cible_id)
        if key not in classe_cache:
            classe_cache[key] = _get_classe_active(db, niveau_id, annee_cible_id, classe.etablissement_id)
        return classe_cache[key]

    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe.classe_id,
        Inscription.statut == "ACTIVE",
        or_(Inscription.statut_promotion.is_(None), Inscription.statut_promotion != "VALIDE"),
    ).all()

    resultats_calc = _resultats_annuels_bulk(db, [insc.inscription_id for insc, _ in inscriptions])
    # Tri par moyenne décroissante pour le rang (None = 0, cohérent avec le
    # rang par trimestre déjà calculé dans evaluations.py/calculer_moyennes).
    inscriptions_triees = sorted(
        inscriptions,
        key=lambda pair: (resultats_calc.get(pair[0].inscription_id) or {}).get("moyenne") or 0,
        reverse=True,
    )

    resultats_officiels = _resultats_officiels_bulk(
        db, [insc.inscription_id for insc, _ in inscriptions]
    ) if decision_par_resultat else {}

    resume = {
        "proposes": 0, "en_attente_filiere": 0, "exclus": 0, "diplomes": 0,
        "en_attente_resultat_officiel": 0,
    }

    for rang_idx, (insc, eleve) in enumerate(inscriptions_triees):
        r = resultats_calc.get(insc.inscription_id, {})
        moyenne, total_points = r.get("moyenne"), r.get("total_points")

        if decision_par_resultat:
            # Décision par résultat admis/non (examen national OU maternelle) :
            # jamais le seuil interne. La moyenne reste enregistrée comme
            # indicateur. Maternelle : est_terminal=False → admis = passe.
            decision = _decision_classe_examen(
                resultats_officiels.get(insc.inscription_id), est_terminal
            )
        elif est_terminal:
            decision = "DIPLOME"
        elif redoublement_actif and moyenne is not None and moyenne < seuil:
            decision = "REDOUBLANT"
        elif est_frontiere_lycee:
            # Décision à part entière (pas un flag sur ADMIS) — ces élèves sont
            # promus, mais leur classe cible ne se résout qu'au choix de filière,
            # fait à la réinscription (jamais comme préalable à la validation).
            decision = "EN_ATTENTE_FILIERE"
        else:
            decision = "ADMIS"

        insc.moyenne_annuelle = moyenne
        insc.total_points = total_points
        insc.rang_final = rang_idx + 1
        insc.decision_fin_annee = decision
        insc.statut_promotion = "PROPOSE"

        if decision == "EN_ATTENTE_RESULTAT_OFFICIEL":
            insc.niveau_cible_id = None
            insc.classe_cible_id = None
            resume["en_attente_resultat_officiel"] += 1
        elif decision == "DIPLOME":
            insc.niveau_cible_id = None
            insc.classe_cible_id = None
            resume["diplomes"] += 1
        elif decision == "REDOUBLANT":
            cible = classe_active_cached(classe.niveau_id)
            insc.niveau_cible_id = classe.niveau_id
            insc.classe_cible_id = cible.classe_id if cible else None
            resume["proposes"] += 1
        elif decision == "EN_ATTENTE_FILIERE":
            insc.niveau_cible_id = None
            insc.classe_cible_id = None
            resume["en_attente_filiere"] += 1
        else:  # ADMIS
            cible = classe_active_cached(niveau_suivant.niveau_id) if niveau_suivant else None
            insc.niveau_cible_id = niveau_suivant.niveau_id if niveau_suivant else None
            insc.classe_cible_id = cible.classe_id if cible else None
            resume["proposes"] += 1

    return {"classe": classe.libelle, "total_eleves": len(inscriptions_triees), **resume}


class CalculerResultatsRequest(BaseModel):
    annee_cible_id: int


@router.post("/classe/{classe_id}/calculer-resultats")
def calculer_resultats_classe(classe_id: int, data: CalculerResultatsRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Calcule et persiste les résultats/proposition de promotion pour une classe (voir _calculer_resultats_classe_core)."""
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    _annee_ou_404(db, data.annee_cible_id, etablissement_id, "Année cible")

    resultat = _calculer_resultats_classe_core(db, classe, data.annee_cible_id, {})
    db.commit()
    return resultat


@router.post("/annee/{annee_source_id}/calculer-resultats-tout")
def calculer_resultats_annee(annee_source_id: int, data: CalculerResultatsRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Calcule et persiste les résultats/proposition pour TOUTES les classes
    actives de l'année source (DE CET ÉTABLISSEMENT) en un seul appel."""
    annee_cible = _annee_ou_404(db, data.annee_cible_id, etablissement_id, "Année cible")
    _annee_ou_404(db, annee_source_id, etablissement_id, "Année source")

    classes = db.query(Classe).filter(
        Classe.annee_id == annee_source_id, Classe.statut == "ACTIVE",
        Classe.etablissement_id == etablissement_id,
    ).all()
    classe_cache: Dict[tuple, Optional[Classe]] = {}
    resultats = []
    total = {"proposes": 0, "en_attente_filiere": 0, "exclus": 0, "diplomes": 0}

    for classe in classes:
        r = _calculer_resultats_classe_core(db, classe, data.annee_cible_id, classe_cache)
        resultats.append(r)
        for k in total:
            total[k] += r.get(k, 0)

    db.commit()
    return {
        "message": f"Résultats calculés pour {len(classes)} classe(s) de {annee_cible.libelle}",
        "total": total,
        "classes_traitees": len(classes),
        "detail": resultats,
    }


class DecisionOverrideRequest(BaseModel):
    decision: str  # ADMIS | REDOUBLANT | EXCLU | DIPLOME
    classe_cible_id: Optional[int] = None


@router.put("/eleve/{inscription_id}/decision")
def override_decision(inscription_id: int, data: DecisionOverrideRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Override manuel par élève — notamment pour forcer EXCLU (jamais calculé
    automatiquement, décision Phase 1). Nécessite que calculer-resultats ait
    déjà tourné pour cette inscription (statut_promotion non NULL) et qu'elle
    ne soit pas encore validée.
    """
    if data.decision not in DECISIONS_VALIDES:
        raise HTTPException(400, f"Décision invalide — attendu l'une de : {', '.join(DECISIONS_VALIDES)}")
    insc = _inscription_ou_404(db, inscription_id, etablissement_id)
    if insc.statut_promotion is None:
        raise HTTPException(400, "Calculez d'abord les résultats de la classe avant d'ajuster une décision")
    if insc.statut_promotion == "VALIDE":
        raise HTTPException(400, "Promotion déjà validée pour cet élève — non modifiable")

    insc.decision_fin_annee = data.decision
    if data.decision in ("EXCLU", "DIPLOME"):
        insc.niveau_cible_id = None
        insc.classe_cible_id = None
    elif data.classe_cible_id:
        # La classe cible doit appartenir au même établissement — sinon un
        # élève pouvait être promu vers la classe d'une autre école.
        cible = _classe_ou_404(db, data.classe_cible_id, etablissement_id)
        insc.classe_cible_id = cible.classe_id
        insc.niveau_cible_id = cible.niveau_id

    db.commit()
    return {"message": f"Décision mise à jour : {data.decision}"}


class ChoisirFiliereRequest(BaseModel):
    niveau_id: int  # niveau Lycée choisi (11SE/11SM/11SS...)
    annee_cible_id: int


@router.put("/eleve/{inscription_id}/choisir-filiere")
def choisir_filiere(inscription_id: int, data: ChoisirFiliereRequest, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Résout la classe cible une fois la série Lycée choisie pour un élève
    EN_ATTENTE_FILIERE. Opération de RÉINSCRIPTION, pas de promotion — appelée
    normalement APRÈS que `valider` ait déjà verrouillé la promotion (statut_promotion
    == VALIDE est l'état attendu ici, pas un blocage). Seul un élève déjà
    matérialisé (REINSCRIT) ne peut plus changer de filière.
    """
    insc = _inscription_ou_404(db, inscription_id, etablissement_id)
    _annee_ou_404(db, data.annee_cible_id, etablissement_id, "Année cible")
    if insc.decision_fin_annee != "EN_ATTENTE_FILIERE":
        raise HTTPException(400, "Cet élève n'est pas en attente de choix de filière")
    if insc.statut_reinscription == "REINSCRIT":
        raise HTTPException(400, "Cet élève est déjà réinscrit — filière non modifiable")

    classe_actuelle = db.query(Classe).filter(Classe.classe_id == insc.classe_id).first()
    if not classe_actuelle:
        raise HTTPException(404, "Classe actuelle introuvable")

    cible = _get_classe_active(db, data.niveau_id, data.annee_cible_id, classe_actuelle.etablissement_id)
    if not cible:
        raise HTTPException(
            400,
            "Aucune classe active pour ce niveau dans l'année cible — vérifiez que les classes ont été "
            "préparées (POST /annee/{annee_cible_id}/preparer-classes)",
        )

    insc.niveau_cible_id = data.niveau_id
    insc.classe_cible_id = cible.classe_id
    db.commit()
    return {"message": f"Filière choisie — classe cible : {cible.libelle}", "classe_cible_id": cible.classe_id}


def _valider_classe_core(db: Session, classe: Classe) -> dict:
    """
    Verrouille définitivement la proposition (PROPOSE -> VALIDE) pour toute la
    classe : refuse (sans rien modifier) si un élève ADMIS/REDOUBLANT n'a
    toujours pas de classe cible résolue (ex: classes cibles pas préparées) —
    EN_ATTENTE_FILIERE en est explicitement exclu, l'absence de classe cible
    est son état normal à ce stade (voir DECISIONS_NECESSITANT_CLASSE_CIBLE).
    Désactive Eleve.statut pour tous les élèves traités (comportement déjà
    existant, déplacé ici depuis l'ancien executer) et ouvre la campagne de
    réinscription (statut_reinscription = A_REINSCRIRE) pour ADMIS/REDOUBLANT/
    EN_ATTENTE_FILIERE. Ne crée AUCUNE Inscription — voir app/api/reinscription.py.
    """
    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe.classe_id,
        Inscription.statut == "ACTIVE",
        Inscription.statut_promotion == "PROPOSE",
    ).all()

    if not inscriptions:
        return {"classe": classe.libelle, "valides": 0, "bloque": False, "erreurs": []}

    # Classe d'examen : tant que le résultat du Ministère n'est pas saisi pour
    # un élève, rien ne peut être validé — son passage n'est pas décidable.
    bloquants = [
        f"{eleve.prenom} {eleve.nom} : résultat officiel du Ministère non saisi"
        for insc, eleve in inscriptions
        if insc.decision_fin_annee == "EN_ATTENTE_RESULTAT_OFFICIEL"
    ]
    bloquants += [
        f"{eleve.prenom} {eleve.nom} : classe cible non résolue"
        for insc, eleve in inscriptions
        if insc.decision_fin_annee in DECISIONS_NECESSITANT_CLASSE_CIBLE and not insc.classe_cible_id
    ]
    if bloquants:
        return {"classe": classe.libelle, "valides": 0, "bloque": True, "erreurs": bloquants}

    for insc, eleve in inscriptions:
        insc.statut_promotion = "VALIDE"
        eleve.statut = "INACTIF"
        if insc.decision_fin_annee in DECISIONS_AVEC_SUITE:
            insc.statut_reinscription = "A_REINSCRIRE"

    return {"classe": classe.libelle, "valides": len(inscriptions), "bloque": False, "erreurs": []}


@router.post("/classe/{classe_id}/valider")
def valider_promotion_classe(classe_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    resultat = _valider_classe_core(db, classe)
    if resultat["bloque"]:
        raise HTTPException(400, "Validation impossible — " + "; ".join(resultat["erreurs"]))
    db.commit()
    return resultat


@router.post("/annee/{annee_source_id}/valider-tout")
def valider_promotion_annee(annee_source_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Valide toutes les classes actives de l'année source DE CET ÉTABLISSEMENT
    en un seul appel. Les classes bloquées (filière non choisie pour au moins
    un élève) sont signalées mais n'empêchent pas la validation des autres.

    Avant le Lot 9 : validait les classes de TOUTES les écoles partageant
    cet annee_id — verrouillage définitif de promotions d'autres écoles et
    passage de leurs élèves en INACTIF.
    """
    _annee_ou_404(db, annee_source_id, etablissement_id, "Année source")
    classes = db.query(Classe).filter(
        Classe.annee_id == annee_source_id, Classe.statut == "ACTIVE",
        Classe.etablissement_id == etablissement_id,
    ).all()
    resultats = []
    total_valides = 0
    classes_bloquees = []

    for classe in classes:
        r = _valider_classe_core(db, classe)
        resultats.append(r)
        if r["bloque"]:
            classes_bloquees.append({"classe": classe.libelle, "erreurs": r["erreurs"]})
        else:
            total_valides += r["valides"]

    db.commit()
    return {
        "message": f"{total_valides} élève(s) validé(s) sur {len(classes)} classe(s)",
        "total_valides": total_valides,
        "classes_traitees": len(classes),
        "classes_bloquees": classes_bloquees,
        "detail": resultats,
    }


# ════════════════════════════════════════════════════════════
# RÉSULTATS OFFICIELS DU MINISTÈRE (classes d'examen)
# ════════════════════════════════════════════════════════════

class ResultatOfficielItem(BaseModel):
    inscription_id: int
    resultat: str            # ADMIS | NON_ADMIS
    observation: Optional[str] = None


class ResultatsOfficielsBulk(BaseModel):
    resultats: List[ResultatOfficielItem]
    saisi_par: Optional[str] = None


RESULTATS_OFFICIELS_VALIDES = ("ADMIS", "NON_ADMIS")


@router.get("/classe/{classe_id}/resultats-officiels")
def lister_resultats_officiels(
    classe_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Liste les élèves d'une classe d'examen avec leur résultat ministériel.

    Sert d'écran de saisie : tous les élèves sont retournés, ceux sans résultat
    ayant `resultat = null`.
    """
    classe = _classe_ou_404(db, classe_id, etablissement_id)
    niveau, cycle, _ = _cycle_key_pour_classe(db, classe)
    situation = _situation_niveau(db, niveau, cycle, classe.etablissement_id)

    # Attestation de fin de cycle : uniquement la DERNIÈRE section de maternelle
    # (Grande Section = aucune section au-dessus dans le cycle).
    attestation_possible = False
    if situation["evaluation_simple"] and niveau:
        section_au_dessus = db.query(Niveau.niveau_id).filter(
            Niveau.cycle_id == niveau.cycle_id, Niveau.ordre > niveau.ordre
        ).first()
        attestation_possible = section_au_dessus is None

    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE",
    ).order_by(Eleve.nom, Eleve.prenom).all()

    officiels = _resultats_officiels_bulk(db, [i.inscription_id for i, _ in inscriptions])

    return {
        "classe": {"classe_id": classe.classe_id, "libelle": classe.libelle},
        "classe_examen": situation["est_examen"],
        "evaluation_simple": situation["evaluation_simple"],
        "attestation_possible": attestation_possible,
        "examen_national": situation["examen_national"],
        "eleves": [
            {
                "inscription_id": insc.inscription_id,
                "eleve_id": eleve.eleve_id,
                "nom": eleve.nom,
                "prenom": eleve.prenom,
                "matricule": eleve.matricule,
                # Indicateur pédagogique uniquement : ne décide pas du passage
                "moyenne_annuelle": float(insc.moyenne_annuelle) if insc.moyenne_annuelle is not None else None,
                "resultat": officiels[insc.inscription_id].resultat if insc.inscription_id in officiels else None,
                "observation": officiels[insc.inscription_id].observation if insc.inscription_id in officiels else None,
                "date_saisie": officiels[insc.inscription_id].date_saisie if insc.inscription_id in officiels else None,
            }
            for insc, eleve in inscriptions
        ],
    }


@router.post("/resultats-officiels/bulk")
def saisir_resultats_officiels(
    data: ResultatsOfficielsBulk,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Enregistre les résultats du Ministère pour toute une classe d'examen.

    Rejouable : un résultat déjà saisi pour une inscription est mis à jour.

    Chaque inscription du lot est vérifiée, pas seulement la première : c'est
    en ne contrôlant que le premier élément qu'un intrus glissé en 2ᵉ position
    passait ailleurs dans ce projet.
    """
    invalides = [r.resultat for r in data.resultats if r.resultat not in RESULTATS_OFFICIELS_VALIDES]
    if invalides:
        raise HTTPException(
            400,
            f"Résultat invalide {sorted(set(invalides))} — valeurs acceptées : {list(RESULTATS_OFFICIELS_VALIDES)}",
        )
    if not data.resultats:
        return {"message": "Aucun résultat à enregistrer", "enregistres": 0}

    inscription_ids = [r.inscription_id for r in data.resultats]
    # Jointure sur Classe : une inscription d'une autre école ne remonte pas,
    # et tombe donc dans « introuvables » — 404, sans révéler qu'elle existe.
    inscriptions = {
        i.inscription_id: i
        for i in db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(
            Inscription.inscription_id.in_(inscription_ids),
            Classe.etablissement_id == etablissement_id,
        ).all()
    }
    manquantes = set(inscription_ids) - set(inscriptions)
    if manquantes:
        raise HTTPException(404, f"Inscriptions introuvables : {sorted(manquantes)}")

    # Le niveau porte le nom de l'examen (CEE/BEPC/BAC) : copié sur le résultat
    # pour garder une trace même si la configuration change ensuite.
    classe_ids = {i.classe_id for i in inscriptions.values()}
    niveaux_par_classe = {}
    for c in db.query(Classe).filter(Classe.classe_id.in_(classe_ids)).all():
        niveaux_par_classe[c.classe_id] = db.query(Niveau).filter(
            Niveau.niveau_id == c.niveau_id
        ).first()

    existants = _resultats_officiels_bulk(db, inscription_ids)
    enregistres = 0
    for item in data.resultats:
        insc = inscriptions[item.inscription_id]
        niveau = niveaux_par_classe.get(insc.classe_id)
        existant = existants.get(item.inscription_id)
        if existant:
            existant.resultat = item.resultat
            existant.observation = item.observation
            existant.saisi_par = data.saisi_par
        else:
            db.add(ResultatOfficielExamen(
                inscription_id=item.inscription_id,
                examen_national=niveau.examen_national if niveau else None,
                resultat=item.resultat,
                saisi_par=data.saisi_par,
                observation=item.observation,
            ))
        enregistres += 1

    # Écrire les résultats dans la transaction AVANT de recalculer : le calcul
    # relit les résultats officiels par requête (_resultats_officiels_bulk), et
    # la session ne fait pas d'autoflush — sans ce flush, il recalculerait sur
    # l'état d'avant la saisie et laisserait la décision « en attente ».
    db.flush()

    # ── Appliquer immédiatement la décision de passage ──
    # Enregistrer un résultat officiel ne suffisait pas : la décision restait
    # « en attente du résultat officiel » et la validation de la classe restait
    # bloquée tant qu'on ne relançait pas manuellement le calcul. Ici, pour
    # chaque classe DÉJÀ calculée (statut_promotion posé et non VALIDE), on
    # rejoue le calcul de la classe — même fonction que /calculer-resultats,
    # donc aucune divergence de logique — pour que DIPLÔMÉ / REDOUBLANT
    # s'applique tout de suite à partir du résultat qu'on vient de saisir.
    # Une classe déjà VALIDÉE (définitive) n'est jamais retouchée : le core
    # l'exclut, et on ne la sélectionne même pas.
    classes_a_recalculer: Dict[int, int] = {}
    for insc in inscriptions.values():
        if insc.statut_promotion and insc.statut_promotion != "VALIDE":
            classes_a_recalculer.setdefault(insc.classe_id, insc.annee_id)

    recalculees = 0
    for cid, annee_source_id in classes_a_recalculer.items():
        classe = db.query(Classe).filter(Classe.classe_id == cid).first()
        if not classe:
            continue
        annee_cible_id = _annee_suivante_id(db, classe.etablissement_id, annee_source_id)
        if not annee_cible_id:
            continue
        _calculer_resultats_classe_core(db, classe, annee_cible_id, {})
        recalculees += 1

    db.commit()

    if recalculees:
        rappel = ("Décisions de passage appliquées automatiquement "
                  f"({recalculees} classe(s) recalculée(s)) — vous pouvez valider la promotion.")
    else:
        rappel = "Relancez le calcul des résultats de la classe pour appliquer ces décisions."
    return {
        "message": f"{enregistres} résultat(s) officiel(s) enregistré(s)",
        "enregistres": enregistres,
        "classes_recalculees": recalculees,
        "rappel": rappel,
    }


# ── Import d'un fichier de résultats d'examen national ──────────────────
# Une classe d'examen, c'est 40 à 120 élèves dont le résultat arrive sous forme
# de liste préfectorale. Les ressaisir un par un dans un menu déroulant est à la
# fois long et une source d'erreur qu'on ne détecte qu'au moment du litige.

# Ce que l'école peut écrire dans la colonne résultat. On accepte largement :
# le fichier reçu n'est pas normalisé, et refuser "Admise" au motif que le
# gabarit dit "ADMIS" ferait perdre plus de temps que la saisie manuelle.
_SYNONYMES_RESULTAT = {
    "ADMIS": ("admis", "admise", "adm", "a", "oui", "o", "1", "reussi", "reussie",
              "succes", "passe", "passee", "recu", "recue"),
    "NON_ADMIS": ("non admis", "non admise", "non_admis", "nonadmis", "refuse",
                  "refusee", "echec", "echoue", "n", "non", "0", "ajourne",
                  "ajournee", "recale", "recalee"),
}


def _normaliser_resultat(brut: str) -> Optional[str]:
    """Traduit ce qu'a écrit l'école en ADMIS / NON_ADMIS, ou None si illisible."""
    from app.services.import_tabulaire import normaliser_entete
    v = normaliser_entete(brut).replace("-", " ").replace("_", " ")
    for canonique, variantes in _SYNONYMES_RESULTAT.items():
        if v in variantes or v.replace(" ", "") in [x.replace(" ", "") for x in variantes]:
            return canonique
    return None


@router.get("/classe/{classe_id}/resultats-officiels/modele")
def modele_import_resultats_officiels(
    classe_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Modèle CSV pré-rempli avec la liste réelle des élèves de la classe.

    L'école n'a plus qu'à compléter la colonne RESULTAT : les matricules sont
    déjà les bons, ce qui supprime la principale cause de lignes non
    rapprochées à l'import.
    """
    from fastapi.responses import Response
    import csv as _csv, io as _io

    classe = _classe_ou_404(db, classe_id, etablissement_id)

    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE",
    ).order_by(Eleve.nom, Eleve.prenom).all()

    tampon = _io.StringIO()
    # `;` et BOM UTF-8 : c'est ce qu'attend Excel en configuration française,
    # sinon le fichier s'ouvre avec tout sur une seule colonne.
    writer = _csv.writer(tampon, delimiter=";")
    writer.writerow(["MATRICULE", "NOM", "PRENOM", "RESULTAT", "OBSERVATION"])
    for insc, eleve in inscriptions:
        writer.writerow([eleve.matricule or "", eleve.nom or "", eleve.prenom or "", "", ""])

    nom_fichier = f"resultats_{classe.libelle}.csv".replace(" ", "_")
    return Response(
        content="﻿" + tampon.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nom_fichier}"'},
    )


@router.post("/classe/{classe_id}/resultats-officiels/import")
async def importer_resultats_officiels(
    classe_id: int,
    fichier: UploadFile = File(...),
    dry_run: bool = True,
    saisi_par: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Importe les résultats d'examen national d'une classe depuis un fichier.

    `dry_run=true` (défaut) analyse sans rien écrire et renvoie exactement ce
    qui serait appliqué : on ne remplace pas un résultat officiel déjà saisi
    sans que l'école ait vu le rapport d'abord.

    Rapprochement par matricule, puis à défaut par nom + prénom. Toute ligne
    non rapprochée ou dont le résultat est illisible est remontée nommément —
    jamais ignorée en silence.
    """
    from app.services.import_tabulaire import (
        FichierIllisible, lire_lignes, normaliser_entete, valeur,
    )

    classe = _classe_ou_404(db, classe_id, etablissement_id)
    niveau, cycle, _ = _cycle_key_pour_classe(db, classe)
    situation = _situation_niveau(db, niveau, cycle, classe.etablissement_id)
    if not situation["est_examen"]:
        raise HTTPException(
            400,
            f"{classe.libelle} n'est pas une classe d'examen national — "
            "aucun résultat ministériel à importer.",
        )

    contenu = await fichier.read()
    try:
        _, lignes = lire_lignes(fichier.filename, contenu)
    except FichierIllisible as e:
        raise HTTPException(400, str(e))
    if not lignes:
        raise HTTPException(400, "Le fichier ne contient aucune ligne de données.")

    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE",
    ).all()
    par_matricule = {
        normaliser_entete(e.matricule): (i, e) for i, e in inscriptions if e.matricule
    }
    par_nom = {}
    for i, e in inscriptions:
        cle = normaliser_entete(f"{e.nom} {e.prenom}")
        # Deux homonymes exacts : on refuse de deviner lequel des deux.
        par_nom[cle] = None if cle in par_nom else (i, e)

    existants = _resultats_officiels_bulk(db, [i.inscription_id for i, _ in inscriptions])

    a_appliquer, ignorees = {}, []
    for numero, ligne in enumerate(lignes, start=2):  # 1 = ligne d'en-tête
        matricule = valeur(ligne, "matricule", "n matricule", "no matricule",
                           "numero", "numero matricule", "code eleve")
        nom = valeur(ligne, "nom", "nom de l eleve", "nom eleve")
        prenom = valeur(ligne, "prenom", "prenoms", "prenom de l eleve")
        brut = valeur(ligne, "resultat", "resultat final", "decision", "mention",
                      "admis", "statut")

        cible = par_matricule.get(normaliser_entete(matricule)) if matricule else None
        if cible is None and (nom or prenom):
            cible = par_nom.get(normaliser_entete(f"{nom} {prenom}"))
        identite = " ".join(x for x in [matricule, nom, prenom] if x) or "(ligne vide)"

        if cible is None:
            ignorees.append({"ligne": numero, "eleve": identite,
                             "raison": "élève non trouvé dans cette classe"})
            continue
        resultat = _normaliser_resultat(brut)
        if resultat is None:
            ignorees.append({
                "ligne": numero, "eleve": identite,
                "raison": f"résultat illisible : « {brut} »" if brut else "résultat non renseigné",
            })
            continue

        insc, eleve = cible
        if insc.inscription_id in a_appliquer:
            ignorees.append({"ligne": numero, "eleve": identite,
                             "raison": "élève présent plusieurs fois dans le fichier"})
            continue
        ancien = existants.get(insc.inscription_id)
        a_appliquer[insc.inscription_id] = {
            "ligne": numero,
            "inscription_id": insc.inscription_id,
            "matricule": eleve.matricule,
            "eleve": f"{eleve.nom} {eleve.prenom}",
            "resultat": resultat,
            "observation": valeur(ligne, "observation", "remarque", "commentaire") or None,
            "ancien_resultat": ancien.resultat if ancien else None,
            "remplace": bool(ancien and ancien.resultat != resultat),
        }

    manquants = [
        {"inscription_id": i.inscription_id, "matricule": e.matricule,
         "eleve": f"{e.nom} {e.prenom}"}
        for i, e in inscriptions
        if i.inscription_id not in a_appliquer and i.inscription_id not in existants
    ]

    rapport = {
        "classe": classe.libelle,
        "examen_national": situation["examen_national"],
        "fichier": fichier.filename,
        "lignes_lues": len(lignes),
        "a_appliquer": len(a_appliquer),
        "remplacements": sum(1 for v in a_appliquer.values() if v["remplace"]),
        "admis": sum(1 for v in a_appliquer.values() if v["resultat"] == "ADMIS"),
        "non_admis": sum(1 for v in a_appliquer.values() if v["resultat"] == "NON_ADMIS"),
        "details": sorted(a_appliquer.values(), key=lambda d: d["ligne"]),
        "ignorees": ignorees,
        "eleves_sans_resultat": manquants,
        "dry_run": dry_run,
    }

    if dry_run:
        rapport["message"] = (
            f"{len(a_appliquer)} résultat(s) prêt(s) à être importé(s), "
            f"{len(ignorees)} ligne(s) ignorée(s). Rien n'a été enregistré."
        )
        return rapport

    if not a_appliquer:
        raise HTTPException(400, "Aucune ligne exploitable : rien à importer.")

    for item in a_appliquer.values():
        existant = existants.get(item["inscription_id"])
        if existant:
            existant.resultat = item["resultat"]
            existant.observation = item["observation"]
            existant.saisi_par = saisi_par
        else:
            db.add(ResultatOfficielExamen(
                inscription_id=item["inscription_id"],
                examen_national=niveau.examen_national if niveau else None,
                resultat=item["resultat"],
                saisi_par=saisi_par,
                observation=item["observation"],
            ))
    db.commit()

    rapport["message"] = (
        f"{len(a_appliquer)} résultat(s) importé(s) pour {classe.libelle}."
    )
    rapport["rappel"] = "Relancez le calcul des résultats de la classe pour appliquer ces décisions."
    return rapport


@router.get("/annee/{annee_id}/etat")
def etat_promotion_annee(annee_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Vue d'ensemble en lecture seule de l'avancement de la promotion pour
    toutes les classes actives de l'année DE CET ÉTABLISSEMENT — alimente
    l'assistant de clôture (Phase 4) sans qu'il ait à interroger chaque
    classe individuellement (règle N+1 déjà établie sur ce projet).
    """
    _annee_ou_404(db, annee_id, etablissement_id)
    classes = db.query(Classe).filter(
        Classe.annee_id == annee_id, Classe.statut == "ACTIVE",
        Classe.etablissement_id == etablissement_id,
    ).all()

    detail = []
    total = {"eleves": 0, "calcules": 0, "valides": 0, "sans_classe_cible": 0, "en_attente_filiere": 0}
    for classe in classes:
        inscriptions = db.query(Inscription).filter(
            Inscription.classe_id == classe.classe_id, Inscription.statut == "ACTIVE"
        ).all()
        calcules = sum(1 for i in inscriptions if i.statut_promotion is not None)
        valides = sum(1 for i in inscriptions if i.statut_promotion == "VALIDE")
        # Cas réellement bloquant pour `valider` (ex: classes cibles pas préparées) —
        # EN_ATTENTE_FILIERE exclu, voir DECISIONS_NECESSITANT_CLASSE_CIBLE.
        sans_classe_cible = sum(
            1 for i in inscriptions
            if i.statut_promotion == "PROPOSE"
            and i.decision_fin_annee in DECISIONS_NECESSITANT_CLASSE_CIBLE and not i.classe_cible_id
        )
        # Purement informatif — ne bloque jamais `valider`, résolu plus tard à la réinscription.
        en_attente_filiere = sum(
            1 for i in inscriptions
            if i.decision_fin_annee == "EN_ATTENTE_FILIERE" and not i.classe_cible_id
        )
        detail.append({
            "classe_id": classe.classe_id, "libelle": classe.libelle,
            "total_eleves": len(inscriptions), "calcules": calcules,
            "valides": valides, "sans_classe_cible": sans_classe_cible,
            "en_attente_filiere": en_attente_filiere,
        })
        total["eleves"] += len(inscriptions)
        total["calcules"] += calcules
        total["valides"] += valides
        total["sans_classe_cible"] += sans_classe_cible
        total["en_attente_filiere"] += en_attente_filiere

    classes_entierement_calculees = sum(1 for d in detail if d["total_eleves"] > 0 and d["calcules"] == d["total_eleves"])
    classes_entierement_validees = sum(1 for d in detail if d["total_eleves"] > 0 and d["valides"] == d["total_eleves"])

    return {
        "classes": detail,
        "total_classes": len(classes),
        "classes_entierement_calculees": classes_entierement_calculees,
        "classes_entierement_validees": classes_entierement_validees,
        **total,
    }


@router.post("/annee/{annee_cible_id}/preparer-classes")
def preparer_classes_annee(annee_cible_id: int, annee_source_id: int, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Clone la structure des classes (niveau, code, libellé, capacité) d'une
    année source vers une année cible, sans copier salle ni professeur
    principal (à réassigner consciemment pour la nouvelle année). Nécessaire
    avant de pouvoir calculer des résultats/valider une promotion : les
    classes de l'année cible doivent exister pour que la classe cible de
    chaque élève puisse être résolue. Idempotent : ignore les niveaux déjà
    présents dans l'année cible.

    CONTAMINATION CROSS-TENANT CORRIGÉE AU LOT 9 (identifiée dès l'audit
    initial) : ni l'année source ni l'année cible n'étaient vérifiées, et les
    classes clonées reprenaient `etablissement_id=c.etablissement_id` — celui
    de la SOURCE. Un admin de l'école A pouvait donc cloner la structure de
    l'école B dans son année, en créant des classes appartenant à B : de la
    donnée d'une école écrite dans le périmètre d'une autre, pas seulement
    une fuite en lecture. Les deux années sont désormais vérifiées, les
    classes source filtrées, et l'établissement de destination est celui de
    l'appelant.
    """
    annee_cible = _annee_ou_404(db, annee_cible_id, etablissement_id, "Année cible")
    _annee_ou_404(db, annee_source_id, etablissement_id, "Année source")

    classes_source = db.query(Classe).filter(
        Classe.annee_id == annee_source_id,
        Classe.statut == "ACTIVE",
        Classe.etablissement_id == etablissement_id,
    ).all()

    niveaux_existants = {
        c.niveau_id for c in db.query(Classe).filter(
            Classe.annee_id == annee_cible_id, Classe.statut == "ACTIVE",
            Classe.etablissement_id == etablissement_id,
        ).all()
    }

    created = 0
    for c in classes_source:
        if c.niveau_id in niveaux_existants:
            continue
        db.add(Classe(
            etablissement_id=etablissement_id,
            annee_id=annee_cible_id,
            niveau_id=c.niveau_id,
            salle_id=None,
            code=c.code,
            libelle=c.libelle,
            capacite_max=c.capacite_max,
            effectif_actuel=0,
            professeur_principal=None,
            statut="ACTIVE",
        ))
        niveaux_existants.add(c.niveau_id)
        created += 1

    # ── Classes d'accueil des élèves promus ──
    # Cloner ne recrée que les niveaux DÉJÀ présents. Or un élève admis monte
    # d'un niveau : il lui faut une classe du niveau SUPÉRIEUR dans l'année
    # cible, sinon sa classe cible reste « non résolue » et la validation de la
    # promotion se bloque. Sur une école complète, ce niveau existe déjà (donc
    # rien à faire) ; sur une école à l'échelle trouée (ex. une 2ᵉ année sans
    # 3ᵉ année), on crée la classe manquante ici. On ne regarde qu'un niveau
    # au-dessus : un élève ne saute jamais plus d'une marche par année.
    # La frontière Collège→Lycée (10ᵉ) renvoie None (choix de série fait à la
    # réinscription) : pas de création automatique, c'est voulu.
    for c in classes_source:
        niveau = db.query(Niveau).filter(Niveau.niveau_id == c.niveau_id).first()
        if not niveau:
            continue
        suivant = _niveau_suivant(db, niveau)
        if not suivant or suivant.niveau_id in niveaux_existants:
            continue
        code, libelle = _code_et_libelle_libres(
            db, etablissement_id, annee_cible_id, suivant.code, suivant.libelle
        )
        db.add(Classe(
            etablissement_id=etablissement_id,
            annee_id=annee_cible_id,
            niveau_id=suivant.niveau_id,
            salle_id=None,
            code=code,
            libelle=libelle,
            capacite_max=c.capacite_max or 30,
            effectif_actuel=0,
            professeur_principal=None,
            statut="ACTIVE",
        ))
        niveaux_existants.add(suivant.niveau_id)
        created += 1

    db.commit()
    return {"message": f"{created} classe(s) créée(s) pour {annee_cible.libelle}", "created": created}


# ════════════════════════════════════════════════════════════
# ATTESTATION DE FIN DE CYCLE — MATERNELLE (Grande Section)
# ════════════════════════════════════════════════════════════

@router.get("/attestation-maternelle/{inscription_id}")
def attestation_maternelle(
    inscription_id: int,
    directeur: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Attestation premium de fin de cycle maternelle (Grande Section, admis).

    Délivrée à un enfant de Grande Section déclaré ADMIS par son enseignant :
    elle atteste la fin du cycle et le passage en 1ère année. `directeur`
    permet de préciser le nom du directeur du cycle (sinon celui de l'école).
    """
    import io
    import os
    from datetime import date as _date
    from fastapi.responses import StreamingResponse
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader
    from app.models.academique import Etablissement

    ligne = (
        db.query(Inscription, Eleve, Classe, Niveau, Cycle, AnneeScolaire)
        .join(Eleve, Inscription.eleve_id == Eleve.eleve_id)
        .join(Classe, Inscription.classe_id == Classe.classe_id)
        .join(Niveau, Classe.niveau_id == Niveau.niveau_id)
        .join(Cycle, Niveau.cycle_id == Cycle.cycle_id)
        .join(AnneeScolaire, Inscription.annee_id == AnneeScolaire.annee_id)
        .filter(
            Inscription.inscription_id == inscription_id,
            Classe.etablissement_id == etablissement_id,
        )
        .first()
    )
    if not ligne:
        raise HTTPException(404, "Inscription introuvable.")
    insc, eleve, classe, niveau, cycle, annee = ligne

    if niveau.evaluation_simple != "O" or cycle.code != "MAT":
        raise HTTPException(400, "L'attestation ne concerne que la maternelle.")
    # Grande Section = dernière section (aucune section au-dessus dans le cycle).
    section_au_dessus = db.query(Niveau.niveau_id).filter(
        Niveau.cycle_id == cycle.cycle_id, Niveau.ordre > niveau.ordre
    ).first()
    if section_au_dessus:
        raise HTTPException(400, "L'attestation de fin de cycle ne se délivre qu'en Grande Section.")

    officiel = db.query(ResultatOfficielExamen).filter(
        ResultatOfficielExamen.inscription_id == inscription_id
    ).first()
    if not officiel or officiel.resultat != "ADMIS":
        raise HTTPException(400, "L'attestation n'est délivrée qu'aux enfants ADMIS (résultat non saisi ou non admis).")

    etab = db.query(Etablissement).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    nom_directeur = (directeur or "").strip() or (etab.directeur if etab and etab.directeur else "La Direction")
    ville = (etab.ville if etab and etab.ville else "") or ""

    # ── Rendu premium ──────────────────────────────────────────────
    buffer = io.BytesIO()
    largeur, hauteur = A4
    pdf = canvas.Canvas(buffer, pagesize=A4)

    OR_FONCE = HexColor("#8a6d1a")   # or profond
    OR_CLAIR = HexColor("#c9a227")
    NAVY = HexColor("#0f2942")
    GRIS = HexColor("#475569")

    # Double filet décoratif
    pdf.setStrokeColor(OR_CLAIR); pdf.setLineWidth(3)
    pdf.rect(1.1 * cm, 1.1 * cm, largeur - 2.2 * cm, hauteur - 2.2 * cm)
    pdf.setStrokeColor(NAVY); pdf.setLineWidth(0.8)
    pdf.rect(1.4 * cm, 1.4 * cm, largeur - 2.8 * cm, hauteur - 2.8 * cm)

    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    def _chemin_image(url):
        if not url:
            return None
        p = os.path.join(backend_root, url.lstrip("/").replace("/", os.sep))
        return p if os.path.exists(p) else None

    y = hauteur - 2.6 * cm
    logo = _chemin_image(etab.logo_url if etab else None)
    if logo:
        try:
            pdf.drawImage(ImageReader(logo), largeur / 2 - 1.1 * cm, y - 1.2 * cm,
                          width=2.2 * cm, height=2.2 * cm, mask="auto", preserveAspectRatio=True)
            y -= 2.6 * cm
        except Exception:
            pass

    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawCentredString(largeur / 2, y, (etab.nom if etab else "SmartSchool").upper())
    y -= 0.7 * cm
    if ville:
        pdf.setFont("Helvetica", 10.5); pdf.setFillColor(GRIS)
        pdf.drawCentredString(largeur / 2, y, ville)
        y -= 0.5 * cm

    y -= 0.9 * cm
    pdf.setFillColor(OR_FONCE)
    pdf.setFont("Helvetica-Bold", 26)
    pdf.drawCentredString(largeur / 2, y, "ATTESTATION")
    y -= 0.95 * cm
    pdf.setFont("Helvetica-Bold", 14); pdf.setFillColor(NAVY)
    pdf.drawCentredString(largeur / 2, y, "DE FIN DE CYCLE — MATERNELLE")
    y -= 0.5 * cm
    pdf.setStrokeColor(OR_CLAIR); pdf.setLineWidth(1.2)
    pdf.line(largeur / 2 - 3.5 * cm, y, largeur / 2 + 3.5 * cm, y)

    # Corps
    y -= 1.6 * cm
    pdf.setFillColor(HexColor("#1e293b"))
    prenom_nom = f"{eleve.prenom} {eleve.nom}".strip()
    dob = eleve.date_naissance.strftime("%d/%m/%Y") if eleve.date_naissance else "—"
    lieu = eleve.lieu_naissance or "—"

    def _para(lignes, taille=12.5, interligne=0.72):
        nonlocal y
        pdf.setFont("Helvetica", taille)
        for txt in lignes:
            pdf.drawCentredString(largeur / 2, y, txt)
            y -= interligne * cm

    _para([
        f"Je soussigné(e), {nom_directeur}, Directeur/Directrice du cycle,",
        "atteste que l'enfant :",
    ])
    y -= 0.3 * cm
    pdf.setFont("Helvetica-Bold", 17); pdf.setFillColor(OR_FONCE)
    pdf.drawCentredString(largeur / 2, y, prenom_nom.upper())
    y -= 0.9 * cm
    pdf.setFillColor(HexColor("#1e293b"))
    _para([
        f"né(e) le {dob} à {lieu},",
        f"a suivi et achevé avec succès la Grande Section de la Maternelle",
        f"durant l'année scolaire {annee.libelle}.",
    ])
    y -= 0.4 * cm
    pdf.setFont("Helvetica-Bold", 13); pdf.setFillColor(NAVY)
    pdf.drawCentredString(largeur / 2, y, "L'enfant est admis(e) à passer en Première Année du Primaire.")
    y -= 1.0 * cm
    if officiel.observation:
        pdf.setFont("Helvetica-Oblique", 11); pdf.setFillColor(GRIS)
        pdf.drawCentredString(largeur / 2, y, f"Appréciation : {officiel.observation[:120]}")
        y -= 0.8 * cm

    # Date + signature
    y_sign = 4.4 * cm
    pdf.setFont("Helvetica", 11); pdf.setFillColor(GRIS)
    date_txt = _date.today().strftime("%d/%m/%Y")
    lieu_date = f"Fait à {ville}, le {date_txt}" if ville else f"Fait le {date_txt}"
    pdf.drawRightString(largeur - 2.2 * cm, y_sign + 1.4 * cm, lieu_date)

    pdf.setFont("Helvetica-Bold", 11.5); pdf.setFillColor(NAVY)
    pdf.drawRightString(largeur - 2.2 * cm, y_sign, "Le Directeur du cycle")
    pdf.setFont("Helvetica", 11); pdf.setFillColor(HexColor("#1e293b"))
    pdf.drawRightString(largeur - 2.2 * cm, y_sign - 0.55 * cm, nom_directeur)

    cachet = _chemin_image(etab.cachet_url if etab else None)
    if cachet:
        try:
            pdf.drawImage(ImageReader(cachet), largeur - 6.0 * cm, y_sign - 0.4 * cm,
                          width=3 * cm, height=3 * cm, mask="auto", preserveAspectRatio=True)
        except Exception:
            pass

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    nom_fichier = f"attestation_maternelle_{prenom_nom.replace(' ', '_')}.pdf"
    return StreamingResponse(
        buffer, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nom_fichier}"'},
    )
