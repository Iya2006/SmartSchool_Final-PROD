⚙️ ANALYSE FONCTIONNELLE EXHAUSTIVE
Module Paramètres — Centre de Contrôle Smart School
Basé sur l'audit réel du code source :

35+ tables SQLAlchemy (ss_*)
23 fichiers API backend (FastAPI)
24 pages/routes frontend (Next.js)
3 portails (Parent, Enseignant, Élève) + Admin
📊 INVENTAIRE DU SYSTÈME ACTUEL
Avant de lister les paramétrages, voici tout ce que le système gère déjà et qui doit être configurable :

Module	Tables Backend	Pages Frontend	API
Structure (Établissement, Années, Cycles, Niveaux, Salles)	ss_etablissements, ss_annees_scolaires, ss_trimestres, ss_cycles, ss_niveaux, ss_salles	/dashboard	parametrage.py
Élèves	ss_eleves, ss_inscriptions, ss_eleve_parent	/eleves, /eleves/[id], /eleves/nouveau	eleves.py, classes.py
Enseignants	ss_enseignants, ss_affectations	/enseignants, /enseignants/[id], /enseignants/nouveau	enseignants.py
Parents	ss_parents, ss_eleve_parent	/familles	eleves.py
Personnel RH	ss_utilisateurs (champs RH)	/personnel	personnel.py
Classes	ss_classes, ss_classe_matieres	/classes	classes.py
Matières	ss_matieres, ss_classe_matieres	/matieres	matieres.py
Évaluations & Notes	ss_evaluations, ss_notes, ss_types_evaluation	/notes, /centre-evaluation	evaluations.py
Bulletins	ss_bulletins, ss_bulletin_lignes	/bulletins	evaluations.py
Finance & Paiements	ss_types_frais, ss_factures, ss_echeances_factures, ss_paiements, ss_depenses	/comptabilite	finance.py
Comptabilité Générale	ss_exercices_comptables, ss_journaux_comptables, ss_comptes_comptables, ss_ecritures_comptables, ss_lignes_ecritures, ss_parametres_comptabilite	/comptabilite/general, /comptabilite/dashboard	comptabilite.py
Emploi du Temps	ss_creneaux_emploi, ss_demandes_emploi, ss_disponibilites	/emploi-du-temps	emploi_du_temps.py
Examens	ss_sujets_examen, ss_emplois_examen, ss_creneaux_examen	/examens	examens.py
Devoirs	ss_devoirs	Portails	devoirs.py
Communication	ss_messages	/communication	communication.py
Vie Scolaire	ss_presences, ss_incidents	/dashboard/presences	vie_scolaire.py
Présence Agents (QR)	ss_presences_agents	—	presence_agent.py
Photos	ss_photos_en_attente	—	photos.py
Fournitures	ss_fournitures_scolaires	/fournitures	fournitures.py
Ressources Pédagogiques	ss_ressources_pedagogiques	/salle-des-profs	portail_enseignant.py
Galerie	—	/galerie	photos.py
Archive	—	/archive, /archive/classe/[id], /archive/eleve/[id]	Agrégation frontend
Portail Parent	—	/portail-parent	portail_parent.py
Portail Enseignant	—	/portail-enseignant, /teacher-dashboard	portail_enseignant.py
Portail Élève	—	/portail-eleve, /student-dashboard	portail_eleve.py
Authentification	ss_utilisateurs	/login	auth.py
🎛️ LES 12 SECTIONS DE PARAMÉTRAGE
La page /parametres sera organisée en sections cliquables, chacune ouvrant un panneau de configuration complet.

SECTION 1 : 🏫 Identité de l'Établissement
Ce que l'école est. Sa carte d'identité numérique.

Paramètre	Description	Table/Champ existant	Action requise
Nom de l'école	Nom complet officiel	ss_etablissements.nom	✅ Existe — Formulaire d'édition
Code établissement	Code unique	ss_etablissements.code	✅ Existe
Type d'établissement	Public/Privé/Confessionnel	ss_etablissements.type_etablissement	✅ Existe
Adresse complète	Adresse, Ville, Région, Préfecture	ss_etablissements.adresse/ville/region/prefecture	✅ Existe
Téléphone & Email	Contacts officiels	ss_etablissements.telephone/email	✅ Existe
Nom du Directeur	Directeur en poste	ss_etablissements.directeur	✅ Existe
Logo principal	Logo affiché partout (sidebar, cartes, bulletins, PDF)	ss_etablissements.logo_url	✅ Existe — Ajouter upload drag & drop
Logo réduit / Favicon	Icône de l'onglet du navigateur	—	🆕 À créer (champ favicon_url)
Cachet officiel	Image du tampon de l'école (pour bulletins/certificats)	—	🆕 À créer (champ cachet_url)
Signature du directeur	Image numérisée de la signature	—	🆕 À créer (champ signature_url)
Slogan / Devise	"L'excellence au service de tous"	—	🆕 À créer (champ slogan)
Capacité max	Nombre total d'élèves autorisé	ss_etablissements.capacite_max	✅ Existe
SECTION 2 : 📅 Gestion des Années Scolaires & Trimestres
Le calendrier académique : quand l'école commence et finit.

Paramètre	Description	Table existante	Action
Liste des années scolaires	Créer/modifier/activer les années	ss_annees_scolaires	✅ Existe (parametrage.py)
Année courante	Définir quelle année est active	ss_annees_scolaires.est_courante	✅ Existe (activer_annee)
Trimestres/Semestres	Découpage de l'année (dates de début/fin)	ss_trimestres	✅ Existe
Mode Semestre vs Trimestre	Choix entre 2 ou 3 périodes	—	🆕 À créer (paramètre global mode_decoupe)
Dates des vacances	Périodes de congé (affichées dans le calendrier)	—	🆕 À créer (table ss_vacances)
SECTION 3 : 📐 Système de Notation & Règles Académiques
Comment on évalue les élèves. Le cœur pédagogique.

Paramètre	Description	Source existante	Action
Notation sur...	Choisir : sur 10, sur 20, sur 100	ss_matieres.note_sur (par matière)	✅ Partiel — Ajouter un paramètre global
Système de Lettres	Optionnel : A/B/C/D/F au lieu de chiffres	—	🆕 Table de correspondance
Types d'évaluation	Devoir, Interrogation, Examen, Composition	ss_types_evaluation	✅ Existe
Pondération des types	% Devoir vs % Examen dans la moyenne	ss_types_evaluation.poids_pourcentage	✅ Existe
Moyenne de passage	Moyenne minimum pour passer (ex: 10/20)	—	🆕 Paramètre moyenne_passage
Calcul du rang	Rang sur moyenne générale ou sur total des points	—	🆕 Paramètre mode_rang
Mentions	Configuration des seuils (Très Bien > 16, Bien > 14...)	—	🆕 Table ss_seuils_mention
Redoublement automatique	Règle de redoublement si moyenne < X	—	🆕 Paramètre booléen
Coefficients par défaut	Coefficient de base des matières	ss_matieres.coefficient_defaut	✅ Existe
SECTION 4 : 🎨 Personnalisation de l'Interface (Theming)
L'apparence visuelle de tout le système. Le look & feel.

Paramètre	Description	Action
Couleur principale	Couleur des boutons, menus, liens actifs (actuellement #0f172a)	🆕 Paramètre couleur_primaire
Couleur secondaire	Couleur d'accent (actuellement #3b82f6)	🆕 Paramètre couleur_secondaire
Couleur d'accent	Couleur de surbrillance (actuellement #f59e0b)	🆕 Paramètre couleur_accent
Mode sombre	Activer/Désactiver le dark mode global	🆕 Paramètre booléen
Palette de thèmes prédéfinis	"Bleu Classique", "Vert Nature", "Rouge Prestige", "Or Royal"	🆕 JSON de thèmes
Thèmes saisonniers	Noël (rouge/vert/neige), Fête Nationale (tricolore), Vacances (plage)	🆕 Activation par date
Police de caractères	Choix parmi : Inter, Roboto, Outfit, Poppins, Montserrat	🆕 Paramètre police_globale
Apparence par portail	Thème spécifique au Portail Parent / Enseignant / Élève	🆕 Paramètres séparés par portail
Message d'accueil personnalisé	Texte affiché sur la page de connexion de chaque portail	🆕 Paramètre texte
SECTION 5 : 🪪 Format des Cartes Scolaires
Personnaliser les badges d'identité des élèves et enseignants.

Paramètre	Description	Composant existant	Action
Format de la carte	Horizontal / Vertical / Badge compact	BadgeCarte.tsx	🆕 Choix dans les paramètres
Couleur de fond	Couleur ou dégradé de fond de la carte	Hardcodé dans BadgeCarte.tsx	🆕 Paramètre
Image de fond	Upload d'une texture/motif pour le fond	—	🆕 Upload
Champs à afficher	Cocher/décocher : QR Code, Date naissance, Classe, Matricule, Adresse, Groupe sanguin	Hardcodé	🆕 JSON configurable
Position du logo	Haut-gauche / Haut-centre / Haut-droite	Hardcodé	🆕 Paramètre
Texte en pied de carte	Ex: "Propriété de l'École XYZ - En cas de perte, merci de retourner"	—	🆕 Paramètre texte
Modèles prédéfinis	5-6 designs de cartes prêts à l'emploi	—	🆕 Galerie de templates
Année affichée	Calcul auto ou saisie manuelle	Auto dans BadgeCarte.tsx	✅ Existe (auto)
SECTION 6 : 📄 Format des Bulletins & Documents PDF
Le constructeur de documents. Le plus stratégique.

Paramètre	Description	Existant	Action
Modèle de bulletin	Choix parmi : Classique, Moderne, Officiel Guinéen, Minimaliste	—	🆕 Galerie de templates
En-tête du bulletin	Logo + Nom école + Slogan + "République de Guinée"	Hardcodé	🆕 Configurable
Champs du bulletin	Afficher/Masquer : Rang, Moyenne classe, Note min/max, Graphique d'évolution, Photo élève	ss_bulletin_lignes a les champs	🆕 Toggle par champ
Appréciations automatiques	"Très Bien" si > 16, "Bien" si > 14, etc.	—	🆕 Lié aux seuils de mention
Observation du prof	Activer/Désactiver le champ "observation_prof"	ss_bulletin_lignes.observation_prof	✅ Existe dans le modèle
Signature(s) sur le bulletin	Directeur, Prof Principal, Parent (3 zones de signature)	—	🆕 Placement configurable
Format du certificat de scolarité	Modèle avec logo, cachet, signature	—	🆕 Template
Format des reçus de paiement	Préfixe du numéro (REC-), mentions légales	ss_paiements.numero_recu	🆕 Configurable
Filigrane/Watermark	Texte ou logo en arrière-plan des PDF officiels	—	🆕 Paramètre
SECTION 7 : 💰 Configuration Financière
Les règles de l'argent. Scolarité, paiements, pénalités.

Paramètre	Description	Existant	Action
Devise	GNF, EUR, USD, XOF...	ss_paiements.devise (hardcodé GNF)	🆕 Paramètre global
Modes de paiement acceptés	Espèces, Virement, Mobile Money, Chèque	ss_paiements.mode_paiement (libre)	🆕 Liste configurable
Types de frais	Scolarité, Inscription, Cantine, Transport...	ss_types_frais	✅ Existe
Montants par défaut	Prix de base par type de frais	ss_types_frais.montant_defaut	✅ Existe
Fréquence de paiement	Mensuel / Trimestriel / Annuel	ss_types_frais.frequence	✅ Existe
Pénalités de retard	% ou montant fixe après la date limite	—	🆕 Paramètres penalite_type, penalite_valeur
Réductions automatiques	-10% pour le 2ème enfant, -15% pour le 3ème	—	🆕 Table ss_regles_reduction
Numérotation des reçus	Format : REC-{ANNEE}-{SEQUENCE} ou libre	ss_paiements.numero_recu	🆕 Paramètre format
PIN d'accès comptabilité	Code PIN pour sécuriser l'accès	ss_parametres_comptabilite (clé PIN_ACCESS)	✅ Existe
SECTION 8 : 🔒 Sécurité & Gestion des Accès
Qui a le droit de faire quoi. Les permissions.

Paramètre	Description	Existant	Action
Rôles existants	SUPER_ADMIN, ADMIN, OPERATEUR	ss_utilisateurs.role	✅ Existe (3 rôles)
Rôles personnalisés	Créer "Secrétaire", "Comptable", "Surveillant"	—	🆕 Table ss_roles + ss_permissions
Permissions par module	Ex: Secrétaire = Élèves ✅ + Finance ❌	—	🆕 Matrice de permissions
Politique de mot de passe	Longueur min, majuscule obligatoire, renouvellement	—	🆕 Paramètres sécurité
Durée de session	Déconnexion auto après X minutes d'inactivité	—	🆕 Paramètre session_timeout_minutes
Journal d'audit	Log de toutes les actions (qui a fait quoi, quand)	—	🆕 Table ss_audit_log
Double authentification (2FA)	Optionnel pour les admins	—	🆕 Future évolution
SECTION 9 : 📡 Communication & Notifications
Comment le système envoie des alertes.

Paramètre	Description	Existant	Action
Messagerie interne	Messages entre Admin, Profs et Parents	ss_messages + /communication	✅ Existe
Notifications par email	Activer/Désactiver l'envoi d'emails	—	🆕 Paramètre + config SMTP
Notifications par SMS	Intégration Orange SMS / Twilio	—	🆕 Paramètre + clé API
Messages automatiques	"Votre enfant est absent", "Paiement en retard", "Bulletin disponible"	—	🆕 Templates de messages auto
En-tête des messages	Personnaliser le header des emails (logo, nom école)	—	🆕 Template email
SECTION 10 : ⏰ Emploi du Temps & Vie Scolaire
Les règles de temps et de présence.

Paramètre	Description	Existant	Action
Jours de cours	Lundi → Vendredi ou Lundi → Samedi	ss_creneaux_emploi.jour (LUNDI..VENDREDI)	🆕 Paramètre configurable
Heures d'ouverture	Début 8h00, Fin 17h00	—	🆕 Paramètre heure_debut_ecole, heure_fin_ecole
Durée d'un cours	45 min, 55 min, 1h	—	🆕 Paramètre duree_cours_minutes
Pause / Récréation	Heures de pause (10h-10h15, 12h-14h)	—	🆕 Paramètre JSON
Seuil de retard	Après X minutes = retard, après Y = absent	—	🆕 Paramètre seuil_retard_minutes
QR Code pour présence agents	Activer/Désactiver le scan QR	ss_presences_agents	✅ Existe (API)
SECTION 11 : 📦 Import / Export de Données
Entrer et sortir des données en masse.

Paramètre	Description	Action
Import d'élèves par Excel/CSV	Télécharger un fichier avec tous les élèves	🆕 À implémenter
Import d'enseignants par Excel	Idem pour les profs	🆕 À implémenter
Export global en Excel	Exporter la liste des élèves, notes, paiements...	🆕 À implémenter
Sauvegarde de la base	Bouton pour exporter un backup de la DB	🆕 À implémenter
Restauration	Charger un backup pour restaurer	🆕 À implémenter
SECTION 12 : 🌐 Configuration Multi-Tenant (Mode SaaS)
Pour le déploiement en production : chaque école isolée.

Paramètre	Description	Existant	Action
Isolation par etablissement_id	Chaque requête filtrée par école	Présent dans TOUTES les tables	✅ Architecture prête
Page d'inscription d'école	Formulaire public pour qu'une nouvelle école s'inscrive	—	🆕 /inscription-ecole
Plan d'abonnement	Gratuit / Standard / Premium (limite d'élèves, fonctionnalités)	—	🆕 Future évolution
Domaine personnalisé	monecole.smartschool.gn	—	🆕 Future évolution
🗄️ MODÈLE DE DONNÉES PROPOSÉ
Pour stocker tous ces paramètres, je propose une table flexible ss_parametres (clé/valeur par établissement) :

sql

CREATE TABLE ss_parametres (
    parametre_id    SERIAL PRIMARY KEY,
    etablissement_id INTEGER REFERENCES ss_etablissements(etablissement_id),
    categorie       VARCHAR(50) NOT NULL,  -- 'IDENTITE', 'THEME', 'NOTATION', 'FINANCE', etc.
    cle             VARCHAR(100) NOT NULL, -- 'couleur_primaire', 'mode_notation', etc.
    valeur          TEXT NOT NULL,          -- La valeur (texte, JSON, URL...)
    type_valeur     VARCHAR(20) DEFAULT 'TEXT', -- TEXT, JSON, BOOLEAN, NUMBER, COLOR, URL
    UNIQUE(etablissement_id, cle)
);
IMPORTANT

Avantage : Pas besoin de modifier la structure de la DB à chaque nouveau paramètre. On ajoute simplement une ligne.

🏗️ ARCHITECTURE FRONTEND PROPOSÉE

/parametres/
├── page.tsx                    ← Dashboard avec les 12 sections cliquables
├── identite/page.tsx           ← Section 1 : Identité
├── calendrier/page.tsx         ← Section 2 : Années & Trimestres
├── notation/page.tsx           ← Section 3 : Système de notation
├── apparence/page.tsx          ← Section 4 : Theming
├── cartes/page.tsx             ← Section 5 : Format cartes scolaires
├── documents/page.tsx          ← Section 6 : Bulletins & PDF
├── finance/page.tsx            ← Section 7 : Configuration financière
├── securite/page.tsx           ← Section 8 : Rôles & Permissions
├── notifications/page.tsx      ← Section 9 : Communication
├── emploi-temps/page.tsx       ← Section 10 : Horaires
├── import-export/page.tsx      ← Section 11 : Import/Export
└── avance/page.tsx             ← Section 12 : Multi-Tenant
📋 RÉSUMÉ CHIFFRÉ
Métrique	Valeur
Sections de paramétrage	12
Paramètres configurables identifiés	~85
Paramètres déjà dans le code	~25 (à exposer dans l'UI)
Nouveaux paramètres à créer	~60
Nouvelles tables DB requises	3-4 (ss_parametres, ss_roles, ss_permissions, ss_audit_log)
Nouvelles pages frontend	12-13
Priorité 1 (MVP)	Sections 1, 2, 3, 4, 5, 7
Priorité 2 (V2)	Sections 6, 8, 9, 10, 11
Priorité 3 (SaaS)	Section 12
IMPORTANT

Questions pour validation avant implémentation
Ordre de priorité : On commence par quelles sections ? Je recommande : Identité (1) → Apparence/Theming (4) → Cartes (5) → Notation (3) → Finance (7).
Moteur de Templates : Pour les cartes et bulletins, on part sur un choix parmi des modèles prédéfinis avec personnalisation de couleurs/logo, ou un éditeur drag & drop complexe ?
Multi-Tenant : On garde l'approche actuelle (etablissement_id dans la même DB) qui est déjà en place, ou on veut une DB séparée par école ?
Thèmes saisonniers : Tu veux qu'on les implémente dès le départ ou en V2 ?