"""
Tests — le tableau de bord et le personnel sont réservés à la direction.

RÈGLE DEMANDÉE PAR LE FONDATEUR
-------------------------------
- Tableau de bord (poste de pilotage) : le fondateur/administrateur toujours ;
  le directeur général seulement si le fondateur lui a ouvert la comptabilité à
  sa création (le tableau de bord et la caisse s'ouvrent d'un seul geste) ; le
  directeur de niveau jamais.
- Module Personnel (créer/gérer les fiches) : fondateur et directeur général ;
  le directeur de niveau jamais.

Comme pour la finance, ces blocages sont imposés côté SERVEUR — pas seulement un
menu caché. On les vérifie ici route par route.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"ADP-{uid}", nom=f"École ADP {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    )
    db.add(annee); db.commit(); db.refresh(annee)
    return etab, annee


def _compte(db: Session, etablissement_id: int, role: str, acces_comptabilite: str = "O") -> Utilisateur:
    uid = _uid()
    u = Utilisateur(
        nom="Bah", prenom=f"{role.title()}{uid}", nom_utilisateur=f"adp.{role.lower()}.{uid}",
        email=f"adp.{uid}@smartschool.gn", telephone=f"61000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role=role, statut="ACTIF",
        etablissement_id=etablissement_id, acces_comptabilite=acces_comptabilite,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestLeTableauDeBord:
    """Qui voit le poste de pilotage."""

    def test_le_fondateur_le_voit(self, client: TestClient, db: Session):
        etab, annee = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        r = client.get(f"/api/dashboard?annee_id={annee.annee_id}",
                       headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200, r.text

    def test_le_dg_autorise_le_voit(self, client: TestClient, db: Session):
        etab, annee = _ecole(db)
        dg = _compte(db, etab.etablissement_id, "DG", acces_comptabilite="O")
        r = client.get(f"/api/dashboard?annee_id={annee.annee_id}",
                       headers=_headers(client, dg.nom_utilisateur))
        assert r.status_code == 200, r.text

    def test_le_dg_sans_comptabilite_ne_le_voit_pas(self, client: TestClient, db: Session):
        etab, annee = _ecole(db)
        dg = _compte(db, etab.etablissement_id, "DG", acces_comptabilite="N")
        r = client.get(f"/api/dashboard?annee_id={annee.annee_id}",
                       headers=_headers(client, dg.nom_utilisateur))
        assert r.status_code == 403, r.text

    def test_le_directeur_de_niveau_ne_le_voit_jamais(self, client: TestClient, db: Session):
        etab, annee = _ecole(db)
        dn = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get(f"/api/dashboard?annee_id={annee.annee_id}",
                       headers=_headers(client, dn.nom_utilisateur))
        assert r.status_code == 403, r.text


class TestLeModulePersonnel:
    """Qui gère les fiches du personnel."""

    def test_le_fondateur_y_accede(self, client: TestClient, db: Session):
        etab, _ = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        r = client.get("/api/personnel", headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200, r.text

    def test_le_dg_y_accede(self, client: TestClient, db: Session):
        etab, _ = _ecole(db)
        dg = _compte(db, etab.etablissement_id, "DG")
        r = client.get("/api/personnel", headers=_headers(client, dg.nom_utilisateur))
        assert r.status_code == 200, r.text

    def test_le_directeur_de_niveau_est_bloque(self, client: TestClient, db: Session):
        etab, _ = _ecole(db)
        dn = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/personnel", headers=_headers(client, dn.nom_utilisateur))
        assert r.status_code == 403, r.text

    def test_le_directeur_de_niveau_ne_cree_pas_de_compte(self, client: TestClient, db: Session):
        etab, _ = _ecole(db)
        dn = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.post("/api/personnel", headers=_headers(client, dn.nom_utilisateur),
                        json={"nom": "Faux", "prenom": "Compte", "role": "SURVEILLANT",
                              "etablissement_id": etab.etablissement_id,
                              "mot_de_passe": "motdepasse123"})
        assert r.status_code == 403, r.text


class TestCeQuiRestePedagogique:
    """La restriction ne touche QUE dashboard/personnel : le pédagogique reste."""

    def test_le_directeur_de_niveau_garde_les_eleves(self, client: TestClient, db: Session):
        etab, _ = _ecole(db)
        dn = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/eleves", headers=_headers(client, dn.nom_utilisateur))
        assert r.status_code == 200, r.text

    def test_le_directeur_de_niveau_garde_les_evaluations(self, client: TestClient, db: Session):
        etab, _ = _ecole(db)
        dn = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/evaluations", headers=_headers(client, dn.nom_utilisateur))
        assert r.status_code == 200, r.text
