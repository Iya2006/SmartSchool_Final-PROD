# Session du 27-29/10/2026 — Offline-first, Phase B : étapes B1 à B5

Commits sur `IYA-hors-ligne` :
- `301b1ae` : B1 et B2 ;
- commit suivant : B3 à B5, l'indicateur du poste et l'écran « Synchronisation ».

Les étapes B3 à B5 sont décrites en fin de document.

## Contexte

La Phase A permet à un ordinateur de fonctionner seul. La Phase B fait
converger plusieurs postes et le cloud. Son plan a été approuvé : voir
`C:\Users\hp\.claude\plans\mighty-wiggling-moth.md`.

Cette session couvre les fondations, à poser avant tout échange :
- **B1** : deux postes hors-ligne ne créent jamais le même identifiant ;
- **B2** : leurs pièces (reçus, factures, matricules) ne portent jamais le même
  numéro, et un reçu imprimé hors-ligne se vérifie sur le cloud.

L'échange lui-même vient ensuite : journal des changements (B3), envoi et
réception (B4), conflits (B5).

Branche : `IYA-hors-ligne`.

## B1 — Identifiants qui ne peuvent jamais entrer en collision

### Le constat
Les identifiants des 76 tables sont des compteurs **globaux à toutes les
écoles**. Deux postes hors-ligne créeraient chacun un « élève 7826 ».

Le QR d'un reçu couvre `paiement_id` (`core/recu_paiement.py`). Renuméroter
une ligne à la synchronisation rendrait donc faux un reçu déjà remis au
parent : un identifiant ne doit **jamais** changer.

### La règle
Chaque poste reçoit, à son enregistrement, un numéro N. Il crée ses lignes à
partir de **N × 2³²**, ce qui lui laisse quatre milliards d'identifiants par
table. Il n'a jamais besoin d'internet pour en obtenir.

Le cloud est l'appareil 0 : ses identifiants actuels ne changent pas, et ses
séquences restent sous 2³¹.

### Ce qui a été fait
- **`models/academique.py`** : nouveau type `Identifiant`, entier sur 64 bits,
  appliqué aux **232 colonnes** qui contiennent un identifiant :
  - 76 clés primaires ;
  - 146 clés étrangères ;
  - 10 références sans clé étrangère (`ss_messages.destinataire_id`,
    `ss_photos_en_attente.entity_id`…).

  Un test échoue si une nouvelle colonne d'identifiant est déclarée en
  32 bits.
- **Migration `migrations/2026_10_sync_01_identifiants_bigint.py`** :
  - la liste des colonnes vient des modèles ;
  - simulation par défaut, `--appliquer` pour exécuter ;
  - une seule transaction ;
  - idempotente.

  Elle **ne s'exécute pas au démarrage**. Tant qu'elle n'est pas passée, le
  cloud refuse d'enregistrer un poste, avec un message clair
  (`app/sync/schema.py`).
- **`ss_appareils`** et **`POST /api/poste/appareils`**, réservés à la
  direction. Un poste y reçoit :
  - son numéro ;
  - son rang dans l'école (P1, P2…) ;
  - un jeton de synchronisation, dont seule l'empreinte est conservée ;
  - la clé de ses reçus.

  La table ne quitte jamais le cloud : elle figure dans `TABLES_HORS_SYNCHRO`
  de `sync/perimetre.py`.
- **Installation** (`sync/installation.py`) :
  - le poste s'enregistre avant le téléchargement ;
  - son identité est gardée dans `appareil.json`, si bien qu'une installation
    reprise après coupure garde le même numéro ;
  - un poste préparé pour une école **refuse d'en accueillir une autre** ;
  - une installation Phase A, sans numéro, est à refaire.
- **`sync/identifiants.py`** :
  - un générateur par base, branché sur chaque clé primaire ;
  - un déclencheur SQLite refuse tout identifiant hors plage : un oubli échoue
    bruyamment au lieu de corrompre en silence ;
  - un drapeau laisse passer les lignes reçues du cloud.
- **`api/photos.py`** : les 2 `INSERT` en SQL brut passent par l'ORM.

### Deux pièges trouvés par prototype, avant d'écrire le code
1. **Le cache d'insertion de l'ORM.** Une fois qu'une table a reçu une
   insertion, l'ORM ignore toute valeur par défaut ajoutée ensuite : la ligne
   prenait l'auto-incrément local. Le générateur est donc branché **au
   démarrage du moteur, avant toute écriture**. Le numéro du poste n'arrive
   qu'à la fin de l'installation : jusque-là, toute création est refusée.
2. **L'auto-incrément ne peut pas servir de repli.** L'ORM perd alors
   l'identifiant des lignes insérées par lot (« NULL identity key »). Chaque
   base qui écrit a donc **son propre générateur** :
   - les postes, avec leur numéro ;
   - le cloud des tests, comme appareil 0.

   Toute la suite de tests passe désormais par ce mécanisme.

## B2 — Pièces propres à chaque poste, reçus vérifiables

- **Numérotation** (`core/numerotation.py`, `core/matricules.py`). Sur un
  poste, le numéro porte son rang : `SMART-1-2026-P2-00001` pour un reçu,
  `FAC-1-2026-P2-…` pour une facture, `ELV-CODE-P2-…` pour un matricule. Le
  compteur, propre au poste (clé `REC42@P2`), reste dans
  `ss_sequences_matricule`. Le suffixe s'ajoute **après** la troncature de la
  clé à 20 caractères, pour que deux postes ne partagent jamais un compteur.
  Le format du cloud ne change pas.
- **Codes d'exemplaire de la bibliothèque** : même segment. Ce code est
  unique sur toute la plateforme et compté par ouvrage.
- **Reçus, côté clé** :
  - clé d'un poste = `HMAC(clé du cloud, "appareil|N")`, transmise une seule
    fois à son enregistrement ;
  - le cloud la recalcule à partir de l'identifiant du paiement
    (`paiement_id >> 32`), sans stocker aucun secret en base ;
  - un poste ne connaît jamais la clé du cloud.
- **Reçus, côté code** :
  - nouvelle colonne `ss_paiements.code_verification`, ajoutée automatiquement
    au démarrage du cloud ;
  - le code est figé à l'encaissement ;
  - un poste qui réimprime le reçu d'un autre appareil relit ce code ;
  - l'installation joint le code des reçus plus anciens, qui ont une colonne
    vide.
- **Bug corrigé, QR des reçus d'un poste.** Sur un poste, le QR pointait vers
  `http://127.0.0.1:47831`, injoignable pour le parent qui le scanne. Il
  pointe désormais vers le site public, dans `base_url_publique` et dans
  `desktop/main.js` avec `FRONTEND_PUBLIC_URL`.
- **Autres générateurs audités** :
  - les références comptables dérivent des numéros de pièces ou des
    identifiants, elles héritent donc de leur unicité ;
  - les identifiants de connexion générés (`personnel.generer_nom_utilisateur`)
    seront traités en B5, comme conflit d'unicité. Un poste ne voit pas les
    comptes des autres écoles.

## Vérifié réellement

**Tests automatiques** :
- Suite backend complète : **1093 tests au vert**. Les 10 échecs sont les mêmes
  qu'avant, dans le module évaluations. Toute la suite passe désormais par le
  générateur d'identifiants : le cloud de test y est l'appareil 0.
- 41 tests de synchronisation, passés trois fois de suite.
- Ils couvrent :
  - deux postes sans collision par l'ORM, `insert()` et l'insertion par lot ;
  - les lignes reçues, qui gardent leur identifiant ;
  - le garde anti-SQL brut et le drapeau ;
  - le refus de création avant le numéro ;
  - la reprise des compteurs ;
  - l'enregistrement, les rangs par école et le refus hors direction ;
  - la reprise d'installation sans second numéro ;
  - le refus d'une autre école ;
  - la numérotation P1/P2 ;
  - un reçu de poste vérifié par la route publique du cloud, et refusé si son
    montant est retouché ;
  - la réimpression sur un autre poste ;
  - le code joint aux anciens reçus ;
  - le QR vers le site public.

**Migration**, sur une **copie** de la base de développement (base jetable
`smartschool_essai_sync`) :
- 232 colonnes élargies en 2 s ;
- relancée, elle n'a plus rien à faire ;
- données identiques ;
- mêmes clés étrangères (146) et contraintes d'unicité (61) ;
- séquences restées en `integer`.

Preuve du besoin : la base non migrée refuse un identifiant de poste
(`integer out of range`), la copie migrée l'accepte. **La base de
développement `mydb` n'a pas été touchée.**

**Scénario réel en processus séparés** : un cloud sur la copie migrée et deux
moteurs poste, comme deux ordinateurs.
1. Chaque poste s'installe en 6 s (26 355 lignes) et reçoit son numéro (1 et
   2) et son rang (P1 et P2).
2. Un encaissement est fait sur la **même facture** depuis les deux postes.
   - Reçus : `SMART-1-2026-P1-00001` et `SMART-1-2026-P2-00001`.
   - Identifiants du paiement, de l'écriture et des lignes comptables : chacun
     dans la plage de son poste.
   - QR vers `https://trxsmartschool.com/verifier-recu?...`.
3. Le cloud recalcule, avec sa propre clé, **exactement** les trois codes
   imprimés par les postes.
4. Après redémarrage, le poste 1 continue avec `P1-00002` et l'identifiant
   suivant.
5. Un `INSERT` SQL brut sur le poste 2 est refusé : « identifiant hors de la
   plage de ce poste ».

## Problèmes trouvés en passant

- **Test instable dans la suite d'installation, corrigé.** Un test lançait une
  seconde installation en arrière-plan et se terminait sans l'attendre. Ce fil
  écrivait ensuite dans la base de test pendant le test suivant, qui échouait
  une fois sur deux. Les deux tests concernés attendent désormais la fin de
  leur installation.
- **Index unique invalide dans la base de développement, non corrigé, à
  signaler.** `uq_parents_etab_email` (un e-mail de parent par école) existe
  mais est marqué invalide : `indisvalid = false`, construction interrompue
  lors d'une ancienne migration. Il n'impose donc rien. Aucun doublon n'existe
  aujourd'hui. Il faudra vérifier si la production est dans le même état.

## Production

**Rien n'a été exécuté en production.** À la fusion (phase D), il faudra
lancer `migrations/2026_10_sync_01_identifiants_bigint.py --appliquer` hors
des heures de saisie : les tables sont verrouillées pendant l'opération,
environ 2 s pour 26 000 lignes. D'ici là, le cloud refuse simplement
d'enregistrer des postes.

## Suite

- **B3** : journal des changements, par déclencheurs, sur le poste (SQLite) et
  sur le cloud (PostgreSQL).
- **B4** : envoi et réception.
- **B5** : conflits et totaux recalculés.
- **B6** : fichiers, indicateur d'état, supervision.

Le scénario réel ci-dessus sera rejoué jusqu'à la convergence complète :
paiements des deux postes sur le cloud, totaux de la facture justes.

---

# B3 à B5 — les échanges entre les postes et le cloud

## B3 — Journal des changements, tenu par la base

**Principe** (`app/sync/journal.py`) :
- Des déclencheurs posés sur chaque table notent chaque écriture, SQL brut
  compris (les suppressions de `services/suppression.py`).
- Ils sont générés depuis les modèles, pour SQLite et PostgreSQL.

**Sur le poste** : `ss_sync_journal_local` note ce qui reste à envoyer.
- Le journal se tait pendant l'application de ce qui vient du cloud.
- Pour chaque modification, il garde l'état d'avant (base de la fusion à
  trois, en B5) et l'heure.

**Sur le cloud** : `ss_sync_journal` note la ligne, l'opération, l'appareil
d'origine et l'école.
- **L'école** est trouvée directement, ou en remontant les clés étrangères
  (une note → son évaluation → sa classe). Le déclencheur la lit **avant** une
  suppression.
- **Lignes partagées entre écoles** : parent dont les enfants sont dans deux
  écoles, plan comptable commun, photo en attente. L'école est résolue à la
  lecture par les règles du périmètre.
- **Lier un parent existant à un élève** journalise aussi le parent, **avant**
  le lien.

**Contrôles d'installation** : avant de poser les déclencheurs, l'installeur
vérifie le calcul de l'école, la clé et les colonnes liées de chaque table.
PostgreSQL ne vérifie le corps d'une fonction qu'à sa première exécution :
sans ce contrôle, une colonne mal nommée ferait échouer l'écriture d'un
utilisateur.

**Bug trouvé sur la copie PostgreSQL : un déclencheur sans sa table.** Le
journal du cloud n'existait pas encore, mais le déclencheur, si. Toutes les
écritures d'élèves échouaient. L'installeur crée désormais la table avant de
poser le moindre déclencheur.

**Publication** : les postes lisent un numéro de **publication**, pas le
numéro d'écriture.
- Un numéro d'écriture n'est visible qu'à la validation de sa transaction : une
  transaction lente pouvait valider le n° 99 après que le n° 100 avait déjà été
  lu, et le poste l'aurait perdu pour toujours.
- La publication numérote, sous un verrou, seulement ce qui est déjà validé.

**Mise en service sur le cloud** : le journal n'y est posé que **si la
migration des identifiants est passée**. Avant, rien ne change en production.

## B4 — Envoi et réception

- **Cloud** :
  - routes `/api/sync/appareil/envoi` et `/reception`, authentifiées par le
    jeton du poste ; un poste retiré est refusé ;
  - logique dans `app/sync/cote_cloud.py`.
- **Poste** : `app/sync/cote_poste.py`, et `app/sync/service.py`, un fil
  d'arrière-plan :
  - toutes les 30 s quand le cloud répond ;
  - tentatives espacées jusqu'à 5 min hors-ligne ;
  - un clic sur l'indicateur lance un échange.
- **Envoi de l'état complet de chaque ligne**, jamais d'incrément : renvoyer
  un lot après une coupure n'a aucun effet de plus.
- **Contrôle d'école** : le cloud vérifie l'école de chaque ligne **avant et
  après** le changement. Un poste ne peut ni toucher une ligne d'une autre
  école, ni y faire passer une des siennes.
- **Rien n'est écarté en silence.** Ce que le cloud refuse (doublon, ligne
  supprimée ailleurs, autre école) est gardé dans `ss_sync_conflits` avec la
  version du poste et la raison en clair.
- **Bug de conception trouvé par les tests : une ligne qui bloquait tout.**
  Un compte refusé par le cloud (doublon d'identifiant) restait sur le poste.
  Le compte du cloud qui arrivait ensuite ne pouvait pas s'enregistrer : la
  page entière était annulée, à chaque fois, et la synchronisation restait
  bloquée pour toujours. Corrigé :
  - chaque ligne reçue s'applique seule ;
  - celle qui ne peut pas l'être est mise de côté avec sa raison et retentée
    après chaque page ;
  - si une ligne en désigne une mise de côté, la page est rejouée avec une
    vérification ligne par ligne.

## B5 — Conflits, doublons naturels et totaux

**Fusion à trois.** Le cloud n'applique que les champs que le poste a
réellement modifiés, en comparant avec l'état d'avant.
- Un secrétaire hors-ligne change le téléphone d'un élève, l'administration
  en ligne change son adresse : **les deux sont gardés**.
- Avec une simple règle « la dernière version l'emporte », l'une des deux
  modifications aurait été perdue.

**Même champ modifié des deux côtés** :
- **Donnée simple** : la modification la plus récente gagne, et c'est
  consigné.
- **Donnée sensible** (paiements, factures, échéances, dépenses, écritures
  comptables, paie, notes, inscriptions, comptes) : la version du serveur est
  gardée, et la direction tranche.

**Totaux recalculés depuis leur source, jamais fusionnés** :
- montant payé et statut d'une facture, d'une échéance ;
- exemplaires disponibles ;
- effectif d'une classe ;
- comptes d'une séance.

Les règles sont celles déjà appliquées par les modules. Elles ont été
**vérifiées sur les données réelles** avant d'être reprises : 526 factures,
1 052 échéances et 20 classes, sans un seul écart.

**Lignes à clé naturelle** (trouvé par un test).
- **Le cas.** Deux postes encaissent hors-ligne la toute première fois dans
  une école neuve. Chacun crée les journaux comptables « AC », « VE »… sous
  son propre identifiant : doublons, et écritures orphelines.
- **Lignes concernées.** C'est le cas de toutes les lignes que le code
  « cherche ou crée » :
  - journaux, comptes, exercices et paramètres comptables ;
  - paramètres de l'école ;
  - types de frais et tarifs ;
  - séances du jour, présences, notes ;
  - périodes d'épreuves, bulletins ;
  - résultats d'examen, messages masqués.
- **La solution.** Leur identifiant est **dérivé de leur clé naturelle**, le
  même sur tous les appareils, cloud compris. Deux créations de la même
  séance se rejoignent en une seule ligne.
  - En cas de collision d'empreinte, rarissime, le compteur ordinaire prend
    le relais.
  - Les types d'évaluation en sont exclus volontairement : le code prend le
    plus petit identifiant comme type par défaut (`portail_enseignant.py`),
    l'ordre de création compte.

**Écran « Synchronisation »** (`/synchronisation`, direction seulement).
- Il liste les postes de l'école, avec leur dernière synchronisation et une
  alerte au-delà de 7 jours.
- Il montre ce qui est « à vérifier », les deux versions côte à côte, champ
  par champ.
- Deux choix :
  - **garder la version du serveur** : le poste s'y aligne seul ;
  - **garder la version du poste** : refusé tant que le doublon existe.
- Sur un poste, l'écran est le même ; les décisions passent par le cloud.

**Indicateur du poste** (`IndicateurPoste`) :
- synchronisé à telle heure, en cours, hors ligne depuis…, N changements en
  attente, N à vérifier ;
- un clic synchronise ;
- au-delà de 7 jours sans synchronisation, il rappelle que le cloud est la
  sauvegarde.

## Vérifié réellement (B3 à B5)

**Tests automatiques.** Backend : **1116 tests au vert** sur la version avec
clés naturelles. Les 10 échecs sont les mêmes qu'avant, dans le module
évaluations. Toute la suite écrit désormais à travers les déclencheurs du
journal et le générateur d'identifiants. Tests de synchronisation :
- **B3, journal** :
  - école retrouvée à deux niveaux ;
  - suppression en SQL brut ;
  - parent partagé ;
  - appareil d'origine ;
  - silence pendant l'application de ce qui vient du cloud ;
  - compteurs restés locaux.
- **B4, échanges** :
  - aller-retour poste ↔ cloud ↔ autre poste, sans écho ;
  - lot rejoué sans effet de plus ;
  - trois tentatives d'intrusion dans une autre école, toutes refusées ;
  - doublon mis de côté sans bloquer la suite ;
  - modification d'une ligne supprimée ailleurs ;
  - poste retiré ;
  - **vrai encaissement par la route** sur un poste, puis reçu vérifié sur le
    cloud.
- **B5, conflits** :
  - deux encaissements hors-ligne sur la même facture : total juste partout ;
  - fusion de deux champs différents ;
  - champ simple : la plus récente gagne, dans les deux sens ;
  - champ sensible : la direction tranche ;
  - suppression refusée ;
  - effectifs de deux classes ;
  - les deux choix de la direction, par les vraies routes.

**PostgreSQL**, sur la copie jetable :
- le test du journal passe ;
- les déclencheurs de **53 tables** ont été réellement exécutés (modification
  et suppression, transactions annulées), avec **0 erreur**. Les 20 tables
  vides de la copie ont été contrôlées par l'installeur.

**Frontend** : `tsc` propre, **164/164** tests, dont l'indicateur et la
comparaison des versions.

**Scénario réel de bout en bout** : un cloud sur la copie migrée et deux
moteurs poste en processus séparés.
1. Les deux postes s'installent.
2. Ils redémarrent **sans internet**. Sur la même facture, chacun encaisse
   100 000 hors-ligne : reçus `SMART-1-2026-P1-00001` et `…-P2-00001`.
   Chacun modifie un champ différent du même élève. Les deux affichent « Hors
   ligne, 7 changements en attente ».
3. Ils redémarrent **avec internet**. Le service les synchronise seul, en
   25 s environ, redémarrages compris.
4. Résultat :
   - **cloud** : les deux paiements ; la facture à **200 000** payés,
     « partiellement payée » ; l'élève avec **l'adresse du poste 1 et le
     téléphone du poste 2** ; 0 conflit ;
   - **chaque poste** : exactement le même état ; indicateur « Synchronisé,
     0 en attente ».

## Problèmes trouvés en passant

- **Le plan comptable est commun, par décision produit**
  (`init_comptabilite_globals`). Une ancienne migration (`compta_03`) a pourtant
  ajouté en base une colonne `etablissement_id` aux journaux et aux comptes ;
  le code ne la remplit jamais. Ce n'est pas un bug de cette session, mais la
  base et les modèles ne disent pas la même chose : à clarifier un jour.
- **Plusieurs contraintes d'unicité n'existent qu'en base, posées par des
  migrations, et pas dans les modèles** : présences par séance, bulletins,
  tarifs, types de frais par école. Une base créée depuis les modèles (tests,
  poste) ne les a pas. Les clés naturelles couvrent ces cas pour la
  synchronisation.
- **Test frontend instable, corrigé** : `queryProviderEncryption`. Il cherchait
  « O+ » dans un texte chiffré en base64, alphabet où « O » et « + » existent :
  il échouait environ une fois sur trois, sans aucune fuite de données. Il
  vérifie désormais le fragment JSON entier.
- **Durée de la suite backend : mesurée, pas de ralentissement.** Certaines
  suites complètes ont pris 24 à 26 min au lieu de 11. Mesures faites, sans
  rien d'autre en parallèle, sur la même première moitié de la suite (54
  fichiers) :
  - version B1/B2 (sans journal ni clés naturelles) : **452 s** ;
  - version actuelle : **435 s** ;
  - version actuelle sans clés naturelles : **439 s**.

  Les longues durées venaient du travail lancé en même temps (scénario réel,
  tests frontend) et des nouveaux tests, plus lourds, qui installent de vrais
  postes. Une insertion coûte 0,2 ms, journal et clés naturelles compris.

## B6 — Les fichiers suivent les données

**Principe** (`app/sync/fichiers.py`) : photos, logos, cachet, pièces jointes
et justificatifs cités par les lignes synchronisées (`/uploads/...`) suivent
ces lignes.
- **Envoi** : après chaque lot, le poste demande au cloud les fichiers qui lui
  manquent, et n'envoie que ceux-là.
- **Réception** : après chaque page reçue, le poste télécharge les fichiers
  qu'il n'a pas.
- **Jamais d'écrasement** : un poste complète les fichiers du cloud, il n'en
  remplace aucun, ni la photo d'une autre école, ni un logo.
- **Chemins piégés** (`../`) refusés.

**Tests** :
- une photo prise hors-ligne arrive sur le cloud ;
- un logo changé en ligne arrive sur le poste ;
- le cloud n'écrase pas un fichier existant, refuse un chemin piégé et refuse
  un envoi sans jeton.

**Bug trouvé en vérifiant sous PostgreSQL : le repli en cas de collision ne
marchait pas.** Pour savoir si l'identifiant naturel était déjà pris par une
*autre* clé, le code comparait les identifiants. Or deux clés en collision
donnent justement le même identifiant : la collision passait pour un vrai
doublon, et l'insertion échouait. Il compare maintenant les clés.

**Vérifié sur la copie PostgreSQL** :
- une ligne à clé naturelle reçoit l'identifiant dérivé ;
- une table ordinaire garde la séquence du cloud ;
- une collision forcée prend la séquence ;
- un test de régression couvre le même cas sous SQLite.

## Vérification visuelle dans l'application installée (Electron)

**Préparation** : interface poste recompilée, puis cloud local sur la copie
PostgreSQL migrée.

**Parcours vérifié** (Playwright pilotant la vraie application) :
1. Installation par l'écran, puis connexion.
2. Barre du haut : **« Synchronisé à 16:32 »**.
3. Écran « Synchronisation » : « Rien à vérifier ».
4. Conflit réel sur la remise d'une facture, modifiée sur le poste et sur le
   serveur. Un clic sur l'indicateur synchronise :
   - le badge **« 1 à vérifier »** apparaît ;
   - l'écran montre **« Facture n° 123 · Poste P5 — IYA »**, la raison, et le
     tableau des deux valeurs : Serveur 34 900 / Poste 64 900.
5. **« Garder la version du poste »** : « La version du poste est
   enregistrée », « Rien à vérifier », et le badge disparaît.
6. Relance avec le cloud injoignable : **« Hors ligne depuis 16:33 »**. Sur
   l'écran, un message clair indique que ces décisions demandent internet.

**Deux défauts trouvés par cette vérification, corrigés** :
- **Conflit invisible depuis le poste.** Quand le serveur gardait sa version
  d'une donnée sensible, le changement du poste avait été appliqué (fusion), et
  non refusé. Le poste n'avait donc rien à signaler, alors que la direction
  avait une décision en attente. Le cloud renvoie désormais, à chaque
  synchronisation, le nombre de décisions en attente pour l'école. L'indicateur
  l'affiche, et un test le couvre.
- **Raison peu lisible.** Elle affichait le nom technique de la colonne
  (« montant_remise ») ; elle affiche désormais « Montant remise ».

Le premier passage avait aussi révélé des captures masquées par l'écran
d'accueil : le script attend désormais qu'il disparaisse.

## Reste à faire

- **Phase C** :
  - installeur, mises à jour, chiffrement de la base locale ;
  - révocation d'un poste depuis l'écran, et mise à niveau du schéma local
    (lecture d'`information_schema`).
- **Phase D** :
  - validation page par page, hors-ligne, pour tous les rôles ;
  - puis fusion vers `IYA` et `main`, avec ton accord.

## Production

Toujours rien d'exécuté en production. À la fusion :
1. lancer `2026_10_sync_01_identifiants_bigint.py --appliquer` ;
2. redémarrer le cloud, qui pose alors seul le journal et les identifiants
   naturels.
