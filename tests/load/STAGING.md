# Monter un STAGING pour mesurer la capacité RÉELLE (iso-prod)

> Le local ne reflète pas la prod (machine plus puissante, pas de worker RQ).
> Pour connaître la **vraie** capacité, il faut un **staging iso-Render/Supabase**.
>
> ⚠️ **Je (l'assistant) ne peux pas provisionner ce staging** : ça passe par
> **tes comptes Render + Supabase** (et leur facturation). Ce guide te dit quoi
> créer ; ensuite tu me donnes l'**URL du staging** et je lance les paliers.

---

## 0. Règle d'or
- Un **projet Supabase SÉPARÉ** pour le staging. **JAMAIS** la base Supabase de
  prod (les écoles réelles). Le seeder crée des milliers de comptes de test.
- **`RATELIMIT_ENABLED=0`** sur le staging uniquement (sinon le login bride tout
  à ~5/min/IP et on ne mesure que des 429).
- Aucun envoi réel (SMS/e-mail), aucun paiement réel — à reconfirmer sur la cible.

## 1. Ce que tu provisionnes — guide pas-à-pas

Trois briques à créer, **dans cet ordre** : (A) la base Supabase de staging,
(B) le Redis de staging, (C) le service web de staging. Compte ~20–30 min.

> 🔴 **La règle qui prime sur tout** : la base Supabase du staging doit être un
> **NOUVEAU projet Supabase**, distinct de celui des vraies écoles. On va y créer
> des milliers de faux comptes ; ça ne doit JAMAIS toucher la prod.

---

### 1.A — Créer la base Supabase de STAGING

1. Va sur **https://supabase.com** → connecte-toi → **New project**.
2. Renseigne :
   - **Name** : `smartschool-staging` (un nom qui dit clairement « staging »).
   - **Database Password** : génère-en un fort et **garde-le** (il entre dans la
     chaîne de connexion). Ne le réutilise pas ailleurs.
   - **Region** : la même que la prod si possible (`Frankfurt (eu-central-1)` —
     comme le Render prod, region `frankfurt`) pour une latence comparable.
   - **Plan** : Free suffit pour commencer (⚠️ le Free a **peu de connexions** —
     c'est justement un facteur qu'on veut mesurer ; voir 1.E).
3. Attends que le projet soit « ready » (~2 min).
4. Récupère les infos de connexion : menu **Project Settings → Database**.
   - Section **Connection string** : choisis l'onglet **URI**. Tu verras DEUX
     familles d'adresses — c'est important (voir 1.E) :
     - **Direct connection** : hôte `db.<ref>.supabase.co`, port `5432`.
     - **Connection pooling (Supavisor)** : hôte `aws-0-<region>.pooler.supabase.com`,
       port **`6543`** (mode *Transaction*) ou **`5432`** (mode *Session*), et
       l'utilisateur devient `postgres.<ref>`.
   - Note aussi, dans **Settings → Database → Connection pooling**, le
     **Pool size / max connections** de ton plan (le Free est très limité).
5. **Crée le schéma** : rien à faire à la main — au **premier démarrage**,
   l'API SmartSchool crée toutes les tables toute seule (`create_all` +
   migrations au boot). Tu peux donc laisser la base vide ; le service web (1.C)
   la remplira au démarrage, puis le seeder ajoutera les données de test.

---

### 1.B — Créer le Redis de STAGING (sur Render)

1. Va sur **https://dashboard.render.com** → **New +** → **Redis** (ou *Key Value*).
2. Renseigne :
   - **Name** : `smartschool-redis-staging`.
   - **Region** : `Frankfurt` (même que le web service).
   - **Plan** : `starter` (comme la prod) si tu veux un plafond comparable ;
     `free` pour juste valider.
   - **Maxmemory Policy** : `allkeys-lru` ou `volatile-lru` (comme la prod).
3. Crée-le. Une fois prêt, ouvre-le et copie sa **Internal Connection String**
   (format `redis://...`). On la branchera automatiquement au web service si tu
   utilises le Blueprint (1.C, méthode 1), sinon tu la colleras à la main.

---

### 1.C — Créer le service web de STAGING (sur Render)

Deux méthodes. **La méthode 1 (Blueprint) est la plus simple** et la moins
risquée (aucune confusion avec la prod).

#### Méthode 1 — Blueprint (recommandée)

1. À la **racine du dépôt**, crée un fichier **`render.staging.yaml`** avec ce
   contenu (⚠️ un fichier SÉPARÉ — ne touche pas `render.yaml` de prod) :
   ```yaml
   # Staging SmartSchool — À DÉPLOYER SÉPARÉMENT DE LA PROD.
   services:
     - type: web
       name: smartschool-api-staging
       runtime: docker
       region: frankfurt
       dockerfilePath: ./Dockerfile.prod
       dockerContext: .
       dockerCommand: sh render_start.sh
       plan: starter          # même plan que la prod = vrai plafond prod
       healthCheckPath: /health
       autoDeployTrigger: off  # on ne veut pas de redéploiement auto en test
       disk:
         name: smartschool-staging-uploads
         mountPath: /app/uploads
         sizeGB: 1
       envVars:
         - key: DATABASE_URL          # Supabase STAGING (voir 1.E)
           sync: false
         - key: JWT_SECRET_KEY
           sync: false
         - key: JWT_ALGORITHM
           value: HS256
         - key: JWT_ACCESS_TOKEN_EXPIRE_MINUTES
           value: "480"
         - key: CORS_ORIGINS
           value: "*"               # staging uniquement
         - key: RATELIMIT_ENABLED
           value: "0"               # INDISPENSABLE pour mesurer (sinon 429 au login)
         - key: ENVIRONMENT
           value: staging
         - key: REDIS_URL
           fromService:
             type: redis
             name: smartschool-redis-staging
             property: connectionString
     - type: redis
       name: smartschool-redis-staging
       region: frankfurt
       plan: starter
       maxmemoryPolicy: volatile-lru
   ```
   > Si tu as déjà créé le Redis à l'étape 1.B, tu peux enlever le bloc `- type:
   > redis` ci-dessus ; Render réutilisera l'existant via le `fromService`.
2. Sur Render : **New +** → **Blueprint** → sélectionne ce dépôt → Render détecte
   les fichiers `*.yaml`. **Choisis `render.staging.yaml`** (surtout pas
   `render.yaml`). Valide.
3. Render te demandera les variables marquées `sync: false` : renseigne
   **`DATABASE_URL`** (voir 1.E) et **`JWT_SECRET_KEY`** (une valeur de test au
   hasard). Lance le déploiement.

#### Méthode 2 — Création manuelle (si tu préfères l'interface)

1. **New +** → **Web Service** → connecte le dépôt SmartSchool.
2. Réglages :
   - **Name** : `smartschool-api-staging`.
   - **Region** : `Frankfurt`. **Branch** : `main` (ou la branche à tester).
   - **Runtime** : **Docker**. **Dockerfile Path** : `./Dockerfile.prod`.
   - **Docker Command** : `sh render_start.sh`.
   - **Plan** : `Starter` (comme la prod).
   - **Health Check Path** : `/health`.
   - **Auto-Deploy** : **Off** (on ne veut pas de redéploiement pendant les tests).
   - **Disk** : ajoute un disque `1 GB` monté sur `/app/uploads`.
3. **Environment** → ajoute les variables du tableau en 1.D.
4. Crée le service.

---

### 1.D — Les variables d'environnement (où trouver chaque valeur)

| Variable | Valeur | Où la prendre |
|---|---|---|
| `DATABASE_URL` | `postgresql+pg8000://…` (voir **1.E**) | Supabase → Settings → Database → Connection string |
| `REDIS_URL` | `redis://…` | Auto-branché par le Blueprint, sinon Redis staging → Internal Connection String |
| `JWT_SECRET_KEY` | une longue chaîne aléatoire de test | invente-la (≠ celle de prod) |
| `JWT_ALGORITHM` | `HS256` | fixe |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | fixe |
| `CORS_ORIGINS` | `*` | staging uniquement |
| `RATELIMIT_ENABLED` | `0` | **obligatoire** pour le test |
| `ENVIRONMENT` | `staging` | fixe |

---

### 1.E — `DATABASE_URL` : le format exact (c'est le point délicat)

L'application se connecte avec le driver **`pg8000`**. La chaîne doit donc
commencer par **`postgresql+pg8000://`** (et **pas** `postgresql://` seul).

Prends la chaîne fournie par Supabase et adapte-la :

- **Le plus simple** : demande à ton ami (qui gère l'infra prod) le **format
  exact** utilisé en prod, et recopie-le **en changeant uniquement l'hôte, le
  mot de passe et l'utilisateur** pour ceux du **projet staging**. C'est la voie
  la plus sûre (SSL/pooler déjà validés en prod).
- **Sinon**, deux options selon ce que tu veux mesurer :
  - **A) Comme la prod** (pour un chiffre comparable) : reprends le **même mode
    de connexion** que la prod (direct ou pooler). Exemple pooler *transaction* :
    ```
    postgresql+pg8000://postgres.<ref>:<motdepasse>@aws-0-<region>.pooler.supabase.com:6543/postgres
    ```
  - **B) Pour tester si un pooler repousse le mur** : c'est justement la
    recommandation n°1 du rapport. Le **mode Transaction (port 6543)** de
    Supavisor découple les connexions applicatives du `max_connections` réel.
    On comparera A vs B pour voir si le point de rupture recule.

> ℹ️ Supabase exige le **SSL**. Le format prod le gère déjà ; si tu pars d'une
> chaîne neuve et que la connexion échoue au démarrage (`/health` reste en
> erreur, logs « SSL required »), dis-le-moi : on ajustera les paramètres de
> connexion (c'est un réglage à une ligne).

---

### 1.F — Vérifier que le staging est en ligne

1. Attends la fin du déploiement Render (logs « Application startup complete »).
2. Ouvre `https://<ton-service>.onrender.com/health` → tu dois voir :
   ```json
   {"status":"ok","database":"up","redis":"up"}
   ```
   - `database:"down"` → la `DATABASE_URL` est mauvaise (format pg8000 / mot de
     passe / hôte / SSL).
   - `redis:"down"` → la `REDIS_URL` n'est pas branchée.
3. Note le **`max_connections`** effectif de ta base staging (Supabase → Database)
   et le **plan** du web service : ce sont les deux chiffres qui déterminent le
   point de rupture.

---

### 1.G — Rappels avant de me passer la main

- [ ] `DATABASE_URL` pointe bien sur le **projet Supabase de staging** (vérifié à l'œil, deux fois).
- [ ] `RATELIMIT_ENABLED=0`.
- [ ] `/health` renvoie `database:"up"` **et** `redis:"up"`.
- [ ] Auto-Deploy **Off** (pas de redéploiement pendant les tests).

## 2. Ce que tu me donnes ensuite
- L'**URL du staging** (ex. `https://smartschool-api-staging.onrender.com`).
- Confirmation que c'est bien un **Supabase de test**, pas la prod.
- (Optionnel) accès en lecture aux métriques Render/Supabase/Redis pendant le run
  (pour corréler CPU/RAM/connexions — §15 de la mission).

## 3. Ce que JE fais alors
1. **Seeder** contre le Supabase staging (le garde-fou exige le flag explicite
   car ce n'est pas localhost — d'où l'importance que ce soit bien le staging) :
   ```bash
   DATABASE_URL="<supabase STAGING>" \
   python ../tests/load/scripts/seed_load_data.py --etablissements 5 --i-understand-this-is-not-prod
   ```
2. **Paliers** contre l'URL staging (progressifs, on s'arrête au point de rupture) :
   ```bash
   k6 run --env BASE_URL=https://smartschool-api-staging.onrender.com scenarios/smoke.js
   k6 run --env BASE_URL=... --env VUS=100 --env DURATION=2m scenarios/load.js
   k6 run --env BASE_URL=... --env VUS=500 ... scenarios/load.js
   k6 run --env BASE_URL=... scenarios/multi_tenant.js   # isolation
   k6 run --env BASE_URL=... --env MAX_RATE=... scenarios/breakpoint.js
   ```
3. **Observabilité** : je te demanderai des relevés Render/Supabase/Redis aux
   horodatages des paliers pour corréler (le harnais k6 ne voit que le HTTP).
4. **Nettoyage** : `--reset` supprime toutes les données `LOAD-` du staging.

## 4. Attendu (rappel des mesures locales, à confirmer en staging)
- 1er mur : **pool de connexions PostgreSQL** (20/worker) → à valider selon le
  `max_connections` Supabase staging et la présence d'un **pooler transaction-mode**.
- 2e : **login bcrypt** (CPU) sur ~0,5 vCPU du plan starter.
- **100 000 concurrents** : hors de portée d'une instance starter — il faudra
  mesurer combien d'instances + un pooler + réplicas seraient nécessaires.

## 5. Sécurité (checklist §20 avant le 1er run staging)
- [ ] `DATABASE_URL` = Supabase **de staging** (vérifié à l'œil).
- [ ] `RATELIMIT_ENABLED=0`.
- [ ] Données 100 % synthétiques (préfixe `LOAD-`).
- [ ] Pas de passerelle SMS/e-mail/paiement branchée.
- [ ] Disque : surveiller `/uploads` (PDF de test) — nettoyer si besoin.
- [ ] Kill-switch : `Ctrl+C` arrête k6 ; `--reset` nettoie la base.
