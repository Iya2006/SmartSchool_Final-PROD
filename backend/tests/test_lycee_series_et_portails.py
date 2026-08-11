"""
Tests — Endpoints lycee-series-coefficients + Portails Ownership
Vérifie la sécurité, les droits et le comportement fonctionnel.

Endpoints testés :
  GET  /api/classes/lycee-series-coefficients
  PUT  /api/classes/lycee-series-coefficients/{serie}
  GET  /api/portail-parent/{parent_id}/dashboard  (ownership)
  GET  /api/portail-eleve/{eleve_id}/dashboard    (ownership)
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


class TestGetLyceeSeriesCoefficients:
    """Tests pour GET /api/classes/lycee-series-coefficients."""

    def test_sans_token_retourne_401(self, client: TestClient):
        """FAIL: Sans token -> 401 Unauthorized."""
        response = client.get("/api/classes/lycee-series-coefficients")
        assert response.status_code == 401, (
            f"Doit retourner 401 sans token, recu {response.status_code}"
        )

    def test_avec_token_non_admin_retourne_403(self, client: TestClient):
        """FAIL: Role non-admin -> 403 Forbidden."""
        with patch("app.core.auth.decode_token", return_value={"role": "ENSEIGNANT", "sub": "99", "type": "admin", "etablissement_id": 1}):
            response = client.get(
                "/api/classes/lycee-series-coefficients",
                headers={"Authorization": "Bearer fake_token"},
            )
        assert response.status_code == 403

    def test_avec_token_admin_retourne_200(self, client: TestClient):
        """OK: Admin valide -> 200 avec les 3 series SM/SE/SS."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.get(
                "/api/classes/lycee-series-coefficients",
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "SM" in data
        assert "SE" in data
        assert "SS" in data

    def test_structure_reponse_serie_correcte(self, client: TestClient):
        """OK: Chaque serie contient classes_count et matieres."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.get(
                "/api/classes/lycee-series-coefficients",
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200
        data = response.json()
        for serie in ["SM", "SE", "SS"]:
            assert serie in data
            serie_data = data[serie]
            assert "classes_count" in serie_data
            assert "matieres" in serie_data
            assert isinstance(serie_data["classes_count"], int)
            assert isinstance(serie_data["matieres"], list)

    def test_super_admin_retourne_200(self, client: TestClient):
        """OK: SUPER_ADMIN a acces."""
        with patch("app.core.auth.decode_token", return_value={"role": "SUPER_ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.get(
                "/api/classes/lycee-series-coefficients",
                headers={"Authorization": "Bearer fake_super_token"},
            )
        assert response.status_code == 200

    def test_fondateur_retourne_200(self, client: TestClient):
        """OK: FONDATEUR a acces."""
        with patch("app.core.auth.decode_token", return_value={"role": "FONDATEUR", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.get(
                "/api/classes/lycee-series-coefficients",
                headers={"Authorization": "Bearer fake_token"},
            )
        assert response.status_code == 200


@pytest.fixture
def matiere_etab1(db):
    """Une vraie matière rattachée à l'établissement 1 (via son Cycle).

    Depuis le Lot 7 du chantier multi-écoles, PUT lycee-series-coefficients
    refuse (403) toute matière n'appartenant pas à l'établissement appelant —
    l'ancien `matiere_id: 999` (inexistant) était accepté silencieusement avec
    un 200 qui ne modifiait rien. Ces tests utilisent donc une matière réelle,
    ce qui vérifie vraiment le chemin nominal.
    """
    from app.models.academique import Cycle, Matiere

    cycle = db.query(Cycle).filter(Cycle.etablissement_id == 1).first()
    if not cycle:
        cycle = Cycle(etablissement_id=1, code="LYC-TEST", libelle="Lycée (test)", ordre=1)
        db.add(cycle); db.commit(); db.refresh(cycle)

    matiere = db.query(Matiere).filter(Matiere.cycle_id == cycle.cycle_id).first()
    if not matiere:
        matiere = Matiere(cycle_id=cycle.cycle_id, code="MATH-TEST", libelle="Maths (test)", note_sur=20)
        db.add(matiere); db.commit(); db.refresh(matiere)
    return matiere


class TestPutLyceeSeriesCoefficients:
    """Tests pour PUT /api/classes/lycee-series-coefficients/{serie}."""

    @staticmethod
    def _payload(matiere_id: int):
        return [{"matiere_id": matiere_id, "coefficient": 3.0, "note_sur": 20.0}]

    VALID_UPDATE = [
        {"matiere_id": 999, "coefficient": 3.0, "note_sur": 20.0}
    ]

    def test_sans_token_retourne_401(self, client: TestClient):
        """FAIL: Sans token -> 401 pour PUT."""
        response = client.put(
            "/api/classes/lycee-series-coefficients/SM",
            json=self.VALID_UPDATE,
        )
        assert response.status_code == 401

    def test_serie_invalide_retourne_400(self, client: TestClient):
        """FAIL: Serie inconnue -> 400 Bad Request."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/XYZ",
                json=self.VALID_UPDATE,
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data

    def test_serie_sm_retourne_200(self, client: TestClient, matiere_etab1):
        """OK: Serie SM avec admin -> 200."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=self._payload(matiere_etab1.matiere_id),
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200

    def test_serie_se_retourne_200(self, client: TestClient, matiere_etab1):
        """OK: Serie SE avec admin -> 200."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SE",
                json=self._payload(matiere_etab1.matiere_id),
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200

    def test_serie_ss_retourne_200(self, client: TestClient, matiere_etab1):
        """OK: Serie SS avec admin -> 200."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SS",
                json=self._payload(matiere_etab1.matiere_id),
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200

    def test_serie_minuscule_acceptee(self, client: TestClient, matiere_etab1):
        """OK: La serie en minuscules (sm) doit aussi etre acceptee."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/sm",
                json=self._payload(matiere_etab1.matiere_id),
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200

    def test_reponse_contient_message_et_serie(self, client: TestClient, matiere_etab1):
        """OK: La reponse contient message et serie."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=self._payload(matiere_etab1.matiere_id),
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "serie" in data
        assert data["serie"] == "SM"

    def test_matiere_inconnue_refusee(self, client: TestClient):
        """Lot 7 : une matière inexistante (ou d'une autre école) est refusée
        (403) au lieu d'être silencieusement ignorée avec un 200."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=self.VALID_UPDATE,  # matiere_id: 999, inexistant
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 403

    def test_coefficient_zero_retourne_422(self, client: TestClient):
        """FAIL: Coefficient = 0 -> 422 Pydantic validation."""
        invalid_updates = [{"matiere_id": 1, "coefficient": 0.0, "note_sur": 20.0}]
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=invalid_updates,
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 422

    def test_coefficient_trop_eleve_retourne_422(self, client: TestClient):
        """FAIL: Coefficient > 10 -> 422."""
        invalid_updates = [{"matiere_id": 1, "coefficient": 15.0, "note_sur": 20.0}]
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=invalid_updates,
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 422

    def test_note_sur_trop_elevee_retourne_422(self, client: TestClient):
        """FAIL: note_sur > 100 -> 422."""
        invalid_updates = [{"matiere_id": 1, "coefficient": 2.0, "note_sur": 150.0}]
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=invalid_updates,
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code == 422

    def test_role_enseignant_retourne_403(self, client: TestClient):
        """FAIL: Role ENSEIGNANT -> 403 pour PUT."""
        with patch("app.core.auth.decode_token", return_value={"role": "ENSEIGNANT", "sub": "5", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=self.VALID_UPDATE,
                headers={"Authorization": "Bearer fake_token"},
            )
        assert response.status_code == 403

    def test_body_vide_accepte(self, client: TestClient):
        """OK: Body vide [] -> 200 avec 0 mises a jour."""
        with patch("app.core.auth.decode_token", return_value={"role": "ADMIN", "sub": "1", "type": "admin", "etablissement_id": 1}):
            response = client.put(
                "/api/classes/lycee-series-coefficients/SM",
                json=[],
                headers={"Authorization": "Bearer fake_admin_token"},
            )
        assert response.status_code in [200, 422]


class TestPortailOwnershipSecurity:
    """
    Verifie que les portails parent/eleve rejettent les acces croises.
    OWASP Broken Access Control.
    """

    def test_portail_parent_dashboard_sans_token_401(self, client: TestClient):
        """FAIL: GET portail parent sans token -> 401."""
        response = client.get("/api/portail-parent/1/dashboard")
        assert response.status_code == 401

    def test_portail_parent_notes_sans_token_401(self, client: TestClient):
        """FAIL: GET portail parent notes sans token -> 401."""
        response = client.get("/api/portail-parent/1/enfant/1/notes")
        assert response.status_code == 401

    def test_portail_parent_messages_sans_token_401(self, client: TestClient):
        """FAIL: GET portail parent messages sans token -> 401."""
        response = client.get("/api/portail-parent/1/messages")
        assert response.status_code == 401

    def test_portail_parent_profil_sans_token_401(self, client: TestClient):
        """FAIL: GET portail parent profil sans token -> 401."""
        response = client.get("/api/portail-parent/1/profil")
        assert response.status_code == 401

    def test_portail_parent_acces_croise_403(self, client: TestClient):
        """FAIL: Parent 1 ne peut pas acceder aux donnees du Parent 999 -> 403."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "parent", "nom": "Parent Un"
        }):
            response = client.get(
                "/api/portail-parent/999/dashboard",
                headers={"Authorization": "Bearer fake_parent_1"},
            )
        assert response.status_code == 403, (
            f"Acces croise doit retourner 403, recu {response.status_code}"
        )

    def test_portail_parent_acces_propre_200_ou_404(self, client: TestClient):
        """OK: Parent accede a ses propres donnees -> 200 ou 404 (absent en DB test)."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "parent", "nom": "Parent Un"
        }):
            response = client.get(
                "/api/portail-parent/1/dashboard",
                headers={"Authorization": "Bearer fake_parent_token"},
            )
        assert response.status_code in [200, 404]

    def test_portail_eleve_dashboard_sans_token_401(self, client: TestClient):
        """FAIL: GET portail eleve sans token -> 401."""
        response = client.get("/api/portail-eleve/1/dashboard")
        assert response.status_code == 401

    def test_portail_eleve_notes_sans_token_401(self, client: TestClient):
        """FAIL: GET portail eleve notes sans token -> 401."""
        response = client.get("/api/portail-eleve/1/notes")
        assert response.status_code == 401

    def test_portail_eleve_acces_croise_403(self, client: TestClient):
        """FAIL: Eleve 1 ne peut pas acceder aux donnees de l'Eleve 999 -> 403."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "eleve", "nom": "Eleve Un"
        }):
            response = client.get(
                "/api/portail-eleve/999/dashboard",
                headers={"Authorization": "Bearer fake_eleve_1"},
            )
        assert response.status_code == 403

    def test_portail_eleve_acces_propre_200_ou_404(self, client: TestClient):
        """OK: Eleve accede a ses propres donnees -> 200 ou 404."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "type": "eleve", "nom": "Eleve Un"
        }):
            response = client.get(
                "/api/portail-eleve/1/dashboard",
                headers={"Authorization": "Bearer fake_eleve_token"},
            )
        assert response.status_code in [200, 404]

    def test_admin_bypass_portail_parent(self, client: TestClient):
        """OK: Admin peut acceder aux donnees de n importe quel parent."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin"
        }):
            response = client.get(
                "/api/portail-parent/999/dashboard",
                headers={"Authorization": "Bearer fake_admin"},
            )
        assert response.status_code not in [401, 403]

    def test_admin_bypass_portail_eleve(self, client: TestClient):
        """OK: Admin peut acceder aux donnees de n importe quel eleve."""
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin"
        }):
            response = client.get(
                "/api/portail-eleve/999/dashboard",
                headers={"Authorization": "Bearer fake_admin"},
            )
        assert response.status_code not in [401, 403]
