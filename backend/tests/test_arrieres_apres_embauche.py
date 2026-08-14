"""
Tests — on ne doit rien à quelqu'un avant son arrivée.

CE QUI A ÉTÉ TROUVÉ
-------------------
La liste des arriérés parcourait les douze derniers mois glissants et
calculait un salaire pour chacun, sans jamais regarder la date d'embauche.

Un comptable recruté le jour même s'affichait donc avec :

    Mois en retard (12) — Total dû : 12 000 000 GNF
    2025-09  1 000 000
    2025-10  1 000 000
    ...

Et un seul clic sur « tout régler » lui versait une année de salaire pour du
travail qu'il n'a pas fourni. Sur la base réelle : Oumar Guisse, embauché le
11 août 2026, réclamait onze mois qu'il n'a jamais travaillés.

CE QUI N'EST PAS TRANCHÉ ICI
---------------------------
Le mois d'arrivée est dû en entier. Proratiser au nombre de jours travaillés
est une décision d'école — certaines le font, d'autres non — et la trancher en
silence dans le logiciel serait pire que de la laisser à la direction.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.finance import _avant_embauche
from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"EMB-{uid}", nom=f"École EMB {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    db.add(AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    ))
    admin = Utilisateur(
        nom="Camara", prenom=f"Chef{uid}", nom_utilisateur=f"emb.admin.{uid}",
        email=f"emb.{uid}@smartschool.gn", telephone=f"69000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id, salaire_base=3000000,
        date_embauche=date(2020, 1, 1),
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, admin


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestLaRegleElleMeme:
    def test_un_mois_anterieur_est_avant_l_embauche(self):
        embauche = date(2026, 8, 11)
        assert _avant_embauche(embauche, "2026-07") is True
        assert _avant_embauche(embauche, "2025-09") is True

    def test_le_mois_d_arrivee_est_du(self):
        """Il est dû en entier : proratiser est une décision d'école."""
        assert _avant_embauche(date(2026, 8, 11), "2026-08") is False

    def test_les_mois_suivants_sont_dus(self):
        assert _avant_embauche(date(2026, 8, 11), "2026-09") is False

    def test_sans_date_d_embauche_on_ne_bloque_rien(self):
        """Une fiche ancienne sans date ne doit pas disparaître de la paie."""
        assert _avant_embauche(None, "2025-09") is False


class TestLaListeDesArrieres:
    def test_un_nouvel_embauche_ne_reclame_pas_une_annee(
        self, client: TestClient, db: Session
    ):
        etab, admin = _ecole(db)
        h = _headers(client, admin.nom_utilisateur)
        nouveau = Utilisateur(
            nom="Guisse", prenom="Oumar", nom_utilisateur=f"emb.oumar.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="COMPTABLE",
            statut="ACTIF", etablissement_id=etab.etablissement_id,
            salaire_base=1000000, date_embauche=date.today(),
        )
        db.add(nouveau); db.commit(); db.refresh(nouveau)

        r = client.get(f"/api/finance/salaires/arrieres/PERS_{nouveau.utilisateur_id}",
                       headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        # Le mois en cours peut être dû ; les onze précédents, jamais.
        assert len(d["mois_du"]) <= 1
        assert d["mois_avant_embauche"] >= 11
        assert d["total_du"] <= 1000000

    def test_un_ancien_garde_bien_ses_arrieres(self, client: TestClient, db: Session):
        """Le correctif ne doit pas effacer une vraie dette de l'école."""
        etab, admin = _ecole(db)
        h = _headers(client, admin.nom_utilisateur)
        ancien = Utilisateur(
            nom="Bah", prenom="Ancien", nom_utilisateur=f"emb.ancien.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="SURVEILLANT",
            statut="ACTIF", etablissement_id=etab.etablissement_id,
            salaire_base=1400000, date_embauche=date(2020, 1, 1),
        )
        db.add(ancien); db.commit(); db.refresh(ancien)

        r = client.get(f"/api/finance/salaires/arrieres/PERS_{ancien.utilisateur_id}",
                       headers=h)
        assert r.status_code == 200
        d = r.json()
        assert d["mois_avant_embauche"] == 0
        assert len(d["mois_du"]) >= 11
        assert d["total_du"] > 0


class TestOnNePaiePasAvantL_arrivee:
    def test_payer_un_mois_anterieur_est_refuse(self, client: TestClient, db: Session):
        etab, admin = _ecole(db)
        h = _headers(client, admin.nom_utilisateur)
        nouveau = Utilisateur(
            nom="Sylla", prenom="Recent", nom_utilisateur=f"emb.recent.{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="OPERATEUR",
            statut="ACTIF", etablissement_id=etab.etablissement_id,
            salaire_base=1500000, date_embauche=date.today(),
        )
        db.add(nouveau); db.commit(); db.refresh(nouveau)

        mois_passe = (date.today().replace(day=1) - __import__("datetime").timedelta(days=1)
                      ).strftime("%Y-%m")
        r = client.post("/api/finance/salaires/payer", headers=h,
                        json={"enseignant_id": f"PERS_{nouveau.utilisateur_id}",
                              "mois": mois_passe, "mode_paiement": "ESPECES"})
        assert r.status_code == 400
        assert "embauché" in r.json()["detail"]
