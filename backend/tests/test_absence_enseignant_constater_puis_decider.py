"""
Tests — celui qui constate ne décide pas de ce qu'on retire d'un salaire.

CE QUI A ÉTÉ TROUVÉ
-------------------
La seule route qui enregistrait l'absence d'un enseignant vivait dans le module
financier, réservé à la direction et au comptable. Vérifié sur les vrais
comptes de l'école :

    surveillant  403  privilèges insuffisants
    comptable    200  Absence enregistrée
    admin        200  Absence enregistrée

Or c'est le surveillant qui voit qu'un professeur n'est pas venu. Le comptable,
lui, n'était pas dans la cour à 8 h — et c'est pourtant lui qui décidait, avec
une décision qui retire de l'argent sur une paie. Celui qui a l'information
n'avait pas le droit de la saisir ; celui qui avait le droit n'avait pas
l'information.

LA RÈGLE POSÉE
--------------
La surveillance SIGNALE, la direction TRANCHE. Un signalement ne touche pas la
paie. Valider applique la retenue, écarter n'en applique aucune, et dans les
deux cas la trace dit qui a constaté et qui a décidé — une retenue se conteste,
elle doit pouvoir dire d'où elle vient.

CE QUI N'A PAS CHANGÉ
---------------------
Les absences déjà en base sont passées en VALIDE : elles venaient de la
direction ou de la comptabilité, qui étaient jusqu'ici les seules à pouvoir les
saisir. Leur effet sur la paie est exactement le même qu'avant.
"""
from datetime import date, timedelta

import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AbsencePersonnel, AnneeScolaire, Enseignant, Etablissement, Utilisateur,
)

_JETON = uuid.uuid4().hex[:6]
_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"ABS-{_JETON}-{uid}", nom=f"École ABS {uid}",
                         type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id
    db.add(AnneeScolaire(
        etablissement_id=eid, code=f"AA{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    ))
    prof = Enseignant(
        etablissement_id=eid, matricule=f"ENS{_JETON}{uid}", nom="Bah",
        prenom="Djelika", sexe="F", telephone=f"620{uid:06d}",
        date_naissance=date(1988, 4, 12), mode_remuneration="HORAIRE",
        taux_horaire=25000, salaire_base=0, statut="ACTIF",
    )
    db.add(prof); db.commit(); db.refresh(prof)

    comptes = {}
    for role, prefixe in [("SURVEILLANT", "surv"), ("ADMIN", "chef"),
                          ("COMPTABLE", "compta"), ("BIBLIOTHECAIRE", "biblio")]:
        u = Utilisateur(
            nom="Toure", prenom=prefixe.capitalize(),
            nom_utilisateur=f"{prefixe}.{_JETON}.{uid}",
            mot_de_passe=hash_password("motdepasse123"), role=role,
            statut="ACTIF", etablissement_id=eid,
        )
        db.add(u); db.commit(); db.refresh(u)
        comptes[role] = u

    db.commit()
    return {"etab": etab, "prof": prof, **comptes}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _signaler(client, headers, prof, jour=None, motif="Cours de 8h non assuré"):
    return client.post("/api/vie-scolaire/absences-enseignant", headers=headers, json={
        "employe_id": f"ENS_{prof.enseignant_id}",
        "date_absence": (jour or (date.today() - timedelta(days=3))).isoformat(),
        "motif": motif,
    })


class TestConstaterEstUnDroitDeLaSurveillance:
    def test_le_surveillant_peut_signaler(self, client: TestClient, db: Session, ecole):
        r = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                      ecole["prof"])
        assert r.status_code == 201, r.text
        assert r.json()["statut"] == "SIGNALE"
        assert "Aucune retenue" in r.json()["message"]

    def test_le_bibliothecaire_ne_signale_pas(self, client: TestClient, db: Session, ecole):
        """Le droit de constater appartient à qui est sur le terrain."""
        r = _signaler(client, _headers(client, ecole["BIBLIOTHECAIRE"].nom_utilisateur),
                      ecole["prof"])
        assert r.status_code == 403

    def test_une_absence_a_venir_est_refusee(self, client: TestClient, db: Session, ecole):
        r = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                      ecole["prof"], jour=date.today() + timedelta(days=2))
        assert r.status_code == 400
        assert "pas encore eu lieu" in r.json()["detail"]

    def test_deux_signalements_le_meme_jour_ne_font_pas_deux_retenues(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        assert _signaler(client, h, ecole["prof"]).status_code == 201
        r = _signaler(client, h, ecole["prof"])
        assert r.status_code == 400
        assert "déjà enregistrée" in r.json()["detail"]

    def test_une_date_illisible_est_refusee(self, client: TestClient, db: Session, ecole):
        r = client.post("/api/vie-scolaire/absences-enseignant",
                        headers=_headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        json={"employe_id": f"ENS_{ecole['prof'].enseignant_id}",
                              "date_absence": "hier"})
        assert r.status_code == 400


class TestDeciderAppartientALaDirection:
    def test_le_surveillant_ne_tranche_pas(self, client: TestClient, db: Session, ecole):
        """Le cœur de la règle : il constate, il ne décide pas de la retenue."""
        h = _headers(client, ecole["SURVEILLANT"].nom_utilisateur)
        aid = _signaler(client, h, ecole["prof"]).json()["absence_id"]

        r = client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                       headers=h, json={"statut": "VALIDE"})
        assert r.status_code == 403
        db.expire_all()
        assert db.get(AbsencePersonnel, aid).statut == "SIGNALE"

    def test_la_direction_valide(self, client: TestClient, db: Session, ecole):
        aid = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        ecole["prof"]).json()["absence_id"]
        r = client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                       headers=_headers(client, ecole["ADMIN"].nom_utilisateur),
                       json={"statut": "VALIDE"})
        assert r.status_code == 200, r.text
        assert r.json()["retient_sur_la_paie"] is True

    def test_le_comptable_aussi(self, client: TestClient, db: Session, ecole):
        aid = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        ecole["prof"]).json()["absence_id"]
        r = client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                       headers=_headers(client, ecole["COMPTABLE"].nom_utilisateur),
                       json={"statut": "ECARTE"})
        assert r.status_code == 200
        assert r.json()["retient_sur_la_paie"] is False

    def test_une_decision_inventee_est_refusee(self, client: TestClient, db: Session, ecole):
        aid = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        ecole["prof"]).json()["absence_id"]
        r = client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                       headers=_headers(client, ecole["ADMIN"].nom_utilisateur),
                       json={"statut": "PEUT_ETRE"})
        assert r.status_code == 400

    def test_la_trace_dit_qui_a_constate_et_qui_a_tranche(
        self, client: TestClient, db: Session, ecole
    ):
        """Une retenue se conteste : elle doit pouvoir dire d'où elle vient."""
        aid = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        ecole["prof"]).json()["absence_id"]
        client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                   headers=_headers(client, ecole["ADMIN"].nom_utilisateur),
                   json={"statut": "VALIDE"})
        db.expire_all()
        absence = db.get(AbsencePersonnel, aid)
        assert ecole["SURVEILLANT"].prenom in (absence.signale_par or "")
        assert ecole["ADMIN"].prenom in (absence.valide_par or "")
        assert absence.date_decision is not None


class TestLaPaieNeBougeQueSurDecision:
    def _retenue(self, db, ecole, mois):
        from app.api.finance import _calculer_salaire
        db.expire_all()
        return _calculer_salaire(db, f"ENS_{ecole['prof'].enseignant_id}", mois,
                                 ecole["etab"].etablissement_id)["total_absences"]

    def test_un_signalement_seul_ne_retient_rien(
        self, client: TestClient, db: Session, ecole
    ):
        jour = date.today().replace(day=3)
        mois = jour.strftime("%Y-%m")
        avant = self._retenue(db, ecole, mois)

        _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                  ecole["prof"], jour=jour)
        assert self._retenue(db, ecole, mois) == avant

    def test_ecarter_un_signalement_ne_retient_rien(
        self, client: TestClient, db: Session, ecole
    ):
        jour = date.today().replace(day=3)
        mois = jour.strftime("%Y-%m")
        avant = self._retenue(db, ecole, mois)

        aid = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        ecole["prof"], jour=jour).json()["absence_id"]
        client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                   headers=_headers(client, ecole["ADMIN"].nom_utilisateur),
                   json={"statut": "ECARTE"})
        assert self._retenue(db, ecole, mois) == avant

    def test_une_absence_justifiee_confirmee_ne_retient_rien(
        self, client: TestClient, db: Session, ecole
    ):
        """Un professeur en congé maladie confirmé ne perd pas son salaire."""
        jour = date.today().replace(day=3)
        mois = jour.strftime("%Y-%m")
        avant = self._retenue(db, ecole, mois)

        aid = _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                        ecole["prof"], jour=jour).json()["absence_id"]
        r = client.put(f"/api/vie-scolaire/absences-enseignant/{aid}",
                       headers=_headers(client, ecole["ADMIN"].nom_utilisateur),
                       json={"statut": "VALIDE", "est_justifie": True})
        assert r.json()["retient_sur_la_paie"] is False
        assert self._retenue(db, ecole, mois) == avant


class TestChaqueEcoleResteChezElle:
    def test_on_ne_signale_pas_l_enseignant_d_une_autre_ecole(
        self, client: TestClient, db: Session, ecole
    ):
        voisine = Etablissement(code=f"ABY-{_JETON}-{_uid()}", nom="Voisine",
                                type_etablissement="LYCEE")
        db.add(voisine); db.commit(); db.refresh(voisine)
        surv_voisin = Utilisateur(
            nom="Sow", prenom="Voisin", nom_utilisateur=f"surv.v.{_JETON}.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT",
            statut="ACTIF", etablissement_id=voisine.etablissement_id,
        )
        db.add(surv_voisin); db.commit(); db.refresh(surv_voisin)

        r = _signaler(client, _headers(client, surv_voisin.nom_utilisateur), ecole["prof"])
        assert r.status_code == 404

    def test_la_liste_ne_montre_que_ses_signalements(
        self, client: TestClient, db: Session, ecole
    ):
        _signaler(client, _headers(client, ecole["SURVEILLANT"].nom_utilisateur),
                  ecole["prof"])
        voisine = Etablissement(code=f"ABZ-{_JETON}-{_uid()}", nom="Voisine 2",
                                type_etablissement="LYCEE")
        db.add(voisine); db.commit(); db.refresh(voisine)
        chef_voisin = Utilisateur(
            nom="Diallo", prenom="Voisin", nom_utilisateur=f"chef.v.{_JETON}.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN",
            statut="ACTIF", etablissement_id=voisine.etablissement_id,
        )
        db.add(chef_voisin); db.commit(); db.refresh(chef_voisin)

        r = client.get("/api/vie-scolaire/absences-enseignant",
                       headers=_headers(client, chef_voisin.nom_utilisateur))
        assert r.status_code == 200
        assert r.json()["total"] == 0
