"""
Tests — Lot 1 (chantier multi-écoles) : isolation par établissement du
module Comptabilité.

Vérifie que deux écoles (A et B) partageant la même base centralisée ne
peuvent jamais lire, modifier ou faire fuiter leurs données comptables
respectives : PIN, exercices, écritures, fournisseurs, comptes auxiliaires
élèves/parents. Les référentiels GLOBAUX (JournalComptable, CompteComptable)
restent volontairement partagés (décision produit validée).
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.comptabilite import generer_ecriture_auto
from app.core.security import hash_password
from app.models.academique import (
    CompteComptable, Eleve, Etablissement, EcritureComptable,
    Fournisseur, JournalComptable, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _creer_etablissement(db: Session, nom: str) -> Etablissement:
    uid = _uid()
    etab = Etablissement(code=f"LOT1-{nom}-{uid}", nom=f"École {nom} {uid}", type_etablissement="LYCEE")
    db.add(etab)
    db.commit()
    db.refresh(etab)
    return etab


def _creer_admin(db: Session, etablissement_id: int, role: str = "ADMIN") -> Utilisateur:
    uid = _uid()
    user = Utilisateur(
        nom="Test", prenom="Lot1",
        nom_utilisateur=f"lot1.user.{uid}",
        email=f"lot1.user.{uid}@smartschool.gn",
        telephone=f"66000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"),
        role=role, statut="ACTIF",
        etablissement_id=etablissement_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login_headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _seed_referentiel_global(db: Session) -> tuple[int, int, int]:
    """Crée un journal + 2 comptes globaux minimaux pour les tests d'écritures
    manuelles (pas besoin de reproduire le vrai plan OHADA)."""
    uid = _uid()
    journal = JournalComptable(code=f"J{uid}", nom="Journal test", type_journal="OD")
    c1 = CompteComptable(numero_compte=f"1{uid}", libelle="Compte test 1", type_compte="ACTIF")
    c2 = CompteComptable(numero_compte=f"2{uid}", libelle="Compte test 2", type_compte="CHARGE")
    db.add_all([journal, c1, c2])
    db.commit()
    db.refresh(journal); db.refresh(c1); db.refresh(c2)
    return journal.journal_id, c1.compte_id, c2.compte_id


class TestPinEtExerciceIsolesParEtablissement:
    def test_exercices_isoles_par_etablissement(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "EXA")
        etab_b = _creer_etablissement(db, "EXB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)

        resp_a = client.get("/api/comptabilite/exercices", headers=headers_a)
        resp_b = client.get("/api/comptabilite/exercices", headers=headers_b)
        assert resp_a.status_code == 200 and resp_b.status_code == 200

        ids_a = {e["exercice_id"] for e in resp_a.json()}
        ids_b = {e["exercice_id"] for e in resp_b.json()}
        assert ids_a.isdisjoint(ids_b), "Un exercice ne doit jamais apparaître dans les deux écoles"
        assert len(ids_a) >= 1 and len(ids_b) >= 1

    def test_meme_annee_dans_deux_ecoles_autorise(self, client: TestClient, db: Session):
        """Avant le Lot 1, 'annee' était unique pour TOUTE la plateforme —
        deux écoles doivent maintenant pouvoir avoir chacune un exercice '2030'."""
        etab_a = _creer_etablissement(db, "ANA")
        etab_b = _creer_etablissement(db, "ANB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)

        payload = {"annee": "2030", "date_debut": "2030-01-01", "date_fin": "2030-12-31"}
        resp_a = client.post("/api/comptabilite/exercices", json=payload, headers=headers_a)
        resp_b = client.post("/api/comptabilite/exercices", json=payload, headers=headers_b)
        assert resp_a.status_code == 200, resp_a.text
        assert resp_b.status_code == 200, resp_b.text
        assert resp_a.json()["exercice_id"] != resp_b.json()["exercice_id"]

    def test_create_exercice_duplicate_meme_etablissement_refuse(self, client: TestClient, db: Session):
        etab = _creer_etablissement(db, "DUP")
        admin = _creer_admin(db, etab.etablissement_id)
        headers = _login_headers(client, admin.nom_utilisateur)
        # '2026' est déjà seedé automatiquement par init_comptabilite_tenant_defaults
        client.get("/api/comptabilite/exercices", headers=headers)
        resp = client.post(
            "/api/comptabilite/exercices",
            json={"annee": "2026", "date_debut": "2026-01-01", "date_fin": "2026-12-31"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_pin_independant_par_etablissement(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "PINA")
        etab_b = _creer_etablissement(db, "PINB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)

        # Aucune école ne reçoit plus de PIN d'usine : un même code semé
        # partout ne protégeait rien, puisqu'il était connu de quiconque avait
        # lu la source. Une école neuve n'a donc PAS de PIN…
        assert client.get("/api/comptabilite/pin/status", headers=headers_a).json()["configured"] is False
        assert client.get("/api/comptabilite/pin/status", headers=headers_b).json()["configured"] is False

        # …et le définit sans avoir à saisir un « PIN actuel » inexistant.
        # Auparavant impossible : la route répondait « PIN actuel incorrect »
        # quelle que soit la valeur envoyée.
        resp = client.put("/api/comptabilite/pin", json={"nouveau_pin": "999999"}, headers=headers_a)
        assert resp.status_code == 200, resp.text
        assert client.get("/api/comptabilite/pin/status", headers=headers_a).json()["configured"] is True

        # Le PIN de A ne s'applique pas à B : B n'en a toujours aucun.
        assert client.get("/api/comptabilite/pin/status", headers=headers_b).json()["configured"] is False
        resp_b_ok = client.put("/api/comptabilite/pin", json={"nouveau_pin": "111111"}, headers=headers_b)
        assert resp_b_ok.status_code == 200

        # Une fois configuré, l'ancien PIN redevient exigé — et celui de
        # l'autre école ne convient pas.
        resp_b_wrong = client.put(
            "/api/comptabilite/pin", json={"ancien_pin": "999999", "nouveau_pin": "222222"}, headers=headers_b
        )
        assert resp_b_wrong.status_code == 400, "Le PIN de A ne doit pas s'appliquer à B"

        # Et le PIN d'usine historique est explicitement refusé.
        resp_usine = client.put(
            "/api/comptabilite/pin", json={"ancien_pin": "111111", "nouveau_pin": "123000"}, headers=headers_b
        )
        assert resp_usine.status_code == 400


class TestBalanceEtGrandLivreCrossEcole:
    def test_balance_avec_exercice_id_dune_autre_ecole_refuse(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "BALA")
        etab_b = _creer_etablissement(db, "BALB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)

        exercices_b = client.get("/api/comptabilite/exercices", headers=headers_b).json()
        exercice_id_b = exercices_b[0]["exercice_id"]

        # École A tente de lire la balance de l'exercice de B en devinant son ID
        resp = client.get(f"/api/comptabilite/balance?exercice_id={exercice_id_b}", headers=headers_a)
        assert resp.status_code == 404, "Jamais 200 + données d'une autre école"


class TestFournisseursIsolesParEtablissement:
    def test_liste_fournisseurs_isolee(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "FOURA")
        etab_b = _creer_etablissement(db, "FOURB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)

        uid = _uid()
        client.post("/api/comptabilite/auxiliaire/fournisseurs", json={"nom": "Fournisseur A", "code": f"FA{uid}"}, headers=headers_a)
        resp_b = client.get("/api/comptabilite/auxiliaire/fournisseurs", headers=headers_b)
        assert resp_b.status_code == 200
        noms_b = {f["nom"] for f in resp_b.json()}
        assert "Fournisseur A" not in noms_b

    def test_creer_fournisseur_rattache_au_bon_etablissement(self, client: TestClient, db: Session):
        etab = _creer_etablissement(db, "FOURC")
        admin = _creer_admin(db, etab.etablissement_id)
        headers = _login_headers(client, admin.nom_utilisateur)
        uid = _uid()
        resp = client.post("/api/comptabilite/auxiliaire/fournisseurs", json={"nom": "F Test", "code": f"FC{uid}"}, headers=headers)
        assert resp.status_code == 200
        fournisseur_id = resp.json()["fournisseur_id"]
        f = db.query(Fournisseur).filter(Fournisseur.fournisseur_id == fournisseur_id).first()
        assert f.etablissement_id == etab.etablissement_id

    def test_historique_fournisseur_cross_ecole_404(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "HFA")
        etab_b = _creer_etablissement(db, "HFB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)

        uid = _uid()
        resp = client.post("/api/comptabilite/auxiliaire/fournisseurs", json={"nom": "F A", "code": f"HFA{uid}"}, headers=headers_a)
        fournisseur_id = resp.json()["fournisseur_id"]

        resp_cross = client.get(f"/api/comptabilite/auxiliaire/fournisseurs/{fournisseur_id}/compte", headers=headers_b)
        assert resp_cross.status_code == 404


class TestEcritureManuelleOwnership:
    def test_creer_ecriture_avec_fournisseur_autre_ecole_refuse(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "ECRA")
        etab_b = _creer_etablissement(db, "ECRB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)
        _journal_id, c1, c2 = _seed_referentiel_global(db)

        uid = _uid()
        resp = client.post("/api/comptabilite/auxiliaire/fournisseurs", json={"nom": "F B", "code": f"EB{uid}"}, headers=headers_b)
        fournisseur_b_id = resp.json()["fournisseur_id"]

        payload = {
            "date_ecriture": str(date.today()), "journal_id": _journal_id,
            "libelle": "Tentative cross-école",
            "lignes": [
                {"compte_id": c1, "debit": 1000, "credit": 0, "fournisseur_id": fournisseur_b_id},
                {"compte_id": c2, "debit": 0, "credit": 1000},
            ],
        }
        resp = client.post("/api/comptabilite/ecritures", json=payload, headers=headers_a)
        assert resp.status_code == 403

    def test_creer_ecriture_ok_reste_isolee(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "OKA")
        etab_b = _creer_etablissement(db, "OKB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        admin_b = _creer_admin(db, etab_b.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        headers_b = _login_headers(client, admin_b.nom_utilisateur)
        _journal_id, c1, c2 = _seed_referentiel_global(db)

        payload = {
            "date_ecriture": str(date.today()), "journal_id": _journal_id,
            "libelle": "Écriture école A",
            "lignes": [
                {"compte_id": c1, "debit": 500, "credit": 0},
                {"compte_id": c2, "debit": 0, "credit": 500},
            ],
        }
        resp = client.post("/api/comptabilite/ecritures", json=payload, headers=headers_a)
        assert resp.status_code == 200, resp.text

        ecritures_a = client.get("/api/comptabilite/ecritures", headers=headers_a).json()
        ecritures_b = client.get("/api/comptabilite/ecritures", headers=headers_b).json()
        assert any(e["libelle"] == "Écriture école A" for e in ecritures_a)
        assert not any(e["libelle"] == "Écriture école A" for e in ecritures_b)


class TestAuxiliaireParentsElevesIsole:
    def test_auxiliaire_parents_eleves_isole_par_etablissement(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "PEA")
        etab_b = _creer_etablissement(db, "PEB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)
        _journal_id, c1, c2 = _seed_referentiel_global(db)

        uid = _uid()
        eleve_a = Eleve(
            etablissement_id=etab_a.etablissement_id, matricule=f"PEA-{uid}",
            nom="Diallo", prenom="Fatou", date_naissance=date(2012, 1, 1), sexe="F", statut="ACTIF",
        )
        eleve_b = Eleve(
            etablissement_id=etab_b.etablissement_id, matricule=f"PEB-{uid}",
            nom="Bah", prenom="Ousmane", date_naissance=date(2012, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add_all([eleve_a, eleve_b])
        db.commit(); db.refresh(eleve_a); db.refresh(eleve_b)

        # Écriture pour l'élève de l'école A uniquement (créée directement en
        # base pour simuler ce que finance.py produirait via le pont automatique)
        exo_a = client.get("/api/comptabilite/exercices", headers=headers_a).json()[0]
        ecriture = EcritureComptable(
            etablissement_id=etab_a.etablissement_id, date_ecriture=date.today(),
            journal_id=_journal_id, libelle="Facturation élève A", exercice_id=exo_a["exercice_id"],
        )
        db.add(ecriture); db.flush()
        from app.models.academique import LigneEcriture
        db.add(LigneEcriture(ecriture_id=ecriture.ecriture_id, compte_id=c1, debit=100, credit=0, eleve_id=eleve_a.eleve_id))
        db.add(LigneEcriture(ecriture_id=ecriture.ecriture_id, compte_id=c2, debit=0, credit=100))
        db.commit()

        resp = client.get("/api/comptabilite/auxiliaire/parents-eleves", headers=headers_a)
        assert resp.status_code == 200
        matricules = {r["matricule"] for r in resp.json()}
        assert eleve_a.matricule in matricules
        assert eleve_b.matricule not in matricules

    def test_historique_parent_eleve_cross_ecole_404(self, client: TestClient, db: Session):
        etab_a = _creer_etablissement(db, "HPA")
        etab_b = _creer_etablissement(db, "HPB")
        admin_a = _creer_admin(db, etab_a.etablissement_id)
        headers_a = _login_headers(client, admin_a.nom_utilisateur)

        uid = _uid()
        eleve_b = Eleve(
            etablissement_id=etab_b.etablissement_id, matricule=f"HPB-{uid}",
            nom="Camara", prenom="Aissata", date_naissance=date(2011, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve_b); db.commit(); db.refresh(eleve_b)

        resp = client.get(f"/api/comptabilite/auxiliaire/parents-eleves/{eleve_b.eleve_id}/compte", headers=headers_a)
        assert resp.status_code == 404


class TestSuperAdminPlateformeRefuseSurComptabilite:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        admin = _creer_admin(db, None, role="SUPER_ADMIN")
        headers = _login_headers(client, admin.nom_utilisateur)
        resp = client.get("/api/comptabilite/exercices", headers=headers)
        assert resp.status_code == 403


class TestGenererEcritureAutoDirect:
    """Tests directs de la fonction utilisée par les 8 points d'intégration
    de finance.py (Lot 2) — garantit qu'elle ne casse jamais silencieusement
    en l'absence d'établissement, et qu'elle rattache correctement l'écriture."""

    def test_sans_etablissement_retourne_none_sans_crash(self, db: Session):
        resultat = generer_ecriture_auto(
            db, date_ecriture=date.today(), journal_code="OD",
            libelle="Test sans étab", reference=None,
            lignes=[{"compte": ("9999", "Compte inexistant", "CHARGE"), "debit": 10, "credit": 0}],
            etablissement_id=None,
        )
        assert resultat is None

    def test_avec_etablissement_cree_ecriture_scopee(self, db: Session):
        etab = _creer_etablissement(db, "GEA")
        # Journal créé explicitement (plutôt que de compter sur le seed
        # global 'OD' de init_comptabilite_globals, qui ne s'exécute que si
        # ss_journaux_comptables est ENTIÈREMENT vide — déjà pollué par
        # d'autres tests de ce fichier partageant la même base SQLite).
        uid = _uid()
        code_journal = f"GEA{uid}"
        db.add(JournalComptable(code=code_journal, nom="Journal GEA", type_journal="OD"))
        db.commit()

        ecriture_id = generer_ecriture_auto(
            db, date_ecriture=date.today(), journal_code=code_journal,
            libelle="Test avec étab", reference="REF-1",
            lignes=[
                {"compte": (f"6288-{uid}", "Autres charges diverses", "CHARGE"), "debit": 50, "credit": 0},
                {"compte": (f"5711-{uid}", "Caisse principale", "ACTIF"), "debit": 0, "credit": 50},
            ],
            etablissement_id=etab.etablissement_id,
        )
        db.commit()
        assert ecriture_id is not None
        ecriture = db.query(EcritureComptable).filter(EcritureComptable.ecriture_id == ecriture_id).first()
        assert ecriture.etablissement_id == etab.etablissement_id
