"""
SMARTSCHOOL — Module d'authentification JWT
Génération et validation de tokens pour l'accès admin.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.secrets import read_secret

# Charger le .env depuis le dossier backend
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

# Clé secrète — depuis backend/.env (JWT_SECRET_KEY) ou un Docker Secret
# (JWT_SECRET_KEY_FILE, ex: /run/secrets/jwt_secret en production)
SECRET_KEY = read_secret("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("⚠️  JWT_SECRET_KEY manquante ! Configurez-la dans backend/.env (ou JWT_SECRET_KEY_FILE en prod)")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crée un token JWT avec les données fournies."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Décode et valide un token JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expiré, veuillez vous reconnecter",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Dependency FastAPI: retourne les données de l'utilisateur connecté."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


# Controle d'acces par role (RBAC)
# Roles "admin" au sens large (direction / rectorat), tous rediriges vers le
# back-office complet cote frontend (voir AuthContext.getRedirectPath).
ADMIN_TIER_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU"}


def require_roles(*roles: str):
    """Dependency factory FastAPI : exige que le role du token JWT figure dans `roles`.

    Usage: app.include_router(finance_router, dependencies=[Depends(require_roles("ADMIN", "COMPTABLE"))])
    """
    allowed = set(roles)

    async def _role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        role = current_user.get("role", "")
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acces refuse : privileges insuffisants pour cette ressource",
            )
        return current_user

    return _role_checker
