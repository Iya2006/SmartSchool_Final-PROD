"""
Tests — Lot 0 (chantier multi-écoles) : identité JWT

Vérifie que `etablissement_id` est correctement dérivé côté serveur au login
pour les 4 types de comptes (Utilisateur, Enseignant, Parent, Eleve), jamais
fourni par le client, et que les cas ambigus (SUPER_ADMIN plateforme, parent
multi-écoles, ancien token) ne tombent jamais silencieusement sur une valeur
par défaut ou sur "aucune restriction".
"""
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_current_establishment, require_etablissement
from app.core.security import hash_password
from app.models.academique import Eleve, EleveParent, Enseignant, Etablissement, Parent, Utilisateur

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _creer_etablissement(db: Session, nom: str) -> Etablissement:
    uid = _uid()
    etab = Etablissement(code=f"LOT0-{nom}-{uid}", nom=f"École {nom} {uid}", type_etablissement="LYCEE")
    db.add(etab)
    db.commit()
    db.refresh(etab)
    return etab


def _creer_utilisateur(db: Session, etablissement_id, role: str = "ADMIN") -> Utilisateur:
    uid = _uid()
    user = Utilisateur(
        nom="Test", prenom="Lot0",
        nom_utilisateur=f"lot0.user.{uid}",
        email=f"lot0.user.{uid}@smartschool.gn",
        telephone=f"63000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"),
        role=role, statut="ACTIF",
        etablissement_id=etablissement_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _creer_enseignant(db: Session, etablissement_id: int) -> Enseignant:
    uid = _uid()
    ens = Enseignant(
        etablissement_id=etablissement_id,
        matricule=f"LOT0-ENS-{uid}",
        nom="Test", prenom="Enseignant",
        sexe="M", telephone=f"64000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"),
        statut="ACTIF",
    )
    db.add(ens)
    db.commit()
    db.refresh(ens)
    return ens


def _creer_eleve(db: Session, etablissement_id: int) -> Eleve:
    uid = _uid()
    eleve = Eleve(
        etablissement_id=etablissement_id,
        matricule=f"LOT0-ELV-{uid}",
        nom="Test", prenom="Eleve",
        date_naissance=date(2010, 1, 1), sexe="F",
        mot_de_passe=hash_password("motdepasse123"),
        statut="ACTIF",
    )
    db.add(eleve)
    db.commit()
    db.refresh(eleve)
    return eleve


def _creer_parent(db: Session, etablissement_id: int) -> Parent:
    uid = _uid()
    parent = Parent(
        # Un parent releve d'UNE ecole (migration 2026_08_multi_01).
        etablissement_id=etablissement_id,
        nom="Test", prenom="Parent",
        telephone_1=f"65000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"),
        statut="ACTIF",
    )
    db.add(parent)
    db.commit()
    db.refresh(parent)
    return parent


def _rattacher(db: Session, parent: Parent, eleve: Eleve) -> None:
    lien = EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="PERE")
    db.add(lien)
    db.commit()


def _login(client: TestClient, identifiant: str, mot_de_passe: str = "motdepasse123") -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return resp.json()


def _me(client: TestClient, token: str) -> dict:
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    return resp.json()


class TestJwtEtablissementUtilisateur:
    def test_utilisateur_ecole_a_porte_son_etablissement(self, client: TestClient, db: Session):
        """Un Utilisateur rattaché à l'école A obtient etablissement_id = A dans son JWT."""
        etab_a = _creer_etablissement(db, "A")
        user = _creer_utilisateur(db, etab_a.etablissement_id)
        data = _login(client, user.nom_utilisateur)
        profil = _me(client, data["token"])
        assert profil["etablissement_id"] == etab_a.etablissement_id

    def test_utilisateur_ecole_b_isole_de_ecole_a(self, client: TestClient, db: Session):
        """Deux comptes de deux écoles différentes obtiennent chacun leur propre établissement."""
        etab_a = _creer_etablissement(db, "A")
        etab_b = _creer_etablissement(db, "B")
        user_a = _creer_utilisateur(db, etab_a.etablissement_id)
        user_b = _creer_utilisateur(db, etab_b.etablissement_id)

        profil_a = _me(client, _login(client, user_a.nom_utilisateur)["token"])
        profil_b = _me(client, _login(client, user_b.nom_utilisateur)["token"])

        assert profil_a["etablissement_id"] == etab_a.etablissement_id
        assert profil_b["etablissement_id"] == etab_b.etablissement_id
        assert profil_a["etablissement_id"] != profil_b["etablissement_id"]

    def test_super_admin_etablissement_id_null_explicite(self, client: TestClient, db: Session):
        """SUPER_ADMIN sans école (etablissement_id=NULL) → JWT etablissement_id=None, pas 1 ni arbitraire."""
        user = _creer_utilisateur(db, None, role="SUPER_ADMIN")
        profil = _me(client, _login(client, user.nom_utilisateur)["token"])
        assert profil["etablissement_id"] is None
        assert profil["role"] == "SUPER_ADMIN"


class TestJwtEtablissementEnseignantEleve:
    def test_enseignant_porte_son_etablissement(self, client: TestClient, db: Session):
        etab = _creer_etablissement(db, "ENS")
        ens = _creer_enseignant(db, etab.etablissement_id)
        profil = _me(client, _login(client, ens.matricule)["token"])
        assert profil["etablissement_id"] == etab.etablissement_id

    def test_eleve_porte_son_etablissement(self, client: TestClient, db: Session):
        etab = _creer_etablissement(db, "ELV")
        eleve = _creer_eleve(db, etab.etablissement_id)
        profil = _me(client, _login(client, eleve.matricule)["token"])
        assert profil["etablissement_id"] == etab.etablissement_id


class TestJwtEtablissementParent:
    # MODÈLE RÉVISÉ (migration 2026_08_multi_01)
    # ------------------------------------------
    # L'établissement d'un parent était DÉDUIT de ses enfants, et valait None
    # dès qu'il en avait dans plusieurs écoles — donc aucun accès nulle part,
    # précisément dans le cas où il en avait le plus besoin.
    #
    # Un parent a désormais une FICHE PAR ÉCOLE, chacune portant son
    # établissement. Le code de l'école, saisi au login, désigne laquelle.

    def test_parent_recoit_l_etablissement_de_sa_fiche(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "PA")
        eleve1 = _creer_eleve(db, etab_a.etablissement_id)
        eleve2 = _creer_eleve(db, etab_a.etablissement_id)
        parent = _creer_parent(db, etab_a.etablissement_id)
        _rattacher(db, parent, eleve1)
        _rattacher(db, parent, eleve2)

        profil = _me(client, _login(client, parent.telephone_1)["token"])
        assert profil["etablissement_id"] == etab_a.etablissement_id

    def test_parent_present_dans_deux_ecoles_choisit_par_le_code(
        self, client: TestClient, db: Session
    ):
        """Le cas qui était impossible, puis bloquant, et qui fonctionne enfin.

        Deux fiches, même numéro. Sans code, l'identifiant est ambigu et le
        système REFUSE de deviner (409). Avec le code, il entre dans la bonne
        école — jamais dans l'autre.
        """
        etab_a = _creer_etablissement(db, "PMA")
        etab_b = _creer_etablissement(db, "PMB")
        parent_a = _creer_parent(db, etab_a.etablissement_id)
        _rattacher(db, parent_a, _creer_eleve(db, etab_a.etablissement_id))

        # Même téléphone, autre école : désormais accepté.
        parent_b = Parent(
            etablissement_id=etab_b.etablissement_id,
            nom="Test", prenom="Parent", telephone_1=parent_a.telephone_1,
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(parent_b); db.commit(); db.refresh(parent_b)
        _rattacher(db, parent_b, _creer_eleve(db, etab_b.etablissement_id))

        sans_code = client.post("/api/auth/login", json={
            "identifiant": parent_a.telephone_1, "mot_de_passe": "motdepasse123",
        })
        assert sans_code.status_code == 409, sans_code.text
        assert "code" in sans_code.json()["detail"].lower()

        for etab in (etab_a, etab_b):
            resp = client.post("/api/auth/login", json={
                "identifiant": parent_a.telephone_1, "mot_de_passe": "motdepasse123",
                "code_etablissement": etab.code,
            })
            assert resp.status_code == 200, resp.text
            profil = _me(client, resp.json()["token"])
            assert profil["etablissement_id"] == etab.etablissement_id

    def test_parent_sans_enfant_garde_l_etablissement_de_sa_fiche(
        self, client: TestClient, db: Session
    ):
        """Un parent créé mais pas encore rattaché à un enfant relève quand
        même de l'école qui l'a saisi — la colonne est NOT NULL."""
        etab = _creer_etablissement(db, "PSE")
        parent = _creer_parent(db, etab.etablissement_id)
        profil = _me(client, _login(client, parent.telephone_1)["token"])
        assert profil["etablissement_id"] == etab.etablissement_id


class TestAncienTokenSansEtablissement:
    def test_ancien_token_sans_champ_etablissement_gere_proprement(self, client: TestClient, db: Session):
        """Un JWT émis avant ce chantier (sans clé etablissement_id) doit rester utilisable pour
        /me (pas d'erreur 500), avec etablissement_id traité comme None — jamais comme 1."""
        vieux_token = create_access_token({
            "sub": "1", "nom": "Ancien", "prenom": "Compte", "role": "ADMIN", "type": "admin",
            # pas de clé "etablissement_id" du tout — simule un token pré-Lot 0
        })
        profil = _me(client, vieux_token)
        assert profil["etablissement_id"] is None

    def test_get_current_establishment_retourne_none_si_absent(self):
        """La dependency get_current_establishment ne fabrique jamais de valeur par défaut."""
        assert get_current_establishment(current_user={"role": "ADMIN"}) is None
        assert get_current_establishment(current_user={"etablissement_id": None}) is None
        assert get_current_establishment(current_user={"etablissement_id": 42}) == 42

    def test_require_etablissement_refuse_explicitement_si_absent(self):
        """require_etablissement doit lever 403 (jamais retomber sur etablissement_id=1)."""
        with pytest.raises(HTTPException) as exc_info:
            require_etablissement(current_user={"role": "SUPER_ADMIN", "etablissement_id": None})
        assert exc_info.value.status_code == 403

    def test_require_etablissement_accepte_si_present(self):
        assert require_etablissement(current_user={"etablissement_id": 7}) == 7


class TestClientNePeutJamaisImposerEtablissement:
    def test_le_login_ignore_tout_champ_etablissement_id_fourni_par_le_client(self, client: TestClient, db: Session):
        """LoginRequest n'a que identifiant/mot_de_passe — un etablissement_id dans le body
        du login est silencieusement ignoré par Pydantic (champ inconnu), jamais utilisé."""
        etab_a = _creer_etablissement(db, "SEC")
        etab_b = _creer_etablissement(db, "SECB")
        user = _creer_utilisateur(db, etab_a.etablissement_id)

        resp = client.post("/api/auth/login", json={
            "identifiant": user.nom_utilisateur,
            "mot_de_passe": "motdepasse123",
            "etablissement_id": etab_b.etablissement_id,  # tentative d'injection
        })
        assert resp.status_code == 200
        profil = _me(client, resp.json()["token"])
        assert profil["etablissement_id"] == etab_a.etablissement_id
        assert profil["etablissement_id"] != etab_b.etablissement_id
