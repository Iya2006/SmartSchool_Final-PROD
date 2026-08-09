"""
SMARTSCHOOL — File de tâches asynchrones (Étape F)
Couche utilitaire fine autour de RQ (redis-queue), adossée au MÊME Redis
déjà utilisé par app/core/cache.py (cache dashboard finance) — pas une
nouvelle instance, pas une nouvelle variable d'environnement : `REDIS_URL`
est réutilisée telle quelle.

Pourquoi RQ plutôt que Celery/Dramatiq/arq : voir le plan approuvé
(Étape F, section C/D/E). En résumé — le code de ce projet est 100%
synchrone (aucun `async def` nulle part), RQ colle exactement à ce style
("appeler une fonction plus tard") sans nouvelle dépendance lourde ni
result backend séparé à configurer.

Comportement volontairement DIFFÉRENT de cache.py sur un point : cache.py
échoue silencieusement si Redis est indisponible (adapté à un cache, une
perte est tolérable). Ici, si Redis est indisponible au moment de mettre
une tâche en file, l'appelant DOIT le savoir (une tâche perdue
silencieusement n'est jamais acceptable) — get_queue() peut lever une
exception, à charge de l'endpoint appelant de la traduire en réponse HTTP
claire (503), pas de la masquer.
"""
import os
from typing import Optional

from redis import Redis
from rq import Queue
from rq.job import Job

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RQ_QUEUE_NAME = os.getenv("RQ_QUEUE_NAME", "default")

# Résultats conservés 24h (défaut RQ : 500s, bien trop court si
# l'utilisateur ne revient consulter GET /api/tasks/{id} que plus tard).
DEFAULT_RESULT_TTL = 24 * 60 * 60

_redis_conn: Optional[Redis] = None
_queue: Optional[Queue] = None


def get_redis_connection() -> Redis:
    """Connexion Redis dédiée à la queue — même REDIS_URL que le cache
    (app/core/cache.py), mais une instance de connexion séparée : RQ a
    besoin de `decode_responses=False` (il gère lui-même la
    sérialisation binaire des jobs), alors que cache.py utilise
    `decode_responses=True`. Partager la même instance de connexion
    entre les deux casserait l'un des deux usages.
    """
    global _redis_conn
    if _redis_conn is None:
        _redis_conn = Redis.from_url(REDIS_URL, decode_responses=False)
    return _redis_conn


def get_queue() -> Queue:
    global _queue
    if _queue is None:
        _queue = Queue(RQ_QUEUE_NAME, connection=get_redis_connection())
    return _queue


def fetch_job(task_id: str) -> Optional[Job]:
    """Retrouve une tâche par son id — renvoie None si elle n'existe pas
    (id invalide, ou expirée après DEFAULT_RESULT_TTL)."""
    try:
        return Job.fetch(task_id, connection=get_redis_connection())
    except Exception:
        return None
