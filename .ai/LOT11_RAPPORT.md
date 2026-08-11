# LOT 11 — MODULES SECONDAIRES (dernier lot du chantier)

**Périmètre** : `dashboard.py`, `bibliotheque.py`, `informatique.py`,
`tasks.py`. Ce lot porte aussi le correctif du **verrou d'identité frontend**
signalé au §6.3 du rapport du Lot 10, et l'élimination des tout derniers
`etablissement_id = 1` du projet.

---

## 1. Fichiers modifiés

### Correctif d'identité multi-écoles (issu du §6.3 du Lot 10)
- `backend/app/api/auth.py` — `etablissement_id` ajouté à l'objet `user` des
  **4** branches de login, repris de `token_data` pour que la réponse et le JWT
  ne puissent jamais diverger.
- `frontend/src/context/AuthContext.tsx` — champ ajouté à `UserInfo`
  (`number | null | undefined`, chaque cas documenté).
- `frontend/src/context/AppContext.tsx` — `etablissementId` est désormais
  synchronisé depuis le compte connecté ; `fetchEtablissement` est devenu un
  `useCallback` dépendant de `etablissementId`, et `fetchTheme` cible cet
  établissement au lieu de l'établissement 1 codé en dur.
- `frontend/src/lib/api.ts` + `frontend/src/lib/offlineQueue.ts` —
  `etablissement_id: 1` de la file hors-ligne remplacé par la valeur réelle de
  la session, le champ devenant facultatif (aucun établissement inventé).

### Lot 11 proprement dit
- `backend/app/api/dashboard.py` — 1 route.
- `backend/app/api/bibliotheque.py` — 6 routes + `_ouvrage_ou_404`,
  `_exemplaire_ou_404` (OWNERSHIP via `Ouvrage`).
- `backend/app/api/informatique.py` — 6 routes.
- `backend/app/api/tasks.py` — 1 route.
- `backend/app/api/evaluations.py` — 1 ligne : `meta={"etablissement_id": …}` à
  l'enqueue du PDF de bulletin, ce qui rend le contrôle de `tasks.py` possible.
- `backend/app/models/academique.py` — `default=1` retiré de `Ouvrage`.
- `backend/app/schemas/schemas.py` — champ `etablissement_id` retiré de
  `OuvrageBase`.
- `backend/app/core/documents_settings.py`, `backend/app/core/security_settings.py`
  — défaut `etablissement_id = 1` retiré (même famille que le §6.6 du Lot 9).

### Tests créés
- `backend/tests/test_login_expose_etablissement.py` — 6 tests.
- `backend/tests/test_lot11_modules_secondaires_isolation.py` — 20 tests.

---

## 2. Fichiers NON modifiés (volontairement)

- **Aucune migration.** Vérification faite en base :
  `ss_ouvrages.etablissement_id` est **déjà NOT NULL sans défaut SQL** — le
  `default=1` du modèle était purement Python. Les tables
  `ss_equipements_informatiques` et `ss_tickets_informatiques` ont déjà leur
  colonne NOT NULL. Rien à modifier côté schéma.
- `app/core/task_queue.py`, `app/tasks/bulletin_tasks.py` : le contrôle
  d'accès est appliqué à la lecture du statut, pas dans le worker.
- Offline / PWA / RQ / Redis / PDF : non touchés au-delà des 2 lignes de
  métadonnée de file citées plus haut.

---

## 3. Tests exécutés et résultats

| Exécution | Résultat |
|-----------|----------|
| `test_login_expose_etablissement.py` | **6 passed** |
| `test_lot11_modules_secondaires_isolation.py` | **20 passed** |
| Suite complète après correctif d'identité | **408 passed, 10 skipped** |
| **Suite complète après Lot 11** | **428 passed, 10 skipped, 0 échec** (305 s) |
| `npm run test:run` (frontend) | **102 passed** (12 fichiers) |
| `npx tsc --noEmit` | 0 erreur |
| `npm run build` | build de production réussi |

Progression : Lot 10 = 402 → correctif d'identité = 408 → Lot 11 = **428**.
**+6 puis +20 = exactement les tests ajoutés. Aucune régression.**

### Vérification de conformité à l'énoncé (réellement exécutée cette fois)
```
grep -rn "etablissement_id: int = 1|etablissement_id: int = Query(1)|etablissement_id=1" app/
→ 3 résultats, tous des COMMENTAIRES historiques ; aucune occurrence exécutable.
```
Le frontend est également vérifié : plus aucun `etablissement_id` codé en dur
n'influence l'affichage ni la file hors-ligne.

---

## 4. Problèmes trouvés

### 4.1 — Tableau de bord complet de n'importe quelle école (CRITIQUE)
`GET /api/dashboard?etablissement_id=N&annee_id=M` : les deux identifiants
venaient du client, avec **1 par défaut**. Incrémenter `N` livrait effectifs,
nombre d'enseignants et de classes, **chiffre d'affaires, dépenses, impayés**,
taux de présence et incidents d'une autre école. Toutes les requêtes internes
filtraient correctement — c'est la **valeur du filtre** qui était choisie par
l'appelant.

### 4.2 — Catalogue de bibliothèque ouvert à tous (ÉLEVÉ)
`list_ouvrages` et `stats_bibliotheque` prenaient `etablissement_id` en
paramètre de requête (défaut 1). `update_ouvrage`, `create_exemplaire` et
`create_emprunt` ne vérifiaient **rien** : on pouvait modifier un ouvrage
d'une autre école, lui ajouter des exemplaires, et **emprunter ses livres**.

### 4.3 — Emprunt inscriptible au nom d'un tiers (ÉLEVÉ)
`create_emprunt` n'validait ni `eleve_id` ni `enseignant_id` : un emprunt
pouvait être enregistré au nom d'un élève ou d'un enseignant d'une autre
école — qui se retrouvait débiteur d'un livre qu'il n'a jamais emprunté.

### 4.4 — Inventaire et tickets informatiques exposés (ÉLEVÉ)
Les 3 routes de lecture prenaient `etablissement_id` du client (défaut 1) ;
`resolve_ticket` ne vérifiait pas l'appartenance du ticket ; les créations
d'équipement et de ticket acceptaient `etablissement_id` dans le corps.

### 4.5 — Résultat de tâche asynchrone lisible par n'importe qui (MOYEN)
`GET /api/tasks/{task_id}` ne vérifiait que l'existence du job. Connaître
l'identifiant d'une tâche suffisait à en obtenir le résultat — pour un
bulletin, **l'URL de téléchargement du PDF d'une autre école**. Risque
pratique réduit par l'imprévisibilité des UUID RQ, mais le contrôle manquait.

### 4.6 — `POST /api/informatique/tickets` plantait systématiquement (bug préexistant)
`TicketInformatique(**data.model_dump(), signale_par=…)` : `signale_par` étant
déjà dans le `model_dump()`, l'appel levait un `TypeError` (« got multiple
values for keyword argument »). **La création de ticket était donc totalement
inopérante**, indépendamment du multi-écoles.

### 4.7 — Derniers `etablissement_id = 1` du projet
`Ouvrage` (modèle), `OuvrageBase` (schéma), `EquipementCreate`, `TicketCreate`,
`get_documents_settings`, `get_security_settings`.

---

## 5. Problèmes corrigés

| # | Correction |
|---|---|
| 4.1 | `etablissement_id` depuis `Depends(require_etablissement)` ; `annee_id` devenu **obligatoire** et validé comme appartenant à l'école appelante (404 sinon). |
| 4.2 | `require_etablissement` sur les lectures ; `_ouvrage_ou_404` / `_exemplaire_ou_404` sur les écritures. |
| 4.3 | `eleve_id` et `enseignant_id` vérifiés comme appartenant à l'établissement appelant. |
| 4.4 | `require_etablissement` sur les 6 routes ; `salle_id` et `equipement_id` référencés validés ; `etablissement_id` imposé depuis le token à la création. |
| 4.5 | Le job porte `meta={"etablissement_id": …}` ; la lecture compare au token. Contrôle **fermé par défaut** : une tâche sans cette métadonnée est refusée (404) plutôt que servie à tous. |
| 4.6 | Payload construit explicitement, `signale_par` renseigné une seule fois. Verrouillé par un test qui échoue si la route replante. |
| 4.7 | Tous retirés. **Il ne reste plus une seule occurrence de `etablissement_id = 1` exécutable dans `app/` — uniquement des commentaires historiques.** |

### Correctif d'identité frontend (§6.3 du Lot 10)
Le backend était isolé, mais `AppContext` faisait `useState<number>(1)` et
`setEtablissementId` n'était **jamais appelé** : chaque école voyait le nom, le
logo, le cachet, la signature et les couleurs de l'école 1. La chaîne est
maintenant complète — le serveur dérive l'établissement du JWT au login, le
renvoie dans `user`, `AuthContext` le persiste, `AppContext` s'y synchronise.

`null` (SUPER_ADMIN plateforme, parent multi-écoles) et `undefined` (session
antérieure au correctif) sont traités explicitement : **on conserve la valeur
courante plutôt que d'en inventer une**. Verrouillé par 6 tests, dont un parent
avec un enfant dans chaque école qui doit recevoir `None` — jamais l'une des
deux au hasard.

---

## 6. Problèmes restants

### 6.1 — RBAC non traité (reporté depuis le Lot 10, inchangé)
Les routes exigent un établissement, pas un rôle d'administration : un
`ENSEIGNANT` de l'école A peut toujours modifier les paramètres **de l'école
A**. Axe distinct du multi-écoles. Voir §6.1 du rapport du Lot 10.

### 6.2 — `Utilisateur.role` déconnecté de la table `Role`
Les permissions configurées via `securite.py` ne sont appliquées nulle part.
Constat d'audit, voir §6.2 du rapport du Lot 10.

### 6.3 — La page de login affiche la marque de l'établissement 1
Un visiteur **anonyme** n'a par définition aucune école : `AppContext` retombe
sur 1 tant que personne n'est connecté. Résoudre cela demanderait un mécanisme
de désignation d'école avant authentification (sous-domaine par école, ou
sélecteur sur la page de login) — **choix produit, pas correctif technique**.
Sans effet sur l'isolation des données : rien de sensible n'est servi à un
anonyme depuis le Lot 10 (catégories `THEME`/`IDENTITE`/`CARTE` uniquement).

### 6.4 — ~~`_invalidate_dashboard_cache` n'invalide rien~~ — **AFFIRMATION ERRONÉE, corrigée**
Ce rapport indiquait que cette fonction était du code mort. **C'est faux.** La
clé `dashboard:{etablissement_id}:{annee_id}` est bien écrite — non pas par
`dashboard.py` (le tableau de bord pédagogique, qui effectivement ne met rien
en cache), mais par `finance.py::dashboard_financier`, avec un TTL de 60 s.
L'invalidation est donc **utile et fonctionnelle**.

Point important pour le chantier : cette clé **contient l'établissement**, et
celui-ci provient de `Depends(require_etablissement)`. Le cache est donc
correctement cloisonné — deux écoles ne peuvent pas se servir mutuellement une
entrée. Verrouillé par `test_t13bis_la_cle_de_cache_financier_porte_letablissement`,
qui échouera si l'établissement disparaît un jour de la clé.

### 6.5 — Note d'architecture périmée dans `monitoring.py` — **CORRIGÉE**
Son en-tête affirmait « déploiement mono-tenant actuel, `etablissement_id=1`
partout, absent du JWT » — faux depuis le Lot 0. Docstring réécrite : la portée
globale du monitoring reste un choix volontaire (Redis/RQ/PostgreSQL sont
mutualisés), mais elle n'est plus justifiée par une prémisse fausse.

### 6.6 — Aucun problème d'isolation résiduel connu sur les 4 modules du lot

---

## 7. État du chantier

Les 12 lots (0 à 11) sont traités. Reste à produire la synthèse finale
(consolidation des 15 tests multi-écoles obligatoires et rapport GO/NO-GO).
