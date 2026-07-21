"""
SMARTSCHOOL — Lecture unifiée des secrets (variable d'env ou Docker Secret).

Convention Docker Secrets : en production, une variable comme JWT_SECRET_KEY
est fournie via un fichier monté (ex: /run/secrets/jwt_secret) et exposée au
conteneur sous le nom JWT_SECRET_KEY_FILE. En développement, la valeur est
simplement définie directement dans .env sous le nom JWT_SECRET_KEY.

`read_secret()` gère les deux cas de façon transparente :
1. Si `<NAME>_FILE` est définie et pointe vers un fichier lisible → son contenu.
2. Sinon, la variable d'environnement `<NAME>` elle-même.
3. Sinon, la valeur par défaut fournie.
"""
import os
from typing import Optional


def read_secret(name: str, default: Optional[str] = None) -> Optional[str]:
    """Lit un secret depuis `<name>_FILE` (Docker Secret) ou `<name>` (env var)."""
    file_path = os.getenv(f"{name}_FILE")
    if file_path:
        try:
            with open(file_path, "r", encoding="utf-8") as fh:
                value = fh.read().strip()
            if value:
                return value
        except OSError:
            pass  # Fichier illisible/inexistant → on retombe sur la variable directe
    return os.getenv(name, default)
