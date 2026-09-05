# Offre technique — École Hadja Fanta Diane

## Sections manquantes, rédigées et prêtes à intégrer

Document de travail interne. Le texte des sections ci-dessous est rédigé pour
être repris tel quel dans l'offre, dans le même style que l'existant.

Les passages entre crochets `[ ]` sont les seuls à compléter : ce sont des
informations que seule la direction de TrillionX détient (immatriculation,
contacts, durées, capacité d'intervention).

---

# PARTIE 1 — Ce qui est déjà là

L'offre actuelle est solide sur trois points, et c'est l'essentiel :

| Élément | État |
|---|---|
| Page de garde et sommaire | Présent |
| Compréhension du besoin et contexte | Présent, bien écrit |
| Objectifs et résultats attendus | Présent |
| **Périmètre fonctionnel détaillé** | Présent — **c'est la meilleure partie du document** |
| Description des profils utilisateurs | Présent, très clair |
| Formation et accompagnement | Présent |
| Planning par étapes | Présent, mais **sans durées** |
| Maintenance et support | Présent, mais **sans délais d'intervention** |
| Livrables | Présent |
| Engagements | Présent |
| Conclusion | Présent |

Le périmètre fonctionnel (sections 02) est remarquable : il est écrit dans la
langue du client, pas dans celle des informaticiens. Un fondateur d'école le
comprend sans traduction. C'est rare, et il ne faut pas y toucher.

---

# PARTIE 2 — Ce qui manque

Douze éléments manquent. Ils se répartissent en trois familles.

## A. Ce qui manque et qui se voit tout de suite

**1. Une présentation de TrillionX.** Le document parle du produit du début à
la fin, mais jamais de l'entreprise. Or un directeur d'école ne signe pas avec
un logiciel : il signe avec une société. Il veut savoir à qui il confie les
données de ses élèves et de ses finances, qui il appellera en cas de problème,
et si cette société existera encore l'année prochaine. C'est le manque le plus
important du document.

**2. L'architecture technique.** Le document s'intitule « offre technique » et
ne contient aucune information technique : ni où les données sont hébergées,
ni comment on accède à l'application, ni ce qu'il faut avoir pour l'utiliser.
Un client averti — ou un concurrent en face — le remarquera.

**3. Le mode hors-ligne.** Le besoin est énoncé page 3 (« disposer d'un outil
accessible, y compris en cas de connexion internet instable ») puis **jamais
repris** dans le périmètre. C'est un argument fort qui reste sur la table.

**4. Un planning avec des durées.** Le tableau donne six étapes sans une seule
durée ni date. Un planning sans durée n'est pas un planning : le client ne
peut pas savoir s'il ouvre dans deux semaines ou dans trois mois.

**5. Des délais de support chiffrés.** « Assistance aux utilisateurs » et
« correction des anomalies signalées » n'engagent à rien tant qu'aucun délai
n'est écrit. C'est aussi une protection pour vous : sans délai écrit, le client
considérera que c'est immédiat, tout le temps.

## B. Ce qui manque et qui protège les deux parties

**6. Les prérequis à la charge de l'établissement.** Connexion, appareils,
référent projet, données de départ. Sans cette liste, tout retard causé par
l'école vous sera imputé.

**7. La reprise des données existantes.** Qui saisit les élèves déjà inscrits ?
Sous quel format ? Dans quel délai ? C'est la première source de litige d'un
projet de ce type.

**8. La recette et les critères d'acceptation.** Qu'est-ce qui déclenche « le
projet est livré » ? Sans procès-verbal de recette, la livraison ne se termine
jamais.

**9. Les hypothèses, limites et exclusions.** Ce qui n'est pas compris dans
l'offre. Cette section a l'air négative ; elle est en réalité la meilleure
protection contre les demandes hors périmètre.

**10. La validité de l'offre.** Une offre sans date de fin de validité reste
opposable indéfiniment.

## C. Ce qui manque et qui rassure

**11. La sauvegarde et la restauration.** Une ligne existe dans les
engagements. Il faut la fréquence, la durée de conservation et le délai de
remise en service. « Nous sauvegardons » ne veut rien dire ; « restauration
sous X heures » veut dire quelque chose.

**12. La réversibilité.** Si l'école part, elle repart avec quoi ? Répondre à
cette question avant qu'elle soit posée inspire davantage confiance que de
l'éviter.

---

# PARTIE 3 — Texte des sections à ajouter

## Structure proposée

L'ordre ci-dessous conserve intégralement les sections existantes et insère
les nouvelles là où elles ont du sens.

| # | Section | Origine |
|---|---|---|
| — | Lettre de soumission | **nouveau** |
| 01 | Présentation de TrillionX | **nouveau** |
| 02 | Objectif de l'offre | existant (01) |
| 03 | Périmètre de la solution | existant (02) |
| 04 | Architecture technique et accès | **nouveau** |
| 05 | Prérequis et responsabilités partagées | **nouveau** |
| 06 | Reprise des données existantes | **nouveau** |
| 07 | Méthodologie et planning de réalisation | existant (04), enrichi |
| 08 | Équipe projet et gouvernance | **nouveau** |
| 09 | Recette et validation | **nouveau** |
| 10 | Formation et accompagnement | existant (03) |
| 11 | Maintenance, support et niveaux de service | existant (05), enrichi |
| 12 | Sécurité, sauvegarde et protection des données | **nouveau** |
| 13 | Réversibilité et propriété des données | **nouveau** |
| 14 | Livrables | existant (06) |
| 15 | Engagements techniques | existant (07) |
| 16 | Hypothèses, limites et exclusions | **nouveau** |
| 17 | Conditions et validité de l'offre | **nouveau** |
| 18 | Conclusion | existant (08) |
| — | Annexes | **nouveau** |

---

## Lettre de soumission

> À placer en première page, après la couverture. Sur papier à en-tête,
> signée et cachetée.

Conakry, le [date]

À l'attention de la Direction de l'École Hadja Fanta Diane

**Objet : remise d'une offre technique pour la mise en place d'un système de
gestion scolaire**

Madame, Monsieur,

À la suite de la présentation de la solution SmartSchool à votre
établissement et de l'intérêt que vous nous avez manifesté, nous avons
l'honneur de vous adresser notre offre technique pour la mise en place d'un
système de gestion scolaire complet au sein de l'École Hadja Fanta Diane.

La présente offre décrit la solution proposée, son périmètre fonctionnel, son
architecture, les modalités de mise en place, la formation de vos équipes, le
support assuré après la mise en service et nos engagements.

Nous nous tenons à votre disposition pour toute présentation complémentaire,
toute démonstration sur site, et pour adapter cette proposition aux
spécificités de votre organisation.

Cette offre est valable [30 / 60 / 90] jours à compter de sa date de remise.

Nous vous prions d'agréer, Madame, Monsieur, l'expression de notre
considération distinguée.

[Nom et prénom]
[Fonction]
TrillionX — Services numériques
[Téléphone] · [Email]

*(signature et cachet)*

---

## 01 — Présentation de TrillionX

### Qui nous sommes

TrillionX est une entreprise guinéenne de services numériques, éditrice de la
solution SmartSchool. Nous concevons, développons et exploitons nos solutions
nous-mêmes : l'établissement s'adresse directement à celui qui a construit
l'outil, sans intermédiaire.

| | |
|---|---|
| Dénomination | TrillionX |
| Forme juridique | [SARL / SA / entreprise individuelle] |
| Immatriculation (RCCM) | [numéro] |
| Identification fiscale (NIF) | [numéro] |
| Siège | [adresse complète, Conakry] |
| Téléphone | [numéro] |
| Adresse électronique | [email] |
| Site internet | [adresse] |
| Représentant légal | [nom, fonction] |

### Notre métier

Nous éditons SmartSchool, un système de gestion scolaire complet destiné aux
établissements guinéens. La solution a été conçue à partir de l'organisation
réelle des écoles du pays : cycles primaire, collège et lycée, notation sur
20, trimestres, examens nationaux, encaissements en espèces comme en Mobile
Money, connexion internet irrégulière.

### Notre équipe

L'équipe réunit les compétences nécessaires à un projet de ce type :
conception et développement de la solution, mise en place et paramétrage chez
le client, formation des utilisateurs, support et maintenance.

[Effectif · profils · à compléter]

### Nos références

[Établissements déjà équipés ou accompagnés — à compléter.]

> **Note interne — à ne pas laisser dans le document remis.**
> Si l'école est parmi les premières, ne l'écrivez pas et n'inventez rien.
> Remplacez cette section par « Notre engagement », en mettant en avant la
> disponibilité, la proximité et le fait que la solution est développée
> localement et suivie directement par son éditeur. Un client tolère un
> historique court ; il ne tolère pas une référence fausse qu'il découvre
> ensuite.

### Notre interlocuteur pour ce projet

[Nom, fonction, téléphone, email] — interlocuteur unique de l'établissement
pour toute la durée du projet.

---

## 04 — Architecture technique et accès

> Section indispensable dans une offre qui s'intitule « technique ».

### Comment la solution est mise à disposition

SmartSchool est une application accessible par internet, hébergée et exploitée
par TrillionX. L'établissement n'a **aucun serveur à acheter, à installer ni à
entretenir**. Il n'y a pas non plus de logiciel à installer sur chaque poste :
l'application s'ouvre depuis un navigateur internet.

Chaque établissement dispose de son propre espace. Les données de l'École
Hadja Fanta Diane sont séparées de celles de tout autre établissement.

### Accès à l'application

| Point | Description |
|---|---|
| Adresse d'accès | Une adresse internet dédiée, communiquée à la mise en service |
| Appareils | Ordinateur, tablette ou téléphone |
| Logiciel à installer | Aucun — un navigateur internet suffit |
| Navigateurs | Chrome, Edge, Firefox, Safari, dans une version récente |
| Nombre d'utilisateurs | [illimité / selon formule — à préciser] |

### Fonctionnement en connexion instable

La solution reste utilisable lorsque la connexion internet est faible ou
momentanément interrompue. Les saisies effectuées pendant la coupure sont
conservées sur l'appareil, puis transmises automatiquement dès le retour de la
connexion. Ce fonctionnement répond directement à la contrainte de connectivité
exprimée par l'établissement.

L'application peut également être ajoutée à l'écran d'accueil d'un téléphone
ou d'une tablette et s'ouvre alors comme une application ordinaire.

### Hébergement

| Point | Description |
|---|---|
| Type d'hébergement | Hébergement professionnel en centre de données |
| Localisation | [à préciser] |
| Liaison | Connexion chiffrée (HTTPS) entre l'appareil et le serveur |
| Disponibilité visée | [à préciser — voir section 11] |
| Exploitation | Assurée par TrillionX ; aucune intervention de l'école |

### Mises à jour

Les améliorations et corrections sont déployées par TrillionX sur la
plateforme. Elles sont **disponibles automatiquement** pour l'établissement,
sans intervention de sa part, sans réinstallation et sans interruption de
service notable. L'école bénéficie ainsi en continu des évolutions de la
solution.

---

## 05 — Prérequis et responsabilités partagées

> Cette section évite qu'un retard causé par l'établissement vous soit imputé.
> Elle est aussi une marque de sérieux : elle montre que le projet a été pensé.

La réussite du projet repose sur une répartition claire des rôles.

### À la charge de TrillionX

- Mise à disposition de la plateforme et de son hébergement.
- Paramétrage de l'établissement : année scolaire, cycles, classes, matières,
  coefficients, règles de notation, rôles et comptes.
- Intégration des données de départ transmises par l'établissement.
- Formation des utilisateurs selon leur profil.
- Accompagnement au démarrage, support et maintenance.

### À la charge de l'établissement

- **Un référent projet** désigné, interlocuteur unique de TrillionX, disposant
  de l'autorité nécessaire pour valider les choix de paramétrage.
- **Une connexion internet** dans l'établissement, permettant l'usage
  quotidien de l'application.
- **Les équipements** nécessaires à ses utilisateurs : ordinateurs, tablettes
  ou téléphones (au minimum un poste au secrétariat et un à la comptabilité).
- **La transmission des données de départ** dans les délais convenus :
  liste des élèves, du personnel, des classes, grille des frais de scolarité.
- **La disponibilité des équipes** aux dates de formation retenues.
- **La désignation des rôles** : qui fait quoi dans l'application.

### Ce dont dépend le planning

Le planning présenté en section 07 court à compter de la réception complète
des données de départ et de la désignation du référent projet. Tout retard sur
ces deux points décale le planning d'autant.

---

## 06 — Reprise des données existantes

> Première source de litige d'un projet de ce type : il faut l'écrire.

### Données reprises

| Donnée | Contenu attendu | Fournie par |
|---|---|---|
| Élèves | Nom, prénom, date et lieu de naissance, sexe, classe | Établissement |
| Familles | Parent ou tuteur, téléphone, lien de parenté | Établissement |
| Personnel | Nom, fonction, matières et classes enseignées | Établissement |
| Classes | Cycle, niveau, effectif | Établissement |
| Frais de scolarité | Grille tarifaire par classe | Établissement |

### Format et modalités

Les données sont transmises sous forme de tableau (fichier Excel ou
équivalent) selon un **modèle fourni par TrillionX**, ou sur listes papier si
l'établissement ne dispose pas de fichier informatique.

- Saisie et intégration assurées par TrillionX à partir des éléments transmis.
- Contrôle de cohérence et signalement des informations manquantes ou
  contradictoires.
- **Validation de l'exactitude des données par l'établissement** avant la mise
  en service : TrillionX intègre fidèlement ce qui lui est transmis, mais ne
  peut se porter garant de l'exactitude d'informations qu'il n'a pas produites.

### Volume prévu

La présente offre couvre la reprise de [nombre] élèves et [nombre] membres du
personnel. Au-delà, les modalités seront convenues ensemble.

### Historique antérieur

La reprise des notes et bulletins des **années scolaires antérieures** n'est
pas comprise dans la présente offre. Elle peut faire l'objet d'une prestation
complémentaire si l'établissement le souhaite.

---

## 07 — Méthodologie et planning (remplace le tableau actuel)

> Le tableau existant est bon ; il lui manque les durées. Voici le même
> tableau complété. Ajustez les durées à votre capacité réelle.

La solution étant déjà développée et opérationnelle, sa mise en place est
rapide : elle ne comporte aucune phase de développement.

| # | Étape | Contenu | Durée indicative | Acteurs |
|---|---|---|---|---|
| 1 | Préparation | Recueil des informations de l'école, cadrage des besoins, désignation du référent | [2 jours] | TrillionX + Direction |
| 2 | Configuration | Paramétrage de l'année, des cycles, classes, matières, coefficients, rôles et comptes | [3 jours] | TrillionX |
| 3 | Mise en place | Intégration des données de départ (élèves, personnel, classes, frais) | [3 jours] | TrillionX |
| 4 | Tests & validation | Vérification du bon fonctionnement avec l'établissement, procès-verbal de recette | [2 jours] | TrillionX + Établissement |
| 5 | Formation | Formation des utilisateurs par groupe de profils | [3 jours] | TrillionX |
| 6 | Déploiement | Mise en service réelle et démarrage accompagné | [2 jours] | TrillionX + Établissement |
| | **Total** | | **[environ 3 semaines]** | |

**Point de départ.** Le planning court à compter de la réception complète des
données de départ (section 06) et de la désignation du référent projet.

**Suivi.** Un point d'avancement est tenu à la fin de chaque étape avec le
référent de l'établissement.

---

## 08 — Équipe projet et gouvernance

### Interlocuteurs

| Rôle | Responsabilité | Titulaire |
|---|---|---|
| Chef de projet TrillionX | Pilotage, planning, interlocuteur unique de l'école | [nom] |
| Responsable technique | Paramétrage, intégration des données, hébergement | [nom] |
| Formateur | Formation des utilisateurs, accompagnement au démarrage | [nom] |
| Référent établissement | Décisions de paramétrage, transmission des données, validation | [à désigner par l'école] |

### Suivi du projet

- Un **point d'avancement** à la fin de chaque étape du planning.
- Un **compte rendu écrit** des décisions prises.
- Un **canal de contact permanent** (téléphone / WhatsApp / email) entre le
  chef de projet et le référent de l'établissement.

### Après la mise en service

Le chef de projet reste l'interlocuteur de l'établissement pendant toute la
période d'accompagnement au démarrage, puis passe le relais au support
(section 11).

---

## 09 — Recette et validation

> Sans cette section, la livraison ne se termine jamais formellement.

### Déroulement

À l'issue de la mise en place, une séance de recette est organisée avec
l'établissement. TrillionX présente le système paramétré et l'établissement
vérifie, sur ses propres données, que le fonctionnement attendu est bien
réalisé.

### Points vérifiés

- Connexion de chaque profil d'utilisateur à son espace.
- Présence et exactitude des classes, matières et coefficients configurés.
- Présence et exactitude des dossiers élèves intégrés.
- Saisie d'une note, calcul d'une moyenne, production d'un bulletin.
- Enregistrement d'un appel et d'un paiement, édition d'un reçu.
- Accès des parents et des élèves à leur espace.

### Procès-verbal

La recette donne lieu à un **procès-verbal signé par les deux parties**. Les
réserves éventuelles y sont consignées ; TrillionX les lève dans un délai de
[5] jours ouvrés, puis la recette est prononcée.

La signature du procès-verbal, sans réserve ou après levée des réserves, vaut
**acceptation de la solution** et marque le début de la période de support.

---

## 11 — Maintenance, support et niveaux de service (remplace la section actuelle)

> Les cinq encadrés actuels sont justes mais n'engagent sur aucun délai.
> Voici la même section, avec des délais. Ajustez-les à ce que vous pouvez
> réellement tenir : un délai tenu vaut mieux qu'un délai flatteur.

Après la mise en service, TrillionX assure le bon fonctionnement continu de
la solution.

### Canaux et horaires

| Point | Modalité |
|---|---|
| Canaux | Téléphone, WhatsApp, courrier électronique |
| Horaires | [Lundi au vendredi, 8h–18h · samedi 8h–13h] |
| Contact | [numéro] · [email] |

### Délais de prise en charge

| Gravité | Description | Prise en charge | Résolution visée |
|---|---|---|---|
| **Bloquant** | L'application est inaccessible, ou une fonction essentielle est totalement inutilisable (connexion, notes, encaissements) | [4 heures ouvrées] | [1 jour ouvré] |
| **Majeur** | Une fonction est dégradée mais un contournement existe | [1 jour ouvré] | [3 jours ouvrés] |
| **Mineur** | Gêne d'affichage ou demande d'ajustement sans effet sur l'usage | [2 jours ouvrés] | Prochaine mise à jour |

### Prestations comprises

- **Support technique** — assistance aux utilisateurs après la mise en service.
- **Maintenance corrective** — correction des anomalies signalées.
- **Mises à jour** — intégration régulière des améliorations de la solution,
  déployées automatiquement, sans intervention de l'établissement.
- **Maintenance évolutive** — évolutions possibles selon les besoins de
  l'établissement, étudiées au cas par cas.
- **Assistance** — accompagnement pour répondre aux questions des équipes.

### Ce qui n'est pas compris

- Le développement de fonctions nouvelles hors périmètre (voir section 16).
- La réparation ou le remplacement du matériel de l'établissement.
- Le rétablissement de la connexion internet de l'établissement.
- La saisie courante des données, qui relève des équipes de l'école.

---

## 12 — Sécurité, sauvegarde et protection des données

### Accès et identification

- Chaque utilisateur dispose de ses **propres identifiants personnels**.
- Les mots de passe sont conservés sous forme chiffrée : ils ne sont lisibles
  par personne, y compris par TrillionX.
- Chaque utilisateur n'accède **qu'aux fonctions correspondant à son rôle**.
- Les échanges entre l'appareil et le serveur sont **chiffrés (HTTPS)**.

### Séparation des établissements

Les données de l'École Hadja Fanta Diane sont **strictement séparées** de
celles de tout autre établissement utilisant la solution. Aucun utilisateur
d'un autre établissement ne peut y accéder, sous aucune forme.

### Traçabilité

Les actions sensibles réalisées dans l'application sont enregistrées :
l'établissement peut savoir qui a fait quoi et quand.

### Sauvegardes

| Point | Engagement |
|---|---|
| Fréquence | [Quotidienne] |
| Conservation | [30 jours] |
| Restauration | Sur demande de la direction, sous [24 heures ouvrées] |
| Périmètre | L'ensemble des données de l'établissement |

### Protection des données personnelles

Les données traitées concernent des élèves, dont des mineurs. TrillionX
s'engage à :

- ne les utiliser **que** pour le fonctionnement du service ;
- ne les communiquer à **aucun tiers**, à aucun titre, ni gratuitement ni
  contre rémunération ;
- ne les exploiter à **aucune fin commerciale ou publicitaire** ;
- respecter la **réglementation applicable en Guinée** en matière de
  protection des données à caractère personnel ;
- **restituer et effacer** ces données en fin de relation, selon les modalités
  de la section 13.

---

## 13 — Réversibilité et propriété des données

> Répondre à cette question avant qu'elle soit posée inspire plus confiance
> que de l'éviter.

### Propriété

**Les données saisies dans l'application appartiennent à l'École Hadja Fanta
Diane** — dossiers élèves, notes, bulletins, présences, écritures comptables.
TrillionX en assure la conservation et la sécurité, mais n'en est pas
propriétaire et ne peut en disposer.

La solution SmartSchool elle-même, son code et sa conception, demeurent la
propriété de TrillionX. L'établissement bénéficie d'un droit d'usage pendant
toute la durée de la relation.

### En cas de fin de relation

Quelle qu'en soit la raison, l'établissement peut demander la restitution de
ses données. TrillionX s'engage à :

- fournir **l'intégralité des données de l'établissement** dans un format
  exploitable (tableaux et documents PDF), sous [15] jours ouvrés ;
- **effacer définitivement** ces données de ses systèmes après restitution et
  confirmation écrite de l'établissement.

Aucune donnée n'est retenue comme moyen de pression, dans aucune circonstance.

---

## 16 — Hypothèses, limites et exclusions

> Cette section a l'air défavorable. Elle est en réalité votre meilleure
> protection : sans elle, tout ce qui n'est pas écrit sera considéré comme dû.

### Hypothèses retenues

La présente offre a été établie sur la base des hypothèses suivantes :

- L'établissement dispose d'une connexion internet et des équipements
  nécessaires à ses utilisateurs.
- Les données de départ sont transmises dans les délais convenus.
- Un référent projet est désigné et disponible pendant la mise en place.
- Les effectifs correspondent à ceux indiqués en section 06.

Un écart significatif sur l'un de ces points peut avoir un effet sur le
planning et sera signalé à la direction.

### Non compris dans la présente offre

- La fourniture de matériel : ordinateurs, tablettes, téléphones, imprimantes.
- La fourniture ou l'installation d'une connexion internet.
- La reprise des notes et bulletins des années scolaires antérieures.
- Le développement de fonctions nouvelles non décrites au périmètre.
- L'interconnexion avec un système tiers existant.
- La saisie courante des données par les équipes de l'école après la mise en
  service.

### Évolutions ultérieures

Toute demande de fonction nouvelle est étudiée avec plaisir et fait l'objet
d'une proposition distincte. Certaines évolutions d'intérêt général sont
intégrées à la solution et bénéficient alors à l'établissement sans coût
supplémentaire.

---

## 17 — Conditions et validité de l'offre

| Point | Précision |
|---|---|
| Objet | Offre **technique**. Les conditions financières font l'objet d'une offre financière distincte, remise séparément. |
| Validité | [30 / 60 / 90] jours à compter de la date de remise |
| Modèle | Abonnement de service, incluant hébergement, mises à jour, support et maintenance |
| Durée | [annuelle, renouvelable] |
| Périmètre d'utilisation | École Hadja Fanta Diane uniquement |
| Confidentialité | Le présent document est confidentiel et destiné au seul usage de son destinataire |

---

## Annexes suggérées

| Annexe | Contenu | Intérêt |
|---|---|---|
| A | Captures d'écran de l'application | **Le plus fort argument du dossier.** Un tableau de bord, un bulletin, un espace parent : trois images valent dix pages |
| B | Modèle de bulletin produit par la solution | Le document que l'école remettra aux familles |
| C | Modèle de fichier de reprise des données | Rend la section 06 immédiatement concrète |
| D | Glossaire | Pour les termes qui pourraient rester obscurs |

---

# PARTIE 4 — Trois corrections sur le texte existant

**1. Ajouter le mode hors-ligne au périmètre.** Le besoin est énoncé page 3 et
n'est jamais repris. Ajoutez dans la section « Une application accessible
partout » (page 11) :

> - **Utilisable même en connexion instable** : les saisies effectuées pendant
>   une coupure sont conservées, puis transmises automatiquement au retour de
>   la connexion.

C'est un différenciateur réel en Guinée, et il est actuellement absent.

**2. Déplacer « Une application accessible partout ».** Cet encadré est en bas
de la page 11, après la comptabilité et les portails. Il gagnerait à figurer
au **début** de la section 02, juste après « Comment ça marche, simplement » :
c'est une des premières questions que se pose un directeur.

**3. Numéroter les sections en continu.** Le document utilise deux fois « 02 »
(« Périmètre de la solution » puis « Le détail des fonctionnalités »). Passez
la seconde en « 03 » et décalez la suite, ou libellez-la « 02 — suite ».

---

# En résumé

Le document est **bon sur le fond fonctionnel** — c'est la partie la plus
difficile à écrire, et elle est réussie. Ce qui manque relève de la forme
contractuelle : qui vous êtes, comment ça marche techniquement, en combien de
temps, avec quels engagements de délai, et ce qui n'est pas compris.

Les trois ajouts qui changent le plus l'impression donnée :

1. **La présentation de TrillionX** — le client signe avec une entreprise.
2. **Le planning avec des durées** — il veut savoir quand il ouvre.
3. **Les délais de support chiffrés** — il veut savoir sur quoi vous vous
   engagez le jour où ça ne marche pas.
