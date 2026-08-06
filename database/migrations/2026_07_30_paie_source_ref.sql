-- ============================================================================
-- Migration Postgres (base réellement utilisée par le backend, voir
-- backend/app/core/database.py — les scripts numérotés 00-16 à la racine de
-- database/ sont en syntaxe Oracle et ne correspondent PAS au schéma Postgres
-- réel : ne pas s'y fier pour les migrations, ce dossier `migrations/` est
-- la source de vérité pour les évolutions du schéma Postgres réel.)
-- ============================================================================
-- Objectif : relier la table SS_EMPLOYES (utilisée par SS_PRIMES / SS_AVANCES /
-- SS_ABSENCES_PERSONNEL via clé étrangère) aux véritables enregistrements du
-- personnel (SS_ENSEIGNANTS / SS_UTILISATEURS), au lieu d'être une table
-- disjointe jamais peuplée. On ajoute une référence externe légère
-- ("ENS_<enseignant_id>" ou "PERS_<utilisateur_id>") plutôt que de dupliquer
-- toutes les données RH : SS_EMPLOYES sert de "miroir" créé/mis à jour à la
-- volée par le backend (voir `_get_or_sync_employe_paie` dans
-- backend/app/api/finance.py) à chaque ajout de prime/avance/absence.
-- ============================================================================

ALTER TABLE ss_employes ADD COLUMN IF NOT EXISTS source_ref VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ss_employes_source_ref
    ON ss_employes (source_ref)
    WHERE source_ref IS NOT NULL;
