"""
Tests — La facturation ajoute UN frais d'entrée, jamais les deux.

Règle métier : le montant dû pour l'année = scolarité + inscription (nouvel
élève) OU + réinscription (élève qui continue), jamais les deux à la fois.
On envoie volontairement les trois frais au serveur : il ne doit garder que
celui qui correspond au type d'inscription.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Etablissement, Facture, Inscription,
    Niveau, TarifClasse, TypeFrais, Utilisateur,
)

SCOLARITE = 1_000_000
INSCRIPTION = 200_000
REINSCRIPTION = 100_000
_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"FIR-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CY{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NV{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CL{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    frais = {}
    for code, libelle, categorie, montant in [
        ("SCO", "Scolarité", "SCOLARITE", SCOLARITE),
        ("INS", "Inscription", "Inscription", INSCRIPTION),
        ("REI", "Réinscription", "Réinscription", REINSCRIPTION),
    ]:
        tf = TypeFrais(etablissement_id=eid, code=f"{code}{uid}", libelle=libelle,
                       categorie=categorie, montant_defaut=0, est_obligatoire="O", statut="ACTIF")
        db.add(tf); db.commit(); db.refresh(tf)
        db.add(TarifClasse(classe_id=classe.classe_id, type_frais_id=tf.type_frais_id, montant=montant))
        frais[code] = tf
    db.commit()

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return {"etab": etab, "annee": annee, "classe": classe, "frais": frais, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _inscrire(client, headers, ecole, type_inscription, nom):
    f = ecole["frais"]
    corps = {
        "nom": nom, "prenom": "Test", "date_naissance": "2012-05-14", "sexe": "F",
        "classe_id": ecole["classe"].classe_id,
        "type_inscription": type_inscription,
        # On envoie les TROIS frais : le serveur doit écarter le mauvais.
        "frais_scolaires": [
            {"type_frais_id": f["SCO"].type_frais_id, "montant": SCOLARITE},
            {"type_frais_id": f["INS"].type_frais_id, "montant": INSCRIPTION},
            {"type_frais_id": f["REI"].type_frais_id, "montant": REINSCRIPTION},
        ],
    }
    return client.post("/api/eleves/inscription-complete", headers=headers, json=corps)


def _montants(db: Session, eleve_id: int):
    factures = db.query(Facture).join(
        Inscription, Inscription.inscription_id == Facture.inscription_id
    ).filter(Inscription.eleve_id == eleve_id).all()
    return sorted(float(f.montant_net) for f in factures)


class TestUnSeulFraisDentree:

    def test_nouvel_eleve_paie_inscription_pas_reinscription(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _inscrire(client, h, ecole, "NOUVELLE", "Nouveau")
        assert r.status_code == 201, r.text
        montants = _montants(db, r.json()["eleve_id"])
        assert SCOLARITE in montants
        assert INSCRIPTION in montants
        assert REINSCRIPTION not in montants
        assert sum(montants) == SCOLARITE + INSCRIPTION

    def test_reinscription_paie_reinscription_pas_inscription(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _inscrire(client, h, ecole, "REINSCRIPTION", "Continue")
        assert r.status_code == 201, r.text
        montants = _montants(db, r.json()["eleve_id"])
        assert SCOLARITE in montants
        assert REINSCRIPTION in montants
        assert INSCRIPTION not in montants
        assert sum(montants) == SCOLARITE + REINSCRIPTION
