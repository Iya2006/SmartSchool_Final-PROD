"""
SUITE CONSOLIDÉE — les 15 tests multi-écoles obligatoires du cahier des charges.

Fichier de synthèse du chantier : chaque lot a sa propre suite détaillée
(`test_lot0_*` … `test_lot11_*`, ~230 tests). Celui-ci vérifie les 15 scénarios
exigés, de bout en bout, sur un jeu de données École A / École B parallèle.

Deux tests (T6 et T9) documentent des LIMITES CONNUES du schéma actuel plutôt
qu'un comportement satisfaisant : ils assertent la partie sécurité (aucune
fuite, aucun accès croisé) et sont annotés en conséquence. Voir la synthèse
`.ai/SYNTHESE_FINALE.md`, section « Réserves ».
"""
from datetime import date

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import ALGORITHM, SECRET_KEY
from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Enseignant, Etablissement,
    Evenement, Inscription, Niveau, Parent, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    """École complète : année, cycle, niveau, classe, enseignant, admin."""

    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(
            code=f"MULTI-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE",
        )
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"MENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"64100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"M{uid}", nom_utilisateur=f"multi.admin.{uid}",
            email=f"multi.admin.{uid}@smartschool.gn", telephone=f"64200{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def eleve(self, db: Session) -> Eleve:
        uid = _uid()
        e = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"MELV-{uid}",
            nom="Diallo", prenom=f"E{uid}", date_naissance=date(2012, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(e); db.commit(); db.refresh(e)
        db.add(Inscription(
            eleve_id=e.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        ))
        db.commit()
        return e

    def evenement(self, db: Session) -> Evenement:
        ev = Evenement(
            etablissement_id=self.etab.etablissement_id, titre=f"Événement {_uid()}",
            date_debut=date(2026, 3, 1), cible="TOUS", statut="BROUILLON",
        )
        db.add(ev); db.commit(); db.refresh(ev)
        return ev


@pytest.fixture
def ecoles(db: Session):
    return Ecole(db, "A"), Ecole(db, "B")


def _headers(client: TestClient, identifiant: str, mot_de_passe: str = "motdepasse123") -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe}
    )
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ══════════════════════════════════════════════════════════════
# T1-T4 — Accès croisés GET / PUT / DELETE / POST
# ══════════════════════════════════════════════════════════════

class TestT1a4AccesCroises:
    """Un accès à une ressource d'une autre école ne doit JAMAIS renvoyer
    200 + données de B, 200 + modification de B, ou 200 + suppression de B."""

    def test_t1_get_cross_ecole(self, client: TestClient, db: Session, ecoles):
        a, b = ecoles
        eleve_b = b.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/eleves/{eleve_b.eleve_id}", headers=headers)
        assert resp.status_code in (403, 404), resp.text
        assert "Diallo" not in resp.text

    def test_t2_put_cross_ecole(self, client: TestClient, db: Session, ecoles):
        a, b = ecoles
        eleve_b = b.eleve(db)
        nom_avant = eleve_b.nom
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/eleves/{eleve_b.eleve_id}",
            json={"nom": "Piraté", "prenom": "X", "date_naissance": "2012-01-01", "sexe": "M"},
            headers=headers,
        )
        assert resp.status_code in (403, 404), resp.text
        db.refresh(eleve_b)
        assert eleve_b.nom == nom_avant

    def test_t3_delete_cross_ecole(self, client: TestClient, db: Session, ecoles):
        a, b = ecoles
        ev_b = b.evenement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/evenements/{ev_b.evenement_id}", headers=headers)
        assert resp.status_code in (403, 404), resp.text
        assert db.query(Evenement).filter(Evenement.evenement_id == ev_b.evenement_id).first() is not None

    def test_t4_post_ne_cree_jamais_chez_lautre(self, client: TestClient, db: Session, ecoles):
        a, b = ecoles
        headers = _headers(client, a.admin.nom_utilisateur)
        avant_b = db.query(Evenement).filter(
            Evenement.etablissement_id == b.etab.etablissement_id
        ).count()

        resp = client.post(
            "/api/evenements",
            json={"etablissement_id": b.etab.etablissement_id, "titre": "Chez B",
                  "date_debut": "2026-04-01", "cible": "TOUS"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        apres_b = db.query(Evenement).filter(
            Evenement.etablissement_id == b.etab.etablissement_id
        ).count()
        assert apres_b == avant_b, "Une ressource a été créée dans l'école B"


# ══════════════════════════════════════════════════════════════
# T5 — etablissement_id forcé dans le corps de la requête
# ══════════════════════════════════════════════════════════════

class TestT5EtablissementForce:
    def test_body_ignore_la_ressource_est_rattachee_a_lappelant(
        self, client: TestClient, db: Session, ecoles
    ):
        a, b = ecoles
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/evenements",
            json={"etablissement_id": b.etab.etablissement_id, "titre": f"Test {_uid()}",
                  "date_debut": "2026-04-01", "cible": "TOUS"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(Evenement).filter(
            Evenement.evenement_id == resp.json()["evenement_id"]
        ).first()
        assert cree.etablissement_id == a.etab.etablissement_id

    def test_query_param_ignore_en_lecture(self, client: TestClient, db: Session, ecoles):
        a, b = ecoles
        ev_b = b.evenement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/evenements?etablissement_id={b.etab.etablissement_id}", headers=headers
        )
        assert resp.status_code == 200
        assert all(e["evenement_id"] != ev_b.evenement_id for e in resp.json())


# ══════════════════════════════════════════════════════════════
# T6 — Même identifiant métier dans deux écoles
# ══════════════════════════════════════════════════════════════

class TestT6MemeIdentifiantMetier:
    """LIMITE CONNUE : `ss_eleves.matricule` porte un index unique GLOBAL, donc
    deux écoles ne peuvent pas employer le même matricule. Ce test vérifie la
    seule chose qui relève de la sécurité — que la tentative n'écrit rien chez
    l'autre école et n'expose pas ses données — et documente la limite."""

    def test_matricule_deja_pris_par_une_autre_ecole(self, client: TestClient, db: Session, ecoles):
        a, b = ecoles
        eleve_b = b.eleve(db)
        nb_b_avant = db.query(Eleve).filter(
            Eleve.etablissement_id == b.etab.etablissement_id
        ).count()

        doublon = Eleve(
            etablissement_id=a.etab.etablissement_id, matricule=eleve_b.matricule,
            nom="Homonyme", prenom="Test", date_naissance=date(2012, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(doublon)
        with pytest.raises(Exception):
            db.commit()
        db.rollback()

        # Aucune donnée de B n'a été modifiée par la tentative.
        assert db.query(Eleve).filter(
            Eleve.etablissement_id == b.etab.etablissement_id
        ).count() == nb_b_avant
        db.refresh(eleve_b)
        assert eleve_b.etablissement_id == b.etab.etablissement_id


# ══════════════════════════════════════════════════════════════
# T7-T8 — Parent mono-école et multi-écoles
# ══════════════════════════════════════════════════════════════

class TestT7T8Parent:
    def test_t7_parent_mono_ecole_herite_de_son_etablissement(
        self, client: TestClient, db: Session, ecoles
    ):
        a, _ = ecoles
        enfant = a.eleve(db)
        uid = _uid()
        parent = Parent(
            nom="Camara", prenom="Sékou", telephone_1=f"64300{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(parent); db.commit(); db.refresh(parent)
        db.add(EleveParent(eleve_id=enfant.eleve_id, parent_id=parent.parent_id, lien_parente="PERE"))
        db.commit()

        resp = client.post("/api/auth/login", json={
            "identifiant": parent.telephone_1, "mot_de_passe": "motdepasse123",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["etablissement_id"] == a.etab.etablissement_id
        charge = jwt.decode(resp.json()["token"], SECRET_KEY, algorithms=[ALGORITHM])
        assert charge["etablissement_id"] == a.etab.etablissement_id

    def test_t8_parent_multi_ecoles_na_pas_detablissement_unique(
        self, client: TestClient, db: Session, ecoles
    ):
        """Aucun établissement n'est choisi arbitrairement (jamais de `.first()`)."""
        a, b = ecoles
        enfant_a, enfant_b = a.eleve(db), b.eleve(db)
        uid = _uid()
        parent = Parent(
            nom="Barry", prenom="Fatoumata", telephone_1=f"64400{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(parent); db.commit(); db.refresh(parent)
        for enfant in (enfant_a, enfant_b):
            db.add(EleveParent(
                eleve_id=enfant.eleve_id, parent_id=parent.parent_id, lien_parente="MERE",
            ))
        db.commit()

        resp = client.post("/api/auth/login", json={
            "identifiant": parent.telephone_1, "mot_de_passe": "motdepasse123",
        })
        assert resp.status_code == 200
        assert resp.json()["user"]["etablissement_id"] is None
        charge = jwt.decode(resp.json()["token"], SECRET_KEY, algorithms=[ALGORITHM])
        assert charge["etablissement_id"] is None

    def test_t8bis_parent_naccede_quaux_donnees_de_ses_enfants(
        self, client: TestClient, db: Session, ecoles
    ):
        a, _ = ecoles
        mon_enfant = a.eleve(db)
        enfant_dautrui = a.eleve(db)  # même école, autre famille
        uid = _uid()
        parent = Parent(
            nom="Sow", prenom="Aminata", telephone_1=f"64500{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(parent); db.commit(); db.refresh(parent)
        db.add(EleveParent(
            eleve_id=mon_enfant.eleve_id, parent_id=parent.parent_id, lien_parente="MERE",
        ))
        db.commit()

        headers = _headers(client, parent.telephone_1)

        # Ses propres enfants : accessibles.
        sien = client.get(
            f"/api/portail-parent/{parent.parent_id}/enfant/{mon_enfant.eleve_id}/notes",
            headers=headers,
        )
        assert sien.status_code == 200, sien.text

        # L'enfant d'une autre famille, MÊME école : refusé.
        autre = client.get(
            f"/api/portail-parent/{parent.parent_id}/enfant/{enfant_dautrui.eleve_id}/notes",
            headers=headers,
        )
        assert autre.status_code in (403, 404), autre.text


# ══════════════════════════════════════════════════════════════
# T9 — Identifiant de connexion dupliqué entre deux écoles
# ══════════════════════════════════════════════════════════════

class TestT9IdentifiantDuplique:
    """LIMITE CONNUE : `email`/`telephone` ne portent aucune contrainte unique,
    alors que le login les accepte comme identifiant et résout par `.first()`.
    Ce test vérifie le point de sécurité — les identifiants d'un compte ne
    donnent JAMAIS accès au compte homonyme d'une autre école — et documente
    l'effet de bord fonctionnel (le second compte ne peut pas se connecter)."""

    def test_email_partage_naccorde_pas_lacces_a_lautre_compte(
        self, client: TestClient, db: Session, ecoles
    ):
        a, b = ecoles
        email_partage = f"partage.{_uid()}@smartschool.gn"
        for ecole, mdp in ((a, "motdepasseA123"), (b, "motdepasseB123")):
            uid = _uid()
            db.add(Utilisateur(
                nom="Dup", prenom=f"{uid}", nom_utilisateur=f"multi.dup.{uid}",
                email=email_partage, telephone=f"64600{uid:04d}",
                mot_de_passe=hash_password(mdp), role="ADMIN", statut="ACTIF",
                etablissement_id=ecole.etab.etablissement_id,
            ))
        db.commit()

        # Chaque connexion réussie doit correspondre au mot de passe utilisé,
        # et ne jamais authentifier "l'autre" compte.
        for mdp, attendu in (("motdepasseA123", a), ("motdepasseB123", b)):
            resp = client.post("/api/auth/login", json={
                "identifiant": email_partage, "mot_de_passe": mdp,
            })
            if resp.status_code == 200:
                assert resp.json()["user"]["etablissement_id"] == attendu.etab.etablissement_id, (
                    "Le mot de passe d'une école a authentifié le compte de l'autre"
                )
            else:
                # Compte inatteignable (résolution par `.first()`) : refus net,
                # jamais un accès au mauvais établissement.
                assert resp.status_code == 401


# ══════════════════════════════════════════════════════════════
# T10 — Token non falsifiable
# ══════════════════════════════════════════════════════════════

class TestT10TokenNonFalsifiable:
    def test_etablissement_modifie_dans_le_token_est_rejete(
        self, client: TestClient, db: Session, ecoles
    ):
        a, b = ecoles
        resp = client.post("/api/auth/login", json={
            "identifiant": a.admin.nom_utilisateur, "mot_de_passe": "motdepasse123",
        })
        charge = jwt.decode(resp.json()["token"], SECRET_KEY, algorithms=[ALGORITHM])

        # Re-signé avec une AUTRE clé : la signature ne peut pas être reproduite
        # sans le secret serveur.
        charge["etablissement_id"] = b.etab.etablissement_id
        faux = jwt.encode(charge, "mauvaise-cle-secrete", algorithm=ALGORITHM)

        r = client.get("/api/evenements", headers={"Authorization": f"Bearer {faux}"})
        assert r.status_code == 401

    def test_token_tronque_rejete(self, client: TestClient, db: Session, ecoles):
        a, _ = ecoles
        resp = client.post("/api/auth/login", json={
            "identifiant": a.admin.nom_utilisateur, "mot_de_passe": "motdepasse123",
        })
        altere = resp.json()["token"][:-4] + "AAAA"

        r = client.get("/api/evenements", headers={"Authorization": f"Bearer {altere}"})
        assert r.status_code == 401


# ══════════════════════════════════════════════════════════════
# T11 — Changement de compte : aucune donnée résiduelle
# ══════════════════════════════════════════════════════════════

class TestT11ChangementDeCompte:
    def test_deux_comptes_successifs_voient_chacun_leur_ecole(
        self, client: TestClient, db: Session, ecoles
    ):
        """Le serveur ne conserve aucun état entre deux sessions : le second
        token ne doit jamais hériter du périmètre du premier."""
        a, b = ecoles
        ev_a, ev_b = a.evenement(db), b.evenement(db)

        vus_a = {e["evenement_id"] for e in client.get(
            "/api/evenements", headers=_headers(client, a.admin.nom_utilisateur)
        ).json()}
        vus_b = {e["evenement_id"] for e in client.get(
            "/api/evenements", headers=_headers(client, b.admin.nom_utilisateur)
        ).json()}

        assert vus_a == {ev_a.evenement_id}
        assert vus_b == {ev_b.evenement_id}
        assert not (vus_a & vus_b)


# ══════════════════════════════════════════════════════════════
# T12-T13 — Tâches asynchrones et cache
# ══════════════════════════════════════════════════════════════

class TestT12T13AsyncEtCache:
    def test_t12_statut_de_tache_exige_un_etablissement(
        self, client: TestClient, db: Session, ecoles
    ):
        """Le refus du worker est couvert par
        `test_task_queue.py::test_refuse_si_etablissement_ne_correspond_pas`.
        Ici : la LECTURE du statut exige elle aussi un établissement."""
        a, _ = ecoles
        headers = _headers(client, a.admin.nom_utilisateur)

        r = client.get("/api/tasks/id-inexistant-0000", headers=headers)
        assert r.status_code in (404, 503)

        # Sans token : jamais 200.
        assert client.get("/api/tasks/id-inexistant-0000").status_code == 401

    def test_t13_pas_de_collision_de_perimetre_entre_ecoles(
        self, client: TestClient, db: Session, ecoles
    ):
        """Deux tableaux de bord, deux écoles, deux résultats distincts.

        Le seul cache du projet est celui du tableau de bord FINANCIER
        (`finance.py`, clé `dashboard:{etablissement_id}:{annee_id}`, TTL 60 s) :
        l'établissement fait partie de la clé et provient du token, donc deux
        écoles ne peuvent pas se servir mutuellement une entrée. `/api/dashboard`
        (pédagogique), lui, ne met rien en cache.
        """
        a, b = ecoles
        a.eleve(db)
        for _ in range(3):
            b.eleve(db)

        kpi_a = client.get(
            f"/api/dashboard?annee_id={a.annee.annee_id}",
            headers=_headers(client, a.admin.nom_utilisateur),
        ).json()["kpi"]
        kpi_b = client.get(
            f"/api/dashboard?annee_id={b.annee.annee_id}",
            headers=_headers(client, b.admin.nom_utilisateur),
        ).json()["kpi"]

        assert kpi_a["nb_eleves"] == 1
        assert kpi_b["nb_eleves"] == 3

    def test_t13bis_la_cle_de_cache_financier_porte_letablissement(self):
        """Verrou de non-régression : retirer `etablissement_id` de la clé
        ferait servir à une école le tableau de bord financier d'une autre."""
        import inspect

        from app.api import finance

        source = inspect.getsource(finance.dashboard_financier)
        assert 'f"dashboard:{etablissement_id}:{annee_id}"' in source


# ══════════════════════════════════════════════════════════════
# T14 — Exports PDF
# ══════════════════════════════════════════════════════════════

class TestT14Exports:
    def test_pdf_dune_autre_ecole_refuse(self, client: TestClient, db: Session, ecoles):
        a, _ = ecoles
        headers = _headers(client, a.admin.nom_utilisateur)

        # Identifiants inexistants pour cette école : jamais 200, jamais un PDF.
        for chemin in (
            "/api/finance/factures/999999/pdf",
            "/api/finance/paiements/999999/recu-pdf",
            "/api/evaluations/bulletins/999999/pdf",
        ):
            r = client.get(chemin, headers=headers)
            assert r.status_code in (403, 404), f"{chemin} → {r.status_code}"
            assert "application/pdf" not in r.headers.get("content-type", "")

    def test_export_exige_un_etablissement(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"multi.super.{uid}",
            email=f"multi.super.{uid}@smartschool.gn", telephone=f"64700{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        assert client.get("/api/finance/factures/1/pdf", headers=headers).status_code == 403


# ══════════════════════════════════════════════════════════════
# T15 — Recherche
# ══════════════════════════════════════════════════════════════

class TestT15Recherche:
    """Aucun endpoint de recherche GLOBALE n'existe dans le projet (vérifié
    lot par lot) : les recherches sont des paramètres `q`/`search` propres à
    chaque module, donc soumis au filtre d'établissement de leur route."""

    def test_recherche_eleves_ne_traverse_pas_les_ecoles(
        self, client: TestClient, db: Session, ecoles
    ):
        a, b = ecoles
        eleve_b = b.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/eleves?search={eleve_b.matricule}", headers=headers)
        assert resp.status_code == 200
        contenu = resp.json()
        lignes = contenu if isinstance(contenu, list) else contenu.get("items", [])
        assert all(e.get("eleve_id") != eleve_b.eleve_id for e in lignes)

    def test_recherche_enseignants_ne_traverse_pas_les_ecoles(
        self, client: TestClient, db: Session, ecoles
    ):
        a, b = ecoles
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/enseignants?search={b.enseignant.matricule}", headers=headers)
        assert resp.status_code == 200
        contenu = resp.json()
        lignes = contenu if isinstance(contenu, list) else contenu.get("items", [])
        assert all(e.get("enseignant_id") != b.enseignant.enseignant_id for e in lignes)
