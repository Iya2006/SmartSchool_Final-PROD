-- ============================================================================
-- SMARTSCHOOL ERP — Script 14 : PKG_SS_INSCRIPTIONS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Package    : PKG_SS_INSCRIPTIONS
-- Description: Processus d'inscription, réinscription et transferts.
--   - Inscription d'un nouvel élève
--   - Réinscription (RENOUVELLEMENT)
--   - Transfert entre classes / établissements
--   - Génération automatique du matricule national
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   PACKAGE PKG_SS_INSCRIPTIONS
PROMPT ============================================

-- ============================================================================
-- SPECIFICATION
-- ============================================================================
CREATE OR REPLACE PACKAGE PKG_SS_INSCRIPTIONS AS

    -- Génère un matricule national unique
    FUNCTION generer_matricule (
        p_etablissement_id IN NUMBER,
        p_annee_inscription IN NUMBER DEFAULT NULL
    ) RETURN VARCHAR2;

    -- Inscrit un nouvel élève (crée le profil + inscription)
    PROCEDURE inscrire_nouvel_eleve (
        p_etablissement_id     IN NUMBER,
        p_classe_id            IN NUMBER,
        p_annee_id             IN NUMBER,
        p_nom                  IN VARCHAR2,
        p_prenom               IN VARCHAR2,
        p_date_naissance       IN DATE,
        p_lieu_naissance       IN VARCHAR2,
        p_sexe                 IN VARCHAR2,
        p_nationalite          IN VARCHAR2 DEFAULT 'Guinéenne',
        p_adresse              IN VARCHAR2 DEFAULT NULL,
        p_quartier             IN VARCHAR2 DEFAULT NULL,
        p_telephone            IN VARCHAR2 DEFAULT NULL,
        p_groupe_sanguin       IN VARCHAR2 DEFAULT NULL,
        p_allergies            IN VARCHAR2 DEFAULT NULL,
        p_parent_nom           IN VARCHAR2 DEFAULT NULL,
        p_parent_prenom        IN VARCHAR2 DEFAULT NULL,
        p_parent_telephone     IN VARCHAR2 DEFAULT NULL,
        p_parent_profession    IN VARCHAR2 DEFAULT NULL,
        p_lien_parente         IN VARCHAR2 DEFAULT 'PERE',
        p_eleve_id             OUT NUMBER,
        p_inscription_id       OUT NUMBER,
        p_matricule            OUT VARCHAR2
    );

    -- Réinscrit un élève existant dans une nouvelle classe/année
    PROCEDURE reinscrire_eleve (
        p_eleve_id       IN NUMBER,
        p_classe_id      IN NUMBER,
        p_annee_id       IN NUMBER,
        p_inscription_id OUT NUMBER
    );

    -- Transfert d'un élève vers une autre classe (même établissement)
    PROCEDURE transferer_classe (
        p_inscription_id     IN NUMBER,
        p_nouvelle_classe_id IN NUMBER,
        p_motif              IN VARCHAR2 DEFAULT NULL
    );

    -- Transfert vers un autre établissement
    PROCEDURE transferer_etablissement (
        p_eleve_id            IN NUMBER,
        p_nouvel_etab_id      IN NUMBER,
        p_nouvelle_classe_id  IN NUMBER,
        p_annee_id            IN NUMBER,
        p_motif               IN VARCHAR2 DEFAULT NULL,
        p_new_inscription_id  OUT NUMBER
    );

    -- Désactive une inscription (abandon, exclusion)
    PROCEDURE desactiver_inscription (
        p_inscription_id IN NUMBER,
        p_motif          IN VARCHAR2,
        p_nouveau_statut IN VARCHAR2 DEFAULT 'ANNULEE'
    );

    -- Statistiques d'inscription
    PROCEDURE stats_inscriptions (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER
    );

END PKG_SS_INSCRIPTIONS;
/

PROMPT   ✓ Spécification PKG_SS_INSCRIPTIONS créée

-- ============================================================================
-- CORPS DU PACKAGE
-- ============================================================================
CREATE OR REPLACE PACKAGE BODY PKG_SS_INSCRIPTIONS AS

    -- =======================================================================
    -- generer_matricule
    -- Format : GN-YYYY-RRRRR (GN = Guinée, YYYY = année, RRRRR = séquence)
    -- =======================================================================
    FUNCTION generer_matricule (
        p_etablissement_id  IN NUMBER,
        p_annee_inscription IN NUMBER DEFAULT NULL
    ) RETURN VARCHAR2 IS
        v_region   VARCHAR2(10);
        v_annee    VARCHAR2(4);
        v_seq      NUMBER;
        v_prefix   VARCHAR2(10);
    BEGIN
        -- Récupérer le code région de l'établissement
        SELECT SUBSTR(REGION, 1, 3) INTO v_region
        FROM SS_ETABLISSEMENTS WHERE ETABLISSEMENT_ID = p_etablissement_id;

        v_annee := TO_CHAR(NVL(p_annee_inscription, EXTRACT(YEAR FROM SYSDATE)));

        -- Calculer la séquence
        SELECT COUNT(*) + 1 INTO v_seq
        FROM SS_ELEVES
        WHERE MATRICULE LIKE 'GN-' || v_annee || '-%';

        v_prefix := 'GN-' || v_annee || '-';
        RETURN v_prefix || LPAD(v_seq, 6, '0');
    END generer_matricule;

    -- =======================================================================
    -- inscrire_nouvel_eleve
    -- =======================================================================
    PROCEDURE inscrire_nouvel_eleve (
        p_etablissement_id     IN NUMBER,
        p_classe_id            IN NUMBER,
        p_annee_id             IN NUMBER,
        p_nom                  IN VARCHAR2,
        p_prenom               IN VARCHAR2,
        p_date_naissance       IN DATE,
        p_lieu_naissance       IN VARCHAR2,
        p_sexe                 IN VARCHAR2,
        p_nationalite          IN VARCHAR2 DEFAULT 'Guinéenne',
        p_adresse              IN VARCHAR2 DEFAULT NULL,
        p_quartier             IN VARCHAR2 DEFAULT NULL,
        p_telephone            IN VARCHAR2 DEFAULT NULL,
        p_groupe_sanguin       IN VARCHAR2 DEFAULT NULL,
        p_allergies            IN VARCHAR2 DEFAULT NULL,
        p_parent_nom           IN VARCHAR2 DEFAULT NULL,
        p_parent_prenom        IN VARCHAR2 DEFAULT NULL,
        p_parent_telephone     IN VARCHAR2 DEFAULT NULL,
        p_parent_profession    IN VARCHAR2 DEFAULT NULL,
        p_lien_parente         IN VARCHAR2 DEFAULT 'PERE',
        p_eleve_id             OUT NUMBER,
        p_inscription_id       OUT NUMBER,
        p_matricule            OUT VARCHAR2
    ) IS
        v_parent_id      NUMBER;
        v_capacite_max   NUMBER;
        v_effectif       NUMBER;
    BEGIN
        -- Vérifier la capacité de la classe
        SELECT CAPACITE_MAX, NVL(EFFECTIF_ACTUEL, 0)
        INTO v_capacite_max, v_effectif
        FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;

        IF v_effectif >= v_capacite_max THEN
            RAISE_APPLICATION_ERROR(-20020, 
                'Classe pleine ! Capacité max: ' || v_capacite_max || 
                ', Effectif actuel: ' || v_effectif);
        END IF;

        -- Générer le matricule
        p_matricule := generer_matricule(p_etablissement_id);

        -- Créer le profil élève
        INSERT INTO SS_ELEVES (
            ETABLISSEMENT_ID, MATRICULE,
            NOM, PRENOM, DATE_NAISSANCE, LIEU_NAISSANCE, SEXE,
            NATIONALITE, ADRESSE, QUARTIER, TELEPHONE,
            GROUPE_SANGUIN, ALLERGIES,
            DATE_PREMIERE_INSCRIPTION, STATUT
        ) VALUES (
            p_etablissement_id, p_matricule,
            UPPER(p_nom), INITCAP(p_prenom), p_date_naissance, p_lieu_naissance, p_sexe,
            p_nationalite, p_adresse, p_quartier, p_telephone,
            p_groupe_sanguin, p_allergies,
            SYSDATE, 'ACTIF'
        ) RETURNING ELEVE_ID INTO p_eleve_id;

        -- Créer l'inscription
        INSERT INTO SS_INSCRIPTIONS (
            ELEVE_ID, CLASSE_ID, ANNEE_ID,
            DATE_INSCRIPTION, TYPE_INSCRIPTION, STATUT
        ) VALUES (
            p_eleve_id, p_classe_id, p_annee_id,
            SYSDATE, 'NOUVELLE', 'ACTIVE'
        ) RETURNING INSCRIPTION_ID INTO p_inscription_id;

        -- Créer le parent si renseigné
        -- Colonne réelle = CANAL_PREFERE (pas PREFERENCE_COMM)
        IF p_parent_nom IS NOT NULL AND p_parent_telephone IS NOT NULL THEN
            INSERT INTO SS_PARENTS (
                NOM, PRENOM, TELEPHONE_1, PROFESSION,
                CANAL_PREFERE, LANGUE_PREFEREE
            ) VALUES (
                UPPER(p_parent_nom), INITCAP(p_parent_prenom),
                p_parent_telephone, p_parent_profession,
                'SMS', 'FR'
            ) RETURNING PARENT_ID INTO v_parent_id;

            -- Lier parent-élève
            INSERT INTO SS_ELEVE_PARENT (
                ELEVE_ID, PARENT_ID, LIEN_PARENTE,
                EST_CONTACT_PRINCIPAL, EST_RESPONSABLE_FINANCIER
            ) VALUES (
                p_eleve_id, v_parent_id, p_lien_parente,
                'O', 'O'
            );
        END IF;

        -- Note: Le trigger TRG_SS_INSC_EFFECTIF met à jour EFFECTIF_ACTUEL automatiquement

        COMMIT;

        DBMS_OUTPUT.PUT_LINE('✅ Inscription réussie :');
        DBMS_OUTPUT.PUT_LINE('   Matricule  : ' || p_matricule);
        DBMS_OUTPUT.PUT_LINE('   Élève      : ' || UPPER(p_nom) || ' ' || INITCAP(p_prenom));
        DBMS_OUTPUT.PUT_LINE('   Élève ID   : ' || p_eleve_id);
        DBMS_OUTPUT.PUT_LINE('   Inscription: ' || p_inscription_id);

    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            DBMS_OUTPUT.PUT_LINE('❌ ERREUR inscription : ' || SQLERRM);
            RAISE;
    END inscrire_nouvel_eleve;

    -- =======================================================================
    -- reinscrire_eleve
    -- TYPE_INSCRIPTION = 'RENOUVELLEMENT' (valeur CHECK)
    -- =======================================================================
    PROCEDURE reinscrire_eleve (
        p_eleve_id       IN NUMBER,
        p_classe_id      IN NUMBER,
        p_annee_id       IN NUMBER,
        p_inscription_id OUT NUMBER
    ) IS
        v_capacite_max NUMBER;
        v_effectif     NUMBER;
        v_old_insc     NUMBER;
    BEGIN
        -- Vérifier la capacité
        SELECT CAPACITE_MAX, NVL(EFFECTIF_ACTUEL, 0)
        INTO v_capacite_max, v_effectif
        FROM SS_CLASSES WHERE CLASSE_ID = p_classe_id;

        IF v_effectif >= v_capacite_max THEN
            RAISE_APPLICATION_ERROR(-20021, 'Classe pleine !');
        END IF;

        -- Vérifier qu'il n'est pas déjà inscrit cette année
        SELECT COUNT(*) INTO v_old_insc
        FROM SS_INSCRIPTIONS
        WHERE ELEVE_ID = p_eleve_id AND ANNEE_ID = p_annee_id AND STATUT = 'ACTIVE';

        IF v_old_insc > 0 THEN
            RAISE_APPLICATION_ERROR(-20022, 
                'L''élève est déjà inscrit pour cette année scolaire');
        END IF;

        -- Créer l'inscription (RENOUVELLEMENT est la valeur valide dans le CHECK)
        INSERT INTO SS_INSCRIPTIONS (
            ELEVE_ID, CLASSE_ID, ANNEE_ID,
            DATE_INSCRIPTION, TYPE_INSCRIPTION, STATUT
        ) VALUES (
            p_eleve_id, p_classe_id, p_annee_id,
            SYSDATE, 'RENOUVELLEMENT', 'ACTIVE'
        ) RETURNING INSCRIPTION_ID INTO p_inscription_id;

        -- S'assurer que l'élève est ACTIF
        UPDATE SS_ELEVES SET STATUT = 'ACTIF' WHERE ELEVE_ID = p_eleve_id AND STATUT != 'ACTIF';

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Réinscription #' || p_inscription_id || ' pour élève #' || p_eleve_id);
    END reinscrire_eleve;

    -- =======================================================================
    -- transferer_classe (transfert interne — même établissement)
    -- SS_TRANSFERTS a : ELEVE_ID, ETABLISSEMENT_ORIGINE_ID, ETABLISSEMENT_DEST_ID,
    --                   ANNEE_ID, DATE_DEMANDE, MOTIF, STATUT
    -- =======================================================================
    PROCEDURE transferer_classe (
        p_inscription_id     IN NUMBER,
        p_nouvelle_classe_id IN NUMBER,
        p_motif              IN VARCHAR2 DEFAULT NULL
    ) IS
        v_ancienne_classe NUMBER;
        v_eleve_id        NUMBER;
        v_annee_id        NUMBER;
        v_etab_id         NUMBER;
    BEGIN
        SELECT i.CLASSE_ID, i.ELEVE_ID, i.ANNEE_ID, cl.ETABLISSEMENT_ID
        INTO v_ancienne_classe, v_eleve_id, v_annee_id, v_etab_id
        FROM SS_INSCRIPTIONS i
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE i.INSCRIPTION_ID = p_inscription_id;

        -- Mettre à jour l'inscription directement (transfert interne,
        -- pas besoin d'insérer dans SS_TRANSFERTS qui gère les inter-établissements)
        UPDATE SS_INSCRIPTIONS SET
            CLASSE_ID = p_nouvelle_classe_id,
            OBSERVATIONS = NVL(OBSERVATIONS, '') || 
                          'Transfert classe ' || v_ancienne_classe || 
                          ' → ' || p_nouvelle_classe_id || 
                          ' le ' || TO_CHAR(SYSDATE, 'DD/MM/YYYY') || 
                          '. Motif: ' || NVL(p_motif, 'Non spécifié') || '. ',
            MODIFIED_BY = NVL(V('APP_USER'), USER),
            MODIFIED_DATE = SYSTIMESTAMP
        WHERE INSCRIPTION_ID = p_inscription_id;

        -- Mettre à jour les effectifs (ancienne classe -1, nouvelle +1)
        UPDATE SS_CLASSES SET EFFECTIF_ACTUEL = NVL(EFFECTIF_ACTUEL, 0) - 1
        WHERE CLASSE_ID = v_ancienne_classe AND NVL(EFFECTIF_ACTUEL, 0) > 0;

        UPDATE SS_CLASSES SET EFFECTIF_ACTUEL = NVL(EFFECTIF_ACTUEL, 0) + 1
        WHERE CLASSE_ID = p_nouvelle_classe_id;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Transfert classe : ' || v_ancienne_classe || 
                             ' → ' || p_nouvelle_classe_id);
    END transferer_classe;

    -- =======================================================================
    -- transferer_etablissement
    -- Utilise les colonnes réelles de SS_TRANSFERTS :
    --   ELEVE_ID, ETABLISSEMENT_ORIGINE_ID, ETABLISSEMENT_DEST_ID,
    --   ANNEE_ID, DATE_DEMANDE, MOTIF, CLASSE_DEMANDEE, STATUT
    -- =======================================================================
    PROCEDURE transferer_etablissement (
        p_eleve_id            IN NUMBER,
        p_nouvel_etab_id      IN NUMBER,
        p_nouvelle_classe_id  IN NUMBER,
        p_annee_id            IN NUMBER,
        p_motif               IN VARCHAR2 DEFAULT NULL,
        p_new_inscription_id  OUT NUMBER
    ) IS
        v_ancienne_classe     NUMBER;
        v_ancien_etab         NUMBER;
        v_classe_demandee     VARCHAR2(50);
    BEGIN
        -- Récupérer l'ancienne inscription active
        SELECT i.CLASSE_ID, cl.ETABLISSEMENT_ID
        INTO v_ancienne_classe, v_ancien_etab
        FROM SS_INSCRIPTIONS i
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE i.ELEVE_ID = p_eleve_id AND i.STATUT = 'ACTIVE'
        AND ROWNUM = 1;

        -- Récupérer le code de la nouvelle classe
        SELECT CODE INTO v_classe_demandee 
        FROM SS_CLASSES WHERE CLASSE_ID = p_nouvelle_classe_id;

        -- Désactiver l'ancienne inscription (ANNULEE est valide dans le CHECK)
        UPDATE SS_INSCRIPTIONS SET 
            STATUT = 'ANNULEE',
            OBSERVATIONS = NVL(OBSERVATIONS, '') || 
                          'Transféré vers établissement #' || p_nouvel_etab_id || 
                          ' le ' || TO_CHAR(SYSDATE, 'DD/MM/YYYY') || '. ',
            MODIFIED_BY = NVL(V('APP_USER'), USER),
            MODIFIED_DATE = SYSTIMESTAMP
        WHERE ELEVE_ID = p_eleve_id AND STATUT = 'ACTIVE';

        -- Enregistrer le transfert (colonnes réelles de SS_TRANSFERTS)
        INSERT INTO SS_TRANSFERTS (
            ELEVE_ID, ETABLISSEMENT_ORIGINE_ID, ETABLISSEMENT_DEST_ID,
            ANNEE_ID, DATE_DEMANDE, MOTIF, CLASSE_DEMANDEE, STATUT
        ) VALUES (
            p_eleve_id, v_ancien_etab, p_nouvel_etab_id,
            p_annee_id, SYSDATE, NVL(p_motif, 'Transfert'), v_classe_demandee, 'APPROUVE'
        );

        -- Mettre à jour l'établissement de l'élève
        UPDATE SS_ELEVES SET 
            ETABLISSEMENT_ID = p_nouvel_etab_id,
            STATUT = 'TRANSFERE',
            MODIFIED_BY = NVL(V('APP_USER'), USER),
            MODIFIED_DATE = SYSTIMESTAMP
        WHERE ELEVE_ID = p_eleve_id;

        -- Créer la nouvelle inscription
        INSERT INTO SS_INSCRIPTIONS (
            ELEVE_ID, CLASSE_ID, ANNEE_ID,
            DATE_INSCRIPTION, TYPE_INSCRIPTION, STATUT
        ) VALUES (
            p_eleve_id, p_nouvelle_classe_id, p_annee_id,
            SYSDATE, 'TRANSFERT', 'ACTIVE'
        ) RETURNING INSCRIPTION_ID INTO p_new_inscription_id;

        -- Mettre à jour le statut de l'élève dans le nouvel établissement
        UPDATE SS_ELEVES SET STATUT = 'ACTIF'
        WHERE ELEVE_ID = p_eleve_id;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Transfert externe réussi vers établissement #' || p_nouvel_etab_id);
    END transferer_etablissement;

    -- =======================================================================
    -- desactiver_inscription
    -- Statuts valides CHECK : ACTIVE, SUSPENDUE, ANNULEE, TERMINEE
    -- =======================================================================
    PROCEDURE desactiver_inscription (
        p_inscription_id IN NUMBER,
        p_motif          IN VARCHAR2,
        p_nouveau_statut IN VARCHAR2 DEFAULT 'ANNULEE'
    ) IS
    BEGIN
        -- Statuts de désactivation autorisés (sous-ensemble du CHECK)
        IF p_nouveau_statut NOT IN ('ANNULEE','SUSPENDUE','TERMINEE') THEN
            RAISE_APPLICATION_ERROR(-20025, 'Statut invalide : ' || p_nouveau_statut);
        END IF;

        UPDATE SS_INSCRIPTIONS SET
            STATUT         = p_nouveau_statut,
            OBSERVATIONS   = NVL(OBSERVATIONS, '') || p_motif || ' (' || 
                            TO_CHAR(SYSDATE, 'DD/MM/YYYY') || '). ',
            MODIFIED_BY    = NVL(V('APP_USER'), USER),
            MODIFIED_DATE  = SYSTIMESTAMP
        WHERE INSCRIPTION_ID = p_inscription_id;

        -- Mettre à jour l'effectif
        UPDATE SS_CLASSES SET EFFECTIF_ACTUEL = NVL(EFFECTIF_ACTUEL, 0) - 1
        WHERE CLASSE_ID = (SELECT CLASSE_ID FROM SS_INSCRIPTIONS WHERE INSCRIPTION_ID = p_inscription_id)
        AND NVL(EFFECTIF_ACTUEL, 0) > 0;

        COMMIT;
        DBMS_OUTPUT.PUT_LINE('✓ Inscription #' || p_inscription_id || ' désactivée (' || p_nouveau_statut || ')');
    END desactiver_inscription;

    -- =======================================================================
    -- stats_inscriptions
    -- =======================================================================
    PROCEDURE stats_inscriptions (
        p_etablissement_id IN NUMBER,
        p_annee_id         IN NUMBER
    ) IS
        v_total      NUMBER;
        v_garcons    NUMBER;
        v_filles     NUMBER;
        v_nouvelles  NUMBER;
        v_reinscrip  NUMBER;
        v_transferts NUMBER;
    BEGIN
        SELECT 
            COUNT(*),
            COUNT(CASE WHEN e.SEXE = 'M' THEN 1 END),
            COUNT(CASE WHEN e.SEXE = 'F' THEN 1 END),
            COUNT(CASE WHEN i.TYPE_INSCRIPTION = 'NOUVELLE' THEN 1 END),
            COUNT(CASE WHEN i.TYPE_INSCRIPTION = 'RENOUVELLEMENT' THEN 1 END),
            COUNT(CASE WHEN i.TYPE_INSCRIPTION = 'TRANSFERT' THEN 1 END)
        INTO v_total, v_garcons, v_filles, v_nouvelles, v_reinscrip, v_transferts
        FROM SS_INSCRIPTIONS i
        JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
        JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
        WHERE cl.ETABLISSEMENT_ID = p_etablissement_id
        AND i.ANNEE_ID = p_annee_id
        AND i.STATUT = 'ACTIVE';

        DBMS_OUTPUT.PUT_LINE('═══ Stats Inscriptions ═══');
        DBMS_OUTPUT.PUT_LINE('Total inscrits   : ' || v_total);
        DBMS_OUTPUT.PUT_LINE('Garçons          : ' || v_garcons || ' (' || 
                             ROUND(v_garcons/GREATEST(v_total,1)*100) || '%)');
        DBMS_OUTPUT.PUT_LINE('Filles           : ' || v_filles || ' (' || 
                             ROUND(v_filles/GREATEST(v_total,1)*100) || '%)');
        DBMS_OUTPUT.PUT_LINE('Nouvelles        : ' || v_nouvelles);
        DBMS_OUTPUT.PUT_LINE('Réinscriptions   : ' || v_reinscrip);
        DBMS_OUTPUT.PUT_LINE('Transferts       : ' || v_transferts);
    END stats_inscriptions;

END PKG_SS_INSCRIPTIONS;
/

PROMPT   ✓ Corps PKG_SS_INSCRIPTIONS créé

PROMPT
PROMPT ============================================
PROMPT   ✅ PKG_SS_INSCRIPTIONS INSTALLÉ
PROMPT   - Inscription nouvel élève + matricule
PROMPT   - Réinscription (RENOUVELLEMENT)
PROMPT   - Transferts internes / externes
PROMPT   - Statistiques
PROMPT ============================================
