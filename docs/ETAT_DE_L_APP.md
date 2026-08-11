# État de l'application — reprise du développement en équipe

*Point de situation à la clôture du chantier multi-écoles.*

Le développement des autres fonctionnalités avait été gelé le temps de ce
chantier. **Il peut reprendre.** Ce document dit où en est l'application, ce
qui a changé sous vos pieds, et sur quoi vous pouvez construire sans risque.

👉 **Avant de coder : lisez [`MULTI_ECOLES_REGLES_DEV.md`](./MULTI_ECOLES_REGLES_DEV.md).**
C'est court, et ça évite de rouvrir des failles qu'on vient de fermer.

---

## 1. Ce qui a changé, en une phrase

L'application hébergeait **une école**. Elle héberge maintenant **N écoles dans
une seule base**, et chaque requête est cloisonnée à l'école du compte
connecté.

Le changement est **structurel** : il touche ~280 routes réparties sur une
quarantaine de fichiers. Aucune fonctionnalité métier n'a été retirée ni
réécrite — c'est un durcissement, pas une refonte.

---

## 2. Ce qui est acquis et testé

| Domaine | État |
|---|---|
| Isolation des données entre écoles | ✅ 13 lots, ~330 tests dédiés |
| Identité du compte (JWT) | ✅ porte `etablissement_id` + `roles_secondaires` |
| Matricules | ✅ générés par école, compteur qui ne recule jamais |
| Identifiants de connexion | ✅ unicité vérifiée sur 9 champs / 4 tables |
| Rôles et permissions | ✅ appliqués (rôles secondaires inclus) |
| Migrations | ✅ 6, exécutées et rejouées (idempotentes) |
| Frontend | ✅ affiche l'école du compte, plus l'école 1 en dur |

**Suite backend : 477+ tests verts. Frontend : 102 tests, `tsc` propre, build
de production OK.** Non touchés et intacts : offline/IndexedDB/PWA, RQ/Redis,
génération PDF, monitoring.

---

## 3. Stack et lancement (inchangés)

FastAPI + SQLAlchemy + PostgreSQL (Supabase) · Next.js 16 / React 19 /
TypeScript · Redis + RQ · PWA Serwist.

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8500

# Frontend
cd frontend && npm run dev

# Suite de tests backend — Python 3.12 requis, image Docker prête
docker run --rm -v "<chemin>/backend:/app" -w //app smartschool-tests:local \
  python -m pytest tests/ -q
```

⚠️ **Le Python local en 3.11 ne suffit plus** pour lancer la suite : passez par
l'image `smartschool-tests:local`.

---

## 4. Les cinq choses à savoir avant votre première route

1. **`etablissement_id` vient du JWT.** Jamais du corps, de l'URL, d'un
   en-tête ou du `localStorage`.
2. **Une ressource d'une autre école renvoie 404**, pas 403 — on ne confirme
   jamais son existence.
3. **`etablissement_id: int = 1` est interdit** sous toutes ses formes
   (paramètre, champ Pydantic, `default=` de colonne). Il n'en reste aucune
   occurrence : ne la réintroduisez pas.
4. **N'écrivez pas votre propre génération de matricule** —
   `app/core/matricules.py` s'en charge.
5. **Appelez `exiger_identifiants_libres()` à toute création de compte** —
   sinon le nouveau compte peut rendre un autre inconnectable.

Le détail, avec les recettes de code, est dans
[`MULTI_ECOLES_REGLES_DEV.md`](./MULTI_ECOLES_REGLES_DEV.md).

---

## 5. Ce sur quoi vous pouvez construire sans crainte

Ces primitives sont stables, testées, et à réutiliser plutôt qu'à réinventer :

| Besoin | À utiliser |
|---|---|
| Filtrer par école | `Depends(require_etablissement)` |
| Restreindre par rôle | `require_roles(*ADMIN_TIER_ROLES)` |
| Appliquer la matrice de permissions | `require_module("mon_module")` |
| Route publique avec contenu réduit | `etablissement_optionnel` |
| Générer un matricule | `generer_matricule(...)` |
| Vérifier un identifiant de connexion | `exiger_identifiants_libres(...)` |

---

## 6. Points ouverts — à connaître, pas bloquants

| Point | Impact | Décision attendue |
|---|---|---|
| Rôles personnalisés non attribuables | la page laisse les créer, ils n'ouvrent rien | produit |
| Page de login à la marque de l'école 1 | un visiteur anonyme n'a pas d'école | produit (sous-domaine ou sélecteur) |
| Parents partageant un téléphone | un seul compte possible, le n° est l'identifiant | exploitation |
| Granularité des permissions | par module, pas par sous-écran | produit |

Aucun ne bloque le développement de nouvelles fonctionnalités.

---

## 7. Si vous touchez à un module déjà traité

Chaque module a son rapport dans `.ai/LOT{0..12}_RAPPORT.md` : il liste ce qui
a été corrigé et **pourquoi**. Lisez celui de votre module avant d'y toucher —
plusieurs corrections ne sont pas devinables depuis le code seul (contamination
inter-écoles, scan QR sans frontière, prise de contrôle de compte parent…).

Si un test d'isolation existant échoue à cause de votre travail : **c'est une
régression de sécurité, pas un test à ajuster.**

---

## 8. Où est le code de ce chantier

Branche **`chantier/multi-ecoles`**, à réviser puis fusionner dans `main`.
Tant qu'elle n'est pas fusionnée, développez à partir de cette branche plutôt
que de `main` — sinon vous travaillerez sur l'ancienne architecture et vos
routes seront à reprendre.
