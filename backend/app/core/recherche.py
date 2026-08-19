"""
SMARTSCHOOL — Recherche d'élèves insensible aux ACCENTS et à la casse.

Les noms guinéens sont pleins d'accents (Traoré, Néné, Fatoumata Aïcha…). Un
directeur tape « traore » sans accent : il doit trouver « Traoré ». Or `ilike`
distingue é ≠ e — donc seul le matricule (sans accent) répondait, d'où le
symptôme « la recherche par nom ne marche pas, seul le matricule ».

Portable PostgreSQL (prod) ET SQLite (tests) : on n'utilise QUE `lower()` et
`replace()`, supportés des deux côtés — pas `unaccent`/`translate` (absents de
SQLite, et `unaccent` exige une extension à activer côté base).
"""
from sqlalchemy import func

# Minuscules accentuées courantes (français + noms guinéens) → lettre de base.
# On travaille en minuscule, donc seules les formes minuscules sont listées :
# la colonne et le terme sont passés en `lower()` avant d'enlever les accents.
_ACCENTS = {
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
    "ç": "c",
    "è": "e", "é": "e", "ê": "e", "ë": "e",
    "ì": "i", "í": "i", "î": "i", "ï": "i",
    "ñ": "n",
    "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o",
    "ù": "u", "ú": "u", "û": "u", "ü": "u",
    "ý": "y", "ÿ": "y",
}


def normaliser_terme(terme: str) -> str:
    """Terme tapé par l'utilisateur → minuscule sans accent."""
    t = (terme or "").strip().lower()
    return "".join(_ACCENTS.get(c, c) for c in t)


def sans_accent(colonne):
    """Expression SQL : `colonne` en minuscule ET sans accent.

    À comparer avec un terme lui-même passé par `normaliser_terme`.
    """
    expr = func.lower(colonne)
    for accent, base in _ACCENTS.items():
        expr = func.replace(expr, accent, base)
    return expr


def nom_complet(col_prenom, col_nom):
    """Expression SQL « prénom nom » (concat portable PG + SQLite via ||)."""
    from sqlalchemy import func
    return func.coalesce(col_prenom, "").concat(" ").concat(func.coalesce(col_nom, ""))


def filtre_nom_prenom_matricule(terme: str, col_nom, col_prenom, col_matricule):
    """Condition OR insensible aux accents/casse sur nom, prénom, matricule ET
    le NOM COMPLET.

    Cherche aussi « prénom nom » et « nom prénom » concaténés : sans ça, taper
    « Fatou Diaby » ne trouvait rien (nom=« Diaby », prénom=« Fatou » séparés,
    aucune colonne ne contenant le nom complet). Prêt pour `.filter(...)`.
    """
    like = f"%{normaliser_terme(terme)}%"
    return (
        sans_accent(col_nom).like(like)
        | sans_accent(col_prenom).like(like)
        | sans_accent(col_matricule).like(like)
        | sans_accent(nom_complet(col_prenom, col_nom)).like(like)
        | sans_accent(nom_complet(col_nom, col_prenom)).like(like)
    )
