# PERFORMANCE_AUDIT.md — SmartSchool

> **Étape 1 de la mission « Audit de performance et tests de charge ».**
> **Aucun test de charge n'a été exécuté.** Audit **statique** du code et de la
> configuration réels du dépôt. Ce qui dépend du serveur hébergé (CPU/RAM
> réels, limites Supabase/Render) est marqué **[À CONFIRMER SERVEUR]** — je n'ai
> pas accès à l'infra de production.

Date : 2026-08-25 · Branche : `sams`

---

## 0. Résumé exécutif (à lire en premier)

- **Le code est déjà pensé pour la montée en charge** : pool de connexions
  aligné sur le pool de threads (`main.py::_aligner_capacite_de_traitement`),
  anti-N+1 sur les gros calculs, gzip, cache Redis pour les dashboards, et
  **file de tâches RQ** pour tout ce qui est lourd (PDF de bulletins, calcul
  des moyennes). Ce n'est **pas** là qu'est la limite.
- **La limite est l'INFRASTRUCTURE de production, pas le code.** La prod tourne
  sur **Render plan `starter`, UNE seule instance**, avec **2 workers uvicorn +
  1 worker RQ dans le même conteneur**, une base **Supabase** externe (driver
  **pg8000, 100 % Python**), et un **Redis `starter`**.
- **100 000 utilisateurs concurrents est hors de portée de la prod actuelle**
  de plusieurs ordres de grandeur. Estimation réaliste du plafond **stable** de
  cette topologie : **quelques dizaines à bas-quelques-centaines** d'utilisateurs
  actifs simultanés. Le point de rupture sera atteint d'abord sur **le CPU du
  conteneur** (2 workers sync sur ~0,5 vCPU) et/ou **les connexions Supabase**.
  Les tests serviront à **mesurer** ce plafond précisément — pas à le « faire
  passer ».
- **Aucun environnement de staging n'existe dans le dépôt.** ⚠️ On ne peut donc
  **PAS** lancer de test de charge tout de suite : il faut d'abord une **cible
  de test dédiée** (jamais la prod des vraies écoles).

---

## 1. Backend

| Élément | Constat | Source |
|---|---|---|
| Framework | **FastAPI**, servi par **uvicorn** (`--loop uvloop --http httptools`). | `render_start.sh` |
| Serveur prod | `uvicorn main:app --workers 2` **+** `rq worker default &` **dans le même conteneur**. | `render_start.sh` |
| Workers web | **2** (pas de gunicorn). | `render_start.sh` |
| Mode | **Synchrone partout.** ~464 handlers `@router`, ~10 `async def` seulement (middlewares/handler d'exception). Les routes tournent dans le **threadpool anyio**. | `app/api/*` |
| Concurrence/process | Threadpool **aligné au démarrage** sur `DB_CAPACITE = pool_size+max_overflow = 20`. → **~20 requêtes simultanées/worker**, **~40 pour l'instance** (2 workers). Au-delà, les requêtes **font la file dans l'app** (pas d'erreur 500 sur le pool DB). | `main.py`, `database.py` |
| Middlewares | SecurityHeaders, CORS (`CORS_ORIGINS`), **GZip** (`minimum_size=500`), **rate-limit slowapi**. | `main.py` |
| Auth | **JWT HS256**, expiration **480 min (8 h)**. **4 portails/logins séparés** : admin, parent, enseignant, élève. `get_current_user` + matrice `ss_permissions` + rôles. | `render.yaml`, `main.py`, `auth.py` |
| Démarrage | `create_all` + `rattraper_colonnes_manquantes` + `ALTER … DROP NOT NULL` **à CHAQUE démarrage** (idempotent). | `main.py` |
| Erreurs | Toute exception non gérée est **journalisée en base** (`incidents`), session DB dédiée. Sous charge d'erreurs → écritures DB supplémentaires. | `main.py` |
| Statique | `/uploads` servi par l'app (PDF/photos), même conteneur que l'API et le worker. | `main.py`, `render_start.sh` |

### Endpoints par coût

- **Auth** : `/api/auth/login` + `/api/portail-{parent,enseignant,eleve}/login`.
  Hachage mot de passe (CPU/login) + JWT. **Rate-limité** (login, ~5/min/IP).
- **Lecture légère (paginée, souvent cachée)** : `/api/eleves`, `/api/enseignants`,
  `/api/classes`, `/api/dashboard/*` (**cache Redis**), `/api/evaluations/centralisees`,
  portails (notes, emploi du temps, bulletins déjà calculés).
- **Lecture lourde (CPU, anti-N+1)** : `GET /api/evaluations/classe/{id}/notes-centralisees`,
  `resultats-intermediaires`, `resultats-annuels` — coût ∝ `effectif × matières`.
- **Écriture** : élève, inscription, notes en lot (`/notes/batch-update`),
  présences en lot (`/vie-scolaire/presences/batch`), appel de séance, pointage
  agent (`/presences-agents/scan|manuel`), finance (factures/paiements/dépenses),
  messages.
- **PDF / Excel (CPU/mémoire — ReportLab/openpyxl)** : bulletins, fiche de
  classement, cartes/badges, certificats, exports. Les plus lourds ont une
  **variante `…-async`** via **RQ**.
- **Tâches RQ** : `…/pdf-async`, `calculer-moyennes-async`,
  `calculer-moyennes-annuelles-async` (repli synchrone si Redis KO).
- **Sync offline** : `/api/sync/*` (delta notes & présences — cf. §12 « sync storm »).
- **Appels externes** : **aucun** appel HTTP sortant bloquant identifié dans le
  chemin des requêtes (pas de SMS/e-mail/PSP branché dans le code du dépôt).
  `docker-compose.prod.yml` cite ES/MinIO/Keycloak/Tesseract, mais **`render.yaml`
  (la prod réelle) ne les utilise pas**. **[À CONFIRMER SERVEUR]**

---

## 2. Base de données

| Élément | Constat |
|---|---|
| SGBD | **PostgreSQL hébergé sur Supabase** (`render.yaml` : base « séparée sur Supabase », `DATABASE_URL` saisi à la main). |
| Driver | **`pg8000`** (`postgresql+pg8000://…`) — **100 % Python**, plus lent que psycopg2/asyncpg. **Piste d'optimisation** (ne PAS changer avant mesure). |
| Pool/process | `pool_size=15`, `max_overflow=5` → **20 conn/process** ; `pool_timeout=10 s`, `pool_pre_ping=True`, `pool_recycle=300 s`. Réglables par env. |
| Connexions totales | 2 workers × 20 = **40** + worker RQ + migrations démarrage. Règle documentée : `nb_process × (pool_size+max_overflow) ≤ max_connections`. |
| `max_connections` réel | **[À CONFIRMER SERVEUR]** — dépend du plan Supabase et du **pooler Supavisor** (mode transaction/session). **Candidat n°1 au point de rupture.** |
| Tables | **76** (`__tablename__`). |
| Index | Dans les modèles **et** migrations de perf dédiées (`2026_08_perf_01_index_notation`, `perf_02_index_gestion`, `perf_02_index_montee_en_charge`, `notation_05_bulletin_index_unique`). |
| Isolation | Multi-école par `etablissement_id` dénormalisé + contrôles par route (Lot 9). **À tester explicitement sous charge** (fuite cross-tenant = échec critique). |
| N+1 | Traqué activement sur les gros calculs (préchargement batch). À revérifier sous charge sur les chemins secondaires. |
| Transactions/verrous | Calcul de moyennes = delete+recreate `BulletinLigne` + upsert `Bulletin` → écriture par classe ; surveiller les locks en concurrence multi-classes. |

---

## 3. Redis / RQ

| Élément | Constat |
|---|---|
| Redis | **Render Redis `starter`**, `maxmemory-policy volatile-lru`. Mémoire petite **[À CONFIRMER SERVEUR]**. Sert **le cache** (`cache.py`) **et** la file **RQ** (`task_queue.py`). |
| Queues | **Une seule** : `default`. |
| Workers RQ | **1** (`rq worker … default`). **Saturation probable** : un seul worker pour tous les PDF/calculs. |
| TTL résultats | **24 h** → accumulation Redis à surveiller au soak test. |
| Panne | `get_queue()` **lève** si Redis KO → endpoint **503** (pas de perte silencieuse) ; le cache, lui, dégrade en silence. |
| Jobs critiques | PDF bulletins en masse, calcul moyennes période/annuel (CPU+mémoire ReportLab, **même conteneur** que l'API). |

---

## 4. Frontend (Next.js)

- API via `lib/api.ts` (axios, JWT en **`localStorage`** — pas de cookies).
- **Pages/flux lourds** (plusieurs appels simultanés au montage) :
  - **Dashboard admin** : KPIs + stats (parallèle, **cache Redis** côté serveur).
  - **Centralisation des notes** : classes + trimestres + stats + types +
    calendrier en parallèle, puis `notes-centralisees` (lourd) à la sélection.
  - **Résultats de fin d'année**, **Bulletins**, **Finance/Comptabilité**,
    **Portails** parent/élève/enseignant, **Emploi du temps**, **Séances (appels)**,
    **Pointage** (scan → `journee`).
- **Sync offline** (`syncEngine.ts`, `offlineQueue.ts`) : rejoue notes/présences
  au retour de connexion → source du **« sync storm »**.

---

## 5. Infrastructure (prod réelle = Render Blueprint)

D'après `backend/render.yaml` :

| Composant | Config déclarée | Remarque |
|---|---|---|
| Service API | `type: web`, `runtime: docker`, `region: frankfurt`, **`plan: starter`**, `dockerCommand: sh render_start.sh` | **1 instance**. Render Starter ≈ **0,5 vCPU / 512 Mo** **[À CONFIRMER SERVEUR]**. |
| Contenu conteneur | uvicorn `--workers 2` **+** `rq worker` | API + worker **partagent** CPU/RAM/disque. |
| Disque | 1 Go persistant `/app/uploads` | **Risque disque plein** si PDF/exports de test non nettoyés. |
| Base | **Supabase** (externe) | Limite connexions/pooler **[À CONFIRMER SERVEUR]**. |
| Redis | Render Redis **`starter`**, `volatile-lru` | Petite mémoire **[À CONFIRMER SERVEUR]**. |
| JWT | HS256, 480 min | — |
| Rate limit | **`RATELIMIT_ENABLED=1`** en prod | voir ci-dessous. |
| Reverse proxy / timeout | Géré par Render (hors dépôt) | Timeout requête Render **[À CONFIRMER SERVEUR]**. |
| Descripteurs / connexions OS | **[À CONFIRMER SERVEUR]** | conteneur Render. |

### Rate limiting — crucial pour les tests

- `Limiter` créé **sans `default_limits`** → **pas de limite globale**. Le
  rate-limit ne s'applique **qu'aux endpoints décorés** (typiquement le
  **login**, ~5/minute).
- `key_func = get_remote_address` → limite **par IP**. Derrière le proxy Render,
  toutes les requêtes peuvent partager l'IP du proxy si `X-Forwarded-For` n'est
  pas exploité → un test k6 depuis une IP serait **throttlé sur le login**. **[À VÉRIFIER]**
- **Implication** : les tests d'auth doivent tourner sur un **staging avec
  `RATELIMIT_ENABLED=0`**, ou avec des **tokens pré-générés** (ne pas se
  relogguer à chaque itération).

---

## 6. Ordre de rupture attendu (hypothèses à valider par la mesure)

1. **CPU du conteneur Render** (2 workers sync + RQ sur ~0,5 vCPU, driver pg8000
   Python) — probable **1er bottleneck** sur trafic mixte.
2. **Connexions Supabase / pooler** — 2e mur si beaucoup de requêtes DB concurrentes.
3. **Worker RQ unique** — la file `default` s'allonge dès qu'on enchaîne PDF/calculs.
4. **Mémoire Redis starter** — cache + résultats de jobs (TTL 24 h).
5. **Disque `/uploads` 1 Go** — si les PDF de test s'accumulent.
6. **RAM 512 Mo** — 2 workers + RQ + ReportLab.

---

## 7. Pré-requis AVANT tout test de charge (bloquants — §20 de la mission)

1. **Cible de test dédiée** (staging séparé, ou copie locale). ⚠️ **Jamais la
   prod des vraies écoles.** Aucun staging n'est déclaré → **à créer/fournir**.
2. `RATELIMIT_ENABLED=0` sur la cible (sinon 429 sur le login).
3. **Données 100 % synthétiques**, isolées par établissement.
4. **Aucun envoi réel** (SMS/e-mail) — non branché dans le code, à reconfirmer sur la cible.
5. **Aucun paiement réel** déclenchable (finance = écritures internes, pas de PSP — à reconfirmer).
6. **Jobs RQ dangereux neutralisés/mockés** + **nettoyage des PDF** générés (disque 1 Go).
7. **Kill-switch** (arrêt immédiat) et accès aux métriques serveur (Render/Supabase/Redis) **pendant** le test.

---

## 8. Prochaines étapes (en attente de ton feu vert — je ne poursuis pas sans)

1. **Choisir la cible** : staging dédié (recommandé) **ou** environnement local
   (Docker Postgres + Redis + l'API) pour un premier smoke/breakpoint **sans
   risque prod**. → *décision requise.*
2. Mettre en place **k6** dans `tests/load/` (config/scenarios/data/results/
   scripts), `BASE_URL` configurable, jamais d'URL prod en dur.
3. **Dataset synthétique multi-écoles** respectant l'isolation.
4. **Profils** (admin/enseignant/parent/élève) + scénarios **arrival-rate** et
   **VUs constants** (distinguer VUs / RPS).
5. **Paliers progressifs** (smoke → 100 → 500 → 1 000 …), en **s'arrêtant au
   point de rupture réel** — on **mesure**, on ne « vise » pas 100 000.
6. Corréler k6 ⇄ CPU/RAM ⇄ Supabase ⇄ Redis ⇄ RQ → **`LOAD_TEST_REPORT.md`**.

**Question bloquante n°1** : sur quelle **cible** lance-t-on les premiers tests
(staging dédié / local / autre) ? Tant que ce n'est pas tranché, je n'écris que
les scripts k6 « à blanc », sans les exécuter.
