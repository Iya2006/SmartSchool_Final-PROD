# LOT 9 — AUTRES MODULES MÉTIER

**Périmètre** : les 14 modules métier restants, hors configuration (Lot 10) et
modules secondaires (Lot 11). Découpé en 3 passes validées par l'utilisateur.

| Passe | Modules | Routes sécurisées | Tests |
|-------|---------|-------------------|-------|
| A | `matieres.py`, `evaluations.py` | 33 | 28 |
| B | `promotion.py`, `reinscription.py`, `emploi_du_temps.py`, `annee_scolaire.py` | 23 | 24 |
| C | `devoirs.py`, `pointage_eleves.py`, `presence_agent.py`, `photos.py`, `fournitures.py`, `vie_scolaire.py`, `evenements.py`, `activites.py` | 46 | 28 |
| **Total** | **14 fichiers** | **102 routes** | **80 tests** |

---

## 1. Fichiers modifiés

### Passe A — pédagogie
- `backend/app/api/matieres.py` — 14 routes. Helpers `_matiere_ou_404`
  (OWNERSHIP via `Cycle`), `_classe_ou_404`, `_cycle_ou_404`.
- `backend/app/api/evaluations.py` — 19 routes. Helpers `_evaluation_ou_404`
  (via `Classe`), `_bulletin_ou_404` (via `Inscription → Eleve`),
  `_note_ou_404` (via `Evaluation → Classe`).

### Passe B — cycle annuel
- `backend/app/api/promotion.py` — 9 routes. **Correction de la contamination
  inter-écoles identifiée à l'audit initial** (voir §4.1).
- `backend/app/api/reinscription.py` — 5 routes.
- `backend/app/api/emploi_du_temps.py` — 6 routes.
- `backend/app/api/annee_scolaire.py` — 3 routes.

### Passe C — modules secondaires
- `backend/app/api/devoirs.py` — 3 routes + helpers
  `_verifier_identite_enseignant` / `_parent` / `_eleve`.
- `backend/app/api/pointage_eleves.py` — 4 routes. **Scan QR corrigé** (§4.2).
- `backend/app/api/presence_agent.py` — 3 routes + `_filtre_agents_etablissement`
  (gère l'`agent_id` polymorphe enseignant/utilisateur). **Scan QR corrigé**.
- `backend/app/api/photos.py` — 10 routes (SQL brut) + helpers
  `_entite_appartient_a_etablissement` / `_exiger_entite_de_letablissement`.
- `backend/app/api/fournitures.py` — 8 routes + `_fourniture_ou_404`.
- `backend/app/api/vie_scolaire.py` — 7 routes + `_inscription_ou_404`.
- `backend/app/api/evenements.py` — 6 routes + `_evenement_ou_404`.
- `backend/app/api/activites.py` — 5 routes + `_activite_ou_404`.

### Tests créés
- `backend/tests/test_lot9a_matieres_evaluations_isolation.py` — 28 tests
- `backend/tests/test_lot9b_cycle_annuel_isolation.py` — 24 tests
- `backend/tests/test_lot9c_modules_secondaires_isolation.py` — 28 tests

---

## 2. Fichiers NON modifiés (volontairement)

- **Aucun modèle** (`app/models/academique.py`) : le Lot 9 n'a **ajouté aucune
  colonne** et **exécuté aucune migration**. Tous les modules concernés étaient
  déjà rattachables, soit par une colonne `etablissement_id` existante, soit par
  leur relation réelle (OWNERSHIP). C'est la contrainte de l'énoncé respectée :
  pas de colonne redondante quand la relation suffit.
- **Aucun fichier frontend** : `npx tsc --noEmit` propre. Le frontend continue
  d'envoyer des `?etablissement_id=` que FastAPI ignore désormais silencieusement
  (les paramètres de requête ont été supprimés des signatures) — comportement
  recherché : aucune valeur venant du client ne peut plus influencer l'isolation.
- **Offline / IndexedDB / PWA / RQ / Redis / cache dashboard / monitoring / PDF** :
  non touchés.
- `bibliotheque.py`, `informatique.py`, `tasks.py`, `dashboard.py`,
  `parametrage.py`, `securite.py` : réservés aux Lots 10 et 11.

---

## 3. Tests exécutés et résultats

Environnement : image Docker `smartschool-tests:local` (Python 3.12, SQLite en
mémoire via `conftest.py`). Le Python local 3.11 **ne peut pas** exécuter la
suite (voir §5.1).

| Exécution | Résultat |
|-----------|----------|
| `test_lot9a_matieres_evaluations_isolation.py` | 28 passed |
| `test_lot9b_cycle_annuel_isolation.py` | 24 passed |
| `test_lot9c_modules_secondaires_isolation.py` | 28 passed |
| **Suite complète `tests/`** | **365 passed, 10 skipped, 0 échec** (616 s) |
| `npx tsc --noEmit` (frontend) | 0 erreur |
| `python -m compileall app/api/` (Python 3.12) | OK |

Progression de la suite : Lot 8 = 337 passed → Lot 9 = 365 passed.
**+28 = exactement le nombre de tests ajoutés en passe C** (A et B étaient déjà
comptés lors de leurs checkpoints). **Aucune régression.**

> **CORRECTION (post-rédaction).** Ce rapport affirmait initialement
> « `grep -c "etablissement_id: int = 1" app/api/*.py` → plus aucune
> occurrence ». **C'était faux** : le grep était enchaîné derrière un
> `py_compile` qui avait échoué, et seule la branche `||` (le message) s'était
> exécutée — la recherche n'a jamais tourné. Le vrai inventaire figure au §6.5,
> et toutes les occurrences des lots clos ont été corrigées (voir §6.6).

---

## 4. Problèmes trouvés

### 4.1 — Contamination inter-écoles dans `promotion.py::preparer_classes_annee` (CRITIQUE)
Le bug nommé dès l'audit initial. La préparation des classes d'une nouvelle
année copiait **toutes les classes actives de la plateforme** portant l'année
source, sans filtre d'établissement : une école déclenchant sa préparation
créait chez elle les classes de toutes les autres écoles.

### 4.2 — Scan QR acceptant les badges de toute la plateforme (CRITIQUE)
`POST /api/pointage-eleves/scan` et `POST /api/presences-agents/scan`
résolvaient le matricule scanné **sur toute la base**. Le badge d'un élève ou
d'un agent d'une autre école était accepté et un pointage lui était enregistré.

### 4.3 — Galerie photos exposant l'annuaire complet (ÉLEVÉ)
`GET /api/photos/galerie/all` retournait **tous les élèves, enseignants et
parents de la plateforme** (noms, prénoms, classes) à n'importe quel compte
authentifié. Les routes unitaires `GET/DELETE /api/photos/{type}/{id}`
permettaient en outre de lire ou supprimer la photo de profil de n'importe qui.

### 4.4 — `presences/batch` ne validait qu'une seule inscription (ÉLEVÉ)
`POST /api/vie-scolaire/presences/batch` n'utilisait que la **première**
inscription du lot (pour le verrou d'année) et ne vérifiait aucune des autres.
Une inscription d'une autre école glissée dans le lot recevait sa présence.

### 4.5 — `FournitureScolaire.etablissement_id` a un `default=1` au niveau modèle (MOYEN)
Toute création sans valeur explicite rattachait la fourniture à l'école 1.

### 4.6 — IDOR sur les identités enseignant / parent / élève (MOYEN)
`/api/devoirs/enseignant/{id}`, `/parent/{id}`, `/eleve/{id}` : n'importe quel
enseignant pouvait lire les devoirs d'un collègue, n'importe quel parent ceux
d'un autre parent.

### 4.7 — `photos.py` contourne l'injection de dépendance (TESTABILITÉ, préexistant)
Le module ouvre sa propre `SessionLocal()` au lieu de `Depends(get_db)`.
L'override de `conftest.py` ne l'atteint donc pas.

---

## 5. Problèmes corrigés

- **4.1** — `preparer_classes_annee` valide désormais les deux années
  (`_annee_ou_404` sur source **et** cible), filtre
  `Classe.etablissement_id == etablissement_id`, et crée les nouvelles classes
  avec l'`etablissement_id` du compte appelant. Verrouillé par test.
- **4.2** — Les deux routes de scan résolvent le matricule **à l'intérieur** de
  l'établissement appelant ; un badge étranger renvoie 404 et **aucun pointage
  n'est écrit** (vérifié en base par les tests).
- **4.3** — La galerie est filtrée par établissement ; les parents sont résolus
  via `EleveParent → Eleve.etablissement_id` (jamais `.first()`). Les routes
  unitaires passent par `_exiger_entite_de_letablissement` → 404 cross-école.
- **4.4** — **Chaque** inscription du lot est validée via `_inscription_ou_404`.
- **4.5** — Corrigé **au niveau API** : `payload["etablissement_id"] = etablissement_id`
  écrase systématiquement la valeur reçue. Le `default=1` du modèle est laissé en
  place — le retirer serait une migration de schéma, hors périmètre du Lot 9, et
  il est désormais inatteignable par les routes. Verrouillé par un test qui vérifie
  en base le rattachement réel après création.
- **4.6** — Helpers `_verifier_identite_*` : un enseignant/parent ne peut
  interroger que son propre identifiant → **403** (violation d'identité, pas 404 :
  la ressource existe et l'appelant sait qu'elle existe).

**Convention d'erreur appliquée, cohérente avec les lots 0 à 8** :
**404** pour toute ressource d'une autre école (ne jamais confirmer l'existence),
**403** pour une violation d'identité/propriété à l'intérieur de la bonne école.

---

## 6. Problèmes initialement laissés en suspens — **tous corrigés depuis**

Les trois points ci-dessous avaient été signalés comme « restants » à la
clôture du lot. Ils ont ensuite été traités, ainsi que d'autres découverts au
passage.

### 6.1 — `photos.py` n'utilisait pas `Depends(get_db)` — **CORRIGÉ**
Les 10 routes ouvraient leur propre `SessionLocal()`. Elles passent désormais
toutes par `db: Session = Depends(get_db)`, et le contournement `monkeypatch`
du fichier de test a été supprimé (28/28 sans lui).

### 6.2 — `FournitureScolaire.etablissement_id = default=1` — **CORRIGÉ**
Vérification en base : la colonne n'avait **aucun défaut SQL** (`column_default`
= NULL) — le `default=1` était purement Python, son retrait ne demandait donc
aucune migration, contrairement à ce que ce rapport indiquait. Le défaut a été
retiré du modèle. La table étant vide (0 ligne, vérifié à l'exécution), la
colonne a en plus été passée **NOT NULL** via
`migrations/lot9_fournitures_etablissement_not_null.py`, réellement exécutée
sur Supabase puis rejouée pour prouver son idempotence.

### 6.3 — `activites.py` : f-string incompatible Python 3.11 — **CORRIGÉ**
L'expression a été sortie dans une variable avant la f-string. Le projet
compile de nouveau sous Python 3.11 comme sous 3.12.

### 6.4 — Régression du Lot 5 découverte ici — **CORRIGÉE**
Les deux `INSERT INTO ss_messages` bruts de `photos.py` n'alimentaient pas
`etablissement_id`, devenue **NOT NULL** au Lot 5. Les deux routes d'upload de
photo (`/upload/...` et `/parent-upload/...`) plantaient donc en production sur
violation de contrainte. La colonne est désormais renseignée depuis le compte
authentifié. Recherche exhaustive faite : ce sont les deux seuls `INSERT` bruts
du projet.

### 6.5 — Inventaire réel de `etablissement_id = 1` (celui que le grep raté avait manqué)
| Catégorie | Occurrences | Traitement |
|---|---|---|
| Helpers internes retombant sur l'école 1 | `evaluations.py` ×4, `finance.py` ×2, `portail_enseignant.py` ×1 | **Corrigé** (§6.6) |
| Champs Pydantic de body | `activites.py`, `eleves.py`, `evenements.py`, `fournitures.py` | **Corrigé** — champs retirés |
| Replis explicites `else 1` | `portail_eleve.py`, `portail_parent.py` | **Corrigé** — 404 au lieu du repli |
| Routes des lots non encore traités | `parametrage.py` ×4, `securite.py` ×2, `dashboard.py` ×1 | Traité au Lot 10 / Lot 11 |
| Champs Pydantic des lots non traités | `informatique.py` ×2, `securite.py` ×3, `schemas.py` (`OuvrageBase`) | Traité au Lot 10 / Lot 11 |
| `Ouvrage.etablissement_id = default=1` (modèle) | 1 | Lot 11, avec son API |

### 6.6 — Fuite réelle trouvée : les paramètres de notation de l'école 1 appliqués à tous
`get_notation_seuils`, `get_poids_evaluations`, `coefficient_pour_evaluation`,
`get_bulletin_display_flags` et `_coefficient_pour_evaluation` portaient
`etablissement_id: int = 1`, et **5 appelants ne passaient pas l'argument**.
Conséquence concrète : les seuils de mentions et les pondérations
Écrit/Oral/Composition de l'établissement 1 étaient appliqués aux bulletins et
aux évaluations de **toutes** les écoles.

Correction : le paramètre est devenu **obligatoire** (plus aucune valeur par
défaut) sur les cinq fonctions, et chaque appelant passe l'établissement de la
classe concernée. Les deux replis `else 1` des portails élève et parent
renvoient maintenant 404 au lieu d'emprunter les réglages d'une autre école.

Verrouillé par `tests/test_lot9_correctifs_defauts_ecole1.py` (8 tests), dont
un test paramétré qui **échouera si une valeur par défaut réapparaît** sur
l'une des cinq fonctions, et un test métier prouvant qu'une même moyenne de
16,5 donne « ASSEZ BIEN » dans une école et « TRÈS BIEN » dans l'autre.

### 6.7 — Aucun problème d'isolation résiduel connu sur les 14 modules du lot

---

## 7. Re-validation après ces correctifs

| Exécution | Résultat |
|-----------|----------|
| `test_lot9c_modules_secondaires_isolation.py` (sans monkeypatch) | 28 passed |
| `test_lot9_correctifs_defauts_ecole1.py` | 8 passed |
| **Suite complète `tests/`** | **373 passed, 10 skipped, 0 échec** |
| `npx tsc --noEmit` | 0 erreur |
| `python -m py_compile` (Python 3.11 local **et** 3.12 Docker) | OK |
| Migration `lot9_fournitures_...` rejouée | `[OK] déjà NOT NULL` — idempotente |

365 → 373 = +8, exactement les tests ajoutés. **Aucune régression.**

---

## 8. Suite

Lot 9 clos, y compris ses points restants. Enchaîné sur le **Lot 10**
(configuration : `parametrage.py`, `securite.py`) — voir `.ai/LOT10_RAPPORT.md`.
Reste ensuite le Lot 11 (secondaire : `bibliotheque.py`, `informatique.py`,
`tasks.py`, `dashboard.py`).
