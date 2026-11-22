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

from app.sync.relais import DELAIS, ENTETE_HORS_LIGNE, vers_le_cloud

CLOUD_INJOIGNABLE = "http://127.0.0.1:9"


def test_cloud_injoignable_une_reponse_rapide_et_marquee():
    debut = time.monotonic()
    with pytest.raises(HTTPException) as refus:
        vers_le_cloud(CLOUD_INJOIGNABLE, "jeton-du-poste", "GET", "/api/sync/appareil/conflits")
    assert refus.value.status_code == 503
    assert refus.value.headers == {ENTETE_HORS_LIGNE: "1"}
    assert "internet" in refus.value.detail
    assert time.monotonic() - debut < 6


def test_joindre_le_cloud_ne_prend_jamais_plus_de_5_secondes():
    # Un routeur sans accès à internet laisse souvent la connexion en suspens.
    assert DELAIS.connect == 5


def test_poste_pas_encore_installe():
    with pytest.raises(HTTPException) as refus:
        vers_le_cloud(CLOUD_INJOIGNABLE, None, "GET", "/api/sync/appareil/conflits")
    assert refus.value.status_code == 409
