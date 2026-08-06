# 🧠 MÉMOIRE PERSISTANTE DU PROJET — SMART_SCHOOL_FINAL

> Dernière mise à jour : 06/08/2026

## ⚠️ Leçon répétée : la règle N+1 mord à chaque fois que la base grossit
Deux nouveaux cas trouvés le 06/08 après le reset à 5000 élèves (voir
`.ai/CURRENT_TASK.md`), exactement la même signature que les cas déjà
documentés plus bas (Centralisation, Familles, bulletins) : une requête DB
DANS une boucle sur les lignes à afficher. `GET /api/communication/parents-list`
(4 requêtes par parent × 5033 parents) = **69s** ; `GET /api/finance/solvabilite`
(1 requête par élève × 5000) = **20,6s** — assez pour dépasser le timeout
axios (30s) et faire croire à une page "vide" ou "qui ne charge jamais",
alors que le vrai symptôme est une requête entière qui échoue silencieusement
(`Promise.all` rejeté, aucun état d'erreur affiché). Réécrits en
préchargement par lot → 1,4s et 0,96s. **Que vérifier avant de livrer toute
nouvelle vue "liste"** : y a-t-il un `db.query(...)` à l'intérieur d'un
`for` sur des résultats déjà chargés ? Si oui, précharger par lot
(`.filter(X.in_(ids))`) puis indexer en dict Python — jamais après coup, au
moment où l'utilisateur signale une page qui "ne répond plus".

## ⚠️ Piège : `useCallback`/`useEffect` avec tableau de dépendances vide capture des valeurs de contexte périmées
Motif trouvé et corrigé au moins 3 fois cette session (`classes/page.tsx`,
`communication/page.tsx`, et la cause plus profonde dans `AppContext.tsx`
lui-même) : une fonction de chargement de données lit `anneeId`/
`etablissementId` depuis `useApp()` mais est mémoïsée avec `[]` — elle ne se
recrée/rejoue jamais, donc reste bloquée sur la valeur de contexte telle
qu'elle était AU PREMIER RENDU (souvent une valeur par défaut avant que le
vrai fetch async n'ait résolu). Invisible tant que la valeur par défaut
coïncide avec la vraie donnée ; devient un vrai bug dès que ce n'est plus le
cas (ex : après la remise à zéro de la base, `annee_id=1` — la valeur par
défaut historique — n'existe plus). **Réflexe à avoir sur toute nouvelle
page qui lit `anneeId`/`etablissementId` depuis le contexte** : les inclure
explicitement dans le tableau de dépendances de tout `useEffect`/
`useCallback` qui les utilise, jamais un tableau vide "pour ne charger
qu'une fois".

## ⚠️ Piège plus profond, même famille : `AppContext` ne se rechargeait qu'au tout premier montage de l'app
Root cause plus large que les pièges par-page ci-dessus : `AppContext`
(fournit `anneeId` à quasiment toute l'application) ne vérifiait la présence
d'un token QU'UNE FOIS au montage — et `login()` navigue en client-side
(`router.push`, pas de rechargement complet), donc si l'utilisateur arrivait
sur `/login` sans être authentifié, l'année réelle n'était **jamais**
chargée après coup sans un vrai F5. Corrigé en rendant l'effet réactif à
`isAuthenticated` (`useAuth()`) plutôt qu'à une lecture `localStorage` unique
figée au montage. Symptôme signalé par l'utilisateur : "je dois recharger
après chaque connexion, sur toutes les pages" — cohérent avec le fait que
`anneeId` irrigue presque tout.

## ⚠️ Piège comptabilité générale : `eleve_id` ne doit être posé QUE sur la ligne touchant le compte élève (4111)
Trouvé le 06/08 : `create_paiement`/`annuler_paiement` (`finance.py`)
taguaient `eleve_id` sur LA LIGNE DE TRÉSORERIE (caisse/banque) en plus de la
ligne 4111 — or les requêtes "compte individuel" (Comptabilité Auxiliaire,
`comptabilite.py`) somment débit/crédit par `eleve_id` sans filtrer par
compte. Résultat : le débit trésorerie (qui appartient à l'école, pas à
l'élève) gonflait artificiellement le "total débité" de l'élève exactement
du montant qu'il venait de payer, masquant systématiquement tout solde
réellement dû ("Soldé" affiché à tort). Cause racine différente et plus
sournoise qu'un simple bug de calcul : la donnée était juste mal étiquetée à
la source. Second bug cumulé trouvé en même temps : `generer_factures_classe`
(facturation en masse) n'écrivait AUCUNE écriture comptable, contrairement à
`create_facture` (facture unitaire) — toute facture générée en masse restait
invisible du Grand Livre. **Leçon pour toute future écriture comptable
touchant un tiers (élève/fournisseur)** : le tag `eleve_id`/`fournisseur_id`
ne va QUE sur la ligne qui représente le compte de ce tiers, jamais sur la
ligne de contrepartie (trésorerie, charge, produit) — et toute nouvelle voie
de création de facture/paiement doit passer par `generer_ecriture_auto`,
sans exception, sous peine de rendre la Comptabilité Auxiliaire silencieusement
fausse pour cette voie-là seulement (donc difficile à repérer).

## ⚠️ Piège hydratation React + `useQuery` : `isLoading` ≠ "pas encore de données"
Trouvé en convertissant `dashboard/page.tsx` à React Query (06/08) :
`isLoading` (TanStack Query v5) vaut `true` uniquement pendant un fetch actif
— si la query est `enabled: false` (le temps que `etablissementId`/`anneeId`
se résolvent), `isLoading` est `false` alors que `data` est toujours
`undefined`. Le composant rendait alors une branche "erreur" différente de
la branche "chargement" rendue côté serveur (SSR) → mismatch d'hydratation
React. **Règle pour toute page basée sur `useQuery`** : ne jamais gater
l'état de chargement sur `isLoading` seul quand `enabled` peut être faux —
tester plutôt `!data` (englobe pending/disabled/fetching) et ne réserver
l'état d'erreur qu'à `isError` confirmé.

## Historique — Remise à zéro complète de la base de données (05/08/2026)

## ⚠️ Remise à zéro complète de la base de données, 05/08/2026 — l'invariant "2801 élèves / année_id=1" n'existe plus
Retour de test sur l'assistant de clôture (Phase 5) : "Calculer les résultats"
puis "Valider" rapportaient 0 élève traité sur 19 classes malgré des données
présentes. Root cause diagnostiquée en base (lecture directe) : la base
contenait 4 années scolaires mélangées accumulées sur plusieurs sessions de
test, dont une année **"test" (id=9) restée marquée `est_courante='O'`** —
donc sélectionnée par défaut partout — alors qu'elle avait déjà été
intégralement calculée ET validée lors d'une session antérieure
(`statut_promotion=VALIDE` sur ses 2347 inscriptions). Les actions en masse
étaient donc de vrais no-op sur des données déjà traitées, pas un bug de
code. **Leçon générale retenue** : si une action en masse scolarité rapporte
0 traité, vérifier en premier quelle année est `est_courante` et si elle a
déjà été traitée, avant de chercher un bug applicatif.

Face à cet état confus, l'utilisateur a demandé une remise à zéro complète
(confirmée en détail via AskUserQuestion sur 4 points d'ambiguïté : tarifs,
parents, enseignants existants, portée exacte). Exécuté :
- **Suppression** de tout ce qui était rattaché aux 4 anciennes années
  (4 années, 87 classes, 2801 élèves, 5148 inscriptions, 5586 bulletins,
  48848 lignes de bulletin, 146565 notes, 2753 parents, 12 dépenses, etc.) —
  dans une seule transaction, ordre FK-safe déterminé par lecture complète du
  modèle (`academique.py`, 1181 lignes, table unique pour tout le schéma). Un
  premier essai a échoué sur `TarifClasse` (oublié dans la liste), rollback
  automatique intact grâce à la transaction unique, corrigé et rejoué avec
  succès sans perte.
- **Catalogue explicitement conservé** (non touché) : établissement, cycles/
  niveaux, 33 matières, 7 types de frais, comptes utilisateurs/comptables,
  **et les 11 enseignants réels existants** (décision explicite de
  l'utilisateur — pas de recréation).
- **Recréation** : 1 nouvelle année `2026-2027` (`EN_COURS`, courante),
  3 trimestres auto-générés (réutilise `_creer_trimestres_auto`), 19 classes
  (1 par niveau, convention de nommage identique à l'existant : "7A-1" ...
  "TSS-1"), **5000 élèves synthétiques** (matricules ELV-00001..05000,
  répartis uniformément sur les 19 niveaux, âges cohérents avec le niveau,
  noms/prénoms/téléphones guinéens réalistes), ~5033 parents/tuteurs liés,
  programme guinéen déployé sur les 19 classes (réutilise l'endpoint existant
  `attribuer_programme_aux_classes`, 166 lignes `ClasseMatiere` — exactement
  le même total que l'ancien jeu de données, confirmant le déterminisme de
  cette fonction), et les 11 enseignants affectés aux matières/classes selon
  leur `specialite` (mapping par matricule exact, pas par nom — deux
  enseignants partagent le nom "Camara", un matching par nom aurait été
  ambigu). **Couverture volontairement non-exhaustive** : avec 11 enseignants
  pour 33 matières, chaque matière a au moins 1 enseignant (33/33 vérifié)
  mais avec un chevauchement fort (4 enseignants sur la Physique) et des
  charges irréalistes — assumé, conséquence directe du choix de garder
  seulement les 11 existants plutôt que d'en recréer un corps complet.
- **Volontairement laissé vide** (décisions explicites) : aucune grille
  tarifaire (`TarifClasse`, l'utilisateur configurera lui-même avant ou après
  l'admission), aucune note/évaluation/bulletin (à saisir par les enseignants
  via leur portail).
- **Vérifié exhaustivement après coup** : tous les compteurs se recoupent
  exactement (5000 élèves = 5000 inscriptions ACTIVE = somme des
  `effectif_actuel` des 19 classes ; 5033 parents = 5033 liens EleveParent) ;
  échantillons élèves/parents/classes/affectations relus individuellement ;
  catalogue confirmé intact (33 matières, 11 enseignants, 7 types de frais,
  148 paramètres, 5 utilisateurs, 1 comptable — tous inchangés).
- Mémoire personnelle (hors dépôt) mise à jour avec 3 entrées liées : l'état
  de la base après reset, le réflexe de diagnostic "année courante périmée",
  et la limite de couverture enseignants — pour que les sessions futures ne
  se fient plus à l'ancien repère "2801 élèves".

## Historique — Refonte clôture/réinscription/tarifs, Phase 5 "Découplage promotion / choix de filière", 05/08/2026
Retour de test utilisateur sur l'assistant (Phase 4) : le choix de filière des
10e année bloquait l'étape "Promotions" du wizard — jugé incorrect ("le choix
de la filière ne doit jamais empêcher la validation de la promotion"). Root
cause : la frontière Collège→Lycée n'était qu'un flag `necessite_choix_serie`
sur la décision `ADMIS`, et l'ancienne constante unique `DECISIONS_AVEC_SUITE`
mélangeait deux concepts différents ("qui entre en campagne de réinscription"
vs "qui doit avoir une classe cible résolue pour valider"). Voir
`.ai/CURRENT_TASK.md` pour le détail complet. Points à retenir :
- **Le choix de filière est désormais une opération de RÉINSCRIPTION, jamais
  un préalable à la validation de la promotion.** Nouvelle décision persistée
  `EN_ATTENTE_FILIERE` (remplace le flag calculé à la volée), explicitement
  exclue de `DECISIONS_NECESSITANT_CLASSE_CIBLE` — ne pas avoir de classe
  cible résolue est son état NORMAL et attendu tant que la réinscription n'a
  pas eu lieu. Toute future décision de fin d'année qui "attend" une
  résolution ultérieure doit suivre ce même patron : une constante séparée
  pour "bloque la validation" vs "entre en campagne de réinscription" — ne
  jamais les remélanger dans une seule constante comme l'ancien code le
  faisait.
- **`choisir_filiere` fonctionne maintenant APRÈS validation** (le refus
  `statut_promotion == VALIDE` a été retiré) — c'est le cas normal désormais,
  pas une anomalie. Le blocage se fait uniquement sur `decision_fin_annee !=
  EN_ATTENTE_FILIERE` et `statut_reinscription == REINSCRIT` (trop tard).
- **Pattern de découplage UI appliqué** : le sélecteur de filière et sa
  logique de blocage client (`bloqueSerieManquante`) ont été entièrement
  retirés du wizard de clôture (`classes/cloture-annee`) et déplacés vers un
  nouvel onglet dédié de la page réinscription (`comptabilite/reinscription`)
  — cohérent avec le principe déjà établi Phase 4 ("ne pas dupliquer une UI
  entre deux pages") mais appliqué à l'inverse : ici il fallait au contraire
  RETIRER une UI d'un endroit pour la centraliser au bon endroit une fois le
  découplage métier compris.

## ⚠️ Limite d'outillage : pas d'automatisation de navigateur disponible dans cette session
La règle habituelle de ce projet ("pour tout changement frontend, tester
réellement au clic dans un navigateur avant de considérer la tâche terminée")
n'a pas pu être appliquée à la lettre pour l'assistant de clôture (Phase 4,
05/08/2026) — aucun outil Playwright/capture d'écran n'était disponible cette
session, seulement `WebFetch` (ne exécute pas le JS React côté client).
Vérifié à la place : `tsc`/sweep propres, endpoints testés unitairement sur
données synthétiques, page chargée via `curl` (200, pas d'erreur Next.js,
bundle JS présent — preuve seulement que le rendu serveur initial ne plante
pas, PAS que l'interactivité fonctionne). **Si un outil de navigateur devient
disponible dans une session future, revérifier réellement au clic toute
feature interactive livrée sans lui** — ne pas supposer qu'une vérification
`curl`/statique suffit pour un changement UI complexe.

## Historique — Refonte clôture/réinscription/tarifs, Phase 4 "Assistant de clôture (wizard 10 étapes)", 05/08/2026
`classes/cloture-annee/page.tsx` est devenu l'assistant 10 étapes complet
(pas une nouvelle page séparée) — décision délibérée pour éviter de dupliquer
l'UI déjà riche et testée en Phase 2 (calcul résultats/promotions/choix
filières) dans un nouveau composant qui aurait divergé au premier bug corrigé
dans un seul des deux endroits. `comptabilite/reinscription` reste une page
dédiée séparée, reliée par lien + statut agrégé (nouveaux endpoints
`GET /api/promotion/annee/{id}/etat` et `GET /api/reinscription/etat/{id}`).
**Réordonnancement assumé** : "Création de la nouvelle année" (étape 6 du
cahier des charges original) déplacée en position 3 dans l'assistant — l'ordre
littéral du cahier des charges était techniquement impossible (le calcul des
résultats, Phase 2, a besoin que l'année cible existe déjà pour résoudre la
classe cible de chaque élève). Voir `.ai/CURRENT_TASK.md` pour le détail
complet. Nouveau composant réutilisable `frontend/src/components/Stepper.tsx`
— premier de ce type dans le projet, statuts dérivés de l'état réel des
données plutôt que d'un état "wizard" séparé à synchroniser.

## ⚠️ Piège : le sweep d'annotations différées ne détecte PAS les NameError dans le corps d'une fonction
Le sweep systématique (`inspect.signature()` sur toutes les fonctions de
`app/api/*`, documenté juste en dessous) force seulement l'évaluation des
**annotations** (paramètres/retour) — il n'exécute JAMAIS le corps de la
fonction. Trouvé en Phase 3 de la refonte clôture/réinscription/tarifs :
`get_bulletins_classe` (`evaluations.py`) référençait `classe.etablissement_id`
sans avoir jamais fetché `classe` — un vrai `NameError`, invisible à
`py_compile`, à `import main`, ET au sweep d'annotations (tous verts), qui
n'a explosé qu'au tout premier appel réel de cet endpoint (jamais exercé par
aucun code applicatif avant qu'une nouvelle page frontend s'y branche cette
session). **Conclusion : le sweep d'annotations couvre un piège précis
(PEP 649, imports manquants dans une signature), pas les bugs d'exécution
généraux.** Un test end-to-end réel (appel direct de la fonction, comme déjà
pratiqué systématiquement dans ce projet) reste le seul filet pour ces
derniers — ne jamais supposer qu'un endpoint est correct juste parce que le
sweep + `tsc` sont verts s'il n'a jamais été réellement exécuté.

## ⚠️ Piège : une 2e FK entre deux tables déjà liées casse silencieusement le relationship() existant
Ajouté `Inscription.classe_cible_id` (2e FK vers `Classe`, Phase 2 de la
refonte clôture/réinscription) à côté de `Inscription.classe_id` (déjà relié
via `relationship("Classe", back_populates="inscriptions")` sans
`foreign_keys` explicite). Résultat : `AmbiguousForeignKeysError` dès le
premier `db.query()` réel touchant cette relation — **ni `py_compile` ni
`import main` ne le détectent**, car SQLAlchemy ne résout les relations
qu'à la première utilisation effective d'un mapper (paresseux, comme les
annotations différées Python 3.14 déjà documentées plus bas, mais pour une
raison différente). **Procédure à appliquer systématiquement en ajoutant une
FK vers une table déjà reliée par un `relationship()` ailleurs dans le
modèle** : grep `relationship(` sur la table cible AVANT d'ajouter la
colonne, et si un relationship existant n'a pas de `foreign_keys=` explicite,
en ajouter un des deux côtés (`relationship(..., foreign_keys="Model.col")`
et `relationship(..., foreign_keys=[col])`) dans le même commit — jamais
après coup au hasard d'un bug découvert en prod. Trouvé cette fois par le
premier vrai test end-to-end (Phase 2), pas par le sweep habituel.

## Historique — Refonte clôture/réinscription/tarifs, Phase 2 "Résultats/Promotion V2/Réinscription V2", 05/08/2026
Voir `.ai/CURRENT_TASK.md` pour le détail complet. Points à retenir au-delà du
piège SQLAlchemy ci-dessus : (1) la promotion (`app/api/promotion.py`) ne
crée plus JAMAIS d'Inscription — elle ne fait que PROPOSER
(`niveau_cible_id`/`classe_cible_id`, statut `PROPOSE`→`VALIDE`) ; c'est la
réinscription (`app/api/reinscription.py`, système volontairement
indépendant) qui matérialise l'année suivante, uniquement à la confirmation
effective par le comptable — ne jamais recoupler les deux modules. (2) Le
paiement des frais de réinscription n'est PLUS une précondition à la
réinscription elle-même (changement assumé par rapport à l'ancien système) —
confirmer facture immédiatement, le paiement suit le circuit normal ensuite.
(3) Avant de réutiliser un plan approuvé "tel quel" à l'implémentation,
revérifier qu'il ne régresse pas une fonctionnalité existante délibérée non
vue au moment du plan (ici : la sélection libre de frais facultatifs à
l'inscription initiale, qui aurait été perdue en réutilisant le helper de
génération de frais de réinscription sans adaptation) — dévier du plan est
acceptable et préférable à une régression silencieuse, à condition de le
signaler clairement.

## Historique — Refonte clôture/réinscription/tarifs, Phase 3 "Verrou étendu + historique réel", 05/08/2026
**Le verrou `verifier_annee_modifiable()` (déplacé Phase 3 dans
`app/core/annee_lock.py`, ex-`_verifier_annee_modifiable` de `finance.py` —
mettre à jour tout futur ajout pour importer depuis le nouvel emplacement)
couvre désormais TOUTES les mutations rattachées à une année** (comptabilité
ET pédagogie : notes/bulletins/présences/emploi du temps), pas seulement la
finance comme en Phase 1. **Toute nouvelle mutation d'un modèle rattaché à une
année scolaire doit appeler ce garde dès sa création** — pattern de résolution
`annee_id` : `Classe.annee_id` (direct si la classe est déjà fetchée),
`Inscription.annee_id` (direct, le chemin le plus court pour tout ce qui
touche un élève), ou une FK `annee_id` propre au modèle si elle existe déjà
(`CreneauEmploi.annee_id`). Exception documentée : `Incident` (sanctions
disciplinaires) n'a aucun ancrage année fiable (juste `eleve_id` +
`date_incident`) — non verrouillé, à traiter seulement si un besoin réel
apparaît (nécessiterait une vraie décision de modélisation, pas une rustine).
Voir `.ai/CURRENT_TASK.md` pour le détail complet (nouveaux endpoints
d'historique `GET /api/eleves/{id}/inscriptions` et `.../dossier/{id}`,
transition `POST /api/annee-scolaire/{id}/archiver`).

## Historique — Refonte clôture/réinscription/tarifs, Phase 1 "Fondations", 04/08/2026
**`AnneeScolaire` est désormais l'unique entité "année"** (statut étendu
`PLANIFIEE`→`EN_COURS`→`CLOTURE_COMPTABLE`→`ARCHIVEE`). `ExerciceComptable`
(l'ancien système comptable séparé, jamais relié à `Facture`/`Paiement`) reste en
base mais **seulement comme ancrage fiscal du grand livre général SYSCOHADA**
(`EcritureComptable.exercice_id`, `_get_exercice()`) — ne JAMAIS le confondre avec
la clôture "année scolaire" réelle, ce sont deux systèmes orthogonaux qui partagent
juste un nom qui prête à confusion. Le verrouillage réel d'une année (plus aucune
mutation possible — comptable ET pédagogique depuis la Phase 3) passe par
`verifier_annee_modifiable()` (`app/core/annee_lock.py`, relocalisé Phase 3),
piloté par `AnneeScolaire.statut`.
**Piège découvert en cours de route, à ne pas répéter** : le plan initial de cette
refonte prévoyait de "retirer `ExerciceComptable` des imports actifs de
`comptabilite.py`" en supposant que c'était un système duplicatif isolé — une
lecture plus profonde du code en cours d'implémentation a révélé qu'il sous-tend
TOUS les rapports comptables (bilan, balance, grand livre, journaux). **Avant de
planifier le retrait d'un modèle qui semble "legacy" dans ce projet, grep TOUTES
ses utilisations (pas seulement celles visibles depuis l'angle du problème en
cours) — un modèle peut sembler redondant depuis un angle et être une dépendance
réelle depuis un autre.** Voir `.ai/CURRENT_TASK.md` pour le détail complet
(Phase 1 terminée ; Phase 2 — résultats/promotion V2/réinscription V2/wizard/
archivage — explicitement différée, pas commencée).

## Historique — Clôture bulk, réglages bulletin unifiés, page Réinscription, 04/08/2026
**Workflow de clôture d'année confirmé par l'utilisateur** : après clôture (transfert
promus/redoublants + désactivation des comptes élèves), les élèves restent
`Eleve.statut='INACTIF'` jusqu'à réinscription PHYSIQUE du parent à l'école. Le
comptable encaisse les frais de réinscription (`TypeFrais.categorie == "Réinscription"`,
code "REIN", existe déjà en base) puis active l'élève via la nouvelle page
`/comptabilite/reinscription` — l'activation (`PUT /api/eleves/{id}/reactiver`) est
BLOQUÉE tant que cette facture n'est pas soldée (sauf `force=true` explicite). C'est
la référence pour tout futur travail sur le cycle de vie année scolaire → réinscription.

**Piège récurrent : deux pages Paramètres qui écrivent le même concept dans deux
espaces de clés `ss_parametres` disjoints, sans jamais se voir.** Trouvé une
première fois avec les réglages d'affichage du bulletin (`notation.display.*` vs
`documents.champ_*` — la page Notation semblait "ne rien sauvegarder" alors qu'elle
sauvegardait très bien, juste dans une clé que rien ne lisait). **Avant d'ajouter un
nouveau toggle "config" dans ce projet, vérifier qu'aucune AUTRE page Paramètres
n'écrit déjà un concept équivalent sous un nom de clé différent** — sinon prévoir une
fonction de fusion partagée comme `get_bulletin_display_flags()` (`evaluations.py`)
dès le départ plutôt que de laisser les deux diverger silencieusement.

## ⚠️ Piège critique : Python 3.14 + FastAPI = annotations différées (PEP 649)
Ce projet tourne sur **Python 3.14**, qui applique PEP 649 par défaut : les
annotations de type (y compris les paramètres de fonction) ne sont PLUS évaluées
à la définition de la fonction (import du module) mais paresseusement, à la
première introspection (`inspect.signature()`, que FastAPI appelle pour chaque
route à la première requête reçue, pas au démarrage). **Conséquence directe** :
un paramètre typé avec une classe non importée (ex: `response: Response` sans
`from fastapi import Response`) ne provoque AUCUNE erreur à l'import du module
ni à `python -m py_compile`, ni même à `import main` (348 routes s'enregistrent
sans broncher) — l'erreur (`NameError` interne à FastAPI, remonté en HTTP 422
"Field required" trompeur, comme si le paramètre était un champ de requête
manquant) n'apparaît qu'au tout premier appel réel de cette route précise.
**Vécu concrètement** : `get_evaluations_centralisees` (`evaluations.py`)
utilisait `response: Response` sans l'import — tous les tests `py_compile` et
`import main` de cette session sont passés au vert, le bug n'est apparu que
lorsque l'utilisateur a cliqué sur la page réelle.
**Procédure de vérification à utiliser SYSTÉMATIQUEMENT après toute modification
de signature de route** (`py_compile` ne suffit PAS sur ce projet) :
```python
import inspect, pkgutil, importlib
import app.api as api_pkg
for _, modname, _ in pkgutil.iter_modules(api_pkg.__path__, prefix='app.api.'):
    mod = importlib.import_module(modname)
    for name, obj in vars(mod).items():
        if inspect.isfunction(obj) and obj.__module__ == modname:
            inspect.signature(obj)  # lève NameError si une annotation est mal importée
```
Sweep complet effectué cette session sur les 395 fonctions de `app/api/*` :
aucune autre occurrence trouvée après correction de `evaluations.py`.

## Historique — N+1 à l'échelle réelle, formule Écrit/Oral/Composition finalisée, 04/08/2026
Le seed massif de 2801 élèves (session précédente) a immédiatement révélé une
classe de bug invisible en dev avec des données de test : plusieurs endroits du
code faisaient une requête DB PAR LIGNE affichée (N+1) — invisible avec 10-50
lignes, catastrophique (timeout 30s) avec 998 évaluations ou 2753 parents. Trouvé
et corrigé dans `get_evaluations_centralisees`, `get_notes_centralisees_classe`,
`calculer_moyennes` (tous `evaluations.py`), et `get_parents_annuaire`
(`communication.py`). **Règle à appliquer systématiquement pour toute nouvelle vue
liste dans ce projet** : précharger par lot (`Model.filter(Model.id.in_(ids))`)
puis indexer en dict Python — jamais de `db.query()` à l'intérieur d'une boucle
sur les lignes à afficher. Voir `.ai/CURRENT_TASK.md` pour le détail complet.

**Formule de moyenne définitive** (remplace la V1 de la session du seed) :
moyenne de matière = pondération Écrit/Oral/Composition CONFIGURABLE (Paramètres
> Notation, défaut 1/1/2), le coefficient de la matière n'intervient QUE dans le
calcul de la moyenne générale (Σ moyenne_matière × coef_matière), jamais dans le
calcul de la moyenne de matière elle-même — implémenté dans
`get_poids_evaluations()`/`moyenne_matiere_eleve()` (`evaluations.py`). L'ancien
système "poids_pourcentage par type d'évaluation, doit sommer à 100%" existe
encore dans l'UI (gestion des libellés de types) mais n'a **jamais** été branché
au calcul — source d'une confusion utilisateur ("ne sauvegarde pas correctement")
qui était en fait juste une UI trompeuse, pas un bug de persistance.

**Environnement sans accès réseau PyPI** — `pip install` échoue (aucune
distribution trouvée, environnement de dev isolé). Pour toute nouvelle
dépendance Python, vérifier d'abord si `reportlab`/`Pillow` (déjà installés)
couvrent le besoin avant de supposer qu'on peut ajouter un package — ex: QR code
fait via `reportlab.graphics.barcode.qr` (natif), pas la librairie `qrcode`.

## Historique — Système de notation guinéen à 3 notes + seed massif réel, 04/08/2026
Décision produit clé de l'utilisateur (réponse au flou PUBLIEE/CENTRALISEE signalé
la session précédente) : chaque matière/trimestre = exactement 3 notes officielles
envoyées à la centralisation — **écrite, orale, composition**. L'enseignant peut
saisir plusieurs notes brutes par catégorie (ex: plusieurs devoirs) mais seule la
MEILLEURE de chaque catégorie compte, pas leur moyenne ("c'est à l'enseignant de
choisir... prendre la plus haute note"). Le **coefficient de la matière s'applique
UNIQUEMENT à la composition** — écrite et orale comptent toujours à poids 1, quoi
que l'enseignant saisisse comme coefficient (appliqué côté serveur, jamais un choix
frontend). Implémenté via `moyenne_matiere_eleve()`/`coefficient_pour_evaluation()`
(`backend/app/api/evaluations.py`), catégorie déduite de `TypeEvaluation.code`
(COMPO/ORAL/tout le reste). C'est LA référence pour tout calcul de moyenne future
dans ce projet — ne pas revenir à une simple moyenne pondérée par évaluation.

**Règle de dotation enseignants confirmée par l'utilisateur** : un enseignant
enseigne au maximum 3 matières distinctes par défaut ("on suppose que la limite
d'enseignement d'un enseignant, c'est trois, en prenant par défaut trois"), mais
PEUT enseigner cette même matière dans plusieurs classes du même cycle (ce n'est
pas 3 classes, c'est 3 matières). Utilisé pour semer la couverture 100% (166
affectations pour 19 classes réelles, seulement 11 enseignants au total).

**Seed massif de données réelles (2801 élèves, pas des données de test jetables)**
— l'utilisateur a été explicite et répété : "tu dois rentrer dans notre base de
données actuelle", pour un stress-test volontaire du système à l'échelle. Détail
complet dans `.ai/CURRENT_TASK.md`. Point de vigilance pour toute session future :
le portail élève/parent ne montre un bulletin QUE si `Bulletin.statut == 'PUBLIE'`
(`calculer_moyennes` le laisse à `'CALCULE'` — il faut ensuite explicitement
`PUT /classe/{id}/bulletins/publier-tout` par classe/trimestre, sans quoi les
bulletins existent en base mais restent invisibles côté élève/parent — piégeant
la première fois lors de la vérification de ce seed).

Bug de cache confirmé et corrigé : `frais/page.tsx` (génération de factures)
n'invalidait que sa propre clé React Query, jamais `encaissement-solvabilite` —
un comptable qui facture puis va encaisser voyait des données pré-facture pendant
jusqu'à 5 min (staleTime), et le comptant "élève déjà réglé" à tort. Chaque fois
qu'un flux de mutation financière est ajouté/modifié dans ce module, vérifier les
3 clés croisées qui doivent être invalidées ensemble : `encaissement-solvabilite`,
`impayes`, `finance-dashboard` (+ `frais-all` si la mutation vient d'ailleurs que
Frais).

Bug de filtrage par année confirmé dans TOUT le module comptabilité : la plupart
des pages avaient `annee_id=1` codé en dur dans les URLs d'API au lieu de lire
`AppContext.anneeId` (déjà alimenté correctement) — donc après clôture d'année,
les pages financières restaient bloquées sur les données de l'ancienne année pour
toujours. Nouveau composant réutilisable `frontend/src/components/AnneeFilter.tsx`
à réutiliser pour toute future page comptabilité/rapport qui affiche des données
scopées par année.

## Historique — Lancement du module Promotion & Clôture d'année, 03/08/2026 (suite)
Après une troisième vague de petits bugs corrigés (carte enseignant, reçu parent,
en-tête année, scan QR, messagerie, indicateur "déjà payé"), l'utilisateur a demandé
de commencer le plus gros chantier resté en feuille de route : la clôture d'année
scolaire avec promotion des élèves. Points marquants :
- **Structure réelle du cursus découverte par investigation** (pas supposée) : 19
  classes actives, pas 13 comme l'utilisateur le pensait — le Lycée se scinde en 3
  séries parallèles (SE/SM/SS) à partir de la 11e année, chacune ayant sa propre
  progression linéaire jusqu'à Terminale. `Niveau.ordre` est scopé PAR CYCLE, pas
  global — un cycle Lycée entier utilise les valeurs 11-19, donc "niveau suivant"
  ne peut pas être un simple `+1` global ; il fallait un cas particulier pour la
  frontière Collège→Lycée (choix de série obligatoire, pas automatisable) et pour la
  Terminale (fin de cursus, pas de "suivant").
- **`Classe` est propre à une année scolaire** (`Classe.annee_id`), pas une entité
  persistante à travers les années — donc avant de pouvoir transférer un élève vers
  "l'année suivante", les classes de cette année suivante doivent déjà exister. Ajouté
  un endpoint dédié pour cloner la structure des classes (pas la salle ni le
  professeur principal, à réassigner consciemment) d'une année vers une autre.
- **Deux colonnes mortes réactivées** : `Inscription.decision_fin_annee` et
  `moyenne_annuelle` existaient dans le modèle depuis le début mais n'étaient lues ni
  écrites nulle part (confirmé par grep exhaustif lors de l'investigation) — elles
  servent maintenant de trace réelle de la décision de fin d'année.
- **Réglages Paramètres > Notation enfin utilisés** : `redoublement_actif`/
  `seuil_redoublement` par cycle existaient dans l'UI depuis longtemps mais n'étaient
  jamais consultés par aucun calcul — c'est exactement le pattern déjà rencontré
  plusieurs fois dans ce projet (configuration UI construite en avance sur le moteur
  qui devrait la consulter). La décision admis/redoublant/diplômé les utilise enfin.
- **Bug trouvé PENDANT le test, pas après** : la première version de
  `executer_cloture_classe` désactivait l'élève et annulait son ancienne inscription
  MÊME quand aucune classe cible n'était trouvée (série Lycée pas encore choisie),
  créant un élève "orphelin" (aucune inscription active nulle part). Détecté en
  testant le cas d'échec exprès (comportement attendu de la routine de test), corrigé
  en résolvant la classe cible AVANT de toucher à quoi que ce soit en base — un
  élève dont le transfert ne peut pas être résolu reste totalement intact et peut
  être retraité plus tard sans effet de bord. Leçon : quand un endpoint mute
  plusieurs entités liées, toujours valider TOUTES les conditions de succès avant la
  première mutation, pas mutation-par-mutation avec des `continue` intercalés.
- **Découverte préoccupante, non corrigée (nécessite une décision produit)** : le
  flux principal de saisie de notes des enseignants (`POST /{id}/notes`, activement
  utilisé par le frontend) crée les évaluations avec `statut="PUBLIEE"`, mais le
  moteur de calcul de moyenne ne compte que `statut="CENTRALISEE"` — un endpoint
  séparé `.../centraliser` existe mais rien n'indique clairement à l'enseignant qu'il
  doit encore l'utiliser après avoir "sauvegardé" ses notes. Risque réel de notes
  saisies qui n'apparaissent jamais dans les bulletins. Signalé à l'utilisateur,
  pas corrigé unilatéralement (implique un choix de workflow, pas juste un bug).
- **Couverture de données très faible confirmée par requêtes réelles** : 4,8%
  d'affectations enseignant↔matière↔classe (8/166), 2 évaluations dans toute la base,
  9 classes de Lycée sans aucun élève inscrit, 17 des 33 matières sans enseignant
  spécialisé. Le seeding de données de test réalistes reste à faire — periomètre
  exact déjà documenté (voir `.ai/CURRENT_TASK.md`), en attente de confirmation de
  l'utilisateur sur l'ampleur souhaitée (juste les 4 classes collège peuplées, ou
  aussi créer des enseignants fictifs + inscrire des élèves en Lycée).
- **Méthode de validation** : tout le nouveau module (`backend/app/api/promotion.py`)
  a été testé avec des années/classes/élèves entièrement synthétiques (jamais sur les
  vraies 19 classes/54 élèves), couvrant les 4 branches (promotion linéaire,
  redoublement, branchement de série Lycée, diplôme Terminale), avec nettoyage complet
  vérifié après coup (comptages avant/après identiques : 19 classes, 54 élèves).

## Historique — Deuxième vague de retours de test réels, 03/08/2026 (suite)
Suite directe, même jour, de la session ci-dessous. Points marquants :
- La boucle infinie "Maximum update depth exceeded" sur Encaissement (déjà signalée
  et censée être corrigée) est réapparue car le premier correctif (mémoïser
  `allData`) n'avait pas encore été vu par l'utilisateur au moment du rapport —
  vérification exhaustive du fichier a confirmé que le fix tenait, mais a aussi
  révélé un DEUXIÈME bug dans le même fichier (voir point suivant), qui aurait pu
  faire croire à une récidive du même symptôme.
- Bug instructif : `total_restant <= 0` était utilisé comme proxy de "facture
  soldée", mais cette condition est ÉGALEMENT vraie quand aucune facture n'existe
  du tout (`total_facture = 0`) — après le reset scolarité, ceci faisait apparaître
  TOUS les élèves comme "déjà payés" dans Encaissement, bloquant tout encaissement.
  Leçon : une condition booléenne qui sert de proxy à un état métier doit toujours
  être vérifiée pour tous les cas où elle peut être vraie, pas seulement le cas
  visé — ici il fallait explicitement exclure `total_facture = 0` du "soldé".
  `comptabilite/scolaire/page.tsx` avait déjà le bon traitement (indicateur
  `AUCUNE_FACTURE` dédié) ; seul `encaissement/page.tsx` confondait les deux états.
- Bug de routage découvert par lecture de code (pas par reproduction) : le bouton
  "Message" des fiches enseignant/élève redirige vers la messagerie avec
  `dest_type=ENSEIGNANT|ELEVE`, mais le formulaire d'envoi appelait toujours
  l'endpoint `/messages-parents` (restreint aux destinataires parents), rejetant
  tout autre type avec "destinataire_type invalide". Un endpoint générique
  `/messages` sans restriction existait déjà mais n'était jamais utilisé par ce
  formulaire — corrigé en routant vers le bon endpoint selon le type de
  destinataire.
- Deux "bugs" signalés par l'utilisateur se sont avérés ne PAS en être après
  vérification en base réelle : l'emploi du temps absent d'un enseignant (0
  créneaux sur SES 3 classes, pas lié au nombre d'élèves — `Affectation` et
  `CreneauEmploi` sont deux étapes distinctes, seule la première avait été faite),
  et l'absence de paiements dans le portail enseignant (la fonctionnalité "Mes
  Paiements" existe déjà intégralement, juste vide car tout l'historique de paie a
  été supprimé lors du reset payroll d'une session antérieure). Leçon : toujours
  vérifier l'état réel des données avant de conclure qu'une fonctionnalité est
  cassée ou manquante — ici, lire le code + interroger la base a évité de
  reconstruire une fonctionnalité qui existait déjà.
- Erreur 500 signalée sur l'inscription complète d'un élève (Terminale, scolarité +
  frais de réinscription + uniforme) — reproduite exactement en base réelle SANS
  échec, cause racine non identifiée. En attente du texte d'erreur exact promis par
  l'utilisateur avant de continuer l'investigation.
- Bug latent découvert incidemment en nettoyant un élève de test :
  `DELETE /api/eleves/{id}` ne gère aucune dépendance (Inscription, Facture,
  EcheanceFacture, EleveParent) — échoue par violation de contrainte FK dès qu'un
  élève a une facture liée. Non corrigé (hors périmètre immédiat), mais pertinent
  pour la future fonctionnalité "suppression définitive après non-réinscription"
  de la feuille de route — à revoir à ce moment-là.
- Clarification (pas d'implémentation) : confirmé qu'aucune logique de clôture
  d'année scolaire / promotion élève n'existe encore (colonnes `decision_fin_annee`/
  `rang_final` sur `Inscription` jamais lues ni écrites nulle part) — correspond à
  la feuille de route déjà actée la session précédente, toujours pas commencée.

## Historique — Retours de test réels post-analyse + reset scolarité, 03/08/2026
Suite directe de l'analyse complète du 01/08/2026 : l'utilisateur a testé en
conditions réelles et signalé 6 problèmes concrets (détail complet dans
`.ai/CURRENT_TASK.md`), tous root-causés en base réelle avant correction (pas de
correction à l'aveugle). Points marquants :
- Root cause la plus instructive : `selectedMonth` dans `salaires/page.tsx` était
  codé en dur à la chaîne littérale `'2026-06'` au lieu de calculer le mois réel
  courant (contrairement à l'équivalent déjà correct dans `paiements/page.tsx`) —
  toutes les primes/avances de test de l'utilisateur étaient bien enregistrées, mais
  sous ce mois figé, jamais sous le mois réellement affiché ailleurs dans l'appli.
  Un simple `grep` des données réelles (`Prime`/`Avance` en base) a confirmé les 8
  enregistrements de test tous sous `mois_concerne='2026-06'`, ce qui a validé
  l'hypothèse avant même de toucher au code.
- Modes de paiement : confirmé que la page Paramètres persiste bien la configuration
  (l'utilisateur avait déjà ajouté "PAYPAL"/"TEST", retrouvés en base), mais 4 pages
  différentes du module comptabilité gardaient chacune leur propre liste de modes
  codée en dur, mutuellement incohérente — un cas classique de configuration
  correctement sauvegardée mais jamais réellement consommée nulle part. Centralisé
  dans `frontend/src/lib/modesPaiement.ts`.
- Le frais de cantine facturé à des familles n'ayant pas adhéré n'était PAS un bug
  du mécanisme d'adhésion (qui existe déjà et fonctionne correctement à
  l'inscription de l'élève, avec cases à cocher par frais) — c'était la génération
  de factures GROUPÉE "pour toute la classe" qui ignorait le caractère facultatif
  d'un type de frais. Leçon : avant de construire une nouvelle fonctionnalité
  d'adhésion, vérifier qu'elle n'existe pas déjà ailleurs dans le flux — ici,
  l'investigation du formulaire d'inscription a évité de dupliquer un mécanisme déjà
  présent, et a permis de cibler le vrai point de rupture (la génération groupée).
- Reçu PDF : le rectangle "LOGO" était un placeholder statique jamais connecté au
  réglage `documents.entete_logo` ni à `Etablissement.logo_url`, alors que le
  filigrane (autre réglage du même module `documents_settings.py`) fonctionnait
  correctement — signe que le reçu avait été écrit avant l'ajout du système de
  logo/filigrane et jamais mis à jour depuis. Corrigé avec un vrai rendu ReportLab
  `ImageReader`, vérifié en extrayant le texte et les XObjects du PDF généré
  (bibliothèque `pypdf`, installée pour l'occasion).
- **Reset scolarité effectué sur demande explicite** (deuxième reset de la
  session — le premier, le 02/08, portait sur la paie ; celui-ci porte sur les
  paiements élèves/factures/reçus) : sauvegarde JSON complète prise avant
  suppression, puis toutes les `Facture`/`EcheanceFacture`/`Paiement` et les
  écritures comptables liées supprimées ; `TarifClasse`/`TypeFrais` volontairement
  préservés (l'utilisateur va tester la configuration des tarifs par classe juste
  après). Cache Redis du dashboard vidé manuellement après coup (reset fait par
  script direct, pas via l'API — l'invalidation automatique sur mutation ne
  s'applique qu'aux appels API réels).
- **Leçon de méthode retenue** : un test de fumée sur `create_facture` avait
  réellement committé en base malgré un `db.rollback()` explicite après coup, parce
  que la fonction appelle `db.commit()` en interne — un rollback après un commit ne
  peut rien annuler. Repéré en auditant les données avant le reset scolarité (une
  écriture comptable "mixte" inattendue a mis la puce à l'oreille), nettoyé
  explicitement. Retenu pour toute la suite : ne jamais compter sur `db.rollback()`
  après avoir appelé une fonction qui commit en interne (la plupart des endpoints
  FastAPI de ce projet le font) — nettoyer par suppression + commit explicite à la
  place, ou tester une fonction interne qui ne commit pas elle-même.
- **Feuille de route actée pour la suite** (non commencée, en attente de validation
  comptabilité) : module Évaluations, clôture d'année avec transfert admis/redoublants
  par classe, désactivation en masse à la clôture, réinscription/réactivation
  individuelle, suppression définitive après non-réinscription prolongée. Détail
  complet dans `.ai/CURRENT_TASK.md`.

## Historique — Analyse complète finale du module Comptabilité, 01/08/2026
Demandée explicitement par l'utilisateur avant ses propres tests (« analyse complète
pour voir s'il n'y a pas d'erreurs d'API, de communication ou d'autres types d'erreurs
typescript ou autre »), en clôture de la longue journée du 02/08 documentée ci-dessous
(prix par classe, arriérés multi-mois, reset des données). Exécutée via une revue
adversariale multi-agents (8 zones, find→verify), 22 findings confirmés et tous
corrigés avec tests réels contre Postgres à chaque étape (détail complet dans
`.ai/CURRENT_TASK.md`). Points marquants :
- Bug financier critique confirmé : le bouton rapide « Payer ce mois » de chaque ligne
  de la liste Salaires payait avec l'état de sélection du panneau détaillé d'un AUTRE
  employé resté ouvert — risque réel de payer les mauvais mois pour le mauvais employé.
  Isolé dans un helper commun avec deux appelants aux arguments explicitement séparés.
- Deux routes backend manquantes (`POST/PUT /api/finance/employes`, `PUT .../statut`)
  signalées par la revue automatique se sont révélées appeler du code frontend
  totalement inatteignable (jamais déclenché par aucun élément d'UI) — supprimé plutôt
  que d'ajouter des routes pour une fonctionnalité qui n'a jamais existé en pratique.
  Leçon : toujours vérifier l'atteignabilité réelle avant de "corriger" un 404 par
  l'ajout d'une route.
- Endpoints PIN comptabilité (`GET pin/status`, `PUT pin`) appelés par le frontend
  mais absents à 100% côté backend — implémentés. Le widget de changement de PIN dans
  `profil/page.tsx` avait en plus un `.catch(() => {})` interne qui masquait tout échec
  réel à son propre `try/catch` englobant, donc affichait toujours un succès même en
  cas d'erreur — recodé avec un vrai champ de saisie et une gestion d'erreur honnête.
- Recherche Auxiliaire (parents-élèves / fournisseurs) filtrait uniquement les 25
  lignes de la page déjà chargée côté client, sans paramètre `search` côté backend —
  une correspondance au-delà de la première page était invisible. `search` ajouté aux
  deux endpoints ; filtrage client redondant retiré.
- Cache Redis du tableau de bord financier (TTL 60s) jamais invalidé après une
  mutation — un paiement pouvait ne pas apparaître au dashboard pendant jusqu'à une
  minute. Ajout de `cache_del()` (`backend/app/core/cache.py`) + invalidation après
  chaque mutation financière (paiement, dépense, salaire, facture).
- Cache React Query jamais synchronisé entre plusieurs paires de pages qui lisent/
  écrivent les mêmes données par des chemins différents : Salaires ↔ Paiements
  (statut « Non payé » resté affiché après un paiement fait via la redirection —
  `paiements/page.tsx` n'utilisait pas du tout React Query, corrigé via
  `useQueryClient().invalidateQueries` sur les clés lues par Salaires) ; Encaissement
  ↔ Frais (deux écrans de paiement de scolarité qui n'invalidaient jamais la clé de
  l'autre, corrigé dans les deux sens).
- `mode_paiement` envoyé par le formulaire Fournisseur du Centre de Décaissement mais
  silencieusement jeté (colonne absente sur `Depense`) — migration appliquée
  (`database/migrations/2026_08_03_depenses_mode_paiement.sql`), persistance testée
  de bout en bout.
- Anomalie détectée en cours de revue, hors périmètre de la demande : le fichier
  `docs/comptabilite/module-comptabilite.md` (cahier des charges aspirationnel que
  l'utilisateur avait dit d'ignorer comme périmètre, pas de supprimer) s'est retrouvé
  supprimé du disque à un moment de la sous-session précédente, sans trace de décision
  documentée. Restauré depuis `HEAD` par précaution — à confirmer avec l'utilisateur.
- Non traité, documenté comme informationnel (pas un bug bloquant) : l'onglet « Types
  de frais » de `parametres/finance/page.tsx` fait doublon fonctionnel avec
  `comptabilite/frais/page.tsx` (même backend, deux caches React Query non synchronisés
  entre eux — préexistant, pas introduit cette session).

## Historique — Fonctionnalités salaires/frais avancées + reset paie, 02/08/2026 (suite)
Prolongement direct de la session du 02/08/2026 ci-dessous, même jour. Ajouts :
prix de scolarité personnalisable par classe (checkbox + montant propre par classe
lors de la génération de factures, au lieu d'un montant unique partagé) ; arriérés de
salaire multi-mois (nouveaux endpoints `/salaires/arrieres/{id}` et
`/salaires/payer-plusieurs-mois`, le comptable peut désormais régler un mois précis en
retard ou la totalité en un clic, plutôt que d'être limité au seul mois du calendrier
sélectionné) ; garde-fou (confirmation, pas blocage) si on paie avant la date de paie
officielle configurée ; catégorie "Salaires" retirée du formulaire générique de
décaissement (un seul chemin de paiement de salaire désormais, via la carte dédiée).
**Reset de données effectué sur demande explicite** : tous les enseignants/personnel
remis à un salaire de base uniforme de 2 500 000 GNF, tout l'historique de paiement
(bulletins, dépenses SALAIRES, écritures comptables liées) supprimé pour repartir de
zéro — sauvegarde JSON prise avant suppression
(`<scratchpad session>/payroll_backup_before_reset.json`, non versionné, propre à la
session qui a fait le reset).

## Historique — Restructuration Comptabilité suite retours d'usage réel, session du 02/08/2026
Suite directe de la correction de bugs du 01/08/2026 : l'utilisateur a testé le module en
conditions réelles et signalé, non plus des bugs, mais des chevauchements de flux
créant de la confusion. Détail complet dans `.ai/CURRENT_TASK.md`. Points marquants :
- La page `comptabilite/depenses/page.tsx` a été supprimée : elle faisait doublon avec
  Paiements > Centre de Décaissement (deux façons différentes de payer un salaire,
  source de confusion explicitement signalée par l'utilisateur). Justificatif de
  facture (upload réel) + suivi analytique (classe/département) + source des fonds ont
  été migrés dans le formulaire Fournisseur du Centre de Décaissement plutôt que perdus.
  Une fonction utile de l'ancienne page (rejeter une dépense) avait été omise dans la
  migration puis rajoutée après une revue adversariale dédiée.
- Le paiement de salaire individuel est désormais centralisé : le bouton « Payer » de
  Salaires > Calcul des salaires redirige vers Paiements > Centre de Décaissement >
  Salaire (seul point d'entrée) au lieu de payer sur place — évite d'avoir deux chemins
  de paiement de salaire divergents dans l'app.
- Bug corrigé (root-caused directement depuis une observation utilisateur, pas depuis un
  audit) : `_calculer_salaire()` recalculait toujours en direct même pour un mois déjà
  payé, donc ajouter une prime après coup faisait dériver le montant affiché loin du
  montant réellement versé (bulletin figé) — l'utilisateur avait remarqué un écart de
  50 000 GNF entre le "net à payer" affiché et l'historique pour un même employé/mois.
  Une fois un bulletin `PAYE`, ses valeurs figées sont désormais retournées telles
  quelles, sans recalcul.
- `/salaires/alertes` et `/salaires/alertes/historique` étaient des stubs complets
  (même limitation qu'`absences-source` corrigée le 01/08, découverte cette fois via le
  retour utilisateur sur le "Calendrier de paie" plutôt que par audit) — implémentés
  réellement.
- Méthode de validation cette session : après les corrections, une revue adversariale
  ciblée (workflow, 5 zones précises correspondant aux changements du jour — pas un
  audit général du module, celui-là a déjà eu lieu le 01/08) a tourné avant de considérer
  la session terminée. A trouvé et fait corriger 3 bugs réels (état de formulaire non
  réinitialisé pouvant rattacher un justificatif à la mauvaise dépense, perte de la
  fonction "Rejeter" suite à la suppression de la page Dépenses, un bouton mal libellé
  quand une liste est vide) avant de conclure que le flux salaire→redirection et
  l'invalidation de cache étaient corrects.
- Non traité (délibérément, pas oublié) : filtres statut/classe et export CSV sur le
  Centre de Décaissement (existaient sur l'ancienne page Dépenses) — jugés superflus vu
  la demande explicite de simplifier cet écran ; à rajouter si le besoin revient
  (endpoints backend déjà prêts).

## Historique — Correction exhaustive des bugs, module Comptabilité, session du 01/08/2026
Suite directe de la stabilisation du 30/07/2026 : l'utilisateur a signalé « beaucoup de
bugs » en usage réel du module. Détail complet dans `.ai/CURRENT_TASK.md`. Audit en 10
zones (workflow multi-agents interrompu à mi-parcours par une limite de session — 6/10
zones auditées automatiquement, 4 auditées manuellement) puis corrections fichier par
fichier, testées à chaque lot (`py_compile`, import complet du backend, exécution directe
de plusieurs endpoints contre la vraie base Postgres de dev, `tsc --noEmit` et `npm run
lint` en fin de session — tous propres). Points marquants :
- Plusieurs bugs à impact financier direct corrigés : le montant de salaire saisi à
  l'écran était silencieusement ignoré par le backend (qui paie son propre calcul) ;
  une dépense « Approuvée » ne pouvait plus jamais être postée en comptabilité générale
  (bouton de validation absent pour ce statut) ; les paiements sur échéance pouvaient
  sur-créditer une échéance sans plafond.
- Le reçu de paiement (écran + impression) était cassé à 100% depuis toujours — pas une
  régression de cette session, un endpoint JSON attendu par le frontend n'a jamais existé
  côté backend (seul un export PDF existait sous une autre route).
- Deux fonctionnalités étaient des façades complètes sans aucun effet réel : la Clôture
  Annuelle (ne faisait qu'un `setState` local) et `/salaires/absences-source` (stub qui
  renvoyait toujours un tableau vide). Les deux ont été rendues réellement fonctionnelles.
- 6 des 13 pages du module (`automatisations`, `auxiliaire`, `exports`, `frais`,
  `paiements`, `scolaire`) étaient entièrement construites et fonctionnelles mais absentes
  du menu de navigation — invisibles sans taper l'URL à la main. Ajoutées au menu.
- Une page `comptabilite/communication/page.tsx` (974 lignes) s'est avérée n'avoir aucun
  rapport avec la comptabilité (emploi du temps enseignant) — probablement égarée dans le
  mauvais dossier lors du travail à 3 pôles ; laissée en l'état, décision (déplacer/
  fusionner/supprimer) renvoyée à l'utilisateur plutôt que tranchée unilatéralement.
- Deux implémentations concurrentes de React Query étaient montées simultanément à la
  racine de l'app (l'une strictement inutile, contexte React le plus interne toujours
  prioritaire) — doublon et fichier mort supprimés.
- Migration DB appliquée sur la base de dev réelle (Postgres, docker déjà démarré) :
  nouvelles colonnes analytiques sur `ss_depenses` (`facture_url`, `source_fonds`,
  `classe_id`, `eleve_id`, `departement`), qui étaient déjà envoyées par le frontend mais
  jetées silencieusement par le backend faute de colonnes.
- Vérification positive : le moteur de comptabilité générale (`generer_ecriture_auto`,
  double-entrée SYSCOHADA) reste équilibré (Σdébit == Σcrédit) sur données réelles —
  aucun bug trouvé dans le cœur du moteur comptable lui-même.
- Non traité (par manque de temps, pas par oubli — voir `.ai/CURRENT_TASK.md` pour le
  détail) : export CSV et recherche des onglets Encaissements/Décaissements de
  `paiements/page.tsx` limités à la page actuellement chargée (25 lignes) plutôt qu'à
  l'ensemble filtré ; système d'alertes de paie planifiées (stub, nécessiterait une
  nouvelle table — fonctionnalité neuve, pas un bug).

## Historique — Stabilisation module Comptabilité, session du 30/07/2026
Chantier hors `.ai/TODO.md`, demandé directement par l'utilisateur (module
comptabilité récupéré depuis GitHub, travail à 3 pôles, voir
`docs/comptabilite/repartition_taches_comptabilite.md`). Détail complet dans
`.ai/CURRENT_TASK.md`. Résumé :
- Bug de routing `/comptabilite` (double redirect serveur/client) corrigé.
- Double authentification (PIN/`Comptable` maison + JWT principal) supprimée :
  source de fragilité de session (un 401 sur la comptabilité pouvait déconnecter
  tout l'admin). Un seul mécanisme d'auth désormais (`AuthContext` + `roleAccess.ts`).
- `comptabilite_router` sécurisé (était accessible sans authentification).
- Pont automatique Finance → Comptabilité Générale créé : factures, paiements,
  annulations, dépenses validées et salaires génèrent désormais une écriture
  comptable SYSCOHADA équilibrée automatiquement (`generer_ecriture_auto` dans
  `backend/app/api/comptabilite.py`, branché depuis `backend/app/api/finance.py`).
  Avant : Balance/Grand Livre/Compte de Résultat/Auxiliaire restaient vides.
- Endpoint manquant `GET /api/finance/rapports/annuel` ajouté.
- Bugs latents corrigés : imports manquants `Fournisseur`/`Inscription` dans
  `comptabilite.py` (NameError garanti sur les endpoints auxiliaires).
- Pagination ajoutée (header `X-Total-Count` + composant `Pagination.tsx`) sur
  impayés, dépenses, auxiliaire (parents/fournisseurs), paiements/décaissements.
- Fondations cache/offline posées : React Query + persistance localStorage
  (front), Redis TTL 60s sur le dashboard financier (back, testé réellement).
- Boutons Imprimer cassés (impression de toute l'interface) corrigés sur
  `examens/emploi/page.tsx` et `portail-eleve/components/EleveBulletin.tsx`.
- Validation : `py_compile` OK, import complet de `main.py` OK (319 routes),
  `npm run type-check` OK, `npm run lint` OK.

### Limitations connues laissées en l'état (voir `.ai/CURRENT_TASK.md`)
- Compte de trésorerie des dépenses/salaires toujours "Banque" par défaut
  (pas de champ mode de paiement sur `Depense`).
- `Depense.fournisseur` (texte libre) non relié à la table `Fournisseur` de
  la comptabilité auxiliaire.
- Cache/pagination pas encore étendus à `rapports`, `salaires`, `exports`.
- Pas de vraie stratégie offline pour les écritures (mutations) — lecture
  seule pour l'instant.

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

Progression globale réelle : **80/101 tâches (79%)**.

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

## Historique — Section 2 (Calendrier), terminée le 27/07/2026
- **Backend complété** dans `backend/app/api/parametrage.py` :
  - ajout de `PUT /api/parametrage/annees/{id}` pour la modification des années scolaires ;
  - ajout du CRUD complet des périodes :
    `POST /api/parametrage/trimestres`,
    `PUT /api/parametrage/trimestres/{id}`,
    `DELETE /api/parametrage/trimestres/{id}` ;
  - `GET /api/parametrage/trimestres` utilise maintenant `response_model=List[TrimestreOut]`.
- **Schémas ajoutés** dans `backend/app/schemas/schemas.py` :
  - `AnneeScolaireUpdate`
  - `TrimestreBase`
  - `TrimestreCreate`
  - `TrimestreUpdate`
  - `TrimestreOut`
- **Frontend créé** :
  - `frontend/src/app/parametres/calendrier/page.tsx`
  - `frontend/src/app/parametres/calendrier/Calendrier.module.css`
- **Choix d’implémentation** :
  - le toggle `TRIMESTRE` / `SEMESTRE` est stocké dans `ss_parametres`
    avec la clé `calendrier.mode_decoupage` ;
  - les vacances scolaires sont stockées en JSON dans `ss_parametres`
    avec la clé `calendrier.vacances` ;
  - aucun changement de schéma SQLAlchemy ni migration DB supplémentaire n’a été
    nécessaire pour cette section.
- **Capacités UI livrées** :
  - création/modification/activation d’année scolaire ;
  - sélection de l’année active à piloter ;
  - création/modification/suppression des trimestres ou semestres ;
  - bascule visuelle du vocabulaire `trimestre` ↔ `semestre` selon le mode choisi ;
  - édition d’une liste de vacances scolaires configurable.

## Tests exécutés
- `python -m py_compile backend/app/api/parametrage.py backend/app/schemas/schemas.py`
  → OK.
- `diagnostics` sur `backend/app/schemas/schemas.py` → OK.
- `diagnostics` sur `frontend/src/app/parametres/calendrier/page.tsx` → OK.
- `diagnostics` sur `backend/app/api/parametrage.py` → uniquement du bruit Pyright
  existant sur l’usage des modèles SQLAlchemy (`Column[...]` vs valeurs Python),
  cohérent avec le reste du dépôt ; pas d’erreur de syntaxe nouvelle bloquante.
- `npx tsc --noEmit` → non exécutable dans cet environnement car le binaire
  TypeScript n’est pas installé localement (`This is not the tsc command you are looking for`).

## Problèmes connus / points d’attention pour la suite
- La table existante reste nommée `ss_trimestres` et le modèle SQLAlchemy reste
  `Trimestre` même quand le mode `SEMESTRE` est choisi ; la différence est donc
  fonctionnelle/UI et de configuration, pas structurelle en base.
- Le frontend utilise encore `ETABLISSEMENT_ID = 1` en dur, comme plusieurs
  autres pages Paramètres déjà présentes dans le projet.
- Les endpoints calendrier n’empêchent pas encore les chevauchements de dates
  entre périodes d’une même année ; une validation métier plus stricte pourra être
  ajoutée plus tard si nécessaire.

## Historique — Refonte du Dashboard Admin (hors TODO), réalisée le 27/07/2026
- **Route concernée** : `frontend/src/app/dashboard/page.tsx`
- **Constat de départ** : la route `dashboard` existait déjà, mais la page restait un tableau de bord mixte ancien style, partiellement premium, avec beaucoup de styles inline et une identité encore peu affirmée comme véritable poste de supervision central.
- **Refonte livrée** :
  - changement d’identité visible vers un **Dashboard de supervision totale** ;
  - hero principal transformé en cockpit premium avec état global, ton opérationnel et raccourcis stratégiques ;
  - ajout d’une lecture “qui parle” du système via une section **Voix du centre** et une **Console d’alerte** ;
  - réorganisation des KPIs pour mieux couvrir effectifs, finance, présence, impayés, communication et pédagogie ;
  - consolidation d’un véritable centre de contrôle avec :
    - radar financier,
    - pilotage pédagogique par cycle,
    - canaux d’encaissement,
    - poste communication,
    - impayés prioritaires,
    - agenda opérationnel,
    - activité temps réel,
    - encaissements récents,
    - effectifs par classe ;
  - conservation des données déjà exposées par `GET /api/dashboard` sans ouvrir de chantier backend supplémentaire ;
  - modal des impayés conservée mais redessinée dans l’esprit cockpit premium.
- **Aucune route renommée** n’était nécessaire : la route réelle était déjà `dashboard`. Le travail a donc porté sur l’identité visuelle, le contenu et le positionnement UX de la page.

## Tests exécutés
- `diagnostics` sur `frontend/src/app/dashboard/page.tsx` → à vérifier dans la session courante après correction des types Recharts.
- Aucun test backend nécessaire : refonte frontend basée sur l’API dashboard existante.

## Historique — Refonte AppShell / Entête / Sidebar, réalisée le 27/07/2026
- **Fichiers modifiés** :
  - `frontend/src/components/AppShell.tsx`
  - `frontend/src/components/Topbar.tsx`
  - `frontend/src/components/Topbar.module.css`
  - `frontend/src/components/Sidebar.tsx`
  - `frontend/src/components/Sidebar.module.css`
  - `frontend/src/context/UIContext.tsx`
- **Entête améliorée** :
  - topbar premium à fond flouté/statique (sticky) ;
  - meilleure hiérarchie visuelle ;
  - badge année scolaire modernisé ;
  - bouton de contrôle du menu latéral intégré à l’entête.
- **Recherche rendue fonctionnelle** :
  - la barre de recherche du header ne se contente plus d’un champ décoratif ;
  - elle propose désormais des résultats de navigation rapides vers les modules principaux ;
  - validation par `Enter` ou clic sur un résultat.
- **Sidebar refondue** :
  - menu latéral plus premium ;
  - libellé `Admin` remplacé par `Dashboard` ;
  - comportement **coulissant / collapsible** avec état compact et état étendu ;
  - ajustement dynamique du layout principal via `UIContext`.
- **Validation** : diagnostics OK sur `Topbar.tsx`, `Sidebar.tsx`, `AppShell.tsx`, `Topbar.module.css`, `Sidebar.module.css`, `UIContext.tsx`.
- **Warnings restants non bloquants** : dans `Sidebar.tsx`, un warning ESLint existant sur `any` (compteur messages) et l’usage de `<img>` au lieu de `next/image` pour le logo établissement.

## Problèmes connus / points d’attention pour la suite
- La page `dashboard` reste très riche en styles inline ; une prochaine étape utile pourrait être d’extraire cela vers un module CSS ou des composants dédiés si d’autres refontes premium sont prévues.
- Certains indicateurs “centre de contrôle” restent des lectures calculées côté frontend à partir des données déjà disponibles ; ils sont cohérents UX mais pas tous directement fournis comme métriques métier natives par le backend.
- La recherche d’entête est actuellement une navigation intelligente vers les pages principales ; elle n’exécute pas encore de recherche métier transverse en base (élèves/messages/factures).

## Historique — Refonte Personnel / rôles / redirections / portails non-admin, réalisée le 27/07/2026
- **Fichiers frontend créés / modifiés** :
  - `frontend/src/lib/roleAccess.ts`
  - `frontend/src/context/AuthContext.tsx`
  - `frontend/src/app/login/page.tsx`
  - `frontend/src/app/personnel/page.tsx`
  - `frontend/src/app/personnel/nouveau/page.tsx`
  - `frontend/src/app/personnel/portail/[role]/page.tsx`
  - `frontend/src/components/AppShell.tsx`
  - `frontend/src/app/comptabilite/layout.tsx`
- **Fichiers backend modifiés / créés** :
  - `backend/main.py`
  - `backend/app/models/academique.py`
  - `backend/app/schemas/schemas.py`
  - `backend/app/api/bibliotheque.py`
  - `backend/app/api/informatique.py`
- **Travaux effectivement livrés** :
  - centralisation de la cartographie rôle → interface → route dans `roleAccess.ts` ;
  - correction des redirections frontend par rôle pour éviter les routes fantômes ;
  - mise en place d’un guard de navigation plus fiable dans `AuthContext.tsx` ;
  - refonte premium de la page `login` ;
  - refonte premium de la page `personnel` ;
  - refonte premium de la page `personnel/nouveau` ;
  - création d’une première base de portails dédiés pour `BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR` ;
  - correction d’un blocage backend `403` sur `/api/personnel` via création de `PERSONNEL_ROLES` dans `backend/main.py` ;
  - séparation explicite entre rôles admin système et rôles non-admin ;
  - isolation du shell admin : seuls `SUPER_ADMIN`, `FONDATEUR`, `DG`, `DIRECTEUR_NIVEAU`, `ADMIN` conservent l’interface système globale ;
  - création du backend bibliothèque partagé (`/api/bibliotheque`) basé sur les tables existantes `SS_OUVRAGES`, `SS_EXEMPLAIRES`, `SS_EMPRUNTS` ;
  - ajout des modèles SQLAlchemy `Ouvrage`, `Exemplaire`, `Emprunt` et des schémas Pydantic associés ;
  - refonte du portail `bibliothecaire` en espace dynamique : chargement stats/catalogue réels, ajout de livre, création automatique d’exemplaires initiaux, état vide, recherche locale et design bibliothèque plus scolaire/chaleureux ;
  - refonte du portail `surveillant` en espace dynamique connecté à `/api/vie-scolaire` : stats présences, incidents, déclaration réelle d’incident ;
  - refonte du portail `operateur` en bureau scolarité connecté à `dashboard`, `eleves`, `classes`, `enseignants` : KPIs réels, recherche de dossiers élèves, classes à orienter ;
  - création du module API informatique `/api/informatique` avec inventaire matériel et tickets de panne ;
  - ajout des modèles SQLAlchemy `EquipementInformatique` et `TicketInformatique` ;
  - refonte du portail `informaticien` en centre informatique dynamique : stats IT, inventaire réel, tickets, ajout équipement et création ticket.
- **Décision importante actée** :
  - `COMPTABLE`, `BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR`, `ENSEIGNANT`, `PARENT`, `ELEVE` doivent tous disposer d’une interface dédiée hors shell admin ;
  - les rôles sans accès (`AGENT_ENTRETIEN`, `GARDIEN`, `CHAUFFEUR`, `AUTRE`) restent visibles en RH uniquement sans portail de connexion par défaut.
- **État actuel après cette étape** :
  - l’isolation structurelle admin / non-admin est posée ;
  - les portails enseignant / parent / élève existent déjà dans le projet ;
  - la comptabilité existe déjà comme espace séparé ;
  - le portail bibliothécaire n’est plus une page vitrine : il écrit/lit désormais le catalogue partagé via API ;
  - les portails `informaticien`, `surveillant`, `opérateur` ne sont plus des pages vitrines : ils lisent désormais des APIs métier réelles et proposent des actions concrètes quand le backend existe.
- **PDF de référence exploité** :
  - le fichier `docs/SmartSchool V2 Complet.pdf` a été extrait avec succès après installation de `pypdf` / `pymupdf` ;
  - extraction texte générée dans `docs/SmartSchool V2 Complet.extracted.txt` ;
  - le document confirme les rôles et responsabilités métier : Fondateur, DG, Directeur de niveau, Enseignant, Administration/Scolarité, Comptable/Caissier, Bibliothécaire, Responsable informatique/labo, Parent, Élève, Super Admin ;
  - le rôle `SURVEILLANT` du projet correspond principalement au bloc SG / absences globales / discipline ;
  - le rôle `OPERATEUR` correspond principalement au bloc Administration/Scolarité : inscriptions, dossiers, documents, annuaire, communications administratives.

## Validation récente — Portails métier internes
- Backend : `python -m py_compile backend/app/api/bibliotheque.py backend/app/api/informatique.py backend/app/models/academique.py backend/main.py` → OK.
- Diagnostics ciblés : `backend/app/api/bibliotheque.py`, `backend/app/api/informatique.py`, `backend/app/schemas/schemas.py`, `frontend/src/app/personnel/portail/[role]/page.tsx` → OK.
- `backend/main.py` garde uniquement un diagnostic Pyright préexistant sur `app.add_exception_handler(RateLimitExceeded, ...)`, sans lien avec ces ajouts.
- Frontend : `npm run type-check` → OK.
- Frontend : `npm run lint` → 0 erreur, uniquement des warnings préexistants nombreux sur l’ensemble du projet.

## Nouvelle tâche active hors TODO — Stabilisation portails et parcours critiques
Demandée après la refonte des portails internes. Le chantier rôles internes (`BIBLIOTHECAIRE`, `INFORMATICIEN`, `SURVEILLANT`, `OPERATEUR`) est mis en stand-by pour l’instant.

### Priorités signalées
- Portail enseignant : téléchargement historique sujets/documents cassé, ajout de liens externes manquant, ressources à pousser vers élèves, paiements/salaires enseignant non visibles.
- Portail élève : afficher les liens externes dans ressources, conserver/afficher l’historique des messages envoyés, aucun message ne doit disparaître.
- Portail parent : page profil ne charge pas, page paramètres/profil mal affichée à redesigner.
- Admin : téléchargement sujets enseignants en 404, page profil admin manquante/non fonctionnelle, bouton paramètres du menu header cassé.
- Dossiers admin : bouton `Contacter` élève doit ouvrir la messagerie avec destinataire préselectionné ; dossier enseignant doit supprimer le bouton `Email` et faire fonctionner le bouton message.
- Pointage tuteur/élèves : à auditer et gérer.
- Scalabilité : vérifier pagination/cache pour supporter de gros volumes multi-établissements.

### Prochaine étape exacte
Auditer les fichiers/endpoints concernés (`portail_enseignant`, `portail_eleve`, `portail_parent`, `examens`, `communication`, pages admin profils/messages) puis corriger d’abord les téléchargements 404 et le flux ressources enseignant → élève.
