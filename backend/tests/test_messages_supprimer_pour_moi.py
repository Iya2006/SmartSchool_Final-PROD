"""
« Supprimer pour moi » (masquage de messages) — DELETE côté admin, enseignant,
parent, élève.

Règle centrale vérifiée : on ne supprime JAMAIS la ligne ss_messages partagée.
Un message diffusé à toute une classe / tous les parents est UNE seule ligne
vue par plusieurs personnes ; quand l'un le masque, les autres continuent de
le voir, et la ligne reste en base.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Enseignant,
    Etablissement, Message, MessageMasque, Niveau, Parent, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"SM-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)
        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
            date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)
        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Secondaire", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)
        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)
        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)
        self.admin = Utilisateur(
            nom="Admin", prenom=f"S{uid}", nom_utilisateur=f"sm.admin.{uid}",
            email=f"sm.admin.{uid}@smartschool.gn", telephone=f"66671{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def enseignant(self, db: Session) -> Enseignant:
        uid = _uid()
        e = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"SMENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"77001{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(e); db.commit(); db.refresh(e)
        return e

    def parent_avec_enfant(self, db: Session) -> Parent:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"SMELV-{uid}",
            nom="Diallo", prenom="Fatoumata", date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        from app.models.academique import Inscription
        db.add(Inscription(eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id,
                           annee_id=self.annee.annee_id, statut="ACTIVE"))
        parent = Parent(
            etablissement_id=self.etab.etablissement_id, nom="Diallo", prenom="Mariama",
            telephone_1=f"79001{uid:04d}", mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(parent); db.commit(); db.refresh(parent)
        db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="MERE"))
        db.commit()
        return parent


def _admin_headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _parent_headers(client: TestClient, parent: Parent) -> dict:
    r = client.post("/api/portail-parent/login", json={"telephone": parent.telephone_1, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_admin_supprime_de_sa_boite(client: TestClient, db: Session):
    ecole = Ecole(db, "ADEL")
    h = _admin_headers(client, ecole.admin.nom_utilisateur)
    r = client.post("/api/communication/messages",
                    json={"expediteur_type": "ADMIN", "destinataire_type": "ADMIN", "sujet": "Note interne", "contenu": "x"},
                    headers=h)
    assert r.status_code == 201, r.text
    mid = r.json()["message_id"]

    # Présent avant.
    assert any(m["message_id"] == mid for m in client.get("/api/communication/messages?role=ADMIN", headers=h).json())

    # Supprimé pour moi.
    assert client.delete(f"/api/communication/messages/{mid}", headers=h).status_code == 200

    # Absent après — mais la ligne existe toujours en base.
    assert all(m["message_id"] != mid for m in client.get("/api/communication/messages?role=ADMIN", headers=h).json())
    assert db.query(Message).filter(Message.message_id == mid).first() is not None


def test_diffusion_un_parent_masque_lautre_voit_toujours(client: TestClient, db: Session):
    """Le cas critique : un message « à tous les parents » masqué par l'un
    reste visible pour l'autre, et la ligne n'est pas effacée."""
    ecole = Ecole(db, "DIFF")
    h_admin = _admin_headers(client, ecole.admin.nom_utilisateur)
    parent_a = ecole.parent_avec_enfant(db)
    parent_b = ecole.parent_avec_enfant(db)

    r = client.post("/api/communication/messages-parents",
                    json={"destinataire_type": "TOUS_PARENTS", "sujet": "Réunion générale", "contenu": "Info"},
                    headers=h_admin)
    assert r.status_code == 201, r.text
    mid = r.json()["message_id"]

    h_a = _parent_headers(client, parent_a)
    h_b = _parent_headers(client, parent_b)

    # Les deux le voient au départ.
    assert any(m["message_id"] == mid for m in client.get(f"/api/portail-parent/{parent_a.parent_id}/messages", headers=h_a).json()["received"])
    assert any(m["message_id"] == mid for m in client.get(f"/api/portail-parent/{parent_b.parent_id}/messages", headers=h_b).json()["received"])

    # Parent A supprime pour lui.
    assert client.delete(f"/api/portail-parent/{parent_a.parent_id}/messages/{mid}", headers=h_a).status_code == 200

    # A ne le voit plus…
    recus_a = client.get(f"/api/portail-parent/{parent_a.parent_id}/messages", headers=h_a).json()["received"]
    assert all(m["message_id"] != mid for m in recus_a)
    # … mais B le voit toujours, et la ligne existe encore.
    recus_b = client.get(f"/api/portail-parent/{parent_b.parent_id}/messages", headers=h_b).json()["received"]
    assert any(m["message_id"] == mid for m in recus_b)
    assert db.query(Message).filter(Message.message_id == mid).first() is not None
    # Une seule ligne de masquage, pour le bon destinataire.
    masques = db.query(MessageMasque).filter(MessageMasque.message_id == mid).all()
    assert len(masques) == 1
    assert masques[0].viewer_type == "PARENT" and masques[0].viewer_id == parent_a.parent_id


def test_parent_ne_supprime_pas_message_dune_autre_ecole(client: TestClient, db: Session):
    ecole_a = Ecole(db, "XA")
    ecole_b = Ecole(db, "XB")
    h_admin_a = _admin_headers(client, ecole_a.admin.nom_utilisateur)
    ecole_a.parent_avec_enfant(db)  # au moins un parent chez A
    parent_b = ecole_b.parent_avec_enfant(db)

    mid = client.post("/api/communication/messages-parents",
                      json={"destinataire_type": "TOUS_PARENTS", "sujet": "École A", "contenu": "x"},
                      headers=h_admin_a).json()["message_id"]

    h_b = _parent_headers(client, parent_b)
    # Le parent de l'école B ne peut pas masquer un message de l'école A.
    assert client.delete(f"/api/portail-parent/{parent_b.parent_id}/messages/{mid}", headers=h_b).status_code == 404
    assert db.query(MessageMasque).filter(MessageMasque.message_id == mid).count() == 0


def test_enseignant_supprime_de_sa_boite(client: TestClient, db: Session):
    ecole = Ecole(db, "ENS")
    ens = ecole.enseignant(db)
    autre = ecole.enseignant(db)
    h_admin = _admin_headers(client, ecole.admin.nom_utilisateur)

    # Message diffusé à tous les enseignants.
    mid = client.post("/api/communication/messages",
                      json={"expediteur_type": "ADMIN", "destinataire_type": "TOUS_ENSEIGNANTS", "sujet": "Réunion profs", "contenu": "x"},
                      headers=h_admin).json()["message_id"]

    h_ens = _admin_headers(client, ens.matricule)  # login enseignant = matricule via /api/auth/login
    h_autre = _admin_headers(client, autre.matricule)

    assert any(m["message_id"] == mid for m in client.get("/api/communication/messages?role=ENSEIGNANT", headers=h_ens).json())
    assert client.delete(f"/api/communication/messages/{mid}", headers=h_ens).status_code == 200

    # L'enseignant ne le voit plus, son collègue si.
    assert all(m["message_id"] != mid for m in client.get("/api/communication/messages?role=ENSEIGNANT", headers=h_ens).json())
    assert any(m["message_id"] == mid for m in client.get("/api/communication/messages?role=ENSEIGNANT", headers=h_autre).json())
    assert db.query(Message).filter(Message.message_id == mid).first() is not None
