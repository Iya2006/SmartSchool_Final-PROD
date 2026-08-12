"""
Contrat entre l'écran Paramètres > Notation et le moteur de calcul.

L'écran écrit ses réglages via `PUT /api/parametrage/settings` en préfixant
**toutes** ses clés par `notation.` (voir `buildParam` dans
frontend/src/app/parametres/notation/page.tsx). Le moteur, lui, lisait certaines
clés sans ce préfixe : le réglage était enregistré, réaffiché correctement à
l'écran, et ignoré par le calcul. Aucun message d'erreur, aucun moyen de s'en
apercevoir autrement qu'en recomptant à la main.

Ces tests fixent le contrat clé par clé. Chaque cas écrit la clé **telle que
l'écran l'écrit** et vérifie que le moteur la lit.
"""
import pytest

from app.models.academique import ParametreEtablissement
from app.services.notation import (
    BAREME_DEFAUT, MODE_PAR_EPREUVE, MODE_PAR_TYPE, SEUIL_PASSAGE_DEFAUT,
    get_bareme_defaut_cycle, get_bulletin_display_flags, get_mode_agregation,
    get_notation_seuils, get_seuil_passage,
)

ETAB = 1


@pytest.fixture
def parametre(db):
    """Écrit un réglage NOTATION comme le fait l'écran, et nettoie derrière."""
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


class TestBareme:
    """`notation.bareme.{cycle}` — onglet Barème."""

    def test_defaut_sans_configuration(self, db):
        assert get_bareme_defaut_cycle(db, ETAB, "college") == BAREME_DEFAUT

    def test_cle_prefixee_ecrite_par_l_ecran(self, db, parametre):
        parametre("notation.bareme.college", "10", "NUMBER")
        assert get_bareme_defaut_cycle(db, ETAB, "college") == 10.0

    def test_cle_courte_des_bases_deja_en_service(self, db, parametre):
        parametre("bareme.college", "100", "NUMBER")
        assert get_bareme_defaut_cycle(db, ETAB, "college") == 100.0

    def test_valeur_absurde_retombe_sur_le_defaut(self, db, parametre):
        # Un barème à 0 ferait diviser par zéro tout le calcul de moyennes.
        parametre("notation.bareme.college", "0", "NUMBER")
        assert get_bareme_defaut_cycle(db, ETAB, "college") == BAREME_DEFAUT


class TestSeuilPassage:
    """Deux champs de l'écran désignent le même seuil — les deux doivent compter."""

    def test_defaut_sans_configuration(self, db):
        assert get_seuil_passage(db, ETAB, "college") == SEUIL_PASSAGE_DEFAUT

    def test_champ_note_de_passage(self, db, parametre):
        parametre("notation.passage.college", "12", "NUMBER")
        assert get_seuil_passage(db, ETAB, "college") == 12.0

    def test_champ_seuil_de_redoublement(self, db, parametre):
        parametre("notation.seuil_redoublement.college", "9", "NUMBER")
        assert get_seuil_passage(db, ETAB, "college") == 9.0

    def test_seuil_de_redoublement_prioritaire(self, db, parametre):
        # C'est lui qui accompagne l'activation du redoublement : s'il est
        # renseigné, c'est le réglage le plus récemment voulu par l'école.
        parametre("notation.passage.college", "12", "NUMBER")
        parametre("notation.seuil_redoublement.college", "9", "NUMBER")
        assert get_seuil_passage(db, ETAB, "college") == 9.0


class TestModeAgregation:
    """`notation.mode_agregation.{cycle}` — change réellement les moyennes."""

    def test_defaut_par_type(self, db):
        assert get_mode_agregation(db, ETAB, "college") == MODE_PAR_TYPE

    def test_choix_par_epreuve(self, db, parametre):
        parametre("notation.mode_agregation.college", MODE_PAR_EPREUVE)
        assert get_mode_agregation(db, ETAB, "college") == MODE_PAR_EPREUVE

    def test_valeur_inconnue_ne_casse_pas_le_calcul(self, db, parametre):
        parametre("notation.mode_agregation.college", "N_IMPORTE_QUOI")
        assert get_mode_agregation(db, ETAB, "college") == MODE_PAR_TYPE

    def test_reglage_par_cycle_independant(self, db, parametre):
        parametre("notation.mode_agregation.primaire", MODE_PAR_EPREUVE)
        assert get_mode_agregation(db, ETAB, "primaire") == MODE_PAR_EPREUVE
        assert get_mode_agregation(db, ETAB, "college") == MODE_PAR_TYPE


class TestMentions:
    """`notation.mention.{cycle}.{tb|b|ab|p}` — seuils fixés par l'école."""

    def test_defaut_par_cycle(self, db):
        assert get_notation_seuils(db, "college", ETAB)["tb"] == 16.0
        # Le primaire note souvent sur 10 : ses seuils par défaut diffèrent.
        assert get_notation_seuils(db, "primaire", ETAB)["tb"] == 9.0

    def test_seuil_configure(self, db, parametre):
        parametre("notation.mention.college.tb", "17", "NUMBER")
        seuils = get_notation_seuils(db, "college", ETAB)
        assert seuils["tb"] == 17.0
        assert seuils["b"] == 14.0  # les autres restent aux valeurs par défaut


class TestAffichageBulletin:
    """`notation.display.*` — onglet Affichage Bulletins."""

    def test_tout_affiche_par_defaut(self, db):
        flags = get_bulletin_display_flags(db, ETAB)
        assert flags["show_rang"] is True
        assert flags["show_mention"] is True

    def test_masquer_le_rang(self, db, parametre):
        parametre("notation.display.rang", "false", "BOOLEAN")
        assert get_bulletin_display_flags(db, ETAB)["show_rang"] is False

    def test_cle_courte_des_bases_deja_en_service(self, db, parametre):
        parametre("display.mention", "false", "BOOLEAN")
        assert get_bulletin_display_flags(db, ETAB)["show_mention"] is False
