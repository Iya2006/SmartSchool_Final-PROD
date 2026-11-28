"""
Phase C du chantier offline-first : ce dont un poste installé a besoin pour
vivre dans la durée.

- Mise à niveau du schéma local après une mise à jour (SQLite, plus seulement
  PostgreSQL).
- Base chiffrée : illisible sans la clé, conversion d'une base en clair.
- Sauvegarde de la base avant une mise à niveau.
- Version du poste : un poste trop ancien est prié de se mettre à jour.
- Retrait d'un poste par la direction, et verrouillage du poste retiré.
"""
import os
import sqlite3
from contextlib import closing

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import Base
from app.core.version import ENTETE, VERSION, poste_a_jour
from app.models.academique import Appareil, Evenement
from app.sync.sauvegarde import noter_version, sauvegarder_si_nouvelle_version
from app.sync.service import AppareilRefuse, MiseAJourRequise, poste_retire
from app.sync.verrou import MESSAGE_RETIRE, verrou_pour
from migrations.rattraper_colonnes_manquantes import appliquer_colonnes_manquantes, appliquer_index_manquants
from tests.test_isolation_multi_ecole import Ecole, _headers
from tests.test_sync_echanges import Poste, sans_attente  # noqa: F401 (fixture)
from tests.test_sync_instantane import _compte


# ── Mise à niveau du schéma d'un poste ──────────────────────────────────────

def test_le_schema_d_un_poste_est_complete_apres_une_mise_a_jour(tmp_path):
    """Une base de poste d'une version précédente : il lui manque une colonne
    et un index ajoutés depuis. Le démarrage les rajoute, sans rien perdre."""
    moteur = create_engine(f"sqlite:///{tmp_path / 'poste.db'}")
    Base.metadata.create_all(moteur)
    with moteur.begin() as cx:
        cx.execute(text("ALTER TABLE ss_paiements DROP COLUMN code_verification"))
        cx.execute(text("DROP INDEX ix_paiements_facture"))
    inspecteur = inspect(moteur)
    assert "code_verification" not in {c["name"] for c in inspecteur.get_columns("ss_paiements")}

    ajoutees, ignorees = appliquer_colonnes_manquantes(moteur, appliquer=True)
    index = appliquer_index_manquants(moteur)

    inspecteur = inspect(moteur)
    assert any(a.startswith("ss_paiements.code_verification") for a in ajoutees) and ignorees == []
    assert "code_verification" in {c["name"] for c in inspecteur.get_columns("ss_paiements")}
    assert "ix_paiements_facture" in index
    assert "ix_paiements_facture" in {i["name"] for i in inspecteur.get_indexes("ss_paiements")}
    # Rejouer ne fait rien : idempotent.
    assert appliquer_colonnes_manquantes(moteur, appliquer=True) == ([], [])
    assert appliquer_index_manquants(moteur) == []


# ── Base chiffrée ───────────────────────────────────────────────────────────

CLE = "5a" * 32


def test_une_base_chiffree_est_illisible_sans_sa_cle(tmp_path):
    pytest.importorskip("sqlcipher3")
    from app.core.database import connexion_chiffree, moteur_chiffre

    chemin = str(tmp_path / "poste.db")
    moteur = moteur_chiffre(chemin, CLE)
    # Un vrai pool de connexions : celui des bases « en mémoire » ferme la
    # connexion d'un fil pendant qu'il s'en sert, et le moteur s'arrêtait net.
    from sqlalchemy.pool import QueuePool
    assert isinstance(moteur.pool, QueuePool)
    with moteur.begin() as cx:
        cx.execute(text("CREATE TABLE eleves (id INTEGER PRIMARY KEY, nom TEXT UNIQUE)"))
        cx.execute(text("INSERT INTO eleves (nom) VALUES ('Mariama Bah')"))
    # Un doublon reste une erreur d'intégrité pour SQLAlchemy : la
    # synchronisation en dépend pour mettre de côté au lieu de planter.
    with pytest.raises(IntegrityError):
        with moteur.begin() as cx:
            cx.execute(text("INSERT INTO eleves (nom) VALUES ('Mariama Bah')"))
    moteur.dispose()

    with open(chemin, "rb") as f:
        assert b"Mariama" not in f.read()
    with pytest.raises(sqlite3.DatabaseError, match="not a database"):
        sqlite3.connect(chemin).execute("SELECT * FROM eleves").fetchall()
    with pytest.raises(Exception):
        connexion_chiffree(chemin, "00" * 32).execute("SELECT * FROM eleves").fetchall()
    assert connexion_chiffree(chemin, CLE).execute("SELECT nom FROM eleves").fetchall() == [("Mariama Bah",)]


def test_la_base_chiffree_tient_quarante_requetes_simultanees(tmp_path):
    """Le moteur sert jusqu'à quarante requêtes à la fois (pool de fils de
    FastAPI). Avant correction, le poste installé s'arrêtait net au premier
    afflux (tableau de bord + installation + synchronisation)."""
    pytest.importorskip("sqlcipher3")
    from concurrent.futures import ThreadPoolExecutor

    from app.core.database import _reglages_sqlite, moteur_chiffre
    from sqlalchemy import event

    moteur = moteur_chiffre(str(tmp_path / "poste.db"), CLE, connect_args={})
    event.listen(moteur, "connect", _reglages_sqlite)
    with moteur.begin() as cx:
        cx.execute(text("CREATE TABLE t (id INTEGER PRIMARY KEY, fil INTEGER)"))

    def travail(fil):
        for _ in range(15):
            with moteur.begin() as cx:
                cx.execute(text("INSERT INTO t (fil) VALUES (:f)"), {"f": fil})
            with moteur.connect() as cx:
                cx.execute(text("SELECT count(*) FROM t")).scalar()
        return fil

    with ThreadPoolExecutor(max_workers=40) as pool:
        assert sorted(pool.map(travail, range(40))) == list(range(40))
    with moteur.connect() as cx:
        assert cx.execute(text("SELECT count(*) FROM t")).scalar() == 40 * 15


def test_une_base_en_clair_est_chiffree_une_fois_sans_perte(tmp_path):
    pytest.importorskip("sqlcipher3")
    from app.core.database import chiffrer_base_en_clair, connexion_chiffree

    chemin = str(tmp_path / "ancienne.db")
    clair = sqlite3.connect(chemin)
    clair.execute("CREATE TABLE paiements (numero TEXT)")
    clair.execute("INSERT INTO paiements VALUES ('REC-1-2026-P1-00001')")
    clair.commit()
    clair.close()

    assert chiffrer_base_en_clair(chemin, CLE) is True
    assert connexion_chiffree(chemin, CLE).execute("SELECT numero FROM paiements").fetchall() == [
        ("REC-1-2026-P1-00001",)]
    with open(chemin, "rb") as f:
        assert b"REC-1-2026" not in f.read()
    # Déjà chiffrée : rien à refaire.
    assert chiffrer_base_en_clair(chemin, CLE) is False


# ── Sauvegarde avant mise à niveau ──────────────────────────────────────────

def test_la_base_est_sauvegardee_avant_chaque_nouvelle_version(tmp_path):
    moteur = create_engine(f"sqlite:///{tmp_path / 'poste.db'}")
    with moteur.begin() as cx:
        cx.execute(text("CREATE TABLE t (x)"))
        cx.execute(text("INSERT INTO t VALUES (1)"))
    dossier = str(tmp_path / "poste")

    # Premier démarrage : rien à sauvegarder.
    assert sauvegarder_si_nouvelle_version(moteur, dossier, "0.3.0") is None
    noter_version(dossier, "0.3.0")
    # Même version : rien non plus.
    assert sauvegarder_si_nouvelle_version(moteur, dossier, "0.3.0") is None

    copies = []
    for version in ("0.3.1", "0.3.2", "0.3.3"):
        copie = sauvegarder_si_nouvelle_version(moteur, dossier, version)
        with closing(sqlite3.connect(copie)) as lecture:
            assert lecture.execute("SELECT x FROM t").fetchall() == [(1,)]
        noter_version(dossier, version)
        copies.append(copie)
    # Les deux dernières seulement.
    assert sorted(os.listdir(os.path.join(dossier, "sauvegardes"))) == sorted(
        os.path.basename(c) for c in copies[-2:])


# ── Version du poste ────────────────────────────────────────────────────────

def test_un_poste_trop_ancien_est_prie_de_se_mettre_a_jour(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    jeton = {"Authorization": f"Appareil {poste.appareil['jeton']}"}

    for entetes in (jeton, {**jeton, ENTETE: "0.1.0"}):
        rep = client.get("/api/sync/appareil/reception", headers=entetes)
        assert rep.status_code == 426 and "mis à jour" in rep.json()["detail"]
    assert client.get("/api/sync/appareil/reception", headers=poste.entetes()).status_code == 200
    assert poste_a_jour(VERSION) and not poste_a_jour("0.0.9") and poste_a_jour("10.0.0")

    # Le service le dit clairement, au lieu d'une erreur technique.
    import app.sync.service as service
    vraie = service.VERSION
    service.VERSION = "0.1.0"
    try:
        with pytest.raises(MiseAJourRequise, match="mis à jour"):
            poste.synchroniser()
    finally:
        service.VERSION = vraie


# ── Retrait d'un poste ──────────────────────────────────────────────────────

def test_la_direction_retire_un_poste_puis_le_remet_en_service(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    entetes = _headers(client, a.admin.nom_utilisateur)
    rang = poste.appareil["rang"]

    # Hors direction : refusé.
    comptable = _compte(db, a.etab.etablissement_id, "COMPTABLE")
    refus = client.post(f"/api/sync/postes/{rang}/retirer", headers=_headers(client, comptable.nom_utilisateur))
    assert refus.status_code == 403

    assert client.post(f"/api/sync/postes/{rang}/retirer", headers=entetes).status_code == 200
    postes = client.get("/api/sync/postes", headers=entetes).json()["postes"]
    assert [p["retire"] for p in postes if p["rang"] == rang] == [True]

    # Le poste l'apprend au premier échange et se verrouille.
    with pytest.raises(AppareilRefuse, match="retiré"):
        poste.synchroniser()
    assert poste_retire(poste.moteur)

    # Même resté sur une vieille version, un poste retiré l'apprend.
    rep = client.get("/api/sync/appareil/reception",
                     headers={"Authorization": f"Appareil {poste.appareil['jeton']}", ENTETE: "0.0.1"})
    assert rep.status_code == 403

    assert client.post(f"/api/sync/postes/{rang}/remettre", headers=entetes).status_code == 200
    poste.synchroniser()
    assert poste_retire(poste.moteur) is None
    db.expire_all()
    assert db.query(Appareil).filter(Appareil.appareil_id == poste.numero).one().revoque_le is None


def test_un_poste_retire_refuse_toute_connexion(client: TestClient, db: Session, tmp_path):
    from app.sync.service import noter_retrait

    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    application = FastAPI()
    application.middleware("http")(verrou_pour(poste.moteur))

    @application.post("/api/auth/login")
    def connexion():
        return {"token": "x"}

    @application.get("/api/poste/etat")
    def etat():
        return {"statut": "INSTALLE"}

    local = TestClient(application)
    assert local.post("/api/auth/login").status_code == 200

    noter_retrait(poste.moteur, "Ce poste a été retiré par la direction.")
    rep = local.post("/api/auth/login")
    assert rep.status_code == 403 and rep.json()["detail"] == MESSAGE_RETIRE
    # L'écran d'installation peut toujours lire l'état pour l'expliquer.
    assert local.get("/api/poste/etat").status_code == 200

    noter_retrait(poste.moteur, None)
    assert local.post("/api/auth/login").status_code == 200
