"""
Installation d'un poste local depuis le cloud (app/sync/installation.py).

Le « cloud » est l'application de test elle-même (TestClient, qui est un
httpx.Client) ; le poste est une base SQLite neuve.
"""
import time

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

import app.sync.installation as module_installation
from app.core.database import Base
from app.models.academique import Eleve, Utilisateur
from app.sync.installation import (
    ErreurInstallation, Installateur, Progression, installer, lire_marqueur,
)
from app.sync.instantane import manifeste
from tests.test_isolation_multi_ecole import Ecole
from tests.test_sync_instantane import _compte


def _poste_vierge():
    moteur = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(moteur, "connect")
    def _cles(cx, _):
        c = cx.cursor(); c.execute("PRAGMA foreign_keys=ON"); c.close()

    Base.metadata.create_all(moteur)
    return moteur


@pytest.fixture(autouse=True)
def sans_attente(monkeypatch):
    # Seulement la pause entre tentatives réseau du module : remplacer
    # `time.sleep` lui-même neutraliserait aussi les attentes des tests.
    monkeypatch.setattr(module_installation, "_pause", lambda *_: None)


def test_installation_complete(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    poste = _poste_vierge()
    prog = Progression()

    installer(a.admin.nom_utilisateur, "motdepasse123", client=client, moteur_local=poste,
              dossier_poste=str(tmp_path), progression=prog)

    assert prog.statut == "INSTALLE" and prog.erreur is None
    assert prog.etablissement_nom == a.etab.nom
    attendu = manifeste(db, a.etab.etablissement_id)
    assert prog.tables_faites == len(attendu)
    assert prog.lignes_faites == prog.lignes_total == sum(t["total"] for t in attendu)
    assert lire_marqueur(str(tmp_path))["etablissement_id"] == a.etab.etablissement_id

    with Session(poste) as s:
        assert s.get(Eleve, eleve.eleve_id).nom == eleve.nom
        # Le compte et son mot de passe haché sont sur le poste : on pourra
        # s'y connecter hors-ligne avec ses identifiants habituels.
        compte = s.get(Utilisateur, a.admin.utilisateur_id)
        assert compte.mot_de_passe == a.admin.mot_de_passe


def test_mauvais_mot_de_passe(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    prog = Progression()
    with pytest.raises(ErreurInstallation, match="mot de passe incorrect"):
        installer(a.admin.nom_utilisateur, "faux", client=client, moteur_local=_poste_vierge(),
                  dossier_poste=str(tmp_path), progression=prog)
    assert lire_marqueur(str(tmp_path)) is None


def test_compte_hors_direction(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    comptable = _compte(db, a.etab.etablissement_id, "COMPTABLE")
    with pytest.raises(ErreurInstallation, match="compte de direction"):
        installer(comptable.nom_utilisateur, "motdepasse123", client=client, moteur_local=_poste_vierge(),
                  dossier_poste=str(tmp_path), progression=Progression())
    assert lire_marqueur(str(tmp_path)) is None


class _ClientCoupe:
    """Le réseau tombe au téléchargement de `table_coupee`."""

    def __init__(self, vrai: TestClient, table_coupee: str):
        self.vrai, self.table_coupee = vrai, table_coupee

    def post(self, *a, **k):
        return self.vrai.post(*a, **k)

    def get(self, url, *a, **k):
        if url.endswith(self.table_coupee):
            raise httpx.ConnectError("réseau coupé")
        return self.vrai.get(url, *a, **k)


def test_coupure_puis_reprise_sans_doublon(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    for _ in range(3):
        a.eleve(db)
    poste = _poste_vierge()

    prog = Progression()
    with pytest.raises(ErreurInstallation, match="Pas de connexion internet"):
        installer(a.admin.nom_utilisateur, "motdepasse123", client=_ClientCoupe(client, "ss_inscriptions"),
                  moteur_local=poste, dossier_poste=str(tmp_path), progression=prog)
    # Interrompu : le poste n'est surtout pas déclaré installé.
    assert lire_marqueur(str(tmp_path)) is None
    assert prog.tables_faites < prog.tables_total

    prog = Progression()
    installer(a.admin.nom_utilisateur, "motdepasse123", client=client, moteur_local=poste,
              dossier_poste=str(tmp_path), progression=prog)
    assert prog.statut == "INSTALLE"
    with Session(poste) as s:
        n = s.execute(select(func.count()).select_from(Eleve).where(
            Eleve.etablissement_id == a.etab.etablissement_id)).scalar_one()
    assert n == 3


def test_installateur_refuse_une_seconde_installation(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    inst = Installateur(str(tmp_path), "http://testserver", _poste_vierge())
    assert inst.demarrer(a.admin.nom_utilisateur, "motdepasse123", client=client)

    fin = time.time() + 30
    while inst.progression.statut == "EN_COURS" and time.time() < fin:
        time.sleep(0.05)
    assert inst.etat()["statut"] == "INSTALLE", inst.etat()

    assert inst.demarrer(a.admin.nom_utilisateur, "motdepasse123", client=client) is False
    # Au redémarrage du moteur, le marqueur suffit à savoir le poste installé.
    assert Installateur(str(tmp_path), "http://testserver", _poste_vierge()).etat()["statut"] == "INSTALLE"


def test_echec_affiche_un_message_sans_trace_technique(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    inst = Installateur(str(tmp_path), "http://testserver", _poste_vierge())
    assert inst.demarrer(a.admin.nom_utilisateur, "faux", client=client)
    fin = time.time() + 30
    while inst.progression.statut == "EN_COURS" and time.time() < fin:
        time.sleep(0.05)
    etat = inst.etat()
    assert etat["statut"] == "ECHEC"
    assert etat["erreur"] == "Identifiant ou mot de passe incorrect."
    # Après un échec, on peut relancer.
    assert inst.demarrer(a.admin.nom_utilisateur, "motdepasse123", client=client)


def test_les_fichiers_de_l_ecole_sont_copies_sur_le_poste(client: TestClient, db: Session, tmp_path):
    import os
    from app.core.fichiers import dossier_fichiers
    from app.sync.installation import fichiers_references

    a = Ecole(db, "A")
    contenu = b"\x89PNG logo de l'ecole"
    nom_logo = f"logo-poste-{a.etab.etablissement_id}.png"
    chemin_cloud = os.path.join(dossier_fichiers("etablissements"), nom_logo)
    with open(chemin_cloud, "wb") as f:
        f.write(contenu)
    try:
        a.etab.logo_url = f"/uploads/etablissements/{nom_logo}?v=3"
        eleve = a.eleve(db)
        eleve.photo_url = "/uploads/photos/eleves/absente-du-serveur.jpg"
        db.commit()
        autre = a.eleve(db)
        autre.photo_url = "/uploads/../../piege.txt"
        db.commit()

        poste = _poste_vierge()
        locaux = tmp_path / "fichiers"
        prog = Progression()
        installer(a.admin.nom_utilisateur, "motdepasse123", client=client, moteur_local=poste,
                  dossier_poste=str(tmp_path / "poste"), progression=prog, dossier_fichiers=str(locaux))

        assert prog.statut == "INSTALLE"
        assert f"etablissements/{nom_logo}" in fichiers_references(poste)
        assert (locaux / "etablissements" / nom_logo).read_bytes() == contenu
        # Fichier cité mais absent du serveur : ignoré, l'installation aboutit.
        assert not (locaux / "photos" / "eleves" / "absente-du-serveur.jpg").exists()
        # Chemin piégé : rien n'est jamais écrit hors du dossier des fichiers.
        assert not (tmp_path / "piege.txt").exists() and not (locaux.parent.parent / "piege.txt").exists()
        assert prog.fichiers_faits == prog.fichiers_total >= 3
    finally:
        os.remove(chemin_cloud)
