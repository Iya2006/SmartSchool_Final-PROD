# Guide de déploiement — SmartSchool (préproduction)

Architecture cible :

```
Frontend (Next.js)  →  Vercel
API + worker RQ      →  Render (render.yaml, à la racine du dépôt)
PostgreSQL           →  Supabase
Redis                →  Render (service redis, dans render.yaml)
```

Tout ce qui pouvait être préparé sans secrets a été fait (fichiers de
config, script de démarrage, correctifs de compatibilité). Ce guide couvre
uniquement ce qui nécessite vos propres identifiants/comptes.

---

## Étape 1 — Supabase (base de données)

1. Créer un projet sur [supabase.com](https://supabase.com) (choisir une
   région proche de vos utilisateurs, ex. `eu-west-1` pour l'Afrique de
   l'Ouest si disponible, sinon la plus proche).
2. Une fois le projet créé, notez le **mot de passe de la base** défini à
   la création (ou réinitialisez-le dans *Project Settings → Database*).
3. Toujours dans *Project Settings → Database*, section **Connection
   string**, choisissez l'onglet **Transaction pooler** (port `6543`) —
   recommandé pour ce projet, voir la note ci-dessous. Copiez l'URI, elle
   ressemble à :
   ```
   postgresql://postgres.xxxxxxxxxxxx:[MOT-DE-PASSE]@aws-0-xxxxx.pooler.supabase.com:6543/postgres
   ```
4. Adaptez-la au format attendu par le projet (driver `pg8000`, déjà
   utilisé partout dans le code — ne pas changer) :
   ```
   postgresql+pg8000://postgres.xxxxxxxxxxxx:[MOT-DE-PASSE]@aws-0-xxxxx.pooler.supabase.com:6543/postgres
   ```
   → C'est la valeur de `DATABASE_URL` à saisir dans Render à l'étape 2.

**Pourquoi le pooler (6543) plutôt que la connexion directe (5432)** :
Supabase limite le nombre de connexions directes simultanées ; le pooler
(PgBouncer) est prévu pour ce type d'usage. Le code utilise déjà `pg8000`
(pas `psycopg2`), moins sensible aux limitations habituelles de PgBouncer
en mode transaction. `backend/app/core/database.py` a été ajusté cette
session (`pool_pre_ping`, `pool_recycle=300`, taille de pool réduite) pour
rester robuste derrière ce pooler — vérifié réellement (suite de tests
complète toujours verte après ce changement).

**Schéma de base de données** : aucune étape manuelle nécessaire. L'API
crée automatiquement toutes les tables au premier démarrage
(`Base.metadata.create_all()`, dans `backend/main.py`). Si la toute
première tentative échoue à cause du pooler (rare), redémarrez une fois
le service Render avec `DATABASE_URL` pointée sur le port `5432` (connexion
directe) le temps que les tables soient créées, puis repassez sur `6543`.

---

## Étape 2 — Render (API + worker + Redis)

1. Sur [render.com](https://render.com), **New → Blueprint**, connectez le
   dépôt GitHub `SmartSchool_Final-PROD`. Render détecte automatiquement
   `render.yaml` à la racine et propose de créer 2 services :
   `smartschool-api` (web) et `smartschool-redis` (redis).
2. Avant de valider, Render vous demandera les variables marquées
   `sync: false` dans `render.yaml`. Renseignez :
   - **`DATABASE_URL`** : la valeur préparée à l'étape 1.
   - **`JWT_SECRET_KEY`** : générez une valeur aléatoire forte, par exemple
     en local :
     ```bash
     python -c "import secrets; print(secrets.token_hex(32))"
     ```
     Copiez le résultat tel quel. **Ne réutilisez jamais** une valeur
     d'exemple ou déjà vue dans ce dépôt.
   - **`CORS_ORIGINS`** : laissez vide pour l'instant, à revenir remplir
     après l'étape 3 (une fois l'URL Vercel connue) — sinon la landing
     Vercel ne pourra pas appeler l'API (erreurs CORS).
3. Validez. Render construit l'image (`Dockerfile.prod`, ~2-3 minutes),
   démarre `smartschool-api` (qui lance l'API **et** le worker RQ dans le
   même conteneur via `backend/render_start.sh` — voir l'encadré
   ci-dessous) et `smartschool-redis`.
4. Une fois déployé, notez l'URL publique du service `smartschool-api`
   (ex. `https://smartschool-api.onrender.com`) — nécessaire à l'étape 3.

> **Pourquoi API + worker dans le même service Render, plutôt que deux
> services séparés comme sur `docker-compose.prod.yml` ?** Render attache
> un disque persistant à un seul service à la fois, jamais partagé entre
> plusieurs. Le worker écrit les bulletins PDF générés dans
> `/app/uploads/bulletins/`, et l'API sert ensuite ces mêmes fichiers
> depuis `/app/uploads` — sur deux services séparés, chacun aurait son
> propre disque et le fichier généré par le worker serait invisible pour
> l'API. Les regrouper dans un seul conteneur (`render_start.sh`) est la
> solution la moins invasive pour ce premier déploiement. Limite connue,
> assumée : impossible de scaler API et worker indépendamment tant que le
> stockage des fichiers n'est pas déplacé vers un stockage objet (ex.
> Supabase Storage) — à envisager si le volume réel le justifie, pas fait
> maintenant faute de nécessité démontrée.

---

## Étape 3 — Vercel (frontend)

1. Sur [vercel.com](https://vercel.com), **Add New → Project**, importez
   le même dépôt GitHub. Vercel détecte Next.js automatiquement.
2. **Root Directory** : indiquez `frontend` (le projet Next.js n'est pas à
   la racine du dépôt).
3. Dans **Environment Variables**, ajoutez :
   - **`NEXT_PUBLIC_API_URL`** = l'URL Render notée à l'étape 2
     (ex. `https://smartschool-api.onrender.com`).
4. Déployez. Le script `npm run build` du projet utilise déjà
   `next build --webpack` (nécessaire pour générer le Service Worker
   PWA — vérifié dans `frontend/package.json`, aucune configuration Vercel
   supplémentaire requise).
5. Une fois déployé, notez l'URL Vercel (ex.
   `https://smartschool-xxxx.vercel.app`).

---

## Étape 4 — Reconnecter CORS

Retournez dans Render → service `smartschool-api` → **Environment**, et
renseignez `CORS_ORIGINS` avec l'URL Vercel exacte de l'étape 3 :

```
CORS_ORIGINS=https://smartschool-xxxx.vercel.app
```

(Plusieurs origines possibles, séparées par des virgules, si vous avez un
domaine personnalisé en plus de l'URL `.vercel.app`.) Enregistrez — Render
redéploie automatiquement le service avec la nouvelle valeur.

---

## Étape 5 — Créer le premier compte administrateur

Il n'existe volontairement aucun endpoint d'inscription libre pour un
compte administrateur (seul un compte déjà admin peut en créer d'autres
depuis l'interface). Un script dédié a été préparé cette session :
`backend/create_admin.py` — testé réellement avant d'être inclus ici.

Depuis votre machine, avec `DATABASE_URL` pointée sur Supabase (la même
valeur qu'à l'étape 1) :

```bash
cd backend
export DATABASE_URL="postgresql+pg8000://postgres.xxxx:[MOT-DE-PASSE]@aws-0-xxxx.pooler.supabase.com:6543/postgres"
python create_admin.py
```

Suivez les invites (nom d'utilisateur, nom, prénom, mot de passe saisi
masqué). Le compte créé a le rôle `SUPER_ADMIN`.

---

## Étape 6 — Vérifications post-déploiement

1. `https://smartschool-api.onrender.com/health` → doit renvoyer
   `{"status":"ok","database":"up","redis":"up"}`.
2. Se connecter sur le frontend Vercel avec le compte créé à l'étape 5.
3. `https://smartschool-api.onrender.com/api/monitoring` avec le token
   admin (via `/docs` — Swagger UI intégré à FastAPI, `Authorize` en haut
   à droite) → doit montrer `workers.total: 1` (le worker RQ du même
   conteneur, détecté).
4. Tester un vrai parcours métier (créer un élève, générer un bulletin) —
   pas seulement les endpoints techniques.

---

## Limites connues à surveiller (pas bloquantes, mais à garder en tête)

- **Sauvegardes** : Supabase propose des sauvegardes automatiques
  seulement à partir du plan payant Pro — vérifier que le plan choisi les
  inclut avant d'y stocker de vraies données d'école.
- **Stockage des fichiers** : tant que le worker et l'API restent dans le
  même service Render (voir Étape 2), le stockage local suffit. Si vous
  séparez un jour les deux services, il faudra migrer vers un stockage
  objet (S3-compatible, ex. Supabase Storage).
- **Connexions Supabase** : le pool applicatif est volontairement réduit
  (`pool_size=5, max_overflow=5`, voir `backend/app/core/database.py`) —
  suffisant pour un premier pilote avec une école ; à revoir seulement si
  des erreurs de connexion apparaissent réellement en usage.
- **Plan Render "starter"** : suffisant pour valider, mais s'endort après
  une période d'inactivité sur certains plans gratuits — vérifiez le plan
  choisi si la réactivité au premier accès de la journée est importante.

---

## Fichiers créés/modifiés pour ce déploiement

- `render.yaml` (nouveau) — Blueprint Render (API+worker+Redis).
- `backend/render_start.sh` (nouveau) — démarrage combiné API+worker,
  utilisé uniquement par Render (`Dockerfile.prod` et
  `docker-compose.prod.yml` restent inchangés pour un déploiement Docker
  self-hosted classique).
- `backend/create_admin.py` (nouveau) — création du premier compte admin,
  testé réellement.
- `backend/app/core/database.py` (modifié) — pool de connexions adapté à
  un Postgres managé distant (`pool_pre_ping`, `pool_recycle`), vérifié
  sans régression sur la suite de tests complète.
- `.env.example` / `frontend/.env.example` (modifiés/nouveau) — exemples
  de valeurs pour Supabase/Render/Vercel, aucune vraie valeur.
