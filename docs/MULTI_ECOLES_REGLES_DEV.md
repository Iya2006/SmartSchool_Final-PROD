# SmartSchool est désormais multi-écoles — ce qui change pour vous

**À lire avant d'écrire la moindre route.** Ce document remplace toute
habitude prise avant le chantier multi-écoles.

L'application hébergeait implicitement **une seule école**. Elle héberge
maintenant **N écoles dans une seule base**, avec une isolation stricte imposée
au niveau FastAPI. Concrètement : une requête d'un compte de l'école A ne doit
JAMAIS pouvoir lire, modifier ou supprimer une donnée de l'école B.

Le chantier est terminé et validé (13 lots, ~330 tests d'isolation). Votre
travail consiste à **ne pas rouvrir les brèches qu'on vient de fermer**.

---

## 1. La règle unique

> **`etablissement_id` vient TOUJOURS du JWT. Jamais du client.**

Ni du corps de la requête, ni d'un paramètre d'URL, ni d'un en-tête, ni du
`localStorage`. Il est dérivé côté serveur au moment du login et signé dans le
token.

Tout le reste de ce document découle de cette phrase.

---

## 2. Écrire une route : la recette

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import require_etablissement
from app.core.database import get_db

router = APIRouter(prefix="/api/mon-module", tags=["Mon module"])


@router.get("")
def lister(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    return db.query(MonModele).filter(
        MonModele.etablissement_id == etablissement_id
    ).all()
```

Pour une ressource désignée par son identifiant, passez par un helper
d'appartenance — c'est la convention de tout le projet :

```python
def _mon_objet_ou_404(db: Session, objet_id: int, etablissement_id: int) -> MonModele:
    obj = db.query(MonModele).filter(
        MonModele.objet_id == objet_id,
        MonModele.etablissement_id == etablissement_id,
    ).first()
    if not obj:
        raise HTTPException(404, "Objet introuvable")
    return obj
```

**En création, écrasez toujours ce que le client a envoyé :**

```python
payload = data.model_dump()
payload["etablissement_id"] = etablissement_id   # jamais data.etablissement_id
```

---

## 3. Codes d'erreur — la convention du projet

| Situation | Code |
|---|---|
| Ressource appartenant à une **autre école** | **404** |
| Rôle insuffisant, ou identité qui n'est pas la sienne | **403** |
| Compte sans établissement déterminé (SUPER_ADMIN plateforme) | **403** |
| Identifiant de connexion déjà pris | **409** |

**404 et non 403 pour le cross-école** : répondre 403 confirmerait que la
ressource existe. On ne renseigne jamais une école sur le contenu d'une autre.

---

## 4. Les cinq pièges qui ont réellement causé des failles ici

### 4.1 — `if etablissement_id: query.filter(...)`
**INTERDIT.** Quand la valeur est `None`, le filtre disparaît et la requête
retourne toute la plateforme. Utilisez `require_etablissement`, qui refuse
explicitement (403) au lieu de laisser passer.

### 4.2 — `etablissement_id: int = 1` (paramètre, champ Pydantic, `default=`)
**INTERDIT.** C'était la cause n°1 des fuites : une valeur par défaut fait
travailler tout le monde dans l'école 1, ou permet à un client de désigner
l'école de son choix. Il n'en reste **aucune** occurrence exécutable — ne la
réintroduisez pas.

### 4.3 — `.first()` pour « choisir » une école
**INTERDIT.** Un parent peut avoir des enfants dans plusieurs écoles. Dériver
son établissement par `.first()` en désigne un au hasard. La règle : zéro ou
plusieurs écoles ⇒ `None`, et la route vérifie alors la filiation réelle via
`EleveParent → Eleve`.

### 4.4 — Valider uniquement le premier élément d'un lot
Vu en vrai sur `presences/batch` et `matieres-batch` : seul le premier élément
était contrôlé, un intrus glissé en 2ᵉ position passait. **Validez chaque
élément.**

### 4.5 — Compteurs et recherches globaux
`COUNT(*)` sur toute la table pour générer un numéro laisse une école déduire
le volume des autres. Chercher un cycle par son seul `code` rattache vos
données à l'école d'à côté. **Toute agrégation se filtre par établissement.**

---

## 5. Modèles : quelle catégorie ?

Avant d'ajouter une colonne `etablissement_id`, regardez à quelle famille
appartient votre modèle (classement complet dans `.ai/MULTI_TENANT_PLAN.md`) :

| Famille | Règle | Exemples |
|---|---|---|
| **GLOBAL** | partagé par toutes les écoles, **ne pas** rendre tenant | `Etablissement`, `TypeEvaluation`, `JournalComptable`, `CompteComptable` |
| **TENANT** | colonne `etablissement_id NOT NULL` | `Eleve`, `Classe`, `Enseignant`, `Facture` |
| **OWNERSHIP** | **pas** de colonne : isolé via sa relation réelle | `Note → Evaluation → Classe`, `Bulletin → Inscription → Eleve`, `Trimestre → AnneeScolaire`, `Matiere → Cycle`, `Exemplaire → Ouvrage` |

N'ajoutez pas une colonne redondante quand la relation suffit : elle finit
toujours par diverger de la vérité.

---

## 6. Identifiants et matricules

- **Les matricules sont générés**, jamais saisis :
  `app/core/matricules.py::generer_matricule`. Format
  `ELV-{etablissement_id}-{NNNNN}`, adossé à un compteur persistant qui ne
  recule jamais. **N'écrivez pas votre propre génération.**
- **Un identifiant de connexion est global.** Le login accepte 9 champs
  répartis sur 4 tables (`nom_utilisateur`, `email`, `telephone`,
  `telephone_1`, `matricule`…) et résout par `.first()`. Deux comptes
  partageant une valeur ⇒ le second ne peut plus jamais se connecter.
  À toute création de compte, appelez :

```python
from app.core.identifiants import exiger_identifiants_libres

exiger_identifiants_libres(db, [data.email, data.telephone])   # 409 si pris
```

---

## 7. Rôles et permissions

Deux niveaux, à ne pas confondre :

**a) Rôles — ils ouvrent les accès.**
```python
from app.core.auth import require_roles, ADMIN_TIER_ROLES

app.include_router(mon_router, dependencies=[Depends(require_roles(*ADMIN_TIER_ROLES))])
```
`require_roles` prend en compte le rôle principal **et** les rôles secondaires
du compte (`roles_secondaires`, portés par le JWT).

**b) Matrice de permissions — elle ne fait que RESTREINDRE.**
Configurée dans Paramètres > Sécurité, appliquée par `require_module` :
```python
app.include_router(mon_router, dependencies=[
    Depends(require_roles(*ADMIN_TIER_ROLES)),
    Depends(require_module("mon_module")),
])
```
Décocher une case ferme un accès. **Cocher une case n'en ouvre jamais un** que
le rôle refuse — sinon une ligne en base contournerait tout le contrôle fait
dans le code. Le module doit figurer dans `securite.py::SYSTEM_MODULES`.

---

## 8. Frontend

- L'établissement affiché vient de `AuthContext` → `user.etablissement_id`,
  renseigné par le serveur au login. **Ne le codez jamais en dur.**
- `AppContext.etablissementId` ne vaut `1` que tant que personne n'est
  connecté (page de login).
- Les anciens appels envoient encore `?etablissement_id=…` : le backend les
  **ignore**. Inutile de les nettoyer, mais n'en ajoutez pas de nouveaux.
- `roleAccess.ts` reste la source de vérité de la navigation par rôle. Une
  nouvelle page réservée = un préfixe à ajouter aux rôles concernés.

---

## 9. Tester votre travail

Chaque module a sa suite d'isolation (`backend/tests/test_lot*_*.py`) — copiez
le fichier le plus proche du vôtre comme modèle. Le patron : deux écoles A et
B, puis on tente depuis A d'atteindre les données de B.

```bash
# Suite complète (Python 3.12 requis — image Docker prête)
docker run --rm -v "<chemin>/backend:/app" -w //app smartschool-tests:local \
  python -m pytest tests/ -q
```

**Trois tests minimum pour toute nouvelle route :**
1. lecture cross-école → 404 ;
2. écriture cross-école → 404, **et la donnée de B est inchangée en base** ;
3. création → l'objet est rattaché à l'école de l'appelant, même si le corps
   demandait une autre école.

`backend/tests/test_isolation_multi_ecole.py` regroupe les 15 scénarios
transverses obligatoires : si votre travail les casse, c'est une régression
d'isolation, pas un test à ajuster.

---

## 10. Migrations

Pas d'Alembic. Scripts autonomes dans `backend/migrations/`, sur le modèle des
existants. Trois exigences non négociables :

- **Re-vérifier l'état à l'exécution** (compter les lignes, chercher les
  doublons) et **s'arrêter sans rien modifier** si la condition n'est pas
  remplie — un audit fait la veille ne prouve rien.
- **Idempotence** : `IF NOT EXISTS`, relecture avant écriture. Une migration se
  rejoue sans dégât.
- **Jamais de backfill automatique.** Pas de
  `UPDATE ... SET etablissement_id = 1`. Si des données existent et qu'il faut
  décider à qui elles appartiennent, la migration s'arrête et **liste** le
  problème : c'est une décision humaine.

---

## 11. Ce qui reste ouvert

- **Rôles personnalisés** : créables dans Paramètres > Sécurité mais non
  attribuables (le formulaire Personnel a une liste figée), et sans effet
  puisque la matrice ne peut que restreindre.
- **Page de login** : affiche la marque de l'établissement 1, un visiteur
  anonyme n'ayant pas d'école. Nécessiterait un sous-domaine par école ou un
  sélecteur — décision produit.
- **Parents partageant un téléphone** : `telephone_1` étant l'identifiant de
  connexion, il est unique. Un couple partage un compte, ou utilise le second
  numéro.

---

## 12. Où chercher

| Question | Fichier |
|---|---|
| Classement GLOBAL / TENANT / OWNERSHIP | `.ai/MULTI_TENANT_PLAN.md` |
| État d'ensemble, verdict, réserves | `.ai/SYNTHESE_FINALE.md` |
| Détail d'un module précis | `.ai/LOT{0..12}_RAPPORT.md` |
| Primitives d'isolation | `backend/app/core/auth.py` |
| Génération de matricules | `backend/app/core/matricules.py` |
| Unicité des identifiants | `backend/app/core/identifiants.py` |

**En cas de doute sur un cas non couvert ici : ne devinez pas.** Les failles
corrigées venaient presque toutes d'un raccourci qui semblait raisonnable sur
le moment.
