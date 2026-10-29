"""
Conflits et totaux (étape B5) : ce qui se passe quand le même enregistrement
change à deux endroits pendant que les postes sont hors-ligne.

- Deux champs différents : les deux modifications sont gardées (fusion à trois).
- Le même champ, donnée simple : la plus récente gagne, et c'est consigné.
- Le même champ, donnée sensible (argent, notes, inscriptions, comptes) :
  la version du serveur est gardée, la direction tranche.
- Les totaux (montant payé d'une facture...) ne sont jamais fusionnés : ils
  sont recalculés depuis leur source.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models.academique import Eleve, Evenement, Facture, Inscription, Paiement, SyncConflit, SyncJournal
from app.sync.tables_poste import journal_local
from tests.test_isolation_multi_ecole import Ecole, _headers, _uid
from tests.test_sync_echanges import Poste, sans_attente  # noqa: F401 (fixture)


def _facture(db: Session, ecole: Ecole, eleve: Eleve, montant: int = 300000) -> Facture:
    inscription = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one()
    facture = Facture(inscription_id=inscription.inscription_id, annee_id=ecole.annee.annee_id,
                      numero_facture=f"FAC-CONF-{_uid()}", montant_total=montant, montant_net=montant,
                      montant_paye=0, montant_restant=montant, statut="EN_ATTENTE")
    db.add(facture)
    db.commit()
    return facture


def test_deux_encaissements_hors_ligne_sur_la_meme_facture(client: TestClient, db: Session, tmp_path):
    """Le cas qui justifie les recalculs : chaque poste écrit « payé : 100 000 »
    sur la même facture. Le total juste est 200 000, partout."""
    a = Ecole(db, "A")
    facture = _facture(db, a, a.eleve(db))
    entetes = _headers(client, a.admin.nom_utilisateur)
    p1, p2 = Poste(client, a, tmp_path / "p1"), Poste(client, a, tmp_path / "p2")

    recus = []
    for poste in (p1, p2):
        with poste.routes():
            rep = client.post("/api/finance/paiements", headers=entetes,
                              json={"facture_id": facture.facture_id, "montant": 100000, "mode_paiement": "ESPECES"})
        assert rep.status_code == 201, rep.text
        recus.append(rep.json()["numero_recu"])
    assert recus[0] != recus[1]

    p1.synchroniser()
    p2.synchroniser()
    p1.synchroniser()

    db.expire_all()
    cloud = db.get(Facture, facture.facture_id)
    assert (float(cloud.montant_paye), float(cloud.montant_restant), cloud.statut) == (
        200000, 100000, "PARTIELLEMENT_PAYEE")
    assert db.query(Paiement).filter(Paiement.facture_id == facture.facture_id).count() == 2
    for poste in (p1, p2):
        with poste.session() as s:
            local = s.get(Facture, facture.facture_id)
            assert (float(local.montant_paye), local.statut) == (200000, "PARTIELLEMENT_PAYEE"), poste.numero
            assert s.query(Paiement).filter(Paiement.facture_id == facture.facture_id).count() == 2
    # Ce n'est pas un conflit : rien à vérifier.
    assert db.query(SyncConflit).filter(SyncConflit.appareil_id.in_([p1.numero, p2.numero])).count() == 0


def test_deux_champs_differents_sont_tous_les_deux_gardes(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    poste = Poste(client, a, tmp_path)

    with poste.session() as s:
        s.get(Eleve, eleve.eleve_id).adresse = "Kaloum, Conakry"
        s.commit()
    eleve.telephone = "620000001"
    db.commit()

    poste.synchroniser()

    db.expire_all()
    cloud = db.get(Eleve, eleve.eleve_id)
    assert (cloud.adresse, cloud.telephone) == ("Kaloum, Conakry", "620000001")
    # Le poste reçoit la ligne fusionnée.
    with poste.session() as s:
        local = s.get(Eleve, eleve.eleve_id)
        assert (local.adresse, local.telephone) == ("Kaloum, Conakry", "620000001")
    assert db.query(SyncConflit).filter(SyncConflit.appareil_id == poste.numero).count() == 0


def _dater_le_changement_du_poste(poste: Poste, quand: str) -> None:
    with poste.moteur.begin() as cx:
        cx.execute(update(journal_local).values(date=quand))


def _dater_le_changement_du_serveur(db: Session, nom: str, cle: int, quand: str) -> None:
    from datetime import datetime
    db.execute(update(SyncJournal).where(SyncJournal.nom_table == nom, SyncJournal.cle == cle)
               .values(date_changement=datetime.fromisoformat(quand)))
    db.commit()


def test_meme_champ_donnee_simple_la_plus_recente_gagne(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    ev_serveur, ev_poste = a.evenement(db), a.evenement(db)
    poste = Poste(client, a, tmp_path)

    with poste.session() as s:
        s.get(Evenement, ev_serveur.evenement_id).titre = "Titre du poste (ancien)"
        s.get(Evenement, ev_poste.evenement_id).titre = "Titre du poste (récent)"
        s.commit()
    ev_serveur.titre, ev_poste.titre = "Titre du serveur (récent)", "Titre du serveur (ancien)"
    db.commit()
    # Le poste a écrit le 10 ; le serveur le 5 pour l'un, le 20 pour l'autre.
    _dater_le_changement_du_poste(poste, "2026-10-10T08:00:00")
    _dater_le_changement_du_serveur(db, "ss_evenements", ev_serveur.evenement_id, "2026-10-20T08:00:00")
    _dater_le_changement_du_serveur(db, "ss_evenements", ev_poste.evenement_id, "2026-10-05T08:00:00")

    poste.synchroniser()

    db.expire_all()
    assert db.get(Evenement, ev_serveur.evenement_id).titre == "Titre du serveur (récent)"
    assert db.get(Evenement, ev_poste.evenement_id).titre == "Titre du poste (récent)"
    with poste.session() as s:
        assert s.get(Evenement, ev_serveur.evenement_id).titre == "Titre du serveur (récent)"
        assert s.get(Evenement, ev_poste.evenement_id).titre == "Titre du poste (récent)"
    # Tranchés automatiquement, mais consignés : rien n'est écrasé en silence.
    resolutions = {c.cle: c.resolution for c in db.query(SyncConflit).filter(SyncConflit.appareil_id == poste.numero)}
    assert resolutions == {ev_serveur.evenement_id: "AUTO_SERVEUR", ev_poste.evenement_id: "AUTO_POSTE"}


def test_meme_champ_donnee_sensible_la_direction_tranche(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    facture = _facture(db, a, a.eleve(db))
    poste = Poste(client, a, tmp_path)

    with poste.session() as s:
        s.get(Facture, facture.facture_id).montant_remise = 50000
        s.commit()
    facture.montant_remise = 20000
    db.commit()

    service = poste.synchroniser()

    db.expire_all()
    assert float(db.get(Facture, facture.facture_id).montant_remise) == 20000
    conflit = db.query(SyncConflit).filter(SyncConflit.appareil_id == poste.numero).one()
    # La raison est lue par la direction : nom du champ lisible, pas technique.
    assert conflit.resolution is None and "(Montant remise)" in conflit.raison
    # Le poste le sait et l'affiche, même si sa version a été appliquée (fusion).
    assert service.etat()["a_verifier"] >= 1
    assert '"montant_remise": "50000' in conflit.donnees  # la version du poste
    assert '"montant_remise": "20000' in conflit.donnees_serveur
    with poste.session() as s:
        # Le poste revient à la version gardée, en attendant le choix.
        assert float(s.get(Facture, facture.facture_id).montant_remise) == 20000


def test_la_direction_garde_la_version_du_poste(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    facture = _facture(db, a, a.eleve(db))
    poste = Poste(client, a, tmp_path)
    with poste.session() as s:
        s.get(Facture, facture.facture_id).montant_remise = 50000
        s.commit()
    facture.montant_remise = 20000
    db.commit()
    poste.synchroniser()
    entetes = _headers(client, a.admin.nom_utilisateur)

    a_verifier = client.get("/api/sync/conflits", headers=entetes).json()["conflits"]
    assert len(a_verifier) == 1
    conflit = a_verifier[0]
    assert conflit["version_poste"]["montant_remise"].startswith("50000")
    assert conflit["version_serveur"]["montant_remise"].startswith("20000")
    assert conflit["poste"].startswith("P1")

    rep = client.post(f"/api/sync/conflits/{conflit['conflit_id']}/resoudre", json={"choix": "POSTE"}, headers=entetes)
    assert rep.status_code == 200, rep.text
    db.expire_all()
    assert float(db.get(Facture, facture.facture_id).montant_remise) == 50000
    assert client.get("/api/sync/conflits", headers=entetes).json()["conflits"] == []
    poste.synchroniser()
    with poste.session() as s:
        assert float(s.get(Facture, facture.facture_id).montant_remise) == 50000


def test_garder_la_version_du_serveur_aligne_le_poste(client: TestClient, db: Session, tmp_path):
    """Le même identifiant de connexion créé sur deux postes : la direction
    garde celui du serveur, et le second poste s'aligne sans intervention."""
    from app.core.security import hash_password
    from app.models.academique import Utilisateur

    a = Ecole(db, "A")
    p1, p2 = Poste(client, a, tmp_path / "p1"), Poste(client, a, tmp_path / "p2")
    login = f"secretariat.{_uid()}"
    for poste, prenom in ((p1, "Premier"), (p2, "Second")):
        with poste.session() as s:
            s.add(Utilisateur(nom="Secrétariat", prenom=prenom, nom_utilisateur=login,
                              mot_de_passe=hash_password("motdepasse123"), role="SECRETAIRE", statut="ACTIF",
                              etablissement_id=a.etab.etablissement_id))
            s.commit()
    p1.synchroniser()
    p2.synchroniser()
    entetes = _headers(client, a.admin.nom_utilisateur)
    conflit = client.get("/api/sync/conflits", headers=entetes).json()["conflits"][0]
    assert "Doublon" in conflit["raison"]

    # Garder la version du poste est impossible tant que le doublon existe.
    refus = client.post(f"/api/sync/conflits/{conflit['conflit_id']}/resoudre", json={"choix": "POSTE"}, headers=entetes)
    assert refus.status_code == 409 and "Doublon" in refus.json()["detail"]

    rep = client.post(f"/api/sync/conflits/{conflit['conflit_id']}/resoudre", json={"choix": "SERVEUR"}, headers=entetes)
    assert rep.status_code == 200, rep.text
    p2.synchroniser()
    with p2.session() as s:
        comptes = s.query(Utilisateur).filter(Utilisateur.nom_utilisateur == login).all()
        # Le compte refusé a disparu, celui du serveur est arrivé.
        assert [c.prenom for c in comptes] == ["Premier"]


def test_supprimer_hors_ligne_un_paiement_modifie_ailleurs_est_refuse(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    facture = _facture(db, a, a.eleve(db))
    paiement = Paiement(facture_id=facture.facture_id, annee_id=a.annee.annee_id,
                        numero_recu=f"REC-CONF-{_uid()}", montant=1000, mode_paiement="ESPECES",
                        date_paiement=date(2026, 1, 5), statut="VALIDE")
    db.add(paiement)
    db.commit()
    poste = Poste(client, a, tmp_path)

    with poste.session() as s:
        s.delete(s.get(Paiement, paiement.paiement_id))
        s.commit()
    paiement.reference_externe = "OM-123456"
    db.commit()

    poste.synchroniser()

    db.expire_all()
    assert db.get(Paiement, paiement.paiement_id) is not None
    conflit = db.query(SyncConflit).filter(SyncConflit.appareil_id == poste.numero).one()
    assert "modifiée sur le serveur" in conflit.raison and conflit.resolution is None


def test_une_inscription_changee_de_classe_recalcule_les_deux_effectifs(client: TestClient, db: Session, tmp_path):
    from app.models.academique import Classe

    a = Ecole(db, "A")
    eleve = a.eleve(db)
    autre = Classe(etablissement_id=a.etab.etablissement_id, annee_id=a.annee.annee_id, niveau_id=a.niveau.niveau_id,
                   code=f"CL2-{_uid()}", libelle="6e B", statut="ACTIVE", effectif_actuel=0)
    db.add(autre)
    db.commit()
    a.classe.effectif_actuel = 1
    db.commit()
    poste = Poste(client, a, tmp_path)

    with poste.session() as s:
        s.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one().classe_id = autre.classe_id
        s.commit()
    poste.synchroniser()

    db.expire_all()
    assert db.get(Classe, a.classe.classe_id).effectif_actuel == 0
    assert db.get(Classe, autre.classe_id).effectif_actuel == 1
