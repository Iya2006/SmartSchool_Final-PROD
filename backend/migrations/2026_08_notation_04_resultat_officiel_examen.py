"""
Migration: Refonte du moteur de notation — étape 4/5
- ss_resultats_officiels_examen (nouvelle table) : pour les classes d'examen
  (6e/10e/Terminale, Niveau.est_examen='O'), le passage ne dépend PAS du calcul
  interne (moyenne annuelle) mais du résultat officiel publié par le Ministère.
  Cette table stocke ce résultat, saisi manuellement une fois publié — source
  de vérité unique pour le passage de ces élèves. Table séparée de
  ss_inscriptions (qui garde la proposition interne recalculable) pour garder
  une trace brute et auditable de la saisie ministérielle.

Run with: python backend/migrations/2026_08_notation_04_resultat_officiel_examen.py
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
            CREATE TABLE IF NOT EXISTS ss_resultats_officiels_examen (
                resultat_id SERIAL PRIMARY KEY,
                inscription_id INTEGER NOT NULL UNIQUE REFERENCES ss_inscriptions(inscription_id),
                examen_national VARCHAR(30) NULL,
                resultat VARCHAR(20) NOT NULL,
                date_saisie DATE DEFAULT CURRENT_DATE,
                saisi_par VARCHAR(100) NULL,
                observation VARCHAR(500) NULL
            )
        """, "Created ss_resultats_officiels_examen")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
