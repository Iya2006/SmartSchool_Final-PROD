# 📘 Smart School Guinea — Document de Référence Fonctionnelle v2.0

> Architecture flexible pour le contexte éducatif guinéen — Multi-établissements

---

## Table des matières

1. [Les 11 Rôles du Système](#4-les-11-rôles-du-système)
2. [Fonctionnalités Détaillées par Module](#5-fonctionnalités-détaillées-par-module)
3. [Matrice des Permissions](#6-matrice-des-permissions)
4. [Règles de Flexibilité — Cas Concrets](#7-règles-de-flexibilité)

---

## Principes de fusion des rôles

| Fusion possible | Cas d'usage | Résultat |
|---|---|---|
| Bibliothécaire = Enseignant | Prof qui gère aussi la bibliothèque | Un compte avec les deux fonctions |

> **Règle d'or :** Un rôle n'apparaît dans l'interface que s'il est activé pour cet établissement. Si la bibliothèque est désactivée, le menu « Bibliothèque » n'existe tout simplement pas.

---

## 4. LES 11 RÔLES DU SYSTÈME — QUI FAIT QUOI

Chaque rôle dispose d'un espace personnalisé dans le système. Un utilisateur ne voit que les menus et les données qui correspondent à son rôle et à son établissement.

---

### 🔷 RÔLE 1 — FONDATEUR / PROMOTEUR

> Vue stratégique globale — tous sites confondus — aucune saisie opérationnelle

**Ce que cette personne peut faire dans le système :**

- **Tableau de bord global :** nombre total d'élèves inscrits par site, revenus encaissés vs attendus, taux de réussite aux examens nationaux par établissement
- **Comparaison des performances** entre ses différents sites (classement, alertes)
- **Rapports financiers consolidés :** recettes totales, dépenses, bénéfices — par mois, trimestre, année
- **Alertes critiques** remontées automatiquement : un site a plus de 30% d'impayés, un incident grave signalé, etc.
- **Création et configuration** de nouveaux établissements dans le système
- **Accès en lecture** à tous les rapports de tous ses sites sans pouvoir modifier quoi que ce soit

> ⚠️ Ce rôle ne fait jamais de saisie. Il surveille, compare et décide.

---

### 🔷 RÔLE 2 — DIRECTEUR GÉNÉRAL (par site)

> Responsable opérationnel complet d'un établissement — supervise tous les niveaux

**Ce que cette personne peut faire dans le système :**

- **Tableau de bord du site :** présences du jour, notes en cours, état des paiements, incidents signalés
- **Gestion du personnel du site :** créer les comptes enseignants/admin, affecter les classes, gérer les congés
- **Validation finale des bulletins :** avant qu'un bulletin arrive chez le parent, le DG doit l'approuver
- **Supervision des emplois du temps** de tous les niveaux
- **Convocation des conseils de classe** et réunions générales (avec génération automatique des convocations PDF)
- **Rapports officiels** exportables pour l'inspection régionale et le Ministère de l'Éducation
- **Messagerie** avec tous les acteurs du site (enseignants, admin, parents)
- **Gestion des sanctions** et du règlement intérieur (avertissements, conseils de discipline)

---

### 🔷 RÔLE 3 — DIRECTEUR DE NIVEAU (Primaire / Collège / Lycée)

> Chef pédagogique et administratif d'un cycle — agit dans son niveau uniquement

**Ce que cette personne peut faire dans le système :**

- **Gestion des classes de son cycle :** créer les classes, y affecter les élèves et les enseignants
- **Création et modification** de l'emploi du temps de son niveau
- **Suivi des notes et moyennes** de son niveau : voir les résultats de toutes les classes, identifier les élèves en difficulté
- **Gestion des absences et de la discipline** pour son cycle
- **Validation des bulletins** de son niveau avant remontée au DG
- **Préparation et animation** des conseils de classe de son cycle
- **Rapports pédagogiques** de son niveau : taux de réussite par classe, par matière, évolution dans le temps
- **Coordination directe** avec les enseignants principaux de ses classes

> ⚠️ Ce rôle n'existe que si le niveau correspondant est activé dans la configuration de l'école.

---

### 🔷 RÔLE 4 — ENSEIGNANT

> Acteur pédagogique — travaille uniquement sur ses classes et matières affectées

**Ce que cette personne peut faire dans le système :**

- **Saisie des notes :**
  - Entrer les notes de devoir, composition, examen pour chaque élève
  - Corriger ou modifier une note avant validation
  - Voir les moyennes calculées automatiquement
- **Gestion des absences en cours :**
  - Signaler les absents à chaque séance
  - Le système notifie automatiquement les parents
- **Cahier de textes numérique :**
  - Écrire la leçon du jour et les devoirs à faire
  - Les élèves et parents voient ces informations en temps réel
- **Consultation** de son emploi du temps personnel
- **Messagerie** avec la direction et l'administration du site

> 💡 **L'Enseignant Principal** a en plus : vue complète sur toute sa classe, préparation du conseil de classe, rédaction des appréciations générales sur le bulletin.

---

### 🔷 RÔLE 5 — ADMINISTRATION / SCOLARITÉ

> Back-office de l'école — gestion des dossiers, de la vie scolaire et des communications

**Ce que cette personne peut faire dans le système :**

- **Gestion des inscriptions :**
  - Créer le dossier numérique d'un nouvel élève (informations personnelles, contacts parents, documents)
  - Modifier un dossier existant, archiver un élève qui quitte l'école
  - Gérer les transferts d'élèves entre niveaux ou entre sites
- **Gestion des absences globales (rôle SG) :**
  - Tableau de bord des absences du jour pour toute l'école
  - Enregistrer les retards et motifs d'absence
  - Générer les convocations parents pour absences répétées
- **Envoi de notifications** aux parents : SMS, WhatsApp ou notification app pour tous types d'alertes
- **Gestion du personnel :** contrats, congés, présences, profils de tout le staff
- **Génération de documents officiels :** certificats de scolarité, attestations, relevés de notes — en PDF prêt à imprimer
- **Annuaire complet** de l'établissement : élèves, parents, enseignants, personnel

---

### 🔷 RÔLE 6 — COMPTABLE / CAISSIER

> Gestion financière complète de l'établissement — paiements, salaires, dépenses

**Ce que cette personne peut faire dans le système :**

- **Gestion des frais de scolarité :**
  - Enregistrer un paiement pour un élève (partiel ou total)
  - Voir en temps réel qui a payé, qui doit encore, combien
  - Configurer les tranches de paiement (ex: 3 versements dans l'année)
  - Appliquer des remises ou exonérations accordées par la direction
- **Relances automatiques :**
  - Le système envoie automatiquement des rappels aux parents dont les frais sont en retard
  - Historique de toutes les relances envoyées
- **Gestion des salaires :**
  - Enregistrer les salaires mensuels du personnel enseignant et administratif
  - Suivi des avances et retenues sur salaire
  - Fiche de paie générée en PDF pour chaque employé
- **Tableau de bord financier :** total encaissé, total restant dû, dépenses du mois, solde de trésorerie
- **Export des rapports financiers** en PDF ou Excel pour le Fondateur ou l'audit

---

### 🔷 RÔLE 7 — BIBLIOTHÉCAIRE *(optionnel)*

> Gestion du fonds documentaire et des ressources pédagogiques de l'établissement

- **Catalogue numérique :** enregistrer chaque ouvrage (titre, auteur, matière, quantité disponible)
- **Gestion des prêts et retours :** enregistrer qu'un élève ou enseignant emprunte un livre, voir la date de retour prévue
- **Alertes automatiques :** rappel envoyé à l'élève/enseignant quand la date de retour approche
- **Bibliothèque numérique :** partager des PDF, documents de cours, ressources pédagogiques accessibles aux élèves et enseignants
- **Statistiques :** quels livres sont les plus empruntés, quels élèves lisent le plus

> ⚠️ Ce rôle n'existe que si le module Bibliothèque est activé.

---

### 🔷 RÔLE 8 — RESPONSABLE INFORMATIQUE / LABO *(optionnel)*

> Gestion de la salle informatique, du matériel technique et du support interne

- **Planning de la salle informatique :** quel classe utilise la salle à quelle heure — évite les conflits de réservation
- **Inventaire du matériel :** liste de tous les équipements informatiques, leur état (bon / en panne / à remplacer)
- **Signalement et suivi des pannes :** créer un ticket de panne, suivre sa résolution
- **Gestion des sessions élèves :** attribuer un poste à un élève pour une séance donnée
- **Support technique interne :** aider les enseignants à utiliser le système Smart School

> ⚠️ Ce rôle n'existe que si le module Salle Informatique est activé.

---

### 🔷 RÔLE 9 — PARENT D'ÉLÈVE

> Accès lecture + communication — suivi de son enfant uniquement — aucune modification

- **Notes et bulletins** de son enfant : disponibles dès que le directeur les a publiés
- **Absences et retards :** voir toutes les absences enregistrées, avec date, matière et motif
- **Emploi du temps** de son enfant : savoir exactement quels cours il a chaque jour
- **Situation financière :** voir ce qui a été payé, ce qui reste dû, les échéances à venir
- **Cahier de textes :** voir les leçons du jour et les devoirs à faire (pour accompagner son enfant)
- **Messagerie :** envoyer un message à l'administration ou à la direction de l'école
- **Notifications reçues :** résultats publiés, convocations, événements scolaires, alertes d'absence

> 💡 Si un parent a plusieurs enfants dans le même groupe scolaire, il voit tous ses enfants depuis un seul compte.

---

### 🔷 RÔLE 10 — ÉLÈVE

> Espace personnel de consultation scolaire — lecture seule

- **Emploi du temps** de sa classe : voir ses cours de la semaine
- **Ses notes :** voir ses résultats au fur et à mesure que l'enseignant les saisit
- **Bulletins publiés :** accéder à ses bulletins trimestriels
- **Cahier de textes :** leçons du jour et devoirs à rendre pour chaque matière
- **Ressources partagées :** documents PDF, fiches de révision mis en ligne par les enseignants

---

### 🔷 RÔLE 11 — SUPER ADMINISTRATEUR SYSTÈME

> Gestion technique totale de la plateforme — accès tous sites — rôle purement informatique

- **Création et gestion** de tous les comptes utilisateurs sur tous les sites
- **Configuration des établissements :** créer un nouveau site, activer/désactiver les niveaux et modules
- **Gestion des permissions :** définir exactement qui voit quoi pour chaque rôle
- **Logs d'activité complets :** historique de toutes les actions faites dans le système (qui, quoi, quand)
- **Sauvegardes automatiques** des données et restauration en cas de problème
- **Configuration des intégrations :** passerelles SMS, WhatsApp, Mobile Money (OrangeMoney, Wave)
- **Gestion des templates :** modèles de bulletins, certificats, convocations
- **Monitoring des performances** du système : vitesse, erreurs, utilisation

> ⚠️ Ce rôle n'appartient pas à l'école. C'est le développeur ou l'équipe technique de Smart School Guinea.

---

## 5. FONCTIONNALITÉS DÉTAILLÉES PAR MODULE

> Les fonctionnalités sont organisées en modules. Chaque module peut être actif ou inactif selon la configuration de l'établissement.

---

### 📦 MODULE 1 — INSCRIPTIONS & DOSSIERS ÉLÈVES

| Fonctionnalité | Description |
|---|---|
| **Fiche élève complète** | Nom, prénom, date de naissance, adresse, contacts des deux parents, groupe sanguin, niveau, classe, numéro matricule généré automatiquement |
| **Documents joints** | Possibilité d'attacher les copies des documents (extrait de naissance, photo, résultats antérieurs) directement au dossier numérique |
| **Historique scolaire** | Chaque élève garde un historique de toutes ses classes, notes, bulletins et absences depuis son inscription |
| **Transferts** | Gérer le départ d'un élève vers un autre établissement ou son changement de niveau avec transfert automatique de son dossier |
| **Recherche rapide** | Retrouver un élève en quelques secondes par nom, prénom, classe ou numéro matricule |

---

### 📦 MODULE 2 — NOTES & BULLETINS

| Fonctionnalité | Description |
|---|---|
| **Saisie des notes** | L'enseignant entre les notes par élève pour chaque type d'évaluation (devoir surveillé, composition, examen). Les notes sont sur 20 |
| **Calcul automatique des moyennes** | Le système calcule automatiquement la moyenne de chaque élève par matière, puis la moyenne générale. Aucun calcul manuel |
| **Coefficients configurables** | Chaque matière a un coefficient défini par la direction. Le système l'applique automatiquement dans tous les calculs |
| **Bulletin trimestriel** | Génération automatique du bulletin en PDF avec : notes par matière, moyennes, rang dans la classe, appréciations de l'enseignant et du directeur, et cachet de l'école |
| **Workflow de validation** | Enseignant saisit → Enseignant principal valide les appréciations → Directeur de niveau approuve → DG publie → Parent reçoit une notification |
| **Historique complet** | Les bulletins de toutes les années sont conservés et accessibles à tout moment |

---

### 📦 MODULE 3 — EMPLOI DU TEMPS

| Fonctionnalité | Description |
|---|---|
| **Création de l'emploi du temps** | Le directeur de niveau crée l'emploi du temps en définissant pour chaque créneau : la matière, l'enseignant, la salle et la classe |
| **Détection des conflits** | Le système signale automatiquement si un enseignant est affecté à deux classes en même temps, ou si une salle est utilisée deux fois simultanément |
| **Vue personnalisée par rôle** | L'enseignant voit son emploi du temps personnel. L'élève voit l'emploi du temps de sa classe. Le directeur voit tous les emplois du temps de son niveau |
| **Modifications rapides** | En cas de changement (enseignant absent, événement exceptionnel), le directeur modifie l'emploi du temps et tous les concernés sont notifiés instantanément |
| **Export PDF** | Génération de l'emploi du temps en PDF pour affichage en classe ou envoi aux parents |

---

### 📦 MODULE 4 — ABSENCES & PRÉSENCES

| Fonctionnalité | Description |
|---|---|
| **Appel en classe** | L'enseignant fait l'appel directement depuis son téléphone ou ordinateur au début de chaque cours. Les absents sont enregistrés en temps réel |
| **Notification immédiate au parent** | Dès qu'un élève est marqué absent, son parent reçoit automatiquement un SMS ou une notification pour l'informer |
| **Tableau de bord SG** | Le Surveillant Général (ou l'Administration) voit en temps réel toutes les absences du jour pour toute l'école, par classe et par élève |
| **Suivi des absences répétées** | Le système identifie automatiquement les élèves avec trop d'absences et génère une alerte pour la direction |
| **Justification d'absence** | Le parent peut soumettre une justification directement depuis son espace. L'administration valide ou rejette |
| **Rapport mensuel** | Rapport automatique des absences par élève et par classe, utilisable pour les conseils de classe |

---

### 📦 MODULE 5 — FINANCES SCOLAIRES

| Fonctionnalité | Description |
|---|---|
| **Configuration des frais** | La direction définit les frais d'inscription, les frais de scolarité par niveau, et les tranches de paiement (ex: 3 versements dans l'année) |
| **Enregistrement des paiements** | Le comptable enregistre chaque paiement avec : montant, date, mode de paiement (espèces, virement, Mobile Money), et reçu généré automatiquement |
| **Tableau des impayés** | Vue claire de tous les élèves qui ont des frais en retard, avec le montant dû et le nombre de jours de retard |
| **Relances automatiques** | Le système envoie des rappels automatiques aux parents selon un calendrier défini (ex: J+7, J+15, J+30 après l'échéance) |
| **Gestion des salaires** | Calcul et enregistrement des salaires mensuels, génération des fiches de paie en PDF, suivi des avances |
| **Rapport financier mensuel** | Bilan automatique : recettes du mois, dépenses, solde. Exportable en PDF et Excel pour le Fondateur |

---

### 📦 MODULE 6 — COMMUNICATIONS & NOTIFICATIONS

| Fonctionnalité | Description |
|---|---|
| **Messagerie interne** | Communication directe entre tous les acteurs du système : direction ↔ enseignant, admin ↔ parent, etc. |
| **Notifications SMS** | Envoi de SMS automatiques ou manuels vers les parents pour : absences, résultats publiés, convocations, événements |
| **Notifications WhatsApp** | Intégration WhatsApp Business pour envoyer des messages riches (avec PDF du bulletin par exemple) directement sur le téléphone du parent |
| **Annonces générales** | La direction publie des annonces visibles par tous les parents et élèves de l'école (rentrée, examens, événements) |
| **Convocations automatiques** | Génération automatique de convocations (parents, élèves, enseignants) avec les détails de la réunion, en PDF |

---

### 📦 MODULE 7 — BIBLIOTHÈQUE *(optionnel)*

| Fonctionnalité | Description |
|---|---|
| **Catalogue numérique** | Enregistrement de tous les livres avec : titre, auteur, matière, niveau scolaire, nombre d'exemplaires disponibles |
| **Gestion des emprunts** | Enregistrement d'un emprunt : qui emprunte quoi, depuis quand, jusqu'à quand. Vue en temps réel des livres sortis |
| **Rappels de retour** | Notification automatique envoyée à l'emprunteur 2 jours avant la date de retour prévue |
| **Ressources numériques** | Le bibliothécaire peut mettre en ligne des PDF, fiches de cours, documents pédagogiques accessibles aux élèves et enseignants |

---

### 📦 MODULE 8 — SALLE INFORMATIQUE *(optionnel)*

| Fonctionnalité | Description |
|---|---|
| **Planning de réservation** | Les enseignants réservent des créneaux pour utiliser la salle avec leur classe. Le système évite les doublons automatiquement |
| **Inventaire du matériel** | Liste de tous les équipements : ordinateurs, imprimantes, projecteurs — avec leur état et leur date de dernière maintenance |
| **Tickets de panne** | Un enseignant ou l'admin signale une panne. Le responsable informatique reçoit une alerte et suit la résolution du problème |

---

## 6. MATRICE DES PERMISSIONS

> Résumé visuel de qui peut faire quoi dans le système.
>
> **Légende :** ✏️ = Écriture/Action · 👁️ = Lecture seule · ❌ = Accès refusé

| Action | Fondateur | DG | Dir. Niveau | Enseignant | Admin | Comptable | Biblio | Resp. IT | Parent | Élève |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard global multi-sites | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Dashboard établissement | 👁️ | 👁️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configurer l'établissement | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gérer emploi du temps | ❌ | ✏️ | ✏️ | 👁️ | ❌ | ❌ | ❌ | 👁️ | 👁️ | 👁️ |
| Saisir les notes | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Valider & publier bulletins | ❌ | ✏️ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gérer inscriptions / dossiers | ❌ | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gérer absences (appel cours) | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gérer absences (tableau global) | ❌ | 👁️ | 👁️ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Enregistrer paiements | ❌ | ❌ | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ |
| Voir rapports financiers | 👁️ | 👁️ | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | 👁️ | ❌ |
| Gérer salaires personnel | ❌ | ❌ | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ |
| Gérer catalogue bibliothèque | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ |
| Gérer planning salle info | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ |
| Envoyer notifications parents | ❌ | ✏️ | ✏️ | ❌ | ✏️ | ✏️ | ❌ | ❌ | ❌ | ❌ |
| Gérer personnel (RH / contrats) | ❌ | ✏️ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Voir notes / bulletins (enfant) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ |
| Cahier de textes — écrire | ❌ | ❌ | ❌ | ✏️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cahier de textes — lire | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ |
| Messagerie interne | ❌ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ✏️ | ❌ |
| Générer documents PDF (certifs…) | ❌ | ✏️ | ❌ | ❌ | ✏️ | ✏️ | ❌ | ❌ | ❌ | ❌ |
| Ressources numériques biblio | ❌ | ❌ | ❌ | 👁️ | ❌ | ❌ | ✏️ | ❌ | 👁️ | 👁️ |

---

## 7. RÈGLES DE FLEXIBILITÉ — CAS CONCRETS

> Voici comment le système s'adapte concrètement à différents types d'écoles guinéennes.

---

### 🏫 CAS A — Grand groupe scolaire (type Sainte-Marie Dixinn)

- 3 niveaux actifs : **Primaire + Collège + Lycée**
- Modules actifs : Bibliothèque, Salle Informatique, Cantine
- 1 Directeur Général + 1 Directeur par niveau (3 directeurs de niveau)
- Enseignant Principal configuré par classe (1 référent par classe)
- Admin et Comptable = 2 comptes séparés
- Multi-sites possible si le groupe a d'autres établissements

---

### 🏫 CAS B — École secondaire seule (Collège + Lycée uniquement)

- 2 niveaux actifs : **Collège + Lycée** (Primaire désactivé)
- Modules : Bibliothèque active, Salle Info active, pas de Cantine
- 1 Directeur Général = aussi Directeur de niveau (fusion possible)
- Enseignant Principal configuré par niveau
- 1 seul compte Admin + Comptable fusionnés

---

### 🏫 CAS C — Petite école primaire privée

- 1 seul niveau actif : **Primaire**
- Aucun module optionnel activé
- Le Promoteur = le Directeur (même compte, deux accès)
- Pas d'enseignant principal — le Directeur assure ce rôle
- 1 seul compte Admin + Comptable fusionnés
- Pas de multi-sites

---

### 🏫 CAS D — Lycée technique ou professionnel

- 1 seul niveau actif : **Lycée**
- Modules : Salle Informatique active, Bibliothèque active
- Structure standard : DG + Proviseur
- Enseignant Principal par classe
- Filières configurables : Scientifique, Littéraire, Technique

---

> 📄 *Smart School Guinea — Document de Référence Fonctionnelle v2.0*
> *Architecture flexible pour le contexte éducatif guinéen — Multi-établissements*
