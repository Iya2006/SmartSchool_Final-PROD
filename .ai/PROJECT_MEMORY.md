# 🧠 MÉMOIRE PERSISTANTE DU PROJET — SMART_SCHOOL_FINAL

> Dernière mise à jour : 21/07/2026

## État actuel
Module **Paramètres (Centre de Contrôle)** — architecture Next.js (frontend) + FastAPI (backend).

Sections terminées et **vérifiées par lecture de code réelle** (pages + endpoints existants et cohérents) :
- Phase 0 — Fondations Techniques (5/5)
- Section 1 — Identité (11/11)
- Section 4 — Apparence (14/14)
- Section 5 — Cartes Scolaires (10/10)
- Section 3 — Notation (10/10)
- Section 7 — Finance (9/9)
- Section 6 — Format Bulletins & Documents PDF (9/9)
- Section 8 — Sécurité & Gestion des Accès (7/7)

Section **non terminée malgré une case cochée par erreur** :
- Section 2 — Calendrier & Vacances (0/5) — voir correction ci-dessous.

Progression globale réelle : **75/101 tâches (74%)**.

## ⚠️ Incident corrigé le 21/07/2026 : conflit Git non résolu + case cochée à tort
- **Constat** : `.ai/TODO.md`, `.ai/CURRENT_TASK.md` et `.ai/PROJECT_MEMORY.md`
  contenaient des marqueurs de conflit Git (`<<<<<<< HEAD` / `=======` /
  `>>>>>>> 5cae788`) non résolus, hérités du merge de la PR #5
  (`iya-dev-parametres`). Aucun `MERGE_HEAD` actif — les marqueurs avaient été
  commités tels quels (fichiers ajoutés à l'index sans résoudre le conflit).
- **Vérification effectuée (RÈGLE 2 du protocole)** : avant de résoudre, le
  code réel a été inspecté pour les sections en conflit (2, 6, 7, 8) :
  - Section 7 (Finance) : confirmée complète (`finance/page.tsx`,
    `finance.py` avec `calculer_rang_fratrie`, `calculer_reduction_montant`,
    `calculer_penalite`, `get_finance_settings` ; `comptabilite.py` avec
    `/pin/status`, `/pin/verify`, `/pin`).
  - Section 6 (Documents) : confirmée complète (`documents/page.tsx`,
    `documents_settings.py` avec templates de bulletin, filigrane,
    appréciations automatiques).
  - Section 8 (Sécurité) : confirmée complète (`securite/page.tsx`,
    `securite.py` avec CRUD rôles/permissions/audit log,
    `security_settings.py` avec politique de mot de passe et session).
  - **Section 2 (Calendrier) : NON complète**, contrairement à ce que les
    deux côtés du conflit et les cases `[x]` du fichier laissaient penser.
    La page `frontend/src/app/parametres/calendrier/page.tsx` n'existe pas.
    Côté backend (`backend/app/api/parametrage.py`), seuls `list_annees`,
    `create_annee`, `activer_annee`, `list_trimestres` existent : pas de
    `update_annee`, pas de CRUD trimestres complet, pas de stockage des
    vacances scolaires, pas de toggle Semestre/Trimestre.
- **Correction appliquée** :
  - `.ai/TODO.md` : sous-tâches 2.1 à 2.5 recochées `[ ]` avec note explicative ;
    tableau de progression nettoyé des marqueurs de conflit et recalculé
    (75/101, 74%).
  - `.ai/CURRENT_TASK.md` : remis à jour avec l'état réel et la prochaine
    tâche (Section 2).
  - `.ai/PROJECT_MEMORY.md` (ce fichier) : historique consolidé.

## Historique — Section 7 (Finance), terminée le 19/07/2026
### Fichiers créés
- `frontend/src/app/parametres/finance/page.tsx` — page de paramètres (5 onglets :
  Général, Types de frais, Pénalités, Réductions, Reçus & Sécurité).
- `frontend/src/app/parametres/finance/Finance.module.css` — styles (thème émeraude).

### Fichiers modifiés
- `backend/app/api/finance.py` :
  - Ajout de `FINANCE_DEFAULTS`, `get_finance_settings()`, `calculer_rang_fratrie()`,
    `calculer_reduction_montant()`, `calculer_penalite()` (lecture des paramètres
    `ss_parametres` categorie=`FINANCE`, avec valeurs par défaut).
  - `create_paiement` : utilise désormais `devise` et `recu_prefixe` configurables
    au lieu des valeurs `"GNF"` / `"REC-"` codées en dur.
  - `generer_factures_classe` : nouveau champ optionnel `appliquer_reductions`
    (schema) → applique la réduction fratrie (via `EleveParent` + rang par date de
    naissance) si activée. Comportement par défaut inchangé (`false`).
  - `list_impayes` / `list_retards` : ajout des champs `penalite_estimee` et
    `montant_du_avec_penalite` dans la réponse (calculés seulement si
    `penalite_active` est vrai dans les paramètres).
- `backend/app/api/comptabilite.py` :
  - Nouveaux endpoints : `GET /api/comptabilite/pin/status`,
    `POST /api/comptabilite/pin/verify`, `PUT /api/comptabilite/pin` (changement de
    PIN avec vérification de l'ancien).
- `backend/app/schemas/schemas.py` :
  - `GenererFacturesClasseRequest` : ajout du champ `appliquer_reductions: bool = False`.

## Historique — Sections 6 (Documents) et 8 (Sécurité), terminées le 21/07/2026
- **Correction du Bug HTTP 422 sur la Section 6 (Documents PDF)** :
  - **Origine du problème** : dans `frontend/src/app/parametres/documents/page.tsx`,
    l'appel `api.put('/api/parametrage/settings', { etablissement_id, categorie, parametres })`
    envoyait un objet JSON enveloppé, alors que l'API FastAPI
    `PUT /api/parametrage/settings` attend un paramètre query `etablissement_id: int`
    et un corps JSON contenant un tableau direct de `List[ParametreCreate]`.
  - **Correction** :
    ```typescript
    await api.put(`/api/parametrage/settings?etablissement_id=${ETABLISSEMENT_ID}`, paramsToSave);
    ```
  - **Résultat** : enregistrement fonctionnel (200 OK). Build Next.js réussi (53/53 pages).
- **Section 8 — Sécurité & Gestion des Accès** :
  - Fichiers créés : `backend/app/core/security_settings.py`, `backend/app/api/securite.py`,
    `frontend/src/app/parametres/securite/page.tsx`, `Securite.module.css`.
  - Modèles SQLAlchemy ajoutés : `Role` (`ss_roles`), `Permission` (`ss_permissions`),
    `AuditLog` (`ss_audit_log`).
- **Section 6 — Documents & Bulletins PDF** :
  - Fichiers créés : `backend/app/core/documents_settings.py`,
    `frontend/src/app/parametres/documents/page.tsx`, `Documents.module.css`.

### Réutilisé sans modification
- API générique `/api/parametrage/settings` (GET/PUT, catégorie FINANCE/DOCUMENTS/SECURITE)
  — existante depuis la Phase 0, utilisée pour tous les nouveaux paramètres.
- CRUD `/api/finance/types-frais` (GET/POST/PUT/DELETE) — déjà complet côté backend,
  simplement exposé dans l'onglet "Types de frais" de la page finance.

## Tests exécutés
- Backend : `python -m py_compile` sur `finance.py`, `comptabilite.py`, `schemas.py`
  → OK (aucune erreur de syntaxe).
- `diagnostics` sur ces fichiers → uniquement du bruit de typage Pyright déjà
  présent partout dans le projet (SQLAlchemy `Column[...]` vs valeurs Python),
  pas d'erreur nouvelle liée aux changements.
- Frontend : `npx tsc --noEmit` sur tout le projet → 0 erreur.
- `diagnostics` sur `finance/page.tsx` → uniquement des warnings ESLint mineurs
  (`any`, apostrophes non échappées), cohérents avec le reste du code existant.
- **Non exécuté** : aucun test d'intégration réel contre une base de données
  (pas d'environnement Python/FastAPI actif dans ce contexte). La logique
  métier (`calculer_rang_fratrie`, `calculer_penalite`, etc.) n'a été validée
  que par lecture de code.

## Problèmes connus / points d'attention pour la suite
- Le calcul de rang de fratrie (`calculer_rang_fratrie`) suppose qu'un élève n'a
  qu'un seul parent responsable lié via `EleveParent` pour le calcul du groupe
  de frères/sœurs ; cas non testé avec des données réelles (parents séparés,
  tuteurs multiples).
- Les modes de paiement restent stockés en texte libre sur `Paiement.mode_paiement`
  (pas de contrainte DB) — la liste configurée dans `/parametres/finance` est
  indicative/UX uniquement.
- Pas de nouvelle migration DB nécessaire pour Finance/Documents/Sécurité (hors
  tables `ss_roles`/`ss_permissions`/`ss_audit_log` ajoutées pour la Section 8) :
  le reste est stocké via la table générique `ss_parametres` (Phase 0.1).
- Ce dépôt Git va être abandonné : le projet est en cours de migration vers un
  nouveau repo GitHub (`Iya2006/SMARTSCHOOL_NEW_VERSION`) pour un travail en
  équipe (branches `main` / `collaboration` / `IA-develop`). Voir
  `.ai/CURRENT_TASK.md` pour la suite du travail sur la Section 2.

## Prochaine étape exacte
Selon `.ai/TODO.md`, la prochaine section non cochée par ordre de priorité est :

**📅 SECTION 2 — Gestion Années & Trimestres (Priorité 6)**
- `[ ]` 2.1 — Page `/parametres/calendrier/page.tsx`
- `[ ]` 2.2 — CRUD des années scolaires (créer, modifier, activer)
- `[ ]` 2.3 — CRUD des trimestres/semestres (dates de début/fin)
- `[ ]` 2.4 — Toggle mode Semestre vs Trimestre
- `[ ]` 2.5 — Calendrier des vacances scolaires (dates configurables)

Backend existant à réutiliser/compléter : `parametrage.py` contient déjà
`list_annees`, `create_annee`, `activer_annee`, `list_trimestres`
(lignes ~126-164). Il manque : `update_annee`, un CRUD complet des
trimestres (create/update/delete), et un modèle de vacances scolaires
(probablement à ajouter via `ss_parametres`, catégorie `CALENDRIER` en JSON,
comme fait pour `FINANCE`/`DOCUMENTS`/`SECURITE`).

`.ai/CURRENT_TASK.md` est à "aucune tâche en cours" — à mettre à jour dès que
la Section 2 démarre réellement.
