"""
Tests — la réponse de login expose `etablissement_id` (chantier multi-écoles).

Le JWT le portait depuis le Lot 0, mais pas le corps de la réponse : le
frontend n'avait donc aucun moyen de connaître l'école du compte et restait
figé sur l'établissement 1 — chaque école voyait le nom, le logo, le cachet,
la signature et les couleurs de l'école 1.

Ces tests verrouillent aussi l'invariant important : la valeur renvoyée dans
`user` est TOUJOURS celle du JWT, pour les 4 types de comptes.
"""
from datetime import date

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Enseignant, Etablissement,
    Inscription, Niveau, Parent, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"LOG-{uid}", nom=f"École {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    return etab


def _connexion(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _etablissement_du_token(token: str):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])["etablissement_id"]


class TestLoginExposeEtablissement:
    def test_utilisateur(self, client: TestClient, db: Session, ecole):
        uid = _uid()
        u = Utilisateur(
            nom="Admin", prenom="Test", nom_utilisateur=f"log.admin.{uid}",
            email=f"log.admin.{uid}@smartschool.gn", telephone=f"62100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=ecole.etablissement_id,
        )
        db.add(u); db.commit()

        data = _connexion(client, u.nom_utilisateur)
        assert data["user"]["etablissement_id"] == ecole.etablissement_id
        assert _etablissement_du_token(data["token"]) == ecole.etablissement_id

    def test_enseignant(self, client: TestClient, db: Session, ecole):
        uid = _uid()
        e = Enseignant(
            etablissement_id=ecole.etablissement_id, matricule=f"LOGENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"62200{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(e); db.commit()

        data = _connexion(client, e.matricule)
        assert data["user"]["etablissement_id"] == ecole.etablissement_id
        assert _etablissement_du_token(data["token"]) == ecole.etablissement_id

    def test_eleve(self, client: TestClient, db: Session, ecole):
        uid = _uid()
        el = Eleve(
            etablissement_id=ecole.etablissement_id, matricule=f"LOGELV-{uid}",
            nom="Diallo", prenom="Aïssatou", date_naissance=date(2012, 1, 1), sexe="F",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(el); db.commit()

        data = _connexion(client, el.matricule)
        assert data["user"]["etablissement_id"] == ecole.etablissement_id
        assert _etablissement_du_token(data["token"]) == ecole.etablissement_id

    def test_parent_dune_seule_ecole(self, client: TestClient, db: Session, ecole):
        uid = _uid()
        el = Eleve(
            etablissement_id=ecole.etablissement_id, matricule=f"LOGPE-{uid}",
            nom="Camara", prenom="Mamadou", date_naissance=date(2012, 1, 1), sexe="M",
            statut="ACTIF",
        )
        db.add(el); db.commit(); db.refresh(el)

        p = Parent(
            etablissement_id=ecole.etablissement_id,
            nom="Camara", prenom="Sékou", telephone_1=f"62300{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(p); db.commit(); db.refresh(p)
        db.add(EleveParent(eleve_id=el.eleve_id, parent_id=p.parent_id, lien_parente="PERE"))
        db.commit()

        data = _connexion(client, p.telephone_1)
        assert data["user"]["etablissement_id"] == ecole.etablissement_id
        assert _etablissement_du_token(data["token"]) == ecole.etablissement_id


class TestCasSansEtablissementUnique:
    """`None` doit être renvoyé tel quel, jamais remplacé par un établissement
    choisi arbitrairement (surtout pas 1)."""

    def test_super_admin_plateforme(self, client: TestClient, db: Session):
        uid = _uid()
        u = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"log.super.{uid}",
            email=f"log.super.{uid}@smartschool.gn", telephone=f"62400{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(u); db.commit()

        data = _connexion(client, u.nom_utilisateur)
        assert data["user"]["etablissement_id"] is None
        assert _etablissement_du_token(data["token"]) is None

    def test_parent_present_dans_deux_ecoles_choisit_par_le_code(
        self, client: TestClient, db: Session
    ):
        """MODÈLE RÉVISÉ (migration 2026_08_multi_01).

        Ce test exigeait `None` : l'école du parent était déduite de ses
        enfants, et le système refusait — à juste titre — de choisir. Mais le
        parent n'avait alors accès à rien.

        Il a désormais une FICHE PAR ÉCOLE, et le code de l'établissement
        désigne laquelle. Sans code, l'ambiguïté est signalée (409) : on ne
        devine jamais.
        """
        uid = _uid()
        telephone = f"62500{uid:04d}"
        ecoles = []
        for i in range(2):
            e_uid = _uid()
            etab = Etablissement(
                code=f"LOGM-{e_uid}", nom=f"École multi {e_uid}", type_etablissement="LYCEE",
            )
            db.add(etab); db.commit(); db.refresh(etab)
            enfant = Eleve(
                etablissement_id=etab.etablissement_id, matricule=f"LOGM-{e_uid}",
                nom="Barry", prenom=f"Enfant{i}", date_naissance=date(2012, 1, 1), sexe="M",
                statut="ACTIF",
            )
            db.add(enfant); db.commit(); db.refresh(enfant)
            fiche = Parent(
                etablissement_id=etab.etablissement_id,
                nom="Barry", prenom="Fatoumata", telephone_1=telephone,
                mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
            )
            db.add(fiche); db.commit(); db.refresh(fiche)
            db.add(EleveParent(
                eleve_id=enfant.eleve_id, parent_id=fiche.parent_id, lien_parente="MERE",
            ))
            db.commit()
            ecoles.append(etab)

        sans_code = client.post("/api/auth/login", json={
            "identifiant": telephone, "mot_de_passe": "motdepasse123",
        })
        assert sans_code.status_code == 409, sans_code.text

        for etab in ecoles:
            resp = client.post("/api/auth/login", json={
                "identifiant": telephone, "mot_de_passe": "motdepasse123",
                "code_etablissement": etab.code,
            })
            assert resp.status_code == 200, resp.text
            assert resp.json()["user"]["etablissement_id"] == etab.etablissement_id
            assert _etablissement_du_token(resp.json()["token"]) == etab.etablissement_id

