-- ============================================================================
-- SMARTSCHOOL ERP — Script 08 : TRIGGERS D'AUDIT & AUTOMATISATIONS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Description : Triggers pour :
--   1. Audit automatique (INSERT/UPDATE/DELETE → SS_AUDIT_TRAIL)
--   2. Mise à jour automatique des champs MODIFIED_BY/MODIFIED_DATE
--   3. Logique métier (effectifs, soldes, statuts)
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   TRIGGERS — AUDIT & AUTOMATISATIONS
PROMPT ============================================

-- ============================================================================
-- PROCEDURE UTILITAIRE : Enregistrement dans le journal d'audit
-- ============================================================================
CREATE OR REPLACE PROCEDURE SP_SS_AUDIT_LOG (
    p_table         IN VARCHAR2,
    p_operation     IN VARCHAR2,
    p_cle_primaire  IN VARCHAR2,
    p_ancien        IN CLOB DEFAULT NULL,
    p_nouveau       IN CLOB DEFAULT NULL,
    p_colonnes      IN VARCHAR2 DEFAULT NULL,
    p_module        IN VARCHAR2 DEFAULT NULL,
    p_description   IN VARCHAR2 DEFAULT NULL
) AS
    PRAGMA AUTONOMOUS_TRANSACTION;
    v_user VARCHAR2(100);
    v_apex_session NUMBER;
    v_apex_page NUMBER;
    v_apex_app NUMBER;
BEGIN
    -- Récupérer l'utilisateur (APEX ou DB)
    BEGIN
        v_user := NVL(V('APP_USER'), USER);
        v_apex_session := V('APP_SESSION');
        v_apex_page := V('APP_PAGE_ID');
        v_apex_app := V('APP_ID');
    EXCEPTION
        WHEN OTHERS THEN
            v_user := USER;
            v_apex_session := NULL;
            v_apex_page := NULL;
            v_apex_app := NULL;
    END;

    INSERT INTO SS_AUDIT_TRAIL (
        NOM_UTILISATEUR, NOM_TABLE, TYPE_OPERATION, CLE_PRIMAIRE,
        ANCIEN_VALEURS, NOUVELLES_VALEURS, COLONNES_MODIFIEES,
        NOM_MODULE, DESCRIPTION, DATE_OPERATION,
        APEX_SESSION_ID, APEX_PAGE_ID, APEX_APP_ID
    ) VALUES (
        v_user, p_table, p_operation, p_cle_primaire,
        p_ancien, p_nouveau, p_colonnes,
        p_module, p_description, SYSTIMESTAMP,
        v_apex_session, v_apex_page, v_apex_app
    );

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        -- L'audit ne doit JAMAIS bloquer une opération
        ROLLBACK;
END SP_SS_AUDIT_LOG;
/

PROMPT   ✓ Procédure SP_SS_AUDIT_LOG créée

-- ============================================================================
-- TRIGGER 1 : AUDIT sur SS_ETABLISSEMENTS
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_ETAB_AUD
    AFTER INSERT OR UPDATE OR DELETE ON SS_ETABLISSEMENTS
    FOR EACH ROW
DECLARE
    v_operation VARCHAR2(10);
    v_ancien CLOB;
    v_nouveau CLOB;
BEGIN
    IF INSERTING THEN
        v_operation := 'INSERT';
        v_nouveau := '{"code":"' || :NEW.CODE || '","nom":"' || :NEW.NOM || '","statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_ETABLISSEMENTS', v_operation, TO_CHAR(:NEW.ETABLISSEMENT_ID), NULL, v_nouveau, NULL, 'STRUCTURE');
    ELSIF UPDATING THEN
        v_operation := 'UPDATE';
        v_ancien := '{"code":"' || :OLD.CODE || '","nom":"' || :OLD.NOM || '","statut":"' || :OLD.STATUT || '"}';
        v_nouveau := '{"code":"' || :NEW.CODE || '","nom":"' || :NEW.NOM || '","statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_ETABLISSEMENTS', v_operation, TO_CHAR(:NEW.ETABLISSEMENT_ID), v_ancien, v_nouveau, NULL, 'STRUCTURE');
    ELSIF DELETING THEN
        v_operation := 'DELETE';
        v_ancien := '{"code":"' || :OLD.CODE || '","nom":"' || :OLD.NOM || '"}';
        SP_SS_AUDIT_LOG('SS_ETABLISSEMENTS', v_operation, TO_CHAR(:OLD.ETABLISSEMENT_ID), v_ancien, NULL, NULL, 'STRUCTURE');
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_ETAB_AUD créé

-- ============================================================================
-- TRIGGER 2 : MODIFIED_BY/MODIFIED_DATE sur SS_ETABLISSEMENTS
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_ETAB_BU
    BEFORE UPDATE ON SS_ETABLISSEMENTS
    FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

PROMPT   ✓ Trigger TRG_SS_ETAB_BU créé

-- ============================================================================
-- TRIGGER 3 : AUDIT sur SS_ELEVES
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_ELEV_AUD
    AFTER INSERT OR UPDATE OR DELETE ON SS_ELEVES
    FOR EACH ROW
DECLARE
    v_operation VARCHAR2(10);
    v_ancien CLOB;
    v_nouveau CLOB;
BEGIN
    IF INSERTING THEN
        v_operation := 'INSERT';
        v_nouveau := '{"matricule":"' || :NEW.MATRICULE || '","nom":"' || :NEW.NOM || '","prenom":"' || :NEW.PRENOM || '","statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_ELEVES', v_operation, TO_CHAR(:NEW.ELEVE_ID), NULL, v_nouveau, NULL, 'ACADEMIQUE');
    ELSIF UPDATING THEN
        v_operation := 'UPDATE';
        v_ancien := '{"matricule":"' || :OLD.MATRICULE || '","nom":"' || :OLD.NOM || '","prenom":"' || :OLD.PRENOM || '","statut":"' || :OLD.STATUT || '"}';
        v_nouveau := '{"matricule":"' || :NEW.MATRICULE || '","nom":"' || :NEW.NOM || '","prenom":"' || :NEW.PRENOM || '","statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_ELEVES', v_operation, TO_CHAR(:NEW.ELEVE_ID), v_ancien, v_nouveau, NULL, 'ACADEMIQUE');
    ELSIF DELETING THEN
        v_operation := 'DELETE';
        v_ancien := '{"matricule":"' || :OLD.MATRICULE || '","nom":"' || :OLD.NOM || '","prenom":"' || :OLD.PRENOM || '"}';
        SP_SS_AUDIT_LOG('SS_ELEVES', v_operation, TO_CHAR(:OLD.ELEVE_ID), v_ancien, NULL, NULL, 'ACADEMIQUE');
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_ELEV_AUD créé

-- ============================================================================
-- TRIGGER 4 : MODIFIED_BY/MODIFIED_DATE sur SS_ELEVES
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_ELEV_BU
    BEFORE UPDATE ON SS_ELEVES
    FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

PROMPT   ✓ Trigger TRG_SS_ELEV_BU créé

-- ============================================================================
-- TRIGGER 5 : Mise à jour automatique de l'effectif des classes
--             Quand une inscription est créée, modifiée ou supprimée
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_INSC_EFFECTIF
    AFTER INSERT OR UPDATE OR DELETE ON SS_INSCRIPTIONS
    FOR EACH ROW
DECLARE
    v_classe_id NUMBER;
BEGIN
    IF INSERTING THEN
        IF :NEW.STATUT = 'ACTIVE' THEN
            UPDATE SS_CLASSES 
            SET EFFECTIF_ACTUEL = EFFECTIF_ACTUEL + 1 
            WHERE CLASSE_ID = :NEW.CLASSE_ID;
        END IF;
    ELSIF UPDATING THEN
        -- Changement de classe
        IF :OLD.CLASSE_ID != :NEW.CLASSE_ID THEN
            IF :OLD.STATUT = 'ACTIVE' THEN
                UPDATE SS_CLASSES 
                SET EFFECTIF_ACTUEL = GREATEST(EFFECTIF_ACTUEL - 1, 0) 
                WHERE CLASSE_ID = :OLD.CLASSE_ID;
            END IF;
            IF :NEW.STATUT = 'ACTIVE' THEN
                UPDATE SS_CLASSES 
                SET EFFECTIF_ACTUEL = EFFECTIF_ACTUEL + 1 
                WHERE CLASSE_ID = :NEW.CLASSE_ID;
            END IF;
        -- Changement de statut dans la même classe
        ELSIF :OLD.STATUT != :NEW.STATUT THEN
            IF :OLD.STATUT = 'ACTIVE' AND :NEW.STATUT != 'ACTIVE' THEN
                UPDATE SS_CLASSES 
                SET EFFECTIF_ACTUEL = GREATEST(EFFECTIF_ACTUEL - 1, 0) 
                WHERE CLASSE_ID = :NEW.CLASSE_ID;
            ELSIF :OLD.STATUT != 'ACTIVE' AND :NEW.STATUT = 'ACTIVE' THEN
                UPDATE SS_CLASSES 
                SET EFFECTIF_ACTUEL = EFFECTIF_ACTUEL + 1 
                WHERE CLASSE_ID = :NEW.CLASSE_ID;
            END IF;
        END IF;
    ELSIF DELETING THEN
        IF :OLD.STATUT = 'ACTIVE' THEN
            UPDATE SS_CLASSES 
            SET EFFECTIF_ACTUEL = GREATEST(EFFECTIF_ACTUEL - 1, 0) 
            WHERE CLASSE_ID = :OLD.CLASSE_ID;
        END IF;
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_INSC_EFFECTIF créé (mise à jour auto effectif classes)

-- ============================================================================
-- TRIGGER 6 : AUDIT sur SS_INSCRIPTIONS
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_INSC_AUD
    AFTER INSERT OR UPDATE OR DELETE ON SS_INSCRIPTIONS
    FOR EACH ROW
DECLARE
    v_operation VARCHAR2(10);
    v_ancien CLOB;
    v_nouveau CLOB;
BEGIN
    IF INSERTING THEN
        v_operation := 'INSERT';
        v_nouveau := '{"eleve_id":' || :NEW.ELEVE_ID || ',"classe_id":' || :NEW.CLASSE_ID || ',"statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_INSCRIPTIONS', v_operation, TO_CHAR(:NEW.INSCRIPTION_ID), NULL, v_nouveau, NULL, 'ACADEMIQUE');
    ELSIF UPDATING THEN
        v_operation := 'UPDATE';
        v_ancien := '{"eleve_id":' || :OLD.ELEVE_ID || ',"classe_id":' || :OLD.CLASSE_ID || ',"statut":"' || :OLD.STATUT || '"}';
        v_nouveau := '{"eleve_id":' || :NEW.ELEVE_ID || ',"classe_id":' || :NEW.CLASSE_ID || ',"statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_INSCRIPTIONS', v_operation, TO_CHAR(:NEW.INSCRIPTION_ID), v_ancien, v_nouveau, NULL, 'ACADEMIQUE');
    ELSIF DELETING THEN
        v_operation := 'DELETE';
        v_ancien := '{"eleve_id":' || :OLD.ELEVE_ID || ',"classe_id":' || :OLD.CLASSE_ID || ',"statut":"' || :OLD.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_INSCRIPTIONS', v_operation, TO_CHAR(:OLD.INSCRIPTION_ID), v_ancien, NULL, NULL, 'ACADEMIQUE');
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_INSC_AUD créé

-- ============================================================================
-- TRIGGER 7 : Mise à jour automatique des montants de facture
--             Quand un paiement est enregistré/modifié/supprimé
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_PAIE_FACTURE
    AFTER INSERT OR UPDATE OR DELETE ON SS_PAIEMENTS
    FOR EACH ROW
DECLARE
    v_facture_id NUMBER;
    v_total_paye NUMBER;
    v_montant_net NUMBER;
    v_nouveau_statut VARCHAR2(30);
BEGIN
    IF INSERTING OR UPDATING THEN
        v_facture_id := :NEW.FACTURE_ID;
    ELSE
        v_facture_id := :OLD.FACTURE_ID;
    END IF;

    -- Recalculer le total payé
    SELECT NVL(SUM(MONTANT), 0)
    INTO v_total_paye
    FROM SS_PAIEMENTS
    WHERE FACTURE_ID = v_facture_id
    AND STATUT = 'VALIDE';

    -- Récupérer le montant net de la facture
    SELECT MONTANT_NET INTO v_montant_net
    FROM SS_FACTURES WHERE FACTURE_ID = v_facture_id;

    -- Déterminer le statut
    IF v_total_paye >= v_montant_net THEN
        v_nouveau_statut := 'PAYEE';
    ELSIF v_total_paye > 0 THEN
        v_nouveau_statut := 'PARTIELLEMENT_PAYEE';
    ELSE
        v_nouveau_statut := 'EN_ATTENTE';
    END IF;

    -- Mettre à jour la facture
    UPDATE SS_FACTURES SET
        MONTANT_PAYE = v_total_paye,
        MONTANT_RESTANT = GREATEST(v_montant_net - v_total_paye, 0),
        STATUT = v_nouveau_statut
    WHERE FACTURE_ID = v_facture_id;
END;
/

PROMPT   ✓ Trigger TRG_SS_PAIE_FACTURE créé (mise à jour auto factures)

-- ============================================================================
-- TRIGGER 8 : AUDIT sur SS_PAIEMENTS
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_PAIE_AUD
    AFTER INSERT OR UPDATE OR DELETE ON SS_PAIEMENTS
    FOR EACH ROW
DECLARE
    v_operation VARCHAR2(10);
    v_ancien CLOB;
    v_nouveau CLOB;
BEGIN
    IF INSERTING THEN
        v_operation := 'INSERT';
        v_nouveau := '{"recu":"' || :NEW.NUMERO_RECU || '","montant":' || :NEW.MONTANT || ',"mode":"' || :NEW.MODE_PAIEMENT || '","statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_PAIEMENTS', v_operation, TO_CHAR(:NEW.PAIEMENT_ID), NULL, v_nouveau, NULL, 'FINANCE');
    ELSIF UPDATING THEN
        v_operation := 'UPDATE';
        v_ancien := '{"recu":"' || :OLD.NUMERO_RECU || '","montant":' || :OLD.MONTANT || ',"statut":"' || :OLD.STATUT || '"}';
        v_nouveau := '{"recu":"' || :NEW.NUMERO_RECU || '","montant":' || :NEW.MONTANT || ',"statut":"' || :NEW.STATUT || '"}';
        SP_SS_AUDIT_LOG('SS_PAIEMENTS', v_operation, TO_CHAR(:NEW.PAIEMENT_ID), v_ancien, v_nouveau, NULL, 'FINANCE');
    ELSIF DELETING THEN
        v_operation := 'DELETE';
        v_ancien := '{"recu":"' || :OLD.NUMERO_RECU || '","montant":' || :OLD.MONTANT || '"}';
        SP_SS_AUDIT_LOG('SS_PAIEMENTS', v_operation, TO_CHAR(:OLD.PAIEMENT_ID), v_ancien, NULL, NULL, 'FINANCE');
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_PAIE_AUD créé

-- ============================================================================
-- TRIGGER 9 : AUDIT sur SS_NOTES (critique pour la traçabilité des notes)
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_NOTE_AUD
    AFTER INSERT OR UPDATE OR DELETE ON SS_NOTES
    FOR EACH ROW
DECLARE
    v_operation VARCHAR2(10);
    v_ancien CLOB;
    v_nouveau CLOB;
BEGIN
    IF INSERTING THEN
        v_operation := 'INSERT';
        v_nouveau := '{"evaluation_id":' || :NEW.EVALUATION_ID || ',"inscription_id":' || :NEW.INSCRIPTION_ID || ',"valeur":' || NVL(TO_CHAR(:NEW.VALEUR), 'null') || '}';
        SP_SS_AUDIT_LOG('SS_NOTES', v_operation, TO_CHAR(:NEW.NOTE_ID), NULL, v_nouveau, NULL, 'EVALUATIONS');
    ELSIF UPDATING THEN
        v_operation := 'UPDATE';
        v_ancien := '{"valeur":' || NVL(TO_CHAR(:OLD.VALEUR), 'null') || ',"absent":"' || :OLD.EST_ABSENT || '"}';
        v_nouveau := '{"valeur":' || NVL(TO_CHAR(:NEW.VALEUR), 'null') || ',"absent":"' || :NEW.EST_ABSENT || '"}';
        SP_SS_AUDIT_LOG('SS_NOTES', v_operation, TO_CHAR(:NEW.NOTE_ID), v_ancien, v_nouveau, NULL, 'EVALUATIONS', 'Modification de note');
    ELSIF DELETING THEN
        v_operation := 'DELETE';
        v_ancien := '{"evaluation_id":' || :OLD.EVALUATION_ID || ',"valeur":' || NVL(TO_CHAR(:OLD.VALEUR), 'null') || '}';
        SP_SS_AUDIT_LOG('SS_NOTES', v_operation, TO_CHAR(:OLD.NOTE_ID), v_ancien, NULL, NULL, 'EVALUATIONS', 'Suppression de note');
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_NOTE_AUD créé

-- ============================================================================
-- TRIGGER 10 : Calcul automatique NOTE_RAMENEE_20 dans SS_NOTES
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_NOTE_CALCUL
    BEFORE INSERT OR UPDATE ON SS_NOTES
    FOR EACH ROW
BEGIN
    -- Calculer la note ramenée sur 20
    IF :NEW.VALEUR IS NOT NULL AND :NEW.NOTE_SUR IS NOT NULL AND :NEW.NOTE_SUR > 0 THEN
        IF :NEW.NOTE_SUR != 20 THEN
            :NEW.NOTE_RAMENEE_20 := ROUND((:NEW.VALEUR * 20) / :NEW.NOTE_SUR, 2);
        ELSE
            :NEW.NOTE_RAMENEE_20 := :NEW.VALEUR;
        END IF;
    ELSE
        :NEW.NOTE_RAMENEE_20 := NULL;
    END IF;
    
    -- Mettre à jour les champs de saisie
    IF UPDATING THEN
        :NEW.MODIFIE_PAR := NVL(V('APP_USER'), USER);
        :NEW.DATE_MODIFICATION := SYSTIMESTAMP;
    ELSIF INSERTING THEN
        :NEW.SAISI_PAR := NVL(V('APP_USER'), USER);
        :NEW.DATE_SAISIE := SYSTIMESTAMP;
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_NOTE_CALCUL créé

-- ============================================================================
-- TRIGGER 11 : Mise à jour du nombre d'exemplaires disponibles (Bibliothèque)
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_SS_EMPR_STOCK
    AFTER INSERT OR UPDATE OR DELETE ON SS_EMPRUNTS
    FOR EACH ROW
DECLARE
    v_ouvrage_id NUMBER;
    v_exemplaire_id NUMBER;
BEGIN
    IF INSERTING THEN
        -- Marquer l'exemplaire comme emprunté
        UPDATE SS_EXEMPLAIRES SET STATUT = 'EMPRUNTE' 
        WHERE EXEMPLAIRE_ID = :NEW.EXEMPLAIRE_ID;
        
        -- Mettre à jour le compteur de l'ouvrage
        SELECT OUVRAGE_ID INTO v_ouvrage_id 
        FROM SS_EXEMPLAIRES WHERE EXEMPLAIRE_ID = :NEW.EXEMPLAIRE_ID;
        
        UPDATE SS_OUVRAGES SET NB_DISPONIBLES = GREATEST(NB_DISPONIBLES - 1, 0)
        WHERE OUVRAGE_ID = v_ouvrage_id;
        
    ELSIF UPDATING THEN
        IF :OLD.STATUT != 'RETOURNE' AND :NEW.STATUT = 'RETOURNE' THEN
            -- Remettre l'exemplaire disponible
            UPDATE SS_EXEMPLAIRES SET STATUT = 'DISPONIBLE'
            WHERE EXEMPLAIRE_ID = :NEW.EXEMPLAIRE_ID;
            
            SELECT OUVRAGE_ID INTO v_ouvrage_id 
            FROM SS_EXEMPLAIRES WHERE EXEMPLAIRE_ID = :NEW.EXEMPLAIRE_ID;
            
            UPDATE SS_OUVRAGES SET NB_DISPONIBLES = NB_DISPONIBLES + 1
            WHERE OUVRAGE_ID = v_ouvrage_id;
        END IF;
        
    ELSIF DELETING THEN
        IF :OLD.STATUT = 'EN_COURS' THEN
            UPDATE SS_EXEMPLAIRES SET STATUT = 'DISPONIBLE'
            WHERE EXEMPLAIRE_ID = :OLD.EXEMPLAIRE_ID;
            
            SELECT OUVRAGE_ID INTO v_ouvrage_id 
            FROM SS_EXEMPLAIRES WHERE EXEMPLAIRE_ID = :OLD.EXEMPLAIRE_ID;
            
            UPDATE SS_OUVRAGES SET NB_DISPONIBLES = NB_DISPONIBLES + 1
            WHERE OUVRAGE_ID = v_ouvrage_id;
        END IF;
    END IF;
END;
/

PROMPT   ✓ Trigger TRG_SS_EMPR_STOCK créé (gestion stock bibliothèque)

-- ============================================================================
-- TRIGGERS MODIFIED_BY/MODIFIED_DATE génériques pour les tables principales
-- ============================================================================

-- SS_ANNEES_SCOLAIRES
CREATE OR REPLACE TRIGGER TRG_SS_ANNEE_BU
    BEFORE UPDATE ON SS_ANNEES_SCOLAIRES FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_TRIMESTRES
CREATE OR REPLACE TRIGGER TRG_SS_TRIM_BU
    BEFORE UPDATE ON SS_TRIMESTRES FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_CLASSES
CREATE OR REPLACE TRIGGER TRG_SS_CLASS_BU
    BEFORE UPDATE ON SS_CLASSES FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_ENSEIGNANTS
CREATE OR REPLACE TRIGGER TRG_SS_ENS_BU
    BEFORE UPDATE ON SS_ENSEIGNANTS FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_MATIERES
CREATE OR REPLACE TRIGGER TRG_SS_MAT_BU
    BEFORE UPDATE ON SS_MATIERES FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_INSCRIPTIONS
CREATE OR REPLACE TRIGGER TRG_SS_INSC_BU
    BEFORE UPDATE ON SS_INSCRIPTIONS FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_EVALUATIONS
CREATE OR REPLACE TRIGGER TRG_SS_EVAL_BU
    BEFORE UPDATE ON SS_EVALUATIONS FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_FACTURES
CREATE OR REPLACE TRIGGER TRG_SS_FACT_BU
    BEFORE UPDATE ON SS_FACTURES FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_PAIEMENTS
CREATE OR REPLACE TRIGGER TRG_SS_PAIE_BU
    BEFORE UPDATE ON SS_PAIEMENTS FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

-- SS_BULLETINS
CREATE OR REPLACE TRIGGER TRG_SS_BULL_BU
    BEFORE UPDATE ON SS_BULLETINS FOR EACH ROW
BEGIN
    :NEW.MODIFIED_BY := NVL(V('APP_USER'), USER);
    :NEW.MODIFIED_DATE := SYSTIMESTAMP;
END;
/

PROMPT   ✓ Triggers MODIFIED_BY/MODIFIED_DATE créés pour toutes les tables principales

PROMPT
PROMPT ============================================
PROMPT   ✅ TRIGGERS TERMINÉS
PROMPT   - 1 procédure d'audit (SP_SS_AUDIT_LOG)
PROMPT   - 5 triggers d'audit (ETAB, ELEV, INSC, PAIE, NOTE)
PROMPT   - 3 triggers métier (effectif, facture, stock biblio)
PROMPT   - 10 triggers MODIFIED_BY automatiques
PROMPT   - 1 trigger calcul note ramenée sur 20
PROMPT ============================================
