"""
SMARTSCHOOL API — Incidents applicatifs.

LE MANQUE
---------
`/api/monitoring` surveille la MACHINE : PostgreSQL debout ou pas, Redis, la
file d'attente, les workers. Il ne dit rien de l'APPLICATION. Si une école
tombe sur une erreur en imprimant un bulletin, l'éditeur ne l'apprend qu'en
étant appelé — après que l'école s'en soit aperçue.

CE MODULE
---------
Un filet attrape chaque erreur non gérée avant qu'elle ne sorte
(`main.py::enregistrer_incident`), l'enregistre, et rend à l'utilisateur un
message propre au lieu d'une page cassée.

CE QU'ON ENREGISTRE, ET RIEN DE PLUS
------------------------------------
Une erreur peut traverser des données d'école. On garde donc uniquement ce qui
sert à corriger : la route, le type d'erreur, son message technique, l'école et
le rôle de l'utilisateur. **Jamais** le corps de la requête, les notes, les noms
d'élèves ou les montants — un journal d'incidents ne doit pas devenir une porte
dérobée vers les données des écoles.

REGROUPEMENT
------------
Quarante-sept fois la même erreur, c'est UNE ligne. Une liste brute de plusieurs
centaines d'entrées ne se lit pas, donc ne se traite pas.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func

from sqlalchemy.orm import Session

from app.core.auth import require_roles
from app.core.database import get_db
from app.models.academique import Etablissement, IncidentApplicatif

router = APIRouter(prefix="/api/incidents", tags=["Incidents"])

# Les incidents portent SUR les écoles, pas sur une école : c'est une vue
# d'éditeur de plateforme. Un administrateur d'école n'a rien à y faire — il
# verrait les erreurs des autres.
_require_super_admin = require_roles("SUPER_ADMIN")

# Au-delà, le message technique n'apporte plus rien et alourdit la table.
LONGUEUR_MESSAGE_MAX = 800


def enregistrer(
    db: Session,
    *,
    route: str,
    methode: str,
    type_erreur: str,
    message: str,
    etablissement_id: Optional[int] = None,
    role: Optional[str] = None,
    trace: Optional[str] = None,
) -> None:
    """Consigne un incident. Ne lève jamais.

    Un journal qui fait planter l'application qu'il observe est pire que pas de
    journal du tout : l'utilisateur verrait une seconde erreur, provoquée par la
    tentative d'enregistrer la première.
    """
    try:
        db.add(IncidentApplicatif(
            route=route[:300],
            methode=(methode or "")[:10],
            type_erreur=(type_erreur or "")[:120],
            message=(message or "")[:LONGUEUR_MESSAGE_MAX],
            trace=(trace or "")[:4000] or None,
            etablissement_id=etablissement_id,
            role=(role or "")[:40] or None,
            date_incident=datetime.now(),
        ))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


@router.get("", dependencies=[Depends(_require_super_admin)])
def lister_incidents(
    jours: int = 7,
    resolu: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """Incidents REGROUPÉS par (route, type d'erreur).

    Quarante-sept occurrences du même bug forment une ligne : « 47 fois, 3
    écoles, dernière il y a 12 min ». C'est ce qui rend la liste actionnable.
    """
    depuis = datetime.now() - timedelta(days=max(1, min(jours, 90)))

    requete = db.query(
        IncidentApplicatif.route,
        IncidentApplicatif.methode,
        IncidentApplicatif.type_erreur,
        func.count(IncidentApplicatif.incident_id).label("occurrences"),
        func.count(func.distinct(IncidentApplicatif.etablissement_id)).label("ecoles"),
        func.max(IncidentApplicatif.date_incident).label("derniere"),
        func.min(IncidentApplicatif.date_incident).label("premiere"),
        func.max(IncidentApplicatif.message).label("message"),
        func.max(IncidentApplicatif.incident_id).label("dernier_id"),
    ).filter(IncidentApplicatif.date_incident >= depuis)

    if resolu is not None:
        requete = requete.filter(IncidentApplicatif.resolu == ("O" if resolu else "N"))

    groupes = requete.group_by(
        IncidentApplicatif.route,
        IncidentApplicatif.methode,
        IncidentApplicatif.type_erreur,
    ).order_by(func.max(IncidentApplicatif.date_incident).desc()).all()

    return [
        {
            "route": g.route,
            "methode": g.methode,
            "type_erreur": g.type_erreur,
            "message": g.message,
            "occurrences": g.occurrences,
            "ecoles_touchees": g.ecoles,
            "premiere": g.premiere.isoformat() if g.premiere else None,
            "derniere": g.derniere.isoformat() if g.derniere else None,
            "dernier_id": g.dernier_id,
        }
        for g in groupes
    ]


@router.get("/resume", dependencies=[Depends(_require_super_admin)])
def resume_incidents(db: Session = Depends(get_db)):
    """Compteur pour la pastille de navigation et l'écran Monitoring."""
    depuis_24h = datetime.now() - timedelta(hours=24)
    return {
        "non_resolus": db.query(func.count(IncidentApplicatif.incident_id)).filter(
            IncidentApplicatif.resolu == "N"
        ).scalar() or 0,
        "dernieres_24h": db.query(func.count(IncidentApplicatif.incident_id)).filter(
            IncidentApplicatif.date_incident >= depuis_24h
        ).scalar() or 0,
        "ecoles_touchees_24h": db.query(
            func.count(func.distinct(IncidentApplicatif.etablissement_id))
        ).filter(IncidentApplicatif.date_incident >= depuis_24h).scalar() or 0,
    }


@router.get("/{incident_id}", dependencies=[Depends(_require_super_admin)])
def detail_incident(incident_id: int, db: Session = Depends(get_db)):
    """Une occurrence précise, avec sa trace technique."""
    inc = db.query(IncidentApplicatif).filter(
        IncidentApplicatif.incident_id == incident_id
    ).first()
    if not inc:
        raise HTTPException(404, "Incident non trouvé")

    ecole = None
    if inc.etablissement_id:
        e = db.query(Etablissement.nom).filter(
            Etablissement.etablissement_id == inc.etablissement_id
        ).first()
        ecole = e[0] if e else None

    return {
        "incident_id": inc.incident_id,
        "route": inc.route,
        "methode": inc.methode,
        "type_erreur": inc.type_erreur,
        "message": inc.message,
        "trace": inc.trace,
        "etablissement": ecole,
        "role": inc.role,
        "date_incident": inc.date_incident.isoformat() if inc.date_incident else None,
        "resolu": inc.resolu == "O",
    }


@router.put("/marquer-resolu", dependencies=[Depends(_require_super_admin)])
def marquer_resolu(
    route: str,
    type_erreur: str,
    db: Session = Depends(get_db),
):
    """Marque comme réglées toutes les occurrences d'un même bug.

    Marquer une occurrence n'aurait aucun sens : on corrige un bug, pas une de
    ses apparitions. Rien n'est supprimé — si le bug revient, les nouvelles
    occurrences reparaissent comme non résolues.
    """
    n = db.query(IncidentApplicatif).filter(
        IncidentApplicatif.route == route,
        IncidentApplicatif.type_erreur == type_erreur,
        IncidentApplicatif.resolu == "N",
    ).update({"resolu": "O"}, synchronize_session=False)
    db.commit()
    return {"message": f"{n} occurrence(s) marquée(s) comme réglée(s).", "occurrences": n}
