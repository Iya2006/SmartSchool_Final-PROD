-- ============================================================================
-- SMARTSCHOOL ERP — Script 13 : PKG_SS_FINANCE
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Package    : PKG_SS_FINANCE
-- Description: Logique métier financière complète.
--   - Facturation automatique des élèves
--   - Enregistrement des paiements (espèces, chèque, Mobile Money)
--   - Journal de caisse
--   - Statistiques financières
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   PACKAGE PKG_SS_FINANCE
PROMPT ============================================

-- ============================================================================
-- SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SS_FINANCE AS

    -- Génère automatiquement les factures pour tous les élèves d'une classe
    PROCEDURE facturer_classe (
        p_classe_id IN NUMBER,
        p_annee_id  IN NUMBER
    );

    -- Génère la facture pour UN élève à partir de la grille tarifaire
    PROCEDURE facturer_eleve (
        p_inscription_id IN NUMBER,
        p_annee_id       IN NUMBER
    );

    -- Enregistre un paiement (tous modes)
    PROCEDURE enregistrer_paiement (
        p_facture_id       IN NUMBER,
        p_montant          IN NUMBER,
        p_mode_paiement    IN VARCHAR2,
        p_reference        IN VARCHAR2 DEFAULT NULL,
        p_operateur_mm     IN VARCHAR2 DEFAULT NULL,
        p_telephone_mm     IN VARCHAR2 DEFAULT NULL,
        p_recu_par         IN VARCHAR2 DEFAULT NULL,
        p_observation      IN VARCHAR2 DEFAULT NULL,
        p_paiement_id      OUT NUMBER
    );

    -- Annule un paiement
    PROCEDURE annuler_paiement (
        p_paiement_id IN NUMBER,
        p_motif       IN VARCHAR2
    );

    -- Génère le numéro de reçu automatique
    FUNCTION generer_numero_recu (
        p_etablissement_id IN NUMBER
    ) RETURN VARCHAR2;

    -- Génère le numéro de facture automatique
    FUNCTION generer_numero_facture (
        p_etablissement_id IN NUMBER,
        p_annee_code       IN VARCHAR2
    ) RETURN VARCHAR2;

    -- Écrit une ligne dans le journal de caisse
    PROCEDURE ecrire_journal_caisse (
        p_etablissement_id IN NUMBER,
        p_type_operation   IN VARCHAR2,
        p_categorie        IN VARCHAR2,
        p_montant          IN NUMBER,
        p_libelle          IN VARCHAR2,
        p_paiement_id      IN NUMBER DEFAULT NULL
    );

    -- Vérifie les factures en retard et met à jour le statut
    PROCEDURE verifier_factures_retard (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER
    );

    -- Retourne le solde de caisse d'un établissement
    FUNCTION solde_caisse (
        p_etablissement_id IN NUMBER
    ) RETURN NUMBER;

    -- Statistiques financières
    PROCEDURE stats_finance_etablissement (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER,
        p_total_facture    OUT NUMBER,
        p_total_paye       OUT NUMBER,
        p_total_restant    OUT NUMBER,
        p_taux_recouvrement OUT NUMBER,
        p_nb_impayees      OUT NUMBER
    );

END PKG_SS_FINANCE;
/

PROMPT   ✓ Spécification PKG_SS_FINANCE créée

-- ============================================================================
-- CORPS DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SS_FINANCE AS

    -- =======================================================================
    -- generer_numero_facture
    -- Format : FACT-YYYY-NNNNN (ex: FACT-2025-00123)
    -- =======================================================================
    FUNCTION generer_numero_facture (
        p_etablissement_id IN NUMBER,
        p_annee_code       IN VARCHAR2
    ) RETURN VARCHAR2 IS
        v_seq NUMBER;
    BEGIN
        SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(NUMERO_FACTURE, '\d+$'))), 0) + 1
        INTO v_seq
        FROM SS_FACTURES f
        JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE cl.ETABLISSEMENT_ID = p_etablissement_id
        AND NUMERO_FACTURE LIKE 'FACT-' || SUBSTR(p_annee_code, 1, 4) || '-%';

        RETURN 'FACT-' || SUBSTR(p_annee_code, 1, 4) || '-' || LPAD(v_seq, 5, '0');
    END generer_numero_facture;

    -- =======================================================================
    -- generer_numero_recu
    -- Format : REC-YYYYMMDD-NNNNN
    -- =======================================================================
    FUNCTION generer_numero_recu (p_etablissement_id IN NUMBER) RETURN VARCHAR2 IS
        v_seq NUMBER;
    BEGIN
        SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(NUMERO_RECU, '\d+$'))), 0) + 1
        INTO v_seq
        FROM SS_PAIEMENTS p
        JOIN SS_FACTURES f ON p.FACTURE_ID = f.FACTURE_ID
        JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE cl.ETABLISSEMENT_ID = p_etablissement_id
        AND p.NUMERO_RECU LIKE 'REC-' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '-%';

        RETURN 'REC-' || TO_CHAR(SYSDATE, 'YYYYMMDD') || '-' || LPAD(v_seq, 5, '0');
    END generer_numero_recu;

    -- =======================================================================
    -- facturer_eleve
    -- Génère la facture complète d'un élève selon la grille tarifaire
    -- =======================================================================
    PROCEDURE facturer_eleve (
        p_inscription_id IN NUMBER,
        p_annee_id       IN NUMBER
    ) IS
        v_niveau_id        NUMBER;
        v_etablissement_id NUMBER;
        v_facture_id       NUMBER;
        v_annee_code       VARCHAR2(20);
        v_numero_facture   VARCHAR2(30);
        v_total            NUMBER(12,2) := 0;
        v_nb_lignes        NUMBER := 0;
        v_facture_existe   NUMBER;
    BEGIN
        -- Récupérer les infos de l'inscription
        SELECT cl.NIVEAU_ID, cl.ETABLISSEMENT_ID
        INTO v_niveau_id, v_etablissement_id
        FROM SS_INSCRIPTIONS i
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE i.INSCRIPTION_ID = p_inscription_id;

        SELECT CODE INTO v_annee_code FROM SS_ANNEES_SCOLAIRES WHERE ANNEE_ID = p_annee_id;

        -- Vérifier si une facture existe déjà
        SELECT COUNT(*) INTO v_facture_existe
        FROM SS_FACTURES
        WHERE INSCRIPTION_ID = p_inscription_id;

        IF v_facture_existe > 0 THEN
            DBMS_OUTPUT.PUT_LINE('  ⚠ Facture déjà existante pour inscription #' || p_inscription_id);
            RETURN;
        END IF;

        -- Générer le numéro de facture
        v_numero_facture := generer_numero_facture(v_etablissement_id, v_annee_code);

        -- Créer la facture (colonnes réelles de SS_FACTURES)
        INSERT INTO SS_FACTURES (
            INSCRIPTION_ID, NUMERO_FACTURE,
            DATE_FACTURE, MONTANT_TOTAL, MONTANT_REMISE, MONTANT_NET,
            MONTANT_PAYE, MONTANT_RESTANT, STATUT
        ) VALUES (
            p_inscription_id, v_numero_facture,
            SYSDATE, 0, 0, 0, 0, 0, 'EN_ATTENTE'
        ) RETURNING FACTURE_ID INTO v_facture_id;

        -- Ajouter les lignes de facture selon la grille tarifaire
        -- Table réelle = SS_FACTURE_LIGNES (pas SS_LIGNES_FACTURE)
        FOR rec IN (
            SELECT gt.TYPE_FRAIS_ID, gt.MONTANT,
                   tf.CODE AS CODE_FRAIS, tf.LIBELLE AS LIBELLE_FRAIS,
                   tf.CATEGORIE, tf.FREQUENCE,
                   gt.ECHEANCIER,
                   gt.DATE_LIMITE_1, gt.DATE_LIMITE_2, gt.DATE_LIMITE_3,
                   gt.DATE_LIMITE_FINALE
            FROM SS_GRILLE_TARIFAIRE gt
            JOIN SS_TYPES_FRAIS tf ON gt.TYPE_FRAIS_ID = tf.TYPE_FRAIS_ID
            WHERE gt.NIVEAU_ID = v_niveau_id
            AND gt.ANNEE_ID = p_annee_id
            AND gt.ETABLISSEMENT_ID = v_etablissement_id
            AND gt.STATUT = 'ACTIF'
        ) LOOP
            -- Colonnes réelles de SS_FACTURE_LIGNES
            INSERT INTO SS_FACTURE_LIGNES (
                FACTURE_ID, GRILLE_ID, LIBELLE,
                QUANTITE, PRIX_UNITAIRE, REMISE, MONTANT_NET
            ) VALUES (
                v_facture_id, NULL, rec.LIBELLE_FRAIS,
                1, rec.MONTANT, 0, rec.MONTANT
            );

            v_total := v_total + rec.MONTANT;
            v_nb_lignes := v_nb_lignes + 1;
        END LOOP;

        -- Mettre à jour le total de la facture (colonnes réelles)
        UPDATE SS_FACTURES SET
            MONTANT_TOTAL   = v_total,
            MONTANT_NET     = v_total,
            MONTANT_RESTANT = v_total
        WHERE FACTURE_ID = v_facture_id;

        DBMS_OUTPUT.PUT_LINE('  ✓ Facture ' || v_numero_facture || 
                             ' créée : ' || TO_CHAR(v_total, 'FM999,999,999') || 
                             ' GNF (' || v_nb_lignes || ' lignes)');
    END facturer_eleve;

    -- =======================================================================
    -- facturer_classe
    -- =======================================================================
    PROCEDURE facturer_classe (
        p_classe_id IN NUMBER,
        p_annee_id  IN NUMBER
    ) IS
        v_count NUMBER := 0;
        v_code_classe VARCHAR2(30);
    BEGIN
        SELECT CODE INTO v_code_classe FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;

        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('╔══════════════════════════════════════════════════╗');
        DBMS_OUTPUT.PUT_LINE('║  FACTURATION CLASSE : ' || v_code_classe);
        DBMS_OUTPUT.PUT_LINE('╚══════════════════════════════════════════════════╝');

        FOR rec IN (
            SELECT INSCRIPTION_ID FROM SS_INSCRIPTIONS
            WHERE CLASSE_ID = p_classe_id
            AND ANNEE_ID = p_annee_id
            AND STATUT = 'ACTIVE'
        ) LOOP
            facturer_eleve(rec.INSCRIPTION_ID, p_annee_id);
            v_count := v_count + 1;
        END LOOP;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' élèves facturés pour ' || v_code_classe);
    END facturer_classe;

    -- =======================================================================
    -- enregistrer_paiement
    -- Enregistre un paiement et met à jour la facture
    -- =======================================================================
    PROCEDURE enregistrer_paiement (
        p_facture_id       IN NUMBER,
        p_montant          IN NUMBER,
        p_mode_paiement    IN VARCHAR2,
        p_reference        IN VARCHAR2 DEFAULT NULL,
        p_operateur_mm     IN VARCHAR2 DEFAULT NULL,
        p_telephone_mm     IN VARCHAR2 DEFAULT NULL,
        p_recu_par         IN VARCHAR2 DEFAULT NULL,
        p_observation      IN VARCHAR2 DEFAULT NULL,
        p_paiement_id      OUT NUMBER
    ) IS
        v_montant_restant  NUMBER(12,2);
        v_etablissement_id NUMBER;
        v_numero_recu      VARCHAR2(30);
    BEGIN
        -- Vérifications
        IF p_montant <= 0 THEN
            RAISE_APPLICATION_ERROR(-20010, 'Le montant du paiement doit être positif');
        END IF;

        -- Vérifier le montant restant
        SELECT f.MONTANT_RESTANT, cl.ETABLISSEMENT_ID
        INTO v_montant_restant, v_etablissement_id
        FROM SS_FACTURES f
        JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE f.FACTURE_ID = p_facture_id;

        IF p_montant > v_montant_restant THEN
            RAISE_APPLICATION_ERROR(-20012, 
                'Montant supérieur au reste à payer (' || 
                TO_CHAR(v_montant_restant, 'FM999,999,999') || ' GNF)');
        END IF;

        -- Générer le numéro de reçu
        v_numero_recu := generer_numero_recu(v_etablissement_id);

        -- Insérer le paiement (colonnes réelles de SS_PAIEMENTS)
        INSERT INTO SS_PAIEMENTS (
            FACTURE_ID, MONTANT, MODE_PAIEMENT,
            DATE_PAIEMENT, NUMERO_RECU,
            REFERENCE_EXTERNE, OPERATEUR_MM, NUMERO_TELEPHONE_MM,
            RECU_PAR, OBSERVATION, STATUT
        ) VALUES (
            p_facture_id, p_montant, p_mode_paiement,
            SYSDATE, v_numero_recu,
            p_reference, p_operateur_mm, p_telephone_mm,
            NVL(p_recu_par, NVL(V('APP_USER'), USER)), 
            p_observation, 'VALIDE'
        ) RETURNING PAIEMENT_ID INTO p_paiement_id;

        -- Mettre à jour la facture
        UPDATE SS_FACTURES SET
            MONTANT_PAYE = MONTANT_PAYE + p_montant,
            MONTANT_RESTANT = MONTANT_RESTANT - p_montant,
            STATUT = CASE 
                WHEN MONTANT_RESTANT - p_montant <= 0 THEN 'PAYEE'
                ELSE 'PARTIELLEMENT_PAYEE'
            END,
            MODIFIED_BY = NVL(V('APP_USER'), USER),
            MODIFIED_DATE = SYSTIMESTAMP
        WHERE FACTURE_ID = p_facture_id;

        -- Écrire dans le journal de caisse
        ecrire_journal_caisse(
            v_etablissement_id, 'ENTREE', 'SCOLARITE',
            p_montant,
            'Paiement reçu — Reçu ' || v_numero_recu,
            p_paiement_id);

        COMMIT;

        DBMS_OUTPUT.PUT_LINE('✓ Paiement enregistré : ' || 
                             TO_CHAR(p_montant, 'FM999,999,999') || 
                             ' GNF — Reçu ' || v_numero_recu);
    END enregistrer_paiement;

    -- =======================================================================
    -- annuler_paiement
    -- =======================================================================
    PROCEDURE annuler_paiement (
        p_paiement_id IN NUMBER,
        p_motif       IN VARCHAR2
    ) IS
        v_montant NUMBER(12,2);
        v_facture_id NUMBER;
        v_etab_id NUMBER;
    BEGIN
        SELECT p.MONTANT, p.FACTURE_ID, cl.ETABLISSEMENT_ID
        INTO v_montant, v_facture_id, v_etab_id
        FROM SS_PAIEMENTS p
        JOIN SS_FACTURES f ON p.FACTURE_ID = f.FACTURE_ID
        JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE p.PAIEMENT_ID = p_paiement_id;

        UPDATE SS_PAIEMENTS SET
            STATUT           = 'ANNULE',
            DATE_ANNULATION  = SYSDATE,
            MOTIF_ANNULATION = p_motif,
            OBSERVATION      = NVL(OBSERVATION, '') || ' [ANNULÉ: ' || p_motif || ']',
            MODIFIED_BY      = NVL(V('APP_USER'), USER),
            MODIFIED_DATE    = SYSTIMESTAMP
        WHERE PAIEMENT_ID = p_paiement_id;

        -- Recalculer le total payé sur la facture
        UPDATE SS_FACTURES SET
            MONTANT_PAYE = (SELECT NVL(SUM(MONTANT), 0) FROM SS_PAIEMENTS 
                            WHERE FACTURE_ID = v_facture_id AND STATUT = 'VALIDE'),
            MONTANT_RESTANT = MONTANT_NET - (SELECT NVL(SUM(MONTANT), 0) FROM SS_PAIEMENTS 
                                              WHERE FACTURE_ID = v_facture_id AND STATUT = 'VALIDE'),
            STATUT = CASE 
                WHEN (SELECT NVL(SUM(MONTANT), 0) FROM SS_PAIEMENTS 
                      WHERE FACTURE_ID = v_facture_id AND STATUT = 'VALIDE') = 0 THEN 'EN_ATTENTE'
                WHEN (SELECT NVL(SUM(MONTANT), 0) FROM SS_PAIEMENTS 
                      WHERE FACTURE_ID = v_facture_id AND STATUT = 'VALIDE') >= MONTANT_NET THEN 'PAYEE'
                ELSE 'PARTIELLEMENT_PAYEE'
            END
        WHERE FACTURE_ID = v_facture_id;

        -- Écriture inverse dans le journal
        ecrire_journal_caisse(
            v_etab_id, 'SORTIE', 'SCOLARITE',
            v_montant,
            'Annulation paiement #' || p_paiement_id || ' — ' || p_motif,
            p_paiement_id);

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Paiement #' || p_paiement_id || ' annulé — ' || 
                             TO_CHAR(v_montant, 'FM999,999,999') || ' GNF');
    END annuler_paiement;

    -- =======================================================================
    -- ecrire_journal_caisse
    -- Colonnes réelles : ETABLISSEMENT_ID, DATE_OPERATION, TYPE_OPERATION,
    --   CATEGORIE, LIBELLE, MONTANT_ENTREE/MONTANT_SORTIE, PAIEMENT_ID, OPERATEUR
    -- =======================================================================
    PROCEDURE ecrire_journal_caisse (
        p_etablissement_id IN NUMBER,
        p_type_operation   IN VARCHAR2,
        p_categorie        IN VARCHAR2,
        p_montant          IN NUMBER,
        p_libelle          IN VARCHAR2,
        p_paiement_id      IN NUMBER DEFAULT NULL
    ) IS
    BEGIN
        INSERT INTO SS_JOURNAL_CAISSE (
            ETABLISSEMENT_ID, DATE_OPERATION, TYPE_OPERATION,
            CATEGORIE, LIBELLE,
            MONTANT_ENTREE, MONTANT_SORTIE,
            PAIEMENT_ID, OPERATEUR
        ) VALUES (
            p_etablissement_id, SYSDATE, p_type_operation,
            p_categorie, p_libelle,
            CASE WHEN p_type_operation = 'ENTREE' THEN p_montant ELSE 0 END,
            CASE WHEN p_type_operation = 'SORTIE' THEN p_montant ELSE 0 END,
            p_paiement_id,
            NVL(V('APP_USER'), USER)
        );
    END ecrire_journal_caisse;

    -- =======================================================================
    -- verifier_factures_retard
    -- Met à jour le statut des factures en retard
    -- =======================================================================
    PROCEDURE verifier_factures_retard (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER
    ) IS
        v_count NUMBER := 0;
    BEGIN
        -- Utilise DATE_ECHEANCE de SS_FACTURES directement
        UPDATE SS_FACTURES f SET
            f.STATUT = 'EN_RETARD',
            f.MODIFIED_BY = 'SYSTEM',
            f.MODIFIED_DATE = SYSTIMESTAMP
        WHERE f.STATUT IN ('EN_ATTENTE', 'PARTIELLEMENT_PAYEE')
        AND f.MONTANT_RESTANT > 0
        AND f.DATE_ECHEANCE < SYSDATE
        AND EXISTS (
            SELECT 1 FROM SS_INSCRIPTIONS i
            JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
            WHERE i.INSCRIPTION_ID = f.INSCRIPTION_ID
            AND cl.ETABLISSEMENT_ID = p_etablissement_id
            AND i.ANNEE_ID = p_annee_id
        );

        v_count := SQL%ROWCOUNT;
        COMMIT;

        DBMS_OUTPUT.PUT_LINE('✓ ' || v_count || ' factures mises en retard');
    END verifier_factures_retard;

    -- =======================================================================
    -- solde_caisse
    -- Colonnes réelles : MONTANT_ENTREE, MONTANT_SORTIE
    -- =======================================================================
    FUNCTION solde_caisse (
        p_etablissement_id IN NUMBER
    ) RETURN NUMBER IS
        v_solde NUMBER(15,2);
    BEGIN
        SELECT NVL(SUM(MONTANT_ENTREE - MONTANT_SORTIE), 0)
        INTO v_solde
        FROM SS_JOURNAL_CAISSE
        WHERE ETABLISSEMENT_ID = p_etablissement_id;

        RETURN v_solde;
    END solde_caisse;

    -- =======================================================================
    -- stats_finance_etablissement
    -- Statistiques financières globales
    -- =======================================================================
    PROCEDURE stats_finance_etablissement (
        p_etablissement_id  IN NUMBER,
        p_annee_id          IN NUMBER,
        p_total_facture     OUT NUMBER,
        p_total_paye        OUT NUMBER,
        p_total_restant     OUT NUMBER,
        p_taux_recouvrement OUT NUMBER,
        p_nb_impayees       OUT NUMBER
    ) IS
    BEGIN
        SELECT 
            NVL(SUM(f.MONTANT_NET), 0),
            NVL(SUM(f.MONTANT_PAYE), 0),
            NVL(SUM(f.MONTANT_RESTANT), 0),
            CASE WHEN SUM(f.MONTANT_NET) > 0 
                 THEN ROUND(SUM(f.MONTANT_PAYE) / SUM(f.MONTANT_NET) * 100, 1)
                 ELSE 0 END,
            COUNT(CASE WHEN f.STATUT IN ('EN_ATTENTE','PARTIELLEMENT_PAYEE','EN_RETARD') THEN 1 END)
        INTO p_total_facture, p_total_paye, p_total_restant, p_taux_recouvrement, p_nb_impayees
        FROM SS_FACTURES f
        JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE cl.ETABLISSEMENT_ID = p_etablissement_id
        AND i.ANNEE_ID = p_annee_id;

        DBMS_OUTPUT.PUT_LINE('═══ Stats Finance ═══');
        DBMS_OUTPUT.PUT_LINE('Total facturé  : ' || TO_CHAR(p_total_facture, 'FM999,999,999,999') || ' GNF');
        DBMS_OUTPUT.PUT_LINE('Total payé     : ' || TO_CHAR(p_total_paye, 'FM999,999,999,999') || ' GNF');
        DBMS_OUTPUT.PUT_LINE('Reste à payer  : ' || TO_CHAR(p_total_restant, 'FM999,999,999,999') || ' GNF');
        DBMS_OUTPUT.PUT_LINE('Recouvrement   : ' || p_taux_recouvrement || '%');
        DBMS_OUTPUT.PUT_LINE('Factures impayées : ' || p_nb_impayees);
    END stats_finance_etablissement;

END PKG_SS_FINANCE;
/

PROMPT   ✓ Corps PKG_SS_FINANCE créé

PROMPT
PROMPT ============================================
PROMPT   ✅ PKG_SS_FINANCE INSTALLÉ
PROMPT   - Facturation automatique par classe
PROMPT   - Paiements multi-modes (espèces/MM)
PROMPT   - Journal de caisse
PROMPT   - Statistiques et recouvrement
PROMPT ============================================
