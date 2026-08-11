"""
Tests — récupération après indisponibilité Redis (Étape G, correctif B.1)

`get_redis_client()` (app/core/cache.py) est pensé pour le cache : une
fois la connexion échouée une première fois, il ne retente plus jamais
(comportement volontairement inchangé, pas un bug pour cet usage). Ça le
rend inutilisable pour un statut de santé — d'où `redis_is_reachable()`,
qui doit détecter une VRAIE panne et une VRAIE reprise.

Testé contre un vrai conteneur Redis jetable, réellement arrêté puis
redémarré via Docker — pas une simulation. Nécessite Docker (skip propre
sinon, même politique que test_task_queue.py pour un Redis absent).
"""
import subprocess
import time

import pytest

CONTAINER_NAME = "test_redis_recovery_etape_g"
PORT = 16399


def _docker_disponible() -> bool:
    try:
        subprocess.run(["docker", "info"], check=True, capture_output=True, timeout=5)
        return True
    except Exception:
        return False


@pytest.fixture
def redis_ephemere():
    if not _docker_disponible():
        pytest.skip("Docker non accessible — impossible de tester une vraie panne/reprise Redis.")

    subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)
    subprocess.run(
        # PAS de --rm : ce test arrête PUIS redémarre ce même conteneur —
        # --rm le supprimerait dès le premier `docker stop`, rendant le
        # `docker start` suivant sans effet (trouvé en vérifiant
        # réellement ce test, corrigé). Nettoyage explicite en fin de
        # fixture via `docker rm -f` à la place.
        ["docker", "run", "-d", "--name", CONTAINER_NAME, "-p", f"{PORT}:6379", "redis:7-alpine"],
        check=True, capture_output=True,
    )

    for _ in range(30):
        result = subprocess.run(
            ["docker", "exec", CONTAINER_NAME, "redis-cli", "ping"],
            capture_output=True, text=True,
        )
        if result.stdout.strip() == "PONG":
            break
        time.sleep(0.5)
    else:
        subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)
        pytest.skip("Le conteneur Redis jetable n'a pas démarré à temps.")

    yield

    subprocess.run(["docker", "rm", "-f", CONTAINER_NAME], capture_output=True)


def test_redis_is_reachable_detecte_panne_puis_reprise_reelles(redis_ephemere, monkeypatch):
    import app.core.cache as cache_module

    monkeypatch.setattr(cache_module, "REDIS_URL", f"redis://localhost:{PORT}/0")
    monkeypatch.setattr(cache_module, "_health_check_client", None)

    assert cache_module.redis_is_reachable() is True

    subprocess.run(["docker", "stop", CONTAINER_NAME], capture_output=True)
    time.sleep(1)
    assert cache_module.redis_is_reachable() is False, (
        "Redis est réellement arrêté : doit être détecté, pas rester "
        "'up' à cause d'un client mis en cache indéfiniment."
    )

    subprocess.run(["docker", "start", CONTAINER_NAME], capture_output=True)
    recupere = False
    for _ in range(30):
        if cache_module.redis_is_reachable():
            recupere = True
            break
        time.sleep(0.5)
    assert recupere, (
        "Redis est réellement redémarré : la reprise doit être détectée "
        "sans redémarrer le process API (c'est le bug corrigé ici)."
    )


def test_get_redis_client_reste_volontairement_inchange_pour_le_cache(redis_ephemere, monkeypatch):
    """Documente explicitement la limite CONNUE et NON corrigée de
    get_redis_client() (usage cache uniquement, jamais pour un statut de
    santé) — pour qu'un futur lecteur ne le réutilise pas par erreur dans
    /health ou /api/monitoring."""
    import app.core.cache as cache_module

    monkeypatch.setattr(cache_module, "REDIS_URL", f"redis://localhost:{PORT}/0")
    monkeypatch.setattr(cache_module, "_redis_client", None)
    monkeypatch.setattr(cache_module, "_redis_unavailable", False)

    subprocess.run(["docker", "stop", CONTAINER_NAME], capture_output=True)
    time.sleep(1)
    assert cache_module.get_redis_client() is None  # échec initial, attendu

    subprocess.run(["docker", "start", CONTAINER_NAME], capture_output=True)
    time.sleep(1)
    # Comportement connu et volontairement PAS corrigé pour cette fonction :
    # reste bloqué sur l'échec initial même après un vrai retour de Redis.
    assert cache_module.get_redis_client() is None
