# Chantier Offline-First — Journal de suivi

Ce fichier liste, à jour, tout ce qui a été touché pour rendre l'application
utilisable hors-ligne. Objectif explicite (demande utilisateur, 17-18/08/2026) :
« l'application en elle-même doit être disponible en mode offline », motivé
par la réalité du terrain (connexions rurales instables en Guinée) — pas
un confort, une nécessité de conception pour ce marché.

**Convention** : chaque entrée ci-dessous = une session de travail. En cas
d'anomalie constatée par un collaborateur, vérifier ici EN PREMIER quelle
partie a été touchée et quand, avant de chercher ailleurs.

**Ce qui reste hors-périmètre, volontairement, à chaque étape** (hérité de
l'architecture existante, `lib/offlinePolicy.ts`) :
- **Finance / comptabilité** : jamais en écriture offline, jamais mis en
  cache par le Service Worker. Une opération financière ne devient jamais
  automatiquement offline.
- **Authentification / sécurité / permissions** : jamais offline. Le mode
  hors-ligne ne doit jamais devenir un contournement des permissions.
- **Isolation multi-écoles** : préservée à chaque extension — un cache ou
  une file offline ne mélange jamais les données de deux établissements.

---

## 17-18/08/2026 — État des lieux avant extension

Voir aussi (déjà existant, non modifié) : `docs/module-offlineFirst.md`
(cahier des charges d'origine), `.ai/CURRENT_TASK.md` (roadmap 8 phases).

Résumé de ce qui existait déjà avant cette extension (vérifié à jour) :
- Offline fonctionnel : **uniquement portail enseignant**, 3 écritures
  (notes, présences, marquer messages lus).
- `lib/offlinePolicy.ts` : registre déjà en place (`READ_ONLY_OFFLINE` /
  `WRITE_OFFLINE_SAFE` / `WRITE_OFFLINE_CONTROLLED` / `ONLINE_ONLY`) —
  c'est la source unique de vérité, consommée par le Service Worker et par
  `lib/api.ts`. Toute extension passe par ce fichier, pas par un nouveau
  mécanisme parallèle.
- Chiffrement du cache local branché sur le vrai cache utilisé (correctif
  du 17/08/2026, voir `.ai/OFFLINE_CHIFFREMENT_CACHE_17_08_2026_RAPPORT.md`).
- Bugs d'hydratation liés au cache persisté corrigés partout (7 fichiers,
  17/08/2026).

---

## 18/08/2026 — Étape 1 : rendre visible et fiable ce qui marche déjà

**Découverte importante avant de coder** (lecture complète de `src/app/sw.ts`) :
le Service Worker met déjà en cache, automatiquement, TOUTES les lectures
(GET) de l'API — pour tous les modules — sauf les 3 exclusions volontaires
(`finance_comptabilite`, `auth`, `securite_permissions`, voir
`excludeFromServiceWorkerCache` dans `lib/offlinePolicy.ts`). Ça ne dépend
PAS de `read: READ_ONLY_OFFLINE` (ce champ documente seulement si un cache
APPLICATIF — React Query — existe en plus). Concrètement : personnel,
élèves, enseignants, classes, examens, communication... toutes ces lectures
sont déjà mises en cache par le navigateur dès qu'une page a été visitée une
fois en ligne, même si la page fait un `axios.get()` direct sans React
Query. Ce n'était donc pas à construire — seulement à rendre visible et
fiable.

### 1. Moteur de synchronisation démarré globalement (correction, pas juste ajout)

**Problème trouvé** : `startAutoSync()` (`lib/syncEngine.ts`) n'était appelé
que depuis le montage de `portail-enseignant/page.tsx`. Résultat concret :
si la connexion revenait pendant que l'utilisateur était ailleurs dans
l'app (admin, portail parent...), la file d'attente locale n'était PAS
rejouée tant qu'il ne retournait pas dans le portail enseignant.

- **`frontend/src/components/AppShell.tsx`** — `startAutoSync()` déplacé
  ici (useEffect gated sur `isAuthenticated`), le seul composant toujours
  monté pour toute la session, quel que soit le portail. Fonction
  elle-même **non modifiée**.
- **`frontend/src/app/portail-enseignant/page.tsx`** — l'appel en double
  retiré (aurait ajouté un second jeu d'écouteurs `online`/
  `visibilitychange` redondant).

### 2. Indicateur "hors-ligne / synchronisation" étendu partout

`components/SyncStatusIndicator.tsx` — **non modifié**, seulement monté à
de nouveaux endroits (composant déjà autonome et portable) :
- `frontend/src/components/Topbar.tsx` — shell admin (couvre TOUTES les
  pages admin : dashboard, classes, personnel, comptabilité, paramètres...
  d'un coup, puisque Topbar y est déjà partagé).
- `frontend/src/app/portail-parent/page.tsx` — header, à côté du menu profil.
- `frontend/src/app/portail-eleve/components/EleveHeader.tsx` — idem.
- `frontend/src/app/comptabilite/layout.tsx` — avec une note explicite
  dans le code : la compta n'ayant aucun cache (exclusion volontaire),
  l'indicateur y confirme juste "rien ne chargera avant la reconnexion"
  plutôt que de laisser un échec silencieux/confus.

**Non fait cette session, volontairement** : `personnel/portail/[role]`
(portails comptable/surveillant/secrétariat/informatique) — fichier de
2844 lignes avec plusieurs sections par rôle non factorisées en un header
partagé. Pas cartographié assez précisément pour y toucher sans risque
dans cette même passe — à traiter à part.

### 3. Message clair quand une page/route n'a jamais été visitée en ligne

**`frontend/src/lib/api.ts`** — l'intercepteur de réponse (déjà existant,
gère 401/403) reçoit un cas de plus : une vraie coupure réseau (pas un
refus serveur — même détection que `syncEngine.ts`/`isNetworkError`) fait
maintenant porter à `error.message` un texte clair en français au lieu du
"Network Error" générique d'axios. **`error.response` n'est jamais
fabriqué** — sa présence/absence sert ailleurs dans l'app à distinguer
"le serveur a répondu" de "aucune réponse", le changer aurait pu casser
du code qui ne s'y attend pas.

**Limite assumée** : beaucoup de pages affichent leur propre message
d'erreur codé en dur plutôt que `error.message` — cette correction ne les
change pas automatiquement. Elle aide immédiatement toute page qui
affiche déjà `error.message`, et pose l'infrastructure pour les pages
suivantes sans avoir dû toucher chacune d'elles dans cette passe (risque
de régression trop large pour une seule session).

### Tests ajoutés

`frontend/src/tests/api.offlineQueueing.test.ts` — 3 tests ajoutés (message
clair sur coupure réseau, message d'origine préservé sur un vrai refus
serveur, `error.response` jamais fabriqué).

### Vérifié

`tsc --noEmit` propre, 110/110 tests (107 existants + 3 nouveaux), build
Turbopack propre (toutes les routes). **Non testé** : navigateur réel
(coupure réseau simulée, rendu visuel de l'indicateur sur chaque portail) —
pas d'outil disponible ici pour le faire.

### Suite proposée (pas commencée)

Phase 3 du cahier des charges (`docs/module-offlineFirst.md`) : étendre
l'ÉCRITURE hors-ligne à d'autres modules, un par un, en commençant par le
candidat déjà identifié (élèves — nécessite d'auditer `PUT /api/eleves/{id}`
en détail avant toute activation, voir `lib/offlinePolicy.ts`). Finance,
authentification et sécurité restent hors-périmètre par décision actée,
pas par oubli.

> **Correction du 26/10/2026** : l'affirmation de cette entrée (« le Service
> Worker met déjà en cache toutes les lectures de l'API ») était **fausse en
> production**. La règle exigeait `sameOrigin`, or le frontend et l'API sont
> sur deux domaines différents : aucune lecture n'était mise en cache. Voir
> l'entrée du 26/10/2026 ci-dessous.

---

## 26/10/2026 — Phase 0 : tout le logiciel démarre et se consulte hors-ligne

Nouvelle demande : « tout le logiciel doit être utilisable avec ou sans la
connexion ». Le plan en 5 phases a été approuvé. La décision de rendre
**lisibles** hors-ligne la finance et la sécurité est actée. Leur écriture
reste en ligne jusqu'à leurs phases.

Détail complet, fichiers touchés et vérifications : voir
`.ai/CORRECTIFS_26_10_2026_RAPPORT.md`. En résumé :
- Le cache API du Service Worker fonctionne enfin entre les deux origines. Il
  est cloisonné par compte (`lib/offlineCacheKey.ts`).
- Démarrage hors-ligne sur la bonne année (`lib/memoHorsLigne.ts`).
- Cache React Query déplacé dans IndexedDB, en base64, conservé 30 jours.
- Un 401 ne détruit plus les données locales : la purge n'a lieu que si un
  autre compte se connecte.
- File offline cloisonnée par compte, mise en pause sur 401.
- Préparation du poste : écrans, lectures mémorisées et visite en coulisse
  hebdomadaire de chaque écran (`lib/preparationHorsLigne.ts`).
- `reloadOnOnline: false` : le rechargement automatique au retour du réseau
  annulait les navigations.

Prochaine étape (Phase 1) : pipeline d'écriture générique, avec
idempotence serveur, identifiants provisoires et conflits, en commençant par
l'appel par séances des enseignants.

---

## 26-27/10/2026 — Changement d'architecture : moteur local sur chaque poste (Phase A)

Le cahier des charges du fondateur exige une application **identique en
ligne et hors-ligne** (reçus définitifs, calculs, comptabilité), avec les
données dans une **base locale**. Un simple cache de navigateur (Phase 0) ne
peut pas exécuter la logique métier, qui vit dans le serveur Python.

Décision : chaque appareil fait tourner le même moteur SmartSchool
(`SMARTSCHOOL_MODE=poste`, base SQLite) dans une application installée
(Electron, `desktop/`). La Phase 0 reste utile pour la version web.

Phase A faite : périmètre d'un établissement, installation du poste
(données et fichiers), mode poste sans Redis, application de bureau.
Vérifié de bout en bout, y compris relancé avec un cloud injoignable.

Détail, fichiers touchés et limites : `.ai/CORRECTIFS_27_10_2026_RAPPORT.md`.

Prochaine étape (Phase B) : synchronisation multi-appareils. Elle couvre
l'envoi et la réception des changements, les identifiants et numéros sans
collision, la clé de signature des reçus par appareil, et les conflits
signalés.

---

## 27-29/10/2026 — Phase B, étapes B1 et B2 : identifiants et pièces par poste

- **B1** : chaque poste a un numéro N et crée ses lignes à partir de
  N × 2³². Les 232 colonnes d'identifiant passent en 64 bits ; la migration
  du cloud est à lancer à la fusion. Le poste s'enregistre auprès du cloud à
  l'installation (`ss_appareils`), et un garde refuse tout identifiant hors
  plage.
- **B2** : reçus, factures, matricules et codes d'exemplaire portent le rang
  du poste (`-P2-`). La clé des reçus est dérivée par poste, et le cloud
  vérifie les reçus émis hors-ligne. Correctif : le QR d'un reçu de poste
  pointait vers 127.0.0.1.

Détail, pièges trouvés par prototype et vérifications :
`.ai/CORRECTIFS_29_10_2026_RAPPORT.md`.

## 29/10/2026 — Phase B, étapes B3 à B5 : les échanges

- **B3** : journal des changements tenu par des déclencheurs, sur le poste et
  sur le cloud. Il note l'école concernée et l'appareil d'origine, et il est
  publié sans trou possible.
- **B4** : envoi et réception automatiques, contrôlés école par école. Rien
  n'est écarté en silence, et une ligne refusée ne bloque jamais le reste.
- **B5** :
  - fusion champ par champ ;
  - pour les données sensibles, c'est la direction qui tranche ;
  - les totaux sont recalculés ;
  - les identifiants sont dérivés de la clé naturelle pour les lignes
    « cherchées ou créées » ;
  - écran « Synchronisation » et indicateur du poste.

Vérifié en réel : deux postes hors-ligne encaissent sur la même facture, puis
reviennent en ligne. Tout converge seul, totaux justes, sans conflit. Même
rapport.

Reste en phase B : la synchronisation des fichiers (B6) et la vérification
visuelle dans l'application installée.
