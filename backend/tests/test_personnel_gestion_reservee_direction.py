"""
Tests — la gestion des fiches du personnel est réservée à la direction.

CE QUI A ÉTÉ TROUVÉ
-------------------
Le module Personnel était ouvert à PERSONNEL_ROLES, c'est-à-dire aussi au
comptable, au surveillant, au bibliothécaire, à l'informaticien et à
l'opérateur. Chacun d'eux pouvait créer un compte ADMIN à son nom, changer
son propre salaire, supprimer le directeur, et — le cas qui a fait trouver
le trou — SE RÉACTIVER lui-même après avoir été désactivé.

L'école clôture son année en désactivant le compte comptable, et ne le
rouvre qu'à la rentrée suivante. Une désactivation que la personne
désactivée peut annuler elle-même ne clôture rien du tout.

Ces tests décrivent la règle : la direction seule écrit sur une fiche du
personnel ; la rémunération ne se lit que par la direction et la
comptabilité ; et on ne peut pas se désactiver soi-même ni fermer le
dernier compte de direction de l'école.
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import Etablissement, Utilisateur

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def _ecole(db: Session) -> Etablissement:
    uid = _uid()
    etab = Etablissement(code=f"PGD-{uid}", nom=f"École PGD {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    return etab


def _compte(db: Session, etablissement_id: int, role: str, salaire=None) -> Utilisateur:
    uid = _uid()
    u = Utilisateur(
        nom="Bah", prenom=f"{role.title()}{uid}", nom_utilisateur=f"pgd.{role.lower()}.{uid}",
        email=f"pgd.{uid}@smartschool.gn", telephone=f"62000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role=role, statut="ACTIF",
        etablissement_id=etablissement_id, salaire_base=salaire,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestLeComptableNeGerePasLePersonnel:
    """Le comptable a besoin des salaires pour préparer la paie. Pas des fiches."""

    def test_comptable_ne_peut_pas_creer_de_compte(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE", 900000)

        r = client.post("/api/personnel", headers=_headers(client, comptable.nom_utilisateur),
                        json={"nom": "Faux", "prenom": "Admin", "role": "ADMIN",
                              "etablissement_id": etab.etablissement_id,
                              "mot_de_passe": "motdepasse123"})
        assert r.status_code == 403

    def test_comptable_ne_peut_pas_changer_un_salaire(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE", 900000)

        r = client.put(f"/api/personnel/{comptable.utilisateur_id}",
                       headers=_headers(client, comptable.nom_utilisateur),
                       json={"salaire_base": 9000000})
        assert r.status_code == 403
        db.refresh(comptable)
        assert float(comptable.salaire_base) == 900000

    def test_comptable_desactive_ne_peut_pas_se_reactiver(self, client: TestClient, db: Session):
        """Le cas de la clôture : c'est ça, ou la désactivation ne vaut rien."""
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE", 900000)
        h_comptable = _headers(client, comptable.nom_utilisateur)

        # La direction ferme le compte à la clôture de l'année.
        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200

        # Le comptable ne peut plus se connecter du tout.
        r = client.post("/api/auth/login", json={"identifiant": comptable.nom_utilisateur,
                                                 "mot_de_passe": "motdepasse123"})
        assert r.status_code == 403

        # Et son ancien jeton, encore valide, ne lui permet pas de se rouvrir.
        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=ACTIF",
                         headers=h_comptable)
        assert r.status_code == 403
        db.refresh(comptable)
        assert comptable.statut == "INACTIF"

    def test_la_direction_reactive_a_la_rentree(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE", 900000)
        comptable.statut = "INACTIF"; db.commit()

        r = client.patch(f"/api/personnel/{comptable.utilisateur_id}/statut?statut=ACTIF",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200
        r = client.post("/api/auth/login", json={"identifiant": comptable.nom_utilisateur,
                                                 "mot_de_passe": "motdepasse123"})
        assert r.status_code == 200


class TestSalairesNonVisiblesParTous:
    def test_surveillant_ne_voit_pas_les_salaires(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        _compte(db, etab.etablissement_id, "COMPTABLE", 900000)
        surveillant = _compte(db, etab.etablissement_id, "SURVEILLANT", 400000)

        r = client.get("/api/personnel", headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 200
        for fiche in r.json():
            assert "salaire_base" not in fiche
            assert "numero_cni" not in fiche

    def test_chacun_voit_son_propre_salaire(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        surveillant = _compte(db, etab.etablissement_id, "SURVEILLANT", 400000)

        r = client.get(f"/api/personnel/{surveillant.utilisateur_id}",
                       headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 200
        assert r.json()["salaire_base"] == 400000

    def test_surveillant_ne_voit_pas_le_salaire_d_un_autre(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE", 900000)
        surveillant = _compte(db, etab.etablissement_id, "SURVEILLANT", 400000)

        r = client.get(f"/api/personnel/{comptable.utilisateur_id}",
                       headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 200
        assert "salaire_base" not in r.json()

    def test_la_masse_salariale_reste_a_la_direction(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        surveillant = _compte(db, etab.etablissement_id, "SURVEILLANT", 400000)

        r = client.get("/api/personnel/stats", headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 403

    def test_le_comptable_garde_la_liste_de_paie(self, client: TestClient, db: Session):
        """Sans elle il ne peut pas préparer les salaires : elle doit rester ouverte."""
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        comptable = _compte(db, etab.etablissement_id, "COMPTABLE", 900000)
        _compte(db, etab.etablissement_id, "GARDIEN", 250000)

        r = client.get("/api/personnel/salaires/liste",
                       headers=_headers(client, comptable.nom_utilisateur))
        assert r.status_code == 200
        assert any(p["salaire_base"] == 250000 for p in r.json())

    def test_le_surveillant_n_a_pas_la_liste_de_paie(self, client: TestClient, db: Session):
        etab = _ecole(db)
        _compte(db, etab.etablissement_id, "ADMIN")
        surveillant = _compte(db, etab.etablissement_id, "SURVEILLANT", 400000)

        r = client.get("/api/personnel/salaires/liste",
                       headers=_headers(client, surveillant.nom_utilisateur))
        assert r.status_code == 403


class TestOnNeSeFermePasLaPorte:
    def test_impossible_de_se_desactiver_soi_meme(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        _compte(db, etab.etablissement_id, "DG")

        r = client.patch(f"/api/personnel/{admin.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 400
        assert "propre compte" in r.json()["detail"]

    def test_impossible_de_fermer_le_dernier_compte_de_direction(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        autre_admin = _compte(db, etab.etablissement_id, "DG")

        # Le DG ferme l'admin : il reste lui-même, c'est permis.
        r = client.patch(f"/api/personnel/{admin.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, autre_admin.nom_utilisateur))
        assert r.status_code == 200

        # Mais plus personne ne peut fermer le dernier.
        admin.statut = "ACTIF"; db.commit()
        r = client.patch(f"/api/personnel/{autre_admin.utilisateur_id}/statut?statut=INACTIF",
                         headers=_headers(client, autre_admin.nom_utilisateur))
        assert r.status_code == 400

    def test_statut_invalide_refuse(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        agent = _compte(db, etab.etablissement_id, "GARDIEN", 250000)

        r = client.patch(f"/api/personnel/{agent.utilisateur_id}/statut?statut=DEHORS",
                         headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 400
        db.refresh(agent)
        assert agent.statut == "ACTIF"

    def test_impossible_de_se_supprimer_soi_meme(self, client: TestClient, db: Session):
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")
        _compte(db, etab.etablissement_id, "DG")

        r = client.delete(f"/api/personnel/{admin.utilisateur_id}",
                          headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 400


class TestLaDirectionGardeLaMain:
    def test_admin_cree_un_compte_avec_son_salaire(self, client: TestClient, db: Session):
        """C'est le geste attendu : on crée le compte ET on fixe la paie."""
        etab = _ecole(db)
        admin = _compte(db, etab.etablissement_id, "ADMIN")

        r = client.post("/api/personnel", headers=_headers(client, admin.nom_utilisateur),
                        json={"nom": "Sylla", "prenom": "Mariama", "role": "COMPTABLE",
                              "etablissement_id": etab.etablissement_id,
                              "telephone": "628999111", "mot_de_passe": "motdepasse123",
                              "salaire_base": 1500000, "prime_mensuelle": 200000,
                              "type_contrat": "PERMANENT"})
        assert r.status_code == 201, r.text
        fiche = r.json()
        assert fiche["salaire_base"] == 1500000
        assert fiche["statut"] == "ACTIF"

        # Et le compte créé se connecte vraiment.
        r = client.post("/api/auth/login", json={"identifiant": fiche["nom_utilisateur"],
                                                 "mot_de_passe": "motdepasse123"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "COMPTABLE"
