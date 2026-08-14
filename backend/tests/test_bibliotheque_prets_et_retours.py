"""
Tests — un compteur de retards doit compter les retards, et une liste doit exister.

CE QUI A ÉTÉ TROUVÉ
-------------------
1. `GET /api/bibliotheque/stats` comptait les retards ainsi :

       Emprunt.statut == "EN_RETARD"

   Or aucune ligne du logiciel n'écrit jamais cette valeur : un prêt naît
   « EN_COURS » et n'en bouge qu'au retour. Le tableau du bibliothécaire
   annonçait donc « 0 retard » en permanence. Sur la base réelle : 27 livres
   sortis depuis plus de deux mois, et un tableau de bord serein.

   Un retard se lit sur le calendrier. La date de retour prévue est déjà en
   base et ne dépend d'aucun traitement nocturne.

2. Il n'existait AUCUNE route pour lister les emprunts. On pouvait en créer
   un, jamais le retrouver. « 27 prêts en cours » ne menait à rien : ni le
   titre, ni l'emprunteur, ni depuis quand. Un compteur sans liste derrière
   ne permet de récupérer aucun livre.

3. Il n'existait AUCUNE route pour enregistrer un retour. Un exemplaire prêté
   restait « EMPRUNTE » à vie et `nb_disponibles` ne remontait jamais : le
   fonds s'épuisait à l'écran sans qu'un seul livre ait quitté l'école.
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Eleve, Emprunt, Etablissement, Exemplaire, Ouvrage, Utilisateur,
)

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
    etab = Etablissement(code=f"BIB-{_JETON}-{uid}", nom=f"École BIB {uid}", type_etablissement="LYCEE")
    db.add(etab); db.commit(); db.refresh(etab)
    db.add(AnneeScolaire(
        code=f"AB{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    ))
    biblio = Utilisateur(
        nom="Diallo", prenom=f"Ousmane{uid}", nom_utilisateur=f"bib.{_JETON}.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="BIBLIOTHECAIRE",
        statut="ACTIF", etablissement_id=etab.etablissement_id,
    )
    db.add(biblio); db.commit(); db.refresh(biblio)
    return etab, biblio


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _livre_prete(db: Session, etab, *, rendu_prevu: date, deja_rendu: bool = False):
    """Un ouvrage, son exemplaire, un élève, et le prêt entre les deux."""
    uid = _uid()
    ouvrage = Ouvrage(
        etablissement_id=etab.etablissement_id, code_interne=f"OUV{_JETON}{uid}",
        titre=f"L'Enfant noir {uid}", auteur="Camara Laye",
        nb_exemplaires=1, nb_disponibles=0, statut="DISPONIBLE",
    )
    db.add(ouvrage); db.commit(); db.refresh(ouvrage)
    ex = Exemplaire(ouvrage_id=ouvrage.ouvrage_id, code_exemplaire=f"EX{_JETON}{uid}",
                    statut="EMPRUNTE")
    eleve = Eleve(matricule=f"ELV{_JETON}{uid}", nom="Bah", prenom="Sona", sexe="F",
                  date_naissance=date(2010, 5, 14),
                  etablissement_id=etab.etablissement_id, statut="ACTIF")
    db.add_all([ex, eleve]); db.commit(); db.refresh(ex); db.refresh(eleve)
    emprunt = Emprunt(
        exemplaire_id=ex.exemplaire_id, eleve_id=eleve.eleve_id,
        date_emprunt=rendu_prevu - timedelta(days=14),
        date_retour_prevue=rendu_prevu,
        date_retour_effective=rendu_prevu if deja_rendu else None,
        statut="RENDU" if deja_rendu else "EN_COURS",
    )
    db.add(emprunt); db.commit(); db.refresh(emprunt)
    return ouvrage, ex, eleve, emprunt


class TestLeCompteurDeRetards:
    def test_un_livre_sorti_depuis_trop_longtemps_compte_comme_retard(
        self, client: TestClient, db: Session
    ):
        etab, biblio = _ecole(db)
        _livre_prete(db, etab, rendu_prevu=date.today() - timedelta(days=40))

        r = client.get("/api/bibliotheque/stats", headers=_headers(client, biblio.nom_utilisateur))
        assert r.status_code == 200, r.text
        # Le statut vaut toujours « EN_COURS » — personne ne l'a jamais mis à
        # jour, et c'est bien pour cela que le compteur ne doit pas s'y fier.
        assert r.json()["retards"] == 1
        assert r.json()["emprunts_en_cours"] == 1

    def test_un_livre_encore_dans_les_delais_n_est_pas_un_retard(
        self, client: TestClient, db: Session
    ):
        etab, biblio = _ecole(db)
        _livre_prete(db, etab, rendu_prevu=date.today() + timedelta(days=5))

        r = client.get("/api/bibliotheque/stats", headers=_headers(client, biblio.nom_utilisateur))
        assert r.json()["retards"] == 0
        assert r.json()["emprunts_en_cours"] == 1

    def test_un_livre_rendu_en_retard_ne_pese_plus_sur_le_compteur(
        self, client: TestClient, db: Session
    ):
        """Le compteur sert à récupérer des livres, pas à tenir un historique."""
        etab, biblio = _ecole(db)
        _livre_prete(db, etab, rendu_prevu=date.today() - timedelta(days=40),
                     deja_rendu=True)

        r = client.get("/api/bibliotheque/stats", headers=_headers(client, biblio.nom_utilisateur))
        assert r.json()["retards"] == 0


class TestLaListeDesPrets:
    def test_elle_dit_qui_a_quoi_et_depuis_quand(self, client: TestClient, db: Session):
        etab, biblio = _ecole(db)
        ouvrage, ex, eleve, _ = _livre_prete(
            db, etab, rendu_prevu=date.today() - timedelta(days=12))

        r = client.get("/api/bibliotheque/emprunts", headers=_headers(client, biblio.nom_utilisateur))
        assert r.status_code == 200, r.text
        ligne = r.json()["items"][0]
        assert ligne["titre"] == ouvrage.titre
        assert ligne["code_exemplaire"] == ex.code_exemplaire
        assert ligne["emprunteur"] == f"{eleve.prenom} {eleve.nom}"
        assert ligne["type_emprunteur"] == "ELEVE"
        assert ligne["jours_de_retard"] == 12
        assert ligne["en_retard"] is True
        assert ligne["statut"] == "EN_RETARD"

    def test_le_retard_grandit_chaque_jour(self, client: TestClient, db: Session):
        """Il ne peut pas être figé à l'écriture : rien ne le recalculerait."""
        etab, biblio = _ecole(db)
        _livre_prete(db, etab, rendu_prevu=date.today() - timedelta(days=90))

        r = client.get("/api/bibliotheque/emprunts", headers=_headers(client, biblio.nom_utilisateur))
        assert r.json()["items"][0]["jours_de_retard"] == 90

    def test_on_peut_ne_demander_que_les_retards(self, client: TestClient, db: Session):
        etab, biblio = _ecole(db)
        h = _headers(client, biblio.nom_utilisateur)
        _livre_prete(db, etab, rendu_prevu=date.today() - timedelta(days=30))
        _livre_prete(db, etab, rendu_prevu=date.today() + timedelta(days=7))

        assert client.get("/api/bibliotheque/emprunts?statut=EN_RETARD",
                          headers=h).json()["total"] == 1
        assert client.get("/api/bibliotheque/emprunts?statut=EN_COURS",
                          headers=h).json()["total"] == 2

    def test_les_prets_d_une_autre_ecole_n_apparaissent_pas(
        self, client: TestClient, db: Session
    ):
        etab_a, biblio_a = _ecole(db)
        etab_b, _ = _ecole(db)
        _livre_prete(db, etab_b, rendu_prevu=date.today() - timedelta(days=10))

        r = client.get("/api/bibliotheque/emprunts", headers=_headers(client, biblio_a.nom_utilisateur))
        assert r.json()["total"] == 0


class TestLeRetourDUnLivre:
    def test_le_livre_revient_au_rayon(self, client: TestClient, db: Session):
        etab, biblio = _ecole(db)
        h = _headers(client, biblio.nom_utilisateur)
        ouvrage, ex, _, emprunt = _livre_prete(
            db, etab, rendu_prevu=date.today() - timedelta(days=6))

        r = client.post(f"/api/bibliotheque/emprunts/{emprunt.emprunt_id}/retour",
                        headers=h, json={"etat_retour": "USE"})
        assert r.status_code == 200, r.text
        assert r.json()["jours_de_retard"] == 6

        db.expire_all()
        assert db.get(Exemplaire, ex.exemplaire_id).statut == "DISPONIBLE"
        # Sans cette remontée, le fonds s'épuise a l'ecran sans qu'un livre
        # ait quitte l'ecole.
        assert db.get(Ouvrage, ouvrage.ouvrage_id).nb_disponibles == 1
        assert client.get("/api/bibliotheque/stats", headers=h).json()["retards"] == 0

    def test_un_livre_perdu_ne_retourne_pas_au_rayon(self, client: TestClient, db: Session):
        etab, biblio = _ecole(db)
        h = _headers(client, biblio.nom_utilisateur)
        ouvrage, ex, _, emprunt = _livre_prete(
            db, etab, rendu_prevu=date.today() - timedelta(days=3))

        client.post(f"/api/bibliotheque/emprunts/{emprunt.emprunt_id}/retour",
                    headers=h, json={"etat_retour": "PERDU"})
        db.expire_all()
        assert db.get(Exemplaire, ex.exemplaire_id).statut == "PERDU"
        assert db.get(Ouvrage, ouvrage.ouvrage_id).nb_disponibles == 0

    def test_on_ne_rend_pas_deux_fois_le_meme_livre(self, client: TestClient, db: Session):
        """Sinon nb_disponibles depasse le nombre d'exemplaires possedes."""
        etab, biblio = _ecole(db)
        h = _headers(client, biblio.nom_utilisateur)
        _, _, _, emprunt = _livre_prete(db, etab, rendu_prevu=date.today())

        assert client.post(f"/api/bibliotheque/emprunts/{emprunt.emprunt_id}/retour",
                           headers=h, json={}).status_code == 200
        r = client.post(f"/api/bibliotheque/emprunts/{emprunt.emprunt_id}/retour",
                        headers=h, json={})
        assert r.status_code == 400
        assert "déjà été rendu" in r.json()["detail"]

    def test_un_etat_de_retour_invente_est_refuse(self, client: TestClient, db: Session):
        etab, biblio = _ecole(db)
        _, _, _, emprunt = _livre_prete(db, etab, rendu_prevu=date.today())
        r = client.post(f"/api/bibliotheque/emprunts/{emprunt.emprunt_id}/retour",
                        headers=_headers(client, biblio.nom_utilisateur),
                        json={"etat_retour": "MOYEN"})
        assert r.status_code == 400

    def test_on_ne_rend_pas_le_livre_d_une_autre_ecole(self, client: TestClient, db: Session):
        etab_a, biblio_a = _ecole(db)
        etab_b, _ = _ecole(db)
        _, _, _, emprunt = _livre_prete(db, etab_b, rendu_prevu=date.today())
        r = client.post(f"/api/bibliotheque/emprunts/{emprunt.emprunt_id}/retour",
                        headers=_headers(client, biblio_a.nom_utilisateur), json={})
        assert r.status_code == 404
