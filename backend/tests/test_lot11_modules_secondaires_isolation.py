"""
Tests — Lot 11 (chantier multi-écoles) : isolation des modules secondaires
(`dashboard.py`, `bibliotheque.py`, `informatique.py`, `tasks.py`).

Le point le plus grave : `GET /api/dashboard?etablissement_id=N` livrait le
tableau de bord complet de n'importe quelle école — effectifs, chiffre
d'affaires, impayés, dépenses, incidents — en incrémentant un identifiant.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Emprunt, Enseignant, EquipementInformatique,
    Etablissement, Exemplaire, Inscription, Niveau, Ouvrage, Salle,
    TicketInformatique, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(
            code=f"L11-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE",
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

        self.salle = Salle(etablissement_id=self.etab.etablissement_id, code=f"S{uid}", nom="Salle info")
        db.add(self.salle); db.commit(); db.refresh(self.salle)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L11ENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"63100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L11{uid}", nom_utilisateur=f"l11.admin.{uid}",
            email=f"l11.admin.{uid}@smartschool.gn", telephone=f"63200{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def eleve(self, db: Session) -> Eleve:
        uid = _uid()
        e = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L11ELV-{uid}",
            nom="Diallo", prenom=f"E{uid}", date_naissance=date(2012, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(e); db.commit(); db.refresh(e)
        db.add(Inscription(
            eleve_id=e.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        ))
        db.commit()
        return e

    def ouvrage(self, db: Session) -> Ouvrage:
        uid = _uid()
        o = Ouvrage(
            etablissement_id=self.etab.etablissement_id, code_interne=f"OUV-{uid}",
            titre=f"Livre {uid}", categorie="ROMAN", nb_exemplaires=1, nb_disponibles=1,
            statut="ACTIF",
        )
        db.add(o); db.commit(); db.refresh(o)
        return o

    def exemplaire(self, db: Session, ouvrage: Ouvrage) -> Exemplaire:
        ex = Exemplaire(
            ouvrage_id=ouvrage.ouvrage_id, code_exemplaire=f"EX-{_uid()}",
            etat="BON", statut="DISPONIBLE",
        )
        db.add(ex); db.commit(); db.refresh(ex)
        return ex

    def equipement(self, db: Session) -> EquipementInformatique:
        uid = _uid()
        eq = EquipementInformatique(
            etablissement_id=self.etab.etablissement_id, code=f"EQ-{uid}",
            nom=f"PC {uid}", type_equipement="ORDINATEUR", etat="BON", statut="ACTIF",
        )
        db.add(eq); db.commit(); db.refresh(eq)
        return eq

    def ticket(self, db: Session) -> TicketInformatique:
        t = TicketInformatique(
            etablissement_id=self.etab.etablissement_id, titre=f"Panne {_uid()}",
            description="Écran noir", priorite="NORMALE", statut="OUVERT",
        )
        db.add(t); db.commit(); db.refresh(t)
        return t


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ══════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════

class TestDashboardIsolation:
    def test_ne_rend_jamais_les_chiffres_dune_autre_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "DBA"), Ecole(db, "DBB")
        for _ in range(3):
            b.eleve(db)
        a.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        # Même en réclamant explicitement l'école B et son année.
        resp = client.get(
            f"/api/dashboard?etablissement_id={b.etab.etablissement_id}&annee_id={a.annee.annee_id}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        kpi = resp.json()["kpi"]
        # 1 élève chez A, 3 chez B : on doit voir 1, jamais 3 ni 4.
        assert kpi["nb_eleves"] == 1, kpi
        assert kpi["nb_classes"] == 1, kpi
        assert kpi["nb_enseignants"] == 1, kpi

    def test_annee_dune_autre_ecole_refusee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "DAA"), Ecole(db, "DAB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/dashboard?annee_id={b.annee.annee_id}", headers=headers)
        assert resp.status_code == 404

    def test_annee_obligatoire(self, client: TestClient, db: Session):
        """Le défaut `annee_id=1` visait l'année 1, souvent d'une autre école."""
        a = Ecole(db, "DOA")
        headers = _headers(client, a.admin.nom_utilisateur)

        assert client.get("/api/dashboard", headers=headers).status_code == 422


# ══════════════════════════════════════════════════════════════
# BIBLIOTHÈQUE
# ══════════════════════════════════════════════════════════════

class TestBibliothequeIsolation:
    def test_catalogue_isole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BCA"), Ecole(db, "BCB")
        o_a, o_b = a.ouvrage(db), b.ouvrage(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/bibliotheque/ouvrages?etablissement_id={b.etab.etablissement_id}", headers=headers,
        )
        assert resp.status_code == 200
        ids = {o["ouvrage_id"] for o in resp.json()}
        assert o_a.ouvrage_id in ids and o_b.ouvrage_id not in ids

    def test_stats_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BSA"), Ecole(db, "BSB")
        b.ouvrage(db); b.ouvrage(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/bibliotheque/stats", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total_ouvrages"] == 0

    def test_modifier_ouvrage_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BMA"), Ecole(db, "BMB")
        o_b = b.ouvrage(db)
        titre_avant = o_b.titre
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/bibliotheque/ouvrages/{o_b.ouvrage_id}",
            json={"titre": "Titre piraté"}, headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(o_b)
        assert o_b.titre == titre_avant

    def test_creation_rattachee_a_la_bonne_ecole(self, client: TestClient, db: Session):
        """Le modèle et le schéma avaient tous deux `etablissement_id = 1`."""
        a = Ecole(db, "BCR")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/bibliotheque/ouvrages",
            json={"code_interne": f"NEW-{_uid()}", "titre": "Nouveau livre",
                  "nb_exemplaires_initial": 2},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(Ouvrage).filter(Ouvrage.ouvrage_id == resp.json()["ouvrage_id"]).first()
        assert cree.etablissement_id == a.etab.etablissement_id

    def test_ajouter_un_exemplaire_a_un_ouvrage_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BEA"), Ecole(db, "BEB")
        o_b = b.ouvrage(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/bibliotheque/exemplaires",
            json={"ouvrage_id": o_b.ouvrage_id, "etat": "BON", "statut": "DISPONIBLE"},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_emprunter_un_exemplaire_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BPA"), Ecole(db, "BPB")
        ex_b = b.exemplaire(db, b.ouvrage(db))
        eleve_a = a.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/bibliotheque/emprunts",
            json={"exemplaire_id": ex_b.exemplaire_id, "eleve_id": eleve_a.eleve_id,
                  "date_retour_prevue": "2026-06-01"},
            headers=headers,
        )
        assert resp.status_code == 404
        # Ce qui compte : la demande refusee n'a cree AUCUN pret sur cet
        # exemplaire. Compter les emprunts de toute la base rendait ce test
        # dependant des fichiers joues avant lui — il echouait des qu'un autre
        # test de bibliotheque avait laisse un pret derriere lui.
        assert db.query(Emprunt).filter(
            Emprunt.exemplaire_id == ex_b.exemplaire_id
        ).count() == 0
        db.refresh(ex_b)
        assert ex_b.statut == "DISPONIBLE"

    def test_emprunt_au_nom_dun_eleve_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "BQA"), Ecole(db, "BQB")
        ex_a = a.exemplaire(db, a.ouvrage(db))
        eleve_b = b.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/bibliotheque/emprunts",
            json={"exemplaire_id": ex_a.exemplaire_id, "eleve_id": eleve_b.eleve_id,
                  "date_retour_prevue": "2026-06-01"},
            headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(ex_a)
        assert ex_a.statut == "DISPONIBLE"

    def test_emprunt_legitime_fonctionne(self, client: TestClient, db: Session):
        a = Ecole(db, "BOK")
        ex = a.exemplaire(db, a.ouvrage(db))
        eleve = a.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/bibliotheque/emprunts",
            json={"exemplaire_id": ex.exemplaire_id, "eleve_id": eleve.eleve_id,
                  "date_retour_prevue": "2026-06-01"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        db.refresh(ex)
        assert ex.statut == "EMPRUNTE"


# ══════════════════════════════════════════════════════════════
# INFORMATIQUE
# ══════════════════════════════════════════════════════════════

class TestInformatiqueIsolation:
    def test_inventaire_isole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "IEA"), Ecole(db, "IEB")
        eq_a, eq_b = a.equipement(db), b.equipement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(
            f"/api/informatique/equipements?etablissement_id={b.etab.etablissement_id}",
            headers=headers,
        )
        assert resp.status_code == 200
        ids = {e["equipement_id"] for e in resp.json()}
        assert eq_a.equipement_id in ids and eq_b.equipement_id not in ids

    def test_stats_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ISA"), Ecole(db, "ISB")
        b.equipement(db); b.equipement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/informatique/stats", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total_equipements"] == 0

    def test_tickets_isoles(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ITA"), Ecole(db, "ITB")
        t_b = b.ticket(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/informatique/tickets", headers=headers)
        assert resp.status_code == 200
        assert all(t["ticket_id"] != t_b.ticket_id for t in resp.json())

    def test_resoudre_ticket_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "IRA"), Ecole(db, "IRB")
        t_b = b.ticket(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/informatique/tickets/{t_b.ticket_id}/resoudre?resolution=OK", headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(t_b)
        assert t_b.statut == "OUVERT"

    def test_creation_equipement_rattachee_a_la_bonne_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ICA"), Ecole(db, "ICB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/informatique/equipements",
            json={"etablissement_id": b.etab.etablissement_id, "code": f"NEW-{_uid()}",
                  "nom": "PC neuf"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(EquipementInformatique).filter(
            EquipementInformatique.equipement_id == resp.json()["equipement_id"]
        ).first()
        assert cree.etablissement_id == a.etab.etablissement_id

    def test_equipement_dans_une_salle_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ISLA"), Ecole(db, "ISLB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/informatique/equipements",
            json={"code": f"NEW-{_uid()}", "nom": "PC", "salle_id": b.salle.salle_id},
            headers=headers,
        )
        assert resp.status_code == 404

    def test_creation_ticket_fonctionne(self, client: TestClient, db: Session):
        """`signale_par` était passé deux fois : la route levait un TypeError."""
        a = Ecole(db, "ICT")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/informatique/tickets",
            json={"titre": "Imprimante HS", "description": "Bourrage papier"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(TicketInformatique).filter(
            TicketInformatique.ticket_id == resp.json()["ticket_id"]
        ).first()
        assert cree.etablissement_id == a.etab.etablissement_id
        assert cree.signale_par  # renseigné depuis le compte appelant

    def test_ticket_sur_un_equipement_dautrui_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "IQA"), Ecole(db, "IQB")
        eq_b = b.equipement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/informatique/tickets",
            json={"titre": "Panne", "description": "x", "equipement_id": eq_b.equipement_id},
            headers=headers,
        )
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════
# SUPER_ADMIN PLATEFORME
# ══════════════════════════════════════════════════════════════

class TestSuperAdminPlateformeRefuse:
    def test_routes_tenant_refusees(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l11.super.{uid}",
            email=f"l11.super.{uid}@smartschool.gn", telephone=f"63300{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        assert client.get("/api/dashboard?annee_id=1", headers=headers).status_code == 403
        assert client.get("/api/bibliotheque/ouvrages", headers=headers).status_code == 403
        assert client.get("/api/informatique/stats", headers=headers).status_code == 403
