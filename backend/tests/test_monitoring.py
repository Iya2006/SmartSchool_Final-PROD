"""
Tests — GET /api/monitoring (Étape G)

Comme test_task_queue.py, les assertions sur la file/les workers ont besoin
d'un vrai Redis (RQ ne se simule pas fiablement) : base de test dédiée
(index 15), jamais celle du cache applicatif ni de la vraie file "default"
(index 0). `app/core/task_queue.py` et `app/core/cache.py` sont redirigés
vers cette base isolée le temps du test (fixture `_infra_isolee`), avec un
nom de file distinct ("test-monitoring") pour ne jamais mélanger ces jobs
avec ceux d'un autre fichier de test.

Limite d'exécution assumée (même situation que test_task_queue.py) : ce
fichier importe `main.py` (via `conftest.py`), qui nécessite Python 3.12+
— non disponible en Python 3.11 sur ce poste. Écrit et relu attentivement,
à exécuter par vous / via le conteneur `python:3.12-slim` déjà utilisé
pour valider F.
"""
import pytest
from redis import Redis
from rq.job import Retry

from app.core.auth import create_access_token

TEST_REDIS_URL = "redis://localhost:6379/15"
TEST_QUEUE_NAME = "test-monitoring"


def _token(role: str) -> dict:
    token = create_access_token({
        "sub": "999", "nom": "Test", "prenom": "Monitoring",
        "role": role, "type": "admin",
    })
    return {"Authorization": f"Bearer {token}"}


def _task_double(x):
    return x * 2


@pytest.fixture
def _infra_isolee(monkeypatch):
    """Redirige task_queue.py et cache.py vers une base Redis de test
    isolée — jamais la vraie file "default" (index 0) que d'autres jobs
    pourraient utiliser en parallèle."""
    import app.core.cache as cache_module
    import app.core.task_queue as tq

    conn = Redis.from_url(TEST_REDIS_URL, decode_responses=False)
    try:
        conn.ping()
    except Exception:
        pytest.skip(
            "Redis non accessible sur localhost:6379 — lancez "
            "`docker compose -f docker-compose.dev.yml up -d` pour exécuter ces tests."
        )
    conn.flushdb()

    monkeypatch.setattr(tq, "_redis_conn", None)
    monkeypatch.setattr(tq, "_queue", None)
    monkeypatch.setattr(tq, "REDIS_URL", TEST_REDIS_URL)
    monkeypatch.setattr(tq, "RQ_QUEUE_NAME", TEST_QUEUE_NAME)
    monkeypatch.setattr(cache_module, "REDIS_URL", TEST_REDIS_URL)
    monkeypatch.setattr(cache_module, "_health_check_client", None)

    yield conn
    conn.flushdb()


class TestAccesControle:
    """L'accès est réservé aux rôles admin — jamais aux modules métier
    (finance/personnel utilisent la même dependency, cohérence attendue)."""

    def test_refuse_sans_token(self, client):
        response = client.get("/api/monitoring")
        assert response.status_code == 401

    def test_refuse_role_non_admin(self, client):
        response = client.get("/api/monitoring", headers=_token("ENSEIGNANT"))
        assert response.status_code == 403

    def test_autorise_role_admin(self, client, _infra_isolee):
        response = client.get("/api/monitoring", headers=_token("SUPER_ADMIN"))
        assert response.status_code == 200
        data = response.json()
        assert set(data.keys()) == {"status", "reasons", "database", "redis", "queue", "workers"}
        assert data["status"] in ("OK", "WARNING", "CRITICAL")


class TestContenuMonitoring:
    def test_critical_si_redis_indisponible(self, client, monkeypatch):
        """Redis injoignable (mauvaise adresse) -> CRITICAL avec raison
        explicite, et queue/workers restent None (jamais de compteur
        fabriqué quand l'infrastructure réelle est inconnue)."""
        import app.core.cache as cache_module

        monkeypatch.setattr(cache_module, "REDIS_URL", "redis://localhost:1/0")
        monkeypatch.setattr(cache_module, "_health_check_client", None)

        response = client.get("/api/monitoring", headers=_token("ADMIN"))
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "CRITICAL"
        assert any("Redis" in r for r in data["reasons"])
        assert data["redis"]["status"] == "down"
        assert data["queue"] is None
        assert data["workers"] is None

    def test_critical_si_aucun_worker_actif(self, client, _infra_isolee):
        response = client.get("/api/monitoring", headers=_token("ADMIN"))
        data = response.json()
        assert data["status"] == "CRITICAL"
        assert any("worker" in r.lower() for r in data["reasons"])
        assert data["workers"]["total"] == 0

    def test_worker_enregistre_est_detecte(self, client, _infra_isolee):
        from rq import Queue
        from rq.worker import SimpleWorker

        queue = Queue(TEST_QUEUE_NAME, connection=_infra_isolee)
        worker = SimpleWorker([queue], connection=_infra_isolee, name="worker-test-monitoring")
        worker.register_birth()
        try:
            response = client.get("/api/monitoring", headers=_token("ADMIN"))
            data = response.json()
            assert data["workers"]["total"] == 1
            assert "worker-test-monitoring" in data["workers"]["names"]
            # Un worker vient de naître mais n'a encore traité aucun job :
            # ne doit plus être un motif de CRITICAL.
            assert not any("Aucun worker" in r for r in data["reasons"])
        finally:
            worker.register_death()

    def test_compteurs_file_refletent_la_realite(self, client, _infra_isolee):
        from rq import Queue

        queue = Queue(TEST_QUEUE_NAME, connection=_infra_isolee)
        queue.enqueue(_task_double, 21)
        queue.enqueue(_task_double, 22, retry=Retry(max=1))

        response = client.get("/api/monitoring", headers=_token("ADMIN"))
        data = response.json()
        assert data["queue"]["name"] == TEST_QUEUE_NAME
        assert data["queue"]["pending"] == 2
        assert data["queue"]["started"] == 0
        assert data["queue"]["finished"] == 0
        assert data["queue"]["failed"] == 0
