"""
SMARTSCHOOL — API générique de suivi des tâches asynchrones (Étape F)

Un seul endpoint, réutilisable par N'IMPORTE QUEL type de tâche mise en
file via app/core/task_queue.py — pas seulement les bulletins. Le statut
et le résultat font foi depuis le `Job` RQ lui-même (Redis) : pas de table
PostgreSQL dédiée pour l'instant (voir le plan Étape F, section F — pas de
justification trouvée pour un historique permanent aujourd'hui).
"""
from fastapi import APIRouter, HTTPException
from rq.job import JobStatus

from app.core.task_queue import fetch_job

router = APIRouter(prefix="/api/tasks", tags=["Tâches asynchrones"])

# RQ a plus de statuts internes que ce qu'on expose au client — on les
# ramène au vocabulaire simple déjà utilisé côté frontend
# (PENDING/RUNNING/SUCCESS/FAILED, voir syncEngine.ts/offlineQueue.ts).
_STATUS_MAP = {
    JobStatus.QUEUED: "PENDING",
    JobStatus.DEFERRED: "PENDING",
    JobStatus.SCHEDULED: "PENDING",
    JobStatus.STARTED: "RUNNING",
    JobStatus.FINISHED: "SUCCESS",
    JobStatus.FAILED: "FAILED",
    JobStatus.STOPPED: "FAILED",
    JobStatus.CANCELED: "FAILED",
}


@router.get("/{task_id}")
def get_task_status(task_id: str):
    """Statut d'une tâche asynchrone. 404 si l'id est invalide OU si le
    résultat a expiré (result_ttl/failure_ttl — voir task_queue.py)."""
    job = fetch_job(task_id)
    if job is None:
        raise HTTPException(404, "Tâche introuvable (id invalide, ou résultat expiré)")

    rq_status = job.get_status(refresh=True)
    status = _STATUS_MAP.get(rq_status, "PENDING")

    response = {
        "task_id": task_id,
        "status": status,
        # Nombre de tentatives déjà effectuées — n'existe que si un `Retry`
        # a été fourni à l'enqueue (voir evaluations.py::generer_bulletin_pdf_async).
        "attempts": getattr(job, "retries_left", None),
    }

    if status == "SUCCESS":
        response["result"] = job.return_value()
    elif status == "FAILED":
        # Dernière ligne de la traceback seulement — jamais la trace complète
        # (peut contenir des chemins/valeurs internes), cohérent avec §24 du
        # plan ("attention aux données personnelles dans les logs").
        response["error"] = (job.exc_info or "").strip().splitlines()[-1] if job.exc_info else "Erreur inconnue"

    return response
