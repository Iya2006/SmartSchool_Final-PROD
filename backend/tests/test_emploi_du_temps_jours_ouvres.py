"""
Tests — jours de classe de l'emploi du temps.

Le serveur portait une liste figée `JOURS = LUNDI..VENDREDI` et refusait en
400 tout créneau posé un samedi. Beaucoup d'écoles guinéennes ont pourtant
cours le samedi matin. Le réglage existait déjà — Paramètres › Emploi du temps
laissait cocher les sept jours — mais sa valeur n'était lue nulle part : encore
un « interrupteur sans fil ».

Les jours ouvrés viennent désormais de ce réglage, établissement par
établissement. Ce fichier verrouille les quatre points qui comptent :
le samedi passe, un jour non déclaré est refusé avec un message qui dit où
l'activer, le réglage d'une école n'affecte pas sa voisine, et la génération
automatique ne remplit que les jours déclarés.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, ClasseMatiere, CreneauEmploi, Cycle, Etablissement,
    Matiere, Niveau, ParametreEtablissement, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    """Une école complète : année, cycle, niveau, classe, matière, admin."""

    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.db = db
        self.etab = Etablissement(
            code=f"EDT-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE",
        )
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="7ème", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"7ème A {uid}", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere = Matiere(
            cycle_id=self.cycle.cycle_id, code=f"MA{uid}", libelle="Mathématiques",
            categorie="Sciences", nb_heures_semaine=2,
        )
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"EDT{uid}", nom_utilisateur=f"edt.admin.{uid}",
            email=f"edt.admin.{uid}@smartschool.gn", telephone=f"62700{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def declarer_jours(self, jours: str) -> None:
        """Écrit le réglage exactement comme le fait l'écran de paramètres."""
        self.db.add(ParametreEtablissement(
            etablissement_id=self.etab.etablissement_id,
            categorie="EMPLOI_DU_TEMPS", cle="horaires.jours_ouvres",
            valeur=jours, type_valeur="STRING",
        ))
        self.db.commit()

    def rattacher_matiere(self, nb_heures: int) -> None:
        self.db.add(ClasseMatiere(
            classe_id=self.classe.classe_id, matiere_id=self.matiere.matiere_id,
            nb_heures_semaine=nb_heures, est_active="O",
        ))
        self.db.commit()


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _corps(ecole: Ecole, jour: str, heure: str = "08:00") -> dict:
    fin = f"{int(heure.split(':')[0]) + 1:02d}:00"
    return {
        "classe_id": ecole.classe.classe_id,
        "matiere_id": ecole.matiere.matiere_id,
        "jour": jour,
        "heure_debut": heure,
        "heure_fin": fin,
    }


class TestJourAccepte:
    def test_samedi_accepte_par_defaut(self, client: TestClient, db: Session):
        """Une école qui n'a rien réglé doit pouvoir poser un cours le samedi.

        C'est le défaut affiché par l'écran de paramètres ; deux défauts
        divergents feraient qu'un jour proposé serait refusé par le serveur.
        """
        a = Ecole(db, "SAM")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/emploi-du-temps", json=_corps(a, "SAMEDI"), headers=headers)
        assert resp.status_code == 201, resp.text

        pose = db.query(CreneauEmploi).filter(
            CreneauEmploi.creneau_id == resp.json()["creneau_id"]
        ).first()
        assert pose is not None and pose.jour == "SAMEDI"

    def test_dimanche_accepte_si_declare(self, client: TestClient, db: Session):
        a = Ecole(db, "DIM")
        a.declarer_jours("LUNDI,MARDI,MERCREDI,JEUDI,VENDREDI,SAMEDI,DIMANCHE")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/emploi-du-temps", json=_corps(a, "DIMANCHE"), headers=headers)
        assert resp.status_code == 201, resp.text

    def test_minuscules_acceptees(self, client: TestClient, db: Session):
        a = Ecole(db, "MIN")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/emploi-du-temps", json=_corps(a, "samedi"), headers=headers)
        assert resp.status_code == 201, resp.text


class TestJourRefuse:
    def test_jour_non_declare_refuse_et_indique_ou_l_activer(self, client: TestClient, db: Session):
        """Refuser sans dire où corriger renvoie l'école dans le mur : le
        réglage est sur un AUTRE écran, impossible à deviner."""
        a = Ecole(db, "REF")
        a.declarer_jours("LUNDI,MARDI,MERCREDI,JEUDI,VENDREDI")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/emploi-du-temps", json=_corps(a, "SAMEDI"), headers=headers)
        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"].lower()
        assert "samedi" in detail
        assert "emploi du temps" in detail and "jours ouvres" in detail

    def test_jour_inexistant_refuse(self, client: TestClient, db: Session):
        a = Ecole(db, "INX")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/emploi-du-temps", json=_corps(a, "LUNDIX"), headers=headers)
        assert resp.status_code == 400, resp.text

    def test_valeur_vide_retombe_sur_la_semaine_standard(self, client: TestClient, db: Session):
        """Une école sans aucun jour ouvré ne pourrait plus rien programmer."""
        a = Ecole(db, "VID")
        a.declarer_jours("")
        headers = _headers(client, a.admin.nom_utilisateur)

        assert client.post(
            "/api/emploi-du-temps", json=_corps(a, "SAMEDI"), headers=headers
        ).status_code == 201


class TestIsolationDuReglage:
    def test_le_reglage_d_une_ecole_ne_deborde_pas_sur_l_autre(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ISA"), Ecole(db, "ISB")
        a.declarer_jours("LUNDI,MARDI,MERCREDI,JEUDI,VENDREDI")   # A ne travaille pas le samedi
        b.declarer_jours("LUNDI,MARDI,MERCREDI,JEUDI,VENDREDI,SAMEDI")

        h_a = _headers(client, a.admin.nom_utilisateur)
        h_b = _headers(client, b.admin.nom_utilisateur)

        assert client.post("/api/emploi-du-temps", json=_corps(a, "SAMEDI"), headers=h_a).status_code == 400
        assert client.post("/api/emploi-du-temps", json=_corps(b, "SAMEDI"), headers=h_b).status_code == 201

    def test_la_grille_renvoie_les_jours_de_l_ecole(self, client: TestClient, db: Session):
        a = Ecole(db, "GRI")
        a.declarer_jours("SAMEDI,LUNDI,MERCREDI")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/emploi-du-temps/classe/{a.classe.classe_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        # Remis dans l'ordre de la semaine, pas dans l'ordre de saisie.
        assert resp.json()["jours"] == ["LUNDI", "MERCREDI", "SAMEDI"]


class TestModification:
    def test_deplacer_un_cours_vers_un_jour_non_declare_refuse(self, client: TestClient, db: Session):
        a = Ecole(db, "MOD")
        headers = _headers(client, a.admin.nom_utilisateur)
        cree = client.post("/api/emploi-du-temps", json=_corps(a, "LUNDI"), headers=headers)
        assert cree.status_code == 201, cree.text
        creneau_id = cree.json()["creneau_id"]

        a.declarer_jours("LUNDI,MARDI,MERCREDI,JEUDI,VENDREDI")

        resp = client.put(
            f"/api/emploi-du-temps/{creneau_id}", json={"jour": "SAMEDI"}, headers=headers
        )
        assert resp.status_code == 400, resp.text
        assert db.query(CreneauEmploi).filter(
            CreneauEmploi.creneau_id == creneau_id
        ).first().jour == "LUNDI"


class TestGenerationAutomatique:
    def test_ne_remplit_que_les_jours_declares(self, client: TestClient, db: Session):
        """La génération distribuait sur cinq jours en dur : une école ouverte
        le samedi perdait un sixième de sa grille."""
        a = Ecole(db, "GEN")
        a.declarer_jours("LUNDI,SAMEDI")
        a.rattacher_matiere(nb_heures=9)   # plus d'heures que ne tient un seul jour
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            f"/api/emploi-du-temps/auto-generation/{a.classe.classe_id}", headers=headers
        )
        assert resp.status_code == 201, resp.text

        jours_poses = {
            c.jour for c in db.query(CreneauEmploi).filter(
                CreneauEmploi.classe_id == a.classe.classe_id
            ).all()
        }
        assert jours_poses == {"LUNDI", "SAMEDI"}
