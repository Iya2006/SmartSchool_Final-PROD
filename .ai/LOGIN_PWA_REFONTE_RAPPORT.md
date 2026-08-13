# Refonte commerciale de la page de connexion + PWA installable

Le 13/08/2026, suite à un brief détaillé de l'utilisateur : transformer
`/login` en vitrine commerciale de SmartSchool (identité forte, message
clair, UX premium) et rendre le PWA réellement installable, sans toucher
au backend, aux API, au JWT, aux rôles ni aux règles multi-écoles.

## Méthodologie

2 agents Explore en parallèle (lecture seule) — l'un sur la page de
connexion et le flux d'authentification, l'autre sur le PWA (manifest,
service worker, icônes, logo) — suivis d'une lecture directe des fichiers
concernés. Deux décisions produit posées à l'utilisateur via
`AskUserQuestion` avant tout plan (aucun logo statique SmartSchool
n'existe dans le dépôt ; aucune fonctionnalité mot de passe oublié
n'existe) : garder le repli visuel déjà en place (icône `ShieldCheck`),
et faire du lien "mot de passe oublié" un message informatif plutôt
qu'une fausse fonctionnalité ou un lien mort. Plan Mode ensuite, plan
approuvé avant toute écriture de code.

## Audit — état réel avant modification

- `/login` avait déjà une structure deux-zones (hero marketing + panneau
  formulaire), pas un formulaire nu — le travail était une réécriture de
  contenu + un vrai système responsive, pas une création ex nihilo.
- Seul point responsive existant : un `<style>` injecté ciblant
  `div[style*="grid-template-columns: ..."]` (sélecteur sur le contenu
  littéral d'un attribut `style`, un seul breakpoint à 1080px) — fragile,
  aucune gestion clavier virtuel / safe-area / tablette.
- `/login/ecole` (connexion enseignant/parent avec code établissement)
  déjà simple, à une colonne, `100vh` + `clamp()`.
- `public/manifest.json` existait mais n'était lié nulle part (aucun
  `<link rel="manifest">`, aucun `metadata.manifest`) — l'app n'était
  probablement pas installable du tout, indépendamment du contenu du
  manifest.
- Icônes du manifest : les deux tailles pointaient vers
  `guinea_coat_of_arms.png` (emblème national guinéen, pas une icône
  SmartSchool), qui est en réalité un JPEG malgré son extension `.png`.
  Aucune icône maskable. `start_url: "/dashboard"` inadapté pour un
  visiteur non connecté.
- Aucun code `beforeinstallprompt` nulle part.
- Service worker (Serwist, `next.config.ts` + `src/app/sw.ts`) déjà
  fonctionnel et actif en production — non touché.
- Aucun logo statique "SmartSchool" : chaque école a le sien (upload
  admin), avec repli `ShieldCheck` (lucide-react) déjà utilisé sur
  `/login` pour incarner la marque SmartSchool.
- Aucune fonctionnalité mot de passe oublié (front ou back).
- Aucune bibliothèque de composants UI dans le projet (pas de Tailwind,
  pas de `Button`/`Input` réutilisables) — tout en styles inline.

## Contenu commercial (`/login`)

Titre, sous-titre et signature de marque repris du brief :
- « Votre école. Toute sa gestion. Un seul espace. »
- « SmartSchool centralise les élèves, les enseignants, les finances, les
  évaluations, la vie scolaire et l'administration pour vous permettre de
  piloter votre établissement avec clarté. »
- « Pilotez votre école. Simplement. » (signature courte choisie entre
  les deux propositions du brief — la priorité mobile section 8 du brief
  exige un message court).
- 3 bénéfices repris tels que fournis en exemple dans le brief : « Une
  gestion plus simple », « Une vision claire », « Une école mieux
  organisée ».
- Bouton « Se connecter » (remplace « Accéder à mon espace »).
- Lien « Mot de passe oublié ? » → panneau informatif (« Contactez
  l'administration de votre établissement ») — aucun appel serveur.
- Logique de soumission (`api.post('/api/auth/login', ...)`,
  `useAuth().login()`, gestion d'erreur) strictement inchangée.

## Responsive — remplace le hack par un vrai système

Nouveau `frontend/src/app/login/login.module.css`, mobile-first, 5
paliers sans règles contradictoires empilées :
- **< 480px (mobile étroit)** : une colonne, hero réduit à logo +
  signature courte uniquement (pas de titre géant, pas de cartes —
  conforme à la priorité mobile du brief : Logo → message → connexion →
  mot de passe oublié).
- **≥ 480px** : mêmes proportions, plus d'air.
- **≥ 768px (tablette portrait)** : titre/sous-titre/bénéfices
  réapparaissent, toujours empilés.
- **≥ 1024px (tablette paysage)** : bascule deux colonnes.
- **≥ 1280px (desktop)** : mise en page pleinement déployée.

Détails transverses : `min-height: 100dvh` (pas `100vh` fixe — le contenu
suit un flux naturel plutôt qu'un centrage forcé qui couperait le bouton
sous clavier virtuel), `padding: max(16px, env(safe-area-inset-*))` pour
les safe areas iOS, cibles tactiles ≥44px, `:focus-visible` ajouté sur
champs/boutons (absent avant). `/login/ecole` reçoit le même traitement
léger (`100dvh`, safe-area, cibles tactiles) sans nouvelle zone marketing
(redondant juste après l'écran précédent).

## PWA — manifest, icônes, installation

- `frontend/src/app/layout.tsx` : `manifest: '/manifest.json'` et
  `appleWebApp` ajoutés à `metadata` ; `themeColor` déplacé dans un
  nouvel export `viewport` (déprécié sur `Metadata` depuis Next 14+,
  confirmé par lecture directe des types Next 16 installés).
- Icônes **réellement générées**, pas de simple référence SVG : SVG
  source écrit à la main
  (`frontend/public/icons/source-mark.svg`/`-maskable.svg`) reprenant le
  path exact de l'icône `ShieldCheck` trouvé dans
  `node_modules/lucide-react/dist/esm/icons/shield-check.js` (licence
  ISC, déjà une dépendance) sur un badge dégradé navy→bleu identique au
  badge déjà utilisé dans l'app — rastérisées en PNG via un script
  ponctuel (`frontend/scripts/generate-icons.mjs`, `sharp`, déjà présent
  en dépendance transitive, aucune installation nécessaire) :
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (zone de
  sécurité ~80% respectée), plus `src/app/icon.png` et
  `src/app/apple-icon.png` (convention de fichiers Next, remplacent le
  favicon générique du template `create-next-app`, retiré).
- `public/manifest.json` : `start_url` `/dashboard` → `/login` (un
  visiteur non connecté n'a aucune utilité à être déposé sur
  `/dashboard`), `scope: "/"` ajouté, tableau `icons` remplacé par les 3
  PNG générés (`purpose: "any"` ×2, `purpose: "maskable"` ×1).
- Nouveau hook `frontend/src/hooks/useInstallPrompt.ts` : écoute le vrai
  événement `beforeinstallprompt` et `appinstalled`, aucune simulation —
  si l'événement ne se déclenche jamais, rien ne s'affiche. Bouton
  « Installer SmartSchool » sur `/login`, visible uniquement si
  disponible.
- Non touché : `src/app/sw.ts`, `next.config.ts` (Serwist déjà
  fonctionnel), tout fichier backend.

## Fichiers touchés

- **Nouveaux** : `frontend/src/app/login/login.module.css`,
  `frontend/src/hooks/useInstallPrompt.ts`,
  `frontend/public/icons/source-mark.svg`,
  `frontend/public/icons/source-mark-maskable.svg`,
  `frontend/public/icons/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `frontend/scripts/generate-icons.mjs`,
  `frontend/src/app/icon.png`, `frontend/src/app/apple-icon.png`.
- **Modifiés** : `frontend/src/app/login/page.tsx`,
  `frontend/src/app/login/ecole/page.tsx`, `frontend/src/app/layout.tsx`,
  `frontend/public/manifest.json`.
- **Supprimé** : `frontend/src/app/favicon.ico` (favicon générique du
  template `create-next-app`, remplacé par `icon.png`).
- **Non touchés, volontairement** : `AuthContext.tsx`, `lib/api.ts`,
  `lib/roleAccess.ts`, `AppShell.tsx` (chemins `/login`/`/login/ecole`
  inchangés, `FULLSCREEN_PATHS` reste valide tel quel), `src/app/sw.ts`,
  `next.config.ts`, tout le backend.

## Tests exécutés

- `npx tsc --noEmit` : propre.
- `npx vitest run` : 102/102 (aucun test existant ne couvrait les pages
  de login d'après l'audit — aucune régression de test attendue ni
  observée).
- `npm run build` (`next build --webpack`) : réussi — confirme au passage
  la génération du service worker Serwist et les nouvelles routes
  `icon.png`/`apple-icon.png`.
- `eslint` sur les fichiers touchés : 0 erreur (1 avertissement
  préexistant `no-img-element` sur le `<img>` du logo par école — même
  motif déjà utilisé ailleurs dans l'app pour des images servies par
  l'API, pas une régression).
- Inspection directe du HTML généré pour `/login`
  (`.next/server/app/login.html`) : `rel="manifest" href="/manifest.json"`,
  `rel="icon" href="/icon.png"`, `apple-touch-icon` et `theme-color`
  tous présents et corrects.
- Vérification physique : les 3 fichiers icônes référencés dans le
  manifest existent réellement sur disque (`public/icons/`), aucune
  référence cassée.

## Non vérifié

Rendu visuel réel dans un vrai navigateur — aucun outil d'automatisation
disponible cette session. Vérifications manuelles recommandées à
l'utilisateur :
- Tailles d'écran : 320px, 375px, 390px, 430px, tablette portrait/
  paysage, desktop — confirmer qu'aucun texte n'est coupé, qu'aucun
  élément ne déborde horizontalement.
- États : formulaire vide, identifiant seul, mot de passe seul, erreur de
  connexion (mauvais identifiant/mot de passe), chargement, connexion
  réussie, clavier mobile ouvert (le bouton "Se connecter" ne doit pas
  être masqué).
- PWA : ouvrir Chrome DevTools → Application → Manifest (aucune erreur),
  déclencher l'installation (bouton "Installer SmartSchool" doit
  apparaître), confirmer l'icône correcte après installation.
- Bascule clair/sombre non concernée (le login n'a pas de thème sombre
  dédié, hors périmètre de cette tâche).

## Verdict

**GO, sous réserve de la vérification visuelle utilisateur ci-dessus.**
Contenu commercial conforme au brief (titre/sous-titre/signature/3
bénéfices imposés), système responsive réel remplaçant un hack fragile
(5 paliers mobile-first, safe-area, clavier virtuel géré), PWA
effectivement installable pour la première fois (manifest enfin lié,
icônes SmartSchool réelles au lieu de l'emblème national mal étiqueté),
bouton d'installation basé sur le vrai `beforeinstallprompt` sans aucune
simulation. Authentification, rôles, routes et backend strictement
inchangés — vérifié par relecture directe après modification, pas
seulement par absence de diff. `tsc`/`vitest`/`build`/`eslint` tous
verts.
