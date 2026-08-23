"""
Incidents de discipline : la création exige un élève (message clair, pas de 500),
et la liste renvoie le nom de l'élève + sa classe pour la vue admin.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"INC-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="6e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"6A{uid}", libelle="6A", statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)
    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"INCELV{uid}", nom="Diallo", prenom="Awa",
                  date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF")
    db.add(eleve); db.commit(); db.refresh(eleve)
    db.add(Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE"))
    db.commit()
    admin = Utilisateur(nom="Admin", prenom=f"INC{uid}", nom_utilisateur=f"inc.admin.{uid}",
                        email=f"inc.admin.{uid}@smartschool.gn", telephone=f"95500{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, eleve, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_incident_sans_eleve_refuse_proprement(client: TestClient, db: Session):
    etab, eleve, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)
    r = client.post("/api/vie-scolaire/incidents", headers=headers, json={
        "eleve_id": 0, "etablissement_id": etab.etablissement_id,
        "type_incident": "DISCIPLINE", "gravite": "MOYENNE",
        "description": "Bagarre en récréation", "signale_par": "Surveillant",
    })
    assert r.status_code == 400, r.text  # message clair, pas un 500


def test_liste_incidents_enrichie_nom_et_classe(client: TestClient, db: Session):
    etab, eleve, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)
    c = client.post("/api/vie-scolaire/incidents", headers=headers, json={
        "eleve_id": eleve.eleve_id, "etablissement_id": etab.etablissement_id,
        "type_incident": "DISCIPLINE", "gravite": "GRAVE",
        "description": "Insolence répétée", "signale_par": "Surveillant",
    })
    assert c.status_code == 201, c.text

    r = client.get("/api/vie-scolaire/incidents", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 1
    assert items[0]["eleve_nom"] == "Awa Diallo"
    assert items[0]["classe"] == "6A"
    assert items[0]["statut"] == "SIGNALE"
