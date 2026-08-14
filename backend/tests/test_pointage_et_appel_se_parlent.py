"""
Tests — le portail prouve la présence à l'école, l'appel prouve la présence en cours.

CE QUI A ÉTÉ TROUVÉ
-------------------
Deux contrôles vivaient côte à côte sans jamais se parler.

1. LA CARTE SCANNÉE AU PORTAIL (`ss_pointages_eleves`) dit qu'un élève est
   entré dans l'école ce jour-là. Un scan par jour suffit — c'est le geste du
   primaire comme du secondaire.

2. L'APPEL EN CLASSE (`ss_presences`) dit qu'il était là à ce cours-là. Au
   primaire, une fois dans la journée suffit : un seul maître, une seule
   classe. Au collège et au lycée, la classe change de professeur à chaque
   heure, donc l'appel se fait par matière, séance par séance.

Le surveillant faisait l'appel sans savoir qui avait franchi le portail. Et
personne ne voyait le cas qui compte le plus : **l'élève entré le matin et
absent en cours l'après-midi**. Il n'a pas manqué l'école, il a manqué le
cours — ce n'est pas la même chose à dire à une famille.

Vérifié sur les données réelles de l'école 3 : 23 116 lignes d'appel, 0
rattachée à une séance ; et pour les séances elles-mêmes, 1 061 créneaux à
l'emploi du temps pour **zéro** cours matérialisé.

LA RÈGLE POSÉE
--------------
La feuille d'appel dit ce que le portail sait, et ne décide rien à la place du
surveillant : c'est lui qui voit la salle. Elle signale deux contradictions —
entré mais absent en cours, et jamais entré.

Ouvrir l'écran des séances ouvre la journée depuis l'emploi du temps. Chaque
séance naît PREVUE ; l'absence d'un professeur se lit dans ce qui reste PREVUE
en fin de journée.
"""
from datetime import date, time, timedelta

import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Enseignant, Etablissement, Inscription,
    Matiere, Niveau, PointageEleve, Seance, CreneauEmploi, Utilisateur,
)

_JETON = uuid.uuid4().hex[:6]
_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _un_mardi() -> date:
    """Un jour ouvré stable : l'emploi du temps ne connaît que LUNDI..VENDREDI,
    et un test qui tomberait un samedi ne prouverait rien."""
    j = date(2026, 3, 10)  # mardi
    assert j.weekday() == 1
    return j


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"PTG-{_JETON}-{uid}", nom=f"École PTG {uid}",
                         type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"AN{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)

    cycle = Cycle(etablissement_id=eid, code=f"CO{_JETON}{uid}", libelle="Collège", ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N7{_JETON}{uid}",
                    libelle="7ème Année", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)

    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"7A{_JETON}{uid}", libelle="7ème Année A", capacite_max=50,
        effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    matiere = Matiere(cycle_id=cycle.cycle_id, code=f"MA{_JETON}{uid}",
                      libelle="Mathématiques")
    db.add(matiere); db.commit(); db.refresh(matiere)

    prof = Enseignant(
        etablissement_id=eid, matricule=f"ENS{_JETON}{uid}", nom="Kolié",
        prenom="Thierno", sexe="M", telephone=f"620{uid:06d}",
        date_naissance=date(1985, 2, 3), mode_remuneration="MENSUEL",
        salaire_base=2_000_000, statut="ACTIF",
    )
    db.add(prof); db.commit(); db.refresh(prof)

    # Deux heures de cours le mardi : c'est ce qui distingue le collège du
    # primaire, et ce que l'écran des séances doit savoir ouvrir.
    for h1, h2 in [("08:00", "09:00"), ("09:00", "10:00")]:
        db.add(CreneauEmploi(
            classe_id=classe.classe_id, matiere_id=matiere.matiere_id,
            enseignant_id=prof.enseignant_id, jour="MARDI",
            heure_debut=h1, heure_fin=h2, annee_id=annee.annee_id,
            statut="ACTIVE",
        ))
    db.commit()

    eleves = []
    for i, (nom, prenom) in enumerate([("Bah", "Sona"), ("Diallo", "Mariama"),
                                       ("Soumah", "Fatoumata")]):
        e = Eleve(etablissement_id=eid, matricule=f"EL{_JETON}{uid}{i}", nom=nom,
                  prenom=prenom, sexe="F", date_naissance=date(2012, 6, 1),
                  statut="ACTIF")
        db.add(e); db.commit(); db.refresh(e)
        insc = Inscription(eleve_id=e.eleve_id, classe_id=classe.classe_id,
                           annee_id=annee.annee_id, statut="ACTIVE")
        db.add(insc); db.commit(); db.refresh(insc)
        eleves.append((e, insc))

    comptes = {}
    for role, prefixe in [("SURVEILLANT", "surv"), ("ADMIN", "chef")]:
        u = Utilisateur(nom="Camara", prenom=prefixe.capitalize(),
                        nom_utilisateur=f"{prefixe}.{_JETON}.{uid}",
                        mot_de_passe=hash_password("motdepasse123"), role=role,
                        statut="ACTIF", etablissement_id=eid)
        db.add(u); db.commit(); db.refresh(u)
        comptes[role] = u

    return {"etab": etab, "annee": annee, "classe": classe, "matiere": matiere,
            "prof": prof, "eleves": eleves, **comptes}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _nb_seances(db: Session, ecole) -> int:
    """Les séances de CETTE école : la base est partagée entre les tests d'un
    même fichier, compter tout le monde ne prouverait rien."""
    return db.query(Seance).filter(
        Seance.classe_id == ecole["classe"].classe_id).count()


def _feuille(client, h, classe_id, jour, **kw):
    p = f"classe_id={classe_id}&date_presence={jour.isoformat()}"
    for k, v in kw.items():
        p += f"&{k}={v}"
    return client.get(f"/api/vie-scolaire/feuille-appel?{p}", headers=h)


class TestLaFeuilleDAppelSaitQuiEstEntre:

    def test_sans_aucun_pointage_personne_n_est_entre(
            self, client: TestClient, ecole):
        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        r = _feuille(client, h, ecole["classe"].classe_id, _un_mardi())
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["portail"]["pointes"] == 0
        assert d["portail"]["jamais_entres"] == 3
        assert all(e["jamais_entre"] for e in d["eleves"])
        assert all(e["heure_arrivee"] is None for e in d["eleves"])

    def test_l_eleve_scanne_au_portail_apparait_avec_son_heure(
            self, client: TestClient, db: Session, ecole):
        jour = _un_mardi()
        eleve, _ = ecole["eleves"][0]
        db.add(PointageEleve(
            eleve_id=eleve.eleve_id, etablissement_id=ecole["etab"].etablissement_id,
            date_pointage=jour, heure_arrivee=time(7, 32), statut="PRESENT",
        ))
        db.commit()

        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        d = _feuille(client, h, ecole["classe"].classe_id, jour).json()
        ligne = next(e for e in d["eleves"] if e["eleve_id"] == eleve.eleve_id)
        assert ligne["pointe_a_l_ecole"] is True
        assert ligne["heure_arrivee"] == "07:32"
        assert ligne["jamais_entre"] is False
        assert d["portail"]["pointes"] == 1
        assert d["portail"]["jamais_entres"] == 2

    def test_le_pointage_d_un_autre_jour_ne_compte_pas(
            self, client: TestClient, db: Session, ecole):
        """Être venu hier ne prouve rien sur aujourd'hui."""
        jour = _un_mardi()
        eleve, _ = ecole["eleves"][0]
        db.add(PointageEleve(
            eleve_id=eleve.eleve_id, etablissement_id=ecole["etab"].etablissement_id,
            date_pointage=jour - timedelta(days=1), heure_arrivee=time(7, 30),
            statut="PRESENT",
        ))
        db.commit()

        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        d = _feuille(client, h, ecole["classe"].classe_id, jour).json()
        assert d["portail"]["pointes"] == 0

    def test_entre_le_matin_mais_absent_en_cours_est_signale(
            self, client: TestClient, db: Session, ecole):
        """LE cas qui compte : il n'a pas manqué l'école, il a manqué le cours."""
        jour = _un_mardi()
        eleve, insc = ecole["eleves"][0]
        db.add(PointageEleve(
            eleve_id=eleve.eleve_id, etablissement_id=ecole["etab"].etablissement_id,
            date_pointage=jour, heure_arrivee=time(7, 28), statut="PRESENT",
        ))
        db.commit()

        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        r = client.post("/api/vie-scolaire/presences/batch", headers=h, json=[{
            "inscription_id": insc.inscription_id,
            "date_presence": jour.isoformat(),
            "demi_journee": "MATIN",
            "statut_presence": "ABSENT",
            "est_justifie": "N",
        }])
        assert r.status_code in (200, 201), r.text

        d = _feuille(client, h, ecole["classe"].classe_id, jour).json()
        ligne = next(e for e in d["eleves"] if e["eleve_id"] == eleve.eleve_id)
        assert ligne["statut"] == "ABSENT"
        assert ligne["pointe_a_l_ecole"] is True
        assert ligne["entre_mais_absent"] is True
        assert d["portail"]["entres_mais_absents"] == 1

    def test_present_en_cours_n_est_pas_une_contradiction(
            self, client: TestClient, db: Session, ecole):
        jour = _un_mardi()
        eleve, _ = ecole["eleves"][0]
        db.add(PointageEleve(
            eleve_id=eleve.eleve_id, etablissement_id=ecole["etab"].etablissement_id,
            date_pointage=jour, heure_arrivee=time(7, 28), statut="PRESENT",
        ))
        db.commit()
        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        d = _feuille(client, h, ecole["classe"].classe_id, jour).json()
        assert d["portail"]["entres_mais_absents"] == 0

    def test_le_pointage_d_une_autre_ecole_est_invisible(
            self, client: TestClient, db: Session, ecole):
        """Un pointage rattaché à une autre école ne doit jamais remonter ici."""
        jour = _un_mardi()
        eleve, _ = ecole["eleves"][0]
        autre = Etablissement(code=f"AUT-{_JETON}", nom="Autre", type_etablissement="LYCEE")
        db.add(autre); db.commit(); db.refresh(autre)
        db.add(PointageEleve(
            eleve_id=eleve.eleve_id, etablissement_id=autre.etablissement_id,
            date_pointage=jour, heure_arrivee=time(7, 10), statut="PRESENT",
        ))
        db.commit()

        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        d = _feuille(client, h, ecole["classe"].classe_id, jour).json()
        assert d["portail"]["pointes"] == 0


class TestOuvrirLEcranOuvreLaJournee:

    def test_l_ecran_des_seances_ouvre_les_cours_du_jour(
            self, client: TestClient, db: Session, ecole):
        """1 061 créneaux à l'emploi du temps et zéro cours affiché : c'est ce
        que voyait la direction."""
        jour = _un_mardi()
        h = _headers(client, ecole["ADMIN"].nom_utilisateur)
        assert _nb_seances(db, ecole) == 0

        r = client.get(f"/api/seances?date={jour.isoformat()}", headers=h)
        assert r.status_code == 200, r.text
        seances = r.json()
        assert len(seances) == 2, seances
        assert all(s["statut"] == "PREVUE" for s in seances)
        assert {s["heure_debut_prevue"][:5] for s in seances} == {"08:00", "09:00"}
        assert all(s["enseignant_prevu"] == "Thierno Kolié" for s in seances)

    def test_rouvrir_le_meme_jour_ne_duplique_rien(
            self, client: TestClient, db: Session, ecole):
        jour = _un_mardi()
        h = _headers(client, ecole["ADMIN"].nom_utilisateur)
        client.get(f"/api/seances?date={jour.isoformat()}", headers=h)
        client.get(f"/api/seances?date={jour.isoformat()}", headers=h)
        r = client.get(f"/api/seances?date={jour.isoformat()}", headers=h)
        assert len(r.json()) == 2

    def test_le_week_end_n_ouvre_aucun_cours(
            self, client: TestClient, ecole):
        """L'emploi du temps ne connaît que LUNDI..VENDREDI."""
        samedi = date(2026, 3, 14)
        assert samedi.weekday() == 5
        h = _headers(client, ecole["ADMIN"].nom_utilisateur)
        r = client.get(f"/api/seances?date={samedi.isoformat()}", headers=h)
        assert r.status_code == 200
        assert r.json() == []

    def test_une_plage_de_dates_n_ouvre_rien(
            self, client: TestClient, db: Session, ecole):
        """Ouvrir un trimestre entier d'un clic créerait des dizaines de
        milliers de lignes que personne n'a demandées."""
        h = _headers(client, ecole["ADMIN"].nom_utilisateur)
        r = client.get("/api/seances?date_debut=2026-03-01&date_fin=2026-06-30", headers=h)
        assert r.status_code == 200
        assert _nb_seances(db, ecole) == 0

    def test_on_peut_consulter_sans_rien_creer(
            self, client: TestClient, db: Session, ecole):
        jour = _un_mardi()
        h = _headers(client, ecole["ADMIN"].nom_utilisateur)
        r = client.get(
            f"/api/seances?date={jour.isoformat()}&ouvrir_la_journee=false", headers=h)
        assert r.status_code == 200
        assert r.json() == []
        assert _nb_seances(db, ecole) == 0

    def test_les_cours_d_une_autre_ecole_ne_remontent_pas(
            self, client: TestClient, db: Session, ecole):
        jour = _un_mardi()
        h = _headers(client, ecole["ADMIN"].nom_utilisateur)
        client.get(f"/api/seances?date={jour.isoformat()}", headers=h)
        seances = client.get(f"/api/seances?date={jour.isoformat()}", headers=h).json()
        ids = {s["classe_id"] for s in seances}
        assert ids == {ecole["classe"].classe_id}
