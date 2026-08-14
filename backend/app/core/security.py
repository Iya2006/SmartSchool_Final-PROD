"""
SMARTSCHOOL — Module de sécurité
Hashage et vérification des mots de passe avec bcrypt.
"""
from typing import Optional

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Hashe un mot de passe en clair avec bcrypt."""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    """Vérifie un mot de passe en clair contre un hash bcrypt.

    UN COMPTE SANS MOT DE PASSE N'EST PAS UN COMPTE OUVERT
    Cette fonction acceptait le mot « smartschool » pour tout compte dont le
    mot de passe était vide ou absent :

        if not hashed:
            return plain == "smartschool"

    C'était un passe-partout. Sur la base réelle, 5 enseignants et 45 élèves
    n'avaient aucun mot de passe : n'importe qui connaissant un matricule —
    imprimé sur les bulletins, affiché en classe, connu de tous les camarades —
    entrait dans leur espace en tapant ce seul mot. Notes, bulletins,
    situation de scolarité, messages avec l'école.

    Le mot n'est même pas un secret : il est écrit ici, dans un dépôt de code,
    et il est le nom du produit.

    Un compte sans mot de passe ne peut donc plus s'ouvrir du tout. C'est à
    l'administration d'en attribuer un — ce que l'application sait déjà faire.
    """
    if not hashed:
        return False

    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        # Hash illisible (tronqué, migré depuis un autre format) : on refuse.
        # Ne jamais interpréter une donnée abîmée comme une autorisation.
        return False


def compte_sans_mot_de_passe(hashed: Optional[str]) -> bool:
    """Vrai quand le compte n'a jamais reçu de mot de passe.

    Sert à distinguer « mauvais mot de passe » de « compte pas encore ouvert »
    dans les messages de connexion : la personne doit savoir qu'elle ne
    trouvera jamais le bon mot, et que c'est l'administration qui doit agir.
    """
    return not hashed
