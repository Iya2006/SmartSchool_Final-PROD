"""
SMARTSCHOOL — Calendrier des périodes et sélection des épreuves

Deux défauts réels trouvés en recette, couverts ici :

1. Une épreuve pouvait être datée hors de la période à laquelle on la
   rattachait. Une « évaluation du mois de janvier » avait été enregistrée
   avec la date du jour (août) et rattachée au 1er trimestre (octobre →
   décembre) : le libellé, la date et la période racontaient trois histoires
   différentes, et rien ne l'avait signalé.

2. Le résultat d'une période prenait TOUTES les évaluations centralisées,
   sans que l'école puisse décider. Or une période peut se jouer sur deux
   évaluations sans composition, ou sur une composition seule.
"""
from datetime import date

import pytest

from app.models.academique import AnneeScolaire, Trimestre
from app.services.notation import (
    calendrier_mois,
    periode_pour_date,
    verifier_date_dans_periode,
)


@pytest.fixture
def annee_decoupee(db):
    """Année scolaire avec trois périodes, séparées par des vacances.

    Septembre et les inter-périodes ne sont couverts par aucun trimestre :
    c'est volontaire, c'est le cas qui révèle les mois « hors période ».
    """
    annee = AnneeScolaire(
        etablissement_id=1, code="T-2025", libelle="Test 2025-2026",
        date_debut=date(2025, 9, 1), date_fin=date(2026, 6, 30),
        statut="EN_COURS", est_courante="N",
    )
    db.add(annee)
    db.flush()

    periodes = [
        Trimestre(annee_id=annee.annee_id, code="T1", libelle="1er Trimestre", numero=1,
                  date_debut=date(2025, 10, 1), date_fin=date(2025, 12, 20), statut="EN_COURS"),
        Trimestre(annee_id=annee.annee_id, code="T2", libelle="2ème Trimestre", numero=2,
                  date_debut=date(2026, 1, 5), date_fin=date(2026, 3, 28), statut="EN_COURS"),
        Trimestre(annee_id=annee.annee_id, code="T3", libelle="3ème Trimestre", numero=3,
                  date_debut=date(2026, 4, 7), date_fin=date(2026, 6, 30), statut="PLANIFIE"),
    ]
    db.add_all(periodes)
    db.commit()
    yield annee, periodes

    for p in periodes:
        db.delete(p)
    db.delete(annee)
    db.commit()


class TestCalendrierMois:
    def test_chaque_mois_est_rattache_a_sa_periode(self, db, annee_decoupee):
        annee, _ = annee_decoupee
        par_cle = {m["cle"]: m for m in calendrier_mois(db, annee.annee_id)}

        assert par_cle["2025-10"]["trimestre"] == "1er Trimestre"
        assert par_cle["2025-12"]["trimestre"] == "1er Trimestre"
        # Le cas du bug : janvier appartient au 2ème trimestre, pas au 1er.
        assert par_cle["2026-01"]["trimestre"] == "2ème Trimestre"
        assert par_cle["2026-05"]["trimestre"] == "3ème Trimestre"

    def test_mois_hors_periode_signale_et_indisponible(self, db, annee_decoupee):
        annee, _ = annee_decoupee
        septembre = next(m for m in calendrier_mois(db, annee.annee_id) if m["cle"] == "2025-09")
        assert septembre["trimestre_id"] is None
        assert septembre["disponible"] is False

    def test_mois_a_cheval_va_a_la_periode_qui_le_couvre_le_plus(self, db, annee_decoupee):
        """Avril : 1er→6 hors période, 7→30 en 3ème trimestre. Le 3ème gagne."""
        annee, _ = annee_decoupee
        avril = next(m for m in calendrier_mois(db, annee.annee_id) if m["cle"] == "2026-04")
        assert avril["trimestre"] == "3ème Trimestre"

    def test_periode_planifiee_reste_indisponible(self, db, annee_decoupee):
        annee, _ = annee_decoupee
        mai = next(m for m in calendrier_mois(db, annee.annee_id) if m["cle"] == "2026-05")
        assert mai["trimestre_statut"] == "PLANIFIE"

    def test_annee_inconnue_ne_leve_pas(self, db):
        assert calendrier_mois(db, 999999) == []


class TestPeriodePourDate:
    def test_trouve_la_periode_contenant_la_date(self, db, annee_decoupee):
        annee, _ = annee_decoupee
        assert periode_pour_date(db, annee.annee_id, date(2025, 11, 15)).code == "T1"
        assert periode_pour_date(db, annee.annee_id, date(2026, 1, 20)).code == "T2"

    def test_aucune_periode_pendant_les_vacances(self, db, annee_decoupee):
        annee, _ = annee_decoupee
        assert periode_pour_date(db, annee.annee_id, date(2025, 12, 28)) is None
        assert periode_pour_date(db, annee.annee_id, date(2026, 8, 9)) is None


class TestVerifierDateDansPeriode:
    def test_date_dans_la_periode_est_acceptee(self, db, annee_decoupee):
        _, periodes = annee_decoupee
        verifier_date_dans_periode(db, periodes[0], date(2025, 11, 15))   # ne lève pas

    def test_bornes_incluses(self, db, annee_decoupee):
        _, periodes = annee_decoupee
        verifier_date_dans_periode(db, periodes[0], date(2025, 10, 1))
        verifier_date_dans_periode(db, periodes[0], date(2025, 12, 20))

    def test_date_d_une_autre_periode_est_refusee_avec_la_bonne(self, db, annee_decoupee):
        """Le cas exact du bug : janvier rattaché au 1er trimestre."""
        _, periodes = annee_decoupee
        with pytest.raises(ValueError) as e:
            verifier_date_dans_periode(db, periodes[0], date(2026, 1, 20))
        message = str(e.value)
        assert "hors de 1er Trimestre" in message
        assert "2ème Trimestre" in message      # indique où elle appartient

    def test_date_hors_de_toute_periode_est_refusee(self, db, annee_decoupee):
        _, periodes = annee_decoupee
        with pytest.raises(ValueError) as e:
            verifier_date_dans_periode(db, periodes[0], date(2026, 8, 9))
        assert "aucune période" in str(e.value)

    def test_sans_periode_ou_sans_date_on_ne_bloque_pas(self, db, annee_decoupee):
        _, periodes = annee_decoupee
        verifier_date_dans_periode(db, None, date(2026, 8, 9))
        verifier_date_dans_periode(db, periodes[0], None)
