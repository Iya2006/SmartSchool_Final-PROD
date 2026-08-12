"""
Migration: Refonte du moteur de notation — étape 3/5
- ss_classe_matieres.note_sur : permet de préciser le barème (/20, /10, /100...)
  pour une matière donnée dans une classe donnée. NULL = pas de surcharge à ce
  niveau, on retombe sur ss_matieres.note_sur puis sur le barème par défaut du
  cycle (notation.bareme.{cycle}, déjà en base), puis 20 en dernier recours.
  Complète la cascade de résolution du barème (voir app/services/notation.py).

Run with: python backend/migrations/2026_08_notation_03_bareme_classe_matiere.py
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
        run(conn,
            "ALTER TABLE ss_classe_matieres ADD COLUMN note_sur NUMERIC(5,2) NULL",
            "Added note_sur to ss_classe_matieres")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
