"""
Migration: Refonte du moteur de notation — étape 1/5
- ss_types_evaluation.coefficient : remplace poids_pourcentage (jamais utilisé par
  le calcul réel) par un vrai coefficient numérique, utilisé pour pondérer les
  types d'évaluation dans la moyenne de période (même logique que les
  coefficients de matière).
- Backfill : coefficient=2 pour le type COMPO (reproduit exactement l'ancien
  poids "composition"=2 du système Écrit/Oral/Composition figé en dur), 1 pour
  tous les autres types (reproduit les anciens poids "écrite"/"orale"=1).
- poids_pourcentage devient nullable : conservée en base (dette documentée dans
  MIGRATION_NOTES.md) mais plus jamais lue par le code métier ni éditable côté UI.
- Le type ORAL (catégorie "Oral" figée de l'ancien système) est désactivé : le
  prof choisit librement comment il obtient sa note (oral, écrit, les deux),
  le système n'a plus besoin de distinguer — remplacé par le type générique
  EVAL ("Évaluation"), libellé libre saisi par l'école (ex. "Évaluation de
  Janvier"). Les évaluations déjà existantes de type ORAL ne sont pas touchées
  (conservées pour l'historique), seul le type devient INACTIF pour ne plus
  être proposé à la création.

Run with: python backend/migrations/2026_08_notation_01_type_evaluation_coefficient.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text


def run(conn, sql, ok_msg):
    """Exécute une instruction dans sa propre transaction.

    Postgres avorte toute la transaction dès la première erreur : sans le
    rollback ci-dessous, un simple "colonne déjà existante" ferait échouer en
    cascade toutes les instructions suivantes et le script ne serait pas
    réellement rejouable.
    """
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
            "ALTER TABLE ss_types_evaluation ADD COLUMN coefficient NUMERIC(4,2) NOT NULL DEFAULT 1",
            "Added coefficient to ss_types_evaluation")
        run(conn,
            "UPDATE ss_types_evaluation SET coefficient = 2 WHERE code = 'COMPO'",
            "Backfilled coefficient=2 for code=COMPO")
        run(conn,
            "ALTER TABLE ss_types_evaluation ALTER COLUMN poids_pourcentage DROP NOT NULL",
            "poids_pourcentage is now nullable (deprecated, no longer used)")
        run(conn,
            "UPDATE ss_types_evaluation SET code = 'EVAL', libelle = 'Évaluation' WHERE code = 'DEVOIR'",
            "Renamed legacy type DEVOIR -> EVAL / Évaluation")
        run(conn,
            "UPDATE ss_types_evaluation SET statut = 'INACTIF' WHERE code = 'ORAL'",
            "Deactivated legacy type ORAL (kept for historical evaluations)")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
