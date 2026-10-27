"""
Mode d'exécution du moteur SmartSchool.

- `cloud` (défaut) : le serveur en ligne, PostgreSQL, Redis, file RQ.
- `poste` : le moteur installé sur un ordinateur de l'école (offline-first),
  avec sa base locale SQLite. Ni Redis ni processus séparé : tout tourne dans
  le moteur, avec ou sans internet. Défini par l'application installée via
  la variable d'environnement SMARTSCHOOL_MODE=poste.
"""
import os

MODE = os.getenv("SMARTSCHOOL_MODE", "cloud").strip().lower()
MODE_POSTE = MODE == "poste"

# Poste local : dossier des données propres à cet appareil (marqueur
# d'installation, identité de l'appareil). Fourni par l'application installée.
DOSSIER_POSTE = os.getenv("SMARTSCHOOL_DOSSIER_POSTE") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "poste-local"
)

# Adresse du cloud SmartSchool, d'où le poste télécharge son établissement et
# avec lequel il se synchronise.
CLOUD_URL = os.getenv("SMARTSCHOOL_CLOUD_URL", "https://api.trxsmartschool.com").rstrip("/")
