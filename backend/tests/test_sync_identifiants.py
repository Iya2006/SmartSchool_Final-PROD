"""
Identifiants des postes hors-ligne (app/sync/identifiants.py) et
enregistrement d'un poste auprès du cloud (POST /api/poste/appareils).

Deux postes qui travaillent hors-ligne en même temps ne doivent JAMAIS créer
le même identifiant, quelle que soit la façon d'écrire (ORM, insert(),
insertion par lot) ; une écriture qui contournerait le générateur doit échouer
bruyamment, jamais corrompre en silence.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, Integer, create_engine, event, insert, select, text
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.recu_paiement import cle_signature_appareil
from app.models.academique import Appareil, Eleve, Evenement, Inscription, Message
from app.sync.identifiants import (
    TAILLE_PLAGE, PosteNonInstalle, activer_le_poste, appareil_de, application_distante,
    generateur_de, plage, preparer_tables_du_poste,
)
from app.sync.instantane import importer_page
from app.sync.schema import colonnes_a_elargir, colonnes_identifiants
from tests.test_isolation_multi_ecole import Ecole, _headers
from tests.test_sync_instantane import _compte, _export_complet


def _base_locale():
    moteur = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(moteur, "connect")
    def _cles(cx, _):
        c = cx.cursor(); c.execute("PRAGMA foreign_keys=ON"); c.close()

    Base.metadata.create_all(moteur)
    return moteur


def _poste_installe(db: Session, ecole: Ecole, numero: int, rang: int = None):
    """Un poste qui a reçu l'école (comme à l'installation) puis son numéro."""
    moteur = _base_locale()
    with moteur.begin() as cx:
        for nom, lignes in _export_complet(db, ecole.etab.etablissement_id).items():
            importer_page(cx, nom, lignes)
    activer_le_poste(moteur, numero, rang or numero, cle_signature_appareil(numero))
    return moteur


def _inscrire_hors_ligne(moteur, ecole: Ecole, prenom: str) -> Eleve:
    with Session(moteur) as s:
        eleve = Eleve(etablissement_id=ecole.etab.etablissement_id, matricule=f"POSTE-{prenom}",
                      nom="Sow", prenom=prenom, date_naissance=date(2013, 2, 2), sexe="M", statut="ACTIF")
        s.add(eleve)
        s.flush()
        s.add(Inscription(eleve_id=eleve.eleve_id, classe_id=ecole.classe.classe_id,
                          annee_id=ecole.annee.annee_id, statut="ACTIVE"))
        s.commit()
        s.refresh(eleve)
        s.expunge(eleve)
        return eleve


def test_deux_postes_hors_ligne_ne_creent_jamais_le_meme_identifiant(db: Session):
    a = Ecole(db, "A")
    poste1, poste2 = _poste_installe(db, a, 1), _poste_installe(db, a, 2)

    e1 = _inscrire_hors_ligne(poste1, a, "Un")
    e2 = _inscrire_hors_ligne(poste2, a, "Deux")

    assert appareil_de(e1.eleve_id) == 1 and appareil_de(e2.eleve_id) == 2
    assert e1.eleve_id != e2.eleve_id
    for moteur, numero in ((poste1, 1), (poste2, 2)):
        debut, fin = plage(numero)
        with Session(moteur) as s:
            # insert() et insertion par lot passent aussi par la plage du poste.
            s.execute(insert(Message).values(
                etablissement_id=a.etab.etablissement_id, expediteur_type="ADMIN",
                destinataire_type="ADMIN", sujet="Hors-ligne"))
            s.bulk_insert_mappings(Evenement, [
                {"etablissement_id": a.etab.etablissement_id, "titre": f"Fête {i}",
                 "date_debut": date(2026, 6, 1), "cible": "TOUS", "statut": "BROUILLON"} for i in range(3)])
            s.commit()
            for modele, cle in ((Message, Message.message_id), (Evenement, Evenement.evenement_id),
                                (Inscription, Inscription.inscription_id)):
                crees = s.execute(select(cle).where(cle > TAILLE_PLAGE)).scalars().all()
                assert crees and all(debut < i < fin for i in crees), modele.__tablename__


def test_les_lignes_recues_gardent_leur_identifiant(db: Session):
    """Ce qui vient du cloud (installation, synchronisation) n'est jamais renuméroté."""
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    poste = _poste_installe(db, a, 3)
    with Session(poste) as s:
        assert s.get(Eleve, eleve.eleve_id).prenom == eleve.prenom
        assert appareil_de(eleve.eleve_id) == 0


def test_le_garde_refuse_une_ecriture_hors_plage(db: Session):
    a = Ecole(db, "A")
    poste = _poste_installe(db, a, 4)
    etab = a.etab.etablissement_id

    # SQL brut sans identifiant : SQLite prendrait le plus grand + 1, peut-être
    # dans la plage d'un autre poste. Refusé.
    with pytest.raises(IntegrityError, match="hors de la plage de ce poste"):
        with poste.begin() as cx:
            cx.execute(text("INSERT INTO ss_evenements (etablissement_id, titre, date_debut, cible, statut) "
                            "VALUES (:e, 'brut', '2026-06-01', 'TOUS', 'BROUILLON')"), {"e": etab})
    # Identifiant de la plage d'un autre poste : refusé aussi.
    autre = plage(5)[0] + 1
    with pytest.raises(IntegrityError, match="hors de la plage de ce poste"):
        with poste.begin() as cx:
            cx.execute(insert(Evenement).values(evenement_id=autre, etablissement_id=etab, titre="intrus",
                                                date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON"))
    # Pendant l'application de lignes reçues du cloud, le même identifiant passe.
    with poste.begin() as cx:
        application_distante(cx, True)
        cx.execute(insert(Evenement).values(evenement_id=autre, etablissement_id=etab, titre="reçu",
                                            date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON"))
        application_distante(cx, False)
    with poste.connect() as cx:
        assert cx.execute(select(Evenement.titre).where(Evenement.evenement_id == autre)).scalar() == "reçu"
        # Le drapeau n'est jamais laissé levé.
        assert cx.execute(text("SELECT application_distante FROM ss_sync_drapeaux")).scalar() == 0


def test_avant_son_numero_un_poste_ne_cree_rien(db: Session):
    a = Ecole(db, "A")
    moteur = _base_locale()
    preparer_tables_du_poste(moteur)
    generateur_de(moteur)  # comme au démarrage d'un poste pas encore installé
    with Session(moteur) as s:
        s.add(Evenement(etablissement_id=a.etab.etablissement_id, titre="trop tôt",
                        date_debut=date(2026, 6, 1), cible="TOUS", statut="BROUILLON"))
        with pytest.raises(StatementError) as erreur:
            s.flush()
    assert isinstance(erreur.value.orig, PosteNonInstalle)


def test_au_redemarrage_les_compteurs_reprennent_apres_le_dernier(db: Session):
    a = Ecole(db, "A")
    poste = _poste_installe(db, a, 6)
    premier = _inscrire_hors_ligne(poste, a, "Avant")
    # Redémarrage du moteur : le générateur repart de la base.
    activer_le_poste(poste, 6, 6, cle_signature_appareil(6))
    second = _inscrire_hors_ligne(poste, a, "Apres")
    assert second.eleve_id == premier.eleve_id + 1


def test_toute_colonne_d_identifiant_est_sur_64_bits():
    """Une colonne d'identifiant restée en 32 bits refuserait les lignes des
    postes sur PostgreSQL (« integer out of range ») : la migration et ce
    test lisent les mêmes modèles."""
    restes = []
    for t in Base.metadata.sorted_tables:
        for c in t.columns:
            if isinstance(c.type, BigInteger) or not isinstance(c.type, Integer):
                continue
            if c.primary_key or c.foreign_keys or c.name.endswith("_id"):
                restes.append(f"{t.name}.{c.name}")
    assert restes == []
    assert len(colonnes_identifiants()) >= 232


def test_la_migration_n_a_rien_a_faire_sous_sqlite(db: Session):
    assert colonnes_a_elargir(db.connection()) == []


class TestEnregistrementDUnPoste:
    def test_la_direction_enregistre_les_postes_de_son_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "A"), Ecole(db, "B")
        entetes_a = _headers(client, a.admin.nom_utilisateur)

        p1 = client.post("/api/poste/appareils", json={"nom": "Caisse"}, headers=entetes_a)
        p2 = client.post("/api/poste/appareils", json={"nom": "Secrétariat"}, headers=entetes_a)
        pb = client.post("/api/poste/appareils", json={}, headers=_headers(client, b.admin.nom_utilisateur))
        assert p1.status_code == p2.status_code == pb.status_code == 201, p1.text

        r1, r2, rb = p1.json(), p2.json(), pb.json()
        # Rang propre à chaque école : P1, P2 pour A ; P1 pour B.
        assert (r1["rang"], r2["rang"], rb["rang"]) == (1, 2, 1)
        assert len({r1["appareil_id"], r2["appareil_id"], rb["appareil_id"]}) == 3
        assert r1["etablissement_id"] == a.etab.etablissement_id
        # Clé des reçus dérivée de celle du cloud, propre à chaque poste.
        assert r1["cle_signature"] == cle_signature_appareil(r1["appareil_id"])
        assert r1["cle_signature"] != r2["cle_signature"]

        enregistre = db.get(Appareil, r1["appareil_id"])
        db.refresh(enregistre)
        assert enregistre.nom == "Caisse" and enregistre.revoque_le is None
        # Le jeton n'est jamais conservé en clair.
        assert r1["jeton"] not in enregistre.jeton_empreinte and len(r1["jeton"]) >= 40

    @pytest.mark.parametrize("role", ["COMPTABLE", "SECRETAIRE"])
    def test_hors_direction_refuse(self, client: TestClient, db: Session, role: str):
        a = Ecole(db, "A")
        compte = _compte(db, a.etab.etablissement_id, role)
        rep = client.post("/api/poste/appareils", json={}, headers=_headers(client, compte.nom_utilisateur))
        assert rep.status_code == 403

    def test_sans_connexion_refuse(self, client: TestClient):
        assert client.post("/api/poste/appareils", json={}).status_code == 401
