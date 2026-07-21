-- ============================================================================
-- SMARTSCHOOL ERP — Script 07 : TABLES SÉCURITÉ & AUDIT
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module      : Sécurité & Audit (8 tables)
-- Tables      : SS_UTILISATEURS, SS_ROLES, SS_UTILISATEUR_ROLES,
--               SS_PERMISSIONS, SS_ROLE_PERMISSIONS, SS_AUDIT_TRAIL,
--               SS_SESSIONS, SS_CERTIFICATS
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 8 — SÉCURITÉ & AUDIT
PROMPT   Création de 8 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 49 : SS_UTILISATEURS
-- Description : Comptes utilisateurs du système.
--               Supporte l'authentification locale et LDAP.
-- ============================================================================
CREATE TABLE SS_UTILISATEURS (
    UTILISATEUR_ID       NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_UTILISATEURS PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER,             -- NULL pour super-admin national
    -- Authentification
    NOM_UTILISATEUR      VARCHAR2(100)       NOT NULL,
    MOT_DE_PASSE_HASH    VARCHAR2(256),      -- Hash SHA-256 ou bcrypt
    SEL                  VARCHAR2(100),      -- Salt pour le hash
    TYPE_AUTH            VARCHAR2(20)        DEFAULT 'LOCAL' NOT NULL,
    -- Identité
    NOM                  VARCHAR2(100)       NOT NULL,
    PRENOM               VARCHAR2(150)       NOT NULL,
    EMAIL                VARCHAR2(150),
    TELEPHONE            VARCHAR2(20),
    PHOTO_URL            VARCHAR2(500),
    -- Liaison avec d'autres entités
    ELEVE_ID             NUMBER,             -- Si portail élève
    PARENT_ID            NUMBER,             -- Si portail parent
    ENSEIGNANT_ID        NUMBER,             -- Si portail enseignant
    PERSONNEL_ID         NUMBER,             -- Si personnel
    -- Sécurité
    EST_VERROUILLE       VARCHAR2(1)         DEFAULT 'N' NOT NULL,
    NB_TENTATIVES_ECHEC  NUMBER(2)           DEFAULT 0,
    DATE_DERNIER_ECHEC   TIMESTAMP,
    DATE_DERNIER_CONNEXION TIMESTAMP,
    DATE_EXPIRATION_MDP  DATE,
    DOIT_CHANGER_MDP     VARCHAR2(1)         DEFAULT 'O' NOT NULL,
    -- Préférences
    LANGUE               VARCHAR2(10)        DEFAULT 'FR',
    THEME                VARCHAR2(20)        DEFAULT 'CLAIR',
    FUSEAU_HORAIRE       VARCHAR2(50)        DEFAULT 'Africa/Conakry',
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    DATE_CREATION        TIMESTAMP           DEFAULT SYSTIMESTAMP,
    DATE_DESACTIVATION   TIMESTAMP,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_USER_ETAB       FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_USER_ELEV       FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_USER_PAR        FOREIGN KEY (PARENT_ID)
                                     REFERENCES SS_PARENTS(PARENT_ID),
    CONSTRAINT FK_SS_USER_ENS        FOREIGN KEY (ENSEIGNANT_ID)
                                     REFERENCES SS_ENSEIGNANTS(ENSEIGNANT_ID),
    CONSTRAINT FK_SS_USER_PERS       FOREIGN KEY (PERSONNEL_ID)
                                     REFERENCES SS_PERSONNEL(PERSONNEL_ID),
    CONSTRAINT UK_SS_USER_NOM        UNIQUE (NOM_UTILISATEUR),
    CONSTRAINT CK_SS_USER_AUTH       CHECK (TYPE_AUTH IN ('LOCAL','LDAP','SSO','APEX')),
    CONSTRAINT CK_SS_USER_VERR       CHECK (EST_VERROUILLE IN ('O','N')),
    CONSTRAINT CK_SS_USER_MDP        CHECK (DOIT_CHANGER_MDP IN ('O','N')),
    CONSTRAINT CK_SS_USER_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF','VERROUILLE','EXPIRE')),
    CONSTRAINT CK_SS_USER_THEME      CHECK (THEME IN ('CLAIR','SOMBRE','AUTO'))
);

COMMENT ON TABLE SS_UTILISATEURS IS 'Comptes utilisateurs avec support multi-portail (admin, enseignant, parent, élève)';
COMMENT ON COLUMN SS_UTILISATEURS.FUSEAU_HORAIRE IS 'Africa/Conakry (GMT+0) par défaut — Guinée';

CREATE INDEX IDX_SS_USER_ETAB ON SS_UTILISATEURS(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_USER_STATUT ON SS_UTILISATEURS(STATUT);
CREATE INDEX IDX_SS_USER_EMAIL ON SS_UTILISATEURS(UPPER(EMAIL));

PROMPT   ✓ Table SS_UTILISATEURS créée

-- ============================================================================
-- TABLE 50 : SS_ROLES
-- Description : Rôles système avec hiérarchie optionnelle.
-- ============================================================================
CREATE TABLE SS_ROLES (
    ROLE_ID              NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_ROLES PRIMARY KEY,
    CODE                 VARCHAR2(30)        NOT NULL,
    LIBELLE              VARCHAR2(100)       NOT NULL,
    DESCRIPTION          VARCHAR2(500),
    NIVEAU_HIERARCHIE    NUMBER(2)           DEFAULT 0,  -- 0=plus élevé
    ROLE_PARENT_ID       NUMBER,             -- Héritage de rôle
    EST_SYSTEME          VARCHAR2(1)         DEFAULT 'N',  -- Rôle système non modifiable
    PORTAIL              VARCHAR2(20),       -- ADMIN, ENSEIGNANT, PARENT, ELEVE
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT UK_SS_ROLE_CODE       UNIQUE (CODE),
    CONSTRAINT FK_SS_ROLE_PARENT     FOREIGN KEY (ROLE_PARENT_ID)
                                     REFERENCES SS_ROLES(ROLE_ID),
    CONSTRAINT CK_SS_ROLE_SYSTEME    CHECK (EST_SYSTEME IN ('O','N')),
    CONSTRAINT CK_SS_ROLE_PORTAIL    CHECK (PORTAIL IS NULL OR PORTAIL IN (
        'ADMIN','ENSEIGNANT','PARENT','ELEVE','MINISTERE','TOUS')),
    CONSTRAINT CK_SS_ROLE_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_ROLES IS 'Rôles système avec hiérarchie : SUPER_ADMIN > DIRECTEUR > CENSEUR > ENSEIGNANT > PARENT > ELEVE';

PROMPT   ✓ Table SS_ROLES créée

-- ============================================================================
-- TABLE 51 : SS_UTILISATEUR_ROLES
-- Description : Association M:N entre utilisateurs et rôles.
--               Un utilisateur peut avoir plusieurs rôles dans différents établissements.
-- ============================================================================
CREATE TABLE SS_UTILISATEUR_ROLES (
    UTILISATEUR_ROLE_ID  NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_USER_ROLES PRIMARY KEY,
    UTILISATEUR_ID       NUMBER              NOT NULL,
    ROLE_ID              NUMBER              NOT NULL,
    ETABLISSEMENT_ID     NUMBER,             -- NULL = rôle global
    -- Validité
    DATE_DEBUT           DATE                DEFAULT SYSDATE,
    DATE_FIN             DATE,               -- NULL = permanent
    EST_ACTIF            VARCHAR2(1)         DEFAULT 'O' NOT NULL,
    ATTRIBUE_PAR         VARCHAR2(100),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_UROLE_USER      FOREIGN KEY (UTILISATEUR_ID)
                                     REFERENCES SS_UTILISATEURS(UTILISATEUR_ID),
    CONSTRAINT FK_SS_UROLE_ROLE      FOREIGN KEY (ROLE_ID)
                                     REFERENCES SS_ROLES(ROLE_ID),
    CONSTRAINT FK_SS_UROLE_ETAB      FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_UROLE_UNIQUE    UNIQUE (UTILISATEUR_ID, ROLE_ID, ETABLISSEMENT_ID),
    CONSTRAINT CK_SS_UROLE_ACTIF     CHECK (EST_ACTIF IN ('O','N'))
);

COMMENT ON TABLE SS_UTILISATEUR_ROLES IS 'Association utilisateurs ↔ rôles avec portée établissement';

CREATE INDEX IDX_SS_UROLE_USER ON SS_UTILISATEUR_ROLES(UTILISATEUR_ID);
CREATE INDEX IDX_SS_UROLE_ROLE ON SS_UTILISATEUR_ROLES(ROLE_ID);

PROMPT   ✓ Table SS_UTILISATEUR_ROLES créée

-- ============================================================================
-- TABLE 52 : SS_PERMISSIONS
-- Description : Permissions granulaires du système.
-- ============================================================================
CREATE TABLE SS_PERMISSIONS (
    PERMISSION_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_PERMISSIONS PRIMARY KEY,
    CODE                 VARCHAR2(50)        NOT NULL,
    LIBELLE              VARCHAR2(200)       NOT NULL,
    MODULE               VARCHAR2(50)        NOT NULL,
    ACTION               VARCHAR2(20)        NOT NULL,  -- READ, CREATE, UPDATE, DELETE, EXPORT, APPROVE
    DESCRIPTION          VARCHAR2(500),
    --
    CONSTRAINT UK_SS_PERM_CODE       UNIQUE (CODE),
    CONSTRAINT CK_SS_PERM_ACTION     CHECK (ACTION IN (
        'READ','CREATE','UPDATE','DELETE','EXPORT','IMPORT','APPROVE','EXECUTE','ALL'))
);

COMMENT ON TABLE SS_PERMISSIONS IS 'Permissions granulaires : MODULE.ENTITE.ACTION';

PROMPT   ✓ Table SS_PERMISSIONS créée

-- ============================================================================
-- TABLE 53 : SS_ROLE_PERMISSIONS
-- Description : Association M:N entre rôles et permissions.
-- ============================================================================
CREATE TABLE SS_ROLE_PERMISSIONS (
    ROLE_PERMISSION_ID   NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_ROLE_PERM PRIMARY KEY,
    ROLE_ID              NUMBER              NOT NULL,
    PERMISSION_ID        NUMBER              NOT NULL,
    EST_ACCORDE          VARCHAR2(1)         DEFAULT 'O' NOT NULL,
    --
    CONSTRAINT FK_SS_RPERM_ROLE      FOREIGN KEY (ROLE_ID)
                                     REFERENCES SS_ROLES(ROLE_ID),
    CONSTRAINT FK_SS_RPERM_PERM      FOREIGN KEY (PERMISSION_ID)
                                     REFERENCES SS_PERMISSIONS(PERMISSION_ID),
    CONSTRAINT UK_SS_RPERM_UNIQUE    UNIQUE (ROLE_ID, PERMISSION_ID),
    CONSTRAINT CK_SS_RPERM_ACCORD    CHECK (EST_ACCORDE IN ('O','N'))
);

COMMENT ON TABLE SS_ROLE_PERMISSIONS IS 'Association rôles ↔ permissions (matrice d''autorisation)';

CREATE INDEX IDX_SS_RPERM_ROLE ON SS_ROLE_PERMISSIONS(ROLE_ID);
CREATE INDEX IDX_SS_RPERM_PERM ON SS_ROLE_PERMISSIONS(PERMISSION_ID);

PROMPT   ✓ Table SS_ROLE_PERMISSIONS créée

-- ============================================================================
-- TABLE 54 : SS_AUDIT_TRAIL
-- Description : Journal d'audit complet de toutes les opérations.
--               Capture automatiquement toute modification via triggers.
--               CRITIQUE pour la conformité et la traçabilité.
-- ============================================================================
CREATE TABLE SS_AUDIT_TRAIL (
    AUDIT_ID             NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_AUDIT PRIMARY KEY,
    -- Qui
    NOM_UTILISATEUR      VARCHAR2(100)       NOT NULL,
    UTILISATEUR_ID       NUMBER,
    ADRESSE_IP           VARCHAR2(50),
    -- Quoi
    NOM_TABLE            VARCHAR2(50)        NOT NULL,
    TYPE_OPERATION       VARCHAR2(10)        NOT NULL,  -- INSERT, UPDATE, DELETE
    CLE_PRIMAIRE         VARCHAR2(100),      -- Valeur de la clé primaire
    -- Détails du changement
    ANCIEN_VALEURS       CLOB,               -- JSON des anciennes valeurs
    NOUVELLES_VALEURS    CLOB,               -- JSON des nouvelles valeurs
    COLONNES_MODIFIEES   VARCHAR2(4000),     -- Liste des colonnes modifiées
    -- Contexte
    NOM_MODULE           VARCHAR2(50),
    DESCRIPTION          VARCHAR2(500),
    -- Quand
    DATE_OPERATION       TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
    -- Session APEX
    APEX_SESSION_ID      NUMBER,
    APEX_PAGE_ID         NUMBER,
    APEX_APP_ID          NUMBER,
    --
    CONSTRAINT CK_SS_AUDIT_TYPE      CHECK (TYPE_OPERATION IN ('INSERT','UPDATE','DELETE'))
) 
PARTITION BY RANGE (DATE_OPERATION) (
    PARTITION P_2025 VALUES LESS THAN (TIMESTAMP '2026-01-01 00:00:00'),
    PARTITION P_2026_Q1 VALUES LESS THAN (TIMESTAMP '2026-04-01 00:00:00'),
    PARTITION P_2026_Q2 VALUES LESS THAN (TIMESTAMP '2026-07-01 00:00:00'),
    PARTITION P_2026_Q3 VALUES LESS THAN (TIMESTAMP '2026-10-01 00:00:00'),
    PARTITION P_2026_Q4 VALUES LESS THAN (TIMESTAMP '2027-01-01 00:00:00'),
    PARTITION P_FUTURE VALUES LESS THAN (MAXVALUE)
);

COMMENT ON TABLE SS_AUDIT_TRAIL IS 'Journal d''audit partitionné — traçabilité complète de toutes les opérations';
COMMENT ON COLUMN SS_AUDIT_TRAIL.ANCIEN_VALEURS IS 'JSON des valeurs avant modification (UPDATE/DELETE)';
COMMENT ON COLUMN SS_AUDIT_TRAIL.NOUVELLES_VALEURS IS 'JSON des nouvelles valeurs (INSERT/UPDATE)';

CREATE INDEX IDX_SS_AUDIT_USER ON SS_AUDIT_TRAIL(NOM_UTILISATEUR) LOCAL;
CREATE INDEX IDX_SS_AUDIT_TABLE ON SS_AUDIT_TRAIL(NOM_TABLE) LOCAL;
CREATE INDEX IDX_SS_AUDIT_DATE ON SS_AUDIT_TRAIL(DATE_OPERATION) LOCAL;
CREATE INDEX IDX_SS_AUDIT_TYPE ON SS_AUDIT_TRAIL(TYPE_OPERATION) LOCAL;
CREATE INDEX IDX_SS_AUDIT_CLE ON SS_AUDIT_TRAIL(NOM_TABLE, CLE_PRIMAIRE) LOCAL;

PROMPT   ✓ Table SS_AUDIT_TRAIL créée (partitionnée)

-- ============================================================================
-- TABLE 55 : SS_SESSIONS
-- Description : Sessions utilisateurs actives.
-- ============================================================================
CREATE TABLE SS_SESSIONS (
    SESSION_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_SESSIONS PRIMARY KEY,
    UTILISATEUR_ID       NUMBER              NOT NULL,
    -- Session
    TOKEN_SESSION        VARCHAR2(256)       NOT NULL,
    DATE_DEBUT           TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
    DATE_DERNIERE_ACTIVITE TIMESTAMP,
    DATE_EXPIRATION      TIMESTAMP,
    DATE_FIN             TIMESTAMP,
    -- Contexte
    ADRESSE_IP           VARCHAR2(50),
    USER_AGENT           VARCHAR2(500),
    APPAREIL             VARCHAR2(100),
    NAVIGATEUR           VARCHAR2(100),
    -- APEX
    APEX_SESSION_ID      NUMBER,
    APEX_APP_ID          NUMBER,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIVE' NOT NULL,
    --
    CONSTRAINT FK_SS_SESS_USER       FOREIGN KEY (UTILISATEUR_ID)
                                     REFERENCES SS_UTILISATEURS(UTILISATEUR_ID),
    CONSTRAINT UK_SS_SESS_TOKEN      UNIQUE (TOKEN_SESSION),
    CONSTRAINT CK_SS_SESS_STATUT     CHECK (STATUT IN ('ACTIVE','EXPIREE','FERMEE','FORCEE'))
);

COMMENT ON TABLE SS_SESSIONS IS 'Sessions utilisateurs pour le suivi de connexion';

CREATE INDEX IDX_SS_SESS_USER ON SS_SESSIONS(UTILISATEUR_ID);
CREATE INDEX IDX_SS_SESS_STATUT ON SS_SESSIONS(STATUT);

PROMPT   ✓ Table SS_SESSIONS créée

-- ============================================================================
-- TABLE 56 : SS_CERTIFICATS
-- Description : Certificats et documents officiels émis.
--               Scolarité, transfert, réussite, etc.
-- ============================================================================
CREATE TABLE SS_CERTIFICATS (
    CERTIFICAT_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_CERTIFICATS PRIMARY KEY,
    ELEVE_ID             NUMBER              NOT NULL,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    -- Document
    TYPE_DOCUMENT        VARCHAR2(50)        NOT NULL,
    NUMERO_DOCUMENT      VARCHAR2(50)        NOT NULL,
    OBJET                VARCHAR2(300),
    CONTENU              CLOB,               -- Contenu HTML/texte du document
    -- Dates
    DATE_EMISSION        DATE                DEFAULT SYSDATE NOT NULL,
    DATE_VALIDITE        DATE,
    -- Émission
    EMIS_PAR             VARCHAR2(100)       NOT NULL,
    FONCTION_EMETTEUR    VARCHAR2(100),
    -- Impression
    NB_IMPRESSIONS       NUMBER(3)           DEFAULT 0,
    DATE_DERNIERE_IMPRESSION DATE,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'EMIS' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_CERT_ELEV       FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_CERT_ETAB       FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_CERT_NUM        UNIQUE (NUMERO_DOCUMENT),
    CONSTRAINT CK_SS_CERT_TYPE       CHECK (TYPE_DOCUMENT IN (
        'CERTIFICAT_SCOLARITE','CERTIFICAT_TRANSFERT','CERTIFICAT_REUSSITE',
        'ATTESTATION_INSCRIPTION','ATTESTATION_INFO','RELEVE_NOTES',
        'BULLETIN_FIN_CYCLE','DIPLOME','CERTIFICAT_BONNE_CONDUITE','AUTRE')),
    CONSTRAINT CK_SS_CERT_STATUT     CHECK (STATUT IN ('EMIS','ANNULE','EXPIRE'))
);

COMMENT ON TABLE SS_CERTIFICATS IS 'Documents officiels émis : certificats, attestations, relevés de notes';

CREATE INDEX IDX_SS_CERT_ELEV ON SS_CERTIFICATS(ELEVE_ID);
CREATE INDEX IDX_SS_CERT_ETAB ON SS_CERTIFICATS(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_CERT_TYPE ON SS_CERTIFICATS(TYPE_DOCUMENT);

PROMPT   ✓ Table SS_CERTIFICATS créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULE 8 TERMINÉ — 8 tables créées
PROMPT ============================================
