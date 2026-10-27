"""
Instantané d'un établissement : toutes ses données, table par table, pour
installer un poste.

Côté cloud, `manifeste` et `exporter_page` lisent le périmètre
(app/sync/perimetre.py). Côté poste, `importer_page` écrit dans la base locale.

Le transfert se fait par pages, triées par clé primaire : une connexion qui
coupe en plein téléchargement reprend à la dernière page reçue au lieu de tout
recommencer, ce qui compte sur une connexion rurale.
"""
from sqlalchemy import func, select
from sqlalchemy.dialects import sqlite
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.sync.perimetre import colonnes_cle, requete_lignes, table, verifier_toutes_les_tables
from app.sync.serialisation import ligne_depuis_json, ligne_vers_json

TAILLE_PAGE_DEFAUT = 1000
TAILLE_PAGE_MAX = 5000


def manifeste(db: Session, etablissement_id: int) -> list[dict]:
    """Tables dans l'ordre d'import, avec leur nombre de lignes."""
    resultat = []
    for nom in verifier_toutes_les_tables():
        sous = requete_lignes(nom, etablissement_id).order_by(None).subquery()
        total = db.execute(select(func.count()).select_from(sous)).scalar_one()
        resultat.append({"table": nom, "total": total})
    return resultat


def exporter_page(db: Session, etablissement_id: int, nom_table: str,
                  apres=None, limite: int = TAILLE_PAGE_DEFAUT) -> dict:
    """Une page de lignes. `suivant` vaut la dernière clé de la page s'il en
    reste peut-être, `None` quand la table est terminée."""
    t = table(nom_table)
    cles = colonnes_cle(t)
    limite = max(1, min(limite, TAILLE_PAGE_MAX))
    requete = requete_lignes(nom_table, etablissement_id)

    # Une table à clé composée (`ss_sequences_matricule`) est minuscule : un
    # établissement n'y a que quelques lignes, envoyées en une seule page.
    paginee = len(cles) == 1
    if paginee:
        if apres is not None:
            requete = requete.where(cles[0] > apres)
        requete = requete.limit(limite)

    lignes = [ligne_vers_json(t, l) for l in db.execute(requete).mappings().all()]
    suivant = lignes[-1][cles[0].name] if paginee and len(lignes) == limite else None
    return {"table": nom_table, "lignes": lignes, "suivant": suivant}


def importer_page(connexion: Connection, nom_table: str, lignes: list[dict]) -> int:
    """Écrit une page dans la base locale (SQLite). Rejouer une page déjà
    importée ne crée aucun doublon : la ligne existante est conservée."""
    if not lignes:
        return 0
    t = table(nom_table)
    valeurs = [ligne_depuis_json(t, l) for l in lignes]
    connexion.execute(sqlite.insert(t).on_conflict_do_nothing(), valeurs)
    return len(valeurs)
