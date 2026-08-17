"""
« Préparer les classes de l'année cible » crée aussi la classe d'ACCUEIL des
élèves promus (le niveau supérieur), pas seulement le clone des niveaux existants.

Sans ça, une école à l'échelle « trouée » (ex. une 2ᵉ année sans 3ᵉ année)
bloquait la validation de la promotion : un élève admis n'avait aucune classe
cible dans la nouvelle année. La classe d'accueil créée est vide — donc
librement supprimable ensuite (elle n'est reliée à aucun élève, prof ni matière).
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Etablissement, Niveau, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


class EcolePrimaire:
    """Primaire n'ayant qu'une 2ᵉ année — la 3ᵉ année n'existe pas encore."""

    def __init__(self, db: Session):
        uid = _uid()
        self.etab = Etablissement(code=f"PRM-{uid}", nom=f"École primaire {uid}", type_etablissement="PRIMAIRE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AS{uid}", libelle="2025-2026",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        self.annee_cible = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AC{uid}", libelle="2026-2027",
            date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="PLANIFIEE", est_courante="N",
        )
        db.add_all([self.annee, self.annee_cible]); db.commit()
        db.refresh(self.annee); db.refresh(self.annee_cible)

        # Cycle PRM reconnu par _niveau_suivant (primaire linéaire ordre 1→6).
        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code="PRM", libelle="Primaire", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        # Les deux niveaux existent au référentiel, mais SEULE la 2ᵉ année a une
        # classe. La 3ᵉ année (le niveau supérieur) doit être créée par la prépa.
        self.niveau2 = Niveau(cycle_id=self.cycle.cycle_id, code=f"P2-{uid}", libelle="2ème année", ordre=2)
        self.niveau3 = Niveau(cycle_id=self.cycle.cycle_id, code=f"P3-{uid}", libelle="3ème année", ordre=3)
        db.add_all([self.niveau2, self.niveau3]); db.commit()
        db.refresh(self.niveau2); db.refresh(self.niveau3)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau2.niveau_id, code=f"C2-{uid}", libelle="2ème année A", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"P{uid}", nom_utilisateur=f"prm.admin.{uid}",
            email=f"prm.admin.{uid}@smartschool.gn", telephone=f"61100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)


def test_prepa_cree_le_niveau_superieur_manquant(client: TestClient, db: Session):
    ecole = EcolePrimaire(db)
    headers = _headers(client, ecole.admin.nom_utilisateur)

    resp = client.post(
        f"/api/promotion/annee/{ecole.annee_cible.annee_id}/preparer-classes"
        f"?annee_source_id={ecole.annee.annee_id}",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    nouvelles = db.query(Classe).filter(Classe.annee_id == ecole.annee_cible.annee_id).all()
    niveaux = {c.niveau_id for c in nouvelles}
    # La 2ᵉ année clonée ET la 3ᵉ année d'accueil des admis.
    assert ecole.niveau2.niveau_id in niveaux
    assert ecole.niveau3.niveau_id in niveaux
    assert len(nouvelles) == 2

    # La classe d'accueil est vide → supprimable (aucun lien élève/prof/matière).
    accueil = next(c for c in nouvelles if c.niveau_id == ecole.niveau3.niveau_id)
    r = client.delete(f"/api/classes/{accueil.classe_id}", headers=headers)
    assert r.status_code == 200, r.text
    assert db.query(Classe).filter(Classe.classe_id == accueil.classe_id).first() is None


def test_prepa_idempotente_ne_duplique_pas_le_niveau_superieur(client: TestClient, db: Session):
    """Relancer la préparation ne recrée pas la 3ᵉ année déjà présente."""
    ecole = EcolePrimaire(db)
    headers = _headers(client, ecole.admin.nom_utilisateur)
    url = (f"/api/promotion/annee/{ecole.annee_cible.annee_id}/preparer-classes"
           f"?annee_source_id={ecole.annee.annee_id}")

    assert client.post(url, headers=headers).status_code == 200
    assert client.post(url, headers=headers).json()["created"] == 0
    assert db.query(Classe).filter(Classe.annee_id == ecole.annee_cible.annee_id).count() == 2
