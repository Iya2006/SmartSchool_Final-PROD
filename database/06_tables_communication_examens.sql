-- ============================================================================
-- SMARTSCHOOL ERP — Script 06 : TABLES COMMUNICATION & EXAMENS NATIONAUX
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module 6    : Communication (4 tables)
-- Module 7    : Examens Nationaux (4 tables)
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 6 — COMMUNICATION & NOTIFICATIONS
PROMPT   Création de 4 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 41 : SS_MODELES_NOTIFICATION
-- Description : Templates pour les notifications SMS/WhatsApp.
--               Supporte les variables dynamiques : {NOM_ELEVE}, {DATE}, etc.
-- ============================================================================
CREATE TABLE SS_MODELES_NOTIFICATION (
    MODELE_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_MODELES_NOTIF PRIMARY KEY,
    CODE                 VARCHAR2(30)        NOT NULL,
    LIBELLE              VARCHAR2(200)       NOT NULL,
    -- Template
    CANAL                VARCHAR2(20)        NOT NULL,
    LANGUE               VARCHAR2(20)        DEFAULT 'FR' NOT NULL,
    SUJET                VARCHAR2(200),      -- Pour email
    CONTENU              VARCHAR2(4000)      NOT NULL,  -- Template avec variables {VAR}
    CONTENU_HTML         CLOB,               -- Version HTML pour email
    -- Classification
    CATEGORIE            VARCHAR2(50)        NOT NULL,
    EVENEMENT            VARCHAR2(50)        NOT NULL,  -- Événement déclencheur
    EST_AUTOMATIQUE      VARCHAR2(1)         DEFAULT 'N',  -- Envoi automatique ou manuel
    -- Configuration
    PRIORITE             VARCHAR2(10)        DEFAULT 'NORMALE',
    DELAI_ENVOI_MINUTES  NUMBER(6)           DEFAULT 0,  -- Délai avant envoi (0 = immédiat)
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT UK_SS_MNOTIF_CODE     UNIQUE (CODE, LANGUE),
    CONSTRAINT CK_SS_MNOTIF_CANAL    CHECK (CANAL IN ('SMS','WHATSAPP','EMAIL','PUSH','TOUS')),
    CONSTRAINT CK_SS_MNOTIF_LANGUE   CHECK (LANGUE IN ('FR','SUSU','PULAR','MALINKE')),
    CONSTRAINT CK_SS_MNOTIF_CATEG    CHECK (CATEGORIE IN (
        'ABSENCE','RETARD','NOTE','BULLETIN','PAIEMENT','DISCIPLINE','EVENEMENT','SYSTEME','AUTRE')),
    CONSTRAINT CK_SS_MNOTIF_EVENT    CHECK (EVENEMENT IN (
        'ABSENCE_DETECTEE','RETARD_DETECTE','NOTES_PUBLIEES','BULLETIN_DISPONIBLE',
        'PAIEMENT_EN_RETARD','PAIEMENT_RECU','RAPPEL_PAIEMENT','INCIDENT_SIGNALE',
        'SANCTION_APPLIQUEE','REUNION_PARENTS','EXAMEN_PLANIFIE','RESULTAT_EXAMEN',
        'INSCRIPTION_VALIDEE','TRANSFERT_APPROUVE','EVENEMENT_ECOLE','MESSAGE_LIBRE')),
    CONSTRAINT CK_SS_MNOTIF_AUTO     CHECK (EST_AUTOMATIQUE IN ('O','N')),
    CONSTRAINT CK_SS_MNOTIF_PRIO     CHECK (PRIORITE IN ('BASSE','NORMALE','HAUTE','URGENTE')),
    CONSTRAINT CK_SS_MNOTIF_STATUT   CHECK (STATUT IN ('ACTIF','INACTIF','BROUILLON'))
);

COMMENT ON TABLE SS_MODELES_NOTIFICATION IS 'Templates de notification avec variables dynamiques {NOM_ELEVE}, {DATE}, etc.';
COMMENT ON COLUMN SS_MODELES_NOTIFICATION.CONTENU IS 'Template avec variables : Cher(e) {NOM_PARENT}, votre enfant {NOM_ELEVE} est absent ce {DATE}...';
COMMENT ON COLUMN SS_MODELES_NOTIFICATION.EST_AUTOMATIQUE IS 'O = envoi déclenché automatiquement par le système';

PROMPT   ✓ Table SS_MODELES_NOTIFICATION créée

-- ============================================================================
-- TABLE 42 : SS_NOTIFICATIONS
-- Description : Notifications émises (instances de modèles).
-- ============================================================================
CREATE TABLE SS_NOTIFICATIONS (
    NOTIFICATION_ID      NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_NOTIFICATIONS PRIMARY KEY,
    MODELE_ID            NUMBER,             -- NULL si notification libre
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    -- Contenu
    SUJET                VARCHAR2(200),
    CONTENU              VARCHAR2(4000)      NOT NULL,  -- Contenu final après substitution
    CANAL                VARCHAR2(20)        NOT NULL,
    PRIORITE             VARCHAR2(10)        DEFAULT 'NORMALE',
    -- Envoi
    DATE_CREATION        TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
    DATE_ENVOI_PREVUE    TIMESTAMP,
    DATE_ENVOI_EFFECTIVE TIMESTAMP,
    -- Statistiques
    NB_DESTINATAIRES     NUMBER(6)           DEFAULT 0,
    NB_ENVOYES           NUMBER(6)           DEFAULT 0,
    NB_ECHECS            NUMBER(6)           DEFAULT 0,
    NB_LUS               NUMBER(6)           DEFAULT 0,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'BROUILLON' NOT NULL,
    CREE_PAR             VARCHAR2(100)       NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_NOTIF_MODELE    FOREIGN KEY (MODELE_ID)
                                     REFERENCES SS_MODELES_NOTIFICATION(MODELE_ID),
    CONSTRAINT FK_SS_NOTIF_ETAB      FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT CK_SS_NOTIF_CANAL     CHECK (CANAL IN ('SMS','WHATSAPP','EMAIL','PUSH','TOUS')),
    CONSTRAINT CK_SS_NOTIF_STATUT    CHECK (STATUT IN ('BROUILLON','PLANIFIE','EN_COURS','ENVOYE','ANNULE','ERREUR'))
);

COMMENT ON TABLE SS_NOTIFICATIONS IS 'Instances de notifications émises';

CREATE INDEX IDX_SS_NOTIF_ETAB ON SS_NOTIFICATIONS(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_NOTIF_STATUT ON SS_NOTIFICATIONS(STATUT);
CREATE INDEX IDX_SS_NOTIF_DATE ON SS_NOTIFICATIONS(DATE_CREATION);

PROMPT   ✓ Table SS_NOTIFICATIONS créée

-- ============================================================================
-- TABLE 43 : SS_NOTIFICATION_DEST
-- Description : Destinataires individuels de chaque notification.
-- ============================================================================
CREATE TABLE SS_NOTIFICATION_DEST (
    DEST_ID              NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_NOTIF_DEST PRIMARY KEY,
    NOTIFICATION_ID      NUMBER              NOT NULL,
    -- Destinataire
    TYPE_DESTINATAIRE    VARCHAR2(20)        NOT NULL,
    PARENT_ID            NUMBER,
    ELEVE_ID             NUMBER,
    ENSEIGNANT_ID        NUMBER,
    -- Contact
    TELEPHONE            VARCHAR2(20),
    EMAIL                VARCHAR2(150),
    -- Envoi
    STATUT_ENVOI         VARCHAR2(20)        DEFAULT 'EN_ATTENTE' NOT NULL,
    DATE_ENVOI           TIMESTAMP,
    DATE_LECTURE          TIMESTAMP,
    CODE_ERREUR          VARCHAR2(20),
    MESSAGE_ERREUR       VARCHAR2(300),
    NB_TENTATIVES        NUMBER(2)           DEFAULT 0,
    --
    CONSTRAINT FK_SS_NDEST_NOTIF     FOREIGN KEY (NOTIFICATION_ID)
                                     REFERENCES SS_NOTIFICATIONS(NOTIFICATION_ID) ON DELETE CASCADE,
    CONSTRAINT FK_SS_NDEST_PAR       FOREIGN KEY (PARENT_ID)
                                     REFERENCES SS_PARENTS(PARENT_ID),
    CONSTRAINT FK_SS_NDEST_ELEV      FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_NDEST_ENS       FOREIGN KEY (ENSEIGNANT_ID)
                                     REFERENCES SS_ENSEIGNANTS(ENSEIGNANT_ID),
    CONSTRAINT CK_SS_NDEST_TYPE      CHECK (TYPE_DESTINATAIRE IN ('PARENT','ELEVE','ENSEIGNANT','PERSONNEL','EXTERNE')),
    CONSTRAINT CK_SS_NDEST_STATUT    CHECK (STATUT_ENVOI IN ('EN_ATTENTE','ENVOYE','DELIVRE','LU','ECHEC'))
);

COMMENT ON TABLE SS_NOTIFICATION_DEST IS 'Destinataires individuels avec suivi de l''envoi';

CREATE INDEX IDX_SS_NDEST_NOTIF ON SS_NOTIFICATION_DEST(NOTIFICATION_ID);
CREATE INDEX IDX_SS_NDEST_PAR ON SS_NOTIFICATION_DEST(PARENT_ID);
CREATE INDEX IDX_SS_NDEST_STATUT ON SS_NOTIFICATION_DEST(STATUT_ENVOI);

PROMPT   ✓ Table SS_NOTIFICATION_DEST créée

-- ============================================================================
-- TABLE 44 : SS_SMS_LOGS
-- Description : Logs techniques des SMS envoyés via gateway.
-- ============================================================================
CREATE TABLE SS_SMS_LOGS (
    SMS_LOG_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_SMS_LOGS PRIMARY KEY,
    NOTIFICATION_ID      NUMBER,
    DEST_ID              NUMBER,
    -- SMS
    OPERATEUR_GATEWAY    VARCHAR2(50)        NOT NULL,  -- Nom du gateway SMS
    NUMERO_EXPEDITEUR    VARCHAR2(20),
    NUMERO_DESTINATAIRE  VARCHAR2(20)        NOT NULL,
    CONTENU              VARCHAR2(1000)      NOT NULL,
    NB_SEGMENTS          NUMBER(2)           DEFAULT 1,  -- Nombre de segments SMS
    -- API
    MESSAGE_ID_EXTERNE   VARCHAR2(100),       -- ID retourné par le gateway
    STATUT_API           VARCHAR2(30)        NOT NULL,
    CODE_REPONSE         VARCHAR2(20),
    MESSAGE_REPONSE      VARCHAR2(300),
    -- Dates
    DATE_ENVOI           TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
    DATE_DELIVERY        TIMESTAMP,
    -- Coût
    COUT_UNITAIRE        NUMBER(8,2),        -- Coût en GNF
    -- Audit
    IP_SOURCE            VARCHAR2(50),
    --
    CONSTRAINT FK_SS_SMSLOG_NOTIF    FOREIGN KEY (NOTIFICATION_ID)
                                     REFERENCES SS_NOTIFICATIONS(NOTIFICATION_ID),
    CONSTRAINT FK_SS_SMSLOG_DEST     FOREIGN KEY (DEST_ID)
                                     REFERENCES SS_NOTIFICATION_DEST(DEST_ID),
    CONSTRAINT CK_SS_SMSLOG_STATUT   CHECK (STATUT_API IN (
        'PENDING','SENT','DELIVERED','FAILED','REJECTED','EXPIRED'))
);

COMMENT ON TABLE SS_SMS_LOGS IS 'Logs techniques des envois SMS via gateway externe';

CREATE INDEX IDX_SS_SMSLOG_NOTIF ON SS_SMS_LOGS(NOTIFICATION_ID);
CREATE INDEX IDX_SS_SMSLOG_DATE ON SS_SMS_LOGS(DATE_ENVOI);
CREATE INDEX IDX_SS_SMSLOG_STATUT ON SS_SMS_LOGS(STATUT_API);

PROMPT   ✓ Table SS_SMS_LOGS créée

PROMPT
PROMPT ============================================
PROMPT   MODULE 7 — EXAMENS NATIONAUX
PROMPT   Création de 4 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 45 : SS_EXAMENS_NATIONAUX
-- Description : Sessions d'examens nationaux (CEP, BEPC, BAC).
-- ============================================================================
CREATE TABLE SS_EXAMENS_NATIONAUX (
    EXAMEN_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_EXAMENS PRIMARY KEY,
    ANNEE_ID             NUMBER              NOT NULL,
    -- Identification
    CODE                 VARCHAR2(20)        NOT NULL,
    TYPE_EXAMEN          VARCHAR2(20)        NOT NULL,  -- CEP, BEPC, BAC
    LIBELLE              VARCHAR2(200)       NOT NULL,
    SESSION_EXAMEN       VARCHAR2(20)        DEFAULT 'NORMALE' NOT NULL,
    -- Dates
    DATE_DEBUT           DATE                NOT NULL,
    DATE_FIN             DATE                NOT NULL,
    DATE_LIMITE_INSCRIPTION DATE,
    DATE_PUBLICATION_RESULTATS DATE,
    -- Statistiques nationales
    NB_INSCRITS          NUMBER(8),
    NB_PRESENTS          NUMBER(8),
    NB_ADMIS             NUMBER(8),
    TAUX_REUSSITE        NUMBER(5,2),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'PLANIFIE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_EXAM_ANNEE      FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT UK_SS_EXAM_CODE       UNIQUE (CODE, ANNEE_ID),
    CONSTRAINT CK_SS_EXAM_TYPE       CHECK (TYPE_EXAMEN IN ('CEP','BEPC','BAC')),
    CONSTRAINT CK_SS_EXAM_SESSION    CHECK (SESSION_EXAMEN IN ('NORMALE','REMPLACEMENT','RATTRAPAGE')),
    CONSTRAINT CK_SS_EXAM_STATUT     CHECK (STATUT IN ('PLANIFIE','INSCRIPTIONS','EN_COURS','CORRECTION','PUBLIE','ARCHIVE'))
);

COMMENT ON TABLE SS_EXAMENS_NATIONAUX IS 'Sessions d''examens nationaux : CEP, BEPC, BAC — Système éducatif guinéen';
COMMENT ON COLUMN SS_EXAMENS_NATIONAUX.TYPE_EXAMEN IS 'CEP=fin primaire, BEPC=fin collège, BAC=fin lycée';

CREATE INDEX IDX_SS_EXAM_ANNEE ON SS_EXAMENS_NATIONAUX(ANNEE_ID);
CREATE INDEX IDX_SS_EXAM_TYPE ON SS_EXAMENS_NATIONAUX(TYPE_EXAMEN);

PROMPT   ✓ Table SS_EXAMENS_NATIONAUX créée

-- ============================================================================
-- TABLE 46 : SS_CENTRES_EXAMEN
-- Description : Centres d'examens (établissements servant de centres).
-- ============================================================================
CREATE TABLE SS_CENTRES_EXAMEN (
    CENTRE_EXAMEN_ID     NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_CENTRES_EXAM PRIMARY KEY,
    EXAMEN_ID            NUMBER              NOT NULL,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    -- Centre
    CODE_CENTRE          VARCHAR2(20)        NOT NULL,
    NOM_CENTRE           VARCHAR2(200),
    RESPONSABLE          VARCHAR2(200),
    TELEPHONE            VARCHAR2(20),
    -- Capacité
    NB_SALLES            NUMBER(4),
    CAPACITE_TOTALE      NUMBER(5),
    NB_CANDIDATS_AFFECTES NUMBER(5)          DEFAULT 0,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_CEXAM_EXAM      FOREIGN KEY (EXAMEN_ID)
                                     REFERENCES SS_EXAMENS_NATIONAUX(EXAMEN_ID),
    CONSTRAINT FK_SS_CEXAM_ETAB      FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_CEXAM_UNIQUE    UNIQUE (EXAMEN_ID, ETABLISSEMENT_ID),
    CONSTRAINT CK_SS_CEXAM_STATUT    CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_CENTRES_EXAMEN IS 'Centres d''examens nationaux';

CREATE INDEX IDX_SS_CEXAM_EXAM ON SS_CENTRES_EXAMEN(EXAMEN_ID);

PROMPT   ✓ Table SS_CENTRES_EXAMEN créée

-- ============================================================================
-- TABLE 47 : SS_CANDIDATURES_EXAMEN
-- Description : Candidats inscrits aux examens nationaux.
-- ============================================================================
CREATE TABLE SS_CANDIDATURES_EXAMEN (
    CANDIDATURE_ID       NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_CAND_EXAM PRIMARY KEY,
    EXAMEN_ID            NUMBER              NOT NULL,
    ELEVE_ID             NUMBER              NOT NULL,
    CENTRE_EXAMEN_ID     NUMBER,
    INSCRIPTION_ID       NUMBER,             -- Lien vers inscription courante
    -- Identification
    NUMERO_CANDIDAT      VARCHAR2(30),       -- Numéro de table officiel
    -- Résultat global
    TOTAL_POINTS         NUMBER(8,2),
    TOTAL_COEFFICIENTS   NUMBER(5,1),
    MOYENNE_GENERALE     NUMBER(5,2),
    RANG                 NUMBER(6),
    MENTION              VARCHAR2(30),
    DECISION             VARCHAR2(20),       -- ADMIS, REFUSE, RATTRAPAGE
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'INSCRIT' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_CANDEX_EXAM     FOREIGN KEY (EXAMEN_ID)
                                     REFERENCES SS_EXAMENS_NATIONAUX(EXAMEN_ID),
    CONSTRAINT FK_SS_CANDEX_ELEV     FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_CANDEX_CENTRE   FOREIGN KEY (CENTRE_EXAMEN_ID)
                                     REFERENCES SS_CENTRES_EXAMEN(CENTRE_EXAMEN_ID),
    CONSTRAINT FK_SS_CANDEX_INSC     FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT UK_SS_CANDEX_UNIQUE   UNIQUE (EXAMEN_ID, ELEVE_ID),
    CONSTRAINT CK_SS_CANDEX_MENTION  CHECK (MENTION IS NULL OR MENTION IN (
        'EXCELLENT','TRES_BIEN','BIEN','ASSEZ_BIEN','PASSABLE')),
    CONSTRAINT CK_SS_CANDEX_DECISION CHECK (DECISION IS NULL OR DECISION IN (
        'ADMIS','REFUSE','RATTRAPAGE')),
    CONSTRAINT CK_SS_CANDEX_STATUT   CHECK (STATUT IN ('INSCRIT','CONFIRME','ABSENT','EXCLU','TRAITE'))
);

COMMENT ON TABLE SS_CANDIDATURES_EXAMEN IS 'Candidats inscrits aux examens nationaux';

CREATE INDEX IDX_SS_CANDEX_EXAM ON SS_CANDIDATURES_EXAMEN(EXAMEN_ID);
CREATE INDEX IDX_SS_CANDEX_ELEV ON SS_CANDIDATURES_EXAMEN(ELEVE_ID);
CREATE INDEX IDX_SS_CANDEX_CENTRE ON SS_CANDIDATURES_EXAMEN(CENTRE_EXAMEN_ID);

PROMPT   ✓ Table SS_CANDIDATURES_EXAMEN créée

-- ============================================================================
-- TABLE 48 : SS_RESULTATS_EXAMEN
-- Description : Résultats par matière aux examens nationaux.
-- ============================================================================
CREATE TABLE SS_RESULTATS_EXAMEN (
    RESULTAT_EXAM_ID     NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_RES_EXAM PRIMARY KEY,
    CANDIDATURE_ID       NUMBER              NOT NULL,
    MATIERE_ID           NUMBER              NOT NULL,
    -- Note
    NOTE_OBTENUE         NUMBER(5,2),
    NOTE_SUR             NUMBER(5,2)         DEFAULT 20,
    NOTE_RAMENEE_20      NUMBER(5,2),
    COEFFICIENT          NUMBER(3,1)         NOT NULL,
    POINTS               NUMBER(7,2),
    -- Statut
    EST_ABSENT           VARCHAR2(1)         DEFAULT 'N',
    OBSERVATION          VARCHAR2(200),
    --
    CONSTRAINT FK_SS_REXAM_CAND      FOREIGN KEY (CANDIDATURE_ID)
                                     REFERENCES SS_CANDIDATURES_EXAMEN(CANDIDATURE_ID),
    CONSTRAINT FK_SS_REXAM_MAT       FOREIGN KEY (MATIERE_ID)
                                     REFERENCES SS_MATIERES(MATIERE_ID),
    CONSTRAINT UK_SS_REXAM_UNIQUE    UNIQUE (CANDIDATURE_ID, MATIERE_ID),
    CONSTRAINT CK_SS_REXAM_ABSENT    CHECK (EST_ABSENT IN ('O','N'))
);

COMMENT ON TABLE SS_RESULTATS_EXAMEN IS 'Résultats par matière aux examens nationaux — export ministériel';

CREATE INDEX IDX_SS_REXAM_CAND ON SS_RESULTATS_EXAMEN(CANDIDATURE_ID);
CREATE INDEX IDX_SS_REXAM_MAT ON SS_RESULTATS_EXAMEN(MATIERE_ID);

PROMPT   ✓ Table SS_RESULTATS_EXAMEN créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULES 6 & 7 TERMINÉS — 8 tables créées
PROMPT ============================================
