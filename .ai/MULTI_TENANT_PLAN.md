# SmartSchool — Architecture cible multi-écoles centralisée

Document de référence pour le chantier d'isolation multi-tenant. Produit à partir
d'un audit réel (grep exhaustif + lecture ligne par ligne de 35 fichiers API + 69
modèles + vérification empirique du schéma Supabase réel + vérification du rôle de
connexion Postgres). Aucun code n'a été modifié pour produire ce document.

## A. Décisions nécessaires (résumé, détail dans les sections suivantes)

1. Comment dériver `etablissement_id` pour un compte `Parent` (pas de colonne directe).
2. Que faire de l'unicité des identifiants de connexion en base centralisée.
3. Quelles tables aujourd'hui globales doivent devenir TENANT (migration + décision produit), lesquelles restent légitimement globales.
4. Comment traiter les tables `À DÉCIDER` (ambiguës) — voir section E.
5. Ordre et découpage des lots de correction (~150 routes) sans tout casser d'un coup.

## B. Modèle d'identité — JWT cible

Structure proposée (inchangée dans l'esprit de ce qui existe, un champ ajouté) :

```json
{
  "sub": "<id du compte>",
  "role": "SUPER_ADMIN | ADMIN | ... | ENSEIGNANT | PARENT | ELEVE",
  "type": "admin | enseignant | parent | eleve",
  "etablissement_id": <int> | null,
  "exp": ...
}
```

Origine de `etablissement_id` par type de compte, **dérivée en base au moment du
login, jamais reçue du client** :

| Type | Source | Fiabilité |
|---|---|---|
| `Utilisateur` (admin/staff) | `Utilisateur.etablissement_id` (colonne existante, nullable) | Directe, fiable si non-null |
| `Enseignant` | `Enseignant.etablissement_id` (colonne existante, non-null) | Directe, toujours fiable |
| `Eleve` | `Eleve.etablissement_id` (colonne existante, non-null) | Directe, toujours fiable |
| `Parent` | Dérivée via `EleveParent → Eleve.etablissement_id` | **Ambiguë si plusieurs écoles** — voir section C |

**Cas non couvert à trancher explicitement** : `Utilisateur.etablissement_id` est
`nullable=True` — un compte `SUPER_ADMIN`/`ADMIN` créé sans établissement (cas
actuel de "alseny", créé par `create_admin.py`, `etablissement_id = NULL`) n'a
aujourd'hui aucune école associée. Deux lectures possibles, à choisir explicitement :

- **Lecture A — "super-admin plateforme"** : un `Utilisateur` avec
  `etablissement_id = NULL` est un administrateur *de la plateforme entière*
  (peut gérer plusieurs écoles), distinct d'un admin d'école unique. Cohérent avec
  le rôle `SUPER_ADMIN` déjà distinct de `ADMIN` dans `ADMIN_TIER_ROLES`.
- **Lecture B — "compte mal configuré"** : tout `Utilisateur` doit avoir un
  établissement ; `NULL` est un état invalide à corriger.

**Recommandation** : Lecture A, car elle correspond exactement au rôle `SUPER_ADMIN`
déjà présent dans le code (`app/core/auth.py::ADMIN_TIER_ROLES`) et au besoin réel
de cette migration (quelqu'un doit pouvoir administrer plusieurs écoles). Un JWT
avec `etablissement_id: null` doit alors être traité comme "accès plateforme",
**jamais** comme "accès à toutes les données sans filtre" par accident — le filtre
`Model.etablissement_id == current_user.etablissement_id` doit être *explicitement
contourné* uniquement pour ce cas, pas simplement absent par erreur. **Point qui
nécessite ta validation avant implémentation** (section N).

## C. Gestion du Parent — stratégie explicite (pas de `.first()` arbitraire)

Modèle réel vérifié : `Parent` n'a pas de colonne établissement ;
`EleveParent(eleve_id, parent_id, lien_parente, est_contact_principal,
est_responsable_financier)` relie un parent à N élèves, potentiellement dans N
écoles différentes — rien dans le schéma ne l'empêche.

**Requête de détection au login** :
```sql
SELECT DISTINCT e.etablissement_id
FROM ss_eleve_parent ep
JOIN ss_eleves e ON e.eleve_id = ep.eleve_id
WHERE ep.parent_id = :parent_id
```

### Cas A — un seul établissement distinct
`etablissement_id` du JWT = cette valeur unique. Comportement inchangé par rapport
à aujourd'hui (implicitement mono-école), maintenant explicite et vérifié.

### Cas B — plusieurs établissements distincts (aujourd'hui possible en théorie,
jamais rencontré en pratique — base vide)
**Ne pas choisir arbitrairement.** Le JWT ne porte alors **aucun** `etablissement_id`
unique (champ `null`, ou un tableau `etablissement_ids: [...]`). Toutes les routes
du portail parent doivent alors filtrer explicitement sur
`Eleve.etablissement_id IN (etablissements du parent)` **via la relation
`EleveParent` réelle à chaque requête**, jamais sur une seule valeur mise en cache
dans le token. C'est plus de travail qu'un simple filtre scalaire, mais c'est la
seule option qui ne perd jamais de données légitimes ni n'en expose à tort — les
portails parent (`portail_parent.py`) font déjà cette vérification par ownership
(`_parent_auth` + jointure `EleveParent`) pour l'essentiel des routes, donc le
changement est réduit à ne plus supposer un seul établissement quand ce n'est pas
vrai.

**Recommandation** : implémenter le cas B dès le départ (ne pas se contenter du cas
A en supposant qu'il n'y aura jamais de parent multi-écoles) — le coût
supplémentaire est faible car le pattern ownership de `portail_parent.py` fonctionne
déjà indépendamment du nombre d'écoles.

## D. Identifiants de connexion — vérifié sur le schéma réel Supabase (pas supposé)

Contraintes UNIQUE **réellement présentes** en base (vérifié via `pg_indexes`,
pas juste lu dans les modèles Python) :

| Table | Colonne(s) uniques réellement en base | Portée |
|---|---|---|
| `ss_utilisateurs` | `nom_utilisateur` | **Globale** (déjà, pas un changement à faire) |
| `ss_enseignants` | `matricule` | **Globale** (déjà) |
| `ss_eleves` | `matricule` | **Globale** (déjà) |
| `ss_utilisateurs` | `email`, `telephone` | **Aucune contrainte** — collision possible dès aujourd'hui, mono-tenant inclus |
| `ss_parents` | *(aucune, à part la clé primaire)* | `telephone_1`/`email` jamais uniques |
| `ss_comptables` | `nom_utilisateur`, `email`, `telephone` | Globale — **mais table non utilisée pour l'authentification** (voir note) |

**Note `ss_comptables`** : le code contient un commentaire explicite
(`app/api/comptabilite.py:255-256`) confirmant que l'ancienne authentification par
ce modèle a été retirée — seule une ligne de seed subsiste
(`init_comptabilite_defaults`). Cette table n'entre pas dans `unified_login`
aujourd'hui. À classer TENANT (a déjà `etablissement_id`) mais hors du périmètre
"identifiants de connexion".

**Comptage actuel (vérifié en direct, pas supposé)** : `ss_utilisateurs` = 1 ligne,
toutes les autres tables de comptes = 0 ligne. **Aucune collision existante
aujourd'hui** — la base réelle est vide, donc aucun risque de casser un compte
existant en resserrant les contraintes.

### Stratégie recommandée
1. **`nom_utilisateur` (Utilisateur), `matricule` (Enseignant/Eleve)** : déjà
   globalement uniques en base — rien à migrer, juste à documenter comme acquis.
2. **`Utilisateur.email`/`telephone`** : ajouter une contrainte UNIQUE (nullable
   autorisé, Postgres permet plusieurs `NULL` avec une contrainte unique standard)
   — sûr aujourd'hui vu l'absence de doublons, mais **à re-vérifier juste avant
   d'exécuter la migration** si d'autres comptes ont été créés entre ce rapport et
   l'implémentation.
3. **`Parent.telephone_1`/`email`** : même chose, ajouter UNIQUE — mais c'est plus
   sensible : un même numéro de téléphone parental pourrait légitimement apparaître
   deux fois si saisi par erreur à la création (pas de vérification aujourd'hui). À
   traiter avec un contrôle applicatif (vérifier l'unicité *avant* de proposer la
   contrainte DB) plutôt qu'une migration aveugle.
4. **Ne PAS scoper le login par établissement** (pas de sélecteur d'école avant le
   formulaire identifiant/mot de passe) — cohérent avec la préférence exprimée pour
   des identifiants globalement uniques, et évite de casser l'UX de login actuelle.

## E. Classification des tables (69 modèles, inventaire complet)

### GLOBAL (donnée réellement partagée par toute la plateforme)
| Table | Justification |
|---|---|
| `Etablissement` | La table racine elle-même — pas de sens de la scoper. |
| `TypeEvaluation` | Référentiel de types d'évaluation (Devoir, Composition...), déjà `code` unique global. |
| `JournalComptable` | Codes SYSCOHADA standards (AC/VE/BQ/CA/OD) — référentiel comptable normé, pas une donnée d'école. |
| `CompteComptable` | Plan comptable SYSCOHADA — norme OHADA partagée, `numero_compte` unique global. **À confirmer produit** : si une école veut un plan comptable personnalisé, ce choix change (voir "À DÉCIDER"). |

### TENANT (a ou doit avoir `etablissement_id` direct)
Déjà correct (colonne présente) : `Utilisateur*`, `Etablissement` (racine),
`AnneeScolaire`, `Cycle`, `Salle`, `EquipementInformatique`,
`TicketInformatique`, `Classe`, `Eleve`, `Enseignant`, `Depense`, `Incident`,
`Fournisseur`, `Budget`, `Immobilisation`, `Employe`, `Comptable`, `Role`,
`AuditLog`, `SyncTombstone`, `Evenement`, `ActiviteJour`,
`RessourcePedagogique`, `Ouvrage`, `FournitureScolaire` (a la colonne mais
`default=1` codé en dur — à corriger), `PresenceAgent` (nullable, jamais
peuplé — à corriger), `PointageEleve` (nullable, jamais peuplé), `EcritureComptable`
(nullable, jamais peuplé ni utilisé en filtre — à corriger).

**À ajouter (colonne manquante, table clairement propre à une école)** :
`TypeFrais`, `TarifClasse` *(voir OWNERSHIP — en fait dérivable, pas besoin d'ajout,
voir ci-dessous)*, `ExerciceComptable` (aujourd'hui `annee` unique globalement —
**bloquant**, il faut `UNIQUE(etablissement_id, annee)` à la place),
`ParametreComptabilite` (le PIN d'accès comptabilité — aujourd'hui un seul PIN
pour toute la plateforme, `cle` unique globalement — même correctif :
`UNIQUE(etablissement_id, cle)`), `Trimestre` (aucune colonne directe, dérivable
via `AnneeScolaire.etablissement_id` mais dénormaliser peut simplifier les
requêtes très fréquentes — à trancher), `Matiere`/`Niveau` (dérivables via
`Cycle.etablissement_id`, dénormalisation à évaluer selon la fréquence des
requêtes, voir Phase 10 "mesurer avant d'optimiser").

### OWNERSHIP (dérivable de façon fiable via une relation, pas de colonne à ajouter)
`ClasseMatiere` (→ `Classe`), `CreneauEmploi` (→ `Classe`), `Affectation`
(→ `Classe`/`Enseignant`), `Inscription` (→ `Eleve`/`Classe`), `Evaluation`
(→ `Classe`), `Note` (→ `Evaluation`→`Classe`), `Bulletin`/`BulletinLigne`
(→ `Inscription`→`Eleve`), `TarifClasse` (→ `Classe`, colonne `classe_id`
non-nullable — fiable), `Facture`/`EcheanceFacture`/`Paiement`
(→ `Inscription`→`Eleve`/`Classe`), `Presence` (→ `Inscription`), `Devoir`
(→ `Enseignant`, colonne non-nullable — fiable), `Disponibilite`
(→ `Enseignant`/`Classe`), `SujetExamen` (→ `Enseignant`, colonne non-nullable —
fiable ; `classe_id` nullable, ne pas s'y fier), `CreneauExamen` (→ `Classe`),
`Exemplaire`/`Emprunt` (→ `Ouvrage`→déjà TENANT), `LigneEcriture`
(→ `EcritureComptable`, une fois celle-ci correctement peuplée), `Permission`
(→ `Role`), `EleveParent` (→ `Eleve`).

### À DÉCIDER (décision produit nécessaire, pas un simple ajout de colonne)
| Table | Ambiguïté |
|---|---|
| `Message` | `expediteur_id`/`destinataire_id` sont des entiers **sans FK réelle**, `destinataire_type` inclut des valeurs globales ("TOUS_PARENTS", "TOUS_ENSEIGNANTS") qui aujourd'hui signifient implicitement "de toute la plateforme". Aucune relation fiable pour dériver l'établissement. **Nécessite une vraie colonne `etablissement_id` + redéfinir "TOUS_PARENTS" comme "tous les parents de CET établissement".** |
| `DemandeEmploi` | `classes_concernees` est un champ JSON texte libre ("TOUTES" possible) — même problème que `Message`, nécessite une colonne dédiée. |
| `EmploiExamen` | Pas de colonne, pas de relation directe fiable (seuls ses `CreneauExamen` enfants ont `classe_id`, mais un emploi tout juste créé n'en a pas encore). `annee_id` a un défaut codé en dur `=1`. Nécessite une colonne dédiée. |
| `CompteComptable`, `JournalComptable` | Classées GLOBAL ci-dessus par défaut (norme SYSCOHADA partagée) — **mais si une école doit pouvoir personnaliser son plan comptable, elles basculent en TENANT.** Décision produit, pas technique. |
| `PhotoEnAttente` | Pas de colonne, `entity_type`/`entity_id` génériques (élève ou parent) — dérivable au cas par cas via l'entité cible, mais pas une relation SQLAlchemy directe ; nécessite une jointure conditionnelle dans le code, pas juste `.filter()`. |

## F. Architecture JWT — détail d'implémentation (proposé, pas codé)

Modification unique et localisée : `app/api/auth.py::unified_login`, dans les 4
branches (Utilisateur/Enseignant/Parent/Eleve), ajouter le calcul de
`etablissement_id` (direct pour 3 types, requête `EleveParent` pour Parent) dans
`token_data` avant `create_access_token(...)`. Aucun autre fichier d'authentification
à toucher (`app/core/auth.py::create_access_token`/`decode_token`/`get_current_user`
sont déjà génériques, acceptent n'importe quel champ additionnel dans le payload
sans modification).

Nouvelle dépendance proposée (nouveau petit ajout dans `app/core/auth.py`, pas une
réécriture) :
```python
def get_current_establishment(current_user: dict = Depends(get_current_user)) -> int | None:
    return current_user.get("etablissement_id")
```
Utilisable comme `Depends()` dans les routes qui en ont besoin, sans toucher à
`get_current_user`/`require_roles` existants (non-régression : tout code qui
dépend déjà de `get_current_user` continue de fonctionner à l'identique, un champ
JWT de plus ne casse rien côté décodage).

**Comptes déjà émis avant la migration** : les tokens JWT existants (durée de vie
480 min = 8h) n'auront pas ce champ. `get_current_establishment` doit retourner
`None` proprement pour un vieux token (pas d'erreur), et chaque route migrée doit
définir explicitement le comportement pour `etablissement_id is None` (refuser
l'accès aux routes TENANT plutôt que de fabriquer une valeur par défaut =1 — sinon
on réintroduit exactement le problème qu'on corrige). Fenêtre de transition
maximale : 8h après déploiement, aucune action requise (les tokens expirent
naturellement).

## G. Stratégie Supabase — migrations

**Rappel de l'état réel actuel** : base Supabase = schéma complet (69 tables), 1
seule ligne réelle (`ss_utilisateurs`, "alseny", `etablissement_id = NULL`), 0 ligne
partout ailleurs. **Autrement dit : il n'y a aujourd'hui aucune donnée orpheline à
rattacher.** C'est le meilleur moment possible pour ce chantier — avant qu'une
vraie école ne commence à saisir des données.

Séquence de migration proposée, dans l'ordre, chacune testée sur ce constat avant
d'écrire quoi que ce soit :
1. `ExerciceComptable` : ajouter `etablissement_id` (nullable temporairement),
   remplacer la contrainte `UNIQUE(annee)` par `UNIQUE(etablissement_id, annee)`.
   0 ligne existante → pas de backfill nécessaire, juste vérifier au moment de
   l'exécution qu'aucune ligne n'a été créée entre-temps (`SELECT count(*)` avant).
2. `ParametreComptabilite` : ajouter `etablissement_id`, remplacer
   `UNIQUE(cle)` par `UNIQUE(etablissement_id, cle)`. Même vérification.
3. `Message`, `DemandeEmploi`, `EmploiExamen` : ajouter `etablissement_id`
   (nullable temporairement le temps du déploiement du code qui le peuple).
4. `FournitureScolaire.etablissement_id` : retirer le `default=1` côté modèle
   Python (le rendre `nullable=False` sans défaut, forcer le code appelant à le
   fournir explicitement).
5. `Utilisateur.email`, `Utilisateur.telephone`, `Parent.telephone_1`,
   `Parent.email` : ajouter les contraintes UNIQUE, **après re-vérification à
   l'instant T qu'aucun doublon n'existe** (requête `GROUP BY ... HAVING count(*) > 1`
   avant toute migration, jamais supposé).

**Interdiction respectée** : aucune de ces migrations ne fait
`UPDATE ... SET etablissement_id = 1` en masse — soit la table est vide (cas
1, 2 aujourd'hui), soit le remplissage doit se faire ligne par ligne via le code
applicatif au moment de la création (nouvelles lignes), jamais par un script de
rattrapage aveugle. **Si, au moment de l'implémentation réelle, une de ces tables
n'est plus vide (données saisies entre ce rapport et l'exécution), ARRÊT
immédiat et inventaire manuel avant de continuer — pas de décision automatique.**

## H. Classement des routes par criticité (synthèse des ~150 routes déjà auditées)

Détail complet (fichier:ligne exact) disponible dans les 3 audits réalisés cette
session — non dupliqué ici pour rester lisible. Décompte par niveau :

| Niveau | Définition | Décompte approx. | Fichiers concentrant le plus de cas |
|---|---|---|---|
| **CRITIQUE** | Lecture/écriture/suppression directe cross-école possible dès aujourd'hui, sans scénario particulier requis | ~45 routes | `comptabilite.py` (quasi toutes), `finance.py` (paie individuelle + IDOR facture/paiement/dépense), `personnel.py` (put/patch/delete), `examens.py` (quasi toutes), `communication.py` (parents-list, messages), `photos.py`, `devoirs.py`, `presence_agent.py` |
| **ÉLEVÉ** | Risque réel mais nécessite un scénario particulier (ID à deviner, rôle spécifique) | ~35 routes | `eleves.py`/`classes.py`/`enseignants.py` (accès direct par id), `promotion.py::preparer_classes_annee`, `annee_scolaire.py` (clôture/archivage), `reinscription.py`, `securite.py::permissions` |
| **MOYEN** | Isolation imparfaite (filtre présent mais falsifiable par paramètre client), impact limité par le mono-tenant actuel | ~50 routes | `eleves.py`/`classes.py`/`enseignants.py`/`vie_scolaire.py`/`finance.py`/`dashboard.py`/`bibliotheque.py`/`informatique.py` (listes déjà filtrées mais par paramètre) |
| **FAIBLE** | Pas de risque réel identifié (donnée non sensible ou déjà quasi-publique) | ~10 routes | `parametrage.py::GET /etablissements` (liste volontairement publique, sélecteur d'école) |
| **CONFORME** | Déjà correctement isolé | `eleves.py::delta_eleves` (pattern), `bulletin_tasks.py` (RQ, revérifie en base), `portail_parent.py`/`portail_enseignant.py`/`portail_eleve.py` (ownership, sauf 2-3 exceptions ponctuelles déjà notées), `sync.py::notes` (revérifie l'évaluation), `dashboard.py` (sauf 1 requête mobile money non filtrée), `bibliotheque.py`/`informatique.py` (rôle correctement vérifié, juste établissement à ajouter) |

## I. Plan de migration (ordre d'exécution, section G détaillée en séquence d'exécution)
Voir section G — 5 migrations, toutes sur une base aujourd'hui vide pour les tables
concernées, donc sans rattachement de données historiques à faire dans ce lot
précis. Un inventaire (`SELECT count(*)`) est refait juste avant chaque migration
au moment de l'implémentation, pas supposé toujours vrai depuis ce rapport.

## J. Plan de correction par lots (ordre imposé par la consigne, respecté)

| Lot | Contenu | Fichiers | Dépend de |
|---|---|---|---|
| **0** | JWT (`etablissement_id` calculé au login, 4 branches) + `get_current_establishment` | `app/api/auth.py`, `app/core/auth.py` | Section C/F tranchées |
| **1** | Comptabilité — migrations (G.1, G.2) + filtrage de toutes les routes `comptabilite.py` | `comptabilite.py`, migration Alembic-like manuelle (le projet n'a pas Alembic réellement câblé — script Python direct, cohérent avec `backend/migrations/add_sync_tracking.py` déjà existant) | Lot 0 |
| **2** | Finance/salaires — `_identifier_employe` scopé, IDOR facture/paiement/dépense/reçu/PDF corrigés | `finance.py` | Lot 0 |
| **3** | Personnel — put/patch/delete scopés | `personnel.py` | Lot 0 |
| **4** | Examens — ownership enseignant (auteur du sujet) + établissement | `examens.py` | Lot 0 |
| **5** | Communication — ajout colonne (G.3) + filtrage + restriction de rôle sur les actions admin | `communication.py`, migration | Lot 0 |
| **6** | Élèves — accès direct par id (`get/put/delete/historique/dossier/certificat`) | `eleves.py` | Lot 0 |
| **7** | Classes — accès direct par id + `lycee-series-coefficients` (jointure `Cycle`) | `classes.py` | Lot 0 |
| **8** | Enseignants — accès direct par id + salle des profs (agrégats globaux) | `enseignants.py` | Lot 0 |
| **9** | Autres modules — `matieres.py`, `evaluations.py`, `emploi_du_temps.py`, `promotion.py`, `annee_scolaire.py`, `reinscription.py`, `vie_scolaire.py`, `pointage_eleves.py`, `devoirs.py`, `photos.py`, `presence_agent.py`, `fournitures.py`, `evenements.py`, `activites.py` | 14 fichiers | Lot 0 |
| **10** | Tables de configuration — `parametrage.py` (dont `Matiere`/`Niveau`/`Trimestre` via `Cycle`), `securite.py` | `parametrage.py`, `securite.py` | Lot 0, décision E tranchée |
| **11** | Routes secondaires — `bibliotheque.py`, `informatique.py`, `tasks.py` (ownership task_id), `dashboard.py` (requête mobile money) | 4 fichiers | Lot 0 |

Chaque lot suit la boucle de validation obligatoire (implémenter → tester → chercher
régressions → re-tester) avant de passer au suivant. Un lot = un ou deux fichiers
maximum, jamais tout d'un coup.

## K. Plan de tests (les 15 tests demandés, mappés sur l'existant)

Réutilisation maximale de l'infrastructure de test déjà en place
(`backend/tests/conftest.py`, pattern `test_rbac_modules_sensibles.py` déjà
paramétré par rôle — à étendre par établissement).

Nouveau fichier proposé : `backend/tests/test_isolation_multi_ecole.py`, fixture
commune créant explicitement École A + École B avec un jeu de données parallèle
(élève, classe, facture, message, sujet d'examen) — modèle déjà utilisé par
`test_eleves_delta.py::test_isolation_par_etablissement` (Étape C), à généraliser.

| Test demandé | Implémentation |
|---|---|
| 1-4 (GET/PUT/DELETE cross-école) | Paramétré par route, réutilise `ROUTES_SENSIBLES` de `test_rbac_modules_sensibles.py`, étendu avec un vrai `etablissement_id` par token |
| 5 (`etablissement_id` forcé dans le body) | Test dédié : token École A + body `{"etablissement_id": B}` → vérifier que la ressource créée est bien rattachée à A, jamais à B |
| 6 (même ID métier dans 2 écoles) | Créer 2 élèves avec le même `matricule` dans École A et B (si la contrainte globale matricule le permet — sinon test de la contrainte elle-même) |
| 7-8 (Parent mono/multi-écoles) | Suite directe de la stratégie section C, cas A et cas B testés séparément |
| 9 (identifiant dupliqué) | Test de la contrainte UNIQUE ajoutée en G — création en double doit échouer proprement, pas planter |
| 10 (token non falsifiable) | Test déjà implicite : `create_access_token`/`decode_token` signés HMAC, un JWT modifié côté client échoue la vérification de signature — à documenter comme test de non-régression plutôt que nouveau code |
| 11 (offline post logout/login) | Test frontend (`sessionCleanup.test.ts` déjà existant, Étape D) — vérifier qu'il couvre bien le changement d'établissement, pas seulement de compte |
| 12 (RQ worker mauvais établissement) | Déjà couvert (`test_task_queue.py::test_refuse_si_etablissement_ne_correspond_pas`) — étendre le même pattern aux futures tâches |
| 13 (Redis/cache) | Vérification que `dashboard:{etablissement_id}:{annee}` ne collisionne jamais — déjà structurellement vrai, test de non-régression |
| 14 (exports Excel/PDF) | Couvert par les lots 1/2/6 (factures, reçus, bulletins, salaires) |
| 15 (recherche globale) | À vérifier si un endpoint de recherche globale existe (pas identifié dans l'audit actuel — à confirmer lot par lot) |

## L. Risques

- **Volume** : ~150 routes, risque de fatigue/erreur si fait trop vite — d'où le
  découpage strict en 11 lots avec validation complète entre chacun.
- **Comptes déjà émis** : fenêtre de 8h où d'anciens tokens sans
  `etablissement_id` coexistent avec le nouveau code — gérée section F.
- **Décisions produit non tranchées** (section E, "À DÉCIDER") bloquent une partie
  du lot 5 (Communication) et du lot 10 (comptes globaux SYSCOHADA) tant qu'elles
  ne sont pas validées.
- **`ExerciceComptable`/`ParametreComptabilite`** : si une vraie donnée y est
  entrée avant l'implémentation de ce plan, la migration décrite en G devient plus
  complexe (rattachement manuel) — fenêtre à surveiller.

## M. Ordre d'exécution recommandé
Lot 0 → Lot 1 (comptabilité) → Lot 2 (finance) → Lot 3 (personnel) → Lot 4
(examens) → Lot 5 (communication) → Lots 6-9 (élèves/classes/enseignants/autres) →
Lot 10 (configuration) → Lot 11 (secondaire) → suite de tests complète (section K)
→ rapport final. Conforme à l'ordre imposé par la consigne.

## N. Points nécessitant validation avant implémentation

1. **Section B** : `Utilisateur.etablissement_id = NULL` = "super-admin
   plateforme" (Lecture A, recommandée) ou "compte à corriger" (Lecture B) ?
2. **Section C** : implémenter le cas B (parent multi-écoles) dès le lot 0, ou
   assumer temporairement le cas A seul et documenter la limite ?
3. **Section E** : `CompteComptable`/`JournalComptable` restent GLOBAL (plan
   comptable SYSCOHADA partagé) ou passent TENANT (personnalisable par école) ?
4. **Section D** : ajouter les contraintes UNIQUE sur `Utilisateur.email/telephone`
   et `Parent.telephone_1/email`, ou seulement au niveau applicatif (sans
   contrainte DB stricte) ?
5. Confirmation générale : go pour démarrer le Lot 0 (JWT) une fois les 4 points
   ci-dessus tranchés.
