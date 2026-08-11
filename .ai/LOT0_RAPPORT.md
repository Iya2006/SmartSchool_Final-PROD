# LOT 0 — Identité JWT — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/core/auth.py` — ajout de deux dependencies : `get_current_establishment` (retourne l'établissement du token, ou `None` sans jamais inventer de valeur) et `require_etablissement` (identique mais lève `403` si `None` — prête à l'emploi pour les lots 1-11, pas encore branchée sur une route métier).
- `backend/app/api/auth.py` — `unified_login` : ajout de `etablissement_id` dans `token_data` pour les 4 branches (Utilisateur, Enseignant, Parent, Eleve) ; nouvelle fonction `_derive_parent_etablissement` (dérivation via `EleveParent → Eleve`, jamais de `.first()` — retourne `None` si 0 ou ≥2 établissements distincts) ; `/api/auth/me` expose désormais `etablissement_id`.

## Fichiers non modifiés
Tout le reste — aucune route métier (`eleves.py`, `finance.py`, `comptabilite.py`, etc.), aucun fichier frontend, aucune migration Supabase, aucun changement de schéma. `LoginRequest` (Pydantic) est inchangé : un `etablissement_id` envoyé dans le body du login est silencieusement ignoré (champ inconnu), vérifié explicitement par un test dédié.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot0_jwt_etablissement.py` — **13 tests**, tous verts : Utilisateur école A/B, SUPER_ADMIN (`etablissement_id=NULL` explicite), Enseignant, Eleve, Parent mono-école, Parent multi-écoles (vérifie l'absence de `.first()` arbitraire), Parent sans enfant, ancien token sans le champ (géré proprement, jamais défaulté à `1`), `get_current_establishment`/`require_etablissement` testés directement, tentative d'injection de `etablissement_id` dans le body du login (ignorée).
- Suite backend complète : `pytest tests/ -v` → **159 passed, 10 skipped** (skips = tests nécessitant un vrai Redis, comportement normal hors Docker Compose complet), **0 échec**.
- Frontend (non concerné par ce lot, vérifié par prudence) : `tsc --noEmit` → 0 erreur ; `npm run test:run` → **102/102** (un premier passage a rencontré des timeouts de démarrage de workers vitest, infra locale, sans rapport avec le code — confirmé par un second passage entièrement vert).

## Résultats
Aucune régression. Les 4 types de comptes obtiennent désormais un `etablissement_id` dérivé côté serveur, jamais reçu du client. Le cas SUPER_ADMIN plateforme (`NULL`) et le cas Parent multi-écoles (`NULL` par absence de choix arbitraire) sont distincts et documentés en commentaire dans le code — aucune route ne peut aujourd'hui interpréter ce `NULL` comme "aucune restriction" puisqu'aucune route métier n'a encore été branchée sur `get_current_establishment`/`require_etablissement` (c'est l'objet des lots 1 à 11).

## Problèmes trouvés
Aucun problème structurel imprévu. Point remarqué en cours d'implémentation, sans action requise au Lot 0 : le `/health` public et toutes les routes métier actuelles restent inchangées et continuent d'utiliser exclusivement `get_current_user`/`require_roles` — c'est attendu, `get_current_establishment`/`require_etablissement` ne sont utilisées nulle part encore.

## Problèmes corrigés
Aucun (aucune anomalie structurelle rencontrée dans ce lot).

## Problèmes restants
- Les anciens tokens émis avant ce déploiement (durée de vie 8h) n'auront pas `etablissement_id` tant qu'ils n'expirent pas — sans impact aujourd'hui car aucune route ne l'exige encore.
- Le comportement exact d'un SUPER_ADMIN souhaitant agir "au nom" d'une école précise reste hors périmètre (noté dans le code de `require_etablissement`) — à traiter explicitement si/quand ce besoin apparaît dans un lot ultérieur.

## Verdict
**GO pour le Lot 1 (Comptabilité)**, sous réserve de validation par l'utilisateur.
