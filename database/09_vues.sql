-- ============================================================================
-- SMARTSCHOOL ERP — Script 09 : VUES ESSENTIELLES
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Description : Vues optimisées pour l'application APEX.
--               Chaque vue consolide les données de plusieurs tables pour
--               éviter les jointures répétitives dans les pages.
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   VUES ESSENTIELLES — SMARTSCHOOL
PROMPT ============================================

-- ============================================================================
-- VUE 1 : V_SS_ELEVES_COMPLET
-- Usage : Annuaire élèves avec informations classe et établissement
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_ELEVES_COMPLET AS
WITH annee_courante AS (
    SELECT ANNEE_ID, ETABLISSEMENT_ID
    FROM SS_ANNEES_SCOLAIRES
    WHERE EST_COURANTE = 'O'
)
SELECT 
    e.ELEVE_ID,
    e.MATRICULE,
    e.NOM,
    e.PRENOM,
    e.NOM || ' ' || e.PRENOM AS NOM_COMPLET,
    e.DATE_NAISSANCE,
    TRUNC(MONTHS_BETWEEN(SYSDATE, e.DATE_NAISSANCE) / 12) AS AGE,
    e.LIEU_NAISSANCE,
    e.SEXE,
    CASE e.SEXE WHEN 'M' THEN 'Masculin' WHEN 'F' THEN 'Féminin' END AS SEXE_LIBELLE,
    e.NATIONALITE,
    e.ADRESSE,
    e.QUARTIER,
    e.TELEPHONE,
    e.EMAIL,
    e.PHOTO_URL,
    e.GROUPE_SANGUIN,
    e.STATUT AS STATUT_ELEVE,
    e.DATE_PREMIERE_INSCRIPTION,
    e.ETABLISSEMENT_ID,
    -- Inscription courante
    i.INSCRIPTION_ID,
    i.DATE_INSCRIPTION AS DATE_INSCRIPTION_COURANTE,
    i.STATUT AS STATUT_INSCRIPTION,
    i.TYPE_INSCRIPTION,
    -- Classe courante
    c.CLASSE_ID,
    c.CODE AS CODE_CLASSE,
    c.LIBELLE AS LIBELLE_CLASSE,
    -- Niveau
    n.NIVEAU_ID,
    n.CODE AS CODE_NIVEAU,
    n.LIBELLE AS LIBELLE_NIVEAU,
    -- Cycle
    cy.CYCLE_ID,
    cy.LIBELLE AS LIBELLE_CYCLE,
    -- Établissement
    et.CODE AS CODE_ETABLISSEMENT,
    et.NOM AS NOM_ETABLISSEMENT,
    -- Année scolaire
    a.ANNEE_ID,
    a.CODE AS CODE_ANNEE,
    a.LIBELLE AS LIBELLE_ANNEE,
    -- Parent principal
    p.PARENT_ID,
    p.NOM || ' ' || p.PRENOM AS NOM_PARENT_PRINCIPAL,
    p.TELEPHONE_1 AS TEL_PARENT
FROM SS_ELEVES e
LEFT JOIN annee_courante ac ON ac.ETABLISSEMENT_ID = e.ETABLISSEMENT_ID
LEFT JOIN SS_INSCRIPTIONS i ON e.ELEVE_ID = i.ELEVE_ID AND i.ANNEE_ID = ac.ANNEE_ID
LEFT JOIN SS_CLASSES c ON i.CLASSE_ID = c.CLASSE_ID
LEFT JOIN SS_NIVEAUX n ON c.NIVEAU_ID = n.NIVEAU_ID
LEFT JOIN SS_CYCLES cy ON n.CYCLE_ID = cy.CYCLE_ID
LEFT JOIN SS_ETABLISSEMENTS et ON e.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID
LEFT JOIN SS_ANNEES_SCOLAIRES a ON i.ANNEE_ID = a.ANNEE_ID
LEFT JOIN SS_ELEVE_PARENT ep ON e.ELEVE_ID = ep.ELEVE_ID AND ep.EST_CONTACT_PRINCIPAL = 'O'
LEFT JOIN SS_PARENTS p ON ep.PARENT_ID = p.PARENT_ID;

COMMENT ON TABLE V_SS_ELEVES_COMPLET IS 'Vue complète des élèves avec classe, niveau, cycle et parent principal';

PROMPT   ✓ Vue V_SS_ELEVES_COMPLET créée

-- ============================================================================
-- VUE 2 : V_SS_ENSEIGNANTS_COMPLET
-- Usage : Annuaire enseignants avec affectations
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_ENSEIGNANTS_COMPLET AS
SELECT 
    en.ENSEIGNANT_ID,
    en.MATRICULE,
    en.NOM,
    en.PRENOM,
    en.NOM || ' ' || en.PRENOM AS NOM_COMPLET,
    en.SEXE,
    en.TELEPHONE,
    en.EMAIL,
    en.SPECIALITE,
    en.DIPLOME_PLUS_ELEVE,
    en.GRADE,
    en.TYPE_CONTRAT,
    en.DATE_EMBAUCHE,
    en.STATUT,
    en.PHOTO_URL,
    en.ETABLISSEMENT_ID,
    et.NOM AS NOM_ETABLISSEMENT,
    -- Nombre de classes affectées (année courante)
    (SELECT COUNT(DISTINCT af.CLASSE_ID) FROM SS_AFFECTATIONS af 
     JOIN SS_ANNEES_SCOLAIRES an ON af.ANNEE_ID = an.ANNEE_ID AND an.EST_COURANTE = 'O'
     WHERE af.ENSEIGNANT_ID = en.ENSEIGNANT_ID AND af.STATUT = 'ACTIVE') AS NB_CLASSES,
    -- Nombre de matières
    (SELECT COUNT(DISTINCT af.MATIERE_ID) FROM SS_AFFECTATIONS af 
     JOIN SS_ANNEES_SCOLAIRES an ON af.ANNEE_ID = an.ANNEE_ID AND an.EST_COURANTE = 'O'
     WHERE af.ENSEIGNANT_ID = en.ENSEIGNANT_ID AND af.STATUT = 'ACTIVE') AS NB_MATIERES,
    -- Total heures par semaine
    (SELECT NVL(SUM(af.NB_HEURES_SEMAINE), 0) FROM SS_AFFECTATIONS af 
     JOIN SS_ANNEES_SCOLAIRES an ON af.ANNEE_ID = an.ANNEE_ID AND an.EST_COURANTE = 'O'
     WHERE af.ENSEIGNANT_ID = en.ENSEIGNANT_ID AND af.STATUT = 'ACTIVE') AS TOTAL_HEURES_SEMAINE
FROM SS_ENSEIGNANTS en
LEFT JOIN SS_ETABLISSEMENTS et ON en.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID;

COMMENT ON TABLE V_SS_ENSEIGNANTS_COMPLET IS 'Vue des enseignants avec statistiques d''affectation';

PROMPT   ✓ Vue V_SS_ENSEIGNANTS_COMPLET créée

-- ============================================================================
-- VUE 3 : V_SS_CLASSES_COMPLET
-- Usage : Liste des classes avec toutes les informations contextuelles
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_CLASSES_COMPLET AS
SELECT 
    c.CLASSE_ID,
    c.CODE AS CODE_CLASSE,
    c.LIBELLE AS LIBELLE_CLASSE,
    c.CAPACITE_MAX,
    c.EFFECTIF_ACTUEL,
    CASE 
        WHEN c.CAPACITE_MAX > 0 THEN ROUND((c.EFFECTIF_ACTUEL / c.CAPACITE_MAX) * 100, 1) 
        ELSE 0 
    END AS TAUX_OCCUPATION,
    c.STATUT,
    -- Niveau
    n.NIVEAU_ID,
    n.CODE AS CODE_NIVEAU,
    n.LIBELLE AS LIBELLE_NIVEAU,
    n.EST_EXAMEN,
    -- Section
    s.SECTION_ID,
    s.CODE AS CODE_SECTION,
    s.LIBELLE AS LIBELLE_SECTION,
    -- Cycle
    cy.CYCLE_ID,
    cy.CODE AS CODE_CYCLE,
    cy.LIBELLE AS LIBELLE_CYCLE,
    -- Salle
    sa.SALLE_ID,
    sa.CODE AS CODE_SALLE,
    sa.NOM AS NOM_SALLE,
    sa.CAPACITE AS CAPACITE_SALLE,
    -- Professeur principal
    en.ENSEIGNANT_ID AS PROF_PRINCIPAL_ID,
    en.NOM || ' ' || en.PRENOM AS NOM_PROF_PRINCIPAL,
    -- Année
    a.ANNEE_ID,
    a.CODE AS CODE_ANNEE,
    -- Établissement
    c.ETABLISSEMENT_ID,
    et.NOM AS NOM_ETABLISSEMENT,
    -- Stats garçons/filles
    (SELECT COUNT(*) FROM SS_INSCRIPTIONS i JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID 
     WHERE i.CLASSE_ID = c.CLASSE_ID AND i.STATUT = 'ACTIVE' AND e.SEXE = 'M') AS NB_GARCONS,
    (SELECT COUNT(*) FROM SS_INSCRIPTIONS i JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID 
     WHERE i.CLASSE_ID = c.CLASSE_ID AND i.STATUT = 'ACTIVE' AND e.SEXE = 'F') AS NB_FILLES
FROM SS_CLASSES c
LEFT JOIN SS_NIVEAUX n ON c.NIVEAU_ID = n.NIVEAU_ID
LEFT JOIN SS_SECTIONS s ON c.SECTION_ID = s.SECTION_ID
LEFT JOIN SS_CYCLES cy ON n.CYCLE_ID = cy.CYCLE_ID
LEFT JOIN SS_SALLES sa ON c.SALLE_ID = sa.SALLE_ID
LEFT JOIN SS_ENSEIGNANTS en ON c.PROFESSEUR_PRINCIPAL = en.ENSEIGNANT_ID
LEFT JOIN SS_ANNEES_SCOLAIRES a ON c.ANNEE_ID = a.ANNEE_ID
LEFT JOIN SS_ETABLISSEMENTS et ON c.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID;

COMMENT ON TABLE V_SS_CLASSES_COMPLET IS 'Vue des classes avec niveau, section, cycle, salle, prof principal et stats genrées';

PROMPT   ✓ Vue V_SS_CLASSES_COMPLET créée

-- ============================================================================
-- VUE 4 : V_SS_BULLETINS_COMPLET
-- Usage : Bulletins avec toutes les informations nécessaires pour l'impression
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_BULLETINS_COMPLET AS
SELECT 
    b.BULLETIN_ID,
    b.TYPE_BULLETIN,
    b.MOYENNE_GENERALE,
    b.RANG,
    b.EFFECTIF_CLASSE,
    b.TOTAL_POINTS,
    b.TOTAL_COEFFICIENTS,
    b.MOYENNE_PREMIER,
    b.MOYENNE_DERNIER,
    b.MOYENNE_CLASSE,
    b.APPRECIATION_CONSEIL,
    b.OBSERVATION_DIRECTEUR,
    b.MENTION,
    b.DECISION,
    b.STATUT AS STATUT_BULLETIN,
    b.DATE_GENERATION,
    -- Trimestre
    t.TRIMESTRE_ID,
    t.CODE AS CODE_TRIMESTRE,
    t.LIBELLE AS LIBELLE_TRIMESTRE,
    t.NUMERO AS NUMERO_TRIMESTRE,
    -- Élève
    e.ELEVE_ID,
    e.MATRICULE,
    e.NOM AS NOM_ELEVE,
    e.PRENOM AS PRENOM_ELEVE,
    e.NOM || ' ' || e.PRENOM AS NOM_COMPLET_ELEVE,
    e.DATE_NAISSANCE,
    e.LIEU_NAISSANCE,
    e.SEXE,
    -- Classe
    cl.CODE AS CODE_CLASSE,
    cl.LIBELLE AS LIBELLE_CLASSE,
    n.LIBELLE AS LIBELLE_NIVEAU,
    cy.LIBELLE AS LIBELLE_CYCLE,
    -- Année
    a.CODE AS CODE_ANNEE,
    a.LIBELLE AS LIBELLE_ANNEE,
    -- Établissement
    et.NOM AS NOM_ETABLISSEMENT,
    et.DIRECTEUR,
    et.ADRESSE AS ADRESSE_ETABLISSEMENT,
    et.TELEPHONE AS TEL_ETABLISSEMENT,
    et.LOGO_URL,
    et.SLOGAN
FROM SS_BULLETINS b
JOIN SS_INSCRIPTIONS i ON b.INSCRIPTION_ID = i.INSCRIPTION_ID
JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
JOIN SS_NIVEAUX n ON cl.NIVEAU_ID = n.NIVEAU_ID
JOIN SS_CYCLES cy ON n.CYCLE_ID = cy.CYCLE_ID
JOIN SS_ANNEES_SCOLAIRES a ON i.ANNEE_ID = a.ANNEE_ID
JOIN SS_ETABLISSEMENTS et ON cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID
LEFT JOIN SS_TRIMESTRES t ON b.TRIMESTRE_ID = t.TRIMESTRE_ID;

COMMENT ON TABLE V_SS_BULLETINS_COMPLET IS 'Vue complète pour l''impression des bulletins scolaires';

PROMPT   ✓ Vue V_SS_BULLETINS_COMPLET créée

-- ============================================================================
-- VUE 5 : V_SS_DASHBOARD_STATS
-- Usage : Statistiques globales pour le tableau de bord administrateur
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_DASHBOARD_STATS AS
SELECT 
    et.ETABLISSEMENT_ID,
    et.NOM AS NOM_ETABLISSEMENT,
    a.ANNEE_ID,
    a.CODE AS CODE_ANNEE,
    -- Élèves
    (SELECT COUNT(*) FROM SS_INSCRIPTIONS i 
     WHERE i.ANNEE_ID = a.ANNEE_ID 
     AND i.STATUT = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM SS_CLASSES cl WHERE cl.CLASSE_ID = i.CLASSE_ID AND cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID)
    ) AS TOTAL_ELEVES,
    (SELECT COUNT(*) FROM SS_INSCRIPTIONS i JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
     WHERE i.ANNEE_ID = a.ANNEE_ID AND i.STATUT = 'ACTIVE' AND e.SEXE = 'M'
     AND EXISTS (SELECT 1 FROM SS_CLASSES cl WHERE cl.CLASSE_ID = i.CLASSE_ID AND cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID)
    ) AS TOTAL_GARCONS,
    (SELECT COUNT(*) FROM SS_INSCRIPTIONS i JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
     WHERE i.ANNEE_ID = a.ANNEE_ID AND i.STATUT = 'ACTIVE' AND e.SEXE = 'F'
     AND EXISTS (SELECT 1 FROM SS_CLASSES cl WHERE cl.CLASSE_ID = i.CLASSE_ID AND cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID)
    ) AS TOTAL_FILLES,
    -- Enseignants
    (SELECT COUNT(*) FROM SS_ENSEIGNANTS en 
     WHERE en.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID AND en.STATUT = 'ACTIF'
    ) AS TOTAL_ENSEIGNANTS,
    -- Classes
    (SELECT COUNT(*) FROM SS_CLASSES cl 
     WHERE cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID AND cl.ANNEE_ID = a.ANNEE_ID AND cl.STATUT = 'ACTIVE'
    ) AS TOTAL_CLASSES,
    -- Finance
    (SELECT NVL(SUM(p.MONTANT), 0) FROM SS_PAIEMENTS p 
     JOIN SS_FACTURES f ON p.FACTURE_ID = f.FACTURE_ID
     JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
     WHERE i.ANNEE_ID = a.ANNEE_ID AND p.STATUT = 'VALIDE'
     AND EXISTS (SELECT 1 FROM SS_CLASSES cl WHERE cl.CLASSE_ID = i.CLASSE_ID AND cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID)
    ) AS TOTAL_RECETTES,
    (SELECT NVL(SUM(d.MONTANT), 0) FROM SS_DEPENSES d
     WHERE d.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID AND d.ANNEE_ID = a.ANNEE_ID AND d.STATUT = 'EXECUTEE'
    ) AS TOTAL_DEPENSES,
    (SELECT COUNT(*) FROM SS_FACTURES f 
     JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
     WHERE i.ANNEE_ID = a.ANNEE_ID AND f.STATUT IN ('EN_ATTENTE','PARTIELLEMENT_PAYEE','EN_RETARD')
     AND EXISTS (SELECT 1 FROM SS_CLASSES cl WHERE cl.CLASSE_ID = i.CLASSE_ID AND cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID)
    ) AS NB_FACTURES_IMPAYEES,
    -- Présences (aujourd'hui)
    (SELECT COUNT(*) FROM SS_PRESENCES pr 
     JOIN SS_INSCRIPTIONS i ON pr.INSCRIPTION_ID = i.INSCRIPTION_ID
     WHERE pr.DATE_PRESENCE = TRUNC(SYSDATE) AND pr.STATUT_PRESENCE = 'ABSENT'
     AND EXISTS (SELECT 1 FROM SS_CLASSES cl WHERE cl.CLASSE_ID = i.CLASSE_ID AND cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID)
    ) AS ABSENCES_AUJOURD_HUI
FROM SS_ETABLISSEMENTS et
CROSS JOIN SS_ANNEES_SCOLAIRES a
WHERE a.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID
AND a.EST_COURANTE = 'O';

COMMENT ON TABLE V_SS_DASHBOARD_STATS IS 'Statistiques dashboard par établissement et année courante';

PROMPT   ✓ Vue V_SS_DASHBOARD_STATS créée

-- ============================================================================
-- VUE 6 : V_SS_PAIEMENTS_SUIVI
-- Usage : Suivi des paiements avec contexte élève et facture
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_PAIEMENTS_SUIVI AS
SELECT 
    p.PAIEMENT_ID,
    p.NUMERO_RECU,
    p.DATE_PAIEMENT,
    p.MONTANT,
    p.MODE_PAIEMENT,
    p.OPERATEUR_MM,
    p.REFERENCE_EXTERNE,
    p.STATUT AS STATUT_PAIEMENT,
    p.RECU_PAR,
    -- Facture
    f.FACTURE_ID,
    f.NUMERO_FACTURE,
    f.MONTANT_NET AS MONTANT_FACTURE,
    f.MONTANT_PAYE AS TOTAL_PAYE_FACTURE,
    f.MONTANT_RESTANT,
    f.STATUT AS STATUT_FACTURE,
    -- Élève
    e.ELEVE_ID,
    e.MATRICULE,
    e.NOM || ' ' || e.PRENOM AS NOM_ELEVE,
    e.SEXE,
    -- Classe
    cl.CODE AS CODE_CLASSE,
    cl.LIBELLE AS LIBELLE_CLASSE,
    -- Établissement
    et.ETABLISSEMENT_ID,
    et.NOM AS NOM_ETABLISSEMENT,
    -- Année
    a.CODE AS CODE_ANNEE
FROM SS_PAIEMENTS p
JOIN SS_FACTURES f ON p.FACTURE_ID = f.FACTURE_ID
JOIN SS_INSCRIPTIONS i ON f.INSCRIPTION_ID = i.INSCRIPTION_ID
JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
JOIN SS_ETABLISSEMENTS et ON cl.ETABLISSEMENT_ID = et.ETABLISSEMENT_ID
JOIN SS_ANNEES_SCOLAIRES a ON i.ANNEE_ID = a.ANNEE_ID;

COMMENT ON TABLE V_SS_PAIEMENTS_SUIVI IS 'Vue de suivi des paiements avec contexte élève/facture/classe';

PROMPT   ✓ Vue V_SS_PAIEMENTS_SUIVI créée

-- ============================================================================
-- VUE 7 : V_SS_PRESENCES_SUIVI
-- Usage : Suivi des présences avec contexte élève et classe
-- ============================================================================
CREATE OR REPLACE VIEW V_SS_PRESENCES_SUIVI AS
SELECT 
    pr.PRESENCE_ID,
    pr.DATE_PRESENCE,
    pr.DEMI_JOURNEE,
    pr.STATUT_PRESENCE,
    pr.HEURE_ARRIVEE,
    pr.DUREE_RETARD_MIN,
    pr.EST_JUSTIFIE,
    pr.MOTIF,
    pr.PARENT_NOTIFIE,
    pr.SAISI_PAR,
    -- Élève
    e.ELEVE_ID,
    e.MATRICULE,
    e.NOM || ' ' || e.PRENOM AS NOM_ELEVE,
    e.SEXE,
    e.PHOTO_URL,
    -- Classe
    cl.CLASSE_ID,
    cl.CODE AS CODE_CLASSE,
    cl.LIBELLE AS LIBELLE_CLASSE,
    -- Niveau
    n.LIBELLE AS LIBELLE_NIVEAU,
    -- Parent
    p.NOM || ' ' || p.PRENOM AS NOM_PARENT,
    p.TELEPHONE_1 AS TEL_PARENT,
    -- Établissement
    cl.ETABLISSEMENT_ID
FROM SS_PRESENCES pr
JOIN SS_INSCRIPTIONS i ON pr.INSCRIPTION_ID = i.INSCRIPTION_ID
JOIN SS_ELEVES e ON i.ELEVE_ID = e.ELEVE_ID
JOIN SS_CLASSES cl ON i.CLASSE_ID = cl.CLASSE_ID
JOIN SS_NIVEAUX n ON cl.NIVEAU_ID = n.NIVEAU_ID
LEFT JOIN SS_ELEVE_PARENT ep ON e.ELEVE_ID = ep.ELEVE_ID AND ep.EST_CONTACT_PRINCIPAL = 'O'
LEFT JOIN SS_PARENTS p ON ep.PARENT_ID = p.PARENT_ID;

COMMENT ON TABLE V_SS_PRESENCES_SUIVI IS 'Vue de suivi des présences avec contexte élève/classe/parent';

PROMPT   ✓ Vue V_SS_PRESENCES_SUIVI créée

PROMPT
PROMPT ============================================
PROMPT   ✅ VUES TERMINÉES — 7 vues créées
PROMPT ============================================
