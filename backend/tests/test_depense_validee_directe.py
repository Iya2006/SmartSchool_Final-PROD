"""
Dépense : approuvée directement (statut VALIDE) + jamais supérieure au solde.

- Une dépense créée par le comptable est immédiatement VALIDE (plus d'étape
  d'approbation) et donc déduite du solde réel.
- Le montant ne peut jamais dépasser le solde disponible en caisse (refus 400).
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Depense, Eleve, Etablissement, Facture,
    Inscription, Niveau, Paiement, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole_avec_solde(db: Session, solde: float):
    """École + une année en cours + un encaissement VALIDE de `solde` GNF."""
    uid = _uid()
    etab = Etablissement(code=f"DEP-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CY{uid}", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NV{uid}", libelle="CP", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"CL{uid}", libelle=f"CP {uid}")
    db.add(classe); db.commit(); db.refresh(classe)
    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"DEPELV-{uid}",
                  nom="Diallo", prenom="Awa", sexe="F", statut="ACTIF")
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
                       annee_id=annee.annee_id, statut="ACTIVE")
    db.add(insc); db.commit(); db.refresh(insc)
    fact = Facture(inscription_id=insc.inscription_id, annee_id=annee.annee_id,
                   numero_facture=f"F-{uid}", montant_total=solde, montant_net=solde,
                   montant_paye=solde, montant_restant=0, statut="PAYEE")
    db.add(fact); db.commit(); db.refresh(fact)
    pay = Paiement(facture_id=fact.facture_id, annee_id=annee.annee_id, numero_recu=f"R-{uid}",
                   date_paiement=date(2026, 10, 1), montant=solde, mode_paiement="ESPECES", statut="VALIDE")
    db.add(pay); db.commit()
    admin = Utilisateur(nom="Admin", prenom=f"D{uid}", nom_utilisateur=f"dep.admin.{uid}",
                        email=f"dep.admin.{uid}@smartschool.gn", telephone=f"66695{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, admin


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_depense_creee_est_validee_directement(client: TestClient, db: Session):
    etab, annee, admin = _ecole_avec_solde(db, 1_000_000)
    h = _headers(client, admin.nom_utilisateur)
    r = client.post("/api/finance/depenses", json={
        "etablissement_id": etab.etablissement_id, "annee_id": annee.annee_id,
        "categorie": "FONCTIONNEMENT", "libelle": "Fournitures bureau", "montant": 300_000,
    }, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["statut"] == "VALIDE"
    # Déduite du solde réel : la ligne existe bien en VALIDE.
    dep = db.query(Depense).filter(Depense.depense_id == r.json()["depense_id"]).first()
    assert dep.statut == "VALIDE"


def test_depense_superieure_au_solde_refusee(client: TestClient, db: Session):
    etab, annee, admin = _ecole_avec_solde(db, 500_000)
    h = _headers(client, admin.nom_utilisateur)
    r = client.post("/api/finance/depenses", json={
        "etablissement_id": etab.etablissement_id, "annee_id": annee.annee_id,
        "categorie": "FONCTIONNEMENT", "libelle": "Trop cher", "montant": 500_001,
    }, headers=h)
    assert r.status_code == 400
    assert "insuffisant" in r.json()["detail"].lower()
