"""
SMARTSCHOOL API — Routes Vie Scolaire (Présences, Incidents)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import date as date_type, datetime
from app.core.database import get_db
from app.core.annee_lock import verifier_annee_modifiable
from app.core.auth import get_current_user, require_etablissement
from app.models.academique import Presence, Incident, Inscription, Classe, Eleve
from app.schemas.schemas import (
    PresenceCreate, PresenceOut, IncidentCreate, IncidentOut
)

router = APIRouter(prefix="/api/vie-scolaire", tags=["Vie Scolaire"])


# ============================================================================
# PRÉSENCES
# ============================================================================
@router.get("/presences")
def list_presences(
    classe_id: int = None,
    # `date_presence` était typée en texte et comparée à une colonne DATE :
    # PostgreSQL refusait la comparaison (« operator does not exist: date =
    # character varying ») et la route répondait 500. Le défaut a survécu
    # parce qu'aucun écran n'appelait jamais cette route — le surveillant
    # n'ayant pas d'écran d'appel, personne n'avait de raison de demander
    # les présences d'un jour donné.
    date_presence: Optional[date_type] = None,
    demi_journee: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(
        Presence.presence_id,
        Presence.date_presence,
        Presence.demi_journee,
        Presence.statut_presence,
        Presence.est_justifie,
        Presence.motif,
        Eleve.matricule,
        Eleve.nom,
        Eleve.prenom
    ).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).join(
        Classe, Classe.classe_id == Inscription.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id
    )

    if classe_id:
        query = query.filter(Inscription.classe_id == classe_id)
    if date_presence:
        query = query.filter(Presence.date_presence == date_presence)
    if demi_journee:
        query = query.filter(Presence.demi_journee == demi_journee)

    results = query.order_by(Eleve.nom, Eleve.prenom).all()
    return [
        {
            "presence_id": r.presence_id,
            "date": str(r.date_presence),
            "demi_journee": r.demi_journee,
            "statut": r.statut_presence,
            "justifie": r.est_justifie,
            "motif": r.motif,
            "matricule": r.matricule,
            "eleve": f"{r.nom} {r.prenom}"
        } for r in results
    ]


@router.post("/presences/batch")
def saisie_presences_batch(presences: List[PresenceCreate], db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Saisie en lot des présences pour une classe.

    CHAQUE inscription est vérifiée appartenir à l'établissement appelant
    (Lot 9) : une inscription d'une autre école glissée dans le lot ne reçoit
    aucune présence. Vérification et recherche des présences déjà existantes
    faites par lot (IN), pas par une requête par élève dans la boucle — sans
    quoi une classe de plusieurs dizaines d'élèves déclenchait jusqu'à 2
    requêtes par élève à chaque appel.
    """
    if not presences:
        return {"message": "0 présences enregistrées"}

    inscription_ids = {p.inscription_id for p in presences}
    inscriptions = {
        i.inscription_id: i for i in db.query(Inscription)
        .join(Classe, Classe.classe_id == Inscription.classe_id)
        .filter(Inscription.inscription_id.in_(inscription_ids), Classe.etablissement_id == etablissement_id)
        .all()
    }
    if inscription_ids - inscriptions.keys():
        raise HTTPException(status_code=404, detail="Inscription non trouvée")

    premiere_inscription = inscriptions[presences[0].inscription_id]
    verifier_annee_modifiable(db, premiere_inscription.annee_id)

    dates = {p.date_presence for p in presences}
    existantes = {
        (pr.inscription_id, pr.date_presence, pr.demi_journee): pr
        for pr in db.query(Presence).filter(
            Presence.inscription_id.in_(inscription_ids),
            Presence.date_presence.in_(dates),
        ).all()
    }

    count = 0
    for p in presences:
        existing = existantes.get((p.inscription_id, p.date_presence, p.demi_journee))
        # Un élève présent n'est jamais « justifié » : le champ ne vaut que
        # pour une absence ou un retard, sinon il pollue le décompte.
        justifie = (p.est_justifie or "N").upper()
        if p.statut_presence == "PRESENT":
            justifie, motif = "N", None
        else:
            motif = p.motif
        if existing:
            existing.statut_presence = p.statut_presence
            existing.motif = motif
            existing.est_justifie = justifie
        else:
            db.add(Presence(**{**p.model_dump(), "motif": motif, "est_justifie": justifie}))
        count += 1
    db.commit()
    return {"message": f"{count} présences enregistrées"}


@router.get("/feuille-appel")
def feuille_appel(
    classe_id: int,
    date_presence: date_type,
    demi_journee: str = "MATIN",
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """La liste de classe d'un jour, prête à être pointée.

    Faire l'appel demande deux choses que rien ne fournissait ensemble :
    l'`inscription_id` de chaque élève — c'est lui, et non `eleve_id`, que
    l'enregistrement attend — et ce qui a DÉJÀ été pointé pour ce jour et
    cette demi-journée. Sans le second, rouvrir la feuille d'appel d'hier
    affichait tout le monde présent et effaçait le travail de la veille.

    Deux requêtes, quel que soit l'effectif : la liste, puis les pointages
    du jour. Jamais une requête par élève.
    """
    classe = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    demi_journee = (demi_journee or "MATIN").upper()
    if demi_journee not in {"MATIN", "SOIR"}:
        raise HTTPException(status_code=400, detail="La demi-journée vaut MATIN ou SOIR.")

    lignes = db.query(Inscription.inscription_id, Eleve.eleve_id, Eleve.matricule,
                      Eleve.nom, Eleve.prenom).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
    ).order_by(Eleve.nom, Eleve.prenom).all()

    deja = {
        p.inscription_id: p for p in db.query(Presence).filter(
            Presence.inscription_id.in_([l.inscription_id for l in lignes] or [0]),
            Presence.date_presence == date_presence,
            Presence.demi_journee == demi_journee,
        ).all()
    }

    eleves = []
    for l in lignes:
        pointage = deja.get(l.inscription_id)
        eleves.append({
            "inscription_id": l.inscription_id,
            "eleve_id": l.eleve_id,
            "matricule": l.matricule,
            "nom": l.nom,
            "prenom": l.prenom,
            # Absence de ligne = présent. La présence est la règle : on ne
            # pointe que ce qui en sort.
            "statut": pointage.statut_presence if pointage else "PRESENT",
            "est_justifie": (pointage.est_justifie == "O") if pointage else False,
            "motif": pointage.motif if pointage else None,
        })

    return {
        "classe_id": classe.classe_id,
        "classe": classe.libelle,
        "date_presence": date_presence,
        "demi_journee": demi_journee,
        "effectif": len(eleves),
        "deja_pointee": bool(deja),
        "eleves": eleves,
    }


# ═══════════════════════════════════════════════════════════════════════════
# L'ABSENCE D'UN ENSEIGNANT : CONSTATER N'EST PAS DÉCIDER
#
# La seule route qui enregistrait l'absence d'un enseignant vivait dans le
# module financier, réservé à la direction et au comptable. Or c'est le
# surveillant qui constate qu'un professeur n'est pas venu — et lui n'y a pas
# accès. C'était donc le comptable qui décidait qu'un professeur était absent,
# et cette décision retire de l'argent sur sa paie. Il n'était pas dans la cour
# à 8 h.
#
# Deux gestes séparés : la surveillance SIGNALE, la direction TRANCHE. Tant
# que rien n'est tranché, la paie ne bouge pas.
# ═══════════════════════════════════════════════════════════════════════════

DECIDE_DES_RETENUES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "COMPTABLE"}
CONSTATE_LES_ABSENCES = DECIDE_DES_RETENUES | {"DIRECTEUR_NIVEAU", "SURVEILLANT"}


def _peut(current_user: dict, roles: set, message: str) -> None:
    from app.core.auth import roles_du_compte
    if not (roles_du_compte(current_user) & roles):
        raise HTTPException(status_code=403, detail=message)


def _qui(current_user: dict) -> str:
    nom = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip()
    return nom or str(current_user.get("sub") or "inconnu")


@router.post("/absences-enseignant", status_code=201)
def signaler_absence_enseignant(
    data: dict,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    """La surveillance constate qu'un enseignant n'a pas assuré son cours.

    Cela crée un SIGNALEMENT, pas une retenue : aucun franc ne bouge tant que
    la direction n'a pas tranché. C'est ce qui permet à celui qui voit de
    parler sans décider à la place de celui qui paie.
    """
    from app.api.finance import _get_or_sync_employe_paie, _identifier_employe
    from app.models.academique import AbsencePersonnel

    _peut(current_user, CONSTATE_LES_ABSENCES,
          "Seules la surveillance et la direction signalent une absence d'enseignant.")

    reference = (data.get("employe_id") or "").strip()
    jour = _lire_jour(data.get("date_absence"))
    if not reference or not jour:
        raise HTTPException(400, "L'employé et la date de l'absence sont obligatoires.")
    if jour > date_type.today():
        raise HTTPException(400, "On ne constate pas une absence qui n'a pas encore eu lieu.")

    infos = _identifier_employe(reference, db, etablissement_id)
    employe = _get_or_sync_employe_paie(db, reference, infos, etablissement_id)

    # Deux surveillants qui signalent le même jour ne créent pas deux retenues.
    deja = db.query(AbsencePersonnel).filter(
        AbsencePersonnel.employe_id == employe.employe_id,
        AbsencePersonnel.date_absence == jour,
    ).first()
    if deja:
        raise HTTPException(
            400,
            f"Une absence est déjà enregistrée pour {infos['prenom']} {infos['nom']} "
            f"le {jour.isoformat()} (statut : {deja.statut}).",
        )

    absence = AbsencePersonnel(
        employe_id=employe.employe_id,
        date_absence=jour,
        motif=(data.get("motif") or "").strip() or None,
        est_justifie="Y" if data.get("est_justifie") else "N",
        statut="SIGNALE",
        signale_par=_qui(current_user),
    )
    db.add(absence)
    db.commit()
    db.refresh(absence)
    return {
        "absence_id": absence.absence_id,
        "statut": absence.statut,
        "employe": f"{infos['prenom']} {infos['nom']}",
        "message": "Signalement transmis à la direction. Aucune retenue n'est appliquée "
                   "tant qu'il n'a pas été validé.",
    }


@router.get("/absences-enseignant")
def lister_absences_enseignant(
    statut: Optional[str] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    """Ce qui a été constaté, et où en est chaque signalement."""
    from app.models.academique import AbsencePersonnel, Employe

    _peut(current_user, CONSTATE_LES_ABSENCES, "Accès réservé à la surveillance et à la direction.")

    q = db.query(AbsencePersonnel, Employe).join(
        Employe, Employe.employe_id == AbsencePersonnel.employe_id
    ).filter(Employe.etablissement_id == etablissement_id)
    if statut:
        q = q.filter(AbsencePersonnel.statut == statut.upper())

    lignes = q.order_by(AbsencePersonnel.date_absence.desc()).limit(200).all()
    return {
        "total": len(lignes),
        "items": [{
            "absence_id": a.absence_id,
            "employe_id": a.employe_id,
            "employe": f"{e.prenom} {e.nom}".strip(),
            "poste": e.poste,
            "date_absence": a.date_absence,
            "motif": a.motif,
            "est_justifie": a.est_justifie == "Y",
            "statut": a.statut,
            "signale_par": a.signale_par,
            "valide_par": a.valide_par,
            # Ce qui distingue un signalement d'une retenue, dit en clair.
            "retient_sur_la_paie": a.statut == "VALIDE" and a.est_justifie != "Y",
        } for a, e in lignes],
    }


@router.put("/absences-enseignant/{absence_id}")
def trancher_absence_enseignant(
    absence_id: int,
    data: dict,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    """La direction valide le signalement, ou l'écarte.

    Valider applique la retenue au mois concerné ; écarter n'en applique
    aucune. Dans les deux cas la trace reste, avec le nom de qui a tranché :
    une retenue se conteste, elle doit pouvoir dire d'où elle vient.
    """
    from app.models.academique import AbsencePersonnel, Employe

    _peut(current_user, DECIDE_DES_RETENUES,
          "Seules la direction et la comptabilité décident d'une retenue sur salaire.")

    decision = (data.get("statut") or "").strip().upper()
    if decision not in {"VALIDE", "ECARTE"}:
        raise HTTPException(400, "La décision vaut VALIDE ou ECARTE.")

    ligne = db.query(AbsencePersonnel, Employe).join(
        Employe, Employe.employe_id == AbsencePersonnel.employe_id
    ).filter(
        AbsencePersonnel.absence_id == absence_id,
        Employe.etablissement_id == etablissement_id,
    ).first()
    if not ligne:
        raise HTTPException(404, "Signalement introuvable")
    absence, employe = ligne

    absence.statut = decision
    absence.valide_par = _qui(current_user)
    absence.date_decision = datetime.utcnow()
    if "est_justifie" in data:
        absence.est_justifie = "Y" if data.get("est_justifie") else "N"
    if data.get("motif"):
        absence.motif = str(data["motif"]).strip()
    db.commit()

    retenue = decision == "VALIDE" and absence.est_justifie != "Y"
    return {
        "absence_id": absence.absence_id,
        "statut": absence.statut,
        "employe": f"{employe.prenom} {employe.nom}".strip(),
        "retient_sur_la_paie": retenue,
        "message": (
            f"Absence confirmée : elle sera retenue sur la paie de "
            f"{absence.date_absence.strftime('%Y-%m')}."
            if retenue else
            "Décision enregistrée : aucune retenue ne sera appliquée."
        ),
    }


def _lire_jour(valeur) -> Optional[date_type]:
    """Une date reçue en texte, ou rien. Une date illisible est une erreur de
    saisie, pas une absence à la date du jour."""
    if not valeur:
        return None
    if isinstance(valeur, date_type):
        return valeur
    try:
        return date_type.fromisoformat(str(valeur)[:10])
    except ValueError:
        raise HTTPException(400, f"Date illisible : « {valeur} ». Format attendu AAAA-MM-JJ.")


def _demi_journees_de_classe(debut: date_type, fin: date_type) -> int:
    """Le nombre de demi-journées ouvrées entre deux dates, samedi et dimanche
    exclus. C'est le dénominateur d'un taux de présence : sans lui, on ne
    divise que par ce qui a été saisi."""
    from datetime import timedelta

    jours, jour = 0, debut
    while jour <= fin:
        if jour.weekday() < 5:
            jours += 1
        jour += timedelta(days=1)
    return jours * 2


@router.get("/presences/stats")
def stats_presences(
    classe_id: Optional[int] = None,
    debut: Optional[date_type] = None,
    fin: Optional[date_type] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """L'assiduité sur une période, y compris quand l'école ne note QUE les absences.

    DEUX DÉFAUTS CORRIGÉS ICI

    1. La fenêtre était figée à « les 30 derniers jours », sans que rien ne le
       dise : une école qui ouvre cet écran en août — donc pendant les
       vacances — lisait des zéros partout et concluait à une panne. Une école
       raisonne par année scolaire, pas en jours glissants. La fenêtre est
       désormais l'année en cours, bornée à aujourd'hui, et se règle.

    2. `taux_presence` valait `presents / lignes saisies`. Or la plupart des
       écoles ne saisissent QUE les absences : la présence est la règle, elle
       n'est pas pointée élève par élève. Le taux affiché était alors 0 %
       avec 6 219 absences enregistrées sur l'année — un chiffre que le
       surveillant ne pouvait que croire faux. Le dénominateur est maintenant
       ce qui était ATTENDU : effectif actif × demi-journées ouvrées.
    """
    from app.models.academique import AnneeScolaire

    annee = db.query(AnneeScolaire).filter(
        AnneeScolaire.etablissement_id == etablissement_id,
        AnneeScolaire.est_courante == "O",
    ).first()
    aujourdhui = date_type.today()
    debut = debut or (annee.date_debut if annee else aujourdhui.replace(month=1, day=1))
    fin = fin or min(annee.date_fin if annee else aujourdhui, aujourdhui)
    if fin < debut:
        raise HTTPException(400, "La date de fin précède la date de début.")

    query = db.query(Presence).join(
        Inscription, Presence.inscription_id == Inscription.inscription_id
    ).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id,
        Presence.date_presence >= debut,
        Presence.date_presence <= fin,
    )
    effectif = db.query(func.count(Inscription.inscription_id)).join(
        Classe, Inscription.classe_id == Classe.classe_id
    ).filter(
        Classe.etablissement_id == etablissement_id, Inscription.statut == "ACTIVE"
    )

    if classe_id:
        query = query.filter(Inscription.classe_id == classe_id)
        effectif = effectif.filter(Inscription.classe_id == classe_id)

    saisies = query.count()
    presents_saisis = query.filter(Presence.statut_presence == "PRESENT").count()
    absents = query.filter(Presence.statut_presence == "ABSENT").count()
    retards = query.filter(Presence.statut_presence == "RETARD").count()
    non_justifiees = query.filter(
        Presence.statut_presence == "ABSENT", Presence.est_justifie != "O"
    ).count()

    attendu = (effectif.scalar() or 0) * _demi_journees_de_classe(debut, fin)
    # Si l'école pointe réellement chaque présence, le total attendu vaut au
    # moins ce qu'elle a saisi : on ne veut pas d'un taux supérieur à 100 %.
    attendu = max(attendu, saisies)

    return {
        "debut": debut,
        "fin": fin,
        "attendu": attendu,
        "total": saisies,
        "presents": max(0, attendu - absents) if attendu else presents_saisis,
        "absents": absents,
        "absences_non_justifiees": non_justifiees,
        "retards": retards,
        "taux_presence": round((attendu - absents) / attendu * 100, 1) if attendu else 0,
    }


# ============================================================================
# INCIDENTS
# ============================================================================
@router.get("/incidents", response_model=List[IncidentOut])
def list_incidents(
    gravite: Optional[str] = None,
    statut: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(Incident).filter(
        Incident.etablissement_id == etablissement_id
    )
    if gravite:
        query = query.filter(Incident.gravite == gravite)
    if statut:
        query = query.filter(Incident.statut == statut)
    return query.order_by(Incident.date_incident.desc()).offset(skip).limit(limit).all()


@router.post("/incidents", response_model=IncidentOut, status_code=201)
def create_incident(data: IncidentCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    payload = data.model_dump()
    # etablissement_id imposé par le compte authentifié, et l'élève concerné
    # (si fourni) doit appartenir à cette école (Lot 9).
    payload["etablissement_id"] = etablissement_id
    if payload.get("eleve_id") and not db.query(Eleve.eleve_id).filter(
        Eleve.eleve_id == payload["eleve_id"], Eleve.etablissement_id == etablissement_id
    ).first():
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    inc = Incident(**payload)
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return inc


@router.put("/incidents/{incident_id}/traiter")
def traiter_incident(incident_id: int, decision: str, traite_par: str, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    inc = db.query(Incident).filter(
        Incident.incident_id == incident_id, Incident.etablissement_id == etablissement_id
    ).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident non trouvé")
    inc.statut = "TRAITE"
    db.commit()
    return {"message": "Incident traité"}


@router.get("/incidents/stats")
def stats_incidents(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    query = db.query(Incident).filter(
        Incident.etablissement_id == etablissement_id,
        Incident.date_incident >= func.current_date() - 90
    )

    total = query.count()
    par_gravite = query.with_entities(
        Incident.gravite,
        func.count(Incident.incident_id).label("count")
    ).group_by(Incident.gravite).all()

    par_type = query.with_entities(
        Incident.type_incident,
        func.count(Incident.incident_id).label("count")
    ).group_by(Incident.type_incident).order_by(
        func.count(Incident.incident_id).desc()
    ).limit(5).all()

    return {
        "total_incidents": total,
        "par_gravite": [{"gravite": r.gravite, "count": r.count} for r in par_gravite],
        "top_types": [{"type": r.type_incident, "count": r.count} for r in par_type]
    }
