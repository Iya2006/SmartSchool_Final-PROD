-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel, pas les scripts numérotés 00-16 à la racine de database/).
-- ============================================================================
-- Objectif : le formulaire "Nouvelle sortie d'argent" de
-- frontend/src/app/comptabilite/depenses/page.tsx envoie déjà un justificatif
-- (facture_url), une source des fonds (caisse/banque) et un suivi analytique
-- (classe/élève/département), mais ss_depenses n'avait aucune colonne pour les
-- recevoir : ces champs étaient silencieusement perdus par Pydantic à la
-- validation de la requête (POST /api/finance/depenses).
-- ============================================================================

ALTER TABLE ss_depenses ADD COLUMN IF NOT EXISTS facture_url VARCHAR(500);
ALTER TABLE ss_depenses ADD COLUMN IF NOT EXISTS source_fonds VARCHAR(30);
ALTER TABLE ss_depenses ADD COLUMN IF NOT EXISTS classe_id INTEGER REFERENCES ss_classes(classe_id);
ALTER TABLE ss_depenses ADD COLUMN IF NOT EXISTS eleve_id INTEGER REFERENCES ss_eleves(eleve_id);
ALTER TABLE ss_depenses ADD COLUMN IF NOT EXISTS departement VARCHAR(100);
