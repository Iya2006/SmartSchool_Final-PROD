-- ============================================================================
-- SMARTSCHOOL ERP — Script 05 : TABLES VIE SCOLAIRE
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module      : Discipline & Vie Scolaire (6 tables)
-- Tables      : SS_PRESENCES, SS_INCIDENTS, SS_SANCTIONS,
--               SS_OUVRAGES, SS_EXEMPLAIRES, SS_EMPRUNTS
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 5 — DISCIPLINE & VIE SCOLAIRE
PROMPT   Création de 6 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 35 : SS_PRESENCES
-- Description : Suivi quotidien des présences/absences par élève.
--               Supporte les demi-journées (matin/après-midi).
-- ============================================================================
CREATE TABLE SS_PRESENCES (
    PRESENCE_ID          NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_PRESENCES PRIMARY KEY,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    DATE_PRESENCE        DATE                NOT NULL,
    DEMI_JOURNEE         VARCHAR2(10)        NOT NULL,  -- MATIN, APRES_MIDI
    -- Statut
    STATUT_PRESENCE      VARCHAR2(20)        NOT NULL,
    HEURE_ARRIVEE        VARCHAR2(5),        -- HH24:MI si en retard
    DUREE_RETARD_MIN     NUMBER(4),          -- Durée du retard en minutes
    -- Justification
    EST_JUSTIFIE         VARCHAR2(1)         DEFAULT 'N',
    MOTIF                VARCHAR2(300),
    JUSTIFICATIF_URL     VARCHAR2(500),      -- Document scanné
    DATE_JUSTIFICATION   DATE,
    -- Notification parent
    PARENT_NOTIFIE       VARCHAR2(1)         DEFAULT 'N',
    DATE_NOTIFICATION    TIMESTAMP,
    -- Qui a fait l'appel
    SAISI_PAR            VARCHAR2(100),
    HEURE_SAISIE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_PRES_INSC       FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT UK_SS_PRES_UNIQUE     UNIQUE (INSCRIPTION_ID, DATE_PRESENCE, DEMI_JOURNEE),
    CONSTRAINT CK_SS_PRES_DEMI       CHECK (DEMI_JOURNEE IN ('MATIN','APRES_MIDI')),
    CONSTRAINT CK_SS_PRES_STATUT     CHECK (STATUT_PRESENCE IN (
        'PRESENT','ABSENT','RETARD','DISPENSE','EXCLU','MALADE')),
    CONSTRAINT CK_SS_PRES_JUSTIF     CHECK (EST_JUSTIFIE IN ('O','N')),
    CONSTRAINT CK_SS_PRES_NOTIF      CHECK (PARENT_NOTIFIE IN ('O','N'))
);

COMMENT ON TABLE SS_PRESENCES IS 'Suivi quotidien des présences par demi-journée';
COMMENT ON COLUMN SS_PRESENCES.PARENT_NOTIFIE IS 'O si le parent a été notifié de l''absence par SMS/WhatsApp';

CREATE INDEX IDX_SS_PRES_INSC ON SS_PRESENCES(INSCRIPTION_ID);
CREATE INDEX IDX_SS_PRES_DATE ON SS_PRESENCES(DATE_PRESENCE);
CREATE INDEX IDX_SS_PRES_STATUT ON SS_PRESENCES(STATUT_PRESENCE);
CREATE INDEX IDX_SS_PRES_DATE_STATUT ON SS_PRESENCES(DATE_PRESENCE, STATUT_PRESENCE);

PROMPT   ✓ Table SS_PRESENCES créée

-- ============================================================================
-- TABLE 36 : SS_INCIDENTS
-- Description : Enregistrement des incidents disciplinaires.
--               Inclut le système de gravité et le workflow de traitement.
-- ============================================================================
CREATE TABLE SS_INCIDENTS (
    INCIDENT_ID          NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_INCIDENTS PRIMARY KEY,
    ELEVE_ID             NUMBER              NOT NULL,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    CLASSE_ID            NUMBER,
    -- Incident
    DATE_INCIDENT        DATE                DEFAULT SYSDATE NOT NULL,
    HEURE_INCIDENT       VARCHAR2(5),
    LIEU                 VARCHAR2(100),
    TYPE_INCIDENT        VARCHAR2(50)        NOT NULL,
    GRAVITE              VARCHAR2(20)        NOT NULL,
    -- Description
    DESCRIPTION          VARCHAR2(2000)      NOT NULL,
    TEMOINS              VARCHAR2(500),      -- Noms des témoins
    -- Traitement
    SIGNALE_PAR          VARCHAR2(100)       NOT NULL,  -- Qui a signalé
    TRAITE_PAR           VARCHAR2(100),      -- Qui a traité
    DATE_TRAITEMENT      DATE,
    DECISION             VARCHAR2(500),
    -- Notification parent
    PARENT_NOTIFIE       VARCHAR2(1)         DEFAULT 'N',
    DATE_NOTIFICATION    TIMESTAMP,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'SIGNALE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_INC_ELEV        FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_INC_ETAB        FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_INC_CLASS       FOREIGN KEY (CLASSE_ID)
                                     REFERENCES SS_CLASSES(CLASSE_ID),
    CONSTRAINT CK_SS_INC_TYPE        CHECK (TYPE_INCIDENT IN (
        'BAGARRE','INSULTE','TRICHERIE','VANDALISME','INSUBORDINATION',
        'ABSENTEISME','HARCELEMENT','VOL','DROGUE','TELEPHONE','RETARD_REPETE','AUTRE')),
    CONSTRAINT CK_SS_INC_GRAVITE     CHECK (GRAVITE IN ('MINEUR','MODERE','GRAVE','TRES_GRAVE','CRITIQUE')),
    CONSTRAINT CK_SS_INC_STATUT      CHECK (STATUT IN ('SIGNALE','EN_TRAITEMENT','TRAITE','CLOTURE','APPEL')),
    CONSTRAINT CK_SS_INC_NOTIF       CHECK (PARENT_NOTIFIE IN ('O','N'))
);

COMMENT ON TABLE SS_INCIDENTS IS 'Registre des incidents disciplinaires avec système de gravité';

CREATE INDEX IDX_SS_INC_ELEV ON SS_INCIDENTS(ELEVE_ID);
CREATE INDEX IDX_SS_INC_ETAB ON SS_INCIDENTS(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_INC_DATE ON SS_INCIDENTS(DATE_INCIDENT);
CREATE INDEX IDX_SS_INC_GRAVITE ON SS_INCIDENTS(GRAVITE);
CREATE INDEX IDX_SS_INC_STATUT ON SS_INCIDENTS(STATUT);

PROMPT   ✓ Table SS_INCIDENTS créée

-- ============================================================================
-- TABLE 37 : SS_SANCTIONS
-- Description : Sanctions appliquées suite aux incidents.
--               Historique complet des mesures disciplinaires.
-- ============================================================================
CREATE TABLE SS_SANCTIONS (
    SANCTION_ID          NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_SANCTIONS PRIMARY KEY,
    INCIDENT_ID          NUMBER              NOT NULL,
    ELEVE_ID             NUMBER              NOT NULL,
    -- Sanction
    TYPE_SANCTION        VARCHAR2(50)        NOT NULL,
    DATE_SANCTION        DATE                DEFAULT SYSDATE NOT NULL,
    DATE_DEBUT           DATE,               -- Début de la sanction (exclusion)
    DATE_FIN             DATE,               -- Fin de la sanction
    DUREE_JOURS          NUMBER(4),          -- Durée en jours
    -- Décision
    DECIDE_PAR           VARCHAR2(100)       NOT NULL,
    INSTANCE_DECISION    VARCHAR2(50),       -- PROFESSEUR, CENSEUR, DIRECTEUR, CONSEIL_DISCIPLINE
    DESCRIPTION          VARCHAR2(1000),
    CONDITIONS_RETOUR    VARCHAR2(500),      -- Conditions pour réintégration
    -- Exécution
    EST_EXECUTEE         VARCHAR2(1)         DEFAULT 'N',
    DATE_EXECUTION       DATE,
    -- Notification
    PARENT_NOTIFIE       VARCHAR2(1)         DEFAULT 'N',
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_SANC_INC        FOREIGN KEY (INCIDENT_ID)
                                     REFERENCES SS_INCIDENTS(INCIDENT_ID),
    CONSTRAINT FK_SS_SANC_ELEV       FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT CK_SS_SANC_TYPE       CHECK (TYPE_SANCTION IN (
        'AVERTISSEMENT_ORAL','AVERTISSEMENT_ECRIT','BLAME','RETENUE',
        'EXCLUSION_TEMPORAIRE','EXCLUSION_DEFINITIVE','TRAVAUX_INTERET',
        'CONVOCATION_PARENTS','CONSEIL_DISCIPLINE','OBLIGATION_EXCUSE')),
    CONSTRAINT CK_SS_SANC_INSTANCE   CHECK (INSTANCE_DECISION IS NULL OR 
                                     INSTANCE_DECISION IN ('PROFESSEUR','CENSEUR','DIRECTEUR','CONSEIL_DISCIPLINE','COMITE')),
    CONSTRAINT CK_SS_SANC_EXEC       CHECK (EST_EXECUTEE IN ('O','N')),
    CONSTRAINT CK_SS_SANC_NOTIF      CHECK (PARENT_NOTIFIE IN ('O','N'))
);

COMMENT ON TABLE SS_SANCTIONS IS 'Sanctions disciplinaires avec workflow de traitement';

CREATE INDEX IDX_SS_SANC_INC ON SS_SANCTIONS(INCIDENT_ID);
CREATE INDEX IDX_SS_SANC_ELEV ON SS_SANCTIONS(ELEVE_ID);
CREATE INDEX IDX_SS_SANC_TYPE ON SS_SANCTIONS(TYPE_SANCTION);
CREATE INDEX IDX_SS_SANC_DATE ON SS_SANCTIONS(DATE_SANCTION);

PROMPT   ✓ Table SS_SANCTIONS créée

-- ============================================================================
-- TABLE 38 : SS_OUVRAGES
-- Description : Catalogue de la bibliothèque scolaire.
-- ============================================================================
CREATE TABLE SS_OUVRAGES (
    OUVRAGE_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_OUVRAGES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    -- Identification
    ISBN                 VARCHAR2(20),
    CODE_INTERNE         VARCHAR2(30)        NOT NULL,
    TITRE                VARCHAR2(300)       NOT NULL,
    AUTEUR               VARCHAR2(200),
    EDITEUR              VARCHAR2(200),
    ANNEE_PUBLICATION    NUMBER(4),
    -- Classification
    CATEGORIE            VARCHAR2(50),
    SOUS_CATEGORIE       VARCHAR2(50),
    LANGUE               VARCHAR2(20)        DEFAULT 'FRANCAIS',
    NIVEAU_CIBLE         VARCHAR2(50),       -- Niveau scolaire cible
    MATIERE_ASSOCIEE     VARCHAR2(100),
    -- Stock
    NB_EXEMPLAIRES       NUMBER(4)           DEFAULT 0,
    NB_DISPONIBLES       NUMBER(4)           DEFAULT 0,
    -- Description
    RESUME               VARCHAR2(2000),
    COUVERTURE_URL       VARCHAR2(500),
    EMPLACEMENT          VARCHAR2(100),      -- Rayon, étagère
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'DISPONIBLE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_OUV_ETAB        FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_OUV_CODE        UNIQUE (ETABLISSEMENT_ID, CODE_INTERNE),
    CONSTRAINT CK_SS_OUV_STATUT      CHECK (STATUT IN ('DISPONIBLE','INDISPONIBLE','EN_COMMANDE','RETIRE'))
);

COMMENT ON TABLE SS_OUVRAGES IS 'Catalogue de la bibliothèque scolaire';

CREATE INDEX IDX_SS_OUV_ETAB ON SS_OUVRAGES(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_OUV_TITRE ON SS_OUVRAGES(UPPER(TITRE));
CREATE INDEX IDX_SS_OUV_AUTEUR ON SS_OUVRAGES(UPPER(AUTEUR));

PROMPT   ✓ Table SS_OUVRAGES créée

-- ============================================================================
-- TABLE 39 : SS_EXEMPLAIRES
-- Description : Exemplaires physiques des ouvrages.
-- ============================================================================
CREATE TABLE SS_EXEMPLAIRES (
    EXEMPLAIRE_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_EXEMPLAIRES PRIMARY KEY,
    OUVRAGE_ID           NUMBER              NOT NULL,
    CODE_EXEMPLAIRE      VARCHAR2(30)        NOT NULL,  -- Code-barres ou code unique
    ETAT                 VARCHAR2(20)        DEFAULT 'BON' NOT NULL,
    STATUT               VARCHAR2(20)        DEFAULT 'DISPONIBLE' NOT NULL,
    DATE_ACQUISITION     DATE,
    OBSERVATION          VARCHAR2(300),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_EXEM_OUV        FOREIGN KEY (OUVRAGE_ID)
                                     REFERENCES SS_OUVRAGES(OUVRAGE_ID),
    CONSTRAINT UK_SS_EXEM_CODE       UNIQUE (CODE_EXEMPLAIRE),
    CONSTRAINT CK_SS_EXEM_ETAT       CHECK (ETAT IN ('NEUF','BON','USAGE','ABIME','HORS_SERVICE')),
    CONSTRAINT CK_SS_EXEM_STATUT     CHECK (STATUT IN ('DISPONIBLE','EMPRUNTE','RESERVE','PERDU','RETIRE'))
);

COMMENT ON TABLE SS_EXEMPLAIRES IS 'Exemplaires physiques des ouvrages de bibliothèque';

CREATE INDEX IDX_SS_EXEM_OUV ON SS_EXEMPLAIRES(OUVRAGE_ID);
CREATE INDEX IDX_SS_EXEM_STATUT ON SS_EXEMPLAIRES(STATUT);

PROMPT   ✓ Table SS_EXEMPLAIRES créée

-- ============================================================================
-- TABLE 40 : SS_EMPRUNTS
-- Description : Prêts de livres avec suivi des retours et retards.
-- ============================================================================
CREATE TABLE SS_EMPRUNTS (
    EMPRUNT_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_EMPRUNTS PRIMARY KEY,
    EXEMPLAIRE_ID        NUMBER              NOT NULL,
    ELEVE_ID             NUMBER,             -- Peut être NULL si emprunt par enseignant
    ENSEIGNANT_ID        NUMBER,
    -- Dates
    DATE_EMPRUNT         DATE                DEFAULT SYSDATE NOT NULL,
    DATE_RETOUR_PREVUE   DATE                NOT NULL,
    DATE_RETOUR_EFFECTIVE DATE,
    NB_JOURS_RETARD      NUMBER(4)           DEFAULT 0,
    NB_RENOUVELLEMENTS   NUMBER(2)           DEFAULT 0,
    -- État
    ETAT_RETOUR          VARCHAR2(20),       -- État du livre au retour
    OBSERVATION          VARCHAR2(300),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'EN_COURS' NOT NULL,
    -- Notification
    RAPPEL_ENVOYE        VARCHAR2(1)         DEFAULT 'N',
    DATE_RAPPEL          DATE,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_EMPR_EXEM       FOREIGN KEY (EXEMPLAIRE_ID)
                                     REFERENCES SS_EXEMPLAIRES(EXEMPLAIRE_ID),
    CONSTRAINT FK_SS_EMPR_ELEV       FOREIGN KEY (ELEVE_ID)
                                     REFERENCES SS_ELEVES(ELEVE_ID),
    CONSTRAINT FK_SS_EMPR_ENS        FOREIGN KEY (ENSEIGNANT_ID)
                                     REFERENCES SS_ENSEIGNANTS(ENSEIGNANT_ID),
    CONSTRAINT CK_SS_EMPR_STATUT     CHECK (STATUT IN ('EN_COURS','RETOURNE','EN_RETARD','PERDU')),
    CONSTRAINT CK_SS_EMPR_ETAT       CHECK (ETAT_RETOUR IS NULL OR 
                                     ETAT_RETOUR IN ('NEUF','BON','USAGE','ABIME','HORS_SERVICE')),
    CONSTRAINT CK_SS_EMPR_EMPRUNTEUR CHECK (ELEVE_ID IS NOT NULL OR ENSEIGNANT_ID IS NOT NULL),
    CONSTRAINT CK_SS_EMPR_RAPPEL     CHECK (RAPPEL_ENVOYE IN ('O','N'))
);

COMMENT ON TABLE SS_EMPRUNTS IS 'Emprunts de livres avec suivi des retours et retards';
-- NB: Contrainte CK_SS_EMPR_EMPRUNTEUR : au moins un emprunteur (ELEVE_ID ou ENSEIGNANT_ID) doit être renseigné

CREATE INDEX IDX_SS_EMPR_EXEM ON SS_EMPRUNTS(EXEMPLAIRE_ID);
CREATE INDEX IDX_SS_EMPR_ELEV ON SS_EMPRUNTS(ELEVE_ID);
CREATE INDEX IDX_SS_EMPR_ENS ON SS_EMPRUNTS(ENSEIGNANT_ID);
CREATE INDEX IDX_SS_EMPR_STATUT ON SS_EMPRUNTS(STATUT);
CREATE INDEX IDX_SS_EMPR_DATE ON SS_EMPRUNTS(DATE_RETOUR_PREVUE);

PROMPT   ✓ Table SS_EMPRUNTS créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULE 5 TERMINÉ — 6 tables créées
PROMPT ============================================
