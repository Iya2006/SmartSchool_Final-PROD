"""
Migration: Refonte du moteur de notation — étape 2/5
- ss_evaluation_sessions (nouvelle table) : une composition couvre normalement
  toutes les matières d'une classe en même temps (une note par matière, le même
  jour). Cette table regroupe les `Evaluation` créées en une seule action
  ("création groupée") pour que l'école n'ait qu'un seul écran / un seul choix
  "coefficientée oui/non" pour toute la composition.
- ss_evaluations.session_id : rattache une évaluation à sa session (NULL pour
  les évaluations mono-matière existantes et celles créées côté portail
  enseignant, qui restent mono-matière).
- ss_evaluations.est_coefficientee : dupliqué depuis la session au moment de
  la création de chaque évaluation enfant, pour que le moteur de calcul lise
  directement Evaluation sans avoir besoin de joindre EvaluationSession
  (pattern anti-N+1 déjà en place dans calculer_moyennes).
- ss_evaluations.coefficient_override : surcharge ponctuelle du coefficient de
  type sur une évaluation précise, sans toucher au coefficient de référence du
  type (décision validée avec l'utilisateur).

Run with: python backend/migrations/2026_08_notation_02_evaluation_sessions.py
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
            CREATE TABLE IF NOT EXISTS ss_evaluation_sessions (
                session_id SERIAL PRIMARY KEY,
                classe_id INTEGER NOT NULL REFERENCES ss_classes(classe_id),
                trimestre_id INTEGER NOT NULL REFERENCES ss_trimestres(trimestre_id),
                type_eval_id INTEGER NOT NULL REFERENCES ss_types_evaluation(type_eval_id),
                etablissement_id INTEGER NOT NULL REFERENCES ss_etablissements(etablissement_id),
                libelle VARCHAR(200) NOT NULL,
                date_evaluation DATE NOT NULL,
                note_sur NUMERIC(5,2) DEFAULT 20,
                est_coefficientee CHAR(1) NOT NULL DEFAULT 'O',
                enseignant_id INTEGER NULL REFERENCES ss_enseignants(enseignant_id),
                statut VARCHAR(20) NOT NULL DEFAULT 'PLANIFIEE'
            )
        """, "Created ss_evaluation_sessions")

        run(conn,
            "ALTER TABLE ss_evaluations ADD COLUMN session_id INTEGER NULL REFERENCES ss_evaluation_sessions(session_id)",
            "Added session_id to ss_evaluations")
        run(conn,
            "ALTER TABLE ss_evaluations ADD COLUMN est_coefficientee CHAR(1) NOT NULL DEFAULT 'O'",
            "Added est_coefficientee to ss_evaluations")
        run(conn,
            "ALTER TABLE ss_evaluations ADD COLUMN coefficient_override NUMERIC(4,2) NULL",
            "Added coefficient_override to ss_evaluations")
        run(conn,
            "CREATE INDEX IF NOT EXISTS ix_evaluations_session_id ON ss_evaluations(session_id)",
            "Created index ix_evaluations_session_id")
        print("Migration complete!")


if __name__ == "__main__":
    migrate()
