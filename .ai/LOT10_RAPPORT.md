# LOT 10 — CONFIGURATION (`parametrage.py`, `securite.py`)

**Périmètre** : les deux modules de configuration de la plateforme — identité
de l'établissement, calendrier scolaire, cycles, matières, salles, paramètres
clé/valeur, rôles, permissions et journal d'audit.

C'est le lot où se trouvaient les failles les plus graves du chantier : ces
routes n'avaient **aucune** notion d'établissement, et plusieurs d'entre elles
autorisaient un simple compte authentifié à réécrire la configuration d'une
autre école.

---

## 1. Fichiers modifiés

### `backend/app/api/parametrage.py` — 19 routes
Helpers ajoutés : `_annee_ou_404`, `_trimestre_ou_404` (OWNERSHIP via
`AnneeScolaire`), `_cycle_ou_404`, `_matiere_ou_404` (OWNERSHIP via `Cycle`),
et `_require_super_admin = require_roles("SUPER_ADMIN")` pour les deux
opérations de niveau plateforme.

### `backend/app/api/securite.py` — 8 routes
Helper ajouté : `_role_ou_404`. Les champs `etablissement_id` ont été retirés
des schémas `RoleCreate` et `AuditLogCreate`.

### `backend/app/core/auth.py` — 2 dépendances ajoutées
`get_current_user_optionnel` et `etablissement_optionnel`, pour la seule route
volontairement publique du projet (`GET /api/parametrage/settings`), qui doit
servir un contenu réduit à un visiteur anonyme et le contenu complet de **son**
établissement à un compte connecté. Un token absent, expiré ou invalide y donne
`None` — sur une route publique, un token pourri ne doit pas transformer une
consultation anonyme légitime en 401.

### Tests créés
`backend/tests/test_lot10_configuration_isolation.py` — 29 tests.

---

## 2. Fichiers NON modifiés (volontairement)

- **Aucun modèle, aucune migration.** `AnneeScolaire`, `Cycle`, `Salle`,
  `ParametreEtablissement`, `Role` et `AuditLog` portent déjà une colonne
  `etablissement_id NOT NULL` ; `Trimestre` et `Matiere` sont OWNERSHIP via
  leur relation. Rien à ajouter en base.
- **Aucun fichier frontend.** `npx tsc --noEmit` propre. Les pages continuent
  d'envoyer `?etablissement_id=…` que FastAPI ignore maintenant — c'est
  précisément la propriété recherchée. La page de login continue de fonctionner
  sans token (voir §4.7).
- `Etablissement` reste un modèle **GLOBAL** conformément au cahier des charges :
  il n'a pas été rendu « tenant ». Seul l'**accès** à ses routes a été cadré.

---

## 3. Tests exécutés et résultats

| Exécution | Résultat |
|-----------|----------|
| `test_lot10_configuration_isolation.py` | **29 passed** |
| **Suite complète `tests/`** | **402 passed, 10 skipped, 0 échec** (258 s) |
| `npx tsc --noEmit` (frontend) | 0 erreur |
| `python -m py_compile` | OK |

Progression : Lot 9 (correctifs inclus) = 373 passed → Lot 10 = **402 passed**.
**+29 = exactement les tests ajoutés. Aucune régression.**

Vérification d'impact frontend (cette fois réellement exécutée) : aucune page
n'appelle `GET /api/parametrage/etablissements`, la route désormais réservée au
SUPER_ADMIN — **aucune page n'est cassée par cette restriction**. Les deux
appels à `list_trimestres` passent bien `annee_id`, devenu obligatoire.

---

## 4. Problèmes trouvés

### 4.1 — Réécriture de l'identité de n'importe quelle école (CRITIQUE)
`PUT /api/parametrage/etablissements/{id}` prenait `id` tel quel. **Tout compte
authentifié — y compris un élève — pouvait changer le nom, l'adresse, le
directeur, le logo, le cachet et la signature de n'importe quelle école.**
Idem pour `POST /etablissements/{id}/upload/{field}`, qui permettait de
remplacer le **cachet et la signature** servant aux bulletins et aux reçus.

### 4.2 — Réécriture des paramètres de n'importe quelle école (CRITIQUE)
`PUT /api/parametrage/settings` prenait `etablissement_id` en **paramètre de
requête**, fourni par le client. N'importe quel compte pouvait donc modifier
les seuils de notation, les réglages financiers ou l'identité d'une autre école.

### 4.3 — Paramètres de toute école lisibles **sans authentification** (CRITIQUE)
`GET /api/parametrage/settings?etablissement_id=N` est une route publique (sans
JWT, nécessaire à la page de login pour la marque). Elle rendait **toutes** les
catégories : `NOTATION`, `FINANCE`, `DOCUMENTS`, `CALENDRIER` incluses, pour
n'importe quelle école, à n'importe quel visiteur anonyme.

### 4.4 — Journal d'audit lisible et falsifiable (CRITIQUE)
`GET /api/securite/audit-log?etablissement_id=N` : lecture du journal de
n'importe quelle école. `POST /api/securite/audit-log` prenait
`etablissement_id` dans le corps : **on pouvait écrire de fausses entrées dans
le journal d'audit d'une autre école** — c'est-à-dire empoisonner la preuve.

### 4.5 — Porte dérobée annulant le Lot 9-A (ÉLEVÉ)
`parametrage.py` expose `/matieres`, `/matieres/{id}`, `/matieres-batch` — des
doublons des routes `/api/matieres` sécurisées au Lot 9-A, mais **sans aucun
contrôle**. Lister, créer et modifier les matières de toute autre école restait
donc possible : le Lot 9-A était contourné.

### 4.6 — Contamination inter-écoles dans l'auto-génération des matières (ÉLEVÉ)
`POST /matieres/auto-generation` cherchait les cycles par leur seul `code`
(`Cycle.code == "PRM"`) **sans filtre d'établissement**, et créait les cycles
manquants avec `etablissement_id=1` **en dur**. La deuxième école à lancer la
génération rattachait donc l'intégralité de son programme aux cycles de la
première.

### 4.7 — Calendrier scolaire d'autrui modifiable (ÉLEVÉ)
`update_annee`, `activer_annee`, `create_trimestre`, `update_trimestre`,
`delete_trimestre` et `cloturer_trimestre` ne vérifiaient rien. Or **clôturer
un trimestre verrouille la saisie des notes** et **activer une année change
l'année courante** : un tiers pouvait geler la saisie d'une autre école.

### 4.8 — Opérations plateforme ouvertes à tous (MOYEN)
`GET /etablissements` (annuaire complet de la plateforme) et
`POST /etablissements` (création d'une école) étaient accessibles à tout compte
authentifié.

### 4.9 — Lectures transverses (MOYEN)
`list_annees`, `list_cycles`, `list_salles`, `list_roles`, `list_trimestres`
prenaient `etablissement_id`/`annee_id` du client, avec **défaut à 1**.

---

## 5. Problèmes corrigés

| # | Correction |
|---|---|
| 4.1 | `id != etablissement_id` du token → **404**. Un compte ne modifie et ne téléverse que pour SA propre école. |
| 4.2 | `etablissement_id` vient de `Depends(require_etablissement)` ; le paramètre de requête est ignoré, et l'upsert force la valeur du token même si le corps en propose une autre. |
| 4.3 | Découpage explicite : appelant **authentifié** → toutes catégories, mais de SON école uniquement ; appelant **anonyme** → uniquement `THEME`, `IDENTITE`, `CARTE` (ce dont la page de login a besoin), et **401** s'il réclame une catégorie sensible. |
| 4.4 | Lecture filtrée par le token ; écriture rattachée au token, plus au corps de la requête. |
| 4.5 | `_matiere_ou_404` (jointure sur `Cycle`) sur toutes les routes matières, y compris le batch où **chaque** élément est vérifié — un seul intrus fait échouer le lot entier. |
| 4.6 | Les cycles sont cherchés **et** créés avec l'`etablissement_id` du compte appelant. |
| 4.7 | `_annee_ou_404` / `_trimestre_ou_404` sur les 6 routes ; création d'année rattachée au token. |
| 4.8 | `dependencies=[Depends(require_roles("SUPER_ADMIN"))]` sur les deux routes plateforme. |
| 4.9 | `Depends(require_etablissement)` partout ; `annee_id` de `list_trimestres` est devenu obligatoire **et** validé comme appartenant à l'appelant. |

**Convention d'erreur inchangée depuis le Lot 0** : **404** pour une ressource
d'une autre école (ne jamais confirmer son existence), **403** pour un rôle
insuffisant ou un compte sans établissement déterminé.

---

## 6. Problèmes restants

### 6.1 — `securite.py` et `parametrage.py` ne sont pas restreints aux rôles admin
Ces routes exigent désormais un établissement, mais pas un rôle d'administration :
un `ENSEIGNANT` de l'école A peut toujours modifier les paramètres **de l'école
A**. C'est un problème de **RBAC**, pas d'isolation multi-écoles — un axe
distinct du présent chantier, et le corriger changerait le comportement de
pages frontend existantes.
**Correction proposée** : appliquer `require_roles(*ADMIN_TIER_ROLES)` à
`securite_router` et aux routes d'écriture de `parametrage_router`, en vérifiant
d'abord quelles pages frontend les appellent et sous quels rôles. **À décider
hors chantier.**

### 6.2 — `Utilisateur.role` n'est pas relié à la table `Role`
`securite.py` gère des rôles personnalisés en base (`ss_roles` + `ss_permissions`),
mais l'autorisation réelle du backend repose sur la chaîne `Utilisateur.role` et
sur `ADMIN_TIER_ROLES`, sans jamais lire ces tables. Les permissions
configurées dans l'interface **ne sont donc appliquées nulle part**.
Constat d'audit, sans lien avec l'isolation ; signalé pour information.

### 6.3 — ⚠️ Le frontend affiche l'identité de l'école 1 à TOUTES les écoles (DÉPASSE CE LOT)
**Trouvé en vérifiant l'impact frontend du Lot 10. C'est le dernier verrou
multi-écoles du produit, et il n'est pas dans `parametrage.py`/`securite.py`.**

Chaîne constatée, vérifiée fichier par fichier :
1. `backend/app/api/auth.py` — l'objet `user` renvoyé au login **ne contient
   pas** `etablissement_id` (il est bien dans le JWT depuis le Lot 0, mais pas
   dans le corps de la réponse).
2. `frontend/src/context/AuthContext.tsx` — ne stocke donc que
   `{id, nom, prenom, nom_utilisateur, email, telephone, role}`.
3. `frontend/src/context/AppContext.tsx` — `const [etablissementId,
   setEtablissementId] = useState<number>(1)`. `setEtablissementId` est exposé
   dans le contexte mais **n'est appelé nulle part** (vérifié : les 4 seules
   occurrences sont la déclaration du type, le stub par défaut, le `useState`
   et l'export).

Conséquence : `fetchEtablissement()` et `fetchTheme()` interrogent
perpétuellement l'établissement 1. **Un utilisateur de l'école 5 voit le nom,
le logo, le cachet, la signature et les couleurs de l'école 1.** Le backend est
désormais correctement isolé — c'est bien l'affichage qui est figé.

Pas une faille de lecture de données (les routes métier filtrent par le token),
mais un défaut fonctionnel bloquant pour une mise en service multi-écoles.

**Correction proposée** (3 fichiers, additive, sans rupture) :
1. Ajouter `"etablissement_id": <source>` à l'objet `user` des **4** branches de
   login (`Utilisateur`, `Enseignant`, `Parent`, `Eleve`) — pour le parent,
   réutiliser `_derive_parent_etablissement`, déjà écrit au Lot 0.
2. `AuthContext` : ajouter le champ à `UserInfo` et le persister.
3. `AppContext` : initialiser `etablissementId` depuis l'utilisateur connecté
   au lieu de la constante `1`, avec repli sur `1` **uniquement** avant login
   (page de connexion anonyme, où aucune école n'est encore déterminée).

**Non appliqué ici** : cela touche l'authentification et deux contextes React
globaux, donc bien au-delà des deux modules de configuration du Lot 10. La
règle du cahier des charges (« STOP + demander si la correction dépasse le lot
en cours ») s'applique. **En attente de votre décision.**

### 6.4 — `etablissement_id: 1` codé en dur dans la file offline (inerte)
`frontend/src/lib/api.ts:131` attache `etablissement_id: 1` à chaque opération
mise en file hors-ligne. C'est désormais **sans effet** : au rejeu, le serveur
dérive l'établissement du token et ignore cette valeur. À nettoyer avec 6.3
pour éviter qu'elle ne redevienne significative un jour.

### 6.5 — Aucun problème d'isolation résiduel connu sur les 2 modules du lot

---

## 7. Suite

Reste le **Lot 11** (secondaire : `bibliotheque.py`, `informatique.py`,
`tasks.py`, `dashboard.py`), qui portera aussi les derniers vestiges
`etablissement_id = 1` inventoriés au §6.5 du rapport du Lot 9 :
`Ouvrage.etablissement_id = default=1` (modèle), `OuvrageBase` (schéma),
`informatique.py` ×2, `dashboard.py` ×1.
