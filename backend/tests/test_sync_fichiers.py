"""
Fichiers cités par les données synchronisées (étape B6) : une photo prise
hors-ligne arrive sur le cloud, un logo changé en ligne arrive sur les postes.
Le cloud n'écrase jamais un fichier existant et refuse les chemins piégés.
"""
import os

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.fichiers import dossier_fichiers
from app.models.academique import Eleve, Etablissement
from tests.test_isolation_multi_ecole import Ecole, _uid
from tests.test_sync_echanges import Poste, sans_attente  # noqa: F401 (fixture)


def _fichier_du_cloud(*morceaux: str) -> str:
    return os.path.join(dossier_fichiers(*morceaux[:-1]), morceaux[-1])


def test_une_photo_prise_hors_ligne_arrive_sur_le_cloud(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    poste = Poste(client, a, tmp_path, avec_fichiers=True)
    nom = f"hors-ligne-{_uid()}.jpg"
    local = os.path.join(poste.fichiers, "photos", "eleves", nom)
    os.makedirs(os.path.dirname(local), exist_ok=True)
    with open(local, "wb") as f:
        f.write(b"\xff\xd8 photo prise sur le poste")
    with poste.session() as s:
        s.get(Eleve, eleve.eleve_id).photo_url = f"/uploads/photos/eleves/{nom}"
        s.commit()

    cible = _fichier_du_cloud("photos", "eleves", nom)
    try:
        poste.synchroniser()
        with open(cible, "rb") as f:
            assert f.read() == b"\xff\xd8 photo prise sur le poste"
        db.expire_all()
        assert db.get(Eleve, eleve.eleve_id).photo_url == f"/uploads/photos/eleves/{nom}"
    finally:
        if os.path.exists(cible):
            os.remove(cible)


def test_un_logo_change_en_ligne_arrive_sur_le_poste(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path, avec_fichiers=True)
    nom = f"logo-synchro-{_uid()}.png"
    cloud = _fichier_du_cloud("etablissements", nom)
    with open(cloud, "wb") as f:
        f.write(b"\x89PNG nouveau logo")
    try:
        etab = db.get(Etablissement, a.etab.etablissement_id)
        etab.logo_url = f"/uploads/etablissements/{nom}?v=2"
        db.commit()

        poste.synchroniser()

        with open(os.path.join(poste.fichiers, "etablissements", nom), "rb") as f:
            assert f.read() == b"\x89PNG nouveau logo"
    finally:
        os.remove(cloud)


def test_le_cloud_n_ecrase_jamais_un_fichier_et_refuse_les_chemins_pieges(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    entetes = {"Authorization": f"Appareil {poste.appareil['jeton']}"}
    nom = f"existant-{_uid()}.jpg"
    cloud = _fichier_du_cloud("photos", "eleves", nom)
    with open(cloud, "wb") as f:
        f.write(b"version du cloud")
    try:
        rep = client.post("/api/sync/appareil/fichiers", headers=entetes,
                          data={"chemin": f"photos/eleves/{nom}"}, files={"fichier": (nom, b"version du poste")})
        assert rep.status_code == 201 and rep.json() == {"ecrit": False}
        with open(cloud, "rb") as f:
            assert f.read() == b"version du cloud"

        piege = client.post("/api/sync/appareil/fichiers", headers=entetes,
                            data={"chemin": "../../piege.txt"}, files={"fichier": ("piege.txt", b"x")})
        assert piege.status_code == 400
        assert client.post("/api/sync/appareil/fichiers/manquants", headers=entetes,
                           json={"chemins": ["../../piege.txt", f"photos/eleves/{nom}"]}).json() == {"manquants": []}
        # Sans jeton de poste, rien.
        assert client.post("/api/sync/appareil/fichiers", data={"chemin": "photos/x.jpg"},
                           files={"fichier": ("x.jpg", b"x")}).status_code == 401
    finally:
        os.remove(cloud)
