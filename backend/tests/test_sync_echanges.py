"""
Échanges entre les postes et le cloud (étape B4) : envoi, réception, refus.

Le cloud est l'application de test ; chaque poste est une base SQLite neuve,
installée par le vrai parcours d'installation (enregistrement, instantané,
curseur), puis synchronisée par le vrai service (`Synchroniseur.cycle`).
`sur_le_poste` fait tourner les routes de l'application sur la base d'un
poste, pour exercer le vrai code métier hors-ligne.
"""
from contextlib import contextmanager
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, sessionmaker

import app.sync.installation as module_installation
from app.core.database import get_db
from app.core.recu_paiement import code_verification
from app.models.academique import (
    Appareil, Eleve, Evenement, Facture, Inscription, Paiement, SyncConflit, SyncJournal, Utilisateur,
)
from app.core.security import hash_password
from app.sync.cote_poste import changements_en_attente, construire_lot
from app.sync.identifiants import appareil_de
from app.sync.installation import Progression, installer, lire_appareil
from app.sync.service import AppareilRefuse, Synchroniseur
from app.sync.tables_poste import non_appliques, refus_locaux
from main import app
from tests.test_isolation_multi_ecole import Ecole, _headers, _uid
from tests.test_sync_identifiants import _base_locale


@pytest.fixture(autouse=True)
def sans_attente(monkeypatch):
    monkeypatch.setattr(module_installation, "_pause", lambda *_: None)


class Poste:
    def __init__(self, client: TestClient, ecole: Ecole, dossier, avec_fichiers: bool = False):
        self.client, self.ecole = client, ecole
        self.moteur = _base_locale()
        self.fichiers = str(dossier / "fichiers") if avec_fichiers else None
        installer(ecole.admin.nom_utilisateur, "motdepasse123", client=client, moteur_local=self.moteur,
                  dossier_poste=str(dossier / "poste"), progression=Progression(), dossier_fichiers=self.fichiers)
        self.appareil = lire_appareil(str(dossier / "poste"))
        self.numero = self.appareil["appareil_id"]

    def synchroniser(self) -> Synchroniseur:
        service = Synchroniseur(self.moteur, lambda: self.appareil["jeton"], "", dossier_fichiers=self.fichiers)
        service.cycle(self.client)
        return service

    def session(self) -> Session:
        return Session(self.moteur)

    @contextmanager
    def routes(self):
        """Les routes de l'application tournent sur la base de ce poste."""
        fabrique = sessionmaker(bind=self.moteur)

        def _db():
            s = fabrique()
            try:
                yield s
            finally:
                s.close()

        avant = app.dependency_overrides[get_db]
        app.dependency_overrides[get_db] = _db
        try:
            yield
        finally:
            app.dependency_overrides[get_db] = avant


def _evenement(s: Session, ecole: Ecole, titre: str) -> Evenement:
    ev = Evenement(etablissement_id=ecole.etab.etablissement_id, titre=titre,
                   date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON")
    s.add(ev)
    s.commit()
    s.refresh(ev)
    return ev


def test_ce_qu_un_poste_cree_hors_ligne_arrive_sur_le_cloud(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    with poste.session() as s:
        ev = _evenement(s, a, "Kermesse")
        eleve = Eleve(etablissement_id=a.etab.etablissement_id, matricule=f"SYNC-{_uid()}", nom="Bah",
                      prenom="Mariama", date_naissance=date(2014, 4, 4), sexe="F", statut="ACTIF")
        s.add(eleve)
        s.flush()
        s.add(Inscription(eleve_id=eleve.eleve_id, classe_id=a.classe.classe_id,
                          annee_id=a.annee.annee_id, statut="ACTIVE"))
        s.commit()
        ev_id, eleve_id = ev.evenement_id, eleve.eleve_id
    assert changements_en_attente(poste.moteur) == 3

    poste.synchroniser()

    db.expire_all()
    assert db.get(Evenement, ev_id).titre == "Kermesse"
    assert db.get(Eleve, eleve_id).prenom == "Mariama"
    assert db.query(Inscription).filter(Inscription.eleve_id == eleve_id).count() == 1
    # Même identifiant partout, et le journal du cloud sait d'où ça vient.
    assert appareil_de(eleve_id) == poste.numero
    origine = db.query(SyncJournal.appareil_origine).filter(
        SyncJournal.nom_table == "ss_eleves", SyncJournal.cle == eleve_id).first()
    assert origine == (poste.numero,)
    # Accusé reçu : plus rien en attente.
    assert changements_en_attente(poste.moteur) == 0


def test_ce_qui_change_sur_le_cloud_arrive_sur_le_poste(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    poste = Poste(client, a, tmp_path)

    eleve.nom = "Kaba"
    nouveau = a.evenement(db)
    db.commit()
    supprime = a.evenement(db)
    supprime_id = supprime.evenement_id
    poste.synchroniser()  # reçoit aussi l'événement « supprime » ...
    db.delete(supprime)
    db.commit()
    poste.synchroniser()  # ... puis sa suppression

    with poste.session() as s:
        assert s.get(Eleve, eleve.eleve_id).nom == "Kaba"
        assert s.get(Evenement, nouveau.evenement_id) is not None
        assert s.get(Evenement, supprime_id) is None


def test_ce_qu_un_poste_cree_arrive_sur_l_autre_poste_sans_echo(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    p1, p2 = Poste(client, a, tmp_path / "p1"), Poste(client, a, tmp_path / "p2")
    with p1.session() as s:
        ev_id = _evenement(s, a, "Réunion des parents").evenement_id

    p1.synchroniser()
    service2 = p2.synchroniser()
    with p2.session() as s:
        assert s.get(Evenement, ev_id).titre == "Réunion des parents"
    assert service2.recus >= 1
    # Le poste 1 ne reçoit pas en retour ce qu'il a lui-même envoyé.
    assert p1.synchroniser().recus == 0
    # Ce qui vient du cloud ne repart pas du poste 2.
    assert changements_en_attente(p2.moteur) == 0


def test_un_lot_renvoye_apres_une_coupure_n_a_aucun_effet_de_plus(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    with poste.session() as s:
        ev_id = _evenement(s, a, "Sortie").evenement_id
    changements, _ = construire_lot(poste.moteur)
    entetes = {"Authorization": f"Appareil {poste.appareil['jeton']}"}
    # La réponse s'est perdue : le poste renvoie le même lot.
    for _ in range(2):
        rep = client.post("/api/sync/appareil/envoi", json={"changements": changements}, headers=entetes)
        assert rep.status_code == 200 and rep.json()["refus"] == []
    assert db.query(Evenement).filter(Evenement.evenement_id == ev_id).count() == 1


def test_un_poste_ne_touche_jamais_une_autre_ecole(client: TestClient, db: Session, tmp_path):
    a, b = Ecole(db, "A"), Ecole(db, "B")
    eleve_b = b.eleve(db)
    poste_a = Poste(client, a, tmp_path)
    entetes = {"Authorization": f"Appareil {poste_a.appareil['jeton']}"}
    intrusions = [
        # Modifier un élève de l'école B.
        {"seq": 1, "table": "ss_eleves", "cle": eleve_b.eleve_id, "operation": "U",
         "donnees": {"eleve_id": eleve_b.eleve_id, "etablissement_id": b.etab.etablissement_id,
                     "matricule": eleve_b.matricule, "nom": "Pirate", "prenom": "X", "sexe": "M", "statut": "ACTIF"}},
        # Le supprimer.
        {"seq": 2, "table": "ss_eleves", "cle": eleve_b.eleve_id, "operation": "D"},
        # Créer une ligne rattachée à l'école B depuis le poste de A.
        {"seq": 3, "table": "ss_evenements", "cle": poste_a.numero * 2 ** 32 + 999, "operation": "U",
         "donnees": {"etablissement_id": b.etab.etablissement_id, "titre": "Intrus", "date_debut": "2026-06-01",
                     "cible": "TOUS", "statut": "BROUILLON", "type_evenement": "AUTRE"}},
    ]
    rep = client.post("/api/sync/appareil/envoi", json={"changements": intrusions}, headers=entetes)
    assert rep.status_code == 200
    raisons = {r["seq"]: r["raison"] for r in rep.json()["refus"]}
    assert set(raisons) == {1, 2, 3}
    assert "autre école" in raisons[1] and "autre école" in raisons[2]
    db.expire_all()
    assert db.get(Eleve, eleve_b.eleve_id).nom == eleve_b.nom
    assert db.get(Evenement, poste_a.numero * 2 ** 32 + 999) is None
    # Rien n'est écarté en silence.
    assert db.query(SyncConflit).filter(SyncConflit.appareil_id == poste_a.numero).count() == 3


def test_un_doublon_est_mis_de_cote_avec_sa_raison(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    p1, p2 = Poste(client, a, tmp_path / "p1"), Poste(client, a, tmp_path / "p2")
    login = f"caisse.{_uid()}"
    for poste in (p1, p2):
        with poste.session() as s:
            s.add(Utilisateur(nom="Caisse", prenom="Hors-ligne", nom_utilisateur=login,
                              mot_de_passe=hash_password("motdepasse123"), role="COMPTABLE", statut="ACTIF",
                              etablissement_id=a.etab.etablissement_id))
            s.commit()
    p1.synchroniser()
    p2.synchroniser()

    assert db.query(Utilisateur).filter(Utilisateur.nom_utilisateur == login).count() == 1
    conflit = db.query(SyncConflit).filter(SyncConflit.appareil_id == p2.numero).one()
    assert conflit.nom_table == "ss_utilisateurs" and "Doublon" in conflit.raison
    assert login in conflit.donnees  # la version du poste est gardée
    with p2.moteur.connect() as cx:
        assert cx.execute(select(refus_locaux.c.nom_table)).scalars().all() == ["ss_utilisateurs"]
        # Le compte du poste 1, reçu ensuite, heurte le compte local refusé :
        # il est mis de côté avec sa raison...
        mis_de_cote = cx.execute(select(non_appliques.c.nom_table, non_appliques.c.raison)).all()
    assert [m.nom_table for m in mis_de_cote] == ["ss_utilisateurs"] and "Doublon" in mis_de_cote[0].raison

    # ... et la synchronisation n'est pas bloquée pour autant.
    ev = a.evenement(db)
    p2.synchroniser()
    with p2.session() as s:
        assert s.get(Evenement, ev.evenement_id) is not None


def test_une_modification_d_une_ligne_supprimee_ailleurs_est_signalee(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    ev = a.evenement(db)
    ev_id = ev.evenement_id
    poste = Poste(client, a, tmp_path)
    with poste.session() as s:
        s.get(Evenement, ev_id).titre = "Modifié hors-ligne"
        s.commit()
    db.delete(ev)
    db.commit()

    poste.synchroniser()

    db.expire_all()
    assert db.get(Evenement, ev_id) is None  # la suppression n'est pas défaite
    conflit = db.query(SyncConflit).filter(SyncConflit.appareil_id == poste.numero).one()
    assert "supprimée sur le serveur" in conflit.raison
    with poste.session() as s:
        assert s.get(Evenement, ev_id) is None  # le poste rejoint le cloud


def test_un_poste_retire_ne_se_synchronise_plus(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    appareil = db.get(Appareil, poste.numero)
    appareil.revoque_le = datetime.now()
    db.commit()
    with pytest.raises(AppareilRefuse, match="retiré"):
        poste.synchroniser()


def test_un_encaissement_hors_ligne_arrive_sur_le_cloud_avec_son_recu(client: TestClient, db: Session, tmp_path):
    """Le vrai encaissement (route /api/finance/paiements) sur la base du poste,
    puis la synchronisation : le cloud a le paiement, la facture à jour,
    l'écriture comptable, et vérifie le reçu."""
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    inscription = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one()
    facture = Facture(inscription_id=inscription.inscription_id, annee_id=a.annee.annee_id,
                      numero_facture=f"FAC-SYNC-{_uid()}", montant_total=300000, montant_net=300000,
                      montant_paye=0, montant_restant=300000, statut="EN_ATTENTE")
    db.add(facture)
    db.commit()
    entetes = _headers(client, a.admin.nom_utilisateur)
    poste = Poste(client, a, tmp_path)

    with poste.routes():
        rep = client.post("/api/finance/paiements", headers=entetes,
                          json={"facture_id": facture.facture_id, "montant": 100000, "mode_paiement": "ESPECES"})
    assert rep.status_code == 201, rep.text
    recu = rep.json()
    assert f"-P{poste.appareil['rang']}-" in recu["numero_recu"]

    poste.synchroniser()

    db.expire_all()
    paiement = db.get(Paiement, recu["paiement_id"])
    assert paiement is not None and paiement.numero_recu == recu["numero_recu"]
    assert float(db.get(Facture, facture.facture_id).montant_paye) == 100000
    verif = client.get("/api/public/recus/verifier",
                       params={"n": paiement.numero_recu, "c": paiement.code_verification})
    assert verif.json()["authentique"] is True
    assert paiement.code_verification == code_verification(paiement)
