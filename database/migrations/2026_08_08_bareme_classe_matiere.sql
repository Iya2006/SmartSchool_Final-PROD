-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel). Miroir SQL de backend/migrations/2026_08_notation_03_bareme_classe_matiere.py
-- ============================================================================
-- Objectif : permettre un barème différent (/20, /10, /100...) pour une
-- matière donnée dans une classe donnée, complétant la cascade de résolution
-- du barème par défaut d'une évaluation.
-- ============================================================================

ALTER TABLE ss_classe_matieres ADD COLUMN IF NOT EXISTS note_sur NUMERIC(5, 2) NULL;
