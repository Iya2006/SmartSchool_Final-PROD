-- ============================================================================
-- SMARTSCHOOL ERP — Script 15 : PKG_SS_PRESENCES
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Package    : PKG_SS_PRESENCES
-- Description: Gestion complète des présences/absences.
--   - Appel par classe (matin / après-midi)
--   - Justification des absences
--   - Alertes automatiques pour absences répétées
--   - Statistiques de présence par élève / classe
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   PACKAGE PKG_SS_PRESENCES
PROMPT ============================================

-- ============================================================================
-- SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SS_PRESENCES AS

    -- Enregistre la présence d'un élève (appel unitaire)
    PROCEDURE enregistrer_presence (
        p_inscription_id   IN NUMBER,
        p_date             IN DATE,
        p_demi_journee     IN VARCHAR2,
        p_statut           IN VARCHAR2,
        p_heure_arrivee    IN VARCHAR2 DEFAULT NULL,
        p_saisi_par        IN VARCHAR2 DEFAULT NULL
    );

    -- Appel complet d'une classe (tous présents sauf exceptions)
    PROCEDURE appel_classe (
        p_classe_id     IN NUMBER,
        p_date          IN DATE,
        p_demi_journee  IN VARCHAR2,
        p_saisi_par     IN VARCHAR2 DEFAULT NULL
    );

    -- Marque un élève absent
    PROCEDURE marquer_absent (
        p_inscription_id IN NUMBER,
        p_date           IN DATE,
        p_demi_journee   IN VARCHAR2,
        p_saisi_par      IN VARCHAR2 DEFAULT NULL
    );

    -- Justifie une absence
    PROCEDURE justifier_absence (
        p_presence_id   IN NUMBER,
        p_motif         IN VARCHAR2,
        p_justificatif  IN VARCHAR2 DEFAULT NULL
    );

    -- Vérifie les absences répétées et retourne les alertes
    PROCEDURE detecter_absences_repetees (
        p_classe_id    IN NUMBER,
        p_seuil_alerte IN NUMBER DEFAULT 3,
        p_nb_jours     IN NUMBER DEFAULT 30
    );

    -- Statistiques de présence d'un élève sur un trimestre
    PROCEDURE stats_presence_eleve (
        p_inscription_id IN NUMBER,
        p_trimestre_id   IN NUMBER,
        p_nb_presents    OUT NUMBER,
        p_nb_absents     OUT NUMBER,
        p_nb_retards     OUT NUMBER,
        p_nb_justifies   OUT NUMBER,
        p_taux_presence  OUT NUMBER
    );

    -- Statistiques de présence d'une classe pour une date
    PROCEDURE stats_presence_classe (
        p_classe_id    IN NUMBER,
        p_date         IN DATE,
        p_demi_journee IN VARCHAR2
    );

    -- Taux de présence global d'une classe sur une période
    FUNCTION taux_presence_classe (
        p_classe_id  IN NUMBER,
        p_date_debut IN DATE,
        p_date_fin   IN DATE
    ) RETURN NUMBER;

END PKG_SS_PRESENCES;
/

PROMPT   ✓ Spécification PKG_SS_PRESENCES créée

-- ============================================================================
-- CORPS DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SS_PRESENCES AS

    -- =======================================================================
    -- enregistrer_presence
    -- =======================================================================
    PROCEDURE enregistrer_presence (
        p_inscription_id   IN NUMBER,
        p_date             IN DATE,
        p_demi_journee     IN VARCHAR2,
        p_statut           IN VARCHAR2,
        p_heure_arrivee    IN VARCHAR2 DEFAULT NULL,
        p_saisi_par        IN VARCHAR2 DEFAULT NULL
    ) IS
        v_retard_min NUMBER;
    BEGIN
        -- Calculer le retard si applicable
        IF p_statut = 'RETARD' AND p_heure_arrivee IS NOT NULL THEN
            IF p_demi_journee = 'MATIN' THEN
                -- Référence : 08h00
                v_retard_min := (TO_NUMBER(SUBSTR(p_heure_arrivee, 1, 2)) - 8) * 60 
                              + TO_NUMBER(SUBSTR(p_heure_arrivee, 4, 2));
                IF v_retard_min < 0 THEN v_retard_min := 0; END IF;
            ELSE
                -- Référence : 14h00
                v_retard_min := (TO_NUMBER(SUBSTR(p_heure_arrivee, 1, 2)) - 14) * 60 
                              + TO_NUMBER(SUBSTR(p_heure_arrivee, 4, 2));
                IF v_retard_min < 0 THEN v_retard_min := 0; END IF;
            END IF;
        END IF;

        -- Insérer ou mettre à jour (MERGE)
        MERGE INTO SS_PRESENCES pr
        USING (SELECT p_inscription_id AS insc_id, 
                      p_date AS dt, 
                      p_demi_journee AS dj FROM DUAL) src
        ON (pr.INSCRIPTION_ID = src.insc_id 
            AND pr.DATE_PRESENCE = src.dt 
            AND pr.DEMI_JOURNEE = src.dj)
        WHEN MATCHED THEN
            UPDATE SET 
                pr.STATUT_PRESENCE  = p_statut,
                pr.HEURE_ARRIVEE   = p_heure_arrivee,
                pr.DUREE_RETARD_MIN = v_retard_min,
                pr.MODIFIED_BY     = NVL(p_saisi_par, NVL(V('APP_USER'), USER)),
                pr.MODIFIED_DATE   = SYSTIMESTAMP
        WHEN NOT MATCHED THEN
            INSERT (INSCRIPTION_ID, DATE_PRESENCE, DEMI_JOURNEE,
                    STATUT_PRESENCE, HEURE_ARRIVEE, DUREE_RETARD_MIN,
                    SAISI_PAR)
            VALUES (p_inscription_id, p_date, p_demi_journee,
                    p_statut, p_heure_arrivee, v_retard_min,
                    NVL(p_saisi_par, NVL(V('APP_USER'), USER)));

    END enregistrer_presence;

    -- =======================================================================
    -- appel_classe
    -- Marque tous les élèves comme présents (l'enseignant modifie ensuite les absents)
    -- =======================================================================
    PROCEDURE appel_classe (
        p_classe_id     IN NUMBER,
        p_date          IN DATE,
        p_demi_journee  IN VARCHAR2,
        p_saisi_par     IN VARCHAR2 DEFAULT NULL
    ) IS
        v_count NUMBER := 0;
    BEGIN
        FOR rec IN (
            SELECT INSCRIPTION_ID FROM SS_INSCRIPTIONS
            WHERE CLASSE_ID = p_classe_id AND STATUT = 'ACTIVE'
        ) LOOP
            enregistrer_presence(
                rec.INSCRIPTION_ID, p_date, p_demi_journee,
                'PRESENT', NULL, p_saisi_par);
            v_count := v_count + 1;
        END LOOP;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Appel classe #' || p_classe_id || ' : ' || 
                             v_count || ' élèves marqués PRESENT (' || 
                             p_demi_journee || ')');
    END appel_classe;

    -- =======================================================================
    -- marquer_absent
    -- =======================================================================
    PROCEDURE marquer_absent (
        p_inscription_id IN NUMBER,
        p_date           IN DATE,
        p_demi_journee   IN VARCHAR2,
        p_saisi_par      IN VARCHAR2 DEFAULT NULL
    ) IS
    BEGIN
        enregistrer_presence(
            p_inscription_id, p_date, p_demi_journee,
            'ABSENT', NULL, p_saisi_par);
    END marquer_absent;

    -- =======================================================================
    -- justifier_absence
    -- =======================================================================
    PROCEDURE justifier_absence (
        p_presence_id   IN NUMBER,
        p_motif         IN VARCHAR2,
        p_justificatif  IN VARCHAR2 DEFAULT NULL
    ) IS
    BEGIN
        UPDATE SS_PRESENCES SET
            EST_JUSTIFIE       = 'O',
            MOTIF              = p_motif,
            JUSTIFICATIF_URL   = p_justificatif,
            DATE_JUSTIFICATION = SYSDATE,
            MODIFIED_BY        = NVL(V('APP_USER'), USER),
            MODIFIED_DATE      = SYSTIMESTAMP
        WHERE PRESENCE_ID = p_presence_id
        AND STATUT_PRESENCE IN ('ABSENT','RETARD');

        IF SQL%ROWCOUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20030, 
                'Présence non trouvée ou non justifiable (ID: ' || p_presence_id || ')');
        END IF;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Absence #' || p_presence_id || ' justifiée : ' || p_motif);
    END justifier_absence;

    -- =======================================================================
    -- detecter_absences_repetees
    -- Détecte les élèves avec des absences répétées sur une période
    -- =======================================================================
    PROCEDURE detecter_absences_repetees (
        p_classe_id    IN NUMBER,
        p_seuil_alerte IN NUMBER DEFAULT 3,
        p_nb_jours     IN NUMBER DEFAULT 30
    ) IS
        v_found BOOLEAN := FALSE;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('');
        DBMS_OUTPUT.PUT_LINE('╔══════════════════════════════════════════════════╗');
        DBMS_OUTPUT.PUT_LINE('║  🚨 ALERTES ABSENCES — Seuil: ' || p_seuil_alerte || ' sur ' || p_nb_jours || ' jours');
        DBMS_OUTPUT.PUT_LINE('╚══════════════════════════════════════════════════╝');

        FOR rec IN (
            SELECT 
                e.NOM || ' ' || e.PRENOM AS nom_eleve,
                e.MATRICULE,
                COUNT(*) AS nb_absences,
                COUNT(CASE WHEN pr.EST_JUSTIFIE = 'N' THEN 1 END) AS nb_non_justifiees
            FROM SS_PRESENCES pr
            JOIN SS_INSCRIPTIONS i ON pr.INSCRIPTION_ID = i.INSCRIPTION_ID
            JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
            WHERE i.CLASSE_ID = p_classe_id
            AND i.STATUT = 'ACTIVE'
            AND pr.STATUT_PRESENCE = 'ABSENT'
            AND pr.DATE_PRESENCE >= SYSDATE - p_nb_jours
            GROUP BY e.NOM, e.PRENOM, e.MATRICULE
            HAVING COUNT(*) >= p_seuil_alerte
            ORDER BY COUNT(*) DESC
        ) LOOP
            v_found := TRUE;
            DBMS_OUTPUT.PUT_LINE('  ⚠ ' || rec.nom_eleve || 
                                 ' (' || rec.MATRICULE || ') : ' || 
                                 rec.nb_absences || ' absences dont ' || 
                                 rec.nb_non_justifiees || ' non justifiées');
        END LOOP;

        IF NOT v_found THEN
            DBMS_OUTPUT.PUT_LINE('  ✓ Aucune alerte — Tous les élèves sont en règle');
        END IF;
    END detecter_absences_repetees;

    -- =======================================================================
    -- stats_presence_eleve
    -- =======================================================================
    PROCEDURE stats_presence_eleve (
        p_inscription_id IN NUMBER,
        p_trimestre_id   IN NUMBER,
        p_nb_presents    OUT NUMBER,
        p_nb_absents     OUT NUMBER,
        p_nb_retards     OUT NUMBER,
        p_nb_justifies   OUT NUMBER,
        p_taux_presence  OUT NUMBER
    ) IS
        v_total NUMBER;
        v_date_debut DATE;
        v_date_fin   DATE;
    BEGIN
        -- Récupérer les dates du trimestre
        SELECT DATE_DEBUT, DATE_FIN INTO v_date_debut, v_date_fin
        FROM SS_TRIMESTRES WHERE TRIMESTRE_ID = p_trimestre_id;

        SELECT 
            COUNT(CASE WHEN STATUT_PRESENCE = 'PRESENT' THEN 1 END),
            COUNT(CASE WHEN STATUT_PRESENCE = 'ABSENT' THEN 1 END),
            COUNT(CASE WHEN STATUT_PRESENCE = 'RETARD' THEN 1 END),
            COUNT(CASE WHEN EST_JUSTIFIE = 'O' THEN 1 END),
            COUNT(*)
        INTO p_nb_presents, p_nb_absents, p_nb_retards, p_nb_justifies, v_total
        FROM SS_PRESENCES
        WHERE INSCRIPTION_ID = p_inscription_id
        AND DATE_PRESENCE BETWEEN v_date_debut AND v_date_fin;

        IF v_total > 0 THEN
            p_taux_presence := ROUND(p_nb_presents / v_total * 100, 1);
        ELSE
            p_taux_presence := 100;
        END IF;
    END stats_presence_eleve;

    -- =======================================================================
    -- stats_presence_classe
    -- =======================================================================
    PROCEDURE stats_presence_classe (
        p_classe_id    IN NUMBER,
        p_date         IN DATE,
        p_demi_journee IN VARCHAR2
    ) IS
        v_effectif  NUMBER;
        v_presents  NUMBER;
        v_absents   NUMBER;
        v_retards   NUMBER;
    BEGIN
        SELECT NVL(EFFECTIF_ACTUEL, 0) INTO v_effectif
        FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;

        SELECT 
            COUNT(CASE WHEN STATUT_PRESENCE = 'PRESENT' THEN 1 END),
            COUNT(CASE WHEN STATUT_PRESENCE = 'ABSENT' THEN 1 END),
            COUNT(CASE WHEN STATUT_PRESENCE = 'RETARD' THEN 1 END)
        INTO v_presents, v_absents, v_retards
        FROM SS_PRESENCES pr
        JOIN SS_INSCRIPTIONS i ON pr.INSCRIPTION_ID = i.INSCRIPTION_ID
        WHERE i.CLASSE_ID = p_classe_id
        AND pr.DATE_PRESENCE = p_date
        AND pr.DEMI_JOURNEE = p_demi_journee;

        DBMS_OUTPUT.PUT_LINE('═══ Présences ' || TO_CHAR(p_date, 'DD/MM/YYYY') || ' ' || p_demi_journee || ' ═══');
        DBMS_OUTPUT.PUT_LINE('Effectif  : ' || v_effectif);
        DBMS_OUTPUT.PUT_LINE('Présents  : ' || v_presents);
        DBMS_OUTPUT.PUT_LINE('Absents   : ' || v_absents);
        DBMS_OUTPUT.PUT_LINE('Retards   : ' || v_retards);
        DBMS_OUTPUT.PUT_LINE('Taux      : ' || 
            CASE WHEN v_effectif > 0 
                 THEN ROUND(v_presents / v_effectif * 100, 1) || '%'
                 ELSE 'N/A' END);
    END stats_presence_classe;

    -- =======================================================================
    -- taux_presence_classe
    -- =======================================================================
    FUNCTION taux_presence_classe (
        p_classe_id  IN NUMBER,
        p_date_debut IN DATE,
        p_date_fin   IN DATE
    ) RETURN NUMBER IS
        v_total    NUMBER;
        v_presents NUMBER;
    BEGIN
        SELECT COUNT(*),
               COUNT(CASE WHEN STATUT_PRESENCE = 'PRESENT' THEN 1 END)
        INTO v_total, v_presents
        FROM SS_PRESENCES pr
        JOIN SS_INSCRIPTIONS i ON pr.INSCRIPTION_ID = i.INSCRIPTION_ID
        WHERE i.CLASSE_ID = p_classe_id
        AND pr.DATE_PRESENCE BETWEEN p_date_debut AND p_date_fin;

        IF v_total > 0 THEN
            RETURN ROUND(v_presents / v_total * 100, 1);
        ELSE
            RETURN 100;
        END IF;
    END taux_presence_classe;

END PKG_SS_PRESENCES;
/

PROMPT   ✓ Corps PKG_SS_PRESENCES créé

PROMPT
PROMPT ============================================
PROMPT   ✅ PKG_SS_PRESENCES INSTALLÉ
PROMPT   - Appel par classe (matin/après-midi)
PROMPT   - Justification absences
PROMPT   - Détection absences répétées
PROMPT   - Statistiques élève et classe
PROMPT ============================================
