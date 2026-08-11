"""
Tests — GET /api/eleves/delta (Étape C, synchronisation delta)
Vérifie la première synchro, la détection de modification, la détection de
suppression (tombstone) et l'isolation par établissement.

Note de précision : sous SQLite (moteur de test, voir conftest.py),
`func.now()` (utilisé pour `sync_at`, `modified_date` et `deleted_at`) a une
précision à la SECONDE, contrairement à PostgreSQL (production) qui va à la
microseconde. Les tests qui doivent distinguer un "avant" d'un "après"
proche dans le temps utilisent donc un `time.sleep(1.1)` réel — ce n'est pas
un test lent par accident, c'est une marge nécessaire pour ce moteur de
test précis, à ne pas retirer.

feat(test): ajouter tests unitaires synchro delta élèves
"""
import time
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import Utilisateur, Eleve, Etablissement
from app.core.security import hash_password
from app.core.auth import create_access_token

_ELV_COUNTER = 0


def _uid() -> int:
    global _ELV_COUNTER
    _ELV_COUNTER += 1
    return _ELV_COUNTER


def get_auth_headers(db: Session) -> dict:
    uid = _uid()
    user = Utilisateur(
        nom="Diallo", prenom="Mamadou",
        nom_utilisateur=f"mamadou.delta.{uid}",
        email=f"mamadou.delta.{uid}@smartschool.gn",
        telephone=f"6220{uid:05d}",
        mot_de_passe=hash_password("test123"),
        role="ADMIN", statut="ACTIF", etablissement_id=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({
        "sub": str(user.utilisateur_id), "nom": user.nom, "prenom": user.prenom,
        "role": user.role, "type": "admin",
        # Requis depuis le Lot 6 sur /api/eleves (voir Lot 0).
        "etablissement_id": user.etablissement_id,
    })
    return {"Authorization": f"Bearer {token}"}


def _ensure_etablissement_1(db: Session) -> None:
    """Garantit qu'un Etablissement id=1 existe déjà avant de créer un
    « autre établissement » de test. Sans ça, si ce fichier est le premier
    de toute la session pytest à créer une vraie ligne Etablissement (les
    autres tests du dépôt utilisent etablissement_id=1 comme un simple
    entier, sans jamais créer la ligne correspondante — SQLite n'impose
    pas la contrainte FK par défaut), le PREMIER Etablissement créé hérite
    de l'id auto-incrémenté 1 : exactement la même valeur que « l'école
    principale » implicite partout ailleurs. Le test d'isolation croit
    alors tester une DEUXIÈME école alors qu'il vient de recréer la
    première — trouvé en exécutant la suite complète pour la validation
    préproduction (jamais avant, ce fichier n'avait jamais tourné aux
    côtés de tout le reste)."""
    from app.models.academique import Etablissement as _Etab
    if not db.query(_Etab).filter(_Etab.etablissement_id == 1).first():
        db.add(_Etab(etablissement_id=1, code="PRINCIPALE-TEST", nom="École principale (test)", type_etablissement="PUBLIC"))
        db.commit()


def create_test_eleve(db: Session, etablissement_id: int = 1, nom: str = "Bah", prenom: str = "Fatoumata") -> Eleve:
    from sqlalchemy import func as sa_func
    count = db.query(sa_func.count(Eleve.eleve_id)).scalar() or 0
    eleve = Eleve(
        nom=nom, prenom=prenom, sexe="F", statut="ACTIF",
        date_naissance=date(2010, 1, 1),
        etablissement_id=etablissement_id,
        matricule=f"ELV-DELTA-{count + 1:04d}",
    )
    db.add(eleve)
    db.commit()
    db.refresh(eleve)
    return eleve


class TestElevesDelta:
    """Tests du endpoint GET /api/eleves/delta"""

    def test_sans_auth_retourne_401(self, client: TestClient):
        response = client.get("/api/eleves/delta")
        assert response.status_code == 401

    def test_forme_de_la_reponse(self, client: TestClient, db: Session):
        """✅ La réponse a bien items/deleted_ids/sync_at."""
        headers = get_auth_headers(db)
        response = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data and isinstance(data["items"], list)
        assert "deleted_ids" in data and isinstance(data["deleted_ids"], list)
        assert "sync_at" in data

    def test_premiere_synchro_sans_since_renvoie_tout(self, client: TestClient, db: Session):
        """✅ since absent = première synchro : l'élève créé apparaît."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="PremiereSynchro")
        response = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        assert response.status_code == 200
        noms = [i["nom"] for i in response.json()["items"]]
        assert "PremiereSynchro" in noms

    def test_delta_sans_modification_ne_renvoie_rien(self, client: TestClient, db: Session):
        """✅ since = juste après création, aucune modif depuis → 0 item pour cet élève."""
        headers = get_auth_headers(db)
        create_test_eleve(db, nom="SansModifTest")
        r0 = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        since = r0.json()["sync_at"]

        r1 = client.get(f"/api/eleves/delta?etablissement_id=1&since={since}", headers=headers)
        assert r1.status_code == 200
        noms = [i["nom"] for i in r1.json()["items"]]
        assert "SansModifTest" not in noms

    def test_delta_detecte_une_modification(self, client: TestClient, db: Session):
        """✅ Un élève modifié après `since` réapparaît dans le delta suivant."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="AvantModif")
        r0 = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        since = r0.json()["sync_at"]

        time.sleep(1.1)  # précision seconde de SQLite — voir note en tête de fichier
        response = client.put(f"/api/eleves/{eleve.eleve_id}", json={"nom": "ApresModif"}, headers=headers)
        assert response.status_code == 200

        r1 = client.get(f"/api/eleves/delta?etablissement_id=1&since={since}", headers=headers)
        noms = [i["nom"] for i in r1.json()["items"]]
        assert "ApresModif" in noms

    def test_delta_detecte_une_suppression(self, client: TestClient, db: Session):
        """✅ Un élève supprimé après `since` apparaît dans deleted_ids, plus dans items."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="ASupprimer")
        r0 = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        since = r0.json()["sync_at"]

        time.sleep(1.1)
        response = client.delete(f"/api/eleves/{eleve.eleve_id}", headers=headers)
        assert response.status_code == 200

        r1 = client.get(f"/api/eleves/delta?etablissement_id=1&since={since}", headers=headers)
        data = r1.json()
        assert eleve.eleve_id in data["deleted_ids"]
        assert all(i["eleve_id"] != eleve.eleve_id for i in data["items"])

    def test_isolation_par_etablissement(self, client: TestClient, db: Session):
        """✅ Un élève d'un autre établissement n'apparaît jamais dans le delta."""
        headers = get_auth_headers(db)
        _ensure_etablissement_1(db)
        autre_etab = Etablissement(code="AUTRE", nom="Autre École", type_etablissement="PUBLIC")
        db.add(autre_etab)
        db.commit()
        db.refresh(autre_etab)

        create_test_eleve(db, etablissement_id=autre_etab.etablissement_id, nom="AutreEcoleEleve")

        response = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        noms = [i["nom"] for i in response.json()["items"]]
        assert "AutreEcoleEleve" not in noms

    def test_suppression_isolee_par_etablissement(self, client: TestClient, db: Session):
        """✅ Le tombstone d'un autre établissement n'apparaît pas dans le delta courant."""
        headers = get_auth_headers(db)
        _ensure_etablissement_1(db)
        autre_etab = Etablissement(code="AUTRE2", nom="Autre École 2", type_etablissement="PUBLIC")
        db.add(autre_etab)
        db.commit()
        db.refresh(autre_etab)

        eleve_autre = create_test_eleve(db, etablissement_id=autre_etab.etablissement_id, nom="ASupprimerAutreEcole")
        r0 = client.get("/api/eleves/delta?etablissement_id=1", headers=headers)
        since = r0.json()["sync_at"]

        time.sleep(1.1)
        client.delete(f"/api/eleves/{eleve_autre.eleve_id}", headers=headers)

        r1 = client.get(f"/api/eleves/delta?etablissement_id=1&since={since}", headers=headers)
        assert eleve_autre.eleve_id not in r1.json()["deleted_ids"]

    def test_suppression_reste_une_suppression_reelle(self, client: TestClient, db: Session):
        """✅ Le tombstone ne remplace pas le DELETE réel — l'élève n'est plus accessible."""
        headers = get_auth_headers(db)
        eleve = create_test_eleve(db, nom="VerifHardDelete")
        client.delete(f"/api/eleves/{eleve.eleve_id}", headers=headers)

        response = client.get(f"/api/eleves/{eleve.eleve_id}", headers=headers)
        assert response.status_code == 404
