"""
Suppression d'une épreuve CENTRALISÉE : autrefois refusée (400), elle est
désormais autorisée. Les notes sont effacées et les moyennes de la période
sont recalculées automatiquement — plus de moyenne « fantôme » sur le bulletin.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Bulletin, Classe, ClasseMatiere, Cycle, Eleve, Enseignant,
    Etablissement, Evaluation, Inscription, Matiere, Niveau, Note, Trimestre,
    TypeEvaluation, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"SEC-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    trimestre = Trimestre(annee_id=annee.annee_id, code=f"T1-{uid}", libelle="1er Trimestre", numero=1,
                          date_debut=date(2026, 9, 1), date_fin=date(2026, 12, 20), statut="EN_COURS")
    db.add(trimestre); db.commit(); db.refresh(trimestre)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CLG{uid}", libelle="Collège", ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="10ème année", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"10A{uid}", libelle="10A", statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)
    matiere = Matiere(cycle_id=cycle.cycle_id, code=f"M{uid}", libelle="Maths", note_sur=20)
    db.add(matiere); db.commit(); db.refresh(matiere)
    db.add(ClasseMatiere(classe_id=classe.classe_id, matiere_id=matiere.matiere_id,
                         coefficient=2, nb_heures_semaine=4, est_active="O"))
    db.commit()
    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"ELV{uid}", nom="Diallo", prenom="Awa",
                  date_naissance=date(2011, 1, 1), sexe="F", statut="ACTIF")
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE")
    db.add(insc); db.commit(); db.refresh(insc)
    ens = Enseignant(etablissement_id=etab.etablissement_id, matricule=f"SECENS{uid}", nom="Bah", prenom="Ousmane",
                     sexe="M", telephone=f"98100{uid:04d}", mot_de_passe=hash_password("x"), statut="ACTIF")
    db.add(ens); db.commit(); db.refresh(ens)
    te = TypeEvaluation(etablissement_id=etab.etablissement_id, code="COMPO", libelle="Composition",
                        coefficient=2, statut="ACTIF")
    db.add(te); db.commit(); db.refresh(te)
    ev = Evaluation(matiere_id=matiere.matiere_id, classe_id=classe.classe_id, trimestre_id=trimestre.trimestre_id,
                    type_eval_id=te.type_eval_id, enseignant_id=ens.enseignant_id, libelle="Compo T1",
                    date_evaluation=date(2026, 10, 1), note_sur=20, coefficient=2, statut="CENTRALISEE")
    db.add(ev); db.commit(); db.refresh(ev)
    db.add(Note(evaluation_id=ev.evaluation_id, inscription_id=insc.inscription_id, valeur=15, est_absent="N"))
    db.commit()
    admin = Utilisateur(nom="Admin", prenom=f"SEC{uid}", nom_utilisateur=f"sec.admin.{uid}",
                        email=f"sec.admin.{uid}@smartschool.gn", telephone=f"97100{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return classe, trimestre, ev, insc, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_supprimer_evaluation_centralisee_efface_notes_et_recalcule(client: TestClient, db: Session):
    classe, trimestre, ev, insc, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)

    # Calcul officiel des moyennes → un bulletin avec moyenne 15.
    r = client.post(
        f"/api/evaluations/classe/{classe.classe_id}/calculer-moyennes?trimestre_id={trimestre.trimestre_id}",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    bulletin = db.query(Bulletin).filter(Bulletin.inscription_id == insc.inscription_id).first()
    assert bulletin is not None and float(bulletin.moyenne_generale or 0) == 15.0

    # Suppression de l'épreuve centralisée : autrefois 400, désormais 200.
    d = client.delete(f"/api/evaluations/{ev.evaluation_id}", headers=headers)
    assert d.status_code == 200, d.text
    assert d.json()["moyennes_recalculees"] is True

    # Les notes ont disparu.
    assert db.query(Note).filter(Note.evaluation_id == ev.evaluation_id).count() == 0
    # La moyenne « fantôme » a été recalculée : plus aucune épreuve → plus de moyenne.
    db.expire_all()
    bulletin = db.query(Bulletin).filter(Bulletin.inscription_id == insc.inscription_id).first()
    assert bulletin is None or bulletin.moyenne_generale is None
