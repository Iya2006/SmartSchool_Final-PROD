-- ============================================================================
-- Migration Postgres (voir database/migrations/2026_07_30_paie_source_ref.sql
-- pour le rappel : ce dossier migrations/ est la source de vérité du schéma
-- Postgres réel).
-- ============================================================================
-- Objectif : module Offline-First Phase 1 (saisie hors-ligne des notes et
-- présences par les enseignants). La synchronisation a besoin de détecter si
-- le serveur a été modifié depuis la dernière lecture locale d'un enseignant
-- (conflit) avant d'appliquer une entrée mise en file pendant une coupure
-- réseau — ces deux colonnes sont le prérequis minimal (Last-Write-Wins
-- comparé à un horodatage de référence envoyé par le client, voir
-- backend/app/api/sync.py). Limité à ss_notes/ss_presences : ce sont les 2
-- seules tables du périmètre retenu pour cette phase (comptabilité exclue,
-- reste "connexion requise").
-- ============================================================================

ALTER TABLE ss_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
ALTER TABLE ss_notes ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

ALTER TABLE ss_presences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
ALTER TABLE ss_presences ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
