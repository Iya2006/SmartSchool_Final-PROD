"""
Migration: Refonte du moteur de notation — étape 8

ss_periode_epreuves : quelles épreuves comptent pour le résultat officiel d'une
période, classe par classe.

Jusqu'ici le calcul de période prenait TOUTES les évaluations centralisées du
trimestre, sans que l'école ait son mot à dire. Or le résultat d'une période
peut très bien être le fruit de deux ou trois évaluations sans composition,
ou d'une composition seule : c'est à l'école de décider, et cette décision doit
rester tracée pour que le calcul soit reproductible et vérifiable.

Règle de lecture (compatibilité ascendante) :
  - aucune ligne pour (classe, trimestre)  -> toutes les évaluations
    centralisées comptent, exactement comme avant ;
  - au moins une ligne                     -> seules les évaluations listées
    comptent.

Run with: python backend/migrations/2026_08_notation_08_periode_epreuves.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text


def run(conn, sql, ok_msg):
    """Exécute une instruction dans sa propre transaction (cf. migration 01)."""
    try:
        conn.execute(text(sql))
        conn.commit()
        print(ok_msg)
    except Exception as e:
        conn.rollback()
        msg = str(e).lower()
        if "duplicate column" in msg or "already exists" in msg:
            print(f"SKIP (déjà appliqué) : {ok_msg}")
        else:
            print(f"ERREUR sur [{sql[:60]}...] : {e}")


def migrate():
    with engine.connect() as conn:
        run(conn, """
            CREATE TABLE IF NOT EXISTS ss_periode_epreuves (
                periode_epreuve_id SERIAL PRIMARY KEY,
                classe_id INTEGER NOT NULL REFERENCES ss_classes(classe_id),
                trimestre_id INTEGER NOT NULL REFERENCES ss_trimestres(trimestre_id),
                evaluation_id INTEGER NOT NULL REFERENCES ss_evaluations(evaluation_id) ON DELETE CASCADE,
                created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(100)
            )
        """, "Created ss_periode_epreuves")

        # Une même évaluation ne peut être retenue qu'une fois pour une période :
        # sans cette contrainte, un double clic la ferait compter deux fois.
        run(conn, """
            CREATE UNIQUE INDEX IF NOT EXISTS ux_periode_epreuves
            ON ss_periode_epreuves(classe_id, trimestre_id, evaluation_id)
        """, "Created unique index ux_periode_epreuves")

        run(conn, """
            CREATE INDEX IF NOT EXISTS ix_periode_epreuves_periode
            ON ss_periode_epreuves(classe_id, trimestre_id)
        """, "Created index ix_periode_epreuves_periode")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
