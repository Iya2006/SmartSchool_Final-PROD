"""
Le relais d'un poste vers le cloud (la liste « À vérifier » et ses décisions).

Sans internet, l'écran « À vérifier » d'un poste tournait sans fin : le
relais attendait le cloud jusqu'à 30 s, puis l'interface réessayait son 503
comme une coupure passagère, quatre fois. La réponse doit venir vite, et être
marquée pour que l'interface ne la réessaie pas (frontend/src/lib/api.ts).
"""
import time

import pytest
from fastapi import HTTPException

from app.sync.relais import DELAIS, ENTETE_HORS_LIGNE, LISTE_HORS_LIGNE, conflits_du_cloud, vers_le_cloud

CLOUD_INJOIGNABLE = "http://127.0.0.1:9"


def test_cloud_injoignable_une_reponse_rapide_et_marquee():
    debut = time.monotonic()
    with pytest.raises(HTTPException) as refus:
        vers_le_cloud(CLOUD_INJOIGNABLE, "jeton-du-poste", "GET", "/api/sync/appareil/conflits")
    assert refus.value.status_code == 503
    assert refus.value.headers == {ENTETE_HORS_LIGNE: "1"}
    assert "internet" in refus.value.detail
    assert time.monotonic() - debut < 6


def test_la_liste_a_verifier_hors_ligne_est_un_etat_pas_une_erreur():
    # L'écran l'affiche comme une information ; aucune erreur dans le navigateur.
    assert conflits_du_cloud(CLOUD_INJOIGNABLE, "jeton-du-poste", tous=False) == {
        "conflits": [], "hors_ligne": True, "message": LISTE_HORS_LIGNE}


def test_hors_ligne_deja_constate_la_reponse_est_immediate():
    # Le poste sait déjà le cloud injoignable : aucune tentative, aucune attente.
    debut = time.monotonic()
    rep = conflits_du_cloud("http://10.255.255.1:9", "jeton-du-poste", tous=False, hors_ligne_connu=True)
    assert rep["hors_ligne"] is True and rep["conflits"] == []
    assert time.monotonic() - debut < 0.5


def test_joindre_le_cloud_ne_prend_jamais_plus_de_5_secondes():
    # Un routeur sans accès à internet laisse souvent la connexion en suspens.
    assert DELAIS.connect == 5


def test_poste_pas_encore_installe():
    with pytest.raises(HTTPException) as refus:
        vers_le_cloud(CLOUD_INJOIGNABLE, None, "GET", "/api/sync/appareil/conflits")
    assert refus.value.status_code == 409
