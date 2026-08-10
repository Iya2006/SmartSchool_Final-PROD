"""
SMARTSCHOOL — Monitoring infrastructure (Étape G)

Endpoint agrégé, lecture seule, réservé aux rôles admin (voir main.py).
Réutilise uniquement des primitives natives déjà légères — RQ (Queue.count,
registres), Redis (PING), PostgreSQL (SELECT 1 chronométré). Aucune
nouvelle table, aucune nouvelle structure Redis créée pour ce chantier.

Portée volontairement globale (infrastructure partagée), pas par
établissement — cohérent avec le déploiement mono-tenant actuel
(etablissement_id=1 partout, absent du JWT). Une ventilation par école des
opérations métier (ex. synchronisation offline) sortirait du périmètre
"réutiliser l'existant" et n'est pas construite ici.
"""
import time

from fastapi import APIRouter
from rq import Queue
from rq.registry import (
    DeferredJobRegistry,
    FailedJobRegistry,
    FinishedJobRegistry,
    ScheduledJobRegistry,
    StartedJobRegistry,
)
from rq.worker import Worker, WorkerStatus

router = APIRouter(prefix="/api/monitoring", tags=["Monitoring"])

# Seuils PROVISOIRES — aucune mesure de charge réelle en production
# n'existe encore pour ce projet (voir Étape F, section Q : tests de
# charge prévus, pas faits faute de volumétrie réelle). À ajuster une
# fois des données réelles disponibles, pas avant.
SEUIL_FILE_PROFONDE = 50
SEUIL_ECHECS_ELEVE = 20
SEUIL_LATENCE_POSTGRES_MS = 500


def _check_database() -> dict:
    from sqlalchemy import text
    from app.core.database import SessionLocal

    debut = time.perf_counter()
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            latence_ms = round((time.perf_counter() - debut) * 1000, 1)
            return {"status": "up", "latency_ms": latence_ms}
        finally:
            db.close()
    except Exception:
        return {"status": "down", "latency_ms": None}


def _check_redis_and_queue():
    """Retourne (redis_ok, queue_info, workers_info). queue_info et
    workers_info restent None si Redis est injoignable — jamais de valeur
    fabriquée (des compteurs à zéro laisseraient croire à une file vide
    plutôt qu'à une infrastructure injoignable)."""
    from app.core.cache import redis_is_reachable
    from app.core.task_queue import get_queue, get_redis_connection

    if not redis_is_reachable():
        return False, None, None

    try:
        queue: Queue = get_queue()
        conn = get_redis_connection()

        queue_info = {
            "name": queue.name,
            "pending": queue.count,
            "started": StartedJobRegistry(queue=queue).count,
            "finished": FinishedJobRegistry(queue=queue).count,
            "failed": FailedJobRegistry(queue=queue).count,
            "deferred": DeferredJobRegistry(queue=queue).count,
            "scheduled": ScheduledJobRegistry(queue=queue).count,
        }

        workers = Worker.all(connection=conn)
        idle = sum(1 for w in workers if w.get_state() == WorkerStatus.IDLE)
        busy = sum(1 for w in workers if w.get_state() == WorkerStatus.BUSY)
        workers_info = {
            "total": len(workers),
            "idle": idle,
            "busy": busy,
            "names": [w.name for w in workers],
        }
        return True, queue_info, workers_info
    except Exception:
        # Redis a répondu au PING mais une opération RQ a échoué (cas rare :
        # coupure entre les deux appels) — signalé comme Redis up mais file
        # inconnue, plutôt que de fabriquer des compteurs.
        return True, None, None


@router.get("")
def get_monitoring_status():
    reasons: list[str] = []

    database = _check_database()
    redis_ok, queue_info, workers_info = _check_redis_and_queue()
    redis_status = "up" if redis_ok else "down"

    status = "OK"

    if database["status"] == "down":
        status = "CRITICAL"
        reasons.append("PostgreSQL indisponible")
    if redis_status == "down":
        status = "CRITICAL"
        reasons.append("Redis indisponible")
    if workers_info is not None and workers_info["total"] == 0:
        status = "CRITICAL"
        reasons.append("Aucun worker actif — les tâches en file ne seront pas traitées")

    if status != "CRITICAL":
        if database["status"] == "up" and (database["latency_ms"] or 0) > SEUIL_LATENCE_POSTGRES_MS:
            status = "WARNING"
            reasons.append(f"PostgreSQL lent ({database['latency_ms']} ms)")
        if queue_info is not None and queue_info["pending"] > SEUIL_FILE_PROFONDE:
            status = "WARNING"
            reasons.append(f"File d'attente profonde ({queue_info['pending']} tâches en attente)")
        if queue_info is not None and queue_info["failed"] > SEUIL_ECHECS_ELEVE:
            status = "WARNING"
            reasons.append(f"Taux d'échec élevé ({queue_info['failed']} tâches en échec)")

    return {
        "status": status,
        "reasons": reasons,
        "database": database,
        "redis": {"status": redis_status},
        "queue": queue_info,
        "workers": workers_info,
    }
