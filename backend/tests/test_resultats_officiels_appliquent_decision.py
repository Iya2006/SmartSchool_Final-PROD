"""
Saisir un résultat d'examen national applique IMMÉDIATEMENT la décision.

Défaut corrigé : enregistrer le résultat du Ministère ne mettait pas à jour la
décision de passage. La classe restait « en attente du résultat officiel » et sa
validation restait bloquée tant qu'on ne relançait pas manuellement le calcul —
piège invisible pour l'utilisateur (« j'ai mis admis, ça devrait marcher »).

Désormais, pour une classe DÉJÀ calculée, la saisie du résultat rejoue le calcul
de la classe (même fonction que /calculer-resultats) : ADMIS d'une Terminale
devient DIPLÔMÉ, NON_ADMIS devient REDOUBLANT, sans étape supplémentaire.
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


class EcoleExamen:
    """Lycée avec une Terminale d'examen (BAC), une année source et l'année cible."""

    def __init__(self, db: Session):
        uid = _uid()
        self.etab = Etablissement(code=f"EX-{uid}", nom=f"Lycée {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        # Deux années : la source (en cours) et sa suivante — nécessaire pour
        # que la décision REDOUBLANT puisse résoudre sa classe cible.
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

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code="LYC", libelle="Lycée", ordre=3)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        # est_terminal = LYC et ordre + 3 > 19 (voir _situation_niveau) ; est_examen = 'O'.
        self.niveau = Niveau(
            cycle_id=self.cycle.cycle_id, code=f"TLE{uid}", libelle="Terminale", ordre=17,
            est_examen="O", examen_national="BAC",
        )
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"TSE{uid}", libelle="Terminale SE", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"E{uid}", nom_utilisateur=f"ex.admin.{uid}",
            email=f"ex.admin.{uid}@smartschool.gn", telephone=f"62200{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def inscrire_calcule(self, db: Session) -> Inscription:
        """Un élève déjà calculé, en attente du résultat officiel (état réel avant saisie)."""
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"EXELV-{uid}",
            nom="Camara", prenom=f"Test{uid}", date_naissance=date(2007, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id, annee_id=self.annee.annee_id,
            statut="ACTIVE", statut_promotion="PROPOSE", decision_fin_annee="EN_ATTENTE_RESULTAT_OFFICIEL",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        return insc


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def test_admis_devient_diplome_sans_relancer_le_calcul(client: TestClient, db: Session):
    ecole = EcoleExamen(db)
    insc = ecole.inscrire_calcule(db)
    headers = _headers(client, ecole.admin.nom_utilisateur)

    resp = client.post(
        "/api/promotion/resultats-officiels/bulk",
        json={"resultats": [{"inscription_id": insc.inscription_id, "resultat": "ADMIS"}]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["classes_recalculees"] == 1

    db.refresh(insc)
    # Terminale admise = fin de cursus, sans transfert.
    assert insc.decision_fin_annee == "DIPLOME"


def test_non_admis_devient_redoublant(client: TestClient, db: Session):
    ecole = EcoleExamen(db)
    insc = ecole.inscrire_calcule(db)
    headers = _headers(client, ecole.admin.nom_utilisateur)

    resp = client.post(
        "/api/promotion/resultats-officiels/bulk",
        json={"resultats": [{"inscription_id": insc.inscription_id, "resultat": "NON_ADMIS"}]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    db.refresh(insc)
    assert insc.decision_fin_annee == "REDOUBLANT"


def test_classe_non_calculee_ne_recalcule_pas(client: TestClient, db: Session):
    """Sans calcul préalable (statut_promotion NULL), on enregistre mais on ne
    décide pas : on ne déclenche pas un calcul de classe surprise."""
    ecole = EcoleExamen(db)
    uid = _uid()
    eleve = Eleve(
        etablissement_id=ecole.etab.etablissement_id, matricule=f"EXELV-{uid}",
        nom="Sow", prenom=f"Test{uid}", date_naissance=date(2007, 1, 1), sexe="F", statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(
        eleve_id=eleve.eleve_id, classe_id=ecole.classe.classe_id, annee_id=ecole.annee.annee_id,
        statut="ACTIVE",  # jamais calculé : statut_promotion = None
    )
    db.add(insc); db.commit(); db.refresh(insc)
    headers = _headers(client, ecole.admin.nom_utilisateur)

    resp = client.post(
        "/api/promotion/resultats-officiels/bulk",
        json={"resultats": [{"inscription_id": insc.inscription_id, "resultat": "ADMIS"}]},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["classes_recalculees"] == 0

    db.refresh(insc)
    assert insc.decision_fin_annee is None
