# Système de Notation Scolaire — République de Guinée

> Source de vérité pour le calcul des moyennes, rangs et bulletins dans SMARTSCHOOL ERP.  
> Mise à jour : 26 Mars 2026.

---

## 📐 Barème de Notation

### Primaire (1ère — 6ème Année)
- **Échelle : /10 points**
- L'appréciation est une simple moyenne arithmétique ou pondérée par le coefficient

| Note /10 | Appréciation |
|----------|-------------|
| 9 — 10 | Très Bien (TB) |
| 7 — 8.9 | Bien (B) |
| 6 — 6.9 | Assez Bien (AB) |
| 5 — 5.9 | Passable (P) |
| 0 — 4.9 | Insuffisant (I) |

### Collège & Lycée (7ème — Terminale)
- **Échelle : /20 points**

| Note /20 | Appréciation |
|----------|-------------|
| 16 — 20 | Excellent / Très Bien (TB) |
| 14 — 15.9 | Bien (B) |
| 12 — 13.9 | Assez Bien (AB) |
| 10 — 11.9 | Passable (P) |
| 0 — 9.9 | Insuffisant / Échec |

> ⚠️ La note **10/20** (ou **5/10** au primaire) est le seuil de réussite.

---

## 📊 Calcul des Moyennes

### 1. Moyenne par Matière (pour un Trimestre)

L'enseignant attribue plusieurs notes dans le trimestre (devoirs, interrogations, examens).

**Formule :**
```
Moyenne_Matière = Σ(Note_i × Coefficient_Évaluation_i) / Σ(Coefficient_Évaluation_i)
```

**Types d'évaluation courants :**
| Type | Code | Poids suggéré |
|------|------|---------------|
| Interrogation écrite | INT | Coef 1 |
| Devoir surveillé | DEV | Coef 2 |
| Composition (examen trimestriel) | COMP | Coef 3 |
| Travaux pratiques | TP | Coef 1 |
| Participation / Oral | PART | Coef 1 |

> Exemple : Un élève a INT=12 (coef 1), DEV=14 (coef 2), COMP=10 (coef 3)  
> → Moyenne = (12×1 + 14×2 + 10×3) / (1+2+3) = (12+28+30) / 6 = **11.67/20**

### 2. Moyenne Générale Trimestrielle (Pondérée par Coefficient Matière)

Chaque matière a un coefficient (cf. programme guinéen v2).

**Formule :**
```
Moyenne_Générale = Σ(Moyenne_Matière_j × Coefficient_Matière_j) / Σ(Coefficient_Matière_j)
```

> Exemple (Collège) :
> | Matière | Coef | Moyenne |
> |---------|------|---------|  
> | Français | 4 | 12 |
> | Maths | 4 | 14 |
> | Anglais | 3 | 10 |
> | Physique | 2 | 8 |
> → Moyenne = (12×4 + 14×4 + 10×3 + 8×2) / (4+4+3+2) = (48+56+30+16)/13 = **11.54/20**

### 3. Moyenne Annuelle

```
Moyenne_Annuelle = (Moy_T1 + Moy_T2 + Moy_T3) / 3
```

> En Guinée, les 3 trimestres ont le même poids.

---

## 📋 Structure du Bulletin Scolaire

Le bulletin trimestriel comprend :

### En-tête
- Nom de l'établissement
- Année scolaire
- Trimestre (1er, 2ème, 3ème)
- Infos élève : Nom, Prénom, Matricule, Classe, Date de naissance

### Corps du Bulletin (Tableau)
Pour chaque matière :
| Colonne | Description |
|---------|-------------|
| Matière | Nom de la matière |
| Coefficient | Coefficient de la matière |
| Moy. Élève | Moyenne de l'élève dans cette matière |
| Moy. Classe | Moyenne de la classe dans cette matière |
| Note Min | Note la plus basse de la classe |
| Note Max | Note la plus haute de la classe |
| Appréciation | Auto-générée (TB, B, AB, P, I) |
| Observation Prof | Commentaire de l'enseignant |

### Résumé
- **Moyenne Générale** : Calculée pondérée
- **Rang** : Position dans la classe
- **Effectif** : Nombre total d'élèves
- **Mention** : TB, B, AB, P ou Échec
- **Décision** : Admis / Redoublant / Exclu (fin d'année seulement)
- **Observation du Conseil** : Commentaire du conseil de classe

---

## 🔄 Workflow Complet dans SMARTSCHOOL

```
ENSEIGNANT                      ADMIN                          BULLETIN
    │                              │                              │
    ▼                              │                              │
 Saisie des Notes                  │                              │
 (INT, DEV, COMP)                  │                              │
    │                              │                              │
    ▼                              │                              │
 Historique / Modification         │                              │
    │                              │                              │
    ▼                              │                              │
 [Bouton: Centraliser] ──────────► │                              │
                                   ▼                              │
                           Centralisation                         │
                           des Notes                              │
                           (vérif/modif)                          │
                                   │                              │
                                   ▼                              │
                           [Bouton: Calculer] ──────────────────► │
                           Moyennes + Rangs                       │
                                                                  ▼
                                                          Génération Bulletin
                                                          (par élève / classe)
```

---

## 📌 Décisions d'Implémentation

1. **Statut Évaluation** : `BROUILLON` → `PUBLIEE` → `CENTRALISEE`
   - BROUILLON : L'enseignant peut modifier librement
   - PUBLIEE : Visible dans l'historique enseignant
   - CENTRALISEE : Envoyée vers la page admin de centralisation

2. **Statut Bulletin** : `BROUILLON` → `CALCULE` → `PUBLIE`
   - BROUILLON : En cours de préparation
   - CALCULE : Moyennes et rangs calculés
   - PUBLIE : Finalisé, visible par les parents

3. **Table BulletinLigne** (nouvelle) : Stocke la moyenne par matière pour chaque bulletin
   - bulletin_id, matiere_id, moyenne_matiere, appreciation, observation_prof

4. **Appréciation automatique** : Fonction qui retourne TB/B/AB/P/I en fonction de la note


Bon, voilà, je disais tout est parfait. Maintenant toujours on reste dans le portail Farand. Et là, comment dirais-je, les raccourcis qui sont en bas là, messages à l'école, bulletins, notifications. Maintenant, on va essayer, on va faire en sorte qu'on gère aussi le système de messagerie pour les parents. Est-ce que je me fais comprendre? Du coup, dans la page admin, il y a une page là-bas communication qu'on a déjà faite. Maintenant, à l'intérieur de la page, on va créer une section. Maintenant, cette section servira à communiquer aux différents parents d'élèves des étudiants. Du coup, dans cette section, ce sera aussi une page. Et cette page-là doit être vraiment très belle, très très belle. Et le système, ça doit permettre quoi ? Là, il y a un problème comme ça, l'admin, le directeur ou l'admin veut communiquer aux parents d'élèves ou aux parents d'un élève. Du coup, il y a la liste et il doit savoir que tel élève, ce sont parents pour ne pas qu'il se trompe de parents. Il y a aussi des messages personnels, des messages uniquement envoyés à un parent. Il y a aussi des messages pour tous les parents. Ça, c'est la réclamation des bulletins, ça dépend, plein de trucs. Donc, façon dont on l'a fait côté poster, on va le faire côté communication pour les anciens. On va faire de même aussi pour les parents parce qu'il peut y avoir plusieurs types d'objets. Est-ce que je me fais comprendre ? Du coup, on va bien gérer ça, toute la tête propre. Et côté maintenant, Farah, cette partie-là, message à l'école doit être implémentée. Ça doit recevoir les messages que l'admin envoie et la cloche notification doit fonctionner comme on l'a fait côté ancien. Et tu enlèves maintenant le raccourci notification tout en bas de sa portail. Est-ce que je me fais comprendre ? Et le bulletin aussi, tu enlèves. Du coup, on mettra devoirs et dashboard. On va créer maintenant un petit dashboard aussi pour portail parents, comme on l'a fait pour anciens. C'est dashboard, l'évolution, comment des cours, des notes, l'évolution du travail de ses enfants, ainsi de suite, le paiement, comme le dashboard doit être bien sur les différents dégraphes, tout tout tout tout tout. Et aussi à l'entête, la partie de son profil, il faut implémenter ça le profil, il doit avoir des trucs. Le bouton accueil, déconnexion là, tu supprimes ça, ça doit être à l'intérieur. Lorsqu'on déroule le profil comme côté ancien. Donc, c'est un peu ça, le travail qu'on doit faire pour l'instant.




J'ai vérifié, tout est OK, tout est OK, OK. Du coup, dans, je t'avais dit de rajouter des trucs dans la page, dans le portail parent, c'est déjà fait. Et aussi côté admin, une page, une section pour la communication pour côté parent, t'as déjà fait ça. Maintenant, il y a deux ou trois petits trucs qui, voilà, qui m'agacent un peu. Au fait, au niveau du répertoire parent, quand tu cliques sur, par exemple, Ibrahim Bah, tu as deux enfants, Alpha Touré, Sesamani, Ousmane Diallo. Normalement, si l'admin a envoyé un message dédié à ce parent, tu dois, on doit voir le message dans la partie historique des messages, OK ? Mais là, quand je clique sur ça, ça me fait sortir l'interface du message au parent, comme si j'avais cliqué sur le bouton nouveau message. Alors que quand je clique sur un répertoire parent, je dois avoir les historiques des messages concernant ce parent, s'il y a réellement des messages envoyés à ce parent, si l'admin l'a déjà fait. Est-ce que je me fais comprendre ? Maintenant, s'il n'y en a pas, je dois avoir un petit message, aucun message. Du coup, toujours quand, j'ai cliqué sur ce répertoire parent, j'ai la possibilité directement de l'écrire à lui. Il faut faire un petit, des modifications, un petit bouton, je ne sais pas, de l'écrire directement à lui. Maintenant, après ça, déjà maintenant, si ça c'est OK, c'est bon. Maintenant, si maintenant je veux écrire à tous les parents maintenant, il y a déjà le bouton nouveau message qui est là, qui est bien fait. Il y a l'option tous les parents, il y a l'option par classe, déjà, je choisis une classe. Maintenant, tous les parents qui ont leurs enfants dans cette classe, je vais le message. Ou soit, j'ai choisi un seul parent et j'ai choisi le parent, ça c'est OK. Donc, là-bas, c'est bon. Maintenant, de côté, maintenant, portail parent. Effectivement, le parent, il reçoit les notifications, ça se notifie, ça s'incrémente. Mais quand tu cliques sur le bouton message, tu ne vois pas l'interface de message, là où exactement il va le message qu'est là, il puisse le lire et répondre et répondre à son tour l'admine. Ça, ça ne marche pas. Est-ce que je me fais comprendre? Sinon, à part ça, tout est OK. Maintenant, lorsque ça, ce sera fini, on va attaquer maintenant l'interface enseignant cette fois-ci pour que l'enseignant puisse euh uploader les devoirs, parce que j'ai déjà mis le bouton ici euh devoirs dans le portail parent pour que si l'enseignant, il envoie les devoirs aux élèves, le parent, si ce devoir, si le devoir est amené à un à un élève que ce parent de l'élève à son élève dans cette classe qu'il puisse le voir directement dans son portail vu qu'il y a le bouton ici devoirs, donc tout doit être synchronisé. L'enseignant aussi doit pouvoir envoyer des devoirs aux élèves via son portail enseignant. Est-ce que là, je me fais comprendre. Et aussi, sinon, apparemment tout est bon, le petit dashboard qu'on a créé au niveau de de parent, c'est bon, les notes, tout est nickel. Donc, il faut rapidement régler ça et voilà, c'est tout ce que j'avais à dire.


OK, maintenant, c'est bon, j'adore. Maintenant, on va attaquer au niveau de, comment dirais-je, le profil qui est tout en haut là, par exemple dans le portail para, là où le nom est écrit la fenêtre déroulante, là on voit « Accueil », « Mon profil », « Paramètres » et le bouton de connexion. Bon, là, là, côté portail para, il y a, bon, on n'a rien créé, qu'il soit côté admin et côté portail parent, parce que par exemple, l'enseignant et les élèves, ils ont bel et bien des profils, mais le parent n'a pas de profil. Du coup, côté admin, on va créer une page concernant les parents. Je ne sais pas comment on va nommer cette page, mais il faut que ce soit un nom joli comme. Ça sera uniquement, là-bas, on verra les parents et ça doit être vraiment une belle page. Là, on verra les parents et on saura, chaque parent, quels sont les enfants de chaque parent, des trucs comme ça. Et l'administrateur aussi aura l'option quand il clique un truc comme ça, voir le profil du parent, il peut, par exemple, peut-être, il peut modifier des trucs sur le parent, s'il y a des erreurs, des trucs comme ça, les informations sur le parent. En tout cas, tout doit être bien fait. Donc là, là, maintenant, si ça c'est créé côté admin, maintenant côté portail, côté portail parent, lorsqu'il clique sur, lorsqu'il fait dérouler la petite fenêtre, lorsqu'il clique maintenant sur « Mon profil », il doit avoir la même profil qui a été créé côté admin et tout, tout, tout, tout, tout, tout. Mais ça, ça doit s'afficher dans... Seulement l'interface pour les paramètres. Si c'est possible, j'espère que c'est possible, si c'est possible, fais-le. Maintenant, il faut rajouter aussi l'option pour modifier le mot de passe comme tu l'as fait chez l'enseignant. Maintenant, revenons au côté enseignant. Côté enseignant ici, lui, il n'a pas le bouton paramètres, mais dans pareil, il y a paramètres, même si ce n'est pas implémenté, mais il faut l'ajouter côté enseignant. Et aussi, côté enseignant, il y a une partie ici « vue d'ensemble » pour le profil. Bon, déjà aussi chez l'enseignant, l'enseignant a son profil, là-bas chez l'admin. Je veux que ce soit les mêmes trucs aussi ici dans le portail enseignant, comme je l'avais expliqué pour le cas du portail para. Donc, tout doit être bien joli. Là pour l'instant, c'est ce qu'on doit faire là. Quand on finira, je te dirai maintenant la suite du travail. En tout cas, la page qu'on va créer côté admin pour les para, pour que tout ça date, est vraiment jolie et premium.




Bon voilà, le truc c'est que je pense pas si t'as bien compris. Le fait d'aimer quoi, au niveau de la liste là, que ce soit côté enseignant, élève ou parent d'élève, j'aimerais avoir les photos au niveau de par exemple, quand tu prends par exemple un élève Alpha Bat, il a son nom sur sa petite carte sur la liste, il y a son nom, il y a sa classe qui est écrite et aussi son nom qui est abrégé. Si c'est A, c'est A. Du coup, au niveau de ce petit cercle-là, j'aimerais que ça soit plutôt leurs photos qui soient là quoi. Au niveau de l'âge ou des élèves, que tu puisses ajouter la photo de cet élève et en même temps, quand on crée un élève, on crée aussi le parent d'élève de ses identifiants, n'est-ce pas? Là aussi, on met la photo du parent d'élève. Maintenant, ça, c'est pour le côté âge. Maintenant là, déjà, on a inséré des élèves, des anciens et des classes. Maintenant, comme leurs photos n'ont pas été ajoutées au niveau de leurs cartes, tu mets le petit bouton edit pour mettre la photo. Est-ce que je me fais comprendre? Et là, maintenant, concernant là où les photos-là seront récupérées, je t'avais dit que côté parent... On doit mettre euh on doit comme on dirait ajouter une fonctionnalité qui nous permet de débloquer que les parents puissent envoyer la photo de leurs enfants. Est-ce que je me comprends? Maintenant, si les parents envoient la photo de leurs enfants et publiquent au niveau de l'admin, automatiquement chez l'admin, ça trouvera qu'on a créé une page galerie. Galerie, OK, maintenant cette page-là va recevoir la photo des des des différents enfants des parents sur notre système. Et la photo de tous les enfants là sur une classe de façon intelligente. Si un parent X a son enfant en 10e année, la photo de son enfant viendra dans la classe de 10e année, dans la page euh dans la page galerie et c'est comme ça que ça doit se passer. Et cette page galerie doit être vraiment top. Maintenant, cette page galerie servira à quoi? Par exemple, si l'admin il est inscrit, par exemple au départ, on suppose qu'au niveau de l'ajout des élèves et enseignants, ils n'ont pas encore de photos, n'est-ce pas? Parce que leur identifiant n'a pas été créé, ils n'ont pas leur portail. Du coup, du coup euh l'admin, il peut passer sans problème. Mais après, lorsque l'identifiant du parent et de l'enseignant est créé, de l'élève tout tout tout tout, l'admin, il peut envoyer un message aux enseignants aux parents, il dit à toi, tel enseignant, j'ai besoin de tes photos, toi, tel enseignant, j'ai besoin de tes photos et aussi de tes photos de tes enfants. Donc automatiquement, ces photos-là viendront dans notre page galerie pour les élèves, il y a pour les élèves bien classés par classe, il y a pour les enseignants aussi et aussi euh pour les comment dirais-je, pour les pour les comment dirais-je, pour les parents d'élèves aussi. Et là, l'admin quand il finit d'inscrire, il revient encore, il cherche. Il dit que je vais écrire une élève tout à l'heure, il n'y a pas sa photo, il vient dans la page élèves, il cherche l'élève, il trouve, il clique sur le bouton édit sur le nom de l'élève et puis automatiquement, quand il clique, le système va l'envoyer directement dans la galerie qui se trouve sur le système et c'est là-bas, il va récupérer automatiquement la photo de l'élève. Et le système va faire en sorte que ça lui renvoie automatiquement sur l'ID la photo correspondant à l'élève dont ce que j'aimerais que tu fasses là maintenant, il faudrait qu'on voie l'image de toutes les personnes se trouvant sur le système. Donc, c'est un peu ça ce que je voulais que tu fasses.