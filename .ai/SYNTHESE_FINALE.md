# SMARTSCHOOL — CHANTIER MULTI-ÉCOLES : SYNTHÈSE FINALE

Migration d'une architecture implicitement mono-établissement vers une
plateforme centralisée multi-écoles (une base PostgreSQL, N écoles, isolation
logique stricte imposée au niveau FastAPI).

**Verdict : GO.** L'isolation des données est en place, testée et sans
régression sur les 13 lots. Les trois réserves qui subsistaient à la première
rédaction de cette synthèse ont été traitées au **Lot 12** — voir §4, réécrit,
et `.ai/LOT12_RAPPORT.md`. Une seule limite structurelle demeure, sans effet
sur l'isolation : les permissions administrables ne pilotent pas encore les
décisions d'autorisation (§4.3).

---

## 1. Ce qui a été fait

| Lot | Périmètre | Routes | Tests |
|-----|-----------|--------|-------|
| 0 | Identité JWT (`auth.py`, `core/auth.py`) | — | 13 |
| 1 | Comptabilité | 12 | 15 |
| 2 | Finance | 30 | 17 |
| 3 | Personnel | 7 | 10 |
| 4 | Examens | 9 | 15 |
| 5 | Communication | 19 | 16 |
| 6 | Élèves | 11 | 15 |
| 7 | Classes | 12 | 18 |
| 8 | Enseignants | 14 | 19 |
| 9 | Autres modules (14 fichiers, 3 passes) | 102 | 80 |
| 10 | Configuration (`parametrage`, `securite`) | 27 | 29 |
| 11 | Secondaire + identité frontend | 14 | 26 |
| 12 | Identifiants, matricules, RBAC | 22 | 28 |
| — | Suite consolidée (15 tests obligatoires) | — | 21 |
| **Total** | **~40 fichiers API** | **~279** | **~322** |

**Suite complète : 477 passed, 10 skipped, 0 échec.**
Frontend : 102 tests, `tsc --noEmit` propre, build de production réussi.

### Fondations posées (Lot 0)
- Le JWT porte `{sub, role, type, etablissement_id, exp}`, dérivé **côté
  serveur** au login. `etablissement_id` n'est jamais accepté d'un corps de
  requête, d'un paramètre d'URL, d'un en-tête ni du `localStorage`.
- `require_etablissement` refuse explicitement (403) un compte sans
  établissement déterminé, au lieu de retomber sur une valeur par défaut ou sur
  « pas de filtre ». Le motif interdit `if etablissement_id: query.filter(...)`
  n'existe nulle part.
- `SUPER_ADMIN` avec `etablissement_id = NULL` est un administrateur
  **plateforme** : `NULL` ne signifie jamais « accès à tout ».
- Parent : établissement dérivé via `EleveParent → Eleve.etablissement_id`,
  **jamais par `.first()`**. Zéro ou plusieurs écoles ⇒ `None`, et les routes du
  portail vérifient alors la filiation réelle.

### Conventions tenues sur les 12 lots
- **404** pour toute ressource d'une autre école (ne jamais confirmer son
  existence) ; **403** pour une violation d'identité/rôle.
- Modèles **GLOBAUX** non modifiés : `Etablissement`, `TypeEvaluation`,
  `JournalComptable`, `CompteComptable`.
- Modèles **OWNERSHIP** isolés par leur relation réelle, sans colonne
  redondante (`Note → Evaluation → Classe`, `Bulletin → Inscription → Eleve`,
  `Trimestre → AnneeScolaire`, `Matiere → Cycle`, `Exemplaire → Ouvrage`…).
- **Aucun `UPDATE ... SET etablissement_id = 1` de masse.** Les 6 migrations
  écrites re-vérifient l'état **à l'exécution** (comptage des lignes, recherche
  de doublons) et s'arrêtent sans rien modifier si la condition n'est pas
  remplie, en listant ce qui bloque. Chacune a été réellement exécutée sur
  Supabase puis rejouée pour prouver son idempotence.
- **Aucun Alembic** introduit ; mécanisme de migration existant du projet.

### Vérification finale de conformité
```
grep -rn "etablissement_id: int = 1|= Query(1)|etablissement_id=1" app/
→ 3 résultats, tous des COMMENTAIRES. Aucune occurrence exécutable.
```

---

## 2. Les 15 tests obligatoires

Consolidés dans `backend/tests/test_isolation_multi_ecole.py` — **20 tests,
tous verts**.

| # | Scénario | État |
|---|----------|------|
| 1-4 | GET / PUT / DELETE / POST inter-écoles | ✅ 404, aucune écriture chez l'autre |
| 5 | `etablissement_id` forcé dans le corps ou l'URL | ✅ ignoré, ressource rattachée à l'appelant |
| 6 | Même identifiant métier dans 2 écoles | ⚠️ voir réserve §4.1 |
| 7 | Parent mono-école | ✅ établissement dérivé |
| 8 | Parent multi-écoles | ✅ `None`, jamais choisi au hasard |
| 9 | Identifiant de connexion dupliqué | ⚠️ voir réserve §4.2 |
| 10 | Token non falsifiable | ✅ re-signature et troncature rejetées (401) |
| 11 | Changement de compte, aucun résidu | ✅ périmètres disjoints |
| 12 | Tâche RQ / mauvais établissement | ✅ worker **et** lecture du statut |
| 13 | Pas de collision de périmètre (cache) | ✅ l'établissement fait partie de la clé de cache |
| 14 | Exports PDF | ✅ jamais de PDF d'une autre école |
| 15 | Recherche | ✅ aucun endpoint global ; recherches par module isolées |

---

## 3. Failles les plus graves corrigées

| Faille | Lot |
|---|---|
| **Réécriture de l'identité de n'importe quelle école** — nom, logo, **cachet et signature** des bulletins et reçus, par n'importe quel compte authentifié, **y compris un élève** | 10 |
| **Journal d'audit lisible ET falsifiable** — on pouvait écrire de fausses entrées dans le journal d'une autre école, donc empoisonner la preuve | 10 |
| **Paramètres de toute école lisibles sans aucun token** (`NOTATION`, `FINANCE` inclus) sur une route publique | 10 |
| **Tableau de bord complet d'une autre école** — effectifs, chiffre d'affaires, impayés, dépenses, incidents, en incrémentant un identifiant | 11 |
| **Contamination de la préparation d'année** — une école créait chez elle les classes de toutes les autres | 9 |
| **Scan QR sans frontière** — badge élève ou agent d'une autre école accepté et pointé | 9 |
| **Galerie photos** — annuaire complet de la plateforme (élèves, enseignants, parents) exposé, et photo de profil de n'importe qui modifiable ou supprimable | 9 |
| **Paramètres de notation de l'école 1 appliqués à toutes** — seuils de mentions et pondérations Écrit/Oral/Composition, sur les bulletins et les évaluations | 9 |
| **Auto-génération des matières** — la 2ᵉ école greffait son programme sur les cycles de la 1ʳᵉ | 10 |
| **Porte dérobée annulant le Lot 9-A** — `/parametrage/matieres` doublonnait les routes sécurisées sans aucun contrôle | 10 |
| **Bibliothèque** — emprunter les livres d'une autre école, et inscrire l'emprunt au nom d'un de ses élèves | 11 |
| **Frontend figé sur l'école 1** — chaque école voyait le nom, le logo, le cachet, la signature et les couleurs de l'école 1 | 11 |

### Bugs préexistants découverts et corrigés au passage
- `POST /api/informatique/tickets` levait un `TypeError` systématique
  (`signale_par` passé deux fois) : **la création de ticket était inopérante**.
- Régression du Lot 5 : les deux `INSERT INTO ss_messages` bruts de `photos.py`
  n'alimentaient pas une colonne devenue `NOT NULL` — **les deux routes
  d'upload de photo plantaient en production**.
- `activites.py` : f-string incompatible Python 3.11 empêchant la compilation.

---

## 4. Réserves — état après le Lot 12

### 4.1 — ~~BLOQUANT : matricules uniques sur toute la plateforme~~ → **DIAGNOSTIC ERRONÉ, corrigé**
Cette synthèse affirmait que deux écoles ne pouvaient pas employer le même
matricule, et qualifiait le point de bloquant. **Mauvaise analyse** : les
matricules ne sont pas saisis, ils sont **générés** par l'application. Aucune
école ne choisit son matricule, la collision décrite ne pouvait donc pas se
produire — et l'unicité globale est au contraire **nécessaire**, puisque le
login résout enseignants et élèves PAR MATRICULE.

Le vrai défaut était dans la génération (`COUNT(*)` global) : compteur partagé
entre écoles (une école déduisait le volume de la plateforme), réattribution
d'un matricule après suppression d'une fiche, et collision entre créations
simultanées. **Corrigé au Lot 12** par un compteur persistant par
établissement, verrouillé pendant l'incrément et qui ne décroît jamais. Format
`ELV-{etablissement_id}-{NNNNN}`.

### 4.2 — ~~Identifiants de connexion ambigus~~ → **TRAITÉ (Lot 12)**
Option retenue : **identifiants globaux**, cohérente avec l'architecture
existante (`nom_utilisateur` l'était déjà, et le matricule doit l'être pour le
login). Contrôle applicatif sur les **9 champs des 4 tables** — donc aussi les
collisions inter-tables, qu'aucun index ne peut exprimer — répondant **409**,
plus 6 index uniques partiels en base. Le message d'erreur ne révèle ni le
propriétaire de la valeur, ni son établissement.

Recherche de doublons exigée par le cahier des charges, **réellement exécutée**
sur la base de production avant toute contrainte (lecture seule,
`GROUP BY … HAVING COUNT(*) > 1`) : **aucun doublon** sur les 7 colonnes
concernées, donc aucune donnée à fusionner.

### 4.3 — 🟠 RBAC : accès fermé, permissions pas encore branchées
**Traité au Lot 12** pour la partie accès : `securite_router` est réservé à
`ADMIN_TIER_ROLES` (lectures comprises), et les **14 routes d'écriture** de
`parametrage` également. Les lectures de configuration restent volontairement
ouvertes à tout compte de l'établissement — elles alimentent des écrans
non-admin, vérifié consommateur par consommateur. La politique appliquée est
celle que le produit encode déjà dans `src/lib/roleAccess.ts`.

**Reste ouvert** : `ss_roles`, `ss_permissions` et `Utilisateur.roles_secondaires`
sont administrables mais leur contenu ne pilote aucune décision d'autorisation —
celle-ci repose sur la chaîne `Utilisateur.role`. Sans effet sur l'isolation
multi-écoles, et **aucun compte n'est bloqué** : les 13 rôles assignables sont
tous couverts par le système statique (vérifié).

Le risque réel était la **fausse assurance** — décocher une permission, lire
« succès », et croire avoir restreint quelqu'un. Traité : l'interface et l'API
annoncent désormais explicitement que ces réglages sont enregistrés mais pas
appliqués, et 4 tests verrouillent à la fois l'annonce et le comportement réel.

**Correction de fond proposée** : faire de `require_roles` un lecteur de
`ss_permissions` et de `roles_secondaires`, avec repli sur les rôles statiques.
Chantier à part entière, qui touche toutes les routes.

### 4.4 — 🔴 Faille découverte et corrigée en instruisant §4.2
À l'inscription complète d'un élève, saisir le téléphone d'un parent d'une
**autre école** réécrivait son mot de passe et révélait son nom réel : un
administrateur pouvait ainsi prendre le contrôle du compte d'un parent d'un
autre établissement et accéder, à travers lui, aux données de ses enfants.
Corrigé au Lot 12 — la fiche existante reste réutilisable (le parent
multi-écoles est un cas supporté), mais elle n'est **modifiée que si ce parent
relève déjà de l'établissement appelant**.

---

## 5. Points mineurs signalés, non corrigés

1. **Page de login** : un visiteur anonyme n'ayant par définition aucune école,
   la marque affichée est celle de l'établissement 1. Résoudre cela demande un
   sous-domaine par école ou un sélecteur — **choix produit**. Sans effet sur
   l'isolation : depuis le Lot 10, un anonyme ne reçoit que les catégories
   `THEME`/`IDENTITE`/`CARTE`.
2. **`photos.py`** : `PhotoEnAttente` n'a pas de colonne établissement ; le
   filtrage se fait en Python, entité par entité. Correct mais non indexé —
   à surveiller si la file de validation grossit.
3. **`FournitureScolaire`** : `default=1` retiré et colonne passée `NOT NULL`
   (migration exécutée). `Ouvrage` : `default=1` retiré, colonne déjà `NOT NULL`.
4. **Cache du tableau de bord financier** : clé
   `dashboard:{etablissement_id}:{annee_id}`, TTL 60 s, écrite par
   `finance.py::dashboard_financier`. L'établissement provient du token et fait
   partie de la clé — cloisonnement correct, verrouillé par un test.
   *(Une version antérieure de cette synthèse décrivait à tort cette
   invalidation comme du code mort ; c'était une erreur d'analyse, corrigée
   après vérification.)*
5. **Tâches asynchrones** : le contrôle d'accès au statut est *fermé par
   défaut* — une tâche sans `etablissement_id` dans son `meta` est refusée.
   Tout nouveau type de tâche doit renseigner ce champ à l'enqueue.

---

## 6. Ce qui n'a pas été touché

Conformément à la consigne de non-régression : offline / IndexedDB / PWA /
Serwist, RQ / Redis / workers, génération PDF, monitoring, et l'ensemble de
l'interface — hors les 4 fichiers frontend strictement nécessaires au
correctif d'identité (`AuthContext`, `AppContext`, `api.ts`, `offlineQueue.ts`).
Aucun code fonctionnel n'a été réécrit « pour faire plus propre ».

---

## 7. Recommandation

**GO**, y compris pour l'ouverture d'une deuxième école.

Les trois réserves qui motivaient le « GO conditionnel » initial sont levées :
la numérotation est propre à chaque établissement, les identifiants de
connexion sont uniques et vérifiés à la création, et la configuration n'est
plus modifiable que par l'équipe de direction.

Deux points d'exploitation à connaître, ni bloquants ni liés à l'isolation :
- Les permissions administrables ne pilotent pas encore l'autorisation
  (§4.3) — chantier RBAC à planifier séparément.
- Un couple de parents partageant un seul numéro de téléphone doit désormais
  partager un compte, ou renseigner un second numéro (§6.2 du rapport Lot 12).
  Auparavant les deux fiches se créaient mais l'une ne pouvait pas se
  connecter : l'erreur est maintenant explicite au lieu d'être silencieuse.
