-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel).
-- ============================================================================
-- Objectif : le formulaire de décaissement Fournisseur (Centre de Décaissement)
-- envoie déjà un mode_paiement (Cash, Virement, Mobile Money...) mais l'API le
-- rejetait silencieusement faute de colonne — cette migration ajoute la colonne
-- manquante pour que le mode de règlement soit réellement conservé.
-- ============================================================================

ALTER TABLE ss_depenses ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(30);
