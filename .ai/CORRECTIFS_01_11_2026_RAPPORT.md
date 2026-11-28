# Session du 29/10 au 01/11/2026 — Offline-first, Phase C

Branche : `IYA-hors-ligne`. Plan approuvé : voir
`C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`.

## Contexte

Les phases A et B permettent à un ordinateur de fonctionner seul, puis de
converger avec les autres postes et le cloud. Mais l'application n'existait
que dans le dépôt : elle démarrait avec le Python de développement et le code
source. La phase C en fait un logiciel qu'une école installe et garde :
- **C1** : un installeur Windows ;
- **C2** : des mises à jour automatiques ;
- **C3** : des données chiffrées sur le disque ;
- **C4** : le retrait d'un poste perdu ou volé ;
- **C5** : une section « Télécharger » sur la vitrine.

Choix du fondateur (29/10) :
- installeurs publiés sur un **dépôt GitHub public dédié**
  (`smartschool-installation`), qui ne contient que les installeurs ;
- **pas de signature** pour l'instant, mais une chaîne prête à signer.

**Rien n'est publié.** Le dépôt public n'est pas créé, et aucun installeur
n'est en ligne. La publication se fera à la fusion (phase D), avec ton accord.

## C1 — L'installeur Windows

Une seule commande, depuis `desktop/` : `npm run empaqueter`
(`desktop/scripts/empaqueter.mjs`). Elle produit `dist/SmartSchool-Setup.exe`,
d'environ 160 Mo.

Ce qu'elle fait :
1. **Contrôle des versions** : `desktop/package.json` et
   `backend/app/core/version.py` doivent porter la même version. Sinon, le
   script s'arrête.
2. **Compile l'interface** du poste. L'option `--sans-interface` réutilise
   celle qui est déjà compilée.
3. **Prépare un Python autonome** : Python 3.14.2 « embeddable » officiel.
   - Son empreinte SHA-256 est vérifiée ; c'est celle publiée par python.org.
   - Les dépendances du moteur viennent de `backend/requirements-poste.txt`,
     versions figées, sans les outils de test, plus `sqlcipher3-wheels`.
4. **Copie le moteur**, compilé en `.pyc`, **sans les sources**.
   - Sont exclus : tests, `venv`, `uploads`, bases, et surtout `.env` et
     `secrets/`.
   - Un dernier contrôle arrête tout si l'un d'eux s'y trouve.
5. **Construit l'installeur** (electron-builder, NSIS) :
   - installation par utilisateur, sans droits administrateur ;
   - dossier : `%LOCALAPPDATA%\Programs\smartschool-poste` ;
   - **la désinstallation garde les données de l'école**, et une réinstallation
     retrouve tout.

La signature s'activera seule quand un certificat sera fourni (variables
`CSC_LINK` et `CSC_KEY_PASSWORD`). D'ici là, Windows affiche l'avertissement
SmartScreen au premier lancement de l'installeur.

**Pièges trouvés en construisant**, tous corrigés :
- **L'application installée ne s'ouvrait pas** (« Cannot find module 'next' »).
  `extraResources` d'electron-builder écarte en silence les dossiers
  `node_modules` et ceux qui commencent par un point (`.next-poste`).
  - Correctif : une étape `afterPack` (`desktop/scripts/apres-empaquetage.js`)
    recopie Python, moteur et interface tels quels.
  - Elle vérifie ensuite la présence des fichiers indispensables.
- **Le `.env.production` de l'interface partait dans l'installeur.** Il ne
  contenait qu'une adresse publique, mais aurait été chargé au démarrage. Il
  est maintenant exclu, et un contrôle le garantit.
- **Chemins trop longs.** Windows refuse les chemins de plus de 259
  caractères, et l'installeur saute alors le fichier **sans rien dire**.
  - Constaté en test : le dossier d'installation de test faisait 132
    caractères, et le plus long fichier de l'interface en fait 140. Les
    fichiers les plus profonds manquaient, et la mise à jour échouait (code 2).
  - En situation réelle, le dossier fait une cinquantaine de caractères, soit
    195 au total.
  - Garde-fou ajouté : la construction s'arrête si un chemin de l'application
    dépasse 159 caractères. Cela réserve 100 caractères au dossier
    d'installation, pour un nom de profil Windows long.
- Le `tar` de Git prenait `C:` pour un serveur distant : le script utilise
  celui de Windows.

## C2 — Mises à jour automatiques

**Le mécanisme** (`desktop/main.js`, electron-updater) :
- vérification au démarrage, puis toutes les 6 heures ;
- téléchargement en arrière-plan ;
- puis la question « Redémarrer maintenant / Plus tard ». Sans réponse, la
  mise à jour s'installe à la fermeture suivante.
- Journal : `journaux/mises-a-jour.log`, dans le dossier de données.
- Pour les tests, `SMARTSCHOOL_MISES_A_JOUR_URL` pointe vers un flux local.
  On vérifie ainsi les mises à jour de bout en bout **sans rien publier**.

**La version du poste, vue par le cloud** :
- le poste envoie sa version à chaque échange (`X-SmartSchool-Version`) ;
- le cloud refuse les postes plus anciens que `VERSION_POSTE_MINIMALE`
  (réponse 426) ;
- le poste affiche alors « Mise à jour nécessaire » et continue de
  fonctionner hors-ligne.
- Ce contrôle passe **après** l'authentification et le retrait : un poste
  retiré et resté sur une vieille version apprend quand même qu'il est retiré.

**Le schéma local se met à niveau au démarrage.** Avant, le rattrapage des
colonnes lisait `information_schema`, qui n'existe que sous PostgreSQL : sur
un poste, il échouait en silence.
- `migrations/rattraper_colonnes_manquantes.py` passe maintenant par
  l'inspecteur SQLAlchemy et fonctionne pour les deux bases.
- Les index manquants des tables existantes sont aussi créés, ce que
  `create_all` ne fait pas.
- Le cloud garde son comportement. Vérifié sur une copie : rien à ajouter.

**Sauvegarde avant chaque nouvelle version** (`app/sync/sauvegarde.py`) :
- une copie de la base, prise par `VACUUM INTO`, dans `poste/sauvegardes/`,
  avant toute mise à niveau du schéma ;
- les deux dernières sont gardées ;
- **elle reste chiffrée**, vérifié.

## C3 — Chiffrement des données du poste

- **La base** est chiffrée par SQLCipher (AES-256) quand l'application fournit
  une clé (`SMARTSCHOOL_CLE_BASE`). Sans clé, rien ne change : tests,
  développement et cloud.
- **La clé** est tirée au hasard à la première ouverture et protégée par
  Windows (`safeStorage`, DPAPI, liée au compte). Elle n'est jamais écrite en
  clair. La clé des sessions suit le même chemin.
- **Les secrets de synchronisation** (jeton du poste, clé des reçus) ont quitté
  `appareil.json` pour la base chiffrée. Un ancien fichier est repris puis
  effacé.
- **Une base existante en clair** est convertie une seule fois, sans perte.

**Piège trouvé sur l'application installée, corrigé.** Le moteur s'arrêtait
net, sans aucune trace, au premier afflux de requêtes.
- Avec une base chiffrée, SQLAlchemy prenait un pool prévu pour les bases en
  mémoire. Ce pool ne garde que cinq fils et ferme la connexion des autres
  pendant qu'ils s'en servent.
- Correctif : le pool est imposé (`QueuePool`).
- Un test fait tourner 40 fils simultanés sur une base chiffrée.

## C4 — Retirer un poste

- **Sur l'écran « Synchronisation » du cloud** : un bouton « Retirer ce poste »
  par poste, avec confirmation, et « Remettre en service » si c'était une
  erreur. Réservé à la direction : un comptable reçoit 403.
- **Sur le poste** : au premier refus, il l'enregistre et se verrouille.
  - Toute connexion est refusée.
  - Un écran plein explique quoi faire.
  - Les données restent chiffrées sur le disque ; rien n'est effacé.
- À la remise en service, le verrou se lève au premier échange réussi.

## C5 — « Télécharger SmartSchool » sur la vitrine

Section `#telecharger` de `frontend/src/app/page.tsx` :
- un bouton vers `…/releases/latest/download/SmartSchool-Setup.exe` ;
- la configuration requise : Windows 10 ou 11, 64 bits ;
- trois étapes : installer, connecter l'école, travailler.

Elle ne sert qu'une fois l'installeur publié : elle partira avec la fusion de
la phase D.

## Bug signalé pendant la session : fenêtre d'erreur à la fermeture

**Le symptôme**, vu sur l'application installée : une fenêtre « A JavaScript
error occurred in the main process », `ERR_STREAM_WRITE_AFTER_END`,
`main.js:85`.

**La cause** (`desktop/main.js`, fonction `lancer`) :
- les sorties du moteur et de l'interface étaient branchées sur leur journal ;
- le premier branchement terminé **fermait le journal** ;
- la ligne « arrêté », écrite ensuite, levait une exception dans le processus
  principal.

Cela arrivait au hasard, à la fermeture de l'application ou quand le moteur
s'arrêtait. Des lignes de journal se perdaient aussi.

**Reproduit avant correction**, 50 services lancés puis arrêtés :
- ancien code : 4 exceptions, 43 journaux complets sur 50 ;
- nouveau code : 0 exception, 50 sur 50.

**Le correctif** :
- le journal ne se ferme qu'après l'arrêt du service **et** la fin de ses deux
  sorties ;
- un journal qui ne peut plus s'écrire (disque plein) ne fait plus tomber
  l'application ;
- un service qui ne démarre pas est noté au journal au lieu de lever une
  exception.

**Vérifié sur l'application installée** : trois cycles de démarrage, arrêt du
moteur pendant que l'application tourne, puis fermeture.
- Aucune fenêtre d'erreur.
- L'application se ferme à chaque fois, sans processus restant.
- L'arrêt du moteur est noté au journal.

## Vérifié réellement

Tout ce qui suit l'a été sur l'**application installée** par son installeur,
en silencieux, pilotée par Playwright. Le cloud tournait en local, sur une
copie PostgreSQL migrée.

1. **Contenu de l'installeur** : ni `.env`, ni source `.py`, ni base. Les
   5 856 fichiers sont présents, y compris le plus profond.
2. **Premier lancement** :
   - installation de l'école par l'écran, puis connexion ;
   - **base chiffrée** (4,7 Mo), illisible par `sqlite3` ;
   - le dossier du poste ne contient que `cle-base.protege`,
     `cle-session.protege`, `poste.json` et `version.txt` : aucun secret en
     clair ;
   - le moteur qui tourne est bien le Python embarqué ;
   - un encaissement hors du cloud, reçu `SMART-1-2026-P7-00001`, est
     synchronisé ; le reçu est présent sur le cloud.
3. **Mise à jour automatique 0.3.0 → 0.3.1**, servie par un flux local :
   - détectée, téléchargée, installée, puis l'application **redémarre seule** ;
   - ensuite, même école, même encaissement, connexion acceptée ;
   - synchronisation à jour, en version 0.3.1 ;
   - sauvegarde `avant-0.3.1-depuis-0.3.0-….db`, chiffrée.
4. **Retrait** :
   - depuis le **vrai bouton** de l'écran web : confirmation, puis pastille
     « Retiré », puis « Remettre en service » ;
   - sur le poste : verrouillé, connexion refusée (403), écran « Poste retiré
     par la direction » ;
   - après remise en service : verrou levé, connexion acceptée.
5. **Désinstallation puis réinstallation** : les données restent, et
   l'application retrouve l'école (installée, connexion acceptée).
6. **Installation d'une version plus récente par-dessus** (0.3.2) : l'école
   est retrouvée.

Les versions 0.3.1 et 0.3.2 n'étaient que des versions de test. Le dépôt est
revenu à 0.3.0.

**Remarque sur le test de mise à jour.** Après la mise à jour, Windows relance
l'application sans les variables d'environnement du test : dossier de
données et cloud local. Elle a donc ouvert un poste vide dans le dossier par
défaut, qui a été supprimé ensuite. Une école n'a pas ces variables : son
application relancée retrouve son dossier habituel. Les données ont été
vérifiées en relançant la 0.3.1 sur le dossier de test.

## Tests automatiques

- **Phase C** (`tests/test_sync_phase_c.py`) : 8 tests.
  - mise à niveau du schéma d'un poste ;
  - base chiffrée illisible sans clé, 40 requêtes simultanées, conversion
    d'une base en clair ;
  - sauvegardes ;
  - version 426 ;
  - retrait et remise en service ;
  - verrou du poste.
- **Backend complet** : 1 129 réussis, 12 échecs, **aucun dû à la phase C** :
  - 10 dans les évaluations, déjà présents avant ;
  - 2 dans `test_absence_enseignant_constater_puis_decider.py`, qui dépendent
    de la date. Ils signalent une absence « le 3 du mois en cours ». Le 1er
    novembre, c'est une date future, que l'application refuse à juste titre
    (« On ne constate pas une absence qui n'a pas encore eu lieu »). Ils
    échouent donc les 1er et 2 de chaque mois. **Non corrigés**, signalés.
- **Frontend** : `tsc` sans erreur, 165 tests réussis.

## Problèmes trouvés en passant

- J'avais écrit « Gratuit pour les écoles clientes » sur la section de la
  vitrine. C'était une promesse commerciale inventée : retirée.
- Deux tests de la phase C laissaient des copies de base ouvertes, verrouillées
  par Windows : corrigés.

## Limites connues

- **Les fichiers** (photos, documents) restent en clair dans le dossier de
  l'utilisateur Windows. Les chiffrer est un chantier à part.
- **Installeur non signé** : avertissement SmartScreen jusqu'à l'achat d'un
  certificat.
- **Un moteur qui s'arrête n'est pas relancé.** L'application ne plante plus,
  mais la fenêtre reste ouverte sur un moteur arrêté jusqu'au redémarrage de
  l'application. À traiter : relance automatique, ou message clair.
- **Windows seulement** : ni macOS, ni Linux. Android, c'est la phase E.

## Production

Toujours rien d'exécuté en production. À la fusion :
1. lancer `2026_10_sync_01_identifiants_bigint.py --appliquer` ;
2. redémarrer le cloud ;
3. avec ton accord : créer le dépôt public `smartschool-installation`, puis y
   publier le premier installeur.

## Suite

**Phase D** :
- validation page par page, hors-ligne, pour tous les rôles ;
- plusieurs postes en même temps ;
- puis fusion vers `IYA` et `main`, et publication, avec ton accord.
