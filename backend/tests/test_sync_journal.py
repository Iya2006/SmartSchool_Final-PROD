"""
Journal des changements (app/sync/journal.py), étape B3 du chantier
offline-first.

Le cloud doit savoir, pour chaque écriture, quelle ligne a changé, pour quelle
école et depuis quel appareil ; le poste, ce qu'il lui reste à envoyer. Les
deux journaux sont tenus par la base : le SQL brut n'y échappe pas.
"""
import os
from datetime import date

import pytest
from sqlalchemy import create_engine, func, insert, select, text
from sqlalchemy.orm import Session

from app.core.numerotation import generer_numero_recu
from app.models.academique import (
    EcheanceFacture, Eleve, EleveParent, Evenement, Facture, Inscription, Parent, SyncJournal,
)
from app.sync.identifiants import application_distante
from app.sync.journal import (
    ECOLE_A_LA_LECTURE, ecrire_au_nom_de, expression_ecole, installer_journal_cloud,
    tables_journalisees_cloud, verifier_expressions,
)
from app.sync.tables_poste import journal_local
from tests.test_isolation_multi_ecole import Ecole, _uid
from tests.test_sync_identifiants import _poste_installe


def _entrees(db: Session, nom_table: str, cle: int) -> list[tuple]:
    db.expire_all()
    return [
        (e.operation, e.etablissement_id, e.appareil_origine)
        for e in db.query(SyncJournal)
        .filter(SyncJournal.nom_table == nom_table, SyncJournal.cle == cle)
        .order_by(SyncJournal.seq)
    ]


class TestJournalDuCloud:
    def test_chaque_ecriture_est_journalisee_avec_son_ecole(self, db: Session):
        a = Ecole(db, "A")
        etab = a.etab.etablissement_id
        eleve = a.eleve(db)
        inscription = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one()

        assert _entrees(db, "ss_eleves", eleve.eleve_id) == [("I", etab, None)]
        # L'inscription ne porte pas l'école : le déclencheur la retrouve.
        assert _entrees(db, "ss_inscriptions", inscription.inscription_id) == [("I", etab, None)]

        facture = Facture(inscription_id=inscription.inscription_id, annee_id=a.annee.annee_id,
                          numero_facture=f"FAC-J-{_uid()}", montant_total=10, montant_net=10,
                          montant_paye=0, montant_restant=10, statut="EN_ATTENTE")
        db.add(facture)
        db.flush()
        echeance = EcheanceFacture(facture_id=facture.facture_id, libelle="Tranche 1",
                                   date_limite=date(2026, 1, 1), montant_attendu=10)
        db.add(echeance)
        eleve.nom = "Barry"
        db.commit()
        # Deux niveaux plus loin (échéance → facture → inscription) : même école.
        assert _entrees(db, "ss_echeances_factures", echeance.echeance_id) == [("I", etab, None)]
        assert _entrees(db, "ss_eleves", eleve.eleve_id)[-1] == ("U", etab, None)

        # Suppression en SQL brut, comme services/suppression.py : journalisée,
        # et l'école est encore connue (lue avant l'effacement).
        echeance_id = echeance.echeance_id
        db.execute(text("DELETE FROM ss_echeances_factures WHERE echeance_id = :i"), {"i": echeance_id})
        db.commit()
        assert _entrees(db, "ss_echeances_factures", echeance_id)[-1] == ("D", etab, None)

    def test_une_ligne_partagee_entre_ecoles_se_resout_a_la_lecture(self, db: Session):
        a = Ecole(db, "A")
        eleve = a.eleve(db)
        uid = _uid()
        parent = Parent(nom="Camara", prenom=f"P{uid}", telephone_1=f"66{uid:07d}", statut="ACTIF",
                        etablissement_id=a.etab.etablissement_id)
        db.add(parent)
        db.commit()
        assert _entrees(db, "ss_parents", parent.parent_id) == [("I", None, None)]

        # Lier un parent existant : son école d'accueil doit le recevoir aussi,
        # et AVANT le lien (un poste qui lit dans l'ordre a le parent d'abord).
        lien = EleveParent(eleve_id=eleve.eleve_id, parent_id=parent.parent_id, lien_parente="MERE")
        db.add(lien)
        db.commit()
        assert _entrees(db, "ss_parents", parent.parent_id)[-1] == ("U", a.etab.etablissement_id, None)
        seq_parent, seq_lien = (
            db.query(func.max(SyncJournal.seq)).filter(SyncJournal.nom_table == nom, SyncJournal.cle == cle).scalar()
            for nom, cle in (("ss_parents", parent.parent_id), ("ss_eleve_parent", lien.eleve_parent_id))
        )
        assert seq_parent < seq_lien

    def test_l_appareil_d_origine_est_note(self, db: Session):
        a = Ecole(db, "A")
        cx = db.connection()
        ecrire_au_nom_de(cx, 7)
        venu_du_poste = Evenement(etablissement_id=a.etab.etablissement_id, titre="Poste 7",
                                  date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON")
        db.add(venu_du_poste)
        db.flush()
        ecrire_au_nom_de(cx, None)
        web = Evenement(etablissement_id=a.etab.etablissement_id, titre="Web",
                        date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON")
        db.add(web)
        db.commit()
        assert _entrees(db, "ss_evenements", venu_du_poste.evenement_id) == [("I", a.etab.etablissement_id, 7)]
        assert _entrees(db, "ss_evenements", web.evenement_id) == [("I", a.etab.etablissement_id, None)]

    def test_le_journal_lui_meme_et_les_compteurs_ne_sont_pas_journalises(self):
        cloud = set(tables_journalisees_cloud())
        assert {"ss_sync_journal", "ss_appareils", "ss_sequences_matricule"}.isdisjoint(cloud)
        # Audit et incidents remontent des postes, ils ne redescendent pas.
        assert {"ss_audit_log", "ss_incidents_applicatifs"}.isdisjoint(cloud)

    def test_chaque_table_trouve_son_ecole_sauf_les_lignes_partagees(self, db: Session):
        """Une table qui tomberait à « NULL » sans raison serait lue par TOUS
        les postes de TOUTES les écoles à chaque synchronisation."""
        sans_ecole = {n for n in tables_journalisees_cloud() if expression_ecole(n, "NEW") == "NULL"}
        assert sans_ecole == ECOLE_A_LA_LECTURE
        verifier_expressions(db.connection())


class TestJournalDuPoste:
    def test_le_poste_note_ce_qu_il_doit_envoyer(self, db: Session):
        a = Ecole(db, "A")
        a.eleve(db)
        poste = _poste_installe(db, a, 51)
        # L'installation elle-même n'est pas à renvoyer au cloud.
        with poste.connect() as cx:
            assert cx.execute(select(journal_local)).all() == []

        with Session(poste) as s:
            eleve = Eleve(etablissement_id=a.etab.etablissement_id, matricule="J-POSTE-1", nom="Sow",
                          prenom="Awa", date_naissance=date(2013, 3, 3), sexe="F", statut="ACTIF")
            s.add(eleve)
            s.commit()
            eleve.prenom = "Aïssatou"
            s.commit()
            eleve_id = eleve.eleve_id
            s.execute(text("DELETE FROM ss_eleves WHERE eleve_id = :i"), {"i": eleve_id})
            s.commit()

        with poste.connect() as cx:
            lignes = cx.execute(select(journal_local.c.nom_table, journal_local.c.cle, journal_local.c.operation)
                                .order_by(journal_local.c.seq)).all()
        assert lignes == [("ss_eleves", eleve_id, "I"), ("ss_eleves", eleve_id, "U"), ("ss_eleves", eleve_id, "D")]

    def test_ce_qui_vient_du_cloud_ne_repart_pas(self, db: Session):
        a = Ecole(db, "A")
        poste = _poste_installe(db, a, 52)
        with poste.begin() as cx:
            application_distante(cx, True)
            cx.execute(insert(Evenement).values(
                evenement_id=123456, etablissement_id=a.etab.etablissement_id, titre="Du cloud",
                date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON"))
            application_distante(cx, False)
        with poste.connect() as cx:
            assert cx.execute(select(journal_local)).all() == []

    def test_les_compteurs_de_numerotation_restent_sur_le_poste(self, db: Session):
        a = Ecole(db, "A")
        poste = _poste_installe(db, a, 53)
        with Session(poste) as s:
            generer_numero_recu(s, a.etab.etablissement_id, a.annee.annee_id)
            s.commit()
        with poste.connect() as cx:
            assert cx.execute(select(journal_local)).all() == []


@pytest.mark.skipif(not os.getenv("SMARTSCHOOL_TEST_PG_URL"),
                    reason="Base PostgreSQL jetable non fournie (SMARTSCHOOL_TEST_PG_URL)")
def test_le_journal_fonctionne_sous_postgresql():
    """Sur une base PostgreSQL JETABLE (jamais la production) : les fonctions
    plpgsql ne sont vérifiées qu'à leur première exécution, il faut donc
    vraiment écrire."""
    moteur = create_engine(os.environ["SMARTSCHOOL_TEST_PG_URL"])
    installer_journal_cloud(moteur)
    with moteur.connect() as cx:
        transaction = cx.begin()
        try:
            etab, annee, classe = cx.execute(text(
                "SELECT c.etablissement_id, c.annee_id, c.classe_id FROM ss_classes c LIMIT 1")).one()
            ecrire_au_nom_de(cx, 3)
            eleve_id = cx.execute(text(
                "INSERT INTO ss_eleves (etablissement_id, matricule, nom, prenom, sexe, statut) "
                "VALUES (:e, :m, 'Test', 'Journal', 'M', 'ACTIF') RETURNING eleve_id"),
                {"e": etab, "m": f"PG-JOURNAL-{_uid()}"}).scalar()
            inscription_id = cx.execute(text(
                "INSERT INTO ss_inscriptions (eleve_id, classe_id, annee_id, statut) "
                "VALUES (:el, :c, :a, 'ACTIVE') RETURNING inscription_id"),
                {"el": eleve_id, "c": classe, "a": annee}).scalar()
            cx.execute(text("UPDATE ss_eleves SET nom = 'Modifie' WHERE eleve_id = :i"), {"i": eleve_id})
            cx.execute(text("DELETE FROM ss_inscriptions WHERE inscription_id = :i"), {"i": inscription_id})
            entrees = cx.execute(text(
                "SELECT nom_table, operation, etablissement_id, appareil_origine FROM ss_sync_journal "
                "WHERE (nom_table = 'ss_eleves' AND cle = :e) OR (nom_table = 'ss_inscriptions' AND cle = :i) "
                "ORDER BY seq"), {"e": eleve_id, "i": inscription_id}).all()
            assert [tuple(e) for e in entrees] == [
                ("ss_eleves", "I", etab, 3), ("ss_inscriptions", "I", etab, 3),
                ("ss_eleves", "U", etab, 3), ("ss_inscriptions", "D", etab, 3),
            ]
        finally:
            transaction.rollback()
