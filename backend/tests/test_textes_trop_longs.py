"""
Un texte plus long que sa colonne (app/core/valeurs_refusees.py).

PostgreSQL (le cloud) le refuse, SQLite (les postes) l'acceptait sans rien
dire. Vérifié sur la copie de la base le 28/11/2026 : un seul texte trop long
saisi hors-ligne faisait échouer TOUT l'envoi du poste, renvoyé à chaque
cycle — plus rien ne partait ni n'arrivait sur ce poste.

Cette suite de tests tourne sur SQLite : là où il faut le comportement de
PostgreSQL, le cloud de test l'imite (`_comme_postgresql`), avec l'erreur
exacte du pilote de production (pg8000, code 22001).
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import String, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

import app.sync.cote_cloud as cote_cloud
from app.core.valeurs_refusees import TexteTropLong, est_valeur_refusee, raison
from app.models.academique import Evenement, Parent, SyncConflit
from app.sync.cote_cloud import ResolutionImpossible, resoudre_conflit
from app.sync.cote_poste import changements_en_attente
from tests.test_isolation_multi_ecole import Ecole, _headers, _uid
from tests.test_lot5_communication_isolation import _creer_parent, _lier
from tests.test_sync_echanges import Poste, _evenement


def _erreur_pg8000(limite: int) -> ProgrammingError:
    """Ce que lève SQLAlchemy avec pg8000 pour un texte trop long."""
    return ProgrammingError("INSERT …", {}, Exception({
        "S": "ERROR", "C": "22001", "M": f"value too long for type character varying({limite})"}))


@pytest.fixture
def _comme_postgresql(monkeypatch):
    """Le cloud de test (SQLite) applique la règle de longueur de PostgreSQL."""
    ecrire = cote_cloud._upsert

    def _upsert(db, t, valeurs):
        for nom, valeur in valeurs.items():
            colonne = t.c.get(nom)
            if colonne is not None and isinstance(colonne.type, String) and colonne.type.length \
                    and isinstance(valeur, str) and len(valeur) > colonne.type.length:
                raise _erreur_pg8000(colonne.type.length)
        ecrire(db, t, valeurs)

    monkeypatch.setattr(cote_cloud, "_upsert", _upsert)


def test_l_erreur_de_pg8000_est_reconnue_et_expliquee():
    erreur = _erreur_pg8000(200)
    assert est_valeur_refusee(erreur)
    assert raison(erreur) == "Un texte est trop long : 200 caractères au plus pour ce champ."
    # Un doublon (classe 23) ou une coupure ne sont pas des valeurs refusées.
    assert not est_valeur_refusee(ProgrammingError("…", {}, Exception({"C": "23505"})))
    assert not est_valeur_refusee(ProgrammingError("…", {}, Exception("connexion perdue")))


def test_sur_un_poste_la_saisie_trop_longue_est_refusee_tout_de_suite(client: TestClient, db: Session, tmp_path):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    with poste.session() as s, pytest.raises(TexteTropLong) as refus:
        _evenement(s, a, "K" * 201)
    assert "« Titre » est trop long : 200 caractères au plus (201 saisis)" in str(refus.value)
    assert changements_en_attente(poste.moteur) == 0
    # À la limite exacte, rien ne change.
    with poste.session() as s:
        assert _evenement(s, a, "K" * 200).evenement_id


def test_la_reponse_dit_quoi_corriger(client: TestClient, db: Session):
    """Sur le cloud, PostgreSQL refusait avec une erreur 500 ; sur un poste,
    la saisie passait. Les deux répondent désormais 400, en clair."""
    a = Ecole(db, "A")
    parent = _creer_parent(db, a.etab.etablissement_id)
    _lier(db, parent, a.eleve(db))
    rep = client.put(f"/api/portail-parent/{parent.parent_id}/profil",
                     headers=_headers(client, a.admin.nom_utilisateur), json={"telephone_1": "6" * 25})
    assert rep.status_code == 400, rep.text
    assert "« Telephone 1 » est trop long : 20 caractères au plus (25 saisis)" in rep.json()["detail"]
    db.expire_all()
    assert len(db.get(Parent, parent.parent_id).telephone_1) <= 20


def test_un_texte_trop_long_ne_bloque_plus_la_synchronisation(client: TestClient, db: Session, tmp_path,
                                                               _comme_postgresql):
    a = Ecole(db, "A")
    poste = Poste(client, a, tmp_path)
    # Déjà sur le poste sans être passé par l'application (version plus
    # ancienne, import) : 201 caractères pour un titre qui en accepte 200.
    long_id = poste.numero * 2 ** 32 + 500_000 + _uid()
    with poste.moteur.begin() as cx:
        cx.execute(text(
            "INSERT INTO ss_evenements (evenement_id, etablissement_id, titre, date_debut, cible, statut, "
            "type_evenement) VALUES (:i, :e, :t, '2026-06-01', 'TOUS', 'BROUILLON', 'AUTRE')"),
            {"i": long_id, "e": a.etab.etablissement_id, "t": "K" * 201})
    with poste.session() as s:
        ok_id = _evenement(s, a, "Kermesse").evenement_id

    poste.synchroniser()

    db.expire_all()
    # Le reste du lot est arrivé ; plus rien n'attend sur le poste.
    assert db.get(Evenement, ok_id).titre == "Kermesse"
    assert db.get(Evenement, long_id) is None
    assert changements_en_attente(poste.moteur) == 0
    # La ligne refusée est gardée pour la direction, avec une raison lisible.
    conflit = db.query(SyncConflit).filter(SyncConflit.appareil_id == poste.numero,
                                           SyncConflit.cle == long_id).one()
    assert conflit.raison.startswith("Un texte est trop long : 200 caractères au plus pour ce champ.")

    # La synchronisation continue : ce qui change ensuite part aussi.
    with poste.session() as s:
        suivant_id = _evenement(s, a, "Réunion").evenement_id
    poste.synchroniser()
    db.expire_all()
    assert db.get(Evenement, suivant_id).titre == "Réunion"

    # « À vérifier » : garder la version du poste est refusé en clair (plus
    # d'erreur 500) ; garder celle du serveur aligne le poste.
    with pytest.raises(ResolutionImpossible, match="trop long"):
        resoudre_conflit(db, conflit, "POSTE", "Direction")
    db.rollback()
    resoudre_conflit(db, db.get(SyncConflit, conflit.conflit_id), "SERVEUR", "Direction")
    poste.synchroniser()
    with poste.session() as s:
        assert s.get(Evenement, long_id) is None
