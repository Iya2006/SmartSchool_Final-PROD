-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel). Miroir SQL de backend/migrations/2026_08_notation_02_evaluation_sessions.py
-- ============================================================================
-- Objectif : une composition couvre normalement toutes les matières d'une
-- classe en même temps (une note par matière, le même jour). ss_evaluation_sessions
-- regroupe les ss_evaluations créées en une seule action ("création groupée")
-- pour que l'école n'ait qu'un seul écran / un seul choix "coefficientée
-- oui/non" pour toute la composition, au lieu de répéter la création matière
-- par matière.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ss_evaluation_sessions (
    session_id SERIAL PRIMARY KEY,
    classe_id INTEGER NOT NULL REFERENCES ss_classes(classe_id),
    trimestre_id INTEGER NOT NULL REFERENCES ss_trimestres(trimestre_id),
    type_eval_id INTEGER NOT NULL REFERENCES ss_types_evaluation(type_eval_id),
    etablissement_id INTEGER NOT NULL REFERENCES ss_etablissements(etablissement_id),
    libelle VARCHAR(200) NOT NULL,
    date_evaluation DATE NOT NULL,
    note_sur NUMERIC(5, 2) DEFAULT 20,
    est_coefficientee CHAR(1) NOT NULL DEFAULT 'O',
    enseignant_id INTEGER NULL REFERENCES ss_enseignants(enseignant_id),
    statut VARCHAR(20) NOT NULL DEFAULT 'PLANIFIEE'
);

ALTER TABLE ss_evaluations ADD COLUMN IF NOT EXISTS session_id INTEGER NULL REFERENCES ss_evaluation_sessions(session_id);
ALTER TABLE ss_evaluations ADD COLUMN IF NOT EXISTS est_coefficientee CHAR(1) NOT NULL DEFAULT 'O';
ALTER TABLE ss_evaluations ADD COLUMN IF NOT EXISTS coefficient_override NUMERIC(4, 2) NULL;

CREATE INDEX IF NOT EXISTS ix_evaluations_session_id ON ss_evaluations(session_id);
