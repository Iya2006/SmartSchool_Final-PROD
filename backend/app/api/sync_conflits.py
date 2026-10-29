"""
SMARTSCHOOL API — « À vérifier » : les changements des postes hors-ligne que
la synchronisation n'a pas pu trancher seule (côté cloud, version web).

Doublon d'une valeur unique, même donnée sensible modifiée à deux endroits,
ligne supprimée ici et modifiée là... La direction voit les deux versions et
choisit. Le choix repart vers tous les postes de l'école à leur prochaine
synchronisation. Sur un poste, les mêmes routes existent et relaient vers le
cloud (app/api/poste_local.py) : l'interface est la même partout.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.poste import exige_installation_poste
from app.core.auth import get_current_user, require_etablissement
from app.core.database import get_db
from app.models.academique import SyncConflit
from app.sync.cote_cloud import ResolutionImpossible, conflits_de, resoudre_conflit

router = APIRouter(prefix="/api/sync/conflits", tags=["Synchronisation — à vérifier"])
postes_router = APIRouter(prefix="/api/sync/postes", tags=["Synchronisation — à vérifier"])


@postes_router.get("", dependencies=[Depends(exige_installation_poste)])
def postes_de_l_ecole(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Les ordinateurs installés de l'école et leur dernier échange avec le
    cloud : un poste qui ne s'est pas synchronisé depuis longtemps n'est plus
    sauvegardé."""
    from app.models.academique import Appareil

    appareils = db.query(Appareil).filter(Appareil.etablissement_id == etablissement_id).order_by(Appareil.rang)
    return {"postes": [{
        "rang": a.rang,
        "nom": a.nom,
        "enregistre_par": a.enregistre_par,
        "enregistre_le": a.enregistre_le.isoformat() if a.enregistre_le else None,
        "dernier_contact": a.dernier_contact.isoformat() if a.dernier_contact else None,
        "retire": a.revoque_le is not None,
    } for a in appareils]}


class Choix(BaseModel):
    choix: str = Field(pattern="^(SERVEUR|POSTE)$")


@router.get("", dependencies=[Depends(get_current_user)])
def liste(tous: bool = False, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    return {"conflits": conflits_de(db, etablissement_id, a_verifier_seulement=not tous)}


@router.post("/{conflit_id}/resoudre")
def resoudre(
    conflit_id: int,
    choix: Choix,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(exige_installation_poste),
):
    conflit = db.get(SyncConflit, conflit_id)
    if conflit is None or conflit.etablissement_id != etablissement_id:
        raise HTTPException(404, "Conflit introuvable")
    try:
        resoudre_conflit(db, conflit, choix.choix, str(current_user.get("nom") or current_user.get("sub") or ""))
    except ResolutionImpossible as raison:
        db.rollback()
        raise HTTPException(409, str(raison))
    return {"ok": True}
