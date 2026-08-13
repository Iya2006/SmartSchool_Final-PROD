"""
Tests — un compte sans mot de passe ne s'ouvre pas.

CE QUI A ÉTÉ TROUVÉ
-------------------
Trois portes acceptaient d'ouvrir un compte qui n'avait jamais reçu de mot
de passe.

1. `verify_password` renvoyait True pour le mot « smartschool » dès que le
   hash était vide ou absent. Un passe-partout, écrit en clair dans le dépôt,
   et qui est le nom du produit.

2. Le portail élève acceptait ce même mot par défaut. Le matricule est
   imprimé sur les bulletins, appelé en classe et connu de tous les
   camarades : le lire suffisait.

3. Le portail parent ne vérifiait le mot de passe QUE si le parent en avait
   un. Un parent sans mot de passe entrait avec son seul numéro de
   téléphone — que l'école possède et qui circule dans les groupes de classe.

Sur la base réelle : 5 enseignants et 45 élèves étaient dans ce cas.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.academique import (
    AnneeScolaire, Eleve, Enseignant, Etablissement, Parent, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session) -> Etablissement:
    uid = _uid()
    etab = Etablissement(code=f"PAS-{uid}", nom=f"École PAS {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    )
    db.add(annee); db.commit()
    return etab


class TestLaFonctionElleMeme:
    def test_un_hash_vide_n_ouvre_rien(self):
        assert verify_password("smartschool", "") is False
        assert verify_password("smartschool", None) is False
        assert verify_password("", "") is False
        assert verify_password("n_importe_quoi", "") is False

    def test_un_hash_abime_n_ouvre_rien(self):
        """Une donnée corrompue ne doit jamais s'interpréter en autorisation."""
        assert verify_password("smartschool", "pas-un-hash-bcrypt") is False
        assert verify_password("smartschool", "$2b$12$tronque") is False

    def test_un_vrai_mot_de_passe_marche_toujours(self):
        assert verify_password("motdepasse123", hash_password("motdepasse123")) is True
        assert verify_password("autre", hash_password("motdepasse123")) is False


class TestLesQuatreFamillesDeComptes:
    def test_un_personnel_sans_mot_de_passe(self, client: TestClient, db: Session):
        etab = _ecole(db)
        uid = _uid()
        u = Utilisateur(
            nom="Bah", prenom=f"Sans{uid}", nom_utilisateur=f"pas.user.{uid}",
            mot_de_passe="", role="COMPTABLE", statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(u); db.commit()

        r = client.post("/api/auth/login",
                        json={"identifiant": u.nom_utilisateur, "mot_de_passe": "smartschool"})
        assert r.status_code == 403
        assert "mot de passe" in r.json()["detail"]

    def test_un_enseignant_sans_mot_de_passe(self, client: TestClient, db: Session):
        etab = _ecole(db)
        uid = _uid()
        ens = Enseignant(
            nom="Camara", prenom=f"Sans{uid}", matricule=f"PAS-ENS-{uid}", sexe="M",
            telephone=f"65000{uid:04d}", mot_de_passe="", statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(ens); db.commit()

        r = client.post("/api/auth/login",
                        json={"identifiant": ens.matricule, "mot_de_passe": "smartschool"})
        assert r.status_code == 403

    def test_un_eleve_sans_mot_de_passe(self, client: TestClient, db: Session):
        """Le cas le plus exposé : le matricule est public."""
        etab = _ecole(db)
        uid = _uid()
        el = Eleve(
            nom="Diallo", prenom=f"Sans{uid}", matricule=f"PAS-ELV-{uid}", sexe="F",
            date_naissance=date(2012, 5, 3), mot_de_passe="", statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(el); db.commit()

        r = client.post("/api/auth/login",
                        json={"identifiant": el.matricule, "mot_de_passe": "smartschool"})
        assert r.status_code == 403

        # Et la porte dédiée du portail élève, qui avait son propre défaut.
        r = client.post("/api/portail-eleve/login",
                        json={"matricule": el.matricule, "mot_de_passe": "smartschool"})
        assert r.status_code == 403

    def test_un_parent_sans_mot_de_passe(self, client: TestClient, db: Session):
        """Il entrait avec son seul numéro : aucun mot de passe demandé."""
        etab = _ecole(db)
        uid = _uid()
        parent = Parent(
            nom="Sow", prenom=f"Sans{uid}", telephone_1=f"61000{uid:04d}",
            mot_de_passe="", statut="ACTIF", etablissement_id=etab.etablissement_id,
        )
        db.add(parent); db.commit()

        r = client.post("/api/portail-parent/login",
                        json={"telephone": parent.telephone_1})
        assert r.status_code == 403

        r = client.post("/api/portail-parent/login",
                        json={"telephone": parent.telephone_1, "mot_de_passe": "smartschool"})
        assert r.status_code == 403


class TestUnVraiCompteMarcheToujours:
    """Le correctif ne doit pas fermer la porte à ceux qui ont un mot de passe."""

    def test_le_personnel(self, client: TestClient, db: Session):
        etab = _ecole(db)
        uid = _uid()
        u = Utilisateur(
            nom="Keita", prenom=f"Avec{uid}", nom_utilisateur=f"ok.user.{uid}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(u); db.commit()

        r = client.post("/api/auth/login",
                        json={"identifiant": u.nom_utilisateur, "mot_de_passe": "motdepasse123"})
        assert r.status_code == 200

    def test_l_eleve(self, client: TestClient, db: Session):
        etab = _ecole(db)
        uid = _uid()
        el = Eleve(
            nom="Toure", prenom=f"Avec{uid}", matricule=f"OK-ELV-{uid}", sexe="M",
            date_naissance=date(2011, 2, 9),
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(el); db.commit()

        r = client.post("/api/portail-eleve/login",
                        json={"matricule": el.matricule, "mot_de_passe": "motdepasse123"})
        assert r.status_code == 200

    def test_le_parent(self, client: TestClient, db: Session):
        etab = _ecole(db)
        uid = _uid()
        parent = Parent(
            nom="Conde", prenom=f"Avec{uid}", telephone_1=f"60000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(parent); db.commit()

        r = client.post("/api/portail-parent/login",
                        json={"telephone": parent.telephone_1, "mot_de_passe": "motdepasse123"})
        assert r.status_code == 200
