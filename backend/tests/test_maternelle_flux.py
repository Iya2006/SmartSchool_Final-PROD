"""
Flux Maternelle de bout en bout :
- l'enseignant saisit Admis/Non + appréciation (résultat officiel réutilisé) ;
- au calcul de fin d'année, un ADMIS passe (classe cible = 1ère Année), un
  NON_ADMIS redouble — sans aucune moyenne ;
- l'attestation premium n'est délivrée qu'à un admis de Grande Section.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau,
    ResultatOfficielExamen, Utilisateur,
)
from app.services.referentiel_scolaire import amorcer_referentiel_scolaire
from app.api.promotion import _calculer_resultats_classe_core

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _niveau(db, etab_id, cycle_code, niveau_code):
    return (
        db.query(Niveau).join(Cycle, Cycle.cycle_id == Niveau.cycle_id)
        .filter(Cycle.etablissement_id == etab_id, Cycle.code == cycle_code, Niveau.code == niveau_code)
        .first()
    )


def _eleve_inscrit(db, etab_id, classe, annee_id, nom, prenom):
    uid = _uid()
    e = Eleve(
        etablissement_id=etab_id, matricule=f"ELV-MF{uid}", nom=nom, prenom=prenom,
        sexe="F", date_naissance=date(2021, 3, 12), lieu_naissance="Conakry",
        mot_de_passe=None, statut="ACTIF",
    )
    db.add(e); db.commit(); db.refresh(e)
    insc = Inscription(
        eleve_id=e.eleve_id, classe_id=classe.classe_id, annee_id=annee_id,
        statut="ACTIVE", type_inscription="REINSCRIPTION",
    )
    db.add(insc); db.commit(); db.refresh(insc)
    return e, insc


def _mise_en_place(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"MF-{uid}", nom=f"Complexe {uid}", type_etablissement="COMPLEXE")
    db.add(etab); db.commit(); db.refresh(etab)
    amorcer_referentiel_scolaire(db, etab.etablissement_id, "COMPLEXE", cycles=["MAT", "PRM"])
    db.commit()

    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
        date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
    )
    annee_cible = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AC{uid}", libelle="2027-2028",
        date_debut=date(2027, 9, 1), date_fin=date(2028, 7, 1), statut="PLANIFIEE", est_courante="N",
    )
    db.add_all([annee, annee_cible]); db.commit(); db.refresh(annee); db.refresh(annee_cible)

    gs = _niveau(db, etab.etablissement_id, "MAT", "GS")
    un_a = _niveau(db, etab.etablissement_id, "PRM", "1A")
    classe_gs = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=gs.niveau_id,
        code=f"GS-{uid}", libelle="Grande Section", statut="ACTIVE",
    )
    # Classe cible 1ère année dans l'année suivante (pour la résolution du passage).
    classe_1a = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee_cible.annee_id, niveau_id=un_a.niveau_id,
        code=f"1A-{uid}", libelle="1ère Année", statut="ACTIVE",
    )
    db.add_all([classe_gs, classe_1a]); db.commit(); db.refresh(classe_gs); db.refresh(classe_1a)

    admin = Utilisateur(
        nom="Admin", prenom=f"MF{uid}", nom_utilisateur=f"mf.admin.{uid}",
        email=f"mf.admin.{uid}@smartschool.gn", telephone=f"66640{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, annee_cible, classe_gs, classe_1a, admin


def test_admis_passe_non_admis_redouble_sans_moyenne(client: TestClient, db: Session):
    etab, annee, annee_cible, classe_gs, classe_1a, admin = _mise_en_place(db)
    headers = _headers(client, admin.nom_utilisateur)

    e_ok, insc_ok = _eleve_inscrit(db, etab.etablissement_id, classe_gs, annee.annee_id, "Bah", "Aicha")
    e_ko, insc_ko = _eleve_inscrit(db, etab.etablissement_id, classe_gs, annee.annee_id, "Diallo", "Mamadou")

    # L'enseignant saisit Admis/Non + appréciation (endpoint des résultats).
    r = client.post("/api/promotion/resultats-officiels/bulk", headers=headers, json={
        "resultats": [
            {"inscription_id": insc_ok.inscription_id, "resultat": "ADMIS", "observation": "Enfant épanoui, très bon travail."},
            {"inscription_id": insc_ko.inscription_id, "resultat": "NON_ADMIS", "observation": "Doit consolider."},
        ],
        "saisi_par": "Maîtresse Awa",
    })
    assert r.status_code == 200, r.text

    # Calcul de fin d'année (aucune moyenne saisie).
    _calculer_resultats_classe_core(db, classe_gs, annee_cible.annee_id, {})
    db.commit(); db.refresh(insc_ok); db.refresh(insc_ko)

    assert insc_ok.decision_fin_annee == "ADMIS"
    assert insc_ok.classe_cible_id == classe_1a.classe_id  # passe en 1ère Année
    assert insc_ko.decision_fin_annee == "REDOUBLANT"


def test_attestation_seulement_pour_un_admis_de_grande_section(client: TestClient, db: Session):
    etab, annee, annee_cible, classe_gs, classe_1a, admin = _mise_en_place(db)
    headers = _headers(client, admin.nom_utilisateur)

    e_ok, insc_ok = _eleve_inscrit(db, etab.etablissement_id, classe_gs, annee.annee_id, "Camara", "Fanta")
    e_ko, insc_ko = _eleve_inscrit(db, etab.etablissement_id, classe_gs, annee.annee_id, "Sow", "Ousmane")

    db.add(ResultatOfficielExamen(inscription_id=insc_ok.inscription_id, resultat="ADMIS", observation="Bravo"))
    db.commit()

    # Admis → PDF.
    r = client.get(f"/api/promotion/attestation-maternelle/{insc_ok.inscription_id}", headers=headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"

    # Pas de résultat / non admis → refus.
    r = client.get(f"/api/promotion/attestation-maternelle/{insc_ko.inscription_id}", headers=headers)
    assert r.status_code == 400
