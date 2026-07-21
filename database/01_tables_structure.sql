-- ============================================================================
-- SMARTSCHOOL ERP — Script 01 : TABLES STRUCTURE INSTITUTIONNELLE
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module      : Structure Institutionnelle (8 tables)
-- Tables      : SS_ETABLISSEMENTS, SS_ANNEES_SCOLAIRES, SS_TRIMESTRES,
--               SS_CYCLES, SS_NIVEAUX, SS_SECTIONS, SS_SALLES, SS_CLASSES
-- Norme       : 3NF — Contraintes complètes — Audit intégré
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 1 — STRUCTURE INSTITUTIONNELLE
PROMPT   Création de 8 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 1 : SS_ETABLISSEMENTS
-- Description : Table racine du système multi-établissements.
--               Chaque école/lycée/collège est un établissement distinct.
-- ============================================================================
CREATE TABLE SS_ETABLISSEMENTS (
    ETABLISSEMENT_ID     NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1) 
                                             CONSTRAINT PK_SS_ETABLISSEMENTS PRIMARY KEY,
    CODE                 VARCHAR2(20)        NOT NULL,
    NOM                  VARCHAR2(200)       NOT NULL,
    TYPE_ETABLISSEMENT   VARCHAR2(30)        NOT NULL,  -- PUBLIC, PRIVE, COMMUNAUTAIRE, FRANCO_ARABE
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    ADRESSE              VARCHAR2(500),
    VILLE                VARCHAR2(100),
    REGION               VARCHAR2(100),      -- 8 régions administratives de Guinée
    PREFECTURE           VARCHAR2(100),      -- 33 préfectures + Conakry
    SOUS_PREFECTURE      VARCHAR2(100),
    TELEPHONE            VARCHAR2(20),
    TELEPHONE_2          VARCHAR2(20),
    EMAIL                VARCHAR2(150),
    SITE_WEB             VARCHAR2(200),
    DIRECTEUR            VARCHAR2(200),
    DIRECTEUR_TELEPHONE  VARCHAR2(20),
    LOGO_URL             VARCHAR2(500),
    SLOGAN               VARCHAR2(300),
    CAPACITE_MAX         NUMBER(6)           DEFAULT 0,
    LATITUDE             NUMBER(10,7),       -- Géolocalisation
    LONGITUDE            NUMBER(10,7),
    CODE_MINISTERE       VARCHAR2(30),       -- Code officiel du Ministère de l'Éducation
    DATE_CREATION        DATE                DEFAULT SYSDATE,
    DATE_AGREMENT        DATE,               -- Date d'agrément officiel
    NUMERO_AGREMENT      VARCHAR2(50),
    -- Champs d'audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT UK_SS_ETAB_CODE       UNIQUE (CODE),
    CONSTRAINT CK_SS_ETAB_TYPE       CHECK (TYPE_ETABLISSEMENT IN (
        'PUBLIC','PRIVE','COMMUNAUTAIRE','FRANCO_ARABE','CONFESSIONNEL')),
    CONSTRAINT CK_SS_ETAB_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF','SUSPENDU','FERME')),
    CONSTRAINT CK_SS_ETAB_REGION     CHECK (REGION IN (
        'CONAKRY','BOKE','FARANAH','KANKAN','KINDIA','LABE','MAMOU','NZEREKORE'))
);

COMMENT ON TABLE SS_ETABLISSEMENTS IS 'Table des établissements scolaires du système national';
COMMENT ON COLUMN SS_ETABLISSEMENTS.CODE IS 'Code unique identifiant l''établissement (ex: ETB-CKY-001)';
COMMENT ON COLUMN SS_ETABLISSEMENTS.TYPE_ETABLISSEMENT IS 'Type : PUBLIC, PRIVE, COMMUNAUTAIRE, FRANCO_ARABE, CONFESSIONNEL';
COMMENT ON COLUMN SS_ETABLISSEMENTS.CODE_MINISTERE IS 'Code officiel attribué par le Ministère de l''Éducation Nationale';
COMMENT ON COLUMN SS_ETABLISSEMENTS.REGION IS 'Région administrative parmi les 8 régions de Guinée';

-- Index pour les recherches fréquentes
CREATE INDEX IDX_SS_ETAB_NOM ON SS_ETABLISSEMENTS(UPPER(NOM));
CREATE INDEX IDX_SS_ETAB_REGION ON SS_ETABLISSEMENTS(REGION);
CREATE INDEX IDX_SS_ETAB_TYPE ON SS_ETABLISSEMENTS(TYPE_ETABLISSEMENT);
CREATE INDEX IDX_SS_ETAB_STATUT ON SS_ETABLISSEMENTS(STATUT);

PROMPT   ✓ Table SS_ETABLISSEMENTS créée

-- ============================================================================
-- TABLE 2 : SS_ANNEES_SCOLAIRES
-- Description : Années académiques avec gestion de l'année courante.
--               Une seule année peut être marquée comme "courante" par établissement.
-- ============================================================================
CREATE TABLE SS_ANNEES_SCOLAIRES (
    ANNEE_ID             NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_ANNEES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    CODE                 VARCHAR2(20)        NOT NULL,  -- Ex: 2025-2026
    LIBELLE              VARCHAR2(100)       NOT NULL,  -- Ex: Année Scolaire 2025-2026
    DATE_DEBUT           DATE                NOT NULL,
    DATE_FIN             DATE                NOT NULL,
    STATUT               VARCHAR2(20)        DEFAULT 'PLANIFIEE' NOT NULL,
    EST_COURANTE         VARCHAR2(1)         DEFAULT 'N' NOT NULL,
    DATE_RENTREE         DATE,               -- Date officielle de rentrée
    DATE_FIN_COURS       DATE,               -- Dernier jour de cours
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_ANNEE_ETAB      FOREIGN KEY (ETABLISSEMENT_ID) 
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_ANNEE_CODE      UNIQUE (ETABLISSEMENT_ID, CODE),
    CONSTRAINT CK_SS_ANNEE_STATUT    CHECK (STATUT IN ('PLANIFIEE','EN_COURS','TERMINEE','ARCHIVEE')),
    CONSTRAINT CK_SS_ANNEE_COURANTE  CHECK (EST_COURANTE IN ('O','N')),
    CONSTRAINT CK_SS_ANNEE_DATES     CHECK (DATE_FIN > DATE_DEBUT)
);

COMMENT ON TABLE SS_ANNEES_SCOLAIRES IS 'Années scolaires par établissement';
COMMENT ON COLUMN SS_ANNEES_SCOLAIRES.EST_COURANTE IS 'O = Année en cours, N = Autre (une seule O par établissement)';

CREATE INDEX IDX_SS_ANNEE_ETAB ON SS_ANNEES_SCOLAIRES(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_ANNEE_COURANTE ON SS_ANNEES_SCOLAIRES(ETABLISSEMENT_ID, EST_COURANTE);

PROMPT   ✓ Table SS_ANNEES_SCOLAIRES créée

-- ============================================================================
-- TABLE 3 : SS_TRIMESTRES
-- Description : Périodes trimestrielles de l'année scolaire.
--               Système guinéen : 3 trimestres standard.
-- ============================================================================
CREATE TABLE SS_TRIMESTRES (
    TRIMESTRE_ID         NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_TRIMESTRES PRIMARY KEY,
    ANNEE_ID             NUMBER              NOT NULL,
    CODE                 VARCHAR2(10)        NOT NULL,  -- T1, T2, T3
    LIBELLE              VARCHAR2(100)       NOT NULL,  -- 1er Trimestre, 2ème Trimestre...
    NUMERO               NUMBER(1)           NOT NULL,  -- 1, 2, 3
    DATE_DEBUT           DATE                NOT NULL,
    DATE_FIN             DATE                NOT NULL,
    DATE_DEBUT_SAISIE    DATE,               -- Début autorisé pour saisie de notes
    DATE_FIN_SAISIE      DATE,               -- Fin autorisée pour saisie de notes
    STATUT               VARCHAR2(20)        DEFAULT 'PLANIFIE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_TRIM_ANNEE      FOREIGN KEY (ANNEE_ID) 
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT UK_SS_TRIM_CODE       UNIQUE (ANNEE_ID, CODE),
    CONSTRAINT UK_SS_TRIM_NUM        UNIQUE (ANNEE_ID, NUMERO),
    CONSTRAINT CK_SS_TRIM_NUMERO     CHECK (NUMERO BETWEEN 1 AND 3),
    CONSTRAINT CK_SS_TRIM_STATUT     CHECK (STATUT IN ('PLANIFIE','EN_COURS','SAISIE_NOTES','CLOTURE','ARCHIVE')),
    CONSTRAINT CK_SS_TRIM_DATES      CHECK (DATE_FIN > DATE_DEBUT)
);

COMMENT ON TABLE SS_TRIMESTRES IS 'Trimestres de l''année scolaire (3 trimestres par année)';
COMMENT ON COLUMN SS_TRIMESTRES.DATE_DEBUT_SAISIE IS 'Date à partir de laquelle les enseignants peuvent saisir les notes';
COMMENT ON COLUMN SS_TRIMESTRES.DATE_FIN_SAISIE IS 'Date limite de saisie des notes';

CREATE INDEX IDX_SS_TRIM_ANNEE ON SS_TRIMESTRES(ANNEE_ID);

PROMPT   ✓ Table SS_TRIMESTRES créée

-- ============================================================================
-- TABLE 4 : SS_CYCLES
-- Description : Cycles d'enseignement (Primaire, Collège, Lycée).
--               Adapté au système éducatif guinéen.
-- ============================================================================
CREATE TABLE SS_CYCLES (
    CYCLE_ID             NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_CYCLES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    CODE                 VARCHAR2(20)        NOT NULL,
    LIBELLE              VARCHAR2(100)       NOT NULL,
    DESCRIPTION          VARCHAR2(500),
    ORDRE                NUMBER(2)           NOT NULL,  -- Ordre d'affichage
    DUREE_ANNEES         NUMBER(1),          -- Nombre d'années dans le cycle
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_CYCLE_ETAB      FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_CYCLE_CODE      UNIQUE (ETABLISSEMENT_ID, CODE),
    CONSTRAINT UK_SS_CYCLE_ORDRE     UNIQUE (ETABLISSEMENT_ID, ORDRE)
);

COMMENT ON TABLE SS_CYCLES IS 'Cycles d''enseignement : Primaire (6 ans), Collège (4 ans), Lycée (3 ans)';
COMMENT ON COLUMN SS_CYCLES.ORDRE IS 'Ordre séquentiel : 1=Primaire, 2=Collège, 3=Lycée';

CREATE INDEX IDX_SS_CYCLE_ETAB ON SS_CYCLES(ETABLISSEMENT_ID);

PROMPT   ✓ Table SS_CYCLES créée

-- ============================================================================
-- TABLE 5 : SS_NIVEAUX
-- Description : Niveaux d'études au sein d'un cycle.
--               Ex: 7ème, 8ème, 9ème année (collège guinéen)
-- ============================================================================
CREATE TABLE SS_NIVEAUX (
    NIVEAU_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_NIVEAUX PRIMARY KEY,
    CYCLE_ID             NUMBER              NOT NULL,
    CODE                 VARCHAR2(20)        NOT NULL,
    LIBELLE              VARCHAR2(100)       NOT NULL,
    ORDRE                NUMBER(2)           NOT NULL,
    EST_EXAMEN           VARCHAR2(1)         DEFAULT 'N' NOT NULL,  -- Niveau d'examen national (CEP, BEPC, BAC)
    EXAMEN_NATIONAL      VARCHAR2(30),       -- CEP, BEPC, BAC
    DESCRIPTION          VARCHAR2(300),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_NIV_CYCLE       FOREIGN KEY (CYCLE_ID)
                                     REFERENCES SS_CYCLES(CYCLE_ID),
    CONSTRAINT UK_SS_NIV_CODE        UNIQUE (CYCLE_ID, CODE),
    CONSTRAINT UK_SS_NIV_ORDRE       UNIQUE (CYCLE_ID, ORDRE),
    CONSTRAINT CK_SS_NIV_EXAMEN      CHECK (EST_EXAMEN IN ('O','N')),
    CONSTRAINT CK_SS_NIV_EXAM_NAT    CHECK (EXAMEN_NATIONAL IS NULL OR 
                                     EXAMEN_NATIONAL IN ('CEP','BEPC','BAC'))
);

COMMENT ON TABLE SS_NIVEAUX IS 'Niveaux d''études : 1ère à 6ème année (primaire), 7ème à 10ème (collège), 11ème à 13ème (lycée)';
COMMENT ON COLUMN SS_NIVEAUX.EST_EXAMEN IS 'O si c''est un niveau d''examen national (6ème=CEP, 10ème=BEPC, 13ème=BAC)';

CREATE INDEX IDX_SS_NIV_CYCLE ON SS_NIVEAUX(CYCLE_ID);

PROMPT   ✓ Table SS_NIVEAUX créée

-- ============================================================================
-- TABLE 6 : SS_SECTIONS
-- Description : Sections/Filières disponibles.
--               Applicable principalement au lycée (Sciences, Lettres, etc.)
-- ============================================================================
CREATE TABLE SS_SECTIONS (
    SECTION_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_SECTIONS PRIMARY KEY,
    CODE                 VARCHAR2(20)        NOT NULL,
    LIBELLE              VARCHAR2(100)       NOT NULL,
    DESCRIPTION          VARCHAR2(300),
    APPLICABLE_CYCLE     VARCHAR2(20),       -- PRIMAIRE, COLLEGE, LYCEE, TOUS
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT UK_SS_SECT_CODE       UNIQUE (CODE),
    CONSTRAINT CK_SS_SECT_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_SECTIONS IS 'Sections/Filières : Sciences Expérimentales, Sciences Mathématiques, Sciences Sociales, etc.';
COMMENT ON COLUMN SS_SECTIONS.APPLICABLE_CYCLE IS 'Cycle auquel la section s''applique (surtout Lycée en Guinée)';

PROMPT   ✓ Table SS_SECTIONS créée

-- ============================================================================
-- TABLE 7 : SS_SALLES
-- Description : Salles de classe et espaces physiques de l'établissement.
-- ============================================================================
CREATE TABLE SS_SALLES (
    SALLE_ID             NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_SALLES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    CODE                 VARCHAR2(20)        NOT NULL,
    NOM                  VARCHAR2(100)       NOT NULL,
    CAPACITE             NUMBER(4)           DEFAULT 0,
    TYPE_SALLE           VARCHAR2(30)        DEFAULT 'CLASSE' NOT NULL,
    ETAGE                VARCHAR2(20),
    BATIMENT             VARCHAR2(50),
    EQUIPEMENTS          VARCHAR2(500),      -- Liste des équipements disponibles
    DISPONIBLE           VARCHAR2(1)         DEFAULT 'O' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_SALLE_ETAB      FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_SALLE_CODE      UNIQUE (ETABLISSEMENT_ID, CODE),
    CONSTRAINT CK_SS_SALLE_TYPE      CHECK (TYPE_SALLE IN (
        'CLASSE','LABORATOIRE','INFORMATIQUE','BIBLIOTHEQUE','SPORT','REUNION','ADMINISTRATION','AUTRE')),
    CONSTRAINT CK_SS_SALLE_DISPO     CHECK (DISPONIBLE IN ('O','N'))
);

COMMENT ON TABLE SS_SALLES IS 'Salles et espaces physiques de l''établissement';

CREATE INDEX IDX_SS_SALLE_ETAB ON SS_SALLES(ETABLISSEMENT_ID);

PROMPT   ✓ Table SS_SALLES créée

-- ============================================================================
-- TABLE 8 : SS_CLASSES
-- Description : Classes effectives (intersection d'un niveau, une section, 
--               une salle et une année scolaire).
--               Table centrale du système — la plupart des modules y référent.
-- ============================================================================
CREATE TABLE SS_CLASSES (
    CLASSE_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_CLASSES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    ANNEE_ID             NUMBER              NOT NULL,
    NIVEAU_ID            NUMBER              NOT NULL,
    SECTION_ID           NUMBER,             -- NULL pour primaire/collège sans section
    SALLE_ID             NUMBER,             -- Peut être NULL si pas de salle attitrée
    CODE                 VARCHAR2(30)        NOT NULL,  -- Ex: 7A, 10B-SC, T-D
    LIBELLE              VARCHAR2(150)       NOT NULL,  -- Ex: 7ème Année A
    CAPACITE_MAX         NUMBER(4)           DEFAULT 50,
    EFFECTIF_ACTUEL      NUMBER(4)           DEFAULT 0,
    PROFESSEUR_PRINCIPAL NUMBER,             -- FK vers SS_ENSEIGNANTS (ajouté après création)
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIVE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_CLASS_ETAB      FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_CLASS_ANNEE     FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT FK_SS_CLASS_NIV       FOREIGN KEY (NIVEAU_ID)
                                     REFERENCES SS_NIVEAUX(NIVEAU_ID),
    CONSTRAINT FK_SS_CLASS_SECT      FOREIGN KEY (SECTION_ID)
                                     REFERENCES SS_SECTIONS(SECTION_ID),
    CONSTRAINT FK_SS_CLASS_SALLE     FOREIGN KEY (SALLE_ID)
                                     REFERENCES SS_SALLES(SALLE_ID),
    CONSTRAINT UK_SS_CLASS_CODE      UNIQUE (ETABLISSEMENT_ID, ANNEE_ID, CODE),
    CONSTRAINT CK_SS_CLASS_STATUT    CHECK (STATUT IN ('ACTIVE','INACTIVE','ARCHIVEE')),
    CONSTRAINT CK_SS_CLASS_EFFECTIF  CHECK (EFFECTIF_ACTUEL >= 0)
);

COMMENT ON TABLE SS_CLASSES IS 'Classes effectives : combinaison Niveau + Section + Année + Salle';
COMMENT ON COLUMN SS_CLASSES.PROFESSEUR_PRINCIPAL IS 'FK vers SS_ENSEIGNANTS — ajoutée par ALTER après création de SS_ENSEIGNANTS';
COMMENT ON COLUMN SS_CLASSES.EFFECTIF_ACTUEL IS 'Mis à jour automatiquement par trigger sur SS_INSCRIPTIONS';

CREATE INDEX IDX_SS_CLASS_ETAB ON SS_CLASSES(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_CLASS_ANNEE ON SS_CLASSES(ANNEE_ID);
CREATE INDEX IDX_SS_CLASS_NIV ON SS_CLASSES(NIVEAU_ID);
CREATE INDEX IDX_SS_CLASS_SECT ON SS_CLASSES(SECTION_ID);
CREATE INDEX IDX_SS_CLASS_STATUT ON SS_CLASSES(STATUT);

PROMPT   ✓ Table SS_CLASSES créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULE 1 TERMINÉ — 8 tables créées
PROMPT ============================================
