-- ============================================================================
-- SMARTSCHOOL ERP — SCRIPT MAÎTRE D'INSTALLATION
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Usage : Exécutez ce script pour installer la base de données complète
--         @install.sql
--
-- IMPORTANT : Exécuter dans un schéma Oracle dédié (ex: SMARTSCHOOL)
--             avec les privilèges suivants :
--             - CREATE TABLE, CREATE VIEW, CREATE TRIGGER
--             - CREATE PROCEDURE, CREATE SEQUENCE
--             - UNLIMITED TABLESPACE (ou quota suffisant)
-- ============================================================================

SET SERVEROUTPUT ON;
SET ECHO OFF;
SET DEFINE OFF;
SET TIMING ON;

PROMPT
PROMPT ╔══════════════════════════════════════════════════════════════╗
PROMPT ║                                                              ║
PROMPT ║     SMARTSCHOOL — ERP SCOLAIRE NATIONAL                      ║
PROMPT ║     République de Guinée                                      ║
PROMPT ║                                                              ║
PROMPT ║     Installation de la Base de Données                       ║
PROMPT ║     Version 2.0 — Mars 2026                                  ║
PROMPT ║                                                              ║
PROMPT ╚══════════════════════════════════════════════════════════════╝
PROMPT

-- Étape 0 : Nettoyage (optionnel pour réinstallation)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 0/7 : Nettoyage de la base existante
PROMPT ──────────────────────────────────────────────────
@@00_nettoyage.sql

-- Étape 1 : Structure Institutionnelle (8 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 1/7 : Module Structure Institutionnelle
PROMPT ──────────────────────────────────────────────────
@@01_tables_structure.sql

-- Étape 2 : Gestion Académique (10 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 2/7 : Module Gestion Académique
PROMPT ──────────────────────────────────────────────────
@@02_tables_academique.sql

-- Étape 3 : Évaluations & Bulletins (8 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 3/7 : Module Évaluations & Bulletins
PROMPT ──────────────────────────────────────────────────
@@03_tables_evaluations.sql

-- Étape 4 : Finance & Paiements (8 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 4/7 : Module Finance & Paiements
PROMPT ──────────────────────────────────────────────────
@@04_tables_finance.sql

-- Étape 5 : Vie Scolaire (6 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 5/7 : Module Discipline & Vie Scolaire
PROMPT ──────────────────────────────────────────────────
@@05_tables_vie_scolaire.sql

-- Étape 6 : Communication + Examens Nationaux (8 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 6/7 : Modules Communication & Examens
PROMPT ──────────────────────────────────────────────────
@@06_tables_communication_examens.sql

-- Étape 7 : Sécurité & Audit (8 tables)
PROMPT ──────────────────────────────────────────────────
PROMPT   Étape 7/7 : Module Sécurité & Audit
PROMPT ──────────────────────────────────────────────────
@@07_tables_securite.sql

-- Triggers & Automatisations
PROMPT ──────────────────────────────────────────────────
PROMPT   Bonus : Triggers d'audit & automatisations
PROMPT ──────────────────────────────────────────────────
@@08_triggers_audit.sql

-- Vues
PROMPT ──────────────────────────────────────────────────
PROMPT   Bonus : Vues essentielles
PROMPT ──────────────────────────────────────────────────
@@09_vues.sql

-- Données de démonstration
PROMPT ──────────────────────────────────────────────────
PROMPT   Bonus : Données de démonstration
PROMPT ──────────────────────────────────────────────────
@@10_donnees_demo.sql

-- ============================================================================
-- PHASE 2 : PACKAGES PL/SQL (Logique Métier)
-- ============================================================================

-- Package Évaluations
PROMPT ──────────────────────────────────────────────────
PROMPT   Phase 2 : PKG_SS_EVALUATIONS (calcul moyennes)
PROMPT ──────────────────────────────────────────────────
@@11_pkg_evaluations.sql

-- Package Bulletins
PROMPT ──────────────────────────────────────────────────
PROMPT   Phase 2 : PKG_SS_BULLETINS (génération bulletins)
PROMPT ──────────────────────────────────────────────────
@@12_pkg_bulletins.sql

-- Package Finance
PROMPT ──────────────────────────────────────────────────
PROMPT   Phase 2 : PKG_SS_FINANCE (facturation/paiements)
PROMPT ──────────────────────────────────────────────────
@@13_pkg_finance.sql

-- Package Inscriptions
PROMPT ──────────────────────────────────────────────────
PROMPT   Phase 2 : PKG_SS_INSCRIPTIONS (inscriptions/transferts)
PROMPT ──────────────────────────────────────────────────
@@14_pkg_inscriptions.sql

-- Package Présences
PROMPT ──────────────────────────────────────────────────
PROMPT   Phase 2 : PKG_SS_PRESENCES (appel/absences)
PROMPT ──────────────────────────────────────────────────
@@15_pkg_presences.sql

-- Package Notifications
PROMPT ──────────────────────────────────────────────────
PROMPT   Phase 2 : PKG_SS_NOTIFICATIONS (SMS/WhatsApp)
PROMPT ──────────────────────────────────────────────────
@@16_pkg_notifications.sql

-- ============================================================================
-- RAPPORT FINAL
-- ============================================================================
PROMPT
PROMPT ╔══════════════════════════════════════════════════════════════╗
PROMPT ║                                                              ║
PROMPT ║     ✅ INSTALLATION COMPLÈTE TERMINÉE AVEC SUCCÈS !          ║
PROMPT ║                                                              ║
PROMPT ║     Phase 1 : 56 tables + 20 triggers + 7 vues              ║
PROMPT ║     Phase 2 : 6 packages PL/SQL                             ║
PROMPT ║                                                              ║
PROMPT ╚══════════════════════════════════════════════════════════════╝
PROMPT

-- Compter les objets créés
SET HEADING ON;
COLUMN object_type FORMAT A25;
COLUMN nb FORMAT 9999;

PROMPT   📊 OBJETS CRÉÉS :
PROMPT

SELECT object_type AS "Type d'objet", COUNT(*) AS "Nombre"
FROM user_objects
WHERE object_name LIKE 'SS_%' OR object_name LIKE 'V_SS_%' 
   OR object_name LIKE 'TRG_SS_%' OR object_name LIKE 'SP_SS_%'
   OR object_name LIKE 'SEQ_SS_%' OR object_name LIKE 'PKG_SS_%'
GROUP BY object_type
ORDER BY object_type;

-- Vérifier les objets invalides
PROMPT
PROMPT   ⚠ OBJETS INVALIDES (à recompiler si nécessaire) :
SELECT object_name, object_type, status 
FROM user_objects 
WHERE status = 'INVALID'
AND (object_name LIKE 'SS_%' OR object_name LIKE 'PKG_SS_%' 
     OR object_name LIKE 'V_SS_%' OR object_name LIKE 'TRG_SS_%');

PROMPT
PROMPT   Prochaine étape : Création de l'application Oracle APEX
PROMPT

SET TIMING OFF;

