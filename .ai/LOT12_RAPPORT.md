# LOT 12 — IDENTIFIANTS, MATRICULES ET RBAC

Traitement des trois réserves laissées ouvertes par la synthèse finale
(§4.1 matricules, §4.2 identifiants de connexion, §4.3 RBAC), plus deux failles
découvertes en les instruisant.

---

## 1. Correction d'un diagnostic erroné de ma part

La synthèse qualifiait §4.1 de **bloquant** : « `ss_eleves.matricule` porte un
index unique global, deux écoles ne peuvent pas employer le même matricule ».

**C'était mal analysé.** Les matricules ne sont pas saisis par les écoles :
`eleves.py` et `enseignants.py` les **génèrent** (`ELV-{count + 1:05d}`).
Aucune école ne choisit son matricule, donc la collision décrite ne pouvait pas
se produire, et l'unicité globale n'est pas un blocage — elle est au contraire
**nécessaire**, puisque le login résout enseignants et élèves PAR MATRICULE.

Le vrai problème était ailleurs, et le mécanisme de génération en portait
quatre :

1. **Fuite inter-écoles** : `COUNT(*)` GLOBAL. Une école déduisait le volume
   d'élèves de toute la plateforme en lisant ses propres matricules, et sa
   numérotation était trouée par les créations des autres écoles.
2. **Réattribution après suppression** : `COUNT + 1` régresse dès qu'une fiche
   disparaît. Le matricule libéré était réattribué — alors qu'il figure sur des
   cartes imprimées, des bulletins et des archives. Si la fiche existait
   encore, c'était une `IntegrityError` sur l'index unique, donc un **500**.
3. **Course** : deux inscriptions simultanées lisaient le même `COUNT` et
   fabriquaient le même matricule.
4. Aucune école ne reconnaissait ses propres matricules.

---

## 2. Fichiers modifiés

### Matricules
- `backend/app/core/matricules.py` **(nouveau)** — source unique, remplace la
  génération dupliquée trois fois.
- `backend/app/models/academique.py` — modèle `SequenceMatricule`
  (`ss_sequences_matricule`), compteur persistant par (établissement, type).
- `backend/app/api/eleves.py` (2 emplacements), `backend/app/api/enseignants.py`.
- `backend/migrations/lot12_sequences_matricule.py` **(exécutée)**.

Nouveau format : `ELV-{etablissement_id}-{NNNNN}` — propre à l'école,
contigu chez elle, et globalement unique grâce au préfixe. Vérifié : le format
n'est analysé nulle part (backend ni frontend).

Le compteur est verrouillé (`FOR UPDATE`) le temps de l'incrément et **ne
décroît jamais**. À la première utilisation d'une école, il s'amorce au-dessus
des fiches déjà présentes.

### Identifiants de connexion
- `backend/app/core/identifiants.py` **(nouveau)** — contrôle d'unicité sur les
  **9 champs** servant à se connecter, dans les **4 tables**.
- `backend/app/api/personnel.py`, `enseignants.py`, `eleves.py` — contrôle
  branché sur les trois points de création de comptes.
- `backend/migrations/lot12_unicite_identifiants_connexion.py` **(exécutée)** —
  6 index uniques partiels.

### RBAC
- `backend/main.py` — `securite_router` restreint à `ADMIN_TIER_ROLES`.
- `backend/app/api/parametrage.py` — `_require_admin` sur les **14 routes
  d'écriture** ; les lectures restent ouvertes.
- `backend/app/schemas/schemas.py` — `ParametreCreate.etablissement_id` rendu
  facultatif (il était obligatoire alors que la route l'ignore).

### Faille de prise de contrôle de compte parent
- `backend/app/api/eleves.py` — inscription complète.

### Tests créés
- `test_lot12_identifiants_et_matricules.py` — 12 tests.
- `test_lot12_rbac_configuration.py` — 16 tests.
- `test_isolation_multi_ecole.py` — +1 test (verrou sur la clé de cache).

---

## 3. Problèmes trouvés et corrigés

### 3.1 — 🔴 Prise de contrôle d'un compte parent d'une autre école (CRITIQUE)
**Découverte en instruisant §4.2.** À l'inscription complète d'un élève,
`eleves.py` cherchait un parent existant par téléphone **sur toute la
plateforme**, puis, s'il en trouvait un :
- **réécrivait son mot de passe** avec celui fourni dans la requête ;
- complétait ses champs vides ;
- **renvoyait son nom et son prénom réels** dans la réponse.

Concrètement : un administrateur de l'école A saisit le numéro d'un parent de
l'école B et un mot de passe de son choix → il connaît désormais les
identifiants de ce parent, et accède à travers son compte aux données de ses
enfants dans l'école B. Le simple fait de saisir un numéro révélait en outre
l'identité réelle de son porteur.

**Corrigé** : la fiche existante est toujours réutilisée — un parent peut
légitimement avoir des enfants dans plusieurs écoles, cas explicitement
supporté depuis le Lot 0 — mais elle n'est **modifiée que si ce parent relève
déjà de l'établissement appelant**. Sinon : aucune écriture, et la réponse
renvoie l'identité **saisie par l'appelant**, jamais celle stockée.
Le cas légitime (même école) reste testé et fonctionnel.

### 3.2 — 🟠 Identifiants de connexion non uniques
`POST /api/auth/login` accepte un champ unique `identifiant` et le cherche dans
4 tables par `.first()` :

| Table | Champs acceptés au login |
|---|---|
| Utilisateur | `nom_utilisateur`, `email`, `telephone` |
| Enseignant | `telephone`, `email`, `matricule` |
| Parent | `telephone_1`, `email` |
| Eleve | `matricule` |

Seuls `nom_utilisateur` et les deux `matricule` étaient uniques. Deux comptes
partageant un e-mail ou un téléphone → le premier trouvé gagne, **le second ne
peut plus jamais se connecter**, en silence. En multi-écoles c'est mécanique :
deux établissements inscrivent naturellement des personnes différentes portant
le même numéro.

**Corrigé sur deux niveaux** :
- **Applicatif** — `exiger_identifiants_libres()` couvre les 9 champs et les 4
  tables, donc aussi les collisions **inter-tables** (le téléphone d'un
  enseignant contre celui d'un utilisateur), qu'aucun index ne peut exprimer.
  Réponse **409**, pas 500.
- **Base** — 6 index uniques **partiels**
  (`WHERE ... IS NOT NULL AND <> ''`, car e-mail et téléphone sont facultatifs).

Le message d'erreur ne révèle **ni le propriétaire ni son établissement** :
un administrateur ne doit pas pouvoir sonder l'annuaire des autres écoles.
Vérifié par test.

### 3.3 — 🟠 Configuration modifiable par n'importe quel rôle
`parametrage_router` et `securite_router` n'exigeaient qu'un token valide. Un
ENSEIGNANT — voire un PARENT ou un ELEVE — pouvait réécrire les paramètres de
notation et de finance de son école, **clôturer un trimestre** (donc verrouiller
la saisie des notes de tout l'établissement), redéfinir les rôles et
permissions, et lire le journal d'audit.

**Corrigé** en reprenant la politique que le produit encode déjà côté frontend
(`src/lib/roleAccess.ts`), plutôt qu'une politique inventée :

| Périmètre | Accès |
|---|---|
| Écritures de configuration (14 routes) | `ADMIN_TIER_ROLES` |
| Lectures de configuration | tout compte authentifié de l'établissement |
| Sécurité & audit (8 routes) | `ADMIN_TIER_ROLES`, lectures comprises |
| Créer / lister les établissements | `SUPER_ADMIN` (déjà fait au Lot 10) |

Les **lectures** restent volontairement ouvertes : elles alimentent des écrans
non-admin (en-tête de l'application, bulletins, notes, archive, réinscription
comptable) et ne portent que des données de référence de la propre école de
l'appelant. Les restreindre aurait cassé ces écrans — vérifié consommateur par
consommateur côté frontend.

### 3.4 — Affirmation erronée corrigée : le cache n'était pas mort
Le rapport du Lot 11 (§6.4) affirmait que `_invalidate_dashboard_cache` était
du code mort. **Faux** : la clé `dashboard:{etablissement_id}:{annee_id}` est
bien écrite, par `finance.py::dashboard_financier` (TTL 60 s) — c'est le
tableau de bord **financier**, pas le tableau de bord pédagogique. Bonne
nouvelle pour le chantier : la clé **contient l'établissement**, issu du token,
donc le cache est correctement cloisonné. Rapport corrigé, et verrou de
non-régression ajouté.

---

## 4. Vérifications réelles exigées par le cahier des charges

Avant d'ajouter la moindre contrainte, recherche de doublons **réellement
exécutée** sur la base de production (lecture seule) :

```
ss_utilisateurs.email       -> aucun doublon
ss_utilisateurs.telephone   -> aucun doublon
ss_utilisateurs.nom_utilisateur -> aucun doublon
ss_parents.telephone_1      -> aucun doublon
ss_parents.email            -> aucun doublon
ss_eleves.matricule         -> aucun doublon
ss_enseignants.matricule    -> aucun doublon
```

Les deux migrations recomptent **au moment de leur exécution** (un audit
préalable ne suffit pas) et **s'arrêtent sans rien modifier** si un doublon
apparaît, en le listant. Aucune fusion, aucune suppression, aucun backfill
automatique. Les deux ont été exécutées puis **rejouées** pour prouver leur
idempotence.

---

## 5. Tests et résultats

| Exécution | Résultat |
|---|---|
| `test_lot12_identifiants_et_matricules.py` | **12 passed** |
| `test_lot12_rbac_configuration.py` | **16 passed** |
| `test_lot12_rbac_configuration.py` + `test_lot10_*` | **45 passed** |
| Suite complète après matricules/identifiants | **460 passed, 10 skipped** |
| Suite complète après RBAC (avant ses tests) | **461 passed, 10 skipped** |
| **Suite complète finale** | **477 passed, 10 skipped, 0 échec** (364 s) |
| Frontend `npm run test:run` | **102 passed** |
| `npx tsc --noEmit` | 0 erreur |

Progression : 448 (fin Lot 11) → 460 (+12, matricules/identifiants) → 461
(+1, verrou de cache) → **477** (+16, RBAC).
**Chaque incrément correspond exactement aux tests ajoutés : aucune régression.**

Point notable : le passage au RBAC n'a cassé **aucun** test existant, ce qui
confirme que la politique retenue — lectures ouvertes, écritures réservées —
correspond bien à l'usage réel du produit.

Une erreur d'assertion de ma part a été corrigée en cours de route : mon test
« la suppression ne fait pas régresser le compteur » échouait, car ma première
implémentation reposait sur `MAX(matricule)` — qui régresse bel et bien quand
c'est la fiche la plus récente qui est supprimée. C'est ce qui a motivé le
passage à un compteur persistant, la seule solution qui ne réattribue jamais un
matricule.

---

## 6. Problèmes restants

### 6.1 — Permissions et rôles secondaires : non appliqués, mais **désormais annoncés**
`ss_roles` / `ss_permissions` et `Utilisateur.roles_secondaires` sont
administrables et persistés, mais **aucun des deux n'est lu** par le contrôle
d'accès : `require_roles` n'examine que la chaîne `Utilisateur.role`. Ce lot a
fermé l'accès à ces tables (§3.3) ; il n'a pas branché leur contenu sur les
décisions d'autorisation.

**Analyse d'impact faite avant de décider quoi que ce soit** :
- Les **13 rôles assignables** du formulaire du personnel sont tous couverts
  par le système statique (ensemble assignable ⊆ ensemble configuré dans
  `roleAccess.ts`) — **aucun compte n'est bloqué**.
- **Aucune faille** : les contrôles statiques s'appliquent partout.
- Le vrai risque est la **fausse assurance** : un directeur décoche une
  permission, lit « mises à jour avec succès », et croit avoir restreint un
  collaborateur qui ne l'est pas. Idem pour les rôles secondaires, dont
  l'assistant laissait penser qu'ils ouvraient des accès.

**Correctif court appliqué** (le chantier RBAC complet reste à planifier) :
rendre les deux non-effets **visibles** au lieu de silencieux, sans toucher aux
autorisations.
- `parametres/securite` : bandeau d'avertissement au-dessus de la matrice.
- Assistant du personnel : mention explicite sous « Rôles secondaires ».
- `PUT /securite/roles/{id}/permissions` répond
  `{"appliquees": false, "message": "…pas encore appliquées…"}`.
- `POST /securite/roles` répond `{"attribuable": false, …}` — un rôle
  personnalisé n'est de toute façon pas assignable, le formulaire du personnel
  ayant une liste figée.
- Docstrings de `securite.py` et `personnel.py` mises à jour.

Verrouillé par `tests/test_permissions_non_appliquees.py` (4 tests), qui vérifie
à la fois **l'annonce** et **le comportement réel** : un surveillant portant
COMPTABLE en rôle secondaire reçoit bien un 403 sur la finance, et retirer la
permission « lecture » sur les élèves ne ferme rien. Ces tests **échoueront le
jour où le RBAC dynamique sera branché** — c'est voulu : ils forceront à
retirer les avertissements devenus faux.

**Correction de fond proposée** : faire de `require_roles` un lecteur de
`ss_permissions` et de `roles_secondaires`, avec repli sur les rôles statiques.
Chantier à part entière, qui touche toutes les routes — à planifier, pas à
improviser.

### 6.2 — Deux parents partageant un téléphone
`telephone_1` étant l'identifiant de connexion du parent, il est désormais
unique. Un couple partageant un seul numéro ne peut donc plus avoir deux
comptes distincts : il faut soit un compte parent commun, soit renseigner le
second numéro. Auparavant les deux fiches se créaient, mais **l'une des deux ne
pouvait pas se connecter** — l'erreur est maintenant explicite au lieu d'être
silencieuse. Point d'exploitation à connaître.

### 6.3 — Page de login et marque de l'établissement
Inchangé : un visiteur anonyme n'a pas d'école, la page de login affiche donc
celle de l'établissement 1. Choix produit (sous-domaine ou sélecteur), sans
effet sur l'isolation.

---

## 7. État du chantier

Les 13 lots (0 à 12) sont traités. Les trois réserves de la synthèse finale
sont levées, à l'exception du branchement effectif des permissions (§6.1), qui
constitue un chantier distinct.
