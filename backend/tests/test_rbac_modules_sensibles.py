"""
Tests — RBAC sur les modules sensibles (Finance, Comptabilité, Personnel, Présences Agents)

Avant correction, ces routeurs n'étaient protégés que par `get_current_user`,
qui valide uniquement la signature du JWT sans jamais vérifier le rôle.
Un token ENSEIGNANT, PARENT ou ELEVE valide suffisait donc à consulter les
factures, salaires, dépenses, fiches RH (RIB, CNI, salaire) et l'historique
de présence du personnel de tout l'établissement.

Ces tests verrouillent le comportement attendu après correction :
- Aucun token -> 401
- Token d'un rôle externe (ENSEIGNANT/PARENT/ELEVE) -> 403
- Token ADMIN/COMPTABLE -> jamais 401/403 (accès autorisé)
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

ROUTES_SENSIBLES = [
    ("GET", "/api/finance/factures"),
    ("GET", "/api/comptabilite/comptes"),
    ("GET", "/api/personnel"),
    ("GET", "/api/presences-agents/historique"),
]

# Sujets d'examens : seuls direction + enseignants sont autorises (jamais eleve/parent)
ROUTES_EXAMENS = [
    ("GET", "/api/examens/sujets"),
]


class TestRbacSansToken:
    """Sans token, toutes les routes sensibles doivent renvoyer 401."""

    @pytest.mark.parametrize("method,url", ROUTES_SENSIBLES)
    def test_sans_token_401(self, client: TestClient, method: str, url: str):
        response = client.request(method, url)
        assert response.status_code == 401


class TestRbacRolesExternesRefuses:
    """Un rôle externe authentifié (ENSEIGNANT/PARENT/ELEVE) doit être rejeté (403)."""

    @pytest.mark.parametrize("method,url", ROUTES_SENSIBLES)
    @pytest.mark.parametrize("role,token_type", [
        ("ENSEIGNANT", "enseignant"),
        ("PARENT", "parent"),
        ("ELEVE", "eleve"),
    ])
    def test_role_externe_403(self, client: TestClient, method: str, url: str, role: str, token_type: str):
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": role, "type": token_type,
        }):
            response = client.request(
                method, url, headers={"Authorization": "Bearer fake_token"}
            )
        assert response.status_code == 403, (
            f"{method} {url} avec role={role} devrait renvoyer 403, recu {response.status_code}"
        )


class TestRbacRolesAutorises:
    """Les rôles ADMIN et COMPTABLE doivent pouvoir accéder (jamais 401/403)."""

    @pytest.mark.parametrize("method,url", ROUTES_SENSIBLES)
    @pytest.mark.parametrize("role", ["ADMIN", "SUPER_ADMIN", "FONDATEUR", "DG", "COMPTABLE"])
    def test_role_autorise_pas_401_403(self, client: TestClient, method: str, url: str, role: str):
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": role, "type": "admin",
        }):
            response = client.request(
                method, url, headers={"Authorization": "Bearer fake_admin_token"}
            )
        assert response.status_code not in (401, 403), (
            f"{method} {url} avec role={role} ne devrait pas etre refuse, recu {response.status_code}"
        )


class TestRbacExamensElevesParentsRefuses:
    """Un eleve ou un parent ne doit jamais pouvoir lister/telecharger un sujet d'examen."""

    @pytest.mark.parametrize("method,url", ROUTES_EXAMENS)
    def test_examens_sans_token_401(self, client: TestClient, method: str, url: str):
        response = client.request(method, url)
        assert response.status_code == 401

    @pytest.mark.parametrize("method,url", ROUTES_EXAMENS)
    @pytest.mark.parametrize("role,token_type", [("ELEVE", "eleve"), ("PARENT", "parent")])
    def test_examens_eleve_parent_403(self, client: TestClient, method: str, url: str, role: str, token_type: str):
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": role, "type": token_type,
        }):
            response = client.request(
                method, url, headers={"Authorization": "Bearer fake_token"}
            )
        assert response.status_code == 403

    @pytest.mark.parametrize("method,url", ROUTES_EXAMENS)
    @pytest.mark.parametrize("role", ["ADMIN", "ENSEIGNANT"])
    def test_examens_admin_enseignant_pas_401_403(self, client: TestClient, method: str, url: str, role: str):
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": role, "type": "admin" if role == "ADMIN" else "enseignant",
        }):
            response = client.request(
                method, url, headers={"Authorization": "Bearer fake_token"}
            )
        assert response.status_code not in (401, 403)
