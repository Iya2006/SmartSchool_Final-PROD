"""
Migration: aligne les colonnes manquantes de la base sur les modèles SQLAlchemy.

Sur une base créée avant plusieurs livraisons (ou dont les scripts de migration
n'ont jamais été rejoués), des colonnes déclarées dans app/models/academique.py
n'existent pas en base. `Base.metadata.create_all()` crée bien les TABLES
absentes mais n'ajoute JAMAIS les colonnes manquantes d'une table existante :
l'application plante alors sur des erreurs du type
"column ss_xxx.yyy does not exist".

Ce script comble l'écart automatiquement : il compare le modèle à la base et
émet un ALTER TABLE ADD COLUMN pour chaque colonne absente.

Garde-fous :
- ajout uniquement, jamais de suppression ni de modification de colonne existante ;
- colonnes ajoutées en NULL (une table déjà peuplée ne peut pas recevoir de
  NOT NULL sans valeur par défaut) ; le défaut du modèle est repris quand il
  s'agit d'une valeur littérale ;
- chaque instruction dans sa propre transaction (Postgres avorte toute la
  transaction à la première erreur — sans rollback, un seul échec ferait
  échouer toutes les suivantes).

Run with: python backend/migrations/2026_08_notation_07_alignement_schema.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateColumn

from app.core.database import engine, Base
import app.models.academique  # noqa: F401  (enregistre tous les modèles)


def sql_type(column) -> str:
    """Type SQL Postgres d'une colonne du modèle."""
    return column.type.compile(dialect=engine.dialect)


def defaut_litteral(column):
    """Valeur par défaut du modèle si c'est un littéral simple, sinon None."""
    d = column.default
    if d is None or not getattr(d, "is_scalar", False):
        return None
    v = d.arg
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, str):
        echappe = v.replace("'", "''")
        return f"'{echappe}'"
    return None


def migrate():
    insp = inspect(engine)
    tables_db = set(insp.get_table_names())
    ajouts, echecs, tables_absentes = 0, 0, []

    with engine.connect() as conn:
        for nom_table, table in Base.metadata.tables.items():
            if nom_table not in tables_db:
                # create_all() s'en charge (lancé au démarrage de main.py)
                tables_absentes.append(nom_table)
                continue

            existantes = {c["name"] for c in insp.get_columns(nom_table)}
            for col in table.columns:
                if col.name in existantes:
                    continue
                sql = f'ALTER TABLE {nom_table} ADD COLUMN {col.name} {sql_type(col)}'
                defaut = defaut_litteral(col)
                if defaut is not None:
                    sql += f" DEFAULT {defaut}"
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    print(f"  + {nom_table}.{col.name} ({sql_type(col)})")
                    ajouts += 1
                except Exception as e:
                    conn.rollback()
                    msg = str(e).lower()
                    if "duplicate column" in msg or "already exists" in msg:
                        print(f"  = {nom_table}.{col.name} (déjà présente)")
                    else:
                        print(f"  ! {nom_table}.{col.name} : {e}")
                        echecs += 1

    print()
    if tables_absentes:
        print(f"{len(tables_absentes)} table(s) absente(s), créées par create_all au démarrage :")
        for t in tables_absentes:
            print(f"  - {t}")
    print(f"Colonnes ajoutées : {ajouts} | échecs : {echecs}")
    print("Migration complete!" if echecs == 0 else "Migration terminée AVEC ERREURS (voir ci-dessus)")


if __name__ == "__main__":
    migrate()
