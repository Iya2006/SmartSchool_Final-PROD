"""
Vente d'un tarif LIBRE (optionnel, prix non fixe) à un élève.

Un livre, un équipement… : le fondateur crée un type de frais « tarif libre »,
puis le vend au coup par coup à un élève au prix saisi sur le moment. L'argent
entre directement en caisse et alimente le total « autres entrées » du tableau
de bord, séparé de la scolarité.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, Paiement, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _ecole_avec_eleve(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"VL-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
        date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code="PRM", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="2ème année", ordre=2)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"C-{uid}", libelle="2eme annee", statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    eleve = Eleve(
        etablissement_id=etab.etablissement_id, matricule=f"ELV-{uid}", nom="Bah", prenom="Aïcha",
        sexe="F", date_naissance=date(2015, 5, 5), mot_de_passe=hash_password("x"), statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(
        eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id,
        statut="ACTIVE", type_inscription="NOUVELLE",
    )
    db.add(insc); db.commit()
    admin = Utilisateur(
        nom="Admin", prenom=f"V{uid}", nom_utilisateur=f"vl.admin.{uid}",
        email=f"vl.admin.{uid}@smartschool.gn", telephone=f"66610{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, eleve, admin


def test_vente_libre_encaisse_et_alimente_autres_entrees(client: TestClient, db: Session):
    etab, annee, eleve, admin = _ecole_avec_eleve(db)
    headers = _headers(client, admin.nom_utilisateur)

    # Type de frais LIBRE (prix non fixe).
    r = client.post("/api/finance/types-frais", headers=headers, json={
        "code": "LIVRE", "libelle": "Livre de lecture", "categorie": "Fournitures",
        "montant_defaut": 0, "est_obligatoire": "N", "frequence": "UNIQUE", "prix_libre": "O",
    })
    assert r.status_code == 201, r.text
    type_frais_id = r.json()["type_frais_id"]
    assert r.json()["prix_libre"] == "O"

    # Vente à l'élève, prix saisi sur le moment.
    r = client.post("/api/finance/vente-libre", headers=headers, json={
        "eleve_id": eleve.eleve_id, "type_frais_id": type_frais_id,
        "montant": 75000, "mode_paiement": "ESPECES",
    })
    assert r.status_code == 201, r.text
    assert r.json()["numero_recu"]

    # Une facture + un paiement créés, du bon montant.
    factures = db.query(Facture).filter(Facture.type_frais_id == type_frais_id).all()
    assert len(factures) == 1
    assert float(factures[0].montant_net) == 75000
    assert factures[0].statut == "PAYEE"
    paiement = db.query(Paiement).filter(Paiement.facture_id == factures[0].facture_id).first()
    assert paiement is not None and float(paiement.montant) == 75000

    # Le tableau de bord compte cette vente dans « autres entrées ».
    r = client.get(f"/api/finance/dashboard?annee_id={annee.annee_id}", headers=headers)
    assert r.status_code == 200, r.text
    assert float(r.json()["kpis"]["autres_entrees"]) == 75000


def test_vente_libre_refuse_un_type_non_libre(client: TestClient, db: Session):
    etab, annee, eleve, admin = _ecole_avec_eleve(db)
    headers = _headers(client, admin.nom_utilisateur)
    # Type de frais ordinaire (pas libre).
    r = client.post("/api/finance/types-frais", headers=headers, json={
        "code": "SCOL", "libelle": "Scolarité", "categorie": "Scolarité",
        "montant_defaut": 100000, "est_obligatoire": "O", "frequence": "ANNUEL",
    })
    assert r.status_code == 201, r.text
    r = client.post("/api/finance/vente-libre", headers=headers, json={
        "eleve_id": eleve.eleve_id, "type_frais_id": r.json()["type_frais_id"], "montant": 5000,
    })
    assert r.status_code == 400  # pas un tarif libre
