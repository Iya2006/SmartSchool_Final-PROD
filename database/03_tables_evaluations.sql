-- ============================================================================
-- SMARTSCHOOL ERP — Script 03 : TABLES ÉVALUATIONS & BULLETINS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module      : Évaluations (8 tables)
-- Tables      : SS_TYPES_EVALUATION, SS_EVALUATIONS, SS_NOTES,
--               SS_MOYENNES_TRIM, SS_MOYENNES_ANNUELLES, SS_BULLETINS,
--               SS_BULLETIN_DETAILS, SS_CLASSEMENTS
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 3 — ÉVALUATIONS & BULLETINS
PROMPT   Création de 8 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 19 : SS_TYPES_EVALUATION
-- Description : Référentiel des types d'évaluation avec pondération.
--               Système guinéen : Devoirs (40%) + Examens (60%) typiquement.
-- ============================================================================
CREATE TABLE SS_TYPES_EVALUATION (
    TYPE_EVAL_ID         NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_TYPES_EVAL PRIMARY KEY,
    CODE                 VARCHAR2(20)        NOT NULL,
    LIBELLE              VARCHAR2(100)       NOT NULL,
    POIDS_POURCENTAGE    NUMBER(5,2)         NOT NULL,  -- Poids dans le calcul de la moyenne
    NOMBRE_MAX           NUMBER(2),          -- Nombre max de ce type par trimestre
    DESCRIPTION          VARCHAR2(300),
    ORDRE_AFFICHAGE      NUMBER(2)           DEFAULT 0,
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT UK_SS_TEVAL_CODE      UNIQUE (CODE),
    CONSTRAINT CK_SS_TEVAL_POIDS     CHECK (POIDS_POURCENTAGE BETWEEN 0 AND 100),
    CONSTRAINT CK_SS_TEVAL_STATUT    CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_TYPES_EVALUATION IS 'Types d''évaluation : Devoir, Interrogation, Composition, Examen';
COMMENT ON COLUMN SS_TYPES_EVALUATION.POIDS_POURCENTAGE IS 'Pondération dans le calcul de la moyenne trimestrielle';

PROMPT   ✓ Table SS_TYPES_EVALUATION créée

-- ============================================================================
-- TABLE 20 : SS_EVALUATIONS
-- Description : Épreuves planifiées (devoirs, compos, examens).
--               Chaque évaluation est liée à une matière, une classe et un trimestre.
-- ============================================================================
CREATE TABLE SS_EVALUATIONS (
    EVALUATION_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_EVALUATIONS PRIMARY KEY,
    MATIERE_ID           NUMBER              NOT NULL,
    CLASSE_ID            NUMBER              NOT NULL,
    TRIMESTRE_ID         NUMBER              NOT NULL,
    TYPE_EVAL_ID         NUMBER              NOT NULL,
    ENSEIGNANT_ID        NUMBER              NOT NULL,
    -- Détails
    LIBELLE              VARCHAR2(200)       NOT NULL,  -- Ex: "Devoir N°1 de Mathématiques"
    DESCRIPTION          VARCHAR2(500),
    DATE_EVALUATION      DATE                NOT NULL,
    DATE_LIMITE_SAISIE   DATE,               -- Date limite pour saisir les notes
    NOTE_SUR             NUMBER(5,2)         DEFAULT 20 NOT NULL,  -- Notation sur 20
    COEFFICIENT          NUMBER(3,1)         DEFAULT 1 NOT NULL,
    DUREE_MINUTES        NUMBER(4),          -- Durée en minutes
    -- Statistiques (calculées)
    MOYENNE_CLASSE       NUMBER(5,2),
    NOTE_MAX             NUMBER(5,2),
    NOTE_MIN             NUMBER(5,2),
    NB_COPIES_CORRIGEES  NUMBER(4)           DEFAULT 0,
    NB_ABSENTS           NUMBER(4)           DEFAULT 0,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'PLANIFIEE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_EVAL_MAT        FOREIGN KEY (MATIERE_ID)
                                     REFERENCES SS_MATIERES(MATIERE_ID),
    CONSTRAINT FK_SS_EVAL_CLASS      FOREIGN KEY (CLASSE_ID)
                                     REFERENCES SS_CLASSES(CLASSE_ID),
    CONSTRAINT FK_SS_EVAL_TRIM       FOREIGN KEY (TRIMESTRE_ID)
                                     REFERENCES SS_TRIMESTRES(TRIMESTRE_ID),
    CONSTRAINT FK_SS_EVAL_TYPE       FOREIGN KEY (TYPE_EVAL_ID)
                                     REFERENCES SS_TYPES_EVALUATION(TYPE_EVAL_ID),
    CONSTRAINT FK_SS_EVAL_ENS        FOREIGN KEY (ENSEIGNANT_ID)
                                     REFERENCES SS_ENSEIGNANTS(ENSEIGNANT_ID),
    CONSTRAINT CK_SS_EVAL_NOTE_SUR   CHECK (NOTE_SUR > 0),
    CONSTRAINT CK_SS_EVAL_COEF       CHECK (COEFFICIENT > 0),
    CONSTRAINT CK_SS_EVAL_STATUT     CHECK (STATUT IN (
        'PLANIFIEE','EN_COURS','SAISIE','VALIDEE','PUBLIEE','ANNULEE'))
);

COMMENT ON TABLE SS_EVALUATIONS IS 'Épreuves planifiées par matière, classe et trimestre';
COMMENT ON COLUMN SS_EVALUATIONS.STATUT IS 'PLANIFIEE→EN_COURS→SAISIE→VALIDEE→PUBLIEE (workflow)';

CREATE INDEX IDX_SS_EVAL_MAT ON SS_EVALUATIONS(MATIERE_ID);
CREATE INDEX IDX_SS_EVAL_CLASS ON SS_EVALUATIONS(CLASSE_ID);
CREATE INDEX IDX_SS_EVAL_TRIM ON SS_EVALUATIONS(TRIMESTRE_ID);
CREATE INDEX IDX_SS_EVAL_ENS ON SS_EVALUATIONS(ENSEIGNANT_ID);
CREATE INDEX IDX_SS_EVAL_DATE ON SS_EVALUATIONS(DATE_EVALUATION);
CREATE INDEX IDX_SS_EVAL_STATUT ON SS_EVALUATIONS(STATUT);

PROMPT   ✓ Table SS_EVALUATIONS créée

-- ============================================================================
-- TABLE 21 : SS_NOTES
-- Description : Notes individuelles des élèves par évaluation.
--               Table à très haut volume — optimisée pour les performances.
-- ============================================================================
CREATE TABLE SS_NOTES (
    NOTE_ID              NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_NOTES PRIMARY KEY,
    EVALUATION_ID        NUMBER              NOT NULL,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    -- Note
    VALEUR               NUMBER(5,2),        -- NULL si absent
    NOTE_SUR             NUMBER(5,2)         DEFAULT 20,
    NOTE_RAMENEE_20      NUMBER(5,2),        -- Note ramenée sur 20 si note_sur != 20
    -- Absence/Observations
    EST_ABSENT           VARCHAR2(1)         DEFAULT 'N' NOT NULL,
    EST_DISPENSE         VARCHAR2(1)         DEFAULT 'N' NOT NULL,
    OBSERVATION          VARCHAR2(300),
    -- Saisie
    SAISI_PAR            VARCHAR2(100),
    DATE_SAISIE          TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIE_PAR          VARCHAR2(100),
    DATE_MODIFICATION    TIMESTAMP,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_NOTE_EVAL       FOREIGN KEY (EVALUATION_ID)
                                     REFERENCES SS_EVALUATIONS(EVALUATION_ID),
    CONSTRAINT FK_SS_NOTE_INSC       FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT UK_SS_NOTE_UNIQUE     UNIQUE (EVALUATION_ID, INSCRIPTION_ID),
    CONSTRAINT CK_SS_NOTE_VALEUR     CHECK (VALEUR IS NULL OR VALEUR >= 0),
    CONSTRAINT CK_SS_NOTE_ABSENT     CHECK (EST_ABSENT IN ('O','N')),
    CONSTRAINT CK_SS_NOTE_DISPENSE   CHECK (EST_DISPENSE IN ('O','N')),
    CONSTRAINT CK_SS_NOTE_COHERENCE  CHECK (
        (EST_ABSENT = 'O' AND VALEUR IS NULL) OR 
        (EST_ABSENT = 'N')
    )
);

COMMENT ON TABLE SS_NOTES IS 'Notes individuelles — table à très haut volume, optimisée';
COMMENT ON COLUMN SS_NOTES.NOTE_RAMENEE_20 IS 'Note ramenée sur 20 si l''évaluation n''est pas sur 20';
COMMENT ON COLUMN SS_NOTES.EST_ABSENT IS 'Si O (absent), la valeur de la note doit être NULL (contrainte CK_SS_NOTE_COHERENCE)';

CREATE INDEX IDX_SS_NOTE_EVAL ON SS_NOTES(EVALUATION_ID);
CREATE INDEX IDX_SS_NOTE_INSC ON SS_NOTES(INSCRIPTION_ID);

PROMPT   ✓ Table SS_NOTES créée

-- ============================================================================
-- TABLE 22 : SS_MOYENNES_TRIM
-- Description : Moyennes trimestrielles calculées par matière.
--               Précalculées pour performance sur les bulletins et rapports.
-- ============================================================================
CREATE TABLE SS_MOYENNES_TRIM (
    MOYENNE_TRIM_ID      NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_MOY_TRIM PRIMARY KEY,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    MATIERE_ID           NUMBER              NOT NULL,
    TRIMESTRE_ID         NUMBER              NOT NULL,
    -- Notes composantes
    MOYENNE_DEVOIRS      NUMBER(5,2),        -- Moyenne des devoirs
    NOTE_COMPOSITION     NUMBER(5,2),        -- Note de composition/examen
    -- Résultat
    MOYENNE              NUMBER(5,2)         NOT NULL,  -- Moyenne pondérée finale
    COEFFICIENT          NUMBER(3,1)         NOT NULL,
    POINTS               NUMBER(7,2),        -- Moyenne × Coefficient
    -- Classement matière
    RANG                 NUMBER(4),
    MOYENNE_CLASSE       NUMBER(5,2),        -- Moyenne de la classe dans cette matière
    NOTE_MAX             NUMBER(5,2),
    NOTE_MIN             NUMBER(5,2),
    -- Appréciation
    APPRECIATION         VARCHAR2(200),      -- Appréciation du professeur
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_MOYT_INSC       FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT FK_SS_MOYT_MAT        FOREIGN KEY (MATIERE_ID)
                                     REFERENCES SS_MATIERES(MATIERE_ID),
    CONSTRAINT FK_SS_MOYT_TRIM       FOREIGN KEY (TRIMESTRE_ID)
                                     REFERENCES SS_TRIMESTRES(TRIMESTRE_ID),
    CONSTRAINT UK_SS_MOYT_UNIQUE     UNIQUE (INSCRIPTION_ID, MATIERE_ID, TRIMESTRE_ID),
    CONSTRAINT CK_SS_MOYT_MOYENNE    CHECK (MOYENNE BETWEEN 0 AND 20),
    CONSTRAINT CK_SS_MOYT_COEF       CHECK (COEFFICIENT > 0)
);

COMMENT ON TABLE SS_MOYENNES_TRIM IS 'Moyennes trimestrielles précalculées par matière — optimisation bulletins';
COMMENT ON COLUMN SS_MOYENNES_TRIM.POINTS IS 'Produit Moyenne × Coefficient pour le calcul de la moyenne générale';

CREATE INDEX IDX_SS_MOYT_INSC ON SS_MOYENNES_TRIM(INSCRIPTION_ID);
CREATE INDEX IDX_SS_MOYT_MAT ON SS_MOYENNES_TRIM(MATIERE_ID);
CREATE INDEX IDX_SS_MOYT_TRIM ON SS_MOYENNES_TRIM(TRIMESTRE_ID);

PROMPT   ✓ Table SS_MOYENNES_TRIM créée

-- ============================================================================
-- TABLE 23 : SS_MOYENNES_ANNUELLES
-- Description : Moyennes annuelles par matière (moyenne des 3 trimestres).
-- ============================================================================
CREATE TABLE SS_MOYENNES_ANNUELLES (
    MOYENNE_ANN_ID       NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_MOY_ANN PRIMARY KEY,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    MATIERE_ID           NUMBER              NOT NULL,
    -- Moyennes trimestrielles
    MOYENNE_T1           NUMBER(5,2),
    MOYENNE_T2           NUMBER(5,2),
    MOYENNE_T3           NUMBER(5,2),
    -- Résultat annuel
    MOYENNE_ANNUELLE     NUMBER(5,2)         NOT NULL,
    COEFFICIENT          NUMBER(3,1)         NOT NULL,
    POINTS_ANNUELS       NUMBER(7,2),
    RANG_ANNUEL          NUMBER(4),
    APPRECIATION         VARCHAR2(200),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_MOYA_INSC       FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT FK_SS_MOYA_MAT        FOREIGN KEY (MATIERE_ID)
                                     REFERENCES SS_MATIERES(MATIERE_ID),
    CONSTRAINT UK_SS_MOYA_UNIQUE     UNIQUE (INSCRIPTION_ID, MATIERE_ID),
    CONSTRAINT CK_SS_MOYA_MOYENNE    CHECK (MOYENNE_ANNUELLE BETWEEN 0 AND 20)
);

COMMENT ON TABLE SS_MOYENNES_ANNUELLES IS 'Moyennes annuelles par matière — base pour les décisions de conseil de classe';

CREATE INDEX IDX_SS_MOYA_INSC ON SS_MOYENNES_ANNUELLES(INSCRIPTION_ID);

PROMPT   ✓ Table SS_MOYENNES_ANNUELLES créée

-- ============================================================================
-- TABLE 24 : SS_BULLETINS
-- Description : En-têtes des bulletins scolaires (trimestriels/annuels).
--               Contient la moyenne générale, le rang et les décisions.
-- ============================================================================
CREATE TABLE SS_BULLETINS (
    BULLETIN_ID          NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_BULLETINS PRIMARY KEY,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    TRIMESTRE_ID         NUMBER,             -- NULL pour bulletin annuel
    TYPE_BULLETIN        VARCHAR2(20)        DEFAULT 'TRIMESTRIEL' NOT NULL,
    -- Résultats globaux
    MOYENNE_GENERALE     NUMBER(5,2),
    TOTAL_POINTS         NUMBER(8,2),
    TOTAL_COEFFICIENTS   NUMBER(5,1),
    RANG                 NUMBER(4),
    EFFECTIF_CLASSE      NUMBER(4),
    MOYENNE_PREMIER      NUMBER(5,2),        -- Moyenne du 1er de la classe
    MOYENNE_DERNIER      NUMBER(5,2),        -- Moyenne du dernier
    MOYENNE_CLASSE       NUMBER(5,2),        -- Moyenne générale de la classe
    -- Appréciations
    APPRECIATION_CONSEIL VARCHAR2(500),      -- Appréciation du conseil de classe
    OBSERVATION_DIRECTEUR VARCHAR2(500),     -- Observation du directeur
    MENTION              VARCHAR2(30),       -- Excellent, Très Bien, Bien, Assez Bien, Passable
    -- Décision (bulletin annuel)
    DECISION             VARCHAR2(30),       -- ADMIS, REDOUBLANT, EXCLU
    -- Workflow
    STATUT               VARCHAR2(20)        DEFAULT 'BROUILLON' NOT NULL,
    DATE_GENERATION      TIMESTAMP,
    DATE_VALIDATION      TIMESTAMP,
    DATE_PUBLICATION      TIMESTAMP,
    VALIDE_PAR           VARCHAR2(100),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_BULL_INSC       FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT FK_SS_BULL_TRIM       FOREIGN KEY (TRIMESTRE_ID)
                                     REFERENCES SS_TRIMESTRES(TRIMESTRE_ID),
    CONSTRAINT UK_SS_BULL_UNIQUE     UNIQUE (INSCRIPTION_ID, TRIMESTRE_ID, TYPE_BULLETIN),
    CONSTRAINT CK_SS_BULL_TYPE       CHECK (TYPE_BULLETIN IN ('TRIMESTRIEL','ANNUEL')),
    CONSTRAINT CK_SS_BULL_MENTION    CHECK (MENTION IS NULL OR MENTION IN (
        'EXCELLENT','TRES_BIEN','BIEN','ASSEZ_BIEN','PASSABLE','INSUFFISANT','MEDIOCRE')),
    CONSTRAINT CK_SS_BULL_DECISION   CHECK (DECISION IS NULL OR DECISION IN (
        'ADMIS','REDOUBLANT','EXCLU','TRANSFERE')),
    CONSTRAINT CK_SS_BULL_STATUT     CHECK (STATUT IN ('BROUILLON','GENERE','VALIDE','PUBLIE','ARCHIVE'))
);

COMMENT ON TABLE SS_BULLETINS IS 'En-têtes des bulletins scolaires trimestriels et annuels';
COMMENT ON COLUMN SS_BULLETINS.STATUT IS 'Workflow : BROUILLON→GENERE→VALIDE→PUBLIE→ARCHIVE';

CREATE INDEX IDX_SS_BULL_INSC ON SS_BULLETINS(INSCRIPTION_ID);
CREATE INDEX IDX_SS_BULL_TRIM ON SS_BULLETINS(TRIMESTRE_ID);
CREATE INDEX IDX_SS_BULL_STATUT ON SS_BULLETINS(STATUT);

PROMPT   ✓ Table SS_BULLETINS créée

-- ============================================================================
-- TABLE 25 : SS_BULLETIN_DETAILS
-- Description : Lignes de détail du bulletin (une ligne par matière).
--               Contient toutes les informations affichées sur le bulletin imprimé.
-- ============================================================================
CREATE TABLE SS_BULLETIN_DETAILS (
    DETAIL_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_BULL_DET PRIMARY KEY,
    BULLETIN_ID          NUMBER              NOT NULL,
    MATIERE_ID           NUMBER              NOT NULL,
    -- Notes composantes
    NOTE_DEVOIR_1        NUMBER(5,2),
    NOTE_DEVOIR_2        NUMBER(5,2),
    NOTE_DEVOIR_3        NUMBER(5,2),
    MOYENNE_DEVOIRS      NUMBER(5,2),
    NOTE_COMPOSITION     NUMBER(5,2),
    -- Résultat
    MOYENNE_MATIERE      NUMBER(5,2)         NOT NULL,
    COEFFICIENT          NUMBER(3,1)         NOT NULL,
    POINTS               NUMBER(7,2),        -- Moyenne × Coefficient
    -- Classement
    RANG_MATIERE         NUMBER(4),
    MOYENNE_CLASSE       NUMBER(5,2),        -- Moyenne de la classe dans cette matière
    NOTE_MAX_CLASSE      NUMBER(5,2),
    NOTE_MIN_CLASSE      NUMBER(5,2),
    -- Appréciation
    APPRECIATION         VARCHAR2(200),      -- Appréciation du professeur
    ENSEIGNANT_NOM       VARCHAR2(200),      -- Nom de l'enseignant (dénormalisé pour impression)
    -- Ordre
    ORDRE_AFFICHAGE      NUMBER(3)           DEFAULT 0,
    CATEGORIE_MATIERE    VARCHAR2(50),       -- Groupe de matières pour le bulletin
    --
    CONSTRAINT FK_SS_BDET_BULL       FOREIGN KEY (BULLETIN_ID)
                                     REFERENCES SS_BULLETINS(BULLETIN_ID) ON DELETE CASCADE,
    CONSTRAINT FK_SS_BDET_MAT        FOREIGN KEY (MATIERE_ID)
                                     REFERENCES SS_MATIERES(MATIERE_ID),
    CONSTRAINT UK_SS_BDET_UNIQUE     UNIQUE (BULLETIN_ID, MATIERE_ID),
    CONSTRAINT CK_SS_BDET_MOYENNE    CHECK (MOYENNE_MATIERE BETWEEN 0 AND 20),
    CONSTRAINT CK_SS_BDET_COEF       CHECK (COEFFICIENT > 0)
);

COMMENT ON TABLE SS_BULLETIN_DETAILS IS 'Détails du bulletin — une ligne par matière avec toutes les données pour impression';
COMMENT ON COLUMN SS_BULLETIN_DETAILS.ENSEIGNANT_NOM IS 'Dénormalisé intentionnellement pour faciliter l''impression PDF du bulletin';

CREATE INDEX IDX_SS_BDET_BULL ON SS_BULLETIN_DETAILS(BULLETIN_ID);
CREATE INDEX IDX_SS_BDET_MAT ON SS_BULLETIN_DETAILS(MATIERE_ID);

PROMPT   ✓ Table SS_BULLETIN_DETAILS créée

-- ============================================================================
-- TABLE 26 : SS_CLASSEMENTS
-- Description : Classements des élèves par classe et par trimestre.
--               Précalculés pour performance sur les rapports.
-- ============================================================================
CREATE TABLE SS_CLASSEMENTS (
    CLASSEMENT_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_CLASSEMENTS PRIMARY KEY,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    TRIMESTRE_ID         NUMBER,             -- NULL pour classement annuel
    TYPE_CLASSEMENT      VARCHAR2(20)        DEFAULT 'TRIMESTRIEL' NOT NULL,
    -- Résultats
    MOYENNE_GENERALE     NUMBER(5,2)         NOT NULL,
    TOTAL_POINTS         NUMBER(8,2),
    TOTAL_COEFFICIENTS   NUMBER(5,1),
    RANG                 NUMBER(4)           NOT NULL,
    EFFECTIF_CLASSE      NUMBER(4)           NOT NULL,
    -- Mention
    MENTION              VARCHAR2(30),
    -- Statistiques de la classe
    MOYENNE_CLASSE       NUMBER(5,2),
    ECART_TYPE           NUMBER(5,2),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_CLSMT_INSC      FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT FK_SS_CLSMT_TRIM      FOREIGN KEY (TRIMESTRE_ID)
                                     REFERENCES SS_TRIMESTRES(TRIMESTRE_ID),
    CONSTRAINT UK_SS_CLSMT_UNIQUE    UNIQUE (INSCRIPTION_ID, TRIMESTRE_ID, TYPE_CLASSEMENT),
    CONSTRAINT CK_SS_CLSMT_TYPE      CHECK (TYPE_CLASSEMENT IN ('TRIMESTRIEL','ANNUEL')),
    CONSTRAINT CK_SS_CLSMT_RANG      CHECK (RANG > 0),
    CONSTRAINT CK_SS_CLSMT_MENTION   CHECK (MENTION IS NULL OR MENTION IN (
        'EXCELLENT','TRES_BIEN','BIEN','ASSEZ_BIEN','PASSABLE','INSUFFISANT','MEDIOCRE'))
);

COMMENT ON TABLE SS_CLASSEMENTS IS 'Classements précalculés par classe et trimestre';

CREATE INDEX IDX_SS_CLSMT_INSC ON SS_CLASSEMENTS(INSCRIPTION_ID);
CREATE INDEX IDX_SS_CLSMT_TRIM ON SS_CLASSEMENTS(TRIMESTRE_ID);

PROMPT   ✓ Table SS_CLASSEMENTS créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULE 3 TERMINÉ — 8 tables créées
PROMPT ============================================
