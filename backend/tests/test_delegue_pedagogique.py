"""
Tests — le délégué pédagogique a tout, sauf la caisse.

CE QUE L'ÉCOLE DEMANDE
----------------------
L'administrateur ne peut pas tout tenir. Il confie à un membre du personnel
déjà en poste tout le pédagogique : évaluations, centralisation des notes,
bulletins, résultats de fin d'année, centre des examens, archive scolaire.
Cette personne travaille comme l'administrateur — SAUF sur la comptabilité,
qui reste à l'administrateur, à la direction générale et au comptable.

CE QUI A ÉTÉ TROUVÉ
-------------------
Le rôle existait (DIRECTEUR_NIVEAU) et le frontend lui fermait bien
/comptabilite. Mais côté serveur il héritait d'ADMIN_TIER_ROLES, donc de
FINANCE_ROLES : les encaissements, les salaires et le grand livre lui étaient
ouverts à qui savait appeler la route directement. Un blocage qui n'existe
que dans le navigateur n'est pas un blocage.
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
    etab = Etablissement(code=f"DEL-{uid}", nom=f"École DEL {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    )
    db.add(annee); db.commit()
    return etab


def _compte(db: Session, etablissement_id: int, role: str) -> Utilisateur:
    uid = _uid()
    u = Utilisateur(
        nom="Conde", prenom=f"{role.title()}{uid}", nom_utilisateur=f"del.{role.lower()}.{uid}",
        email=f"del.{uid}@smartschool.gn", telephone=f"63000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role=role, statut="ACTIF",
        etablissement_id=etablissement_id, salaire_base=1200000,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestLaCaisseResteFermee:
    """Les routes d'argent, une par une."""

    def test_pas_d_acces_aux_encaissements(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/finance/paiements", headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 403

    def test_pas_d_acces_aux_salaires(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/finance/salaires/employes",
                       headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 403

    def test_pas_d_acces_a_la_comptabilite_generale(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/comptabilite/balance",
                       headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 403
        r = client.get("/api/comptabilite/grand-livre",
                       headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 403


class TestLeReteLuiResteOuvert:
    """Ce qu'on lui a confié doit vraiment marcher, sinon la délégation est vide."""

    def test_les_classes(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/classes", headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 200

    def test_les_evaluations(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/evaluations", headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 200

    def test_le_centre_des_examens(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/examens/sujets", headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 200

    def test_les_eleves(self, client: TestClient, db: Session):
        etab = _ecole(db)
        delegue = _compte(db, etab.etablissement_id, "DIRECTEUR_NIVEAU")
        r = client.get("/api/eleves", headers=_headers(client, delegue.nom_utilisateur))
        assert r.status_code == 200


class TestQuiGardeLaCaisse:
    def test_l_administrateur_la_garde(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        r = client.get("/api/finance/paiements", headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200

    def test_le_comptable_la_garde(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE")
        r = client.get("/api/finance/paiements",
                       headers=_headers(client, comptable.nom_utilisateur))
        assert r.status_code == 200

    def test_la_direction_generale_la_garde(self, client: TestClient, db: Session):
        """Le DG et le fondateur dirigent l'école : leur fermer la caisse
        n'aurait aucun sens, ce sont eux qui répondent des comptes."""
        etab = _ecole(db)
        dg = _compte(db, etab.etablissement_id, "DG")
        r = client.get("/api/finance/paiements", headers=_headers(client, dg.nom_utilisateur))
        assert r.status_code == 200

    def test_un_surveillant_ne_l_a_jamais_eue(self, client: TestClient, db: Session):
        etab = _ecole(db)
        surveillant = _compte(db, etab.etablissement_id, "SURVEILLANT")
        r = client.get("/api/finance/paiements",
                       headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 403
