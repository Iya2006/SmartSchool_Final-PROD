"""
SMARTSCHOOL API — Poste local : installation (monté seulement en mode poste).

Au premier lancement de l'application installée, la base locale est vide :
personne ne peut s'y connecter. L'écran d'installation appelle ces routes pour
télécharger l'établissement depuis le cloud avec un compte de direction
(app/sync/installation.py). Une fois le poste installé, l'installation est
refusée : on ne remplace jamais en silence les données d'un poste en service.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import engine
from app.core.fichiers import DOSSIER_FICHIERS
from app.core.mode import CLOUD_URL, DOSSIER_POSTE
from app.sync.installation import Installateur

router = APIRouter(prefix="/api/poste", tags=["Poste local (hors-ligne)"])

installateur = Installateur(DOSSIER_POSTE, CLOUD_URL, engine, dossier_fichiers=DOSSIER_FICHIERS)


class DemandeInstallation(BaseModel):
    identifiant: str
    mot_de_passe: str


@router.get("/etat")
def etat_du_poste():
    """Sans authentification : avant l'installation, aucun compte n'existe sur
    le poste. Ne révèle que l'état de l'installation et le nom de l'école."""
    return {"mode": "poste", **installateur.etat()}


@router.post("/installer", status_code=202)
def installer_le_poste(demande: DemandeInstallation):
    if not installateur.demarrer(demande.identifiant, demande.mot_de_passe):
        statut = installateur.progression.statut
        if statut == "INSTALLE":
            raise HTTPException(409, "Ce poste est déjà installé.")
        raise HTTPException(409, "Une installation est déjà en cours.")
    return {"mode": "poste", **installateur.etat()}
