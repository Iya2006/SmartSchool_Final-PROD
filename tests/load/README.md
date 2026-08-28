# SmartSchool — Tests de charge (k6)

> **Rien ici ne s'exécute tout seul.** Ce dossier contient uniquement des
> **scripts de test de charge** (k6) et un **seeder de données synthétiques**.
> Ils sont écrits « à blanc » : à lancer **manuellement**, **UNIQUEMENT** contre
> une **cible de test** (local Docker ou staging dédié), **JAMAIS** la prod des
> vraies écoles.

Voir aussi `../../PERFORMANCE_AUDIT.md` (audit d'architecture, étape 1).

---

## 0. Règles de sécurité (à respecter avant toute exécution)

- **`BASE_URL` est obligatoire et configurable** — aucune URL de prod codée en dur.
- Le seeder **refuse de tourner** si `DATABASE_URL` ne pointe pas sur
  `localhost`/`127.0.0.1` (sauf `--i-understand-this-is-not-prod`).
- Utiliser **`RATELIMIT_ENABLED=0`** sur la cible de test (sinon le login est
  bridé à ~5/min/IP et on ne mesure que des 429).
- **Données 100 % synthétiques** : tous les comptes/écoles créés portent le
  préfixe `LOAD-` et peuvent être supprimés (`--reset`).
- Vérifier **aucun envoi réel** (SMS/e-mail), **aucun paiement réel**, et
  **nettoyer** les PDF générés (disque). Voir la checklist §20 de la mission.
- **Kill-switch** : `Ctrl+C` arrête k6 immédiatement.

---

## 1. Arborescence

```
tests/load/
  config/       # env + seuils (thresholds)
  lib/          # helpers partagés (http, auth, data)
  scenarios/    # les tests k6
    profiles/   # comportements par rôle (admin/enseignant/parent/eleve)
  data/         # accounts.json généré par le seeder (git-ignored)
  results/      # sorties k6 (git-ignored)
  scripts/      # seeder + runners
```

## 2. Prérequis

- **k6** installé (https://k6.io) — `k6 version`.
- Backend SmartSchool lancé **en local** (Docker Postgres + Redis + l'API).
  Par défaut l'API écoute sur `http://localhost:8300`.
- Python 3.12 (pour le seeder), avec l'environnement du backend.

## 3. Étapes (dans l'ordre)

### a) Générer les données de test (local uniquement)

```bash
# Depuis backend/, avec la DATABASE_URL locale (Docker Postgres 5433)
export DATABASE_URL="postgresql+pg8000://admin:admin@localhost:5433/mydb"
python ../tests/load/scripts/seed_load_data.py --etablissements 5 --i-understand-this-is-not-prod
# → écrit tests/load/data/accounts.json
```

Réinitialiser (supprime toutes les données LOAD-) :
```bash
python ../tests/load/scripts/seed_load_data.py --reset --i-understand-this-is-not-prod
```

### b) Lancer un test (toujours du plus léger au plus lourd)

```bash
cd tests/load
# Smoke (valider que les scripts marchent) :
BASE_URL=http://localhost:8300 k6 run scenarios/smoke.js

# Charge normale :
BASE_URL=http://localhost:8300 k6 run scenarios/load.js

# Breakpoint (monte jusqu'à la rupture) :
BASE_URL=http://localhost:8300 k6 run scenarios/breakpoint.js
```

Paliers de VUs progressifs (voir §5 de la mission) : passer `VUS` et `DURATION`
via `--env`, ou utiliser `scripts/run.ps1` / `run.sh`.

> **On ne commence JAMAIS à 100 000 VUs.** Smoke → 100 → 500 → 1 000 → … et on
> ne passe au palier suivant que si le précédent est exploitable.

## 4. Variables d'environnement (k6)

| Variable | Défaut | Rôle |
|---|---|---|
| `BASE_URL` | `http://localhost:8300` | Cible. **Jamais la prod.** |
| `TEST_ENV` | `local` | Étiquette du run (local/staging). |
| `VUS` | (selon scénario) | Nombre de VUs pour les scénarios paramétrables. |
| `DURATION` | (selon scénario) | Durée du palier. |
| `RATE` | (selon scénario) | Requêtes/s pour les scénarios arrival-rate. |
| `DATA_FILE` | `./data/accounts.json` | Comptes de test générés par le seeder. |

## 5. Ce qui est mesuré

k6 sort : RPS, itérations/s, `http_req_duration` p50/p90/p95/p99/max, taux
d'erreur, 4xx/5xx (voir `config/thresholds.js`). **VUs ≠ RPS** : les scénarios
`*_arrival_rate` mesurent le débit indépendamment du nombre de VUs.

⚠️ Les métriques **serveur** (CPU/RAM backend, Postgres, Redis, RQ) se
collectent **en parallèle** côté infra (Render/Supabase/Redis ou `docker stats`
en local) — k6 ne les voit pas. Corréler par horodatage dans `LOAD_TEST_REPORT.md`.

## 6. Isolation multi-tenant

`scenarios/multi_tenant.js` vérifie qu'un compte de l'école A ne reçoit que des
données de l'école A. **Toute fuite cross-tenant = ÉCHEC CRITIQUE** (le check
échoue et le seuil `checks` casse le test).
