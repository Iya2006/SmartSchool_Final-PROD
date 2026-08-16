"""
Tests — le fondateur choisit si le directeur général voit la comptabilité.

Le DG avait accès à la comptabilité d'office. Certains établissements le veulent,
d'autres non : le fondateur tranche à la création (`acces_comptabilite`).

Règle vérifiée ici, côté serveur (pas seulement un menu caché) :
  - DG avec accès (« O », le défaut) : la finance et la comptabilité répondent.
  - DG sans accès (« N ») : 403 sur la finance ET la comptabilité.
  - Les autres rôles finance (ADMIN, COMPTABLE…) ne sont jamais concernés par
    ce réglage : il ne s'applique qu'au DG.
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

FINANCE = ("GET", "/api/finance/factures")
COMPTA = ("GET", "/api/comptabilite/comptes")


def _appel(client: TestClient, methode: str, url: str, token: dict):
    with patch("app.core.auth.decode_token", return_value=token):
        return client.request(methode, url, headers={"Authorization": "Bearer x"})


class TestLeDgEtLaComptabilite:

    @pytest.mark.parametrize("methode,url", [FINANCE, COMPTA])
    def test_dg_avec_acces_passe(self, client: TestClient, methode, url):
        token = {"sub": "1", "role": "DG", "type": "admin",
                 "etablissement_id": 1, "acces_comptabilite": "O"}
        r = _appel(client, methode, url, token)
        assert r.status_code not in (401, 403), f"{url} : le DG autorisé devrait passer"

    @pytest.mark.parametrize("methode,url", [FINANCE, COMPTA])
    def test_dg_sans_acces_est_bloque(self, client: TestClient, methode, url):
        token = {"sub": "1", "role": "DG", "type": "admin",
                 "etablissement_id": 1, "acces_comptabilite": "N"}
        r = _appel(client, methode, url, token)
        assert r.status_code == 403, f"{url} : le DG sans accès devrait être bloqué (403)"

    def test_un_token_dg_ancien_sans_le_champ_garde_l_acces(self, client: TestClient):
        """Rétro-compat : un jeton émis avant le réglage vaut « O » (accès)."""
        token = {"sub": "1", "role": "DG", "type": "admin", "etablissement_id": 1}
        r = _appel(client, *FINANCE, token)
        assert r.status_code not in (401, 403)

    @pytest.mark.parametrize("role", ["ADMIN", "COMPTABLE", "FONDATEUR"])
    def test_le_reglage_n_affecte_que_le_dg(self, client: TestClient, role):
        """Un ADMIN/COMPTABLE/FONDATEUR garde l'accès même si le champ dit « N »
        (il ne s'applique qu'au DG)."""
        token = {"sub": "1", "role": role, "type": "admin",
                 "etablissement_id": 1, "acces_comptabilite": "N"}
        r = _appel(client, *FINANCE, token)
        assert r.status_code not in (401, 403), f"{role} ne doit pas être concerné par le réglage DG"
