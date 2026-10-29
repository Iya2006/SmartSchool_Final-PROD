"""
Tables propres à un poste hors-ligne : la mécanique de synchronisation, hors
du schéma de l'application (MetaData à part). Jamais exportées, jamais
synchronisées, absentes du cloud.
"""
from typing import Optional

from sqlalchemy import Column, Integer, MetaData, String, Table, select
from sqlalchemy.dialects import sqlite
from sqlalchemy.engine import Connection

metadonnees_poste = MetaData()

drapeaux = Table(
    "ss_sync_drapeaux", metadonnees_poste,
    Column("id", Integer, primary_key=True),
    # 1 le temps d'une transaction qui applique des lignes venues du cloud,
    # 0 sinon. Jamais validé à 1 : la transaction le remet à 0 avant de valider.
    Column("application_distante", Integer, nullable=False, server_default="0"),
)

# Ce qui reste à envoyer au cloud, dans l'ordre où cela s'est passé. Une
# entrée n'est effacée qu'une fois le cloud en a accusé réception.
# AUTOINCREMENT : un numéro d'ordre n'est jamais réattribué, même après effacement.
journal_local = Table(
    "ss_sync_journal_local", metadonnees_poste,
    Column("seq", Integer, primary_key=True),
    Column("nom_table", String(64), nullable=False),
    Column("cle", Integer, nullable=False),
    Column("operation", String(1), nullable=False),  # I, U, D
    # La ligne telle qu'elle était juste avant ce changement (JSON, pour U et
    # D). C'est la base de la fusion à trois du cloud : il n'applique que les
    # champs que le poste a réellement modifiés, et garde ceux modifiés
    # ailleurs entre-temps.
    Column("avant", String),
    Column("date", String(32)),  # UTC, ISO 8601
    sqlite_autoincrement=True,
)

# État de la synchronisation, par clé : jusqu'où le journal du cloud a été lu
# (`curseur_reception`), dates du dernier échange réussi...
etat_local = Table(
    "ss_sync_etat", metadonnees_poste,
    Column("cle", String(64), primary_key=True),
    Column("valeur", String(255)),
)


# Ce que le cloud a refusé d'appliquer (doublon, ligne supprimée ailleurs...),
# avec sa raison : la version du poste reste dans sa base, à vérifier par la
# direction (le cloud en garde aussi trace, dans ss_sync_conflits).
refus_locaux = Table(
    "ss_sync_refus", metadonnees_poste,
    Column("seq", Integer, primary_key=True),
    Column("nom_table", String(64), nullable=False),
    Column("cle", Integer, nullable=False),
    Column("raison", String(300), nullable=False),
)


# L'inverse : ce que le poste n'a pas pu appliquer d'une page reçue du cloud
# (typiquement : une ligne du cloud en doublon avec une ligne du poste que le
# cloud a refusée). Mise de côté avec sa raison, pour que le reste de la page
# passe : une seule ligne ne doit jamais bloquer toute la synchronisation.
non_appliques = Table(
    "ss_sync_non_appliques", metadonnees_poste,
    Column("nom_table", String(64), primary_key=True),
    Column("cle", Integer, primary_key=True),
    Column("raison", String(300), nullable=False),
    # Le changement reçu, tel quel (JSON) : retenté après chaque page, il
    # passe dès que ce qui le bloquait est levé (doublon tranché par la
    # direction, ligne dont il dépend arrivée entre-temps).
    Column("changement", String),
)


def completer_colonnes(connexion: Connection) -> None:
    """Un poste installé avant l'ajout d'une colonne à ces tables la reçoit
    ici (create_all crée les tables manquantes, jamais les colonnes)."""
    for t in metadonnees_poste.sorted_tables:
        presentes = {r[1] for r in connexion.exec_driver_sql(f"PRAGMA table_info({t.name})")}
        for colonne in t.columns:
            if presentes and colonne.name not in presentes:
                connexion.exec_driver_sql(f"ALTER TABLE {t.name} ADD COLUMN {colonne.name} TEXT")


def lire_etat(connexion: Connection, cle: str) -> Optional[str]:
    return connexion.execute(select(etat_local.c.valeur).where(etat_local.c.cle == cle)).scalar()


def ecrire_etat(connexion: Connection, cle: str, valeur) -> None:
    ins = sqlite.insert(etat_local).values(cle=cle, valeur=None if valeur is None else str(valeur))
    connexion.execute(ins.on_conflict_do_update(index_elements=["cle"], set_={"valeur": ins.excluded.valeur}))
