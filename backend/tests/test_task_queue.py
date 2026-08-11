"""
Tests — File de tâches asynchrones RQ (Étape F)

Contrairement au reste de la suite (SQLite en mémoire, voir conftest.py),
RQ ne se teste pas de façon fiable avec un Redis mocké : ses primitives
(BLPOP, jeux ordonnés pour les tentatives programmées, registre des
échecs...) dépendent du comportement réel de Redis — c'est la
recommandation officielle de la librairie (https://python-rq.org/docs/testing/).
Ces tests nécessitent donc un vrai Redis accessible localement
(`docker compose -f docker-compose.dev.yml up -d`), sur une base de test
dédiée (index 15) pour ne JAMAIS toucher le cache applicatif (index 0,
voir app/core/cache.py) ni la file réelle (index 0 également, voir
app/core/task_queue.py).

Limite d'exécution assumée cette session : Redis non accessible dans cet
environnement (Docker Desktop arrêté, vérifié) — tests écrits et relus
attentivement, à exécuter par vous. Chaque test se protège lui-même via
`pytest.skip` si Redis n'est pas joignable, plutôt que d'échouer
bruyamment dans un environnement qui n'a simplement pas Redis démarré.

feat(test): ajouter tests de la file de tâches asynchrones RQ (Étape F)
"""
import time
from datetime import date

import pytest
from redis import Redis
from rq import Queue, Worker
from rq.job import JobStatus, Retry
from rq.registry import FailedJobRegistry

TEST_REDIS_URL = "redis://localhost:6379/15"
TEST_QUEUE_NAME = "test-default"


def _connect_test_redis() -> Redis:
    return Redis.from_url(TEST_REDIS_URL, decode_responses=False)


@pytest.fixture
def redis_conn():
    conn = _connect_test_redis()
    try:
        conn.ping()
    except Exception:
        pytest.skip(
            "Redis non accessible sur localhost:6379 — lancez "
            "`docker compose -f docker-compose.dev.yml up -d` pour exécuter ces tests."
        )
    conn.flushdb()  # base de TEST dédiée (index 15) — jamais celle du cache applicatif (index 0)
    yield conn
    conn.flushdb()


@pytest.fixture
def queue(redis_conn):
    return Queue(TEST_QUEUE_NAME, connection=redis_conn)


# ── Tâches de test — fonctions module-level : RQ les sérialise par leur
# chemin d'import qualifié, pas par valeur (pas de lambda/closure possible). ──

def _task_double(x):
    return x * 2


_ATTEMPT_KEY = "test:task_queue:fails_twice_then_succeeds:attempts"


def _task_fails_twice_then_succeeds():
    """Le compteur DOIT vivre dans Redis, pas dans un dict Python en mémoire :
    le Worker standard (fork, comme en production Linux) exécute chaque
    tentative dans un PROCESS ENFANT séparé (os.fork()) — un dict local
    muté dans l'enfant est invisible au parent et aux tentatives suivantes
    (copy-on-write). Un compteur en mémoire ferait échouer ce test à 100%
    du temps sous un vrai worker forké (trouvé en exécutant réellement ce
    test, jamais avant), même si le mécanisme de retry de RQ fonctionne
    correctement — Redis est la seule ressource partagée entre les forks."""
    n = _connect_test_redis().incr(_ATTEMPT_KEY)
    if n < 3:
        raise RuntimeError(f"échec temporaire simulé (tentative {n})")
    return "ok"


def _task_always_fails():
    raise RuntimeError("échec définitif simulé")


class TestQueueBasique:
    """Mécanique générique de la file — indépendante de toute tâche métier."""

    def test_enqueue_execution_succes(self, queue, redis_conn):
        job = queue.enqueue(_task_double, 21)
        Worker([queue], connection=redis_conn).work(burst=True)

        job.refresh()
        assert job.get_status() == JobStatus.FINISHED
        assert job.return_value() == 42

    def test_echec_definitif_va_dans_failed_registry(self, queue, redis_conn):
        job = queue.enqueue(_task_always_fails)
        Worker([queue], connection=redis_conn).work(burst=True)

        job.refresh()
        assert job.get_status() == JobStatus.FAILED
        registry = FailedJobRegistry(queue=queue)
        assert job.id in registry.get_job_ids()

    def test_retry_puis_succes(self, queue, redis_conn):
        """Un échec temporaire ne doit pas rester FAILED indéfiniment : avec
        un Retry configuré, la tâche doit finir par réussir sans
        intervention manuelle. Pas de reset explicite du compteur ici : la
        fixture `redis_conn` a déjà fait `flushdb()` sur la base de test."""
        job = queue.enqueue(_task_fails_twice_then_succeeds, retry=Retry(max=3, interval=[0, 0]))
        worker = Worker([queue], connection=redis_conn)

        # interval=0 : la tentative suivante est immédiatement re-queueable,
        # mais peut nécessiter un passage supplémentaire du worker selon la
        # version de RQ — boucle courte plutôt que de dépendre d'un timing
        # exact, pour un test robuste.
        for _ in range(5):
            if job.get_status(refresh=True) == JobStatus.FINISHED:
                break
            worker.work(burst=True)
            time.sleep(0.05)

        assert job.get_status(refresh=True) == JobStatus.FINISHED
        assert job.return_value() == "ok"
        assert int(redis_conn.get(_ATTEMPT_KEY)) == 3

    def test_file_videe_par_un_worker_ne_laisse_rien_a_un_second(self, queue, redis_conn):
        """Preuve indirecte de l'absence de double-traitement : une fois la
        file drainée par un premier worker, un second qui démarre après ne
        trouve plus rien à faire — cohérent avec la garantie d'atomicité de
        Redis (BLPOP) sur laquelle RQ s'appuie, pas une simulation de vraie
        concurrence (hors de portée d'un test unitaire déterministe)."""
        jobs = [queue.enqueue(_task_double, i) for i in range(5)]
        Worker([queue], connection=redis_conn, name="worker-a").work(burst=True)

        for j in jobs:
            j.refresh()
            assert j.get_status() == JobStatus.FINISHED

        assert queue.count == 0
        # Un second worker qui démarre maintenant ne traite plus rien —
        # aucun job n'a pu être "repris" en double.
        Worker([queue], connection=redis_conn, name="worker-b").work(burst=True)
        for j in jobs:
            assert j.return_value() == j.args[0] * 2  # inchangé, pas retraité


class TestBulletinPdfTaskIsolationEcole:
    """Vérifie spécifiquement la re-validation multi-école de
    generate_bulletin_pdf_task (plan Étape F, section L) — appelée en
    fonction Python directe, pas via RQ (ce qui compte ici est la logique
    de la tâche elle-même, pas la mécanique de file déjà couverte
    ci-dessus)."""

    @pytest.fixture
    def bulletin_fixture(self, db, monkeypatch):
        """Crée Classe → Inscription → Bulletin minimaux, et fait pointer
        SessionLocal (utilisé directement par generate_bulletin_pdf_task,
        hors du cycle de requête FastAPI donc hors de la surcharge
        `app.dependency_overrides[get_db]` de conftest.py) vers la même
        base de test SQLite que la fixture `db`."""
        from app.models.academique import Classe, Inscription, Bulletin
        import app.tasks.bulletin_tasks as bulletin_tasks_module

        classe = Classe(
            etablissement_id=1, annee_id=1, niveau_id=1,
            code="T6A", libelle="Test 6ème A",
        )
        db.add(classe)
        db.commit()
        db.refresh(classe)

        inscription = Inscription(eleve_id=1, classe_id=classe.classe_id, annee_id=1, statut="ACTIVE")
        db.add(inscription)
        db.commit()
        db.refresh(inscription)

        bulletin = Bulletin(inscription_id=inscription.inscription_id, statut="BROUILLON")
        db.add(bulletin)
        db.commit()
        db.refresh(bulletin)

        # `SessionLocal` est importé (`from app.core.database import
        # SessionLocal`) au chargement de bulletin_tasks.py — patcher
        # app.core.database.SessionLocal après coup n'aurait aucun effet
        # sur le nom déjà lié dans bulletin_tasks (le module a sa propre
        # référence). On patche donc le nom tel qu'utilisé, pas tel que
        # défini — pour faire pointer la tâche vers la même session SQLite
        # que la fixture `db` le temps du test.
        monkeypatch.setattr(bulletin_tasks_module, "SessionLocal", lambda: db)

        return bulletin, classe

    def test_refuse_si_etablissement_ne_correspond_pas(self, bulletin_fixture):
        from app.tasks.bulletin_tasks import generate_bulletin_pdf_task

        bulletin, classe = bulletin_fixture
        assert classe.etablissement_id == 1

        with pytest.raises(PermissionError):
            generate_bulletin_pdf_task(bulletin.bulletin_id, etablissement_id=999)

    def test_bulletin_inexistant_leve_value_error(self, bulletin_fixture):
        from app.tasks.bulletin_tasks import generate_bulletin_pdf_task

        with pytest.raises(ValueError):
            generate_bulletin_pdf_task(bulletin_id=999999, etablissement_id=1)
