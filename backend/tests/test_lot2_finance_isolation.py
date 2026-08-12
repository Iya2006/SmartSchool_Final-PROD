"""
Tests — Lot 2 (chantier multi-écoles) : isolation par établissement du
module Finance.

Vérifie que deux écoles (A et B) partageant la même base centralisée ne
peuvent jamais lire, modifier ou faire fuiter leurs données financières
respectives : factures, paiements, dépenses, salaires (identification
employé via _identifier_employe), tarifs de classe.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Depense, Eleve, Enseignant, Etablissement,
    Facture, Inscription, Niveau, Paiement, TypeFrais, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    """Petite école complète prête à l'emploi pour les tests d'isolation :
    1 établissement, 1 année scolaire, 1 cycle/niveau/classe, 1 élève inscrit,
    1 enseignant, 1 admin FINANCE_ROLES."""

    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"L2-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
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

        self.eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L2ELV-{uid}",
            nom="Diallo", prenom="Fatoumata", date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(self.eleve); db.commit(); db.refresh(self.eleve)

        self.inscription = Inscription(
            eleve_id=self.eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(self.inscription); db.commit(); db.refresh(self.inscription)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L2ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"67000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF", salaire_base=1500000,
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L2{uid}", nom_utilisateur=f"l2.admin.{uid}",
            email=f"l2.admin.{uid}@smartschool.gn", telephone=f"68000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    @property
    def enseignant_ref(self) -> str:
        return f"ENS_{self.enseignant.enseignant_id}"


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _type_frais(db: Session, etablissement_id: int) -> TypeFrais:
    """Un type de frais releve d'UNE ecole (migration 2026_08_compta_01).

    La table etait partagee : une ecole renommant « Scolarite » changeait
    l'intitule sur les factures de toutes les autres.
    """
    uid = _uid()
    tf = TypeFrais(etablissement_id=etablissement_id, code=f"TF{uid}",
                   libelle="Scolarité", categorie="SCOLARITE", montant_defaut=100000)
    db.add(tf); db.commit(); db.refresh(tf)
    return tf


class TestIdentifierEmployeIsole:
    def test_paiement_salaire_cross_ecole_refuse(self, client: TestClient, db: Session):
        """École A ne doit jamais pouvoir payer le salaire d'un enseignant de l'école B."""
        ecole_a = Ecole(db, "SALA")
        ecole_b = Ecole(db, "SALB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/finance/salaires/payer",
            json={"enseignant_id": ecole_b.enseignant_ref, "mois": "2026-01", "mode_paiement": "Cash"},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_prime_cross_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "PRIA")
        ecole_b = Ecole(db, "PRIB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/finance/primes",
            json={"employe_id": ecole_b.enseignant_ref, "montant": 50000, "mois_concerne": "2026-01"},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_avance_cross_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "AVA")
        ecole_b = Ecole(db, "AVB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/finance/avances",
            json={"employe_id": ecole_b.enseignant_ref, "montant": 20000},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_meme_paiement_salaire_fonctionne_dans_sa_propre_ecole(self, client: TestClient, db: Session):
        ecole = Ecole(db, "SALOK")
        headers = _headers(client, ecole.admin.nom_utilisateur)

        # Le paiement de salaire vérifie le solde de caisse disponible
        # (_get_solde_caisse) — une école sans encaissement enregistré a un
        # solde de 0 GNF ; on encaisse d'abord de quoi couvrir le salaire.
        # Préfixe "0-" délibéré : create_facture() choisit le prochain numéro
        # via `ORDER BY numero_facture DESC` sur TOUTE la table (tous
        # établissements confondus, non isolé par école) ; "0-..." trie avant
        # tout "FAC-......" et ne peut donc jamais être pris pour le dernier
        # numéro réel par un autre test de ce fichier.
        facture = Facture(
            inscription_id=ecole.inscription.inscription_id, annee_id=ecole.annee.annee_id,
            numero_facture=f"0-FACSAL-{ecole.etab.etablissement_id}", montant_total=2000000,
            montant_net=2000000, montant_paye=2000000, montant_restant=0, statut="PAYEE",
        )
        db.add(facture); db.commit(); db.refresh(facture)
        paiement = Paiement(
            facture_id=facture.facture_id, annee_id=ecole.annee.annee_id,
            numero_recu=f"RECSAL-{ecole.etab.etablissement_id}", montant=2000000,
            mode_paiement="Cash", statut="VALIDE",
        )
        db.add(paiement); db.commit()

        resp = client.post(
            "/api/finance/salaires/payer",
            json={"enseignant_id": ecole.enseignant_ref, "mois": "2026-01", "mode_paiement": "Cash"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    def test_liste_employes_salaires_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LSTA")
        ecole_b = Ecole(db, "LSTB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get("/api/finance/salaires/employes", headers=headers_a)
        assert resp.status_code == 200
        ids = {e["id"] for e in resp.json()}
        assert ecole_a.enseignant_ref in ids
        assert ecole_b.enseignant_ref not in ids


class TestFactureEtPaiementIsolation:
    def test_create_facture_avec_inscription_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "FACA")
        ecole_b = Ecole(db, "FACB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        type_frais = _type_frais(db, ecole_b.etab.etablissement_id)

        resp = client.post(
            "/api/finance/factures",
            json={
                "inscription_id": ecole_b.inscription.inscription_id,
                "type_frais_id": type_frais.type_frais_id,
                "montant_total": 100000,
            },
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_create_facture_ok_dans_sa_propre_ecole(self, client: TestClient, db: Session):
        ecole = Ecole(db, "FACOK")
        headers = _headers(client, ecole.admin.nom_utilisateur)
        type_frais = _type_frais(db, ecole.etab.etablissement_id)

        resp = client.post(
            "/api/finance/factures",
            json={
                "inscription_id": ecole.inscription.inscription_id,
                "type_frais_id": type_frais.type_frais_id,
                "montant_total": 100000,
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    def test_create_paiement_sur_facture_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "PAYA")
        ecole_b = Ecole(db, "PAYB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)
        type_frais = _type_frais(db, ecole_b.etab.etablissement_id)

        # Facture créée légitimement dans l'école B
        resp = client.post(
            "/api/finance/factures",
            json={
                "inscription_id": ecole_b.inscription.inscription_id,
                "type_frais_id": type_frais.type_frais_id,
                "montant_total": 100000,
            },
            headers=headers_b,
        )
        facture_id = resp.json()["facture_id"]

        # École A tente de payer la facture de l'école B
        resp = client.post(
            "/api/finance/paiements",
            json={"facture_id": facture_id, "montant": 50000, "mode_paiement": "ESPECES"},
            headers=headers_a,
        )
        assert resp.status_code == 404

    def test_liste_factures_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LFA")
        ecole_b = Ecole(db, "LFB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)
        type_frais = _type_frais(db, ecole_b.etab.etablissement_id)

        client.post(
            "/api/finance/factures",
            json={"inscription_id": ecole_a.inscription.inscription_id, "type_frais_id": type_frais.type_frais_id, "montant_total": 77000},
            headers=headers_a,
        )
        resp_b = client.get("/api/finance/factures", headers=headers_b)
        assert resp_b.status_code == 200
        assert all(f["eleve_id"] != ecole_a.eleve.eleve_id for f in resp_b.json())

    def test_solde_eleve_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "SOLA")
        ecole_b = Ecole(db, "SOLB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.get(f"/api/finance/solde-eleve/{ecole_b.eleve.eleve_id}", headers=headers_a)
        assert resp.status_code == 404

    def test_annuler_paiement_cross_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "ANNA")
        ecole_b = Ecole(db, "ANNB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)
        type_frais = _type_frais(db, ecole_b.etab.etablissement_id)

        resp = client.post(
            "/api/finance/factures",
            json={"inscription_id": ecole_b.inscription.inscription_id, "type_frais_id": type_frais.type_frais_id, "montant_total": 100000},
            headers=headers_b,
        )
        facture_id = resp.json()["facture_id"]
        resp = client.post(
            "/api/finance/paiements",
            json={"facture_id": facture_id, "montant": 50000, "mode_paiement": "ESPECES"},
            headers=headers_b,
        )
        paiement_id = resp.json()["paiement_id"]

        resp = client.put(
            f"/api/finance/paiements/{paiement_id}/annuler",
            json={"motif": "test"},
            headers=headers_a,
        )
        assert resp.status_code == 404


class TestDepenseIsolation:
    def test_create_depense_ignore_etablissement_id_du_body(self, client: TestClient, db: Session):
        """Un etablissement_id envoyé dans le body de /api/finance/depenses ne
        doit jamais déterminer l'école propriétaire — seul le compte
        authentifié fait foi."""
        ecole_a = Ecole(db, "DEPA")
        ecole_b = Ecole(db, "DEPB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)

        resp = client.post(
            "/api/finance/depenses",
            json={
                "etablissement_id": ecole_b.etab.etablissement_id,  # tentative d'injection
                "annee_id": ecole_a.annee.annee_id,
                "categorie": "FOURNITURES",
                "libelle": "Test dépense",
                "montant": 15000,
            },
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text
        dep = db.query(Depense).filter(Depense.depense_id == resp.json()["depense_id"]).first()
        assert dep.etablissement_id == ecole_a.etab.etablissement_id
        assert dep.etablissement_id != ecole_b.etab.etablissement_id

    def test_valider_depense_cross_ecole_404(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "VALA")
        ecole_b = Ecole(db, "VALB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        resp = client.post(
            "/api/finance/depenses",
            json={"etablissement_id": ecole_b.etab.etablissement_id, "annee_id": ecole_b.annee.annee_id,
                  "categorie": "FOURNITURES", "libelle": "Dépense B", "montant": 20000},
            headers=headers_b,
        )
        depense_id = resp.json()["depense_id"]

        resp = client.put(f"/api/finance/depenses/{depense_id}/valider", headers=headers_a)
        assert resp.status_code == 404

    def test_liste_depenses_isolee(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "LDA")
        ecole_b = Ecole(db, "LDB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        client.post(
            "/api/finance/depenses",
            json={"etablissement_id": ecole_a.etab.etablissement_id, "annee_id": ecole_a.annee.annee_id,
                  "categorie": "FOURNITURES", "libelle": "Dépense A unique", "montant": 12345},
            headers=headers_a,
        )
        resp_b = client.get("/api/finance/depenses", headers=headers_b)
        assert resp_b.status_code == 200
        assert all(d["description"] != "Dépense A unique" for d in resp_b.json())


class TestTarifsClasseOwnership:
    def test_set_tarifs_classe_autre_ecole_refuse(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "TARA")
        ecole_b = Ecole(db, "TARB")
        headers_a = _headers(client, ecole_a.admin.nom_utilisateur)
        type_frais = _type_frais(db, ecole_b.etab.etablissement_id)

        resp = client.put(
            "/api/finance/tarifs-classe",
            json=[{"type_frais_id": type_frais.type_frais_id, "classe_id": ecole_b.classe.classe_id, "montant": 90000}],
            headers=headers_a,
        )
        assert resp.status_code == 403

    def test_get_tarifs_classe_isole(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "TGA")
        ecole_b = Ecole(db, "TGB")
        headers_b = _headers(client, ecole_b.admin.nom_utilisateur)

        resp = client.get(f"/api/finance/tarifs-classe?classe_id={ecole_a.classe.classe_id}", headers=headers_b)
        # La classe de l'école A n'appartient pas à l'école B : filtre par
        # établissement => liste vide (pas d'IDOR en lecture).
        assert resp.status_code == 200
        assert resp.json() == []


class TestSuperAdminPlateformeRefuseSurFinance:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l2.super.{uid}",
            email=f"l2.super.{uid}@smartschool.gn", telephone=f"69000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        resp = client.get("/api/finance/factures", headers=headers)
        assert resp.status_code == 403
