# Session du 26/10/2026 — Hors-ligne, Phase 0 : tout le logiciel démarre et se consulte sans connexion

## Contexte

Demande : « tout le logiciel doit être utilisable avec ou sans la connexion,
pas seulement quelques parties ». C'est très demandé par les clients.

Plan approuvé : `C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`, en
5 phases. Phase 0, cette session : démarrage et consultation hors-ligne de
tout le logiciel. Les phases 1 à 4 couvriront l'écriture hors-ligne, module
par module.

## Audit : pourquoi l'application ne marchait pas hors-ligne en production

1. **Le cache API du Service Worker ne s'activait jamais.** La règle exigeait
   `sameOrigin`, mais le frontend (`trxsmartschool.com`) et l'API
   (`api.trxsmartschool.com`) sont sur deux origines différentes.
   L'affirmation du journal du 18/08 (« toutes les lectures sont déjà en
   cache ») était fausse en production.
2. **79 pages sur 89 lisent par `axios` direct**, donc sans aucun cache
   applicatif.
3. **Hors-ligne, l'application démarrait sur l'année n°1**, une année d'une
   autre école, avec le libellé « 2024-2025 ».
4. **Le cache React Query était fragile** : stocké dans `localStorage`
   (~5 Mo), chiffré puis encodé en tableau de nombres (×3 à ×4). Il expirait
   en 24 h.
5. **Un 401 effaçait tout** : après une journée hors-ligne, la session de 8 h
   expirait et la reconnexion vidait les données locales.

## Ce qui a été fait

### Service Worker (`frontend/src/app/sw.ts`)
- Règle API valable quelle que soit l'origine (`estRequeteApi`).
- Clé de cache sans `_t` et **cloisonnée par compte** (`type:sub:établissement`
  lu dans le JWT). Ce cloisonnement passe par le paramètre `__ss_compte` et
  non par un `#`, que l'API Cache ignore. Logique dans le nouveau
  `lib/offlineCacheKey.ts`.
- `matchOptions: { ignoreVary: true }`, sinon le `Vary: Origin` du CORS
  empêche toute correspondance.
- Plus de délai de bascule de 3 s sur l'API : en ligne, on attend toujours la
  vraie réponse, et le cache ne sert que si le réseau échoue.
- 3000 entrées, conservées 30 jours.

### Registre (`lib/offlinePolicy.ts`)
- Finance et sécurité se **lisent** hors-ligne, puisque le cache est
  cloisonné par compte et purgé à la déconnexion. Leur **écriture** reste en
  ligne.
- L'authentification n'est jamais mise en cache. Cela couvre aussi
  `/api/portail-parent/login` et `/api/portail-eleve/login`.

### Démarrage hors-ligne (`context/AppContext.tsx` + nouveau `lib/memoHorsLigne.ts`)
- Années scolaires, identité de l'école (cachet, signature, directeur) et
  réglages du thème sont mémorisés à chaque réponse. Ils sont relus si le
  serveur ne répond pas. Cette copie est liée au compte et supprimée à la
  déconnexion.

### Cache React Query (`QueryProvider.tsx`, `queryClient.ts`, `localEncryption.ts`, nouveau `lib/cacheRequetesLocal.ts`)
- Stockage dans **IndexedDB** au lieu de `localStorage`.
- Chiffrement inchangé, mais encodé en **base64** : plus de 2 fois plus
  compact, vérifié par un test. Nouvelles fonctions `chiffrerEnTexte` et
  `dechiffrerTexte`. L'ancien format, encore utilisé par le cache delta des
  élèves, est conservé.
- Conservation de 30 jours, au lieu de 24 h.

### Session (`lib/sessionCleanup.ts`, `lib/api.ts`, `context/AuthContext.tsx`)
- Un 401 retire **seulement** le jeton (`retirerSessionExpiree`).
- À la connexion suivante, si c'est **un autre compte**, les données du
  précédent sont purgées (`preparerNouvelleSession`).
- Hors-ligne, une écriture d'un module pas encore ouvert au hors-ligne affiche
  un message clair : « cette action n'a pas été enregistrée ».

### File offline (`lib/offlineQueue.ts`, `lib/syncEngine.ts`)
- Chaque saisie retient son compte (`compte`), et le rejeu n'envoie que celles
  du compte connecté. Sur un poste partagé, la saisie d'un enseignant ne part
  jamais sous le jeton d'un autre.
- Un 401 pendant le rejeu le met en pause, sans compter d'échec. Avant, la
  saisie était classée « échec définitif ».

### Préparation du poste (nouveaux `lib/preparationHorsLigne.ts`, `lib/routesApplication.ts`, `lib/fenetrePreparation.ts`)
- **Automatique** : 5 s après l'ouverture (si la dernière préparation date de
  plus de 6 h), au retour du réseau (plus d'1 h), et quand le Service Worker
  prend la main. **Manuelle** : bouton dans l'en-tête.
- Elle met en cache la mise en page de tous les écrans du rôle.
- Elle mémorise et relit toutes les lectures faites par le compte.
- Pour un enseignant, elle charge ses classes et ses listes d'élèves, même
  jamais ouvertes.
- **Une fois par semaine**, elle ouvre chaque écran du rôle dans une fenêtre
  invisible, pour que ses données soient aussi gardées. Cette fenêtre est
  strictement passive :
  - aucune écriture (refusée dans `api.ts`) ;
  - pas de rejeu de file (`AppShell.tsx`) ;
  - pas de persistance du cache (`QueryProvider.tsx`).
- `tests/routesApplication.test.ts` échoue si un nouvel écran n'est pas
  déclaré.

### Indicateur (`components/SyncStatusIndicator.tsx`)
- Pendant la préparation : « Préparation hors-ligne… 65/135 ».
- Hors-ligne : « Hors ligne — données du 26/10 18:15 ».
- En ligne : un petit bouton-icône indique si le poste est prêt et permet de
  le mettre à jour.

### `next.config.ts` : `reloadOnOnline: false`
Trouvé en test réel. À chaque événement `online`, la page se rechargeait, ce
qui annulait la navigation en cours (retour sur l'écran précédent) et aurait
effacé un formulaire en cours de saisie. Preuve : avec l'option, l'utilisateur
revenait sur l'écran précédent à presque chaque clic du menu hors-ligne ; sans
elle, 12 clics sur 12 ont abouti sur 3 essais.

## Vérifié réellement

- `tsc --noEmit` propre, **157/157 tests frontend**, dont 39 nouveaux :
  - cloisonnement du cache ;
  - session et 401 ;
  - rejeu par compte ;
  - format base64 ;
  - préparation ;
  - fenêtre en lecture seule ;
  - liste des écrans.
- **Build de production réel** dans une copie isolée, sans toucher au serveur
  de dev : API de test locale sur une autre origine (`localhost:8301`), comme
  en production, et aucune référence à l'API de production dans le build.
  Résultats avec Playwright et une vraie coupure réseau :
  - Préparation complète en 3 min 39 s : 65 écrans, 129 lectures, 0 échec.
  - Aucune écriture reçue par le backend pendant la préparation.
  - Hors-ligne, après rechargement complet, le dashboard affiche la bonne
    année (2026-2027) et 5 000 élèves.
  - Hors-ligne, sur des écrans **jamais ouverts en ligne** : `/matieres` montre
    33 matières (au lieu de « 0 »), `/classes` 19 classes, et `/eleves` comme
    `/enseignants` affichent leurs listes.
  - Navigation hors-ligne par le menu : 12/12.
  - Une fiche à identifiant jamais ouverte affiche la page de repli dans la
    mise en page de l'application.
  - Au retour du réseau, le dashboard fonctionne normalement.
- **Non testé en bout en bout** :
  - parcours enseignant (aucun mot de passe enseignant connu en local ; le
    code est couvert par des tests) ;
  - second compte sur le même poste (couvert par les tests de cloisonnement) ;
  - rendu sur mobile.

## Limites connues (à traiter dans les phases suivantes)

- **Écriture hors-ligne** : inchangée dans cette phase. Seules les notes
  (`/api/sync`) et « tout marquer lu » sont mises en file. L'appel par séances
  reste en ligne (Phase 1).
- **Fiche à identifiant** (`/eleves/[id]`…) : disponible hors-ligne seulement
  si elle a déjà été ouverte sur ce poste.
- **Première préparation d'un nouveau compte** : 3 à 4 min d'activité en
  arrière-plan sur PC, sans doute plus sur un téléphone lent. Elle consomme
  aussi des données mobiles.
- **Appel parasite** `annee_id=1` au chargement de chaque page :
  préexistant, sans gravité, non corrigé ici (toucherait les 89 pages).

## Branche du chantier : `IYA-hors-ligne`

Décision de l'utilisateur (26/10/2026) : tout le chantier hors-ligne vit sur
la branche `IYA-hors-ligne`, créée depuis `IYA`.

Rien n'est fusionné dans `IYA` tant que l'application **entière** n'est pas
validée hors-ligne, application installée. Cela veut dire toutes les
fonctionnalités de toutes les pages, du dashboard jusqu'à l'administration et
au monitoring, testées et prouvées. Ensuite seulement : `IYA-hors-ligne` →
`IYA` → `main`.
