-- ============================================================================
-- SMARTSCHOOL ERP — Script 02 : TABLES GESTION ACADÉMIQUE
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module      : Gestion Académique (10 tables)
-- Tables      : SS_ELEVES, SS_PARENTS, SS_ELEVE_PARENT, SS_ENSEIGNANTS,
--               SS_PERSONNEL, SS_MATIERES, SS_AFFECTATIONS, SS_INSCRIPTIONS,
--               SS_TRANSFERTS, SS_EMPLOI_DU_TEMPS
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 2 — GESTION ACADÉMIQUE
PROMPT   Création de 10 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 9 : SS_ELEVES
-- Description : Profils numériques complets des élèves.
--               Inclut informations médicales, photo et données biométriques.
-- ============================================================================
CREATE TABLE SS_ELEVES (
    ELEVE_ID             NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_ELEVES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    MATRICULE            VARCHAR2(30)        NOT NULL,  -- Matricule unique national
    -- Identité
    NOM                  VARCHAR2(100)       NOT NULL,
    PRENOM               VARCHAR2(150)       NOT NULL,
    DATE_NAISSANCE       DATE                NOT NULL,
    LIEU_NAISSANCE       VARCHAR2(150),
    SEXE                 VARCHAR2(1)         NOT NULL,
    NATIONALITE          VARCHAR2(50)        DEFAULT 'Guinéenne',
    ETHNIE               VARCHAR2(50),       -- Optionnel, contexte guinéen
    RELIGION             VARCHAR2(30),       -- Optionnel
    -- Coordonnées
    ADRESSE              VARCHAR2(500),
    QUARTIER             VARCHAR2(100),      -- Quartier (très utilisé en Guinée)
    VILLE                VARCHAR2(100),
    TELEPHONE            VARCHAR2(20),       -- Téléphone de l'élève (si lycéen)
    EMAIL                VARCHAR2(150),
    -- Médical
    GROUPE_SANGUIN       VARCHAR2(5),
    ALLERGIES            VARCHAR2(500),
    HANDICAP             VARCHAR2(300),
    MALADIE_CHRONIQUE    VARCHAR2(300),
    CONTACT_URGENCE_NOM  VARCHAR2(200),
    CONTACT_URGENCE_TEL  VARCHAR2(20),
    -- Documents
    PHOTO_URL            VARCHAR2(500),
    EXTRAIT_NAISSANCE    VARCHAR2(1)         DEFAULT 'N',  -- Document fourni O/N
    CERTIFICAT_RESIDENCE VARCHAR2(1)         DEFAULT 'N',
    -- Scolarité antérieure
    ECOLE_PRECEDENTE     VARCHAR2(200),
    DERNIERE_CLASSE      VARCHAR2(50),
    MOTIF_DEPART         VARCHAR2(300),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    DATE_PREMIERE_INSCRIPTION DATE           DEFAULT SYSDATE,
    DATE_SORTIE          DATE,
    MOTIF_SORTIE         VARCHAR2(300),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_ELEV_ETAB       FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_ELEV_MATRICULE  UNIQUE (MATRICULE),
    CONSTRAINT CK_SS_ELEV_SEXE       CHECK (SEXE IN ('M','F')),
    CONSTRAINT CK_SS_ELEV_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF','TRANSFERE','DIPLOME','EXCLU','ABANDONNE')),
    CONSTRAINT CK_SS_ELEV_SANG       CHECK (GROUPE_SANGUIN IS NULL OR 
                                     GROUPE_SANGUIN IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    CONSTRAINT CK_SS_ELEV_EXTRAIT    CHECK (EXTRAIT_NAISSANCE IN ('O','N')),
    CONSTRAINT CK_SS_ELEV_CERTIF     CHECK (CERTIFICAT_RESIDENCE IN ('O','N'))
);

COMMENT ON TABLE SS_ELEVES IS 'Profils numériques complets des élèves — dossier centralisé';
COMMENT ON COLUMN SS_ELEVES.MATRICULE IS 'Matricule national unique format : ELV-REGION-ANNEE-SEQUENCE';
COMMENT ON COLUMN SS_ELEVES.QUARTIER IS 'Quartier de résidence — essentiel en contexte urbain guinéen';

CREATE INDEX IDX_SS_ELEV_ETAB ON SS_ELEVES(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_ELEV_NOM ON SS_ELEVES(UPPER(NOM), UPPER(PRENOM));
CREATE INDEX IDX_SS_ELEV_SEXE ON SS_ELEVES(SEXE);
CREATE INDEX IDX_SS_ELEV_STATUT ON SS_ELEVES(STATUT);
CREATE INDEX IDX_SS_ELEV_DNAISS ON SS_ELEVES(DATE_NAISSANCE);

PROMPT   ✓ Table SS_ELEVES créée

-- ============================================================================
-- TABLE 10 : SS_PARENTS
-- Description : Répertoire des parents et tuteurs légaux.
--               Un parent peut avoir plusieurs enfants dans différents établissements.
-- ============================================================================
CREATE TABLE SS_PARENTS (
    PARENT_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_PARENTS PRIMARY KEY,
    -- Identité
    NOM                  VARCHAR2(100)       NOT NULL,
    PRENOM               VARCHAR2(150)       NOT NULL,
    SEXE                 VARCHAR2(1),
    -- Coordonnées (crucial pour SMS/WhatsApp)
    TELEPHONE_1          VARCHAR2(20)        NOT NULL,  -- Numéro principal (Orange/MTN)
    TELEPHONE_2          VARCHAR2(20),                  -- Numéro secondaire
    WHATSAPP             VARCHAR2(20),                  -- Numéro WhatsApp (peut être différent)
    EMAIL                VARCHAR2(150),
    -- Professionnel
    PROFESSION           VARCHAR2(150),
    LIEU_TRAVAIL         VARCHAR2(200),
    -- Adresse
    ADRESSE              VARCHAR2(500),
    QUARTIER             VARCHAR2(100),
    VILLE                VARCHAR2(100),
    -- Préférences communication
    CANAL_PREFERE        VARCHAR2(20)        DEFAULT 'SMS',  -- SMS, WHATSAPP, EMAIL
    LANGUE_PREFEREE      VARCHAR2(20)        DEFAULT 'FR',   -- FR, SUSU, PULAR, MALINKE
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT CK_SS_PAR_SEXE        CHECK (SEXE IS NULL OR SEXE IN ('M','F')),
    CONSTRAINT CK_SS_PAR_CANAL       CHECK (CANAL_PREFERE IN ('SMS','WHATSAPP','EMAIL','APPEL')),
    CONSTRAINT CK_SS_PAR_LANGUE      CHECK (LANGUE_PREFEREE IN ('FR','SUSU','PULAR','MALINKE','KISSIE','TOMA')),
    CONSTRAINT CK_SS_PAR_STATUT      CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_PARENTS IS 'Répertoire des parents et tuteurs — base pour les communications SMS/WhatsApp';
COMMENT ON COLUMN SS_PARENTS.CANAL_PREFERE IS 'Canal de communication préféré du parent';
COMMENT ON COLUMN SS_PARENTS.LANGUE_PREFEREE IS 'Langue préférée pour les notifications (principales langues nationales)';

CREATE INDEX IDX_SS_PAR_NOM ON SS_PARENTS(UPPER(NOM), UPPER(PRENOM));
CREATE INDEX IDX_SS_PAR_TEL ON SS_PARENTS(TELEPHONE_1);

PROMPT   ✓ Table SS_PARENTS créée

-- ============================================================================
-- TABLE 11 : SS_ELEVE_PARENT
-- Description : Table d'association entre élèves et parents/tuteurs.
--               Permet de gérer les familles recomposées et tutelles.
-- ============================================================================
CREATE TABLE SS_ELEVE_PARENT (
    ELEVE_PARENT_ID      NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_ELEV_PAR PRIMARY KEY,
    ELEVE_ID             NUMBER              NOT NULL,
    PARENT_ID            NUMBER              NOT NULL,
    LIEN_PARENTE         VARCHAR2(30)        NOT NULL,
    EST_CONTACT_PRINCIPAL VARCHAR2(1)        DEFAULT 'N' NOT NULL,
    EST_RESPONSABLE_FINANCIER VARCHAR2(1)    DEFAULT 'N' NOT NULL,  -- Qui paie les frais
    AUTORISE_RECUPERATION VARCHAR2(1)        DEFAULT 'O' NOT NULL,  -- Peut récupérer l'enfant
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_ELPAR_ELEV      FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_ELPAR_PAR       FOREIGN KEY (PARENT_ID)
                                     REFERENCES SS_PARENTS(PARENT_ID),
    CONSTRAINT UK_SS_ELPAR           UNIQUE (ELEVE_ID, PARENT_ID),
    CONSTRAINT CK_SS_ELPAR_LIEN      CHECK (LIEN_PARENTE IN (
        'PERE','MERE','TUTEUR','TUTRICE','ONCLE','TANTE','GRAND_PERE','GRAND_MERE','FRERE','SOEUR','AUTRE')),
    CONSTRAINT CK_SS_ELPAR_CONTACT   CHECK (EST_CONTACT_PRINCIPAL IN ('O','N')),
    CONSTRAINT CK_SS_ELPAR_FINANC    CHECK (EST_RESPONSABLE_FINANCIER IN ('O','N')),
    CONSTRAINT CK_SS_ELPAR_RECUP     CHECK (AUTORISE_RECUPERATION IN ('O','N'))
);

COMMENT ON TABLE SS_ELEVE_PARENT IS 'Association M:N entre élèves et parents/tuteurs';
COMMENT ON COLUMN SS_ELEVE_PARENT.EST_RESPONSABLE_FINANCIER IS 'Identifie le responsable des paiements de scolarité';

CREATE INDEX IDX_SS_ELPAR_ELEV ON SS_ELEVE_PARENT(ELEVE_ID);
CREATE INDEX IDX_SS_ELPAR_PAR ON SS_ELEVE_PARENT(PARENT_ID);

PROMPT   ✓ Table SS_ELEVE_PARENT créée

-- ============================================================================
-- TABLE 12 : SS_ENSEIGNANTS
-- Description : Profils des enseignants avec qualifications et spécialités.
-- ============================================================================
CREATE TABLE SS_ENSEIGNANTS (
    ENSEIGNANT_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_ENSEIGNANTS PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    MATRICULE            VARCHAR2(30)        NOT NULL,
    -- Identité
    NOM                  VARCHAR2(100)       NOT NULL,
    PRENOM               VARCHAR2(150)       NOT NULL,
    DATE_NAISSANCE       DATE,
    LIEU_NAISSANCE       VARCHAR2(150),
    SEXE                 VARCHAR2(1)         NOT NULL,
    NATIONALITE          VARCHAR2(50)        DEFAULT 'Guinéenne',
    -- Coordonnées
    ADRESSE              VARCHAR2(500),
    QUARTIER             VARCHAR2(100),
    TELEPHONE            VARCHAR2(20)        NOT NULL,
    TELEPHONE_2          VARCHAR2(20),
    EMAIL                VARCHAR2(150),
    -- Qualifications
    SPECIALITE           VARCHAR2(200),      -- Matière principale
    DIPLOME_PLUS_ELEVE   VARCHAR2(100),      -- Plus haut diplôme obtenu
    INSTITUTION_DIPLOME  VARCHAR2(200),      -- Institution ayant délivré le diplôme
    GRADE                VARCHAR2(50),       -- Grade dans la fonction publique
    CATEGORIE            VARCHAR2(30),       -- Catégorie de la fonction publique
    NB_ANNEES_EXPERIENCE NUMBER(2)           DEFAULT 0,
    -- Contrat
    TYPE_CONTRAT         VARCHAR2(30)        DEFAULT 'PERMANENT',
    DATE_EMBAUCHE        DATE,
    DATE_FIN_CONTRAT     DATE,
    SALAIRE_BASE         NUMBER(12,2),
    -- Documents
    PHOTO_URL            VARCHAR2(500),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_ENS_ETAB        FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_ENS_MATRICULE   UNIQUE (MATRICULE),
    CONSTRAINT CK_SS_ENS_SEXE        CHECK (SEXE IN ('M','F')),
    CONSTRAINT CK_SS_ENS_STATUT      CHECK (STATUT IN ('ACTIF','INACTIF','CONGE','MUTE','RETRAITE')),
    CONSTRAINT CK_SS_ENS_CONTRAT     CHECK (TYPE_CONTRAT IN ('PERMANENT','CONTRACTUEL','VACATAIRE','STAGIAIRE'))
);

COMMENT ON TABLE SS_ENSEIGNANTS IS 'Profils complets des enseignants avec qualifications';
COMMENT ON COLUMN SS_ENSEIGNANTS.GRADE IS 'Grade dans la fonction publique guinéenne';

CREATE INDEX IDX_SS_ENS_ETAB ON SS_ENSEIGNANTS(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_ENS_NOM ON SS_ENSEIGNANTS(UPPER(NOM), UPPER(PRENOM));
CREATE INDEX IDX_SS_ENS_STATUT ON SS_ENSEIGNANTS(STATUT);

PROMPT   ✓ Table SS_ENSEIGNANTS créée

-- ============================================================================
-- Ajout de la FK PROFESSEUR_PRINCIPAL sur SS_CLASSES
-- (car SS_ENSEIGNANTS devait être créée avant)
-- ============================================================================
ALTER TABLE SS_CLASSES ADD CONSTRAINT FK_SS_CLASS_PROF 
    FOREIGN KEY (PROFESSEUR_PRINCIPAL) REFERENCES SS_ENSEIGNANTS(ENSEIGNANT_ID);

CREATE INDEX IDX_SS_CLASS_PROF ON SS_CLASSES(PROFESSEUR_PRINCIPAL);

PROMPT   ✓ FK PROFESSEUR_PRINCIPAL ajoutée sur SS_CLASSES

-- ============================================================================
-- TABLE 13 : SS_PERSONNEL
-- Description : Personnel administratif et de support.
-- ============================================================================
CREATE TABLE SS_PERSONNEL (
    PERSONNEL_ID         NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_PERSONNEL PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    MATRICULE            VARCHAR2(30)        NOT NULL,
    -- Identité
    NOM                  VARCHAR2(100)       NOT NULL,
    PRENOM               VARCHAR2(150)       NOT NULL,
    SEXE                 VARCHAR2(1),
    DATE_NAISSANCE       DATE,
    -- Coordonnées
    TELEPHONE            VARCHAR2(20)        NOT NULL,
    EMAIL                VARCHAR2(150),
    ADRESSE              VARCHAR2(500),
    -- Poste
    FONCTION             VARCHAR2(100)       NOT NULL,  -- Secrétaire, Surveillant, Bibliothécaire...
    DEPARTEMENT          VARCHAR2(100),
    TYPE_CONTRAT         VARCHAR2(30)        DEFAULT 'PERMANENT',
    DATE_EMBAUCHE        DATE,
    SALAIRE_BASE         NUMBER(12,2),
    -- Documents
    PHOTO_URL            VARCHAR2(500),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_PERS_ETAB       FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_PERS_MATRICULE  UNIQUE (MATRICULE),
    CONSTRAINT CK_SS_PERS_SEXE       CHECK (SEXE IS NULL OR SEXE IN ('M','F')),
    CONSTRAINT CK_SS_PERS_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF','CONGE','MUTE')),
    CONSTRAINT CK_SS_PERS_CONTRAT    CHECK (TYPE_CONTRAT IN ('PERMANENT','CONTRACTUEL','VACATAIRE','STAGIAIRE'))
);

COMMENT ON TABLE SS_PERSONNEL IS 'Personnel administratif et de support des établissements';

CREATE INDEX IDX_SS_PERS_ETAB ON SS_PERSONNEL(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_PERS_FONCTION ON SS_PERSONNEL(UPPER(FONCTION));

PROMPT   ✓ Table SS_PERSONNEL créée

-- ============================================================================
-- TABLE 14 : SS_MATIERES
-- Description : Catalogue des matières avec coefficients par défaut.
-- ============================================================================
CREATE TABLE SS_MATIERES (
    MATIERE_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_MATIERES PRIMARY KEY,
    CYCLE_ID             NUMBER              NOT NULL,
    CODE                 VARCHAR2(20)        NOT NULL,
    LIBELLE              VARCHAR2(150)       NOT NULL,
    LIBELLE_COURT        VARCHAR2(30),       -- Abréviation pour les bulletins
    COEFFICIENT_DEFAUT   NUMBER(3,1)         DEFAULT 1 NOT NULL,
    CATEGORIE            VARCHAR2(50),       -- SCIENTIFIQUE, LITTERAIRE, ARTISTIQUE...
    EST_OBLIGATOIRE      VARCHAR2(1)         DEFAULT 'O' NOT NULL,
    NOTE_SUR             NUMBER(5,2)         DEFAULT 20,  -- Notation sur 20 (standard guinéen)
    NB_HEURES_SEMAINE    NUMBER(2)           DEFAULT 2,   -- Heures par semaine
    DESCRIPTION          VARCHAR2(500),
    ORDRE_AFFICHAGE      NUMBER(3)           DEFAULT 0,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_MAT_CYCLE       FOREIGN KEY (CYCLE_ID)
                                     REFERENCES SS_CYCLES(CYCLE_ID),
    CONSTRAINT UK_SS_MAT_CODE        UNIQUE (CYCLE_ID, CODE),
    CONSTRAINT CK_SS_MAT_OBLIG       CHECK (EST_OBLIGATOIRE IN ('O','N')),
    CONSTRAINT CK_SS_MAT_COEF        CHECK (COEFFICIENT_DEFAUT > 0),
    CONSTRAINT CK_SS_MAT_CATEGORIE   CHECK (CATEGORIE IS NULL OR CATEGORIE IN (
        'SCIENTIFIQUE','LITTERAIRE','ARTISTIQUE','SPORTIVE','TECHNIQUE','RELIGIEUSE','AUTRE'))
);

COMMENT ON TABLE SS_MATIERES IS 'Catalogue des matières enseignées par cycle';
COMMENT ON COLUMN SS_MATIERES.NOTE_SUR IS 'Base de notation : 20 est le standard en Guinée';
COMMENT ON COLUMN SS_MATIERES.COEFFICIENT_DEFAUT IS 'Coefficient par défaut (peut être surchargé dans SS_AFFECTATIONS si nécessaire)';

CREATE INDEX IDX_SS_MAT_CYCLE ON SS_MATIERES(CYCLE_ID);
CREATE INDEX IDX_SS_MAT_CATEG ON SS_MATIERES(CATEGORIE);

PROMPT   ✓ Table SS_MATIERES créée

-- ============================================================================
-- TABLE 15 : SS_AFFECTATIONS
-- Description : Affectation Enseignant ↔ Matière ↔ Classe pour une année.
--               Table pivot essentielle pour l'emploi du temps et les notes.
-- ============================================================================
CREATE TABLE SS_AFFECTATIONS (
    AFFECTATION_ID       NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_AFFECTATIONS PRIMARY KEY,
    ENSEIGNANT_ID        NUMBER              NOT NULL,
    MATIERE_ID           NUMBER              NOT NULL,
    CLASSE_ID            NUMBER              NOT NULL,
    ANNEE_ID             NUMBER              NOT NULL,
    EST_PRINCIPAL        VARCHAR2(1)         DEFAULT 'O' NOT NULL,  -- Enseignant principal de cette matière
    NB_HEURES_SEMAINE    NUMBER(3,1)         DEFAULT 0,
    COEFFICIENT          NUMBER(3,1),        -- Surcharge du coefficient par défaut de la matière
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIVE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_AFF_ENS         FOREIGN KEY (ENSEIGNANT_ID)
                                     REFERENCES SS_ENSEIGNANTS(ENSEIGNANT_ID),
    CONSTRAINT FK_SS_AFF_MAT         FOREIGN KEY (MATIERE_ID)
                                     REFERENCES SS_MATIERES(MATIERE_ID),
    CONSTRAINT FK_SS_AFF_CLASS       FOREIGN KEY (CLASSE_ID)
                                     REFERENCES SS_CLASSES(CLASSE_ID),
    CONSTRAINT FK_SS_AFF_ANNEE       FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT UK_SS_AFF_UNIQUE      UNIQUE (ENSEIGNANT_ID, MATIERE_ID, CLASSE_ID, ANNEE_ID),
    CONSTRAINT CK_SS_AFF_PRINCIPAL   CHECK (EST_PRINCIPAL IN ('O','N')),
    CONSTRAINT CK_SS_AFF_STATUT      CHECK (STATUT IN ('ACTIVE','INACTIVE'))
);

COMMENT ON TABLE SS_AFFECTATIONS IS 'Affectations Enseignant ↔ Matière ↔ Classe — pivot académique central';
COMMENT ON COLUMN SS_AFFECTATIONS.COEFFICIENT IS 'Surcharge du coefficient de la matière pour cette classe spécifique';

CREATE INDEX IDX_SS_AFF_ENS ON SS_AFFECTATIONS(ENSEIGNANT_ID);
CREATE INDEX IDX_SS_AFF_MAT ON SS_AFFECTATIONS(MATIERE_ID);
CREATE INDEX IDX_SS_AFF_CLASS ON SS_AFFECTATIONS(CLASSE_ID);
CREATE INDEX IDX_SS_AFF_ANNEE ON SS_AFFECTATIONS(ANNEE_ID);

PROMPT   ✓ Table SS_AFFECTATIONS créée

-- ============================================================================
-- TABLE 16 : SS_INSCRIPTIONS
-- Description : Inscription d'un élève dans une classe pour une année.
--               Table pivot CENTRALE — la plupart des modules y référent.
-- ============================================================================
CREATE TABLE SS_INSCRIPTIONS (
    INSCRIPTION_ID       NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_INSCRIPTIONS PRIMARY KEY,
    ELEVE_ID             NUMBER              NOT NULL,
    CLASSE_ID            NUMBER              NOT NULL,
    ANNEE_ID             NUMBER              NOT NULL,
    DATE_INSCRIPTION     DATE                DEFAULT SYSDATE NOT NULL,
    TYPE_INSCRIPTION     VARCHAR2(30)        DEFAULT 'NOUVELLE' NOT NULL,
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIVE' NOT NULL,
    -- Décisions de fin d'année
    DECISION_FIN_ANNEE   VARCHAR2(30),       -- ADMIS, REDOUBLANT, EXCLU
    RANG_FINAL           NUMBER(4),
    MOYENNE_ANNUELLE     NUMBER(5,2),
    -- Observations
    OBSERVATIONS         VARCHAR2(1000),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_INSC_ELEV       FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_INSC_CLASS      FOREIGN KEY (CLASSE_ID)
                                     REFERENCES SS_CLASSES(CLASSE_ID),
    CONSTRAINT FK_SS_INSC_ANNEE      FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT UK_SS_INSC_UNIQUE     UNIQUE (ELEVE_ID, ANNEE_ID),  -- Un élève par année
    CONSTRAINT CK_SS_INSC_TYPE       CHECK (TYPE_INSCRIPTION IN (
        'NOUVELLE','RENOUVELLEMENT','TRANSFERT','REDOUBLANT')),
    CONSTRAINT CK_SS_INSC_STATUT     CHECK (STATUT IN ('ACTIVE','SUSPENDUE','ANNULEE','TERMINEE')),
    CONSTRAINT CK_SS_INSC_DECISION   CHECK (DECISION_FIN_ANNEE IS NULL OR 
                                     DECISION_FIN_ANNEE IN ('ADMIS','REDOUBLANT','EXCLU','TRANSFERE','ABANDONNE'))
);

COMMENT ON TABLE SS_INSCRIPTIONS IS 'Inscriptions annuelles des élèves — TABLE PIVOT CENTRALE du système';
COMMENT ON COLUMN SS_INSCRIPTIONS.TYPE_INSCRIPTION IS 'Type : NOUVELLE (1ère fois), RENOUVELLEMENT, TRANSFERT, REDOUBLANT';
COMMENT ON COLUMN SS_INSCRIPTIONS.DECISION_FIN_ANNEE IS 'Décision du conseil de classe en fin d''année';

CREATE INDEX IDX_SS_INSC_ELEV ON SS_INSCRIPTIONS(ELEVE_ID);
CREATE INDEX IDX_SS_INSC_CLASS ON SS_INSCRIPTIONS(CLASSE_ID);
CREATE INDEX IDX_SS_INSC_ANNEE ON SS_INSCRIPTIONS(ANNEE_ID);
CREATE INDEX IDX_SS_INSC_STATUT ON SS_INSCRIPTIONS(STATUT);

PROMPT   ✓ Table SS_INSCRIPTIONS créée

-- ============================================================================
-- TABLE 17 : SS_TRANSFERTS
-- Description : Gestion des transferts d'élèves entre établissements.
--               Workflow complet : demande → validation → exécution.
-- ============================================================================
CREATE TABLE SS_TRANSFERTS (
    TRANSFERT_ID         NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_TRANSFERTS PRIMARY KEY,
    ELEVE_ID             NUMBER              NOT NULL,
    ETABLISSEMENT_ORIGINE_ID NUMBER          NOT NULL,
    ETABLISSEMENT_DEST_ID    NUMBER          NOT NULL,
    ANNEE_ID             NUMBER              NOT NULL,
    -- Demande
    DATE_DEMANDE         DATE                DEFAULT SYSDATE NOT NULL,
    MOTIF                VARCHAR2(500)       NOT NULL,
    CLASSE_DEMANDEE      VARCHAR2(50),       -- Classe souhaitée dans l'établissement destination
    -- Traitement
    DATE_TRAITEMENT      DATE,
    TRAITE_PAR           VARCHAR2(100),
    DECISION             VARCHAR2(500),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'EN_ATTENTE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_TRANS_ELEV      FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_TRANS_ORIG      FOREIGN KEY (ETABLISSEMENT_ORIGINE_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_TRANS_DEST      FOREIGN KEY (ETABLISSEMENT_DEST_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_TRANS_ANNEE     FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT CK_SS_TRANS_STATUT    CHECK (STATUT IN ('EN_ATTENTE','APPROUVE','REFUSE','EXECUTE','ANNULE')),
    CONSTRAINT CK_SS_TRANS_DIFF      CHECK (ETABLISSEMENT_ORIGINE_ID != ETABLISSEMENT_DEST_ID)
);

COMMENT ON TABLE SS_TRANSFERTS IS 'Transferts inter-établissements avec workflow d''approbation';

CREATE INDEX IDX_SS_TRANS_ELEV ON SS_TRANSFERTS(ELEVE_ID);
CREATE INDEX IDX_SS_TRANS_STATUT ON SS_TRANSFERTS(STATUT);

PROMPT   ✓ Table SS_TRANSFERTS créée

-- ============================================================================
-- TABLE 18 : SS_EMPLOI_DU_TEMPS
-- Description : Planification des créneaux horaires hebdomadaires.
-- ============================================================================
CREATE TABLE SS_EMPLOI_DU_TEMPS (
    EDT_ID               NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_EDT PRIMARY KEY,
    AFFECTATION_ID       NUMBER              NOT NULL,
    SALLE_ID             NUMBER,
    JOUR_SEMAINE         VARCHAR2(10)        NOT NULL,
    HEURE_DEBUT          VARCHAR2(5)         NOT NULL,  -- Format HH24:MI
    HEURE_FIN            VARCHAR2(5)         NOT NULL,  -- Format HH24:MI
    TYPE_SEANCE          VARCHAR2(20)        DEFAULT 'COURS',
    RECURRENCE           VARCHAR2(20)        DEFAULT 'HEBDOMADAIRE',
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_EDT_AFF         FOREIGN KEY (AFFECTATION_ID)
                                     REFERENCES SS_AFFECTATIONS(AFFECTATION_ID),
    CONSTRAINT FK_SS_EDT_SALLE       FOREIGN KEY (SALLE_ID)
                                     REFERENCES SS_SALLES(SALLE_ID),
    CONSTRAINT CK_SS_EDT_JOUR        CHECK (JOUR_SEMAINE IN (
        'LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI')),
    CONSTRAINT CK_SS_EDT_TYPE        CHECK (TYPE_SEANCE IN ('COURS','TD','TP','EXAMEN','REUNION')),
    CONSTRAINT CK_SS_EDT_RECUR       CHECK (RECURRENCE IN ('HEBDOMADAIRE','BIHEBDOMADAIRE','MENSUEL','UNIQUE'))
);

COMMENT ON TABLE SS_EMPLOI_DU_TEMPS IS 'Créneaux horaires hebdomadaires des cours';
COMMENT ON COLUMN SS_EMPLOI_DU_TEMPS.JOUR_SEMAINE IS 'Jour de la semaine (LUNDI au SAMEDI — en Guinée, cours le samedi)';

CREATE INDEX IDX_SS_EDT_AFF ON SS_EMPLOI_DU_TEMPS(AFFECTATION_ID);
CREATE INDEX IDX_SS_EDT_JOUR ON SS_EMPLOI_DU_TEMPS(JOUR_SEMAINE);

PROMPT   ✓ Table SS_EMPLOI_DU_TEMPS créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULE 2 TERMINÉ — 10 tables créées
PROMPT ============================================
