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

### Fin d'année : fiche de classe, bulletins annuels, examens nationaux (août 2026)

- **Moyenne annuelle = somme des moyennes de période ÷ nombre de périodes.**
  Règle explicite de l'établissement, et non un recalcul à partir des matières :
  dès qu'une matière manque à une période (option abandonnée, matière introduite
  en cours d'année), repondérer les matières donne un chiffre différent de celui
  des bulletins déjà remis aux familles. Entre les deux, c'est le chiffre déjà
  communiqué qui fait foi. Fonctionne pour 1, 2 ou 3 périodes, avec un nombre
  d'épreuves différent dans chacune — y compris une période sans aucune
  évaluation, avec seulement une composition.
- **La composition finale n'est pas un objet particulier** : c'est une
  composition comme les autres, la dernière de l'année. Aucun traitement
  spécifique, et une composition sans évaluation mensuelle associée est un cas
  normal.
- **Ordre des périodes** : les moyennes de période sont désormais lues avec une
  jointure sur `ss_trimestres` et triées par `numero`. Sans elle, elles
  ressortaient dans l'ordre physique des lignes et le 3ème trimestre pouvait
  s'afficher sous l'étiquette du 1er.
- **Écran dédié `/resultats-annuels`** : classement annuel avec une colonne par
  période réellement calculée, synthèse de classe (moyenne, part des élèves
  atteignant le seuil de passage configuré, répartition des mentions), bulletin
  annuel de chaque élève, et bloc examen national **autonome** — il s'affiche
  même quand aucune moyenne annuelle n'a été calculée, sinon la saisie des
  résultats nationaux restait invisible tant que le calcul pédagogique n'avait
  pas tourné (c'est exactement ce qui a été signalé en recette).
- **Fiche de résultats de fin d'année** :
  `GET /api/evaluations/classe/{id}/fiche-annuelle/pdf` — A4 paysage, en-tête
  établissement, bandeau de synthèse, une colonne par période, moyenne annuelle,
  mention, et pour une classe d'examen le résultat national. Répartition des
  mentions et signatures en pied.
- **Bulletin annuel** : rappelle les moyennes de période qui composent la
  moyenne annuelle, et pour une classe d'examen la mention du résultat national
  avec le rappel qu'il est seul décisif. Correction au passage : les repères de
  classe (meilleure / plus faible moyenne) étaient vides sur tout bulletin
  annuel — la requête comparait `trimestre_id = NULL`, qui ne remonte jamais rien.
- **Import des résultats d'examen national** :
  `GET  /api/promotion/classe/{id}/resultats-officiels/modele` (CSV pré-rempli
  avec la liste réelle des élèves) et
  `POST /api/promotion/classe/{id}/resultats-officiels/import`.
  `dry_run=true` par défaut : le rapport est affiché avant toute écriture, un
  résultat déjà saisi n'est jamais remplacé sans que l'école ait vu ce qui
  changeait. Rapprochement par matricule puis par nom + prénom ; toute ligne non
  rapprochée ou illisible est remontée nommément, jamais ignorée en silence.
  Lecture par `services/import_tabulaire.py` : CSV `;`/`,`/tabulation, encodages
  UTF-8 / cp1252, en-têtes tolérants (`N° Matricule`, `Résultat final`…), et
  `.xlsx` via **openpyxl** (nouvelle dépendance ; sans elle l'import CSV
  fonctionne toujours et le message renvoie vers ce format). Le vocabulaire du
  fichier est traduit (« Admise », « Ajourné », « Recalé », « oui », « 1 »…) mais
  jamais deviné : une valeur inconnue est refusée. Couvert par
  `tests/test_import_resultats_examen.py`.

---

## Fusion du chantier multi-écoles (11/08/2026)

`origin/main` a apporté l'isolation multi-écoles complète (13 lots, ~330 tests,
signée Johnny). Ce chantier et le nôtre étaient complémentaires : l'un pose la
frontière entre écoles, l'autre remplace le moteur de calcul. Commit de fusion
`d6eb1a5`, 7 conflits résolus.

**Règle de résolution appliquée sans exception** : garder la structure du moteur
de notation, y reporter SA méthode d'isolation. Jamais l'inverse.

Les anciens helpers de calcul (`get_poids_evaluations`,
`coefficient_pour_evaluation`, `moyenne_matiere_eleve`,
`detail_categories_matiere`, `get_notation_seuils`…) n'ont **pas** été
réintroduits dans `api/evaluations.py` : ils vivent dans `services/notation.py`.
Les y redéfinir masquerait le moteur central et rouvrirait la divergence
silencieuse déjà constatée avec `portail_enseignant.py`.

### Conséquences à connaître

- `get_notation_seuils`, `get_mention` et `get_bulletin_display_flags` n'ont
  **plus de valeur par défaut** `etablissement_id = 1`. Plus aucun défaut
  exécutable dans `backend/app`.
- Les 3 tâches RQ de notation portent `etablissement_id` dans leur `meta` :
  `GET /api/tasks/{id}` refuse par défaut une tâche sans ce champ, son résultat
  deviendrait donc illisible.
- `Message` et `DemandeEmploi` ont une colonne établissement **NOT NULL** :
  toute création (relance de sujets, demande de dépôt) doit la renseigner.
- Déposer un sujet d'examen exige désormais une **période réellement
  configurée**. C'est le correctif : une école à deux semestres n'a pas de T3.

### Types d'évaluation : propres à chaque école

Migration `2026_08_notation_09_type_evaluation_etablissement.py` (miroir SQL
`database/migrations/2026_08_11_type_evaluation_etablissement.sql`).

`ss_types_evaluation` était partagée par toute la plateforme. Le **poids** des
types était déjà réglable par école, mais pas leur **nom** ni leur
**existence** : une école qui renommait « Composition » changeait l'intitulé des
colonnes de bulletin de toutes les autres. Ce n'était pas une fuite de données,
c'était une école qui décidait pour les autres.

- `etablissement_id` ajouté, **NOT NULL** après rattachement.
- L'unicité de `code` passe de **globale** à **par école** (index
  `uq_types_evaluation_etablissement_code`) : deux écoles ont chacune leur
  « COMPO ». Le doublon dans une même école répond **409**, pas une erreur 500.
- **Aucun backfill automatique.** La migration s'arrête et liste les types
  orphelins ; il faut désigner l'école explicitement :
  `--rattacher-a <etablissement_id>`. Conforme à
  `docs/MULTI_ECOLES_REGLES_DEV.md` §10.
- `services/referentiel_evaluation.py` donne à toute nouvelle école sa liste de
  départ (EVAL et COMPO actifs, six autres prêts à activer). Idempotent et **non
  destructif** : ne recrée que ce qui manque, ne réécrit jamais un type qu'une
  école a renommé. Branché sur `POST /api/parametrage/etablissements` et sur
  `scripts/amorcer_plateforme.py`.
- Couvert par `tests/test_types_evaluation_isolation.py` (12 tests), dont
  « renommer chez A ne change rien chez B ».

**Divergence assumée avec `.ai/MULTI_TENANT_PLAN.md`**, qui classait cette table
GLOBAL. Décision du fondateur : les écoles doivent être indépendantes. À
signaler à Johnny.

### Index de performance (12/08/2026)

Migration `2026_08_perf_01_index_notation.py` (miroir SQL
`database/migrations/2026_08_12_index_performance_notation.sql`).

**Aucune** des colonnes que le moteur interroge en permanence n'était indexée —
15 sur 19 manquaient. PostgreSQL relisait la table entière à chaque requête
(`Seq Scan on ss_notes`). Invisible à 2 900 notes, fatal ensuite : le coût croît
linéairement avec le volume.

Mesuré sur une table de 5 000 000 de notes (≈ 25 000 élèves) :

| | Plan | Durée |
|---|---|---|
| Sans index | `Gather` / parcours complet | **430 ms** |
| Avec index | `Bitmap Heap Scan` | **2,1 ms** |

**209× plus rapide** — et surtout 2 ms qui restent 2 ms quand le volume grandit.

Le chantier multi-écoles avait aggravé le point sans le savoir : presque chaque
requête passe désormais par `ss_classes.etablissement_id` ou
`ss_eleves.etablissement_id`, devenues les colonnes les plus sollicitées de
l'application et justement dépourvues d'index.

- **25 index composites**, calqués sur les combinaisons de filtres relevées
  automatiquement dans `app/services/` et `app/api/` — pas devinées. Un index
  `(a, b, c)` sert aussi `(a)` et `(a, b)` : moins d'index à maintenir en
  écriture.
- **`CREATE INDEX CONCURRENTLY`** : la table reste lisible ET modifiable pendant
  la construction. Un `CREATE INDEX` classique verrouille la table en écriture —
  inacceptable pendant que des enseignants saisissent des notes.
- La migration détecte et **refait** un index resté `INVALIDE` après un
  CONCURRENTLY interrompu : sans cela il occupe de la place et n'est jamais
  utilisé par le planificateur, silencieusement.
- Les 25 index sont **aussi déclarés dans les modèles** (`__table_args__`, mêmes
  noms) : `main.py` crée le schéma par `Base.metadata.create_all()`, une base
  neuve serait donc née sans eux.
- `--verifier` affiche l'état et le plan réel de PostgreSQL sur les requêtes
  chaudes.

Aucune donnée touchée, aucun comportement changé, réversible.

**À savoir** : sur une petite table (19 classes, 45 inscriptions), PostgreSQL
préfère sciemment le parcours complet — lire 19 lignes coûte moins cher que
passer par l'index. Le plan bascule tout seul dès que le volume le justifie.
Un `Seq Scan` sur ces tables n'est donc pas un défaut.

### Plafonds de charge connus (non traités)

Les index lèvent le premier plafond, pas les suivants :

1. ~~Index manquants~~ — **fait**.
2. **Volume brut** : au-delà de quelques milliers d'écoles, une seule base
   demande du partitionnement par année et l'archivage des années closes.
3. **Calculs groupés** : la file RQ absorbe déjà les calculs lourds, mais
   plusieurs milliers d'écoles clôturant la même semaine demanderont plusieurs
   travailleurs, pas un seul.

À décider quand la courbe réelle sera connue, pas avant.

### Recette du moteur, jouée sur les données réelles (14/08/2026)

Recalcul **à la main**, indépendant du moteur, sur un élève de 10ème Année A
(classe d'examen), école 3 — les trois étages concordent au centime :

| | À la main | Moteur |
|---|---|---|
| 12 moyennes de matière | 2,77 → 8,56 | identiques |
| Moyenne générale de période | 6,12 | 6,12 (rang 27/28) |
| Moyenne annuelle | 5,92 | 5,92 |

Volumétrie réellement traversée : **2 semestres** (et non trois — le nombre de
périodes libre est donc exercé, pas seulement codé), 78 750 notes, 238
compositions groupées, 2 000 bulletins de période, 1 000 bulletins annuels, 7
classes d'examen et 198 résultats officiels saisis.

Répartition obtenue : médiane 11,32/20, 65 % au-dessus de 10. Réussite aux
examens nationaux : 82 % au CEE, 64 % au BEPC, 55 % au BAC. Chiffres plausibles
pour un établissement guinéen — le moteur ne produit ni notes tassées ni
classements aberrants.

Reste ouvert : la recette par un **vrai** établissement pilote, sur ses propres
élèves. Celle-ci prouve le calcul, pas l'adéquation aux usages d'une école
donnée.

---

## 5. La scolarité suit l'élève (14/08/2026)

Deux défauts trouvés en vérifiant le parcours d'inscription. Couverts par
`tests/test_scolarite_suit_l_eleve.py` (10 tests).

**L'inscription d'un nouvel élève ne facturait rien.** L'écran préchargeait les
montants depuis `ss_types_frais.montant_defaut` — le défaut d'établissement, qui
vaut **0** dans une école tarifant par classe (le cas de l'école 3 : 68 tarifs
configurés, tous les défauts à 0). Le formulaire envoyait donc `montant: 0`, et
le serveur faisait `if montant <= 0: continue`. L'élève était créé, inscrit,
assis dans sa classe… et ne devait rien. Aucune facture, aucune erreur, aucun
message. L'école perdait la scolarité en silence.

Corrigé des deux côtés :
- *Serveur* — sans montants envoyés, la grille obligatoire de la classe
  s'applique d'elle-même, via `_generer_frais_reinscription` (la règle n'est
  écrite qu'à un seul endroit). Un frais coché à 0 alors que la classe a un
  tarif prend le tarif : un 0 venu d'un écran n'est pas une gratuité.
- *Écran* — choisir une classe charge sa grille réelle
  (`GET /api/finance/tarifs-classe`), affiche le total des frais obligatoires,
  et signale explicitement une classe sans tarif au lieu de laisser croire que
  tout est en ordre.

Inchangé : un montant client qui **contredit** la grille reste refusé (400).

**La réinscription plantait en 500.** `_generer_frais_reinscription` lisait
`etablissement_id` comme s'il venait du contexte alors qu'il n'était pas un
paramètre : `NameError` sur la toute première facture. Invisible jusque-là parce
que la fonction sort avant (`if not tarifs: return 0`) quand la classe cible n'a
aucun tarif — donc seule une école qui a posé sa grille tombait dessus, c'est-à-
dire une école qui travaille pour de vrai. `etablissement_id` est désormais un
paramètre explicite.

---

## 6. Le portail et la classe se parlent (14/08/2026)

Couvert par `tests/test_pointage_et_appel_se_parlent.py` (12 tests), vérifié sur
l'école 3.

**Deux contrôles, deux questions différentes** — c'est la règle métier posée par
le fondateur, et elle n'était nulle part dans le code :

| | Prouve quoi | Fréquence |
|---|---|---|
| Carte scannée au portail (`ss_pointages_eleves`) | l'élève est **à l'école** ce jour | 1 fois / jour, tous cycles |
| Appel en classe (`ss_presences`) | l'élève est **en cours** à cette heure | primaire : 1 fois / jour · collège et lycée : à chaque cours |

**Ils ne se parlaient pas.** Le surveillant faisait l'appel sans savoir qui avait
franchi le portail, et personne ne voyait le cas qui compte : l'élève entré le
matin, absent en cours l'après-midi. Il n'a pas manqué l'école, il a manqué le
cours — ce n'est pas la même chose à dire à une famille.

`GET /vie-scolaire/feuille-appel` renvoie désormais, par élève,
`pointe_a_l_ecole`, `heure_arrivee`, `heure_depart`, et deux drapeaux :
`entre_mais_absent` et `jamais_entre`. Plus un bloc `portail` de synthèse. Une
seule requête pour toute la classe. Le portail **informe** le surveillant, il ne
décide jamais à sa place : c'est lui qui voit la salle.

**L'écran des séances ouvre la journée.** Une séance ne naissait que si un
enseignant ouvrait son portail. La direction voyait une page vide alors que
l'école a 1 061 créneaux à l'emploi du temps : le seul écran censé répondre à
« quels cours ont eu lieu aujourd'hui » ne répondait jamais, et constater
l'absence d'un professeur reposait entièrement sur ce qu'un surveillant
remarquait de lui-même.

`GET /api/seances` matérialise maintenant la journée demandée (aujourd'hui si
aucune date n'est donnée) via `_materialiser_le_jour`. Vérifié en réel :
**238 séances** ouvertes pour un mardi, rejouable sans doublon, **rien** le
week-end. Garde-fous : une **plage** de dates n'ouvre rien (un trimestre d'un
clic ferait des dizaines de milliers de lignes) et `ouvrir_la_journee=false`
permet de consulter sans écrire. Chaque séance naît `PREVUE` — l'absence d'un
professeur se lit dans ce qui reste `PREVUE` en fin de journée.

**Un professeur ne manque pas forcément sa journée.** Au primaire, un maître
tient sa classe toute la journée : s'il n'est pas là, c'est la journée entière.
Au collège et au lycée il enseigne une heure ici, une heure là — il peut manquer
son cours de 8 h et revenir assurer celui de 16 h. Signaler « absent le 10 mars »
était donc faux dans la moitié des cas.

`POST /vie-scolaire/absences-enseignant` accepte désormais `seance_ids` : chaque
séance désignée passe en `NON_EFFECTUEE` avec son motif. Un cours déjà
`EFFECTUEE` est refusé — ce serait contredire l'appel que le professeur a
lui-même enregistré.

**La paie compte des JOURS** (`set(jours_pointage) | set(jours_manuels)`), donc
on garde **une seule ligne d'absence par employé et par jour** : un second
signalement le même jour la complète au lieu d'être refusé. Sans ça, le
surveillant qui constatait une deuxième heure manquée s'entendait répondre
« déjà enregistrée » et ne pouvait plus rien dire. Une absence déjà tranchée par
la direction n'est plus modifiable ici.

Vérifié en réel sur Bountouraby DIALLO (7 cours le même mardi) : 8 h et 16 h
marquées non assurées, **les cinq heures du milieu intactes**, une seule ligne
d'absence dont le motif garde la trace des deux cours.

L'écran du surveillant coche les heures du professeur choisi ; quand il n'y en a
aucune à l'emploi du temps — le cas du primaire — il l'annonce et le signalement
porte sur la journée entière.

**Le pointage des enseignants n'a demandé aucun code** : `/api/presences-agents/scan`
reconnaît déjà le matricule d'un enseignant et écrit `type_agent='ENSEIGNANT'`.
Constat sur l'école 3 : 817 pointages, **tous du personnel administratif, aucun
enseignant**. C'est un manque d'usage, pas de logiciel.

---

### Reste à faire

- [ ] Recette fonctionnelle par l'établissement pilote sur une classe réelle
      (le calcul lui-même est vérifié, cf. section 4)
- [ ] Purge éventuelle de `poids_pourcentage` (UI et colonne) une fois la refonte stabilisée
- [x] ~~Uniformiser `etablissement_id` dans le reste de l'application~~ — fait par le
      chantier multi-écoles (13 lots) puis étendu à nos 33 routes lors de la fusion
- [ ] Trancher avec Johnny la divergence sur `TypeEvaluation` (GLOBAL vs par école)
- [ ] Rôles personnalisés : créables mais non attribuables, donc sans effet
- [ ] Page de connexion : affiche encore la marque de l'établissement 1 (choix produit)
- [ ] Partitionnement / archivage des années closes (plafond 2 ci-dessus)
- [ ] Sélection fine des matières à la création d'une session (l'API l'accepte via
      `matiere_ids`, l'écran crée pour toutes les matières actives)
