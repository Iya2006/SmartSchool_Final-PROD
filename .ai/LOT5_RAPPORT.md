# LOT 5 — Communication — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/models/academique.py` — `Message` et `DemandeEmploi` gagnent `etablissement_id` (NOT NULL).
- `backend/app/api/communication.py` — 928 → ~1090 lignes, **toutes les 19 routes** auditées et corrigées.
- `backend/app/api/finance.py` — 2 correctifs ciblés : comblement du gap documenté au Lot 2 (`/salaires/alertes/historique` + les 2 créations de `Message` associées).
- `backend/app/api/examens.py` — 4 correctifs ciblés : les 4 créations de `Message` (dont le gap documenté au Lot 4, `publier_emploi_examen`).
- `backend/app/api/portail_parent.py`, `portail_enseignant.py`, `portail_eleve.py` — correctifs minimaux et obligatoires (voir plus bas), pas une correction complète de ces fichiers (hors périmètre de ce lot).

## Migration Supabase exécutée
`backend/migrations/lot5_communication_etablissement.py` — `ss_demandes_emploi` et `ss_messages` : `etablissement_id` ajouté (NOT NULL) aux deux. Tables réellement vérifiées vides au moment de l'exécution, aucun backfill nécessaire.

## La fuite la plus sévère de l'audit initial : `GET /parents-list`

Avant ce lot : **aucune restriction de rôle** au-delà de `get_current_user` (n'importe quel compte authentifié — élève, enseignant, parent — pouvait y accéder), et **aucun filtre d'établissement** : la route retournait l'annuaire complet de tous les parents de toute la plateforme (nom, téléphone, email, profession, et la liste de leurs enfants avec classe). Corrigé en deux temps :
1. **Rôle** : restreint aux comptes admin-tier (`_require_admin`).
2. **Établissement, avec gestion explicite du Cas B** : `Parent` n'a pas de colonne établissement — le roster est dérivé strictement des **élèves de cet établissement** (`Eleve.etablissement_id == etablissement_id` → `EleveParent` → `Parent`). Un parent ayant des enfants dans plusieurs écoles apparaît dans chaque école concernée, mais **n'expose jamais, à une école donnée, les enfants qu'il a dans une autre école** — vérifié par un test dédié (`test_cas_b_parent_multi_ecoles_jamais_de_fuite_croisee`).

Même traitement appliqué à `GET /parents/annuaire` (répertoire paginé, même fuite) et `GET /parents/stats` (comptages désormais scopés).

## Autres corrections notables

- **`POST /messages-parents`** : `destinataire_type="TOUS_PARENTS"` partait auparavant vers tous les parents de toute la plateforme (Message sans colonne établissement) — désormais tagué avec l'établissement de l'expéditeur, et interprété comme "tous les parents de CET établissement" partout où ces messages seront un jour lus côté portail parent. Un `destinataire_id` (parent ou classe) est désormais vérifié appartenir à cet établissement avant l'envoi.
- **`GET/POST /messages`** : aucun filtre d'établissement, et le paramètre `enseignant_id` permettait à un enseignant de lister explicitement la messagerie d'un collègue — corrigé (étab + un enseignant ne voit jamais que sa propre messagerie).
- **`POST /disponibilites`** : un enseignant pouvait soumettre des disponibilités au nom d'un collègue (`enseignant_id` non vérifié) — corrigé, plus vérification que les classes référencées appartiennent à l'établissement.
- **`GET /disponibilites/enseignant/{id}`** : IDOR direct (aucune vérification) — corrigé (ownership + admin bypass).
- **`PUT /disponibilites/{id}/valider|rejeter`**, **`PUT /disponibilites/valider-tout/{demande_id}`**, **`POST /demandes/{id}/generer-emplois`** : aucun filtre d'établissement — tous corrigés, restreints aux admin-tier.
- **`GET/POST /demandes`**, **`GET /demandes/{id}`** : aucun filtre — corrigés, restreints aux admin-tier.
- **`POST /demandes`** : `classes_concernees` (liste de classe_id) désormais vérifiée appartenir à l'établissement quand elle est fournie explicitement (pas juste `"TOUTES"`).

## Effet de bord obligatoire : tous les sites créant un `Message` ou une `DemandeEmploi`

Passer `Message.etablissement_id` en NOT NULL **casse immédiatement** toute création de message qui ne le renseigne pas. Un grep exhaustif (`Message(` dans tout `backend/app/api/`) a été fait pour trouver et corriger **tous** les sites, pas seulement ceux de `communication.py` :
- `finance.py` (2 sites : rappel de paiement aux parents, alerte de paie) — `etablissement_id` déjà disponible via `Depends(require_etablissement)` (Lot 2).
- `examens.py` (4 sites : dépôt de sujet, envoi de sujet, rejet de sujet, publication d'emploi d'examen) — `etablissement_id` déjà disponible (Lot 4). La publication d'emploi d'examen était précisément le gap documenté au Lot 4.
- `portail_enseignant.py` (1 site : signalement d'enfant) — dérivé directement via `Enseignant.etablissement_id`.
- `portail_eleve.py` (1 site : message élève→admin) — dérivé directement via `Eleve.etablissement_id`.
- `portail_parent.py` (1 site : message parent→admin) — **cas non trivial** : `Parent` n'a pas d'établissement direct. Un helper `_etablissement_du_parent` (même logique Cas A/Cas B que `_derive_parent_etablissement` du Lot 0) a été ajouté ; en Cas B (ou parent sans enfant), la route renvoie désormais un **409 explicite** ("contactez chaque école séparément") plutôt que de planter ou de choisir arbitrairement.
- `activites.py` et `evenements.py` référencent un modèle `SsMessage` qui **n'existe pas** dans les modèles (`ImportError` avalé par un `try/except` déjà présent) — code déjà mort avant ce lot, sans rapport avec `Message`, non touché (hors périmètre).

Ce périmètre élargi aux fichiers portails n'est pas un audit complet de ces fichiers (prévu dans les lots suivants) — uniquement le correctif minimal nécessaire pour ne pas casser une fonctionnalité existante suite au changement de schéma de ce lot.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot5_communication_isolation.py` — **16 tests**, tous verts : rôle non-admin refusé sur `/parents-list` et `/parents/stats`, isolation par établissement de `/parents-list` et `/parents/annuaire`, **Cas B vérifié explicitement** (un même parent avec un enfant par école ne voit jamais l'enfant de l'autre école), stats isolées, message `TOUS_PARENTS` correctement tagué, envoi à un parent d'une autre école refusé, liste des messages parents isolée, usurpation d'identité enseignant refusée sur les disponibilités, consultation cross-enseignant refusée, demande isolée par établissement (liste + détail), validation de disponibilité cross-école refusée, messagerie interne isolée par établissement, enseignant ne pouvant pas lister la messagerie d'un collègue, SUPER_ADMIN plateforme refusé (403).
- Suite backend complète : **232 passed, 10 skipped, 0 échec** (216 précédents + 16 nouveaux). Aucun correctif de mock RBAC nécessaire cette fois (communication.py n'était pas couvert par `test_rbac_modules_sensibles.py`).
- Frontend : non concerné — `tsc --noEmit` vérifié propre.

## Verdict
**GO pour le Lot 6 (Élèves)**, sous réserve de validation. Les gaps `Message`/`DemandeEmploi` documentés aux Lots 2 et 4 sont désormais définitivement clos.
