"""
Années scolaires : anti-doublon à la création, et suppression d'une année vide.

Défauts corrigés :
- Chaque clic sur « Nouvelle année » recréait une année de même code/libellé —
  d'où plusieurs « 2026-2027 » identiques, rendant la bascule d'année ambiguë.
- Aucune route pour supprimer un doublon : il restait à vie.

La suppression refuse l'année courante et toute année portant de la vraie
histoire (élèves, factures, dépenses) ; une année vide part avec ses trimestres.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau, Trimestre, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session):
        uid = _uid()
        self.etab = Etablissement(code=f"AN-{uid}", nom=f"École {uid}", type_etablissement="COMPLEXE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"{uid}-2025", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"A{uid}", nom_utilisateur=f"an.admin.{uid}",
            email=f"an.admin.{uid}@smartschool.gn", telephone=f"64400{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def annee_planifiee(self, db: Session) -> AnneeScolaire:
        uid = _uid()
        a = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"{uid}-2026", libelle=f"2026-2027 {uid}",
            date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="PLANIFIEE", est_courante="N",
        )
        db.add(a); db.commit(); db.refresh(a)
        return a


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _corps_annee(etab_id: int) -> dict:
    uid = _uid()
    return {
        "etablissement_id": etab_id, "code": f"{uid}-2027", "libelle": f"2027-2028 {uid}",
        "date_debut": "2027-09-01", "date_fin": "2028-07-01",
    }


def test_creation_doublon_refusee(client: TestClient, db: Session):
    e = Ecole(db)
    headers = _headers(client, e.admin.nom_utilisateur)
    corps = _corps_annee(e.etab.etablissement_id)

    r1 = client.post("/api/parametrage/annees", json=corps, headers=headers)
    assert r1.status_code == 201, r1.text
    # Même code/libellé → refusé.
    r2 = client.post("/api/parametrage/annees", json=corps, headers=headers)
    assert r2.status_code == 409, r2.text
    assert db.query(AnneeScolaire).filter(AnneeScolaire.code == corps["code"]).count() == 1


def test_suppression_annee_courante_refusee(client: TestClient, db: Session):
    e = Ecole(db)
    headers = _headers(client, e.admin.nom_utilisateur)
    r = client.delete(f"/api/parametrage/annees/{e.annee.annee_id}", headers=headers)
    assert r.status_code == 409, r.text
    assert db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == e.annee.annee_id).first() is not None


def test_suppression_annee_vide_ok(client: TestClient, db: Session):
    e = Ecole(db)
    doublon = e.annee_planifiee(db)
    # Un trimestre auto rattaché : doit partir avec l'année.
    db.add(Trimestre(
        annee_id=doublon.annee_id, code=f"T{_uid()}", libelle="Trimestre 1", numero=1,
        date_debut=date(2026, 9, 1), date_fin=date(2026, 12, 20), statut="PLANIFIEE",
    ))
    db.commit()
    headers = _headers(client, e.admin.nom_utilisateur)

    r = client.delete(f"/api/parametrage/annees/{doublon.annee_id}", headers=headers)
    assert r.status_code == 200, r.text
    assert db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == doublon.annee_id).first() is None
    assert db.query(Trimestre).filter(Trimestre.annee_id == doublon.annee_id).count() == 0


def test_suppression_annee_avec_inscriptions_refusee(client: TestClient, db: Session):
    e = Ecole(db)
    annee2 = e.annee_planifiee(db)
    uid = _uid()
    cycle = Cycle(etablissement_id=e.etab.etablissement_id, code=f"CY{uid}", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NV{uid}", libelle="2e", ordre=2)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=e.etab.etablissement_id, annee_id=annee2.annee_id,
        niveau_id=niveau.niveau_id, code=f"CL{uid}", libelle="2e A", statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    eleve = Eleve(
        etablissement_id=e.etab.etablissement_id, matricule=f"ANELV-{uid}",
        nom="Sylla", prenom="Test", date_naissance=date(2013, 1, 1), sexe="M", statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    db.add(Inscription(
        eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee2.annee_id, statut="ACTIVE",
    ))
    db.commit()
    headers = _headers(client, e.admin.nom_utilisateur)

    r = client.delete(f"/api/parametrage/annees/{annee2.annee_id}", headers=headers)
    assert r.status_code == 409, r.text
    assert "inscription" in r.json()["detail"].lower()
    assert db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee2.annee_id).first() is not None
