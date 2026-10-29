# Session du 27-29/10/2026 — Offline-first, Phase B : étapes B1 et B2

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
