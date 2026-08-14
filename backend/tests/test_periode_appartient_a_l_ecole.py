"""
Tests — on ne calcule jamais des bulletins sur la période d'une autre école.

CE QUI A ÉTÉ TROUVÉ
-------------------
`POST /classe/{id}/calculer-moyennes` prenait `trimestre_id = 1` PAR DÉFAUT
et ne vérifiait pas à qui cette période appartenait. Une école dont les
périodes portent les identifiants 4 et 5 calculait donc ses bulletins sur le
1er trimestre d'une AUTRE école : aucune évaluation ne correspondait, et le
bouton créait des bulletins vides — sans moyenne, sans rang — en annonçant
sa réussite.

Constaté en base : 63 bulletins d'élèves de TrillionX rattachés au 1er
trimestre du Lycée d'Excellence de Conakry. Le fondateur voyait un bouton
« Calculer les moyennes » qui ne prenait pas. Il prenait, mais ailleurs.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Etablissement, Niveau, Trimestre, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole_complete(db: Session, nom: str, premiere_periode: str):
    """Une école avec son année, sa période et une classe."""
    uid = _uid()
    etab = Etablissement(code=f"PER-{uid}", nom=f"École {nom} {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)

    admin = Utilisateur(
        nom="Diallo", prenom=f"Chef{uid}", nom_utilisateur=f"per.admin.{uid}",
        email=f"per.{uid}@smartschool.gn", telephone=f"64000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    annee = AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    )
    db.add_all([admin, annee]); db.commit(); db.refresh(annee)

    periode = Trimestre(
        annee_id=annee.annee_id, code="P1", libelle=premiere_periode, numero=1,
        date_debut=date(2025, 10, 1), date_fin=date(2026, 1, 31), statut="EN_COURS",
    )
    cycle = Cycle(code=f"SEC{uid}", libelle="Secondaire", ordre=2,
                  etablissement_id=etab.etablissement_id)
    db.add_all([periode, cycle]); db.commit(); db.refresh(periode); db.refresh(cycle)

    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="11ème", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)

    classe = Classe(
        code=f"CL{uid}", libelle=f"11ème {uid}", niveau_id=niveau.niveau_id,
        annee_id=annee.annee_id, capacite_max=40, statut="ACTIVE",
        etablissement_id=etab.etablissement_id,
    )
    db.add(classe); db.commit(); db.refresh(classe)
    return etab, admin, annee, periode, classe


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestCalculSurLaPeriodeDUneAutreEcole:
    def test_la_periode_d_une_autre_ecole_est_refusee(self, client: TestClient, db: Session):
        _, _, _, periode_a, _ = _ecole_complete(db, "A", "1er Trimestre")
        _, admin_b, _, _, classe_b = _ecole_complete(db, "B", "1er Semestre")

        r = client.post(
            f"/api/evaluations/classe/{classe_b.classe_id}/calculer-moyennes"
            f"?trimestre_id={periode_a.trimestre_id}",
            headers=_headers(client, admin_b.nom_utilisateur),
        )
        assert r.status_code == 404, r.text

    def test_sa_propre_periode_passe(self, client: TestClient, db: Session):
        _, admin, _, periode, classe = _ecole_complete(db, "C", "1er Semestre")

        r = client.post(
            f"/api/evaluations/classe/{classe.classe_id}/calculer-moyennes"
            f"?trimestre_id={periode.trimestre_id}",
            headers=_headers(client, admin.nom_utilisateur),
        )
        assert r.status_code == 200, r.text

    def test_la_periode_doit_etre_precisee(self, client: TestClient, db: Session):
        """Sans période, on ne devine pas : on refuse. Le défaut valait 1."""
        _, admin, _, _, classe = _ecole_complete(db, "D", "1er Semestre")

        r = client.post(
            f"/api/evaluations/classe/{classe.classe_id}/calculer-moyennes",
            headers=_headers(client, admin.nom_utilisateur),
        )
        assert r.status_code == 422

    def test_publication_refuse_aussi_la_periode_d_autrui(self, client: TestClient, db: Session):
        _, _, _, periode_a, _ = _ecole_complete(db, "E", "1er Trimestre")
        _, admin_b, _, _, classe_b = _ecole_complete(db, "F", "1er Semestre")

        r = client.put(
            f"/api/evaluations/classe/{classe_b.classe_id}/bulletins/publier-tout"
            f"?trimestre_id={periode_a.trimestre_id}",
            headers=_headers(client, admin_b.nom_utilisateur),
        )
        assert r.status_code == 404

    def test_notes_centralisees_refuse_la_periode_d_autrui(self, client: TestClient, db: Session):
        _, _, _, periode_a, _ = _ecole_complete(db, "G", "1er Trimestre")
        _, admin_b, _, _, classe_b = _ecole_complete(db, "H", "1er Semestre")

        r = client.get(
            f"/api/evaluations/classe/{classe_b.classe_id}/notes-centralisees"
            f"?trimestre_id={periode_a.trimestre_id}",
            headers=_headers(client, admin_b.nom_utilisateur),
        )
        assert r.status_code == 404


class TestPeriodeParDefautDesPortails:
    def test_periode_courante_est_celle_de_l_annee_demandee(self, db: Session):
        """Le défaut des portails : la période de SON année, jamais l'identifiant 1."""
        from app.services.notation import periode_courante

        _, _, annee_a, periode_a, _ = _ecole_complete(db, "I", "1er Trimestre")
        _, _, annee_b, periode_b, _ = _ecole_complete(db, "J", "1er Semestre")

        assert periode_courante(db, annee_a.annee_id).trimestre_id == periode_a.trimestre_id
        assert periode_courante(db, annee_b.annee_id).trimestre_id == periode_b.trimestre_id
        # Et les deux sont bien différentes : sans ça le test ne prouve rien.
        assert periode_a.trimestre_id != periode_b.trimestre_id

    def test_annee_sans_periode_ne_devine_pas(self, db: Session):
        from app.services.notation import periode_courante

        assert periode_courante(db, None) is None
        assert periode_courante(db, 999999) is None
