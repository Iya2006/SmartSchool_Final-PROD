"""
Tests — une école peut nommer ses postes comme elle les vit.

CE QUI A ÉTÉ TROUVÉ
-------------------
L'écran « Paramètres > Sécurité » laisse créer un rôle — CENSEUR, Censeur des
études — et le crée réellement. Mais ce rôle n'ouvrait RIEN :

  * le formulaire du personnel proposait une liste figée dans le code, où le
    nouveau rôle n'apparaissait jamais ;
  * `require_roles` ne connaît que les rôles statiques, donc toutes les routes
    répondaient 403 ;
  * la matrice de permissions ne peut que RETIRER un accès, jamais en ouvrir
    un — règle de sécurité centrale qu'il ne faut pas casser.

L'endpoint le disait lui-même : « Il n'est pas attribuable à un compte ». Une
école qui créait un censeur obtenait un rôle décoratif.

LA RÈGLE POSÉE
--------------
Un rôle personnalisé DÉSIGNE l'espace d'un rôle standard dont il hérite. Il
n'obtient jamais plus que sa base. On ne crée pas un pouvoir nouveau : on donne
un nom local à un pouvoir qui existe déjà — ce qu'une école veut dire par
« censeur ».
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole_avec_admin(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"ROL-{uid}", nom=f"École ROL {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    db.add(AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    ))
    admin = Utilisateur(
        nom="Barry", prenom=f"Chef{uid}", nom_utilisateur=f"rol.admin.{uid}",
        email=f"rol.admin.{uid}@smartschool.gn", telephone=f"67000{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id, salaire_base=3000000,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, admin


def _headers(client: TestClient, login: str, mdp: str = "motdepasse123") -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": mdp})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestCreerUnRole:
    def test_un_role_doit_designer_un_espace(self, client: TestClient, db: Session):
        """Sans espace, le rôle ne servirait à personne : on refuse tout de suite."""
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)

        r = client.post("/api/securite/roles", headers=h,
                        json={"code": "CENSEUR", "libelle": "Censeur des études",
                              "description": "Supervise les évaluations",
                              "role_base": "INVENTE"})
        assert r.status_code == 400
        assert "espace" in r.json()["detail"].lower()

    def test_le_role_cree_est_attribuable(self, client: TestClient, db: Session):
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)

        r = client.post("/api/securite/roles", headers=h,
                        json={"code": "CENSEUR", "libelle": "Censeur des études",
                              "role_base": "DIRECTEUR_NIVEAU"})
        assert r.status_code == 201, r.text
        assert r.json()["attribuable"] is True
        assert r.json()["role_base"] == "DIRECTEUR_NIVEAU"

    def test_la_liste_dit_lesquels_ouvrent_un_espace(self, client: TestClient, db: Session):
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h,
                    json={"code": "CAISSIER", "libelle": "Caissier",
                          "role_base": "COMPTABLE"})

        r = client.get("/api/securite/roles", headers=h)
        assert r.status_code == 200
        caissier = next(x for x in r.json() if x["code"] == "CAISSIER")
        assert caissier["attribuable"] is True
        assert caissier["role_base"] == "COMPTABLE"


class TestCreerLaPersonneDUnSeulGeste:
    """Le geste réel : on embauche, on ouvre l'accès, on fixe la paie."""

    def test_le_censeur_est_cree_avec_ses_identifiants_et_son_salaire(
        self, client: TestClient, db: Session
    ):
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h,
                    json={"code": "CENSEUR", "libelle": "Censeur des études",
                          "role_base": "DIRECTEUR_NIVEAU"})

        r = client.post("/api/personnel", headers=h,
                        json={"nom": "Diallo", "prenom": "Aminata", "role": "CENSEUR",
                              "etablissement_id": etab.etablissement_id,
                              "telephone": "628777001", "mot_de_passe": "motdepasse123",
                              "salaire_base": 2800000, "prime_mensuelle": 200000,
                              "type_contrat": "PERMANENT"})
        assert r.status_code == 201, r.text
        fiche = r.json()
        assert fiche["role"] == "CENSEUR"
        assert fiche["salaire_base"] == 2800000
        # La direction voit tout de suite où cette personne atterrira.
        assert fiche["espace"] == "DIRECTEUR_NIVEAU"
        assert fiche["nom_utilisateur"]

    def test_le_censeur_se_connecte_et_travaille(self, client: TestClient, db: Session):
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h,
                    json={"code": "CENSEUR", "libelle": "Censeur des études",
                          "role_base": "DIRECTEUR_NIVEAU"})
        cree = client.post("/api/personnel", headers=h,
                           json={"nom": "Kourouma", "prenom": "Sekou", "role": "CENSEUR",
                                 "etablissement_id": etab.etablissement_id,
                                 "telephone": "628777002", "mot_de_passe": "motdepasse123",
                                 "salaire_base": 2800000}).json()

        h_censeur = _headers(client, cree["nom_utilisateur"])
        # Il travaille dans son espace : évaluations, classes, examens.
        assert client.get("/api/evaluations", headers=h_censeur).status_code == 200
        assert client.get("/api/classes", headers=h_censeur).status_code == 200
        assert client.get("/api/examens/sujets", headers=h_censeur).status_code == 200

    def test_le_censeur_n_herite_pas_plus_que_sa_base(self, client: TestClient, db: Session):
        """DIRECTEUR_NIVEAU n'a pas la caisse : son censeur non plus."""
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h,
                    json={"code": "CENSEUR", "libelle": "Censeur des études",
                          "role_base": "DIRECTEUR_NIVEAU"})
        cree = client.post("/api/personnel", headers=h,
                           json={"nom": "Sow", "prenom": "Fatou", "role": "CENSEUR",
                                 "etablissement_id": etab.etablissement_id,
                                 "telephone": "628777003", "mot_de_passe": "motdepasse123",
                                 "salaire_base": 2800000}).json()

        h_censeur = _headers(client, cree["nom_utilisateur"])
        assert client.get("/api/finance/paiements", headers=h_censeur).status_code == 403

    def test_un_caissier_herite_bien_de_la_caisse(self, client: TestClient, db: Session):
        """La preuve inverse : c'est la base choisie qui décide, pas le nom."""
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h,
                    json={"code": "CAISSIER", "libelle": "Caissier",
                          "role_base": "COMPTABLE"})
        cree = client.post("/api/personnel", headers=h,
                           json={"nom": "Camara", "prenom": "Ibrahim", "role": "CAISSIER",
                                 "etablissement_id": etab.etablissement_id,
                                 "telephone": "628777004", "mot_de_passe": "motdepasse123",
                                 "salaire_base": 1800000}).json()

        h_caissier = _headers(client, cree["nom_utilisateur"])
        assert client.get("/api/finance/paiements", headers=h_caissier).status_code == 200

    def test_un_role_inexistant_est_refuse_clairement(self, client: TestClient, db: Session):
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)

        r = client.post("/api/personnel", headers=h,
                        json={"nom": "X", "prenom": "Y", "role": "PROVISEUR_ADJOINT",
                              "etablissement_id": etab.etablissement_id,
                              "mot_de_passe": "motdepasse123"})
        assert r.status_code == 400
        assert "Paramètres > Sécurité" in r.json()["detail"]


class TestLeComptableVoitSonSalaire:
    def test_le_censeur_figure_dans_la_paie(self, client: TestClient, db: Session):
        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h,
                    json={"code": "CENSEUR", "libelle": "Censeur des études",
                          "role_base": "DIRECTEUR_NIVEAU"})
        client.post("/api/personnel", headers=h,
                    json={"nom": "Bangoura", "prenom": "Mariama", "role": "CENSEUR",
                          "etablissement_id": etab.etablissement_id,
                          "telephone": "628777005", "mot_de_passe": "motdepasse123",
                          "salaire_base": 2800000})

        r = client.get("/api/finance/salaires/employes", headers=h)
        assert r.status_code == 200
        censeur = next((e for e in r.json()
                        if e["nom"] == "Bangoura" or e["prenom"] == "Mariama"), None)
        assert censeur is not None, "le censeur doit apparaître dans la paie"
        assert censeur["salaire_base"] == 2800000
        assert censeur["type_employe"] == "PERSONNEL"


class TestLesRolesSystemeRestentIntouchables:
    def test_on_ne_rebase_pas_un_role_systeme(self, client: TestClient, db: Session):
        """Le rebaser donnerait la comptabilité à tous les surveillants d'un coup."""
        from app.models.academique import Role

        etab, admin = _ecole_avec_admin(db)
        h = _headers(client, admin.nom_utilisateur)
        systeme = Role(etablissement_id=etab.etablissement_id, code="SURVEILLANT",
                       libelle="Surveillant", est_systeme="O", role_base="SURVEILLANT")
        db.add(systeme); db.commit(); db.refresh(systeme)

        r = client.put(f"/api/securite/roles/{systeme.role_id}", headers=h,
                       json={"libelle": "Surveillant", "role_base": "COMPTABLE"})
        assert r.status_code == 400
        db.refresh(systeme)
        assert systeme.role_base == "SURVEILLANT"
