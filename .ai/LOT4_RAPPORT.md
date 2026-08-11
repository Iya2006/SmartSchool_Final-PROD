# LOT 4 — Examens — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/models/academique.py` — `EmploiExamen` gagne `etablissement_id` (NOT NULL).
- `backend/app/api/examens.py` — 15 routes corrigées (fichier de 521 → ~620 lignes, entièrement audité).
- `backend/tests/test_rbac_modules_sensibles.py` — mock de token mis à jour (même correctif que Lots 2/3).

## Fichiers non modifiés
Tout le reste. `DemandeEmploi` et `Message` restent non touchés (classées "À DÉCIDER", hors périmètre — voir plus bas).

## Migration Supabase exécutée
`backend/migrations/lot4_examens_etablissement.py` — `ss_emplois_examen` : `etablissement_id` ajouté (NOT NULL). Table réellement vérifiée vide au moment de l'exécution (0 ligne), aucun backfill nécessaire.

## Corrections apportées

### Scénario de fuite explicitement visé par ce lot
**`GET /sujets/{id}/fichier`** : avant, n'importe quel compte `EXAMENS_ROLES` (donc **n'importe quel enseignant**, y compris d'une autre école) pouvait télécharger le sujet d'examen d'un collègue **avant l'épreuve**, sans aucune vérification. Corrigé avec une isolation à **deux niveaux** :
1. **Établissement** — dérivé via `SujetExamen.enseignant_id → Enseignant.etablissement_id` (seule relation fiable, `SujetExamen` n'a pas de colonne établissement propre).
2. **Auteur** — un compte enseignant ne peut consulter/gérer que **ses propres sujets** ; les comptes admin-tier de l'établissement contournent cette restriction (rôle déjà vérifié par `EXAMENS_ROLES`).

Ce double contrôle (`_charger_sujet_ou_404` + `_verifier_auteur_sujet`) est appliqué à : `GET /sujets/{id}/fichier` (téléchargement — la fuite nommée), `PUT /sujets/{id}/envoyer`, `PUT /sujets/{id}/modifier`, `DELETE /sujets/{id}`. `PUT /sujets/{id}/valider` et `PUT /sujets/{id}/rejeter` (actions admin par nature, cf. leur docstring) reçoivent uniquement le contrôle d'établissement, sans restriction d'auteur — comportement de rôle inchangé, seule la fuite cross-école est fermée.

### `POST /sujets/upload`
- L'enseignant destinataire (`enseignant_id`, fourni par le client en form-data) est désormais vérifié appartenir à l'établissement appelant.
- **Un compte enseignant ne peut plus usurper l'identité d'un collègue** : le `enseignant_id` du formulaire doit correspondre au compte authentifié (sauf admin-tier, qui peut déposer pour n'importe quel enseignant de son école).
- `matiere_id` et `classe_id` (si fourni) sont désormais vérifiés appartenir au même établissement (`Matiere` via `Cycle`, `Classe` directement).

### `GET /sujets` (liste)
Avant : aucun filtre, tous les sujets de toutes les écoles retournés ; le paramètre `enseignant_id` permettait même à un enseignant de lister explicitement les sujets d'un collègue. Corrigé : toujours restreint à l'établissement appelant ; un compte enseignant ne voit **que ses propres sujets** (le paramètre `enseignant_id` est ignoré s'il tente de désigner un collègue) ; un admin peut filtrer par n'importe quel enseignant de son école.

### `GET /admin/stats`
Statistiques désormais calculées sur l'établissement appelant uniquement (avant : agrégées sur toute la plateforme).

### Emploi des examens (`EmploiExamen`/`CreneauExamen`)
- `POST /emploi`, `GET /emploi`, `GET /emploi/{id}`, `POST /emploi/{id}/creneaux`, `DELETE /emploi/{id}/creneaux/{id}`, `PUT /emploi/{id}/publier` : tous scopés par le nouvel `etablissement_id`.
- `POST /emploi/{id}/creneaux` : le `classe_id` fourni est désormais vérifié appartenir à l'établissement appelant (sinon injection possible d'une classe d'une autre école dans l'emploi du temps d'examen).

## Anomalies structurelles trouvées, non corrigées (documentées, hors périmètre)
- **`DemandeEmploi`** : toujours sans `etablissement_id` (classée "À DÉCIDER"). `examens.py` ne fait que lire/mettre à jour son statut via `demande_id`, jamais la créer — hors périmètre de ce fichier.
- **`PUT /emploi/{id}/publier`** notifie `destinataire_type="TOUS_ENSEIGNANTS"` via `Message`, qui n'a toujours pas de colonne établissement (même gap déjà documenté au Lot 2 pour `/salaires/alertes`) — la notification de publication d'un emploi d'examen part donc aujourd'hui vers **tous les enseignants de la plateforme**, pas seulement de l'école concernée. Correction prévue au Lot 5 (Communication), qui traite `Message` dans son ensemble.
- `EmploiExamen.annee_id` garde son défaut codé en dur (`=1`, préexistant) — non corrigé : aucune route d'`examens.py` ne filtre dessus, donc sans impact sur l'isolation ; le corriger proprement demanderait de dériver "l'année scolaire courante", hors périmètre de ce lot.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot4_examens_isolation.py` — **15 tests**, tous verts : téléchargement cross-école (404) et cross-enseignant même école (403), téléchargement autorisé pour l'auteur et pour l'admin, upload pour un enseignant d'une autre école refusé, usurpation d'identité enseignant refusée, upload normal fonctionnel, upload avec classe d'une autre école refusé, liste isolée par établissement, enseignant ne voyant que ses propres sujets, suppression/modification cross-enseignant refusées, emploi d'examen isolé (création/liste/détail), créneau avec classe d'une autre école refusé, SUPER_ADMIN plateforme refusé (403).
- Suite backend complète : **216 passed, 10 skipped, 0 échec** (201 précédents + 15 nouveaux).
- Frontend : non concerné — `tsc --noEmit` vérifié propre.

## Verdict
**GO pour le Lot 5 (Communication)**, sous réserve de validation. Le Lot 5 devra traiter `Message` dans son ensemble (colonne `etablissement_id` manquante) — cela résoudra du même coup les deux gaps déjà documentés (`/salaires/alertes/historique` au Lot 2, notification de publication d'emploi d'examen ici).
