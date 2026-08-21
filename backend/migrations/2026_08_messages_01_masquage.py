"""
Migration: « Supprimer pour moi » (masquage de messages)

- ss_messages_masques (nouvelle table) : une ligne par (message, destinataire)
  masqué. On ne supprime jamais la ligne ss_messages partagée — un message
  diffusé à toute une classe / tous les parents est UNE seule ligne vue par
  plusieurs personnes ; l'effacer l'effacerait pour tout le monde. Chaque
  destinataire masque le message de SA vue.

  viewer = qui a masqué :
    - ADMIN : viewer_id = etablissement_id (boîte admin partagée par école)
    - ENSEIGNANT / PARENT / ELEVE : viewer_id = identifiant de la personne

Additive uniquement (CREATE TABLE IF NOT EXISTS) : ne change aucun comportement
tant que le code applicatif ne lit/écrit pas la table.

Run with: python backend/migrations/2026_08_messages_01_masquage.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text


def run(conn, sql, ok_msg):
    """Exécute une instruction dans sa propre transaction (cf. autres migrations)."""
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
            CREATE TABLE IF NOT EXISTS ss_messages_masques (
                id SERIAL PRIMARY KEY,
                message_id INTEGER NOT NULL REFERENCES ss_messages(message_id),
                viewer_type VARCHAR(20) NOT NULL,
                viewer_id INTEGER NOT NULL,
                date_masquage TIMESTAMP DEFAULT now(),
                CONSTRAINT uq_message_masque UNIQUE (message_id, viewer_type, viewer_id)
            )
        """, "Created ss_messages_masques")

        run(conn,
            "CREATE INDEX IF NOT EXISTS ix_messages_masques_viewer ON ss_messages_masques(viewer_type, viewer_id)",
            "Created index ix_messages_masques_viewer")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
