# Notes de migration — SmartSchool

Mémoire du projet sur les chantiers structurants : ce qui a changé, ce qui est
mort, ce qui reste à faire. À lire avant de toucher au moteur de notation.

---

## 1. Refonte du moteur d'évaluations / notes / bulletins (août 2026)

### Pourquoi

L'ancien moteur imposait une règle figée en dur, héritée d'un seul établissement
pilote : trois catégories **Écrit / Oral / Composition** pondérées 1/1/2, et
« seule la meilleure note de chaque catégorie compte ». Aucune école ne pouvait
s'en écarter, alors que chacune a ses propres coefficients, son propre découpage
de l'année, et — pour les classes d'examen — un passage décidé par le Ministère
et non par une moyenne interne.

### Ce qui a changé

**Une seule source de vérité pour le calcul : `backend/app/services/notation.py`.**
La logique était auparavant dupliquée entre `api/evaluations.py` et
`api/portail_enseignant.py`, et les deux copies avaient déjà divergé. Toute
évolution du calcul se fait désormais dans ce module, jamais dans un routeur.

**Nouvelle règle de calcul, deux étages, moyenne pondérée classique :**

1. Moyenne d'une matière = Σ(moyenne du type × coefficient du type) ÷ Σ(coefficients)
   où la moyenne d'un type est la moyenne simple de ses notes.
2. Moyenne générale = Σ(moyenne matière × coefficient matière) ÷ Σ(coefficients)

Conséquence voulue : le **nombre** d'évaluations d'un même type ne change pas son
poids. Trois évaluations mensuelles pèsent ensemble autant qu'une seule, face à
la composition. C'est la pratique guinéenne classique (« moyenne des devoirs »
puis composition).

**Tout est configurable, plus rien n'est codé en dur :**

| Réglage | Où | Portée |
|---|---|---|
| Coefficient d'un type d'évaluation | `ss_types_evaluation.coefficient` | Établissement |
| Surcharge par cycle | `ss_parametres` → `notation.coef_type.{cycle}.{code}` | Cycle (primaire/collège/lycée) |
| Surcharge ponctuelle | `ss_evaluations.coefficient_override` | Une évaluation |
| Coefficient d'une matière | `ss_classe_matieres.coefficient` | Classe + matière |
| Barème | `ss_classe_matieres.note_sur` → `ss_matieres.note_sur` → `notation.bareme.{cycle}` → 20 | cascade |
| Nombre de périodes | `ss_parametres` → `calendrier.mode_decoupage`, `calendrier.nb_periodes`, `calendrier.libelle_periode` | Établissement |
| Seuil de passage | `ss_parametres` → `notation.seuil_redoublement.{cycle}` | Cycle |

Le barème n'est plus limité à /20 et /10 : `normaliser_note()` gère n'importe
quelle échelle (/100 par exemple), là où l'ancien code produisait des moyennes
fausses hors de ces deux valeurs.

**Le nombre de périodes n'est plus limité à 2 ou 3.** `parametrage.py` figeait
une liste d'ordinaux à trois entrées, qui plantait au-delà. Mode `PERSONNALISE`
disponible, de 1 à 12 périodes.

**Composition = création groupée.** Une composition couvre toutes les matières
d'une classe le même jour. La table `ss_evaluation_sessions` regroupe les
`ss_evaluations` créées en une seule action : un seul écran, un seul choix
« coefficientée ou non » pour tout le groupe. Les évaluations mono-matière
(saisie directe, portail enseignant) restent possibles : `session_id` est NULL.

**« Coefficienter cette évaluation ? »** porte sur les coefficients des
**matières**, pas des types. Décochée, toutes les matières comptent pour 1 sur
cette épreuve, sans toucher aux coefficients de référence de la classe.

**Bulletin annuel** (`type_bulletin='ANNUEL'`, `trimestre_id` NULL) : il
n'existait qu'en base, aucun code ne le générait. Il agrège les bulletins de
période déjà calculés — à lancer une fois toutes les périodes calculées.

**Classes d'examen (6e/CEE, 10e/BEPC, Terminale/BAC).** Leur passage ne dépend
plus du seuil interne mais du résultat officiel du Ministère, saisi dans
`ss_resultats_officiels_examen` via l'assistant de clôture. Tant qu'un résultat
manque, l'élève est `EN_ATTENTE_RESULTAT_OFFICIEL` et la validation de la classe
est bloquée. La moyenne interne (examens blancs compris) reste visible comme
indicateur pédagogique, sans valeur décisionnelle.
La détection se fait via `ss_niveaux.est_examen`, qui existait déjà en base mais
n'était lu nulle part : `promotion.py` recalculait la fin de cursus à la main
sur `cycle.code` + `niveau.ordre`, en double. Factorisé dans `_situation_niveau()`.

**Nommage.** Le type par défaut s'appelle « Évaluation » (code `EVAL`), plus
« Devoir ». Le libellé d'une évaluation est un texte libre saisi par l'école
(« Évaluation de Janvier », « Composition de Mars »), jamais une numérotation
automatique. Le type `ORAL` est désactivé : l'enseignant note comme il veut
(oral, écrit, les deux), le système n'a pas à le savoir.
⚠️ Ne pas confondre avec le module `api/devoirs.py` / modèle `Devoir` : c'est le
cahier de textes (devoirs à la maison), sans aucun rapport, simple homonyme.

### Migrations

Scripts idempotents dans `backend/migrations/`, miroirs SQL dans
`database/migrations/`. À appliquer dans l'ordre :

```
python backend/migrations/2026_08_notation_01_type_evaluation_coefficient.py
python backend/migrations/2026_08_notation_02_evaluation_sessions.py
python backend/migrations/2026_08_notation_03_bareme_classe_matiere.py
python backend/migrations/2026_08_notation_04_resultat_officiel_examen.py
python backend/migrations/2026_08_notation_05_bulletin_index_unique.py
```

Toutes additives : aucune colonne supprimée, aucune donnée écrasée. Chaque
instruction s'exécute dans sa propre transaction avec `rollback()` en cas
d'erreur — sans quoi Postgres avorte la transaction entière au premier
« colonne déjà existante » et le script n'est pas réellement rejouable (c'est le
défaut du pattern historique du projet, corrigé ici).

Migration 1 : backfill `coefficient=2` sur `COMPO` pour reproduire exactement
l'ancien poids « composition » et ne pas modifier silencieusement les moyennes
des établissements déjà en production.

Migration 5 : index uniques partiels sur `ss_bulletins`, refusés si des doublons
préexistent (à nettoyer avant de relancer).

### ⚠️ Changement de comportement métier

La règle « meilleure note par catégorie » disparaît. **Rejouer un calcul sur une
période déjà close produira des valeurs différentes de l'historique.** Ne pas
recalculer les périodes closes au déploiement, et prévenir l'établissement.

### Dettes assumées

- `ss_types_evaluation.poids_pourcentage` : colonne legacy, plus jamais lue.
  Conservée (pas d'Alembic, donc pas de rollback propre) et rendue nullable.
- Le reste de l'application code encore `etablissement_id=1` en dur à de
  nombreux endroits. Le module `services/notation.py` ne le fait jamais : il
  dérive toujours l'établissement de la classe ou de l'inscription. Ne pas
  reproduire l'ancien pattern dans du code neuf.
- `frontend/src/app/parametres/notation/page.tsx` envoie encore
  `etablissement_id=1` en dur à la sauvegarde.

---

## 2. Code mort à ne pas utiliser comme référence

### `database/11_pkg_evaluations.sql` (et le schéma Oracle associé)

**Ce package Oracle n'est plus utilisé.** L'application tourne sur
PostgreSQL/SQLAlchemy (`postgresql+pg8000://…`, voir `app/core/database.py`).

Il implémente une formule Devoir 40 % / Composition 60 % appuyée sur des tables
de précalcul (`SS_MOYENNES_TRIM`, `SS_MOYENNES_ANNUELLES`, `SS_CLASSEMENTS`) qui
**n'ont aucun équivalent dans les modèles SQLAlchemy** et ne sont jamais
alimentées. C'est une conception antérieure, jamais alignée sur l'implémentation
réelle.

**Ne pas s'en servir comme référence pour la logique métier, ne pas tenter de le
synchroniser.** Conservé uniquement à titre d'archive historique. La logique de
notation qui fait foi est `backend/app/services/notation.py`.

Même remarque pour `database/03_tables_evaluations.sql` : le schéma déclaré y
diverge du schéma réellement utilisé (noms de tables et colonnes différents,
ex. `SS_BULLETIN_DETAILS` vs `ss_bulletin_lignes`).

### « Centre d'Évaluation » → « Centre des Examens »

La page `/centre-evaluation` ne gère **pas** les notes : elle sert à réceptionner
et valider les sujets d'examen déposés par les enseignants (`api/examens.py`).
Le libellé a été renommé « Centre des Examens » pour lever la confusion.

**L'URL `/centre-evaluation` est inchangée**, car elle est référencée dans
`frontend/src/lib/roleAccess.ts` pour le contrôle d'accès par rôle.

La vraie gestion des notes se trouve sous `/notes` (centralisation),
`/bulletins` (consultation et publication) et `/parametres/notation`
(configuration).

---

## 3. Points de vigilance permanents

**Synchronisation hors ligne (`api/sync.py`).** Le mécanisme Last-Write-Wins est
écrit à la main pour `Note`, champ par champ — rien n'est générique. Toute
nouvelle colonne de `Note` qui doit être synchronisable doit être ajoutée
explicitement dans `NoteSyncItem` **et** dans `sync_notes()`, sinon elle est
ignorée en silence. Ne jamais renommer `valeur`, `est_absent`, `observation`,
`updated_at`, `updated_by` sans mettre à jour `sync.py` et le front
(`offlineQueue.ts`) en parallèle : le couplage est fort et sans test de contrat.
La refonte notation n'a ajouté aucune colonne à `Note` — rien à changer côté sync.

**Anti-N+1.** Les pages Centralisation et Bulletins ont déjà été rendues
inutilisables par des requêtes en boucle (~2000 requêtes pour une classe de 160
élèves). Tout calcul groupé doit précharger en lot (`precharger_notes()`,
`detail_par_type_classe()`) et ne jamais interroger la base dans une boucle sur
les élèves ou les matières.

**Verrouillage année / période.** `verifier_annee_modifiable()` et le contrôle
`Trimestre.statut == "CLOTURE"` doivent être appliqués sur **tout** endpoint
d'écriture. Deux incohérences historiques ont été corrigées dans cette refonte :
`create_evaluation` n'appelait pas `verifier_annee_modifiable`, et
`calculer_moyennes` ne vérifiait pas la clôture de la période.

**Portails élève / parent.** Ils importent `get_bulletin_display_flags` depuis
`api/evaluations.py`. La fonction vit désormais dans `services/notation.py` et
est réexportée par `evaluations.py` : cet import doit continuer de fonctionner.

---

## 4. État d'avancement de la refonte notation

### Fait et vérifié

- [x] Migrations 1 à 5, testées rejouables, appliquées
- [x] Modèles SQLAlchemy (`EvaluationSession`, `ResultatOfficielExamen`, nouvelles colonnes)
- [x] `services/notation.py` — moteur unique, multi-école, anti-N+1
- [x] Suppression de la logique dupliquée dans `evaluations.py` et `portail_enseignant.py`
- [x] Endpoints : sessions groupées, résultats intermédiaires, calcul annuel, surcharge de coefficient
- [x] Endpoints résultats officiels du Ministère + blocage de la validation
- [x] PDF : colonnes de détail dynamiques (plus de trio figé), formule régénérée, bulletin annuel
- [x] Nombre de périodes généralisé
- [x] Frontend : paramètres notation (coefficient par type et par cycle), notes (création groupée + aperçu), bulletins (période/annuel), clôture d'année (saisie ministérielle)
- [x] Renommage « Centre des Examens »

### Ajouts issus de la recette (août 2026)

- **Saisie des notes côté administration** : la liste des évaluations montre
  désormais tous les statuts (elle filtrait sur `CENTRALISEE`, donc une
  composition fraîchement créée restait invisible). Bouton « Saisir » par
  composition, fenêtre avec navigation entre matières et passage automatique à
  la suivante. Nouvel endpoint `PUT /api/evaluations/{id}/statut` (l'équivalent
  côté enseignant existait déjà dans `portail_enseignant.py`), qui refuse de
  centraliser une évaluation sans aucune note.
- **Regroupement par session** : `/api/evaluations/centralisees` renvoie
  `session_id`, ce qui permet d'afficher une composition sur une seule ligne
  au lieu d'une ligne par matière.
- **Fiche de classement imprimable** :
  `GET /api/evaluations/classe/{id}/classement/pdf` — A4 paysage, en-tête
  établissement, élèves classés avec la note de chaque matière (codes matière +
  légende), moyenne, rang, mention, notes sous 10 en rouge, statistiques de
  classe et signatures. Accepte `evaluation_ids`/`session_ids` pour une fiche
  portant sur une seule composition, sans toucher aux bulletins.
- **Suppression de la case « Absent »** à la saisie : une case vide signifie
  « pas encore noté », et la matière est simplement exclue de la moyenne.
- **Page Matières** réduite au seul onglet « Gérer les Matières » : le catalogue
  du programme guinéen était codé en dur dans le frontend et affichait des
  matières absentes de la base. Tout vient désormais du backend. Le formulaire
  de création permet de rattacher la matière aux classes du cycle choisi (et,
  au Lycée, aux seules classes de la série retenue).
- **Correction de sécurité** (hors périmètre notation, faille réelle) :
  `/api/presences-agents/*` était accessible à tout utilisateur authentifié,
  y compris élèves et parents — ces routes exposent les heures d'arrivée et de
  départ du personnel. Router restreint aux rôles internes
  (`PRESENCES_AGENTS_ROLES` dans `main.py`). Les 3 tests RBAC qui échouaient
  passent désormais.
- **Contrôle du barème à la saisie** (bug réel trouvé en recette) : aucun chemin
  d'écriture ne vérifiait qu'une note tenait dans son barème. Une composition
  créée avec « noté sur 1 » (le coefficient saisi dans la mauvaise case) avait
  accepté des notes de 1 à 20 ; après normalisation sur /20, chaque note était
  multipliée par 20 et le classement affichait des moyennes de 250/20, sans
  qu'aucune erreur ne soit levée. `valider_note()` (dans `services/notation.py`)
  est désormais appelée sur **tous** les chemins d'écriture : lot administrateur,
  CRUD `/api/notes`, saisie et modification côté enseignant, et synchronisation
  hors ligne (`sync.py`, où c'est le dernier filet possible — une note saisie
  hors ligne n'a traversé aucune validation serveur). Les lots sont validés
  intégralement avant la première écriture, pour éviter une saisie à moitié
  enregistrée. Le formulaire de session étiquette le champ « NOTÉE SUR » et
  alerte sous 5, valeur presque toujours due à une confusion avec le coefficient.
  Couvert par `tests/test_notation_bareme.py`.
- **Migrations complémentaires** : `2026_08_notation_06_inscriptions_promotion.py`
  (5 colonnes Promotion/Réinscription absentes de la base malgré leur présence
  dans les modèles) et `2026_08_notation_07_alignement_schema.py` (aligne
  automatiquement toute colonne manquante — 39 colonnes ajoutées sur la base de
  développement, qui avait plusieurs versions de retard).

### Reste à faire

- [ ] Recette fonctionnelle par l'établissement pilote sur une classe réelle
- [ ] Purge éventuelle de `poids_pourcentage` (UI et colonne) une fois la refonte stabilisée
- [ ] Uniformiser `etablissement_id` dans le reste de l'application (hors périmètre de cette refonte)
- [ ] Sélection fine des matières à la création d'une session (l'API l'accepte via
      `matiere_ids`, l'écran crée pour toutes les matières actives)
