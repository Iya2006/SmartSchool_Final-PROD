# Session du 22 au 28/11/2026 — Tes deux décisions, et ce qu'elles ont mis au jour

Branche : `IYA-hors-ligne`. **Rien n'est en production, rien n'est publié.**
Rien n'a été poussé sur `IYA` ni sur `main`.

Commits :
- `b2fda07` : tes deux décisions et la relance des impayés ;
- `9b520d3` : la synchronisation et les textes trop longs ;
- `c8b9d06` : « Signaler mon enfant » ;
- `f1fec79` : l'identité et le thème de l'école, chargés une seule fois.

## Tes décisions (22/11)

### 1. La fiche d'une famille, pour le directeur de niveau

Ta consigne : « le directeur doit avoir tout ». Le serveur lui refusait la fiche
d'un parent (403) : elle restait vide, et « Modifier » échouait sans rien dire.

- Il **lit et corrige** la fiche d'un parent comme la direction, depuis la fiche
  et depuis la liste Familles :
  - identité ;
  - coordonnées ;
  - enfants et leurs classes ;
  - mot de passe du portail parent.
- Le reste du portail parent (factures, paiements, notes, messages du parent)
  reste à la direction : la caisse ne se délègue pas (règle de `main.py`).
- Vue par le personnel, la fiche ne montre que les enfants **de son école**,
  comme l'annuaire.
- Les rôles secondaires et les rôles personnalisés comptent : un « censeur »
  bâti sur le directeur de niveau a la fiche.
- Corriger une fiche :
  - nom, prénom et téléphone principal sont obligatoires ;
  - un téléphone ou un e-mail déjà utilisé dans l'école est refusé (409),
    car c'est avec lui que le parent se connecte ;
  - un champ vide veut dire « non renseigné » : une chaîne vide gardée telle
    quelle se heurtait à l'unicité des e-mails dès le deuxième parent sans
    e-mail ;
  - une erreur s'affiche dans la fenêtre, au lieu d'un échec silencieux.

### 2. Les messages aux familles, pour le comptable

Ta consigne : il doit écrire aux parents, relancer les paiements par exemple.
Son onglet était une copie de celui de la direction, dont toutes les données
lui étaient refusées, et il n'était dans aucun menu.

- **Nouvel écran « Messages aux familles »**, dans son menu Comptabilité,
  juste après Impayés.
- Il écrit à une famille, aux parents d'une classe ou à tous les parents. Le
  bouton nomme le destinataire (« Envoyer à tous les parents »).
- Les familles qui ont répondu remontent en tête, marquées « à lire ». Ouvrir
  une famille montre toute sa conversation et marque ses réponses comme lues.
- Ses messages partent au nom de l'administration, classés « Paiement ». Le
  parent les lit dans son portail et peut répondre ; la réponse arrive chez le
  comptable.
- **Il ne lit et n'écrit que des messages « Paiement »**, et c'est le serveur
  qui l'impose. Lui restent fermés :
  - les autres échanges de la direction avec les familles (discipline,
    bulletins…) ;
  - les demandes d'emploi du temps ;
  - la messagerie interne.
- Un comptable qui cumule une fonction de direction (rôle secondaire) garde
  tout.
- La conversation d'une famille reste complète même après une relance groupée
  de plusieurs centaines de messages : le serveur filtre par famille.

## La relance des impayés

C'est le bouton « Relancer » des écrans Impayés et Automatisations.

- **Le texte réglé par l'école n'était jamais utilisé.** Pire : l'enregistrer
  échouait toujours (erreur 500, `json` non importé). Aucune école n'a jamais pu
  enregistrer son texte de relance. Désormais :
  - le réglage s'enregistre, et la relance utilise ce texte ;
  - une variable inconnue (« {classe} ») reste écrite telle quelle ;
  - un modèle mal formé n'empêche pas l'envoi : le texte par défaut part.
- **Destinataire.** Le parent responsable financier, à défaut le contact
  principal, à défaut le premier rattaché, en préférant un compte actif. Avant,
  un parent pris sans ordre : il pouvait changer d'un envoi à l'autre, et entre
  le cloud et un poste.
- Montants et dates à la française : « 150 000 GNF », « 15/12/2026 ». Avant,
  « 150,000 » et « 2026-12-15 ».
- Les élèves sans parent rattaché sont signalés dans le message de
  confirmation, au lieu d'être passés sous silence.
- **Vitesse**, mesurée sur la copie de la base (512 factures non soldées,
  501 rappels) :

  | | Durée | Requêtes à la base |
  |---|---|---|
  | Avant | 6 s | 1 516 |
  | Après | 0,3 s | 6 |

  Les rappels sont les mêmes dans les deux cas. Sur la base distante de la
  production, l'écart est encore plus grand : chaque requête y coûte plus cher.
- L'interrupteur « Actif » des Automatisations concerne les rappels
  automatiques. L'envoi demandé à la main n'en dépend pas ; en pratique, il n'en
  dépendait pas non plus avant.

## Trouvés en chemin, corrigés

### Un texte trop long bloquait toute la synchronisation d'un poste

C'est le plus important.

- SQLite (le poste) accepte un texte plus long que sa colonne ; PostgreSQL (le
  cloud) le refuse.
- **Vérifié sur la copie PostgreSQL** : un seul texte trop long saisi
  hors-ligne faisait échouer **tout** l'envoi du poste. Le poste renvoyait le
  même lot à chaque cycle, et comme la réception passe après l'envoi, plus rien
  ne partait ni n'arrivait sur ce poste, jusqu'à une intervention technique.
- Corrigé à trois endroits (`app/core/valeurs_refusees.py`) :
  - **sur le poste**, la saisie trop longue est refusée tout de suite, en
    clair : « « Titre » est trop long : 200 caractères au plus (201 saisis) » ;
  - **sur le cloud**, une telle ligne reçue d'un poste est mise de côté dans
    « À vérifier » avec sa raison, et le reste du lot passe. Dans « À vérifier »,
    garder la version du poste est refusé en clair (plus d'erreur 500) ; garder
    celle du serveur aligne le poste ;
  - **sur le cloud**, la même saisie finissait en « Une erreur est survenue »
    (500) : elle reçoit un message qui dit quoi corriger (400).
- Vérifié sur la copie PostgreSQL :
  - avant, le lot entier échouait ;
  - après, le lot passe, la ligne trop longue est mise de côté avec sa raison ;
  - une saisie trop longue envoyée au cloud reçoit le message clair, et rien
    n'est modifié.
- Le pilote de la production (pg8000) signale ces erreurs comme une erreur de
  requête, et non comme une erreur de donnée : elles sont reconnues à leur code
  SQL (classe 22).
- **Longueurs du code et de la base.** Le poste applique les longueurs écrites
  dans le code. Comparées une à une à celles de la copie PostgreSQL (394
  colonnes), 9 différaient :
  - 4 étaient plus larges dans la base : lieu de naissance (150) et adresse
    (300) des enseignants et du personnel. Le poste aurait refusé ce que le
    cloud accepte : le code est aligné sur la base ;
  - 5 sont plus étroites dans la base : RIB (50), mode de paiement du salaire
    (30), type de contrat (30), pour les enseignants et le personnel. Laissées
    telles quelles : ces valeurs sont courtes en pratique (un IBAN fait au plus
    34 caractères), et un dépassement serait refusé proprement, sans rien
    bloquer.

### « Signaler mon enfant », dans le portail enseignant

L'envoi finissait toujours en erreur 500 : `Message` n'était pas importé. Trouvé
par une analyse statique de tout le serveur (pyflakes), qui ne signale plus
aucun nom indéfini.

### Les réglages de l'école partaient deux fois à chaque page

- À chaque chargement complet de page, l'identité et le thème de l'école
  partaient deux fois.
- Pour un compte d'une autre école que la n° 1, ceux de l'école n° 1 partaient
  d'abord : son nom pouvait s'afficher un instant.
- Désormais, une seule fois, pour l'école du compte. Pendant l'attente, les
  pages patientent, comme pour l'année.

### Anciens messages de familles supprimées

Ils affichaient « Administration → Parent ? ». Pire, la réponse d'un tel parent
s'affichait comme venant de « Administration ». Désormais « Parent introuvable ».
Sur la copie, ce sont les 56 rappels et 23 réponses d'avant la remise à zéro de
la base d'août.

### Messages d'erreur

Les écrans Familles, Impayés et Automatisations affichent le message du
serveur, au lieu d'un échec silencieux ou de « Erreur lors de l'envoi ».

## Vérifications

- **Tests automatiques** :
  - backend : 1 254 réussis et 12 ignorés. Seuls échouent les 10 tests connus
    venus de `main` (rapport du 22/11). La suite complète en comptait un 11e :
    le test du matricule, qui créait une école au code de 42 caractères,
    impossible sur PostgreSQL. Corrigé pendant le passage, puis relancé seul ;
    il réussit ;
  - 24 nouveaux tests backend : fiche famille 7, messages et relance 11,
    poste 1, « Signaler mon enfant » 1, textes trop longs 4 ;
  - frontend : `tsc` sans erreur, vitest 190 sur 190 (4 nouveaux).
- **À l'écran**, version web dans Chrome, sur la copie PostgreSQL :
  - **19 vérifications sur 19** pour tes deux décisions :
    - directeur de niveau : la fiche s'affiche avec les enfants, la
      modification est enregistrée, un nom vide est refusé en clair ;
    - comptable : l'entrée de menu, l'écran, l'envoi, la réception par le
      parent (classée « Paiement »), sa réponse, « à lire », la lecture ;
    - aucune requête refusée ou en échec, aucune requête hors de l'ordinateur ;
  - **5 sur 5** pour un compte de l'école n° 2 : plus aucune requête vers
    l'école n° 1, identité et thème une seule fois.
- **Sur un poste** : un poste installé (instantané de l'école, identifiants du
  poste) relance le même parent avec le même texte et montre la même
  conversation.
- **Bon à savoir** : la suite de tests tourne sur SQLite, pas sur PostgreSQL.
  Le comportement de PostgreSQL a donc été vérifié sur la copie de la base :
  parcours à l'écran, mesure de la relance, lot et saisie trop longs.

## Pour Sams, avant la mise en production

La copie de travail vient de la base de développement, pas de la production.
Une requête en lecture seule sur la production dira si ses longueurs sont les
mêmes (rien à faire si oui) :

```sql
SELECT table_name, column_name, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('ss_utilisateurs', 'ss_enseignants')
  AND column_name IN ('rib', 'mode_paiement_salaire', 'type_contrat', 'lieu_naissance', 'adresse')
ORDER BY 1, 2;
```

Attendu, comme sur la copie : `adresse` 300, `lieu_naissance` 150, `rib` 50,
`mode_paiement_salaire` 30, `type_contrat` 30.

## Non modifié, à savoir

- Trois écrans envoient `etablissement_id=1` en dur : réglages Finance et
  Notation, modes de paiement. C'est sans effet : depuis la sécurisation de
  l'été (Lot 10), le serveur prend toujours l'école du compte connecté.
- Des scripts `test_*.py` traînent à la racine de `backend/` : lancer
  `pytest tests`, sinon pytest les ramasse et s'arrête.
- Les 10 tests en échec venus de `main` (rapport du 22/11) sont inchangés.

## Suite

Inchangée, chaque étape avec ton accord :
1. fusion `IYA-hors-ligne` → `IYA` → `main` ;
2. mise en production en suivant `.ai/MISE_EN_PRODUCTION_HORS_LIGNE.md` ;
3. publication de l'installeur, reconstruit depuis le commit fusionné ;
4. la vitrine en dernier.
