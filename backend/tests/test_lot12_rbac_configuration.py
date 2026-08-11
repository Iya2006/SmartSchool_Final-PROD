"""
Tests — Lot 12 : contrôle d'accès par rôle sur la configuration.

Jusqu'ici, `parametrage_router` et `securite_router` n'exigeaient qu'un token
valide. N'importe quel compte de l'établissement — un ENSEIGNANT, et même un
PARENT ou un ELEVE — pouvait donc réécrire les paramètres de notation et de
finance de SON école, redéfinir ses rôles et permissions, et lire son journal
d'audit.

La politique appliquée reprend celle que le produit encode déjà côté frontend
(`src/lib/roleAccess.ts`) :

  * **Écritures** de configuration → équipe de direction (`ADMIN_TIER_ROLES`).
  * **Lectures** de configuration → tout compte authentifié de l'établissement.
    Elles alimentent des écrans non-admin (en-tête de l'application, bulletins,
    notes, archive, réinscription comptable) et ne portent que des données de
    référence de sa propre école. Les restreindre casserait ces écrans.
  * **Sécurité & audit** → direction uniquement, lectures comprises : seule la
    page admin `/parametres/securite` consomme ces routes.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Cycle, Enseignant, Etablissement, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def ecole(db: Session):
    """Une école avec un ADMIN, un ENSEIGNANT et un SURVEILLANT."""
    uid = _uid()
    etab = Etablissement(
        code=f"RBAC-{uid}", nom=f"École RBAC {uid}", type_etablissement="LYCEE",
    )
    db.add(etab); db.commit(); db.refresh(etab)

    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
        date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)

    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)

    admin = Utilisateur(
        nom="Admin", prenom=f"R{uid}", nom_utilisateur=f"rbac.admin.{uid}",
        email=f"rbac.admin.{uid}@smartschool.gn", telephone=f"66100{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    surveillant = Utilisateur(
        nom="Surv", prenom=f"R{uid}", nom_utilisateur=f"rbac.surv.{uid}",
        email=f"rbac.surv.{uid}@smartschool.gn", telephone=f"66200{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    enseignant = Enseignant(
        etablissement_id=etab.etablissement_id, matricule=f"RBACENS-{uid}",
        nom="Bah", prenom="Ousmane", sexe="M", telephone=f"66300{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
    )
    db.add_all([admin, surveillant, enseignant]); db.commit()
    for o in (admin, surveillant, enseignant):
        db.refresh(o)

    return {
        "etab": etab, "annee": annee, "cycle": cycle,
        "admin": admin, "surveillant": surveillant, "enseignant": enseignant,
    }


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class TestEcrituresConfigurationReserveesAuxAdmins:
    def test_enseignant_ne_peut_pas_reecrire_les_parametres(self, client: TestClient, ecole):
        headers = _headers(client, ecole["enseignant"].matricule)

        resp = client.put(
            "/api/parametrage/settings",
            json=[{"categorie": "NOTATION", "cle": f"notation.x.{_uid()}",
                   "valeur": "20", "type_valeur": "TEXT"}],
            headers=headers,
        )
        assert resp.status_code == 403, resp.text

    def test_surveillant_ne_peut_pas_modifier_letablissement(self, client: TestClient, ecole):
        headers = _headers(client, ecole["surveillant"].nom_utilisateur)

        resp = client.put(
            f"/api/parametrage/etablissements/{ecole['etab'].etablissement_id}",
            json={"nom": "Renommée par un surveillant"}, headers=headers,
        )
        assert resp.status_code == 403, resp.text

    def test_enseignant_ne_peut_pas_cloturer_un_trimestre(self, client: TestClient, ecole):
        """Clôturer un trimestre verrouille la saisie des notes de toute l'école."""
        headers = _headers(client, ecole["enseignant"].matricule)

        resp = client.put("/api/parametrage/trimestres/1/cloturer", headers=headers)
        assert resp.status_code == 403, resp.text

    def test_enseignant_ne_peut_pas_creer_une_annee(self, client: TestClient, ecole):
        headers = _headers(client, ecole["enseignant"].matricule)

        resp = client.post(
            "/api/parametrage/annees",
            json={"code": f"X{_uid()}", "libelle": "2026-2027",
                  "date_debut": "2026-09-01", "date_fin": "2027-07-01"},
            headers=headers,
        )
        assert resp.status_code == 403, resp.text

    def test_admin_conserve_laccess(self, client: TestClient, ecole):
        headers = _headers(client, ecole["admin"].nom_utilisateur)

        resp = client.put(
            "/api/parametrage/settings",
            json=[{"categorie": "NOTATION", "cle": f"notation.ok.{_uid()}",
                   "valeur": "20", "type_valeur": "TEXT"}],
            headers=headers,
        )
        assert resp.status_code == 200, resp.text


class TestLecturesConfigurationRestentOuvertes:
    """Ces lectures alimentent des écrans non-admin : les restreindre les
    casserait (en-tête de l'app, bulletins, notes, archive, réinscription)."""

    @pytest.mark.parametrize("chemin", [
        "/api/parametrage/annees",
        "/api/parametrage/cycles",
        "/api/parametrage/salles",
        "/api/parametrage/matieres",
    ])
    def test_enseignant_peut_lire(self, client: TestClient, ecole, chemin):
        headers = _headers(client, ecole["enseignant"].matricule)
        assert client.get(chemin, headers=headers).status_code == 200

    def test_enseignant_peut_lire_les_parametres_de_son_ecole(self, client: TestClient, ecole):
        headers = _headers(client, ecole["enseignant"].matricule)
        assert client.get("/api/parametrage/settings", headers=headers).status_code == 200


class TestSecuriteReserveeAuxAdmins:
    @pytest.mark.parametrize("chemin", [
        "/api/securite/roles",
        "/api/securite/audit-log",
        "/api/securite/modules",
    ])
    def test_enseignant_refuse(self, client: TestClient, ecole, chemin):
        headers = _headers(client, ecole["enseignant"].matricule)
        assert client.get(chemin, headers=headers).status_code == 403

    def test_surveillant_ne_peut_pas_creer_de_role(self, client: TestClient, ecole):
        headers = _headers(client, ecole["surveillant"].nom_utilisateur)

        resp = client.post(
            "/api/securite/roles",
            json={"code": f"PIRATE{_uid()}", "libelle": "Rôle pirate"},
            headers=headers,
        )
        assert resp.status_code == 403, resp.text

    def test_surveillant_ne_peut_pas_lire_le_journal_daudit(self, client: TestClient, ecole):
        headers = _headers(client, ecole["surveillant"].nom_utilisateur)
        assert client.get("/api/securite/audit-log", headers=headers).status_code == 403

    def test_admin_conserve_laccess(self, client: TestClient, ecole):
        headers = _headers(client, ecole["admin"].nom_utilisateur)
        assert client.get("/api/securite/roles", headers=headers).status_code == 200
        assert client.get("/api/securite/audit-log", headers=headers).status_code == 200
