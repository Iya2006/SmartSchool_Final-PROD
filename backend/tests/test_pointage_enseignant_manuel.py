"""
Pointage des enseignants côté surveillant :
- saisie MANUELLE d'un pointage (sans scan) ;
- SUPPRESSION d'un pointage ;
- le SCAN renvoie les infos de la journée (cours du jour) de l'enseignant.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, CreneauEmploi, Cycle, Enseignant, Etablissement,
    Matiere, Niveau, PresenceAgent, Utilisateur,
)

_C = 0
_JOURS = {0: "LUNDI", 1: "MARDI", 2: "MERCREDI", 3: "JEUDI", 4: "VENDREDI", 5: "SAMEDI", 6: "DIMANCHE"}


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"PEM-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="6e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"CL{uid}", libelle="6A", statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)
    matiere = Matiere(cycle_id=cycle.cycle_id, code=f"M{uid}", libelle="Maths", note_sur=20)
    db.add(matiere); db.commit(); db.refresh(matiere)
    ens = Enseignant(etablissement_id=etab.etablissement_id, matricule=f"PEMENS{uid}", nom="Bah", prenom="O",
                     sexe="M", telephone=f"91100{uid:04d}", mot_de_passe=hash_password("x"), statut="ACTIF")
    db.add(ens); db.commit(); db.refresh(ens)
    # Un cours AUJOURD'HUI pour cet enseignant → doit sortir au scan.
    jour = _JOURS[date.today().weekday()]
    db.add(CreneauEmploi(classe_id=classe.classe_id, matiere_id=matiere.matiere_id, enseignant_id=ens.enseignant_id,
                         jour=jour, heure_debut="08:00", heure_fin="09:00", salle="Salle 1",
                         annee_id=annee.annee_id, statut="ACTIVE"))
    db.commit()
    admin = Utilisateur(nom="Surv", prenom=f"PEM{uid}", nom_utilisateur=f"pem.surv.{uid}",
                        email=f"pem.surv.{uid}@smartschool.gn", telephone=f"92100{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, ens, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_pointage_manuel_puis_suppression(client: TestClient, db: Session):
    etab, ens, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)

    # Saisie manuelle (sans scan)
    r = client.post("/api/presences-agents/manuel", headers=headers, json={
        "type_agent": "ENSEIGNANT", "agent_id": ens.enseignant_id,
        "date_presence": "2026-10-01", "heure_arrivee": "08:05",
    })
    assert r.status_code == 200, r.text
    assert r.json()["action"] == "CREE"
    presence_id = r.json()["presence_id"]
    assert db.query(PresenceAgent).filter(PresenceAgent.presence_id == presence_id).count() == 1

    # Ré-saisir met à jour (pas de doublon)
    r2 = client.post("/api/presences-agents/manuel", headers=headers, json={
        "type_agent": "ENSEIGNANT", "agent_id": ens.enseignant_id,
        "date_presence": "2026-10-01", "heure_depart": "16:00",
    })
    assert r2.status_code == 200 and r2.json()["action"] == "MODIFIE"

    # Suppression
    d = client.delete(f"/api/presences-agents/{presence_id}", headers=headers)
    assert d.status_code == 200, d.text
    assert db.query(PresenceAgent).filter(PresenceAgent.presence_id == presence_id).count() == 0


def test_scan_renvoie_les_cours_du_jour(client: TestClient, db: Session):
    etab, ens, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)
    r = client.post("/api/presences-agents/scan", headers=headers, json={
        "qr_data": ens.matricule, "action_type": "ARRIVEE",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["journee"] is not None, "Le scan doit renvoyer les infos de la journée"
    assert len(data["journee"]["cours"]) == 1
    assert data["journee"]["cours"][0]["matiere"] == "Maths"
    assert data["journee"]["arrivee"] is not None
