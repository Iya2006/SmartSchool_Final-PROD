"""
Tests — les chiffres de la comptabilité sont justes, et ne franchissent pas
la frontière entre écoles.

Un tableau de bord financier faux est pire qu'absent : le directeur prend des
décisions dessus. Ces tests recalculent les montants depuis les données brutes
et vérifient que les écrans affichent exactement la même chose.

Ils verrouillent aussi la question qui n'avait jamais été posée à ce module :
un comptable voit-il uniquement l'argent de SON école ?
"""
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.api import finance as F
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, Paiement, TypeFrais,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    """Une école avec une facture réglée en partie — le cas courant."""

    def __init__(self, db: Session, suffixe: str, du: float, paye: float):
        uid = _uid()
        self.etab = Etablissement(code=f"CPT-{suffixe}-{uid}", nom=f"École {suffixe} {uid}",
                                  type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)
        e = self.etab.etablissement_id

        self.annee = AnneeScolaire(
            etablissement_id=e, code=f"CAN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
        )
        self.cycle = Cycle(etablissement_id=e, code=f"CCY{uid}", libelle="Secondaire", ordre=1)
        db.add_all([self.annee, self.cycle]); db.commit()
        db.refresh(self.annee); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"CNV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=e, annee_id=self.annee.annee_id, niveau_id=self.niveau.niveau_id,
            code=f"CCL{uid}", libelle=f"6e A {uid}", statut="ACTIVE",
        )
        self.eleve = Eleve(
            etablissement_id=e, matricule=f"CELV-{uid}", nom="Diallo", prenom="Aissata",
            date_naissance=date(2012, 5, 4), sexe="F", statut="ACTIF",
        )
        # Un type de frais PAR ÉCOLE (migration 2026_08_compta_01).
        self.type_frais = TypeFrais(
            etablissement_id=e, code=f"SC{uid}", libelle="Scolarité",
            categorie="SCOLARITE", montant_defaut=du,
        )
        db.add_all([self.classe, self.eleve, self.type_frais]); db.commit()
        for o in (self.classe, self.eleve, self.type_frais):
            db.refresh(o)

        self.inscription = Inscription(
            eleve_id=self.eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(self.inscription); db.commit(); db.refresh(self.inscription)

        self.facture = Facture(
            inscription_id=self.inscription.inscription_id,
            type_frais_id=self.type_frais.type_frais_id,
            annee_id=self.annee.annee_id, numero_facture=f"FCT-{uid}",
            date_facture=date(2025, 10, 1),
            montant_total=du, montant_net=du, montant_paye=paye,
            montant_restant=du - paye,
            statut="PAYEE" if paye >= du else "PARTIELLE",
        )
        db.add(self.facture); db.commit(); db.refresh(self.facture)

        if paye:
            db.add(Paiement(
                facture_id=self.facture.facture_id, montant=paye,
                date_paiement=date(2025, 10, 5), mode_paiement="ESPECES",
                numero_recu=f"REC-{uid}", statut="VALIDE",
            ))
            db.commit()

        self.du, self.paye = du, paye


@pytest.fixture
def deux_ecoles(db: Session):
    a = Ecole(db, "A", du=1_000_000, paye=400_000)
    b = Ecole(db, "B", du=5_000_000, paye=5_000_000)
    yield a, b
    for ec in (a, b):
        db.query(Paiement).filter(Paiement.facture_id == ec.facture.facture_id).delete(
            synchronize_session=False)
        for modele, colonne, valeur in (
            (Facture, Facture.facture_id, ec.facture.facture_id),
            (Inscription, Inscription.inscription_id, ec.inscription.inscription_id),
            (TypeFrais, TypeFrais.type_frais_id, ec.type_frais.type_frais_id),
            (Eleve, Eleve.eleve_id, ec.eleve.eleve_id),
            (Classe, Classe.classe_id, ec.classe.classe_id),
            (Niveau, Niveau.niveau_id, ec.niveau.niveau_id),
            (Cycle, Cycle.cycle_id, ec.cycle.cycle_id),
            (AnneeScolaire, AnneeScolaire.annee_id, ec.annee.annee_id),
            (Etablissement, Etablissement.etablissement_id, ec.etab.etablissement_id),
        ):
            db.query(modele).filter(colonne == valeur).delete(synchronize_session=False)
        db.commit()


class TestChiffresJustes:
    def test_le_tableau_de_bord_affiche_les_vrais_montants(self, db: Session, deux_ecoles):
        """Un tableau de bord faux est pire qu'absent : on décide dessus."""
        a, _ = deux_ecoles
        kpis = F.dashboard_financier(db=db, etablissement_id=a.etab.etablissement_id)["kpis"]

        assert kpis["total_facture"] == a.du
        assert kpis["total_paye"] == a.paye
        assert kpis["total_restant"] == a.du - a.paye

    def test_facture_egale_paye_plus_restant(self, db: Session, deux_ecoles):
        """La règle qui doit toujours tenir, quel que soit le chemin de calcul."""
        for ecole in deux_ecoles:
            s = F.stats_factures(db=db, etablissement_id=ecole.etab.etablissement_id)
            assert abs(s["total_facture"] - s["total_paye"] - s["total_restant"]) < 0.01

    def test_taux_de_recouvrement_coherent(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        assert F.stats_factures(db=db, etablissement_id=a.etab.etablissement_id)["taux_recouvrement"] == 40.0
        # École B a tout réglé : 100 %, pas 99,9 ni 100,1.
        assert F.stats_factures(db=db, etablissement_id=b.etab.etablissement_id)["taux_recouvrement"] == 100.0


class TestIsolationDesChiffres:
    def test_chaque_ecole_ne_voit_que_son_argent(self, db: Session, deux_ecoles):
        """LE test du module : le montant de l'une ne doit jamais apparaître
        dans le tableau de bord de l'autre."""
        a, b = deux_ecoles
        kpis_a = F.dashboard_financier(db=db, etablissement_id=a.etab.etablissement_id)["kpis"]
        kpis_b = F.dashboard_financier(db=db, etablissement_id=b.etab.etablissement_id)["kpis"]

        assert kpis_a["total_facture"] == a.du
        assert kpis_b["total_facture"] == b.du
        # Ni l'un ni l'autre ne porte la somme des deux.
        assert kpis_a["total_facture"] != a.du + b.du
        assert kpis_b["total_facture"] != a.du + b.du

    def test_la_solvabilite_ne_liste_que_ses_eleves(self, db: Session, deux_ecoles):
        a, b = deux_ecoles
        lignes_a = F.tableau_solvabilite(db=db, etablissement_id=a.etab.etablissement_id)
        ids = {l["eleve_id"] for l in lignes_a}
        assert a.eleve.eleve_id in ids
        assert b.eleve.eleve_id not in ids

    def test_les_types_de_frais_ne_debordent_pas(self, db: Session, deux_ecoles):
        """Ils étaient partagés : une école renommant « Scolarité » changeait
        l'intitulé des factures de toutes les autres."""
        a, b = deux_ecoles
        types_a = F.list_types_frais(db=db, etablissement_id=a.etab.etablissement_id)
        codes_a = {t.code for t in types_a}
        assert a.type_frais.code in codes_a
        assert b.type_frais.code not in codes_a

    def test_le_recu_d_une_autre_ecole_est_introuvable(self, db: Session, deux_ecoles):
        """Un reçu porte le nom d'un élève et un montant : il ne sort jamais
        de son école."""
        from fastapi import HTTPException

        a, b = deux_ecoles
        paiement = db.query(Paiement).filter(
            Paiement.facture_id == b.facture.facture_id
        ).first()
        assert paiement is not None

        with pytest.raises(HTTPException) as exc:
            F.get_recu(paiement_id=paiement.paiement_id, db=db,
                       etablissement_id=a.etab.etablissement_id)
        # 404 et non 403 : on ne confirme pas l'existence du paiement d'à côté.
        assert exc.value.status_code == 404
