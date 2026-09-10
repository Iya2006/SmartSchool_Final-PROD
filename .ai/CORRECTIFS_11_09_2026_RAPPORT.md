# Correctifs du 11/09/2026 — fichiers touchés

## 0. Synchronisation

Branche `IYA` mise à jour en fast-forward pur vers `main` (`2154d13`), aucune
modification — toute l'histoire de `IYA` était déjà un ancêtre de `main`.
156 fichiers reçus du collaborateur (maternelle, cartes/QR, pointage,
vie scolaire, tests de charge...). Rien poussé vers `origin/IYA` (demande
explicite : mise à jour locale uniquement).

## 1. Bug réel — bulletins d'une année passée introuvables

**Cause** : `GET /api/portail-enseignant/referentiels/trimestres` ignorait
totalement l'année demandée, renvoyait toujours les trimestres de l'année
COURANTE. Un correctif précédent (`7bc6689`) avait bien fait suivre la liste
des CLASSES à l'année choisie dans l'en-tête, mais pas la liste des
trimestres — donc changer d'année scolaire faisait toujours échouer la
recherche de bulletin (mauvais `trimestre_id` envoyé), symptôme :
« Aucun bulletin disponible ».

- `backend/app/api/portail_enseignant.py` — paramètre `annee_id` optionnel
  ajouté à `get_trimestres`, appartenance à l'établissement vérifiée
  explicitement quand fourni (réutilise le calque etablissement déjà en
  place, pas de nouveau mécanisme).
- `frontend/src/app/bulletins/page.tsx` — envoie désormais `annee_id`.
- `frontend/src/app/notes/page.tsx` — même correctif (même endpoint, même
  bug latent, même risque) : appliqué par cohérence.
- `frontend/src/app/portail-enseignant/page.tsx` — **non touché** : ce
  portail n'a pas de sélecteur d'année (l'enseignant travaille dans l'année
  courante uniquement), le comportement par défaut y est déjà correct.

## 2. Page Fournitures — aucun traitement mobile (jamais fait)

`frontend/src/app/fournitures/page.tsx` :
- Barre latérale (300px fixe) transformée en tiroir sous 768px (`useIsMobile`,
  overlay, bouton pour l'ouvrir depuis le contenu principal).
- En-tête (titre + bouton) : `flexWrap` ajouté.
- Ligne d'article (colonnes fixes en px) : enveloppée dans `.table-scroll`
  avec `minWidth: 640px` plutôt que de risquer un écrasement.
- Modale : grilles `1fr 1fr` / `1fr 1fr 1fr` remplacées par `.form-grid-2`
  et `auto-fit minmax(140px,...)` ; padding réduit sur mobile ; hauteur
  maximale + défilement ajoutés (clavier mobile).

## 3. Centre des Examens (centralisation des notes) — grille trop large

`frontend/src/app/centre-evaluation/page.tsx` :
- Grille des sujets : `minmax(360px,...)` (plus large qu'un écran de
  téléphone, cause du débordement horizontal signalé) → `minmax(min(280px, 100%),...)`.
- Rangée d'actions des cartes (4 boutons depuis l'ajout récent du bouton
  Supprimer) : `flexWrap` ajouté.
- Modale « Demander les sujets » : grille `1fr 1fr` → `.form-grid-2`.

## 4. Résultats de fin d'année

`frontend/src/app/resultats-annuels/page.tsx` :
- Deux tableaux (saisie admis/non-admis, classement annuel) : `minWidth`
  ajouté (700px / 900px) + classe `.table-scroll` — se compressaient au
  lieu de défiler.
- `useIsMobile` ajouté : padding du conteneur racine, largeur du sélecteur
  de classe, paddings de la modale de vérification d'import réduits sur
  mobile.

## 5. Bulletins — aperçu visuel jamais traité, corrigé sans toucher à l'impression

`frontend/src/app/bulletins/page.tsx` : l'aperçu (lignes 545-869) est un
document pensé pour l'impression (largeur A4 fixe 794px), qui sert aussi de
base à `handlePrint` (capture `innerHTML` du même nœud). Le recomposer pour
mobile aurait risqué de désynchroniser l'aperçu de ce qui s'imprime
réellement.

**Solution retenue** : réduction à l'échelle (comme un lecteur de document),
proportions identiques, juste affiché plus petit — pas de recomposition.
- `frontend/src/app/globals.css` — nouvelles classes `.document-preview`
  (transform scale sous 768px, deux paliers) et `.document-preview-scroll`
  (masque l'espace vide latéral laissé par la réduction).
- Le `transform` est posé sur le nœud `printRef` lui-même : `handlePrint`
  lit `printRef.current.innerHTML`, qui ne contient PAS le style de ce
  nœud — l'impression n'est donc pas affectée (vérifié en lisant
  `handlePrint` avant de choisir cette solution).

**Non touché, volontairement** : `frontend/src/app/portail-eleve/components/EleveBulletin.tsx`
(bulletin vu par l'élève/parent) — déjà dans un état correct (tableau des
notes avec défilement horizontal, grilles `auto-fit`, `flexWrap`), même
niveau que les autres tableaux denses de l'application. Pas de risque à
prendre pour un gain marginal.

## Vérifié

`tsc` propre, 110/110 tests frontend, build propre (le cache `.next/`
contenait deux erreurs fantômes sur des pages supprimées par la fusion,
résolues par un rebuild). Tests backend en cours au moment de la rédaction
de ce rapport (voir mise à jour si nécessaire).
