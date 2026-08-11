"""
Tests — Lot 3 (chantier multi-écoles) : isolation par établissement du
module Personnel.

`personnel.py` gère la table ss_utilisateurs, partagée avec les comptes
admin/SUPER_ADMIN (voir Lot 0) — un DELETE ou UPDATE cross-école sur cette
table est donc particulièrement critique (peut aller jusqu'à la suppression
du compte administrateur d'une autre école).
"""
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.models.academique import Etablissement, Utilisateur

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _creer_etablissement(db: Session, nom: str) -> Etablissement:
    uid = _uid()
    etab = Etablissement(code=f"L3-{nom}-{uid}", nom=f"École {nom} {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    return etab


def _creer_admin(db: Session, etablissement_id: int) -> Utilisateur:
    uid = _uid()
    user = Utilisateur(
        nom="Admin", prenom=f"L3{uid}", nom_utilisateur=f"l3.admin.{uid}",
        email=f"l3.admin.{uid}@smartschool.gn", telephone=f"70000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etablissement_id,
    )
    db.add(user); db.commit(); db.refresh(user)
    return user


def _creer_personnel(db: Session, etablissement_id: int, role: str = "BIBLIOTHECAIRE") -> Utilisateur:
    uid = _uid()
    p = Utilisateur(
        nom="Camara", prenom=f"Staff{uid}", nom_utilisateur=f"l3.staff.{uid}",
        mot_de_passe=hash_password("motdepasse123"),
        telephone=f"71000{uid:04d}", role=role, statut="ACTIF",
        etablissement_id=etablissement_id, salaire_base=300000,
    )
    db.add(p); db.commit(); db.refresh(p)
    return p


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class TestListePersonnelIsolee:
    def test_liste_isolee_par_etablissement(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "LSTA")
        etab_b = _creer_etablissement(db, "LSTB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        staff_a = _creer_personnel(db, etab_a.etablissement_id)
        staff_b = _creer_personnel(db, etab_b.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.get("/api/personnel", headers=headers_a)
        assert resp.status_code == 200
        ids = {p["utilisateur_id"] for p in resp.json()}
        assert staff_a.utilisateur_id in ids
        assert staff_b.utilisateur_id not in ids

    def test_stats_isolees(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "STA")
        etab_b = _creer_etablissement(db, "STB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        _creer_personnel(db, etab_a.etablissement_id, role="SURVEILLANT")
        _creer_personnel(db, etab_b.etablissement_id, role="SURVEILLANT")
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.get("/api/personnel/stats", headers=headers_a)
        assert resp.status_code == 200
        surveillants = next((r for r in resp.json() if r["role"] == "SURVEILLANT"), None)
        assert surveillants is not None
        assert surveillants["total"] == 1

    def test_liste_salaires_isolee(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "SALA")
        etab_b = _creer_etablissement(db, "SALB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        staff_a = _creer_personnel(db, etab_a.etablissement_id)
        staff_b = _creer_personnel(db, etab_b.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.get("/api/personnel/salaires/liste", headers=headers_a)
        assert resp.status_code == 200
        ids = {p["utilisateur_id"] for p in resp.json()}
        assert staff_a.utilisateur_id in ids
        assert staff_b.utilisateur_id not in ids


class TestAccesDirectCrossEcoleRefuse:
    def test_get_personnel_cross_ecole_404(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "GETA")
        etab_b = _creer_etablissement(db, "GETB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        staff_b = _creer_personnel(db, etab_b.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.get(f"/api/personnel/{staff_b.utilisateur_id}", headers=headers_a)
        assert resp.status_code == 404

    def test_update_personnel_cross_ecole_404(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "UPDA")
        etab_b = _creer_etablissement(db, "UPDB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        staff_b = _creer_personnel(db, etab_b.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.put(
            f"/api/personnel/{staff_b.utilisateur_id}",
            json={"salaire_base": 999999},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_change_statut_cross_ecole_404(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "STATA")
        etab_b = _creer_etablissement(db, "STATB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        staff_b = _creer_personnel(db, etab_b.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.patch(
            f"/api/personnel/{staff_b.utilisateur_id}/statut?statut=SUSPENDU",
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_delete_personnel_cross_ecole_refuse(self, client: TestClient, db: Session):
        """Le plus critique : ss_utilisateurs porte aussi les comptes admin —
        un DELETE cross-école pourrait supprimer le compte admin d'une autre
        école."""
        etab_a = _creer_etablissement(db, "DELA")
        etab_b = _creer_etablissement(db, "DELB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        staff_b = _creer_personnel(db, etab_b.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.delete(f"/api/personnel/{staff_b.utilisateur_id}", headers=headers_a)
        assert resp.status_code == 404

        # Toujours présent en base, non supprimé
        assert db.query(Utilisateur).filter(Utilisateur.utilisateur_id == staff_b.utilisateur_id).first() is not None

    def test_delete_personnel_ok_dans_sa_propre_ecole(self, client: TestClient, db: Session):
        etab = _creer_etablissement(db, "DELOK")
        admin = _creer_admin(db, etab.etablissement_id)
        staff = _creer_personnel(db, etab.etablissement_id)
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.delete(f"/api/personnel/{staff.utilisateur_id}", headers=headers)
        assert resp.status_code == 200
        assert db.query(Utilisateur).filter(Utilisateur.utilisateur_id == staff.utilisateur_id).first() is None


class TestCreationPersonnelIgnoreEtablissementDuBody:
    def test_create_personnel_ignore_etablissement_id_body(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "CRA")
        etab_b = _creer_etablissement(db, "CRB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        headers_a = _headers(client, admin_a.nom_utilisateur)

        resp = client.post(
            "/api/personnel",
            json={
                "etablissement_id": etab_b.etablissement_id,  # tentative d'injection
                "nom": "Sylla", "prenom": "Mamadou", "role": "SURVEILLANT",
                # mot_de_passe requis : Utilisateur.mot_de_passe est NOT NULL
                # en base malgré le docstring de create_personnel qui prétend
                # accepter un staff sans accès — bug préexistant hors
                # périmètre de ce lot, documenté dans le rapport de fin de Lot 3.
                "mot_de_passe": "motdepasse123",
            },
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["etablissement_id"] == etab_a.etablissement_id

        p = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == resp.json()["utilisateur_id"]).first()
        assert p.etablissement_id == etab_a.etablissement_id


class TestSuperAdminPlateformeRefuseSurPersonnel:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l3.super.{uid}",
            email=f"l3.super.{uid}@smartschool.gn", telephone=f"72000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/personnel", headers=headers)
        assert resp.status_code == 403
