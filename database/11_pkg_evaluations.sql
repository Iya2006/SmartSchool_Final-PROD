-- ============================================================================
-- SMARTSCHOOL ERP — Script 11 : PKG_SS_EVALUATIONS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Package    : PKG_SS_EVALUATIONS
-- Description: Logique métier complète pour le système de notation.
--   - Calcul des moyennes trimestrielles par matière
--   - Calcul des moyennes générales (trimestrielle / annuelle)
--   - Calcul des classements
--   - Statistiques d'évaluation (min, max, moyenne classe)
--   - Appréciations automatiques
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   PACKAGE PKG_SS_EVALUATIONS
PROMPT ============================================

-- ============================================================================
-- SPECIFICATION DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SS_EVALUATIONS AS

    -- -----------------------------------------------------------------------
    -- TYPES PERSONNALISÉS
    -- -----------------------------------------------------------------------
    TYPE t_stats_eval IS RECORD (
        moyenne_classe   NUMBER(5,2),
        note_max         NUMBER(5,2),
        note_min         NUMBER(5,2),
        nb_copies        NUMBER(4),
        nb_absents       NUMBER(4),
        ecart_type       NUMBER(5,2)
    );

    -- -----------------------------------------------------------------------
    -- PROCEDURES PUBLIQUES
    -- -----------------------------------------------------------------------

    -- Calcule les statistiques d'une évaluation (moyenne, min, max, nb copies)
    PROCEDURE calculer_stats_evaluation (
        p_evaluation_id IN NUMBER
    );

    -- Calcule la moyenne trimestrielle d'un élève pour une matière
    PROCEDURE calculer_moyenne_trim_matiere (
        p_inscription_id IN NUMBER,
        p_matiere_id     IN NUMBER,
        p_trimestre_id   IN NUMBER
    );

    -- Calcule TOUTES les moyennes trimestrielles d'une classe entière
    PROCEDURE calculer_moyennes_trim_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Calcule la moyenne générale trimestrielle d'un élève (toutes matières)
    PROCEDURE calculer_moyenne_generale_trim (
        p_inscription_id IN NUMBER,
        p_trimestre_id   IN NUMBER
    );

    -- Calcule les classements d'une classe pour un trimestre
    PROCEDURE calculer_classements (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Calcule les moyennes annuelles d'une classe
    PROCEDURE calculer_moyennes_annuelles (
        p_classe_id IN NUMBER
    );

    -- PROCÉDURE MAÎTRE : enchaîne tout le calcul pour une classe/trimestre
    PROCEDURE traitement_complet_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Génère l'appréciation automatique à partir de la moyenne
    FUNCTION generer_appreciation (
        p_moyenne IN NUMBER
    ) RETURN VARCHAR2;

    -- Génère la mention à partir de la moyenne générale
    FUNCTION generer_mention (
        p_moyenne IN NUMBER
    ) RETURN VARCHAR2;

END PKG_SS_EVALUATIONS;
/

PROMPT   ✓ Spécification PKG_SS_EVALUATIONS créée

-- ============================================================================
-- CORPS DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SS_EVALUATIONS AS

    -- =======================================================================
    -- FONCTIONS PRIVÉES
    -- =======================================================================

    -- Récupère le poids du type d'évaluation (DEVOIR=40%, COMPO=60% par défaut)
    FUNCTION get_poids_type_eval (p_type_eval_id IN NUMBER) RETURN NUMBER IS
        v_poids NUMBER(5,2);
    BEGIN
        SELECT POIDS_POURCENTAGE INTO v_poids
        FROM SS_TYPES_EVALUATION
        WHERE TYPE_EVAL_ID = p_type_eval_id;
        RETURN v_poids;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN 0;
    END;

    -- =======================================================================
    -- generer_appreciation
    -- Génère une appréciation textuelle à partir de la moyenne
    -- Barème standard guinéen
    -- =======================================================================
    FUNCTION generer_appreciation (p_moyenne IN NUMBER) RETURN VARCHAR2 IS
    BEGIN
        IF p_moyenne IS NULL THEN
            RETURN 'Non évalué';
        ELSIF p_moyenne >= 18 THEN
            RETURN 'Excellent travail, continuez ainsi';
        ELSIF p_moyenne >= 16 THEN
            RETURN 'Très bon travail';
        ELSIF p_moyenne >= 14 THEN
            RETURN 'Bon travail, résultats satisfaisants';
        ELSIF p_moyenne >= 12 THEN
            RETURN 'Assez bon travail';
        ELSIF p_moyenne >= 10 THEN
            RETURN 'Travail passable, peut mieux faire';
        ELSIF p_moyenne >= 8 THEN
            RETURN 'Travail insuffisant, des efforts à fournir';
        ELSIF p_moyenne >= 5 THEN
            RETURN 'Résultats faibles, travail très insuffisant';
        ELSE
            RETURN 'Résultats très faibles, en grande difficulté';
        END IF;
    END generer_appreciation;

    -- =======================================================================
    -- generer_mention
    -- Génère la mention officielle
    -- =======================================================================
    FUNCTION generer_mention (p_moyenne IN NUMBER) RETURN VARCHAR2 IS
    BEGIN
        IF p_moyenne IS NULL THEN
            RETURN NULL;
        ELSIF p_moyenne >= 16 THEN
            RETURN 'EXCELLENT';
        ELSIF p_moyenne >= 14 THEN
            RETURN 'TRES_BIEN';
        ELSIF p_moyenne >= 12 THEN
            RETURN 'BIEN';
        ELSIF p_moyenne >= 10 THEN
            RETURN 'ASSEZ_BIEN';
        ELSIF p_moyenne >= 8 THEN
            RETURN 'PASSABLE';
        ELSIF p_moyenne >= 5 THEN
            RETURN 'INSUFFISANT';
        ELSE
            RETURN 'MEDIOCRE';
        END IF;
    END generer_mention;

    -- =======================================================================
    -- calculer_stats_evaluation
    -- Met à jour les statistiques d'une évaluation
    -- =======================================================================
    PROCEDURE calculer_stats_evaluation (p_evaluation_id IN NUMBER) IS
        v_stats t_stats_eval;
    BEGIN
        SELECT 
            ROUND(AVG(n.VALEUR), 2),
            MAX(n.VALEUR),
            MIN(n.VALEUR),
            COUNT(CASE WHEN n.EST_ABSENT = 'N' THEN 1 END),
            COUNT(CASE WHEN n.EST_ABSENT = 'O' THEN 1 END),
            ROUND(STDDEV(n.VALEUR), 2)
        INTO 
            v_stats.moyenne_classe,
            v_stats.note_max,
            v_stats.note_min,
            v_stats.nb_copies,
            v_stats.nb_absents,
            v_stats.ecart_type
        FROM SS_NOTES n
        WHERE n.EVALUATION_ID = p_evaluation_id
        AND n.EST_ABSENT = 'N'
        AND n.EST_DISPENSE = 'N';

        UPDATE SS_EVALUATIONS SET
            MOYENNE_CLASSE      = v_stats.moyenne_classe,
            NOTE_MAX            = v_stats.note_max,
            NOTE_MIN            = v_stats.note_min,
            NB_COPIES_CORRIGEES = v_stats.nb_copies,
            NB_ABSENTS          = v_stats.nb_absents
        WHERE EVALUATION_ID = p_evaluation_id;

        DBMS_OUTPUT.PUT_LINE('  Stats évaluation #' || p_evaluation_id || 
            ' : moy=' || v_stats.moyenne_classe || 
            ' max=' || v_stats.note_max || 
            ' min=' || v_stats.note_min);
    END calculer_stats_evaluation;

    -- =======================================================================
    -- calculer_moyenne_trim_matiere
    -- Calcule la moyenne trimestrielle d'un élève pour UNE matière
    -- Formule : (Moyenne_Devoirs × Poids_Devoir + Note_Compo × Poids_Compo) / 100
    -- =======================================================================
    PROCEDURE calculer_moyenne_trim_matiere (
        p_inscription_id IN NUMBER,
        p_matiere_id     IN NUMBER,
        p_trimestre_id   IN NUMBER
    ) IS
        v_moyenne_devoirs   NUMBER(5,2);
        v_note_compo        NUMBER(5,2);
        v_poids_devoir      NUMBER(5,2);
        v_poids_compo       NUMBER(5,2);
        v_moyenne_finale    NUMBER(5,2);
        v_coefficient       NUMBER(3,1);
        v_points            NUMBER(7,2);
        v_nb_devoirs        NUMBER;
        v_nb_compos         NUMBER;
    BEGIN
        -- Récupérer le coefficient de la matière
        SELECT NVL(m.COEFFICIENT_DEFAUT, 1) INTO v_coefficient
        FROM SS_MATIERES m WHERE m.MATIERE_ID = p_matiere_id;

        -- Calculer la moyenne des devoirs
        SELECT ROUND(AVG(n.NOTE_RAMENEE_20), 2), COUNT(*)
        INTO v_moyenne_devoirs, v_nb_devoirs
        FROM SS_NOTES n
        JOIN SS_EVALUATIONS ev ON n.EVALUATION_ID = ev.EVALUATION_ID
        JOIN SS_TYPES_EVALUATION te ON ev.TYPE_EVAL_ID = te.TYPE_EVAL_ID
        WHERE n.INSCRIPTION_ID = p_inscription_id
        AND ev.MATIERE_ID = p_matiere_id
        AND ev.TRIMESTRE_ID = p_trimestre_id
        AND te.CODE = 'DEVOIR'
        AND n.EST_ABSENT = 'N'
        AND n.EST_DISPENSE = 'N';

        -- Calculer la note de composition
        SELECT ROUND(AVG(n.NOTE_RAMENEE_20), 2), COUNT(*)
        INTO v_note_compo, v_nb_compos
        FROM SS_NOTES n
        JOIN SS_EVALUATIONS ev ON n.EVALUATION_ID = ev.EVALUATION_ID
        JOIN SS_TYPES_EVALUATION te ON ev.TYPE_EVAL_ID = te.TYPE_EVAL_ID
        WHERE n.INSCRIPTION_ID = p_inscription_id
        AND ev.MATIERE_ID = p_matiere_id
        AND ev.TRIMESTRE_ID = p_trimestre_id
        AND te.CODE = 'COMPO'
        AND n.EST_ABSENT = 'N'
        AND n.EST_DISPENSE = 'N';

        -- Récupérer les poids
        BEGIN
            SELECT POIDS_POURCENTAGE INTO v_poids_devoir
            FROM SS_TYPES_EVALUATION WHERE CODE = 'DEVOIR';
        EXCEPTION WHEN NO_DATA_FOUND THEN v_poids_devoir := 40;
        END;
        BEGIN
            SELECT POIDS_POURCENTAGE INTO v_poids_compo
            FROM SS_TYPES_EVALUATION WHERE CODE = 'COMPO';
        EXCEPTION WHEN NO_DATA_FOUND THEN v_poids_compo := 60;
        END;

        -- Calculer la moyenne pondérée
        IF v_nb_devoirs > 0 AND v_nb_compos > 0 THEN
            v_moyenne_finale := ROUND(
                (v_moyenne_devoirs * v_poids_devoir + v_note_compo * v_poids_compo) / 
                (v_poids_devoir + v_poids_compo), 2);
        ELSIF v_nb_devoirs > 0 THEN
            v_moyenne_finale := v_moyenne_devoirs;
        ELSIF v_nb_compos > 0 THEN
            v_moyenne_finale := v_note_compo;
        ELSE
            RETURN; -- Aucune note, on ne calcule pas
        END IF;

        v_points := ROUND(v_moyenne_finale * v_coefficient, 2);

        -- Insérer ou mettre à jour dans SS_MOYENNES_TRIM (MERGE)
        MERGE INTO SS_MOYENNES_TRIM mt
        USING (SELECT p_inscription_id AS insc_id, 
                      p_matiere_id AS mat_id, 
                      p_trimestre_id AS trim_id FROM DUAL) src
        ON (mt.INSCRIPTION_ID = src.insc_id 
            AND mt.MATIERE_ID = src.mat_id 
            AND mt.TRIMESTRE_ID = src.trim_id)
        WHEN MATCHED THEN
            UPDATE SET 
                MOYENNE_DEVOIRS  = v_moyenne_devoirs,
                NOTE_COMPOSITION = v_note_compo,
                MOYENNE          = v_moyenne_finale,
                COEFFICIENT      = v_coefficient,
                POINTS           = v_points,
                APPRECIATION     = generer_appreciation(v_moyenne_finale),
                MODIFIED_BY      = NVL(V('APP_USER'), USER),
                MODIFIED_DATE    = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
            INSERT (INSCRIPTION_ID, MATIERE_ID, TRIMESTRE_ID,
                    MOYENNE_DEVOIRS, NOTE_COMPOSITION,
                    MOYENNE, COEFFICIENT, POINTS, APPRECIATION)
            VALUES (p_inscription_id, p_matiere_id, p_trimestre_id,
                    v_moyenne_devoirs, v_note_compo,
                    v_moyenne_finale, v_coefficient, v_points,
                    generer_appreciation(v_moyenne_finale));

    END calculer_moyenne_trim_matiere;

    -- =======================================================================
    -- calculer_moyennes_trim_classe
    -- Calcule les moyennes trimestrielles pour TOUS les élèves d'une classe
    -- =======================================================================
    PROCEDURE calculer_moyennes_trim_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_count NUMBER := 0;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('── Calcul moyennes trimestrielles ──');
        DBMS_OUTPUT.PUT_LINE('   Classe #' || p_classe_id || ', Trimestre #' || p_trimestre_id);

        -- Pour chaque élève inscrit et chaque matière affectée
        FOR rec IN (
            SELECT DISTINCT 
                i.INSCRIPTION_ID,
                af.MATIERE_ID
            FROM SS_INSCRIPTIONS i
            JOIN SS_AFFECTATIONS af ON af.CLASSE_ID = i.CLASSE_ID 
                                    AND af.ANNEE_ID = i.ANNEE_ID
                                    AND af.STATUT = 'ACTIVE'
            WHERE i.CLASSE_ID = p_classe_id
            AND i.STATUT = 'ACTIVE'
        ) LOOP
            calculer_moyenne_trim_matiere(
                rec.INSCRIPTION_ID, rec.MATIERE_ID, p_trimestre_id);
            v_count := v_count + 1;
        END LOOP;

        -- Calculer les rangs par matière
        MERGE INTO SS_MOYENNES_TRIM mt
        USING (
            SELECT MOYENNE_TRIM_ID,
                   RANK() OVER (PARTITION BY MATIERE_ID, TRIMESTRE_ID 
                                ORDER BY MOYENNE DESC) AS rang_calc,
                   AVG(MOYENNE) OVER (PARTITION BY MATIERE_ID, TRIMESTRE_ID) AS moy_classe,
                   MAX(MOYENNE) OVER (PARTITION BY MATIERE_ID, TRIMESTRE_ID) AS max_note,
                   MIN(MOYENNE) OVER (PARTITION BY MATIERE_ID, TRIMESTRE_ID) AS min_note
            FROM SS_MOYENNES_TRIM
            WHERE TRIMESTRE_ID = p_trimestre_id
            AND INSCRIPTION_ID IN (
                SELECT INSCRIPTION_ID FROM SS_INSCRIPTIONS 
                WHERE CLASSE_ID = p_classe_id AND STATUT = 'ACTIVE')
        ) calc
        ON (mt.MOYENNE_TRIM_ID = calc.MOYENNE_TRIM_ID)
        WHEN MATCHED THEN
            UPDATE SET 
                mt.RANG = calc.rang_calc,
                mt.MOYENNE_CLASSE = ROUND(calc.moy_classe, 2),
                mt.NOTE_MAX = calc.max_note,
                mt.NOTE_MIN = calc.min_note;

        DBMS_OUTPUT.PUT_LINE('   ✓ ' || v_count || ' moyennes matière calculées');
    END calculer_moyennes_trim_classe;

    -- =======================================================================
    -- calculer_moyenne_generale_trim
    -- Calcule la moyenne générale trimestrielle d'un élève
    -- Formule : Σ(Moyenne × Coefficient) / Σ(Coefficients)
    -- =======================================================================
    PROCEDURE calculer_moyenne_generale_trim (
        p_inscription_id IN NUMBER,
        p_trimestre_id   IN NUMBER
    ) IS
        v_total_points   NUMBER(8,2);
        v_total_coef     NUMBER(5,1);
        v_moyenne_gen    NUMBER(5,2);
    BEGIN
        SELECT NVL(SUM(POINTS), 0), NVL(SUM(COEFFICIENT), 0)
        INTO v_total_points, v_total_coef
        FROM SS_MOYENNES_TRIM
        WHERE INSCRIPTION_ID = p_inscription_id
        AND TRIMESTRE_ID = p_trimestre_id;

        IF v_total_coef > 0 THEN
            v_moyenne_gen := ROUND(v_total_points / v_total_coef, 2);
        ELSE
            v_moyenne_gen := NULL;
        END IF;

        -- Mettre à jour ou créer le bulletin
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
                b.MENTION            = generer_mention(v_moyenne_gen),
                b.STATUT             = CASE WHEN b.STATUT = 'BROUILLON' THEN 'GENERE' 
                                            ELSE b.STATUT END,
                b.DATE_GENERATION    = SYSTIMESTAMP,
                b.MODIFIED_BY        = NVL(V('APP_USER'), USER),
                b.MODIFIED_DATE      = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
            INSERT (INSCRIPTION_ID, TRIMESTRE_ID, TYPE_BULLETIN,
                    MOYENNE_GENERALE, TOTAL_POINTS, TOTAL_COEFFICIENTS,
                    MENTION, DATE_GENERATION, STATUT)
            VALUES (p_inscription_id, p_trimestre_id, 'TRIMESTRIEL',
                    v_moyenne_gen, v_total_points, v_total_coef,
                    generer_mention(v_moyenne_gen), SYSTIMESTAMP, 'GENERE');

    END calculer_moyenne_generale_trim;

    -- =======================================================================
    -- calculer_classements
    -- Calcule les rangs de tous les élèves d'une classe pour un trimestre
    -- =======================================================================
    PROCEDURE calculer_classements (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_effectif NUMBER;
        v_moy_classe NUMBER(5,2);
        v_moy_premier NUMBER(5,2);
        v_moy_dernier NUMBER(5,2);
        v_count NUMBER := 0;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('── Calcul des classements ──');

        -- Compter l'effectif et stats classe
        SELECT COUNT(*), 
               ROUND(AVG(MOYENNE_GENERALE), 2),
               MAX(MOYENNE_GENERALE),
               MIN(MOYENNE_GENERALE)
        INTO v_effectif, v_moy_classe, v_moy_premier, v_moy_dernier
        FROM SS_BULLETINS b
        JOIN SS_INSCRIPTIONS i ON b.INSCRIPTION_ID = i.INSCRIPTION_ID
        WHERE i.CLASSE_ID = p_classe_id
        AND i.STATUT = 'ACTIVE'
        AND b.TRIMESTRE_ID = p_trimestre_id
        AND b.TYPE_BULLETIN = 'TRIMESTRIEL'
        AND b.MOYENNE_GENERALE IS NOT NULL;

        -- Mettre à jour les bulletins avec rang et stats
        FOR rec IN (
            SELECT b.BULLETIN_ID, b.INSCRIPTION_ID, b.MOYENNE_GENERALE,
                   RANK() OVER (ORDER BY b.MOYENNE_GENERALE DESC) AS rang_calc
            FROM SS_BULLETINS b
            JOIN SS_INSCRIPTIONS i ON b.INSCRIPTION_ID = i.INSCRIPTION_ID
            WHERE i.CLASSE_ID = p_classe_id
            AND i.STATUT = 'ACTIVE'
            AND b.TRIMESTRE_ID = p_trimestre_id
            AND b.TYPE_BULLETIN = 'TRIMESTRIEL'
            AND b.MOYENNE_GENERALE IS NOT NULL
            ORDER BY b.MOYENNE_GENERALE DESC
        ) LOOP
            UPDATE SS_BULLETINS SET
                RANG             = rec.rang_calc,
                EFFECTIF_CLASSE  = v_effectif,
                MOYENNE_CLASSE   = v_moy_classe,
                MOYENNE_PREMIER  = v_moy_premier,
                MOYENNE_DERNIER  = v_moy_dernier
            WHERE BULLETIN_ID = rec.BULLETIN_ID;

            -- Insérer / mettre à jour le classement
            MERGE INTO SS_CLASSEMENTS cl
            USING (SELECT rec.INSCRIPTION_ID AS insc_id, 
                          p_trimestre_id AS trim_id FROM DUAL) src
            ON (cl.INSCRIPTION_ID = src.insc_id 
                AND cl.TRIMESTRE_ID = src.trim_id 
                AND cl.TYPE_CLASSEMENT = 'TRIMESTRIEL')
            WHEN MATCHED THEN
                UPDATE SET 
                    cl.MOYENNE_GENERALE  = rec.MOYENNE_GENERALE,
                    cl.RANG              = rec.rang_calc,
                    cl.EFFECTIF_CLASSE   = v_effectif,
                    cl.MOYENNE_CLASSE    = v_moy_classe,
                    cl.MENTION           = generer_mention(rec.MOYENNE_GENERALE)
            WHEN NOT MATCHED THEN
                INSERT (INSCRIPTION_ID, TRIMESTRE_ID, TYPE_CLASSEMENT,
                        MOYENNE_GENERALE, RANG, EFFECTIF_CLASSE,
                        MOYENNE_CLASSE, MENTION)
                VALUES (rec.INSCRIPTION_ID, p_trimestre_id, 'TRIMESTRIEL',
                        rec.MOYENNE_GENERALE, rec.rang_calc, v_effectif,
                        v_moy_classe, generer_mention(rec.MOYENNE_GENERALE));

            v_count := v_count + 1;
        END LOOP;

        DBMS_OUTPUT.PUT_LINE('   ✓ ' || v_count || ' classements calculés');
        DBMS_OUTPUT.PUT_LINE('   Moy. classe: ' || v_moy_classe || 
                             ' | 1er: ' || v_moy_premier || 
                             ' | Dernier: ' || v_moy_dernier);
    END calculer_classements;

    -- =======================================================================
    -- calculer_moyennes_annuelles
    -- Calcule les moyennes annuelles = moyenne des 3 trimestres
    -- =======================================================================
    PROCEDURE calculer_moyennes_annuelles (p_classe_id IN NUMBER) IS
        v_count NUMBER := 0;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('── Calcul moyennes annuelles ──');

        FOR rec IN (
            SELECT 
                i.INSCRIPTION_ID,
                mt.MATIERE_ID,
                mt.COEFFICIENT,
                MAX(CASE WHEN t.NUMERO = 1 THEN mt.MOYENNE END) AS moy_t1,
                MAX(CASE WHEN t.NUMERO = 2 THEN mt.MOYENNE END) AS moy_t2,
                MAX(CASE WHEN t.NUMERO = 3 THEN mt.MOYENNE END) AS moy_t3,
                ROUND(AVG(mt.MOYENNE), 2) AS moyenne_annuelle
            FROM SS_MOYENNES_TRIM mt
            JOIN SS_INSCRIPTIONS i ON mt.INSCRIPTION_ID = i.INSCRIPTION_ID
            JOIN SS_TRIMESTRES t ON mt.TRIMESTRE_ID = t.TRIMESTRE_ID
            WHERE i.CLASSE_ID = p_classe_id
            AND i.STATUT = 'ACTIVE'
            GROUP BY i.INSCRIPTION_ID, mt.MATIERE_ID, mt.COEFFICIENT
            HAVING COUNT(mt.TRIMESTRE_ID) >= 2  -- Au moins 2 trimestres
        ) LOOP
            MERGE INTO SS_MOYENNES_ANNUELLES ma
            USING (SELECT rec.INSCRIPTION_ID AS insc_id, 
                          rec.MATIERE_ID AS mat_id FROM DUAL) src
            ON (ma.INSCRIPTION_ID = src.insc_id AND ma.MATIERE_ID = src.mat_id)
            WHEN MATCHED THEN
                UPDATE SET 
                    MOYENNE_T1       = rec.moy_t1,
                    MOYENNE_T2       = rec.moy_t2,
                    MOYENNE_T3       = rec.moy_t3,
                    MOYENNE_ANNUELLE = rec.moyenne_annuelle,
                    COEFFICIENT      = rec.coefficient,
                    POINTS_ANNUELS   = ROUND(rec.moyenne_annuelle * rec.coefficient, 2),
                    APPRECIATION     = generer_appreciation(rec.moyenne_annuelle),
                    MODIFIED_BY      = NVL(V('APP_USER'), USER),
                    MODIFIED_DATE    = SYSTIMESTAMP
            WHEN NOT MATCHED THEN
                INSERT (INSCRIPTION_ID, MATIERE_ID,
                        MOYENNE_T1, MOYENNE_T2, MOYENNE_T3,
                        MOYENNE_ANNUELLE, COEFFICIENT, POINTS_ANNUELS, APPRECIATION)
                VALUES (rec.INSCRIPTION_ID, rec.MATIERE_ID,
                        rec.moy_t1, rec.moy_t2, rec.moy_t3,
                        rec.moyenne_annuelle, rec.coefficient,
                        ROUND(rec.moyenne_annuelle * rec.coefficient, 2),
                        generer_appreciation(rec.moyenne_annuelle));

            v_count := v_count + 1;
        END LOOP;

        -- Calculer les rangs annuels
        MERGE INTO SS_MOYENNES_ANNUELLES ma
        USING (
            SELECT MOYENNE_ANN_ID,
                   RANK() OVER (PARTITION BY MATIERE_ID 
                                ORDER BY MOYENNE_ANNUELLE DESC) AS rang_calc
            FROM SS_MOYENNES_ANNUELLES
            WHERE INSCRIPTION_ID IN (
                SELECT INSCRIPTION_ID FROM SS_INSCRIPTIONS 
                WHERE CLASSE_ID = p_classe_id AND STATUT = 'ACTIVE')
        ) calc
        ON (ma.MOYENNE_ANN_ID = calc.MOYENNE_ANN_ID)
        WHEN MATCHED THEN
            UPDATE SET ma.RANG_ANNUEL = calc.rang_calc;

        DBMS_OUTPUT.PUT_LINE('   ✓ ' || v_count || ' moyennes annuelles calculées');
    END calculer_moyennes_annuelles;

    -- =======================================================================
    -- traitement_complet_classe
    -- PROCÉDURE MAÎTRE : enchaîne tout le calcul pour une classe/trimestre
    -- =======================================================================
    PROCEDURE traitement_complet_classe (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_code_classe VARCHAR2(30);
        v_code_trim   VARCHAR2(10);
        v_debut       TIMESTAMP := SYSTIMESTAMP;
    BEGIN
        -- Récupérer les libellés
        SELECT CODE INTO v_code_classe FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;
        SELECT CODE INTO v_code_trim FROM SS_TRIMESTRES WHERE TRIMESTRE_ID = p_trimestre_id;

        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('╔══════════════════════════════════════════════════╗');
        DBMS_OUTPUT.PUT_LINE('║  TRAITEMENT COMPLET : ' || v_code_classe || ' — ' || v_code_trim);
        DBMS_OUTPUT.PUT_LINE('╚══════════════════════════════════════════════════╝');

        -- Étape 1 : Stats de chaque évaluation
        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('▸ Étape 1/4 — Statistiques des évaluations');
        FOR rec IN (
            SELECT EVALUATION_ID FROM SS_EVALUATIONS
            WHERE CLASSE_ID = p_classe_id AND TRIMESTRE_ID = p_trimestre_id
        ) LOOP
            calculer_stats_evaluation(rec.EVALUATION_ID);
        END LOOP;

        -- Étape 2 : Moyennes trimestrielles par matière
        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('▸ Étape 2/4 — Moyennes trimestrielles par matière');
        calculer_moyennes_trim_classe(p_classe_id, p_trimestre_id);

        -- Étape 3 : Moyennes générales
        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('▸ Étape 3/4 — Moyennes générales');
        FOR rec IN (
            SELECT INSCRIPTION_ID FROM SS_INSCRIPTIONS
            WHERE CLASSE_ID = p_classe_id AND STATUT = 'ACTIVE'
        ) LOOP
            calculer_moyenne_generale_trim(rec.INSCRIPTION_ID, p_trimestre_id);
        END LOOP;

        -- Étape 4 : Classements
        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('▸ Étape 4/4 — Classements');
        calculer_classements(p_classe_id, p_trimestre_id);

        COMMIT;

        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('✅ Traitement terminé en ' || 
            ROUND(EXTRACT(SECOND FROM (SYSTIMESTAMP - v_debut)), 2) || ' secondes');
        DBMS_OUTPUT.PUT_LINE('');

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            DBMS_OUTPUT.PUT_LINE('❌ ERREUR : ' || SQLERRM);
            RAISE;
    END traitement_complet_classe;

END PKG_SS_EVALUATIONS;
/

PROMPT   ✓ Corps PKG_SS_EVALUATIONS créé

PROMPT
PROMPT ============================================
PROMPT   ✅ PKG_SS_EVALUATIONS INSTALLÉ
PROMPT   - Calcul moyennes trimestrielles/annuelles 
PROMPT   - Classements automatiques
PROMPT   - Appréciations et mentions
PROMPT ============================================
