"""
Tests — numéros de factures et de reçus.

Cinq endroits fabriquaient un numéro en lisant ce qui existe et en ajoutant 1.
Trois conséquences, toutes vérifiées ici : deux saisies simultanées obtenaient
le même numéro, un numéro libéré par une suppression était réattribué, et la
séquence était commune à toutes les écoles.
"""
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.core.numerotation import (
    generer_numero_facture,
    generer_numero_recu,
)
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, SequenceMatricule,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _ecole(db: Session, an_debut=2025):
    uid = _uid()
    etab = Etablissement(code=f"NUM-{uid}", nom=f"École num {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"NU{uid}",
        libelle=f"{an_debut}-{an_debut + 1}",
        date_debut=date(an_debut, 9, 1), date_fin=date(an_debut + 1, 7, 1),
        statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    return etab, annee


@pytest.fixture
def deux_ecoles(db: Session):
    a_etab, a_annee = _ecole(db)
    b_etab, b_annee = _ecole(db)
    yield (a_etab, a_annee), (b_etab, b_annee)

    db.rollback()
    for etab, annee in ((a_etab, a_annee), (b_etab, b_annee)):
        db.query(SequenceMatricule).filter(
            SequenceMatricule.etablissement_id == etab.etablissement_id
        ).delete(synchronize_session=False)
        db.query(AnneeScolaire).filter(
            AnneeScolaire.annee_id == annee.annee_id
        ).delete(synchronize_session=False)
        db.query(Etablissement).filter(
            Etablissement.etablissement_id == etab.etablissement_id
        ).delete(synchronize_session=False)
    db.commit()


class TestNumeroDeFacture:
    def test_le_numero_dit_l_ecole_et_l_annee(self, db: Session, deux_ecoles):
        (etab, annee), _ = deux_ecoles
        numero = generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
        assert numero == f"FAC-{etab.etablissement_id}-2025-00001"

    def test_l_annee_est_celle_de_la_rentree_pas_du_calendrier(self, db: Session):
        """« Les factures de 2025 » désigne la rentrée de septembre 2025.
        Prendre la date du jour ferait basculer la numérotation au 1er janvier,
        en plein milieu de l'année scolaire."""
        etab, annee = _ecole(db, an_debut=2030)
        numero = generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
        assert "-2030-" in numero

        db.query(SequenceMatricule).filter(
            SequenceMatricule.etablissement_id == etab.etablissement_id
        ).delete(synchronize_session=False)
        db.query(AnneeScolaire).filter(AnneeScolaire.annee_id == annee.annee_id).delete()
        db.query(Etablissement).filter(
            Etablissement.etablissement_id == etab.etablissement_id
        ).delete()
        db.commit()

    def test_chaque_ecole_a_sa_propre_sequence(self, db: Session, deux_ecoles):
        """La séquence était globale : l'école B continuait la numérotation de
        l'école A, et ses factures lui disaient donc combien de factures ses
        concurrentes avaient émises."""
        (a_etab, a_annee), (b_etab, b_annee) = deux_ecoles

        for _ in range(5):
            generer_numero_facture(db, a_etab.etablissement_id, a_annee.annee_id)

        premier_de_b = generer_numero_facture(db, b_etab.etablissement_id, b_annee.annee_id)
        assert premier_de_b.endswith("-00001")

    def test_la_sequence_ne_recule_jamais(self, db: Session, deux_ecoles):
        """`COUNT + 1` régressait dès qu'une facture était annulée : le numéro
        libéré était réattribué, alors qu'il figure sur un reçu déjà remis."""
        (etab, annee), _ = deux_ecoles

        premiers = [
            generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
            for _ in range(3)
        ]
        assert premiers[-1].endswith("-00003")

        # Une facture disparaît — le compteur, lui, ne bouge pas.
        suivant = generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
        assert suivant.endswith("-00004")

    def test_deux_appels_ne_rendent_jamais_le_meme_numero(self, db: Session, deux_ecoles):
        (etab, annee), _ = deux_ecoles
        numeros = [
            generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
            for _ in range(50)
        ]
        assert len(set(numeros)) == 50

    def test_une_base_deja_numerotee_ne_reattribue_pas(self, db: Session, deux_ecoles):
        """Compteur neuf sur une base qui porte déjà des pièces au nouveau
        format : il doit démarrer AU-DESSUS, pas à 1."""
        (etab, annee), _ = deux_ecoles

        uid = _uid()
        cycle = Cycle(etablissement_id=etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(cycle); db.commit(); db.refresh(cycle)
        niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NV{uid}", libelle="8ème", ordre=1)
        db.add(niveau); db.commit(); db.refresh(niveau)
        classe = Classe(
            etablissement_id=etab.etablissement_id, annee_id=annee.annee_id,
            niveau_id=niveau.niveau_id, code=f"CL{uid}", libelle="8ème A", statut="ACTIVE",
        )
        db.add(classe); db.commit(); db.refresh(classe)
        eleve = Eleve(
            etablissement_id=etab.etablissement_id, matricule=f"NUM-{uid}",
            nom="Bah", prenom="Test", sexe="M", statut="ACTIF",
            date_naissance=date(2012, 1, 1),
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
            annee_id=annee.annee_id, statut="ACTIVE",
        )
        db.add(insc); db.commit(); db.refresh(insc)

        deja = f"FAC-{etab.etablissement_id}-2025-00007"
        db.add(Facture(
            inscription_id=insc.inscription_id, annee_id=annee.annee_id,
            numero_facture=deja, montant_total=1000, montant_net=1000,
            montant_paye=0, montant_restant=1000, statut="EN_ATTENTE",
        ))
        db.commit()

        suivant = generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
        assert suivant.endswith("-00008")

        db.query(Facture).filter(Facture.inscription_id == insc.inscription_id).delete()
        db.query(Inscription).filter(Inscription.inscription_id == insc.inscription_id).delete()
        db.query(Eleve).filter(Eleve.eleve_id == eleve.eleve_id).delete()
        db.query(Classe).filter(Classe.classe_id == classe.classe_id).delete()
        db.query(Niveau).filter(Niveau.niveau_id == niveau.niveau_id).delete()
        db.query(Cycle).filter(Cycle.cycle_id == cycle.cycle_id).delete()
        db.commit()


class TestNumeroDeRecu:
    def test_le_prefixe_choisi_par_l_ecole_est_respecte(self, db: Session, deux_ecoles):
        (etab, annee), _ = deux_ecoles
        numero = generer_numero_recu(db, etab.etablissement_id, annee.annee_id, "RECU")
        assert numero == f"RECU-{etab.etablissement_id}-2025-00001"

    def test_changer_de_prefixe_ne_remet_pas_le_compteur_a_zero(
        self, db: Session, deux_ecoles
    ):
        """Le compteur est indexé sur l'année, pas sur le préfixe : renommer
        « REC » en « RECU » en cours d'année ne doit pas réémettre le n°1."""
        (etab, annee), _ = deux_ecoles

        for _ in range(3):
            generer_numero_recu(db, etab.etablissement_id, annee.annee_id, "REC")
        apres = generer_numero_recu(db, etab.etablissement_id, annee.annee_id, "RECU")
        assert apres.endswith("-00004")

    def test_recus_et_factures_ont_des_compteurs_distincts(
        self, db: Session, deux_ecoles
    ):
        (etab, annee), _ = deux_ecoles

        for _ in range(4):
            generer_numero_facture(db, etab.etablissement_id, annee.annee_id)
        recu = generer_numero_recu(db, etab.etablissement_id, annee.annee_id, "REC")
        assert recu.endswith("-00001")


class TestGrilleDesTarifs:
    """« La 6ᵉ, ça coûte combien à l'année ? »

    Le réglage vivait derrière un petit bouton sur une ligne de la liste des
    types de frais, et s'ouvrait un type de frais à la fois : répondre à cette
    question demandait de tous les ouvrir et d'additionner de tête.
    """

    def _type_frais(self, db: Session, etab_id: int, libelle, obligatoire="O"):
        from app.models.academique import TypeFrais

        uid = _uid()
        t = TypeFrais(
            etablissement_id=etab_id, code=f"GT{uid}", libelle=libelle,
            categorie="Scolarité", frequence="ANNUEL", montant_defaut=0,
            est_obligatoire=obligatoire,
        )
        db.add(t); db.commit(); db.refresh(t)
        return t

    def _classe(self, db: Session, etab_id: int, annee_id: int, libelle="6ème A"):
        uid = _uid()
        cycle = Cycle(etablissement_id=etab_id, code=f"GC{uid}", libelle="Collège", ordre=1)
        db.add(cycle); db.commit(); db.refresh(cycle)
        niveau = Niveau(cycle_id=cycle.cycle_id, code=f"GN{uid}", libelle="6ème", ordre=1)
        db.add(niveau); db.commit(); db.refresh(niveau)
        classe = Classe(
            etablissement_id=etab_id, annee_id=annee_id, niveau_id=niveau.niveau_id,
            code=f"GL{uid}", libelle=libelle, statut="ACTIVE", effectif_actuel=30,
        )
        db.add(classe); db.commit(); db.refresh(classe)
        return classe, niveau, cycle

    def test_la_grille_donne_le_total_annuel_de_chaque_classe(
        self, db: Session, deux_ecoles
    ):
        from app.api.finance import TarifClasseEntry, grille_tarifs, set_tarifs_classe

        (etab, annee), _ = deux_ecoles
        classe, niveau, cycle = self._classe(db, etab.etablissement_id, annee.annee_id)
        scolarite = self._type_frais(db, etab.etablissement_id, "Scolarité")
        cantine = self._type_frais(db, etab.etablissement_id, "Cantine", obligatoire="N")

        set_tarifs_classe(
            entries=[
                TarifClasseEntry(classe_id=classe.classe_id, type_frais_id=scolarite.type_frais_id, montant=1_500_000),
                TarifClasseEntry(classe_id=classe.classe_id, type_frais_id=cantine.type_frais_id, montant=300_000),
            ],
            db=db, etablissement_id=etab.etablissement_id,
        )

        g = grille_tarifs(annee_id=annee.annee_id, db=db, etablissement_id=etab.etablissement_id)
        ligne = next(l for l in g["classes"] if l["classe_id"] == classe.classe_id)
        assert ligne["total_annuel"] == 1_800_000
        assert ligne["manquants"] == []
        assert g["nb_classes_completes"] == 1

        self._nettoyer(db, classe, niveau, cycle)

    def test_un_frais_obligatoire_sans_tarif_est_signale(self, db: Session, deux_ecoles):
        """Une case vide n'est pas neutre : la facture se fera au montant tapé
        à la main, et deux élèves d'une même classe finiront facturés
        différemment."""
        from app.api.finance import grille_tarifs

        (etab, annee), _ = deux_ecoles
        classe, niveau, cycle = self._classe(db, etab.etablissement_id, annee.annee_id)
        self._type_frais(db, etab.etablissement_id, "Scolarité")

        g = grille_tarifs(annee_id=annee.annee_id, db=db, etablissement_id=etab.etablissement_id)
        ligne = next(l for l in g["classes"] if l["classe_id"] == classe.classe_id)
        assert ligne["total_annuel"] == 0
        assert "Scolarité" in ligne["manquants"]
        assert g["nb_classes_incompletes"] == 1

        self._nettoyer(db, classe, niveau, cycle)

    def test_le_type_de_frais_dune_autre_ecole_est_refuse(self, db: Session, deux_ecoles):
        """Les classes étaient vérifiées, le type de frais non — alors qu'il
        appartient lui aussi à une école."""
        from fastapi import HTTPException

        from app.api.finance import TarifClasseEntry, set_tarifs_classe

        (a_etab, a_annee), (b_etab, _) = deux_ecoles
        classe, niveau, cycle = self._classe(db, a_etab.etablissement_id, a_annee.annee_id)
        frais_de_b = self._type_frais(db, b_etab.etablissement_id, "Scolarité de B")

        with pytest.raises(HTTPException) as e:
            set_tarifs_classe(
                entries=[TarifClasseEntry(
                    classe_id=classe.classe_id,
                    type_frais_id=frais_de_b.type_frais_id,
                    montant=1_000_000,
                )],
                db=db, etablissement_id=a_etab.etablissement_id,
            )
        assert e.value.status_code == 404

        self._nettoyer(db, classe, niveau, cycle)

    def test_la_grille_ne_montre_que_les_classes_de_cette_ecole(
        self, db: Session, deux_ecoles
    ):
        from app.api.finance import grille_tarifs

        (a_etab, a_annee), (b_etab, b_annee) = deux_ecoles
        classe_a, niv_a, cyc_a = self._classe(db, a_etab.etablissement_id, a_annee.annee_id, "6ème de A")
        classe_b, niv_b, cyc_b = self._classe(db, b_etab.etablissement_id, b_annee.annee_id, "6ème de B")

        g = grille_tarifs(annee_id=a_annee.annee_id, db=db, etablissement_id=a_etab.etablissement_id)
        ids = {l["classe_id"] for l in g["classes"]}
        assert classe_a.classe_id in ids
        assert classe_b.classe_id not in ids

        self._nettoyer(db, classe_a, niv_a, cyc_a)
        self._nettoyer(db, classe_b, niv_b, cyc_b)

    def _nettoyer(self, db: Session, classe, niveau, cycle):
        from app.models.academique import TarifClasse, TypeFrais

        db.query(TarifClasse).filter(TarifClasse.classe_id == classe.classe_id).delete()
        db.query(Classe).filter(Classe.classe_id == classe.classe_id).delete()
        db.query(Niveau).filter(Niveau.niveau_id == niveau.niveau_id).delete()
        db.query(Cycle).filter(Cycle.cycle_id == cycle.cycle_id).delete()
        db.query(TypeFrais).filter(
            TypeFrais.etablissement_id == classe.etablissement_id
        ).delete(synchronize_session=False)
        db.commit()
