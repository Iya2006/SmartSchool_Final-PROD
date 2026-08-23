"""
Quand le surveillant (ou l'admin) fait l'appel d'un cours collège/lycée via la
feuille d'appel (POST /vie-scolaire/presences/batch avec seance_id), la SÉANCE
doit être mise à jour (appel_fait, compteurs, statut) — sinon l'appel n'apparaît
pas dans la vue « Séances (Appels) » qui lit ces champs dénormalisés.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Enseignant, Etablissement,
    Inscription, Matiere, Niveau, Seance, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _setup(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"ASV-{uid}", nom=f"École {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
                          date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O")
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"LYC{uid}", libelle="Lycée", ordre=3)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="10ème année", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"10A{uid}", libelle="10A", statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)
    matiere = Matiere(cycle_id=cycle.cycle_id, code=f"M{uid}", libelle="Chimie", note_sur=20)
    db.add(matiere); db.commit(); db.refresh(matiere)
    ens = Enseignant(etablissement_id=etab.etablissement_id, matricule=f"ASVENS{uid}", nom="Touré", prenom="Aminata",
                     sexe="F", telephone=f"93300{uid:04d}", mot_de_passe=hash_password("x"), statut="ACTIF")
    db.add(ens); db.commit(); db.refresh(ens)
    eleve = Eleve(etablissement_id=etab.etablissement_id, matricule=f"ASVELV{uid}", nom="Diallo", prenom="Awa",
                  date_naissance=date(2010, 1, 1), sexe="F", statut="ACTIF")
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE")
    db.add(insc); db.commit(); db.refresh(insc)
    seance = Seance(classe_id=classe.classe_id, matiere_id=matiere.matiere_id, annee_id=annee.annee_id,
                    enseignant_prevu_id=ens.enseignant_id, date_seance=date(2026, 10, 1),
                    heure_debut_prevue="08:00", heure_fin_prevue="09:00", statut="PREVUE", appel_fait="N")
    db.add(seance); db.commit(); db.refresh(seance)
    admin = Utilisateur(nom="Surv", prenom=f"ASV{uid}", nom_utilisateur=f"asv.surv.{uid}",
                        email=f"asv.surv.{uid}@smartschool.gn", telephone=f"94300{uid:04d}",
                        mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT", statut="ACTIF",
                        etablissement_id=etab.etablissement_id)
    db.add(admin); db.commit(); db.refresh(admin)
    return classe, seance, insc, admin


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_appel_surveillant_met_a_jour_la_seance(client: TestClient, db: Session):
    classe, seance, insc, admin = _setup(db)
    headers = _headers(client, admin.nom_utilisateur)

    r = client.post("/api/vie-scolaire/presences/batch", headers=headers, json=[{
        "inscription_id": insc.inscription_id,
        "date_presence": "2026-10-01",
        "demi_journee": "MATIN",
        "statut_presence": "PRESENT",
        "seance_id": seance.seance_id,
    }])
    assert r.status_code == 200, r.text

    db.expire_all()
    s = db.query(Seance).filter(Seance.seance_id == seance.seance_id).first()
    assert s.appel_fait == "O", "L'appel du surveillant doit marquer la séance comme appelée"
    assert s.nb_presents == 1
    assert s.statut == "EFFECTUEE"
