"""
SMARTSCHOOL API — Synchronisation des postes hors-ligne (côté cloud).

Un poste installé (app/sync/service.py) envoie ce qu'il a écrit et reçoit ce
qui a changé dans son école, plusieurs fois par minute quand internet est là,
sans qu'aucun utilisateur ne soit connecté : il s'authentifie avec le jeton
reçu à son enregistrement (`Authorization: Appareil <jeton>`). Un poste
révoqué est refusé.

Toute la logique est dans app/sync/cote_cloud.py.
"""
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.poste import SCHEMA_PAS_PRET, empreinte_jeton
from app.core.database import get_db
from app.core.fichiers import DOSSIER_FICHIERS
from app.sync.fichiers import TAILLE_MAX, chemin_sur, ecrire, manquants
from app.models.academique import Appareil, SyncConflit
from app.sync.cote_cloud import (
    LOT_MAX, PAGE_RECEPTION_MAX, ResolutionImpossible, appliquer_lot, changements_pour, conflits_de,
    resoudre_conflit,
)
from app.sync.schema import schema_identifiants_a_jour

router = APIRouter(prefix="/api/sync/appareil", tags=["Synchronisation des postes"])


def appareil_authentifie(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Appareil:
    if not schema_identifiants_a_jour(db.get_bind()):
        raise HTTPException(503, SCHEMA_PAS_PRET)
    schema, _, jeton = (authorization or "").partition(" ")
    if schema != "Appareil" or not jeton.strip():
        raise HTTPException(401, "Poste non reconnu.")
    appareil = db.query(Appareil).filter(Appareil.jeton_empreinte == empreinte_jeton(jeton.strip())).first()
    if appareil is None:
        raise HTTPException(401, "Poste non reconnu.")
    if appareil.revoque_le is not None:
        raise HTTPException(403, "Ce poste a été retiré par la direction : il ne peut plus se synchroniser.")
    return appareil


class Changement(BaseModel):
    seq: int
    table: str = Field(max_length=64)
    cle: int
    operation: str = Field(pattern="^[IUD]$")
    donnees: Optional[dict[str, Any]] = None
    # État de la ligne avant le premier changement local : base de la fusion.
    avant: Optional[dict[str, Any]] = None
    modifie_le: Optional[str] = Field(None, max_length=40)


class Lot(BaseModel):
    changements: List[Changement] = Field(max_length=LOT_MAX)


@router.post("/envoi")
def recevoir_un_lot(lot: Lot, appareil: Appareil = Depends(appareil_authentifie), db: Session = Depends(get_db)):
    return appliquer_lot(db, appareil, [c.model_dump() for c in lot.changements])


@router.get("/reception")
def envoyer_les_changements(
    depuis: int = Query(0, ge=0),
    limite: int = Query(PAGE_RECEPTION_MAX, ge=1, le=PAGE_RECEPTION_MAX),
    appareil: Appareil = Depends(appareil_authentifie),
    db: Session = Depends(get_db),
):
    return changements_pour(db, appareil, depuis, limite)


# Fichiers cités par les données (photos, logos, devoirs...) : le poste
# demande ceux qui manquent au cloud et n'envoie que ceux-là. Jamais
# d'écrasement : un poste complète, il ne remplace pas (app/sync/fichiers.py).

class Chemins(BaseModel):
    chemins: List[str] = Field(max_length=5000)


@router.post("/fichiers/manquants")
def fichiers_manquants(demande: Chemins, appareil: Appareil = Depends(appareil_authentifie)):
    return {"manquants": manquants(DOSSIER_FICHIERS, demande.chemins)}


@router.post("/fichiers", status_code=201)
async def deposer_un_fichier(
    chemin: str = Form(..., max_length=500),
    fichier: UploadFile = File(...),
    appareil: Appareil = Depends(appareil_authentifie),
):
    contenu = await fichier.read(TAILLE_MAX + 1)
    if len(contenu) > TAILLE_MAX:
        raise HTTPException(413, "Fichier trop volumineux.")
    if chemin_sur(DOSSIER_FICHIERS, chemin) is None:
        raise HTTPException(400, "Chemin de fichier refusé.")
    return {"ecrit": ecrire(DOSSIER_FICHIERS, chemin, contenu)}


# « À vérifier » relayé par un poste : le poste a déjà vérifié, avec son
# propre moteur, que l'utilisateur connecté fait partie de la direction ; il
# transmet son nom pour la traçabilité.

class ChoixRelaye(BaseModel):
    choix: str = Field(pattern="^(SERVEUR|POSTE)$")
    auteur: str = Field("", max_length=100)


@router.get("/conflits")
def conflits_de_l_ecole(tous: bool = False, appareil: Appareil = Depends(appareil_authentifie),
                        db: Session = Depends(get_db)):
    return {"conflits": conflits_de(db, appareil.etablissement_id, a_verifier_seulement=not tous)}


@router.post("/conflits/{conflit_id}/resoudre")
def resoudre_depuis_un_poste(conflit_id: int, choix: ChoixRelaye, appareil: Appareil = Depends(appareil_authentifie),
                             db: Session = Depends(get_db)):
    conflit = db.get(SyncConflit, conflit_id)
    if conflit is None or conflit.etablissement_id != appareil.etablissement_id:
        raise HTTPException(404, "Conflit introuvable")
    try:
        resoudre_conflit(db, conflit, choix.choix, f"{choix.auteur} (poste P{appareil.rang})")
    except ResolutionImpossible as raison:
        db.rollback()
        raise HTTPException(409, str(raison))
    return {"ok": True}
