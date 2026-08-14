"""
Tests — un salaire d'octobre se date en octobre, et rien ne reste à moitié
enregistré.

CE QUI A ÉTÉ TROUVÉ SUR LA PAIE DE TRILLIONX
--------------------------------------------
1. La dépense, l'écriture comptable et le bulletin de paie portaient tous
   `date.today()`. Payer en retard la paie d'octobre — cas ordinaire dans une
   école qui attend les scolarités — la faisait tomber dans le mois de la
   saisie. La trésorerie montrait neuf mois de salaires versés le même jour,
   et le compte de résultat chargeait un seul mois de toute l'année.

2. Deux dépenses de salaire existaient en comptabilité SANS bulletin de paie.
   De l'argent sorti des comptes sans trace de qui l'a reçu. Cause :
   `generer_ecriture_auto` promet dans sa docstring de ne pas commiter, mais
   son propre premier appel — le seed des référentiels comptables — commitait.
   La dépense était donc validée avant l'échec, et le rollback n'avait plus
   rien à reprendre.

3. Deux endpoints de paiement gardaient `annee_id = 1` et le mode « Cash »,
   défauts déjà corrigés sur le paiement groupé mais pas ici : la charge
   partait sur l'année scolaire d'une AUTRE école, et la dépense disparaissait
   du rapprochement de caisse.
"""
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.api.finance import _jour_de_versement, _lire_date
from app.models.academique import Etablissement, JournalComptable


class TestLaDateDuVersement:
    def test_par_defaut_la_fin_du_mois_concerne(self):
        """On paie en fin de mois : c'est la pratique."""
        assert _jour_de_versement("2025-10") == date(2025, 10, 31)
        assert _jour_de_versement("2025-11") == date(2025, 11, 30)
        assert _jour_de_versement("2026-02") == date(2026, 2, 28)

    def test_une_annee_bissextile_est_correcte(self):
        assert _jour_de_versement("2024-02") == date(2024, 2, 29)

    def test_la_date_fournie_prime(self):
        """L'école a payé le 5 novembre la paie d'octobre : c'est sa date."""
        assert _jour_de_versement("2025-10", date(2025, 11, 5)) == date(2025, 11, 5)

    def test_jamais_dans_le_futur(self):
        """Un versement qui n'a pas eu lieu ne s'enregistre pas."""
        from fastapi import HTTPException

        futur = date(date.today().year + 2, 1, 15)
        with pytest.raises(HTTPException) as erreur:
            _jour_de_versement("2025-10", futur)
        assert erreur.value.status_code == 400

        # Et le défaut d'un mois à venir est ramené à aujourd'hui, jamais après.
        assert _jour_de_versement(f"{date.today().year + 2}-03") <= date.today()

    def test_un_mois_illisible_ne_fait_pas_planter_la_paie(self):
        assert _jour_de_versement("") == date.today()
        assert _jour_de_versement("octobre") == date.today()
        assert _jour_de_versement(None) == date.today()


class TestLaLectureDesDates:
    def test_formats_acceptes(self):
        assert _lire_date("2025-10-31") == date(2025, 10, 31)
        assert _lire_date("2025-10-31T08:00:00") == date(2025, 10, 31)
        assert _lire_date(date(2025, 10, 31)) == date(2025, 10, 31)

    def test_vide_vaut_absence(self):
        assert _lire_date(None) is None
        assert _lire_date("") is None

    def test_une_date_illisible_est_refusee_franchement(self):
        """Mieux vaut un refus clair qu'une date silencieusement ignorée."""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as erreur:
            _lire_date("31/10/2025")
        assert erreur.value.status_code == 400
        assert "AAAA-MM-JJ" in erreur.value.detail


class TestLeSeedComptableNeCommitePlus:
    """Sans ça, une opération métier ratée laisse sa dépense derrière elle."""

    def test_generer_ecriture_auto_ne_valide_rien_de_l_appelant(self, db: Session):
        from app.api.comptabilite import generer_ecriture_auto

        etab = Etablissement(code="ATO-1", nom="École Atomicité", type_etablissement="LYCEE")
        db.add(etab)
        db.commit()
        db.refresh(etab)

        # On commence une opération métier : on écrit quelque chose, puis on
        # génère l'écriture — c'est là que le seed s'exécutait et commitait.
        temoin = Etablissement(code="ATO-TEMOIN", nom="Témoin", type_etablissement="LYCEE")
        db.add(temoin)
        db.flush()

        generer_ecriture_auto(
            db, date_ecriture=date(2025, 10, 31), journal_code="OD",
            libelle="Salaire test", reference="SAL-TEST",
            lignes=[
                {"compte": ("6611", "Salaires", "CHARGE"), "debit": 1000, "credit": 0},
                {"compte": ("5211", "Banque locale", "ACTIF"), "debit": 0, "credit": 1000},
            ],
            etablissement_id=etab.etablissement_id,
        )

        # L'opération échoue : on annule tout.
        db.rollback()

        # Le témoin ne doit plus exister. S'il est encore là, c'est qu'un
        # commit a eu lieu au milieu — et une dépense de salaire survivrait
        # de la même façon à l'échec de son bulletin de paie.
        reste = db.query(Etablissement).filter(
            Etablissement.code == "ATO-TEMOIN"
        ).first()
        assert reste is None

    def test_le_seed_reste_persistant_quand_on_le_demande(self, db: Session):
        """Les routes de consultation, elles, doivent bien écrire le référentiel."""
        from app.api.comptabilite import init_comptabilite_globals

        init_comptabilite_globals(db)  # commit=True par défaut
        db.rollback()  # même après annulation, le référentiel doit rester
        assert db.query(JournalComptable).count() > 0
