"""
Contenu du QR d'une carte scolaire (GET /api/cartes/contenu-qr/{matricule}).

Le QR ne porte plus le seul matricule : il encode un texte lisible.
- Élève : école, nom/prénom, matricule, classe (+ année), parent + téléphone + adresse.
- Enseignant : école, nom/prénom, matricule, téléphone, adresse, classes + matières.
- Isolation multi-école : une carte d'une autre école → 404.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Enseignant, Etablissement,
    Inscription, Matiere, Niveau, Parent, Affectation, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _login(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"QR-{uid}", nom=f"Groupe Scolaire {uid}", type_etablissement="COMPLEXE", ville="Conakry")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
        date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code="CLG", libelle="Collège", ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"10-{uid}", libelle="10e Année", ordre=10)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"10A-{uid}", libelle="10e A", statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    admin = Utilisateur(
        nom="Admin", prenom=f"Q{uid}", nom_utilisateur=f"qr.admin.{uid}",
        email=f"qr.admin.{uid}@smartschool.gn", telephone=f"66670{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, classe, admin


def test_qr_eleve_contient_ecole_classe_parent(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    uid = _uid()
    eleve = Eleve(
        etablissement_id=etab.etablissement_id, matricule=f"ELV-{etab.etablissement_id}-{uid}",
        nom="Camara", prenom="Alseny", sexe="M", mot_de_passe=None, statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    db.add(Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id,
                       statut="ACTIVE", type_inscription="NOUVELLE"))
    parent = Parent(etablissement_id=etab.etablissement_id, nom="Camara", prenom="Mohamed",
                    telephone_1="+224620000000", adresse="Conakry", statut="ACTIF")
    db.add(parent); db.commit(); db.refresh(parent)
    db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id,
                       lien_parente="PERE", est_contact_principal="O"))
    db.commit()
    headers = _login(client, admin.nom_utilisateur)

    r = client.get(f"/api/cartes/contenu-qr/{eleve.matricule}", headers=headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["type"] == "ELEVE"
    t = d["texte"]
    assert etab.nom in t
    assert "Alseny Camara" in t
    assert eleve.matricule in t
    assert "10e A" in t and "2026-2027" in t
    assert "+224620000000" in t
    assert "Conakry" in t


def test_qr_enseignant_contient_classes_matieres_tel(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    uid = _uid()
    ens = Enseignant(
        nom="Diallo", prenom="Fatou", matricule=f"ENS-{etab.etablissement_id}-{uid}", sexe="F",
        telephone="+224621111111", adresse="Kaloum", email=f"ens.{uid}@smartschool.gn",
        mot_de_passe=hash_password("x"), statut="ACTIF", etablissement_id=etab.etablissement_id,
    )
    db.add(ens); db.commit(); db.refresh(ens)
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    mat = Matiere(cycle_id=niveau.cycle_id, code=f"MATH-{uid}", libelle="Mathématiques")
    db.add(mat); db.commit(); db.refresh(mat)
    db.add(Affectation(enseignant_id=ens.enseignant_id, matiere_id=mat.matiere_id,
                       classe_id=classe.classe_id, annee_id=classe.annee_id, statut="ACTIVE"))
    db.commit()
    headers = _login(client, admin.nom_utilisateur)

    r = client.get(f"/api/cartes/contenu-qr/{ens.matricule}", headers=headers)
    assert r.status_code == 200, r.text
    t = r.json()["texte"]
    assert r.json()["type"] == "ENSEIGNANT"
    assert etab.nom in t
    assert "Fatou Diallo" in t
    assert "10e A" in t
    assert "Mathématiques" in t
    assert "+224621111111" in t
    assert "Kaloum" in t


def test_qr_isolation_inter_ecoles(client: TestClient, db: Session):
    etab_a, annee_a, classe_a, admin_a = _ecole(db)
    uid = _uid()
    eleve_a = Eleve(etablissement_id=etab_a.etablissement_id, matricule=f"ELV-A-{uid}",
                    nom="Bah", prenom="Sory", sexe="M", mot_de_passe=None, statut="ACTIF")
    db.add(eleve_a); db.commit()
    _, _, _, admin_b = _ecole(db)
    headers_b = _login(client, admin_b.nom_utilisateur)
    r = client.get(f"/api/cartes/contenu-qr/{eleve_a.matricule}", headers=headers_b)
    assert r.status_code == 404
