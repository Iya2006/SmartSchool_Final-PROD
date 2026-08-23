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
from app.models.academique import (
    Presence, Incident, Inscription, Classe, Eleve, PointageEleve,
)
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
    # La clé d'un pointage dépend du cycle : au collège l'appel se fait par
    # matière, donc par séance ; au primaire il porte sur la demi-journée.
    # Sans cette distinction, les six heures d'une journée de 10ème écraseraient
    # la même ligne, et il ne resterait que le dernier appel de la journée.
    existantes = {}
    for pr in db.query(Presence).filter(
        Presence.inscription_id.in_(inscription_ids),
        Presence.date_presence.in_(dates),
    ).all():
        cle = ((pr.seance_id, pr.inscription_id) if pr.seance_id
               else (None, pr.inscription_id, pr.date_presence, pr.demi_journee))
        existantes[cle] = pr

    count = 0
    for p in presences:
        cle = ((p.seance_id, p.inscription_id) if p.seance_id
               else (None, p.inscription_id, p.date_presence, p.demi_journee))
        existing = existantes.get(cle)
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

    # L'appel du surveillant (ou de l'admin) passe par cette route. Au
    # collège/lycée il porte sur une SÉANCE : on met alors à jour les compteurs
    # dénormalisés de la séance et son état — exactement comme le fait
    # « Terminer » côté enseignant. Sans cela, l'appel était bien enregistré
    # (les présences existaient) mais n'apparaissait PAS dans la vue
    # « Séances (Appels) », qui lit ces champs dénormalisés (appel_fait,
    # nb_presents…). Le primaire (seance_id absent) n'est pas concerné.
    seance_ids = {p.seance_id for p in presences if p.seance_id}
    if seance_ids:
        from datetime import timezone
        from app.models.academique import Seance
        for sid in seance_ids:
            seance = db.query(Seance).filter(Seance.seance_id == sid).first()
            if not seance:
                continue
            counts = dict(
                db.query(Presence.statut_presence, func.count(Presence.presence_id))
                .filter(Presence.seance_id == sid)
                .group_by(Presence.statut_presence)
                .all()
            )
            seance.nb_presents = counts.get("PRESENT", 0)
            seance.nb_absents = counts.get("ABSENT", 0) + counts.get("ABSENT_JUSTIFIE", 0)
            seance.nb_retards = counts.get("RETARD", 0)
            seance.appel_fait = "O"
            seance.appel_fait_le = datetime.now(timezone.utc)
            if seance.statut in ("PREVUE", "EN_COURS"):
                seance.statut = "EFFECTUEE"
        db.commit()

    return {"message": f"{count} présences enregistrées"}


@router.get("/feuille-appel")
def feuille_appel(
    classe_id: int,
    date_presence: date_type,
    demi_journee: str = "MATIN",
    creneau_id: Optional[int] = None,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """La liste de classe d'un jour, prête à être pointée — et QUI la pointe.

    Faire l'appel demande l'`inscription_id` de chaque élève (c'est lui, et non
    `eleve_id`, que l'enregistrement attend) et ce qui a DÉJÀ été pointé : sans
    le second, rouvrir la feuille d'hier affichait tout le monde présent et
    effaçait le travail de la veille.

    Mais l'appel ne se fait pas de la même façon selon le cycle, et l'écran
    doit le refléter :

    AU PRIMAIRE, un seul maître tient la classe toute la journée. Il est
    désigné automatiquement — le surveillant n'a personne à choisir, et lui
    demander de le faire serait lui demander de retrouver une information que
    le logiciel a déjà.

    AU COLLÈGE ET AU LYCÉE, la classe change de professeur à chaque heure.
    L'appel se fait donc par matière : on donne les créneaux réels du jour,
    chacun avec son professeur. Choisir la matière désigne le professeur, et
    l'appel se rattache à cette séance-là.

    Deux requêtes pour la liste, quel que soit l'effectif.
    """
    classe = db.query(Classe).filter(
        Classe.classe_id == classe_id, Classe.etablissement_id == etablissement_id
    ).first()
    if not classe:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    demi_journee = (demi_journee or "MATIN").upper()
    if demi_journee not in {"MATIN", "SOIR"}:
        raise HTTPException(status_code=400, detail="La demi-journée vaut MATIN ou SOIR.")

    cycle_code, est_primaire = _cycle_de_la_classe(db, classe)
    responsable = _instituteur_de(db, classe) if est_primaire else None
    creneaux = [] if est_primaire else _creneaux_du_jour(db, classe, date_presence)

    # Au collège, l'appel se rattache à la séance du créneau choisi ; sinon il
    # porte sur la demi-journée, comme au primaire.
    seance = None
    if creneau_id:
        seance = _seance_du_creneau(db, creneau_id, date_presence, classe)
        if seance is None:
            raise HTTPException(404, "Ce créneau n'existe pas pour cette classe ce jour-là.")

    lignes = db.query(Inscription.inscription_id, Eleve.eleve_id, Eleve.matricule,
                      Eleve.nom, Eleve.prenom).join(
        Eleve, Inscription.eleve_id == Eleve.eleve_id
    ).filter(
        Inscription.classe_id == classe_id, Inscription.statut == "ACTIVE"
    ).order_by(Eleve.nom, Eleve.prenom).all()

    inscriptions = [l.inscription_id for l in lignes] or [0]
    if seance is not None:
        pointages = db.query(Presence).filter(
            Presence.seance_id == seance.seance_id,
            Presence.inscription_id.in_(inscriptions),
        ).all()
    else:
        pointages = db.query(Presence).filter(
            Presence.inscription_id.in_(inscriptions),
            Presence.date_presence == date_presence,
            Presence.demi_journee == demi_journee,
            Presence.seance_id.is_(None),
        ).all()
    deja = {p.inscription_id: p for p in pointages}

    # LE PORTAIL ET LA CLASSE, ENFIN RELIÉS
    # ----------------------------------------------------------------------
    # Deux contrôles coexistaient sans jamais se parler : la carte scannée à
    # l'entrée prouve que l'élève est À L'ÉCOLE ce jour ; l'appel prouve qu'il
    # était EN COURS à cette heure. Le surveillant faisait l'appel sans savoir
    # qui avait franchi le portail — et personne ne voyait le cas qui compte
    # le plus : l'élève entré le matin, absent en cours l'après-midi. Il n'a
    # pas manqué l'école, il a manqué le cours ; ce n'est pas la même chose à
    # dire à une famille.
    #
    # Une requête pour toute la classe, jamais une par élève.
    pointes = {
        p.eleve_id: p for p in db.query(PointageEleve).filter(
            PointageEleve.etablissement_id == etablissement_id,
            PointageEleve.date_pointage == date_presence,
            PointageEleve.eleve_id.in_([l.eleve_id for l in lignes] or [0]),
        ).all()
    }

    eleves = []
    for l in lignes:
        pointage = deja.get(l.inscription_id)
        entree = pointes.get(l.eleve_id)
        statut = pointage.statut_presence if pointage else "PRESENT"
        eleves.append({
            "inscription_id": l.inscription_id,
            "eleve_id": l.eleve_id,
            "matricule": l.matricule,
            "nom": l.nom,
            "prenom": l.prenom,
            # Absence de ligne = présent. La présence est la règle : on ne
            # pointe que ce qui en sort.
            "statut": statut,
            "est_justifie": (pointage.est_justifie == "O") if pointage else False,
            "motif": pointage.motif if pointage else None,
            # Ce que dit le portail d'entrée, sans jamais décider à la place
            # du surveillant : c'est lui qui voit la salle.
            "pointe_a_l_ecole": entree is not None,
            "heure_arrivee": entree.heure_arrivee.strftime("%H:%M") if entree and entree.heure_arrivee else None,
            "heure_depart": entree.heure_depart.strftime("%H:%M") if entree and entree.heure_depart else None,
            # Les deux contradictions qui méritent un regard.
            "entre_mais_absent": entree is not None and statut in ("ABSENT", "ABSENT_JUSTIFIE"),
            "jamais_entre": entree is None,
        })

    return {
        "classe_id": classe.classe_id,
        "classe": classe.libelle,
        "cycle": cycle_code,
        "est_primaire": est_primaire,
        "date_presence": date_presence,
        "demi_journee": demi_journee,
        "effectif": len(eleves),
        "deja_pointee": bool(deja),
        # Au primaire : le maître, désigné d'office.
        "responsable": responsable,
        # Au collège et au lycée : les heures du jour, chacune avec son prof.
        "creneaux": creneaux,
        "creneau_id": creneau_id,
        "seance_id": seance.seance_id if seance is not None else None,
        # Le portail, en un coup d'œil, avant même de descendre dans la liste.
        "portail": {
            "pointes": sum(1 for e in eleves if e["pointe_a_l_ecole"]),
            "jamais_entres": sum(1 for e in eleves if e["jamais_entre"]),
            "entres_mais_absents": sum(1 for e in eleves if e["entre_mais_absent"]),
        },
        "eleves": eleves,
    }


def _cycle_de_la_classe(db: Session, classe) -> tuple:
    """Le code du cycle, et s'il s'agit du primaire."""
    from app.models.academique import Cycle, Niveau

    ligne = db.query(Cycle.code).join(
        Niveau, Niveau.cycle_id == Cycle.cycle_id
    ).filter(Niveau.niveau_id == classe.niveau_id).first()
    code = (ligne[0] if ligne else "") or ""
    return code, code.upper().startswith("PRM") or "PRIM" in code.upper()


def _instituteur_de(db: Session, classe) -> Optional[dict]:
    """Le maître qui tient la classe.

    C'est celui qui est affecté au plus grand nombre de matières de la classe :
    au primaire, un seul enseignant les couvre toutes. Le désigner évite de
    demander au surveillant une information que le logiciel connaît déjà.
    """
    from app.models.academique import Affectation, Enseignant

    ligne = db.query(
        Enseignant.enseignant_id, Enseignant.nom, Enseignant.prenom,
        func.count(Affectation.affectation_id).label("matieres"),
    ).join(
        Affectation, Affectation.enseignant_id == Enseignant.enseignant_id
    ).filter(
        Affectation.classe_id == classe.classe_id,
        Affectation.statut == "ACTIVE",
    ).group_by(
        Enseignant.enseignant_id, Enseignant.nom, Enseignant.prenom
    ).order_by(func.count(Affectation.affectation_id).desc()).first()

    if not ligne:
        return None
    return {
        "enseignant_id": ligne.enseignant_id,
        "nom": f"{ligne.prenom} {ligne.nom}".strip(),
        "nb_matieres": ligne.matieres,
    }


def _creneaux_du_jour(db: Session, classe, jour: date_type) -> list:
    """Les heures de cours de la classe ce jour-là, avec leur professeur."""
    from app.models.academique import CreneauEmploi, Enseignant, Matiere

    JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI"]
    if jour.weekday() >= 5:
        return []

    lignes = db.query(
        CreneauEmploi.creneau_id, CreneauEmploi.heure_debut, CreneauEmploi.heure_fin,
        Matiere.libelle.label("matiere"), Enseignant.enseignant_id,
        Enseignant.nom, Enseignant.prenom,
    ).join(
        Matiere, Matiere.matiere_id == CreneauEmploi.matiere_id
    ).outerjoin(
        Enseignant, Enseignant.enseignant_id == CreneauEmploi.enseignant_id
    ).filter(
        CreneauEmploi.classe_id == classe.classe_id,
        CreneauEmploi.jour == JOURS[jour.weekday()],
        CreneauEmploi.statut == "ACTIVE",
    ).order_by(CreneauEmploi.heure_debut).all()

    return [{
        "creneau_id": c.creneau_id,
        "heure_debut": c.heure_debut,
        "heure_fin": c.heure_fin,
        "matiere": c.matiere,
        "enseignant_id": c.enseignant_id,
        # Un créneau sans professeur affecté existe : il faut le dire plutôt
        # que d'afficher un nom vide.
        "enseignant": f"{c.prenom} {c.nom}".strip() if c.enseignant_id else None,
        "demi_journee": "MATIN" if (c.heure_debut or "08:00") < "13:00" else "SOIR",
    } for c in lignes]


def _seance_du_creneau(db: Session, creneau_id: int, jour: date_type, classe):
    """La séance de ce créneau ce jour-là, créée si elle n'existe pas encore.

    Les séances se génèrent à la demande depuis l'emploi du temps (module
    Séances). On réutilise ce mécanisme plutôt que d'inventer un second
    enregistrement par matière qui entrerait en concurrence avec lui.
    """
    from app.models.academique import CreneauEmploi, Seance

    creneau = db.query(CreneauEmploi).filter(
        CreneauEmploi.creneau_id == creneau_id,
        CreneauEmploi.classe_id == classe.classe_id,
    ).first()
    if not creneau or jour.weekday() >= 5:
        return None

    seance = db.query(Seance).filter(
        Seance.creneau_id == creneau_id, Seance.date_seance == jour
    ).first()
    if seance:
        return seance

    seance = Seance(
        creneau_id=creneau.creneau_id, classe_id=creneau.classe_id,
        matiere_id=creneau.matiere_id, annee_id=classe.annee_id,
        enseignant_prevu_id=creneau.enseignant_id, date_seance=jour,
        heure_debut_prevue=creneau.heure_debut, heure_fin_prevue=creneau.heure_fin,
        salle=creneau.salle,
    )
    db.add(seance)
    try:
        db.commit()
        db.refresh(seance)
    except Exception:
        # Deux surveillants qui ouvrent la même heure au même moment : la
        # contrainte d'unicité tranche, on relit celle qui a gagné.
        db.rollback()
        seance = db.query(Seance).filter(
            Seance.creneau_id == creneau_id, Seance.date_seance == jour
        ).first()
    return seance


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

    UN PROFESSEUR NE MANQUE PAS FORCÉMENT SA JOURNÉE
    ------------------------------------------------
    Au primaire, un maître tient sa classe toute la journée : s'il n'est pas
    là, c'est la journée entière, et il n'y a aucun cours à choisir.

    Au collège et au lycée, il enseigne une heure ici, une heure là. Il peut
    manquer son cours de 8 h et revenir assurer celui de 11 h, dans la même
    classe ou dans une autre. Le signalement porte donc sur des SÉANCES
    précises, passées dans `seance_ids` : chacune est marquée non effectuée
    avec son motif, et l'on sait exactement ce qui n'a pas été fait.

    La paie, elle, compte des JOURS. On garde donc une seule ligne d'absence
    par employé et par jour : un second signalement le même jour vient
    compléter la première au lieu d'être refusé — sinon le surveillant qui
    constate une deuxième heure manquée s'entendait répondre « déjà
    enregistrée » et ne pouvait plus rien dire.
    """
    from app.api.finance import _get_or_sync_employe_paie, _identifier_employe
    from app.models.academique import AbsencePersonnel, Seance, Matiere

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

    justifie = "Y" if data.get("est_justifie") else "N"
    motif = (data.get("motif") or "").strip() or None

    # ── Les cours manqués, quand le surveillant en désigne ────────────────
    seance_ids = data.get("seance_ids") or []
    if not isinstance(seance_ids, list):
        raise HTTPException(400, "seance_ids doit être une liste d'identifiants de cours.")

    cours_manques = []
    if seance_ids:
        lignes = db.query(Seance, Classe, Matiere).join(
            Classe, Classe.classe_id == Seance.classe_id
        ).outerjoin(
            Matiere, Matiere.matiere_id == Seance.matiere_id
        ).filter(
            Seance.seance_id.in_(seance_ids),
            Classe.etablissement_id == etablissement_id,
            Seance.date_seance == jour,
        ).all()
        if len(lignes) != len(set(seance_ids)):
            raise HTTPException(
                404, "Un des cours désignés n'existe pas ce jour-là dans cette école.")

        for seance, classe, matiere in lignes:
            # Un cours déjà fait ne se déclare pas manqué : ce serait
            # contredire l'appel que le professeur a lui-même enregistré.
            if seance.statut == "EFFECTUEE":
                raise HTTPException(
                    400,
                    f"Le cours de {matiere.libelle if matiere else 'cette matière'} en "
                    f"{classe.libelle} à {seance.heure_debut_prevue} est marqué effectué : "
                    "il ne peut pas être déclaré non assuré.",
                )
            seance.statut = "NON_EFFECTUEE"
            seance.motif_statut = motif or "Cours non assuré (signalé par la surveillance)"
            cours_manques.append(
                f"{matiere.libelle if matiere else 'Cours'} en {classe.libelle} "
                f"{seance.heure_debut_prevue}–{seance.heure_fin_prevue}"
            )

    # ── L'absence du jour : une seule ligne, complétée si elle existe ─────
    absence = db.query(AbsencePersonnel).filter(
        AbsencePersonnel.employe_id == employe.employe_id,
        AbsencePersonnel.date_absence == jour,
    ).first()

    if absence is not None:
        if absence.statut in ("VALIDE", "ECARTE"):
            raise HTTPException(
                400,
                f"La direction a déjà tranché l'absence de {infos['prenom']} {infos['nom']} "
                f"le {jour.isoformat()} ({absence.statut}) — elle ne se modifie plus ici.",
            )
        if not cours_manques:
            raise HTTPException(
                400,
                f"Une absence est déjà enregistrée pour {infos['prenom']} {infos['nom']} "
                f"le {jour.isoformat()} (statut : {absence.statut}).",
            )
        # Une deuxième heure manquée le même jour complète le signalement.
        parts = [p for p in [absence.motif] if p] + cours_manques
        absence.motif = " · ".join(parts)[:500]
        absence.est_justifie = justifie
        cree = False
    else:
        absence = AbsencePersonnel(
            employe_id=employe.employe_id,
            date_absence=jour,
            motif=(" · ".join(cours_manques)[:500] if cours_manques else motif),
            est_justifie=justifie,
            statut="SIGNALE",
            signale_par=_qui(current_user),
        )
        db.add(absence)
        cree = True

    db.commit()
    db.refresh(absence)
    return {
        "absence_id": absence.absence_id,
        "statut": absence.statut,
        "employe": f"{infos['prenom']} {infos['nom']}",
        "cours_manques": cours_manques,
        "nouveau": cree,
        "message": (
            f"{len(cours_manques)} cours marqué(s) non assuré(s). Signalement transmis "
            "à la direction — aucune retenue n'est appliquée tant qu'il n'a pas été validé."
            if cours_manques else
            "Signalement transmis à la direction. Aucune retenue n'est appliquée "
            "tant qu'il n'a pas été validé."
        ),
    }


@router.get("/enseignants-par-cycle")
def enseignants_par_cycle(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    """Les enseignants rangés par cycle : primaire, collège, lycée.

    Une école de quarante-six professeurs affichés à plat, c'est une liste
    dans laquelle on ne retrouve personne. Le surveillant sait dans quel cycle
    il vient de constater une absence — la liste doit suivre sa tête, pas
    l'ordre alphabétique de toute l'école.

    Un professeur enseigne parfois dans deux cycles (le collège et le lycée
    partagent souvent les mêmes professeurs de matière). On le range dans
    celui où il a le plus d'affectations, et on le dit : le classer ailleurs
    en silence serait plus déroutant que de ne pas le classer du tout.

    Deux requêtes, quel que soit l'effectif.
    """
    from app.models.academique import Affectation, Classe as C, Cycle, Enseignant, Niveau

    _peut(current_user, CONSTATE_LES_ABSENCES,
          "Accès réservé à la surveillance et à la direction.")

    profs = db.query(Enseignant).filter(
        Enseignant.etablissement_id == etablissement_id,
        Enseignant.statut == "ACTIF",
    ).order_by(Enseignant.nom, Enseignant.prenom).all()

    # Combien d'affectations chaque professeur a-t-il dans chaque cycle ?
    comptes = db.query(
        Affectation.enseignant_id, Cycle.code, Cycle.libelle, Cycle.ordre,
        func.count(Affectation.affectation_id).label("nb"),
    ).join(
        C, C.classe_id == Affectation.classe_id
    ).join(
        Niveau, Niveau.niveau_id == C.niveau_id
    ).join(
        Cycle, Cycle.cycle_id == Niveau.cycle_id
    ).filter(
        C.etablissement_id == etablissement_id,
        Affectation.statut == "ACTIVE",
    ).group_by(
        Affectation.enseignant_id, Cycle.code, Cycle.libelle, Cycle.ordre
    ).all()

    par_prof: dict = {}
    for ligne in comptes:
        par_prof.setdefault(ligne.enseignant_id, []).append(ligne)

    SANS = {"code": "SANS_CYCLE", "libelle": "Sans classe affectée", "ordre": 99}
    groupes: dict = {}
    for p in profs:
        lignes = sorted(par_prof.get(p.enseignant_id, []), key=lambda x: -x.nb)
        principal = lignes[0] if lignes else None
        code = principal.code if principal else SANS["code"]
        libelle = principal.libelle if principal else SANS["libelle"]
        ordre = principal.ordre if principal else SANS["ordre"]

        groupes.setdefault(code, {"code": code, "libelle": libelle,
                                  "ordre": ordre or 0, "enseignants": []})
        groupes[code]["enseignants"].append({
            "enseignant_id": p.enseignant_id,
            "nom": p.nom,
            "prenom": p.prenom,
            "matricule": p.matricule,
            # Dit franchement qu'il enseigne aussi ailleurs.
            "autres_cycles": [x.libelle for x in lignes[1:]],
        })

    return {
        "total": len(profs),
        "groupes": sorted(groupes.values(), key=lambda g: (g["ordre"], g["libelle"])),
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
    # etablissement_id imposé par le compte authentifié.
    payload["etablissement_id"] = etablissement_id
    # Un incident concerne TOUJOURS un élève (colonne NOT NULL + FK). Sans
    # élève sélectionné, l'ancien code laissait passer eleve_id=0 puis échouait
    # sur la contrainte de clé étrangère → 500 opaque (« ça ne marche pas »).
    # On refuse clairement en amont.
    if not payload.get("eleve_id"):
        raise HTTPException(status_code=400, detail="Sélectionnez l'élève concerné par l'incident.")
    # L'élève doit appartenir à cette école (Lot 9).
    if not db.query(Eleve.eleve_id).filter(
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
