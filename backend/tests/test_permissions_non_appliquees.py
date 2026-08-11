"""
Tests — RBAC configurable : rôles secondaires et matrice de permissions.

Ces deux mécanismes étaient administrables, persistés… et **jamais lus** :
décocher une permission n'enlevait aucun accès, et donner un rôle secondaire
n'en ouvrait aucun. Ils sont désormais réellement appliqués.

Deux propriétés sont verrouillées ici, et la seconde est la plus importante :

  1. Les réglages **produisent l'effet annoncé**.
  2. La matrice ne peut que **RESTREINDRE**. Cocher une case ne donne jamais un
     accès que le rôle statique refuse — sinon une simple ligne en base
     suffirait à contourner tout le durcissement fait dans le code.

(Ce fichier s'appelait `test_permissions_non_appliquees.py` du temps où ces
mécanismes étaient inertes ; il vérifiait alors que l'interface l'annonçait
honnêtement. Le nom est conservé pour garder l'historique git lisible.)
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import Etablissement, Permission, Role, Utilisateur

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(
        code=f"PERM-{uid}", nom=f"École Perm {uid}", type_etablissement="LYCEE",
    )
    db.add(etab); db.commit(); db.refresh(etab)

    admin = Utilisateur(
        nom="Admin", prenom=f"P{uid}", nom_utilisateur=f"perm.admin.{uid}",
        email=f"perm.admin.{uid}@smartschool.gn", telephone=f"67100{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    # Surveillant à qui on donne COMPTABLE en rôle SECONDAIRE.
    surveillant = Utilisateur(
        nom="Surv", prenom=f"P{uid}", nom_utilisateur=f"perm.surv.{uid}",
        email=f"perm.surv.{uid}@smartschool.gn", telephone=f"67200{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT", statut="ACTIF",
        etablissement_id=etab.etablissement_id, roles_secondaires=["COMPTABLE"],
    )
    # Surveillant sans aucun rôle secondaire, pour le contraste.
    surveillant_simple = Utilisateur(
        nom="Surv", prenom=f"S{uid}", nom_utilisateur=f"perm.surv2.{uid}",
        email=f"perm.surv2.{uid}@smartschool.gn", telephone=f"67300{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add_all([admin, surveillant, surveillant_simple]); db.commit()
    for o in (admin, surveillant, surveillant_simple):
        db.refresh(o)
    return {
        "etab": etab, "admin": admin,
        "surveillant": surveillant, "surveillant_simple": surveillant_simple,
    }


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _poser_permission(db: Session, etab, code_role: str, module: str, action: str, autorise: str):
    role = db.query(Role).filter(
        Role.etablissement_id == etab.etablissement_id, Role.code == code_role
    ).first()
    if role is None:
        role = Role(
            etablissement_id=etab.etablissement_id, code=code_role,
            libelle=code_role.title(), est_systeme="O",
        )
        db.add(role); db.commit(); db.refresh(role)
    db.add(Permission(role_id=role.role_id, module=module, action=action, est_autorise=autorise))
    db.commit()
    return role


# ══════════════════════════════════════════════════════════════
# Rôles secondaires
# ══════════════════════════════════════════════════════════════

class TestRolesSecondaires:
    def test_un_role_secondaire_ouvre_bien_lacces(self, client: TestClient, ecole):
        """Le surveillant porte COMPTABLE en secondaire : la finance lui est
        désormais ouverte, comme l'assistant Personnel le laisse entendre."""
        headers = _headers(client, ecole["surveillant"].nom_utilisateur)
        assert client.get("/api/finance/factures", headers=headers).status_code == 200

    def test_sans_role_secondaire_lacces_reste_ferme(self, client: TestClient, ecole):
        headers = _headers(client, ecole["surveillant_simple"].nom_utilisateur)
        assert client.get("/api/finance/factures", headers=headers).status_code == 403

    def test_le_token_porte_les_roles_secondaires(self, client: TestClient, ecole):
        import jwt

        from app.core.auth import ALGORITHM, SECRET_KEY

        resp = client.post("/api/auth/login", json={
            "identifiant": ecole["surveillant"].nom_utilisateur,
            "mot_de_passe": "motdepasse123",
        })
        charge = jwt.decode(resp.json()["token"], SECRET_KEY, algorithms=[ALGORITHM])
        assert charge["roles_secondaires"] == ["COMPTABLE"]


# ══════════════════════════════════════════════════════════════
# Matrice de permissions — effet réel
# ══════════════════════════════════════════════════════════════

class TestMatriceAppliquee:
    def test_retirer_la_lecture_ferme_vraiment_lacces(
        self, client: TestClient, db: Session, ecole
    ):
        headers = _headers(client, ecole["admin"].nom_utilisateur)
        assert client.get("/api/eleves", headers=headers).status_code == 200

        _poser_permission(db, ecole["etab"], "ADMIN", "eleves", "lecture", "N")

        resp = client.get("/api/eleves", headers=headers)
        assert resp.status_code == 403, resp.text
        assert "retirée" in resp.json()["detail"]

    def test_retirer_la_suppression_laisse_la_lecture(
        self, client: TestClient, db: Session, ecole
    ):
        """La matrice est par action : retirer « suppression » ne doit pas
        fermer la consultation."""
        headers = _headers(client, ecole["admin"].nom_utilisateur)
        _poser_permission(db, ecole["etab"], "ADMIN", "eleves", "suppression", "N")

        assert client.get("/api/eleves", headers=headers).status_code == 200
        assert client.delete("/api/eleves/999999", headers=headers).status_code == 403

    def test_une_permission_autorisee_ne_change_rien(
        self, client: TestClient, db: Session, ecole
    ):
        headers = _headers(client, ecole["admin"].nom_utilisateur)
        _poser_permission(db, ecole["etab"], "ADMIN", "eleves", "lecture", "O")
        assert client.get("/api/eleves", headers=headers).status_code == 200

    def test_aucune_ligne_configuree_ne_ferme_rien(self, client: TestClient, ecole):
        """L'absence de configuration ne doit jamais valoir refus : c'est
        l'état de toutes les écoles qui n'ont jamais ouvert cette page."""
        headers = _headers(client, ecole["admin"].nom_utilisateur)
        assert client.get("/api/eleves", headers=headers).status_code == 200


# ══════════════════════════════════════════════════════════════
# La matrice ne peut que RESTREINDRE
# ══════════════════════════════════════════════════════════════

class TestJamaisDElargissement:
    def test_cocher_une_case_nouvre_pas_un_acces_refuse_par_le_role(
        self, client: TestClient, db: Session, ecole
    ):
        """Le point de sécurité central : autoriser « finance » au rôle
        SURVEILLANT dans la matrice ne doit PAS lui ouvrir la finance, sinon
        une ligne en base contournerait tout le durcissement du code."""
        _poser_permission(db, ecole["etab"], "SURVEILLANT", "finance", "lecture", "O")
        _poser_permission(db, ecole["etab"], "SURVEILLANT", "finance", "ecriture", "O")

        headers = _headers(client, ecole["surveillant_simple"].nom_utilisateur)
        assert client.get("/api/finance/factures", headers=headers).status_code == 403

    def test_la_matrice_dune_autre_ecole_na_aucun_effet(
        self, client: TestClient, db: Session, ecole
    ):
        """Les permissions sont lues pour l'établissement du compte : celles
        d'une autre école ne doivent ni ouvrir ni fermer quoi que ce soit."""
        uid = _uid()
        autre = Etablissement(
            code=f"PERM-B-{uid}", nom=f"Autre école {uid}", type_etablissement="LYCEE",
        )
        db.add(autre); db.commit(); db.refresh(autre)
        _poser_permission(db, autre, "ADMIN", "eleves", "lecture", "N")

        headers = _headers(client, ecole["admin"].nom_utilisateur)
        assert client.get("/api/eleves", headers=headers).status_code == 200
