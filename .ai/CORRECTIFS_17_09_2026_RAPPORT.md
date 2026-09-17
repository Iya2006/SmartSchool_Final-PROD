# Session du 17/09/2026 — nouveau logo + écrans de démarrage premium

## Contexte

L'utilisateur a fourni un nouveau logo SmartSchool (blason dégradé bleu :
toque, ruban « S », livre — plus le mot-symbole et la signature « La
gestion Scolaire Intelligente »). Objectif : le faire servir partout — le
favicon du navigateur, l'icône de l'app installée en PWA, et deux écrans
de démarrage animés premium (~3s chacun, durée revue à la baisse avec
l'utilisateur — la demande initiale de 50s aurait été pénible à l'usage
quotidien).

## Fichiers touchés

**Images sources** (`frontend/public/brand/`) :
- `logo-mark.png` (nouveau) — blason seul, recadré depuis le JPEG fourni,
  placé sur un canevas carré blanc avec marge de sécurité ~16% (variante
  maskable). Source de vérité pour toutes les icônes.
- `logo-full.png` (nouveau) — lockup complet (blason + texte), pour
  l'écran de démarrage au boot.
- `symbol-source.svg` / `symbol-source-maskable.svg` — **conservés sur
  disque, non supprimés**, mais plus référencés par le script de
  génération (ancien symbole 3-barres, remplacé).

**Génération d'icônes** :
- `frontend/scripts/generate-icons.mjs` — adapté pour lire une source
  raster (`logo-mark.png`) au lieu des SVG (le nouveau logo, style
  illustratif à dégradés, ne se vectorise pas proprement). Même structure
  de sortie qu'avant (5 fichiers). Relancé — régénère :
  `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `src/app/icon.png`, `src/app/apple-icon.png`. `manifest.json` n'a pas eu
  besoin d'être modifié (mêmes chemins).

**Écrans de démarrage** (nouveaux fichiers) :
- `frontend/src/components/BrandSplash.tsx` — présentation partagée
  (animation framer-motion, fond blanc, logo + barre de progression),
  paramétrée par `variant: 'boot' | 'postLogin'`.
- `frontend/src/components/BootSplash.tsx` — écran à l'ouverture de l'app,
  monté en frère de `Providers` dans `layout.tsx` (même motif que
  `ProtectionNavigateur` déjà en place) — overlay pur, ne retarde rien du
  reste de l'arbre.
- `frontend/src/components/PostLoginSplash.tsx` — écran juste après une
  connexion réussie, monté à l'intérieur de `AuthProvider` (via
  `Providers.tsx`, même motif que `Toaster`) car il consomme `useAuth()`.

**Modifiés** :
- `frontend/src/context/AuthContext.tsx` — ajout de l'état
  `showPostLoginSplash` (+ setter), activé dans `login()` uniquement
  (ligne juste avant le `router.push` existant) — pas touché au second
  `useEffect` de garde (rechargement de page déjà connecté), qui ne doit
  pas redéclencher l'écran de bienvenue.
- `frontend/src/components/Providers.tsx` — montage de `PostLoginSplash`.
- `frontend/src/app/layout.tsx` — montage de `BootSplash`.

## Non touché, volontairement

- `frontend/src/components/SmartSchoolMark.tsx` (glyphe « 3 barres »
  utilisé en badge sur `/login`) — pas dans la demande initiale (favicon +
  icône PWA + 2 écrans uniquement). Signalé à l'utilisateur : il pourra
  vouloir l'harmoniser avec le nouveau logo dans un chantier séparé.

## Vérifié

- `tsc --noEmit` propre (avant et après l'ajustement du fond).
- 110/110 tests frontend.
- `npm run build` propre (aucune erreur/avertissement).
- Vérification visuelle réelle (Chromium headless, captures d'écran) du
  recadrage du logo à plusieurs tailles (884px source, 512px, 192px) et
  du rendu de l'écran de démarrage en conditions réelles (`/login`) — la
  transition se fait proprement, le fond a été ajusté en blanc pur après
  un premier essai en dégradé qui laissait voir le contour carré du logo.
- Écran B (post-login) vérifié par lecture de code et `tsc` seulement —
  pas testé en conditions réelles (nécessite un compte + un backend actif
  pour se connecter), à confirmer par l'utilisateur lors d'un test manuel.

## Rien poussé sur `origin/IYA`

Comme pour chaque session — en attente de confirmation explicite avant le
push.
