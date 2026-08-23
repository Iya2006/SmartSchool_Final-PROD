"""
SMARTSCHOOL API — Séances pédagogiques

Une Séance (classe + matière + enseignant + date + créneau) est l'ancre de
l'appel pédagogique — distincte de PresenceAgent (pointage physique de
l'enseignant dans l'établissement, inchangé, voir presence_agent.py).

Avant ce module, l'appel (Presence) n'était rattaché qu'à
(inscription_id, date, demi_journee) : un enseignant enseignant plusieurs
matières à la même classe ne pouvait faire qu'un seul appel par
demi-journée, le second écrasant silencieusement le premier. Les anciens
points d'écriture (portail_enseignant.py::enregistrer_appel,
sync.py::sync_presences, vie_scolaire.py::saisie_presences_batch) restent
inchangés et continuent d'écrire des lignes Presence avec seance_id=NULL —
aucune donnée existante n'est ni supprimée ni réinterprétée.
"""
from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional

from app.core.database import get_db
from app.core.auth import get_current_user, require_etablissement
from app.core.annee_lock import verifier_annee_modifiable
from app.models.academique import (
    Seance, Presence, CreneauEmploi, Affectation, Classe, Matiere, Enseignant,
    Inscription, Eleve, AnneeScolaire, AuditLog,
)
from app.api.portail_enseignant import _enseignant_auth
from app.api.emploi_du_temps import JOURS_SEMAINE

ADMIN_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "INFORMATICIEN"}
STATUTS_PRESENCE_VALIDES = {"PRESENT", "ABSENT", "ABSENT_JUSTIFIE", "RETARD"}

router = APIRouter(prefix="/api/portail-enseignant", tags=["Séances — Portail Enseignant"])
router_admin = APIRouter(prefix="/api/seances", tags=["Séances — Administration"])


# ============================================================================
# HELPERS
# ============================================================================

def _demi_journee(heure: str) -> str:
    return "MATIN" if heure < "13:00" else "APRES_MIDI"


def _seance_teacher_ou_404(db: Session, seance_id: int, enseignant_id: int, current_user: dict) -> Seance:
    """Une séance n'est visible/actionnable par ce chemin que si elle
    appartient à CET enseignant (prévu ou réel) — `_enseignant_auth` a déjà
    vérifié que `enseignant_id` correspond au token, il reste à vérifier que
    `seance_id` lui appartient réellement (sinon un enseignant pourrait
    passer son propre enseignant_id mais un seance_id d'un collègue)."""
    s = db.query(Seance).filter(Seance.seance_id == seance_id).first()
    if not s:
        raise HTTPException(404, "Séance non trouvée")
    role = current_user.get("role", "")
    if role not in ADMIN_ROLES and enseignant_id not in (s.enseignant_prevu_id, s.enseignant_reel_id):
        raise HTTPException(404, "Séance non trouvée")
    return s


def _seance_admin_ou_404(db: Session, seance_id: int, etablissement_id: int) -> Seance:
    """Seance est OWNERSHIP via Classe (même convention que CreneauEmploi)."""
    s = (
        db.query(Seance)
        .join(Classe, Classe.classe_id == Seance.classe_id)
        .filter(Seance.seance_id == seance_id, Classe.etablissement_id == etablissement_id)
        .first()
    )
    if not s:
        raise HTTPException(404, "Séance non trouvée")
    return s


def _serialize_seance(db: Session, s: Seance) -> dict:
    matiere = db.query(Matiere).filter(Matiere.matiere_id == s.matiere_id).first()
    classe = db.query(Classe).filter(Classe.classe_id == s.classe_id).first()
    prevu = db.query(Enseignant).filter(Enseignant.enseignant_id == s.enseignant_prevu_id).first()
    reel = db.query(Enseignant).filter(Enseignant.enseignant_id == s.enseignant_reel_id).first() if s.enseignant_reel_id else None
    return {
        "seance_id": s.seance_id,
        "classe_id": s.classe_id,
        "classe": classe.libelle if classe else "?",
        "matiere_id": s.matiere_id,
        "matiere": matiere.libelle if matiere else "?",
        "enseignant_prevu_id": s.enseignant_prevu_id,
        "enseignant_prevu": f"{prevu.prenom} {prevu.nom}" if prevu else "?",
        "enseignant_reel_id": s.enseignant_reel_id,
        "enseignant_reel": f"{reel.prenom} {reel.nom}" if reel else None,
        "date_seance": str(s.date_seance),
        "heure_debut_prevue": s.heure_debut_prevue,
        "heure_fin_prevue": s.heure_fin_prevue,
        "heure_debut_reelle": s.heure_debut_reelle.isoformat() if s.heure_debut_reelle else None,
        "heure_fin_reelle": s.heure_fin_reelle.isoformat() if s.heure_fin_reelle else None,
        "salle": s.salle,
        "statut": s.statut,
        "motif_statut": s.motif_statut,
        "appel_fait": s.appel_fait == "O",
        "appel_fait_le": s.appel_fait_le.isoformat() if s.appel_fait_le else None,
        "nb_presents": s.nb_presents,
        "nb_absents": s.nb_absents,
        "nb_retards": s.nb_retards,
    }


def _generer_seances_du_jour(db: Session, enseignant_id: int, jour_date: date_type) -> List[Seance]:
    """Génère à la demande (idempotent) les Seance du jour depuis les
    CreneauEmploi ACTIFS de cet enseignant pour ce jour de semaine.

    Le samedi et le dimanche étaient écartés d'office. Depuis que les jours
    ouvrés sont propres à chaque école, un cours du samedi existe vraiment —
    et sans séance, l'enseignant ne pouvait pas faire l'appel ce jour-là.
    Le calendrier ne tranche plus : c'est l'emploi du temps qui décide. Un
    jour sans créneau ne produit aucune séance, comme avant.
    """
    jour_nom = JOURS_SEMAINE[jour_date.weekday()]

    creneaux = db.query(CreneauEmploi).filter(
        CreneauEmploi.enseignant_id == enseignant_id,
        CreneauEmploi.jour == jour_nom,
        CreneauEmploi.statut == "ACTIVE",
    ).all()

    seances = []
    for c in creneaux:
        existing = db.query(Seance).filter(
            Seance.creneau_id == c.creneau_id, Seance.date_seance == jour_date
        ).first()
        if existing:
            seances.append(existing)
            continue
        classe = db.query(Classe).filter(Classe.classe_id == c.classe_id).first()
        if not classe:
            continue
        nouvelle = Seance(
            creneau_id=c.creneau_id,
            classe_id=c.classe_id,
            matiere_id=c.matiere_id,
            annee_id=classe.annee_id,
            enseignant_prevu_id=enseignant_id,
            date_seance=jour_date,
            heure_debut_prevue=c.heure_debut,
            heure_fin_prevue=c.heure_fin,
            salle=c.salle,
        )
        db.add(nouvelle)
        try:
            db.flush()
        except Exception:
            db.rollback()
            existing = db.query(Seance).filter(
                Seance.creneau_id == c.creneau_id, Seance.date_seance == jour_date
            ).first()
            if existing:
                seances.append(existing)
            continue
        seances.append(nouvelle)
    db.commit()
    return seances


# ============================================================================
# PORTAIL ENSEIGNANT
# ============================================================================

@router.get("/{enseignant_id}/seances/jour")
def get_seances_du_jour(
    enseignant_id: int,
    date: Optional[str] = None,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    jour_date = date_type.fromisoformat(date) if date else date_type.today()
    seances = _generer_seances_du_jour(db, enseignant_id, jour_date)
    seances.sort(key=lambda s: s.heure_debut_prevue)
    return [_serialize_seance(db, s) for s in seances]


@router.get("/{enseignant_id}/seances/historique")
def get_historique_seances(
    enseignant_id: int,
    classe_id: Optional[int] = None,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    """Historique séance par séance (matière incluse) — complète
    GET /historique-appels (portail_enseignant.py), qui reste inchangé et
    ne montre que classe+demi-journée, sans matière."""
    q = db.query(Seance).filter(
        (Seance.enseignant_prevu_id == enseignant_id) | (Seance.enseignant_reel_id == enseignant_id)
    )
    if classe_id:
        q = q.filter(Seance.classe_id == classe_id)
    seances = q.order_by(Seance.date_seance.desc(), Seance.heure_debut_prevue.desc()).limit(200).all()
    return [_serialize_seance(db, s) for s in seances]


@router.get("/{enseignant_id}/seances/{seance_id}")
def get_seance_detail(
    enseignant_id: int, seance_id: int,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    s = _seance_teacher_ou_404(db, seance_id, enseignant_id, _auth)
    presences = db.query(Presence).filter(Presence.seance_id == seance_id).all()
    insc_ids = [p.inscription_id for p in presences]
    inscriptions = {i.inscription_id: i for i in db.query(Inscription).filter(Inscription.inscription_id.in_(insc_ids)).all()}
    eleve_ids = [i.eleve_id for i in inscriptions.values()]
    eleves = {e.eleve_id: e for e in db.query(Eleve).filter(Eleve.eleve_id.in_(eleve_ids)).all()}

    liste = []
    for p in presences:
        insc = inscriptions.get(p.inscription_id)
        eleve = eleves.get(insc.eleve_id) if insc else None
        liste.append({
            "inscription_id": p.inscription_id,
            "eleve": f"{eleve.prenom} {eleve.nom}" if eleve else "?",
            "matricule": eleve.matricule if eleve else None,
            "statut": p.statut_presence,
        })
    liste.sort(key=lambda x: x["eleve"])

    result = _serialize_seance(db, s)
    result["eleves"] = liste
    return result


@router.post("/{enseignant_id}/seances/{seance_id}/commencer")
def commencer_seance(
    enseignant_id: int, seance_id: int,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    s = _seance_teacher_ou_404(db, seance_id, enseignant_id, _auth)
    verifier_annee_modifiable(db, s.annee_id)
    if s.statut != "PREVUE":
        raise HTTPException(400, f"Séance déjà '{s.statut}', impossible de la commencer")
    s.heure_debut_reelle = datetime.now(timezone.utc)
    s.statut = "EN_COURS"
    if s.enseignant_reel_id is None:
        s.enseignant_reel_id = enseignant_id
    db.commit()
    return _serialize_seance(db, s)


class AppelSeanceItem(BaseModel):
    inscription_id: int
    statut: str


class AppelSeanceRequest(BaseModel):
    items: List[AppelSeanceItem]


@router.post("/{enseignant_id}/seances/{seance_id}/appel")
def faire_appel_seance(
    enseignant_id: int, seance_id: int, data: AppelSeanceRequest,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    s = _seance_teacher_ou_404(db, seance_id, enseignant_id, _auth)
    verifier_annee_modifiable(db, s.annee_id)
    if s.statut not in ("EN_COURS", "EFFECTUEE"):
        raise HTTPException(400, "L'appel ne peut être fait que sur une séance commencée")

    # Valider CHAQUE élément du lot (règle §4.4 des règles multi-écoles :
    # ne jamais ne contrôler que le premier) : toutes les inscriptions
    # doivent appartenir à la classe de cette séance, sinon un intrus glissé
    # dans le lot rattacherait une présence à un élève d'une autre classe.
    insc_ids = [item.inscription_id for item in data.items]
    valides = {
        i.inscription_id for i in db.query(Inscription.inscription_id).filter(
            Inscription.inscription_id.in_(insc_ids),
            Inscription.classe_id == s.classe_id,
            Inscription.statut == "ACTIVE",
        ).all()
    }

    demi_journee = _demi_journee(s.heure_debut_prevue)
    created, updated = 0, 0
    for item in data.items:
        if item.inscription_id not in valides:
            raise HTTPException(400, f"Inscription {item.inscription_id} n'appartient pas à cette classe")
        if item.statut not in STATUTS_PRESENCE_VALIDES:
            raise HTTPException(400, f"Statut invalide : {item.statut}")

        existing = db.query(Presence).filter(
            Presence.seance_id == seance_id, Presence.inscription_id == item.inscription_id
        ).first()
        if existing:
            existing.statut_presence = item.statut
            updated += 1
        else:
            db.add(Presence(
                inscription_id=item.inscription_id,
                date_presence=s.date_seance,
                demi_journee=demi_journee,
                statut_presence=item.statut,
                est_justifie="N",
                seance_id=seance_id,
            ))
            created += 1

    s.appel_fait = "O"
    s.appel_fait_le = datetime.now(timezone.utc)
    db.commit()
    return {"message": f"Appel enregistré : {created} créé(s), {updated} mis à jour", "seance_id": seance_id}


@router.post("/{enseignant_id}/seances/{seance_id}/terminer")
def terminer_seance(
    enseignant_id: int, seance_id: int,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    s = _seance_teacher_ou_404(db, seance_id, enseignant_id, _auth)
    verifier_annee_modifiable(db, s.annee_id)
    if s.statut not in ("EN_COURS",):
        raise HTTPException(400, f"Séance '{s.statut}', impossible de la terminer")

    counts = dict(
        db.query(Presence.statut_presence, func.count(Presence.presence_id))
        .filter(Presence.seance_id == seance_id)
        .group_by(Presence.statut_presence)
        .all()
    )
    s.nb_presents = counts.get("PRESENT", 0) if s.appel_fait == "O" else None
    s.nb_absents = (counts.get("ABSENT", 0) + counts.get("ABSENT_JUSTIFIE", 0)) if s.appel_fait == "O" else None
    s.nb_retards = counts.get("RETARD", 0) if s.appel_fait == "O" else None
    s.heure_fin_reelle = datetime.now(timezone.utc)
    s.statut = "EFFECTUEE"
    db.commit()
    return _serialize_seance(db, s)


class AnnulerSeanceRequest(BaseModel):
    motif: str


@router.put("/{enseignant_id}/seances/{seance_id}/annuler")
def annuler_seance(
    enseignant_id: int, seance_id: int, data: AnnulerSeanceRequest,
    _auth: dict = Depends(_enseignant_auth),
    db: Session = Depends(get_db),
):
    s = _seance_teacher_ou_404(db, seance_id, enseignant_id, _auth)
    verifier_annee_modifiable(db, s.annee_id)
    if s.statut != "PREVUE":
        raise HTTPException(400, f"Séance '{s.statut}', impossible de l'annuler")
    s.statut = "ANNULEE"
    s.motif_statut = data.motif
    db.commit()
    return _serialize_seance(db, s)


# ============================================================================
# ADMINISTRATION
# ============================================================================

def _materialiser_le_jour(db: Session, etablissement_id: int, jour: date_type) -> int:
    """Ouvre les cours d'une journée pour TOUTE l'école, depuis l'emploi du temps.

    POURQUOI CETTE FONCTION EXISTE
    ------------------------------
    Une séance ne naissait que si un enseignant ouvrait sa journée dans son
    portail. La direction, elle, voyait une page vide : l'école a 1 061
    créneaux à l'emploi du temps et le logiciel était incapable de dire quels
    cours étaient prévus ce matin, ni lesquels étaient tombés. Le seul écran
    censé répondre à « quels cours ont eu lieu aujourd'hui » ne répondait donc
    jamais, et constater l'absence d'un professeur reposait entièrement sur ce
    qu'un surveillant remarquait de lui-même.

    Ouvrir la journée ne préjuge de rien : chaque séance naît PREVUE. Elle ne
    devient EFFECTUEE que si quelqu'un fait cours, et l'absence d'un professeur
    se lit dans ce qui reste PREVUE à la fin de la journée.

    Idempotent : rappeler la fonction sur le même jour ne crée aucun doublon.
    Le week-end n'est plus écarté d'office : une école ouverte le samedi a de
    vrais cours ce jour-là, et sans séance il n'y a pas d'appel possible. Un
    jour sans créneau ne produit toujours aucune séance.
    Deux requêtes au total, quel que soit le nombre de classes : jamais une
    requête par créneau.
    """
    jour_nom = JOURS_SEMAINE[jour.weekday()]

    creneaux = (
        db.query(CreneauEmploi, Classe)
        .join(Classe, Classe.classe_id == CreneauEmploi.classe_id)
        .filter(
            Classe.etablissement_id == etablissement_id,
            CreneauEmploi.jour == jour_nom,
            CreneauEmploi.statut == "ACTIVE",
        )
        .all()
    )
    if not creneaux:
        return 0

    deja = {
        s.creneau_id for s in db.query(Seance.creneau_id).filter(
            Seance.date_seance == jour,
            Seance.creneau_id.in_([c.creneau_id for c, _ in creneaux]),
        ).all()
    }

    cree = 0
    for creneau, classe in creneaux:
        if creneau.creneau_id in deja:
            continue
        db.add(Seance(
            creneau_id=creneau.creneau_id,
            classe_id=creneau.classe_id,
            matiere_id=creneau.matiere_id,
            annee_id=classe.annee_id,
            enseignant_prevu_id=creneau.enseignant_id,
            date_seance=jour,
            heure_debut_prevue=creneau.heure_debut,
            heure_fin_prevue=creneau.heure_fin,
            salle=creneau.salle,
        ))
        cree += 1

    if cree:
        try:
            db.commit()
        except Exception:
            # Deux écrans ouverts au même instant sur la même journée : le
            # second retombe sur les lignes du premier, il n'y a rien à faire.
            db.rollback()
            return 0
    return cree


@router_admin.get("")
def list_seances(
    date: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    enseignant_id: Optional[int] = None,
    classe_id: Optional[int] = None,
    matiere_id: Optional[int] = None,
    statut: Optional[str] = None,
    ouvrir_la_journee: bool = True,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Les séances, filtrées. Ouvrir l'écran ouvre la journée concernée.

    Sans aucun filtre de date, c'est AUJOURD'HUI qu'on ouvre : c'est la
    question que se pose un directeur en arrivant le matin, et jusqu'ici
    l'écran lui répondait par une page vide.

    Sur une PLAGE de dates on n'ouvre rien : ouvrir un trimestre entier d'un
    clic créerait des dizaines de milliers de lignes sans que personne l'ait
    demandé. `ouvrir_la_journee=false` pour consulter sans rien créer.
    """
    if ouvrir_la_journee and not date_debut and not date_fin:
        _materialiser_le_jour(
            db, etablissement_id,
            date_type.fromisoformat(date) if date else date_type.today(),
        )

    q = db.query(Seance).join(Classe, Classe.classe_id == Seance.classe_id).filter(
        Classe.etablissement_id == etablissement_id
    )
    if date:
        q = q.filter(Seance.date_seance == date_type.fromisoformat(date))
    if date_debut:
        q = q.filter(Seance.date_seance >= date_type.fromisoformat(date_debut))
    if date_fin:
        q = q.filter(Seance.date_seance <= date_type.fromisoformat(date_fin))
    if enseignant_id:
        q = q.filter(
            (Seance.enseignant_prevu_id == enseignant_id) | (Seance.enseignant_reel_id == enseignant_id)
        )
    if classe_id:
        q = q.filter(Seance.classe_id == classe_id)
    if matiere_id:
        q = q.filter(Seance.matiere_id == matiere_id)
    if statut:
        q = q.filter(Seance.statut == statut)

    seances = q.order_by(Seance.date_seance.desc(), Seance.heure_debut_prevue.desc()).limit(500).all()
    return [_serialize_seance(db, s) for s in seances]


@router_admin.get("/eleve/{eleve_id}")
def historique_eleve(
    eleve_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Historique élève par séance (matière + enseignant par ligne),
    répond à "à quels cours cet élève a-t-il été absent" — pas juste un
    total. Élève est TENANT (colonne etablissement_id directe)."""
    eleve = db.query(Eleve).filter(
        Eleve.eleve_id == eleve_id, Eleve.etablissement_id == etablissement_id
    ).first()
    if not eleve:
        raise HTTPException(404, "Élève non trouvé")

    insc_ids = [
        i.inscription_id for i in
        db.query(Inscription.inscription_id).filter(Inscription.eleve_id == eleve_id).all()
    ]
    presences = (
        db.query(Presence)
        .filter(Presence.inscription_id.in_(insc_ids), Presence.seance_id.isnot(None))
        .order_by(Presence.date_presence.desc())
        .limit(200)
        .all()
    )
    seance_ids = [p.seance_id for p in presences]
    seances = {s.seance_id: s for s in db.query(Seance).filter(Seance.seance_id.in_(seance_ids)).all()}
    matiere_ids = {s.matiere_id for s in seances.values()}
    matieres = {m.matiere_id: m for m in db.query(Matiere).filter(Matiere.matiere_id.in_(matiere_ids)).all()}
    enseignant_ids = {s.enseignant_reel_id or s.enseignant_prevu_id for s in seances.values()}
    enseignants = {e.enseignant_id: e for e in db.query(Enseignant).filter(Enseignant.enseignant_id.in_(enseignant_ids)).all()}

    result = []
    for p in presences:
        s = seances.get(p.seance_id)
        if not s:
            continue
        mat = matieres.get(s.matiere_id)
        ens = enseignants.get(s.enseignant_reel_id or s.enseignant_prevu_id)
        result.append({
            "date": str(p.date_presence),
            "matiere": mat.libelle if mat else "?",
            "enseignant": f"{ens.prenom} {ens.nom}" if ens else "?",
            "statut": p.statut_presence,
        })
    return {"eleve": f"{eleve.prenom} {eleve.nom}", "matricule": eleve.matricule, "historique": result}


@router_admin.get("/{seance_id}")
def get_seance_admin_detail(
    seance_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    s = _seance_admin_ou_404(db, seance_id, etablissement_id)
    presences = db.query(Presence).filter(Presence.seance_id == seance_id).all()
    insc_ids = [p.inscription_id for p in presences]
    inscriptions = {i.inscription_id: i for i in db.query(Inscription).filter(Inscription.inscription_id.in_(insc_ids)).all()}
    eleve_ids = [i.eleve_id for i in inscriptions.values()]
    eleves = {e.eleve_id: e for e in db.query(Eleve).filter(Eleve.eleve_id.in_(eleve_ids)).all()}

    liste = []
    for p in presences:
        insc = inscriptions.get(p.inscription_id)
        eleve = eleves.get(insc.eleve_id) if insc else None
        liste.append({
            "eleve": f"{eleve.prenom} {eleve.nom}" if eleve else "?",
            "matricule": eleve.matricule if eleve else None,
            "statut": p.statut_presence,
        })
    liste.sort(key=lambda x: x["eleve"])
    result = _serialize_seance(db, s)
    result["eleves"] = liste
    return result


def _log_audit(db: Session, request: Request, current_user: dict, etablissement_id: int, action: str, details: str):
    client_ip = request.client.host if request.client else "127.0.0.1"
    nom_utilisateur = f"{current_user.get('prenom', '')} {current_user.get('nom', '')}".strip() or current_user.get("nom_utilisateur", "?")
    db.add(AuditLog(
        etablissement_id=etablissement_id,
        utilisateur_id=current_user.get("sub"),
        nom_utilisateur=nom_utilisateur,
        module="seances",
        action=action,
        details=details,
        ip_address=client_ip,
    ))


class RemplacerRequest(BaseModel):
    enseignant_remplacant_id: int
    motif: str


@router_admin.put("/{seance_id}/remplacer")
def remplacer_enseignant(
    seance_id: int, data: RemplacerRequest, request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    s = _seance_admin_ou_404(db, seance_id, etablissement_id)
    affecte = db.query(Affectation).filter(
        Affectation.enseignant_id == data.enseignant_remplacant_id,
        Affectation.matiere_id == s.matiere_id,
        Affectation.classe_id == s.classe_id,
        Affectation.statut == "ACTIVE",
    ).first()
    if not affecte:
        raise HTTPException(400, "Le remplaçant n'est pas affecté à cette matière/classe")

    ancien = s.enseignant_reel_id or s.enseignant_prevu_id
    s.enseignant_reel_id = data.enseignant_remplacant_id
    if s.statut == "PREVUE":
        s.statut = "REMPLACEE"
    _log_audit(
        db, request, current_user, etablissement_id, "REMPLACER_ENSEIGNANT",
        f"Séance {seance_id} : enseignant {ancien} -> {data.enseignant_remplacant_id}. Motif : {data.motif}",
    )
    db.commit()
    return _serialize_seance(db, s)


class StatutRequest(BaseModel):
    statut: str
    motif: Optional[str] = None


@router_admin.put("/{seance_id}/statut")
def override_statut(
    seance_id: int, data: StatutRequest, request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    valides = {"ANNULEE", "REPORTEE", "NON_EFFECTUEE"}
    if data.statut not in valides:
        raise HTTPException(400, f"Statut admin autorisé : {', '.join(valides)}")
    s = _seance_admin_ou_404(db, seance_id, etablissement_id)
    ancien = s.statut
    s.statut = data.statut
    s.motif_statut = data.motif
    _log_audit(
        db, request, current_user, etablissement_id, "MODIFIER_STATUT_SEANCE",
        f"Séance {seance_id} : statut {ancien} -> {data.statut}. Motif : {data.motif or '(non précisé)'}",
    )
    db.commit()
    return _serialize_seance(db, s)


class CorrigerPresenceRequest(BaseModel):
    statut: str
    motif: Optional[str] = None


@router_admin.put("/{seance_id}/presences/{presence_id}")
def corriger_presence(
    seance_id: int, presence_id: int, data: CorrigerPresenceRequest, request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    _seance_admin_ou_404(db, seance_id, etablissement_id)  # vérifie l'appartenance à l'école
    if data.statut not in STATUTS_PRESENCE_VALIDES:
        raise HTTPException(400, f"Statut invalide : {data.statut}")
    p = db.query(Presence).filter(Presence.presence_id == presence_id, Presence.seance_id == seance_id).first()
    if not p:
        raise HTTPException(404, "Présence non trouvée pour cette séance")
    ancien = p.statut_presence
    p.statut_presence = data.statut
    _log_audit(
        db, request, current_user, etablissement_id, "CORRIGER_PRESENCE",
        f"Présence {presence_id} (séance {seance_id}) : {ancien} -> {data.statut}. Motif : {data.motif or '(non précisé)'}",
    )
    db.commit()
    return {"message": "Présence corrigée", "presence_id": presence_id, "statut": data.statut}


@router_admin.delete("/{seance_id}/appel")
def supprimer_appel_seance(
    seance_id: int, request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    etablissement_id: int = Depends(require_etablissement),
):
    """Supprime l'appel déjà fait d'une séance : efface toutes les présences
    saisies et remet la séance en « appel non fait », pour pouvoir le refaire.

    La séance elle-même n'est pas supprimée (le cours a bien eu lieu) — seule
    la saisie de présence est effacée. Refusé sur une année clôturée.
    """
    s = _seance_admin_ou_404(db, seance_id, etablissement_id)
    verifier_annee_modifiable(db, s.annee_id)
    nb = db.query(Presence).filter(Presence.seance_id == seance_id).delete(synchronize_session=False)
    s.appel_fait = "N"
    s.appel_fait_le = None
    _log_audit(
        db, request, current_user, etablissement_id, "SUPPRIMER_APPEL_SEANCE",
        f"Séance {seance_id} : appel supprimé ({nb} présence(s) effacée(s)).",
    )
    db.commit()
    return {"message": f"Appel supprimé ({nb} présence(s) effacée(s))", "seance_id": seance_id, "presences_supprimees": nb}
