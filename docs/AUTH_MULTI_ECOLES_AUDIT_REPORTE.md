# Authentification multi-écoles — audit réalisé, chantier REPORTÉ

**Statut : reporté (décision produit).**
Audit complet effectué, **aucune ligne de code modifiée**, aucune migration
appliquée. Ce document existe pour que le chantier reparte de cet état plutôt
que d'être ré-audité.

## Pourquoi c'est reporté

1. **Le mode hors-ligne n'a pas été évalué.** Une refonte de l'identité touche
   le JWT, donc la file offline (`offlineQueue.ts`), le rejeu des requêtes et
   la purge de session. L'analyse ne l'avait pas couvert — angle mort réel.
2. **Mise en service imminente.** Changer le modèle d'identité juste avant
   l'ouverture aux écoles est un risque disproportionné.

## Ce qui a été décidé (spécification à reprendre telle quelle)

- Code établissement **obligatoire** au login pour tout compte tenant.
- L'utilisateur saisit `Etablissement.code` (ex. `SSM-K8F4`), **jamais**
  l'`etablissement_id` technique.
- Résolution : `code → Etablissement → etablissement_id → compte dans CETTE
  école → authentification → JWT`. Jamais de `.first()` sur toute la plateforme.
- Unicité des identifiants **par établissement**, décidée champ par champ.
- Fondateur pouvant posséder **plusieurs** établissements, avec sélection après
  authentification et vérification serveur des droits réels.

---

## Constats de l'audit (à ne pas refaire)

### 1. 🔴 La base contredit déjà le code — dormant, mais réel

`app/core/identifiants.py` déclare l'unicité **par école** pour les enseignants
et les parents :

```python
(Enseignant, ..., ("telephone", "email", "matricule"), True),   # par_ecole
(Parent,     ..., ("telephone_1", "email"),            True),   # par_ecole
```

Mais la base impose l'unicité **GLOBALE** sur ces mêmes champs :
`uq_enseignants_telephone`, `uq_enseignants_email`, `ix_ss_enseignants_matricule`,
`uq_parents_telephone_1`, `uq_parents_email`.

**Conséquence** : inscrire un enseignant ou un parent déjà présent dans une
AUTRE école échouera en **500** (violation d'index), au lieu du message propre
prévu par `_exiger_un_seul()`. La fonctionnalité multi-écoles annoncée dans le
code est donc inopérante.

> **Condition de déclenchement : l'ouverture de la 2ᵉ école.**
> Tant qu'une seule école existe, aucune collision n'est possible et le
> problème reste invisible.

Origine : ces index datent du lot 12, quand l'unicité globale était la règle
retenue. La règle a changé côté code ; la base n'a pas suivi.

### 2. 🔴 Le fondateur multi-écoles n'est pas représentable

**Aucune table de liaison n'existe.** `Utilisateur.etablissement_id` est une
clé étrangère unique et nullable. Le modèle cible

```
Fondateur ├── école A ├── école B └── école C
```

demande une nouvelle table (`ss_utilisateur_etablissements`) et touche le
login, le JWT et la sélection d'école. C'est le poste le plus lourd du chantier.

### 3. État des contraintes, champ par champ

| Table | Champ | Modèle | Base | Cible |
|---|---|---|---|---|
| `ss_utilisateurs` | `nom_utilisateur` | `unique=True` | global | par école |
| | `email` / `telephone` | — | global | par école |
| `ss_enseignants` | `matricule` | `unique=True` | global | par école |
| | `email` / `telephone` | — | global | par école |
| `ss_parents` | `telephone_1` / `email` | — | global | par école |
| `ss_eleves` | `matricule` | `unique=True` | global | **rester global** |
| `ss_etablissements` | `code` | `unique=True` | global | **rester global** |

**`Eleve.matricule` doit rester global** : il est généré au format
`ELV-{etablissement_id}-{n}`, donc déjà unique par construction, et le login
élève s'en sert. Le passer par école n'apporterait rien.

### 4. Données réelles au moment de l'audit

Toutes les tables d'identité sont **vides**, sauf `ss_utilisateurs` (2 comptes)
et `ss_etablissements` (1). **Zéro doublon. Zéro compte multi-écoles.**
La migration sera donc indolore tant que ces volumes restent faibles — c'est un
argument pour ne pas trop tarder.

---

## Ce qui existe déjà et sera réutilisé (ne rien réinventer)

| Brique | Emplacement |
|---|---|
| Code public unique, stable | `Etablissement.code` |
| Résolution du code + message d'erreur conforme | `auth.py::_etablissement_du_code()` |
| Refus d'un identifiant ambigu (409, « indiquez le code ») | `auth.py::_exiger_un_seul()` |
| Unicité à portée réglable par table | `core/identifiants.py` (`par_ecole`) |
| Page de connexion avec champ code | `frontend/src/app/login/ecole/page.tsx` |
| Sélection d'établissement + jeton dédié | `POST /api/auth/etablissement-actif` |
| Refus explicite d'un compte sans école | `core/auth.py::require_etablissement` |

---

## Questions restées ouvertes, à trancher avant de reprendre

1. **Impact hors-ligne** — c'est la raison du report : que devient la file
   `offlineQueue` quand le contexte d'établissement change en cours de session ?
2. **Une seule page de connexion ou deux ?** Le §1 impose le code à tout compte
   tenant, y compris les admins qui passent aujourd'hui par `/login` sans code.
   Deux pages qui résolvent l'établissement différemment sont deux systèmes
   concurrents — à fusionner.
3. **SUPER_ADMIN** (`etablissement_id = NULL`) : un index composite
   `(etablissement_id, champ)` ne le contraint plus, PostgreSQL traitant les
   `NULL` comme distincts. Prévoir un index partiel dédié.

---

## En attendant : le seul point à surveiller

Rien ne casse aujourd'hui. **Au moment d'ouvrir la deuxième école**, si un
enseignant ou un parent y est inscrit avec un téléphone ou un e-mail déjà
présent ailleurs, la création échouera en 500.

Correctif minimal possible **sans** attendre le chantier complet : remplacer
les 5 index globaux des enseignants et parents par des index composites
`(etablissement_id, champ)`. C'est indépendant du reste et sans risque tant que
les tables sont vides.
