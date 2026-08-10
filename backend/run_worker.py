"""
SMARTSCHOOL — Lanceur du worker RQ pour le développement local

En production le worker est lancé par `rq worker` (voir backend/render_start.sh
et docker-compose.prod.yml). Cette commande utilise le worker forké de RQ, qui
appelle os.fork() : absent sous Windows, où elle s'arrête aussitôt sur
`AttributeError: module 'os' has no attribute 'fork'`.

Ce script lance le même worker, sur la même file, en retombant sur SimpleWorker
uniquement là où fork n'existe pas — exactement le garde-fou appliqué dans
tests/test_task_queue.py. Rien ne change sous Linux.

    python backend/run_worker.py

Sans worker en marche, les routes `*-async` acceptent bien les tâches mais
personne ne les exécute : l'interface reste sur « Calcul en file d'attente… »
jusqu'à expiration. C'est le symptôme à reconnaître.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from rq import Queue, SimpleWorker, Worker  # noqa: E402

from app.core.task_queue import RQ_QUEUE_NAME, REDIS_URL, get_redis_connection  # noqa: E402


def main() -> int:
    conn = get_redis_connection()
    try:
        conn.ping()
    except Exception as exc:
        print(f"Redis injoignable sur {REDIS_URL} : {exc}")
        print("Démarrez-le avec : docker compose -f docker-compose.dev.yml up -d")
        return 1

    classe = Worker if hasattr(os, "fork") else SimpleWorker
    file = Queue(RQ_QUEUE_NAME, connection=conn)
    print(f"Worker {classe.__name__} sur la file « {RQ_QUEUE_NAME} » ({REDIS_URL})")
    print("Ctrl+C pour arrêter.")
    classe([file], connection=conn).work(with_scheduler=hasattr(os, "fork"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
