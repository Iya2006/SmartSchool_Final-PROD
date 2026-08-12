-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel). Miroir SQL de backend/migrations/2026_08_notation_04_resultat_officiel_examen.py
-- ============================================================================
-- Objectif : pour les classes d'examen (6e/10e/Terminale), le passage dépend
-- du résultat officiel du Ministère (ADMIS / NON_ADMIS), pas du calcul interne.
-- Cette table est la seule source de vérité pour le passage de ces élèves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ss_resultats_officiels_examen (
    resultat_id SERIAL PRIMARY KEY,
    inscription_id INTEGER NOT NULL UNIQUE REFERENCES ss_inscriptions(inscription_id),
    examen_national VARCHAR(30) NULL,
    resultat VARCHAR(20) NOT NULL,
    date_saisie DATE DEFAULT CURRENT_DATE,
    saisi_par VARCHAR(100) NULL,
    observation VARCHAR(500) NULL
);
