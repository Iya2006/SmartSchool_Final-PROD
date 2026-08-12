"""
Tests — rémunération : au mois au primaire, à l'heure au-delà.

Un enseignant portait UN SEUL taux horaire, le même partout : impossible
d'exprimer qu'une heure de Terminale ne se paie pas comme une heure de 7ᵉ. Et
rien ne distinguait l'instituteur payé au mois du vacataire payé à l'heure.

Ces tests fixent les deux modes, l'exception de tarif par affectation, et le
fait que les salaires ne se mélangent pas aux dépenses de fonctionnement.
"""
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models.academique import (
    Affectation, AnneeScolaire, Classe, Cycle, Depense, Enseignant,
    Etablissement, Matiere, Niveau, Utilisateur,
)
from app.services import paie

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


@pytest.fixture
def ecole(db: Session):
    """Une école avec un cycle collège, une classe, deux matières."""
    uid = _uid()
    etab = Etablissement(code=f"PAIE-{uid}", nom=f"École paie {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)

    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"PA{uid}", libelle=f"2025-2026 {uid}",
        date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1),
        statut="EN_COURS", est_courante="O",
    )
    cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CLG{uid}", libelle="Collège", ordre=2)
    db.add_all([annee, cycle]); db.commit(); db.refresh(annee); db.refresh(cycle)

    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="8ème", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)

    classe = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
        niveau_id=niveau.niveau_id, code=f"C{uid}", libelle=f"8ème A {uid}", statut="ACTIVE",
    )
    m1 = Matiere(cycle_id=cycle.cycle_id, code=f"MA{uid}", libelle="Mathématiques")
    m2 = Matiere(cycle_id=cycle.cycle_id, code=f"FR{uid}", libelle="Français")
    db.add_all([classe, m1, m2]); db.commit()
    for o in (classe, m1, m2):
        db.refresh(o)

    donnees = {"etab": etab, "annee": annee, "cycle": cycle, "niveau": niveau,
               "classe": classe, "m1": m1, "m2": m2, "uid": uid}
    yield donnees

    db.rollback()
    for modele, colonne, valeur in (
        (Affectation, Affectation.annee_id, annee.annee_id),
        (Depense, Depense.etablissement_id, etab.etablissement_id),
        (Enseignant, Enseignant.etablissement_id, etab.etablissement_id),
        (Utilisateur, Utilisateur.etablissement_id, etab.etablissement_id),
        (Classe, Classe.classe_id, classe.classe_id),
        (Matiere, Matiere.cycle_id, cycle.cycle_id),
        (Niveau, Niveau.niveau_id, niveau.niveau_id),
        (Cycle, Cycle.cycle_id, cycle.cycle_id),
        (AnneeScolaire, AnneeScolaire.annee_id, annee.annee_id),
        (Etablissement, Etablissement.etablissement_id, etab.etablissement_id),
    ):
        db.query(modele).filter(colonne == valeur).delete(synchronize_session=False)
    db.commit()


def _enseignant(db: Session, ecole, *, mode: str, taux=0, salaire=0) -> Enseignant:
    uid = _uid()
    e = Enseignant(
        etablissement_id=ecole["etab"].etablissement_id, matricule=f"PENS-{uid}",
        nom="Bah", prenom=f"Prof{uid}", sexe="M", telephone=f"62{uid:08d}",
        statut="ACTIF", mode_remuneration=mode,
        taux_horaire=taux, salaire_base=salaire,
    )
    db.add(e); db.commit(); db.refresh(e)
    return e


def _affecter(db: Session, ecole, ens, matiere, heures, taux=None) -> Affectation:
    a = Affectation(
        enseignant_id=ens.enseignant_id, matiere_id=matiere.matiere_id,
        classe_id=ecole["classe"].classe_id, annee_id=ecole["annee"].annee_id,
        nb_heures_semaine=heures, statut="ACTIVE", taux_horaire=taux,
    )
    db.add(a); db.commit(); db.refresh(a)
    return a


class TestModeHoraire:
    def test_salaire_calcule_sur_les_heures_reelles(self, db: Session, ecole):
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 6)
        _affecter(db, ecole, ens, ecole["m2"], 4)

        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["mode"] == "HORAIRE"
        assert r["total_heures"] == 10
        # 10 h × 10 000 × 4 semaines
        assert r["base"] == 400_000

    def test_taux_specifique_sur_une_affectation(self, db: Session, ecole):
        """LE cas qui justifie tout : une heure de Terminale ne se paie pas
        comme une heure de 7ᵉ."""
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 5)
        _affecter(db, ecole, ens, ecole["m2"], 5, taux=20_000)

        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        # 5×10 000×4 + 5×20 000×4
        assert r["base"] == 600_000
        specifiques = [l for l in r["lignes"] if l["taux_specifique"]]
        assert len(specifiques) == 1
        assert specifiques[0]["taux_horaire"] == 20_000

    def test_taux_zero_explicite_nest_pas_le_taux_du_prof(self, db: Session, ecole):
        """`None` et `0` ne sont pas équivalents : 0 signifie « cette heure
        n'est pas rémunérée » (bénévolat, forfait déjà couvert)."""
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 5)
        _affecter(db, ecole, ens, ecole["m2"], 5, taux=0)

        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["base"] == 200_000  # seule la première affectation est payée

    def test_sans_affectation_aucune_heure_a_remunerer(self, db: Session, ecole):
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["base"] == 0
        assert "Aucune affectation" in r["explication"]


class TestModeMensuel:
    def test_le_salaire_ne_depend_pas_des_heures(self, db: Session, ecole):
        """Un instituteur du primaire est payé au mois, quoi qu'il enseigne."""
        ens = _enseignant(db, ecole, mode="MENSUEL", taux=10_000, salaire=1_500_000)
        _affecter(db, ecole, ens, ecole["m1"], 20)

        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["mode"] == "MENSUEL"
        assert r["base"] == 1_500_000

    def test_les_heures_restent_visibles(self, db: Session, ecole):
        """L'école doit voir la charge réelle, même si elle ne détermine pas
        la paie."""
        ens = _enseignant(db, ecole, mode="MENSUEL", salaire=1_500_000)
        _affecter(db, ecole, ens, ecole["m1"], 12)
        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["total_heures"] == 12
        assert len(r["lignes"]) == 1


class TestPersonnelNonEnseignant:
    def test_salaire_mensuel_fixe_avec_prime(self, db: Session, ecole):
        uid = _uid()
        u = Utilisateur(
            etablissement_id=ecole["etab"].etablissement_id,
            nom_utilisateur=f"compta{uid}", mot_de_passe="x",
            nom="Sow", prenom="Aminata", role="COMPTABLE", statut="ACTIF",
            salaire_base=800_000, prime_mensuelle=100_000,
        )
        db.add(u); db.commit(); db.refresh(u)

        r = paie.salaire_personnel(db, u.utilisateur_id)
        assert r["mode"] == "MENSUEL"
        # La prime mensuelle est un element permanent du contrat.
        assert r["base"] == 900_000
        assert r["total_heures"] == 0


class TestNetAPayer:
    def test_decomposition_simple(self):
        r = paie.net_a_payer(base=1_000_000, primes=200_000, avances=300_000)
        assert r["brut"] == 1_200_000
        assert r["net"] == 900_000

    def test_avance_superieure_au_salaire_ne_donne_jamais_un_net_negatif(self):
        """Un net négatif serait un « paiement » que l'école devrait recevoir
        de son employé. Le reliquat est signalé, pas soustrait."""
        r = paie.net_a_payer(base=500_000, avances=800_000)
        assert r["net"] == 0
        assert r["reliquat_reporte"] == 300_000


class TestModeDeduitDesAffectations:
    """RÈGLE DE L'ÉCOLE : affecté au primaire = payé au mois. Le mode se déduit
    des affectations plutôt que d'être saisi — une case à cocher de plus serait
    une case à oublier."""

    def _cycle_primaire(self, db: Session, ecole):
        uid = _uid()
        cycle = Cycle(etablissement_id=ecole["etab"].etablissement_id,
                      code="PRM", libelle="Primaire", ordre=1)
        db.add(cycle); db.commit(); db.refresh(cycle)
        niveau = Niveau(cycle_id=cycle.cycle_id, code=f"P{uid}", libelle="6ème année", ordre=1)
        db.add(niveau); db.commit(); db.refresh(niveau)
        classe = Classe(
            etablissement_id=ecole["etab"].etablissement_id, annee_id=ecole["annee"].annee_id,
            niveau_id=niveau.niveau_id, code=f"CP{uid}", libelle=f"6ème A {uid}", statut="ACTIVE",
        )
        matiere = Matiere(cycle_id=cycle.cycle_id, code=f"LE{uid}", libelle="Lecture")
        db.add_all([classe, matiere]); db.commit()
        db.refresh(classe); db.refresh(matiere)
        return cycle, niveau, classe, matiere

    def test_affectation_au_primaire_bascule_au_mensuel(self, db: Session, ecole):
        from app.services.paie import synchroniser_mode_remuneration

        _, _, classe_prm, matiere_prm = self._cycle_primaire(db, ecole)
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)

        db.add(Affectation(
            enseignant_id=ens.enseignant_id, matiere_id=matiere_prm.matiere_id,
            classe_id=classe_prm.classe_id, annee_id=ecole["annee"].annee_id,
            nb_heures_semaine=25, statut="ACTIVE",
        ))
        db.commit()

        assert synchroniser_mode_remuneration(db, ens.enseignant_id) == "MENSUEL"
        db.commit(); db.refresh(ens)
        assert ens.mode_remuneration == "MENSUEL"

    def test_affectation_au_college_reste_a_l_heure(self, db: Session, ecole):
        from app.services.paie import synchroniser_mode_remuneration

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 6)
        assert synchroniser_mode_remuneration(db, ens.enseignant_id) == "HORAIRE"

    def test_perdre_sa_derniere_classe_de_primaire_ramene_a_l_heure(
        self, db: Session, ecole
    ):
        """Le mode doit pouvoir REVENIR en arrière : sans recalcul à la
        suppression, l'enseignant resterait au mensuel indéfiniment."""
        from app.services.paie import synchroniser_mode_remuneration

        _, _, classe_prm, matiere_prm = self._cycle_primaire(db, ecole)
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        aff = Affectation(
            enseignant_id=ens.enseignant_id, matiere_id=matiere_prm.matiere_id,
            classe_id=classe_prm.classe_id, annee_id=ecole["annee"].annee_id,
            nb_heures_semaine=25, statut="ACTIVE",
        )
        db.add(aff); db.commit()
        assert synchroniser_mode_remuneration(db, ens.enseignant_id) == "MENSUEL"
        db.commit()

        db.delete(aff); db.commit()
        assert synchroniser_mode_remuneration(db, ens.enseignant_id) == "HORAIRE"
