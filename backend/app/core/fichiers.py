"""
Dossier des fichiers envoyés (photos, logos, sujets, devoirs, justificatifs,
bulletins PDF), servi sous `/uploads`.

En ligne : `backend/uploads`, comme toujours. Sur un poste local, le dossier du
programme peut être en lecture seule (Program Files) : l'application installée
indique un dossier de données de l'utilisateur via SMARTSCHOOL_DOSSIER_FICHIERS.
Ces fichiers suivront la synchronisation (phase B du chantier hors-ligne).
"""
import os

_RACINE_BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DOSSIER_FICHIERS = os.getenv("SMARTSCHOOL_DOSSIER_FICHIERS") or os.path.join(_RACINE_BACKEND, "uploads")


def dossier_fichiers(*sous_dossiers: str) -> str:
    """Chemin d'un sous-dossier des fichiers, créé s'il n'existe pas."""
    chemin = os.path.join(DOSSIER_FICHIERS, *sous_dossiers)
    os.makedirs(chemin, exist_ok=True)
    return chemin
