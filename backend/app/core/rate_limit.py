"""
SMARTSCHOOL — Rate Limiter
Protection contre le brute-force sur les 3 endpoints de connexion
(auth.py, portail_eleve.py, portail_parent.py — la seule protection
anti-brute-force du projet). Utilise slowapi pour FastAPI.

En mode test (RATELIMIT_ENABLED=0), le limiter est désactivé pour éviter
les faux positifs 429 lors des tests répétés.

Stockage Redis (validation préproduction) : `Dockerfile.prod` lance 4
workers uvicorn en process séparés — le stockage en mémoire par défaut de
slowapi n'est PAS partagé entre eux, ce qui multiplie jusqu'à 4x la limite
réelle sur des endpoints dont le but même est de limiter les tentatives de
connexion. Redis (déjà requis par Étape F/G) sert de stockage partagé,
vérifié réellement : la limite est bien commune entre process distincts
via Redis. `in_memory_fallback_enabled=True` fait retomber sur le
comportement actuel (mémoire locale par process, jamais un échec dur) si
Redis est indisponible — vérifié réellement aussi (aucune 500, la
connexion reste utilisable, juste avec une protection plus faible le temps
de la panne) — cohérent avec le reste du projet, où Redis n'est jamais
critique (app/core/cache.py).
"""
import os
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse


# ── En mode test, on désactive le rate limiting ────────────────────────────
# Variable injectée dans conftest.py avant l'import de main.py
_RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "1") != "0"

# Si désactivé (tests), toutes les limites retournent "9999/minute"
_DEFAULT_LIMIT = "9999/minute" if not _RATELIMIT_ENABLED else "5/minute"

_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Limiter basé sur l'adresse IP du client
#
# `enabled=True` ici est INTENTIONNEL, pas un bug : slowapi 0.1.10 relit
# lui-même la variable d'environnement RATELIMIT_ENABLED à la construction
# (même nom que la nôtre — convention réservée par la librairie), via
# `self.enabled = self.get_app_config(C.ENABLED, self.enabled)`. Cette relecture
# ne CAST correctement la valeur en booléen QUE si le défaut fourni est
# truthy (`get_app_config` saute le cast quand le défaut est falsy, et
# `bool("0")` vaut `True` en Python — chaîne non vide). En passant
# `enabled=_RATELIMIT_ENABLED` (donc `False` en mode test), le cast était
# sauté et `limiter.enabled` finissait par valoir la chaîne brute `"0"`,
# donc TOUJOURS vraie : le rate limiting restait actif pendant TOUS les
# tests, y compris `RATELIMIT_ENABLED=0`. Confirmé en reproduisant
# directement (3 requêtes passent, la 4e reçoit un vrai 429) — révélé par
# les tests `test_inscription_etablissement.py`, premier endpoint testé
# plus de 3 fois d'affilée dans un même fichier. En passant un défaut
# TOUJOURS truthy (`True`), le cast s'applique et slowapi convertit
# correctement `"0"` en `False` — `_RATELIMIT_ENABLED` (calculé ci-dessus en
# Python pur) reste utilisé pour `_DEFAULT_LIMIT`, non affecté par ce piège.
limiter = Limiter(
    key_func=get_remote_address,
    enabled=True,
    storage_uri=_REDIS_URL,
    in_memory_fallback_enabled=True,
)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Handler personnalisé pour les dépassements de limite."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Trop de tentatives. Veuillez réessayer dans quelques minutes.",
            "retry_after": str(exc.detail)
        }
    )
