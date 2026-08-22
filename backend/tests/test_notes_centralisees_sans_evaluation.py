"""
Reproduit le cas signalé : dans la Centralisation des Notes, on sélectionne une
classe qui A des matières mais AUCUNE évaluation encore créée, et « rien ne sort »
côté écran. On vérifie ici que l'endpoint `notes-centralisees` renvoie bien 200
avec la classe et ses matières dans ce cas (le front bascule alors en vue détail
et peut proposer « Nouvelle composition / évaluation »).
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, ClasseMatiere, Cycle, Eleve, Etablissement,
    Inscription, Matiere, Niveau, Trimestre, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole_avec_classe_matieres(db: Session, nb_matieres: int, nb_eleves: int):
    uid = _uid()
    etab = Etablissement(code=f"NCS-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    trimestre = Trimestre(annee_id=annee.annee_id, code=f"T1-{uid}", libelle="1er Trimestre", numero=1,
                          date_debut=date(2026, 9, 1), date_fin=date(2026, 12, 20), statut="EN_COURS")
    db.add(trimestre); db.commit(); db.refresh(trimestre)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CLG{uid}", libelle="Collège", ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"10EME{uid}", libelle="10ème année", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"10A{uid}", libelle="10A", statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)

    for i in range(nb_matieres):
        mat = Matiere(cycle_id=cycle.cycle_id, code=f"M{uid}-{i}", libelle=f"Matière {i}", note_sur=20)
        db.add(mat); db.commit(); db.refresh(mat)
        db.add(ClasseMatiere(classe_id=classe.classe_id, matiere_id=mat.matiere_id,
                             coefficient=2, nb_heures_semaine=4, est_active="O"))
    db.commit()

    for i in range(nb_eleves):
        elv = Eleve(etablissement_id=etab.etablissement_id, matricule=f"ELV{uid}-{i}",
                    nom="Diallo", prenom=f"E{i}", date_naissance=date(2011, 1, 1), sexe="F", statut="ACTIF")
        db.add(elv); db.commit(); db.refresh(elv)
        db.add(Inscription(eleve_id=elv.eleve_id, classe_id=classe.classe_id,
                           annee_id=annee.annee_id, statut="ACTIVE"))
    db.commit()

    admin = Utilisateur(nom="Admin", prenom=f"NCS{uid}", nom_utilisateur=f"ncs.admin.{uid}",
                        email=f"ncs.admin.{uid}@smartschool.gn", telephone=f"96000{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, classe, trimestre, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def test_notes_centralisees_classe_avec_matieres_sans_evaluation(client: TestClient, db: Session):
    """Classe avec 12 matières, 2 élèves, 0 évaluation, aucun TypeEvaluation seedé
    pour l'école : l'endpoint doit renvoyer 200 (et non 500) avec les 12 matières."""
    etab, classe, trimestre, admin = _ecole_avec_classe_matieres(db, nb_matieres=12, nb_eleves=2)
    headers = _headers(client, admin.nom_utilisateur)

    resp = client.get(
        f"/api/evaluations/classe/{classe.classe_id}/notes-centralisees?trimestre_id={trimestre.trimestre_id}",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["matieres"]) == 12, "Les 12 matières de la classe doivent remonter"
    assert data["effectif"] == 2
    # 0 évaluation → moyennes nulles, mais la structure élève doit exister
    assert all(e["moyenne_generale"] is None for e in data["eleves"])
