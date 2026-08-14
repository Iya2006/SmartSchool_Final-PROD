"""
Tests — un parc informatique change d'état, et un ticket se ferme.

CE QUI A ÉTÉ TROUVÉ
-------------------
1. Aucune route ne permettait de MODIFIER un équipement. Une machine qui
   tombait en panne restait « BON » à vie, sauf à la recréer sous un autre
   code. Le compteur « équipements en panne » de l'informaticien ne pouvait
   donc refléter que l'état du jour de l'inventaire, jamais l'état réel du
   parc — et il affichait un chiffre rassurant pendant que les postes
   s'arrêtaient un à un.

2. `PUT /tickets/{id}/resoudre` existait mais n'était appelé nulle part.
   « Tickets ouverts » ne pouvait donc que grandir : l'indicateur devenait
   faux dès le premier dépannage réussi.

3. Le vocabulaire des états n'était écrit nulle part. Le formulaire proposait
   BON / PANNE / A_REMPLACER, le compteur lisait ces deux dernières valeurs,
   et rien n'empêchait d'en écrire une troisième par une autre voie — une
   machine avec un état inventé disparaissait alors du compteur sans que
   personne ne le voie.
"""
from datetime import date

import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, EquipementInformatique, Etablissement, Salle, Utilisateur,
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
    etab = Etablissement(code=f"ITX-{_JETON}-{uid}", nom=f"École IT {uid}",
                         type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id
    db.add(AnneeScolaire(
        etablissement_id=eid, code=f"AI{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    ))
    salle = Salle(etablissement_id=eid, code=f"S{_JETON}{uid}",
                  nom="Salle informatique", capacite=30, type_salle="INFORMATIQUE")
    db.add(salle); db.commit(); db.refresh(salle)
    poste = EquipementInformatique(
        etablissement_id=eid, salle_id=salle.salle_id, code=f"PC-{_JETON}-{uid}",
        nom="Poste élève 01", type_equipement="ORDINATEUR", marque="HP",
        etat="BON", statut="ACTIF",
    )
    db.add(poste); db.commit(); db.refresh(poste)
    info = Utilisateur(
        nom="Bah", prenom="Alseny", nom_utilisateur=f"info.{_JETON}.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="INFORMATICIEN",
        statut="ACTIF", etablissement_id=eid,
    )
    db.add(info); db.commit(); db.refresh(info)
    return {"etab": etab, "salle": salle, "poste": poste, "info": info}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestUneMachineChangeDEtat:
    def test_signaler_une_panne_se_voit_dans_le_compteur(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["info"].nom_utilisateur)
        avant = client.get("/api/informatique/stats", headers=h).json()
        assert avant["equipements_en_panne"] == 0

        r = client.put(f"/api/informatique/equipements/{ecole['poste'].equipement_id}",
                       headers=h, json={"etat": "PANNE", "observation": "Ne démarre plus"})
        assert r.status_code == 200, r.text
        assert r.json()["etat"] == "PANNE"
        assert r.json()["observation"] == "Ne démarre plus"

        apres = client.get("/api/informatique/stats", headers=h).json()
        assert apres["equipements_en_panne"] == 1

    def test_une_machine_a_remplacer_sort_du_parc_actif(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["info"].nom_utilisateur)
        r = client.put(f"/api/informatique/equipements/{ecole['poste'].equipement_id}",
                       headers=h, json={"etat": "A_REMPLACER"})
        assert r.json()["statut"] == "HORS_SERVICE"

    def test_une_machine_reparee_repart_en_service(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["info"].nom_utilisateur)
        eid = ecole["poste"].equipement_id
        client.put(f"/api/informatique/equipements/{eid}", headers=h, json={"etat": "A_REMPLACER"})
        r = client.put(f"/api/informatique/equipements/{eid}", headers=h, json={"etat": "BON"})
        assert r.json()["etat"] == "BON"
        assert r.json()["statut"] == "ACTIF"
        assert client.get("/api/informatique/stats", headers=h).json()["equipements_en_panne"] == 0

    def test_un_etat_invente_est_refuse(self, client: TestClient, db: Session, ecole):
        """Sinon la machine disparaît du compteur de pannes sans bruit."""
        h = _headers(client, ecole["info"].nom_utilisateur)
        r = client.put(f"/api/informatique/equipements/{ecole['poste'].equipement_id}",
                       headers=h, json={"etat": "CASSE"})
        assert r.status_code == 400
        db.expire_all()
        assert db.get(EquipementInformatique, ecole["poste"].equipement_id).etat == "BON"

    def test_une_salle_d_une_autre_ecole_est_refusee(
        self, client: TestClient, db: Session, ecole
    ):
        autre = Etablissement(code=f"ITY-{_JETON}-{_uid()}", nom="Voisine",
                              type_etablissement="LYCEE")
        db.add(autre); db.commit(); db.refresh(autre)
        salle_voisine = Salle(etablissement_id=autre.etablissement_id,
                              code=f"SV{_JETON}{_uid()}", nom="Salle voisine",
                              capacite=20, type_salle="INFORMATIQUE")
        db.add(salle_voisine); db.commit(); db.refresh(salle_voisine)

        h = _headers(client, ecole["info"].nom_utilisateur)
        r = client.put(f"/api/informatique/equipements/{ecole['poste'].equipement_id}",
                       headers=h, json={"salle_id": salle_voisine.salle_id})
        assert r.status_code == 404

    def test_la_machine_d_une_autre_ecole_est_introuvable(
        self, client: TestClient, db: Session, ecole
    ):
        autre = Etablissement(code=f"ITZ-{_JETON}-{_uid()}", nom="Voisine 2",
                              type_etablissement="LYCEE")
        db.add(autre); db.commit(); db.refresh(autre)
        intrus = Utilisateur(
            nom="Sow", prenom="Voisin", nom_utilisateur=f"info.x.{_JETON}.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="INFORMATICIEN",
            statut="ACTIF", etablissement_id=autre.etablissement_id,
        )
        db.add(intrus); db.commit(); db.refresh(intrus)

        r = client.put(f"/api/informatique/equipements/{ecole['poste'].equipement_id}",
                       headers=_headers(client, intrus.nom_utilisateur),
                       json={"etat": "PANNE"})
        assert r.status_code == 404
        db.expire_all()
        assert db.get(EquipementInformatique, ecole["poste"].equipement_id).etat == "BON"


class TestUnTicketSeFerme:
    def test_resoudre_un_ticket_le_retire_des_tickets_ouverts(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["info"].nom_utilisateur)
        r = client.post("/api/informatique/tickets", headers=h, json={
            "equipement_id": ecole["poste"].equipement_id,
            "titre": "Écran noir", "description": "Le poste ne s'allume plus",
            "priorite": "URGENTE",
        })
        assert r.status_code == 201, r.text
        ticket_id = r.json()["ticket_id"]

        ouverts = client.get("/api/informatique/stats", headers=h).json()
        assert ouverts["tickets_ouverts"] == 1
        assert ouverts["tickets_critiques"] == 1

        r = client.put(
            f"/api/informatique/tickets/{ticket_id}/resoudre?resolution=Alimentation remplacée",
            headers=h)
        assert r.status_code == 200, r.text

        apres = client.get("/api/informatique/stats", headers=h).json()
        assert apres["tickets_ouverts"] == 0
        assert apres["tickets_critiques"] == 0

    def test_le_ticket_d_une_autre_ecole_ne_se_ferme_pas(
        self, client: TestClient, db: Session, ecole
    ):
        h = _headers(client, ecole["info"].nom_utilisateur)
        ticket_id = client.post("/api/informatique/tickets", headers=h, json={
            "titre": "Imprimante", "description": "Bourrage", "priorite": "NORMALE",
        }).json()["ticket_id"]

        autre = Etablissement(code=f"ITW-{_JETON}-{_uid()}", nom="Voisine 3",
                              type_etablissement="LYCEE")
        db.add(autre); db.commit(); db.refresh(autre)
        intrus = Utilisateur(
            nom="Diallo", prenom="Voisin", nom_utilisateur=f"info.w.{_JETON}.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="INFORMATICIEN",
            statut="ACTIF", etablissement_id=autre.etablissement_id,
        )
        db.add(intrus); db.commit(); db.refresh(intrus)

        r = client.put(f"/api/informatique/tickets/{ticket_id}/resoudre?resolution=rien",
                       headers=_headers(client, intrus.nom_utilisateur))
        assert r.status_code == 404
        assert client.get("/api/informatique/stats", headers=h).json()["tickets_ouverts"] == 1
