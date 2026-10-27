"""
Mode poste (moteur installé sur un ordinateur de l'école) : ce qui remplace,
sans Redis, les services du serveur en ligne.
"""
import time

from rq.job import JobStatus

from app.api.tasks import _STATUS_MAP
from app.core.task_queue import FileLocale


def _attendre(tache, delai=5.0):
    fin = time.time() + delai
    while tache.get_status() in (JobStatus.QUEUED, JobStatus.STARTED) and time.time() < fin:
        time.sleep(0.02)
    return tache.get_status()


def _addition(a, b):
    return {"total": a + b}


def _echec():
    raise ValueError("Aucun bulletin à imprimer : calculez d'abord les moyennes de la période.")


def test_une_tache_s_execute_dans_le_moteur_et_rend_son_resultat():
    file = FileLocale()
    # Les options propres à RQ (délai, conservation, nouvelles tentatives)
    # sont acceptées comme par la vraie file : les appelants ne changent pas.
    tache = file.enqueue(_addition, 2, 3, meta={"etablissement_id": 1}, job_timeout=10, result_ttl=60, retry=None)

    assert _attendre(tache) == JobStatus.FINISHED
    assert _STATUS_MAP[tache.get_status()] == "SUCCESS"
    assert tache.return_value() == {"total": 5}
    assert tache.meta == {"etablissement_id": 1}
    assert file.trouver(tache.id) is tache


def test_un_echec_est_rapporte_avec_son_message():
    file = FileLocale()
    tache = file.enqueue(_echec, meta={"etablissement_id": 1})

    assert _attendre(tache) == JobStatus.FAILED
    assert _STATUS_MAP[tache.get_status()] == "FAILED"
    assert tache.exc_info.strip().splitlines()[-1].endswith("calculez d'abord les moyennes de la période.")


def test_compteurs_pour_la_supervision():
    file = FileLocale()
    ok = file.enqueue(_addition, 1, 1, meta={})
    ko = file.enqueue(_echec, meta={})
    _attendre(ok), _attendre(ko)

    assert file.compteurs() == {
        "pending": 0, "started": 0, "finished": 1, "failed": 1, "deferred": 0, "scheduled": 0,
    }
    assert len(file) == 0


def test_tache_inconnue():
    assert FileLocale().trouver("inexistante") is None
