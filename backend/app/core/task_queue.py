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
import threading
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from redis import Redis
from rq import Queue
from rq.job import Job, JobStatus

from app.core.mode import MODE_POSTE

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


class TacheLocale:
    """Même interface que la part de `rq.job.Job` lue par app/api/tasks.py."""

    def __init__(self, meta: Optional[dict]):
        self.id = uuid.uuid4().hex
        self.meta = meta or {}
        self.retries_left = None
        self.exc_info: Optional[str] = None
        self._statut = JobStatus.QUEUED
        self._resultat = None

    def get_status(self, refresh: bool = True):
        return self._statut

    def return_value(self):
        return self._resultat


class FileLocale:
    """File du poste local : exécute la tâche dans le moteur lui-même, sans
    Redis ni processus séparé. Deux tâches à la fois au plus, pour ne pas
    figer l'ordinateur pendant un calcul de moyennes sur toute une classe.
    Les options propres à RQ (délais, nouvelles tentatives) sont acceptées et
    ignorées : la tâche s'exécute une fois, son échec est rapporté tel quel."""

    def __init__(self):
        self._executeur = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tache-locale")
        self._taches: dict[str, TacheLocale] = {}
        self._verrou = threading.Lock()

    def enqueue(self, fonction, *args, meta: Optional[dict] = None, **_options_rq) -> TacheLocale:
        tache = TacheLocale(meta)
        with self._verrou:
            self._taches[tache.id] = tache
        self._executeur.submit(self._executer, tache, fonction, args)
        return tache

    @staticmethod
    def _executer(tache: TacheLocale, fonction, args):
        tache._statut = JobStatus.STARTED
        try:
            tache._resultat = fonction(*args)
            tache._statut = JobStatus.FINISHED
        except Exception:  # noqa: BLE001 — l'échec est rapporté à l'écran de suivi
            tache.exc_info = traceback.format_exc()
            tache._statut = JobStatus.FAILED

    def __len__(self) -> int:
        with self._verrou:
            return sum(1 for t in self._taches.values() if t._statut in (JobStatus.QUEUED, JobStatus.STARTED))

    def compteurs(self) -> dict:
        """Mêmes rubriques que la file RQ, pour l'écran de supervision."""
        with self._verrou:
            statuts = [t._statut for t in self._taches.values()]
        return {
            "pending": statuts.count(JobStatus.QUEUED),
            "started": statuts.count(JobStatus.STARTED),
            "finished": statuts.count(JobStatus.FINISHED),
            "failed": statuts.count(JobStatus.FAILED),
            "deferred": 0,
            "scheduled": 0,
        }

    def trouver(self, task_id: str) -> Optional[TacheLocale]:
        with self._verrou:
            return self._taches.get(task_id)


_file_locale: Optional[FileLocale] = None


def get_queue():
    global _queue, _file_locale
    if MODE_POSTE:
        if _file_locale is None:
            _file_locale = FileLocale()
        return _file_locale
    if _queue is None:
        _queue = Queue(RQ_QUEUE_NAME, connection=get_redis_connection())
    return _queue


def fetch_job(task_id: str):
    """Retrouve une tâche par son id — renvoie None si elle n'existe pas
    (id invalide, ou expirée après DEFAULT_RESULT_TTL)."""
    if MODE_POSTE:
        return get_queue().trouver(task_id)
    try:
        return Job.fetch(task_id, connection=get_redis_connection())
    except Exception:
        return None
