# Correctifs du 16/08/2026 (round 2) — fichiers touchés

Deux volets, purement front-end sauf indication contraire. Vérifié :
`tsc` propre, tests frontend verts, build Turbopack propre (toutes les routes).

## Round A — polish et bugs signalés

1. **Cartes classes (survol)** — `frontend/src/app/classes/page.tsx` : boutons
   Profil/Configurer redessinés (pleine largeur, hiérarchie visuelle claire :
   Configurer en blanc plein, Profil en contour).
2. **Mot de passe (élève/enseignant/parent)** — vérifié dans les 3 portails :
   déjà fonctionnel de bout en bout (UI + `PUT .../changer-mot-de-passe` +
   hash bcrypt réel). Aucune modification.
3. **Badge carte enseignant affichait "ÉLÈVE"** — `frontend/src/app/portail-enseignant/page.tsx` :
   `role: 'ENSEIGNANT'` injecté explicitement dans l'objet passé à
   `BadgeCarte` (même pattern que côté admin, `enseignants/[id]/page.tsx`).
4. **Page profil portail enseignant décalée à gauche** — même fichier :
   `margin: '0 auto'` ajouté au conteneur `maxWidth: 700px`.
5. **Page profil portail parent** — vérifiée, pas de bug équivalent (pas de
   `maxWidth` du tout). Aucune modification.

## Round B — audit mobile (375-430px)

**Dropdown notifications ouvrait hors-écran** — cause réelle : mauvais point
d'ancrage (`right:0` calculé depuis le petit wrapper de la cloche, décalé
d'environ 92px du vrai bord droit par le menu utilisateur juste à côté), pas
un problème de largeur.
- `frontend/src/components/Topbar.module.css` — `position: relative` déplacé
  sur `.actions` (le vrai conteneur flush à droite).
- `frontend/src/components/TopbarNotifications.tsx` — `position: relative`
  retiré du wrapper de la cloche.

**Dashboard admin** (`frontend/src/app/dashboard/page.tsx`) — 3 grids à
colonnes fixes (`repeat(4,...)`, `1.1fr 1fr 1fr`, `1.1fr 0.9fr 1fr`) passées
en 1-2 colonnes sous `isMobile`.

**Profil admin** (`frontend/src/app/profil/page.tsx`) — `fontSize:'14px'`
retiré de 9 champs de saisie (écrasait la règle globale anti-zoom iOS,
16px) ; padding du hero et rangée de boutons rendus responsives.

**Profils classe/enseignant/élève (admin)** :
- `classes/[id]/page.tsx` — deux grids `minmax(420px/350px,...)` réduites à
  280px ; ligne Top 10 resserrée (noms/scores/bouton rétrécis).
- `classes/configurer/[id]/page.tsx` — `flexWrap` ajouté sur les chips.
- `enseignants/[id]/page.tsx` — header sans wrap corrigé.
- `eleves/[id]/page.tsx` — grid 2 colonnes fixe (le cas le plus critique,
  aucun point de rupture) passée en 1 colonne sous `isMobile` (hook ajouté) ;
  header sans wrap corrigé.

**Paramètres** — 10 des 11 pages déjà bien traitées lors d'un chantier
antérieur (breakpoints dédiés). Un seul correctif réel :
`parametres/notation/page.tsx` (grille "Calcul du Classement") +
`parametres/finance/Finance.module.css` (`.reductionRow`, media query ajoutée).

**Portail enseignant** (`frontend/src/app/portail-enseignant/page.tsx`,
`isMobile` déjà en place depuis la sidebar) — la plus grosse passe :
- Hero banner profil : colonne sur mobile au lieu d'une ligne à 3 blocs.
- Grid messages `380px 1fr` → 1 colonne si `isMobile`.
- Modale détail évaluation (barre de stats) : `flexWrap` ajouté.
- 5 grids `1fr 1fr` (infos perso, dashboard, paramètres, formulaires
  documents/liens) → 1 colonne sous `isMobile` (hook ajouté aux composants
  `DocumentsTab`/`LiensExternesTab`, distincts du composant principal).
- 7 tables sans `minWidth` dans leur wrapper `overflowX:auto` (se
  compressaient au lieu de défiler) → `minWidth: 600px` ajouté.
- 3 en-têtes titre+bouton sans `flexWrap` → corrigés.

## Non traité / signalé sans y toucher

- `classes/[id]/page.tsx` : bandeau hero (4 badges stats) — a déjà
  `flexWrap`, tient mais reste serré sur 375px. Pas de bug bloquant.
- `enseignants/[id]/page.tsx` et `eleves/[id]/page.tsx` : modales QR Code,
  `padding:'40px'` fixe — tient mais marge réduite sous 375px. Mineur.
- `parametres/securite/page.tsx` : grille `1fr 1fr` dans la modale "Créer un
  rôle" — négligeable (modale déjà contrainte à 420px).
