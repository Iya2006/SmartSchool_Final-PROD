"""
Le schéma du cloud est-il prêt pour la synchronisation des postes ?

Chaque poste crée ses lignes avec des identifiants au-delà de 2³²
(`app/sync/identifiants.py`). Une colonne d'identifiant restée en INTEGER
(32 bits) sur PostgreSQL refuserait ces lignes : il faut d'abord la migration
`migrations/2026_10_sync_01_identifiants_bigint.py`. Tant qu'elle n'est pas
passée, les routes de synchronisation du cloud refusent de servir, avec un
message clair, plutôt que d'échouer ligne par ligne au milieu d'un envoi.

La liste des colonnes vient des modèles eux-mêmes (toute colonne déclarée
`Identifiant`) : la migration et ce contrôle ne peuvent pas diverger.
"""
import time
from typing import List, Tuple

from sqlalchemy import BigInteger, text
from sqlalchemy.engine import Connection, Engine

from app.core.database import Base


def colonnes_identifiants() -> List[Tuple[str, str]]:
    """(table, colonne) de chaque colonne déclarée `Identifiant` dans les modèles."""
    import app.models.academique  # noqa: F401  (enregistre tous les modèles)

    return [
        (table.name, colonne.name)
        for table in Base.metadata.sorted_tables
        for colonne in table.columns
        if isinstance(colonne.type, BigInteger)
    ]


def colonnes_a_elargir(connexion: Connection) -> List[Tuple[str, str]]:
    """Colonnes d'identifiant encore en INTEGER dans la base PostgreSQL.

    Une table absente de la base est ignorée : `create_all` la créera
    directement en BIGINT. SQLite n'a qu'un seul type entier, sur 64 bits.
    """
    if connexion.dialect.name != "postgresql":
        return []
    types = {
        (table, colonne): type_sql
        for table, colonne, type_sql in connexion.execute(text(
            "SELECT table_name, column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = current_schema()"
        ))
    }
    return [cle for cle in colonnes_identifiants() if types.get(cle) == "integer"]


_verifie_le = 0.0
_a_jour = False


def schema_identifiants_a_jour(moteur: Engine) -> bool:
    """Vrai quand toutes les colonnes d'identifiant sont en 64 bits.

    Une fois vrai, le reste : une colonne ne redevient pas INTEGER. Tant que
    c'est faux, on revérifie au plus une fois par minute, pour que la
    migration passée à chaud soit prise en compte sans redémarrage.
    """
    global _verifie_le, _a_jour
    if _a_jour:
        return True
    maintenant = time.monotonic()
    if maintenant - _verifie_le < 60 and _verifie_le:
        return False
    _verifie_le = maintenant
    with moteur.connect() as connexion:
        _a_jour = not colonnes_a_elargir(connexion)
    return _a_jour
