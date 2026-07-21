"""
SMARTSCHOOL — Module de sécurité
Hashage et vérification des mots de passe avec bcrypt.
"""
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Hashe un mot de passe en clair avec bcrypt."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Vérifie un mot de passe en clair contre un hash bcrypt.
    Gère les cas où le mot de passe n'a pas encore été haché ou est vide (défaut = 'smartschool').
    """
    if not hashed:
        return plain == "smartschool"
        
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False
