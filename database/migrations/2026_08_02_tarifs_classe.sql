-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel).
-- ============================================================================
-- Objectif : permettre un montant de frais différent par classe pour un même
-- type de frais (une école n'a pas la même scolarité en maternelle qu'en
-- terminale) — éditable depuis la page Comptabilité (par type de frais) ou
-- depuis la fiche de configuration d'une classe (par classe), les deux écrans
-- lisant/écrivant la même table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ss_tarifs_classe (
    tarif_id SERIAL PRIMARY KEY,
    type_frais_id INTEGER NOT NULL REFERENCES ss_types_frais(type_frais_id),
    classe_id INTEGER NOT NULL REFERENCES ss_classes(classe_id),
    montant NUMERIC(12, 2) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tarifs_classe_type_classe
    ON ss_tarifs_classe (type_frais_id, classe_id);
