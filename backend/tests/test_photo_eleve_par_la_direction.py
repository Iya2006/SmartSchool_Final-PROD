"""
Tests — la direction pose directement la photo d'un élève (à l'inscription
ou depuis la galerie), sans passer par la file de validation. Le circuit
parent (portail -> file d'attente -> validation) reste inchangé.
"""
import io

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import Eleve, PhotoEnAttente
from tests.test_lot9c_modules_secondaires_isolation import Ecole, _headers


def _jpeg():
    return {"fichier": ("eleve.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")}


def test_admin_pose_la_photo_directement(client: TestClient, db: Session):
    a = Ecole(db, "APD")
    eleve, _ = a.eleve_inscrit(db)
    headers = _headers(client, a.admin.nom_utilisateur)

    resp = client.post(f"/api/photos/admin-upload/eleve/{eleve.eleve_id}", files=_jpeg(), headers=headers)
    assert resp.status_code == 200, resp.text
    url = resp.json()["photo_url"]
    assert url.startswith("/uploads/photos/eleves/eleve_")

    db.expire_all()
    assert db.query(Eleve).filter_by(eleve_id=eleve.eleve_id).first().photo_url == url
    # Rien dans la file de validation : c'est la direction elle-même.
    assert db.query(PhotoEnAttente).filter_by(entity_type="eleve", entity_id=eleve.eleve_id).count() == 0


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
    login = client.post("/api/portail-parent/login", json={
        "telephone": parent.telephone_1, "mot_de_passe": "motdepasse123",
    })
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    resp = client.post(f"/api/photos/admin-upload/eleve/{eleve.eleve_id}", files=_jpeg(), headers=headers)
    assert resp.status_code == 403
