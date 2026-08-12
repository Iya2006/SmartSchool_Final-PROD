# 🎯 TÂCHE EN COURS

## Tâche active — Fluidité à grande échelle + Galerie paginée + Profil admin réel (12/08/2026)
Voir `.ai/SCALABILITE_GALERIE_PROFIL_RAPPORT.md` pour le détail complet.
Résumé : après la fusion du travail du collaborateur, l'utilisateur a
demandé (1) une analyse + corrections de fluidité pour supporter jusqu'à
1M élèves/école sans toucher au backend du collaborateur, (2) un correctif
pour la page Galerie qui plantait à 5000 élèves (chargeait tout d'un
coup), (3) une refonte de la page Profil admin, en grande partie factice
(sauvegarde en `localStorage` seulement, changement de mot de passe faux,
pas de vrai upload photo).

Fait : 12 nouveaux index de performance (nouveau fichier de migration,
même motif que celui du collaborateur, non modifié) ; pagination ajoutée
partout où elle manquait réellement (personnel, classes, enseignants,
galerie) avec correction au passage des cartes de statistiques qui
auraient sinon silencieusement cessé de représenter toute l'école ; 4
vrais bugs N+1 corrigés (règle déjà documentée dans
`.ai/PROJECT_MEMORY.md`) ; galerie repensée en 50 photos par page (vérifié
contre les vraies données à 5000 élèves — le scénario exact du
signalement) ; page Profil entièrement reconnectée à des données réelles
(fiche personnel, changement de mot de passe avec vérification de
l'ancien, vrai upload de photo) et ses 3 onglets 100% factices (Annonces,
Préférences Système, Journal d'Audit) retirés sur décision explicite de
l'utilisateur.

État vérifié : suite backend 667 passed/0 échec, `tsc` propre, 102/102
frontend, migration exécutée sur la base locale (schéma confirmé aligné).
Rendu visuel réel non vérifié (aucun outil d'automatisation navigateur
disponible cette session).

**Suite directe (même jour) — 3 correctifs suite à un test utilisateur
réel** : l'utilisateur a testé le mécanisme de photo (parent envoie la
photo de son enfant → admin valide) et signalé un avertissement React
"key" sur la Galerie + "rien ne se passe" côté parent et côté admin. Voir
l'addendum complet dans `.ai/SCALABILITE_GALERIE_PROFIL_RAPPORT.md`.
Résumé : (1) avertissement "key" = condition de course au changement
d'onglet, corrigée ; (2) "rien ne se passe" côté admin = régression que
j'avais moi-même introduite au tour précédent (`/pending/ids` avait perdu
`file_path`), corrigée ; (3) upload parent qui échoue = **bug préexistant,
pas une régression de cette session** — `POST /api/portail-parent/login`
(la vraie route du frontend parent) n'incluait jamais `etablissement_id`
dans le token, faisant échouer en 403 tout appel protégé par
`require_etablissement`, dont l'upload de photo. Corrigé, nouveau test de
régression ajouté (aucune couverture n'existait avant pour cette route).
Suite finale : 676 passed/2 skipped (1 erreur Docker/Redis non liée),
`tsc` propre, 102/102 frontend.

## Tâche précédente — Fusion `origin/main` (PR du collaborateur) dans `IYA` (12/08/2026)
Voir `.ai/FUSION_MAIN_DANS_IYA_RAPPORT.md` pour le détail complet. Résumé :
l'utilisateur a accepté une PR de son collaborateur sur `main`
(comptabilité, moteur de notation, inscription en ligne des
établissements) et craignait qu'une fusion vers `IYA` n'écrase son propre
travail sur les mêmes zones (comptabilité notamment). Diagnostic par
simulation en lecture seule AVANT tout geste (`git merge-tree`) : seuls 3
fichiers auraient réellement conflictué, `comptabilite.py` n'en faisait
PAS partie (modifications disjointes). Travail non commité de la session
mis en ordre (3 commits distincts), puis fusion réelle (4 conflits
résolus en combinant les deux côtés, jamais en écrasant), puis un bug
latent de rate limiting trouvé et corrigé (slowapi ne désactivait jamais
vraiment le rate limiting en test, invisible jusqu'ici). Suite finale :
667 passed/0 échec, `tsc` propre, 102/102 frontend. Point produit encore
ouvert, signalé mais pas tranché : deux écrans admin concurrents pour
configurer les horaires d'établissement (notre grille horaire vs.
`parametres/horaires` du collaborateur). Fusion locale uniquement, pas
encore poussée vers `origin/IYA`.

**Suite directe (même jour)** : décision utilisateur sur le point ouvert
ci-dessus — garder uniquement le système d'horaires du collaborateur
(`parametres/horaires`), retirer la grille horaire configurable de cette
session (Addendum 4 de `.ai/IYA0_RAPPORT.md`, voir Addendum 6). Les 4
fichiers concernés restaurés à leur état d'avant ce chantier (aucun risque,
`origin/main` ne les avait pas touchés). Suite backend 667 passed/0 échec,
`tsc` propre, 102/102 frontend, toujours vrais après ce retrait.

**Suite directe (même jour)** : l'utilisateur a signalé des erreurs
réelles en testant (traceback backend collé dans la conversation). Cause
trouvée : 13 migrations de la fusion `origin/main` n'avaient jamais été
exécutées sur la base locale (fusionner du code ne migre pas la base).
Toutes exécutées avec succès (2 nécessitaient une décision d'établissement
— une seule école réelle ici, sans ambiguïté ; 1 bloquée par des emails
vides au lieu de NULL sur 3 lignes, normalisés puis relancée). Vérifié
au-delà : comparaison systématique de tous les modèles SQLAlchemy contre
le schéma réel, aucun autre désalignement. Suite backend 667 passed/0
échec reconfirmée. Détail complet dans
`.ai/FUSION_MAIN_DANS_IYA_RAPPORT.md`.

## Tâche précédente — Séances pédagogiques + grille horaire configurable (branche `IYA`, 12/08/2026)
Voir `.ai/IYA0_RAPPORT.md` pour le détail complet (fichiers, migration,
corrections, tests, verdict GO). Résumé : `Presence` (appel de classe)
n'avait aucune notion de matière/enseignant/séance — un enseignant avec
plusieurs matières sur la même classe ne pouvait faire qu'un appel par
demi-journée, le second écrasant silencieusement le premier. Corrigé par un
nouveau modèle `Seance` (OWNERSHIP via `Classe`) + 13 routes
(`backend/app/api/seances.py`) + UI "Mes Séances" côté portail enseignant +
page admin `/vie-scolaire/seances`. Aucun chemin d'écriture historique
retiré (`enregistrer_appel`/`sync_presences`/`saisie_presences_batch`
inchangés). Développé et documenté sous le nom `IYA0` (convention demandée
par l'utilisateur, distincte de la numérotation `LOT{0..12}` du chantier
multi-écoles de son collaborateur) sur la branche `IYA`, pas encore
mergée dans `main`.

**Suite directe (même jour, Addendum 4)** : grille horaire configurable —
les créneaux d'emploi du temps étaient codés en dur (blocs fixes d'1h,
pause déjeuner 12h-14h figée) ; l'administrateur peut désormais configurer
librement la durée de chaque créneau (cours de 2h possibles) et la
position/durée/libellé de chaque pause, via une nouvelle modale
"Configurer les horaires" sur `/emploi-du-temps`. Stocké dans
`ParametreEtablissement` (categorie=`EMPLOI_DU_TEMPS`, réutilise les routes
`/api/parametrage/settings` existantes, aucune migration). 4 fichiers
touchés (1 backend, 3 frontend) — détail dans le rapport.

**Suite directe (même jour, Addendum 5)** : signalement utilisateur — taux
"Présence observée" du dashboard admin à 89% alors que testé avec un seul
enseignant sur une seule classe (école de 19 classes), jugé trompeur.
Reproduit sur la base réelle : calcul correct (89% pour CES 2 classes),
mais couverture jamais affichée. Corrigé : `nb_classes_couvertes`/
`nb_seances_comptabilisees` ajoutés au KPI, légende de couverture
permanente sous le pourcentage (alerte visuelle si <50% des classes
actives), et le taux ne pèse plus seul sur le badge "état global"/les
alertes tant que la couverture est insuffisante (`couvertureSuffisante()`,
seuil 50%). 3 fichiers touchés (`dashboard.py`, `schemas.py`,
`dashboard/page.tsx`).

**État vérifié à date** : suite backend **508 passed, 10 skipped, 0
échec** (Docker Python 3.12), frontend `tsc --noEmit` propre + **102/102**
Vitest, plus des vérifications fonctionnelles directes contre la base
réelle locale : grille horaire (défaut + config personnalisée avec cours
de 2h, confirmé un seul bloc) ET couverture KPI présence (2/19 classes, 2
séances — mêmes chiffres que le signalement). Reste ouvert : validation
manuelle navigateur (aucun outil d'automatisation disponible cette
session), Phase 2 explicitement différée pour les séances (support offline
de l'appel, dashboard/stats, workflow `REPORTEE` complet — voir le
rapport).

## Tâche précédente — Service Worker Offline-First (Serwist, remplace next-pwa) (09/08/2026) — TERMINÉE, voir historique ci-dessous
Nouvelle spécification détaillée fournie par l'utilisateur pour étendre
l'offline-first à ~10 modules (classification de risque Niveau A/B/C :
paiements/comptabilité/utilisateurs traités à part, jamais un blocage
aveugle module entier). Vu l'ampleur, passage en Plan Mode : investigation
directe (agent Explore + lecture de code) de l'architecture Phase 1
existante, cadrage avec l'utilisateur (AskUserQuestion) — scope retenu pour
cette session : **Service Worker (Serwist) uniquement**, tous les modules
critiques (paiements/comptabilité/utilisateurs/permissions) **reportés
entièrement** à une session future dédiée.

### 1. Remplacement de next-pwa par @serwist/next
Root cause déjà diagnostiquée par le développeur précédent (voir Historique
ci-dessous) : `next-pwa` ne génère aucun `sw.js` sous Turbopack. Remplacé
par `@serwist/next` 9.5.12 (successeur maintenu, mécanisme équivalent :
webpack génère `public/sw.js` via `swSrc`/`swDest`) — écarté
`@serwist/turbopack` (mécanisme récent/expérimental, backporté en attendant
Serwist 10, nouveau système de route handler) au profit de la voie stable.
Contrainte acceptée : le Service Worker n'est généré qu'au build (`next
build --webpack`, nouveau script `package.json`) — `next dev` reste sous
Turbopack, aucun changement du poste de développement quotidien (le SW
était déjà désactivé en dev par défaut).

### 2. Bug CSS bloquant le build --webpack, trouvé et corrigé
`portail-eleve.module.css` déclarait `:root { --bg-main: ...; }`
directement dans un CSS Module — invalide pour le loader CSS Modules de
webpack (déjà repéré par le développeur précédent comme bloquant
`--webpack`, jamais corrigé). Une première tentative (`:global(:root)`) a
aussi échoué (sélecteur "pas pur" : aucune classe locale). Fix définitif :
les variables déplacées dans une vraie feuille globale
`portail-eleve-theme.css` (pas un CSS Module), importée une fois depuis
`page.tsx` — comportement runtime identique (les variables CSS
s'appliquaient déjà globalement), seul le classement build-tool change.
Seul fichier du projet avec ce pattern (vérifié par recherche exhaustive) ;
aucun autre module.css touché.

### 3. `src/app/sw.ts` — runtimeCaching réécrit, pas `defaultCache`
Les 4 règles `runtimeCaching` de l'ancienne config next-pwa portées à
l'identique (images CacheFirst, style/script/font StaleWhileRevalidate,
navigation NetworkFirst 3s, API GET NetworkFirst 3s) — **volontairement
pas** `defaultCache` fourni par `@serwist/next/worker` (met TOUTES les
routes `/api/*` GET en cache sans distinction, y compris
finance/comptabilité). Ajout d'une règle prioritaire `NetworkOnly` sur
`/api/finance`, `/api/comptabilite`, `/api/auth`, `/api/securite` (vérifiés
par grep des vrais préfixes de routeurs backend) — jamais mises en cache,
cohérent avec la décision déjà actée "comptabilité = connexion requise".
Nouvelle page de repli `/hors-ligne` (`src/app/hors-ligne/page.tsx`,
ajoutée à `FULLSCREEN_PATHS` dans `AppShell.tsx`) précachée manuellement
via `serwist.addToPrecacheList()` (pas via `additionalPrecacheEntries`
côté `next.config.ts`, qui aurait remplacé — pas complété — le scan
automatique de `public/`), servie en fallback quand une navigation échoue
hors-ligne sans version en cache.

### 4. `sw.ts` exclu du tsconfig principal
`ServiceWorkerGlobalScope` (lib "webworker") est incompatible avec la lib
"dom" du reste de l'app dans un même programme TypeScript — `npx tsc
--noEmit` échouait sur ce seul fichier. Ajouté `"src/app/sw.ts"` à
`exclude` dans `tsconfig.json` (le fichier est de toute façon compilé
séparément par le plugin webpack de `@serwist/next`, `compileSrc`) ; `///
<reference lib="webworker" />` conservé en tête du fichier pour l'IDE.

### 5. Deux correctifs sur `AuthContext.logout()` (trouvés en investiguant, hors périmètre SW)
- Purge du Cache Storage (`caches.keys()`/`caches.delete()` sur les caches
  `smartschool-*`) — sans effet avant (le SW ne mettait jamais rien en
  cache), redevient nécessaire maintenant qu'il fonctionne, pour qu'un
  autre utilisateur sur un poste partagé ne récupère pas les réponses API
  du précédent.
- `clearAll()` sur la file offline n'est plus appelé aveuglément : si des
  notes/présences saisies hors-ligne n'ont pas encore été synchronisées au
  moment de la déconnexion, elles restent en base (vérifié `listPending()`
  avant de purger) au lieu d'être perdues silencieusement — contredisait
  directement une règle explicite du cahier des charges fourni. Vérifié
  côté backend (`_enseignant_auth`) que rejouer la file d'un autre
  enseignant sur le même poste échoue proprement en 403 (pas de fuite de
  données) ; résidu accepté : retry indéfini sans plafond (bug préexistant,
  distinct, signalé pour une session dédiée).

### 6. Vérification effectuée
`npx tsc --noEmit` (0 erreur), `npm run test:run` (29/29 tests verts,
aucune régression sur `offlineQueue`/`syncEngine`/`useNotifications`/
`TopbarUserMenu`), `npm run build` (`--webpack`, succès, 66/66 pages
générées, `public/sw.js` généré avec les 4 caches nommés + exclusion des 4
préfixes sensibles + précache de `/hors-ligne` confirmés par inspection du
bundle), serveur de production démarré localement et vérifié au niveau
HTTP (`/sw.js` 200 `application/javascript`, `/hors-ligne` 200 avec le bon
contenu, `/login`/`/`/`/manifest.json`/`/portail-enseignant` toujours 200).

**Limite de vérification assumée** : pas d'outil d'automatisation de
navigateur disponible cette session (comme les sessions précédentes) — le
comportement réel du Service Worker en conditions hors-ligne (Cache
Storage effectivement peuplé, page servie depuis le cache après coupure
réseau, purge des caches au logout visible dans DevTools) n'a PAS été
vérifié dans un vrai navigateur, seulement au niveau HTTP/build. Protocole
de test ajouté à `docs/guides/guide_test_offline.html` (nouvelle étape 8)
pour que l'utilisateur puisse le confirmer lui-même.

### 7. Reprise du chantier (09/08/2026, suite directe) — Étape A stabilisée + plafond de retry (§21)
Nouveau prompt de reprise fourni : audit de l'état réel (confirmé conforme
au rapport ci-dessus via `git status`/`git diff --stat`, rien n'avait
dérivé), puis continuation dans l'ordre demandé (Étape A avant tout nouveau
développement).

**Étape A — validation** : build/tsc/tests re-vérifiés propres (rien n'avait
changé depuis la session précédente, pas de nouveau build complet inutile —
juste re-vérification `tsc` + présence de `public/sw.js` déjà généré).

**§21 — Analyse et correction du plafond de retry**, comme demandé
("analyse d'abord, ne corrige pas aveuglément") :
- **Bug le plus sérieux trouvé en analysant** (pas seulement l'absence de
  plafond signalée précédemment) : `POST /api/sync/{id}/notes` répond
  toujours HTTP 200, même quand un item précis du batch est refusé
  (`resultats: [{statut: "REFUSE", ...}]` — évaluation déjà centralisée,
  trimestre clôturé, note hors périmètre). `flushQueue()` ne lisait jamais
  ce tableau et appelait `markSynced()` sans condition — un refus métier
  disparaissait de la file **silencieusement**, comme s'il avait réussi.
  Corrigé : `extractRefusals()` inspecte `resultats` avant de synchroniser ;
  tout refus bascule l'élément en erreur au lieu de le faire disparaître.
- **Classification retenue** : erreurs réseau (aucune réponse) → inchangé,
  retenté indéfiniment (c'est le comportement correct). Erreurs HTTP
  définitives (401/403/404/422, ou refus embarqué dans un 200 ci-dessus) →
  nouveau statut `ECHEC_DEFINITIF` immédiat, jamais retenté automatiquement
  (retenter un payload identique ne changera pas la décision du serveur).
  Erreurs serveur transitoires (5xx, etc.) → restent `ERREUR`, retentées
  automatiquement jusqu'à `MAX_TENTATIVES = 5`, puis basculent aussi en
  `ECHEC_DEFINITIF`.
- **Jamais de suppression silencieuse** (règle absolue du cahier des
  charges) : `ECHEC_DEFINITIF` reste en base, exclu de `listPending()`
  (donc plus retenté seul) mais visible via `listBlocked()`/`countBlocked()`,
  et rejouable manuellement (`retry()`/`retryBlocked()`/`retryAllBlocked()`).
- **UI** : `SyncStatusIndicator.tsx` affiche désormais un second badge rouge
  distinct "N action(s) requise(s)" quand `blockedCount > 0`, cliquable pour
  relancer tous les éléments bloqués.
- **Fichiers modifiés** : `lib/offlineQueue.ts` (nouveau statut, plafond,
  `listBlocked`/`countBlocked`/`retry`), `lib/syncEngine.ts` (classification
  d'erreurs, détection des refus embarqués, `retryBlocked`/`retryAllBlocked`),
  `components/SyncStatusIndicator.tsx` (badge blocked). **Non touché** :
  `backend/app/api/sync.py` (le fix est côté client, sur l'interprétation de
  la réponse déjà existante — aucun changement de contrat API nécessaire).
- **Tests** : suite étendue de 29 à 41 tests. Le test existant "refus 403 →
  ERREUR" a été **volontairement modifié** (403 est désormais définitif
  immédiatement, pas rejouable) — changement minimal justifié dans le
  commentaire du test lui-même. 8 nouveaux tests couvrent : refus embarqué
  dans un 200 (le bug le plus sérieux), plafond de tentatives atteint,
  erreurs transitoires vs définitives, `retryBlocked`/`retryAllBlocked`,
  isolation `listPending`/`listBlocked`. `tsc --noEmit` propre, build
  `--webpack` propre (66/66 pages).

### 8. Étape B — premier module écrit hors-ligne : Notifications (09/08/2026, suite directe)
Classification réelle faite en lisant le code (pas supposée) : `eleves.py`,
`personnel.py`, `classes.py`, `vie_scolaire.py`, `communication.py`.
Constat clé : étendre la LECTURE offline n'est pas un geste uniforme —
Classes/Élèves/Dashboard l'ont déjà (React Query), mais Personnel est une
page de 57 Ko en fetch direct (vrai refactor, pas un copier-coller).
Question de cadrage posée à l'utilisateur (AskUserQuestion) : "Notifications
(lecture + accusé de lecture)" retenu — le plus petit/sûr des candidats
écriture, opération naturellement idempotente côté serveur, zéro risque
métier.

**Lecture (`READ_ONLY_OFFLINE`)** : `hooks/useNotifications.ts` réécrit sur
`useQuery` (même mécanisme déjà utilisé par `useEleves.ts`/Classes/
Dashboard — cache persisté dans `localStorage` via `QueryProvider.tsx`,
aucune nouvelle infrastructure). Poll 30s repris via `refetchInterval`,
`refetchOnWindowFocus: true` en override du défaut global (remplace l'ancien
listener `visibilitychange` manuel).

**Écriture (`WRITE_OFFLINE_SAFE`)** : `PUT
/api/communication/messages/marquer-tous-lus` passe par la file offline
EXISTANTE (`lib/offlineQueue.ts`/`lib/syncEngine.ts`), pas une nouvelle —
généralisation nécessaire de `OFFLINE_QUEUEABLE` (`lib/api.ts`), qui ne
gérait jusqu'ici qu'un seul pattern POST `/api/sync/{id}/(notes|presences)`
avec id extrait de l'URL. Devenu une table de routes
(`OFFLINE_QUEUEABLE_ROUTES`) supportant POST et PUT, et un id dérivé soit de
l'URL (notes/présences) soit de la session courante (notifications — action
globale, pas d'id dans l'URL). Conséquence en cascade : `OfflineQueueItem`
gagne un champ `method?: 'post'|'put'` (absent = 'post', compatibilité avec
les entrées déjà en file sur un poste réel) et `syncEngine.flushQueue()`
rejoue désormais via `api.request({method, url, data})` au lieu de
`api.post()` en dur. Choix de l'opération conforme à §9 (idempotence) :
`marquer_tous_lus` est un `UPDATE ... WHERE statut='ENVOYE'` — un rejeu ne
fait rien de plus la 2e fois, aucun idempotency-key ni changement backend
nécessaire.

**Tests** : 41 → 50. Nouveau fichier `api.offlineQueueing.test.ts` (6 tests)
— l'intercepteur `mettreEnFileSiHorsLigne` n'avait JAMAIS eu de test dédié
avant (seulement vérifié en E2E backend, Phase 1) ; ajouté maintenant car sa
généralisation touche aussi le chemin notes/présences déjà en prod — une
régression y serait passée inaperçue sans ce test. `useNotifications.test.ts`
adapté (wrapper `QueryClientProvider`, requis dès qu'un hook utilise
`useQuery`) + 3 nouveaux tests (mise à jour optimiste hors-ligne, échec réel
silencieux, absence de token). `tsc --noEmit` propre, build `--webpack`
propre (66/66 pages).

### 9. Étape H (compression) + Étape I (registre ONLINE_ONLY formalisé) (09/08/2026, suite directe)
Après "continue", enchaîné sur les deux items signalés comme rapides/sûrs.

**Étape H** : `backend/main.py` — `GZipMiddleware` (Starlette, déjà dans les
dépendances FastAPI, aucun ajout de paquet) ajouté, `minimum_size=500`
(défaut). Gzip seulement (Brotli demanderait un reverse proxy/CDN devant
l'app — aucun nginx/Caddy/Traefik trouvé dans ce dépôt, hors périmètre).
Compromis assumé et documenté dans le code : les endpoints PDF/photos (déjà
compressés en interne) passent aussi par ce middleware — Starlette ne filtre
pas par Content-Type — coût CPU mineur, pas une erreur de correction ; les
exclure demanderait un middleware sur-mesure pour un gain marginal. Le vrai
bénéfice visé : le JSON des listes (élèves, classes...) sur connexion
instable. Vérifié : `py_compile` propre, import du module `GZipMiddleware`
confirmé résolvable avec la version FastAPI du projet (0.109.0) ; import
complet de `main.py` non testable dans cet environnement (pas de venv du
projet installé ici, et le Python système est en 3.11 — un fichier
préexistant sans rapport, `app/api/activites.py`, utilise une syntaxe
f-string qui nécessite 3.12+ ; non corrigé, hors périmètre, pas causé par ce
changement).

**Étape I** : nouveau fichier `frontend/src/lib/offlinePolicy.ts` — registre
formel `MODULE_POLICY` (un module = préfixes API réels, classification
`read`/`write` parmi `READ_ONLY_OFFLINE`/`WRITE_OFFLINE_SAFE`/
`WRITE_OFFLINE_CONTROLLED`/`ONLINE_ONLY`, `excludeFromServiceWorkerCache`,
justification obligatoire) pour les 8 modules audités cette session
(notes/présences, notifications, classes, élèves, personnel, vie
scolaire/incidents, finance/comptabilité, auth, sécurité/permissions).
**Deux garde-fous vérifiables, pas juste de la doc** :
- `src/app/sw.ts` importe désormais `ONLINE_ONLY_API_PREFIXES` depuis ce
  registre au lieu d'une liste dupliquée en local (source unique).
- `src/tests/offlinePolicy.test.ts` (nouveau, 8 tests) vérifie que
  `OFFLINE_QUEUEABLE_ROUTES` (`lib/api.ts`, désormais exporté) ne contient
  QUE des routes dont le module est explicitement `WRITE_OFFLINE_SAFE`
  (liste blanche — plus strict qu'une simple liste noire des 4 modules les
  plus critiques) : un futur ajout d'une route offline-queueable pour un
  module non classé `WRITE_OFFLINE_SAFE` fait échouer ce test.
Piège trouvé et corrigé PENDANT la construction du registre (pas après) :
première version dérivait `ONLINE_ONLY_API_PREFIXES` directement de
`read === 'ONLINE_ONLY'`, ce qui excluait par erreur finance/comptabilité
(classées `READ_ONLY_OFFLINE` à raison — leur dashboard a un vrai cache
applicatif React Query + Redis serveur, préexistant) du blocage Service
Worker — séparé en un champ dédié `excludeFromServiceWorkerCache`,
indépendant de la classification produit `read`/`write`, trouvé par les
tests eux-mêmes avant tout commit.

**Tests** : 50 → 66 (nouveau fichier `offlinePolicy.test.ts`). `tsc --noEmit`
propre, build `--webpack` propre (66/66 pages), `public/sw.js` généré
vérifié à nouveau (les 4 préfixes sensibles présents via l'import partagé).

### 10. Étape C — Cache intelligent + synchronisation delta, pilote Élèves (09/08/2026, suite directe)
Nouvelle instruction : "le choix est fait, audit d'abord, plan avant tout
code". Passage en Plan Mode : 2 agents Explore en parallèle (frontend —
cartographie React Query/IndexedDB/localStorage/pagination/etablissement_id ;
backend — colonnes updated_at, suppressions, etablissement_id/JWT,
pagination, index, volumes, Redis), plan écrit (existant → problèmes →
options → risques → solution → fichiers → implémentation) et approuvé.

**Constats d'audit clés** (voir le plan pour le détail complet) :
- Seules Note/Presence ont un vrai `updated_at` (ajouté pour `sync.py`,
  jamais exposé en lecture). `Eleve`/`Enseignant` ont un `modified_date`
  mort (jamais assignée, pas de `onupdate`). Suppressions incohérentes :
  hard-delete sur Eleve/Enseignant/Personnel, soft-delete sur Inscription,
  aucune suppression possible sur Classe/Message/Note/Presence.
- `etablissement_id` est figé à `1` dans TOUT le code (frontend ET
  backend) — déploiement mono-établissement de fait, pas dans le JWT.
- Incohérence de purge trouvée : le logout manuel purge Cache Storage +
  file offline conditionnelle, le handler 401 automatique ne touchait
  QUE `localStorage.clear()`.

**Mécanisme retenu** : timestamp (`updated_at`/`since`), pas curseur
opaque ni version incrémentale — c'est déjà le pattern Note/Presence,
zéro nouvelle dépendance, coche les 10 critères posés. `sync_at` généré
par l'horloge de la BASE (`db.query(func.now())`), capturé AVANT les
requêtes de lecture (pas de perte silencieuse d'écriture concurrente).

**Pilote Élèves, volontairement isolé de l'UI existante** — `useEleves.ts`
et `/eleves` ne sont PAS modifiés, le mécanisme est construit et testé de
façon autonome, le brancher dans une vraie page est une extension future :
- Backend : `Eleve.modified_date` gagne `onupdate=func.now()` (1 ligne,
  colonne déjà existante en base, pas d'ALTER TABLE) ; nouvelle table
  `SyncTombstone`/`ss_sync_tombstones` (`entity_type`, `entity_id`,
  `etablissement_id`, `deleted_at`, indexée) — `ss_audit_log` existant
  écarté pour ce rôle (texte libre, pas d'entity_id typé, vérifié en
  lisant le modèle) ; migration `backend/migrations/add_sync_tracking.py`
  (même pattern que les 3 scripts déjà existants) ; nouveau
  `GET /api/eleves/delta?since=&etablissement_id=&annee_id=` (`eleves.py`,
  enregistré avant `/{eleve_id}` — même pattern déjà utilisé par `/count`) ;
  tombstone ajouté dans la même transaction que `DELETE /{eleve_id}`.
  **Limite assumée et documentée** : détecte les modifications du dossier
  élève, pas un changement de classe seul (`Inscription` n'a pas encore de
  suivi — hors périmètre du pilote).
- Frontend : `lib/deltaSync.ts` (nouveau, générique) — persistance du
  curseur dans **une DB IndexedDB séparée** (`smartschool-sync-cache`, pas
  `smartschool-offline`) : vérifié dans le code source d'`idb-keyval` que
  `createStore()` ouvre sans numéro de version, donc ajouter un nouvel
  object store à une base déjà existante sur un poste réel échouerait
  silencieusement — même piège retrouvé une 2e fois en interne (un seul
  object store `kv`, clés préfixées, plutôt que plusieurs stores dans la
  même nouvelle base). `hooks/useElevesDeltaCache.ts` (nouveau, PAS branché
  dans `/eleves`) — miroir local upserté/purgé par delta.
- `lib/sessionCleanup.ts` (nouveau) — extrait la logique de purge
  dupliquée entre logout manuel et handler 401, corrige l'incohérence
  trouvée par l'audit (401 purge désormais aussi Cache Storage + file
  offline conditionnelle + cache delta, comme le logout manuel).

**Vérification** : `tsc --noEmit` propre, suite Vitest 66 → 79 tests
(`deltaSync.test.ts` 7, `useElevesDeltaCache.test.ts` 6), build `--webpack`
propre (66/66 pages). Backend : nouveau `backend/tests/test_eleves_delta.py`
(9 tests, même convention que `test_eleves.py` existant — TestClient,
fixture `db`, SQLite en mémoire) écrit mais **non exécutable dans cette
session** (Python 3.11 système vs 3.12+ requis, `SyntaxError` réelle et
préexistante sur `app/api/activites.py` en important `main.py` — sans
rapport avec ce chantier). Contourné en important `app.api.eleves`
directement (sans passer par `main.py`) : script de vérification jetable
exécutant les 10 scénarios clés (première synchro, delta sans modif, delta
après modif, isolation établissement, suppression → tombstone → deleted_ids,
hard-delete confirmé, isolation des tombstones) — tous passés. Piège trouvé
en le construisant : SQLite `CURRENT_TIMESTAMP` (donc `func.now()` sous ce
dialecte) a une précision à la SECONDE, pas la microseconde comme
PostgreSQL — les tests (script ET `test_eleves_delta.py`) utilisent un
`time.sleep(1.1)` réel entre deux points de comparaison temporelle pour
rester fiables ; documenté en commentaire pour ne pas être "optimisé" plus
tard et réintroduire une flakiness.

### 11. Étape D — Sécurité locale (09/08/2026, suite directe)
Contrôle de cohérence Étape C d'abord (pas de refonte, correct sur tous
les points vérifiés — cache déjà séparé par établissement dans les clés,
purge déjà unifiée). Un vrai bug trouvé au passage : chargement initial de
`useElevesDeltaCache` sans `.catch()` — corrigé (voir §16 ci-dessous).

**Décision de cadrage posée à l'utilisateur** (chiffrement — seul point
réellement ambigu, menace précise à choisir) : "Dérivée du JWT" retenue —
clé jamais stockée à part, dérivée à la volée du token courant (HKDF →
AES-GCM 256). Menace ciblée EXPLICITEMENT documentée dans le code :
protège contre l'inspection d'IndexedDB sans session active (DevTools sur
poste partagé, lecture de fichiers du profil navigateur) ; NE protège PAS
contre du JavaScript malveillant dans l'origine (même accès au token que
l'appli). Appliqué au miroir élèves du pilote (adresse, groupe sanguin,
date de naissance) — PAS à `offlineQueue.ts` (déjà en prod, retrofit
différé pour ne pas risquer de régression sur un mécanisme quotidien).

**Expiration offline** : durée reprise du JWT existant
(`JWT_ACCESS_TOKEN_EXPIRE_MINUTES`), pas une nouvelle valeur inventée —
`lib/sessionExpiry.ts` décode (sans vérifier, jamais une décision de
sécurité) le `exp` pour un signal UI seulement ("Session à renouveler"
dans `SyncStatusIndicator`, visible hors-ligne avec du travail en attente).
Aucune écriture offline bloquée par ce signal — le serveur reste l'unique
autorité (401 déjà géré).

**Invalidation à distance** : investigué, PAS implémenté. `get_current_user`
(`backend/app/core/auth.py`) est un décodage JWT pur, sans requête DB —
désactiver un compte ne révoque pas ses tokens déjà émis (fenêtre
d'exposition : jusqu'à 8h, la durée du token). Modifier ça toucherait la
dépendance d'auth de TOUS les endpoints protégés — trop large pour cette
passe sans cadrage dédié. Proposition minimale documentée pour plus tard :
vérifier `Utilisateur.statut` dans `get_current_user`, mise en cache Redis
courte (réutilise `app/core/cache.py` existant) pour ne pas ajouter une
requête DB à chaque appel.

**Durcissement §16/§17** : `syncEngine.flushQueue` séparée en
`flushQueue`/`flushQueueUnsafe` — une panne IndexedDB ne produit plus un
rejet de promesse non géré (elle est fréquemment appelée en
fire-and-forget). `useElevesDeltaCache` : `.catch()` ajouté au chargement
initial. Nouveau `lib/storageHealth.ts` (`navigator.storage.estimate()`,
détection seuil critique 90%, détection `QuotaExceededError`) — DÉTECTION
seulement, pas encore de politique d'éviction automatique (même report
assumé qu'à l'Étape C, pas de donnée d'usage réelle pour la calibrer).

**Fichiers** : `lib/localEncryption.ts`, `lib/sessionExpiry.ts`,
`lib/storageHealth.ts` (nouveaux) ; `hooks/useElevesDeltaCache.ts`
(chiffrement + `.catch()`), `lib/syncEngine.ts` (durcissement),
`components/SyncStatusIndicator.tsx` (badge session) modifiés. Aucun
module métier touché (élèves/enseignants/comptabilité/notes/présences/UI
intacts, comme demandé).

**Tests** : 79 → **99** (`localEncryption.test.ts` 7 — round-trip réel Web
Crypto, mauvais token → échec propre ; `sessionExpiry.test.ts` 7 ;
`sessionCleanup.test.ts` 6 — isolation multi-compte/multi-école explicite).
Piège de mock trouvé et corrigé pendant l'écriture des tests : un mock
`idb-keyval` avec une seule Map partagée entre "stores" masquait un vrai
bug potentiel (purge du cache delta qui aurait aussi effacé la file
offline) — corrigé en simulant la vraie isolation par base/store.
`tsc` propre, build `--webpack` propre (66/66 pages).

### 12. Étape F — Infrastructure serveur asynchrone : Redis + workers (RQ) (09/08/2026, suite directe)
Audit d'abord, comme exigé ("ne commence pas directement par installer une
librairie") : backend 100% synchrone confirmé (aucun `BackgroundTasks`/
`threading`/`asyncio.create_task` nulle part), un seul Redis déjà en place
(`app/core/cache.py`, cache TTL dashboard finance uniquement), aucune
lib de queue, email/SMS/Excel confirmés **0% implémentés** (pas seulement
non asynchrones — inexistants, variables `AFRICASTALKING_*` mortes dans
`.env.example`). Bug trouvé pendant l'audit, corrigé en prérequis direct
(pas un chantier séparé) : `docker-compose.prod.yml` configurait Redis en
`--maxmemory-policy allkeys-lru` — sous pression mémoire, Redis peut
évincer n'importe quelle clé, y compris les futurs jobs de queue (sans TTL,
contrairement aux clés de cache qui en ont toujours un). Passé à
`volatile-lru` (n'évince que les clés AVEC TTL).

**Techno retenue : RQ (redis-queue) 2.10.0**, pas Celery/Dramatiq/arq/
Streams bruts — comparatif documenté dans le plan approuvé. Raison
principale : le code existant est 100% `def` synchrone, RQ colle
exactement à ce style ("appelle une fonction plus tard") sans nouvelle
dépendance lourde (Celery aurait ajouté un result backend + `beat` +
config de pool pour un besoin de 2 familles de tâches seulement — jugé
disproportionné).

**Pilote choisi** : génération du bulletin PDF (le plus lourd des 4
générateurs reportlab, QR code + tableau dynamique). Seul refactor touchant
du code déjà en prod dans ce chantier, justifié et mécanique : le corps de
`generer_bulletin_pdf` (`evaluations.py`, ~530 lignes mêlant requêtes DB +
dessin + `StreamingResponse`) extrait tel quel dans
`_build_bulletin_pdf_bytes(bulletin_id, db) -> bytes`, la route existante
devient un mince appel + `StreamingResponse` (comportement identique, zéro
ligne de logique changée) ; nouvel endpoint `POST .../pdf-async` (202 +
`task_id`) réutilise la même fonction depuis le worker.

**Isolation multi-école** : le payload transporte `etablissement_id`, mais
`generate_bulletin_pdf_task` (`app/tasks/bulletin_tasks.py`) le
**revérifie** contre la classe réelle en base avant de générer quoi que ce
soit — ne fait jamais confiance au payload (même principe "le serveur
reste l'autorité" que le reste du projet). Vérifié par script direct
(3 scénarios : mauvais établissement → `PermissionError`, bulletin
inexistant → `ValueError`, bon établissement → passe la validation).

**Nouveaux fichiers** : `app/core/task_queue.py` (connexion RQ dédiée,
`decode_responses=False`, séparée de celle du cache), `app/tasks/
bulletin_tasks.py`, `app/api/tasks.py` (`GET /api/tasks/{id}`, statut
générique réutilisable par toute future tâche), `tests/test_task_queue.py`.
**Modifiés** : `requirements.txt` (+`rq`), `evaluations.py` (extraction +
endpoint `pdf-async`), `main.py` (`include_router` + `/health` qui ne
répondait auparavant qu'un statut fixe **sans jamais rien vérifier**,
étendu pour un vrai `SELECT 1` Postgres + `get_redis_client()`),
`docker-compose.prod.yml` (+service `smartschool_worker`, même image que
l'API, scalable via `--scale` sans changement de code, correction
`maxmemory-policy`).

**Découverte Windows importante (corrige une hypothèse du plan)** :
`SpawnWorker` (recommandé par la doc RQ pour Windows/macOS) échoue en
réalité sur ce poste — `os.spawnv()` fonctionne, mais `wait_for_horse()`
(hérité de `Worker`, jamais surchargé par `SpawnWorker`) appelle
`os.wait4()`, inexistant sur Windows quel que soit le cas. Confirmé
empiriquement (`AttributeError: module 'os' has no attribute 'wait4'`).
`SimpleWorker` (exécute le job dans le même process, ni fork ni spawn)
testé et confirmé fonctionnel sur Windows (smoke test `fakeredis` : succès,
échec→`FailedJobRegistry`, retry puis succès — 3/3). Recommandation pour
le dev local Windows : `rq worker --worker-class rq.worker.SimpleWorker
default`. En production (conteneur Linux), le `Worker` standard (fork,
avec heartbeats, déjà configuré dans `docker-compose.prod.yml`) reste le
bon choix — non affecté par cette limitation.

**Tests** : `test_task_queue.py` écrit (mécanique de file contre Redis réel
— recommandation officielle RQ, ne pas mocker Redis — + isolation
multi-école de la tâche bulletin). **Non exécutable dans cette session** :
Docker Desktop confirmé arrêté (`docker info` échoue) → Redis injoignable ;
et indépendamment, `pytest` réel bloqué par le bug préexistant hors
périmètre de `app/api/activites.py` (f-string avec backslash, invalide
avant Python 3.12, ce poste n'a que 3.11) — les deux blocages confirmés
séparément cette session, à exécuter par l'utilisateur
(`docker compose -f docker-compose.dev.yml up -d && pytest
backend/tests/test_task_queue.py`).

**Vérifié réellement** : `py_compile` propre sur tous les fichiers
touchés/créés ; logique d'isolation multi-école validée par script direct
(bypass `main.py`, technique déjà établie) ; mécanique RQ (enqueue/retry/
échec définitif/`FailedJobRegistry`) validée par smoke test personnel
`fakeredis` (jetable, hors suite officielle) ; **zéro régression
frontend** confirmée (`tsc --noEmit` propre, `npm run test:run` 99/99,
`npm run build` 66/66 pages — cette étape est backend-only, aucun fichier
frontend touché).

**Bugs préexistants trouvés, non corrigés (hors périmètre F, enregistrés)** :
`DELETE /api/eleves/{id}` probablement cassé (FK sans CASCADE) ;
`delete_photo` (SQL brut, `photos.py`) ne met pas à jour `modified_date` —
trou dans la synchro delta élèves ; rate limiting `slowapi` en mémoire
locale, non partagé entre les 4 workers uvicorn (limite réellement 4× plus
permissive qu'affichée) — pourrait réutiliser le Redis de cette étape
(`storage_uri`) mais pas fait ici, signalé seulement.

### ⚠️ Reste à faire (modules reportés, actés avec l'utilisateur)
Le nouveau cahier des charges (classification Niveau A/B/C par opération)
couvre l'extension à ~10 modules — élèves, personnel, classes,
notifications, paramètres (Priorité 1-2), et surtout
paiements/comptabilité/utilisateurs/permissions (Priorité 3, stratégie
beaucoup plus stricte : idempotency-key, transaction atomique, conflits
jamais résolus automatiquement). Rien de tout cela n'a été commencé cette
session — reporté entièrement, comme demandé. Bug de retry sans plafond
(§5 ci-dessus, `syncEngine.ts`) également non traité, distinct du
périmètre SW. Étape F (ci-dessus) : câblage réel du service worker en
production (nécessite un vrai déploiement Docker, hors de cette session) ;
extension aux 3 autres générateurs PDF et aux 2 traitements batch finance
une fois le pilote validé en conditions réelles, un par un ; tests de
charge réels (p50/p95/p99, débit) — aucune capacité affirmée sans mesure.

### 13. Étape F — Validation RÉELLE (Redis + Postgres + worker, pas de simulation) (09/08/2026, suite directe)
Le rapport F précédent listait explicitement `test_task_queue.py` comme
"non exécuté cette session" (Docker arrêté). Consigne reçue : ne jamais
traiter ce rapport comme une preuve suffisante — le valider pour de vrai
avant de continuer. Docker Desktop démarré (était éteint), `docker-compose.dev.yml`
lancé : `smartschool_postgres`/`smartschool_redis` existaient déjà depuis le
26/06/2026 (pas des conteneurs neufs — Docker Desktop les avait
auto-redémarrés). Python 3.12+ obtenu sans toucher au poste hôte (toujours
seulement 3.11 dispo) : `Dockerfile.prod` confirme que le projet cible déjà
`python:3.12-slim`, donc `test_task_queue.py` exécuté réellement dans un
conteneur `python:3.12-slim` jetable, réseau partagé avec `smartschool_redis`.

**2 bugs réels trouvés en exécutant réellement les tests (jamais avant)** :
1. `test_retry_puis_succes` échouait à 100% (pas flaky) : le compteur de
   tentatives était un `dict` Python en mémoire (`_ATTEMPT_COUNTER`) — invisible
   entre tentatives car le `Worker` standard (fork, comportement de
   production Linux) exécute CHAQUE tentative dans un process ENFANT séparé
   (`os.fork()`), et une mutation dans l'enfant ne survit jamais au retour
   au parent (copy-on-write). Le mécanisme de retry de RQ lui-même
   fonctionnait correctement (3 tentatives bien effectuées) — c'est le test
   qui ne pouvait structurellement jamais observer un succès. Corrigé :
   compteur déplacé dans Redis (`INCR`), seule ressource réellement partagée
   entre les forks.
2. `job.result` (déprécié dans RQ 2.10, warning vu à l'exécution) remplacé
   par `job.return_value()` — piège trouvé en le faisant : `return_value`
   est une **méthode**, pas une propriété comme l'était `.result` ; un
   premier remplacement naïf (`job.return_value` sans parenthèses) a fait
   régresser 3 tests qui passaient auparavant (comparaison d'une méthode
   liée à une valeur, toujours fausse) — détecté en ré-exécutant réellement,
   pas supposé. Corrigé dans `tests/test_task_queue.py` ET `app/api/tasks.py`
   (usage identique en production).

**Résultat final, réel, reproductible : 6/6 tests passent** contre un vrai
Redis et le vrai `Worker` (fork), pas un mock.

**Validation manuelle de la chaîne complète** (Redis → RQ → Worker → Postgres
→ résultat), demandée explicitement, au-delà de la suite pytest :
fixtures Postgres minimales créées dans un **conteneur Postgres isolé et
jetable dédié** (`localhost:15432`, pas le Postgres dev partagé — son schéma
s'est révélé désynchronisé des modèles actuels, colonne `favicon_url`
manquante sur `ss_etablissements`, aucune migration Alembic réellement
outillée malgré la dépendance présente ; plutôt que de faire un `ALTER
TABLE` sur des données dev inconnues, l'environnement isolé neuf a été
préféré — zéro risque sur l'existant). 6 scénarios exécutés pour de vrai,
avec le vrai code de production (`generate_bulletin_pdf_task`,
`SimpleWorker` pour le dev Windows) :
- **Test 1 (succès)** : PDF réellement généré de bout en bout — 5357 octets,
  en-tête `%PDF` valide, écrit sur disque. Première fois cette session que
  la génération PDF complète (pas seulement la vérification d'isolation en
  amont) est vérifiée avec de vraies données.
- **Test 2 (retry puis succès)**, **Test 3 (échec définitif →
  FailedJobRegistry)**, **Test 6 (job non perdu quand aucun worker n'est
  actif, récupéré au démarrage suivant)** : tous conformes.
- **Test 4 (mauvais établissement)** et **Test 5 (bulletin inexistant)** :
  rejet confirmé (`PermissionError`/`ValueError`, `FailedJobRegistry`) —
  mais a révélé que `Retry(max=3, interval=[10,30,90])` s'applique
  aveuglément à TOUTE exception, y compris ces rejets définitifs qui ne
  réussiront jamais en retentant (~130s avant `FAILED` au lieu
  d'immédiat). **Non corrigé** (pas une régression : le résultat final
  reste correct, juste plus lent que l'idéal) — analysé selon la boucle
  anti-régression demandée : impact réel nul aujourd'hui car le seul
  point d'appel (`generer_bulletin_pdf_async`) transmet toujours la vraie
  valeur d'établissement fraîchement lue en base, donc ce rejet ne peut
  pas se produire en pratique via ce chemin ; corriger demanderait un
  exception handler RQ dédié aux erreurs métier définitives, hors du
  minimum nécessaire. Documenté en commentaire directement dans
  `evaluations.py` à l'endroit de l'enqueue, pas juste dans ce fichier.

**Zéro régression frontend reconfirmée après ces corrections** : `tsc
--noEmit` propre, `npm run test:run` 99/99, `npm run build` 66/66 pages —
étape backend-only, comme F.

**Fichiers modifiés** : `backend/tests/test_task_queue.py` (2 bugs
corrigés), `backend/app/api/tasks.py` (`.return_value()`),
`backend/app/api/evaluations.py` (commentaire de documentation, aucune
ligne de logique changée). **Infrastructure jetable utilisée puis
nettoyée** : conteneurs `python:3.12-slim` et Postgres isolé
(`validation_postgres_etape_f`, port 15432), aucun n'affecte l'état
persistant du dépôt ni les conteneurs dev partagés.

**Étape F est maintenant réellement verrouillée** — plus seulement "écrite
et relue", mais exécutée avec un vrai Redis, un vrai Postgres et le vrai
`Worker` de production (fork), résultats reproductibles.

### 14. Étape G — Monitoring (09/08/2026, suite directe)
Audit d'abord (aucun fichier touché avant présentation du diagnostic,
comme demandé), passé en Plan Mode vu l'ampleur. Constat central : RQ/Redis
exposent déjà presque tout nativement (`Queue.count`, `*Registry.count`,
`Worker.all()`) — pas de nouvelle table, pas de nouvelle structure Redis.

**2 bugs trouvés pendant l'audit, corrigés car ils empêchaient directement
le monitoring de fonctionner (§16 du cahier des charges le permettait
explicitement dans ce cas précis)** :
1. `get_redis_client()` (`app/core/cache.py`, Étape F) a un flag
   "indisponible" **permanent** — une fois Redis tombé une fois, plus
   jamais retenté, même après un vrai retour. Utilisé par `/health`, ça
   aurait affiché "redis: down" indéfiniment après un incident résolu.
   **Non modifié** (usage cache préservé tel quel) — contourné par une
   nouvelle fonction séparée `redis_is_reachable()` (PING réel à chaque
   appel, coût négligeable), utilisée par `/health` et `/api/monitoring`.
   Vérifié réellement contre un vrai conteneur Redis arrêté PUIS
   redémarré (pas simulé) : détection de panne et de reprise confirmées.
2. Le `HEALTHCHECK` de `Dockerfile.prod` (`curl localhost:8500/health`)
   est hérité par `smartschool_worker` (même image) qui ne lance jamais
   uvicorn — ce healthcheck aurait toujours échoué, marquant le worker
   "unhealthy" en permanence. Corrigé par un `healthcheck:` propre à ce
   service dans `docker-compose.prod.yml` (vérifie que CE worker, par
   hostname, est bien inscrit dans Redis — aucune nouvelle dépendance).
   **Vérifié réellement** dans un conteneur jetable : healthy avec un
   worker actif, unhealthy (exit 1) sans worker.

**Nouveau `GET /api/monitoring`** (`app/api/monitoring.py`), réservé aux
rôles admin (`require_roles(*ADMIN_TIER_ROLES)`, même dependency que
finance/personnel) — `/health` reste public et inchangé dans son contrat.
Réponse : statut global OK/WARNING/CRITICAL + raisons explicites,
PostgreSQL (statut + latence), Redis, file (pending/started/finished/
failed/deferred/scheduled), workers (total/idle/busy/noms) — jamais de
compteur fabriqué : si Redis est injoignable, `queue`/`workers` restent
`null`. Seuils de WARNING (profondeur de file, taux d'échec, latence
Postgres) explicitement documentés comme **provisoires**, faute de mesure
de charge réelle. Portée volontairement globale (pas par établissement) :
infrastructure partagée, cohérent avec le mono-tenant actuel.

**Frontend** (décidé avec l'utilisateur, inclus dans cette étape) :
`frontend/src/app/monitoring/page.tsx` — page admin minimale, statut +
compteurs, actualisation toutes les 25s. `lib/roleAccess.ts` étendu
(`/monitoring` ajouté aux 5 rôles admin) — c'est le garde central
(`AuthContext`, déjà utilisé par toutes les autres pages) qui protège
réellement la route, pas la page elle-même. Lien ajouté à la recherche du
`Topbar` (`SEARCH_ITEMS`), visible seulement pour `isAdminSystemRole`.

**2 bugs de méthodologie de test trouvés et corrigés en vérifiant
réellement** (pas des bugs produit) : le premier script de vérification de
`redis_is_reachable()` utilisait `docker run --rm` puis `stop`/`start` sur
le même conteneur — `--rm` supprime le conteneur au premier `stop`, rendant
le `start` suivant sans effet (le test échouait en disant "toujours down"
après redémarrage, alors que Redis n'avait en fait jamais pu redémarrer).
Corrigé (suppression de `--rm`, nettoyage explicite en fin de test) et
reconfirmé : 3/3 scénarios réels (up/down/reprise) passent. Le fichier de
test formel `test_cache_redis_recovery.py` a ensuite échoué une fois
exécuté via le conteneur `python:3.12-slim` jetable (celui-ci partageait
l'espace réseau de `smartschool_redis` pour d'autres tests, incompatible
avec le port publié par le conteneur Redis jetable propre à CE test) —
diagnostiqué comme un artefact de la méthode de vérification imbriquée de
cette session, pas un défaut du correctif (déjà prouvé correct
séparément, sans cette contrainte réseau). Documenté précisément, pas
caché.

**Tests** : `test_monitoring.py` (7 tests) + `test_cache_redis_recovery.py`
(2 tests) nouveaux. **13/13 réellement exécutés et verts** (`test_monitoring.py`
+ `test_task_queue.py`, contre un vrai Redis, dans un conteneur Python 3.12
jetable). `test_cache_redis_recovery.py` : logique du correctif prouvée
séparément (3/3, script direct + vrai Docker), le fichier de test lui-même
non concluant dans cet environnement précis pour la raison réseau
ci-dessus — à ré-exécuter sur un poste/CI avec Python 3.12+ natif et accès
Docker direct (sans l'imbrication de conteneurs de cette session).

**Zéro régression** : backend `py_compile` propre partout. Frontend touché
cette fois (nouvelle page + `roleAccess.ts` + `Topbar.tsx`) — vérifié pour
de vrai : `tsc --noEmit` propre, `npm run test:run` 99 → **102/102**
(3 nouveaux tests monitoring), `npm run build` 66 → **67/67** pages.

**Fichiers créés** : `backend/app/api/monitoring.py`, `backend/tests/test_monitoring.py`,
`backend/tests/test_cache_redis_recovery.py`, `frontend/src/app/monitoring/page.tsx`,
`frontend/src/app/monitoring/Monitoring.module.css`, `frontend/src/tests/monitoring.test.tsx`.
**Modifiés** : `backend/app/core/cache.py` (+`redis_is_reachable()`),
`backend/main.py` (routeur + `/health` utilise la nouvelle fonction),
`docker-compose.prod.yml` (healthcheck worker), `frontend/src/lib/roleAccess.ts`,
`frontend/src/components/Topbar.tsx`. **Non touchés** : `app/core/task_queue.py`,
`app/tasks/bulletin_tasks.py`, `app/api/tasks.py`, `app/api/evaluations.py`,
tout le frontend offline, tous les modules métier, `docker-compose.dev.yml`,
`Dockerfile.prod`.

### 15. Validation préproduction avant pilote (09/08/2026, suite directe)
Mission explicite : auditer et valider que tout le socle A→G fonctionne
ensemble en conditions proches production, corriger le minimum nécessaire,
puis rendre un verdict. Audit d'abord (aucune modification avant d'avoir
présenté les constats), puis tests réels.

**Trouvailles d'audit (documentées, pas toutes corrigées)** :
- Tout le travail de la session (Étapes A→G) est resté **non committé** en
  git jusqu'ici (informatif, pas une action prise sans demande).
- Pas d'Alembic réellement câblé malgré la dépendance présente — seulement
  `Base.metadata.create_all()` (crée, n'altère jamais) + scripts manuels
  ponctuels (`backend/migrations/add_sync_tracking.py`). Chantier futur
  distinct, pas corrigé.
- `secrets/` n'existe pas encore dans le dépôt — prérequis de déploiement
  réel (attendu, pas un bug), 4 fichiers nécessaires
  (`db_password.txt`/`jwt_secret.txt`/`minio_password.txt`/`keycloak_password.txt`).
- Aucun script de sauvegarde PostgreSQL trouvé — risque réel pour des
  données d'école réelles, signalé comme le point le plus important à
  trancher avant le pilote, pas construit unilatéralement (nouvelle
  fonctionnalité, hors du minimum).
- Aucun reverse proxy (nginx/Caddy/Traefik) — attendu (tous les ports
  liés à `127.0.0.1` uniquement dans `docker-compose.prod.yml`), prérequis
  de déploiement, pas un bug.
- `NEXT_PUBLIC_API_URL` : aucun fichier `.env` frontend n'existe, et les
  valeurs de repli codées en dur divergent selon les fichiers (`:8300`,
  `:8000`) — aucune ne correspond au port réel de prod (`:8500`). Sans
  configuration explicite au build, le frontend déployé viserait le
  mauvais port. Prérequis de déploiement à documenter, pas un bug de
  code (comportement de repli fonctionnant comme conçu).
- `.env.example` ne documentait pas `REDIS_URL` (ajoutée en F/G) — **corrigé**
  (1 ligne, cohérence).
- `docker-compose.dev.yml` et `docker-compose.prod.yml` utilisent les
  **mêmes noms de conteneurs** — ne peuvent pas tourner simultanément sur
  le même hôte (rencontré réellement en testant). Signalé, pas corrigé
  (changer les noms toucherait aux deux fichiers pour un besoin de confort
  de développement, pas de correction).

**Rate limiting Redis (§11 de la consigne, audité puis corrigé)** :
`slowapi` était en mémoire locale, seulement sur les 3 endpoints de
connexion (`auth.py`, `portail_eleve.py`, `portail_parent.py`) — avec
`WORKERS=4` (Dockerfile.prod), la protection anti-brute-force réelle
pouvait être jusqu'à 4x plus permissive qu'affichée. **Corrigé** :
`storage_uri=REDIS_URL` + `in_memory_fallback_enabled=True` (retombe sur
le comportement actuel si Redis est indisponible — jamais un échec dur).
Vérifié réellement à trois niveaux : (1) construction sûre même avec Redis
injoignable, (2) fallback fonctionnel (3 requêtes passent, 2 bloquées,
aucune 500), (3) **partage réel confirmé entre deux process Python
distincts** simulant 2 workers uvicorn contre un vrai Redis.

**2 bugs réels trouvés en exécutant pour la première fois la suite
complète des 11 fichiers de test ensemble (jamais fait avant cette
session — chaque étape n'avait lancé que ses propres fichiers)** :
1. **Fuite d'isolation multi-école dans `test_eleves_delta.py`** — pas un
   bug produit : `GET /api/eleves/delta` filtre correctement par
   `etablissement_id`. Le test créait un « autre établissement » dont
   l'id auto-incrémenté valait accidentellement **1** (aucun autre test du
   dépôt ne crée jamais de vraie ligne `Etablissement` — tous utilisent
   `etablissement_id=1` comme un entier nu), collisionnant avec l'école
   « principale » implicite partout ailleurs. Corrigé : `_ensure_etablissement_1()`
   garantit qu'une ligne `Etablissement(id=1)` existe avant de créer
   « l'autre » école, quel que soit l'ordre d'exécution des tests.
2. **RBAC réellement cassé sur `GET /api/presences-agents/historique`** —
   celui-ci n'était protégé que par `get_current_user` (authentification
   seule), pas par `require_roles`, contrairement à ses 3 routeurs
   jumeaux (finance/comptabilité/personnel, déjà corrigés par le passé —
   `tests/test_rbac_modules_sensibles.py` documentait explicitement cet
   historique et attendait ce correctif). Un token ENSEIGNANT, PARENT ou
   ELEVE valide suffisait à consulter l'historique de présence du
   personnel de tout l'établissement. **Corrigé** : `require_roles(*PERSONNEL_ROLES)`,
   même garde que `personnel_router`.

**Suite complète re-exécutée après corrections : 154 passed, 2 skipped
(limite Docker-in-Docker déjà documentée en Étape G), 0 failed.**

**Test réel du démarrage complet de la stack prod-like** (jamais fait
avant cette session) : `docker-compose.prod.yml` construit et démarré
pour de vrai (Postgres + Redis + API + worker, en écartant Elasticsearch/
MinIO/Keycloak/Tesseract — non intégrés au code, confirmé par l'audit).
Secrets et `.env` jetables créés uniquement pour ce test (jamais commités,
supprimés après). Conflit de noms avec les conteneurs dev résolu par un
renommage temporaire (réversible, aucune perte de données) plutôt qu'une
suppression. Résultat : **les 4 services démarrent, communiquent, et
passent `healthy`** — y compris `smartschool_worker` (confirmation en
conditions réelles du correctif B.2 de l'Étape G). `GET /health` et
`GET /api/monitoring` testés avec un vrai JWT généré depuis le secret
réellement chargé par le conteneur — `/api/monitoring` détecte
correctement le vrai worker (`workers.total: 1`). Rate limiting testé en
conditions réelles : 5 tentatives de connexion passent, la 6e est bloquée
(429). Logs API/worker propres, aucune erreur. Stack, volumes et fichiers
jetables entièrement nettoyés après coup — conteneurs dev restaurés à
l'identique.

**Zéro régression** : suite frontend re-vérifiée après les correctifs
backend (aucun fichier frontend touché cette fois) — `tsc` propre,
`npm run test:run` 102/102, `npm run build` 67/67 pages.

**Fichiers modifiés** : `backend/app/core/rate_limit.py`, `.env.example`,
`backend/main.py` (RBAC presence_agent_router), `backend/tests/test_eleves_delta.py`.
**Aucun fichier créé de production** — uniquement des corrections ciblées
et des tests.

## Historique (sous-session précédente) — Remise à zéro des données, corrections post-reset, module Offline-First Phase 1 (05-06/08/2026)
Suite directe de la Phase 5 (même session). Trois volets enchaînés dans
l'ordre où l'utilisateur les a demandés : (1) remise à zéro complète de la
base + reseed 5000 élèves (voir mémoire projet, entrée dédiée), (2) une série
de retours de test après le reset ayant révélé des bugs réels (certains
préexistants, révélés seulement à l'échelle réelle), (3) implémentation du
module Offline-First Phase 1 à partir d'un guide d'architecture fourni par
l'utilisateur, adapté à la stack réelle du projet (pas implémenté tel quel).

### 1. Bugs trouvés et corrigés après le reset (avant le module offline)
- **Page Classes vide** : `classes/page.tsx` avait un `useEffect(..., [])` —
  dépendance manquante sur `anneeId`/`etablissementId`, donc chargeait
  systématiquement `annee_id=1` (valeur par défaut du contexte au premier
  rendu), une année qui n'existait plus après le reset. Corrigé (dépendances
  ajoutées) — même classe de bug que plusieurs autres trouvés ce jour.
- **Tarif créé ≠ facture générée** : comportement voulu, pas un bug — expliqué
  à l'utilisateur (configurer un tarif alimente juste la grille de prix ;
  générer les factures est une action séparée, onglet Factures > "Facturer
  une classe"). Découverte annexe : cet onglet n'avait **aucun lien nulle
  part dans l'UI** (le sous-menu "Frais Scolaires" n'avait pas de
  `subItems`, contrairement à "Salaires et Personnel" qui a le même
  pattern) — corrigé dans `comptabilite/layout.tsx`.
- **KPI "Nouvelles Inscriptions" fantaisiste** : `Math.round(totalCount *
  0.14)`, un placeholder codé en dur jamais remplacé (5000×0.14=700, exactement
  ce que l'utilisateur voyait). Remplacé par un vrai calcul backend
  (`GET /api/eleves/count`, nouveau champ `nouvelles_inscriptions` = compte
  réel des inscriptions `type_inscription=NOUVELLE` de l'année).
- **Factures : 200 affichées au lieu de 263 réelles** : `limit=200` codé en
  dur sur le fetch de `comptabilite/frais` (même pour `/paiements`). Corrigé
  en lisant `X-Total-Count` et en re-fetchant avec le vrai total si besoin —
  jamais de troncature silencieuse, quelle que soit l'échelle.
- **Fiche financière élève à 0/0/0** : `GET /api/finance/solde-eleve/{id}`
  appelé sans `annee_id` depuis `comptabilite/paiements/page.tsx` →
  retombait sur le défaut serveur `annee_id=1`, une année inexistante.
  Corrigé (paramètre ajouté).
- **Comptabilité Auxiliaire — soldes incohérents (le bug le plus sérieux)** :
  deux causes cumulées dans le Grand Livre. (a) `generer_factures_classe`
  (facturation en masse) n'écrivait **aucune écriture comptable**,
  contrairement à `create_facture` (facture unitaire) — les factures issues
  de "Facturer une classe" étaient invisibles du Grand Livre. (b)
  `create_paiement`/`annuler_paiement` taguaient `eleve_id` sur la ligne de
  **trésorerie** en plus de la ligne 4111 (compte élève) — un élève ayant payé
  voyait son "total débité" artificiellement gonflé du montant payé,
  masquant systématiquement toute dette réelle ("Soldé" affiché à tort quel
  que soit le montant facturé). Corrigé dans le code (`finance.py`) **et**
  réparé rétroactivement sur les données déjà générées (263 écritures de
  facturation manquantes recréées, lignes de trésorerie mal taguées
  corrigées, 10 écritures orphelines résiduelles du reset nettoyées).
- **Recherche élève (Rapports Financiers)** : le message "Aucun élève trouvé"
  s'affichait dès la première lettre tapée, **avant même l'envoi de la
  requête** (condition basée sur `searchEleve` non-vide plutôt que sur une
  vraie tentative de recherche). Corrigé avec recherche automatique
  debouncée (300ms) + un flag `hasSearched` distinct.
- **Crash React sur erreurs 422** ("Objects are not valid as a React
  child") : FastAPI renvoie `detail` comme tableau d'objets pour les
  erreurs de validation automatique (pas une string comme pour les
  `HTTPException` levées à la main) — tout le code qui fait
  `showMsg(e.response.data.detail)` plantait. Corrigé une seule fois dans
  l'intercepteur axios partagé (`lib/api.ts`), normalise `detail` en
  chaîne lisible avant que quoi que ce soit d'autre ne le lise.
- **"Je dois recharger après chaque connexion, partout"** — cause racine
  trouvée : `AppContext` (fournit `anneeId` à quasiment toute l'app) ne se
  charge qu'une fois au tout premier montage. `login()` navigue en
  client-side (`router.push`), donc si l'utilisateur arrive sur `/login`
  sans token, l'année réelle n'est jamais chargée sans un vrai rechargement
  navigateur. Corrigé en rendant l'effet de chargement réactif à
  `isAuthenticated` (`useAuth()`) plutôt qu'à une simple lecture
  `localStorage` unique au montage.
- **Page Communication vide + Encaissement/Solvabilité qui "charge sans
  fin"** : deux N+1 catastrophiques à l'échelle réelle (5000 élèves/5033
  parents), invisibles à petite échelle. `GET /api/communication/parents-list`
  : **69 secondes** (dépassait le timeout axios de 30s → la page entière
  restait vide, `Promise.all` rejeté). `GET /api/finance/solvabilite` :
  **20,6 secondes**. Réécrits en préchargement par lot (règle N+1 déjà
  établie sur ce projet) → **1,4s et 0,96s** respectivement. `messages-parents`
  corrigé pareil en passant. `communication/page.tsx` avait aussi le même
  bug de dépendances manquantes que `classes/page.tsx`.
- **Erreur d'hydratation React sur `/dashboard`** : bug que j'ai moi-même
  introduit en convertissant la page à `useQuery` — la branche affichée
  dépendait de `isLoading`, qui vaut `false` (pas `true`) tant qu'une query
  est simplement `enabled: false`, donc le serveur (SSR) et le client
  (premier rendu) affichaient deux arbres DOM différents. Corrigé en
  basculant sur `isError` pour distinguer "pas encore de données" de
  "échec confirmé" — les deux rendus convergent maintenant.

### 2. Module Offline-First — Phase 1 (notes/présences enseignants)
Guide d'architecture générique fourni par l'utilisateur (19 sections :
Service Worker, IndexedDB, Sync Engine, conflits, RabbitMQ, Cloudflare R2,
chiffrement, monitoring...), avec demande explicite de l'**adapter à la
stack réelle** plutôt que de l'implémenter tel quel, et de **tout tester**.
Passage en Plan Mode (audit de stack avant plan, 2 questions de cadrage —
voir `docs/module-offlineFirst.md` pour le guide original et
`docs/guides/guide_test_offline.html` pour le guide de test).

**Décidé avec l'utilisateur** : pas de Cloudflare R2 cette phase (disque
local conservé) ; la saisie hors-ligne démarre par les enseignants
(notes/présences) — la comptabilité reste "connexion requise" (cohérent
avec le §12 du guide et avec les bugs de Grand Livre du point 1 ci-dessus).

**Livré** :
- Migration `updated_at`/`updated_by` sur `Note`/`Presence` (prérequis
  détection de conflit).
- `backend/app/api/sync.py` (nouveau) : `POST /api/sync/{id}/notes` et
  `/presences`, réutilisent la logique métier existante
  (`update_notes_batch_enseignant`/`enregistrer_appel`) mais élément par
  élément avec Last-Write-Wins + signalement de conflit.
- `frontend/src/lib/offlineQueue.ts` (nouveau, `idb-keyval` — installé mais
  jamais branché avant) : file locale persistante.
- `frontend/src/lib/syncEngine.ts` (nouveau) : rejeu automatique au retour
  réseau/premier plan, arrêt propre si le réseau retombe en cours de rejeu,
  poursuite sur refus serveur (pas bloqué par un seul item en échec).
- `lib/api.ts` : intercepteur détecte l'absence réseau sur les endpoints
  `/api/sync/*` et met en file au lieu de rejeter — succès optimiste
  invisible pour l'appelant.
- `components/SyncStatusIndicator.tsx` (🟢🟡🔴) dans le portail enseignant.
- Purge de la file + du cache React Query à la déconnexion
  (`AuthContext.logout`).
- Lecture mise en cache (React Query + persistance déjà montée mais
  quasi-inutilisée, `QueryProvider.tsx`) étendue à Classes, Élèves,
  Dashboard admin — même mécanisme que ce qui règle la fraîcheur des
  données en plus de l'offline.
- 16 tests Vitest (file + moteur de synchro) + 13 vérifications backend
  end-to-end sur données isolées (conflit détecté/résolu, upsert présences,
  refus propre) — tous passés, nettoyage vérifié.

**Trouvé en testant, pas contourné** : `next-pwa` (générateur de Service
Worker) est **incompatible avec Turbopack**, le bundler réellement utilisé
par ce projet (`next build` tourne sous Turbopack par défaut — confirmé).
Aucun `sw.js` n'était donc généré malgré une config `runtimeCaching`
correcte. Le contournement `--webpack` fonctionne pour `next-pwa` mais butte
sur un bug CSS préexistant et sans rapport (`:root` dans un CSS Module de
`portail-eleve`, non corrigé — hors périmètre). **Conséquence** : la saisie
hors-ligne fonctionne intégralement (ne dépend pas du Service Worker), mais
le chargement de l'app avec zéro réseau au tout premier accès ne fonctionne
pas encore. Remplacement prévu : `@serwist/next` (successeur maintenu de
next-pwa, support Turbopack confirmé disponible sur le registre npm) —
non fait, prochaine étape actée avec l'utilisateur.

### ⚠️ Reste à faire (phases restantes du guide offline-first, actées avec l'utilisateur)
Phase 2 (prioritaire) : Service Worker réel via Serwist. Phase 3 : étendre
la saisie hors-ligne aux autres rôles (secrétariat, direction ; comptable
probablement lecture seule vu la sensibilité des montants). Phase 4 : cache
étendu à toutes les données de référence + synchronisation delta (plutôt que
tout retélécharger). Phase 5 : chiffrement IndexedDB (Web Crypto API),
expiration de session hors-ligne, registre d'appareils + effacement à
distance. Phase 6 : média vers Cloudflare R2 (attend les identifiants).
Phase 7 : file d'attente serveur (Redis Streams, déjà présent) + workers
email/SMS/PDF/exports (n'existe pas du tout aujourd'hui, même en
synchrone) ; Redis élargi (sessions/OTP/rate limiting/verrous). Phase 8 :
monitoring du moteur de synchronisation.

## Historique (sous-session précédente) — Refonte clôture d'année / réinscription / tarifs, Phase 5 "Découplage promotion / choix de filière" (05/08/2026)
Retour de test de l'utilisateur sur l'assistant (Phase 4), suivi d'une
spécification détaillée et prescriptive : le choix de filière (SM/SS/SE) des
10e année bloquait l'étape "Promotions" du wizard (`_valider_classe_core`
refusait de valider une classe tant qu'un ADMIS/REDOUBLANT — ce qui incluait
les 10e admis, la frontière Lycée n'étant qu'un flag `necessite_choix_serie`
sur la décision `ADMIS`, pas une décision à part — n'avait pas de
`classe_cible_id` résolue). L'utilisateur juge ce comportement incorrect :
"le choix de la filière ne doit jamais empêcher la validation de la
promotion". 4e passage en Plan Mode de cette session : investigation directe
du code existant + une question de cadrage (AskUserQuestion — réponse "Garder
2 clics séparés (recommandé)", confirmant que "Calculer les résultats" et
"Valider" restent deux actions manuelles distinctes, conforme au principe
"aucun transfert définitif avant validation" déjà acté en Phase 1).

### 1. Nouvelle décision `EN_ATTENTE_FILIERE` — plus un flag, une vraie décision persistée
Root cause : la frontière Collège→Lycée ne produisait qu'un `ADMIS` +
`necessite_choix_serie` (flag recalculé à la volée), jamais un état
persistant indépendamment requêtable. Corrigé (`promotion.py`) : nouvelle
valeur de décision `EN_ATTENTE_FILIERE` (réservée aux 10e admis), calculée
directement à la frontière dans `_calculer_resultats_classe_core` et
`apercu_cloture_classe`. **Deux constantes distinctes remplacent l'ancienne
`DECISIONS_AVEC_SUITE`** (qui mélangeait deux concepts différents) :
`DECISIONS_AVEC_SUITE = (ADMIS, REDOUBLANT, EN_ATTENTE_FILIERE)` (qui entre en
campagne de réinscription à la validation) et
`DECISIONS_NECESSITANT_CLASSE_CIBLE = (ADMIS, REDOUBLANT)` (qui DOIT avoir une
classe cible résolue pour que `valider` accepte la classe —
`EN_ATTENTE_FILIERE` en est explicitement exclu, ne pas avoir de classe cible
étant son état normal à ce stade). C'est ce changement de constante dans
`_valider_classe_core` qui corrige le bug rapporté : un élève 10e admis ne
bloque plus jamais la validation de sa classe.

### 2. Choix de filière déplacé à la réinscription (plus dans le wizard)
`choisir_filiere` (`promotion.py`) : retiré le refus `statut_promotion ==
"VALIDE"` — le choix de filière doit désormais fonctionner justement APRÈS
validation (cas normal, à la réinscription), avec un nouveau refus si la
décision n'est pas `EN_ATTENTE_FILIERE` ou si déjà `REINSCRIT`. Nouvel
endpoint `GET /api/reinscription/en-attente-filiere/{annee_source_id}`
(`reinscription.py`) — liste les 10e admis promus mais sans classe cible
(invisibles de `GET /classe-cible/{id}`, filtré par `classe_cible_id`).
`GET /annee/{id}/etat` (`promotion.py`) gagne un champ `en_attente_filiere`
purement informatif (ne bloque jamais), et `sans_classe_cible` ne compte plus
que les cas réellement bloquants (`DECISIONS_NECESSITANT_CLASSE_CIBLE`).

### 3. Frontend — retrait complet du choix de filière du wizard
`classes/cloture-annee/page.tsx` : sélecteur `<select>` "Série" retiré de la
modale de classe (colonne devenue un simple badge de statut), fonction
`choisirFiliere`/état `niveauxLycee` supprimés (dead code — plus utilisés
nulle part dans ce fichier), `bloqueSerieManquante` et sa simulation de
blocage client sur le bouton "Valider" retirés (le backend ne bloque plus,
pas de raison de le simuler côté client), étape 6 "Choix des filières"
réécrite comme purement informative (compte `etatPromotion.en_attente_filiere`,
lien vers l'étape 7, jamais présentée comme un blocage à résoudre ici).

### 4. Frontend — nouvel onglet "Choix de filière" sur la page réinscription
`comptabilite/reinscription/page.tsx` : nouvel onglet (à côté de "Par
classe"), sélecteur d'année source dédié (`filiereSourceId`, distinct de
`filterAnnee` qui reste l'année cible), liste à plat via le nouvel endpoint
avec un `<select>` SM/SS/SE par ligne appelant `choisir-filiere` — une fois
résolu, l'élève sort de la liste et devient normalement confirmable depuis
l'onglet "Par classe" habituel.

### 5. Vérification effectuée
Sweep annotations différées (415 fonctions, 0 erreur), `npx tsc --noEmit` (0
erreur) sur les deux pages modifiées, test end-to-end sur données 100%
synthétiques (codes `TSTP5-*`, 1 classe 10e/1 élève/1 classe 11e SM cible) —
19 vérifications, toutes passées : `valider` réussit IMMÉDIATEMENT sans choix
de filière préalable (c'était le bug), `decision_fin_annee ==
EN_ATTENTE_FILIERE` et `statut_reinscription == A_REINSCRIRE` après
validation, élève visible dans `/en-attente-filiere` et PAS dans
`/classe-cible` tant que filière non choisie, `choisir-filiere` accepté après
validation (contrairement à avant), classe cible résolue et confirmation de
réinscription fonctionnant normalement une fois la filière choisie (nouvelle
Inscription créée, élève réactivé, effectif incrémenté). Nettoyage complet
vérifié (0 résidu `TSTP5-*`), production confirmée intacte (2801 élèves).
**Limite assumée, comme en Phase 4** : pas d'outil d'automatisation de
navigateur disponible cette session — vérifié uniquement au niveau
backend (appels directs des fonctions endpoint) + `tsc`, pas de clic réel
dans un navigateur sur les deux pages modifiées.

### ⚠️ Reste à faire
Aucune Phase 6 identifiée à ce stade. Reste à confirmer par l'utilisateur :
test interactif réel en navigateur du nouvel onglet "Choix de filière" et du
wizard modifié (étape 6 reformulée, colonne Série retirée).

## Historique (sous-session précédente) — Refonte clôture d'année / réinscription / tarifs, Phase 4 "Assistant de clôture (wizard 10 étapes)" (05/08/2026)
Suite directe de la Phase 3 (même session, "on continue phase 4"). 4e passage
en Plan Mode de cette session : un agent Explore (navigation/patterns UI
existants) + investigation directe (schémas des endpoints déjà construits en
Phases 1-3, connus de première main). Livré : le chrome guidé qui manquait —
toute la mécanique existait déjà, seule l'orchestration visuelle restait à
faire.

### 1. Décision d'architecture : pas de nouvelle page, la page existante DEVIENT l'assistant
Investigation : `classes/cloture-annee/page.tsx` (Phase 2, 459 lignes) avait
déjà une UI riche et testée pour "Calcul des résultats"/"Promotions"/"Choix
des filières" ; `comptabilite/reinscription/page.tsx` (Phase 2) couvrait déjà
"Ouverture de la campagne"/"Génération des frais". **Dupliquer cette UI dans
un nouveau composant aurait créé deux implémentations à maintenir en
parallèle** — risque de désynchronisation supérieur au bénéfice. Décision :
`classes/cloture-annee` **devient** l'assistant complet (même route, contenu
restructuré en 10 étapes avec un nouveau composant `Stepper`) ; la grille de
classes + modale existantes de Phase 2 sont réutilisées TELLES QUELLES comme
"vue détaillée" sous les étapes 4-6. `comptabilite/reinscription` reste une
page dédiée séparée (rôle comptable, usage répété sur plusieurs jours — pas
adapté à un wizard linéaire), reliée par un lien + un statut agrégé.

### 2. Réordonnancement assumé par rapport au cahier des charges littéral
L'étape 6 du cahier des charges ("Création de la nouvelle année") est placée
APRÈS "Calcul des résultats"/"Promotions"/"Choix des filières" (étapes 3-5) —
mais `calculer-resultats` (Phase 2) a besoin de `annee_cible_id` pour résoudre
`classe_cible_id`, donc l'année cible doit déjà exister AVANT le calcul.
**Décision assumée et documentée** : l'assistant réordonne "Création de la
nouvelle année" en position 3 (juste après la clôture comptable), tout en
gardant les 10 libellés d'étapes du cahier des charges intacts.

### 3. Deux nouveaux endpoints d'agrégation (lecture seule)
`GET /api/promotion/annee/{id}/etat` (`promotion.py`) et
`GET /api/reinscription/etat/{annee_cible_id}` (`reinscription.py`) — évitent
que le frontend interroge classe par classe (règle N+1 déjà établie sur ce
projet) pour savoir combien de classes ont leurs résultats calculés/validés,
combien d'élèves sans classe cible (filière non choisie OU classe cible
manquante — même remédiation dans les deux cas), combien de réinscriptions
par statut.

### 4. Nouveau composant `frontend/src/components/Stepper.tsx`
Liste verticale réutilisable, navigation libre (pas de verrouillage
séquentiel côté client — les vraies contraintes restent imposées par le
backend). Statuts dérivés de l'état RÉEL des données (pas d'un état wizard
séparé à synchroniser) : `a_faire`/`en_cours`/`fait`/`attention`, avec une
auto-navigation vers la première étape non terminée au premier chargement
(une seule fois, pour ne jamais faire sauter l'utilisateur pendant sa
navigation manuelle ensuite).

### 5. Limite de vérification assumée et signalée
Contrairement à la routine habituelle de ce projet pour les changements
frontend (test réel au clic dans un navigateur), **je n'ai pas d'outil
d'automatisation de navigateur disponible dans cette session** (pas de
Playwright/capture d'écran) — seulement `WebFetch`, qui ne exécute pas le
JavaScript React côté client. Vérifié à la place : `tsc --noEmit` propre,
sweep backend propre, les 2 nouveaux endpoints testés sur données
synthétiques, et la page chargée via `curl` (200, présence du bundle JS,
aucun marqueur d'erreur Next.js) — ce dernier point ne prouve PAS que
l'interactivité (clics, appels API déclenchés, changement d'étape) fonctionne
réellement. Les deux serveurs de dev (backend :8300, frontend :3300) ont été
laissés démarrés pour que l'utilisateur puisse tester lui-même le parcours
complet dans son navigateur.

### ⚠️ Reste à faire
Aucune Phase 5 identifiée à ce stade — les 11 points du cahier des charges
original sont couverts (Phases 1-4) à l'exception du test interactif réel en
navigateur (point 5 ci-dessus), à faire confirmer par l'utilisateur.

## Historique (sous-session précédente) — Refonte clôture d'année / réinscription / tarifs, Phase 3 "Verrou étendu + centre d'historique réel" (05/08/2026)
Suite directe de la Phase 2 (même session, "on continue phase 3"). Re-passage
en Plan Mode (3e fois cette session) vu l'ampleur restante : 3 agents Explore
en parallèle (un complété normalement, deux read directs faits en complément
manuel pour préciser les schémas exacts), une question de cadrage
(AskUserQuestion, réponse : "Données réelles + verrou d'abord") pour séparer
ce chantier du wizard visuel. Livré cette session : verrouillage étendu à
TOUTES les mutations pédagogiques (pas seulement la comptabilité), transition
réelle vers le statut `ARCHIVEE`, et un vrai centre d'historique remplaçant
les données simulées. **Le wizard visuel guidé 10 étapes reste différé** à une
Phase 4 future — en attendant, l'admin enchaîne manuellement les pages déjà
construites (Phases 1-3, dans l'ordre logique).

### 1. Verrou étendu — relocalisation + généralisation
Root cause trouvée par investigation : `_verifier_annee_modifiable` (Phase 1)
ne gardait QUE `Facture`/`Paiement`/`Depense` — **~15 endpoints dans 4
fichiers** (`evaluations.py`, `portail_enseignant.py`, `vie_scolaire.py`,
`emploi_du_temps.py`) pouvaient créer/modifier `Note`/`Bulletin`/`Presence`/
`CreneauEmploi` sans jamais consulter le statut de l'année — le statut
`ARCHIVEE` (créé en Phase 1) n'était d'ailleurs **jamais atteint par aucun
code**. Corrigé : le garde est relocalisé dans `app/core/annee_lock.py`
(`verifier_annee_modifiable(db, annee_id)`, générique, plus de nom
"finance"-spécifique trompeur) et câblé dans les ~15 endpoints, chacun
résolvant `annee_id` via le chemin le plus direct disponible
(`Classe.annee_id` directement, `Inscription.annee_id`, ou
`CreneauEmploi.annee_id` qui a la colonne en direct). `Incident`
(sanctions disciplinaires) reste **délibérément non verrouillé** — aucune
FK vers une année scolaire précise (juste `eleve_id` + `date_incident`),
pas d'ancrage fiable sans modification de schéma non prévue au cadrage.

### 2. Bugs préexistants trouvés et corrigés en cours de route
- **`GET /api/evaluations/classe/{id}/bulletins`** référençait
  `classe.etablissement_id` (pour les réglages d'affichage bulletin) sans
  **jamais avoir fetché `classe`** — un vrai `NameError` latent, invisible à
  `py_compile`/au sweep d'annotations (qui ne force que l'évaluation des
  annotations, pas l'exécution du corps de fonction), qui n'aurait explosé
  qu'au premier appel réel. Trouvé en branchant la nouvelle page
  `archive/classe/[id]` sur cet endpoint — jamais exercé par du code
  applicatif jusqu'ici (l'ancien onglet Bulletins de cette page était un
  simple lien statique, jamais un vrai appel). Corrigé (fetch + 404 ajoutés).
- `emploi_du_temps.py:create_creneau` avait `annee_id=data.get("annee_id", 1)`
  — même classe de bug que les `annee_id=1` codés en dur corrigés en Phases
  1-2 (source de vérité cliente plutôt que serveur) ; corrigé en dérivant
  `annee_id` de la `Classe` réellement résolue.

### 3. Nouvel endpoint d'archivage
`POST /api/annee-scolaire/{id}/archiver` (`annee_scolaire.py`) — transition
`CLOTURE_COMPTABLE → ARCHIVEE` uniquement. Comme le verrou traite déjà les
deux statuts de façon identique, cette transition est sémantique ("année
définitivement classée") plutôt qu'un niveau de verrouillage technique
supplémentaire.

### 4. Centre d'historique réel
Deux nouveaux endpoints (`eleves.py`) : `GET /{eleve_id}/inscriptions`
(historique complet multi-années, remplace le tableau `inscriptions` **codé
en dur** trouvé dans `archive/eleve/[id]/page.tsx` — commentaire explicite
"For demonstration, we simulate...") et `GET /{eleve_id}/dossier/{inscription_id}`
(bulletins + résumé présence + incidents pour UNE année, alimente les onglets
Bulletins/Discipline précédemment 100% statiques). Frontend : les deux pages
`/archive/eleve/[id]` et `/archive/classe/[id]` branchées sur des données
réelles (bulletins via l'endpoint existant `GET /classe/{id}/bulletins` avec
sélecteur de trimestre, présences résumées côté client depuis l'endpoint
existant). **Téléchargement PDF corrigé au passage** : un lien `<a href>` brut
vers l'endpoint PDF (protégé par JWT) aurait échoué en 401 au clic — remplacé
par le pattern établi ailleurs dans le projet (`api.get(url, {responseType:
'blob'})` + lien objet créé côté client, cohérent avec
`centre-evaluation/page.tsx`).

### 5. Vérification effectuée
Sweep annotations différées (412 fonctions, 0 erreur — mais rappel : ce sweep
n'aurait PAS trouvé le bug `classe` non défini du point 2, seul un test réel
l'a révélé), `npx tsc --noEmit` (0 erreur), test end-to-end sur données
synthétiques (2 années, 1 élève avec 2 inscriptions, trimestre/bulletin/
présences/incident) couvrant : clôture comptable → refus d'archiver une année
non clôturée → archivage réussi → 403 sur un échantillon représentatif des 4
patterns de verrouillage (Classe.annee_id direct, Inscription.annee_id via
data, Inscription.annee_id via 1er élément de lot, CreneauEmploi.annee_id
direct) → confirmation qu'aucune donnée n'est committée lors d'un rejet →
confirmation qu'une année EN_COURS reste normalement modifiable → historique
multi-années et dossier annuel corrects. Nettoyage complet réussi, production
confirmée intacte (2801 élèves, année 1 `EN_COURS`, 0 facture/paiement).

### ⚠️ Reste à faire — Phase 4 (session future, PAS commencée)
Wizard visuel guidé en 10 étapes (chrome UI qui enchaîne dans l'ordre les
endpoints déjà construits en Phases 1-3). Nécessitera un nouveau composant
Stepper/wizard côté frontend — aucun composant de ce type n'existe
actuellement dans `frontend/src/components/` (vérifié Phase 3).

## Historique (sous-session précédente) — Refonte clôture d'année / réinscription / tarifs, Phase 2 "Résultats, Promotion V2, Réinscription V2" (05/08/2026)
Suite directe de la Phase 1 (même session utilisateur, "ok go on" puis "go on").
Vu l'ampleur du reste du cahier des charges (résultats/promotion/réinscription/
frais/archivage/historique/wizard), re-passage en Plan Mode : investigation
directe du code (un agent Explore lancé en parallèle a été interrompu par une
limite de session API — complété manuellement via Read/Grep), une question de
cadrage (AskUserQuestion, réponse : "Fondations d'abord") pour sous-découper
encore la Phase 2, plan écrit et approuvé. Livré cette session : moteur de
résultats, promotion V2 (proposition/validation séparée), réinscription V2 (5
statuts, indépendante). **Différé à une Phase 3 future** (non commencée) : le
wizard visuel 10 étapes et l'archivage réel/historique (pages `/archive`
toujours simulées).

### 1. Modèle de données — 5 nouvelles colonnes sur `Inscription`
`total_points`, `niveau_cible_id`, `classe_cible_id`, `statut_promotion`
(`PROPOSE`|`VALIDE`), `statut_reinscription` (`A_REINSCRIRE`|`REINSCRIT`|
`NON_REINSCRIT`|`TRANSFERE`|`ABANDON`) — toutes nullable, vivent sur
l'inscription de l'année QUI SE TERMINE (portent "la proposition pour l'an
prochain" jusqu'à ce que la réinscription la matérialise). **Piège rencontré
et corrigé immédiatement** : `classe_cible_id` étant une 2e FK `Inscription →
Classe`, la relation existante `Classe.inscriptions`/`Inscription.classe`
(sans `foreign_keys` explicite) est devenue ambiguë
(`AmbiguousForeignKeysError` au premier `db.query()`, détecté dès le premier
test) — corrigé en ajoutant `foreign_keys=` explicite des deux côtés de la
relation. **Leçon générale pour ce projet** : ajouter une 2e FK entre deux
tables déjà reliées par un `relationship()` SQLAlchemy casse silencieusement
ce relationship tant qu'on ne teste pas une vraie requête ORM — `py_compile`/
`import main` ne le détectent pas, seul un `db.query()` réel le révèle.

### 2. Moteur de résultats (extension de `promotion.py`)
`_resultats_annuels_bulk()` remplace `_moyenne_annuelle()` (V1, une simple
moyenne des `Bulletin.moyenne_generale` par trimestre, sans total de points) :
agrège les `BulletinLigne` (déjà produites par `calculer_moyennes`,
`evaluations.py`) par matière sur tous les trimestres, pondère par
coefficient → `total_points = Σ(moyenne matière annuelle × coefficient)`,
`moyenne = total_points / Σcoefficients` — plus rigoureux que l'ancienne
moyenne simple. Rang annuel enfin écrit dans `Inscription.rang_final`
(colonne présente depuis toujours, jamais utilisée avant cette session,
confirmé par grep exhaustif lors de l'investigation). Décision `PROMU`→
`ADMIS` (aligné sur le vocabulaire exact du cahier des charges : Admis/
Redouble/Exclu/Diplômé) + nouvelle valeur `EXCLU`, **toujours un override
manuel** (`PUT /api/promotion/eleve/{id}/decision`), jamais calculée
automatiquement — décision actée dès la Phase 1.

### 3. Promotion V2 — proposition puis validation explicite
Root cause de l'ancien système (`promotion.py` V1, session précédente) :
`POST /classe/{id}/executer` créait IMMÉDIATEMENT et DÉFINITIVEMENT la
nouvelle `Inscription` + désactivait les élèves, sans étape de validation
séparée, et la frontière Collège→Lycée (10e année) n'avait qu'un flag calculé
à la volée (`necessite_choix_serie`), jamais un statut persistant "en attente
de filière" consultable indépendamment. Nouveau flux :
`POST /classe/{id}/calculer-resultats` (+ `/annee/{id}/calculer-resultats-tout`
bulk, leçon retenue du bug "0 élève migré" de la session précédente : le bulk
existe dès le départ cette fois) calcule et PERSISTE la proposition
(`statut_promotion=PROPOSE`) sans jamais créer d'Inscription ; ajustements
manuels via `PUT /eleve/{id}/decision` (override, notamment EXCLU) et
`PUT /eleve/{id}/choisir-filiere` (résout automatiquement la classe cible une
fois la série choisie) ; `POST /classe/{id}/valider` (+ `/annee/{id}/valider-tout`)
verrouille définitivement (`statut_promotion=VALIDE`, refuse si un
ADMIS/REDOUBLANT n'a toujours pas de classe cible), désactive les comptes
élèves (comportement déjà existant, juste déplacé ici) et ouvre la campagne
de réinscription (`statut_reinscription=A_REINSCRIRE` pour ADMIS/REDOUBLANT
seulement). Les anciens `executer`/`executer-tout` sont retirés.

### 4. Réinscription V2 — nouveau routeur indépendant `app/api/reinscription.py`
L'ancien système (`GET /api/eleves/reinscription/classe/{id}` +
`PUT /{id}/reactiver`) dépendait ENTIÈREMENT du fait que la promotion ait
DÉJÀ créé la nouvelle Inscription à la clôture — pas indépendant comme
demandé, et la génération des frais de réinscription était un geste
totalement manuel et déconnecté (le comptable devait aller sur Frais
Scolaires générer lui-même la facture). Nouveau système : pilote uniquement
`Inscription.statut_reinscription` sur les inscriptions déjà
`statut_promotion=VALIDE`. `POST /{id}/confirmer` est le SEUL endroit qui
matérialise l'année suivante — crée la nouvelle `Inscription`, réactive
l'élève, ET génère automatiquement les frais obligatoires (lecture
`TarifClasse` de la classe cible, jamais un montant client, cohérent avec la
correction Phase 1 de `generer_factures_classe`) dans la même transaction.
**Décision assumée, différente de l'ancien système** : le paiement n'est plus
une précondition à la confirmation (l'ancien système bloquait la réactivation
tant que la facture n'était pas soldée) — confirmer facture immédiatement,
le paiement suit ensuite le circuit normal (Encaissement). `PUT /{id}/statut`
gère les 3 statuts terminaux (NON_REINSCRIT/TRANSFERE/ABANDON), aucun effet
de bord.

### 5. Bug préexistant corrigé au passage (retrofit, dans le même helper)
`POST /api/eleves/inscription-complete` (inscription d'un nouvel élève,
`eleves.py`) avait `annee_id=1` codé en dur, ne peuplait jamais
`Facture.annee_id` (ajouté en Phase 1), et ne validait pas le montant envoyé
contre `TarifClasse` — les 3 mêmes classes de bugs déjà corrigées en Phase 1
pour `generer_factures_classe`, mais ce site d'appel avait été manqué.
**Écart assumé par rapport au plan approuvé** : le plan prévoyait de réutiliser
`_generer_frais_reinscription` "tel quel" ici, mais implémenter cela aurait
supprimé la capacité existante (et voulue) du formulaire `/eleves/nouveau` de
laisser l'admin sélectionner librement les frais facultatifs (cantine, etc.)
à l'inscription — une régression réelle sur une fonctionnalité déjà
documentée comme délibérée (voir entrée mémoire "reset scolarité" du
03/08/2026 : "le formulaire d'inscription élève gère DÉJÀ correctement
l'adhésion par frais"). Corrigé différemment : gardé la boucle de sélection
client existante, mais validé chaque montant contre `TarifClasse` (400 si
incohérent, comme `generer_factures_classe`) plutôt que de faire confiance
au client, plus `annee_id`/`Facture.annee_id` corrigés et garde
`_verifier_annee_modifiable` ajoutée. Frontend (`eleves/nouveau/page.tsx`)
mis à jour pour envoyer le vrai `anneeId` du contexte au lieu de rien
(retombait sur le défaut serveur `1`).

### 6. Frontend (intégration minimale, pas le wizard — Phase 3)
`classes/cloture-annee/page.tsx` reconstruite : "Calculer les résultats"
(par classe + bulk) → tableau de revue (moyenne/points/rang/décision, action
"Exclure" par ligne, sélection de filière avec résolution immédiate) →
"Valider" (par classe + bulk), badge "Classe déjà validée" une fois fait.
`comptabilite/reinscription/page.tsx` reconstruite contre `/api/reinscription/
*` : 5 statuts avec badges dédiés, bouton "Confirmer" + "Transféré"/"Abandon"/
"Non réinscrit", affichage informatif du statut de paiement une fois réinscrit
(non bloquant, cohérent avec la décision du point 4).

### 7. Vérification effectuée
**Piège de relation SQLAlchemy trouvé et corrigé en cours de route** (voir
point 1) — trouvé au premier test réel, pas par le sweep d'annotations
(qui ne teste jamais de vraie requête ORM). Sweep annotations différées
Python 3.14 (410 fonctions, 0 erreur), `npx tsc --noEmit` (0 erreur), test
end-to-end complet sur données 100% synthétiques (3 élèves : promotion
linéaire normale, override EXCLU, frontière filière avec blocage de
validation puis déblocage après choix de série) couvrant tout le cycle
calculer→ajuster→valider→confirmer réinscription→génération de frais, plus
les cas négatifs (EXCLU ne peut jamais être confirmé, ABANDON ne crée aucune
Inscription). Nettoyage complet vérifié après coup (réussi du premier coup
cette fois, contrairement à Phase 1) ; vraie base (2801 élèves, année 1
`EN_COURS`, 0 facture/paiement) confirmée intacte après coup.

### ⚠️ Reste à faire — Phase 3 (session future, PAS commencée)
Wizard visuel guidé en 10 étapes (chrome UI liant les étapes déjà construites
en Phase 1 et Phase 2) et archivage automatique réel + centre d'historique
(remplacement des pages `/archive/*` — `archive/eleve/[id]/page.tsx` a
toujours des données d'inscription **codées en dur**, confirmé par relecture
directe cette session).

## Historique (sous-session précédente) — Refonte clôture d'année / réinscription / tarifs, Phase 1 "Fondations" (04/08/2026)
Demande explicite et prescriptive de l'utilisateur : repartir sur une architecture
propre pour la clôture d'année scolaire / réinscription / ouverture de nouvelle année
(spécification en 11 points + wizard guidé 10 étapes). Vu l'ampleur (suppression de
toute la logique existante + refonte complète demandée), passage en Plan Mode : 3
agents Explore en parallèle, 3 questions de cadrage (AskUserQuestion), plan écrit et
approuvé (`C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`). **Décision de
phasage actée avec l'utilisateur** : cette session livre uniquement le socle (Phase
1 — "Fondations"), PAS le wizard complet ni la V2 de promotion/réinscription (Phase
2, session future). `promotion.py`, `classes/cloture-annee`, `comptabilite/
reinscription` (construits lors de sessions précédentes) sont donc restés
**intacts et pleinement fonctionnels** — pas de trou dans les capacités existantes
en attendant leurs remplaçants Phase 2.

### 1. Modèle de données unifié — `AnneeScolaire` remplace `ExerciceComptable`
Root cause identifiée par investigation (Explore) : deux notions d'« année »
totalement déconnectées — `AnneeScolaire` (pédagogique) et `ExerciceComptable`
(juste un champ statut OUVERT/CLOTURE, jamais relié à `Facture`/`Paiement`). Décision
utilisateur (AskUserQuestion) : fusionner sous `AnneeScolaire`, qui devient l'unique
entité "année" avec un cycle de statuts étendu : `PLANIFIEE` → `EN_COURS` →
`CLOTURE_COMPTABLE` (nouveau) → `ARCHIVEE` (réservé Phase 2). Ajouté
`AnneeScolaire.date_cloture_comptable` (Date, nullable). `ExerciceComptable` reste
en base (table NON droppée, prudence sur données réelles) mais son seul rôle actif
restant est l'ancrage fiscal du grand livre général (`EcritureComptable.exercice_id`,
`_get_exercice()` dans `comptabilite.py`) — **investigation en cours de route a
révélé que c'est un système bien plus profond que prévu au moment du plan** (utilisé
par TOUS les rapports comptables SYSCOHADA : bilan, balance, grand livre, journaux)
donc **NON retiré des imports** contrairement à ce que le plan initial prévoyait —
seul l'ancien endpoint de clôture `POST /exercices/{id}/cloturer` (trivial, statut
flip sans aucun verrouillage réel) a été supprimé, car remplacé par le nouveau
mécanisme réel ci-dessous. `GET/POST /exercices` restent car nécessaires au cycle de
vie du grand livre (orthogonal à cette refonte).
- `Facture`/`Paiement` : ajout d'un `annee_id` dénormalisé direct (avant, seulement
  atteignable via `Facture.inscription_id → Inscription.annee_id`) — nécessaire pour
  un verrouillage fiable/performant. Backfillé par migration SQL directe (0 lignes
  affectées : la base a actuellement 0 Facture/Paiement, cohérent avec le reset
  scolarité d'une session précédente). Peuplé pour toute nouvelle facture/paiement
  dans `create_facture`, `generer_factures_classe`, `create_paiement`.

### 2. Vérification pré-clôture + clôture comptable réellement verrouillante
Nouveau routeur `backend/app/api/annee_scolaire.py` :
- `GET /api/annee-scolaire/{id}/verification-cloture` — contrôles BLOQUANT (tous
  les trimestres CLOTURE ; un bulletin PUBLIE par élève actif × trimestre) et
  AVERTISSEMENT (impayés en attente, salaires du mois courant non finalisés) ;
  `peut_cloturer = tous les BLOQUANT passent`.
- `POST /api/annee-scolaire/{id}/cloturer-comptabilite` — ré-exécute la
  vérification (refuse 400 si un BLOQUANT échoue), sinon `statut =
  CLOTURE_COMPTABLE` + `date_cloture_comptable = aujourd'hui`.
- **Verrouillage réel** (nouveau, contrairement à l'ancien système qui ne faisait
  QUE changer un statut sans rien empêcher) : `_verifier_annee_modifiable(db,
  annee_id)` dans `finance.py`, appelé en garde par TOUTE mutation financière —
  `create_facture`, `generer_factures_classe`, `create_paiement`,
  `create_depense`, `approuver_depense`, `changer_statut_depense`,
  `valider_depense`, `annuler_paiement`. Lève 403 si l'année est
  `CLOTURE_COMPTABLE`/`ARCHIVEE`. Toute lecture (GET) reste libre.

### 3. Copie des tarifs entre années + faille de validation corrigée
- `POST /api/finance/tarifs/copier` (`finance.py`) — copie les `TarifClasse` d'une
  année source vers une année cible, classe par classe appariée par `niveau_id`
  (même logique que `preparer_classes_annee` en promotion). Idempotent (un tarif
  déjà présent côté cible n'est jamais écrasé/dupliqué), modes `copier`/
  `copier_editer`/`vide`.
- **Faille corrigée en cours de route** (trouvée par l'investigation initiale, pas
  explicitement demandée mais dans le périmètre "corriger `generer_factures_classe`
  côté serveur") : cette fonction faisait confiance au montant envoyé par le
  frontend SANS jamais le confronter au `TarifClasse` réellement configuré — un
  montant incohérent (erreur ou client tiers) pouvait facturer silencieusement
  toute une classe. Ajouté une validation stricte (400 si le montant envoyé diffère
  du tarif configuré de plus de 0.01).

### 4. Frontend — intégration minimale Phase 1 (pas le wizard complet)
- `comptabilite/rapports/page.tsx` : ancien onglet "Clôture Annuelle" (piloté par
  `ExerciceComptable`, un simple flip de statut sans rapport avec les vraies
  données) entièrement remplacé — affiche maintenant les contrôles BLOQUANT/
  AVERTISSEMENT de la vraie vérification, bouton de clôture actif seulement si
  `peut_cloturer`.
- `parametres/calendrier/page.tsx` : nouveau modal proposant les 3 options de
  reprise des tarifs (reprendre / reprendre-et-modifier / vide), déclenché
  automatiquement juste après la création d'une nouvelle année scolaire.

### 5. Vérification effectuée
Sweep annotations différées Python 3.14 (405 fonctions `app/api/*`, 0 erreur),
`npx tsc --noEmit` frontend (0 erreur), et surtout un test end-to-end complet sur
données 100% synthétiques (année/classe/élève/trimestre/bulletin/tarif/facture/
paiement dédiés, codes `TST-PHASE1*`) couvrant les 2 scénarios clés : (1) blocage
de la clôture tant que trimestre/bulletins incomplets → déblocage une fois
complétés → clôture réussie → 403 sur toute nouvelle facture/paiement après coup ;
(2) copie de tarifs entre deux années de test, idempotence vérifiée (2e appel : 0
copie). **Nettoyage complet vérifié après coup** (script de nettoyage dédié
exécuté deux fois — la 1ère tentative avait échoué sur l'ordre des FK
`EcheanceFacture`→`Facture`, corrigé puis reconfirmé propre) ; la vraie base
(2801 élèves, année 1 `EN_COURS`, 0 facture/paiement — état inchangé) n'a jamais
été touchée.

### ⚠️ Reste à faire — Phase 2 (session future, PAS commencée)
Explicitement différé lors du cadrage avec l'utilisateur : calcul automatique des
résultats scolaires (moyenne/rang/décision), promotions (7e→8e→9e→10e→attente
filière, 11e→12e→Diplômé), cas spécial 10e année (choix SM/SS/SE), nouvelle V2 de
réinscription (statuts À réinscrire/Réinscrit/Non réinscrit/Transféré/Abandon,
indépendante de la promotion), génération des frais à la réinscription effective
(pas à l'ouverture d'année), archivage automatique réel, centre d'historique
consultation lecture seule, et le wizard guidé complet en 10 étapes. Le système
existant (`promotion.py` + pages `classes/cloture-annee`/`comptabilite/
reinscription`) reste la seule voie de clôture/réinscription jusqu'à ce que Phase 2
livre leurs remplaçants — ne pas les supprimer avant.

## Historique (sous-session précédente) — Clôture d'année (migration bulk), sync réglages bulletin, page Réinscription (04/08/2026, suite directe)
Retour de test détaillé après un essai réel de clôture d'année par l'utilisateur (année
cible "test") : activation nécessitant un reload, migration à 0 élève malgré la
clôture, réglages Notation>Affichage sans effet sur le bulletin, et demande d'une
page Réinscription dédiée côté comptabilité.

### 1. Activation d'année nécessitait un reload manuel
`AppContext.anneeId` n'était chargé qu'UNE FOIS au montage de l'app — `activateAnnee`
(Paramètres > Calendrier) rafraîchissait bien SA PROPRE liste locale mais jamais le
contexte global, donc le header/les filtres comptabilité/la page Classes restaient
bloqués sur l'ancienne année jusqu'à un F5. Ajouté `refreshAnnee()` au contexte
(`AppContext.tsx`), appelé après `activateAnnee`.

### 2. Migration "0 élève" — la vraie cause : pas de clôture en masse
Investigation sur la vraie base : l'année test (annee_id=9) avait bien ses 19 classes
clonées (`préparer-classes` fonctionnait) mais **0 inscription** — la clôture n'avait
jamais été exécutée. Cause : l'UI n'offrait qu'un bouton "Exécuter" PAR CLASSE (19
clics requis, page `classes/cloture-annee`), aucun moyen de clôturer toute l'année en
une fois. Ajouté `POST /api/promotion/annee/{source}/executer-tout` (bulk, factorise
la logique via `_executer_cloture_classe_core` partagée avec l'endpoint par classe) +
bouton "Clôturer TOUTES les classes" côté frontend. Testé avec des données isolées
(promotion 7A→8A réussie, ancienne inscription ANNULEE/PROMU, nouvelle ACTIVE,
élève INACTIF, effectif_actuel à jour) — nettoyé après coup, la vraie base (2801
élèves, année 1) n'a PAS été touchée : c'est à l'utilisateur de relancer sa propre
clôture test maintenant que le bouton bulk existe. L'année "test" (annee_id=9,
actuellement active) a été laissée telle quelle — à l'utilisateur de décider quoi
en faire.

### 3. Badge redoublant
`GET /api/classes/{id}/profil` renvoie maintenant `nb_redoublements` par élève
(compte groupé sur `Inscription.decision_fin_annee == 'REDOUBLANT'`, une seule
requête pour toute la classe) — affiché en badge orange "×N" sur la fiche classe.

### 4. Réglages bulletin non synchronisés — cause root trouvée
**Deux pages Paramètres écrivaient dans deux espaces de clés totalement disjoints :**
Notation > Affichage Bulletins écrit `notation.display.*` (categorie NOTATION) ;
Documents > Champs bulletin écrit `documents.champ_*` (categorie DOCUMENTS). Le PDF
ne lisait QUE `documents.champ_*` — aucun des deux ne voyait les réglages de l'autre.
Nouvelle fonction partagée `get_bulletin_display_flags()` (`evaluations.py`) qui
fusionne les deux (`notation.display.*` prioritaire quand présent), appliquée
PARTOUT où un bulletin est rendu : PDF, portail élève (`portail_eleve.py`), portail
parent (`portail_parent.py`), ET la modale HTML de la page admin `/bulletins`
(qui avait exactement le même bug, indépendamment du PDF). Ajouté des toggles
RÉELS pour mention/appréciation/effectif (avant : rendus inconditionnellement dès
que la valeur existait, sans lien avec aucun réglage). Vérifié par génération PDF
réelle avec réglages désactivés puis réactivés + extraction de texte.

### 5. Messages explicatifs du calcul
Ajoutés sur `/notes` (Centralisation) et `/bulletins` (admin) — bannière violette
avec la formule ET les vraies valeurs de pondération actuellement configurées
(fetch `notation.poids_ecrit/oral/composition`), pas un texte figé.

### 6. Pagination — nouveaux points corrigés cette session
- `comptabilite/encaissement` : `searchResults.slice(0, 50)` codé en dur (les
  résultats au-delà de 50 étaient invisibles, pas de moyen d'y accéder) → vraie
  pagination.
- `comptabilite/frais` (onglet Factures), `comptabilite/scolaire` (tableau
  solvabilité, jusqu'à 2800 lignes sans AUCUNE limite) → paginés.
- `comptabilite/rapports` : bug plus grave qu'un défaut de pagination — la
  recherche d'élève téléchargeait les 50 premiers élèves (limite par défaut du
  backend, jamais passée) et filtrait côté client, donc un élève au-delà des 50
  premiers n'était **jamais trouvable**. Corrigé en déléguant la recherche au
  paramètre `search` du backend (déjà supporté, jamais utilisé ici).
- Portail enseignant (Mes Classes / Saisie des notes / Appel) et page Bulletins
  admin (déjà en session précédente) — état partagé par écran, jamais par les
  données SOUMISES (notes/présences restent construites sur la liste complète).

### 7. Nouvelle page : Réinscription (`comptabilite/reinscription`)
Feature demandée en détail par l'utilisateur : après une clôture d'année, les
élèves promus/redoublants ont leur nouvelle inscription créée mais restent
`Eleve.statut='INACTIF'` jusqu'à réinscription physique du parent. Nouveaux
endpoints (`app/api/eleves.py`) :
- `GET /api/eleves/reinscription/classe/{classe_id}` — liste les INACTIF ayant
  une inscription ACTIVE dans cette classe, avec statut de paiement des frais de
  réinscription (`TypeFrais.categorie == "Réinscription"`, code "REIN" — existe
  déjà en base, catégorie confirmée).
  - `PUT /api/eleves/{id}/reactiver` — **modifié** : bloque désormais (400) tant
  que la facture de réinscription n'est pas soldée, sauf `force=true` explicite
  (aucun appelant existant avant cette session, donc aucune régression). Testé
  avec facture impayée (bloqué) puis payée (accepté) sur données isolées.
  Page frontend avec sélecteur de classe, statut Réglé/Non réglé par élève,
  bouton Activer désactivé si non réglé, pagination, lien vers Frais/Encaissement.

### ⚠️ Point non résolu (signalé, pas trouvé)
Coefficients de matière "différents" entre Notation et la page Matières — vérifié
que les deux lisent/écrivent exactement la même colonne (`Matiere.coefficient_defaut`)
via deux endpoints distincts mais équivalents ; aucune désynchronisation trouvée
côté données. Reste possible : cache navigateur, ou l'assistant de déploiement de
matières (`/matieres`, table `PROGRAMME_GUINEEN_UI` codée en dur) qui écraserait
des coefficients personnalisés s'il est ré-exécuté après coup.

## Historique (sous-session précédente) — Bug 422 (annotations différées Python 3.14) + pagination portails enseignant/bulletins (04/08/2026, suite directe)
Retour de test immédiat après la session précédente : la page Centralisation
avait toujours une erreur (plus un timeout cette fois — un 422), plus une
demande de pagination étendue à d'autres écrans à fort volume.

### Bug critique trouvé et corrigé : 422 sur `/api/evaluations/centralisees`
Root cause = piège Python 3.14 documenté en tout début de ce fichier mémoire
(voir section dédiée dans `PROJECT_MEMORY.md`) : `response: Response` utilisé
sans `from fastapi import Response` dans `evaluations.py` — invisible à
`py_compile`/`import main` à cause des annotations différées (PEP 649), n'a
explosé qu'au premier vrai appel. Corrigé (import ajouté) + sweep complet des
395 fonctions de `app/api/*` confirmant qu'aucune autre route n'a ce défaut.

### Deuxième N+1 trouvé en creusant la demande de pagination : `get_bulletins_classe`
Même classe de bug que la session précédente (Centralisation/Familles), pas
encore corrigé jusqu'ici : `GET /api/evaluations/classe/{id}/bulletins`
faisait 1 requête Bulletin + 1 Eleve + 1 BulletinLigne (+1 Matiere PAR ligne)
PAR INSCRIPTION — ~2000+ requêtes pour une classe de 160 élèves. Réécrit en
préchargement par lot, paginé (`skip`/`limit`, `X-Total-Count`), avec 3
nouveaux headers (`X-Moyenne-Classe`, `X-Meilleure-Moyenne`,
`X-Plus-Faible-Moyenne`, ajoutés à `expose_headers` dans `main.py`) pour que
les KPIs de la page restent exacts sur l'ENSEMBLE de la classe même une fois
la liste elle-même paginée. **0,48s pour 162 bulletins (était potentiellement
plusieurs dizaines de secondes, jamais mesuré avant faute de le voir planter).**

### Pagination ajoutée (élèves > 100/classe rendent ceci obligatoire partout)
- Portail enseignant (`portail-enseignant/page.tsx`) : UN SEUL état de
  pagination partagé (`elevesPage`, remis à 1 dans `loadClassEleves`, le point
  d'entrée commun) appliqué aux 3 écrans qui affichent `classEleves` — Mes
  Classes, Saisie des Notes, Appel. Important : les données SOUMISES
  (`notesPayload`, `presences`) restent construites depuis `classEleves`
  ENTIER (pas la page visible) — seul le RENDU est tronqué par page, jamais la
  sauvegarde.
- Page Bulletins (`bulletins/page.tsx`) : pagination serveur + KPIs classe
  entière (voir ci-dessus).
- Recherche texte sur les 3 pages listées ci-dessus (Centralisation, Bulletins)
  : reste côté client, donc limitée à la page actuellement chargée — pas de
  recherche serveur ajoutée cette fois (accepté comme compromis pragmatique,
  le sélecteur de classe reste le filtre principal).

### Investigué, non trouvé — à clarifier avec l'utilisateur
- **Portail parent** : demande de paginer "la liste des élèves pour voir une
  classe" — aucune fonctionnalité de ce type trouvée dans
  `portail-parent/page.tsx` ni côté backend (`portail_parent.py`) ; le portail
  parent ne montre que les enfants du parent connecté (1-3, jamais un effectif
  de classe entière). Peut-être une confusion avec le portail enseignant (déjà
  corrigé) ou une fonctionnalité qui n'existe pas encore — à préciser.
- **Page Bibliothèque** : les listes d'élèves trouvées dans le portail
  personnel par rôle (`personnel/portail/[role]/page.tsx`) sont déjà bornées
  (`limit=120`, avec recherche) pour TOUS les rôles concernés (bibliothécaire,
  vie scolaire, orientation) — aucune liste non bornée trouvée. Si le
  ralentissement persiste, demander l'écran exact (URL/rôle connecté).

## Historique (sous-session précédente) — Perf N+1 (Centralisation/Familles), formule Écrit/Oral/Composition configurable, bulletin PDF enrichi (04/08/2026, suite directe)
Réponse directe au premier retour de test après le seed massif de 2801 élèves : deux
pages complètement cassées par la nouvelle échelle (timeouts), plus une redéfinition
précise de la formule de calcul fournie par l'utilisateur (remplace ma première
implémentation de la session précédente) et un cahier des charges détaillé pour le
bulletin PDF.

### 1. Pages cassées par l'échelle (timeout 30s) — root cause : N+1 systématique
Deux endpoints faisaient littéralement des milliers de requêtes SQL séparées (une
par ligne à afficher) — fonctionnait avec les 21 notes/quelques dizaines de parents
de test d'avant, s'effondre avec les vraies données (998 évaluations, 2753 parents) :
- `GET /api/evaluations/centralisees` (page Centralisation des notes) : 6 requêtes
  PAR évaluation (matière/classe/trimestre/enseignant/nb_notes/moyenne) → ~6000
  requêtes. Réécrit en préchargement par lot (`IN (...)`) + agrégat SQL groupé,
  paginé (`X-Total-Count` + `skip`/`limit`). **0,4s pour 998 évaluations.**
- `GET /api/evaluations/classe/{id}/notes-centralisees` (vue détail classe) ET
  `POST .../calculer-moyennes` : requêtes Evaluation+Note refaites PAR (élève ×
  matière) → jusqu'à 9000 requêtes pour une classe de 160 élèves. Réécrit avec
  préchargement en lot AVANT les boucles (`_precharger_notes()`, une requête pour
  toutes les notes de la classe) — **la fonction `moyenne_matiere_eleve()` ne fait
  plus AUCUNE requête DB**, elle prend un dict déjà chargé. Recalcul complet des
  19 classes × 2 trimestres : **73s (était >15 min)**.
- `GET /api/communication/parents/annuaire` (page Familles, "0 enfants" symptôme) :
  jusqu'à 4 requêtes PAR parent → ~11000 requêtes pour 2753 parents, timeout →
  `catch { setParents([]) }` côté frontend → page vide perçue comme "0 enfants".
  Même traitement (préchargement en lot + pagination) + nouvel endpoint
  `/parents/stats` (agrégats KPI globaux indépendants de la pagination).
- **Leçon pour toute nouvelle vue "liste" future** : ne JAMAIS faire de requête DB
  à l'intérieur d'une boucle sur des lignes à afficher — précharger par lot
  (`.filter(X.in_(ids))`) puis indexer en dict Python. Cette classe de bug est
  invisible avec des données de test (10-50 lignes) et invisible aux tests
  manuels rapides — seulement révélée à l'échelle réelle.
- Bug connexe corrigé au passage : `EleveParent.lien_parente` semé comme
  "Père"/"Mère" (accentué, casse mixte) alors que toute la codebase (formulaire
  `eleves/nouveau`, `LIEN_COLORS`) utilise la convention "PERE"/"MERE" (majuscule
  sans accent) — normalisé en base (2747 lignes corrigées).

### 2. Formule de calcul corrigée — remplace la V1 de la session précédente
L'utilisateur a fourni une spécification précise, différente de ce qui avait été
implémenté : le coefficient de la composition n'est PAS le coefficient de la
matière (ex: Maths=4) — c'est une pondération FIXE et configurable séparément
(défaut 2), strictement indépendante du coefficient matière. Formule officielle :
- Moyenne de matière = (Écrit×W_e + Oral×W_o + Composition×W_c) ÷ (W_e + W_o + W_c),
  défauts W_e=1, W_o=1, W_c=2 — le coefficient de la matière n'intervient PAS ici.
- Moyenne générale = Σ(moyenne matière × coefficient matière) ÷ Σ(coefficients) —
  c'est SEULEMENT à ce niveau que le coefficient de la matière (Maths=4, etc.) agit.
- Si une catégorie n'a aucune note (pas d'oral dans cet établissement), elle est
  exclue et le dénominateur se recalcule sur les catégories restantes — déjà le
  comportement de `moyenne_matiere_eleve()`, inchangé.
- **Configurable** : `get_poids_evaluations()` (`evaluations.py`) lit
  `ss_parametres` catégorie NOTATION, clés `notation.poids_ecrit/poids_oral/
  poids_composition` — nouvelle section dans Paramètres > Notation > Évaluations
  & Poids, avec formule affichée en direct et bouton reset "standard guinéen (1/1/2)".
  L'ANCIEN système "poids_pourcentage doit sommer à 100%" (par type Devoir/Interro/
  etc.) existe toujours pour la gestion des libellés de types mais est maintenant
  clairement étiqueté informatif — **il n'a jamais été branché au calcul réel**,
  ce qui explique la confusion signalée ("135% au lieu de 100%, ne sauvegarde
  jamais correctement") : ce n'était pas un bug de sauvegarde, juste une UI qui
  laissait croire à tort que ce nombre avait un effet sur les moyennes.
- Les 5586 bulletins ont été recalculés et republiés avec la formule corrigée.
- Coefficients de matière : vérifié qu'il n'y a qu'UNE seule source de vérité
  (`Matiere.coefficient_defaut`, lue et écrite identiquement par `/api/matieres`
  et `/api/parametrage/matieres`) — aucune désynchronisation trouvée côté données ;
  si l'utilisateur voit encore une différence, probablement le cache navigateur ou
  l'assistant de déploiement de matières (`/matieres`, table `PROGRAMME_GUINEEN_UI`
  codée en dur) qui réinitialiserait les coefficients personnalisés s'il est
  ré-exécuté — à surveiller si le signalement persiste.

### 3. Bulletin PDF enrichi selon le cahier des charges fourni
`generer_bulletin_pdf()` (`evaluations.py`) — ajouté (le reste du bulletin existant
jugé conforme par l'utilisateur, non retouché) :
- Vrai logo établissement (`Etablissement.logo_url`, remplace le rectangle "LOGO"
  placeholder qui traînait depuis toujours) + vrai cachet (`cachet_url`, tamponné
  en rotation sous la signature du Directeur).
- QR code de vérification (reportlab natif, `reportlab.graphics.barcode.qr` —
  **aucune dépendance pip ajoutée**, l'environnement n'a pas d'accès réseau vers
  PyPI). Encode bulletin_id + matricule + trimestre pour recoupement manuel.
- Photo élève si `Eleve.photo_url` existe (aucun de mes 2801 élèves semés n'en a,
  géré proprement — pas de placeholder cassé).
- Tableau enrichi : colonnes ÉCR/ORAL/COMP (détail des 3 notes, pas seulement la
  moyenne finale — `detail_categories_matiere()`, nouvelle fonction), PTS
  (moyenne×coefficient), ligne TOTAUX (total coefficients / total points).
- Meilleure et plus faible moyenne de la classe (agrégat sur tous les bulletins
  de la classe/trimestre).
- Taux de présence — affiché SEULEMENT si des `Presence` réelles existent pour
  cet élève sur la période (32 lignes dans toute la base actuellement, aucune
  pour mes élèves semés — jamais de taux fabriqué à partir de rien).
- Graphique simple (barres horizontales) des performances par matière, élève vs
  moyenne de classe.
- Formule de calcul affichée dynamiquement (reflète les poids réellement
  configurés, plus un texte figé).
- Nouveau champ `Bulletin.appreciation_generale` (migration SQL appliquée) —
  appréciation du Professeur Principal, retombe sur un texte auto-généré
  (mention) si non saisie manuellement ; pas encore d'écran dédié pour la saisie
  manuelle côté enseignant (à ajouter si l'utilisateur le demande).
- Vérifié par génération réelle + relecture visuelle du PDF (pas seulement
  extraction de texte).

### 4. Pagination — pages à listes longues corrigées
Conformément à la règle explicite ("toutes les pages où il y a une liste, une
longue liste, doivent être paginées") :
- `/familles` : pagination serveur réelle (était déjà paginée mais sur une liste
  entièrement chargée côté client avant troncature).
- `/notes` (Centralisation) : liste des évaluations paginée serveur ; vue détail
  classe (tableau élèves × matières, jusqu'à 162 lignes) paginée côté client.
- `/classes/{id}` (profil classe, onglet Élèves) : paginée côté client.
- `/eleves` : déjà correctement paginée côté serveur (hook `useEleves` existant,
  rien à faire).
- Composant réutilisable `frontend/src/components/Pagination.tsx` (déjà créé la
  session précédente pour la comptabilité) — c'est la référence à réutiliser pour
  toute future liste longue dans l'app.

## Historique (sous-session précédente) — Système de notation guinéen à 3 notes, filtre année comptabilité, seed massif réel (04/08/2026)
Réponse directe à la clarification demandée en fin de session précédente (statut
PUBLIEE/CENTRALISEE) + nouvelle vague de retours de test + demande explicite de
peupler la vraie base avec des données réelles à grande échelle pour stress-tester
le système ("je veux vraiment alourdir mon système pour voir si ça peut résister").

### 1. Bug corrigé : Encaissement bloqué "déjà payé" même après nouvelle facture
Root cause réelle (pas une régression du fix précédent `estReellementSolde`) :
`frais/page.tsx` → `submitFacture()` (génération de factures) n'invalidait que la
clé React Query `['frais-all']`, jamais `['encaissement-solvabilite']` (staleTime
5 min) ni `['impayes']`/`['finance-dashboard']`. Un comptable qui génère une facture
via Frais puis va sur Encaissement voyait donc des données PRÉ-facture pendant
jusqu'à 5 min, déclenchant à tort le message "élève déjà réglé". Corrigé :
`submitFacture` invalide désormais les 3 mêmes clés que `submitPaiement` le fait déjà.

### 2. Bug corrigé : pages comptabilité non filtrées par année scolaire
Root cause : quasiment tous les appels API des pages comptabilité (`encaissement`,
`frais`, `paiements`, `salaires`) avaient `annee_id=1` codé EN DUR dans l'URL, au
lieu de lire l'année courante depuis `AppContext` (`anneeId`, déjà alimenté par
`GET /api/parametrage/annees`). Résultat : après clôture d'une année et activation
d'une nouvelle, ces pages continuaient d'afficher indéfiniment les données de
`annee_id=1`, quelle que soit l'année réellement active — d'où le signalement
"les totaux ne se remettent pas à zéro après clôture".
- Créé `frontend/src/components/AnneeFilter.tsx` (dropdown réutilisable, alimenté
  par `AppContext.annees`, par défaut sur l'année courante).
- Câblé sur **Encaissement, Frais, Impayés, Gestion des Paiements** : filtre
  visible + bannière "année archivée" quand différent de l'année courante ; les
  autres pages (`salaires`) corrigées pour au moins lire `anneeId` du contexte
  au lieu de `1` en dur (déjà correctement dynamique pour `impayes`/`dashboard`).
- Backend : `GET /api/finance/paiements` n'avait AUCUN filtre `annee_id` du tout
  (mélangeait les paiements de toutes les années) → paramètre optionnel ajouté
  (filtre via `Inscription.annee_id`, `None` = comportement inchangé si non fourni).
- Vérifié directement (bypass HTTP, appel de fonction) : `annee_id=1` → 2801
  élèves ; `annee_id=999` (inexistante) → 0 élève. Le filtre est réel, pas cosmétique.

### 3. Système de notation guinéen à 3 notes (écrite/orale/composition) — clarifié
et implémenté selon la description exacte de l'utilisateur
Contexte : signalé précédemment un flou PUBLIEE/CENTRALISEE ; l'utilisateur a
répondu en décrivant le VRAI fonctionnement attendu plutôt que de trancher entre
les deux options proposées — la conception du moteur de calcul devait changer, pas
juste un statut.
- **Règle confirmée par l'utilisateur** : chaque matière/trimestre = exactement 3
  notes officielles (écrite, orale, composition) envoyées à la centralisation.
  L'enseignant peut saisir PLUSIEURS notes brutes dans une catégorie (ex: plusieurs
  devoirs) ; seule la MEILLEURE de chaque catégorie compte (pas leur moyenne).
- **Coefficient uniquement sur la composition** — `coefficient_pour_evaluation()`
  (dupliqué intentionnellement dans `evaluations.py` et `portail_enseignant.py`,
  modules indépendants) : si `TypeEvaluation.code == 'COMPO'`, coefficient =
  celui configuré pour la matière (`ClasseMatiere.coefficient` ou
  `Matiere.coefficient_defaut`) ; sinon coefficient = 1, **quoi que l'enseignant
  saisisse** — appliqué côté serveur dans `create_evaluation` ET `saisir_notes`,
  jamais un choix laissé au frontend.
- **Moteur de calcul réécrit** : `moyenne_matiere_eleve()` (nouvelle fonction
  partagée, `evaluations.py`) regroupe les évaluations centralisées d'un élève par
  catégorie (composition / orale / écrite — cette dernière = tout sauf COMPO/ORAL),
  retient la note la PLUS HAUTE par catégorie, puis moyenne pondérée des 3
  catégories présentes (composition pondérée par le coefficient matière, écrite et
  orale à poids 1 chacune). Remplace la logique dupliquée dans `calculer_moyennes`
  ET `get_notes_centralisees_classe` (les deux utilisaient avant une simple
  moyenne pondérée PAR ÉVALUATION individuelle, sans regroupement par catégorie).
- Vérifié par recalcul manuel indépendant sur un échantillon réel (élève avec
  1 note écrite, 1 absence à l'oral, 1 composition coef 3.0) : moteur et calcul
  manuel donnent 10.94 — MATCH.
- Note explicative du calcul mise à jour (PDF bulletin ReportLab + vue HTML
  portail élève) pour refléter la vraie formule.
- Portail enseignant (`portail-enseignant/page.tsx`, onglet Notes) : bannière
  contextuelle sous le sélecteur de type d'évaluation — explique que le
  coefficient s'applique automatiquement quand le type "Composition" est
  sélectionné, et que la meilleure note est retenue en cas de saisies multiples
  du même type. Pas de nouvelle case à cocher séparée — le sélecteur de type
  existant (qui inclut déjà "Composition") EST le mécanisme demandé.

### 4. Seed massif de données RÉELLES (pas des données de test jetables)
Demande explicite et répétée : "Ce n'est pas un truc de test... tu dois rentrer
dans notre base de données actuelle." Exécuté en 4 scripts séquentiels (supprimés
après exécution, le RÉSULTAT en base est permanent) :
- **Couverture enseignants 100%** : chaque (classe, matière) réellement programmée
  (`ss_classe_matieres`) a désormais un enseignant affecté, plafond 3 matières
  distinctes par enseignant par défaut, réutilisation prioritaire des enseignants
  existants (5 sans affectation + capacité restante des autres) avant création —
  seulement 1 nouvel enseignant créé (11 au total), 158 nouvelles affectations.
- **2801 élèves actifs** (2747 nouveaux + 46 préexistants) répartis sur les 19
  vraies classes (les 4 Collège qui avaient 10-13 élèves ET les 6 Primaire + 9
  Lycée qui en avaient 0), chacune entre 132 et 162 élèves (cible "au moins 100"
  largement dépassée, total ~2800 dans la fourchette 2000-3000 demandée). Chaque
  élève a un parent réel (nom/téléphone/profession, lien père/mère) avec accès
  portail immédiat (mot de passe par défaut du système = "smartschool", même
  mécanisme que pour les élèves — aucun mot de passe à définir manuellement).
- **146 544 notes** créées (996 évaluations : Devoir/Interrogation Orale/
  Composition × chaque matière × chaque classe × T1 et T2), statut CENTRALISEE
  directement (exploitables sans étape de centralisation manuelle), valeurs
  générées avec une "capacité" par élève + bruit réaliste (pas des notes
  uniformes ou aléatoires sans structure).
- **5586 bulletins** calculés (`calculer_moyennes`, la vraie fonction de
  production, pas une réimplémentation) puis **publiés** (`statut='PUBLIE'`,
  requis pour être visibles côté portails élève/parent — sans quoi
  `GET /portail-eleve/{id}/bulletin` renvoie `null` malgré des bulletins bien
  calculés en base).
- **Vérifié en conditions réelles** (serveur backend démarré temporairement,
  arrêté après) : connexion élève (matricule + "smartschool") ✅, connexion
  parent (téléphone + "smartschool") ✅, bulletin visible côté élève avec
  moyennes/rang/mention ✅, génération PDF du bulletin avec la nouvelle formule
  affichée ✅.

### ⚠️ Reste à faire / non traité cette session
- Lier les données d'années clôturées à la page `/archive` existante (explicitement
  différé par l'utilisateur : "qu'on va retravailler plus tard").
- Les 15 classes ARCHIVEE de test/scories restantes en base (`classe_id` 23-32,
  39-42) n'ont pas été touchées (hors périmètre des "19 vraies classes") —
  à nettoyer un jour si l'utilisateur le souhaite, mais actuellement inertes
  (`statut='ARCHIVEE'`, jamais retournées par les listes actives).

## Historique (sous-session précédente) — Module Promotion & Clôture d'année (03/08/2026, suite)
**Démarré à la demande explicite de l'utilisateur** ("tu commences par ça") après
une troisième vague de retours de test le même jour, couvrant plusieurs petits bugs
concrets ET le lancement du plus gros chantier : clôture d'année scolaire + promotion
des élèves (admis/redoublant/transfert/désactivation/réinscription), qui n'existait
pas du tout avant cette session.

### Bugs concrets corrigés
1. **Carte enseignant affichant "ÉLÈVE"** — `BadgeCarte` se base sur `agent.role`
   (absent → défaut "ÉLÈVE"). Le bouton "Voir la Carte" (fiche profil enseignant ET
   listing) passait l'objet brut sans `role`. Corrigé aux deux endroits
   (`enseignants/[id]/page.tsx`, `enseignants/page.tsx`) en injectant
   `role: 'ENSEIGNANT'`, comme le fait déjà la vue grille qui fonctionnait.
2. **Téléchargement de reçu portail parent en échec** — reproduit sans erreur avec
   une facture réelle ; ajouté en prime un vrai bouton de téléchargement de REÇU
   (pas seulement facture) sur chaque paiement de l'historique parent, endpoint déjà
   existant mais jamais exposé côté UI parent.
3. **En-tête "année scolaire" figée** — root cause réelle : DEUX lignes
   `AnneeScolaire` marquées `est_courante='O'` simultanément (`create_annee` ne
   désactivait jamais les autres si créée déjà "courante", contrairement à
   `update_annee`/`activer_annee`). Corrigé côté backend + réactivé `annee_id=1` (qui
   a toutes les vraies données : 19 classes, 2 trimestres, les seules notes
   existantes) au lieu de `annee_id=2` (coquille vide) que j'avais activée par erreur
   la fois précédente avant de comprendre où vivaient les vraies données.
4. **Scan QR lent** — le scanner (`html5-qrcode`) n'était jamais restreint au format
   QR (testait tous les formats de codes-barres à chaque frame) malgré l'import déjà
   présent de `Html5QrcodeSupportedFormats` dans un des deux fichiers scanner ; ajouté
   `formatsToSupport: [QR_CODE]` + contrainte de résolution caméra (720p) aux deux
   scanners (élèves et personnel).
5. **Message "destinataire incorrect"** depuis une fiche enseignant/élève —
   `communication/page.tsx` acheminait TOUJOURS l'envoi via l'endpoint réservé aux
   parents (`/messages-parents`, whitelist stricte), même pour `dest_type=ENSEIGNANT`
   ou `ELEVE`. Corrigé : route vers l'endpoint générique `/messages` (déjà existant,
   sans restriction) pour tout destinataire non-parent.
6. **Élèves "déjà payés" sans aucune facture** (Encaissement) — `total_restant <= 0`
   servait de proxy à "facture soldée", mais c'est aussi vrai pour "aucune facture
   générée" (le cas de TOUS les élèves après le reset scolarité). Distingué via
   `total_facture > 0 && total_restant <= 0`, avec message et affichage
   ("Aucune facture") différents du cas réellement soldé.
7. **Boucle infinie "Maximum update depth exceeded" (Encaissement)** — confirmée
   persistante lors du re-signalement ; le fix précédent (mémoïser `allData`) tenait
   bien, mais le VRAI second passage a permis de confirmer qu'aucune autre
   instabilité ne subsistait dans ce fichier.
8. **Erreur 500 à l'inscription d'un élève** — reproduction exacte du scénario
   décrit (Terminale + scolarité + réinscription + uniforme + parent) directement en
   base réelle : a réussi sans erreur. Cause racine non identifiée faute du texte
   d'erreur exact — **en attente que l'utilisateur l'envoie**.

### 🏗️ Nouveau module : Promotion & Clôture d'année (`backend/app/api/promotion.py`)
Construit et testé de fond en comble (scénarios synthétiques isolés, jamais sur les
vraies données, nettoyage complet vérifié après coup) :
- **Séquence de promotion modélisée** : Primaire (1A→6A, linéaire) → Collège
  (7A→10A, linéaire) → **branchement** vers le Lycée (choix de série SE/SM/SS à la
  sortie de 10A) → linéaire au sein d'une série (11x→12x→Tx, écart d'ordre +3) →
  Terminale = fin de cursus (DIPLOME, aucune classe suivante). `Niveau.ordre` est
  scopé PAR CYCLE (pas global) — confirmé par lecture de la base réelle (19 classes,
  pas 13 comme supposé par l'utilisateur ; le lycée a 3 séries parallèles).
- **Décision admis/redoublant/diplômé** : lit enfin les réglages `notation.
  redoublement_actif.{cycle}` / `notation.seuil_redoublement.{cycle}` (Paramètres >
  Notation) — configurés depuis longtemps mais jusqu'ici jamais consultés par aucun
  code. Moyenne annuelle = moyenne des `Bulletin.moyenne_generale` de tous les
  trimestres de l'année pour l'inscription.
- **`GET /api/promotion/classe/{id}/apercu`** — aperçu lecture seule (décision +
  moyenne par élève, signale les cas nécessitant un choix de série) avant d'exécuter.
- **`POST /api/promotion/classe/{id}/executer`** — transfert réel : nouvelle
  inscription (classe suivante ou même classe si redoublant) sous l'année cible,
  ancienne inscription clôturée avec `decision_fin_annee`/`moyenne_annuelle` renseignés
  (colonnes qui existaient depuis toujours sans jamais être utilisées), désactivation
  systématique de TOUS les élèves de la classe (promus compris) jusqu'à réinscription.
  **Important, corrigé après un premier bug trouvé en testant** : si la classe cible
  n'existe pas encore ou qu'une série Lycée n'a pas été choisie, l'élève concerné est
  laissé INTACT (inscription toujours ACTIVE, pas désactivé) pour pouvoir relancer la
  clôture plus tard sans élève "orphelin" (ancienne inscription annulée sans nouvelle
  créée) — la première version faisait cette erreur, détectée et corrigée avant
  validation finale.
- **`POST /api/promotion/annee/{cible}/preparer-classes`** — clone la structure des
  classes (niveau/code/libellé/capacité, PAS salle ni professeur principal — à
  réassigner consciemment) d'une année source vers l'année cible ; nécessaire car
  `Classe.annee_id` est propre à une année (pas d'entité "classe" persistante entre
  années) — sans ça, aucun élève promu n'aurait de classe où atterrir l'année suivante.
  Idempotent (vérifié par test double-appel).
- **`PUT /api/eleves/{id}/reactiver`** — réactivation par le comptable à la
  réinscription (le paiement des frais de réinscription utilise le mécanisme de
  facturation individuelle déjà construit dans Auxiliaire).
- **Auto-création des trimestres/semestres** (`create_annee`, lit
  `calendrier.mode_decoupage`) et **clôture de trimestre** (`PUT /trimestres/{id}/
  cloturer`, nouveau statut `CLOTURE`, avance automatiquement la période suivante en
  `EN_COURS`, verrouille la création de nouvelles évaluations/notes pour la période
  clôturée) — les deux fondations nécessaires avant même de pouvoir clôturer une année.
- **Frontend** : bouton "Clôturer" par trimestre dans Paramètres > Calendrier ; nouvelle
  page `/classes/cloture-annee` (choix année source/cible, préparation des classes,
  aperçu par classe avec choix de série, exécution) reliée depuis `/classes`.
- **Note explicative du calcul de moyenne** ajoutée sur le bulletin (PDF ReportLab +
  vue HTML portail élève).

### ⚠️ Trouvailles importantes NON corrigées — nécessitent une décision utilisateur
1. **Statut PUBLIEE vs CENTRALISEE (`portail_enseignant.py`, `saisir_notes`)** — le
   flux principal de saisie de notes ("Saisir des notes", `POST /{id}/notes`, appelé
   activement par le frontend) crée les évaluations avec `statut="PUBLIEE"`, mais le
   moteur de calcul des moyennes (`calculer_moyennes`, `evaluations.py`) ne compte QUE
   les évaluations `statut="CENTRALISEE"`. Il existe un endpoint séparé
   `.../centraliser` pour faire cette transition, mais rien n'indique clairement à
   l'enseignant qu'il doit encore cliquer dessus après avoir "sauvegardé" ses notes —
   risque réel que des notes saisies par les enseignants n'apparaissent jamais dans
   les bulletins. **Décision à prendre** : centraliser automatiquement à la sauvegarde
   (perd un éventuel contrôle de relecture), ou rendre le bouton "Centraliser" très
   visible immédiatement après la saisie ?
2. **Réglages Notation configurés mais jamais utilisés dans le calcul** :
   `poids_pourcentage` par type d'évaluation (Devoir/Interro/Composition/Examen — le
   calcul utilise en fait un coefficient libre par évaluation, sans rapport avec ces
   pourcentages), `bareme` par cycle (toujours normalisé sur 20 en interne), `moyenne
   de passage`, `mode de rang` (toujours par classe, jamais par niveau), `système de
   lettres`. Seuls les seuils de mentions, les coefficients par matière, et
   maintenant `redoublement_actif`/`seuil_redoublement` sont réellement branchés.
3. **Couverture des données très faible** (confirmée par requêtes réelles) : 8
   affectations enseignant↔matière↔classe sur 166 nécessaires (4,8%) ; 2 évaluations /
   21 notes dans TOUTE la base (Chimie seulement, trimestre 1 seulement) ; les 9
   classes de Lycée ont 0 élève inscrit (impossible d'y saisir des notes tant qu'aucun
   élève n'y est inscrit) ; 17 des 33 matières n'ont AUCUN enseignant dont la
   spécialité correspond (Anglais, Histoire, Géographie, Philosophie, Économie,
   Biologie, Informatique...). **Semer des données de test réalistes reste à faire** —
   rapport de l'écart exact déjà produit par l'investigation, prêt à être exécuté dès
   que l'utilisateur confirme le périmètre souhaité (les 4 classes collège peuplées
   seulement, ou aussi créer des enseignants fictifs + inscrire des élèves en Lycée ?).

## Historique (sous-session précédente) — Deuxième vague de retours de test réels (03/08/2026, suite directe de la
session précédente le même jour)

L'utilisateur a continué ses tests après le reset scolarité et signalé plusieurs
nouveaux problèmes concrets, plus des questions sur la clôture d'année/passage de
classe (déjà cadrées comme feuille de route, pas encore commencées). Corrigé cette
sous-session :
1. **Boucle infinie "Maximum update depth exceeded" sur Encaissement (persistante)**
   — `allData`/`classes` dans `encaissement/page.tsx` étaient dérivés par
   `initialData?.allData || []` directement dans le corps du rendu : tant que la
   requête React Query est en chargement (`initialData` undefined), cette expression
   recrée un tableau vide à CHAQUE rendu, ce qui déstabilise les `useEffect` qui en
   dépendent (`[searchQuery, filterClasse, allData]` et `[urlEleveId, allData]`) et
   les fait boucler indéfiniment. Corrigé avec `useMemo(() => ..., [initialData])`.
2. **Cantine/frais facultatifs facturés à toute une classe** — déjà traité la
   sous-session précédente (garde-fou `forcer_optionnel` + facturation individuelle
   par élève depuis Auxiliaire).
3. **Élèves "déjà payés" alors qu'aucune facture n'a encore été générée** — même
   fichier `encaissement/page.tsx` : `total_restant <= 0` était utilisé comme proxy
   de "facture intégralement soldée", mais c'est AUSSI vrai quand `total_facture = 0`
   (aucune facture générée). Résultat : après le reset scolarité (tous les élèves à
   0 facture), l'écran affichait "100% payé" et bloquait l'encaissement pour tout le
   monde avec le message trompeur "a déjà réglé l'intégralité de sa scolarité".
   Corrigé : nouvelle condition `estReellementSolde = total_facture > 0 &&
   total_restant <= 0`, message et affichage ("Aucune facture") distincts pour le cas
   "pas encore facturé" vs "réellement soldé". `comptabilite/scolaire/page.tsx` avait
   déjà le bon traitement (badge `AUCUNE_FACTURE` dédié) — seul `encaissement`
   avait le bug.
4. **Message "destinataire incorrect" depuis la fiche enseignant/élève** — les
   boutons "Message" des fiches enseignant (`enseignants/[id]/page.tsx`) et élève
   (`eleves/[id]/page.tsx`) redirigent vers `/communication?dest_type=ENSEIGNANT|
   ELEVE&dest_id=...`, mais `communication/page.tsx` acheminait TOUJOURS l'envoi via
   `POST /api/communication/messages-parents`, qui rejette tout `destinataire_type`
   hors `PARENT/TOUS_PARENTS/CLASSE_PARENTS` (400 "destinataire_type invalide"). Le
   bouton "Message" de la fiche PARENT (`familles/[id]/page.tsx`) fonctionnait
   normalement (envoie bien `dest_type=PARENT`, dans la liste acceptée). Corrigé :
   `handleSendParentMsg` route maintenant vers l'endpoint générique
   `POST /api/communication/messages` (déjà existant, sans restriction de type) pour
   tout destinataire non-parent.
5. **Erreur 500 sur l'inscription complète d'un élève** — reproduction exacte du
   scénario décrit (Terminale, scolarité + frais de réinscription + uniforme,
   parent) tentée directement contre la base réelle : a réussi sans erreur. Cause
   racine non identifiée faute du message d'erreur exact (l'utilisateur a dit
   vouloir l'envoyer séparément) — **à reprendre dès réception du texte d'erreur
   réel**, ne pas deviner davantage sans lui.
6. **Emploi du temps absent pour Joseph Bangourah (Terminale, principal)** —
   vérifié en base : 0 `CreneauEmploi` pour LUI sur SES 3 classes (pas seulement
   Terminale), donc pas lié au nombre d'élèves comme il le supposait.
   `Affectation` (assignation enseignant+matière+classe) et `CreneauEmploi`
   (placement dans une plage horaire réelle) sont deux étapes séparées dans ce
   système — seule la première a été faite pour cet enseignant. Pas un bug : il
   faut compléter son emploi du temps via l'écran dédié.
7. **Portail enseignant "Mes Paiements"** — vérifié : la fonctionnalité existe déjà
   intégralement (backend `GET /{id}/paiements` + `GET /{id}/paiements/{bulletin_id}`
   dans `portail_enseignant.py`, onglet "Mes Paiements" complet dans
   `portail-enseignant/page.tsx` avec état vide explicite). L'impression de
   l'utilisateur que "ça n'a pas été configuré" vient très probablement du fait que
   TOUT l'historique de paie a été supprimé lors du reset payroll d'une session
   antérieure (02/08) — l'onglet affiche donc normalement son état vide
   ("Aucun paiement enregistré... apparaîtront ici après le premier versement").
   Rien à corriger ici.
8. **Clôture d'année scolaire / passage de classe — clarification demandée par
   l'utilisateur, pas d'implémentation** : confirmé que (a) le bouton "Clôturer
   l'exercice" (Comptabilité > Rapports) ne concerne QUE l'exercice comptable
   (écritures, journaux), (b) l'année scolaire/trimestres sont configurables
   (Paramètres > Calendrier, Section 2 terminée le 27/07/2026), MAIS (c) aucune
   logique de promotion (admis/redoublant), transfert de classe, désactivation en
   masse ou réinscription/réactivation n'existe — confirmé par grep exhaustif
   (`decision_fin_annee`/`rang_final` sur `Inscription` sont des colonnes JAMAIS
   lues ni écrites nulle part, de simples emplacements prévus mais jamais câblés).
   Correspond exactement à la feuille de route déjà actée, pas encore commencée.

### Anomalie corrigée en cours de route
Une tentative de reproduction directe de l'erreur d'inscription (point 5) a créé un
élève de test bien réel en base (`inscription_complete` commit en interne) ; sa
suppression complète a elle-même révélé un bug latent distinct : `DELETE
/api/eleves/{id}` ne supprime que la ligne `Eleve` sans gérer ses dépendances
(`Inscription`, `Facture`, `EcheanceFacture`, `EleveParent`) — échoue avec une
violation de contrainte FK dès qu'un élève a la moindre facture liée. Nettoyage
manuel effectué en plusieurs étapes (échéances/factures d'abord, commit séparé,
puis inscription/élève/lien parent). **Non corrigé** (hors périmètre de cette
session, mais à garder en tête pour la feuille de route "suppression définitive
après non-réinscription" — cet endpoint devra être revu à ce moment-là).

## Historique (sous-session précédente) — Retours de test réels post-analyse + reset scolarité + feuille de route
(03/08/2026, suite directe de l'analyse complète du 01/08/2026)

Après l'analyse complète ci-dessous, l'utilisateur a testé en conditions réelles et
signalé 6 problèmes concrets, plus une longue liste de fonctionnalités à traiter
**après** la comptabilité (explicitement mise en pause par l'utilisateur : "pour
l'instant on s'occupe de la page comptabilité").

### Corrigé cette session
1. **Tarif de classe modifié → aucun effet sur les factures déjà générées mais
   impayées** — `PUT /api/finance/tarifs-classe` ne touchait que `ss_tarifs_classe`,
   jamais les `Facture` déjà émises. Ajout de `_repercuter_tarif_sur_factures()`
   (`backend/app/api/finance.py`) : pour les élèves actuellement inscrits dans la
   classe, avec une facture non soldée (`statut != PAYEE`) du type de frais modifié,
   `montant_total/montant_net/montant_restant` sont recalculés (la remise fratrie
   déjà appliquée est conservée en valeur absolue), et les échéances NON encore
   soldées absorbent la différence au prorata de leur poids actuel (une échéance déjà
   payée n'est jamais retouchée). Testé réellement avec une facture partiellement
   payée à 2 tranches : la tranche payée reste intacte, la tranche restante absorbe
   tout l'écart.
2. **Avance/prime ajoutée non visible dans "Calcul des salaires" / "Salaire à
   payer"** — root cause confirmée en base réelle : `selectedMonth` dans
   `salaires/page.tsx` était codé en dur à la chaîne littérale `'2026-06'` (au lieu de
   calculer le mois réel courant, comme le fait déjà `salairesMois` dans
   `paiements/page.tsx`). Toutes les primes/avances test de l'utilisateur (3 primes,
   5 avances, retrouvées en base) étaient bien enregistrées sous `mois_concerne =
   '2026-06'`, jamais sous le mois réel affiché ailleurs. Corrigé (calcul dynamique du
   mois courant) ; les primes/avances déjà saisies par l'utilisateur ont été migrées
   de '2026-06' vers le mois réel courant pour qu'il les retrouve immédiatement sans
   avoir à ressaisir son test.
3. **Modes de paiement ajoutés dans Paramètres invisibles dans les formulaires
   d'encaissement/décaissement** — confirmé : `parametres/finance/page.tsx` persiste
   bien `finance.modes_paiement` (vérifié en base : l'utilisateur y avait déjà ajouté
   "PAYPAL" et "TEST"), mais `paiements/page.tsx`, `encaissement/page.tsx`,
   `frais/page.tsx` et `dashboard/page.tsx` avaient chacun leur PROPRE liste codée en
   dur (4 copies mutuellement incohérentes). Créé `frontend/src/lib/modesPaiement.ts`
   (fetch + labels partagés) et branché les 4 pages dessus — un mode ajouté dans
   Paramètres apparaît désormais partout.
4. **Reçu incomplet** (constat détaillé de l'utilisateur : pas de logo, pas
   d'indication du type de frais, pas de suivi de tranche) — le PDF
   (`generer_recu_pdf`, `backend/app/api/finance.py`) dessinait un rectangle
   "LOGO" statique au lieu de lire `Etablissement.logo_url` + le réglage
   `documents.entete_logo` (déjà utilisé pour les bulletins) ; n'affichait jamais le
   libellé du type de frais ; n'indiquait jamais quelle tranche était réglée ni un
   récapitulatif des tranches antérieures. Les 4 corrigés et testés réellement (PDF
   généré + texte extrait avec `pypdf`, y compris le cas "dernière tranche sur 2" avec
   récapitulatif de la tranche précédente). Le même récapitulatif des règlements
   antérieurs a aussi été ajouté à la prévisualisation écran (`encaissement/page.tsx`,
   qui recevait déjà `historique_paiements` du backend mais ne l'affichait jamais).
5. **Frais facultatifs (cantine) facturés à des familles n'ayant pas adhéré** — root
   cause : le formulaire d'inscription élève (`frontend/src/app/eleves/nouveau/
   page.tsx`) gère DÉJÀ correctement l'adhésion par frais (case à cocher par type de
   frais, facultatifs décochés par défaut, seuls les frais cochés génèrent une
   facture) — ce mécanisme n'était pas cassé. Le vrai bug : la génération groupée
   "pour toute la classe" (`POST /factures/generer-classe`) facturait TOUJOURS tous
   les élèves de la classe, y compris pour un type de frais FACULTATIF (confirmé avec
   "cantine", réellement marquée facultative en base) — imposant la cantine à des
   familles n'y ayant jamais adhéré. Corrigé : `generer_factures_classe` refuse
   désormais par défaut de générer en masse un frais facultatif (message clair
   expliquant pourquoi), sauf confirmation explicite (`forcer_optionnel`, avec
   confirm() côté frontend). Ajouté en complément un moyen de facturer un frais
   individuellement à UN élève précis (bouton "+ Ajouter un frais" dans la fiche de
   compte élève, Auxiliaire) pour couvrir le cas d'une adhésion tardive à un service
   facultatif, sans devoir l'imposer à toute la classe.
6. **Synchronisation portails parent/élève** — vérifiée saine : les deux portails
   (`backend/app/api/portail_eleve.py`, `backend/app/api/portail_parent.py`)
   interrogent directement les tables `Facture`/`Paiement` de l'inscription active,
   sans couche de cache ni logique dupliquée/divergente — donc une fois le bug du
   point 5 corrigé, les portails cesseront naturellement d'afficher les frais
   facultatifs non adhérés (même source de vérité que l'admin).

### Reset supplémentaire effectué sur demande explicite
Toutes les données de paiement de scolarité (élèves) supprimées pour repartir de
zéro pendant que l'utilisateur teste lui-même la configuration des tarifs par
classe : sauvegarde JSON complète prise avant suppression
(`<scratchpad session>/scolarite_backup_before_reset.json` — 102 factures, 92
échéances, 47 paiements, 14 écritures comptables liées avec leurs lignes). Supprimé
ensuite : toutes les `Facture`, `EcheanceFacture`, `Paiement`, et les
`EcritureComptable`/`LigneEcriture` associées (identifiées via les lignes taguées
`eleve_id`, aucune ligne mixte trouvée). **Non touché** : `TarifClasse`/`TypeFrais`
(config que l'utilisateur va tester), toutes les données de paie (`BulletinPaie`,
`Depense` catégorie SALAIRES — déjà remises à zéro lors d'un reset précédent, non
redemandé cette fois). Cache Redis du tableau de bord vidé manuellement après coup
(le reset a été fait par script direct sur la base, pas via l'API, donc
l'invalidation automatique par mutation ne s'était pas déclenchée).

### Anomalie détectée et corrigée en cours de route (process, pas produit)
Un test de fumée effectué plus tôt dans cette session (`create_facture` appelé
directement pour vérifier la facturation individuelle par élève) avait committé
réellement en base malgré un `db.rollback()` explicite après coup — la fonction
appelle `db.commit()` en interne, donc le rollback ultérieur ne pouvait plus rien
annuler. Repéré en auditant les données avant le reset scolarité (une écriture
"mixte" inattendue), nettoyé explicitement (facture, échéance, écriture, lignes)
avant de procéder au reset. Retenu pour la suite : ne jamais compter sur
`db.rollback()` après l'appel d'une fonction qui commit en interne — nettoyer
explicitement par suppression + commit à la place.

## 📋 FEUILLE DE ROUTE — Prochaine grande phase (après validation comptabilité)
Décrite explicitement par l'utilisateur comme la suite, PAS à traiter maintenant :

1. **Module Évaluations** — les enseignants saisissent les évaluations/notes
   ("tatouilles" mentionné, à clarifier avec l'utilisateur — probablement un terme
   local ou une transcription approximative pour un type d'évaluation).
2. **Clôture d'année scolaire** — pour chaque classe : un bouton/section pour voir
   les admis vs les redoublants. Un bouton "Transfert" fait passer tous les admis
   d'une classe à la classe suivante du même cycle (ex: 9e → 10e). Les redoublants
   restent dans la classe actuelle.
3. **Désactivation en masse à la clôture** — au moment de la clôture/transfert, TOUS
   les élèves (admis transférés et redoublants) sont désactivés. Un élève désactivé
   reste visible dans sa classe (supérieure ou actuelle) mais aucune action ne lui est
   autorisée tant qu'il n'est pas réactivé.
4. **Réinscription / réactivation** — quand un parent vient réinscrire son enfant
   pour la nouvelle année : le comptable encaisse les frais de réinscription (et/ou
   une tranche de scolarité) puis réactive l'élève. Un élève réactivé redevient
   pleinement utilisable dans le système.
5. **Suppression définitive après non-réinscription prolongée** — après plusieurs
   mois sans réinscription, l'admin doit pouvoir supprimer définitivement un élève de
   la base (parti dans une autre école).

Aucun de ces points n'a été commencé — à cadrer avec l'utilisateur (notamment le
sens exact de "tatouilles" en point 1, et si le cycle de classes/succession de
niveaux est déjà modélisé quelque part) avant de commencer l'implémentation.

## Historique (sous-session précédente) — Analyse complète finale du module
Comptabilité, demandée explicitement par l'utilisateur avant ses propres tests
(01/08/2026, suite directe de la session précédente)

L'utilisateur a demandé, après avoir validé les fonctionnalités de la sous-session
précédente (arriérés multi-mois, prix par classe, reset des données), une **analyse
complète** du module pour détecter toute erreur d'API, de communication front/back ou
TypeScript avant de tester lui-même et de donner la tâche suivante. Exécuté via un
Workflow de revue adversariale (8 zones, find→verify) qui a remonté 22 findings
confirmés, puis corrigés un par un avec tests réels contre la base Postgres de dev à
chaque étape (pas de simple relecture de code).

### Corrections appliquées cette session (par sévérité)
**CRITIQUE**
- Bouton rapide « Payer ce mois » sur chaque ligne de la liste Salaires payait avec
  `moisSelectionnes` (état partagé du panneau détaillé), donc pouvait régler les mois
  cochés pour un AUTRE employé dont le panneau était resté ouvert. Isolé dans un
  helper `payerMoisPourEmploye(ens, moisList)` commun, avec deux appelants distincts :
  le bouton rapide passe désormais `[salairesMois]` (mois affiché uniquement), le
  panneau détaillé passe `moisSelectionnes`.
- `POST/PUT /api/finance/employes` et `PUT /api/finance/employes/{id}/statut`
  n'existaient pas côté backend alors que `salaires/page.tsx` les appelait — mais
  investigation a montré que ce code (`handleCreateOrUpdateEmp`/`handleToggleStatut`)
  n'était en réalité JAMAIS déclenchable depuis l'UI (aucun élément ne mettait
  `showEmpForm`/`editingEmp` à une valeur non-null). Code mort supprimé plutôt que
  d'inventer des routes pour une fonctionnalité volontairement lecture-seule côté
  comptable (la gestion réelle du personnel vit dans `/personnel`).

**ÉLEVÉ**
- `GET /api/comptabilite/pin/status` et `PUT /api/comptabilite/pin` appelés par
  `profil/page.tsx` mais totalement absents du backend → implémentés (comparaison
  PIN actuel, validation longueur minimale).
- `profil/page.tsx` : widget de changement de PIN doublement cassé — ancien PIN
  deviné en dur (`'123123'`) sans champ de saisie réel, et un `.catch(() => {})`
  interne masquait tout échec au `try/catch` englobant → toast de succès affiché même
  en cas d'échec réel. Refait avec un vrai champ de saisie et une gestion d'erreur
  honnête.
- `DepenseOut` (schéma Pydantic) n'exposait ni `reference` ni `description`
  (`description` alias sur la colonne réelle `libelle`) → ces champs n'apparaissaient
  jamais dans la liste des décaissements malgré leur présence en base.
- Fiche Élève (`rapports/page.tsx`) et Auxiliaire (`auxiliaire/page.tsx`) : en cas
  d'échec de recherche/sélection, les données de la fiche PRÉCÉDENTE restaient
  affichées sous le nouvel élément sélectionné/surligné (aucune remise à `null` avant
  le fetch). Corrigé dans les deux pages ; Auxiliaire reçoit en plus un message
  d'erreur visible (avant : `console.error` silencieux).
- `GET /api/comptabilite/auxiliaire/fournisseurs` et `.../parents-eleves` n'avaient
  aucun paramètre `search` — le frontend filtrait côté client sur les 25 lignes de la
  page chargée seulement, donc une correspondance au-delà de la première page était
  invisible. Paramètre `search` ajouté aux deux endpoints (filtre nom/code pour
  fournisseurs ; nom/prénom/matricule/classe pour parents-élèves, cette dernière sur
  la liste assemblée après jointure car la classe n'est connue qu'à ce stade) ; le
  filtrage client redondant a été retiré du frontend. Pastilles d'onglet corrigées
  pour utiliser les vrais totaux (`X-Total-Count`) au lieu de la taille de page
  chargée. Changement d'onglet corrigé pour réinitialiser la sélection des DEUX
  onglets (pas seulement celui qu'on quitte).
- Panneau d'arriérés (`paiements/page.tsx`) : un échec réseau du fetch des arriérés
  était rendu de façon identique à « aucun arriéré » (message vert « à jour »).
  État d'erreur distinct ajouté (message rouge explicite).
- Statut « Non payé » resté affiché dans Salaires après un paiement effectué depuis
  la redirection vers le Centre de Décaissement : `paiements/page.tsx` n'utilise pas
  React Query pour ses propres données et n'invalidait donc jamais les clés
  `['salaires-employes']`/`['salaires-calculer']` que `salaires/page.tsx` lit. Ajout
  de `useQueryClient()` + `invalidateQueries` sur ces deux clés après un paiement de
  salaire réussi (le `QueryClient` est un singleton partagé par toute l'app via
  `QueryProvider.tsx`, donc l'invalidation traverse bien les deux pages).

**MOYEN**
- `mode_paiement` envoyé par le formulaire Fournisseur du Centre de Décaissement
  vers `/reglements-fournisseurs` mais silencieusement jeté (colonne absente sur
  `Depense`) → colonne ajoutée (migration
  `database/migrations/2026_08_03_depenses_mode_paiement.sql`, appliquée sur la base
  de dev réelle et vérifiée), modèle/schéma/endpoint mis à jour, testé de bout en
  bout (création réelle + relecture + suppression du test).
- Le clic sur une carte élève dans l'onglet « Reçus & Soldes » appelait directement
  `api.get(...)` en inline au lieu du helper `fetchSoldeEleve` (qui gère
  `soldeLoading`) — aucun retour visuel pendant le chargement, risque de double-clic.
  Remplacé par un appel au helper existant.
- Le tableau de bord financier (cache Redis, TTL 60s) n'était jamais invalidé après
  une mutation (encaissement, décaissement, salaire...) — un paiement pouvait ne pas
  apparaître sur le dashboard pendant jusqu'à 60s. Ajout de `cache_del()` dans
  `backend/app/core/cache.py` + appel `_invalidate_dashboard_cache()` après chaque
  mutation financière (`create_paiement`, `create_facture`, `create_depense`,
  `changer_statut_depense`, `valider_depense`, `creer_reglement_fournisseur`,
  `_executer_paiement_salaire`). Testé réellement : cache chaud → mutation → cache
  vide confirmé.
- Encaissement et Frais (deux écrans différents pouvant tous deux enregistrer un
  paiement de scolarité) n'invalidaient pas la clé React Query de l'AUTRE écran — un
  paiement fait sur l'un ne rafraîchissait pas la liste solvabilité/frais de l'autre
  au retour. Invalidation croisée ajoutée dans les deux sens.
- Bulletin de salaire imprimé : `type_contrat` était codé en dur à `"CDI"` dans
  `_identifier_employe()` au lieu de lire le vrai champ (existant) sur
  `Enseignant`/`Utilisateur` ; `bulletin_detail_endpoint` ne renvoyait même pas ces
  champs au frontend alors que celui-ci les affiche déjà (`bulletinDetails.employe.
  type_contrat`/`mobile_money`). Corrigé des deux côtés (`mobile_money` reste `None` :
  aucune colonne dédiée n'existe pour ce numéro, pas de donnée à en tirer).

### Corrigé en amont dans cette même session, avant la revue finale
(Voir aussi l'historique plus bas pour le détail complet des sous-sessions
précédentes du même jour : prix de scolarité par classe, arriérés multi-mois, reset
des données de paie, module Paramètres salaires, etc.)

### Anomalie corrigée en cours de route (hors périmètre de la demande)
`docs/comptabilite/module-comptabilite.md` (cahier des charges aspirationnel, que
l'utilisateur avait dit d'ignorer comme périmètre de travail — pas de le supprimer)
s'est retrouvé supprimé du disque à un moment de la sous-session précédente
(disparu entre le début et la fin de cette conversation, sans trace d'une suppression
volontaire documentée). Restauré depuis `HEAD` par précaution ; à confirmer avec
l'utilisateur si une suppression était réellement voulue.

### Tests exécutés
- `py_compile` sur l'ensemble de `backend/app/` (44 fichiers) + import complet de
  `main.py` (342 routes, 0 erreur) après chaque lot de modifications.
- Chaque endpoint touché testé en exécution directe contre la vraie base Postgres de
  dev (pas de mock) : recherche auxiliaire (fournisseurs/parents-élèves, y compris un
  cas confirmant qu'un second « DIALLO » invisible sur la page 1 est bien trouvé),
  `creer_reglement_fournisseur` avec `mode_paiement` (persistance vérifiée), cache
  dashboard (chaud → invalidé après mutation, vérifié), `bulletin_detail_endpoint`
  avec `type_contrat` réel — tous les artefacts de test nettoyés après coup pour
  laisser la base dans l'état pristine attendu par l'utilisateur.
- `npx tsc --noEmit` sur tout le projet frontend : 0 erreur (plusieurs passages,
  après chaque lot de fichiers modifiés).
- `npm run lint` sur tout le projet : 0 erreur, 1030 warnings préexistants (bruit
  `any`/imports inutilisés déjà présent partout, aucun nouveau).

## Historique (sous-session précédente, même jour)
**Fonctionnalités salaires/frais avancées + reset des données de paie (02/08/2026, suite)**

### Ajouts de cette sous-session
1. **Prix de scolarité différents par classe** (`frais/page.tsx`) — la génération de
   factures permet désormais de cocher plusieurs classes avec un **montant propre à
   chaque classe** (au lieu d'un seul montant partagé pour toutes les classes cochées).
   Bouton "Appliquer le montant par défaut à toutes les cochées" pour aller vite quand
   les montants sont identiques. Le tableau d'échéances manuel a été retiré (n'avait
   plus de sens avec des montants variables) — les échéances sont maintenant générées
   automatiquement par classe à partir du fractionnement choisi.
2. **Reset complet des données de paie (base de dev)** — sur demande explicite, avec
   sauvegarde JSON préalable
   (`scratchpad/payroll_backup_before_reset.json`) : tous les `BulletinPaie` (5),
   toutes les `Depense` catégorie SALAIRES (21) et leurs écritures comptables `SAL-*`
   (5) supprimés ; avances `DEDUITE` repassées `EN_ATTENTE` (2) ; `salaire_base` mis à
   2 500 000 GNF pour tous les enseignants (9) et tout le personnel (5) sans exception
   de rôle/statut.
3. **Arriérés multi-mois pour le paiement de salaire** — nouveaux endpoints
   `GET /api/finance/salaires/arrieres/{employe_id}` (liste les mois impayés des 12
   derniers mois avec net à payer chacun) et
   `POST /api/finance/salaires/payer-plusieurs-mois` (règle une sélection de mois en
   une seule action). Le formulaire Salaire du Centre de Décaissement affiche
   désormais une liste à cocher de tous les mois en retard (tous cochés par défaut,
   décochables individuellement) avec un total qui se met à jour, au lieu d'un seul
   mois figé sur le calendrier sélectionné.
4. **Garde-fou date de paie** — si le mois en cours fait partie de la sélection et que
   la date de paie officielle (Calendrier de paie) n'est pas encore arrivée, une
   confirmation est demandée avant de payer en avance (pas un blocage dur).
5. **Section "Salaires" retirée du formulaire générique "Nouveau Décaissement"** — les
   salaires ne se paient plus que via la carte dédiée "Salaires" (Centre de
   Décaissement), plus du tout via le sélecteur de catégorie du formulaire générique à
   montant libre (source de la confusion signalée précédemment).
6. Re-vérifié : "Envoyer alerte forcée" persiste bien une trace visible immédiatement
   dans le tableau de "Calendrier de paie" (test réel, artefacts de test nettoyés
   ensuite).

### Tests exécutés
- `py_compile` + import complet (338 routes, 0 erreur).
- `payer_plusieurs_mois_endpoint` testé réellement : paiement partiel de 2 mois sur 12
  choisis manuellement, arriérés recalculés correctement après (10 mois restants) —
  données de test nettoyées après coup pour laisser la base dans l'état pristine du
  reset.
- `alertes_endpoint`/`alertes_historique_endpoint` testés réellement (l'alerte envoyée
  apparaît bien dans l'historique) — données de test nettoyées après coup.
- `npx tsc --noEmit` : 0 erreur. `npm run lint` : 0 erreur (1021 warnings préexistants).

## Historique (session précédente, même jour)
**Restructuration du module Comptabilité suite aux retours d'usage réel (02/08/2026)**

### Contexte
Après la correction exhaustive de bugs du 01/08/2026 (voir `.ai/PROJECT_MEMORY.md`),
l'utilisateur a testé le module en conditions réelles et est revenu avec une liste de
retours concrets — pas des bugs supplémentaires cette fois, mais des demandes de
réorganisation/nettoyage de flux qui se chevauchaient ou créaient de la confusion.

## ✅ Réalisé cette session

1. **Auto-refresh après encaissement** — `encaissement/page.tsx` et `frais/page.tsx`
   n'invalidaient que leur propre cache React Query après un paiement. Un paiement fait
   depuis Impayés → Encaisser → payer ne rafraîchissait jamais la liste Impayés ni le
   Dashboard au retour. Les deux pages invalident désormais aussi `['impayes']` et
   `['finance-dashboard']`.

2. **Types de frais — génération multi-classes + fractionnement automatique**
   (`frais/page.tsx`) — le champ « obligatoire » existait déjà (rien à faire). Ajouté :
   sélection de plusieurs classes par cases à cocher (au lieu d'une classe à la fois,
   un appel à `POST /factures/generer-classe` par classe cochée, endpoint déjà
   idempotent) + auto-remplissage du montant et du nombre d'échéances à partir de la
   fréquence du type de frais choisi (mensuel→10, trimestriel→3, unique/annuel→1),
   modifiable manuellement ensuite comme avant.

3. **Écart net à payer vs historique corrigé** — `_calculer_salaire()`
   (`backend/app/api/finance.py`) recalculait TOUJOURS en direct depuis les tables
   primes/absences/avances, même pour un mois déjà payé : ajouter une prime après coup
   pour ce même mois faisait dériver le montant affiché loin de ce qui avait réellement
   été versé (bulletin figé). Corrige : si un `BulletinPaie` existe et est `PAYE`, ses
   valeurs figées sont retournées telles quelles, plus de recalcul.

4. **Calendrier de paie — historique des alertes** — `GET/POST /salaires/alertes*`
   étaient des stubs (toujours vides / faux succès). Implémentés réellement : l'envoi
   calcule la vraie liste des employés non payés du mois et persiste la trace (via le
   modèle `Message`, même mécanisme que les rappels d'impayés) ; l'historique lit
   désormais ces vraies traces au lieu de renvoyer `[]`.

5. **Page Dépenses supprimée** (`comptabilite/depenses/page.tsx`, 827 lignes) —
   faisait doublon avec Paiements > Centre de Décaissement (deux façons de payer un
   salaire, confusion). Justificatif de facture (upload réel via
   `POST /upload-justificatif`) et suivi analytique (classe + département) + source des
   fonds (caisse/banque/mobile money) déplacés dans le formulaire Fournisseur du Centre
   de Décaissement (`paiements/page.tsx`), visibles uniquement pour la catégorie
   FOURNISSEUR. Lien de menu retiré (`comptabilite/layout.tsx`).
   - **Perte de capacité identifiée et partiellement compensée** : l'ancienne page
     permettait de rejeter une dépense (repasser à `REJETEE`) et filtrait par
     statut/classe avec export CSV. Le bouton **Rejeter** a été rajouté à côté de
     Valider dans le Centre de Décaissement (utilise l'endpoint déjà existant
     `PUT /depenses/{id}/statut`). Les filtres statut/classe et l'export CSV n'ont
     PAS été rajoutés (jugé superflu vu la demande explicite de simplifier cet écran) —
     à reconsidérer si le besoin réapparaît.

6. **Paiement de salaire centralisé** — le bouton « Payer » de Salaires > Calcul des
   salaires ne paie plus sur place : il redirige vers
   `/comptabilite/paiements?tab=fournisseurs&payerSalaire=<id>&mois=<mois>`, qui ouvre
   automatiquement le formulaire Salaire du Centre de Décaissement pré-rempli sur cet
   employé (seul point d'entrée désormais pour tout paiement de salaire individuel).
   `showPayModal`/`handlePayIndividual`/`payMode` (l'ancien flux de paiement sur place)
   supprimés de `salaires/page.tsx`. Le paiement groupé (`handlePayGroup`, paie tout le
   personnel en un clic) n'a pas été touché — il reste un flux à part, volontairement
   direct. `paiements/page.tsx` a dû être enveloppé dans un `<Suspense>` (requis par
   Next.js App Router pour `useSearchParams()`).
   - **Primes/avances** : déjà répercutées automatiquement sur le calcul du salaire
     (vérifié, aucune correction nécessaire — la couche de cache avait déjà été
     corrigée le 01/08).
   - **Bulletins de paie / historique** : confirmés corrects par l'utilisateur, non
     retouchés.

## 🔍 Revue adversariale de cette session (Workflow, 5 zones)
Exécutée après les corrections ci-dessus pour vérifier l'absence de régression sur les
changements de CETTE session précisément (pas un audit général — celui du 01/08 a déjà
eu lieu). Flux salaire→redirection et invalidation de cache : aucun bug trouvé. 4 bugs
trouvés et corrigés dans la foulée :
- Fichier justificatif et champs analytiques (`fournisseurForm`) jamais réinitialisés
  en changeant de catégorie dans le formulaire encore ouvert, ni en annulant/fermant —
  risque réel de rattacher un justificatif/une classe d'un décaissement précédent à un
  nouveau. Corrigé (`resetFournisseurForm()` appelé à chaque ouverture/fermeture/
  changement de catégorie).
- Perte de la fonction « Rejeter » suite à la suppression de la page Dépenses (voir
  point 5 ci-dessus) — rajoutée.
- Bouton « Tout sélectionner/désélectionner » (génération de factures multi-classes)
  affichait « Tout désélectionner » alors que rien n'était sélectionné quand la liste
  des classes était encore vide (comparaison `0 === 0`). Corrigé.

## Tests exécutés
- `py_compile` + import complet du backend (336 routes, 0 erreur) après chaque lot.
- Plusieurs fonctions testées directement contre la vraie base Postgres de dev (pas de
  mock) : `_calculer_salaire` sur un bulletin déjà payé (confirmé : renvoie exactement
  le montant historique, plus d'écart), `creer_reglement_fournisseur` avec les nouveaux
  champs (facture_url/source_fonds/departement bien persistés), `changer_statut_depense`
  vers REJETEE (fonctionne, ligne de test nettoyée après coup).
- `npx tsc --noEmit` : 0 erreur (le cache `.next` a dû être vidé une fois après
  suppression de la page Dépenses — Next.js générait un type de route obsolète pointant
  vers le fichier supprimé, pas une vraie erreur de code).
- `npm run lint` : 0 erreur, 1019 warnings préexistants (inchangé/légèrement réduit par
  la suppression de la page Dépenses).

## Prochaine étape exacte (état au terme de l'analyse complète du 01/08/2026)
1. **Rendu à l'utilisateur** : l'analyse complète demandée est terminée (22 findings
   confirmés, tous corrigés et testés réellement — voir section du haut). L'étape
   suivante est le test utilisateur en conditions réelles ; aucune action côté agent
   n'est requise tant que ce retour n'est pas arrivé.
2. Point à confirmer avec l'utilisateur : `docs/comptabilite/module-comptabilite.md`
   a été retrouvé supprimé et restauré par précaution (voir section du haut) — vérifier
   que la restauration est bien ce qu'il souhaite.
3. Non traité, connu et documenté (pas oublié) : filtres statut/classe + export CSV sur
   le Centre de Décaissement (endpoints backend déjà prêts) ; onglet « Types de frais »
   de `parametres/finance/page.tsx` en doublon fonctionnel de `comptabilite/frais/
   page.tsx` sans synchronisation de cache entre les deux (informationnel, pas un bug
   bloquant).
4. Après validation utilisateur de ce module, reprendre la tâche antérieure documentée
   dans `.ai/PROJECT_MEMORY.md` (« Stabilisation portails et parcours critiques »),
   toujours en pause depuis le 27/07/2026.

### Règle mémoire importante
Mettre à jour `.ai/CURRENT_TASK.md` et `.ai/PROJECT_MEMORY.md` régulièrement,
surtout avant une limite de contexte/tokens ou une interruption possible.
