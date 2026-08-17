"""
La liste des élèves d'une année n'affiche que ceux réellement présents cette
année-là : un diplômé (BAC) ou un non-réinscrit de l'an dernier disparaît de la
nouvelle année (il reste consultable sur l'ancienne). Un nouvel élève tout juste
créé, sans inscription encore, reste visible pour pouvoir l'affecter.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session):
        uid = _uid()
        self.etab = Etablissement(code=f"EL-{uid}", nom=f"École {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)
        self.an1 = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"{uid}-25", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="CLOTURE", est_courante="N",
        )
        self.an2 = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"{uid}-26", libelle=f"2026-2027 {uid}",
            date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add_all([self.an1, self.an2]); db.commit(); db.refresh(self.an1); db.refresh(self.an2)
        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Lycée", ordre=3)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)
        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="Terminale", ordre=17)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)
        self.classe1 = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.an1.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"C1-{uid}", libelle="TSE", statut="ACTIVE",
        )
        self.classe2 = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.an2.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"C2-{uid}", libelle="TSE", statut="ACTIVE",
        )
        db.add_all([self.classe1, self.classe2]); db.commit()
        db.refresh(self.classe1); db.refresh(self.classe2)
        self.admin = Utilisateur(
            nom="Admin", prenom=f"E{uid}", nom_utilisateur=f"el.admin.{uid}",
            email=f"el.admin.{uid}@smartschool.gn", telephone=f"65500{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def eleve(self, db: Session, nom: str) -> Eleve:
        uid = _uid()
        e = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"ELV-{uid}",
            nom=nom, prenom=f"P{uid}", date_naissance=date(2007, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(e); db.commit(); db.refresh(e)
        return e

    def inscrire(self, db: Session, eleve: Eleve, classe: Classe, annee: AnneeScolaire):
        db.add(Inscription(
            eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id, statut="ACTIVE",
        ))
        db.commit()


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _noms(client, headers, annee_id):
    r = client.get(f"/api/eleves?annee_id={annee_id}&limit=200", headers=headers)
    assert r.status_code == 200, r.text
    return {e["nom"] for e in r.json()}


def _detail(client, headers, annee_id, nom):
    r = client.get(f"/api/eleves?annee_id={annee_id}&limit=200", headers=headers)
    assert r.status_code == 200, r.text
    for e in r.json():
        if e["nom"] == nom:
            return e
    return None


def test_promu_preplace_apparait_a_activer_dans_la_nouvelle_annee(client: TestClient, db: Session):
    """Un élève promu (admis/redoublant) de l'an dernier, pas encore réinscrit,
    apparaît dans la nouvelle année : inactif, pré-placé dans sa classe cible,
    à activer."""
    e = Ecole(db)
    promu = e.eleve(db, "Promu")
    promu.statut = "INACTIF"  # état réel après validation de la promotion
    # Inscription de l'an dernier, validée et à réinscrire vers la classe de l'an2.
    insc = Inscription(
        eleve_id=promu.eleve_id, classe_id=e.classe1.classe_id, annee_id=e.an1.annee_id,
        statut="ACTIVE", statut_promotion="VALIDE", decision_fin_annee="ADMIS",
        statut_reinscription="A_REINSCRIRE", classe_cible_id=e.classe2.classe_id,
    )
    db.add(insc); db.commit(); db.refresh(insc)
    headers = _headers(client, e.admin.nom_utilisateur)

    d = _detail(client, headers, e.an2.annee_id, "Promu")
    assert d is not None, "l'élève promu doit apparaître dans la nouvelle année"
    assert d["a_reinscrire"] is True
    assert d["classe_code"] == e.classe2.code          # pré-placé dans la classe cible
    assert d["inscription_a_confirmer"] == insc.inscription_id


def test_diplome_absent_de_la_nouvelle_annee_mais_present_dans_l_ancienne(client: TestClient, db: Session):
    e = Ecole(db)
    diplome = e.eleve(db, "Diplome")
    e.inscrire(db, diplome, e.classe1, e.an1)          # inscrit UNIQUEMENT en 2025-2026
    redoublant = e.eleve(db, "Redoublant")
    e.inscrire(db, redoublant, e.classe2, e.an2)       # inscrit en 2026-2027
    nouveau = e.eleve(db, "Nouveau")                    # aucune inscription encore
    headers = _headers(client, e.admin.nom_utilisateur)

    # Nouvelle année : pas le diplômé, mais le redoublant et le nouvel élève.
    noms_an2 = _noms(client, headers, e.an2.annee_id)
    assert "Diplome" not in noms_an2
    assert "Redoublant" in noms_an2
    assert "Nouveau" in noms_an2

    # Ancienne année (consultation) : le diplômé y est toujours.
    noms_an1 = _noms(client, headers, e.an1.annee_id)
    assert "Diplome" in noms_an1
    assert "Redoublant" not in noms_an1
