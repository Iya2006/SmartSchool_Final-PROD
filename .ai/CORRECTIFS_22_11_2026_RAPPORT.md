# Session du 02 au 22/11/2026 — Offline-first, Phase D

Branche : `IYA-hors-ligne`. Plan approuvé le 02/11 : voir
`C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`.

## Contexte

Les phases A à C donnent un poste qui s'installe, travaille seul, se
synchronise, se met à jour, chiffre ses données et peut être retiré. Il
restait à **prouver** que tout SmartSchool fonctionne hors-ligne à l'identique
du cloud, pour chaque rôle et chaque écran. Il fallait aussi le vérifier avec
plusieurs postes et le web en même temps, puis préparer la production.

**Rien n'est publié, rien n'est en production.** Rien n'a été poussé sur `IYA`
ni sur `main`. Tout est sur `IYA-hors-ligne`.

## D1 — Le moteur et l'interface se relancent seuls (`ee27408`)

- Un service du poste qui s'arrête de lui-même est relancé. La fenêtre
  affiche « Redémarrage en cours… », puis revient à l'écran ouvert, session
  gardée.
- Au-delà de 3 arrêts en 2 minutes, un message propose « Redémarrer » ou
  « Quitter », avec le dossier des journaux.
- Vérifié dans l'application :
  - moteur arrêté deux fois, retour en 3 s ;
  - interface arrêtée, retour en 1 s ;
  - au 4e arrêt, le message s'affiche.

## D2 — Polices servies par l'application (`90d7840`)

- Les polices venaient de Google Fonts : hors-ligne, l'application prenait
  celles de Windows.
- Les 39 fichiers sont maintenant dans `frontend/src/fonts`, sous licence OFL.
- En passant :
  - les polices Nunito et Poppins, proposées dans Paramètres → Apparence,
    n'étaient chargées nulle part ;
  - l'impression des bulletins utilisait elle aussi Google Fonts.

Également corrigé : l'impression et les PDF étaient impossibles dans
l'application de bureau (`d027386`).

## D3 — Le poste et le cloud rendent les mêmes réponses

**L'outil.** `backend/tests/outils/parite_routes.py` appelle toutes les routes
de lecture sur un poste synchronisé et sur le cloud, puis compare les réponses.
`backend/tests/outils/convergence.py` compare les deux bases, table par
table. Les deux outils sont en lecture seule.

**Écarts trouvés et corrigés à la racine :**
- **Recherche.** Les minuscules et majuscules accentuées de SQLite étaient
  fausses : « traore » ne trouvait pas « TRAORÉ » sur un poste (`f61713c`).
- **Rangs.** À moyenne égale, le rang dépendait de l'ordre de lecture. Le même
  élève était 49e sur le poste et 261e en ligne (`a447ab1`).
- **Ordre des listes.** Une soixantaine de tris n'étaient pas déterministes
  (`a447ab1`, `e639d4e`).
- **Ordre alphabétique.** La production trie en en_US.UTF-8 (ton choix du
  21/11). Le poste l'imite désormais à l'identique, accents compris
  (`47f98cc`).
- **Vitesse.** Sans statistiques, SQLite choisissait mal ses index : la liste
  des élèves était lente sur un poste (`47f98cc`).
- **Anciennes données sans école.** Des présences et pointages anciens
  n'arrivaient sur aucun poste (`7efc811`).

**Résultat, sur les données complètes après D4 :** 234 routes identiques,
**0 écart**. Trois écarts sont attendus et normaux : un poste ne porte que son
école, et l'état technique de la machine qui répond.

## D4 — Chaque rôle, chaque page, vraiment hors-ligne

**Conditions réelles.** L'application est **installée**, puis pilotée par
Playwright. Internet est coupé pour de bon :
- un proxy mort pour l'application et pour le moteur ;
- un cloud injoignable.
Chaque requête qui tente de sortir de l'ordinateur est relevée : **aucune**.

**Ce qui a été fait, hors-ligne et à l'écran :**
- installation du poste (20 s) ;
- un compte par rôle, soit 13 ;
- **pédagogie** : évaluation, 264 notes, moyennes, bulletins PDF, classement ;
- **finance** :
  - encaissement, avec reçu au numéro du poste et PDF ;
  - doublon annulé, remise, dépense, salaires ;
  - encaissement d'une classe entière ;
- **vie scolaire** : incident, absence d'un enseignant, séance et appel de
  263 élèves ;
- **le reste** :
  - bibliothèque, ticket informatique, message ;
  - événement, activité, fournitures ;
  - photo, emploi du temps PDF ;
  - changement de mot de passe.

**Balayage.** 371 pages ouvertes pour les 13 rôles, fiches comprises, avec une
capture pour chacune. Les signalements restants sont soit corrigés (voir
plus bas), soit des défauts déjà présents en ligne, listés à la fin.

**Retour en ligne.** 4 787 changements envoyés en 97 s. Toutes les
vérifications au cloud sont justes (16/16) :
- comptes créés hors-ligne utilisables en ligne ;
- élève, notes, reçus avec le même code de vérification, photo, emploi du
  temps.

**Défauts trouvés et corrigés pendant D4 :**
- **Reçus en erreur (500) depuis `main` du 18/11** : une fonction définie
  deux fois dans `finance.py`.
  - Corrigé sur la branche (`5036ea6`), avec un test qui refuse désormais
    toute définition en double.
  - Une branche locale `correctif-recus-main` est prête pour `main`. Elle
    attend la fusion de la phase D (ton choix du 21/11).
- **Emplois du temps PDF.** Ils étaient rangés dans le dossier du programme,
  remplacé à chaque mise à jour, et ne suivaient pas la synchronisation
  (`103aff1`).
- **Une erreur de mot de passe bloquait tout le poste.** Les tentatives
  étaient comptées par adresse, et tout le monde y est en `127.0.0.1`. Elles
  sont désormais comptées par adresse ET par compte (`99a910a`). Voir aussi
  « Production ».
- **« À vérifier » tournait sans fin hors-ligne.**
  - Le poste attendait le cloud jusqu'à 30 s, puis l'interface réessayait sa
    réponse quatre fois.
  - Désormais : réponse en moins de 5 s, marquée « hors-ligne », non
    réessayée, et un message clair.
- **Onglet « Communication » des Paramètres.** Il menait à une page
  inexistante (404, en ligne aussi).

## D5 — Plusieurs postes et le web en même temps

**« Une journée ».** Deux postes coupés du réseau, le web en ligne, puis les
retours en ligne dans un ordre quelconque. **12 vérifications sur 12.**
- 3 inscriptions simultanées dans la même classe : 3 matricules distincts
  (`-P9-`, `-P11-`, celui du web).
- 3 encaissements sur la même facture : 3 reçus distincts, reste juste.
- Même élève modifié des deux côtés, sur deux champs différents : les deux
  modifications sont gardées.
- Événement supprimé d'un côté et modifié de l'autre : il ne revient pas, et
  la modification est gardée de côté avec sa raison.
- Notes de la même épreuve saisies sur les deux postes : **seules les 5 notes
  communes** vont à la direction, avec la raison « (Valeur) ».
- Chaque poste est identique au cloud : **73 tables sur 73, 31 291 lignes**.

**Défaut majeur trouvé et corrigé (`ed2c08f`) : les faux conflits.** Lors du
premier essai, 15 des 20 points « À vérifier » ne portaient que sur la date
« modifié le ».
- **Effet.** Toute note créée en ligne puis saisie sur un poste partait à la
  direction comme un conflit, même quand personne d'autre n'y avait touché.
  Avec une épreuve de 40 élèves, cela fait 40 décisions inutiles.
- **Même cause, autre effet.** La suppression hors-ligne d'une note (ou d'un
  paiement, d'une écriture, d'un compte) était refusée : « modifiée sur le
  serveur entre-temps ».
- **Cause 1 : le format des dates.** L'état d'avant gardait les dates au
  format brut de SQLite (« 2026-11-22 03:17:56 »). Le cloud les écrit avec un
  « T » : il croyait donc que chaque date avait changé chez lui.
- **Cause 2 : les colonnes « modifié le ».** Elles changent à chaque écriture,
  des deux côtés. Elles ne sont plus une raison de conflit, et une fusion
  garde la plus récente des deux.
- **Tests de non-régression.** 4 nouveaux tests ; ils échouent tous sur
  l'ancien code.

**Hors-ligne longue durée.** Le poste B s'absente pendant que le web
continue.

Ce que B a fait hors-ligne, soit **10 292 changements en attente**, sans
aucun refus :
- les notes de 20 épreuves créées en ligne : 5 272 notes ;
- 2 000 fiches d'élèves modifiées ;
- 500 encaissements, sur 500 factures.

Ce que le web a fait pendant ce temps :
- l'adresse de 300 de ces élèves ;
- 20 de ces notes.

Résultats :
- **Retour de B : 10 292 changements en 457 s**, soit 22 par seconde.
  Rien n'est mis de côté.
- **À vérifier : exactement les 20 notes changées des deux côtés**, pour leur
  valeur seulement. Les 5 272 notes sont justes au cloud.
- Les 300 fiches gardent le téléphone du poste **et** l'adresse du web.
- 500 reçus, tous distincts. Aucun numéro de reçu en double dans toute la
  base. Pour chacune des 500 factures : payé = somme des versements, et reste
  = net − payé.
- **Le poste A, absent tout ce temps, rattrape tout en 63 s.**
- Les deux postes sont identiques au cloud : **73 tables sur 73, 38 583
  lignes**.

**Vitesse d'un poste.** Les durées de saisie de l'essai (0,6 s par fiche)
venaient de l'outil d'essai : il ouvrait une connexion par requête, ce qui
coûte environ 650 ms sous Windows. Mesurées proprement, sur le poste
hors-ligne :
- une fiche se lit en 10 ms et se modifie en 13 ms ;
- une liste de 50 élèves s'affiche en 53 ms.

Le cloud local fait 20, 30 et 40 ms : le poste est au moins aussi rapide.

**Durée de synchronisation en production.** Elle sera plus longue qu'ici, car
chaque ligne demande quelques allers-retours avec la base (Supabase, au lieu
d'une base locale). Sans gêne : la synchronisation tourne en arrière-plan, et
le poste reste utilisable pendant ce temps.

## D6 — Préparer la production

- **Démarrage à 4 processus** (`a95827d`, 01/11). Avant le correctif, 15 poses
  du journal sur 20 échouaient (interblocage). Après : 0 échec sur 20, et 4
  processus sur 4 démarrent proprement.
- **Durée de la migration BIGINT**, mesurée sur une copie fraîche de la base
  de développement (5 000 élèves, 20 Mo) :
  - 232 colonnes élargies en à peine plus d'une seconde ;
  - premier démarrage à 4 processus en 5 s, journal posé sur les 73 tables
    (146 déclencheurs), sans erreur.
  - La copie a été supprimée ensuite. `mydb` n'a pas été touchée.
- **Version web sans régression.** Le même balayage a été fait en ligne :
  le site est construit comme en production, branché sur le cloud de test,
  et parcouru dans Chrome.
  - Avant correctifs : 361 pages sur 371 avec exactement les mêmes
    signalements qu'hors-ligne. Ces défauts venaient donc de la version web
    elle-même ; ils sont corrigés, voir plus bas.
  - Après correctifs : aucune erreur, hormis les deux décisions en attente.
- **Mode d'emploi de mise en production** :
  `.ai/MISE_EN_PRODUCTION_HORS_LIGNE.md`.

## Production — à savoir

- **Limite de connexion commune à toute la plateforme.**
  - En production, uvicorn ne fait pas confiance à Caddy pour l'adresse du
    visiteur, et Caddy ne transmet que celle de Cloudflare.
  - Toutes les connexions semblaient donc venir de la même adresse. La limite
    de 5 tentatives par minute, partagée par Redis entre les 4 processus,
    valait pour tout le monde à la fois.
  - La fusion règle le blocage (compteur par compte). Le réglage d'adresse
    est proposé à Sams dans le mode d'emploi.
- **Reçus en erreur sur `main`** depuis le 18/11 : correctif prêt (branche
  locale `correctif-recus-main`). Il attend ton accord.

## Tests automatiques

- **Backend, suite complète du 22/11** : 1 237 réussis, 11 échecs.
  - 10 échecs sont ceux venus de `main`, présents avant ce travail et
    inchangés (voir plus bas).
  - Le onzième était un de mes nouveaux tests : il prenait un numéro de
    téléphone déjà utilisé par un autre test de la suite. Il est corrigé et
    passe avec ses voisins.
- **Frontend** : `tsc` sans erreur ; vitest 186 sur 186.
- **Nouveaux tests** :
  - faux conflits : 4 tests, qui échouent tous sur l'ancien code ;
  - relais « À vérifier » : 6 tests ;
  - limite de connexion par compte : 2 tests ;
  - « Mon compte » : 2 tests ;
  - liste des séances (même résultat, 3 requêtes) : 1 test ;
  - reprise automatique de l'interface : 1 test.

## Défauts déjà présents en ligne, corrigés à ta demande (22/11)

Le balayage des 371 pages, fait en ligne (Chrome) et hors-ligne
(application installée), donne les **mêmes signalements des deux côtés** :
361 pages identiques sur 371. Ces défauts existaient donc dans la version web.
Tu as demandé une application sans erreur ni lenteur : ils sont corrigés à la
racine (`5c5b306`, `7f1d96a`, `7d774bf`).

- **L'année n° 1.** Au démarrage, l'application interrogeait l'année n° 1,
  celle d'une autre école, avant de connaître la vraie.
  - Effets : 404 sur l'accueil, les activités et les résultats annuels ;
    ailleurs, listes vides puis second appel.
  - Correctif : un rechargement repart de la dernière année connue, et les
    écrans attendent la vraie année.
- **Écrans vidés par un refus.** Une page appelait une donnée interdite au
  rôle, et ce refus faisait échouer tout son chargement.
  - **Activités** (directeur de niveau) : même les activités saisies à la
    main n'apparaissaient pas.
  - **Portail opérateur** : « Accès refusé », avec 0 dossier, 0 classe et
    0 enseignant.
  - **Nouvel élève** (directeur de niveau) : la liste des classes était
    vide, donc **aucune inscription possible**.
  - Correctif : chaque page ne demande que ce que le rôle peut lire
    (mêmes règles que le serveur), et un refus isolé ne vide plus l'écran.
- **Mon compte.** Le directeur de niveau ne pouvait ni lire ni corriger sa
  fiche, **ni changer son mot de passe**. Les autres membres du personnel ne
  pouvaient pas non plus corriger leur fiche.
  - Correctif : un espace « Mon compte » pour chacun, limité à son propre
    compte.
  - La gestion du personnel reste fermée au directeur de niveau.
- **Frais, tarifs, rémunération, PIN comptable.** Ils ne sont plus demandés
  ni affichés aux rôles sans la finance. Le directeur de niveau voyait par
  exemple « Aucun type de frais configuré », ce qui était faux.
- **Aperçu des cartes.** Il interrogeait un élève d'exemple qui n'existe pas
  (404).
- **Ancienne page enseignant.** Son propre refus renvoyait l'enseignant au
  portail, après une série de requêtes coupées. Elle y mène désormais
  directement.
- **Sur le poste.**
  - « À vérifier » sans internet : un message d'information, plus une
    erreur.
  - Le voyant du menu disait « En ligne » alors que le poste était coupé du
    cloud.

**Lenteurs corrigées (`ef623a0`)**, mesurées page par page :
- **Séances : de 11-12 s à 1,2 s.** La liste faisait 4 requêtes par séance,
  jusqu'à 500 séances, et passait 9,1 s au serveur.
- **Salle des profs : de 7,6-8 s à 1,2 s.**
  - Le serveur faisait plus d'un millier de requêtes.
  - Les deux routes passent de 2,51 s à 0,04 s et de 0,65 s à 0,03 s.
  - Les réponses sont identiques, vérifiées sur les données de la copie de
    test.
- **Chaque page se chargeait deux fois à son ouverture** : elle était
  démontée, puis remontée dans la mise en page avec menu. Elle ne se charge
  plus qu'une fois, soit **deux fois moins de requêtes sur toutes les pages**
  (Salle des profs : 22 appels → 10).
- **Poste hors-ligne** : « À vérifier » répond tout de suite quand le poste se
  sait déjà coupé.

Ces durées comprennent la vérification d'un réseau au repos, mais pas l'écran
de démarrage de 3 s qui s'affiche à chaque chargement complet.

**Résultat final des balayages** (371 pages, 13 rôles, après correctifs) :
- en ligne comme hors-ligne : **0 page lente** et **aucune requête sortie
  de l'ordinateur** ;
- il ne reste que :
  - des redirections voulues (`/comptabilite/general`,
    `/selection-etablissement`, l'ancienne page enseignant) ;
  - les deux points ci-dessous, qui attendent ta décision.

**Deux décisions te reviennent**, car elles changent des droits d'accès :
1. **Fiche d'une famille, pour le directeur de niveau.**
   - Il a la page Familles, mais le serveur lui refuse la fiche d'un parent,
     qui reste donc vide.
   - Cette fiche ne contient aucune donnée financière : identité,
     coordonnées, enfants et leurs classes.
   - Choix : lui ouvrir la **lecture** de la fiche, sans rien d'autre du
     portail parent (qui contient les paiements), ou lui retirer le lien.
2. **Communication, pour le comptable.**
   - Son onglet est une copie de celui de la direction, dont toutes les
     données lui sont refusées : l'écran est vide.
   - Choix : retirer l'onglet au comptable, ou lui ouvrir la messagerie de
     la direction.

## Tests en échec venus de `main` (non corrigés)

- **10 tests en échec depuis la fusion de `main` (tests de Sams, août)**, sans
  rapport avec le hors-ligne :
  - **7 tests d'épreuves.** Leur année de test n'est pas « en cours » : quand
    un autre test laisse une année en cours pour la même école, ils sont
    bloqués (403). Seuls, ils passent.
  - **Un de ces 7 est périmé.** Il exige qu'on refuse de supprimer une épreuve
    centralisée, or le commit `97a68ca` de Sams (23/08) l'autorise exprès.
  - **3 tests de saisie par l'enseignant.** Leurs matricules (« ELV-2 »…)
    entrent en collision avec ceux laissés par d'autres tests.
## Limites connues

- Chiffrement des fichiers du poste (photos, PDF) : hors de cette phase.
- Installeur non signé : Windows affiche un avertissement au premier
  lancement.

## Suite

D7, chaque étape avec ton accord :
1. fusion `IYA-hors-ligne` → `IYA` → `main` ;
2. mise en production en suivant le mode d'emploi ;
3. publication de l'installeur ;
4. la vitrine en dernier.
