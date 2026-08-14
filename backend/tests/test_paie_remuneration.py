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
    Affectation, AnneeScolaire, Classe, CreneauEmploi, Cycle, Depense, Eleve,
    Enseignant, Etablissement, Facture, Inscription, Matiere, Niveau, Paiement,
    TypeFrais, Utilisateur,
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
        (CreneauEmploi, CreneauEmploi.annee_id, annee.annee_id),
        (Facture, Facture.annee_id, annee.annee_id),
        (Inscription, Inscription.annee_id, annee.annee_id),
        (Eleve, Eleve.etablissement_id, etab.etablissement_id),
        (TypeFrais, TypeFrais.etablissement_id, etab.etablissement_id),
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


def _alimenter_la_caisse(db: Session, ecole, montant: float = 5_000_000) -> None:
    """Une ecole ne paie pas ses salaires avec une caisse vide.

    Le logiciel refuse desormais un versement superieur au solde disponible
    (encaissements moins depenses). C'est la bonne regle — mais elle suppose
    qu'une ecole de test ait encaisse quelque chose avant de payer, ce que
    ces scenarios ne faisaient pas : ils recrutaient et payaient sans qu'un
    seul franc soit jamais entre.
    """
    eleve = Eleve(
        matricule=f"CAISSE{_uid()}", nom="Bah", prenom="Tresorerie", sexe="M",
        date_naissance=date(2010, 1, 1), etablissement_id=ecole["etab"].etablissement_id,
        statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)
    insc = Inscription(
        eleve_id=eleve.eleve_id, classe_id=ecole["classe"].classe_id,
        annee_id=ecole["annee"].annee_id, statut="ACTIVE",
    )
    db.add(insc); db.commit(); db.refresh(insc)
    facture = Facture(
        inscription_id=insc.inscription_id, annee_id=ecole["annee"].annee_id,
        numero_facture=f"FCAISSE{_uid()}", montant_total=montant, montant_net=montant,
        montant_paye=montant, montant_restant=0, statut="PAYEE",
    )
    db.add(facture); db.commit(); db.refresh(facture)
    db.add(Paiement(
        facture_id=facture.facture_id, annee_id=ecole["annee"].annee_id,
        numero_recu=f"RCAISSE{_uid()}", montant=montant, mode_paiement="ESPECES",
        date_paiement=date(2025, 10, 1), statut="VALIDE",
    ))
    db.commit()


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

    def test_sans_affectation_ni_salaire_saisi_il_ny_a_rien_a_verser(self, db: Session, ecole):
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["base"] == 0
        assert "Aucune heure affectée" in r["explication"]

    def test_sans_affectation_le_montant_saisi_sur_la_fiche_fait_foi(self, db: Session, ecole):
        """Un salaire mensuel écrit sur la fiche ne doit pas tomber à zéro.

        Le mode par défaut est HORAIRE : tout enseignant saisi avant l'arrivée
        du calcul horaire le porte, y compris ceux à qui l'école a négocié un
        forfait mensuel. S'en tenir aux heures ferait disparaître leur paie
        sans le moindre message.
        """
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=0, salaire=1_500_000)
        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["base"] == 1_500_000
        assert r["mode"] == paie.MODE_MENSUEL
        assert "fiche" in r["explication"]

    def test_des_qu_il_a_des_heures_ce_sont_elles_qui_comptent(self, db: Session, ecole):
        """Le repli sur la fiche ne s'applique QUE faute d'heures."""
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000, salaire=1_500_000)
        _affecter(db, ecole, ens, ecole["m1"], 5)
        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["base"] == 200_000
        assert r["mode"] == paie.MODE_HORAIRE


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


class TestPersonneNeDisparaitDeLaPaie:
    """La paie ne doit jamais faire disparaître quelqu'un en silence.

    Trois mécanismes l'ont fait, chacun pour une raison différente :
    un filtre `salaire_base > 0` qui écartait tout vacataire, un
    `except: continue` qui supprimait la ligne dont le calcul échouait, et un
    `except: pass` qui annonçait « 3 salaires payés » sans dire que deux
    autres n'étaient pas passés. Dans les trois cas, un employé impayé
    n'apparaissait nulle part — pas même comme impayé.
    """

    def test_un_vacataire_sans_montant_reste_dans_la_liste(self, db: Session, ecole):
        from app.api.finance import _lister_employes_actifs

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=0, salaire=0)
        refs = _lister_employes_actifs(db, ecole["etab"].etablissement_id)
        assert f"ENS_{ens.enseignant_id}" in refs

    def test_le_super_admin_nest_pas_un_salarie_de_lecole(self, db: Session, ecole):
        from app.api.finance import _lister_employes_actifs

        uid = _uid()
        patron = Utilisateur(
            nom="Editeur", prenom=f"Plateforme{uid}", nom_utilisateur=f"sa.paie.{uid}",
            email=f"sa.paie.{uid}@smartschool.gn", telephone=f"63{uid:08d}",
            mot_de_passe="x", role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=ecole["etab"].etablissement_id, salaire_base=9_000_000,
        )
        db.add(patron); db.commit(); db.refresh(patron)

        refs = _lister_employes_actifs(db, ecole["etab"].etablissement_id)
        assert f"PERS_{patron.utilisateur_id}" not in refs

    def test_le_calcul_du_mois_liste_tout_le_monde_avec_son_montant(
        self, db: Session, ecole
    ):
        from app.api.finance import calculer_salaires_endpoint

        paye_a_l_heure = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, paye_a_l_heure, ecole["m1"], 5)
        sans_rien = _enseignant(db, ecole, mode="HORAIRE", taux=0, salaire=0)

        lignes = calculer_salaires_endpoint(
            mois_concerne="2026-01", db=db,
            etablissement_id=ecole["etab"].etablissement_id,
        )
        par_ref = {l["employe_id"]: l for l in lignes}

        # Le vacataire touche ses heures : 5 h × 10 000 × 4 semaines.
        assert par_ref[f"ENS_{paye_a_l_heure.enseignant_id}"]["net_a_payer"] == 200_000
        assert par_ref[f"ENS_{paye_a_l_heure.enseignant_id}"]["mode_remuneration"] == "HORAIRE"

        # Celui dont rien n'est renseigné reste visible, à zéro : c'est un
        # montant à compléter, pas un employé à effacer.
        assert f"ENS_{sans_rien.enseignant_id}" in par_ref
        assert par_ref[f"ENS_{sans_rien.enseignant_id}"]["net_a_payer"] == 0

    def test_le_paiement_groupe_rend_compte_de_ce_qui_nest_pas_passe(
        self, db: Session, ecole
    ):
        from app.api.finance import payer_group_endpoint

        _alimenter_la_caisse(db, ecole)
        payable = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, payable, ecole["m1"], 5)
        sans_rien = _enseignant(db, ecole, mode="HORAIRE", taux=0, salaire=0)

        res = payer_group_endpoint(
            mois_concerne="2026-01", mode_paiement="Cash", db=db,
            etablissement_id=ecole["etab"].etablissement_id,
        )
        assert len(res["payes"]) == 1
        assert res["total_verse"] == 200_000
        # Celui sans montant n'est pas « payé », mais il est nommé et motivé.
        assert any(sans_rien.nom in i["nom"] for i in res["ignores"])
        assert "sans rien à verser" in res["message"] or "sans rien a verser" in res["message"]

    def test_le_paiement_groupe_utilise_lannee_de_cette_ecole(self, db: Session, ecole):
        """`annee_id=1` était codé en dur : l'école n°37 enregistrait ses
        dépenses de salaires sur l'année scolaire de la première école."""
        from app.api.finance import payer_group_endpoint

        _alimenter_la_caisse(db, ecole)
        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 5)

        payer_group_endpoint(
            mois_concerne="2026-02", mode_paiement="Cash", db=db,
            etablissement_id=ecole["etab"].etablissement_id,
        )
        depenses = db.query(Depense).filter(
            Depense.etablissement_id == ecole["etab"].etablissement_id,
            Depense.categorie == "SALAIRES",
        ).all()
        assert depenses
        assert all(d.annee_id == ecole["annee"].annee_id for d in depenses)


class TestHeuresAffectation:
    """Les heures d'une affectation SONT le salaire d'un vacataire.

    Elles n'étaient modifiables par aucune route : la seule façon de corriger
    une erreur de saisie était de supprimer l'affectation et de la recréer, ce
    qui faisait perdre au passage le tarif spécifique posé dessus.
    """

    def test_corriger_les_heures_change_le_salaire(self, db: Session, ecole):
        from app.api.enseignants import modifier_affectation

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        aff = _affecter(db, ecole, ens, ecole["m1"], 4)
        avant = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert avant["base"] == 160_000  # 4 × 10 000 × 4 semaines

        modifier_affectation(
            affectation_id=aff.affectation_id, data={"nb_heures_semaine": 6},
            db=db, etablissement_id=ecole["etab"].etablissement_id,
        )
        apres = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert apres["base"] == 240_000

    def test_le_tarif_specifique_survit_a_la_correction_des_heures(
        self, db: Session, ecole
    ):
        """C'est tout l'intérêt d'avoir une route de modification : passer par
        supprimer-puis-recréer effaçait l'exception de tarif."""
        from app.api.enseignants import modifier_affectation

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        aff = _affecter(db, ecole, ens, ecole["m1"], 4, taux=30_000)

        modifier_affectation(
            affectation_id=aff.affectation_id, data={"nb_heures_semaine": 5},
            db=db, etablissement_id=ecole["etab"].etablissement_id,
        )
        db.refresh(aff)
        assert aff.taux_horaire == 30_000
        r = paie.salaire_enseignant(db, ens.enseignant_id, ecole["annee"].annee_id)
        assert r["base"] == 600_000  # 5 × 30 000 × 4

    def test_une_saisie_aberrante_est_refusee(self, db: Session, ecole):
        """Une faute de frappe sur les heures gonfle directement la paie."""
        from fastapi import HTTPException

        from app.api.enseignants import modifier_affectation

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        aff = _affecter(db, ecole, ens, ecole["m1"], 4)

        for valeur in (-1, 500):
            with pytest.raises(HTTPException) as e:
                modifier_affectation(
                    affectation_id=aff.affectation_id,
                    data={"nb_heures_semaine": valeur},
                    db=db, etablissement_id=ecole["etab"].etablissement_id,
                )
            assert e.value.status_code == 400

    def test_l_affectation_d_une_autre_ecole_est_introuvable(self, db: Session, ecole):
        """404, jamais 403 : confirmer l'existence renseignerait déjà."""
        from fastapi import HTTPException

        from app.api.enseignants import modifier_affectation

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        aff = _affecter(db, ecole, ens, ecole["m1"], 4)

        with pytest.raises(HTTPException) as e:
            modifier_affectation(
                affectation_id=aff.affectation_id, data={"nb_heures_semaine": 6},
                db=db, etablissement_id=ecole["etab"].etablissement_id + 99_999,
            )
        assert e.value.status_code == 404


class TestFacturesRattacheesARien:
    """Une facture sans type de frais n'apparaît sous aucun intitulé.

    Le total « recettes par type de frais » l'ignore purement et simplement,
    alors que l'argent a bien été encaissé. La base en comptait 45.
    """

    def _facture_orpheline(self, db: Session, ecole, montant=1_500_000):
        from app.models.academique import Eleve, Facture, Inscription

        uid = _uid()
        eleve = Eleve(
            etablissement_id=ecole["etab"].etablissement_id, matricule=f"FORPH-{uid}",
            nom="Diallo", prenom=f"Eleve{uid}", sexe="F", statut="ACTIF",
            date_naissance=date(2012, 3, 15),
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=ecole["classe"].classe_id,
            annee_id=ecole["annee"].annee_id, statut="ACTIVE",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        f = Facture(
            inscription_id=insc.inscription_id, annee_id=ecole["annee"].annee_id,
            type_frais_id=None, numero_facture=f"FORPH-{uid}",
            montant_total=montant, montant_net=montant, montant_paye=0,
            montant_restant=montant, statut="EN_ATTENTE",
        )
        db.add(f); db.commit(); db.refresh(f)
        return f

    def _type_frais(self, db: Session, ecole, libelle="Scolarité"):
        from app.models.academique import TypeFrais

        uid = _uid()
        t = TypeFrais(
            etablissement_id=ecole["etab"].etablissement_id, code=f"TF{uid}",
            libelle=libelle, categorie="Scolarité", frequence="ANNUEL",
            montant_defaut=0, est_obligatoire="O",
        )
        db.add(t); db.commit(); db.refresh(t)
        return t

    def test_les_orphelines_sont_listees_avec_leur_montant(self, db: Session, ecole):
        from app.api.finance import factures_sans_type

        f = self._facture_orpheline(db, ecole)
        res = factures_sans_type(db=db, etablissement_id=ecole["etab"].etablissement_id)
        assert res["total"] == 1
        assert res["montant_total"] == 1_500_000
        assert res["factures"][0]["facture_id"] == f.facture_id

    def test_rattacher_range_enfin_la_recette_sous_un_intitule(self, db: Session, ecole):
        from app.api.finance import RattachementFactures, rattacher_factures_a_un_type

        f = self._facture_orpheline(db, ecole)
        t = self._type_frais(db, ecole)

        res = rattacher_factures_a_un_type(
            data=RattachementFactures(facture_ids=[f.facture_id], type_frais_id=t.type_frais_id),
            db=db, etablissement_id=ecole["etab"].etablissement_id,
        )
        assert res["rattachees"] == 1
        db.refresh(f)
        assert f.type_frais_id == t.type_frais_id

    def test_une_facture_deja_rattachee_nest_jamais_deplacee(self, db: Session, ecole):
        """Réaffecter déplacerait une recette déjà comptabilisée d'un intitulé
        à un autre, sans laisser de trace. Ce n'est pas une correction."""
        from app.api.finance import RattachementFactures, rattacher_factures_a_un_type

        f = self._facture_orpheline(db, ecole)
        premier = self._type_frais(db, ecole, "Scolarité")
        second = self._type_frais(db, ecole, "Cantine")

        rattacher_factures_a_un_type(
            data=RattachementFactures(facture_ids=[f.facture_id], type_frais_id=premier.type_frais_id),
            db=db, etablissement_id=ecole["etab"].etablissement_id,
        )
        res = rattacher_factures_a_un_type(
            data=RattachementFactures(facture_ids=[f.facture_id], type_frais_id=second.type_frais_id),
            db=db, etablissement_id=ecole["etab"].etablissement_id,
        )
        assert res["rattachees"] == 0
        assert res["ignorees"] == 1
        db.refresh(f)
        assert f.type_frais_id == premier.type_frais_id

    def test_le_type_de_frais_dune_autre_ecole_est_introuvable(self, db: Session, ecole):
        """Le type de frais appartient à une école : facturer avec celui d'une
        autre ferait porter à la facture le libellé d'un établissement tiers."""
        from fastapi import HTTPException

        from app.api.finance import RattachementFactures, rattacher_factures_a_un_type

        f = self._facture_orpheline(db, ecole)
        t = self._type_frais(db, ecole)

        with pytest.raises(HTTPException) as e:
            rattacher_factures_a_un_type(
                data=RattachementFactures(facture_ids=[f.facture_id], type_frais_id=t.type_frais_id),
                db=db, etablissement_id=ecole["etab"].etablissement_id + 99_999,
            )
        assert e.value.status_code == 404


class TestHeuresManqueesAuSecondaire:
    """Un vacataire n'est pas payé pour être là, mais pour les heures qu'il donne.

    La retenue d'absence valait partout `salaire ÷ 26 × jours absents`. Pour un
    instituteur au mois c'est juste. Pour un professeur du collège ou du lycée,
    ça retenait la même somme un mardi à deux heures de cours et un jeudi à six.
    """

    def _creneau(self, db: Session, ecole, ens, matiere, jour, debut, fin):
        from app.models.academique import CreneauEmploi

        c = CreneauEmploi(
            classe_id=ecole["classe"].classe_id, matiere_id=matiere.matiere_id,
            enseignant_id=ens.enseignant_id, jour=jour,
            heure_debut=debut, heure_fin=fin,
            annee_id=ecole["annee"].annee_id, statut="ACTIVE",
        )
        db.add(c); db.commit()
        return c

    def test_la_retenue_vaut_les_heures_du_jour_manque(self, db: Session, ecole):
        from app.services.paie import heures_manquees

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 4)
        # Mardi : deux heures. Jeudi : une seule.
        self._creneau(db, ecole, ens, ecole["m1"], "MARDI", "08:00", "09:00")
        self._creneau(db, ecole, ens, ecole["m1"], "MARDI", "09:00", "10:00")
        self._creneau(db, ecole, ens, ecole["m1"], "JEUDI", "10:00", "11:00")

        mardi = date(2026, 3, 3)   # un mardi
        jeudi = date(2026, 3, 5)   # un jeudi
        assert heures_manquees(db, ens.enseignant_id, [mardi],
                               ecole["annee"].annee_id)["montant"] == 20_000
        assert heures_manquees(db, ens.enseignant_id, [jeudi],
                               ecole["annee"].annee_id)["montant"] == 10_000

    def test_un_creneau_de_deux_heures_compte_pour_deux(self, db: Session, ecole):
        """08:00–10:00 vaut deux heures. Compter « un créneau » en retiendrait
        la moitié."""
        from app.services.paie import heures_manquees

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 2)
        self._creneau(db, ecole, ens, ecole["m1"], "LUNDI", "08:00", "10:00")

        r = heures_manquees(db, ens.enseignant_id, [date(2026, 3, 2)],
                            ecole["annee"].annee_id)
        assert r["heures"] == 2
        assert r["montant"] == 20_000

    def test_le_tarif_specifique_de_la_classe_est_celui_retenu(
        self, db: Session, ecole
    ):
        """Une heure de Terminale ne se retient pas au prix d'une heure de 7ᵉ."""
        from app.services.paie import heures_manquees

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m2"], 2, taux=30_000)
        self._creneau(db, ecole, ens, ecole["m2"], "LUNDI", "08:00", "09:00")

        r = heures_manquees(db, ens.enseignant_id, [date(2026, 3, 2)],
                            ecole["annee"].annee_id)
        assert r["montant"] == 30_000

    def test_absent_un_jour_sans_cours_ne_coute_rien(self, db: Session, ecole):
        """Le taux journalier retenait une journée entière même quand le
        professeur n'avait aucun cours ce jour-là."""
        from app.services.paie import heures_manquees

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 2)
        self._creneau(db, ecole, ens, ecole["m1"], "LUNDI", "08:00", "09:00")

        r = heures_manquees(db, ens.enseignant_id, [date(2026, 3, 4)],  # mercredi
                            ecole["annee"].annee_id)
        assert r["heures"] == 0
        assert r["montant"] == 0

    def test_la_retenue_est_detaillee_ligne_par_ligne(self, db: Session, ecole):
        """Une retenue de salaire se conteste : sans détail, elle n'est pas
        vérifiable."""
        from app.services.paie import heures_manquees

        ens = _enseignant(db, ecole, mode="HORAIRE", taux=10_000)
        _affecter(db, ecole, ens, ecole["m1"], 2)
        self._creneau(db, ecole, ens, ecole["m1"], "MARDI", "08:00", "09:00")

        r = heures_manquees(db, ens.enseignant_id, [date(2026, 3, 3)],
                            ecole["annee"].annee_id)
        assert len(r["lignes"]) == 1
        ligne = r["lignes"][0]
        assert ligne["classe"] and ligne["matiere"]
        assert ligne["creneau"] == "08:00–09:00"
        assert ligne["taux_horaire"] == 10_000
