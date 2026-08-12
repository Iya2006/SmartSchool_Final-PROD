"""
Migration: Refonte du moteur de notation — étape 5/5
- Index unique partiel sur ss_bulletins(inscription_id, trimestre_id) quand
  trimestre_id IS NOT NULL : empêche les doublons de bulletin de période
  (aucune contrainte n'existait avant, calculer_moyennes s'appuyait uniquement
  sur une recherche applicative).
- Index unique partiel sur ss_bulletins(inscription_id) quand
  type_bulletin='ANNUEL' : un seul bulletin annuel par inscription (nouveauté
  de cette refonte). Postgres traite les NULL comme distincts dans un index
  unique classique, d'où l'usage d'index partiels plutôt qu'une contrainte
  UNIQUE(inscription_id, trimestre_id) simple.

Vérifie l'absence de doublons existants avant d'appliquer chaque index — si des
doublons sont trouvés, l'index n'est PAS créé et un avertissement est affiché
(à traiter manuellement avant de relancer cette migration).

Run with: python backend/migrations/2026_08_notation_05_bulletin_index_unique.py
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
        doublons_periode = conn.execute(text("""
            SELECT inscription_id, trimestre_id, COUNT(*) c
            FROM ss_bulletins
            WHERE trimestre_id IS NOT NULL
            GROUP BY inscription_id, trimestre_id
            HAVING COUNT(*) > 1
        """)).fetchall()
        if doublons_periode:
            print(f"ATTENTION: {len(doublons_periode)} doublon(s) de bulletin de période détecté(s) — index NON créé. Nettoyer avant de relancer.")
        else:
            run(conn, """
                CREATE UNIQUE INDEX IF NOT EXISTS ux_bulletins_periode
                ON ss_bulletins(inscription_id, trimestre_id)
                WHERE trimestre_id IS NOT NULL
            """, "Created ux_bulletins_periode")

        doublons_annuel = conn.execute(text("""
            SELECT inscription_id, COUNT(*) c
            FROM ss_bulletins
            WHERE type_bulletin = 'ANNUEL'
            GROUP BY inscription_id
            HAVING COUNT(*) > 1
        """)).fetchall()
        if doublons_annuel:
            print(f"ATTENTION: {len(doublons_annuel)} doublon(s) de bulletin annuel détecté(s) — index NON créé. Nettoyer avant de relancer.")
        else:
            run(conn, """
                CREATE UNIQUE INDEX IF NOT EXISTS ux_bulletins_annuel
                ON ss_bulletins(inscription_id)
                WHERE type_bulletin = 'ANNUEL'
            """, "Created ux_bulletins_annuel")

        print("Migration complete!")


if __name__ == "__main__":
    migrate()
