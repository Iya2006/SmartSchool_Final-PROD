"""
Clôturer l'année sans avoir évalué tout le monde.

Le contrôle « tous les bulletins sont générés et publiés » était BLOQUANT :
il exigeait un bulletin publié pour CHAQUE élève actif et CHAQUE trimestre.
Cette exigence ne se réalise jamais tout à fait dans une école — un élève
arrivé en mars, un autre parti avant les compositions, une matière jamais
notée faute d'enseignant. L'école se retrouvait avec une année qu'elle ne
pouvait plus fermer, donc une comptabilité qu'elle ne pouvait plus arrêter :
un blocage créé par le logiciel, pas par la réalité.

Le chiffre reste affiché — « 0 / 2 » dit en un coup d'œil ce qui manque —
mais c'est la direction qui décide si cela justifie d'attendre.

Ce que ces tests verrouillent, c'est qu'un bulletin manquant n'empêche plus
la clôture, ET que les vrais verrous tiennent toujours : un trimestre encore
ouvert, lui, continue de bloquer.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Inscription, Niveau,
    Trimestre, Utilisateur,
)

_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    """Une école avec un trimestre clôturé, deux élèves actifs, aucun bulletin."""
    uid = _uid()
    etab = Etablissement(code=f"CLOB-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANB{uid}", libelle="2026-2027",
        date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)

    trimestre = Trimestre(
        annee_id=annee.annee_id, code=f"TB{uid}", libelle="1er Trimestre", numero=1,
        date_debut=date(2026, 10, 1), date_fin=date(2026, 12, 20), statut="CLOTURE",
    )
    db.add(trimestre); db.commit(); db.refresh(trimestre)

    cycle = Cycle(etablissement_id=eid, code=f"CYB{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVB{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLB{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    for i in range(2):
        eleve = Eleve(
            etablissement_id=eid, matricule=f"CLOB-{uid}-{i}", nom="Bah", prenom=f"Eleve{i}",
            date_naissance=date(2013, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        db.add(Inscription(
            eleve_id=eleve.eleve_id, classe_id=classe.classe_id,
            annee_id=annee.annee_id, statut="ACTIVE",
        ))
    db.commit()

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.clob.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return {"eid": eid, "annee": annee, "trimestre": trimestre, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _controle(verif: dict, code: str) -> dict:
    trouve = next((c for c in verif["controles"] if c["code"] == code), None)
    assert trouve, f"Contrôle « {code} » absent de la vérification"
    return trouve


class TestClotureSansTousLesBulletins:

    def test_un_bulletin_manquant_n_empeche_plus_la_cloture(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)

        verif = client.get(
            f"/api/annee-scolaire/{ecole['annee'].annee_id}/verification-cloture", headers=h
        ).json()

        bulletins = _controle(verif, "bulletins_publies")
        assert bulletins["ok"] is False, "Aucun bulletin n'existe : le contrôle doit bien échouer"
        assert bulletins["severite"] == "AVERTISSEMENT"
        assert verif["peut_cloturer"] is True

    def test_le_chiffre_manquant_reste_affiche(self, client, ecole):
        """On ne masque pas le problème, on cesse seulement d'en faire un mur."""
        h = _headers(client, ecole["admin"].nom_utilisateur)

        verif = client.get(
            f"/api/annee-scolaire/{ecole['annee'].annee_id}/verification-cloture", headers=h
        ).json()

        detail = _controle(verif, "bulletins_publies")["detail"]
        assert "0 / 2" in detail, f"Le compteur doit rester lisible — reçu : {detail}"

    def test_la_cloture_aboutit_vraiment(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)

        r = client.post(
            f"/api/annee-scolaire/{ecole['annee'].annee_id}/cloturer-comptabilite", headers=h
        )
        assert r.status_code == 200, r.text
        assert r.json()["statut"] == "CLOTURE_COMPTABLE"

        db.refresh(ecole["annee"])
        assert ecole["annee"].statut == "CLOTURE_COMPTABLE"
        assert ecole["annee"].date_cloture_comptable is not None

    def test_un_trimestre_encore_ouvert_bloque_toujours(self, client, db, ecole):
        """Le vrai verrou tient : on a assoupli les bulletins, pas la rigueur."""
        ecole["trimestre"].statut = "EN_COURS"
        db.commit()
        h = _headers(client, ecole["admin"].nom_utilisateur)

        verif = client.get(
            f"/api/annee-scolaire/{ecole['annee'].annee_id}/verification-cloture", headers=h
        ).json()
        assert _controle(verif, "trimestres_clotures")["severite"] == "BLOQUANT"
        assert verif["peut_cloturer"] is False

        r = client.post(
            f"/api/annee-scolaire/{ecole['annee'].annee_id}/cloturer-comptabilite", headers=h
        )
        assert r.status_code == 400
        assert "trimestre" in r.json()["detail"].lower()

        db.refresh(ecole["annee"])
        assert ecole["annee"].statut == "EN_COURS", "Une clôture refusée ne doit rien changer"
