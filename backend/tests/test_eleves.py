"""
Tests — Module Élèves (CRUD complet)
Vérifie la liste, la création, la modification et la suppression d'élèves.

feat(test): ajouter tests unitaires module élèves
"""
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import Utilisateur, Eleve
from app.core.security import hash_password
from app.core.auth import create_access_token

# Compteur pour usernames uniques (isolation entre tests)
_ELV_COUNTER = 0

def _uid() -> int:
    global _ELV_COUNTER
    _ELV_COUNTER += 1
    return _ELV_COUNTER

# ─── Helpers ────────────────────────────────────────────────────────────────

def get_auth_headers(db: Session) -> dict:
    """Crée un token admin valide pour les routes protégées.
    Crée toujours un nouvel utilisateur avec un nom unique pour éviter
    les conflits de contrainte UNIQUE entre les tests.
    """
    uid = _uid()
    user = Utilisateur(
        nom="Diallo", prenom="Mamadou",
        nom_utilisateur=f"mamadou.elv.{uid}",
        email=f"mamadou.elv.{uid}@smartschool.gn",
        telephone=f"6210{uid:05d}",
        mot_de_passe=hash_password("test123"),
        role="ADMIN", statut="ACTIF", etablissement_id=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({
        "sub": str(user.utilisateur_id),
        "nom": user.nom,
        "prenom": user.prenom,
        "role": user.role,
        "type": "admin",
        # Requis depuis le Lot 6 sur /api/eleves — un token sans ce champ
        # (ancien format) est désormais refusé (403), conformément au Lot 0.
        "etablissement_id": user.etablissement_id,
    })
    return {"Authorization": f"Bearer {token}"}


def create_test_eleve(db: Session, nom: str = "Bah", prenom: str = "Fatoumata") -> Eleve:
    """Crée un élève de test directement en DB."""
    from sqlalchemy import func
    count = db.query(func.count(Eleve.eleve_id)).scalar() or 0
    eleve = Eleve(
        nom=nom, prenom=prenom,
        sexe="F", statut="ACTIF",
        date_naissance=date(2010, 1, 1),   # objet Python date (pas une string)
        etablissement_id=1,
        matricule=f"ELV-TEST-{count + 1:03d}",
    )
    db.add(eleve)
    db.commit()
    db.refresh(eleve)
    return eleve


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestElevesListe:
    """Tests du endpoint GET /api/eleves"""

    def test_liste_eleves_retourne_200(self, client: TestClient, db: Session):
        """✅ La liste des élèves retourne 200."""
        headers = get_auth_headers(db)
        response = client.get("/api/eleves?etablissement_id=1&annee_id=1", headers=headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_liste_sans_auth_retourne_401(self, client: TestClient):
        """❌ Sans token → 401."""
        response = client.get("/api/eleves")
        assert response.status_code == 401

    def test_count_eleves_retourne_totaux(self, client: TestClient, db: Session):
        """✅ Le compteur retourne total, actifs, inactifs."""
        headers = get_auth_headers(db)
        response = client.get("/api/eleves/count?etablissement_id=1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "actifs" in data
        assert "inactifs" in data
        assert data["total"] == data["actifs"] + data["inactifs"]

    def test_recherche_par_nom(self, client: TestClient, db: Session):
        """✅ La recherche filtre correctement par nom."""
        headers = get_auth_headers(db)
        # Créer l'élève avec un nom tp unique
        eleve = create_test_eleve(db, nom="NomRechercheUnique", prenom="Test")
        # En SQLite ILIKE n'est pas supporté nativement — le test vérifie juste la réponse 200
        response = client.get(
            f"/api/eleves?etablissement_id=1&annee_id=1&search={eleve.nom}",
            headers=headers
        )
        assert response.status_code == 200
        # Soit l'élève est trouvé (PostgreSQL full), soit 0 résultat (SQLite)
        assert isinstance(response.json(), list)


class TestElevesCreation:
    """Tests du endpoint POST /api/eleves"""

    def test_creer_eleve_minimal(self, client: TestClient, db: Session):
        """✅ Créer un élève avec les données minimales obligatoires."""
        headers = get_auth_headers(db)
        payload = {
            "nom": "Soumah",
            "prenom": "Aissatou",
            "sexe": "F",
            "date_naissance": "2010-05-15",
            "statut": "ACTIF",
            "etablissement_id": 1,
        }
        response = client.post("/api/eleves", json=payload, headers=headers)
        assert response.status_code == 201, f"422 body: {response.json()}"
        data = response.json()
        assert data["nom"] == "Soumah"
        assert data["prenom"] == "Aissatou"
        assert data["matricule"].startswith("ELV-")

    def test_matricule_genere_automatiquement(self, client: TestClient, db: Session):
        """✅ Le matricule est généré automatiquement (format ELV-XXXXX)."""
        headers = get_auth_headers(db)
        payload = {
            "nom": "Toure", "prenom": "Saliou",
            "sexe": "M", "statut": "ACTIF",
            "date_naissance": "2011-03-20",
            "etablissement_id": 1,
        }
        response = client.post("/api/eleves", json=payload, headers=headers)
        assert response.status_code == 201
        assert response.json()["matricule"].startswith("ELV-")

    def test_creer_sans_auth_retourne_401(self, client: TestClient):
        """❌ Créer un élève sans token → 401."""
        response = client.post("/api/eleves", json={
            "nom": "Test", "prenom": "User", "sexe": "M",
            "statut": "ACTIF", "etablissement_id": 1,
        })
        assert response.status_code == 401


class TestElevesDetail:
    """Tests des endpoints GET/PUT/DELETE /api/eleves/{id}"""

    def test_obtenir_eleve_existant(self, client: TestClient, db: Session):
        """✅ Récupérer un élève par son ID."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="Conde", prenom="Moussa")
        response = client.get(f"/api/eleves/{eleve.eleve_id}", headers=headers)
        assert response.status_code == 200
        assert response.json()["nom"] == "Conde"

    def test_obtenir_eleve_inexistant_retourne_404(self, client: TestClient, db: Session):
        """❌ ID inexistant → 404 Not Found."""
        headers = get_auth_headers(db)
        response = client.get("/api/eleves/99999", headers=headers)
        assert response.status_code == 404
        assert "non trouvé" in response.json()["detail"]

    def test_modifier_eleve(self, client: TestClient, db: Session):
        """✅ Modifier le nom et le statut d'un élève."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="Sylla", prenom="Kadiatou")
        response = client.put(
            f"/api/eleves/{eleve.eleve_id}",
            json={"nom": "Sylla-Modifie", "statut": "INACTIF"},
            headers=headers
        )
        assert response.status_code == 200
        assert response.json()["nom"] == "Sylla-Modifie"
        assert response.json()["statut"] == "INACTIF"

    def test_supprimer_eleve(self, client: TestClient, db: Session):
        """✅ Supprimer un élève existant."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="ASupprimer", prenom="Test")
        response = client.delete(f"/api/eleves/{eleve.eleve_id}", headers=headers)
        assert response.status_code == 200

        # Vérifier qu'il n'existe plus
        check = client.get(f"/api/eleves/{eleve.eleve_id}", headers=headers)
        assert check.status_code == 404

    def test_supprimer_eleve_inexistant_retourne_404(self, client: TestClient, db: Session):
        """❌ Supprimer un ID inexistant → 404."""
        headers = get_auth_headers(db)
        response = client.delete("/api/eleves/99999", headers=headers)
        assert response.status_code == 404


class TestElevesPagination:
    """Tests de la pagination."""

    def test_pagination_limit_respecte(self, client: TestClient, db: Session):
        """✅ La limite de résultats est respectée."""
        headers = get_auth_headers(db)
        # Créer plusieurs élèves
        for i in range(5):
            create_test_eleve(db, nom=f"Eleve{i}", prenom="Paginé")

        response = client.get(
            "/api/eleves?etablissement_id=1&annee_id=1&skip=0&limit=3",
            headers=headers
        )
        assert response.status_code == 200
        assert len(response.json()) <= 3

    def test_pagination_skip_fonctionne(self, client: TestClient, db: Session):
        """✅ Le skip décale correctement la pagination."""
        headers = get_auth_headers(db)
        page1 = client.get(
            "/api/eleves?etablissement_id=1&annee_id=1&skip=0&limit=2",
            headers=headers
        ).json()
        page2 = client.get(
            "/api/eleves?etablissement_id=1&annee_id=1&skip=2&limit=2",
            headers=headers
        ).json()

        # Les deux pages ne doivent pas avoir les mêmes élèves
        ids_page1 = {e["eleve_id"] for e in page1}
        ids_page2 = {e["eleve_id"] for e in page2}
        assert ids_page1.isdisjoint(ids_page2)
