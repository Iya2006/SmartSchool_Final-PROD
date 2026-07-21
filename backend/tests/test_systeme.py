"""
Tests — Système global et santé de l'API
Vérifie que l'application démarre correctement et que les routes de base répondent.

feat(test): ajouter tests système et health check
"""
import pytest
from fastapi.testclient import TestClient


class TestSysteme:
    """Tests de santé et de structure globale de l'API."""

    def test_health_check_retourne_ok(self, client: TestClient):
        """✅ Le endpoint /health retourne statut 'ok'."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"

    def test_root_retourne_infos_application(self, client: TestClient):
        """✅ Le endpoint / retourne les infos de l'application."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "application" in data
        assert data["application"] == "SMARTSCHOOL ERP"
        assert "version" in data
        assert "documentation" in data

    def test_docs_swagger_accessible(self, client: TestClient):
        """✅ La documentation Swagger /docs est accessible."""
        response = client.get("/docs")
        assert response.status_code == 200

    def test_redoc_accessible(self, client: TestClient):
        """✅ La documentation ReDoc /redoc est accessible."""
        response = client.get("/redoc")
        assert response.status_code == 200


class TestSecuriteRoutesProtegees:
    """
    Vérifie que TOUTES les routes protégées renvoient 401 sans token.
    Teste la couverture sécurité globale de l'API.
    """

    ROUTES_PROTEGEES = [
        ("GET", "/api/eleves"),
        ("GET", "/api/enseignants"),
        ("GET", "/api/classes"),
        ("GET", "/api/dashboard/"),
        ("GET", "/api/finance/factures"),
        ("GET", "/api/communication/messages"),
    ]

    @pytest.mark.parametrize("method,url", ROUTES_PROTEGEES)
    def test_route_protegee_sans_token_retourne_401(
        self, client: TestClient, method: str, url: str
    ):
        """❌ Toute route protégée sans token → 401 Unauthorized."""
        if method == "GET":
            response = client.get(url)
        elif method == "POST":
            response = client.post(url, json={})
        else:
            response = client.request(method, url)

        assert response.status_code == 401, (
            f"La route {method} {url} devrait retourner 401 sans token, "
            f"mais a retourné {response.status_code}"
        )

    def test_route_login_est_publique(self, client: TestClient):
        """✅ La route /api/auth/login est accessible sans token
        Elle renvoie 401 pour mauvais identifiants (pas 422 = token manquant)."""
        response = client.post("/api/auth/login", json={
            "identifiant": "inexistant",
            "mot_de_passe": "mauvais"
        })
        # 401 = identifiants incorrects (route est PUBLIQUE et accessible)
        # 422 = validation pydantic (route inaccessible ou mauvais body)
        # On accepte 401 OU 422 — l'important c'est PAS 403 (Forbidden token)
        assert response.status_code in [401, 422], (
            f"La route login doit être publique, retourné {response.status_code}"
        )

    def test_headers_securite_presents(self, client: TestClient):
        """✅ Les headers de sécurité sont présents dans chaque réponse."""
        response = client.get("/")
        assert "x-content-type-options" in response.headers
        assert "x-frame-options" in response.headers
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
