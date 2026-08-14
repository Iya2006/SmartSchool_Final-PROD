"""
Tests — le surveillant doit pouvoir faire l'appel, pas seulement le regarder.

CE QUI A ÉTÉ TROUVÉ
-------------------
Son espace affichait un taux d'absence, un nombre d'absences et un nombre de
retards. Il n'avait aucun moyen d'en saisir un seul : le geste central de son
métier — l'appel du matin et de l'après-midi — n'existait nulle part.

Trois défauts empêchaient de le construire, et chacun était invisible tant que
personne n'appelait ces routes :

1. `GET /vie-scolaire/presences?date_presence=...` répondait **500**. Le
   paramètre était typé en texte et comparé à une colonne DATE ; PostgreSQL
   refusait la comparaison. La route existait depuis toujours et n'avait
   jamais servi.

2. Faire l'appel demande l'`inscription_id` de chaque élève — c'est lui, et
   non `eleve_id`, que l'enregistrement attend. Aucune route ne le donnait
   avec la liste de classe.

3. `est_justifie` existait en base et dans la réponse, mais pas dans ce qu'on
   pouvait ENVOYER. Une absence saisie restait donc systématiquement « non
   justifiée », même avec un mot des parents en main — alors que c'est
   précisément ce chiffre que le tableau du surveillant met en avant.
"""
from datetime import date

import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau,
    Presence, Utilisateur,
)

_JETON = uuid.uuid4().hex[:6]
_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


@pytest.fixture
def ecole(db: Session):
    """Une école, une classe, trois élèves, un surveillant."""
    uid = _uid()
    etab = Etablissement(code=f"APP-{_JETON}-{uid}", nom=f"École APP {uid}",
                         type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"AP{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)

    cycle = Cycle(etablissement_id=eid, code=f"C{_JETON}{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    # Niveau n'a pas de colonne etablissement_id : il tient son école de son
    # cycle. C'est le modèle réel, on ne le contourne pas dans un test.
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{_JETON}{uid}",
                    libelle="10ème", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(etablissement_id=eid, annee_id=annee.annee_id,
                    niveau_id=niveau.niveau_id, code=f"CL{_JETON}{uid}",
                    libelle="10ème A", capacite_max=40, statut="ACTIVE")
    db.add(classe); db.commit(); db.refresh(classe)

    inscriptions = []
    for n, (nom, prenom) in enumerate([("Bah", "Sona"), ("Diallo", "Mamadou"),
                                       ("Camara", "Fanta")], start=1):
        eleve = Eleve(matricule=f"E{_JETON}{uid}{n}", nom=nom, prenom=prenom,
                      sexe="F", date_naissance=date(2010, 3, n),
                      etablissement_id=eid, statut="ACTIF")
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
                           annee_id=annee.annee_id, statut="ACTIVE")
        db.add(insc); db.commit(); db.refresh(insc)
        inscriptions.append(insc)

    surveillant = Utilisateur(
        nom="Barry", prenom="Aissatou", nom_utilisateur=f"surv.{_JETON}.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT",
        statut="ACTIF", etablissement_id=eid,
    )
    db.add(surveillant); db.commit(); db.refresh(surveillant)

    return {"etab": etab, "annee": annee, "cycle": cycle, "classe": classe,
            "inscriptions": inscriptions, "surveillant": surveillant}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _feuille(client, headers, classe_id, jour="2026-05-12", demi="MATIN"):
    return client.get(
        f"/api/vie-scolaire/feuille-appel?classe_id={classe_id}"
        f"&date_presence={jour}&demi_journee={demi}", headers=headers)


class TestLaFeuilleDAppel:
    def test_elle_donne_la_classe_avec_ce_quil_faut_pour_pointer(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        r = _feuille(client, h, ecole["classe"].classe_id)
        assert r.status_code == 200, r.text
        d = r.json()

        assert d["effectif"] == 3
        assert d["deja_pointee"] is False
        # L'identifiant que l'enregistrement attend — pas eleve_id.
        attendus = {i.inscription_id for i in ecole["inscriptions"]}
        assert {e["inscription_id"] for e in d["eleves"]} == attendus
        # Présent par défaut : la présence est la règle, on ne pointe que
        # ce qui en sort.
        assert all(e["statut"] == "PRESENT" for e in d["eleves"])

    def test_elle_est_triee_par_nom(self, client: TestClient, db: Session, ecole):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        noms = [e["nom"] for e in _feuille(client, h, ecole["classe"].classe_id).json()["eleves"]]
        assert noms == sorted(noms)

    def test_une_date_illisible_est_refusee(self, client: TestClient, db: Session, ecole):
        """Cette route répondait 500 : le paramètre texte était comparé à une
        colonne DATE et PostgreSQL refusait la comparaison."""
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        r = _feuille(client, h, ecole["classe"].classe_id, jour="pas-une-date")
        assert r.status_code == 422

    def test_une_demi_journee_inventee_est_refusee(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        r = _feuille(client, h, ecole["classe"].classe_id, demi="NUIT")
        assert r.status_code == 400

    def test_la_classe_d_une_autre_ecole_est_introuvable(
        self, client: TestClient, db: Session, ecole
    ):
        autre = Etablissement(code=f"APX-{_JETON}-{_uid()}", nom="Voisine",
                              type_etablissement="LYCEE")
        db.add(autre); db.commit(); db.refresh(autre)
        intrus = Utilisateur(
            nom="Sow", prenom="Voisin", nom_utilisateur=f"surv.x.{_JETON}.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT",
            statut="ACTIF", etablissement_id=autre.etablissement_id,
        )
        db.add(intrus); db.commit(); db.refresh(intrus)

        r = _feuille(client, _headers(client, intrus.nom_utilisateur),
                     ecole["classe"].classe_id)
        assert r.status_code == 404


class TestPointerEtRelire:
    def test_une_absence_justifiee_se_retrouve_telle_quelle(
        self, client: TestClient, db: Session, ecole
    ):
        """`est_justifie` ne passait pas par l'enregistrement : toute absence
        saisie ressortait « non justifiée », y compris avec un mot des
        parents."""
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        cible = ecole["inscriptions"][0]

        r = client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": cible.inscription_id, "date_presence": "2026-05-12",
            "demi_journee": "MATIN", "statut_presence": "ABSENT",
            "est_justifie": "O", "motif": "Rendez-vous médical",
        }])
        assert r.status_code == 200, r.text

        d = _feuille(client, h, ecole["classe"].classe_id).json()
        assert d["deja_pointee"] is True
        ligne = next(e for e in d["eleves"] if e["inscription_id"] == cible.inscription_id)
        assert ligne["statut"] == "ABSENT"
        assert ligne["est_justifie"] is True
        assert ligne["motif"] == "Rendez-vous médical"

    def test_rouvrir_la_feuille_n_efface_pas_le_travail_de_la_veille(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        absent, retard = ecole["inscriptions"][0], ecole["inscriptions"][1]
        client.post("/api/vie-scolaire/presences/batch", headers=h, json=[
            {"inscription_id": absent.inscription_id, "date_presence": "2026-05-12",
             "demi_journee": "MATIN", "statut_presence": "ABSENT", "est_justifie": "N"},
            {"inscription_id": retard.inscription_id, "date_presence": "2026-05-12",
             "demi_journee": "MATIN", "statut_presence": "RETARD", "est_justifie": "N"},
        ])
        etats = {e["inscription_id"]: e["statut"]
                 for e in _feuille(client, h, ecole["classe"].classe_id).json()["eleves"]}
        assert etats[absent.inscription_id] == "ABSENT"
        assert etats[retard.inscription_id] == "RETARD"

    def test_le_matin_et_l_apres_midi_ne_se_melangent_pas(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        cible = ecole["inscriptions"][0]
        client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": cible.inscription_id, "date_presence": "2026-05-12",
            "demi_journee": "MATIN", "statut_presence": "ABSENT", "est_justifie": "N",
        }])
        soir = _feuille(client, h, ecole["classe"].classe_id, demi="SOIR").json()
        assert soir["deja_pointee"] is False
        assert all(e["statut"] == "PRESENT" for e in soir["eleves"])

    def test_corriger_en_present_efface_la_justification(
        self, client: TestClient, db: Session, ecole
    ):
        """Un élève finalement présent ne peut pas rester « absent justifié
        pour rendez-vous médical » : ces informations ne veulent plus rien
        dire, et elles fausseraient le décompte des absences justifiées."""
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        cible = ecole["inscriptions"][0]
        client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": cible.inscription_id, "date_presence": "2026-05-12",
            "demi_journee": "MATIN", "statut_presence": "ABSENT",
            "est_justifie": "O", "motif": "Rendez-vous médical",
        }])
        client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": cible.inscription_id, "date_presence": "2026-05-12",
            "demi_journee": "MATIN", "statut_presence": "PRESENT",
            "est_justifie": "O", "motif": "erreur de saisie",
        }])
        ligne = next(e for e in _feuille(client, h, ecole["classe"].classe_id).json()["eleves"]
                     if e["inscription_id"] == cible.inscription_id)
        assert ligne["statut"] == "PRESENT"
        assert ligne["est_justifie"] is False
        assert ligne["motif"] is None

    def test_repointer_ne_cree_pas_de_doublon(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        cible = ecole["inscriptions"][0]
        for statut in ("ABSENT", "RETARD", "ABSENT"):
            client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
                "inscription_id": cible.inscription_id, "date_presence": "2026-05-12",
                "demi_journee": "MATIN", "statut_presence": statut, "est_justifie": "N",
            }])
        assert db.query(Presence).filter(
            Presence.inscription_id == cible.inscription_id,
            Presence.date_presence == date(2026, 5, 12),
            Presence.demi_journee == "MATIN",
        ).count() == 1


class TestLeChiffreDuTableauSuitLaSaisie:
    def test_une_absence_non_justifiee_remonte_dans_les_statistiques(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        avant = client.get(
            f"/api/vie-scolaire/presences/stats?classe_id={ecole['classe'].classe_id}",
            headers=h).json()

        client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": ecole["inscriptions"][0].inscription_id,
            "date_presence": "2026-05-12", "demi_journee": "MATIN",
            "statut_presence": "ABSENT", "est_justifie": "N",
        }])
        apres = client.get(
            f"/api/vie-scolaire/presences/stats?classe_id={ecole['classe'].classe_id}",
            headers=h).json()

        assert apres["absents"] == avant["absents"] + 1
        assert apres["absences_non_justifiees"] == avant["absences_non_justifiees"] + 1
        # Le taux se calcule sur l'effectif attendu, pas sur les lignes
        # saisies : une école qui ne note que les absences doit quand même
        # lire un taux qui a un sens.
        assert apres["taux_presence"] < 100
        assert apres["attendu"] > apres["total"]


class TestQuiFaitLAppel:
    """« Au primaire l'instituteur est sélectionné automatiquement ; au collège
    et au lycée on fait l'appel par matière, et choisir la matière sélectionne
    le professeur. »

    Ce n'est pas un confort d'écran : demander au surveillant de retrouver le
    maître d'une classe, ou de se souvenir qui avait la 10ème A à 10 h, c'est
    lui demander une information que l'emploi du temps contient déjà — et
    ouvrir la porte à un appel attribué au mauvais professeur.
    """

    def _classe_de_primaire(self, db: Session, ecole):
        """Le cycle décide : au primaire un seul maître, ailleurs un par heure.
        La fixture monte un collège — ce test-ci a besoin d'une vraie classe
        de primaire, pas d'un collège renommé."""
        from app.models.academique import Classe, Cycle, Niveau

        eid = ecole["etab"].etablissement_id
        cycle = Cycle(etablissement_id=eid, code="PRM", libelle="Primaire", ordre=0)
        db.add(cycle); db.commit(); db.refresh(cycle)
        niveau = Niveau(cycle_id=cycle.cycle_id, code=f"P{_JETON}{_uid()}",
                        libelle="1ère Année", ordre=1)
        db.add(niveau); db.commit(); db.refresh(niveau)
        classe = Classe(etablissement_id=eid, annee_id=ecole["annee"].annee_id,
                        niveau_id=niveau.niveau_id, code=f"CP{_JETON}{_uid()}",
                        libelle="1ère Année A", capacite_max=40, statut="ACTIVE")
        db.add(classe); db.commit(); db.refresh(classe)
        return cycle, classe

    def test_au_primaire_le_maitre_est_designe_d_office(
        self, client: TestClient, db: Session, ecole
    ):
        from app.models.academique import Affectation, Enseignant, Matiere

        cycle_prm, classe_prm = self._classe_de_primaire(db, ecole)

        # Un instituteur affecté à toutes les matières de la classe.
        maitre = Enseignant(
            etablissement_id=ecole["etab"].etablissement_id,
            matricule=f"MTR{_JETON}{_uid()}", nom="Kolié", prenom="Thierno",
            sexe="M", telephone=f"622{_uid():06d}", date_naissance=date(1985, 2, 9),
            statut="ACTIF",
        )
        db.add(maitre); db.commit(); db.refresh(maitre)
        for n in range(3):
            m = Matiere(cycle_id=cycle_prm.cycle_id,
                        code=f"M{_JETON}{_uid()}", libelle=f"Matière {n}")
            db.add(m); db.commit(); db.refresh(m)
            db.add(Affectation(
                enseignant_id=maitre.enseignant_id, matiere_id=m.matiere_id,
                classe_id=classe_prm.classe_id, annee_id=ecole["annee"].annee_id,
                nb_heures_semaine=5, statut="ACTIVE",
            ))
        db.commit()

        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        d = _feuille(client, h, classe_prm.classe_id).json()

        assert d["est_primaire"] is True
        assert d["creneaux"] == []          # il tient la classe toute la journée
        assert d["responsable"] is not None
        assert d["responsable"]["enseignant_id"] == maitre.enseignant_id
        assert d["responsable"]["nom"] == "Thierno Kolié"

    def test_sans_instituteur_affecte_l_ecran_le_dit(
        self, client: TestClient, db: Session, ecole
    ):
        """Un poste vacant se dit ; il ne se devine pas à une case vide."""
        _, classe_prm = self._classe_de_primaire(db, ecole)
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        d = _feuille(client, h, classe_prm.classe_id).json()
        assert d["est_primaire"] is True
        assert d["responsable"] is None

    def test_l_heure_de_cours_porte_sa_matiere_et_son_professeur(
        self, client: TestClient, db: Session, ecole
    ):
        from app.models.academique import CreneauEmploi, Enseignant, Matiere

        prof = Enseignant(
            etablissement_id=ecole["etab"].etablissement_id,
            matricule=f"PRF{_JETON}{_uid()}", nom="Diallo", prenom="Elhadj",
            sexe="M", telephone=f"623{_uid():06d}", date_naissance=date(1982, 7, 3),
            statut="ACTIF",
        )
        matiere = Matiere(cycle_id=ecole["cycle"].cycle_id,
                          code=f"ANG{_JETON}{_uid()}", libelle="Anglais")
        db.add_all([prof, matiere]); db.commit(); db.refresh(prof); db.refresh(matiere)
        db.add(CreneauEmploi(
            classe_id=ecole["classe"].classe_id, matiere_id=matiere.matiere_id,
            enseignant_id=prof.enseignant_id, jour="LUNDI",
            heure_debut="08:00", heure_fin="09:00",
            annee_id=ecole["annee"].annee_id, statut="ACTIVE",
        ))
        db.commit()

        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        d = _feuille(client, h, ecole["classe"].classe_id, jour="2026-05-11").json()  # lundi
        assert len(d["creneaux"]) == 1
        creneau = d["creneaux"][0]
        assert creneau["matiere"] == "Anglais"
        assert creneau["enseignant"] == "Elhadj Diallo"
        assert creneau["demi_journee"] == "MATIN"

    def test_deux_heures_du_meme_jour_ne_s_ecrasent_pas(
        self, client: TestClient, db: Session, ecole
    ):
        """Six heures de cours dans une journée, c'est six appels. Sans
        rattachement à l'heure, ils écriraient tous la même ligne et il ne
        resterait que le dernier."""
        from app.models.academique import CreneauEmploi, Enseignant, Matiere

        prof = Enseignant(
            etablissement_id=ecole["etab"].etablissement_id,
            matricule=f"PR2{_JETON}{_uid()}", nom="Camara", prenom="Adama",
            sexe="F", telephone=f"624{_uid():06d}", date_naissance=date(1990, 1, 5),
            statut="ACTIF",
        )
        db.add(prof); db.commit(); db.refresh(prof)
        creneaux = []
        for heure, nom in [("08:00", "Anglais"), ("09:00", "Physique")]:
            m = Matiere(cycle_id=ecole["cycle"].cycle_id,
                        code=f"{nom[:3]}{_JETON}{_uid()}", libelle=nom)
            db.add(m); db.commit(); db.refresh(m)
            cr = CreneauEmploi(
                classe_id=ecole["classe"].classe_id, matiere_id=m.matiere_id,
                enseignant_id=prof.enseignant_id, jour="LUNDI",
                heure_debut=heure, heure_fin=f"{int(heure[:2]) + 1:02d}:00",
                annee_id=ecole["annee"].annee_id, statut="ACTIVE",
            )
            db.add(cr); db.commit(); db.refresh(cr)
            creneaux.append(cr)

        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        cible = ecole["inscriptions"][0]

        premiere = client.get(
            f"/api/vie-scolaire/feuille-appel?classe_id={ecole['classe'].classe_id}"
            f"&date_presence=2026-05-11&creneau_id={creneaux[0].creneau_id}", headers=h).json()
        assert premiere["seance_id"] is not None

        client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": cible.inscription_id, "date_presence": "2026-05-11",
            "demi_journee": "MATIN", "statut_presence": "ABSENT", "est_justifie": "N",
            "seance_id": premiere["seance_id"],
        }])

        relu = client.get(
            f"/api/vie-scolaire/feuille-appel?classe_id={ecole['classe'].classe_id}"
            f"&date_presence=2026-05-11&creneau_id={creneaux[0].creneau_id}", headers=h).json()
        assert next(e["statut"] for e in relu["eleves"]
                    if e["inscription_id"] == cible.inscription_id) == "ABSENT"

        # L'heure suivante n'a pas encore été pointée : elle reste vierge.
        suivante = client.get(
            f"/api/vie-scolaire/feuille-appel?classe_id={ecole['classe'].classe_id}"
            f"&date_presence=2026-05-11&creneau_id={creneaux[1].creneau_id}", headers=h).json()
        assert suivante["seance_id"] != premiere["seance_id"]
        assert next(e["statut"] for e in suivante["eleves"]
                    if e["inscription_id"] == cible.inscription_id) == "PRESENT"

    def test_un_creneau_d_une_autre_classe_est_refuse(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["surveillant"].nom_utilisateur)
        r = client.get(
            f"/api/vie-scolaire/feuille-appel?classe_id={ecole['classe'].classe_id}"
            f"&date_presence=2026-05-11&creneau_id=999999", headers=h)
        assert r.status_code == 404
