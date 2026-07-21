-- ============================================================================
-- SMARTSCHOOL ERP — Script 10 : DONNÉES DE DÉMONSTRATION
-- Système de Gestion Scolaire National — République de Guinée
-- ============================================================================
-- Description : Jeu de données réalistes pour la démonstration et les tests.
--               Basé sur le contexte guinéen réel.
-- ============================================================================

SET SERVEROUTPUT ON;

PROMPT ============================================
PROMPT   DONNÉES DE DÉMONSTRATION — SMARTSCHOOL
PROMPT ============================================

-- ============================================================================
-- 1. ÉTABLISSEMENTS (3 écoles de démonstration)
-- ============================================================================
PROMPT [1/12] Insertion des établissements...

INSERT INTO SS_ETABLISSEMENTS (CODE, NOM, TYPE_ETABLISSEMENT, STATUT, ADRESSE, VILLE, REGION, PREFECTURE, TELEPHONE, EMAIL, DIRECTEUR, DIRECTEUR_TELEPHONE, SLOGAN, CAPACITE_MAX, CODE_MINISTERE)
VALUES ('ETB-CKY-001', 'Lycée National de Conakry', 'PUBLIC', 'ACTIF', 'Quartier Sandervalia, BP 234', 'Conakry', 'CONAKRY', 'Kaloum', '+224 622 00 00 01', 'contact@lnc.edu.gn', 'Dr. Mamadou Cellou DIALLO', '+224 628 12 34 56', 'L''excellence par l''éducation', 1200, 'MEN-CKY-LYC-001');

INSERT INTO SS_ETABLISSEMENTS (CODE, NOM, TYPE_ETABLISSEMENT, STATUT, ADRESSE, VILLE, REGION, PREFECTURE, TELEPHONE, EMAIL, DIRECTEUR, DIRECTEUR_TELEPHONE, SLOGAN, CAPACITE_MAX, CODE_MINISTERE)
VALUES ('ETB-CKY-002', 'Collège Privé Al-Iman', 'PRIVE', 'ACTIF', 'Quartier Kipé, Ratoma', 'Conakry', 'CONAKRY', 'Ratoma', '+224 622 00 00 02', 'contact@aliman.edu.gn', 'Hadja Fatoumata CAMARA', '+224 625 67 89 01', 'Former les leaders de demain', 600, 'MEN-CKY-COL-012');

INSERT INTO SS_ETABLISSEMENTS (CODE, NOM, TYPE_ETABLISSEMENT, STATUT, ADRESSE, VILLE, REGION, PREFECTURE, TELEPHONE, EMAIL, DIRECTEUR, DIRECTEUR_TELEPHONE, SLOGAN, CAPACITE_MAX, CODE_MINISTERE)
VALUES ('ETB-KND-001', 'École Primaire de Kindia', 'PUBLIC', 'ACTIF', 'Centre-ville, Kindia', 'Kindia', 'KINDIA', 'Kindia', '+224 622 00 00 03', 'contact@epk.edu.gn', 'Ibrahima Sory SOUMAH', '+224 621 45 67 89', 'Ensemble pour l''avenir', 450, 'MEN-KND-PRI-003');

PROMPT   ✓ 3 établissements insérés

-- ============================================================================
-- 2. ANNÉES SCOLAIRES & TRIMESTRES
-- ============================================================================
PROMPT [2/12] Insertion des années scolaires...

INSERT INTO SS_ANNEES_SCOLAIRES (ETABLISSEMENT_ID, CODE, LIBELLE, DATE_DEBUT, DATE_FIN, STATUT, EST_COURANTE, DATE_RENTREE)
VALUES (1, '2025-2026', 'Année Scolaire 2025-2026', DATE '2025-10-01', DATE '2026-07-15', 'EN_COURS', 'O', DATE '2025-10-01');

INSERT INTO SS_ANNEES_SCOLAIRES (ETABLISSEMENT_ID, CODE, LIBELLE, DATE_DEBUT, DATE_FIN, STATUT, EST_COURANTE, DATE_RENTREE)
VALUES (2, '2025-2026', 'Année Scolaire 2025-2026', DATE '2025-10-01', DATE '2026-07-15', 'EN_COURS', 'O', DATE '2025-10-01');

INSERT INTO SS_ANNEES_SCOLAIRES (ETABLISSEMENT_ID, CODE, LIBELLE, DATE_DEBUT, DATE_FIN, STATUT, EST_COURANTE, DATE_RENTREE)
VALUES (3, '2025-2026', 'Année Scolaire 2025-2026', DATE '2025-10-01', DATE '2026-07-15', 'EN_COURS', 'O', DATE '2025-10-01');

-- Trimestres pour le Lycée National (ETB-CKY-001)
INSERT INTO SS_TRIMESTRES (ANNEE_ID, CODE, LIBELLE, NUMERO, DATE_DEBUT, DATE_FIN, DATE_DEBUT_SAISIE, DATE_FIN_SAISIE, STATUT)
VALUES (1, 'T1', '1er Trimestre', 1, DATE '2025-10-01', DATE '2025-12-20', DATE '2025-12-01', DATE '2025-12-25', 'CLOTURE');

INSERT INTO SS_TRIMESTRES (ANNEE_ID, CODE, LIBELLE, NUMERO, DATE_DEBUT, DATE_FIN, DATE_DEBUT_SAISIE, DATE_FIN_SAISIE, STATUT)
VALUES (1, 'T2', '2ème Trimestre', 2, DATE '2026-01-05', DATE '2026-03-28', DATE '2026-03-10', DATE '2026-04-05', 'EN_COURS');

INSERT INTO SS_TRIMESTRES (ANNEE_ID, CODE, LIBELLE, NUMERO, DATE_DEBUT, DATE_FIN, DATE_DEBUT_SAISIE, DATE_FIN_SAISIE, STATUT)
VALUES (1, 'T3', '3ème Trimestre', 3, DATE '2026-04-14', DATE '2026-07-10', DATE '2026-06-20', DATE '2026-07-15', 'PLANIFIE');

PROMPT   ✓ 3 années scolaires + 3 trimestres insérés

-- ============================================================================
-- 3. CYCLES & NIVEAUX
-- ============================================================================
PROMPT [3/12] Insertion des cycles et niveaux...

-- Cycles pour le Lycée National
INSERT INTO SS_CYCLES (ETABLISSEMENT_ID, CODE, LIBELLE, ORDRE, DUREE_ANNEES) VALUES (1, 'COLLEGE', 'Collège', 1, 4);
INSERT INTO SS_CYCLES (ETABLISSEMENT_ID, CODE, LIBELLE, ORDRE, DUREE_ANNEES) VALUES (1, 'LYCEE', 'Lycée', 2, 3);

-- Cycles pour le Collège Privé
INSERT INTO SS_CYCLES (ETABLISSEMENT_ID, CODE, LIBELLE, ORDRE, DUREE_ANNEES) VALUES (2, 'COLLEGE', 'Collège', 1, 4);

-- Cycles pour l'École Primaire
INSERT INTO SS_CYCLES (ETABLISSEMENT_ID, CODE, LIBELLE, ORDRE, DUREE_ANNEES) VALUES (3, 'PRIMAIRE', 'Primaire', 1, 6);

-- Niveaux Collège (Lycée National)
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (1, '7EME', '7ème Année', 1, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (1, '8EME', '8ème Année', 2, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (1, '9EME', '9ème Année', 3, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (1, '10EME', '10ème Année', 4, 'O', 'BEPC');

-- Niveaux Lycée
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (2, '11EME', '11ème Année', 1, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (2, '12EME', '12ème Année', 2, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (2, 'TERMINALE', 'Terminale', 3, 'O', 'BAC');

-- Niveaux Primaire
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (4, '1ERE', '1ère Année', 1, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (4, '2EME', '2ème Année', 2, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (4, '3EME', '3ème Année', 3, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (4, '4EME', '4ème Année', 4, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (4, '5EME', '5ème Année', 5, 'N', NULL);
INSERT INTO SS_NIVEAUX (CYCLE_ID, CODE, LIBELLE, ORDRE, EST_EXAMEN, EXAMEN_NATIONAL) VALUES (4, '6EME', '6ème Année', 6, 'O', 'CEP');

PROMPT   ✓ 4 cycles + 14 niveaux insérés

-- ============================================================================
-- 4. SECTIONS
-- ============================================================================
PROMPT [4/12] Insertion des sections...

INSERT INTO SS_SECTIONS (CODE, LIBELLE, DESCRIPTION, APPLICABLE_CYCLE, STATUT) VALUES ('UNIQUE', 'Section Unique', 'Section unique pour collège et primaire', 'TOUS', 'ACTIF');
INSERT INTO SS_SECTIONS (CODE, LIBELLE, DESCRIPTION, APPLICABLE_CYCLE, STATUT) VALUES ('SE', 'Sciences Expérimentales', 'Filière Sciences Expérimentales', 'LYCEE', 'ACTIF');
INSERT INTO SS_SECTIONS (CODE, LIBELLE, DESCRIPTION, APPLICABLE_CYCLE, STATUT) VALUES ('SM', 'Sciences Mathématiques', 'Filière Sciences Mathématiques', 'LYCEE', 'ACTIF');
INSERT INTO SS_SECTIONS (CODE, LIBELLE, DESCRIPTION, APPLICABLE_CYCLE, STATUT) VALUES ('SS', 'Sciences Sociales', 'Filière Sciences Sociales', 'LYCEE', 'ACTIF');

PROMPT   ✓ 4 sections insérées

-- ============================================================================
-- 5. SALLES
-- ============================================================================
PROMPT [5/12] Insertion des salles...

INSERT INTO SS_SALLES (ETABLISSEMENT_ID, CODE, NOM, CAPACITE, TYPE_SALLE, BATIMENT) VALUES (1, 'S-A01', 'Salle A01', 50, 'CLASSE', 'Bâtiment A');
INSERT INTO SS_SALLES (ETABLISSEMENT_ID, CODE, NOM, CAPACITE, TYPE_SALLE, BATIMENT) VALUES (1, 'S-A02', 'Salle A02', 50, 'CLASSE', 'Bâtiment A');
INSERT INTO SS_SALLES (ETABLISSEMENT_ID, CODE, NOM, CAPACITE, TYPE_SALLE, BATIMENT) VALUES (1, 'S-A03', 'Salle A03', 45, 'CLASSE', 'Bâtiment A');
INSERT INTO SS_SALLES (ETABLISSEMENT_ID, CODE, NOM, CAPACITE, TYPE_SALLE, BATIMENT) VALUES (1, 'S-B01', 'Salle B01', 50, 'CLASSE', 'Bâtiment B');
INSERT INTO SS_SALLES (ETABLISSEMENT_ID, CODE, NOM, CAPACITE, TYPE_SALLE, BATIMENT) VALUES (1, 'LAB-1', 'Laboratoire Sciences', 30, 'LABORATOIRE', 'Bâtiment C');
INSERT INTO SS_SALLES (ETABLISSEMENT_ID, CODE, NOM, CAPACITE, TYPE_SALLE, BATIMENT) VALUES (1, 'INFO-1', 'Salle Informatique', 25, 'INFORMATIQUE', 'Bâtiment C');

PROMPT   ✓ 6 salles insérées

-- ============================================================================
-- 6. CLASSES
-- ============================================================================
PROMPT [6/12] Insertion des classes...

INSERT INTO SS_CLASSES (ETABLISSEMENT_ID, ANNEE_ID, NIVEAU_ID, SECTION_ID, SALLE_ID, CODE, LIBELLE, CAPACITE_MAX, STATUT) VALUES (1, 1, 1, 1, 1, '7A', '7ème Année A', 50, 'ACTIVE');
INSERT INTO SS_CLASSES (ETABLISSEMENT_ID, ANNEE_ID, NIVEAU_ID, SECTION_ID, SALLE_ID, CODE, LIBELLE, CAPACITE_MAX, STATUT) VALUES (1, 1, 1, 1, 2, '7B', '7ème Année B', 50, 'ACTIVE');
INSERT INTO SS_CLASSES (ETABLISSEMENT_ID, ANNEE_ID, NIVEAU_ID, SECTION_ID, SALLE_ID, CODE, LIBELLE, CAPACITE_MAX, STATUT) VALUES (1, 1, 5, 2, 3, '11SE-A', '11ème Année Sc. Exp. A', 45, 'ACTIVE');
INSERT INTO SS_CLASSES (ETABLISSEMENT_ID, ANNEE_ID, NIVEAU_ID, SECTION_ID, SALLE_ID, CODE, LIBELLE, CAPACITE_MAX, STATUT) VALUES (1, 1, 5, 3, 4, '11SM-A', '11ème Année Sc. Math. A', 40, 'ACTIVE');
INSERT INTO SS_CLASSES (ETABLISSEMENT_ID, ANNEE_ID, NIVEAU_ID, SECTION_ID, SALLE_ID, CODE, LIBELLE, CAPACITE_MAX, STATUT) VALUES (1, 1, 7, 2, NULL, 'TSE-A', 'Terminale Sc. Exp. A', 45, 'ACTIVE');

PROMPT   ✓ 5 classes insérées

-- ============================================================================
-- 7. ENSEIGNANTS
-- ============================================================================
PROMPT [7/12] Insertion des enseignants...

INSERT INTO SS_ENSEIGNANTS (ETABLISSEMENT_ID, MATRICULE, NOM, PRENOM, DATE_NAISSANCE, SEXE, TELEPHONE, EMAIL, SPECIALITE, DIPLOME_PLUS_ELEVE, GRADE, TYPE_CONTRAT, DATE_EMBAUCHE, STATUT)
VALUES (1, 'ENS-CKY-001', 'BARRY', 'Abdoulaye', DATE '1985-03-15', 'M', '+224 621 11 11 01', 'a.barry@lnc.edu.gn', 'Mathématiques', 'Maîtrise en Mathématiques', 'Professeur Principal', 'PERMANENT', DATE '2010-10-01', 'ACTIF');

INSERT INTO SS_ENSEIGNANTS (ETABLISSEMENT_ID, MATRICULE, NOM, PRENOM, DATE_NAISSANCE, SEXE, TELEPHONE, EMAIL, SPECIALITE, DIPLOME_PLUS_ELEVE, GRADE, TYPE_CONTRAT, DATE_EMBAUCHE, STATUT)
VALUES (1, 'ENS-CKY-002', 'SOUMAH', 'Mariama', DATE '1988-07-22', 'F', '+224 625 22 22 02', 'm.soumah@lnc.edu.gn', 'Français', 'Licence en Lettres Modernes', 'Professeur Certifié', 'PERMANENT', DATE '2012-10-01', 'ACTIF');

INSERT INTO SS_ENSEIGNANTS (ETABLISSEMENT_ID, MATRICULE, NOM, PRENOM, DATE_NAISSANCE, SEXE, TELEPHONE, EMAIL, SPECIALITE, DIPLOME_PLUS_ELEVE, GRADE, TYPE_CONTRAT, DATE_EMBAUCHE, STATUT)
VALUES (1, 'ENS-CKY-003', 'CAMARA', 'Ibrahima', DATE '1990-01-10', 'M', '+224 628 33 33 03', 'i.camara@lnc.edu.gn', 'Physique-Chimie', 'Master en Physique', 'Professeur Assistant', 'CONTRACTUEL', DATE '2018-10-01', 'ACTIF');

INSERT INTO SS_ENSEIGNANTS (ETABLISSEMENT_ID, MATRICULE, NOM, PRENOM, DATE_NAISSANCE, SEXE, TELEPHONE, EMAIL, SPECIALITE, DIPLOME_PLUS_ELEVE, GRADE, TYPE_CONTRAT, DATE_EMBAUCHE, STATUT)
VALUES (1, 'ENS-CKY-004', 'DIALLO', 'Kadiatou', DATE '1992-11-30', 'F', '+224 622 44 44 04', 'k.diallo@lnc.edu.gn', 'Histoire-Géographie', 'Licence en Histoire', 'Professeur Certifié', 'PERMANENT', DATE '2015-10-01', 'ACTIF');

INSERT INTO SS_ENSEIGNANTS (ETABLISSEMENT_ID, MATRICULE, NOM, PRENOM, DATE_NAISSANCE, SEXE, TELEPHONE, EMAIL, SPECIALITE, DIPLOME_PLUS_ELEVE, GRADE, TYPE_CONTRAT, DATE_EMBAUCHE, STATUT)
VALUES (1, 'ENS-CKY-005', 'CONDE', 'Mohamed', DATE '1987-05-18', 'M', '+224 629 55 55 05', 'm.conde@lnc.edu.gn', 'Anglais', 'Master en Anglais', 'Professeur Principal', 'PERMANENT', DATE '2011-10-01', 'ACTIF');

PROMPT   ✓ 5 enseignants insérés

-- ============================================================================
-- 8. MATIÈRES
-- ============================================================================
PROMPT [8/12] Insertion des matières...

-- Matières Collège
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'MATH', 'Mathématiques', 'Math', 4, 'SCIENTIFIQUE', 'O', 5, 1);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'FRAN', 'Français', 'Fran', 4, 'LITTERAIRE', 'O', 5, 2);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'PHCH', 'Physique-Chimie', 'Ph-Ch', 3, 'SCIENTIFIQUE', 'O', 4, 3);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'SVT', 'Sciences de la Vie et de la Terre', 'SVT', 2, 'SCIENTIFIQUE', 'O', 3, 4);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'HG', 'Histoire-Géographie', 'H-G', 2, 'LITTERAIRE', 'O', 3, 5);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'ANG', 'Anglais', 'Ang', 2, 'LITTERAIRE', 'O', 3, 6);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'EPS', 'Éducation Physique et Sportive', 'EPS', 1, 'SPORTIVE', 'O', 2, 7);
INSERT INTO SS_MATIERES (CYCLE_ID, CODE, LIBELLE, LIBELLE_COURT, COEFFICIENT_DEFAUT, CATEGORIE, EST_OBLIGATOIRE, NB_HEURES_SEMAINE, ORDRE_AFFICHAGE) VALUES (1, 'ECM', 'Éducation Civique et Morale', 'ECM', 1, 'LITTERAIRE', 'O', 1, 8);

PROMPT   ✓ 8 matières (collège) insérées

-- ============================================================================
-- 9. TYPES D'ÉVALUATION
-- ============================================================================
PROMPT [9/12] Insertion des types d''évaluation...

INSERT INTO SS_TYPES_EVALUATION (CODE, LIBELLE, POIDS_POURCENTAGE, NOMBRE_MAX, DESCRIPTION, ORDRE_AFFICHAGE) VALUES ('DEVOIR', 'Devoir', 40, 3, 'Devoir surveillé en classe', 1);
INSERT INTO SS_TYPES_EVALUATION (CODE, LIBELLE, POIDS_POURCENTAGE, NOMBRE_MAX, DESCRIPTION, ORDRE_AFFICHAGE) VALUES ('COMPO', 'Composition', 60, 1, 'Composition trimestrielle officielle', 2);
INSERT INTO SS_TYPES_EVALUATION (CODE, LIBELLE, POIDS_POURCENTAGE, NOMBRE_MAX, DESCRIPTION, ORDRE_AFFICHAGE) VALUES ('INTERRO', 'Interrogation', 0, 5, 'Interrogation écrite ou orale (non comptabilisée)', 3);
INSERT INTO SS_TYPES_EVALUATION (CODE, LIBELLE, POIDS_POURCENTAGE, NOMBRE_MAX, DESCRIPTION, ORDRE_AFFICHAGE) VALUES ('TP', 'Travaux Pratiques', 0, 3, 'Notes de TP (sciences)', 4);

PROMPT   ✓ 4 types d''évaluation insérés

-- ============================================================================
-- 10. TYPES DE FRAIS & GRILLE TARIFAIRE
-- ============================================================================
PROMPT [10/12] Insertion des types de frais et tarifs...

INSERT INTO SS_TYPES_FRAIS (CODE, LIBELLE, CATEGORIE, EST_OBLIGATOIRE, FREQUENCE, DESCRIPTION) VALUES ('INSCR', 'Frais d''inscription', 'INSCRIPTION', 'O', 'ANNUEL', 'Frais d''inscription annuels');
INSERT INTO SS_TYPES_FRAIS (CODE, LIBELLE, CATEGORIE, EST_OBLIGATOIRE, FREQUENCE, DESCRIPTION) VALUES ('SCOL', 'Frais de scolarité', 'SCOLARITE', 'O', 'TRIMESTRIEL', 'Frais de scolarité trimestriels');
INSERT INTO SS_TYPES_FRAIS (CODE, LIBELLE, CATEGORIE, EST_OBLIGATOIRE, FREQUENCE, DESCRIPTION) VALUES ('EXAM', 'Frais d''examen', 'EXAMEN', 'O', 'ANNUEL', 'Frais d''examens nationaux');
INSERT INTO SS_TYPES_FRAIS (CODE, LIBELLE, CATEGORIE, EST_OBLIGATOIRE, FREQUENCE, DESCRIPTION) VALUES ('UNIF', 'Uniforme scolaire', 'UNIFORME', 'N', 'UNIQUE', 'Kit uniforme complet');
INSERT INTO SS_TYPES_FRAIS (CODE, LIBELLE, CATEGORIE, EST_OBLIGATOIRE, FREQUENCE, DESCRIPTION) VALUES ('TRANS', 'Transport scolaire', 'TRANSPORT', 'N', 'MENSUEL', 'Service de transport scolaire');

-- Grille tarifaire pour le Lycée National (7ème année)
INSERT INTO SS_GRILLE_TARIFAIRE (TYPE_FRAIS_ID, NIVEAU_ID, ANNEE_ID, ETABLISSEMENT_ID, MONTANT, ECHEANCIER, DATE_LIMITE_FINALE)
VALUES (1, 1, 1, 1, 150000, 'TOTAL', DATE '2025-10-15');  -- 150,000 GNF inscription

INSERT INTO SS_GRILLE_TARIFAIRE (TYPE_FRAIS_ID, NIVEAU_ID, ANNEE_ID, ETABLISSEMENT_ID, MONTANT, ECHEANCIER, DATE_LIMITE_1, DATE_LIMITE_2, DATE_LIMITE_3)
VALUES (2, 1, 1, 1, 750000, '3_FOIS', DATE '2025-10-31', DATE '2026-01-31', DATE '2026-04-30');  -- 750,000 GNF scolarité

PROMPT   ✓ 5 types de frais + 2 tarifs insérés

-- ============================================================================
-- 11. MODÈLES DE NOTIFICATION
-- ============================================================================
PROMPT [11/12] Insertion des modèles de notification...

INSERT INTO SS_MODELES_NOTIFICATION (CODE, LIBELLE, CANAL, LANGUE, CONTENU, CATEGORIE, EVENEMENT, EST_AUTOMATIQUE, PRIORITE)
VALUES ('ABS_SMS_FR', 'Notification absence SMS (FR)', 'SMS', 'FR', 
'SmartSchool: Cher(e) {NOM_PARENT}, votre enfant {NOM_ELEVE} ({CLASSE}) est absent(e) ce {DATE}. Contactez l''école si necessaire.', 
'ABSENCE', 'ABSENCE_DETECTEE', 'O', 'HAUTE');

INSERT INTO SS_MODELES_NOTIFICATION (CODE, LIBELLE, CANAL, LANGUE, CONTENU, CATEGORIE, EVENEMENT, EST_AUTOMATIQUE, PRIORITE)
VALUES ('PAIE_RAPPEL_FR', 'Rappel paiement SMS (FR)', 'SMS', 'FR', 
'SmartSchool: Rappel - Le paiement de {MONTANT} GNF pour {NOM_ELEVE} est en retard. Veuillez régulariser avant le {DATE_LIMITE}. Merci.', 
'PAIEMENT', 'RAPPEL_PAIEMENT', 'O', 'NORMALE');

INSERT INTO SS_MODELES_NOTIFICATION (CODE, LIBELLE, CANAL, LANGUE, CONTENU, CATEGORIE, EVENEMENT, EST_AUTOMATIQUE, PRIORITE)
VALUES ('PAIE_RECU_FR', 'Confirmation paiement SMS (FR)', 'SMS', 'FR', 
'SmartSchool: Paiement de {MONTANT} GNF reçu pour {NOM_ELEVE}. Reçu N°{NUMERO_RECU}. Reste à payer: {RESTE} GNF. Merci.', 
'PAIEMENT', 'PAIEMENT_RECU', 'O', 'NORMALE');

INSERT INTO SS_MODELES_NOTIFICATION (CODE, LIBELLE, CANAL, LANGUE, CONTENU, CATEGORIE, EVENEMENT, EST_AUTOMATIQUE, PRIORITE)
VALUES ('BULL_DISPO_FR', 'Bulletin disponible SMS (FR)', 'SMS', 'FR', 
'SmartSchool: Le bulletin du {TRIMESTRE} de {NOM_ELEVE} ({CLASSE}) est disponible. Moyenne: {MOYENNE}/20, Rang: {RANG}/{EFFECTIF}. Connectez-vous au portail parent.', 
'BULLETIN', 'BULLETIN_DISPONIBLE', 'O', 'HAUTE');

INSERT INTO SS_MODELES_NOTIFICATION (CODE, LIBELLE, CANAL, LANGUE, CONTENU, CATEGORIE, EVENEMENT, EST_AUTOMATIQUE, PRIORITE)
VALUES ('INC_SIGNAL_FR', 'Incident disciplinaire SMS (FR)', 'SMS', 'FR', 
'SmartSchool: Information importante concernant {NOM_ELEVE} ({CLASSE}). Un incident de type {TYPE_INCIDENT} a été signalé le {DATE}. Veuillez contacter l''école.', 
'DISCIPLINE', 'INCIDENT_SIGNALE', 'O', 'URGENTE');

PROMPT   ✓ 5 modèles de notification insérés

-- ============================================================================
-- 12. RÔLES & PERMISSIONS
-- ============================================================================
PROMPT [12/12] Insertion des rôles et permissions...

INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('SUPER_ADMIN', 'Super Administrateur', 'Accès total au système national', 0, 'O', 'ADMIN');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('DIRECTEUR', 'Directeur d''Établissement', 'Administration complète de l''établissement', 1, 'O', 'ADMIN');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('CENSEUR', 'Censeur / Surveillant Général', 'Gestion académique et discipline', 2, 'O', 'ADMIN');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('SECRETAIRE', 'Secrétaire', 'Gestion administrative courante', 3, 'O', 'ADMIN');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('COMPTABLE', 'Comptable / Intendant', 'Gestion financière', 3, 'O', 'ADMIN');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('ENSEIGNANT', 'Enseignant', 'Saisie de notes et gestion appels', 4, 'O', 'ENSEIGNANT');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('PARENT', 'Parent / Tuteur', 'Consultation notes, bulletins, paiements', 5, 'O', 'PARENT');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('ELEVE', 'Élève', 'Consultation notes et bulletins', 6, 'O', 'ELEVE');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('BIBLIOTHECAIRE', 'Bibliothécaire', 'Gestion de la bibliothèque', 4, 'O', 'ADMIN');
INSERT INTO SS_ROLES (CODE, LIBELLE, DESCRIPTION, NIVEAU_HIERARCHIE, EST_SYSTEME, PORTAIL) VALUES ('INSPECTEUR', 'Inspecteur Académique', 'Supervision et rapports ministériels', 1, 'O', 'MINISTERE');

-- Permissions essentielles
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('ELEVES.READ', 'Consulter les élèves', 'ACADEMIQUE', 'READ');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('ELEVES.CREATE', 'Créer un élève', 'ACADEMIQUE', 'CREATE');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('ELEVES.UPDATE', 'Modifier un élève', 'ACADEMIQUE', 'UPDATE');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('ELEVES.DELETE', 'Supprimer un élève', 'ACADEMIQUE', 'DELETE');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('NOTES.READ', 'Consulter les notes', 'EVALUATIONS', 'READ');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('NOTES.CREATE', 'Saisir des notes', 'EVALUATIONS', 'CREATE');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('NOTES.UPDATE', 'Modifier des notes', 'EVALUATIONS', 'UPDATE');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('PAIEMENTS.READ', 'Consulter les paiements', 'FINANCE', 'READ');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('PAIEMENTS.CREATE', 'Enregistrer un paiement', 'FINANCE', 'CREATE');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('BULLETINS.READ', 'Consulter les bulletins', 'EVALUATIONS', 'READ');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('BULLETINS.EXPORT', 'Exporter/Imprimer les bulletins', 'EVALUATIONS', 'EXPORT');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('RAPPORTS.EXPORT', 'Exporter les rapports ministériels', 'RAPPORTS', 'EXPORT');
INSERT INTO SS_PERMISSIONS (CODE, LIBELLE, MODULE, ACTION) VALUES ('CONFIG.ALL', 'Configuration système complète', 'SYSTEME', 'ALL');

PROMPT   ✓ 10 rôles + 13 permissions insérés

COMMIT;

PROMPT
PROMPT ============================================
PROMPT   ✅ DONNÉES DE DÉMONSTRATION INSÉRÉES
PROMPT   - 3 établissements
PROMPT   - 3 années + 3 trimestres
PROMPT   - 4 cycles + 14 niveaux
PROMPT   - 4 sections + 6 salles + 5 classes
PROMPT   - 5 enseignants + 8 matières
PROMPT   - 4 types d'évaluation
PROMPT   - 5 types de frais + 2 tarifs
PROMPT   - 5 modèles de notification
PROMPT   - 10 rôles + 13 permissions
PROMPT ============================================
