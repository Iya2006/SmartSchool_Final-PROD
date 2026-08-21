-- ============================================================================
-- Migration Postgres — miroir SQL de
-- backend/migrations/2026_08_messages_01_masquage.py
-- (voir database/migrations/2026_07_30_paie_source_ref.sql : ce dossier est la
--  source de vérité du schéma Postgres réel).
-- ============================================================================
-- Objectif : « Supprimer pour moi ». On ne supprime jamais la ligne
-- ss_messages partagée (un message diffusé à toute une classe / tous les
-- parents est UNE seule ligne vue par plusieurs personnes). Chaque
-- destinataire masque le message de SA vue via ss_messages_masques.
--   viewer = qui a masqué :
--     - ADMIN : viewer_id = etablissement_id (boîte admin partagée par école)
--     - ENSEIGNANT / PARENT / ELEVE : viewer_id = identifiant de la personne
-- ============================================================================

CREATE TABLE IF NOT EXISTS ss_messages_masques (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES ss_messages(message_id),
    viewer_type VARCHAR(20) NOT NULL,
    viewer_id INTEGER NOT NULL,
    date_masquage TIMESTAMP DEFAULT now(),
    CONSTRAINT uq_message_masque UNIQUE (message_id, viewer_type, viewer_id)
);

CREATE INDEX IF NOT EXISTS ix_messages_masques_viewer ON ss_messages_masques(viewer_type, viewer_id);
