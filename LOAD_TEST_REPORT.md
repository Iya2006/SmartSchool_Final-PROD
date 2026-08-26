# LOAD_TEST_REPORT.md — SmartSchool (paliers locaux)

> Premiers tests de charge réels, exécutés sur **environnement LOCAL** (pas la
> prod). But : valider le harnais, tracer la courbe de capacité du code, et
> trouver le premier bottleneck. Voir `PERFORMANCE_AUDIT.md` pour l'architecture.

Date : 2026-08-26 · Outil : **k6 v0.53.0** · Cible : `http://127.0.0.1:8300`

---

## 1. Architecture testée
FastAPI **synchrone**, servie par **uvicorn** (2 workers pour les paliers de
capacité, 1 worker pour l'isolation), pool de threads aligné sur le pool DB
(`DB_CAPACITE=20`). `RATELIMIT_ENABLED=0` (sinon le login bride tout à ~5/min/IP).

## 2. Infrastructure (locale — NON représentative de la prod)
Machine de dev (bien plus puissante que le Render `starter` de prod : ~0,5 vCPU
/ 512 Mo). **Les chiffres ci-dessous sont donc OPTIMISTES** vs la vraie prod.
- PostgreSQL : Docker `postgres:16` (localhost:5433), `max_connections≈100`.
- Redis : Docker `redis:7` (localhost:6379).
- Pas de worker RQ lancé (les scénarios n'ont pas sollicité les tâches async).

## 3. Dataset
Synthétique multi-écoles via `tests/load/scripts/seed_load_data.py` :
**5 établissements**, 50 enseignants (affectés à leurs classes), 15 classes,
120 élèves + 120 parents, évaluations centralisées + notes + présences.
Isolation respectée (chaque compte rattaché à SON établissement).

## 4. Scénarios exécutés
Mélange réaliste (40% parents, 40% élèves, 15% enseignants, 5% admin), think-time
~1 s entre requêtes. Auth réelle sur les 4 portails. Scénarios : `smoke`, `load`
(paliers VUs), `breakpoint` (arrival-rate), `multi_tenant` (isolation).

## 5-16. Résultats par palier

| Charge | RPS | p95 | p99/max | erreurs | Verdict |
|--------|-----|-----|---------|---------|---------|
| **Smoke** (2 VUs) | 2 | 471 ms | 588 ms | **0 %** | ✅ Harnais + endpoints OK (4 profils) |
| **100 VUs** | **~30,7** | **4,25 s** | max 14,4 s | **0,02 %** | ⚠️ **Saturé en latence**, mais reste debout |
| **500 VUs** | **14,4** (effondré) | **60 s** (mur timeout) | 60 s | **11,5 %** | ❌ **Congestion collapse** |
| **Isolation** (10 VUs) | 16,5 | 129 ms | 1,55 s | (404 attendus) | ✅ **0 fuite cross-tenant / 1000** |

Détails :
- **Smoke** : 70 requêtes, 100 % checks, 0 erreur. p95 léger 90 ms, lourd
  (bulletins/notes-centralisées) 120 ms, auth (bcrypt) 540 ms.
- **100 VUs** : 3 804 requêtes, **0,02 %** d'erreur, **~30,7 req/s**. La latence
  explose (p95 global 4,25 s ; **auth p95 5,5 s**). Le système **ne casse pas**,
  il ralentit : au-delà de ~40 requêtes concurrentes, tout fait la file.
- **500 VUs** : **rupture**. 11,5 % d'erreurs, débit **effondré à 14 req/s**
  (congestion collapse), p95 au **mur des 60 s** (timeout k6). Le log backend
  contient **1 777×** `QueuePool limit of size 15 overflow 5 reached, connection
  timed out` → **le pool de connexions DB est le mur dur**.
- **Isolation** : **100 % des checks** — un admin de l'école A reçoit **404** sur
  tout élève / toute classe de l'école B (1 000 tentatives, 0 fuite).
- **Breakpoint** (arrival-rate) : **non concluant** — lancé juste après le 500
  VUs, il a tapé un backend encore saturé (échecs de connexion immédiats). À
  rejouer sur un backend au repos (voir §Recovery).

## 17. Premier bottleneck (cause identifiée, NON corrigée)
**Le pool de connexions PostgreSQL** (`pool_size=15 + max_overflow=5 = 20`/worker,
`pool_timeout=10 s`). Sous forte concurrence, les requêtes dépassent les 20
connexions disponibles, attendent 10 s, puis échouent en `QueuePool TimeoutError`
→ 500. C'est **exactement** le mur prédit par l'audit (§6.2). Bottleneck
secondaire : le **login bcrypt** (CPU), qui domine la latence via le GIL (chaque
worker ≈ 1 cœur pour le travail CPU-bound).

## 18. Point de rupture / 19. Capacité stable
- **Capacité stable (local, 2 workers)** : **~30 req/s**, jusqu'à ~100 VUs, au
  prix d'une latence dégradée (p95 ~4 s) mais **sans erreur**.
- **Point de rupture** : entre 100 et 500 VUs. À **500 VUs → effondrement**
  (11,5 % d'erreurs, débit divisé par 2, pool DB épuisé).
- **En prod (Render `starter`, ~0,5 vCPU)** : le plafond sera **plus bas**. Les
  **100 000 utilisateurs concurrents** restent **hors de portée** sans mise à
  l'échelle horizontale (plusieurs instances) + **pooler de connexions**
  (Supavisor/PgBouncer en mode transaction) + réplicas de lecture — conforme à
  la conclusion de l'audit.

## 20. Recommandations (à valider avant d'appliquer — une seule à la fois)
1. **Pooler de connexions transaction-mode** (Supabase Supavisor / PgBouncer) :
   c'est LE levier n°1 — il découple le nombre de connexions applicatives du
   `max_connections` réel et repousse le mur observé.
2. **Login** : le bcrypt est le poste CPU dominant. Piste : réduire les
   re-logins (déjà mis en cache par VU dans les tests), envisager un coût bcrypt
   adapté (compromis sécurité) — **à discuter**, pas à changer à l'aveugle.
3. **Récupération après surcharge** : le backend est resté bloqué après le 500
   VUs (connexions **« idle in transaction »** tenant des verrous ; le
   redémarrage à 2 workers **deadlocke** sur la migration de démarrage). Piste :
   exécuter les migrations **une seule fois** (phase de release), pas par worker.
4. **Mise à l'échelle** : plus de workers/instances **seulement** si le pooler
   DB suit ; sinon on déplace le mur sans le repousser.

## Reproductibilité
```
# 1) Docker up (postgres+redis), backend local RATELIMIT_ENABLED=0
# 2) Seed :
python ../tests/load/scripts/seed_load_data.py --etablissements 5 --classes 3 --eleves 8
# 3) Rejouer :
k6 run --env BASE_URL=http://127.0.0.1:8300 --env VUS=100 --env DURATION=1m scenarios/load.js
k6 run --env BASE_URL=http://127.0.0.1:8300 scenarios/multi_tenant.js
```

## Limites de CE run
- **Local ≠ prod** : machine plus puissante, pas de worker RQ, métriques
  serveur (CPU/RAM/PG/Redis) non corrélées finement (à faire sur staging avec
  l'observabilité de §15 de la mission).
- Écritures lourdes (PDF-async, calcul de moyennes via RQ) **non** testées ici.
- Le `breakpoint` reste à rejouer proprement (backend au repos) pour le chiffre
  de RPS exact au seuil.
