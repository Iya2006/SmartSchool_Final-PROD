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

    return {"etab": etab, "annee": annee, "classe": classe,
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
