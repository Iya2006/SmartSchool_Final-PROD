"""
SMARTSCHOOL — Rate Limiter
Protection contre le brute-force sur les endpoints sensibles.
Utilise slowapi pour FastAPI.

En mode test (RATELIMIT_ENABLED=0), le limiter est désactivé pour éviter
les faux positifs 429 lors des tests répétés.
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

# Limiter basé sur l'adresse IP du client
limiter = Limiter(
    key_func=get_remote_address,
    enabled=_RATELIMIT_ENABLED,
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
