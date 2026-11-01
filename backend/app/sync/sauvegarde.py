"""
Sauvegarde de la base d'un poste avant une mise à niveau.

Au premier démarrage d'une nouvelle version, le moteur complète le schéma
local (colonnes, index : migrations/rattraper_colonnes_manquantes.py). Si
cette étape tournait mal, les changements faits hors-ligne et pas encore
synchronisés seraient perdus avec elle : le cloud n'en a pas de copie. On
copie donc la base juste avant, avec `VACUUM INTO` (copie cohérente, même
pendant l'écriture ; une base chiffrée le reste, avec la même clé).

Les deux dernières copies sont gardées, dans `poste/sauvegardes/`.
"""
import os
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine

FICHIER_VERSION = "version.txt"
GARDEES = 2


def _lire(chemin: str) -> Optional[str]:
    try:
        with open(chemin, encoding="utf-8") as f:
            return f.read().strip() or None
    except OSError:
        return None


def sauvegarder_si_nouvelle_version(moteur: Engine, dossier_poste: str, version: str) -> Optional[str]:
    """Copie la base si la version a changé depuis le dernier démarrage. Rend
    le chemin de la copie, ou None (premier démarrage, même version)."""
    precedente = _lire(os.path.join(dossier_poste, FICHIER_VERSION))
    if precedente is None or precedente == version:
        return None
    dossier = os.path.join(dossier_poste, "sauvegardes")
    os.makedirs(dossier, exist_ok=True)
    horodatage = datetime.now().strftime("%Y%m%d-%H%M%S")
    copie = os.path.join(dossier, f"avant-{version}-depuis-{precedente}-{horodatage}.db")
    with moteur.connect() as cx:
        cx.execute(text("VACUUM INTO :chemin"), {"chemin": copie})
    anciennes = sorted(
        (os.path.join(dossier, nom) for nom in os.listdir(dossier) if nom.startswith("avant-")),
        key=os.path.getmtime,
    )
    for ancienne in anciennes[:-GARDEES]:
        os.remove(ancienne)
    return copie


def noter_version(dossier_poste: str, version: str) -> None:
    """À appeler une fois la mise à niveau du schéma réussie."""
    os.makedirs(dossier_poste, exist_ok=True)
    with open(os.path.join(dossier_poste, FICHIER_VERSION), "w", encoding="utf-8") as f:
        f.write(version)
