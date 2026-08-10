"""
Lecture des fichiers de résultats d'examen national.

Ces tests portent sur ce qui casse réellement en production : le fichier reçu
n'est jamais celui du gabarit. Excel francophone exporte en `;` et en cp1252,
les en-têtes s'écrivent `N° Matricule` ou `Résultat final`, et la colonne
résultat contient « Admise », « Ajourné » ou « Recalé » plutôt que le
vocabulaire de la base.
"""
import io

import pytest

from app.api.promotion import _normaliser_resultat
from app.services.import_tabulaire import (
    FichierIllisible, lire_lignes, normaliser_entete, valeur,
)


class TestNormalisationEntete:
    @pytest.mark.parametrize("brut,attendu", [
        ("N° Matricule", "n matricule"),
        ("MATRICULE", "matricule"),
        ("Résultat  final", "resultat final"),
        ("Prénoms", "prenoms"),
        ("  Nom de l'élève ", "nom de l eleve"),
        ("ELV-00013", "elv 00013"),
    ])
    def test_variantes_convergent(self, brut, attendu):
        assert normaliser_entete(brut) == attendu

    def test_matricule_avec_ou_sans_tiret_identique(self):
        # Le même élève écrit des deux façons doit se rapprocher.
        assert normaliser_entete("ELV-00013") == normaliser_entete("elv 00013")


class TestLectureCsv:
    def _lignes(self, texte, encodage="utf-8"):
        return lire_lignes("resultats.csv", texte.encode(encodage))[1]

    def test_separateur_point_virgule_excel_francais(self):
        lignes = self._lignes("MATRICULE;NOM;RESULTAT\nELV-1;BAH;Admis\n")
        assert lignes == [{"matricule": "ELV-1", "nom": "BAH", "resultat": "Admis"}]

    def test_separateur_virgule(self):
        lignes = self._lignes("MATRICULE,NOM,RESULTAT\nELV-1,BAH,Admis\n")
        assert lignes[0]["resultat"] == "Admis"

    def test_separateur_tabulation(self):
        lignes = self._lignes("MATRICULE\tNOM\tRESULTAT\nELV-1\tBAH\tAdmis\n")
        assert lignes[0]["resultat"] == "Admis"

    def test_encodage_cp1252(self):
        # Ce qu'Excel produit par défaut en français : les accents ne sont pas
        # de l'UTF-8, et une lecture stricte échouerait.
        lignes = self._lignes("MATRICULE;PRÉNOM;RÉSULTAT\nELV-1;Aïssatou;Admise\n", "cp1252")
        assert lignes[0]["prenom"] == "Aïssatou"
        assert lignes[0]["resultat"] == "Admise"

    def test_bom_utf8_ignore(self):
        lignes = self._lignes("﻿MATRICULE;RESULTAT\nELV-1;Admis\n")
        assert "matricule" in lignes[0]

    def test_lignes_vides_ignorees(self):
        lignes = self._lignes("MATRICULE;RESULTAT\nELV-1;Admis\n\n;;\n")
        assert len(lignes) == 1

    def test_fichier_vide_refuse(self):
        with pytest.raises(FichierIllisible):
            lire_lignes("vide.csv", b"")

    def test_xls_ancien_format_refuse_avec_message_utile(self):
        with pytest.raises(FichierIllisible, match="xlsx"):
            lire_lignes("resultats.xls", b"nimporte")


class TestLectureXlsx:
    def test_classeur_excel(self):
        openpyxl = pytest.importorskip("openpyxl")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["N° Matricule", "Nom", "Prénoms", "Résultat final"])
        ws.append(["ELV-00013", "DIALLO", "Aissatou", "Admise"])
        tampon = io.BytesIO()
        wb.save(tampon)

        colonnes, lignes = lire_lignes("resultats.xlsx", tampon.getvalue())
        assert "n matricule" in colonnes
        assert valeur(lignes[0], "matricule", "n matricule") == "ELV-00013"
        assert valeur(lignes[0], "resultat", "resultat final") == "Admise"


class TestValeurMultiColonnes:
    def test_premiere_colonne_renseignee_gagne(self):
        ligne = {"matricule": "", "n matricule": "ELV-9"}
        assert valeur(ligne, "matricule", "n matricule") == "ELV-9"

    def test_aucune_correspondance_renvoie_vide(self):
        assert valeur({"nom": "BAH"}, "matricule") == ""


class TestVocabulaireResultat:
    @pytest.mark.parametrize("brut", [
        "Admis", "ADMISE", "admis ", "Reçu", "oui", "O", "1", "Réussi", "Passé",
    ])
    def test_variantes_admis(self, brut):
        assert _normaliser_resultat(brut) == "ADMIS"

    @pytest.mark.parametrize("brut", [
        "Non admis", "NON_ADMIS", "non-admise", "Échec", "Ajourné", "Recalé",
        "Refusé", "non", "N", "0",
    ])
    def test_variantes_non_admis(self, brut):
        assert _normaliser_resultat(brut) == "NON_ADMIS"

    @pytest.mark.parametrize("brut", ["", "peut-être", "12/20", "en attente"])
    def test_valeur_illisible_refusee(self, brut):
        # Refusée et non devinée : un résultat d'examen inventé serait pire
        # qu'une ligne signalée à l'école.
        assert _normaliser_resultat(brut) is None
