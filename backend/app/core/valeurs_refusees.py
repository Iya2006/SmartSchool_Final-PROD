"""
Valeur refusée par la base : texte trop long, nombre trop grand, date ou
nombre mal écrit (erreurs PostgreSQL de classe 22, « data exception »).

PostgreSQL (le cloud) refuse un texte plus long que sa colonne ; SQLite (les
postes) l'accepte sans rien dire. Vérifié le 28/11/2026 sur la copie de la
base :

* une saisie trop longue faite sur un poste faisait échouer TOUT l'envoi du
  poste au cloud, renvoyé ensuite à chaque cycle : plus rien ne partait ni
  n'arrivait sur ce poste, jusqu'à une intervention technique. Désormais le
  poste applique la règle du cloud au moment de la saisie (`verifier_longueurs`),
  et le cloud met de côté une telle ligne au lieu d'échouer sur tout le lot
  (app/sync/cote_cloud.py) ;
* sur le cloud, la même saisie finissait en erreur 500 : elle reçoit une
  réponse 400 qui dit quoi corriger (gestionnaires dans main.py).

Le pilote de production (pg8000) signale ces erreurs comme `ProgrammingError`,
psycopg comme `DataError` : on les reconnaît à leur code SQL, pas à leur classe.
"""
import re
from functools import lru_cache

from sqlalchemy import String, inspect as inspecter


class TexteTropLong(ValueError):
    """Un texte dépasse la longueur de sa colonne. Le message est pour l'utilisateur."""


def code_sql(erreur) -> str:
    """Code SQLSTATE d'une erreur de PostgreSQL : pg8000 le donne dans un
    dictionnaire (clé « C »), psycopg dans `pgcode`."""
    origine = getattr(erreur, "orig", erreur)
    code = getattr(origine, "pgcode", None) or getattr(origine, "sqlstate", None)
    if code:
        return str(code)
    args = getattr(origine, "args", ())
    if args and isinstance(args[0], dict):
        return str(args[0].get("C") or "")
    return ""


def est_valeur_refusee(erreur) -> bool:
    """C'est la valeur elle-même que la base refuse — pas la requête, ni la
    connexion. La renvoyer telle quelle échouera toujours."""
    return code_sql(erreur).startswith("22")


def raison(erreur) -> str:
    """Ce qui est refusé, en clair."""
    code = code_sql(erreur)
    if code == "22001":
        origine = getattr(erreur, "orig", erreur)
        limite = re.search(r"varying\((\d+)\)", str(origine))
        return "Un texte est trop long" + (f" : {limite.group(1)} caractères au plus pour ce champ." if limite else ".")
    if code == "22003":
        return "Un nombre dépasse la valeur maximale acceptée."
    if code in ("22007", "22008"):
        return "Une date n'est pas valide."
    return "Une valeur n'a pas le format attendu."


@lru_cache(maxsize=None)
def _longueurs(classe) -> tuple:
    """(attribut, colonne, longueur maximale) des textes à longueur fixée."""
    try:
        correspondance = inspecter(classe)
    except Exception:  # noqa: BLE001 — pas une classe de l'ORM
        return ()
    return tuple(
        (attribut.key, colonne.name, colonne.type.length)
        for attribut in correspondance.column_attrs
        for colonne in attribut.columns[:1]
        if isinstance(colonne.type, String) and colonne.type.length
    )


def _libelle(colonne: str) -> str:
    texte = colonne.replace("_", " ")
    return texte[:1].upper() + texte[1:]


def verifier_longueurs(session, _contexte, _instances) -> None:
    """Avant chaque écriture sur une base SQLite (un poste, ou les tests) :
    la règle de longueur de PostgreSQL. Seules les valeurs présentes sur
    l'objet sont lues — jamais de chargement depuis la base."""
    try:
        lien = session.get_bind()
    except Exception:  # noqa: BLE001 — session sans base unique : rien à comparer
        return
    if lien is None or lien.dialect.name != "sqlite":
        return
    for objet in (*session.new, *session.dirty):
        for attribut, colonne, limite in _longueurs(type(objet)):
            valeur = objet.__dict__.get(attribut)
            if isinstance(valeur, str) and len(valeur) > limite:
                raise TexteTropLong(
                    f"« {_libelle(colonne)} » est trop long : {limite} caractères au plus "
                    f"({len(valeur)} saisis). Raccourcissez-le, puis enregistrez à nouveau.")
