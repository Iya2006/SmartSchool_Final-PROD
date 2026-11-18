"""
Tests — importer les résultats d'une classe depuis un tableau.

Beaucoup d'écoles tiennent déjà leurs moyennes dans un classeur. Ressaisir
chaque note de chaque épreuve pour obtenir un classement représentait des
jours de travail pour un résultat qu'elles possèdent. L'import reprend le
tableau tel qu'il est, dans deux formats au choix : une colonne par matière,
ou une seule moyenne générale.

Trois tests pèsent plus que les autres :

- **L'élève non rapproché n'est jamais inventé, et l'élève absent du fichier
  n'est jamais effacé.** Attribuer la moyenne d'un élève à un homonyme, ou
  perdre le bulletin d'un élève qui ne figure pas dans un import partiel,
  seraient des fautes invisibles et durables.
- **Le chaînage semestriel.** Deux imports de période doivent produire le
  résultat annuel par l'agrégation existante, sans rien faire de plus — c'est
  toute la raison de brancher l'import sur les bulletins plutôt que d'écrire
  un second moteur de calcul.
- **Le format « moyenne seule » doit atteindre le calcul annuel.** Il n'a
  aucune ligne de matière, et l'agrégation annuelle écartait justement les
  élèves sans ligne.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Bulletin, BulletinLigne, Classe, ClasseMatiere, Cycle, Eleve,
    Etablissement, Inscription, Matiere, Niveau, Trimestre, Utilisateur,
)

_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    """Une classe de trois élèves, deux matières, deux périodes."""
    uid = _uid()
    etab = Etablissement(code=f"IMPR-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANI{uid}", libelle="2026-2027",
        date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)

    periodes = []
    for numero, libelle, debut, fin in [
        (1, "1er Semestre", date(2026, 10, 1), date(2027, 1, 31)),
        (2, "2e Semestre", date(2027, 2, 1), date(2027, 6, 30)),
    ]:
        t = Trimestre(
            annee_id=annee.annee_id, code=f"S{numero}-{uid}", libelle=libelle,
            numero=numero, date_debut=debut, date_fin=fin, statut="EN_COURS",
        )
        db.add(t); db.commit(); db.refresh(t)
        periodes.append(t)

    cycle = Cycle(etablissement_id=eid, code=f"CYI{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVI{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLI{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    matieres = {}
    for code, libelle, coef in [("MATH", "Mathematiques", 4), ("FRAN", "Francais", 3)]:
        m = Matiere(
            cycle_id=cycle.cycle_id, code=f"{code}{uid}", libelle=libelle,
            coefficient_defaut=coef, note_sur=20, est_obligatoire="O",
        )
        db.add(m); db.commit(); db.refresh(m)
        db.add(ClasseMatiere(
            classe_id=classe.classe_id, matiere_id=m.matiere_id,
            coefficient=coef, est_active="O",
        ))
        db.commit()
        matieres[code] = m

    eleves = []
    for nom, prenom in [("Bah", "Alpha"), ("Camara", "Fatou"), ("Traoré", "Aïcha")]:
        el = Eleve(
            etablissement_id=eid, matricule=f"IMPR-{uid}-{len(eleves) + 1}",
            nom=nom, prenom=prenom, sexe="M", statut="ACTIF",
        )
        db.add(el); db.commit(); db.refresh(el)
        insc = Inscription(
            eleve_id=el.eleve_id, classe_id=classe.classe_id,
            annee_id=annee.annee_id, statut="ACTIVE", type_inscription="NOUVELLE",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        eleves.append((el, insc))

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.impr.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    return {
        "eid": eid, "annee": annee, "classe": classe, "cycle": cycle,
        "periodes": periodes, "matieres": matieres, "eleves": eleves, "admin": admin,
    }


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _importer(client, headers, classe_id, csv_texte, *, trimestre_id=None,
              format=None, dry_run=False, nom="resultats.csv"):
    params = []
    if trimestre_id is not None:
        params.append(f"trimestre_id={trimestre_id}")
    if format:
        params.append(f"format={format}")
    if dry_run:
        params.append("dry_run=true")
    query = ("?" + "&".join(params)) if params else ""
    return client.post(
        f"/api/evaluations/classe/{classe_id}/import-resultats{query}",
        headers=headers,
        files={"fichier": (nom, csv_texte.encode("utf-8"), "text/csv")},
    )


def _csv_detaille(ecole, valeurs):
    """valeurs : [(indice_eleve, math, francais)] — moyenne laissée au calcul."""
    lignes = ["Matricule;Nom;Prenom;Mathematiques;Francais"]
    for i, math, fran in valeurs:
        el, _ = ecole["eleves"][i]
        lignes.append(f"{el.matricule};{el.nom};{el.prenom};{math};{fran}")
    return "\n".join(lignes)


def _csv_simple(ecole, valeurs):
    lignes = ["Matricule;Nom;Prenom;Moyenne"]
    for i, moyenne in valeurs:
        el, _ = ecole["eleves"][i]
        lignes.append(f"{el.matricule};{el.nom};{el.prenom};{moyenne}")
    return "\n".join(lignes)


class TestFormatDetaille:

    def test_une_colonne_par_matiere_donne_un_vrai_bulletin(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        p1 = ecole["periodes"][0].trimestre_id

        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_detaille(ecole, [(0, 16, 12), (1, 10, 14), (2, 8, 9)]),
                      trimestre_id=p1)
        assert r.status_code == 200, r.text
        corps = r.json()
        assert corps["format_retenu"] == "DETAILLE"
        assert corps["bulletins_crees"] == 3
        assert corps["type_bulletin"] == "TRIMESTRIEL"

        # Alpha : (16×4 + 12×3) / 7 = 14.29
        premier = corps["classement"][0]
        assert premier["rang"] == 1
        assert premier["moyenne_generale"] == 14.29
        assert premier["nom_complet"] == "Alpha Bah"

        _, insc = ecole["eleves"][0]
        bulletin = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id, Bulletin.trimestre_id == p1
        ).first()
        assert bulletin is not None
        assert bulletin.mention, "Une mention doit être attribuée"
        lignes = db.query(BulletinLigne).filter(
            BulletinLigne.bulletin_id == bulletin.bulletin_id
        ).all()
        assert len(lignes) == 2, "Le détail par matière doit être écrit"
        assert {float(l.moyenne_matiere) for l in lignes} == {16.0, 12.0}

    def test_la_moyenne_du_fichier_fait_foi_quand_elle_est_fournie(self, client, db, ecole):
        """
        C'est le chiffre déjà communiqué à la famille. Le recalculer donnerait
        un résultat différent du bulletin qu'elle a reçu.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        csv = (
            "Matricule;Nom;Prenom;Mathematiques;Francais;Moyenne\n"
            f"{ecole['eleves'][0][0].matricule};Bah;Alpha;16;12;15.5"
        )
        r = _importer(client, h, ecole["classe"].classe_id, csv,
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 200, r.text
        assert r.json()["classement"][0]["moyenne_generale"] == 15.5

    def test_la_virgule_decimale_est_acceptee(self, client, db, ecole):
        """Un tableur francophone écrit « 12,5 ». Le refuser rendrait
        l'import inutilisable sur les fichiers réellement reçus."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        csv = (
            "Matricule;Nom;Prenom;Mathematiques;Francais\n"
            f"{ecole['eleves'][0][0].matricule};Bah;Alpha;12,5;12,5"
        )
        r = _importer(client, h, ecole["classe"].classe_id, csv,
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 200, r.text
        assert r.json()["classement"][0]["moyenne_generale"] == 12.5

    def test_une_note_hors_bareme_est_signalee_et_ecartee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        csv = (
            "Matricule;Nom;Prenom;Mathematiques;Francais\n"
            f"{ecole['eleves'][0][0].matricule};Bah;Alpha;45;12"
        )
        r = _importer(client, h, ecole["classe"].classe_id, csv,
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 200, r.text
        assert any("bareme" in e["message"] or "barème" in e["message"] for e in r.json()["erreurs"])
        # Seul le français subsiste : la moyenne vaut 12, pas (45+12)/2.
        assert r.json()["classement"][0]["moyenne_generale"] == 12.0


class TestFormatSimple:

    def test_une_seule_moyenne_suffit_pour_classer(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        p1 = ecole["periodes"][0].trimestre_id

        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_simple(ecole, [(0, 11), (1, 15), (2, 13)]),
                      trimestre_id=p1)
        assert r.status_code == 200, r.text
        corps = r.json()
        assert corps["format_retenu"] == "SIMPLE"
        assert corps["bulletins_crees"] == 3
        assert [c["moyenne_generale"] for c in corps["classement"]] == [15.0, 13.0, 11.0]
        assert corps["classement"][0]["nom_complet"] == "Fatou Camara"

        _, insc = ecole["eleves"][1]
        bulletin = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id, Bulletin.trimestre_id == p1
        ).first()
        assert float(bulletin.moyenne_generale) == 15.0
        assert bulletin.rang == 1
        assert db.query(BulletinLigne).filter(
            BulletinLigne.bulletin_id == bulletin.bulletin_id
        ).count() == 0, "Pas de détail par matière dans ce format — c'est assumé"

    def test_le_format_simple_atteint_bien_le_calcul_annuel(self, client, db, ecole):
        """
        L'agrégation annuelle écartait tout élève sans ligne de matière. Le
        format simple n'en a aucune : sans le correctif, ces élèves
        disparaissaient du classement de fin d'année.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        for periode, moyennes in [
            (ecole["periodes"][0], [(0, 12), (1, 16), (2, 10)]),
            (ecole["periodes"][1], [(0, 14), (1, 14), (2, 12)]),
        ]:
            r = _importer(client, h, ecole["classe"].classe_id,
                          _csv_simple(ecole, moyennes), trimestre_id=periode.trimestre_id)
            assert r.status_code == 200, r.text

        annuel = client.get(
            f"/api/evaluations/classe/{ecole['classe'].classe_id}/resultats-annuels",
            headers=h,
        )
        assert annuel.status_code == 200, annuel.text
        par_nom = {
            f"{d['prenom']} {d['nom']}": d for d in annuel.json()["resultats"]
        }
        assert par_nom, f"Aucun élève dans les résultats annuels : {annuel.json()}"
        # Alpha : (12 + 14) / 2 = 13 ; Fatou : (16 + 14) / 2 = 15
        assert par_nom["Alpha Bah"]["moyenne_generale"] == 13.0
        assert par_nom["Fatou Camara"]["moyenne_generale"] == 15.0
        assert par_nom["Fatou Camara"]["rang"] == 1


class TestChainageSemestriel:

    def test_deux_imports_de_periode_donnent_le_resultat_annuel(self, client, db, ecole):
        """
        Toute la raison de brancher l'import sur les bulletins : l'école
        importe chaque semestre, et la fin d'année sort de l'agrégation
        existante sans second moteur de calcul.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        for periode, valeurs in [
            (ecole["periodes"][0], [(0, 16, 12), (1, 10, 14), (2, 8, 9)]),
            (ecole["periodes"][1], [(0, 14, 14), (1, 12, 16), (2, 10, 11)]),
        ]:
            r = _importer(client, h, ecole["classe"].classe_id,
                          _csv_detaille(ecole, valeurs), trimestre_id=periode.trimestre_id)
            assert r.status_code == 200, r.text

        calcul = client.post(
            f"/api/evaluations/classe/{ecole['classe'].classe_id}/calculer-moyennes-annuelles",
            headers=h,
        )
        assert calcul.status_code == 200, calcul.text
        assert calcul.json()["bulletins_total"] == 3

        _, insc = ecole["eleves"][0]
        annuel = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id,
            Bulletin.type_bulletin == "ANNUEL",
        ).first()
        assert annuel is not None, "Le bulletin annuel doit être généré"
        # S1 = 14.29, S2 = (14×4 + 14×3)/7 = 14.0 -> (14.29 + 14.0)/2 = 14.15
        assert float(annuel.moyenne_generale) == pytest.approx(14.15, abs=0.02)


class TestImportAnnuelDirect:

    def test_sans_periode_l_import_ecrit_le_bulletin_annuel(self, client, db, ecole):
        """Pour l'école qui ne veut importer qu'une fois, en fin d'année."""
        h = _headers(client, ecole["admin"].nom_utilisateur)

        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_simple(ecole, [(0, 13), (1, 17), (2, 11)]))
        assert r.status_code == 200, r.text
        assert r.json()["type_bulletin"] == "ANNUEL"
        assert r.json()["periode"] == "Année complète"

        _, insc = ecole["eleves"][1]
        annuel = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id,
            Bulletin.type_bulletin == "ANNUEL",
            Bulletin.trimestre_id.is_(None),
        ).first()
        assert annuel is not None
        assert float(annuel.moyenne_generale) == 17.0
        assert annuel.rang == 1


class TestRapprochementEtPrudence:

    def test_un_eleve_inconnu_est_signale_jamais_cree(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        avant = db.query(Eleve).filter(Eleve.etablissement_id == ecole["eid"]).count()

        csv = (
            "Matricule;Nom;Prenom;Moyenne\n"
            f"{ecole['eleves'][0][0].matricule};Bah;Alpha;14\n"
            "ZZZ-999;Inconnu;Personne;18"
        )
        r = _importer(client, h, ecole["classe"].classe_id, csv,
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 200, r.text

        non = r.json()["non_rapproches"]
        assert len(non) == 1
        assert "Inconnu" in non[0]["identite"]
        assert db.query(Eleve).filter(Eleve.etablissement_id == ecole["eid"]).count() == avant

    def test_un_eleve_absent_du_fichier_garde_son_bulletin(self, client, db, ecole):
        """Un import partiel ne doit pas effacer un travail déjà fait."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        p1 = ecole["periodes"][0].trimestre_id

        assert _importer(client, h, ecole["classe"].classe_id,
                         _csv_simple(ecole, [(0, 11), (1, 15), (2, 13)]),
                         trimestre_id=p1).status_code == 200

        # Second import ne portant que sur Alpha.
        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_simple(ecole, [(0, 19)]), trimestre_id=p1)
        assert r.status_code == 200, r.text
        assert len(r.json()["eleves_sans_resultat"]) == 2

        _, insc_fatou = ecole["eleves"][1]
        garde = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc_fatou.inscription_id, Bulletin.trimestre_id == p1
        ).first()
        assert garde is not None, "Le bulletin de Fatou ne doit pas disparaître"
        assert float(garde.moyenne_generale) == 15.0

    def test_le_rapprochement_par_nom_fonctionne_sans_matricule(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        csv = "Nom;Prenom;Moyenne\nBah;Alpha;13\nTraore;Aicha;9"
        r = _importer(client, h, ecole["classe"].classe_id, csv,
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 200, r.text
        assert r.json()["bulletins_crees"] == 2, (
            f"Accents et casse doivent être neutralisés — non rapprochés : {r.json()['non_rapproches']}"
        )

    def test_dry_run_n_ecrit_rien(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        p1 = ecole["periodes"][0].trimestre_id

        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_simple(ecole, [(0, 11), (1, 15)]), trimestre_id=p1, dry_run=True)
        assert r.status_code == 200, r.text
        assert r.json()["dry_run"] is True
        assert r.json()["nb_rapproches"] == 2
        assert db.query(Bulletin).filter(Bulletin.trimestre_id == p1).count() == 0

    def test_reimporter_remplace_au_lieu_de_dupliquer(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        p1 = ecole["periodes"][0].trimestre_id

        _importer(client, h, ecole["classe"].classe_id,
                  _csv_simple(ecole, [(0, 11)]), trimestre_id=p1)
        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_simple(ecole, [(0, 17)]), trimestre_id=p1)
        assert r.status_code == 200, r.text
        assert r.json()["bulletins_crees"] == 0
        assert r.json()["bulletins_mis_a_jour"] == 1

        _, insc = ecole["eleves"][0]
        bulletins = db.query(Bulletin).filter(
            Bulletin.inscription_id == insc.inscription_id, Bulletin.trimestre_id == p1
        ).all()
        assert len(bulletins) == 1
        assert float(bulletins[0].moyenne_generale) == 17.0

    def test_un_fichier_sans_colonne_exploitable_est_refuse(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        csv = "Matricule;Nom;Prenom;Taille;Poids\nX;Bah;Alpha;170;60"
        r = _importer(client, h, ecole["classe"].classe_id, csv,
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 400
        assert "moyenne" in r.json()["detail"].lower()

    def test_un_fichier_deguise_est_refuse(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = client.post(
            f"/api/evaluations/classe/{ecole['classe'].classe_id}/import-resultats"
            f"?trimestre_id={ecole['periodes'][0].trimestre_id}",
            headers=h,
            files={"fichier": ("notes.xlsx", b"MZ\x90\x00 pas un classeur", "application/vnd.ms-excel")},
        )
        assert r.status_code == 400

    def test_une_periode_d_une_autre_annee_est_refusee(self, client, db, ecole):
        """Sinon le classement annuel agrégerait des moyennes de deux années."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        autre_annee = AnneeScolaire(
            etablissement_id=ecole["eid"], code=f"ANZ{_uid()}", libelle="2025-2026",
            date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
            est_courante="N", statut="PLANIFIEE",
        )
        db.add(autre_annee); db.commit(); db.refresh(autre_annee)
        t = Trimestre(
            annee_id=autre_annee.annee_id, code=f"TZ{_uid()}", libelle="T1",
            numero=1, date_debut=date(2025, 10, 1), date_fin=date(2025, 12, 31), statut="EN_COURS",
        )
        db.add(t); db.commit(); db.refresh(t)

        r = _importer(client, h, ecole["classe"].classe_id,
                      _csv_simple(ecole, [(0, 12)]), trimestre_id=t.trimestre_id)
        assert r.status_code == 404

    def test_la_classe_d_une_autre_ecole_est_introuvable(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        uid = _uid()
        autre = Etablissement(code=f"IMPRX-{uid}", nom="Autre", type_etablissement="COLLEGE")
        db.add(autre); db.commit(); db.refresh(autre)
        a_an = AnneeScolaire(
            etablissement_id=autre.etablissement_id, code=f"ANQ{uid}", libelle="2026-2027",
            date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
            est_courante="O", statut="EN_COURS",
        )
        db.add(a_an); db.commit(); db.refresh(a_an)
        a_cy = Cycle(etablissement_id=autre.etablissement_id, code=f"CYQ{uid}", libelle="C", ordre=1)
        db.add(a_cy); db.commit(); db.refresh(a_cy)
        a_nv = Niveau(cycle_id=a_cy.cycle_id, code=f"NVQ{uid}", libelle="N", ordre=1)
        db.add(a_nv); db.commit(); db.refresh(a_nv)
        a_cl = Classe(
            etablissement_id=autre.etablissement_id, annee_id=a_an.annee_id,
            niveau_id=a_nv.niveau_id, code=f"CLQ{uid}", libelle="X",
            capacite_max=10, effectif_actuel=0, statut="ACTIVE",
        )
        db.add(a_cl); db.commit(); db.refresh(a_cl)

        r = _importer(client, h, a_cl.classe_id, _csv_simple(ecole, [(0, 12)]))
        assert r.status_code == 404


class TestModeleAFournir:

    def test_le_modele_detaille_contient_les_eleves_et_les_matieres(self, client, db, ecole):
        """
        C'est la pièce qui fait tenir l'import : les noms sortent de la base
        de l'école, donc le rapprochement par matricule réussit à coup sûr.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = client.get(
            f"/api/evaluations/classe/{ecole['classe'].classe_id}/modele-import-resultats?format=DETAILLE",
            headers=h,
        )
        assert r.status_code == 200, r.text
        texte = r.content.decode("utf-8-sig")
        entete = texte.splitlines()[0]
        assert "Matricule" in entete and "Mathematiques" in entete and "Francais" in entete
        for el, _ in ecole["eleves"]:
            assert el.matricule in texte

    def test_le_modele_simple_n_a_qu_une_colonne_de_moyenne(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = client.get(
            f"/api/evaluations/classe/{ecole['classe'].classe_id}/modele-import-resultats?format=SIMPLE",
            headers=h,
        )
        assert r.status_code == 200, r.text
        entete = r.content.decode("utf-8-sig").splitlines()[0]
        assert "Mathematiques" not in entete
        assert entete.endswith("Moyenne")

    def test_le_modele_telecharge_est_reimportable_tel_quel(self, client, db, ecole):
        """Le cycle complet : on télécharge, on remplit, on renvoie."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        modele = client.get(
            f"/api/evaluations/classe/{ecole['classe'].classe_id}/modele-import-resultats?format=SIMPLE",
            headers=h,
        ).content.decode("utf-8-sig")

        lignes = modele.strip().splitlines()
        rempli = [lignes[0]] + [l + "12" for l in lignes[1:]]
        r = _importer(client, h, ecole["classe"].classe_id, "\n".join(rempli),
                      trimestre_id=ecole["periodes"][0].trimestre_id)
        assert r.status_code == 200, r.text
        assert r.json()["bulletins_crees"] == 3
        assert r.json()["non_rapproches"] == []
