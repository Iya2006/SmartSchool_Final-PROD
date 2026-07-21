"""
Tests — Système d'authentification
Vérifie les scénarios de login admin (succès, échec, compte désactivé).

feat(test): ajouter tests unitaires authentification
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import Utilisateur
from app.core.security import hash_password

# Compteur pour générer des identifiants uniques entre les tests
_COUNTER = 0

def _unique_id() -> int:
    """Génère un entier unique à chaque appel (pour usernames/emails/téléphones)."""
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


# ─── Fixtures ────────────────────────────────────────────────────────────────

def create_admin_user(db: Session, statut: str = "ACTIF") -> Utilisateur:
    """Crée un utilisateur admin de test avec un username unique."""
    uid = _unique_id()
    user = Utilisateur(
        nom="Camara",
        prenom="Alpha",
        nom_utilisateur=f"alpha.test.{uid}",
        email=f"alpha.test.{uid}@smartschool.gn",
        telephone=f"62000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"),
        role="ADMIN",
        statut=statut,
        etablissement_id=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestAuthLogin:
    """Tests du endpoint POST /api/auth/login"""

    def test_login_succes_avec_nom_utilisateur(self, client: TestClient, db: Session):
        """✅ Un admin actif peut se connecter avec son nom_utilisateur."""
        user = create_admin_user(db)
        response = client.post("/api/auth/login", json={
            "identifiant": user.nom_utilisateur,
            "mot_de_passe": "motdepasse123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["nom"] == "Camara"
        assert data["user"]["prenom"] == "Alpha"
        assert data["user"]["role"] == "ADMIN"

    def test_login_succes_avec_email(self, client: TestClient, db: Session):
        """✅ Un admin actif peut se connecter avec son email."""
        user = create_admin_user(db)
        response = client.post("/api/auth/login", json={
            "identifiant": user.email,
            "mot_de_passe": "motdepasse123"
        })
        assert response.status_code == 200
        assert "token" in response.json()

    def test_login_succes_avec_telephone(self, client: TestClient, db: Session):
        """✅ Un admin actif peut se connecter avec son téléphone."""
        user = create_admin_user(db)
        response = client.post("/api/auth/login", json={
            "identifiant": user.telephone,
            "mot_de_passe": "motdepasse123"
        })
        assert response.status_code == 200
        assert "token" in response.json()

    def test_login_mauvais_mot_de_passe(self, client: TestClient):
        """❌ Mauvais mot de passe → 401 Unauthorized."""
        response = client.post("/api/auth/login", json={
            "identifiant": "alpha.test",
            "mot_de_passe": "mauvais_mdp"
        })
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    def test_login_identifiant_inconnu(self, client: TestClient):
        """❌ Identifiant inexistant → 401 Unauthorized."""
        response = client.post("/api/auth/login", json={
            "identifiant": "utilisateur.inexistant",
            "mot_de_passe": "motdepasse123"
        })
        assert response.status_code == 401

    def test_login_compte_desactive(self, client: TestClient, db: Session):
        """❌ Compte désactivé → 403 Forbidden."""
        # Creer un compte INACTIF avec un username unique
        user = create_admin_user(db, statut="INACTIF")
        response = client.post("/api/auth/login", json={
            "identifiant": user.nom_utilisateur,
            "mot_de_passe": "motdepasse123"
        })
        assert response.status_code == 403
        assert "désactivé" in response.json()["detail"].lower()

    def test_token_jwt_valide(self, client: TestClient, db: Session):
        """✅ Le token retourné permet d'accéder à /api/auth/me."""
        # Créer un user dédié pour CE test (indépendant des autres tests)
        user = Utilisateur(
            nom="TestJwt", prenom="User",
            nom_utilisateur="jwt.valide.test",
            email="jwt.valide@smartschool.gn",
            telephone="620000099",
            mot_de_passe=hash_password("pwd_jwt_test"),
            role="ADMIN", statut="ACTIF", etablissement_id=1,
        )
        db.add(user)
        db.commit()

        login_resp = client.post("/api/auth/login", json={
            "identifiant": "jwt.valide.test",
            "mot_de_passe": "pwd_jwt_test"
        })
        assert login_resp.status_code == 200, f"Login échoué: {login_resp.json()}"
        token = login_resp.json()["token"]

        me_resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["nom"] == "TestJwt"

    def test_acces_sans_token_refuse(self, client: TestClient):
        """❌ Accès à une route protégée sans token → 401."""
        response = client.get("/api/eleves")
        assert response.status_code == 401

    def test_acces_token_invalide_refuse(self, client: TestClient):
        """❌ Token falsifié → 401."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer token.faux.invalide"}
        )
        assert response.status_code == 401
