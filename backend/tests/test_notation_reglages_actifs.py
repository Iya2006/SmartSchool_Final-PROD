"""
Réglages de Paramètres > Notation qui n'étaient lus par aucun code.

Trois interrupteurs de cet écran ne servaient à rien : le mode de classement
(`rang_mode`) et la notation par lettres (`lettres_actif` / `lettres_table`).
L'école les réglait, l'écran les réaffichait, et le système continuait comme
avant. Ces tests fixent leur effet réel.
"""
import json
from datetime import date

import pytest

from app.models.academique import (
    AnneeScolaire, Bulletin, Classe, Cycle, Eleve, Inscription, Niveau,
    ParametreEtablissement,
)
from app.services.notation import (
    RANG_CLASSE, RANG_NIVEAU, appliquer_rangs, get_lettres_config,
    get_rang_mode, lettre_pour_note,
)

ETAB = 1


@pytest.fixture
def parametre(db):
    ecrits = []

    def _ecrire(cle: str, valeur: str, type_valeur: str = "TEXT"):
        p = ParametreEtablissement(
            etablissement_id=ETAB, categorie="NOTATION",
            cle=cle, valeur=valeur, type_valeur=type_valeur,
        )
        db.add(p)
        db.commit()
        ecrits.append(p)
        return p

    yield _ecrire
    for p in ecrits:
        db.delete(p)
    db.commit()


@pytest.fixture
def deux_classes_meme_niveau(db):
    """Un niveau dédoublé : 2 classes, 2 élèves chacune, bulletins calculés.

    C'est la configuration qui distingue les deux modes de classement — avec
    une seule classe par niveau, ils donnent forcément le même résultat.
    """
    annee = AnneeScolaire(
        etablissement_id=ETAB, code="R-2025", libelle="Rang 2025-2026",
        date_debut=date(2025, 9, 1), date_fin=date(2026, 6, 30),
        statut="EN_COURS", est_courante="N",
    )
    cycle = Cycle(etablissement_id=ETAB, code="CLG-R", libelle="Collège Rang", ordre=90)
    db.add_all([annee, cycle])
    db.flush()
    niveau = Niveau(cycle_id=cycle.cycle_id, code="8R", libelle="8ème Rang",
                    ordre=90, est_examen="N")
    db.add(niveau)
    db.flush()

    objets = [annee, cycle, niveau]
    classes, inscriptions = [], []
    # Moyennes croisées volontairement : les deux premiers du niveau ne sont
    # pas dans la même classe, sinon le mode niveau serait indiscernable.
    plan = [("8ème Rang A", [16.0, 11.0]), ("8ème Rang B", [14.0, 9.0])]
    for libelle, moyennes in plan:
        classe = Classe(
            etablissement_id=ETAB, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
            code=libelle.replace(" ", ""), libelle=libelle, statut="ACTIVE",
        )
        db.add(classe)
        db.flush()
        classes.append(classe)
        objets.append(classe)
        for i, moyenne in enumerate(moyennes):
            eleve = Eleve(
                etablissement_id=ETAB, matricule=f"R-{libelle[-1]}{i}",
                nom="RANG", prenom=f"{libelle[-1]}{i}", statut="ACTIF",
                date_naissance=date(2012, 1, 1), sexe="M",
            )
            db.add(eleve)
            db.flush()
            insc = Inscription(
                eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
                annee_id=annee.annee_id, statut="ACTIVE",
            )
            db.add(insc)
            db.flush()
            bulletin = Bulletin(
                inscription_id=insc.inscription_id, trimestre_id=None,
                type_bulletin="ANNUEL", moyenne_generale=moyenne,
                rang=i + 1, effectif_classe=2, statut="CALCULE",
            )
            db.add(bulletin)
            inscriptions.append((insc, moyenne))
            objets += [eleve, insc, bulletin]
    db.commit()

    yield classes, inscriptions

    for o in reversed(objets):
        db.delete(o)
    db.commit()


class TestModeClassement:
    def test_defaut_par_classe(self, db):
        assert get_rang_mode(db, ETAB) == RANG_CLASSE

    def test_choix_par_niveau(self, db, parametre):
        parametre("notation.rang_mode", RANG_NIVEAU)
        assert get_rang_mode(db, ETAB) == RANG_NIVEAU

    def test_valeur_inconnue_retombe_sur_classe(self, db, parametre):
        parametre("notation.rang_mode", "par_departement")
        assert get_rang_mode(db, ETAB) == RANG_CLASSE

    def test_rang_par_classe_ignore_les_autres_classes(self, db, deux_classes_meme_niveau):
        classes, _ = deux_classes_meme_niveau
        # Classe B : 14.0 et 9.0 -> 1er et 2ème DANS SA CLASSE.
        donnees = [
            {"inscription_id": -1, "moyenne_generale": 14.0},
            {"inscription_id": -2, "moyenne_generale": 9.0},
        ]
        portee = appliquer_rangs(
            db, classes[1], donnees,
            trimestre_id=None, type_bulletin="ANNUEL", etablissement_id=ETAB,
        )
        assert portee["rang_mode"] == RANG_CLASSE
        assert [d["rang"] for d in donnees] == [1, 2]
        assert portee["effectif_reference"] == 2

    def test_rang_par_niveau_compare_toutes_les_classes(
        self, db, parametre, deux_classes_meme_niveau
    ):
        parametre("notation.rang_mode", RANG_NIVEAU)
        classes, inscriptions = deux_classes_meme_niveau
        # Élèves de la classe B, avec leurs vraies inscriptions.
        b = [(i, m) for i, m in inscriptions if i.classe_id == classes[1].classe_id]
        donnees = [
            {"inscription_id": insc.inscription_id, "moyenne_generale": moyenne}
            for insc, moyenne in b
        ]
        portee = appliquer_rangs(
            db, classes[1], donnees,
            trimestre_id=None, type_bulletin="ANNUEL", etablissement_id=ETAB,
        )
        assert portee["rang_mode"] == RANG_NIVEAU
        assert portee["effectif_reference"] == 4
        assert portee["libelle_reference"] == "8ème Rang"
        # Niveau trié : 16 (A) > 14 (B) > 11 (A) > 9 (B).
        # Le premier de la classe B n'est donc que 2ème du niveau.
        par_moyenne = {d["moyenne_generale"]: d["rang"] for d in donnees}
        assert par_moyenne[14.0] == 2
        assert par_moyenne[9.0] == 4


class TestNotationParLettres:
    def test_inactive_par_defaut(self, db):
        config = get_lettres_config(db, ETAB, "college")
        assert config["actif"] is False
        assert lettre_pour_note(15.0, config) is None

    def test_table_de_l_ecole(self, db, parametre):
        table = [
            {"lettre": "A+", "min": 18, "max": 20},
            {"lettre": "A", "min": 16, "max": 17.99},
            {"lettre": "B", "min": 14, "max": 15.99},
            {"lettre": "F", "min": 0, "max": 13.99},
        ]
        parametre("notation.lettres_actif.college", "true", "BOOLEAN")
        parametre("notation.lettres_table.college", json.dumps(table))
        config = get_lettres_config(db, ETAB, "college")

        assert config["actif"] is True
        assert lettre_pour_note(20.0, config, 20) == "A+"
        assert lettre_pour_note(16.0, config, 20) == "A"
        assert lettre_pour_note(15.99, config, 20) == "B"
        assert lettre_pour_note(2.0, config, 20) == "F"

    def test_note_absente_sans_lettre(self, db, parametre):
        parametre("notation.lettres_actif.college", "true", "BOOLEAN")
        assert lettre_pour_note(None, get_lettres_config(db, ETAB, "college")) is None

    def test_table_illisible_retombe_sur_le_defaut(self, db, parametre):
        # Un JSON corrompu ne doit pas faire échouer un bulletin entier.
        parametre("notation.lettres_actif.college", "true", "BOOLEAN")
        parametre("notation.lettres_table.college", "{ceci n'est pas du JSON")
        config = get_lettres_config(db, ETAB, "college")
        assert config["actif"] is True
        assert lettre_pour_note(19.0, config, 20) == "A+"

    def test_table_par_defaut_suit_le_bareme(self, db, parametre):
        # Au primaire on note sur 10 : 9/10 vaut la meilleure lettre, pas la
        # dernière comme le donnerait une table figée sur 20.
        parametre("notation.lettres_actif.primaire", "true", "BOOLEAN")
        config = get_lettres_config(db, ETAB, "primaire")
        assert lettre_pour_note(9.5, config, 10) == "A+"
        assert lettre_pour_note(3.0, config, 10) == "F"

    def test_reglage_independant_par_cycle(self, db, parametre):
        parametre("notation.lettres_actif.college", "true", "BOOLEAN")
        assert get_lettres_config(db, ETAB, "college")["actif"] is True
        assert get_lettres_config(db, ETAB, "lycee")["actif"] is False
