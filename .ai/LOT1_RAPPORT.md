# LOT 1 — Comptabilité — Rapport de fin de lot

## Fichiers modifiés
- `backend/app/models/academique.py` — `ParametreComptabilite` et `ExerciceComptable` gagnent `etablissement_id` (NOT NULL) + contrainte composite `UNIQUE(etablissement_id, cle/annee)` remplaçant l'ancienne contrainte globale ; `EcritureComptable.etablissement_id` passe de nullable à NOT NULL.
- `backend/app/api/comptabilite.py` — toutes les routes filtrent désormais par établissement (dérivé du JWT via `require_etablissement`, jamais du client) ; `init_comptabilite_defaults` scindée en `init_comptabilite_globals` (Journaux/Comptes, GLOBAL, inchangé) et `init_comptabilite_tenant_defaults` (PIN/Exercice/Comptable, TENANT) ; `_get_exercice` vérifie l'appartenance de l'exercice à l'établissement appelant et seede les valeurs par défaut de cet établissement si nécessaire ; `creer_ecriture` vérifie que toute classe/élève/fournisseur référencé dans les lignes appartient bien à l'établissement appelant (403 sinon) ; `generer_ecriture_auto` exige désormais un `etablissement_id` explicite.
- `backend/app/api/finance.py` — ajout du helper `_etablissement_de_inscription` et plomberie minimale (8 points d'appel) pour fournir `etablissement_id` à `generer_ecriture_auto` sans casser son fonctionnement ; **aucune autre correction d'isolation apportée à ce fichier** — c'est le périmètre du Lot 2, pas de celui-ci.

## Fichiers non modifiés
Tout le reste, y compris le frontend (aucun changement, `tsc --noEmit` vérifié propre par prudence). Aucune route de `finance.py` autre que les 8 points d'appel de `generer_ecriture_auto` n'a été touchée — ses failles connues (`_identifier_employe`, IDOR facture/paiement/dépense, `etablissement_id` client/défaut=1 dans `_executer_paiement_salaire`/`avances_endpoint`) restent **volontairement non corrigées**, réservées au Lot 2.

## Migration Supabase exécutée
`backend/migrations/lot1_comptabilite_etablissement.py`, appliquée réellement sur la base Supabase de production après re-vérification à l'instant T (toutes les tables concernées étaient à 0 ligne, y compris `ss_etablissements` lui-même — aucun rattachement de données existantes nécessaire) :
- `ss_exercices_comptables` : `etablissement_id` ajouté (NOT NULL), `UNIQUE(annee)` → `UNIQUE(etablissement_id, annee)`.
- `ss_parametres_comptabilite` : `etablissement_id` ajouté (NOT NULL), `UNIQUE(cle)` → `UNIQUE(etablissement_id, cle)`.
- `ss_ecritures_comptables` : `etablissement_id` passé en NOT NULL.
- Schéma final vérifié directement sur Supabase après exécution (colonnes + contraintes conformes au modèle).
- Aucun `UPDATE ... SET etablissement_id = 1` exécuté, conformément à la consigne.

## Résultats trouvés en cours de route (corrigés dans ce lot)
1. **`Comptable` (seed vestigial)** : `etablissement_id=1` codé en dur dans `init_comptabilite_defaults` — aurait échoué en production dès l'exécution (FK vers un établissement 1 qui n'existe pas, la table `ss_etablissements` étant vide). Corrigé : scopé par établissement, `nom_utilisateur` suffixé (`sams-{etablissement_id}`) pour respecter la contrainte unique globale existante sur cette colonne (table confirmée morte/non utilisée pour l'authentification, non touchée par ailleurs).
2. **`creer_fournisseur`** : `etablissement_id=1` codé en dur — même risque de FK invalide en production. Corrigé via `require_etablissement`.
3. **Fuite critique confirmée par les tests** : `GET /auxiliaire/fournisseurs` et `GET /auxiliaire/parents-eleves` retournaient l'intégralité des fournisseurs/élèves de la plateforme, sans aucun filtre d'établissement — corrigé.
4. **IDOR confirmés** : `GET /auxiliaire/fournisseurs/{id}/compte`, `GET /auxiliaire/parents-eleves/{eleve_id}/compte`, `GET /balance?exercice_id=` acceptaient n'importe quel ID d'une autre école — tous renvoient désormais 404 en cross-école (vérifié par test).
5. **Injection cross-école via écriture manuelle** : `POST /ecritures` acceptait n'importe quel `classe_id`/`eleve_id`/`fournisseur_id` sans vérifier son établissement — corrigé (403 si l'un des axes analytiques n'appartient pas à l'établissement appelant).
6. **Gap découvert par les tests eux-mêmes (corrigé)** : plusieurs routes de lecture (`balance`, `grand-livre`, `auxiliaire/*`, `ecritures` manuelles) dépendaient d'un exercice "ouvert" sans jamais le seeder elles-mêmes. Avant ce lot, un seul exercice existait pour toute la plateforme donc ce n'était jamais un problème en pratique ; avec des exercices désormais propres à chaque établissement, une école tout juste créée aurait échoué en 400 dès sa première consultation si elle n'était jamais passée par `/exercices` ou `/pin` au préalable. Corrigé en centralisant le seed dans `_get_exercice`, appelée par toutes ces routes.

## Problème identifié, non corrigé (documenté, hors périmètre de ce lot)
- **`Fournisseur.code`** reste une contrainte `UNIQUE` globale (toute la plateforme), pas encore composite par établissement — deux écoles ne peuvent pas encore utiliser le même code fournisseur. Ce n'est pas une fuite de sécurité (juste un blocage de création avec message d'erreur clair), donc non traité comme un ARRÊT OBLIGATOIRE, mais à corriger dans un lot ultérieur si cela devient gênant en usage réel. Même limitation préexistante sur `Facture.numero_facture`/`Paiement.numero_recu` (Lot 2).

## Tests exécutés
- Nouveau fichier `backend/tests/test_lot1_comptabilite_isolation.py` — **15 tests**, tous verts : isolation des exercices, coexistence du même millésime dans 2 écoles, unicité toujours respectée au sein d'une même école, indépendance des PIN, refus cross-école sur `balance?exercice_id=`, isolation de la liste fournisseurs, rattachement correct à la création, 404 cross-école sur historique fournisseur, refus 403 d'une écriture manuelle référençant un fournisseur d'une autre école, isolation des écritures créées, isolation de la comptabilité auxiliaire élèves/parents, 404 cross-école sur historique élève, refus 403 d'un SUPER_ADMIN plateforme (sans établissement) sur les routes comptables, comportement direct de `generer_ecriture_auto` (avec et sans établissement).
- Suite backend complète : **174 passed, 10 skipped** (skips = tests nécessitant un vrai Redis), **0 échec**.
- Frontend : non concerné par ce lot (aucun fichier modifié) — `tsc --noEmit` vérifié propre par prudence, suite de tests frontend non ré-exécutée (inutile, zéro fichier frontend touché).

## Vérification finale
`grep "etablissement_id=1\|etablissement_id = 1"` sur `comptabilite.py` : aucune occurrence restante.

## Verdict
**GO pour le Lot 2 (Finance)**, sous réserve de validation par l'utilisateur. Le Lot 2 devra traiter en priorité : `_identifier_employe` (jamais filtré par établissement), les IDOR sur facture/paiement/dépense/reçu/PDF, et les `etablissement_id` client-fournis ou défaultés à 1 déjà repérés dans `finance.py` (`_executer_paiement_salaire` paramètre par défaut `=1`, `avances_endpoint` ligne `data.get("etablissement_id", 1)`) — ces deux derniers points touchent directement les 2 des 8 appels à `generer_ecriture_auto` plombés dans ce lot, qui continuent aujourd'hui à véhiculer une valeur non fiable jusqu'à leur correction au Lot 2.
