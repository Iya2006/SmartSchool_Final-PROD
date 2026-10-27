# Session du 26-27/10/2026 — Offline-first, Phase A : un ordinateur entièrement autonome

## Contexte

Cahier des charges du fondateur (26/10/2026) : SmartSchool doit être
**utilisable à l'identique avec ou sans internet**. Toutes les fonctionnalités
doivent marcher, comptabilité et reçus compris, avec les données dans une
**base locale** sur l'appareil et une synchronisation automatique avec le cloud.
Le modèle de référence est le logiciel de pharmacie de l'équipe : chaque poste
travaille seul hors-ligne et se synchronise dès qu'internet revient.

Plan approuvé (`C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`) :
- chaque appareil fait tourner **le même moteur SmartSchool** (serveur Python,
  sans réécriture) avec sa **propre base SQLite** ;
- l'application installée (Electron) travaille toujours sur ce moteur local ;
- phases A (poste autonome), B (synchronisation multi-appareils),
  C (installeur et mises à jour), D (validation complète), E (Android).

Branche : `IYA-hors-ligne`. Rien sur `IYA` ni `main` avant la validation complète.

## Phase A — ce qui a été fait

### 1. Périmètre d'un établissement (`backend/app/sync/perimetre.py`)
Les lignes de chaque table qui appartiennent à une école. Une table y entre
de trois façons :
- **directement**, quand elle porte `etablissement_id` (40 tables) ;
- **par clés étrangères**, quand **tous** ses parents renseignés sont dans le
  périmètre (33 tables) ;
- comme **référentiel commun**, pour le plan comptable SYSCOHADA.

Deux cas sont traités explicitement :
- les **parents**, qui suivent leurs enfants ;
- les **photos en attente**, qui ne sont pas reliées par clé étrangère.

Résultats :
- toutes les tables (76) ont une règle, et le test échoue si une nouvelle
  table en manque ;
- un **vrai bug de fuite** trouvé par les tests est corrigé : un lien
  élève↔parent d'une autre école partait avec l'export (la règle demandait
  « au moins un parent », elle demande désormais « tous les parents ») ;
- **vérifié sur les vraies données locales** (établissement 1, 26 355 lignes) :
  zéro référence cassée, et zéro ligne légitime écartée par la règle stricte.

### 2. Instantané et installation
- **`app/sync/serialisation.py`** : conversion par type de colonne (dates,
  montants exacts, binaires).
- **`app/sync/instantane.py`** : export **par pages** triées par clé, pour
  permettre la reprise après coupure. L'import est idempotent : rejouer une
  page ne crée aucun doublon.
- **`app/api/poste.py`**, côté cloud : `GET /api/poste/instantane` et
  `/instantane/{table}`, **réservés à la direction**. Le directeur de niveau et
  le comptable reçoivent 403. Le DG n'y a accès que si la comptabilité lui est
  ouverte.
- **`app/sync/installation.py`** + **`app/api/poste_local.py`**, côté poste
  seulement :
  - connexion au cloud avec un compte de direction ;
  - téléchargement de toutes les données, puis de **tous les fichiers** (logo,
    cachet, signature, photos, devoirs, sujets) ;
  - nouvelles tentatives sur coupure, puis reprise ;
  - marqueur `poste.json` écrit **seulement à la fin**, pour qu'une
    installation interrompue ne passe jamais pour complète ;
  - messages en français, sans trace technique ;
  - chemins de fichiers piégés (`..`) refusés.
- **Connexion hors-ligne** : les comptes et leurs mots de passe hachés font
  partie du téléchargement, donc chacun se connecte sur le poste avec ses
  identifiants habituels.

### 3. Moteur en « mode poste » (`SMARTSCHOOL_MODE=poste`, `app/core/mode.py`)
- **Base SQLite** (`app/core/database.py`) : accès depuis plusieurs fils
  d'exécution, délai d'attente sur verrou, journal WAL, et **clés étrangères
  activées**. La base locale refuse ainsi exactement ce que PostgreSQL refuse.
- **Sans Redis** :
  - cache désactivé d'emblée ;
  - limitation de débit en mémoire ;
  - **file de tâches intégrée au moteur** (`FileLocale`, même interface que RQ :
    calcul des moyennes et bulletins asynchrones) ;
  - supervision affichant « Redis non utilisé sur ce poste » au lieu d'une
    alerte.
- **SQL propre à PostgreSQL rendu neutre** :
  - `func.current_date() - 30/90` : 5 endroits (dashboard, incidents). Sous
    SQLite, ce calcul donnait un nombre, et le filtre « 30 derniers jours »
    laissait tout passer.
  - `to_char` : 1 endroit (fiche de paie).
- **Dossier des fichiers centralisé** (`app/core/fichiers.py`) : réglable sur un
  poste, inchangé en ligne. Les 7 chemins `backend/uploads` codés en dur et le
  montage `/uploads` passent par lui.

### 4. Application de bureau (`desktop/`)
- **`main.js`** (Electron) :
  - au démarrage : écran de chargement, puis lancement du moteur et de
    l'interface, et fenêtre ouverte sur la connexion ;
  - données dans le dossier de l'utilisateur ;
  - clé de session propre à l'ordinateur, jamais transmise ;
  - journaux pour le diagnostic ;
  - arrêt de l'arbre des processus à la fermeture ;
  - une seule instance à la fois.
- **`scripts/construire-interface.mjs`** : compile l'interface poste dans
  `frontend/.next-poste`, sans toucher au `.next` du serveur de développement,
  avec l'API sur le moteur local `127.0.0.1:47830` et sans Service Worker.
- **Interface** :
  - nouvel écran `/installation` ;
  - garde qui y mène tant que le poste n'est pas installé ;
  - `EST_POSTE` désactive la préparation de la Phase 0, inutile sur un poste ;
  - `distDir` réglable dans `next.config.ts`.

## Vérifié réellement

**Tests automatiques** :
- Backend : **1075 tests** au vert. Les 10 échecs sont les mêmes qu'avant,
  dans le module évaluations, déjà connus.
- Synchronisation : **23 nouveaux tests** couvrant le périmètre, l'isolation
  entre écoles, la pagination, l'import, les routes et rôles, l'installation,
  la coupure puis reprise, les fichiers et la file locale.
- Frontend : `tsc` propre, **157/157** tests.

**Moteur poste sur une vraie base SQLite** construite depuis les données
locales (26 355 lignes) :
- **221 routes de lecture** appelées, **aucune erreur 500**. Les 7 refus sont
  des refus métier, identiques à ceux du cloud.
- **Encaissement réel** : reçu `SMART-1-2026-00009` complet (montant en
  lettres, parent, lien de vérification), solde de la facture mis à jour.
- **Inscription réelle** d'un élève, avec matricule attribué localement.

**Application installée (Electron), de bout en bout** :
1. Au premier lancement, l'application mène d'elle-même à l'écran
   d'installation.
2. L'installation réelle, depuis le backend local qui joue le cloud, aboutit.
3. Le dashboard s'affiche sur les données locales (2026-2027, 5 000 élèves).
4. **Relancée avec un cloud injoignable**, l'application garde la session, et
   le dashboard comme la liste des élèves fonctionnent, logo de l'école
   compris.
5. Installation sans internet : message clair, reprise possible.
6. À la fermeture, les ports sont libérés.

## Limites connues (prochaines phases)

**Phase B — synchronisation** :
- Rien ne repart encore vers le cloud.
- Deux postes hors-ligne produiraient le même numéro de reçu : il faut une
  numérotation par appareil.
- Le **QR des reçus** émis hors-ligne est signé avec la clé du poste, que le
  cloud ne reconnaît pas : il faut une clé par appareil, enregistrée.
- Le suivi des changements devra se faire au niveau de la base (déclencheurs),
  car `photos.py` écrit en SQL brut, hors ORM.

**Phase C — mises à jour** :
- La mise à niveau automatique du schéma lit `information_schema`, qui n'existe
  que sous PostgreSQL : à adapter pour les mises à jour du poste.
- Empaquetage (PyInstaller, installeur).
- Chiffrement de la base locale.

**Hors phases** :
- Mon jeu de données local ne contient pas d'évaluations : le calcul des
  moyennes sur le poste n'a pas pu être exercé de bout en bout. La file
  locale est couverte par des tests.
- Les photos stockées hors du serveur (adresses `https://`) ne sont pas
  copiées : elles ne s'affichent qu'avec internet.
