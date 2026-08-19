"""
Vérification d'une carte scolaire au scan (GET /api/cartes/verifier/{matricule}).

- Fiche ÉLÈVE : identité + classe + année (libellés réels) + établissement + parent.
- Fiche ENSEIGNANT : identité + établissement + classes + matières (via affectations).
- Isolation multi-école : scanner la carte d'une AUTRE école → 404.
- Matricule inconnu → 404.
- Contact (tél/adresse) masqué pour un rôle non autorisé.
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


def _login(client: TestClient, identifiant: str, mdp: str = "motdepasse123") -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _ecole(db: Session, role_admin="ADMIN"):
    uid = _uid()
    etab = Etablissement(code=f"CA-{uid}", nom=f"Groupe Scolaire {uid}", type_etablissement="COMPLEXE",
                         ville="Conakry")
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
        nom="Admin", prenom=f"C{uid}", nom_utilisateur=f"ca.admin.{uid}",
        email=f"ca.admin.{uid}@smartschool.gn", telephone=f"66660{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role=role_admin, statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, classe, admin


def _eleve_avec_parent(db, etab, annee, classe):
    uid = _uid()
    eleve = Eleve(
        etablissement_id=etab.etablissement_id, matricule=f"ELV-{etab.etablissement_id}-{uid}",
        nom="Camara", prenom="Alseny", sexe="M", mot_de_passe=None, statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    db.add(Inscription(
        eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id,
        statut="ACTIVE", type_inscription="NOUVELLE",
    ))
    parent = Parent(
        etablissement_id=etab.etablissement_id, nom="Camara", prenom="Mohamed",
        telephone_1="+224620000000", adresse="Conakry", statut="ACTIF",
    )
    db.add(parent); db.commit(); db.refresh(parent)
    db.add(EleveParent(
        eleve_id=eleve.eleve_id, parent_id=parent.parent_id,
        lien_parente="PERE", est_contact_principal="O",
    ))
    db.commit()
    return eleve


def _enseignant_affecte(db, etab, classe):
    uid = _uid()
    ens = Enseignant(
        nom="Camara", prenom="Mohamed", matricule=f"ENS-{etab.etablissement_id}-{uid}", sexe="M",
        telephone="+224621111111", adresse="Kaloum", email=f"ens.{uid}@smartschool.gn",
        mot_de_passe=hash_password("x"), statut="ACTIF", etablissement_id=etab.etablissement_id,
    )
    db.add(ens); db.commit(); db.refresh(ens)
    cycle_id = db.query(Classe).filter(Classe.classe_id == classe.classe_id).first().niveau_id
    niveau = db.query(Niveau).filter(Niveau.niveau_id == cycle_id).first()
    mat = Matiere(cycle_id=niveau.cycle_id, code=f"MATH-{uid}", libelle="Mathématiques")
    db.add(mat); db.commit(); db.refresh(mat)
    db.add(Affectation(
        enseignant_id=ens.enseignant_id, matiere_id=mat.matiere_id, classe_id=classe.classe_id,
        annee_id=classe.annee_id, statut="ACTIVE",
    ))
    db.commit()
    return ens


def test_fiche_eleve_complete_avec_libelles(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    eleve = _eleve_avec_parent(db, etab, annee, classe)
    headers = _login(client, admin.nom_utilisateur)

    r = client.get(f"/api/cartes/verifier/{eleve.matricule}", headers=headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["type"] == "ELEVE"
    assert d["identite"] == {"nom": "Camara", "prenom": "Alseny", "matricule": eleve.matricule}
    # Libellés réels, pas des IDs.
    assert d["scolarite"]["classe"] == "10e A"
    assert d["scolarite"]["annee_scolaire"] == "2026-2027"
    assert d["scolarite"]["etablissement"] == etab.nom
    # Admin : contact visible.
    assert d["contact_masque"] is False
    assert d["parent"]["telephone"] == "+224620000000"
    assert d["parent"]["adresse"] == "Conakry"


def test_fiche_enseignant_classes_et_matieres(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    ens = _enseignant_affecte(db, etab, classe)
    headers = _login(client, admin.nom_utilisateur)

    r = client.get(f"/api/cartes/verifier/{ens.matricule}", headers=headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["type"] == "ENSEIGNANT"
    assert d["identite"]["matricule"] == ens.matricule
    assert d["etablissement"] == etab.nom
    assert "10e A" in d["classes"]
    assert "Mathématiques" in d["matieres"]
    assert d["contact"]["telephone"] == "+224621111111"


def test_isolation_inter_ecoles_404(client: TestClient, db: Session):
    etab_a, annee_a, classe_a, admin_a = _ecole(db)
    eleve_a = _eleve_avec_parent(db, etab_a, annee_a, classe_a)
    etab_b, _, _, admin_b = _ecole(db)
    headers_b = _login(client, admin_b.nom_utilisateur)

    # L'admin de B scanne la carte d'un élève de A → 404 (aucune fuite).
    r = client.get(f"/api/cartes/verifier/{eleve_a.matricule}", headers=headers_b)
    assert r.status_code == 404


def test_matricule_inconnu_404(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    headers = _login(client, admin.nom_utilisateur)
    r = client.get("/api/cartes/verifier/ELV-INEXISTANT-999", headers=headers)
    assert r.status_code == 404


def test_contact_masque_pour_role_non_autorise(client: TestClient, db: Session):
    # L'admin de l'école a un rôle non autorisé à voir le contact (ex. GARDIEN).
    etab, annee, classe, gardien = _ecole(db, role_admin="GARDIEN")
    eleve = _eleve_avec_parent(db, etab, annee, classe)
    headers = _login(client, gardien.nom_utilisateur)

    r = client.get(f"/api/cartes/verifier/{eleve.matricule}", headers=headers)
    assert r.status_code == 200, r.text
    d = r.json()
    # Identité + classe visibles, mais contact masqué.
    assert d["scolarite"]["classe"] == "10e A"
    assert d["contact_masque"] is True
    assert d["parent"] is None
