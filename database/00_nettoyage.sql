-- ============================================================================
-- SMARTSCHOOL ERP — Script 00 : NETTOYAGE COMPLET
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Description : Supprime TOUTES les tables, séquences, triggers et vues
--               pour permettre une réinstallation propre.
-- Auteur      : Équipe Architecture SMARTSCHOOL
-- Date        : 08/03/2026
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   SMARTSCHOOL — NETTOYAGE DE LA BASE
PROMPT ============================================

-- ============================================================================
-- 1. SUPPRESSION DES VUES
-- ============================================================================
PROMPT [1/4] Suppression des vues...

BEGIN
    FOR v IN (SELECT view_name FROM user_views WHERE view_name LIKE 'V_SS_%') LOOP
        EXECUTE IMMEDIATE 'DROP VIEW ' || v.view_name;
        DBMS_OUTPUT.PUT_LINE('  ✓ Vue supprimée : ' || v.view_name);
    END LOOP;
END;
/

-- ============================================================================
-- 2. SUPPRESSION DES PACKAGES
-- ============================================================================
PROMPT [2/4] Suppression des packages...

BEGIN
    FOR p IN (SELECT object_name FROM user_objects WHERE object_type = 'PACKAGE' AND object_name LIKE 'PKG_SS_%') LOOP
        EXECUTE IMMEDIATE 'DROP PACKAGE ' || p.object_name;
        DBMS_OUTPUT.PUT_LINE('  ✓ Package supprimé : ' || p.object_name);
    END LOOP;
END;
/

-- ============================================================================
-- 3. SUPPRESSION DES TABLES (ordre inverse de dépendance)
-- ============================================================================
PROMPT [3/4] Suppression des tables...

BEGIN
    FOR t IN (
        SELECT table_name FROM user_tables 
        WHERE table_name LIKE 'SS_%'
        ORDER BY table_name
    ) LOOP
        BEGIN
            EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS PURGE';
            DBMS_OUTPUT.PUT_LINE('  ✓ Table supprimée : ' || t.table_name);
        EXCEPTION
            WHEN OTHERS THEN
                DBMS_OUTPUT.PUT_LINE('  ✗ Erreur sur ' || t.table_name || ' : ' || SQLERRM);
        END;
    END LOOP;
END;
/

-- ============================================================================
-- 4. SUPPRESSION DES SÉQUENCES
-- ============================================================================
PROMPT [4/4] Suppression des séquences...

BEGIN
    FOR s IN (SELECT sequence_name FROM user_sequences WHERE sequence_name LIKE 'SEQ_SS_%') LOOP
        EXECUTE IMMEDIATE 'DROP SEQUENCE ' || s.sequence_name;
        DBMS_OUTPUT.PUT_LINE('  ✓ Séquence supprimée : ' || s.sequence_name);
    END LOOP;
END;
/

PROMPT
PROMPT ============================================
PROMPT   ✅ NETTOYAGE TERMINÉ AVEC SUCCÈS
PROMPT ============================================
