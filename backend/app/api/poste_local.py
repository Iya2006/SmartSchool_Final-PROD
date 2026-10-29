"""
SMARTSCHOOL API — Poste local : installation et synchronisation (monté
seulement en mode poste).

Au premier lancement de l'application installée, la base locale est vide :
personne ne peut s'y connecter. L'écran d'installation appelle ces routes pour
télécharger l'établissement depuis le cloud avec un compte de direction
(app/sync/installation.py). Une fois le poste installé, l'installation est
refusée : on ne remplace jamais en silence les données d'un poste en service.

Ensuite, le poste se synchronise seul en arrière-plan (app/sync/service.py) ;
l'interface en lit l'état et peut demander un échange immédiat.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.poste import exige_installation_poste
from app.core.auth import get_current_user
from app.core.database import engine
from app.core.fichiers import DOSSIER_FICHIERS
from app.core.mode import CLOUD_URL, DOSSIER_POSTE
from app.sync.identifiants import activer_le_poste
from app.sync.installation import Installateur, lire_appareil, lire_marqueur
from app.sync.service import Synchroniseur

router = APIRouter(prefix="/api/poste", tags=["Poste local (hors-ligne)"])


def _jeton_du_poste():
    appareil = lire_appareil(DOSSIER_POSTE)
    return appareil.get("jeton") if appareil and lire_marqueur(DOSSIER_POSTE) else None


synchroniseur = Synchroniseur(engine, _jeton_du_poste, CLOUD_URL, dossier_fichiers=DOSSIER_FICHIERS)
installateur = Installateur(DOSSIER_POSTE, CLOUD_URL, engine, dossier_fichiers=DOSSIER_FICHIERS,
                            apres_installation=synchroniseur.demarrer)

# Poste déjà installé : il reprend sa plage d'identifiants, son rang et la clé
# de ses reçus dès le démarrage, puis se synchronise. Sinon, toute création
# reste refusée jusqu'à la fin de l'installation.
if lire_marqueur(DOSSIER_POSTE):
    _appareil = lire_appareil(DOSSIER_POSTE)
    activer_le_poste(engine, _appareil["appareil_id"], _appareil["rang"], _appareil["cle_signature"])
    synchroniseur.demarrer()


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


@router.get("/synchronisation", dependencies=[Depends(get_current_user)])
def etat_de_la_synchronisation():
    """Synchronisé, en cours, hors ligne depuis..., changements en attente."""
    return synchroniseur.etat()


@router.post("/synchroniser", status_code=202, dependencies=[Depends(get_current_user)])
def synchroniser_maintenant():
    synchroniseur.synchroniser_maintenant()
    return synchroniseur.etat()


# ── « À vérifier », relayé vers le cloud ──────────────────────────────────
# Mêmes chemins que sur le cloud (app/api/sync_conflits.py) : l'interface ne
# change pas. Le poste vérifie lui-même que l'utilisateur fait partie de la
# direction, puis s'adresse au cloud avec son jeton d'appareil.

relais = APIRouter(prefix="/api/sync/conflits", tags=["Synchronisation — à vérifier"])

HORS_LIGNE = "Ces décisions se prennent avec internet : reconnectez ce poste, puis réessayez."


def _vers_le_cloud(methode: str, chemin: str, **options):
    jeton = _jeton_du_poste()
    if not jeton:
        raise HTTPException(409, "Ce poste n'est pas encore installé.")
    try:
        with httpx.Client(base_url=CLOUD_URL, timeout=30) as client:
            rep = client.request(methode, chemin, headers={"Authorization": f"Appareil {jeton}"}, **options)
    except httpx.TransportError:
        raise HTTPException(503, HORS_LIGNE)
    if rep.status_code >= 400:
        detail = rep.json().get("detail") if rep.headers.get("content-type", "").startswith("application/json") else None
        raise HTTPException(rep.status_code, detail or "Le serveur a refusé la demande.")
    return rep.json()


@relais.get("", dependencies=[Depends(get_current_user)])
def conflits(tous: bool = False):
    return _vers_le_cloud("GET", "/api/sync/appareil/conflits", params={"tous": tous})


@relais.post("/{conflit_id}/resoudre")
def resoudre(conflit_id: int, choix: dict, current_user: dict = Depends(exige_installation_poste)):
    resultat = _vers_le_cloud("POST", f"/api/sync/appareil/conflits/{conflit_id}/resoudre", json={
        "choix": choix.get("choix"), "auteur": str(current_user.get("nom") or current_user.get("sub") or ""),
    })
    # Le choix revient par la synchronisation : autant la lancer tout de suite.
    synchroniseur.synchroniser_maintenant()
    return resultat
