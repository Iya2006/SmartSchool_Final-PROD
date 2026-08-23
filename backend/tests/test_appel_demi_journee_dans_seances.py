"""
Les appels de la DEMI-JOURNÉE (primaire, Presence.seance_id = NULL) doivent
apparaître dans la vue « Séances (Appels) » (/api/seances), avec leur détail et
la possibilité de les supprimer — comme les séances par matière du secondaire.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau,
    Presence, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"ADJ-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"PRM{uid}", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"1A{uid}", libelle="1ère année", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"1A{uid}", libelle="1A", statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)
    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"ADJELV{uid}", nom="Diallo", prenom="Awa",
                  date_naissance=date(2018, 1, 1), sexe="F", statut="ACTIF")
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE")
    db.add(insc); db.commit(); db.refresh(insc)
    # Appel de la demi-journée : une présence SANS séance.
    db.add(Presence(inscription_id=insc.inscription_id, date_presence=date(2026, 10, 1),
                    demi_journee="MATIN", statut_presence="PRESENT", seance_id=None))
    db.commit()
    admin = Utilisateur(nom="Admin", prenom=f"ADJ{uid}", nom_utilisateur=f"adj.admin.{uid}",
                        email=f"adj.admin.{uid}@smartschool.gn", telephone=f"96600{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, classe, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_appel_demi_journee_visible_detail_et_suppression(client: TestClient, db: Session):
    etab, classe, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)

    # 1) Il apparaît dans la liste des séances (date exacte)
    r = client.get("/api/seances?date=2026-10-01&ouvrir_la_journee=false", headers=headers)
    assert r.status_code == 200, r.text
    dj = [s for s in r.json() if s.get("est_demi_journee")]
    assert len(dj) == 1, "L'appel demi-journée doit apparaître dans la vue Séances"
    entry = dj[0]
    assert entry["classe"] == "1A"
    assert entry["nb_presents"] == 1
    assert entry["appel_fait"] is True

    # 2) Son détail nominatif
    d = client.get(f"/api/seances/journee/detail?classe_id={classe.classe_id}&date=2026-10-01&demi_journee=MATIN", headers=headers)
    assert d.status_code == 200, d.text
    assert len(d.json()["eleves"]) == 1
    assert d.json()["eleves"][0]["statut"] == "PRESENT"

    # 3) Suppression de l'appel
    x = client.delete(f"/api/seances/journee/vider?classe_id={classe.classe_id}&date=2026-10-01&demi_journee=MATIN", headers=headers)
    assert x.status_code == 200, x.text
    assert x.json()["presences_supprimees"] == 1
    assert db.query(Presence).filter(Presence.inscription_id.isnot(None), Presence.date_presence == date(2026, 10, 1)).count() == 0
