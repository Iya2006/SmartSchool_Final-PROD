"""
Tests — Sécurité du Portail Enseignant (OWASP Broken Access Control)

Avant correction, `portail_enseignant.py` n'imposait AUCUNE authentification :
tous les endpoints /{enseignant_id}/... étaient accessibles sans token, et un
token valide d'un autre rôle (parent, élève) ou d'un autre enseignant pouvait
lire/modifier les données de n'importe quel enseignant.

Ces tests verrouillent le comportement attendu après correction :
- Aucun token -> 401
- Token d'un autre enseignant -> 403
- Token du bon enseignant -> 200/404 (jamais 401/403)
- Token admin -> bypass autorisé
"""
from fastapi.testclient import TestClient
from unittest.mock import patch


class TestPortailEnseignantOwnershipSecurity:
    """Vérifie que le portail enseignant rejette les accès non autorisés."""

    # ── Sans token : 401 sur les endpoints sensibles ──────────────────────
    def test_dashboard_sans_token_401(self, client: TestClient):
        response = client.get("/api/portail-enseignant/1/dashboard")
        assert response.status_code == 401

    def test_evaluations_sans_token_401(self, client: TestClient):
        response = client.get("/api/portail-enseignant/1/evaluations")
        assert response.status_code == 401

    def test_historique_appels_sans_token_401(self, client: TestClient):
        response = client.get("/api/portail-enseignant/1/historique-appels")
        assert response.status_code == 401

    def test_edt_sans_token_401(self, client: TestClient):
        response = client.get("/api/portail-enseignant/1/emploi-du-temps")
        assert response.status_code == 401

    def test_changer_mot_de_passe_sans_token_401(self, client: TestClient):
        response = client.put(
            "/api/portail-enseignant/1/changer-mot-de-passe",
            json={"nouveau_mdp": "nouveauMdp123"},
        )
        assert response.status_code == 401

    def test_presences_sans_token_401(self, client: TestClient):
        response = client.post(
            "/api/portail-enseignant/1/presences",
            json={"classe_id": 1, "demi_journee": "MATIN", "presences": []},
        )
        assert response.status_code == 401

    def test_notes_sans_token_401(self, client: TestClient):
        response = client.post(
            "/api/portail-enseignant/1/notes",
            json={"classe_id": 1, "matiere_id": 1, "libelle": "Devoir 1", "notes": []},
        )
        assert response.status_code == 401

    def test_ressources_sans_token_401(self, client: TestClient):
        response = client.get("/api/portail-enseignant/1/ressources")
        assert response.status_code == 401

    # ── Accès croisé : un enseignant ne peut pas lire un autre enseignant ──
    def test_acces_croise_dashboard_403(self, client: TestClient):
        """FAIL: Enseignant 1 ne peut pas accéder aux données de l'Enseignant 999 -> 403."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "enseignant", "nom": "Enseignant Un",
        }):
            response = client.get(
                "/api/portail-enseignant/999/dashboard",
                headers={"Authorization": "Bearer fake_enseignant_1"},
            )
        assert response.status_code == 403

    def test_acces_croise_changer_mdp_403(self, client: TestClient):
        """FAIL: Enseignant 1 ne peut pas changer le mot de passe de l'Enseignant 999."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "enseignant", "nom": "Enseignant Un",
        }):
            response = client.put(
                "/api/portail-enseignant/999/changer-mot-de-passe",
                json={"nouveau_mdp": "pirateMdp123"},
                headers={"Authorization": "Bearer fake_enseignant_1"},
            )
        assert response.status_code == 403

    def test_acces_croise_notes_403(self, client: TestClient):
        """FAIL: Enseignant 1 ne peut pas saisir de notes au nom de l'Enseignant 999."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "enseignant", "nom": "Enseignant Un",
        }):
            response = client.post(
                "/api/portail-enseignant/999/notes",
                json={"classe_id": 1, "matiere_id": 1, "libelle": "Devoir 1", "notes": []},
                headers={"Authorization": "Bearer fake_enseignant_1"},
            )
        assert response.status_code == 403

    # ── Un parent/élève ne peut pas usurper le portail enseignant ─────────
    def test_token_parent_refuse_403(self, client: TestClient):
        """FAIL: Un token PARENT valide ne donne pas accès au portail enseignant."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "parent", "nom": "Parent Un",
        }):
            response = client.get(
                "/api/portail-enseignant/1/dashboard",
                headers={"Authorization": "Bearer fake_parent_token"},
            )
        assert response.status_code == 403

    # ── Accès légitime : propres données -> jamais 401/403 ────────────────
    def test_acces_propre_200_ou_404(self, client: TestClient):
        """OK: Un enseignant accède à ses propres données -> 200 ou 404 (absent en DB test)."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "enseignant", "nom": "Enseignant Un",
        }):
            response = client.get(
                "/api/portail-enseignant/1/dashboard",
                headers={"Authorization": "Bearer fake_enseignant_token"},
            )
        assert response.status_code in [200, 404]

    def test_acces_propre_ressources_200(self, client: TestClient):
        """OK: Un enseignant peut lister ses propres ressources -> 200."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "enseignant", "nom": "Enseignant Un",
        }):
            response = client.get(
                "/api/portail-enseignant/1/ressources",
                headers={"Authorization": "Bearer fake_enseignant_token"},
            )
        assert response.status_code == 200

    # ── Bypass admin ────────────────────────────────────────────────────
    # NOTE — ces tests affirmaient "un admin accede aux donnees de N IMPORTE
    # QUEL enseignant". Vrai en mono-etablissement, faille en multi-ecoles :
    # un administrateur de l'ecole A consultait les classes et les notes d'un
    # enseignant de l'ecole B, et pouvait meme reinitialiser son mot de passe.
    # Le perimetre de l'admin s'arrete desormais a son ecole.

    def test_admin_sans_etablissement_est_refuse(self, client: TestClient):
        """SUPER_ADMIN plateforme : doit choisir une ecole avant d'entrer."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin",
        }):
            response = client.get(
                "/api/portail-enseignant/999/dashboard",
                headers={"Authorization": "Bearer fake_admin"},
            )
        assert response.status_code == 403

    def test_admin_ne_lit_pas_l_enseignant_d_une_autre_ecole(self, client: TestClient):
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin", "etablissement_id": 1,
        }):
            response = client.get(
                "/api/portail-enseignant/999999/dashboard",
                headers={"Authorization": "Bearer fake_admin"},
            )
        assert response.status_code == 404

    def test_admin_ne_reinitialise_pas_le_mdp_d_une_autre_ecole(self, client: TestClient):
        """Le plus grave des deux : reinitialiser un mot de passe, c'est
        prendre le controle du compte."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin", "etablissement_id": 1,
        }):
            response = client.put(
                "/api/portail-enseignant/999999/changer-mot-de-passe",
                json={"nouveau_mdp": "resetParAdmin123"},
                headers={"Authorization": "Bearer fake_admin"},
            )
        assert response.status_code == 404
