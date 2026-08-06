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
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, Dict, List
from pydantic import BaseModel

from app.core.database import get_db
from app.models.academique import (
    Classe, Niveau, Cycle, Inscription, Eleve, AnneeScolaire,
    Bulletin, BulletinLigne, ParametreEtablissement,
)

router = APIRouter(prefix="/api/promotion", tags=["Promotion & Clôture d'année"])

CODE_CYCLE_KEY = {"PRM": "primaire", "CLG": "college", "LYC": "lycee"}
DECISIONS_VALIDES = ("ADMIS", "REDOUBLANT", "EN_ATTENTE_FILIERE", "EXCLU", "DIPLOME")
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


def _cycle_key_pour_classe(db: Session, classe: Classe):
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first() if niveau else None
    cycle_key = CODE_CYCLE_KEY.get(cycle.code if cycle else "", "college")
    return niveau, cycle, cycle_key


def _resultats_annuels_bulk(db: Session, inscription_ids: List[int]) -> Dict[int, dict]:
    """
    Calcule, pour un lot d'inscriptions, la moyenne annuelle pondérée et le
    total de points : agrège les BulletinLigne (déjà produites par
    calculer_moyennes, evaluations.py) de tous les trimestres de l'inscription,
    moyenne chaque matière sur les trimestres où elle apparaît, pondère par son
    coefficient. Une seule requête pour tout le lot (jamais de requête par
    élève dans une boucle — voir la règle N+1 documentée dans la mémoire projet).
    """
    if not inscription_ids:
        return {}
    rows = db.query(BulletinLigne, Bulletin.inscription_id).join(
        Bulletin, BulletinLigne.bulletin_id == Bulletin.bulletin_id
    ).filter(
        Bulletin.inscription_id.in_(inscription_ids),
        BulletinLigne.moyenne_matiere.isnot(None),
    ).all()

    par_inscription: Dict[int, Dict[int, List[tuple]]] = {}
    for ligne, inscription_id in rows:
        par_matiere = par_inscription.setdefault(inscription_id, {})
        par_matiere.setdefault(ligne.matiere_id, []).append(
            (float(ligne.moyenne_matiere), float(ligne.coefficient or 1))
        )

    resultats: Dict[int, dict] = {}
    for inscription_id, par_matiere in par_inscription.items():
        total_points = 0.0
        total_coef = 0.0
        for valeurs in par_matiere.values():
            moyenne_matiere_annuelle = sum(v for v, _ in valeurs) / len(valeurs)
            coef = valeurs[-1][1]  # coefficient le plus récent (constant sur l'année en pratique)
            total_points += moyenne_matiere_annuelle * coef
            total_coef += coef
        if total_coef > 0:
            resultats[inscription_id] = {
                "moyenne": round(total_points / total_coef, 2),
                "total_points": round(total_points, 2),
            }
    return resultats


@router.get("/classe/{classe_id}/apercu")
def apercu_cloture_classe(classe_id: int, db: Session = Depends(get_db)):
    """
    Aperçu de la situation de fin d'année pour chaque élève de la classe. Si
    `calculer-resultats` a déjà tourné pour cette classe, lit l'état persisté
    (source de vérité une fois calculé) ; sinon calcule à la volée sans rien
    écrire (aperçu avant le tout premier calcul).
    """
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    niveau, cycle, cycle_key = _cycle_key_pour_classe(db, classe)
    if not niveau:
        raise HTTPException(404, "Niveau introuvable pour cette classe")

    redoublement_actif = _get_notation_param(db, classe.etablissement_id, f"notation.redoublement_actif.{cycle_key}", False)
    seuil = _get_notation_param(db, classe.etablissement_id, f"notation.seuil_redoublement.{cycle_key}", 10.0)
    niveau_suivant = _niveau_suivant(db, niveau)
    est_frontiere_lycee = bool(cycle and cycle.code == "CLG" and niveau.ordre == 4)
    est_terminal = bool(cycle and cycle.code == "LYC" and niveau.ordre + 3 > 19)

    inscriptions = db.query(Inscription, Eleve).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE",
    ).order_by(Eleve.nom, Eleve.prenom).all()

    deja_calcule = any(insc.statut_promotion for insc, _ in inscriptions)
    resultats_calc = {} if deja_calcule else _resultats_annuels_bulk(
        db, [insc.inscription_id for insc, _ in inscriptions]
    )

    eleves = []
    for insc, eleve in inscriptions:
        if deja_calcule:
            moyenne, total_points, rang = insc.moyenne_annuelle, insc.total_points, insc.rang_final
            moyenne = float(moyenne) if moyenne is not None else None
            total_points = float(total_points) if total_points is not None else None
            decision = insc.decision_fin_annee
        else:
            r = resultats_calc.get(insc.inscription_id, {})
            moyenne, total_points, rang = r.get("moyenne"), r.get("total_points"), None
            if est_terminal:
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
        })

    return {
        "classe": {"classe_id": classe.classe_id, "libelle": classe.libelle},
        "niveau_suivant": {"niveau_id": niveau_suivant.niveau_id, "libelle": niveau_suivant.libelle} if niveau_suivant else None,
        "frontiere_lycee": est_frontiere_lycee,
        "terminal": est_terminal,
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
    redoublement_actif = _get_notation_param(db, classe.etablissement_id, f"notation.redoublement_actif.{cycle_key}", False)
    seuil = _get_notation_param(db, classe.etablissement_id, f"notation.seuil_redoublement.{cycle_key}", 10.0)
    niveau_suivant = _niveau_suivant(db, niveau) if niveau else None
    est_frontiere_lycee = bool(cycle and cycle.code == "CLG" and niveau.ordre == 4)
    est_terminal = bool(cycle and cycle.code == "LYC" and niveau.ordre + 3 > 19)

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

    resume = {"proposes": 0, "en_attente_filiere": 0, "exclus": 0, "diplomes": 0}

    for rang_idx, (insc, eleve) in enumerate(inscriptions_triees):
        r = resultats_calc.get(insc.inscription_id, {})
        moyenne, total_points = r.get("moyenne"), r.get("total_points")

        if est_terminal:
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

        if decision == "DIPLOME":
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
def calculer_resultats_classe(classe_id: int, data: CalculerResultatsRequest, db: Session = Depends(get_db)):
    """Calcule et persiste les résultats/proposition de promotion pour une classe (voir _calculer_resultats_classe_core)."""
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    annee_cible = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == data.annee_cible_id).first()
    if not annee_cible:
        raise HTTPException(404, "Année cible non trouvée")

    resultat = _calculer_resultats_classe_core(db, classe, data.annee_cible_id, {})
    db.commit()
    return resultat


@router.post("/annee/{annee_source_id}/calculer-resultats-tout")
def calculer_resultats_annee(annee_source_id: int, data: CalculerResultatsRequest, db: Session = Depends(get_db)):
    """Calcule et persiste les résultats/proposition pour TOUTES les classes actives de l'année source en un seul appel."""
    annee_cible = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == data.annee_cible_id).first()
    if not annee_cible:
        raise HTTPException(404, "Année cible non trouvée")

    classes = db.query(Classe).filter(Classe.annee_id == annee_source_id, Classe.statut == "ACTIVE").all()
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
def override_decision(inscription_id: int, data: DecisionOverrideRequest, db: Session = Depends(get_db)):
    """
    Override manuel par élève — notamment pour forcer EXCLU (jamais calculé
    automatiquement, décision Phase 1). Nécessite que calculer-resultats ait
    déjà tourné pour cette inscription (statut_promotion non NULL) et qu'elle
    ne soit pas encore validée.
    """
    if data.decision not in DECISIONS_VALIDES:
        raise HTTPException(400, f"Décision invalide — attendu l'une de : {', '.join(DECISIONS_VALIDES)}")
    insc = db.query(Inscription).filter(Inscription.inscription_id == inscription_id).first()
    if not insc:
        raise HTTPException(404, "Inscription non trouvée")
    if insc.statut_promotion is None:
        raise HTTPException(400, "Calculez d'abord les résultats de la classe avant d'ajuster une décision")
    if insc.statut_promotion == "VALIDE":
        raise HTTPException(400, "Promotion déjà validée pour cet élève — non modifiable")

    insc.decision_fin_annee = data.decision
    if data.decision in ("EXCLU", "DIPLOME"):
        insc.niveau_cible_id = None
        insc.classe_cible_id = None
    elif data.classe_cible_id:
        cible = db.query(Classe).filter(Classe.classe_id == data.classe_cible_id).first()
        if not cible:
            raise HTTPException(404, "Classe cible non trouvée")
        insc.classe_cible_id = cible.classe_id
        insc.niveau_cible_id = cible.niveau_id

    db.commit()
    return {"message": f"Décision mise à jour : {data.decision}"}


class ChoisirFiliereRequest(BaseModel):
    niveau_id: int  # niveau Lycée choisi (11SE/11SM/11SS...)
    annee_cible_id: int


@router.put("/eleve/{inscription_id}/choisir-filiere")
def choisir_filiere(inscription_id: int, data: ChoisirFiliereRequest, db: Session = Depends(get_db)):
    """
    Résout la classe cible une fois la série Lycée choisie pour un élève
    EN_ATTENTE_FILIERE. Opération de RÉINSCRIPTION, pas de promotion — appelée
    normalement APRÈS que `valider` ait déjà verrouillé la promotion (statut_promotion
    == VALIDE est l'état attendu ici, pas un blocage). Seul un élève déjà
    matérialisé (REINSCRIT) ne peut plus changer de filière.
    """
    insc = db.query(Inscription).filter(Inscription.inscription_id == inscription_id).first()
    if not insc:
        raise HTTPException(404, "Inscription non trouvée")
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

    bloquants = [
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
def valider_promotion_classe(classe_id: int, db: Session = Depends(get_db)):
    classe = db.query(Classe).filter(Classe.classe_id == classe_id).first()
    if not classe:
        raise HTTPException(404, "Classe non trouvée")
    resultat = _valider_classe_core(db, classe)
    if resultat["bloque"]:
        raise HTTPException(400, "Validation impossible — " + "; ".join(resultat["erreurs"]))
    db.commit()
    return resultat


@router.post("/annee/{annee_source_id}/valider-tout")
def valider_promotion_annee(annee_source_id: int, db: Session = Depends(get_db)):
    """
    Valide TOUTES les classes actives de l'année source en un seul appel. Les
    classes bloquées (filière non choisie pour au moins un élève) sont
    signalées mais n'empêchent pas la validation des autres classes.
    """
    classes = db.query(Classe).filter(Classe.annee_id == annee_source_id, Classe.statut == "ACTIVE").all()
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


@router.get("/annee/{annee_id}/etat")
def etat_promotion_annee(annee_id: int, db: Session = Depends(get_db)):
    """
    Vue d'ensemble en lecture seule de l'avancement de la promotion pour
    toutes les classes actives de l'année — alimente l'assistant de clôture
    (Phase 4) sans qu'il ait à interroger chaque classe individuellement
    (règle N+1 déjà établie sur ce projet).
    """
    classes = db.query(Classe).filter(Classe.annee_id == annee_id, Classe.statut == "ACTIVE").all()

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
def preparer_classes_annee(annee_cible_id: int, annee_source_id: int, db: Session = Depends(get_db)):
    """
    Clone la structure des classes (niveau, code, libellé, capacité) d'une
    année source vers une année cible, sans copier salle ni professeur
    principal (à réassigner consciemment pour la nouvelle année). Nécessaire
    avant de pouvoir calculer des résultats/valider une promotion : les
    classes de l'année cible doivent exister pour que la classe cible de
    chaque élève puisse être résolue. Idempotent : ignore les niveaux déjà
    présents dans l'année cible.
    """
    annee_cible = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_cible_id).first()
    if not annee_cible:
        raise HTTPException(404, "Année cible non trouvée")
    annee_source = db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee_source_id).first()
    if not annee_source:
        raise HTTPException(404, "Année source non trouvée")

    classes_source = db.query(Classe).filter(
        Classe.annee_id == annee_source_id,
        Classe.statut == "ACTIVE",
    ).all()

    niveaux_existants = {
        c.niveau_id for c in db.query(Classe).filter(
            Classe.annee_id == annee_cible_id, Classe.statut == "ACTIVE"
        ).all()
    }

    created = 0
    for c in classes_source:
        if c.niveau_id in niveaux_existants:
            continue
        db.add(Classe(
            etablissement_id=c.etablissement_id,
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

    db.commit()
    return {"message": f"{created} classe(s) créée(s) pour {annee_cible.libelle}", "created": created}
