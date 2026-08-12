"""
Migration: colonnes Promotion / Réinscription manquantes sur ss_inscriptions

Ces colonnes existent dans le modèle SQLAlchemy (app/models/academique.py,
"Promotion V2 (Phase 2)") depuis la refonte clôture/réinscription, mais aucune
migration ne les avait jamais créées en base : toute base créée avant cette
phase, ou n'ayant jamais rejoué `Base.metadata.create_all`, plante dès qu'un
endpoint touche aux inscriptions ("column ss_inscriptions.total_points does not
exist").

Sans elles, le passage en classe supérieure et la campagne de réinscription
(app/api/promotion.py, app/api/reinscription.py) sont inutilisables.

- total_points          : total de points de l'année (moyenne × coefficients)
- niveau_cible_id       : niveau proposé pour l'année suivante
- classe_cible_id       : classe proposée pour l'année suivante
- statut_promotion      : PROPOSE | VALIDE
- statut_reinscription  : A_REINSCRIRE | REINSCRIT | NON_REINSCRIT | TRANSFERE | ABANDON

Run with: python backend/migrations/2026_08_notation_06_inscriptions_promotion.py
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
            "ALTER TABLE ss_inscriptions ADD COLUMN total_points NUMERIC(7,2)",
            "Added total_points to ss_inscriptions")
        run(conn,
            "ALTER TABLE ss_inscriptions ADD COLUMN niveau_cible_id INTEGER REFERENCES ss_niveaux(niveau_id)",
            "Added niveau_cible_id to ss_inscriptions")
        run(conn,
            "ALTER TABLE ss_inscriptions ADD COLUMN classe_cible_id INTEGER REFERENCES ss_classes(classe_id)",
            "Added classe_cible_id to ss_inscriptions")
        run(conn,
            "ALTER TABLE ss_inscriptions ADD COLUMN statut_promotion VARCHAR(20)",
            "Added statut_promotion to ss_inscriptions")
        run(conn,
            "ALTER TABLE ss_inscriptions ADD COLUMN statut_reinscription VARCHAR(20)",
            "Added statut_reinscription to ss_inscriptions")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
