"""
Tests — la direction pose directement la photo d'un élève (à l'inscription
ou depuis la galerie), sans passer par la file de validation. Le circuit
parent (portail -> file d'attente -> validation) reste inchangé.
"""
import io
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api import photos
from app.models.academique import Eleve, PhotoEnAttente
from tests.test_lot9c_modules_secondaires_isolation import Ecole, _headers


@pytest.fixture(autouse=True)
def _dossier_photos_temporaire(tmp_path, monkeypatch):
    """Les routes photos écrivent et SUPPRIMENT des fichiers sur disque : on
    les fait travailler dans un dossier jetable, jamais dans le vrai
    backend/uploads (où un eleve_1_*.jpg de dev serait effacé)."""
    monkeypatch.setattr(photos, "RACINE_PROJET", str(tmp_path))
    monkeypatch.setattr(photos, "UPLOAD_BASE", str(tmp_path / "uploads" / "photos"))
    return tmp_path


def _jpeg():
    return {"fichier": ("eleve.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")}


def _login_parent(client: TestClient, parent) -> dict:
    login = client.post("/api/portail-parent/login", json={
        "telephone": parent.telephone_1, "mot_de_passe": "motdepasse123",
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['token']}"}


def test_admin_pose_la_photo_directement(client: TestClient, db: Session, _dossier_photos_temporaire):
    a = Ecole(db, "APD")
    eleve, _ = a.eleve_inscrit(db)
    headers = _headers(client, a.admin.nom_utilisateur)

    resp = client.post(f"/api/photos/admin-upload/eleve/{eleve.eleve_id}", files=_jpeg(), headers=headers)
    assert resp.status_code == 200, resp.text
    url = resp.json()["photo_url"]
    assert url.startswith("/uploads/photos/eleves/eleve_")
    assert os.path.exists(os.path.join(str(_dossier_photos_temporaire), url.lstrip("/")))

    db.expire_all()
    assert db.query(Eleve).filter_by(eleve_id=eleve.eleve_id).first().photo_url == url
    # Rien dans la file de validation : c'est la direction elle-même.
    assert db.query(PhotoEnAttente).filter_by(entity_type="eleve", entity_id=eleve.eleve_id).count() == 0

    # Une seconde photo remplace la première, sur disque comme en base.
    resp2 = client.post(f"/api/photos/admin-upload/eleve/{eleve.eleve_id}", files=_jpeg(), headers=headers)
    assert resp2.status_code == 200, resp2.text
    assert not os.path.exists(os.path.join(str(_dossier_photos_temporaire), url.lstrip("/")))


def test_photo_direction_remplace_la_photo_en_attente_du_parent(client: TestClient, db: Session):
    """Sans ce nettoyage, valider plus tard la photo du parent effaçait la
    photo posée par la direction."""
    a = Ecole(db, "APW")
    eleve, _ = a.eleve_inscrit(db)
    parent = a.parent_de(db, eleve)

    envoi = client.post(
        f"/api/photos/parent-upload/eleve/{eleve.eleve_id}?parent_id={parent.parent_id}",
        files=_jpeg(), headers=_login_parent(client, parent),
    )
    assert envoi.status_code == 200, envoi.text
    attente = db.query(PhotoEnAttente).filter_by(entity_type="eleve", entity_id=eleve.eleve_id).one()
    photo_id = attente.photo_id

    admin = _headers(client, a.admin.nom_utilisateur)
    resp = client.post(f"/api/photos/admin-upload/eleve/{eleve.eleve_id}", files=_jpeg(), headers=admin)
    assert resp.status_code == 200, resp.text

    db.expire_all()
    assert db.query(PhotoEnAttente).filter_by(entity_type="eleve", entity_id=eleve.eleve_id).count() == 0
    assert client.post(f"/api/photos/validate/{photo_id}", headers=admin).status_code == 404
    assert db.query(Eleve).filter_by(eleve_id=eleve.eleve_id).first().photo_url == resp.json()["photo_url"]


def test_admin_upload_eleve_autre_ecole_404(client: TestClient, db: Session):
    a, b = Ecole(db, "APA"), Ecole(db, "APB")
    eleve_b, _ = b.eleve_inscrit(db)
    headers = _headers(client, a.admin.nom_utilisateur)

    resp = client.post(f"/api/photos/admin-upload/eleve/{eleve_b.eleve_id}", files=_jpeg(), headers=headers)
    assert resp.status_code == 404


def test_parent_ne_peut_pas_contourner_la_validation(client: TestClient, db: Session):
    a = Ecole(db, "APP")
    eleve, _ = a.eleve_inscrit(db)
    parent = a.parent_de(db, eleve)

    resp = client.post(
        f"/api/photos/admin-upload/eleve/{eleve.eleve_id}", files=_jpeg(), headers=_login_parent(client, parent),
    )
    assert resp.status_code == 403
