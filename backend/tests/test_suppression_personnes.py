"""
Tests — supprimer une personne doit marcher, même chargée d'historique.

`db.delete(personne)` seul se heurtait aux clés étrangères : un élève avec des
inscriptions, des factures ou des notes refusait de partir, et l'école voyait
une erreur technique. Ces tests créent exactement ce cas et vérifient que la
suppression aboutit.

Ils vérifient aussi ce qui doit SURVIVRE : une écriture comptable n'est jamais
effacée, seulement détachée — sinon le journal perd une ligne et ne s'équilibre
plus, ce qui fausse définitivement les comptes de l'école.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Etablissement, Facture,
    Inscription, Niveau, Parent, TypeFrais, Utilisateur,
)

_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"SUP-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANS{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CYS{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVS{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLS{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.sup.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return {"etab": etab, "eid": eid, "annee": annee, "classe": classe, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _eleve_charge(db: Session, ecole) -> Eleve:
    """Un élève avec inscription, facture et parent — le cas qui bloquait."""
    uid = _uid()
    eleve = Eleve(
        etablissement_id=ecole["eid"], matricule=f"SUP-{uid}", nom="Diallo", prenom="Awa",
        sexe="F", statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)

    insc = Inscription(
        eleve_id=eleve.eleve_id, classe_id=ecole["classe"].classe_id,
        annee_id=ecole["annee"].annee_id, statut="ACTIVE", type_inscription="NOUVELLE",
    )
    db.add(insc); db.commit(); db.refresh(insc)

    tf = TypeFrais(
        etablissement_id=ecole["eid"], code=f"SC{uid}", libelle="Scolarité",
        categorie="SCOLARITE", montant_defaut=0, est_obligatoire="O", statut="ACTIF",
    )
    db.add(tf); db.commit(); db.refresh(tf)
    db.add(Facture(
        inscription_id=insc.inscription_id, annee_id=ecole["annee"].annee_id,
        type_frais_id=tf.type_frais_id, numero_facture=f"FAC-SUP-{uid}",
        montant_total=100, montant_net=100, montant_paye=0, montant_restant=100,
        statut="EN_ATTENTE",
    ))

    parent = Parent(
        etablissement_id=ecole["eid"], nom="Diallo", prenom="Mamadou",
        telephone_1=f"6{uid:08d}",
    )
    db.add(parent); db.commit(); db.refresh(parent)
    db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="PERE"))
    db.commit()
    return eleve, parent


class TestSupprimerUnEleve:

    def test_un_eleve_charge_d_historique_se_supprime(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve, _ = _eleve_charge(db, ecole)

        r = client.delete(f"/api/eleves/{eleve.eleve_id}", headers=h)
        assert r.status_code == 200, r.text
        assert db.query(Eleve).filter(Eleve.eleve_id == eleve.eleve_id).first() is None

    def test_tout_ce_qui_dependait_de_lui_part_avec(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve, _ = _eleve_charge(db, ecole)
        eleve_id = eleve.eleve_id

        assert client.delete(f"/api/eleves/{eleve_id}", headers=h).status_code == 200

        restes = db.execute(text(
            "SELECT COUNT(*) FROM ss_inscriptions WHERE eleve_id = :i"), {"i": eleve_id}).scalar()
        assert restes == 0, "les inscriptions doivent partir avec l'élève"
        liens = db.execute(text(
            "SELECT COUNT(*) FROM ss_eleve_parent WHERE eleve_id = :i"), {"i": eleve_id}).scalar()
        assert liens == 0

    def test_l_ecriture_comptable_survit_detachee(self, client, db, ecole):
        """
        Effacer une ligne d'écriture déséquilibrerait le journal : l'argent a
        été encaissé, il doit rester dans les livres. Seul le lien vers l'élève
        disparaît.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve, _ = _eleve_charge(db, ecole)
        eleve_id = eleve.eleve_id

        # Un vrai encaissement : c'est lui qui produit l'écriture comptable,
        # par le chemin réel plutôt qu'une ligne posée à la main.
        facture = db.query(Facture).join(
            Inscription, Inscription.inscription_id == Facture.inscription_id
        ).filter(Inscription.eleve_id == eleve_id).first()
        paiement = client.post("/api/finance/paiements", headers=h, json={
            "facture_id": facture.facture_id, "montant": 100, "mode_paiement": "ESPECES",
        })
        assert paiement.status_code == 201, paiement.text

        avant = db.execute(text(
            "SELECT COUNT(*) FROM ss_lignes_ecritures WHERE eleve_id = :i"), {"i": eleve_id}).scalar()
        assert avant > 0, "l'encaissement doit avoir produit une écriture"
        total_avant = db.execute(text("SELECT COUNT(*) FROM ss_lignes_ecritures")).scalar()

        assert client.delete(f"/api/eleves/{eleve_id}", headers=h).status_code == 200

        total_apres = db.execute(text("SELECT COUNT(*) FROM ss_lignes_ecritures")).scalar()
        assert total_apres == total_avant, "aucune ligne comptable ne doit être effacée"
        orphelines = db.execute(text(
            "SELECT COUNT(*) FROM ss_lignes_ecritures WHERE eleve_id = :i"), {"i": eleve_id}).scalar()
        assert orphelines == 0, "elles doivent en revanche être détachées de l'élève"

    def test_un_eleve_d_une_autre_ecole_reste_introuvable(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        autre = Etablissement(code=f"AUT-{_uid()}", nom="Autre", type_etablissement="COLLEGE")
        db.add(autre); db.commit(); db.refresh(autre)
        etranger = Eleve(
            etablissement_id=autre.etablissement_id, matricule=f"ETR-{_uid()}",
            nom="X", prenom="Y", sexe="M", statut="ACTIF",
        )
        db.add(etranger); db.commit(); db.refresh(etranger)

        r = client.delete(f"/api/eleves/{etranger.eleve_id}", headers=h)
        assert r.status_code == 404
        assert db.query(Eleve).filter(Eleve.eleve_id == etranger.eleve_id).first() is not None


class TestSupprimerUnParent:

    def test_la_fiche_parent_se_supprime_avec_ses_rattachements(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve, parent = _eleve_charge(db, ecole)
        parent_id = parent.parent_id

        r = client.delete(f"/api/eleves/parents/{parent_id}", headers=h)
        assert r.status_code == 200, r.text
        assert db.query(Parent).filter(Parent.parent_id == parent_id).first() is None
        liens = db.execute(text(
            "SELECT COUNT(*) FROM ss_eleve_parent WHERE parent_id = :i"), {"i": parent_id}).scalar()
        assert liens == 0

    def test_l_eleve_reste_apres_suppression_du_parent(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve, parent = _eleve_charge(db, ecole)
        eleve_id = eleve.eleve_id

        assert client.delete(f"/api/eleves/parents/{parent.parent_id}", headers=h).status_code == 200
        assert db.query(Eleve).filter(Eleve.eleve_id == eleve_id).first() is not None
