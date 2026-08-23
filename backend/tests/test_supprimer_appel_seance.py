"""
Suppression d'un appel déjà fait depuis l'espace vie scolaire :
les présences saisies sont effacées et la séance repasse en « appel non fait »
pour pouvoir refaire l'appel. La séance elle-même n'est pas supprimée.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Enseignant, Etablissement,
    Inscription, Matiere, Niveau, Presence, Seance, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"SAP-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
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
    ens = Enseignant(etablissement_id=etab.etablissement_id, matricule=f"ENS{uid}", nom="Bah", prenom="O",
                     sexe="M", telephone=f"99100{uid:04d}", mot_de_passe=hash_password("x"), statut="ACTIF")
    db.add(ens); db.commit(); db.refresh(ens)
    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"ELV{uid}", nom="Diallo", prenom="Awa",
                  date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF")
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE")
    db.add(insc); db.commit(); db.refresh(insc)
    seance = Seance(classe_id=classe.classe_id, matiere_id=matiere.matiere_id, annee_id=annee.annee_id,
                    enseignant_prevu_id=ens.enseignant_id, date_seance=date(2026, 10, 1),
                    heure_debut_prevue="08:00", heure_fin_prevue="09:00", statut="EFFECTUEE",
                    appel_fait="O")
    db.add(seance); db.commit(); db.refresh(seance)
    db.add(Presence(inscription_id=insc.inscription_id, date_presence=date(2026, 10, 1),
                    demi_journee="MATIN", statut_presence="PRESENT", seance_id=seance.seance_id))
    db.commit()
    admin = Utilisateur(nom="Admin", prenom=f"SAP{uid}", nom_utilisateur=f"sap.admin.{uid}",
                        email=f"sap.admin.{uid}@smartschool.gn", telephone=f"90100{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return seance, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_supprimer_appel_efface_presences_et_reouvre_appel(client: TestClient, db: Session):
    seance, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)
    assert db.query(Presence).filter(Presence.seance_id == seance.seance_id).count() == 1

    r = client.delete(f"/api/seances/{seance.seance_id}/appel", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["presences_supprimees"] == 1

    assert db.query(Presence).filter(Presence.seance_id == seance.seance_id).count() == 0
    db.expire_all()
    s = db.query(Seance).filter(Seance.seance_id == seance.seance_id).first()
    assert s is not None and s.appel_fait == "N"
