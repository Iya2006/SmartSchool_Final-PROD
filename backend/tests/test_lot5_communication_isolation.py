"""
Tests — Lot 5 (chantier multi-écoles) : isolation par établissement du
module Communication.

Vérifie en particulier la fuite la plus sévère nommée par l'audit initial :
GET /parents-list exposait l'annuaire complet de TOUTE la plateforme (nom,
téléphone, email, profession, enfants) sans aucune restriction de rôle ni
d'établissement. Vérifie aussi le Cas B (parent avec des enfants dans
plusieurs écoles) : chaque école ne doit jamais voir les enfants d'une autre.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, DemandeEmploi, Disponibilite, Eleve,
    EleveParent, Enseignant, Etablissement, Message, Niveau, Parent,
    Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"L5-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
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

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L5ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"77000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L5{uid}", nom_utilisateur=f"l5.admin.{uid}",
            email=f"l5.admin.{uid}@smartschool.gn", telephone=f"78000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def ajouter_eleve(self, db: Session, nom="Diallo", prenom="Fatoumata") -> Eleve:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L5ELV-{uid}",
            nom=nom, prenom=prenom, date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        return eleve


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _creer_parent(db: Session, etablissement_id: int) -> Parent:
    uid = _uid()
    parent = Parent(
        # Un parent releve d'UNE ecole (migration 2026_08_multi_01).
        etablissement_id=etablissement_id,
        nom="Test", prenom="Parent", telephone_1=f"79000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
    )
    db.add(parent); db.commit(); db.refresh(parent)
    return parent


def _lier(db: Session, parent: Parent, eleve: Eleve) -> None:
    db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="PERE"))
    db.commit()


class TestParentsListFuiteNommee:
    """GET /parents-list — la fuite la plus sévère de l'audit initial."""

    def test_role_non_admin_refuse(self, client: TestClient, db: Session):
        ecole = Ecole(db, "ROLEA")
        headers = _headers(client, ecole.enseignant.matricule)
        resp = client.get("/api/communication/parents-list", headers=headers)
        assert resp.status_code == 403

    def test_isole_par_etablissement(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "PLA")
        ecole_b = Ecole(db, "PLB")
        eleve_a = ecole_a.ajouter_eleve(db)
        eleve_b = ecole_b.ajouter_eleve(db)
        parent_a = _creer_parent(db, ecole_a.etab.etablissement_id)
        parent_b = _creer_parent(db, ecole_b.etab.etablissement_id)
        _lier(db, parent_a, eleve_a)
        _lier(db, parent_b, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/communication/parents-list", headers=headers_a)
        assert resp.status_code == 200
        ids = {p["parent_id"] for p in resp.json()}
        assert parent_a.parent_id in ids
        assert parent_b.parent_id not in ids

    def test_cas_b_parent_multi_ecoles_jamais_de_fuite_croisee(self, client: TestClient, db: Session):
        """Un même parent avec un enfant dans chaque école : chaque école ne
        doit voir QUE son propre enfant, jamais celui de l'autre école."""
        ecole_a = Ecole(db, "CBA")
        ecole_b = Ecole(db, "CBB")
        eleve_a = ecole_a.ajouter_eleve(db, nom="Camara", prenom="EnfantA")
        eleve_b = ecole_b.ajouter_eleve(db, nom="Camara", prenom="EnfantB")
        # Une FICHE PAR ECOLE depuis la migration 2026_08_multi_01 : la meme
        # personne existe deux fois, chacune rattachee a son propre enfant.
        # L'annuaire de l'ecole A ne doit voir que la fiche de l'ecole A.
        parent = _creer_parent(db, ecole_a.etab.etablissement_id)
        parent_chez_b = _creer_parent(db, ecole_b.etab.etablissement_id)
        _lier(db, parent, eleve_a)
        _lier(db, parent_chez_b, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        resp_a = client.get("/api/communication/parents-list", headers=headers_a)
        fiche_a = next(p for p in resp_a.json() if p["parent_id"] == parent.parent_id)
        noms_enfants_a = {e["prenom"] for e in fiche_a["enfants"]}
        assert noms_enfants_a == {"EnfantA"}

        resp_b = client.get("/api/communication/parents-list", headers=headers_b)
        # L'ecole B ne voit pas la fiche de A : elle voit LA SIENNE, celle qui
        # porte son propre enfant. Deux fiches distinctes, aucun croisement.
        assert all(p["parent_id"] != parent.parent_id for p in resp_b.json())
        fiche_b = next(p for p in resp_b.json() if p["parent_id"] == parent_chez_b.parent_id)
        noms_enfants_b = {e["prenom"] for e in fiche_b["enfants"]}
        assert noms_enfants_b == {"EnfantB"}


class TestParentsAnnuaireEtStats:
    def test_annuaire_isole_par_etablissement(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "ANA")
        ecole_b = Ecole(db, "ANB")
        eleve_a = ecole_a.ajouter_eleve(db)
        eleve_b = ecole_b.ajouter_eleve(db)
        parent_a = _creer_parent(db, ecole_a.etab.etablissement_id)
        parent_b = _creer_parent(db, ecole_b.etab.etablissement_id)
        _lier(db, parent_a, eleve_a)
        _lier(db, parent_b, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/communication/parents/annuaire", headers=headers_a)
        assert resp.status_code == 200
        ids = {p["parent_id"] for p in resp.json()}
        assert parent_a.parent_id in ids
        assert parent_b.parent_id not in ids

    def test_stats_isolees(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "STA")
        ecole_b = Ecole(db, "STB")
        eleve_a = ecole_a.ajouter_eleve(db)
        eleve_b = ecole_b.ajouter_eleve(db)
        parent_a = _creer_parent(db, ecole_a.etab.etablissement_id)
        parent_b = _creer_parent(db, ecole_b.etab.etablissement_id)
        _lier(db, parent_a, eleve_a)
        _lier(db, parent_b, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/communication/parents/stats", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["total_parents"] == 1
        assert resp.json()["total_enfants"] == 1

    def test_role_non_admin_refuse(self, client: TestClient, db: Session):
        ecole = Ecole(db, "STROLE")
        headers = _headers(client, ecole.enseignant.matricule)
        resp = client.get("/api/communication/parents/stats", headers=headers)
        assert resp.status_code == 403


class TestMessagesParents:
    def test_send_tous_parents_tague_bon_etablissement(self, client: TestClient, db: Session):
        ecole = Ecole(db, "MPA")
        headers = _headers(client, ecole.admin.nom_utilisateur)
        resp = client.post(
            "/api/communication/messages-parents",
            json={"destinataire_type": "TOUS_PARENTS", "sujet": "Réunion", "contenu": "Info"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        msg = db.query(Message).filter(Message.message_id == resp.json()["message_id"]).first()
        assert msg.etablissement_id == ecole.etab.etablissement_id

    def test_send_a_parent_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "MPB")
        ecole_b = Ecole(db, "MPC")
        eleve_b = ecole_b.ajouter_eleve(db)
        parent_b = _creer_parent(db, ecole_b.etab.etablissement_id)
        _lier(db, parent_b, eleve_b)
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/communication/messages-parents",
            json={"destinataire_type": "PARENT", "destinataire_id": parent_b.parent_id, "sujet": "Test", "contenu": "Test"},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_liste_messages_parents_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "MPD")
        ecole_b = Ecole(db, "MPE")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        client.post(
            "/api/communication/messages-parents",
            json={"destinataire_type": "TOUS_PARENTS", "sujet": "SujetUniqueA", "contenu": "Info"},
            headers=headers_a,
        )
        resp_b = client.get("/api/communication/messages-parents", headers=headers_b)
        assert resp_b.status_code == 200
        assert all(m["sujet"] != "SujetUniqueA" for m in resp_b.json())


class TestDisponibilitesOwnership:
    def _creer_demande(self, client, headers, titre="Demande T1"):
        resp = client.post("/api/communication/demandes", json={"titre": titre}, headers=headers)
        assert resp.status_code == 201, resp.text
        return resp.json()["demande_id"]

    def test_soumettre_disponibilites_usurpation_refusee(self, client: TestClient, db: Session):
        ecole = Ecole(db, "DISPA")
        collegue = Enseignant(
            etablissement_id=ecole.etab.etablissement_id, matricule=f"L5C-{_uid()}",
            nom="Diallo", prenom="Aissatou", sexe="F", telephone=f"80000{_uid():04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(collegue); db.commit(); db.refresh(collegue)
        headers_admin = _headers(client, ecole.admin.nom_utilisateur)
        demande_id = self._creer_demande(client, headers_admin)
        headers_ens = _headers(client, ecole.enseignant.matricule)

        resp = client.post(
            "/api/communication/disponibilites",
            json={
                "demande_id": demande_id, "enseignant_id": collegue.enseignant_id,
                "slots": [{"classe_id": ecole.classe.classe_id, "jour": "LUNDI", "heure_debut": "08:00", "heure_fin": "09:00"}],
            },
            headers=headers_ens,
        )
        assert resp.status_code == 403

    def test_get_mes_disponibilites_cross_enseignant_refuse(self, client: TestClient, db: Session):
        ecole = Ecole(db, "DISPB")
        collegue = Enseignant(
            etablissement_id=ecole.etab.etablissement_id, matricule=f"L5D-{_uid()}",
            nom="Sow", prenom="Ibrahima", sexe="M", telephone=f"81000{_uid():04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(collegue); db.commit(); db.refresh(collegue)
        headers_ens = _headers(client, ecole.enseignant.matricule)

        resp = client.get(f"/api/communication/disponibilites/enseignant/{collegue.enseignant_id}", headers=headers_ens)
        assert resp.status_code == 403

    def test_demande_isolee_par_etablissement(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "DEMA")
        ecole_b = Ecole(db, "DEMB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)
        demande_id = self._creer_demande(client, headers_a, titre="Demande École A")

        resp_liste_b = client.get("/api/communication/demandes", headers=headers_b)
        assert resp_liste_b.status_code == 200
        assert all(d["demande_id"] != demande_id for d in resp_liste_b.json())

        resp_detail_b = client.get(f"/api/communication/demandes/{demande_id}", headers=headers_b)
        assert resp_detail_b.status_code == 404

    def test_valider_disponibilite_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "VALA")
        ecole_b = Ecole(db, "VALB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)
        headers_ens_b = _headers(client, ecole_b.enseignant.matricule)
        demande_id = self._creer_demande(client, headers_b)

        resp = client.post(
            "/api/communication/disponibilites",
            json={
                "demande_id": demande_id, "enseignant_id": ecole_b.enseignant.enseignant_id,
                "slots": [{"classe_id": ecole_b.classe.classe_id, "jour": "LUNDI", "heure_debut": "08:00", "heure_fin": "09:00"}],
            },
            headers=headers_ens_b,
        )
        assert resp.status_code == 201
        dispo_id = db.query(Disponibilite).filter(Disponibilite.demande_id == demande_id).first().disponibilite_id

        resp = client.put(f"/api/communication/disponibilites/{dispo_id}/valider", headers=headers_a)
        assert resp.status_code == 404


class TestMessagesInternes:
    def test_liste_messages_isolee_par_etablissement(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "MSGA")
        ecole_b = Ecole(db, "MSGB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        client.post(
            "/api/communication/messages",
            json={"expediteur_type": "ADMIN", "destinataire_type": "ADMIN", "sujet": "SujetInterneA", "contenu": "x"},
            headers=headers_a,
        )
        resp_b = client.get("/api/communication/messages?role=ADMIN", headers=headers_b)
        assert resp_b.status_code == 200
        assert all(m["sujet"] != "SujetInterneA" for m in resp_b.json())

    def test_enseignant_ne_peut_pas_lister_messages_dun_collegue(self, client: TestClient, db: Session):
        ecole = Ecole(db, "MSGC")
        collegue = Enseignant(
            etablissement_id=ecole.etab.etablissement_id, matricule=f"L5E-{_uid()}",
            nom="Toure", prenom="Sekou", sexe="M", telephone=f"82000{_uid():04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(collegue); db.commit(); db.refresh(collegue)
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.get(
            f"/api/communication/messages?role=ENSEIGNANT&enseignant_id={collegue.enseignant_id}",
            headers=headers,
        )
        assert resp.status_code == 200
        # Le paramètre enseignant_id est ignoré : la requête retourne la
        # messagerie de l'appelant, jamais celle du collègue visé.


class TestSuperAdminPlateformeRefuseSurCommunication:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l5.super.{uid}",
            email=f"l5.super.{uid}@smartschool.gn", telephone=f"83000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/communication/parents-list", headers=headers)
        assert resp.status_code == 403
