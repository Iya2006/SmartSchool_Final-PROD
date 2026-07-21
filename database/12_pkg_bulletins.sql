-- ============================================================================
-- SMARTSCHOOL ERP — Script 12 : PKG_SS_BULLETINS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Package    : PKG_SS_BULLETINS
-- Description: Génération, validation et publication des bulletins scolaires.
--   - Génération complète des bulletins avec détails par matière
--   - Workflow : BROUILLON → GENERE → VALIDE → PUBLIE
--   - Génération de bulletins annuels
--   - Décisions de conseil de classe
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   PACKAGE PKG_SS_BULLETINS
PROMPT ============================================

-- ============================================================================
-- SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SS_BULLETINS AS

    -- Génère le bulletin trimestriel complet d'un élève
    PROCEDURE generer_bulletin_eleve (
        p_inscription_id IN NUMBER,
        p_trimestre_id   IN NUMBER
    );

    -- Génère tous les bulletins d'une classe pour un trimestre
    PROCEDURE generer_bulletins_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Valide le bulletin (passage GENERE → VALIDE)
    PROCEDURE valider_bulletin (
        p_bulletin_id          IN NUMBER,
        p_appreciation_conseil IN VARCHAR2 DEFAULT NULL,
        p_observation_dir      IN VARCHAR2 DEFAULT NULL
    );

    -- Valide tous les bulletins d'une classe
    PROCEDURE valider_bulletins_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Publie le bulletin (VALIDE → PUBLIE, visible par les parents)
    PROCEDURE publier_bulletin (
        p_bulletin_id IN NUMBER
    );

    -- Publie tous les bulletins d'une classe
    PROCEDURE publier_bulletins_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Génère le bulletin annuel
    PROCEDURE generer_bulletin_annuel (
        p_inscription_id IN NUMBER
    );

    -- Génère TOUS les bulletins annuels d'une classe
    PROCEDURE generer_bulletins_annuels_classe (
        p_classe_id IN NUMBER
    );

    -- Applique une décision de conseil (ADMIS, REDOUBLANT, etc.)
    PROCEDURE appliquer_decision (
        p_bulletin_id IN NUMBER,
        p_decision    IN VARCHAR2,
        p_observation IN VARCHAR2 DEFAULT NULL
    );

END PKG_SS_BULLETINS;
/

PROMPT   ✓ Spécification PKG_SS_BULLETINS créée

-- ============================================================================
-- CORPS DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SS_BULLETINS AS

    -- =======================================================================
    -- generer_bulletin_eleve
    -- Crée/met à jour le bulletin ET les lignes de détail par matière
    -- =======================================================================
    PROCEDURE generer_bulletin_eleve (
        p_inscription_id IN NUMBER,
        p_trimestre_id   IN NUMBER
    ) IS
        v_bulletin_id    NUMBER;
        v_total_points   NUMBER(8,2) := 0;
        v_total_coef     NUMBER(5,1) := 0;
        v_moyenne_gen    NUMBER(5,2);
        v_nb_matieres    NUMBER := 0;
    BEGIN
        -- Vérifier que des moyennes existent
        SELECT COUNT(*) INTO v_nb_matieres
        FROM SS_MOYENNES_TRIM
        WHERE INSCRIPTION_ID = p_inscription_id
        AND TRIMESTRE_ID = p_trimestre_id;

        IF v_nb_matieres = 0 THEN
            RETURN; -- Aucune moyenne calculée
        END IF;

        -- Calculer les totaux
        SELECT NVL(SUM(POINTS), 0), NVL(SUM(COEFFICIENT), 0)
        INTO v_total_points, v_total_coef
        FROM SS_MOYENNES_TRIM
        WHERE INSCRIPTION_ID = p_inscription_id
        AND TRIMESTRE_ID = p_trimestre_id;

        IF v_total_coef > 0 THEN
            v_moyenne_gen := ROUND(v_total_points / v_total_coef, 2);
        END IF;

        -- Créer ou mettre à jour l'en-tête du bulletin
        MERGE INTO SS_BULLETINS b
        USING (SELECT p_inscription_id AS insc_id, 
                      p_trimestre_id AS trim_id FROM DUAL) src
        ON (b.INSCRIPTION_ID = src.insc_id 
            AND b.TRIMESTRE_ID = src.trim_id 
            AND b.TYPE_BULLETIN = 'TRIMESTRIEL')
        WHEN MATCHED THEN
            UPDATE SET 
                b.MOYENNE_GENERALE   = v_moyenne_gen,
                b.TOTAL_POINTS       = v_total_points,
                b.TOTAL_COEFFICIENTS = v_total_coef,
                b.MENTION            = PKG_SS_EVALUATIONS.generer_mention(v_moyenne_gen),
                b.DATE_GENERATION    = SYSTIMESTAMP,
                b.STATUT             = 'GENERE',
                b.MODIFIED_BY        = NVL(V('APP_USER'), USER),
                b.MODIFIED_DATE      = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
            INSERT (INSCRIPTION_ID, TRIMESTRE_ID, TYPE_BULLETIN,
                    MOYENNE_GENERALE, TOTAL_POINTS, TOTAL_COEFFICIENTS,
                    MENTION, DATE_GENERATION, STATUT)
            VALUES (p_inscription_id, p_trimestre_id, 'TRIMESTRIEL',
                    v_moyenne_gen, v_total_points, v_total_coef,
                    PKG_SS_EVALUATIONS.generer_mention(v_moyenne_gen),
                    SYSTIMESTAMP, 'GENERE');

        -- Récupérer l'ID du bulletin
        SELECT BULLETIN_ID INTO v_bulletin_id
        FROM SS_BULLETINS
        WHERE INSCRIPTION_ID = p_inscription_id
        AND TRIMESTRE_ID = p_trimestre_id
        AND TYPE_BULLETIN = 'TRIMESTRIEL';

        -- Supprimer les anciens détails et recréer
        DELETE FROM SS_BULLETIN_DETAILS WHERE BULLETIN_ID = v_bulletin_id;

        -- Insérer les détails par matière
        INSERT INTO SS_BULLETIN_DETAILS (
            BULLETIN_ID, MATIERE_ID,
            NOTE_DEVOIR_1, NOTE_DEVOIR_2, NOTE_DEVOIR_3,
            MOYENNE_DEVOIRS, NOTE_COMPOSITION,
            MOYENNE_MATIERE, COEFFICIENT, POINTS,
            RANG_MATIERE, MOYENNE_CLASSE, NOTE_MAX_CLASSE, NOTE_MIN_CLASSE,
            APPRECIATION, ENSEIGNANT_NOM,
            ORDRE_AFFICHAGE, CATEGORIE_MATIERE
        )
        SELECT 
            v_bulletin_id,
            mt.MATIERE_ID,
            -- Notes de devoirs individuels (jusqu'à 3)
            (SELECT MIN(n.NOTE_RAMENEE_20) KEEP (DENSE_RANK FIRST ORDER BY ev.DATE_EVALUATION)
             FROM SS_NOTES n 
             JOIN SS_EVALUATIONS ev ON n.EVALUATION_ID = ev.EVALUATION_ID
             JOIN SS_TYPES_EVALUATION te ON ev.TYPE_EVAL_ID = te.TYPE_EVAL_ID
             WHERE n.INSCRIPTION_ID = mt.INSCRIPTION_ID 
             AND ev.MATIERE_ID = mt.MATIERE_ID 
             AND ev.TRIMESTRE_ID = mt.TRIMESTRE_ID
             AND te.CODE = 'DEVOIR' AND n.EST_ABSENT = 'N') AS note_d1,
            (SELECT MIN(n.NOTE_RAMENEE_20) KEEP (DENSE_RANK FIRST ORDER BY ev.DATE_EVALUATION)
             FROM SS_NOTES n 
             JOIN SS_EVALUATIONS ev ON n.EVALUATION_ID = ev.EVALUATION_ID
             JOIN SS_TYPES_EVALUATION te ON ev.TYPE_EVAL_ID = te.TYPE_EVAL_ID
             WHERE n.INSCRIPTION_ID = mt.INSCRIPTION_ID 
             AND ev.MATIERE_ID = mt.MATIERE_ID 
             AND ev.TRIMESTRE_ID = mt.TRIMESTRE_ID
             AND te.CODE = 'DEVOIR' AND n.EST_ABSENT = 'N'
             AND ev.EVALUATION_ID NOT IN (
                SELECT MIN(ev2.EVALUATION_ID) FROM SS_EVALUATIONS ev2 
                JOIN SS_TYPES_EVALUATION te2 ON ev2.TYPE_EVAL_ID = te2.TYPE_EVAL_ID
                WHERE ev2.MATIERE_ID = mt.MATIERE_ID 
                AND ev2.TRIMESTRE_ID = mt.TRIMESTRE_ID AND te2.CODE = 'DEVOIR'
             )) AS note_d2,
            NULL AS note_d3,  -- Simplifié pour les cas standards
            mt.MOYENNE_DEVOIRS,
            mt.NOTE_COMPOSITION,
            mt.MOYENNE,
            mt.COEFFICIENT,
            mt.POINTS,
            mt.RANG,
            mt.MOYENNE_CLASSE,
            mt.NOTE_MAX,
            mt.NOTE_MIN,
            mt.APPRECIATION,
            -- Nom de l'enseignant (dénormalisé)
            (SELECT e.NOM || ' ' || e.PRENOM 
             FROM SS_ENSEIGNANTS e
             JOIN SS_AFFECTATIONS af ON af.ENSEIGNANT_ID = e.ENSEIGNANT_ID
             JOIN SS_INSCRIPTIONS ins ON ins.CLASSE_ID = af.CLASSE_ID 
                                      AND ins.ANNEE_ID = af.ANNEE_ID
             WHERE ins.INSCRIPTION_ID = mt.INSCRIPTION_ID
             AND af.MATIERE_ID = mt.MATIERE_ID
             AND af.STATUT = 'ACTIVE'
             AND ROWNUM = 1) AS enseignant_nom,
            m.ORDRE_AFFICHAGE,
            m.CATEGORIE
        FROM SS_MOYENNES_TRIM mt
        JOIN SS_MATIERES m ON mt.MATIERE_ID = m.MATIERE_ID
        WHERE mt.INSCRIPTION_ID = p_inscription_id
        AND mt.TRIMESTRE_ID = p_trimestre_id
        ORDER BY m.CATEGORIE, m.ORDRE_AFFICHAGE;

    END generer_bulletin_eleve;

    -- =======================================================================
    -- generer_bulletins_classe
    -- =======================================================================
    PROCEDURE generer_bulletins_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_count NUMBER := 0;
        v_code_classe VARCHAR2(30);
    BEGIN
        SELECT CODE INTO v_code_classe FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;

        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('╔══════════════════════════════════════════════════╗');
        DBMS_OUTPUT.PUT_LINE('║  GÉNÉRATION BULLETINS : ' || v_code_classe);
        DBMS_OUTPUT.PUT_LINE('╚══════════════════════════════════════════════════╝');

        FOR rec IN (
            SELECT INSCRIPTION_ID 
            FROM SS_INSCRIPTIONS
            WHERE CLASSE_ID = p_classe_id AND STATUT = 'ACTIVE'
        ) LOOP
            generer_bulletin_eleve(rec.INSCRIPTION_ID, p_trimestre_id);
            v_count := v_count + 1;
        END LOOP;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' bulletins générés pour ' || v_code_classe);
    END generer_bulletins_classe;

    -- =======================================================================
    -- valider_bulletin
    -- =======================================================================
    PROCEDURE valider_bulletin (
        p_bulletin_id          IN NUMBER,
        p_appreciation_conseil IN VARCHAR2 DEFAULT NULL,
        p_observation_dir      IN VARCHAR2 DEFAULT NULL
    ) IS
        v_statut VARCHAR2(20);
    BEGIN
        SELECT STATUT INTO v_statut FROM SS_BULLETINS WHERE BULLETIN_ID = p_bulletin_id;

        IF v_statut NOT IN ('GENERE','BROUILLON') THEN
            RAISE_APPLICATION_ERROR(-20001, 
                'Impossible de valider : le bulletin est en statut ' || v_statut);
        END IF;

        UPDATE SS_BULLETINS SET
            STATUT               = 'VALIDE',
            APPRECIATION_CONSEIL = NVL(p_appreciation_conseil, APPRECIATION_CONSEIL),
            OBSERVATION_DIRECTEUR = NVL(p_observation_dir, OBSERVATION_DIRECTEUR),
            DATE_VALIDATION      = SYSTIMESTAMP,
            VALIDE_PAR           = NVL(V('APP_USER'), USER),
            MODIFIED_BY          = NVL(V('APP_USER'), USER),
            MODIFIED_DATE        = SYSTIMESTAMP
        WHERE BULLETIN_ID = p_bulletin_id;

        COMMIT;
    END valider_bulletin;

    -- =======================================================================
    -- valider_bulletins_classe
    -- =======================================================================
    PROCEDURE valider_bulletins_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_count NUMBER := 0;
    BEGIN
        FOR rec IN (
            SELECT b.BULLETIN_ID
            FROM SS_BULLETINS b
            JOIN SS_INSCRIPTIONS i ON b.INSCRIPTION_ID = i.INSCRIPTION_ID
            WHERE i.CLASSE_ID = p_classe_id
            AND b.TRIMESTRE_ID = p_trimestre_id
            AND b.STATUT IN ('GENERE','BROUILLON')
        ) LOOP
            valider_bulletin(rec.BULLETIN_ID);
            v_count := v_count + 1;
        END LOOP;

        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' bulletins validés');
    END valider_bulletins_classe;

    -- =======================================================================
    -- publier_bulletin
    -- =======================================================================
    PROCEDURE publier_bulletin (p_bulletin_id IN NUMBER) IS
        v_statut VARCHAR2(20);
    BEGIN
        SELECT STATUT INTO v_statut FROM SS_BULLETINS WHERE BULLETIN_ID = p_bulletin_id;

        IF v_statut != 'VALIDE' THEN
            RAISE_APPLICATION_ERROR(-20002, 
                'Impossible de publier : le bulletin doit d''abord être validé (statut actuel : ' || v_statut || ')');
        END IF;

        UPDATE SS_BULLETINS SET
            STATUT           = 'PUBLIE',
            DATE_PUBLICATION = SYSTIMESTAMP,
            MODIFIED_BY      = NVL(V('APP_USER'), USER),
            MODIFIED_DATE    = SYSTIMESTAMP
        WHERE BULLETIN_ID = p_bulletin_id;

        COMMIT;
    END publier_bulletin;

    -- =======================================================================
    -- publier_bulletins_classe
    -- =======================================================================
    PROCEDURE publier_bulletins_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_count NUMBER := 0;
    BEGIN
        FOR rec IN (
            SELECT b.BULLETIN_ID
            FROM SS_BULLETINS b
            JOIN SS_INSCRIPTIONS i ON b.INSCRIPTION_ID = i.INSCRIPTION_ID
            WHERE i.CLASSE_ID = p_classe_id
            AND b.TRIMESTRE_ID = p_trimestre_id
            AND b.STATUT = 'VALIDE'
        ) LOOP
            publier_bulletin(rec.BULLETIN_ID);
            v_count := v_count + 1;
        END LOOP;

        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' bulletins publiés');
    END publier_bulletins_classe;

    -- =======================================================================
    -- generer_bulletin_annuel
    -- =======================================================================
    PROCEDURE generer_bulletin_annuel (p_inscription_id IN NUMBER) IS
        v_bulletin_id    NUMBER;
        v_total_points   NUMBER(8,2);
        v_total_coef     NUMBER(5,1);
        v_moyenne_gen    NUMBER(5,2);
    BEGIN
        -- Moyenne des moyennes annuelles
        SELECT NVL(SUM(POINTS_ANNUELS), 0), NVL(SUM(COEFFICIENT), 0)
        INTO v_total_points, v_total_coef
        FROM SS_MOYENNES_ANNUELLES
        WHERE INSCRIPTION_ID = p_inscription_id;

        IF v_total_coef > 0 THEN
            v_moyenne_gen := ROUND(v_total_points / v_total_coef, 2);
        ELSE
            RETURN;
        END IF;

        MERGE INTO SS_BULLETINS b
        USING (SELECT p_inscription_id AS insc_id FROM DUAL) src
        ON (b.INSCRIPTION_ID = src.insc_id 
            AND b.TRIMESTRE_ID IS NULL 
            AND b.TYPE_BULLETIN = 'ANNUEL')
        WHEN MATCHED THEN
            UPDATE SET 
                b.MOYENNE_GENERALE   = v_moyenne_gen,
                b.TOTAL_POINTS       = v_total_points,
                b.TOTAL_COEFFICIENTS = v_total_coef,
                b.MENTION            = PKG_SS_EVALUATIONS.generer_mention(v_moyenne_gen),
                b.DATE_GENERATION    = SYSTIMESTAMP,
                b.STATUT             = 'GENERE',
                b.MODIFIED_BY        = NVL(V('APP_USER'), USER),
                b.MODIFIED_DATE      = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
            INSERT (INSCRIPTION_ID, TRIMESTRE_ID, TYPE_BULLETIN,
                    MOYENNE_GENERALE, TOTAL_POINTS, TOTAL_COEFFICIENTS,
                    MENTION, DATE_GENERATION, STATUT)
            VALUES (p_inscription_id, NULL, 'ANNUEL',
                    v_moyenne_gen, v_total_points, v_total_coef,
                    PKG_SS_EVALUATIONS.generer_mention(v_moyenne_gen),
                    SYSTIMESTAMP, 'GENERE');

    END generer_bulletin_annuel;

    -- =======================================================================
    -- generer_bulletins_annuels_classe
    -- =======================================================================
    PROCEDURE generer_bulletins_annuels_classe (p_classe_id IN NUMBER) IS
        v_count NUMBER := 0;
    BEGIN
        FOR rec IN (
            SELECT INSCRIPTION_ID FROM SS_INSCRIPTIONS
            WHERE CLASSE_ID = p_classe_id AND STATUT = 'ACTIVE'
        ) LOOP
            generer_bulletin_annuel(rec.INSCRIPTION_ID);
            v_count := v_count + 1;
        END LOOP;
        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' bulletins annuels générés');
    END generer_bulletins_annuels_classe;

    -- =======================================================================
    -- appliquer_decision
    -- Applique la décision du conseil de classe sur le bulletin annuel
    -- =======================================================================
    PROCEDURE appliquer_decision (
        p_bulletin_id IN NUMBER,
        p_decision    IN VARCHAR2,
        p_observation IN VARCHAR2 DEFAULT NULL
    ) IS
    BEGIN
        IF p_decision NOT IN ('ADMIS','REDOUBLANT','EXCLU','TRANSFERE') THEN
            RAISE_APPLICATION_ERROR(-20003, 
                'Décision invalide : ' || p_decision || '. Valeurs acceptées : ADMIS, REDOUBLANT, EXCLU, TRANSFERE');
        END IF;

        UPDATE SS_BULLETINS SET
            DECISION              = p_decision,
            OBSERVATION_DIRECTEUR = NVL(p_observation, OBSERVATION_DIRECTEUR),
            MODIFIED_BY           = NVL(V('APP_USER'), USER),
            MODIFIED_DATE         = SYSTIMESTAMP
        WHERE BULLETIN_ID = p_bulletin_id;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Décision "' || p_decision || '" appliquée au bulletin #' || p_bulletin_id);
    END appliquer_decision;

END PKG_SS_BULLETINS;
/

PROMPT   ✓ Corps PKG_SS_BULLETINS créé

PROMPT
PROMPT ============================================
PROMPT   ✅ PKG_SS_BULLETINS INSTALLÉ
PROMPT   - Génération bulletins trimestriels/annuels
PROMPT   - Workflow complet (valider/publier)
PROMPT   - Décisions conseil de classe
PROMPT ============================================
