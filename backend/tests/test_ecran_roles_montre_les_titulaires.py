"""
Tests — l'écran des rôles doit montrer l'organigramme réel de l'école.

CE QUI A ÉTÉ TROUVÉ
-------------------
`GET /api/securite/roles` ne listait que les lignes de `ss_roles`, c'est-à-dire
uniquement les rôles créés à la main depuis l'écran. Or ce ne sont pas ceux-là
que le logiciel attribue : quand la direction enregistre un comptable, elle
pose `role = 'COMPTABLE'` sur sa fiche, et aucune ligne n'apparaît dans
`ss_roles`.

Sur la base de TrillionX, l'écran affichait donc trois rôles — CENSEUR,
COMPTA, SURV_GEN — et « Personne n'occupe encore ce poste » en face de chacun.
Pendant ce temps l'école comptait 20 agents en poste, dont deux comptables qui
se connectent tous les jours.

Pire : « COMPTA » est un doublon saisi à la main de COMPTABLE. La direction
lisait « Espace : Comptabilité — personne n'occupe ce poste » alors que son
comptable était devant elle.

Les postes du système figurent désormais dans la même liste, avec leurs
titulaires, leur identifiant de connexion et leur statut. Ils n'ont pas de
`role_id` : il n'y a rien à modifier ni à supprimer dessus, et l'interface doit
le refléter plutôt que d'afficher des boutons qui échoueraient.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur

import uuid

# Les fichiers de tests partagent une meme base. Deux d'entre eux qui
# fabriquent leurs codes avec un simple compteur repartant de 1 finissent par
# se voler un code d'etablissement, et le second echoue pour une raison qui
# n'a rien a voir avec ce qu'il verifie. Ce jeton rend nos codes uniques.
_JETON = uuid.uuid4().hex[:6]

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"ROL-{_JETON}-{uid}", nom=f"École ROL {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    db.add(AnneeScolaire(
        code=f"AR{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    ))
    admin = Utilisateur(
        nom="Camara", prenom=f"Chef{uid}", nom_utilisateur=f"rol.{_JETON}.a{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, admin


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _poste(reponse, code: str) -> dict:
    for p in reponse:
        if p["code"] == code:
            return p
    pytest.fail(f"Le poste {code} n'apparaît pas : {[p['code'] for p in reponse]}")


class TestLesPostesDuSystemeApparaissent:
    def test_un_comptable_en_poste_n_est_pas_un_poste_vide(
        self, client: TestClient, db: Session
    ):
        etab, admin = _ecole(db)
        comptable = Utilisateur(
            nom="Guisse", prenom="Oumar", nom_utilisateur=f"rol.{_JETON}.c{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="COMPTABLE",
            statut="ACTIF", etablissement_id=etab.etablissement_id,
            salaire_base=1800000,
        )
        db.add(comptable); db.commit(); db.refresh(comptable)

        r = client.get("/api/securite/roles", headers=_headers(client, admin.nom_utilisateur))
        assert r.status_code == 200, r.text
        poste = _poste(r.json(), "COMPTABLE")

        assert poste["nb_actifs"] == 1
        titulaire = poste["titulaires"][0]
        assert (titulaire["prenom"], titulaire["nom"]) == ("Oumar", "Guisse")
        # L'identifiant avec lequel la personne entre réellement.
        assert titulaire["nom_utilisateur"] == comptable.nom_utilisateur
        assert titulaire["peut_se_connecter"] is True
        assert titulaire["salaire_base"] == 1800000

    def test_le_poste_porte_un_nom_lisible_pas_un_code(
        self, client: TestClient, db: Session
    ):
        etab, admin = _ecole(db)
        r = client.get("/api/securite/roles", headers=_headers(client, admin.nom_utilisateur))
        assert _poste(r.json(), "COMPTABLE")["libelle"] == "Comptabilité"
        assert _poste(r.json(), "AGENT_ENTRETIEN")["libelle"] == "Entretien"

    def test_un_poste_du_systeme_ne_se_modifie_pas(
        self, client: TestClient, db: Session
    ):
        """Pas de role_id : ni matrice de permissions, ni suppression."""
        etab, admin = _ecole(db)
        r = client.get("/api/securite/roles", headers=_headers(client, admin.nom_utilisateur))
        poste = _poste(r.json(), "SURVEILLANT")
        assert poste["role_id"] is None
        assert poste["est_systeme"] is True
        assert poste["permissions"] == []

    def test_un_agent_sans_compte_reste_visible(self, client: TestClient, db: Session):
        """Un gardien existe en RH et à la paie sans jamais ouvrir un écran.
        Il occupe bien un poste : le masquer fausserait l'organigramme."""
        etab, admin = _ecole(db)
        db.add(Utilisateur(
            nom="Conde", prenom="Kadiatou", nom_utilisateur=None, mot_de_passe=None,
            role="GARDIEN", statut="ACTIF", etablissement_id=etab.etablissement_id,
        ))
        db.commit()

        r = client.get("/api/securite/roles", headers=_headers(client, admin.nom_utilisateur))
        titulaire = _poste(r.json(), "GARDIEN")["titulaires"][0]
        assert titulaire["nom"] == "Conde"
        assert titulaire["peut_se_connecter"] is False


class TestLeRoleCreeParLEcoleGardeSaPlace:
    def test_il_n_est_pas_efface_par_les_postes_du_systeme(
        self, client: TestClient, db: Session
    ):
        etab, admin = _ecole(db)
        h = _headers(client, admin.nom_utilisateur)
        r = client.post("/api/securite/roles", headers=h, json={
            "code": "CENSEUR", "libelle": "Censeur des études",
            "role_base": "DIRECTEUR_NIVEAU", "salaire_mensuel": 1400000,
        })
        assert r.status_code == 201, r.text

        liste = client.get("/api/securite/roles", headers=h).json()
        censeur = _poste(liste, "CENSEUR")
        assert censeur["role_id"] is not None       # lui se modifie
        assert censeur["role_base"] == "DIRECTEUR_NIVEAU"
        assert censeur["salaire_mensuel"] == 1400000
        # Et l'espace dont il hérite reste listé pour lui-même.
        assert _poste(liste, "DIRECTEUR_NIVEAU")["role_id"] is None

    def test_un_code_maison_n_est_pas_duplique_par_le_systeme(
        self, client: TestClient, db: Session
    ):
        """Une école qui nomme son rôle « COMPTABLE » garde le sien : le poste
        du système ne vient pas s'ajouter par-dessus."""
        etab, admin = _ecole(db)
        h = _headers(client, admin.nom_utilisateur)
        client.post("/api/securite/roles", headers=h, json={
            "code": "COMPTABLE", "libelle": "Caisse et comptabilité",
            "role_base": "COMPTABLE",
        })
        liste = client.get("/api/securite/roles", headers=h).json()
        assert [p["code"] for p in liste].count("COMPTABLE") == 1
        assert _poste(liste, "COMPTABLE")["libelle"] == "Caisse et comptabilité"


class TestChaqueEcoleNeVoitQueLesSiens:
    def test_le_titulaire_d_une_autre_ecole_n_apparait_pas(
        self, client: TestClient, db: Session
    ):
        etab_a, admin_a = _ecole(db)
        etab_b, _ = _ecole(db)
        db.add(Utilisateur(
            nom="Diallo", prenom="Ailleurs", nom_utilisateur=f"rol.{_JETON}.z{_uid()}",
            mot_de_passe=hash_password("motdepasse123"), role="COMPTABLE",
            statut="ACTIF", etablissement_id=etab_b.etablissement_id,
        ))
        db.commit()

        r = client.get("/api/securite/roles", headers=_headers(client, admin_a.nom_utilisateur))
        assert _poste(r.json(), "COMPTABLE")["titulaires"] == []
