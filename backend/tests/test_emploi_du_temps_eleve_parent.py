"""
Vérification : un emploi du temps configuré (créneaux ACTIVE sur la classe)
est bien visible côté ÉLÈVE et côté PARENT — la même donnée que l'admin et
l'enseignant, via la classe de l'inscription active de l'élève.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, CreneauEmploi, Cycle, Eleve, EleveParent, Enseignant,
    Etablissement, Inscription, Matiere, Niveau, Parent,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"EDT-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
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
    matiere = Matiere(cycle_id=cycle.cycle_id, code=f"MAT{uid}", libelle="Mathématiques")
    db.add(matiere); db.commit(); db.refresh(matiere)
    ens = Enseignant(etablissement_id=etab.etablissement_id, matricule=f"EDTENS-{uid}", nom="Bah", prenom="Ousmane",
                     sexe="M", telephone=f"77020{uid:04d}", mot_de_passe=hash_password("x"), statut="ACTIF")
    db.add(ens); db.commit(); db.refresh(ens)

    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"EDTELV-{uid}", nom="Diallo", prenom="Awa",
                  date_naissance=date(2015, 1, 1), sexe="F", statut="ACTIF",
                  mot_de_passe=hash_password("motdepasse123"))
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE")
    db.add(insc); db.commit()
    parent = Parent(etablissement_id=etab.etablissement_id, nom="Diallo", prenom="Mariama",
                    telephone_1=f"79020{uid:04d}", mot_de_passe=hash_password("motdepasse123"), statut="ACTIF")
    db.add(parent); db.commit(); db.refresh(parent)
    db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="MERE"))

    # L'emploi du temps configuré : un créneau ACTIVE sur la classe.
    db.add(CreneauEmploi(classe_id=classe.classe_id, matiere_id=matiere.matiere_id, enseignant_id=ens.enseignant_id,
                         jour="LUNDI", heure_debut="08:00", heure_fin="09:00", salle="Salle 1",
                         annee_id=annee.annee_id, statut="ACTIVE"))
    db.commit()
    return etab, eleve, parent


def test_eleve_voit_emploi_du_temps(client: TestClient, db: Session):
    etab, eleve, parent = _setup(db)
    r = client.post("/api/portail-eleve/login", json={"matricule": eleve.matricule, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    edt = client.get(f"/api/portail-eleve/{eleve.eleve_id}/emploi-du-temps", headers=h)
    assert edt.status_code == 200, edt.text
    data = edt.json()
    assert len(data) == 1
    assert data[0]["jour"] == "LUNDI"
    assert data[0]["matiere"] == "Mathématiques"
    assert data[0]["salle"] == "Salle 1"


def test_parent_voit_emploi_du_temps_de_lenfant(client: TestClient, db: Session):
    etab, eleve, parent = _setup(db)
    r = client.post("/api/portail-parent/login", json={"telephone": parent.telephone_1, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    edt = client.get(f"/api/portail-parent/{parent.parent_id}/enfant/{eleve.eleve_id}/emploi-du-temps", headers=h)
    assert edt.status_code == 200, edt.text
    data = edt.json()
    assert len(data) == 1
    assert data[0]["jour"] == "LUNDI"
    assert data[0]["matiere"] == "Mathématiques"
