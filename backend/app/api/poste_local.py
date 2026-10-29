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
from app.sync.identifiants import activer_le_poste
from app.sync.installation import Installateur, lire_appareil, lire_marqueur

router = APIRouter(prefix="/api/poste", tags=["Poste local (hors-ligne)"])

installateur = Installateur(DOSSIER_POSTE, CLOUD_URL, engine, dossier_fichiers=DOSSIER_FICHIERS)

# Poste déjà installé : il reprend sa plage d'identifiants, son rang et la clé
# de ses reçus dès le démarrage. Sinon, toute création reste refusée jusqu'à
# la fin de l'installation.
if lire_marqueur(DOSSIER_POSTE):
    _appareil = lire_appareil(DOSSIER_POSTE)
    activer_le_poste(engine, _appareil["appareil_id"], _appareil["rang"], _appareil["cle_signature"])


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
