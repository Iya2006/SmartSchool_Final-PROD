# Session du 25/09/2026 — Notification de mise à jour premium

## Contexte

Demande : notifier les utilisateurs directement dans l'application quand
une nouvelle version est déployée (plutôt que de compter sur le groupe
WhatsApp), avec un message premium, une case à cocher obligatoire pour
confirmer la lecture, puis un rechargement automatique. Doit fonctionner
aussi bien pour un utilisateur qui se reconnecte que pour un utilisateur
déjà en train d'utiliser l'app au moment du déploiement.

Analyse de faisabilité faite AVANT tout code (voir échange avec
l'utilisateur) : le Service Worker (`frontend/src/app/sw.ts`, Serwist)
est déjà configuré avec `skipWaiting`/`clientsClaim` — une mise à jour
prend déjà le contrôle d'un onglet ouvert en silence. Rien touché côté
Service Worker : le nouveau code se contente d'écouter l'évènement
`controlling` déjà exposé par `window.serwist` (auto-injecté par
`@serwist/next`), exactement comme le hook `useInstallPrompt.ts` existant
écoute déjà `beforeinstallprompt`.

Plan détaillé dans `C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`
avant implémentation (approuvé par l'utilisateur).

## Fichiers touchés (tous nouveaux, sauf `Providers.tsx`)

- `frontend/public/whats-new.json` (nouveau) — contenu du « quoi de
  neuf » : `version` + `titre` + `points` (liste à puces, en français
  clair pour un directeur d'école). **À mettre à jour à chaque session
  future avant de pousser**, en même temps que le rapport `.ai/*.md` —
  processus manuel assumé, pas automatisable (le contenu ne peut pas
  s'écrire seul à partir des commits Git).
- `frontend/src/hooks/useWhatsNew.ts` (nouveau) — même structure que
  `useInstallPrompt.ts` : compare `whats-new.json` à la dernière version
  accusée réception (`localStorage`), avec en plus un écouteur sur
  `window.serwist`'s `controlling` (`isUpdate: true`) pour le cas d'un
  utilisateur déjà en train d'utiliser l'app au moment du déploiement.
  Premier passage jamais vu → enregistre la version en silence, n'affiche
  rien (pas d'historique de changements avant la première utilisation).
- `frontend/src/components/WhatsNewModal.tsx` (nouveau) — modal premium
  (dégradé bleu/violet, motif déjà utilisé ailleurs dans l'app), liste des
  changements, case à cocher obligatoire, bouton « Continuer » désactivé
  tant qu'elle n'est pas cochée. Confirmation → `localStorage` mis à jour
  + `window.location.reload()`.
- `frontend/src/components/Providers.tsx` — montage de `<WhatsNewModal />`
  à côté de `<PostLoginSplash />` (même point d'entrée, sous
  `AuthProvider`) ; se gate elle-même sur `!showPostLoginSplash` pour ne
  jamais s'afficher en même temps que l'écran de bienvenue post-connexion.

## Vérifié réellement (pas juste en théorie)

- `tsc --noEmit` propre, 110/110 tests frontend.
- Test de bout en bout réel (backend + frontend locaux, connexion admin
  réelle) :
  - Version différente en storage → modal apparaît avec le bon contenu,
    bouton désactivé avant de cocher, activé après.
  - Confirmation → `localStorage` correctement mis à jour à la nouvelle
    version, page rechargée, **utilisateur toujours connecté** (reste sur
    `/dashboard`, pas renvoyé au login — confirme que « ça recharge et se
    reconnecte » fonctionne comme prévu), et le modal ne réapparaît plus.
  - Tout premier passage (aucune version jamais accusée réception) →
    aucun modal, version enregistrée en silence.
- **Non testé** : le déclenchement live via l'évènement `controlling` du
  Service Worker pendant une session déjà ouverte (nécessite un vrai
  build PWA + un second déploiement pendant que l'onglet reste ouvert —
  hors de portée du temps disponible cette session). Le code de ce
  déclencheur mime exactement le motif déjà prouvé de
  `useInstallPrompt.ts` (écoute d'un évènement navigateur réel, jamais de
  simulation), donc risque jugé faible, mais à confirmer par l'utilisateur
  lors d'un vrai déploiement.

## Rien poussé sur `origin/IYA`

Comme pour chaque session — en attente de confirmation explicite avant le
push.
