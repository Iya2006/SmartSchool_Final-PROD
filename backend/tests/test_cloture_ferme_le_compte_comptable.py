"""
Tests — la clôture ferme réellement une porte, et seule la direction la rouvre.

LA RÈGLE, TELLE QUE L'ÉCOLE L'A POSÉE
-------------------------------------
« Quand on clôture l'année, l'admin de l'école va désactiver le compte
  comptable — seul lui aura accès à ça — sauf à la réouverture, ensuite il
  réactive pour la nouvelle année. »

Trois choses doivent tenir ensemble, et chacune a déjà manqué :

1. Désactiver doit FERMER LA PORTE. Un statut qui n'empêche pas de se
   connecter n'est pas une clôture, c'est un libellé.

2. Le comptable ne doit pouvoir ni se fermer ni se ROUVRIR lui-même. Un
   compte qui se réactive tout seul rend la procédure décorative — c'est
   exactement le défaut qui avait été trouvé : le comptable désactivé pouvait
   se remettre en activité, et l'arrêté des comptes ne protégeait rien.

3. La direction ne doit pas pouvoir s'enfermer dehors : ni son propre compte,
   ni le dernier compte de direction actif de l'école. Sinon plus personne ne
   rouvre quoi que ce soit et il faut intervenir en base.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur

import uuid

# Les fichiers de tests partagent une meme base. Deux d'entre eux qui
# fabriquent leurs codes avec un simple compteur repartant de 1 finissent par
# se voler un code d'etablissement, et le second echoue pour une raison qui
# n'a rien a voir avec ce qu'il verifie. Ce jeton rend nos codes uniques.
_JETON = uuid.uuid4().hex[:6]

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"CLO-{_JETON}-{uid}", nom=f"École CLO {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    db.add(AnneeScolaire(
        code=f"AC{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    ))
    db.commit()
    return etab


def _compte(db: Session, etab, role: str, prefixe: str) -> Utilisateur:
    uid = _uid()
    u = Utilisateur(
        nom="Toure", prenom=f"{prefixe}{uid}", nom_utilisateur=f"{prefixe.lower()}.{_JETON}.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role=role, statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _connexion(client: TestClient, login: str):
    return client.post("/api/auth/login",
                       json={"identifiant": login, "mot_de_passe": "motdepasse123"})


def _headers(client: TestClient, login: str) -> dict:
    r = _connexion(client, login)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestLaCloture:
    def test_desactiver_ferme_vraiment_la_porte(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        comptable = _compte(db, etab, "COMPTABLE", "Compta")

        # Avant : il entre.
        assert _connexion(client, comptable.nom_utilisateur).status_code == 200

        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200, r.text

        # Après : la porte est fermée, pas seulement l'étiquette changée.
        assert _connexion(client, comptable.nom_utilisateur).status_code != 200

    def test_la_reouverture_rouvre(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        comptable = _compte(db, etab, "COMPTABLE", "Compta")
        h = _headers(client, admin.nom_utilisateur)

        client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=INACTIF", headers=h)
        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=ACTIF", headers=h)
        assert r.status_code == 200
        assert _connexion(client, comptable.nom_utilisateur).status_code == 200


class TestSeulLaDirectionTientLaCle:
    def test_le_comptable_ne_ferme_pas_son_propre_compte(
        self, client: TestClient, db: Session
    ):
        etab = _ecole(db)
        _compte(db, etab, "ADMIN", "Chef")
        comptable = _compte(db, etab, "COMPTABLE", "Compta")

        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, comptable.nom_utilisateur))
        assert r.status_code == 403

    def test_le_comptable_ne_rouvre_pas_le_compte_d_un_collegue(
        self, client: TestClient, db: Session
    ):
        """Le défaut qui rendait la clôture décorative : un comptable capable
        de remettre un compte en activité annule le geste de la direction."""
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        ferme = _compte(db, etab, "COMPTABLE", "Ferme")
        autre = _compte(db, etab, "COMPTABLE", "Autre")

        client.patch(f"/api/personnel/{ferme.utilisateur_id}/statut?statut=INACTIF",
                     headers=_headers(client, admin.nom_utilisateur))

        r = client.patch(f"/api/personnel/{ferme.utilisateur_id}/statut?statut=ACTIF",
                         headers=_headers(client, autre.nom_utilisateur))
        assert r.status_code == 403
        db.expire_all()
        assert db.get(Utilisateur, ferme.utilisateur_id).statut == "INACTIF"

    def test_un_surveillant_non_plus(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        comptable = _compte(db, etab, "COMPTABLE", "Compta")
        surveillant = _compte(db, etab, "SURVEILLANT", "Surv")

        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 403

    def test_la_direction_d_une_autre_ecole_non_plus(self, client: TestClient, db: Session):
        etab_a = _ecole(db)
        etab_b = _ecole(db)
        _compte(db, etab_a, "ADMIN", "Chef")
        comptable = _compte(db, etab_a, "COMPTABLE", "Compta")
        admin_b = _compte(db, etab_b, "ADMIN", "Voisin")

        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin_b.nom_utilisateur))
        assert r.status_code == 404
        db.expire_all()
        assert db.get(Utilisateur, comptable.utilisateur_id).statut == "ACTIF"


class TestOnNeSEnfermePasDehors:
    def test_l_admin_ne_ferme_pas_son_propre_compte(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        _compte(db, etab, "DG", "Direction")   # il en reste un autre

        r = client.patch(f"/api/personnel/{admin.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 400
        assert "propre compte" in r.json()["detail"]

    def test_le_dernier_compte_de_direction_ne_se_ferme_pas(
        self, client: TestClient, db: Session
    ):
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        dg = _compte(db, etab, "DG", "Direction")

        # Le DG ferme l'admin : accepté, il reste le DG.
        r = client.patch(f"/api/personnel/{admin.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, dg.nom_utilisateur))
        assert r.status_code == 200, r.text

        # Il ne reste que lui : personne ne peut plus le fermer.
        admin2 = _compte(db, etab, "ADMIN", "Second")
        r = client.patch(f"/api/personnel/{dg.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin2.nom_utilisateur))
        # admin2 est actif, donc le DG n'est plus le dernier : le geste passe.
        assert r.status_code == 200

        r = client.patch(f"/api/personnel/{admin2.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin2.nom_utilisateur))
        assert r.status_code == 400


class TestLeStatutEstUnVocabulaireFerme:
    def test_un_statut_invente_est_refuse(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab, "ADMIN", "Chef")
        comptable = _compte(db, etab, "COMPTABLE", "Compta")

        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=CLOTURE",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 400
        db.expire_all()
        assert db.get(Utilisateur, comptable.utilisateur_id).statut == "ACTIF"
