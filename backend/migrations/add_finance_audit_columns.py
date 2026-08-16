"""
Migration: Ajoute les colonnes d'audit manquantes sur ss_paiements et ss_depenses
- ss_paiements.motif_annulation : motif saisi lors de l'annulation d'un paiement
- ss_depenses.reference : référence externe d'un décaissement/règlement fournisseur

CORRECTIF (défaut de la version précédente)
-------------------------------------------
Chaque `ALTER TABLE` était tenté dans la MÊME transaction, et l'exception était
attrapée sans `rollback`. Or PostgreSQL abandonne toute la transaction dès la
première erreur : le second `ALTER` échouait alors invariablement avec

    current transaction is aborted, commands ignored until end of transaction

y compris quand il n'y avait rien à reprocher à cette seconde colonne. Sur une
base où la première colonne existait déjà, la migration échouait donc toujours
— et bloquait toute la chaîne du lanceur (`scripts/migrer.py`), qui s'arrête au
premier échec.

Deux changements : chaque instruction a sa propre transaction, et l'existence
de la colonne est vérifiée AVANT au lieu d'être déduite du message d'erreur.

Run with: python backend/migrations/add_finance_audit_columns.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

COLONNES = [
    ("ss_paiements", "motif_annulation", "VARCHAR(500)"),
    ("ss_depenses", "reference", "VARCHAR(150)"),
]


def _colonne_existe(conn, table: str, colonne: str) -> bool:
    return conn.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = :t AND column_name = :c
    """), {"t": table, "c": colonne}).first() is not None


def migrate() -> int:
    ajoutees = 0
    for table, colonne, type_sql in COLONNES:
        # Une transaction PAR colonne : l'échec de l'une ne condamne plus la
        # suivante.
        with engine.begin() as conn:
            if _colonne_existe(conn, table, colonne):
                print(f"[=]  {table}.{colonne} existe deja")
                continue
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {colonne} {type_sql}"
            ))
            print(f"[OK] {table}.{colonne} ajoutee")
            ajoutees += 1

    print(f"\n[DONE] Migration terminee ({ajoutees} colonne(s) ajoutee(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(migrate())
