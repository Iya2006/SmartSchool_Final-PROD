"""
Tests — inscription publique d'une école, et sa validation par la plateforme.

Une école ne pouvait pas être créée par elle-même : `POST /parametrage/
etablissements` est réservé au SUPER_ADMIN, et un fondateur qui arrive sur le
site n'a aucun compte. C'était l'œuf et la poule.

La route publique d'inscription ouvre la seule porte nécessaire. Ce qu'elle ne
doit JAMAIS faire : activer l'école toute seule, ou renvoyer un jeton — les
deux videraient la validation de son sens.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.inscription_etablissement import (
    STATUT_ACTIF, STATUT_EN_ATTENTE, STATUT_REFUSE, STATUT_SUSPENDU,
)
from app.models.academique import (
    AnneeScolaire, Etablissement, TypeEvaluation, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _demande(uid: int, **surcharges) -> dict:
    base = {
        "nom_etablissement": f"Groupe Scolaire Test {uid}",
        "type_etablissement": "LYCEE",
        "ville": "Conakry",
        "adresse": "Quartier Kaloum",
        "telephone_etablissement": f"6220{uid:05d}",
        "email_etablissement": f"contact{uid}@ecole-test.gn",
        "nom": "Camara",
        "prenom": "Fatoumata",
        "email": f"fondateur{uid}@ecole-test.gn",
        "telephone": f"6230{uid:05d}",
        "mot_de_passe": "motdepasse123",
    }
    base.update(surcharges)
    return base


@pytest.fixture
def nettoyer(db: Session):
    """Supprime les écoles créées par le test, quoi qu'il arrive."""
    crees: list = []
    yield crees
    for etablissement_id in crees:
        for modele in (Utilisateur, TypeEvaluation, AnneeScolaire):
            db.query(modele).filter(
                modele.etablissement_id == etablissement_id
            ).delete(synchronize_session=False)
        db.query(Etablissement).filter(
            Etablissement.etablissement_id == etablissement_id
        ).delete(synchronize_session=False)
    db.commit()


def _inscrire(client: TestClient, db: Session, nettoyer, **surcharges):
    """Inscrit une école et retient son identifiant pour le nettoyage.

    On la retrouve par l'e-mail du FONDATEUR, jamais par le nom de l'école :
    deux écoles peuvent légitimement porter le même nom (c'est même l'objet
    d'un des tests), alors qu'un identifiant de connexion est unique.
    """
    uid = _uid()
    donnees = _demande(uid, **surcharges)
    reponse = client.post("/api/inscription-etablissement", json=donnees)
    if reponse.status_code == 201:
        admin = db.query(Utilisateur).filter(Utilisateur.email == donnees["email"]).first()
        if admin:
            nettoyer.append(admin.etablissement_id)
    return reponse, uid


class TestInscriptionPublique:
    def test_inscription_sans_authentification_reussit(self, client: TestClient, db: Session, nettoyer):
        reponse, _ = _inscrire(client, db, nettoyer)
        assert reponse.status_code == 201, reponse.text

    def test_l_ecole_est_creee_en_attente_jamais_active(self, client: TestClient, db: Session, nettoyer):
        """Le cœur de la décision produit : la plateforme garde la main."""
        reponse, _ = _inscrire(client, db, nettoyer)
        assert reponse.json()["statut"] == STATUT_EN_ATTENTE
        ecole = db.query(Etablissement).filter(
            Etablissement.etablissement_id == nettoyer[-1]
        ).first()
        assert ecole.statut == STATUT_EN_ATTENTE

    def test_aucun_jeton_n_est_renvoye(self, client: TestClient, db: Session, nettoyer):
        """Renvoyer un jeton ici permettrait d'entrer avant validation."""
        reponse, _ = _inscrire(client, db, nettoyer)
        corps = reponse.json()
        assert "token" not in corps and "access_token" not in corps

    def test_le_fondateur_devient_ADMIN_de_son_ecole_pas_SUPER_ADMIN(
        self, client: TestClient, db: Session, nettoyer
    ):
        """SUPER_ADMIN est le rôle de l'éditeur de la plateforme : le donner
        ici ouvrirait l'accès à toutes les autres écoles."""
        _inscrire(client, db, nettoyer)
        admin = db.query(Utilisateur).filter(
            Utilisateur.etablissement_id == nettoyer[-1]
        ).first()
        assert admin is not None
        assert admin.role == "ADMIN"
        assert admin.etablissement_id == nettoyer[-1]

    def test_l_ecole_recoit_annee_scolaire_et_types_d_evaluation(
        self, client: TestClient, db: Session, nettoyer
    ):
        """Sans eux, l'école serait inutilisable le jour de son activation."""
        _inscrire(client, db, nettoyer)
        etab = nettoyer[-1]
        annee = db.query(AnneeScolaire).filter(
            AnneeScolaire.etablissement_id == etab
        ).first()
        assert annee is not None and annee.est_courante == "O"
        types = db.query(TypeEvaluation).filter(
            TypeEvaluation.etablissement_id == etab
        ).all()
        assert {t.code for t in types} >= {"EVAL", "COMPO"}

    def test_email_deja_utilise_refuse(self, client: TestClient, db: Session, nettoyer):
        """Les identifiants de connexion sont globaux : un doublon rendrait le
        second compte définitivement inconnectable."""
        _, uid = _inscrire(client, db, nettoyer)
        partage = _demande(uid)["email"]
        reponse = client.post("/api/inscription-etablissement",
                              json=_demande(_uid(), email=partage))
        assert reponse.status_code == 409

    def test_deux_ecoles_peuvent_porter_le_meme_nom(self, client: TestClient, db: Session, nettoyer):
        """Le nom d'une école n'est pas un identifiant : deux « Groupe Scolaire
        La Renaissance » doivent pouvoir coexister, séparés."""
        nom = f"Groupe Scolaire La Renaissance {_uid()}"
        r1, _ = _inscrire(client, db, nettoyer, nom_etablissement=nom)
        r2, _ = _inscrire(client, db, nettoyer, nom_etablissement=nom)
        assert r1.status_code == 201 and r2.status_code == 201
        assert nettoyer[-1] != nettoyer[-2]
        codes = {
            db.query(Etablissement).filter(Etablissement.etablissement_id == e).first().code
            for e in nettoyer[-2:]
        }
        assert len(codes) == 2, "les codes doivent rester uniques"

    @pytest.mark.parametrize("champ,valeur", [
        ("type_etablissement", "ECOLE_DE_MAGIE"),
        ("mot_de_passe", "court"),
        ("email", "pas-un-email"),
        ("nom_etablissement", "A"),
    ])
    def test_saisie_invalide_refusee(self, client: TestClient, champ, valeur):
        reponse = client.post("/api/inscription-etablissement",
                              json=_demande(_uid(), **{champ: valeur}))
        assert reponse.status_code == 422


class TestConnexionBloqueeAvantValidation:
    def test_le_fondateur_ne_peut_pas_se_connecter_tant_que_c_est_en_attente(
        self, client: TestClient, db: Session, nettoyer
    ):
        _, uid = _inscrire(client, db, nettoyer)
        donnees = _demande(uid)
        reponse = client.post("/api/auth/login", json={
            "identifiant": donnees["email"], "mot_de_passe": donnees["mot_de_passe"],
        })
        assert reponse.status_code == 403
        assert "validation" in reponse.json()["detail"].lower()

    def test_il_se_connecte_des_que_l_ecole_est_activee(
        self, client: TestClient, db: Session, nettoyer
    ):
        _, uid = _inscrire(client, db, nettoyer)
        ecole = db.query(Etablissement).filter(
            Etablissement.etablissement_id == nettoyer[-1]
        ).first()
        ecole.statut = STATUT_ACTIF
        db.commit()

        donnees = _demande(uid)
        reponse = client.post("/api/auth/login", json={
            "identifiant": donnees["email"], "mot_de_passe": donnees["mot_de_passe"],
        })
        assert reponse.status_code == 200, reponse.text
        assert reponse.json()["user"]["etablissement_id"] == nettoyer[-1]
        assert reponse.json()["user"]["role"] == "ADMIN"

    @pytest.mark.parametrize("statut", [STATUT_REFUSE, STATUT_SUSPENDU])
    def test_ecole_refusee_ou_suspendue_bloque_aussi(
        self, client: TestClient, db: Session, nettoyer, statut
    ):
        _, uid = _inscrire(client, db, nettoyer)
        ecole = db.query(Etablissement).filter(
            Etablissement.etablissement_id == nettoyer[-1]
        ).first()
        ecole.statut = statut
        db.commit()

        donnees = _demande(uid)
        reponse = client.post("/api/auth/login", json={
            "identifiant": donnees["email"], "mot_de_passe": donnees["mot_de_passe"],
        })
        assert reponse.status_code == 403


class TestValidationReserveeAuSuperAdmin:
    def test_un_admin_d_ecole_ne_peut_pas_valider(self, client: TestClient, db: Session, nettoyer):
        """Valider une école, c'est décider qui entre sur la plateforme. Ce
        n'est pas une opération d'administration d'école."""
        from unittest.mock import patch
        _inscrire(client, db, nettoyer)
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin", "etablissement_id": 1,
        }):
            reponse = client.put(
                f"/api/inscription-etablissement/{nettoyer[-1]}/valider",
                headers={"Authorization": "Bearer x"},
            )
        assert reponse.status_code == 403

    def test_liste_des_demandes_fermee_aux_non_super_admin(self, client: TestClient):
        from unittest.mock import patch
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "ADMIN", "type": "admin", "etablissement_id": 1,
        }):
            reponse = client.get("/api/inscription-etablissement/demandes",
                                 headers={"Authorization": "Bearer x"})
        assert reponse.status_code == 403

    def test_le_super_admin_valide_et_l_ecole_devient_active(
        self, client: TestClient, db: Session, nettoyer
    ):
        from unittest.mock import patch
        _inscrire(client, db, nettoyer)
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "SUPER_ADMIN", "type": "admin", "etablissement_id": None,
        }):
            reponse = client.put(
                f"/api/inscription-etablissement/{nettoyer[-1]}/valider",
                headers={"Authorization": "Bearer x"},
            )
        assert reponse.status_code == 200, reponse.text
        assert reponse.json()["statut"] == STATUT_ACTIF

    def test_refuser_ne_supprime_rien(self, client: TestClient, db: Session, nettoyer):
        """Effacer une demande ferait perdre la trace de qui a essayé."""
        from unittest.mock import patch
        _inscrire(client, db, nettoyer)
        with patch("app.core.auth.decode_token", return_value={
            "sub": "1", "role": "SUPER_ADMIN", "type": "admin", "etablissement_id": None,
        }):
            reponse = client.put(
                f"/api/inscription-etablissement/{nettoyer[-1]}/refuser",
                json={"motif": "Établissement non identifié"},
                headers={"Authorization": "Bearer x"},
            )
        assert reponse.status_code == 200
        ecole = db.query(Etablissement).filter(
            Etablissement.etablissement_id == nettoyer[-1]
        ).first()
        assert ecole is not None and ecole.statut == STATUT_REFUSE
