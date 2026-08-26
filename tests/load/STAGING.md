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

## 1. Ce que tu provisionnes (côté Render)
Un **2e service web Render** (staging), même image que la prod, mais :
- `name: smartschool-api-staging`
- `plan` : **le MÊME que la prod** (`starter`) si tu veux le vrai plafond prod ;
  ou un plan supérieur si tu veux tester une cible dimensionnée.
- Variables (Dashboard Render, jamais commitées) :
  ```
  DATABASE_URL   = <ton Supabase de STAGING>   # PAS la prod
  REDIS_URL      = <Redis Render staging>       # créer un 2e Redis staging
  JWT_SECRET_KEY = <un secret de test>
  CORS_ORIGINS   = *                            # staging seulement
  RATELIMIT_ENABLED = 0
  ENVIRONMENT    = staging
  ```
- Blueprint indicatif (à adapter, NE PAS écraser `render.yaml` de prod) :
  ```yaml
  services:
    - type: web
      name: smartschool-api-staging
      runtime: docker
      dockerfilePath: ./Dockerfile.prod
      dockerCommand: sh render_start.sh
      plan: starter
      healthCheckPath: /health
      envVars:
        - { key: DATABASE_URL, sync: false }      # Supabase STAGING
        - { key: REDIS_URL, fromService: { type: redis, name: smartschool-redis-staging, property: connectionString } }
        - { key: JWT_SECRET_KEY, sync: false }
        - { key: CORS_ORIGINS, value: "*" }
        - { key: RATELIMIT_ENABLED, value: "0" }
        - { key: ENVIRONMENT, value: staging }
    - type: redis
      name: smartschool-redis-staging
      plan: starter
      maxmemoryPolicy: volatile-lru
  ```
- Côté Supabase staging : note le `max_connections` du plan et le **pooler**
  (Supavisor) — c'est le facteur clé du point de rupture.

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
