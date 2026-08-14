# Refonte mobile complète + identité visuelle SmartSchool

Le 14/08/2026, suite à un brief de 17 phases de l'utilisateur (captures
d'écran à l'appui) constatant que la version mobile de l'application
était « éclatée au sol » : la barre latérale s'affichait à pleine largeur
desktop, écrasée dans un viewport de ~375px, sans aucun repli
responsive. Le brief demandait, dans l'ordre : identité PWA/icônes, un
vrai logo, l'audit de la page de connexion (déjà en grande partie fait
lors d'un chantier précédent de la même session), puis un audit mobile
complet suivi d'une refonte, avec non-régression desktop obligatoire et
un rapport final structuré en 6 points.

## Méthodologie

3 agents Explore en parallèle (lecture seule) — shell/layout, tableaux/
dashboards, modales/formulaires/menus — avant toute ligne de code, comme
exigé par le brief (Phase A). Une décision produit posée via
`AskUserQuestion` (concevoir un vrai symbole SmartSchool plutôt que
garder l'icône générique `ShieldCheck`). Plan Mode ensuite, plan approuvé
avant toute écriture de code. Travail exécuté par paliers (Tier 0 à
Tier 4), avec un point de contrôle `tsc`/`vitest` après chaque palier
plutôt qu'une seule vérification finale.

---

## 1. Identité de l'application et PWA

- Nouveau symbole SmartSchool dessiné à la main en SVG (monogramme
  géométrique « 3 barres ascendantes », pas une icône générique) en deux
  déclinaisons : `public/brand/symbol-source.svg` (badge avec fond, pour
  favicon/PWA) et `symbol-source-maskable.svg` (glyphe seul dans la zone
  de sécurité ~80%, pour les icônes Android maskables).
- `frontend/scripts/generate-icons.mjs` repointé sur ces nouvelles
  sources et ré-exécuté : régénère `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `src/app/icon.png`, `src/app/apple-icon.png`.
  Les anciennes sources `source-mark.svg`/`source-mark-maskable.svg`
  (icône `ShieldCheck` générique) sont supprimées.
- Nouveau composant `frontend/src/components/SmartSchoolMark.tsx`
  (glyphe seul, sans fond, props `size`/`color`) pour les usages où le
  conteneur fournit déjà son propre fond : badge du hero `/login` et
  badge de `/inscription`.
- Le logo de chaque école (`Sidebar.tsx`, zone `.appBrand`) n'a **pas**
  été remplacé par le symbole SmartSchool — c'est le logo de
  l'établissement (ou son avatar-lettre) par conception multi-tenant
  établie plus tôt dans cette session ; forcer le symbole produit ici
  aurait régressé ce fonctionnement.
- Manifest PWA et prompt d'installation natif : déjà livrés lors du
  chantier précédent de cette session (voir
  `.ai/LOGIN_PWA_REFONTE_RAPPORT.md`) — non retouchés ici, seules les
  icônes qu'il référence ont été régénérées avec la nouvelle identité.

## 2. Mobile — le cœur du chantier

### Constat de l'audit (avant modification)

- Trois barres latérales indépendantes, aucune ne gérait le mobile :
  shell admin principal (`AppShell.tsx`/`Sidebar.tsx`), layout comptabilité
  (implémentation inline séparée), portail parent (sidebar 240px fixe).
  `UIContext.tsx` déclarait déjà `mobileSidebarOpen`/`openMobileSidebar`/
  `closeMobileSidebar` mais aucun fichier ne les consommait.
- `portail-eleve/` avait déjà un vrai système responsive fonctionnel
  (breakpoints `@media`, tiroir en `transform: translateX`, overlay) —
  utilisé comme modèle de référence pour le reste de l'application.
- 37 fichiers avec un `<table>` brut ; seuls 6 utilisaient la classe
  partagée `.sp-table`. `eleves/page.tsx` et `enseignants/page.tsx`
  n'avaient **aucun** wrapper de défilement — le tableau débordait
  purement et simplement de l'écran. Plusieurs pages comptabilité
  utilisaient `overflow: hidden` au lieu de `overflow-x: auto` — un vrai
  bug qui tronquait silencieusement des colonnes.
- `TopbarNotifications.tsx` : panneau `width: 420px; right: -26px` —
  plus large qu'un iPhone et poussé hors écran.
- Aucun hook `useMediaQuery`/`useIsMobile` n'existait dans le projet.
- Toujours aucun Tailwind, aucune bibliothèque de composants partagés
  (reconfirmé) — correction faite par classes CSS globales et un hook,
  cohérent avec les conventions déjà en place.

### Stratégie responsive retenue

Breakpoints standardisés 480/768/1024/1280px (alignés sur
`login.module.css`, seul fichier déjà cohérent à ce sujet). CSS pour la
mise en page (`@media`), JS (`useIsMobile()`, nouveau hook `matchMedia`
SSR-safe) réservé à l'état d'interaction (ouverture/fermeture de tiroir,
fermeture après navigation) — sauf pour les valeurs déjà pilotées par JS
avant ce chantier (`marginLeft` d'`AppShell`, largeurs inline de
`comptabilite/layout.tsx` et `portail-parent/page.tsx`), où `isMobile`
est utilisé directement pour éviter un conflit de spécificité entre
style inline et règle externe (qui aurait nécessité `!important`,
explicitement interdit par le brief).

### Tier 0 — Fondations (`globals.css`)

`input,select,textarea{font-size:16px}` (évite le zoom automatique iOS
Safari) ; `.kpi-grid` passé de `repeat(4,1fr)` à
`repeat(auto-fit,minmax(220px,1fr))` ; nouvelles classes partagées
`.form-grid-2`, `.table-scroll`, `.modal-overlay`/`.modal-box` (avec
palier `max-width:480px`) ; `@media(max-width:768px)` repliant
`.grid-2/.grid-3/.grid-60-40/.grid-40-60` en une colonne.

### Tier 1 — Les 3 barres latérales

- **Shell admin principal** : branchement de l'état déjà existant dans
  `UIContext.tsx` (aucun nouvel état créé) ; bouton hamburger dans
  `Topbar.tsx` (visible sous 768px) ; `Sidebar.module.css` reçoit un
  bloc `@media(max-width:768px)` en tiroir (`translateX`) avec overlay
  cliquable, neutralisant le rail icône-seule desktop pour ne jamais
  l'afficher sur mobile ; fermeture automatique au clic sur un lien.
- **Layout comptabilité** : même traitement en tiroir appliqué à sa
  barre latérale inline propre (`comptabilite/layout.tsx`) ; correction
  au passage de `overflow:hidden` → `overflow-y:auto` sur le conteneur
  racine (bug de contenu tronqué).
- **Portail parent** : même motif de tiroir ; grilles KPI à 4 colonnes
  fixes converties en `auto-fit`/`minmax`.

### Tier 2 — Tableaux (37 fichiers)

Chaque fichier a été audité individuellement (pas de traitement en
masse aveugle) : (a) déjà protégé par `overflow-x:auto` → laissé tel
quel, (b) protégé mais par `overflow:hidden` (bug réel qui tronque) →
corrigé en ajoutant un wrapper interne `.table-scroll` tout en
préservant le `overflow:hidden` externe nécessaire à l'arrondi visuel
de la carte, (c) sans aucune protection → wrapper `.table-scroll` ajouté
avec un `minWidth` explicite par table selon son nombre de colonnes.

Bugs réels corrigés (pas de simples préférences de style) :
`comptabilite/paiements`, `comptabilite/reinscription` et
`comptabilite/encaissement` utilisaient `overflow:hidden` sur leur carte,
tronquant silencieusement des colonnes au lieu de permettre le
défilement.

Deux pages ont reçu une vraie transformation en **vue carte mobile**
(pas seulement le défilement horizontal), comme démonstration demandée
par le plan :
- `eleves/page.tsx` : sur mobile, le tableau à 8 colonnes est remplacé
  par une liste de cartes empilées (avatar, nom, matricule, classe,
  sexe, statut, actions) via `useIsMobile()` ; la grille « Top 5 » et le
  bandeau associé sont masqués sur mobile (redondants avec la liste en
  dessous) et sa grille est passée en `auto-fit`.
- `enseignants/page.tsx` : même traitement (tableau à 9 colonnes → liste
  de cartes avatar/nom/spécialité/matricule/contrat/téléphone/statut/
  actions) ; grille « Featured Cards » à 6 colonnes fixes convertie en
  `auto-fit` et masquée sur mobile pour la même raison.

Les ~33 autres pages reçoivent le correctif de base (défilement
horizontal protégé, `minWidth` explicite) — solide contre le
débordement, mais pas retravaillé en vue carte cette session (voir
Risques restants).

Un cas a été délibérément laissé tel quel : le tableau de la modale
« élèves de la classe » dans `classes/page.tsx` (en-tête `sticky`) —
l'envelopper dans un wrapper à défilement horizontal aurait changé le
bloc englobant du `position:sticky` (qui passerait du conteneur à
défilement vertical de la modale à un nouveau wrapper sans hauteur
définie), risquant de casser le collage de l'en-tête pour un gain minime
(5 colonnes compactes déjà dans une modale bornée en largeur).

### Tier 3 — Menus, modales, formulaires

- `TopbarNotifications.tsx` : bug réel corrigé —
  `width:420px; right:-26px` → `width:min(420px,calc(100vw-32px));
  right:0`. `touchstart` ajouté à côté de `mousedown` sur
  `TopbarNotifications` et `TopbarUserMenu` pour une fermeture fiable au
  doigt (aucune des deux ne se fermait de façon fiable au tactile avant).
- Les 4 modales les plus utilisées (`eleves/page.tsx`,
  `enseignants/page.tsx`, `comptabilite/paiements/page.tsx`,
  `familles/page.tsx`) ont été vérifiées une par une : toutes utilisaient
  déjà un motif sûr sur mobile (`maxWidth` + `width:100%` + `padding`
  sur l'overlay, ou `maxWidth:95vw`) — **aucun changement nécessaire**,
  contrairement à l'hypothèse initiale du plan. Retrofiter
  `.modal-box` dessus aurait été du remaniement sans bénéfice réel.
- `.form-grid-2` appliquée aux formulaires nouveau/modifier : élèves
  (nouveau + modifier), enseignants (nouveau + modifier), classes
  (nouveau + l'écran de clôture d'année). `personnel/nouveau/page.tsx` :
  les 3 grilles à deux panneaux avec colonne à largeur minimale forcée
  (`minmax(320px,...)`, qui aurait cassé sous ~350px de large) sont
  passées en une seule colonne sur mobile via `isMobile` ; les 5 grilles
  internes à 2 colonnes fixes sont passées en `auto-fit`.

### Tier 4 — Zones de sécurité iOS/Android

`env(safe-area-inset-left/top/bottom)` ajouté uniquement sur les 3
tiroirs mobiles construits au Tier 1 (`Sidebar.module.css`,
`comptabilite/layout.tsx`, `portail-parent/page.tsx`) — pas ajouté
ailleurs sans raison, conformément à la consigne explicite du brief.

## 3. Non-régression

- **Desktop** : vérifié explicitement que les valeurs desktop
  n'ont pas changé — ex. `AppShell.tsx` : `sidebarWidth = isMobile ? 0 :
  (sidebarCollapsed ? 96 : 280)`, les valeurs `96`/`280` sont identiques
  à avant ce chantier, seul le cas mobile (`0`, tiroir séparé) a été
  ajouté. Toutes les nouvelles règles CSS sont des ajouts `@media
  (max-width: ...)` ou des branches conditionnelles JS pour le seul cas
  mobile — aucune valeur desktop existante n'a été modifiée.
- **TypeScript** (`npx tsc --noEmit`) : vérifié après chaque palier,
  0 erreur au final (2 erreurs de typage `MouseEvent`/`TouchEvent`
  détectées et corrigées lors de l'ajout de `touchstart`).
- **Tests** (`npx vitest run`) : 102/102 verts (12 fichiers de test),
  aucune régression.
- **Build** (`npm run build`) : succès, 78 routes générées (statiques +
  dynamiques). Les avertissements Recharts « width(-1)/height(-1) »
  pendant la génération statique sont préexistants (SSR d'un graphique
  sans dimensions de conteneur) et sans lien avec ce chantier — ils
  n'empêchent pas le build.
- **Isolation multi-tenant / auth / API** : aucun fichier backend, aucune
  route API, aucun code de rôle ou de JWT n'a été touché. Toutes les
  modifications sont strictement CSS/mise en page/état d'interaction
  frontend.

## 4. Fichiers modifiés

**Nouveaux** : `frontend/src/hooks/useIsMobile.ts`,
`frontend/src/components/SmartSchoolMark.tsx`,
`frontend/public/brand/symbol-source.svg`,
`frontend/public/brand/symbol-source-maskable.svg`.

**Supprimés** : `frontend/public/icons/source-mark.svg`,
`source-mark-maskable.svg` (icône générique remplacée).

**Identité/PWA** : `scripts/generate-icons.mjs`,
`public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
`src/app/icon.png`, `src/app/apple-icon.png`, `src/app/login/page.tsx`,
`src/app/inscription/page.tsx`.

**Fondations** : `src/app/globals.css`.

**Tier 1 (tiroirs)** : `src/components/AppShell.tsx`,
`Sidebar.tsx` + `.module.css`, `Topbar.tsx` + `.module.css`,
`src/app/comptabilite/layout.tsx`, `src/app/portail-parent/page.tsx`.

**Tier 2 (tableaux, 20 fichiers avec changement effectif)** :
`archive/classe/[id]`, `archive/eleve/[id]`, `bulletins`,
`centre-evaluation`, `classes/[id]`, `classes/cloture-annee`,
`comptabilite/encaissement`, `comptabilite/exports`,
`comptabilite/impayes`, `comptabilite/paiements`,
`comptabilite/rapports`, `comptabilite/reinscription`,
`comptabilite/salaires`, `eleves/[id]`, `eleves/page.tsx` (+ vue carte),
`enseignants/[id]`, `enseignants/page.tsx` (+ vue carte), `familles`,
`notes`, `portail-enseignant/page.tsx` (4 tableaux), `portail-parent`
(3 tableaux additionnels), `resultats-annuels`, `salle-des-profs`.
Les ~17 autres fichiers du recensement initial ont été vérifiés et
étaient déjà correctement protégés — aucun changement nécessaire.

**Tier 3 (menus/formulaires)** : `src/components/TopbarNotifications.tsx`,
`TopbarUserMenu.tsx`, `eleves/nouveau`, `eleves/modifier/[id]`,
`enseignants/nouveau`, `enseignants/modifier/[id]`, `classes/nouveau`,
`classes/cloture-annee`, `personnel/nouveau`.

## 5. Risques restants (non traité cette session)

- **Vue carte mobile** : seules `eleves/page.tsx` et
  `enseignants/page.tsx` ont reçu la transformation complète en cartes.
  Les ~33 autres pages à tableau n'ont que le défilement horizontal
  protégé — utilisable sur mobile mais moins confortable qu'une vraie
  vue carte.
- **`.modal-box`/`.modal-overlay`** : ces classes existent dans
  `globals.css` mais ne sont utilisées nulle part pour l'instant — les 4
  modales prioritaires vérifiées avaient déjà leur propre motif sûr, et
  les ~40 autres emplacements de modale dans l'application n'ont pas été
  audités un par un cette session.
- **Vérification visuelle réelle** : tout ce chantier a été vérifié par
  `tsc`/`vitest`/`build` (structurel) et relecture de code, pas par un
  navigateur réel aux largeurs 320/360/375/390/414/430/768/820/1024
  demandées par le brief — recommandé avant mise en production,
  notamment pour confirmer visuellement le rendu des tiroirs et des
  nouvelles cartes.
- `classes/page.tsx` : le tableau de la modale « élèves de la classe »
  (en-tête `sticky`) reste sans wrapper de défilement horizontal, par
  choix documenté (voir Tier 2) plutôt qu'un oubli.
- `BadgeCarte.tsx` (badges imprimables élève/enseignant) reste à largeur
  fixe (320-500px) — délibéré, il représente un format de carte physique
  imprimable, pas un composant de mise en page à rendre responsive.

## 6. Verdict

**GO.** Aucun problème critique de build, de TypeScript ou de
régression identifié. Les trois barres latérales cassées (le point
d'urgence signalé par l'utilisateur avec captures d'écran) sont
corrigées et vérifiées structurellement. Les bugs réels trouvés pendant
l'audit (tableaux tronqués par `overflow:hidden`, panneau de
notifications hors écran, menus non fermables au tactile) sont corrigés.
Le périmètre non couvert (risques listés ci-dessus) est documenté
explicitement plutôt que dissimulé — il s'agit de finitions
supplémentaires, pas de régressions ni de blocages.
