-- ============================================================================
-- SMARTSCHOOL ERP — Script 16 : PKG_SS_NOTIFICATIONS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Package    : PKG_SS_NOTIFICATIONS
-- Description: Moteur de notifications SMS / WhatsApp / Email.
--   - Remplacement des variables dans les modèles
--   - Envoi unitaire et en masse
--   - File d'attente de notifications
--   - Historique complet
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   PACKAGE PKG_SS_NOTIFICATIONS
PROMPT ============================================

-- ============================================================================
-- SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SS_NOTIFICATIONS AS

    -- Remplace les variables {VAR} dans un modèle par les valeurs réelles
    FUNCTION remplir_modele (
        p_contenu      IN VARCHAR2,
        p_eleve_id     IN NUMBER DEFAULT NULL,
        p_parent_id    IN NUMBER DEFAULT NULL,
        p_inscription_id IN NUMBER DEFAULT NULL,
        p_variables    IN VARCHAR2 DEFAULT NULL  -- JSON additionnel ex: '{"MONTANT":"150000"}'
    ) RETURN VARCHAR2;

    -- Crée une notification unitaire
    PROCEDURE creer_notification (
        p_modele_code      IN VARCHAR2,
        p_etablissement_id IN NUMBER,
        p_eleve_id         IN NUMBER DEFAULT NULL,
        p_parent_id        IN NUMBER DEFAULT NULL,
        p_inscription_id   IN NUMBER DEFAULT NULL,
        p_canal            IN VARCHAR2 DEFAULT NULL,
        p_priorite         IN VARCHAR2 DEFAULT NULL,
        p_variables        IN VARCHAR2 DEFAULT NULL,
        p_notification_id  OUT NUMBER
    );

    -- Envoie une notification (simule l'envoi et met à jour le statut)
    PROCEDURE envoyer_notification (
        p_notification_id IN NUMBER
    );

    -- Traite la file d'attente (envoie toutes les notifications planifiées)
    PROCEDURE traiter_file_attente (
        p_max_envois IN NUMBER DEFAULT 100
    );

    -- Notifie les parents d'une absence
    PROCEDURE notifier_absence (
        p_inscription_id IN NUMBER,
        p_date_absence   IN DATE
    );

    -- Notifie les parents d'un paiement reçu
    PROCEDURE notifier_paiement (
        p_paiement_id IN NUMBER
    );

    -- Envoie les rappels de paiement pour factures en retard
    PROCEDURE envoyer_rappels_paiement (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER
    );

    -- Notifie la disponibilité des bulletins
    PROCEDURE notifier_bulletins_disponibles (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    );

    -- Statistiques des notifications
    PROCEDURE stats_notifications (
        p_etablissement_id IN NUMBER,
        p_date_debut       IN DATE DEFAULT NULL,
        p_date_fin         IN DATE DEFAULT NULL
    );

END PKG_SS_NOTIFICATIONS;
/

PROMPT   ✓ Spécification PKG_SS_NOTIFICATIONS créée

-- ============================================================================
-- CORPS DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SS_NOTIFICATIONS AS

    -- =======================================================================
    -- remplir_modele
    -- Remplace {NOM_ELEVE}, {NOM_PARENT}, {CLASSE}, {DATE}, etc.
    -- =======================================================================
    FUNCTION remplir_modele (
        p_contenu        IN VARCHAR2,
        p_eleve_id       IN NUMBER DEFAULT NULL,
        p_parent_id      IN NUMBER DEFAULT NULL,
        p_inscription_id IN NUMBER DEFAULT NULL,
        p_variables      IN VARCHAR2 DEFAULT NULL
    ) RETURN VARCHAR2 IS
        v_result VARCHAR2(4000) := p_contenu;
        v_nom_eleve    VARCHAR2(200);
        v_nom_parent   VARCHAR2(200);
        v_classe       VARCHAR2(100);
        v_matricule    VARCHAR2(30);
    BEGIN
        -- Variables élève
        IF p_eleve_id IS NOT NULL THEN
            BEGIN
                SELECT NOM || ' ' || PRENOM, MATRICULE
                INTO v_nom_eleve, v_matricule
                FROM SS_ELEVES WHERE ELEVE_ID = p_eleve_id;

                v_result := REPLACE(v_result, '{NOM_ELEVE}', v_nom_eleve);
                v_result := REPLACE(v_result, '{MATRICULE}', v_matricule);
            EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
            END;
        END IF;

        -- Variables parent
        IF p_parent_id IS NOT NULL THEN
            BEGIN
                SELECT NOM || ' ' || PRENOM INTO v_nom_parent
                FROM SS_PARENTS WHERE PARENT_ID = p_parent_id;

                v_result := REPLACE(v_result, '{NOM_PARENT}', v_nom_parent);
            EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
            END;
        END IF;

        -- Variables inscription (classe)
        IF p_inscription_id IS NOT NULL THEN
            BEGIN
                SELECT c.LIBELLE INTO v_classe
                FROM SS_INSCRIPTIONS i
                JOIN SS_CLASSES c ON i.CLASSE_ID = c.CLASSE_ID
                WHERE i.INSCRIPTION_ID = p_inscription_id;

                v_result := REPLACE(v_result, '{CLASSE}', v_classe);
            EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
            END;
        END IF;

        -- Variables standard
        v_result := REPLACE(v_result, '{DATE}', TO_CHAR(SYSDATE, 'DD/MM/YYYY'));
        v_result := REPLACE(v_result, '{HEURE}', TO_CHAR(SYSDATE, 'HH24:MI'));

        -- Variables personnalisées (parsing JSON simple)
        IF p_variables IS NOT NULL THEN
            FOR rec IN (
                SELECT 
                    REGEXP_SUBSTR(p_variables, '"([^"]+)"', 1, LEVEL*2-1, NULL, 1) AS cle,
                    REGEXP_SUBSTR(p_variables, '"([^"]+)"', 1, LEVEL*2, NULL, 1) AS valeur
                FROM DUAL
                CONNECT BY LEVEL <= REGEXP_COUNT(p_variables, ':') 
            ) LOOP
                IF rec.cle IS NOT NULL AND rec.valeur IS NOT NULL THEN
                    v_result := REPLACE(v_result, '{' || rec.cle || '}', rec.valeur);
                END IF;
            END LOOP;
        END IF;

        RETURN v_result;
    END remplir_modele;

    -- =======================================================================
    -- creer_notification
    -- Colonnes réelles SS_NOTIFICATIONS :
    --   NOTIFICATION_ID, MODELE_ID, ETABLISSEMENT_ID, SUJET, CONTENU,
    --   CANAL, PRIORITE, DATE_CREATION, DATE_ENVOI_PREVUE,
    --   NB_DESTINATAIRES, STATUT, CREE_PAR
    -- =======================================================================
    PROCEDURE creer_notification (
        p_modele_code      IN VARCHAR2,
        p_etablissement_id IN NUMBER,
        p_eleve_id         IN NUMBER DEFAULT NULL,
        p_parent_id        IN NUMBER DEFAULT NULL,
        p_inscription_id   IN NUMBER DEFAULT NULL,
        p_canal            IN VARCHAR2 DEFAULT NULL,
        p_priorite         IN VARCHAR2 DEFAULT NULL,
        p_variables        IN VARCHAR2 DEFAULT NULL,
        p_notification_id  OUT NUMBER
    ) IS
        v_modele_id      NUMBER;
        v_canal          VARCHAR2(20);
        v_priorite       VARCHAR2(20);
        v_contenu        VARCHAR2(4000);
        v_sujet          VARCHAR2(200);
        v_contenu_rempli VARCHAR2(4000);
        v_eleve_id       NUMBER := p_eleve_id;
    BEGIN
        -- Récupérer le modèle
        SELECT MODELE_ID, CANAL, CONTENU, PRIORITE, SUJET
        INTO v_modele_id, v_canal, v_contenu, v_priorite, v_sujet
        FROM SS_MODELES_NOTIFICATION
        WHERE CODE = p_modele_code AND STATUT = 'ACTIF';

        -- Surcharger canal et priorité si spécifiés
        v_canal := NVL(p_canal, v_canal);
        v_priorite := NVL(p_priorite, v_priorite);

        -- Trouver l'élève si pas spécifié
        IF v_eleve_id IS NULL AND p_inscription_id IS NOT NULL THEN
            SELECT ELEVE_ID INTO v_eleve_id
            FROM SS_INSCRIPTIONS WHERE INSCRIPTION_ID = p_inscription_id;
        END IF;

        -- Remplir le modèle
        v_contenu_rempli := remplir_modele(
            v_contenu, v_eleve_id, p_parent_id, p_inscription_id, p_variables);

        -- Créer la notification (colonnes réelles de SS_NOTIFICATIONS)
        INSERT INTO SS_NOTIFICATIONS (
            MODELE_ID, ETABLISSEMENT_ID, SUJET, CONTENU,
            CANAL, PRIORITE, STATUT,
            DATE_ENVOI_PREVUE, CREE_PAR
        ) VALUES (
            v_modele_id, p_etablissement_id,
            NVL(v_sujet, 'Notification SmartSchool'),
            v_contenu_rempli, v_canal, v_priorite,
            'PLANIFIE', SYSTIMESTAMP,
            NVL(V('APP_USER'), USER)
        ) RETURNING NOTIFICATION_ID INTO p_notification_id;

        -- Ajouter le destinataire (parent)
        -- Table réelle = SS_NOTIFICATION_DEST (pas SS_DESTINATAIRES_NOTIF)
        IF p_parent_id IS NOT NULL THEN
            DECLARE
                v_tel VARCHAR2(30);
            BEGIN
                SELECT TELEPHONE_1 INTO v_tel
                FROM SS_PARENTS WHERE PARENT_ID = p_parent_id;

                INSERT INTO SS_NOTIFICATION_DEST (
                    NOTIFICATION_ID, TYPE_DESTINATAIRE,
                    PARENT_ID, TELEPHONE, STATUT_ENVOI
                ) VALUES (
                    p_notification_id, 'PARENT',
                    p_parent_id, v_tel, 'EN_ATTENTE'
                );

                -- Mettre à jour le compteur de destinataires
                UPDATE SS_NOTIFICATIONS SET NB_DESTINATAIRES = 1
                WHERE NOTIFICATION_ID = p_notification_id;

            EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
            END;
        END IF;

    END creer_notification;

    -- =======================================================================
    -- envoyer_notification
    -- Simule l'envoi (dans un vrai système, appel API SMS/WhatsApp ici)
    -- Colonnes réelles SS_NOTIFICATIONS : STATUT = ENVOYE, DATE_ENVOI_EFFECTIVE
    -- Colonnes réelles SS_NOTIFICATION_DEST : STATUT_ENVOI, DATE_ENVOI
    -- Table réelle logs : SS_SMS_LOGS
    -- =======================================================================
    PROCEDURE envoyer_notification (p_notification_id IN NUMBER) IS
    BEGIN
        -- Mettre à jour le statut de la notification
        UPDATE SS_NOTIFICATIONS SET
            STATUT               = 'ENVOYE',
            DATE_ENVOI_EFFECTIVE = SYSTIMESTAMP,
            NB_ENVOYES           = NB_DESTINATAIRES
        WHERE NOTIFICATION_ID = p_notification_id;

        -- Mettre à jour les destinataires (table SS_NOTIFICATION_DEST)
        UPDATE SS_NOTIFICATION_DEST SET
            STATUT_ENVOI = 'ENVOYE',
            DATE_ENVOI   = SYSTIMESTAMP
        WHERE NOTIFICATION_ID = p_notification_id
        AND STATUT_ENVOI = 'EN_ATTENTE';

        -- Log SMS (table réelle = SS_SMS_LOGS)
        -- Colonnes : NOTIFICATION_ID, DEST_ID, OPERATEUR_GATEWAY,
        --            NUMERO_DESTINATAIRE, CONTENU, STATUT_API, DATE_ENVOI
        INSERT INTO SS_SMS_LOGS (
            NOTIFICATION_ID,
            DEST_ID,
            OPERATEUR_GATEWAY,
            NUMERO_DESTINATAIRE,
            CONTENU,
            STATUT_API,
            DATE_ENVOI
        )
        SELECT 
            p_notification_id,
            nd.DEST_ID,
            CASE 
                WHEN nd.TELEPHONE LIKE '+224 62%' OR nd.TELEPHONE LIKE '62%' THEN 'ORANGE_GATEWAY'
                WHEN nd.TELEPHONE LIKE '+224 66%' OR nd.TELEPHONE LIKE '66%' THEN 'MTN_GATEWAY'
                ELSE 'DEFAULT_GATEWAY'
            END,
            nd.TELEPHONE,
            n.CONTENU,
            'SENT',
            SYSTIMESTAMP
        FROM SS_NOTIFICATIONS n
        JOIN SS_NOTIFICATION_DEST nd ON n.NOTIFICATION_ID = nd.NOTIFICATION_ID
        WHERE n.NOTIFICATION_ID = p_notification_id;

    END envoyer_notification;

    -- =======================================================================
    -- traiter_file_attente
    -- Statut valide : PLANIFIE (pas EN_ATTENTE)
    -- =======================================================================
    PROCEDURE traiter_file_attente (p_max_envois IN NUMBER DEFAULT 100) IS
        v_count NUMBER := 0;
    BEGIN
        FOR rec IN (
            SELECT NOTIFICATION_ID 
            FROM SS_NOTIFICATIONS
            WHERE STATUT = 'PLANIFIE'
            ORDER BY 
                CASE PRIORITE 
                    WHEN 'URGENTE' THEN 1 
                    WHEN 'HAUTE' THEN 2 
                    WHEN 'NORMALE' THEN 3 
                    WHEN 'BASSE' THEN 4 
                    ELSE 5 END,
                DATE_ENVOI_PREVUE
            FETCH FIRST p_max_envois ROWS ONLY
        ) LOOP
            envoyer_notification(rec.NOTIFICATION_ID);
            v_count := v_count + 1;
        END LOOP;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ ' || v_count || ' notifications envoyées');
    END traiter_file_attente;

    -- =======================================================================
    -- notifier_absence
    -- =======================================================================
    PROCEDURE notifier_absence (
        p_inscription_id IN NUMBER,
        p_date_absence   IN DATE
    ) IS
        v_notif_id       NUMBER;
        v_eleve_id       NUMBER;
        v_parent_id      NUMBER;
        v_etab_id        NUMBER;
    BEGIN
        -- Trouver l'élève et l'établissement
        SELECT i.ELEVE_ID, cl.ETABLISSEMENT_ID 
        INTO v_eleve_id, v_etab_id
        FROM SS_INSCRIPTIONS i
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE i.INSCRIPTION_ID = p_inscription_id;

        BEGIN
            SELECT ep.PARENT_ID INTO v_parent_id
            FROM SS_ELEVE_PARENT ep
            WHERE ep.ELEVE_ID = v_eleve_id AND ep.EST_CONTACT_PRINCIPAL = 'O'
            AND ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN
            RETURN; -- Pas de parent, pas de notification
        END;

        creer_notification(
            p_modele_code      => 'ABS_SMS_FR',
            p_etablissement_id => v_etab_id,
            p_eleve_id         => v_eleve_id,
            p_parent_id        => v_parent_id,
            p_inscription_id   => p_inscription_id,
            p_variables        => '{"DATE":"' || TO_CHAR(p_date_absence, 'DD/MM/YYYY') || '"}',
            p_notification_id  => v_notif_id
        );

        envoyer_notification(v_notif_id);

        -- Marquer la présence comme parent notifié
        UPDATE SS_PRESENCES SET
            PARENT_NOTIFIE    = 'O',
            DATE_NOTIFICATION = SYSTIMESTAMP
        WHERE INSCRIPTION_ID = p_inscription_id
        AND DATE_PRESENCE = p_date_absence
        AND STATUT_PRESENCE = 'ABSENT';

        COMMIT;
    END notifier_absence;

    -- =======================================================================
    -- notifier_paiement
    -- =======================================================================
    PROCEDURE notifier_paiement (p_paiement_id IN NUMBER) IS
        v_notif_id      NUMBER;
        v_eleve_id      NUMBER;
        v_parent_id     NUMBER;
        v_insc_id       NUMBER;
        v_montant       NUMBER;
        v_reste         NUMBER;
        v_numero_recu   VARCHAR2(30);
        v_etab_id       NUMBER;
    BEGIN
        SELECT p.MONTANT, p.NUMERO_RECU, f.MONTANT_RESTANT,
               i.ELEVE_ID, i.INSCRIPTION_ID, cl.ETABLISSEMENT_ID
        INTO v_montant, v_numero_recu, v_reste, v_eleve_id, v_insc_id, v_etab_id
        FROM SS_PAIEMENTS p
        JOIN SS_FACTURES f ON p.FACTURE_ID = f.FACTURE_ID
        JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE p.PAIEMENT_ID = p_paiement_id;

        BEGIN
            SELECT ep.PARENT_ID INTO v_parent_id
            FROM SS_ELEVE_PARENT ep
            WHERE ep.ELEVE_ID = v_eleve_id AND ep.EST_RESPONSABLE_FINANCIER = 'O'
            AND ROWNUM = 1;
        EXCEPTION WHEN NO_DATA_FOUND THEN RETURN;
        END;

        creer_notification(
            p_modele_code      => 'PAIE_RECU_FR',
            p_etablissement_id => v_etab_id,
            p_eleve_id         => v_eleve_id,
            p_parent_id        => v_parent_id,
            p_inscription_id   => v_insc_id,
            p_variables        => '{"MONTANT":"' || TO_CHAR(v_montant, 'FM999,999,999') || 
                                '","NUMERO_RECU":"' || v_numero_recu || 
                                '","RESTE":"' || TO_CHAR(v_reste, 'FM999,999,999') || '"}',
            p_notification_id  => v_notif_id
        );

        envoyer_notification(v_notif_id);
        COMMIT;
    END notifier_paiement;

    -- =======================================================================
    -- envoyer_rappels_paiement
    -- Table réelle = SS_FACTURE_LIGNES (pas SS_LIGNES_FACTURE)
    -- SS_FACTURES n'a pas ANNEE_ID, on filtre par SS_INSCRIPTIONS.ANNEE_ID
    -- =======================================================================
    PROCEDURE envoyer_rappels_paiement (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER
    ) IS
        v_notif_id NUMBER;
        v_count NUMBER := 0;
    BEGIN
        DBMS_OUTPUT.PUT_LINE('── Envoi des rappels de paiement ──');

        FOR rec IN (
            SELECT DISTINCT
                f.FACTURE_ID, f.MONTANT_RESTANT,
                i.ELEVE_ID, i.INSCRIPTION_ID,
                ep.PARENT_ID,
                cl.ETABLISSEMENT_ID,
                f.DATE_ECHEANCE AS date_limite
            FROM SS_FACTURES f
            JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
            JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
            JOIN SS_ELEVE_PARENT ep ON i.ELEVE_ID = ep.ELEVE_ID 
                 AND ep.EST_RESPONSABLE_FINANCIER = 'O'
            WHERE cl.ETABLISSEMENT_ID = p_etablissement_id
            AND i.ANNEE_ID = p_annee_id
            AND f.STATUT IN ('EN_ATTENTE','PARTIELLEMENT_PAYEE','EN_RETARD')
            AND f.MONTANT_RESTANT > 0
        ) LOOP
            creer_notification(
                p_modele_code      => 'PAIE_RAPPEL_FR',
                p_etablissement_id => rec.ETABLISSEMENT_ID,
                p_eleve_id         => rec.ELEVE_ID,
                p_parent_id        => rec.PARENT_ID,
                p_inscription_id   => rec.INSCRIPTION_ID,
                p_variables        => '{"MONTANT":"' || TO_CHAR(rec.MONTANT_RESTANT, 'FM999,999,999') ||
                                    '","DATE_LIMITE":"' || NVL(TO_CHAR(rec.date_limite, 'DD/MM/YYYY'), 'Non définie') || '"}',
                p_notification_id  => v_notif_id
            );

            envoyer_notification(v_notif_id);
            v_count := v_count + 1;
        END LOOP;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' rappels envoyés');
    END envoyer_rappels_paiement;

    -- =======================================================================
    -- notifier_bulletins_disponibles
    -- =======================================================================
    PROCEDURE notifier_bulletins_disponibles (
        p_classe_id    IN NUMBER,
        p_trimestre_id IN NUMBER
    ) IS
        v_notif_id NUMBER;
        v_count NUMBER := 0;
        v_etab_id NUMBER;
    BEGIN
        -- Récupérer l'établissement de la classe
        SELECT ETABLISSEMENT_ID INTO v_etab_id
        FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;

        FOR rec IN (
            SELECT 
                b.BULLETIN_ID, b.MOYENNE_GENERALE, b.RANG, b.EFFECTIF_CLASSE,
                i.ELEVE_ID, i.INSCRIPTION_ID,
                ep.PARENT_ID,
                t.LIBELLE AS trimestre_libelle
            FROM SS_BULLETINS b
            JOIN SS_INSCRIPTIONS i ON b.INSCRIPTION_ID = i.INSCRIPTION_ID
            JOIN SS_ELEVE_PARENT ep ON i.ELEVE_ID = ep.ELEVE_ID 
                 AND ep.EST_CONTACT_PRINCIPAL = 'O'
            JOIN SS_TRIMESTRES t ON b.TRIMESTRE_ID = t.TRIMESTRE_ID
            WHERE i.CLASSE_ID = p_classe_id
            AND b.TRIMESTRE_ID = p_trimestre_id
            AND b.STATUT = 'PUBLIE'
        ) LOOP
            creer_notification(
                p_modele_code      => 'BULL_DISPO_FR',
                p_etablissement_id => v_etab_id,
                p_eleve_id         => rec.ELEVE_ID,
                p_parent_id        => rec.PARENT_ID,
                p_inscription_id   => rec.INSCRIPTION_ID,
                p_variables        => '{"TRIMESTRE":"' || rec.trimestre_libelle ||
                                    '","MOYENNE":"' || NVL(TO_CHAR(rec.MOYENNE_GENERALE), 'N/A') ||
                                    '","RANG":"' || NVL(TO_CHAR(rec.RANG), 'N/A') ||
                                    '","EFFECTIF":"' || NVL(TO_CHAR(rec.EFFECTIF_CLASSE), 'N/A') || '"}',
                p_notification_id  => v_notif_id
            );

            envoyer_notification(v_notif_id);
            v_count := v_count + 1;
        END LOOP;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✅ ' || v_count || ' parents notifiés des bulletins');
    END notifier_bulletins_disponibles;

    -- =======================================================================
    -- stats_notifications
    -- Statuts réels SS_NOTIFICATIONS : BROUILLON, PLANIFIE, EN_COURS, ENVOYE, ANNULE, ERREUR
    -- =======================================================================
    PROCEDURE stats_notifications (
        p_etablissement_id IN NUMBER,
        p_date_debut       IN DATE DEFAULT NULL,
        p_date_fin         IN DATE DEFAULT NULL
    ) IS
        v_total    NUMBER;
        v_envoyees NUMBER;
        v_echecs   NUMBER;
        v_attente  NUMBER;
    BEGIN
        SELECT 
            COUNT(*),
            COUNT(CASE WHEN STATUT = 'ENVOYE' THEN 1 END),
            COUNT(CASE WHEN STATUT = 'ERREUR' THEN 1 END),
            COUNT(CASE WHEN STATUT IN ('PLANIFIE','BROUILLON') THEN 1 END)
        INTO v_total, v_envoyees, v_echecs, v_attente
        FROM SS_NOTIFICATIONS
        WHERE ETABLISSEMENT_ID = p_etablissement_id
        AND (p_date_debut IS NULL OR DATE_CREATION >= p_date_debut)
        AND (p_date_fin IS NULL OR DATE_CREATION <= p_date_fin);

        DBMS_OUTPUT.PUT_LINE('═══ Stats Notifications ═══');
        DBMS_OUTPUT.PUT_LINE('Total       : ' || v_total);
        DBMS_OUTPUT.PUT_LINE('Envoyées    : ' || v_envoyees);
        DBMS_OUTPUT.PUT_LINE('En attente  : ' || v_attente);
        DBMS_OUTPUT.PUT_LINE('Échecs      : ' || v_echecs);
        IF v_total > 0 THEN
            DBMS_OUTPUT.PUT_LINE('Taux succès : ' || ROUND(v_envoyees / v_total * 100, 1) || '%');
        END IF;
    END stats_notifications;

END PKG_SS_NOTIFICATIONS;
/

PROMPT   ✓ Corps PKG_SS_NOTIFICATIONS créé

PROMPT
PROMPT ============================================
PROMPT   ✅ PKG_SS_NOTIFICATIONS INSTALLÉ
PROMPT   - Moteur de templates avec variables
PROMPT   - Notifications absence/paiement/bulletin
PROMPT   - File d'attente avec priorité
PROMPT   - Historique et logs SMS
PROMPT ============================================
