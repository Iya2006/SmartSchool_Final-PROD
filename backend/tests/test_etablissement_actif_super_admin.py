"""
Tests — un administrateur plateforme peut choisir l'école dans laquelle il travaille.

Un SUPER_ADMIN n'est rattaché à aucune école : `require_etablissement` le
refuse donc partout, volontairement (`None` ne vaut jamais « accès à tout »).
Sans cette capacité, une plateforme neuve était **inexploitable** : son
administrateur pouvait créer une école, mais pas y entrer ni lui créer un
administrateur — trou d'amorçage constaté en production.

Le choix est explicite, vérifié côté serveur, et matérialisé par un nouveau
jeton — jamais un `etablissement_id` glissé dans une requête métier, qui est
précisément le motif supprimé partout ailleurs.
"""
from datetime import date

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def contexte(db: Session):
    uid = _uid()
    etab = Etablissement(
        code=f"ACT-{uid}", nom=f"École active {uid}", type_etablissement="LYCEE",
    )
    db.add(etab); db.commit(); db.refresh(etab)
    db.add(AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1),
        statut="EN_COURS", est_courante="O",
    ))
    db.commit()

    plateforme = Utilisateur(
        nom="Super", prenom="Admin", nom_utilisateur=f"act.super.{uid}",
        email=f"act.super.{uid}@smartschool.gn", telephone=f"68100{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
        etablissement_id=None,
    )
    ordinaire = Utilisateur(
        nom="Admin", prenom="École", nom_utilisateur=f"act.admin.{uid}",
        email=f"act.admin.{uid}@smartschool.gn", telephone=f"68200{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add_all([plateforme, ordinaire]); db.commit()
    db.refresh(plateforme); db.refresh(ordinaire)
    return {"etab": etab, "plateforme": plateforme, "ordinaire": ordinaire}


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class TestChoixDeLEtablissementActif:
    def test_le_super_admin_est_bloque_avant_davoir_choisi(self, client: TestClient, contexte):
        """État initial : c'est le comportement voulu, pas un bug."""
        headers = _headers(client, contexte["plateforme"].nom_utilisateur)
        assert client.get("/api/parametrage/annees", headers=headers).status_code == 403

    def test_choisir_une_ecole_debloque_les_routes_metier(self, client: TestClient, contexte):
        headers = _headers(client, contexte["plateforme"].nom_utilisateur)

        resp = client.post(
            "/api/auth/etablissement-actif",
            json={"etablissement_id": contexte["etab"].etablissement_id},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        nouveau = {"Authorization": f"Bearer {resp.json()['token']}"}
        annees = client.get("/api/parametrage/annees", headers=nouveau)
        assert annees.status_code == 200, annees.text
        assert len(annees.json()) == 1

    def test_le_nouveau_jeton_porte_lecole_et_la_trace(self, client: TestClient, contexte):
        headers = _headers(client, contexte["plateforme"].nom_utilisateur)
        resp = client.post(
            "/api/auth/etablissement-actif",
            json={"etablissement_id": contexte["etab"].etablissement_id},
            headers=headers,
        )
        charge = jwt.decode(resp.json()["token"], SECRET_KEY, algorithms=[ALGORITHM])

        assert charge["etablissement_id"] == contexte["etab"].etablissement_id
        assert charge["role"] == "SUPER_ADMIN"
        # Trace : ce compte n'appartient pas à l'école, il y agit.
        assert charge["agit_pour_etablissement"] is True

    def test_une_ecole_inexistante_est_refusee(self, client: TestClient, contexte):
        headers = _headers(client, contexte["plateforme"].nom_utilisateur)
        resp = client.post(
            "/api/auth/etablissement-actif", json={"etablissement_id": 999999}, headers=headers,
        )
        assert resp.status_code == 404


class TestReserveeALaPlateforme:
    def test_un_admin_decole_ne_peut_pas_changer_detablissement(
        self, client: TestClient, db: Session, contexte
    ):
        """Point de sécurité : sinon n'importe quel administrateur se
        délivrerait un jeton pour l'école de son choix."""
        uid = _uid()
        autre = Etablissement(
            code=f"ACT-B-{uid}", nom=f"Autre école {uid}", type_etablissement="LYCEE",
        )
        db.add(autre); db.commit(); db.refresh(autre)

        headers = _headers(client, contexte["ordinaire"].nom_utilisateur)
        resp = client.post(
            "/api/auth/etablissement-actif",
            json={"etablissement_id": autre.etablissement_id},
            headers=headers,
        )
        assert resp.status_code == 403, resp.text

    def test_la_liste_des_ecoles_est_reservee_a_la_plateforme(self, client: TestClient, contexte):
        headers = _headers(client, contexte["ordinaire"].nom_utilisateur)
        assert client.get("/api/auth/etablissements-disponibles", headers=headers).status_code == 403

    def test_la_plateforme_peut_lister_les_ecoles(self, client: TestClient, contexte):
        headers = _headers(client, contexte["plateforme"].nom_utilisateur)
        resp = client.get("/api/auth/etablissements-disponibles", headers=headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()["etablissement_actif"] is None
        codes = {e["code"] for e in resp.json()["etablissements"]}
        assert contexte["etab"].code in codes
