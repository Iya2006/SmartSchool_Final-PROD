-- ============================================================================
-- SMARTSCHOOL ERP — Script 04 : TABLES FINANCE & PAIEMENTS
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Module      : Finance & Paiements (8 tables)
-- Tables      : SS_TYPES_FRAIS, SS_GRILLE_TARIFAIRE, SS_FACTURES,
--               SS_FACTURE_LIGNES, SS_PAIEMENTS, SS_MOBILE_MONEY_LOGS,
--               SS_DEPENSES, SS_JOURNAL_CAISSE
-- Devise      : Franc Guinéen (GNF) — monnaie locale
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   MODULE 4 — FINANCE & PAIEMENTS
PROMPT   Création de 8 tables
PROMPT ============================================

-- ============================================================================
-- TABLE 27 : SS_TYPES_FRAIS
-- Description : Référentiel des types de frais scolaires.
--               Ex: Inscription, Scolarité, Uniforme, Transport, etc.
-- ============================================================================
CREATE TABLE SS_TYPES_FRAIS (
    TYPE_FRAIS_ID        NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_TYPES_FRAIS PRIMARY KEY,
    CODE                 VARCHAR2(20)        NOT NULL,
    LIBELLE              VARCHAR2(150)       NOT NULL,
    CATEGORIE            VARCHAR2(50)        NOT NULL,  -- INSCRIPTION, SCOLARITE, AUTRES
    EST_OBLIGATOIRE      VARCHAR2(1)         DEFAULT 'O' NOT NULL,
    EST_REMBOURSABLE     VARCHAR2(1)         DEFAULT 'N' NOT NULL,
    FREQUENCE            VARCHAR2(20)        DEFAULT 'ANNUEL',  -- ANNUEL, TRIMESTRIEL, MENSUEL, UNIQUE
    DESCRIPTION          VARCHAR2(500),
    ORDRE_AFFICHAGE      NUMBER(3)           DEFAULT 0,
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT UK_SS_TFRAIS_CODE     UNIQUE (CODE),
    CONSTRAINT CK_SS_TFRAIS_CATEG    CHECK (CATEGORIE IN (
        'INSCRIPTION','SCOLARITE','EXAMEN','UNIFORME','TRANSPORT','CANTINE','ACTIVITE','AUTRE')),
    CONSTRAINT CK_SS_TFRAIS_OBLIG    CHECK (EST_OBLIGATOIRE IN ('O','N')),
    CONSTRAINT CK_SS_TFRAIS_REMB     CHECK (EST_REMBOURSABLE IN ('O','N')),
    CONSTRAINT CK_SS_TFRAIS_FREQ     CHECK (FREQUENCE IN ('ANNUEL','TRIMESTRIEL','MENSUEL','UNIQUE')),
    CONSTRAINT CK_SS_TFRAIS_STATUT   CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_TYPES_FRAIS IS 'Catalogue des types de frais scolaires';
COMMENT ON COLUMN SS_TYPES_FRAIS.FREQUENCE IS 'Fréquence de paiement : ANNUEL, TRIMESTRIEL, MENSUEL ou UNIQUE';

PROMPT   ✓ Table SS_TYPES_FRAIS créée

-- ============================================================================
-- TABLE 28 : SS_GRILLE_TARIFAIRE
-- Description : Tarifs par type de frais, niveau et année scolaire.
--               Permet des tarifs différents selon le niveau et l'établissement.
-- ============================================================================
CREATE TABLE SS_GRILLE_TARIFAIRE (
    GRILLE_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_GRILLE PRIMARY KEY,
    TYPE_FRAIS_ID        NUMBER              NOT NULL,
    NIVEAU_ID            NUMBER,             -- NULL = tous les niveaux
    ANNEE_ID             NUMBER              NOT NULL,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    -- Montants (en GNF — Franc Guinéen)
    MONTANT              NUMBER(12,2)        NOT NULL,  -- Montant standard
    MONTANT_REDUCTION    NUMBER(12,2)        DEFAULT 0, -- Réduction applicable (bourse, fratrie...)
    MONTANT_PENALITE     NUMBER(12,2)        DEFAULT 0, -- Pénalité de retard
    -- Échéancier
    ECHEANCIER           VARCHAR2(20)        DEFAULT 'TOTAL',  -- TOTAL, 2_FOIS, 3_FOIS, MENSUEL
    DATE_LIMITE_1        DATE,               -- Date limite 1ère échéance
    DATE_LIMITE_2        DATE,
    DATE_LIMITE_3        DATE,
    DATE_LIMITE_FINALE   DATE,               -- Date limite ultime
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'ACTIF' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_GRIL_TFRAIS     FOREIGN KEY (TYPE_FRAIS_ID)
                                     REFERENCES SS_TYPES_FRAIS(TYPE_FRAIS_ID),
    CONSTRAINT FK_SS_GRIL_NIV        FOREIGN KEY (NIVEAU_ID)
                                     REFERENCES SS_NIVEAUX(NIVEAU_ID),
    CONSTRAINT FK_SS_GRIL_ANNEE      FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT FK_SS_GRIL_ETAB       FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT UK_SS_GRIL_UNIQUE     UNIQUE (TYPE_FRAIS_ID, NIVEAU_ID, ANNEE_ID, ETABLISSEMENT_ID),
    CONSTRAINT CK_SS_GRIL_MONTANT    CHECK (MONTANT >= 0),
    CONSTRAINT CK_SS_GRIL_ECHEANCE   CHECK (ECHEANCIER IN ('TOTAL','2_FOIS','3_FOIS','MENSUEL')),
    CONSTRAINT CK_SS_GRIL_STATUT     CHECK (STATUT IN ('ACTIF','INACTIF'))
);

COMMENT ON TABLE SS_GRILLE_TARIFAIRE IS 'Grille tarifaire par type de frais, niveau et année — montants en GNF';
COMMENT ON COLUMN SS_GRILLE_TARIFAIRE.MONTANT IS 'Montant en Francs Guinéens (GNF)';
COMMENT ON COLUMN SS_GRILLE_TARIFAIRE.ECHEANCIER IS 'Mode de paiement : total, en 2 ou 3 fois, ou mensuel';

CREATE INDEX IDX_SS_GRIL_TFRAIS ON SS_GRILLE_TARIFAIRE(TYPE_FRAIS_ID);
CREATE INDEX IDX_SS_GRIL_NIV ON SS_GRILLE_TARIFAIRE(NIVEAU_ID);
CREATE INDEX IDX_SS_GRIL_ANNEE ON SS_GRILLE_TARIFAIRE(ANNEE_ID);
CREATE INDEX IDX_SS_GRIL_ETAB ON SS_GRILLE_TARIFAIRE(ETABLISSEMENT_ID);

PROMPT   ✓ Table SS_GRILLE_TARIFAIRE créée

-- ============================================================================
-- TABLE 29 : SS_FACTURES
-- Description : Factures générées pour chaque inscription.
--               Une facture par élève par année scolaire (peut contenir plusieurs lignes).
-- ============================================================================
CREATE TABLE SS_FACTURES (
    FACTURE_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_FACTURES PRIMARY KEY,
    INSCRIPTION_ID       NUMBER              NOT NULL,
    NUMERO_FACTURE       VARCHAR2(30)        NOT NULL,  -- Format: FACT-ETAB-ANNEE-SEQ
    -- Montants
    DATE_FACTURE         DATE                DEFAULT SYSDATE NOT NULL,
    DATE_ECHEANCE        DATE,
    MONTANT_TOTAL        NUMBER(12,2)        DEFAULT 0 NOT NULL,
    MONTANT_REMISE       NUMBER(12,2)        DEFAULT 0,
    MONTANT_NET          NUMBER(12,2)        DEFAULT 0 NOT NULL,  -- Total - Remise
    MONTANT_PAYE         NUMBER(12,2)        DEFAULT 0 NOT NULL,
    MONTANT_RESTANT      NUMBER(12,2)        DEFAULT 0 NOT NULL,
    -- Type de remise
    TYPE_REMISE          VARCHAR2(30),       -- BOURSE, FRATRIE, PERSONNEL, ORPHELIN, AUTRE
    MOTIF_REMISE         VARCHAR2(300),
    POURCENTAGE_REMISE   NUMBER(5,2),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'EN_ATTENTE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_FACT_INSC       FOREIGN KEY (INSCRIPTION_ID)
                                     REFERENCES SS_INSCRIPTIONS(INSCRIPTION_ID),
    CONSTRAINT UK_SS_FACT_NUMERO     UNIQUE (NUMERO_FACTURE),
    CONSTRAINT CK_SS_FACT_MONTANTS   CHECK (MONTANT_TOTAL >= 0 AND MONTANT_PAYE >= 0 AND MONTANT_RESTANT >= 0),
    CONSTRAINT CK_SS_FACT_STATUT     CHECK (STATUT IN (
        'EN_ATTENTE','PARTIELLEMENT_PAYEE','PAYEE','EN_RETARD','ANNULEE')),
    CONSTRAINT CK_SS_FACT_REMISE     CHECK (TYPE_REMISE IS NULL OR TYPE_REMISE IN (
        'BOURSE','FRATRIE','PERSONNEL','ORPHELIN','MERITE','AUTRE'))
);

COMMENT ON TABLE SS_FACTURES IS 'Factures des frais de scolarité par inscription';
COMMENT ON COLUMN SS_FACTURES.NUMERO_FACTURE IS 'Numéro unique de facture : FACT-CODE_ETAB-ANNEE-SEQUENCE';
COMMENT ON COLUMN SS_FACTURES.TYPE_REMISE IS 'Type de remise applicable : bourse, fratrie, enfant du personnel, orphelin...';

CREATE INDEX IDX_SS_FACT_INSC ON SS_FACTURES(INSCRIPTION_ID);
CREATE INDEX IDX_SS_FACT_STATUT ON SS_FACTURES(STATUT);
CREATE INDEX IDX_SS_FACT_DATE ON SS_FACTURES(DATE_FACTURE);

PROMPT   ✓ Table SS_FACTURES créée

-- ============================================================================
-- TABLE 30 : SS_FACTURE_LIGNES
-- Description : Détail des lignes de facturation.
-- ============================================================================
CREATE TABLE SS_FACTURE_LIGNES (
    LIGNE_ID             NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_FACT_LIGNES PRIMARY KEY,
    FACTURE_ID           NUMBER              NOT NULL,
    GRILLE_ID            NUMBER,             -- FK vers grille tarifaire
    -- Détail
    LIBELLE              VARCHAR2(200)       NOT NULL,
    QUANTITE             NUMBER(4)           DEFAULT 1 NOT NULL,
    PRIX_UNITAIRE        NUMBER(12,2)        NOT NULL,
    REMISE               NUMBER(12,2)        DEFAULT 0,
    MONTANT_NET          NUMBER(12,2)        NOT NULL,
    -- Ordre
    ORDRE                NUMBER(3)           DEFAULT 0,
    --
    CONSTRAINT FK_SS_FLIG_FACT       FOREIGN KEY (FACTURE_ID)
                                     REFERENCES SS_FACTURES(FACTURE_ID) ON DELETE CASCADE,
    CONSTRAINT FK_SS_FLIG_GRIL       FOREIGN KEY (GRILLE_ID)
                                     REFERENCES SS_GRILLE_TARIFAIRE(GRILLE_ID),
    CONSTRAINT CK_SS_FLIG_MONTANTS   CHECK (PRIX_UNITAIRE >= 0 AND MONTANT_NET >= 0 AND REMISE >= 0)
);

COMMENT ON TABLE SS_FACTURE_LIGNES IS 'Lignes détaillées de facturation';

CREATE INDEX IDX_SS_FLIG_FACT ON SS_FACTURE_LIGNES(FACTURE_ID);

PROMPT   ✓ Table SS_FACTURE_LIGNES créée

-- ============================================================================
-- TABLE 31 : SS_PAIEMENTS
-- Description : Enregistrement de tous les paiements reçus.
--               Supporte : Espèces, Chèque, Virement et Mobile Money.
-- ============================================================================
CREATE TABLE SS_PAIEMENTS (
    PAIEMENT_ID          NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_PAIEMENTS PRIMARY KEY,
    FACTURE_ID           NUMBER              NOT NULL,
    -- Référence
    NUMERO_RECU          VARCHAR2(30)        NOT NULL,  -- Format: REC-ETAB-ANNEE-SEQ
    DATE_PAIEMENT        DATE                DEFAULT SYSDATE NOT NULL,
    -- Montant
    MONTANT              NUMBER(12,2)        NOT NULL,
    DEVISE               VARCHAR2(5)         DEFAULT 'GNF' NOT NULL,
    -- Mode de paiement
    MODE_PAIEMENT        VARCHAR2(30)        NOT NULL,
    REFERENCE_EXTERNE    VARCHAR2(100),      -- Référence chèque/virement/Mobile Money
    -- Mobile Money spécifique
    OPERATEUR_MM         VARCHAR2(20),       -- ORANGE_MONEY, MTN_MONEY
    NUMERO_TELEPHONE_MM  VARCHAR2(20),
    -- Traitement
    RECU_PAR             VARCHAR2(100),      -- Personne ayant reçu le paiement
    CAISSE               VARCHAR2(50),       -- Identifiant de la caisse
    OBSERVATION          VARCHAR2(300),
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'VALIDE' NOT NULL,
    DATE_ANNULATION      DATE,
    MOTIF_ANNULATION     VARCHAR2(300),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_PAIE_FACT       FOREIGN KEY (FACTURE_ID)
                                     REFERENCES SS_FACTURES(FACTURE_ID),
    CONSTRAINT UK_SS_PAIE_RECU       UNIQUE (NUMERO_RECU),
    CONSTRAINT CK_SS_PAIE_MONTANT    CHECK (MONTANT > 0),
    CONSTRAINT CK_SS_PAIE_MODE       CHECK (MODE_PAIEMENT IN (
        'ESPECES','CHEQUE','VIREMENT','ORANGE_MONEY','MTN_MONEY','CARTE_BANCAIRE','AUTRE')),
    CONSTRAINT CK_SS_PAIE_DEVISE     CHECK (DEVISE IN ('GNF','USD','EUR')),
    CONSTRAINT CK_SS_PAIE_STATUT     CHECK (STATUT IN ('VALIDE','ANNULE','EN_ATTENTE','REMBOURSE')),
    CONSTRAINT CK_SS_PAIE_OPERATEUR  CHECK (OPERATEUR_MM IS NULL OR 
                                     OPERATEUR_MM IN ('ORANGE_MONEY','MTN_MONEY'))
);

COMMENT ON TABLE SS_PAIEMENTS IS 'Paiements reçus — supporte espèces, chèque, virement et Mobile Money';
COMMENT ON COLUMN SS_PAIEMENTS.DEVISE IS 'Devise : GNF (Franc Guinéen) par défaut';
COMMENT ON COLUMN SS_PAIEMENTS.OPERATEUR_MM IS 'Opérateur Mobile Money : Orange Money ou MTN Money (Guinée)';

CREATE INDEX IDX_SS_PAIE_FACT ON SS_PAIEMENTS(FACTURE_ID);
CREATE INDEX IDX_SS_PAIE_MODE ON SS_PAIEMENTS(MODE_PAIEMENT);
CREATE INDEX IDX_SS_PAIE_DATE ON SS_PAIEMENTS(DATE_PAIEMENT);
CREATE INDEX IDX_SS_PAIE_STATUT ON SS_PAIEMENTS(STATUT);

PROMPT   ✓ Table SS_PAIEMENTS créée

-- ============================================================================
-- TABLE 32 : SS_MOBILE_MONEY_LOGS
-- Description : Logs techniques pour l'intégration Mobile Money.
--               Trace TOUTES les interactions API avec Orange Money / MTN Money.
--               Critique pour la réconciliation et le debugging.
-- ============================================================================
CREATE TABLE SS_MOBILE_MONEY_LOGS (
    MM_LOG_ID            NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_MM_LOGS PRIMARY KEY,
    PAIEMENT_ID          NUMBER,             -- Peut être NULL si le paiement n'a pas abouti
    -- Transaction
    OPERATEUR            VARCHAR2(20)        NOT NULL,
    NUMERO_TELEPHONE     VARCHAR2(20)        NOT NULL,
    TRANSACTION_ID       VARCHAR2(100),      -- ID de transaction de l'opérateur
    REFERENCE_INTERNE    VARCHAR2(50)        NOT NULL,  -- Notre référence interne
    -- Montant
    MONTANT              NUMBER(12,2)        NOT NULL,
    DEVISE               VARCHAR2(5)         DEFAULT 'GNF',
    FRAIS_TRANSACTION    NUMBER(12,2)        DEFAULT 0,  -- Frais prélevés par l'opérateur
    -- API
    TYPE_REQUETE         VARCHAR2(30)        NOT NULL,  -- INITIATE, CONFIRM, STATUS, CALLBACK
    STATUT_API           VARCHAR2(30)        NOT NULL,  -- PENDING, SUCCESS, FAILED, TIMEOUT, CANCELLED
    CODE_REPONSE         VARCHAR2(20),
    MESSAGE_REPONSE      VARCHAR2(500),
    -- Payloads (stockés en CLOB pour traçabilité complète)
    PAYLOAD_REQUETE      CLOB,              -- JSON envoyé à l'API
    PAYLOAD_REPONSE      CLOB,              -- JSON reçu de l'API
    -- Timestamps
    DATE_REQUETE         TIMESTAMP           DEFAULT SYSTIMESTAMP NOT NULL,
    DATE_REPONSE         TIMESTAMP,
    -- Callback
    CALLBACK_URL         VARCHAR2(500),
    CALLBACK_RECU        VARCHAR2(1)         DEFAULT 'N',
    DATE_CALLBACK        TIMESTAMP,
    -- Audit
    IP_SOURCE            VARCHAR2(50),
    USER_AGENT           VARCHAR2(500),
    --
    CONSTRAINT FK_SS_MM_PAIE         FOREIGN KEY (PAIEMENT_ID)
                                     REFERENCES SS_PAIEMENTS(PAIEMENT_ID),
    CONSTRAINT CK_SS_MM_OPERATEUR    CHECK (OPERATEUR IN ('ORANGE_MONEY','MTN_MONEY')),
    CONSTRAINT CK_SS_MM_TYPE         CHECK (TYPE_REQUETE IN (
        'INITIATE','CONFIRM','STATUS','CALLBACK','REFUND','CANCEL')),
    CONSTRAINT CK_SS_MM_STATUT       CHECK (STATUT_API IN (
        'PENDING','PROCESSING','SUCCESS','FAILED','TIMEOUT','CANCELLED','REFUNDED')),
    CONSTRAINT CK_SS_MM_CALLBACK     CHECK (CALLBACK_RECU IN ('O','N')),
    CONSTRAINT CK_SS_MM_MONTANT      CHECK (MONTANT > 0)
);

COMMENT ON TABLE SS_MOBILE_MONEY_LOGS IS 'Logs techniques complets des transactions Mobile Money — traçabilité API';
COMMENT ON COLUMN SS_MOBILE_MONEY_LOGS.PAYLOAD_REQUETE IS 'JSON complet envoyé à l''API Mobile Money — conservé pour audit';
COMMENT ON COLUMN SS_MOBILE_MONEY_LOGS.PAYLOAD_REPONSE IS 'JSON complet reçu de l''API Mobile Money — conservé pour audit';
COMMENT ON COLUMN SS_MOBILE_MONEY_LOGS.TYPE_REQUETE IS 'Type d''interaction : INITIATE (lancement), CONFIRM, STATUS (vérification), CALLBACK';

CREATE INDEX IDX_SS_MM_PAIE ON SS_MOBILE_MONEY_LOGS(PAIEMENT_ID);
CREATE INDEX IDX_SS_MM_OPER ON SS_MOBILE_MONEY_LOGS(OPERATEUR);
CREATE INDEX IDX_SS_MM_TEL ON SS_MOBILE_MONEY_LOGS(NUMERO_TELEPHONE);
CREATE INDEX IDX_SS_MM_TRANS ON SS_MOBILE_MONEY_LOGS(TRANSACTION_ID);
CREATE INDEX IDX_SS_MM_STATUS ON SS_MOBILE_MONEY_LOGS(STATUT_API);
CREATE INDEX IDX_SS_MM_DATE ON SS_MOBILE_MONEY_LOGS(DATE_REQUETE);

PROMPT   ✓ Table SS_MOBILE_MONEY_LOGS créée

-- ============================================================================
-- TABLE 33 : SS_DEPENSES
-- Description : Registre des dépenses de l'établissement.
--               Workflow d'approbation : Demande → Approbation → Exécution.
-- ============================================================================
CREATE TABLE SS_DEPENSES (
    DEPENSE_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_DEPENSES PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    ANNEE_ID             NUMBER              NOT NULL,
    -- Détail
    CATEGORIE            VARCHAR2(50)        NOT NULL,
    SOUS_CATEGORIE       VARCHAR2(50),
    LIBELLE              VARCHAR2(300)       NOT NULL,
    DESCRIPTION          VARCHAR2(1000),
    -- Montant
    MONTANT              NUMBER(12,2)        NOT NULL,
    DEVISE               VARCHAR2(5)         DEFAULT 'GNF',
    DATE_DEPENSE         DATE                DEFAULT SYSDATE NOT NULL,
    -- Fournisseur
    FOURNISSEUR          VARCHAR2(200),
    REFERENCE_PIECE      VARCHAR2(100),      -- Numéro de facture fournisseur
    -- Approbation
    DEMANDE_PAR          VARCHAR2(100),
    APPROUVE_PAR         VARCHAR2(100),
    DATE_APPROBATION     DATE,
    -- Statut
    STATUT               VARCHAR2(20)        DEFAULT 'EN_ATTENTE' NOT NULL,
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    MODIFIED_BY          VARCHAR2(100),
    MODIFIED_DATE        TIMESTAMP,
    --
    CONSTRAINT FK_SS_DEP_ETAB        FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_DEP_ANNEE       FOREIGN KEY (ANNEE_ID)
                                     REFERENCES SS_ANNEES_SCOLAIRES(ANNEE_ID),
    CONSTRAINT CK_SS_DEP_CATEG       CHECK (CATEGORIE IN (
        'SALAIRES','FOURNITURES','MAINTENANCE','EQUIPEMENT','TRANSPORT',
        'ELECTRICITE','EAU','TELEPHONE','LOYER','IMPOTS','DIVERS')),
    CONSTRAINT CK_SS_DEP_MONTANT     CHECK (MONTANT > 0),
    CONSTRAINT CK_SS_DEP_STATUT      CHECK (STATUT IN ('EN_ATTENTE','APPROUVEE','REJETEE','EXECUTEE','ANNULEE'))
);

COMMENT ON TABLE SS_DEPENSES IS 'Registre des dépenses avec workflow d''approbation';

CREATE INDEX IDX_SS_DEP_ETAB ON SS_DEPENSES(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_DEP_ANNEE ON SS_DEPENSES(ANNEE_ID);
CREATE INDEX IDX_SS_DEP_CATEG ON SS_DEPENSES(CATEGORIE);
CREATE INDEX IDX_SS_DEP_STATUT ON SS_DEPENSES(STATUT);
CREATE INDEX IDX_SS_DEP_DATE ON SS_DEPENSES(DATE_DEPENSE);

PROMPT   ✓ Table SS_DEPENSES créée

-- ============================================================================
-- TABLE 34 : SS_JOURNAL_CAISSE
-- Description : Journal comptable des mouvements de caisse (entrées/sorties).
--               Solde cumulé calculé automatiquement.
-- ============================================================================
CREATE TABLE SS_JOURNAL_CAISSE (
    JOURNAL_ID           NUMBER              GENERATED ALWAYS AS IDENTITY 
                                             (START WITH 1 INCREMENT BY 1)
                                             CONSTRAINT PK_SS_JOURNAL PRIMARY KEY,
    ETABLISSEMENT_ID     NUMBER              NOT NULL,
    -- Mouvement
    DATE_OPERATION       DATE                DEFAULT SYSDATE NOT NULL,
    TYPE_OPERATION       VARCHAR2(20)        NOT NULL,  -- ENTREE, SORTIE
    CATEGORIE            VARCHAR2(50)        NOT NULL,  -- SCOLARITE, INSCRIPTION, SALAIRE, etc.
    LIBELLE              VARCHAR2(300)       NOT NULL,
    -- Montants
    MONTANT_ENTREE       NUMBER(12,2)        DEFAULT 0,
    MONTANT_SORTIE       NUMBER(12,2)        DEFAULT 0,
    SOLDE_CUMULE         NUMBER(14,2),       -- Calculé automatiquement
    -- Référence
    REFERENCE            VARCHAR2(100),      -- Référence du document source
    PAIEMENT_ID          NUMBER,             -- Lien vers le paiement si applicable
    DEPENSE_ID           NUMBER,             -- Lien vers la dépense si applicable
    -- Opérateur
    OPERATEUR            VARCHAR2(100)       NOT NULL,
    CAISSE_NUMERO        VARCHAR2(20),
    OBSERVATION          VARCHAR2(500),
    -- Audit
    CREATED_BY           VARCHAR2(100)       DEFAULT USER,
    CREATED_DATE         TIMESTAMP           DEFAULT SYSTIMESTAMP,
    --
    CONSTRAINT FK_SS_JRN_ETAB        FOREIGN KEY (ETABLISSEMENT_ID)
                                     REFERENCES SS_ETABLISSEMENTS(ETABLISSEMENT_ID),
    CONSTRAINT FK_SS_JRN_PAIE        FOREIGN KEY (PAIEMENT_ID)
                                     REFERENCES SS_PAIEMENTS(PAIEMENT_ID),
    CONSTRAINT FK_SS_JRN_DEP         FOREIGN KEY (DEPENSE_ID)
                                     REFERENCES SS_DEPENSES(DEPENSE_ID),
    CONSTRAINT CK_SS_JRN_TYPE        CHECK (TYPE_OPERATION IN ('ENTREE','SORTIE')),
    CONSTRAINT CK_SS_JRN_MONTANTS    CHECK (MONTANT_ENTREE >= 0 AND MONTANT_SORTIE >= 0),
    CONSTRAINT CK_SS_JRN_COHERENCE   CHECK (
        (TYPE_OPERATION = 'ENTREE' AND MONTANT_ENTREE > 0 AND MONTANT_SORTIE = 0) OR
        (TYPE_OPERATION = 'SORTIE' AND MONTANT_SORTIE > 0 AND MONTANT_ENTREE = 0)
    )
);

COMMENT ON TABLE SS_JOURNAL_CAISSE IS 'Journal comptable des mouvements de caisse quotidiens';
COMMENT ON COLUMN SS_JOURNAL_CAISSE.SOLDE_CUMULE IS 'Solde cumulé après cette opération — recalculé par trigger';

CREATE INDEX IDX_SS_JRN_ETAB ON SS_JOURNAL_CAISSE(ETABLISSEMENT_ID);
CREATE INDEX IDX_SS_JRN_DATE ON SS_JOURNAL_CAISSE(DATE_OPERATION);
CREATE INDEX IDX_SS_JRN_TYPE ON SS_JOURNAL_CAISSE(TYPE_OPERATION);

PROMPT   ✓ Table SS_JOURNAL_CAISSE créée

PROMPT
PROMPT ============================================
PROMPT   ✅ MODULE 4 TERMINÉ — 8 tables créées
PROMPT ============================================
