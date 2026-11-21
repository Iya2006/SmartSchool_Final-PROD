"""
Tests — encaisser toute une classe en une seule fois.

Deux besoins : voir ce que chaque élève a DÉJÀ payé avant de saisir quoi que
ce soit, et enregistrer plusieurs versements d'un coup.

Le point le plus important est l'atomicité. Si une ligne du lot échoue,
AUCUNE ne doit être enregistrée : un lot à moitié passé laisserait le caissier
sans savoir lesquels refaire, avec des reçus déjà numérotés qui rendent la
reprise hasardeuse.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, Paiement, TypeFrais, Utilisateur,
)

SCOLARITE = 300_000
CANTINE = 50_000
_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"GRP-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANG{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CYG{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVG{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLG{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    frais = {}
    for code, libelle, cat in [("SCO", "Scolarité", "SCOLARITE"), ("CAN", "Cantine", "CANTINE")]:
        tf = TypeFrais(
            etablissement_id=eid, code=f"{code}{uid}", libelle=libelle, categorie=cat,
            montant_defaut=0, est_obligatoire="O", statut="ACTIF",
        )
        db.add(tf); db.commit(); db.refresh(tf)
        frais[code] = tf

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.grp.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    return {"eid": eid, "annee": annee, "classe": classe, "frais": frais, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _eleve_avec_frais(db, ecole, nom, montants):
    """Un élève inscrit, avec une facture par frais demandé."""
    uid = _uid()
    el = Eleve(
        etablissement_id=ecole["eid"], matricule=f"GRP-{uid}", nom=nom, prenom="Test",
        sexe="M", statut="ACTIF",
    )
    db.add(el); db.commit(); db.refresh(el)
    insc = Inscription(
        eleve_id=el.eleve_id, classe_id=ecole["classe"].classe_id,
        annee_id=ecole["annee"].annee_id, statut="ACTIVE", type_inscription="NOUVELLE",
    )
    db.add(insc); db.commit(); db.refresh(insc)

    factures = {}
    for code, montant in montants.items():
        f = Facture(
            inscription_id=insc.inscription_id, annee_id=ecole["annee"].annee_id,
            type_frais_id=ecole["frais"][code].type_frais_id,
            numero_facture=f"FAC-GRP-{uid}-{code}",
            montant_total=montant, montant_net=montant, montant_paye=0,
            montant_restant=montant, statut="EN_ATTENTE",
        )
        db.add(f); db.commit(); db.refresh(f)
        factures[code] = f
    return el, factures


class TestSituationAvantEncaissement:

    def test_montre_ce_qui_est_deja_paye(self, client, db, ecole):
        """
        Sans cette vue, rien n'empêchait d'encaisser une seconde fois un frais
        déjà réglé — l'erreur se découvrait quand un parent présentait son reçu.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, factures = _eleve_avec_frais(db, ecole, "Barry", {"SCO": SCOLARITE, "CAN": CANTINE})

        client.post("/api/finance/paiements", headers=h, json={
            "facture_id": factures["SCO"].facture_id, "montant": SCOLARITE,
            "mode_paiement": "ESPECES",
        })

        r = client.get(
            f"/api/finance/classe/{ecole['classe'].classe_id}/situation-encaissement", headers=h)
        assert r.status_code == 200, r.text
        eleve = next(e for e in r.json()["eleves"] if e["nom_complet"].endswith("Barry"))

        scolarite = next(f for f in eleve["frais"] if f["tarif"] == "Scolarité")
        cantine = next(f for f in eleve["frais"] if f["tarif"] == "Cantine")
        assert scolarite["deja_paye"] == SCOLARITE and scolarite["reste"] == 0
        assert cantine["deja_paye"] == 0 and cantine["reste"] == CANTINE
        assert eleve["reste"] == CANTINE

    def test_un_eleve_entierement_a_jour_est_signale(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, factures = _eleve_avec_frais(db, ecole, "Solde", {"SCO": SCOLARITE})
        client.post("/api/finance/paiements", headers=h, json={
            "facture_id": factures["SCO"].facture_id, "montant": SCOLARITE,
            "mode_paiement": "ESPECES",
        })

        r = client.get(
            f"/api/finance/classe/{ecole['classe'].classe_id}/situation-encaissement", headers=h)
        eleve = next(e for e in r.json()["eleves"] if e["nom_complet"].endswith("Solde"))
        assert eleve["solde"] == "SOLDE"
        assert eleve["reste"] == 0

    def test_une_classe_d_une_autre_ecole_est_introuvable(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        assert client.get(
            "/api/finance/classe/999999/situation-encaissement", headers=h).status_code == 404


class TestEncaissementGroupe:

    def test_encaisse_plusieurs_eleves_en_une_fois(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f1 = _eleve_avec_frais(db, ecole, "Un", {"SCO": SCOLARITE})
        _, f2 = _eleve_avec_frais(db, ecole, "Deux", {"SCO": SCOLARITE})

        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [
                {"facture_id": f1["SCO"].facture_id, "montant": 100_000},
                {"facture_id": f2["SCO"].facture_id, "montant": SCOLARITE},
            ],
        })
        assert r.status_code == 201, r.text
        corps = r.json()
        assert corps["total"] == 400_000
        # Chaque ligne a SON reçu : un reçu appartient à une famille.
        numeros = {p["numero_recu"] for p in corps["paiements"]}
        assert len(numeros) == 2

        db.refresh(f1["SCO"]); db.refresh(f2["SCO"])
        assert float(f1["SCO"].montant_paye) == 100_000
        assert f1["SCO"].statut == "PARTIELLEMENT_PAYEE"
        assert f2["SCO"].statut == "PAYEE"

    def test_on_peut_sauter_un_tarif(self, client, db, ecole):
        """Le caissier n'encaisse que ce que la famille règle aujourd'hui."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_avec_frais(db, ecole, "Partiel", {"SCO": SCOLARITE, "CAN": CANTINE})

        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [{"facture_id": f["SCO"].facture_id, "montant": SCOLARITE}],
        })
        assert r.status_code == 201

        db.refresh(f["CAN"])
        assert float(f["CAN"].montant_paye) == 0, "la cantine ne devait pas être encaissée"

    def test_rien_n_est_enregistre_si_une_ligne_echoue(self, client, db, ecole):
        """
        Tout ou rien. Un lot à moitié passé laisserait le caissier sans savoir
        lesquels refaire, avec des reçus déjà numérotés.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f1 = _eleve_avec_frais(db, ecole, "Valide", {"SCO": SCOLARITE})

        avant = db.query(Paiement).count()
        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [
                {"facture_id": f1["SCO"].facture_id, "montant": SCOLARITE},
                {"facture_id": 999999, "montant": 1000},   # n'existe pas
            ],
        })
        assert r.status_code == 404

        db.rollback()
        assert db.query(Paiement).count() == avant, "aucun versement ne devait survivre"
        db.refresh(f1["SCO"])
        assert float(f1["SCO"].montant_paye) == 0

    def test_une_facture_citee_deux_fois_est_refusee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_avec_frais(db, ecole, "Double", {"SCO": SCOLARITE})

        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [
                {"facture_id": f["SCO"].facture_id, "montant": 1000},
                {"facture_id": f["SCO"].facture_id, "montant": 2000},
            ],
        })
        assert r.status_code == 400
        assert "plusieurs fois" in r.json()["detail"]

    def test_un_lot_vide_est_refuse(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = client.post("/api/finance/encaissements-groupes", headers=h,
                        json={"mode_paiement": "ESPECES", "lignes": []})
        assert r.status_code == 400

    def test_une_facture_d_une_autre_ecole_est_refusee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [{"facture_id": 999999, "montant": 1000}],
        })
        assert r.status_code == 404

    def test_le_montant_doit_etre_positif(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_avec_frais(db, ecole, "Zero", {"SCO": SCOLARITE})
        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [{"facture_id": f["SCO"].facture_id, "montant": 0}],
        })
        assert r.status_code == 400

    def test_le_groupe_suit_la_meme_regle_que_l_unitaire_sur_le_trop_percu(self, client, db, ecole):
        """
        Les deux chemins passent par la même fonction : encaisser au-dessus du
        dû est accepté ici comme à l'unité, et le reste à payer reste borné à 0.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_avec_frais(db, ecole, "Avance", {"SCO": SCOLARITE})

        r = client.post("/api/finance/encaissements-groupes", headers=h, json={
            "mode_paiement": "ESPECES",
            "lignes": [{"facture_id": f["SCO"].facture_id, "montant": SCOLARITE + 20_000}],
        })
        assert r.status_code == 201, r.text

        db.refresh(f["SCO"])
        assert float(f["SCO"].montant_paye) == SCOLARITE + 20_000
        assert float(f["SCO"].montant_restant) == 0
