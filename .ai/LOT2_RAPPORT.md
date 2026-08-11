# LOT 2 — Finance — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/api/finance.py` — correction complète de l'isolation par établissement (55 routes auditées, ~35 corrigées). Aucun changement de schéma (pas de migration Supabase pour ce lot).
- `backend/tests/test_rbac_modules_sensibles.py` — mock de token mis à jour (ajout de `etablissement_id` — un ancien format de token est désormais refusé à juste titre sur les routes tenant, conformément au Lot 0).

## Fichiers non modifiés
`backend/app/api/comptabilite.py`, tout le reste. `schemas.py::DepenseBase` conserve son champ `etablissement_id` (utilisé côté réponse) — ignoré côté création, voir plus bas.

## Corrections apportées

### 1. `_identifier_employe` (priorité n°1 explicitement nommée)
Ne filtrait par aucun établissement : n'importe quel compte FINANCE_ROLES pouvait consulter/payer le salaire d'un enseignant ou d'un membre du personnel de N'IMPORTE QUELLE autre école en devinant sa référence (`ENS_42`, `PERS_17`). Corrigé : exige désormais `etablissement_id` et filtre `Enseignant`/`Utilisateur` en conséquence. Répercuté dans toute la chaîne : `_get_or_sync_employe_paie`, `_calculer_salaire`, `_executer_paiement_salaire`, et les 11 routes qui en dépendent (`/salaires/payer`, `/salaires/calculer`, `/salaires/payer-group`, `/salaires/arrieres/{id}`, `/salaires/payer-plusieurs-mois`, `/primes`, `/avances`, `/absences`, `/salaires/historique/{id}`, `/salaires/bulletin-detail/{id}`, `/salaires/absences-source`, `/salaires/alertes`, `/salaires/{id}` DELETE).
- `_get_or_sync_employe_paie` créait la ligne miroir `Employe` avec `etablissement_id=1` codé en dur — corrigé (utilise désormais l'établissement réel).

### 2. IDOR sur facture/paiement/dépense/reçu/PDF/bulletin (priorité n°1)
Corrigés avec vérification d'ownership (jointure jusqu'à `Classe.etablissement_id`, ou filtre direct quand la table a déjà la colonne) :
- `POST /factures` : l'`inscription_id` fourni n'était jamais vérifié — n'importe quelle inscription d'une autre école pouvait être facturée.
- `POST /factures/generer-classe` : idem pour `classe_id`.
- `POST /paiements` : le `facture_id` fourni n'était jamais vérifié — n'importe quelle facture d'une autre école pouvait recevoir un paiement (détournement de comptabilité).
- `PUT /paiements/{id}/annuler` : aucune vérification — n'importe quel paiement pouvait être annulé (avec reversement des montants) depuis une autre école.
- `GET /solde-eleve/{id}`, `GET /avis-paiement/{id}`, `GET /recu/{id}`, `GET /paiements/{id}/recu-pdf`, `GET /factures/{id}/pdf` : tous exposaient les données financières complètes d'un élève/facture/paiement de n'importe quelle école à qui devinait l'ID. Corrigés (404 cross-école).
- `PUT /depenses/{id}/valider`, `PUT /depenses/{id}/approuver`, `PUT /depenses/{id}/statut` : aucune vérification — corrigés.

### 3. `etablissement_id` client-fourni ou défaulté à 1
- **`POST /depenses`** : le schéma `DepenseCreate` contient un champ `etablissement_id` **obligatoire dans le body** — n'importe quel client pouvait choisir librement l'école propriétaire de la dépense créée. Corrigé : la valeur du body est désormais ignorée et remplacée par l'établissement authentifié.
- `POST /reglements-fournisseurs`, `POST /salaires/payer`, `PUT /salaires/date-paie`, `POST /salaires/payer-plusieurs-mois`, `POST /avances`, `POST /salaires/alertes` : tous avaient `data.get("etablissement_id", 1)` — supprimés, remplacés par `Depends(require_etablissement)`.
- ~22 routes de liste/rapport/dashboard avaient `etablissement_id: int = 1` en query param (choisissable librement par le client, exactement l'anti-pattern nommé dans la consigne) — toutes remplacées par `Depends(require_etablissement)` : `list_factures`, `stats_factures`, `list_paiements`, `list_depenses`, `stats_depenses`, `list_impayes`, `list_retards`, `tableau_solvabilite`, `dashboard_financier`, `rapport_journalier`, `rapport_mensuel`, `rapport_annuel`, `notifier_impayes`, `list_fournisseurs`, `list_decaissements`, `list_acomptes`, `list_employes_salaires`, `calculer_salaires_endpoint`, `get_date_paie_endpoint`, `payer_group_endpoint`, `arrieres_salaire_endpoint`, `absences_source_endpoint`.

### 4. Injection cross-école via axes analytiques
`POST /reglements-fournisseurs` acceptait `classe_id`/`eleve_id` du body sans vérifier leur établissement — corrigé (403 si l'un des deux n'appartient pas à l'établissement appelant), même pattern que `comptabilite.py::creer_ecriture` (Lot 1).

### 5. Ownership sur les tarifs de classe
`GET /tarifs-classe`, `PUT /tarifs-classe`, `POST /tarifs/copier` ne vérifiaient jamais que la/les classe(s) ou année(s) référencée(s) appartenaient à l'établissement appelant — corrigé (403 en écriture, filtre silencieux en lecture).

### 6. Cache dashboard et paramètres financiers
`_invalidate_dashboard_cache()` était appelée sans argument à 9 endroits (toujours `dashboard:1:1`, quelle que soit l'école réelle qui vient d'agir) — le dashboard d'une autre école que l'école 1 ne se rafraîchissait jamais après une mutation. `get_finance_settings(db)` était appelée sans établissement à 2 endroits (règles de réduction fratrie lues depuis les paramètres de l'école 1 au lieu de l'école appelante). Les deux corrigés partout où c'était appelé.

## Anomalie structurelle trouvée, non corrigée (documentée, hors périmètre)
**`GET /salaires/alertes/historique`** : le modèle `Message` n'a pas de colonne `etablissement_id` (classée "À DÉCIDER" dans `.ai/MULTI_TENANT_PLAN.md`, section E) — cette route retourne donc l'historique d'alertes de paie de **toutes** les écoles. Un commentaire explicite a été laissé dans le code ; correction prévue au **Lot 5 (Communication)**, qui traite `Message` dans son ensemble — conformément à la règle ARRÊT OBLIGATOIRE (pas de correction partielle qui donnerait une fausse impression de sécurité).

## Problème identifié, non corrigé (documenté, mineur)
`TypeFrais` reste GLOBAL (pas de colonne `etablissement_id`, classification déjà actée en Lot 1/section E) — les routes `types-frais` (CRUD) n'ont pas été modifiées, cohérent avec cette décision produit déjà validée.

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot2_finance_isolation.py` — **17 tests**, tous verts : salaire/prime/avance cross-école refusés (404), fonctionnement normal dans sa propre école, liste employés isolée, facture cross-inscription refusée, paiement cross-facture refusé, liste factures isolée, solde élève cross-école 404, annulation paiement cross-école refusée, injection `etablissement_id` dans le body de `/depenses` neutralisée, validation dépense cross-école 404, liste dépenses isolée, tarifs-classe cross-école refusés (403 écriture, liste vide en lecture), SUPER_ADMIN plateforme refusé (403).
- Suite backend complète : **191 passed, 10 skipped, 0 échec** (159 base + 15 Lot 1 + 17 Lot 2).
- Frontend : non concerné par ce lot — `tsc --noEmit` vérifié propre par prudence.

## Verdict
**GO pour le Lot 3 (Personnel)**, sous réserve de validation. Points à garder en tête pour la suite : le gap `Message`/alertes de paie sera traité au Lot 5 ; `TypeFrais` reste global par décision déjà actée.
