"""
Le type d'établissement borne les cycles créés, et le dernier niveau d'une école
« courte » diplôme au lieu de bloquer.

- Une école Primaire ne reçoit que le cycle primaire (ni collège ni lycée).
- Une 6e année (CEE) d'une école SANS collège = fin de cursus → DIPLÔMÉ dès la
  saisie du résultat officiel, au lieu de rester sans classe cible et de bloquer
  la clôture.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau, Utilisateur,
)
from app.services.referentiel_scolaire import amorcer_referentiel_scolaire

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _cycles(db: Session, etablissement_id: int) -> set:
    return {c for (c,) in db.query(Cycle.code).filter(Cycle.etablissement_id == etablissement_id).all()}


class TestSeedParType:
    def _etab(self, db: Session, type_etab: str) -> Etablissement:
        uid = _uid()
        e = Etablissement(code=f"TYP-{uid}", nom=f"École {uid}", type_etablissement=type_etab)
        db.add(e); db.commit(); db.refresh(e)
        return e

    def test_primaire_ne_seede_que_le_primaire(self, db: Session):
        e = self._etab(db, "PRIMAIRE")
        amorcer_referentiel_scolaire(db, e.etablissement_id, "PRIMAIRE")
        db.commit()
        assert _cycles(db, e.etablissement_id) == {"PRM"}

    def test_college_ne_seede_que_le_college(self, db: Session):
        e = self._etab(db, "COLLEGE")
        amorcer_referentiel_scolaire(db, e.etablissement_id, "COLLEGE")
        db.commit()
        assert _cycles(db, e.etablissement_id) == {"CLG"}

    def test_lycee_ne_seede_que_le_lycee(self, db: Session):
        e = self._etab(db, "LYCEE")
        amorcer_referentiel_scolaire(db, e.etablissement_id, "LYCEE")
        db.commit()
        assert _cycles(db, e.etablissement_id) == {"LYC"}

    def test_complexe_seede_tout(self, db: Session):
        e = self._etab(db, "COMPLEXE")
        amorcer_referentiel_scolaire(db, e.etablissement_id, "COMPLEXE")
        db.commit()
        assert _cycles(db, e.etablissement_id) == {"PRM", "CLG", "LYC"}

    def test_autre_seede_tout(self, db: Session):
        e = self._etab(db, "AUTRE")
        amorcer_referentiel_scolaire(db, e.etablissement_id, "AUTRE")
        db.commit()
        assert _cycles(db, e.etablissement_id) == {"PRM", "CLG", "LYC"}

    def test_complexe_cycles_explicites_priment(self, db: Session):
        # Complexe primaire+lycée SANS collège : la liste cochée prime sur le type.
        e = self._etab(db, "COMPLEXE")
        amorcer_referentiel_scolaire(db, e.etablissement_id, "COMPLEXE", ["PRM", "LYC"])
        db.commit()
        assert _cycles(db, e.etablissement_id) == {"PRM", "LYC"}


class TestPrimaireSeuleDiplome:
    def _headers(self, client: TestClient, identifiant: str) -> dict:
        resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['token']}"}

    def test_6eme_admis_ecole_primaire_seule_est_diplome(self, client: TestClient, db: Session):
        uid = _uid()
        etab = Etablissement(code=f"PS-{uid}", nom=f"Primaire {uid}", type_etablissement="PRIMAIRE")
        db.add(etab); db.commit(); db.refresh(etab)

        # Seule l'école primaire : aucun collège pour accueillir un 6e admis.
        amorcer_referentiel_scolaire(db, etab.etablissement_id, "PRIMAIRE")
        db.commit()
        assert _cycles(db, etab.etablissement_id) == {"PRM"}

        annee = AnneeScolaire(
            etablissement_id=etab.etablissement_id, code=f"AS{uid}", libelle="2025-2026",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        annee_cible = AnneeScolaire(
            etablissement_id=etab.etablissement_id, code=f"AC{uid}", libelle="2026-2027",
            date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="PLANIFIEE", est_courante="N",
        )
        db.add_all([annee, annee_cible]); db.commit(); db.refresh(annee)

        niveau6 = db.query(Niveau).join(Cycle, Cycle.cycle_id == Niveau.cycle_id).filter(
            Cycle.etablissement_id == etab.etablissement_id, Niveau.ordre == 6
        ).first()
        assert niveau6 is not None and niveau6.est_examen == "O"  # 6e année = CEE

        classe = Classe(
            etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
            niveau_id=niveau6.niveau_id, code=f"C6-{uid}", libelle="6ème année A", statut="ACTIVE",
        )
        db.add(classe); db.commit(); db.refresh(classe)

        eleve = Eleve(
            etablissement_id=etab.etablissement_id, matricule=f"PSELV-{uid}",
            nom="Barry", prenom=f"T{uid}", date_naissance=date(2013, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id,
            statut="ACTIVE", statut_promotion="PROPOSE", decision_fin_annee="EN_ATTENTE_RESULTAT_OFFICIEL",
        )
        db.add(insc); db.commit(); db.refresh(insc)

        admin = Utilisateur(
            nom="Admin", prenom=f"PS{uid}", nom_utilisateur=f"ps.admin.{uid}",
            email=f"ps.admin.{uid}@smartschool.gn", telephone=f"63300{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=etab.etablissement_id,
        )
        db.add(admin); db.commit(); db.refresh(admin)
        headers = self._headers(client, admin.nom_utilisateur)

        resp = client.post(
            "/api/promotion/resultats-officiels/bulk",
            json={"resultats": [{"inscription_id": insc.inscription_id, "resultat": "ADMIS"}]},
            headers=headers,
        )
        assert resp.status_code == 200, resp.text

        db.refresh(insc)
        # Fin du primaire (pas de collège) = DIPLÔMÉ, pas ADMIS sans classe cible.
        assert insc.decision_fin_annee == "DIPLOME"
