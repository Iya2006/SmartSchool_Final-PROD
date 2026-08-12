"""
Tests — Lot 9 passe C (chantier multi-écoles) : isolation des 8 modules
secondaires (photos, pointage QR élèves/agents, devoirs, fournitures, vie
scolaire, événements, activités).

Points sensibles couverts : les deux routes de scan QR résolvaient le
matricule sur TOUTE la plateforme (badge d'une autre école accepté), et la
galerie photos exposait l'annuaire complet (élèves, enseignants, parents).
"""
import io
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    ActiviteJour, AnneeScolaire, Classe, Cycle, Devoir, Eleve, EleveParent,
    Enseignant, Etablissement, Evenement, FournitureScolaire, Incident,
    Inscription, Matiere, Niveau, Parent, PhotoEnAttente, PointageEleve,
    Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"L9C-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS",
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

        self.matiere = Matiere(cycle_id=self.cycle.cycle_id, code=f"MAT{uid}", libelle="Maths", note_sur=20)
        db.add(self.matiere); db.commit(); db.refresh(self.matiere)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"L9CENS-{uid}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=f"60100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L9C{uid}", nom_utilisateur=f"l9c.admin.{uid}",
            email=f"l9c.admin.{uid}@smartschool.gn", telephone=f"60200{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

    def eleve_inscrit(self, db: Session) -> tuple[Eleve, Inscription]:
        uid = _uid()
        eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"L9CELV-{uid}",
            nom="Diallo", prenom=f"E{uid}", date_naissance=date(2012, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(eleve); db.commit(); db.refresh(eleve)
        insc = Inscription(
            eleve_id=eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        return eleve, insc

    def parent_de(self, db: Session, eleve: Eleve) -> Parent:
        uid = _uid()
        p = Parent(
            # Un parent releve d'UNE ecole (migration 2026_08_multi_01).
            etablissement_id=self.etab.etablissement_id,
            nom="Camara", prenom=f"P{uid}", telephone_1=f"60300{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(p); db.commit(); db.refresh(p)
        db.add(EleveParent(eleve_id=eleve.eleve_id, parent_id=p.parent_id, lien_parente="PERE"))
        db.commit()
        return p

    def devoir(self, db: Session) -> Devoir:
        d = Devoir(
            enseignant_id=self.enseignant.enseignant_id, classe_id=self.classe.classe_id,
            matiere_id=self.matiere.matiere_id, titre=f"Devoir {_uid()}", statut="PUBLIE",
        )
        db.add(d); db.commit(); db.refresh(d)
        return d

    def fourniture(self, db: Session) -> FournitureScolaire:
        f = FournitureScolaire(
            etablissement_id=self.etab.etablissement_id, nom=f"Cahier {_uid()}",
            categorie="MATERIEL", quantite=1, classe_id=self.classe.classe_id, statut="ACTIF",
        )
        db.add(f); db.commit(); db.refresh(f)
        return f

    def evenement(self, db: Session) -> Evenement:
        e = Evenement(
            etablissement_id=self.etab.etablissement_id, titre=f"Événement {_uid()}",
            date_debut=date(2026, 3, 1), cible="TOUS", statut="BROUILLON",
        )
        db.add(e); db.commit(); db.refresh(e)
        return e

    def activite(self, db: Session) -> ActiviteJour:
        a = ActiviteJour(
            etablissement_id=self.etab.etablissement_id, titre=f"Activité {_uid()}",
            date_activite=date(2026, 3, 1), est_actif="N",
        )
        db.add(a); db.commit(); db.refresh(a)
        return a

    def incident(self, db: Session, eleve: Eleve) -> Incident:
        i = Incident(
            etablissement_id=self.etab.etablissement_id, eleve_id=eleve.eleve_id,
            type_incident="RETARD", gravite="MINEUR", date_incident=date(2026, 1, 15),
            description="Test", signale_par="Surveillant", statut="OUVERT",
        )
        db.add(i); db.commit(); db.refresh(i)
        return i


def _headers(client: TestClient, nom_utilisateur: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": nom_utilisateur, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ══════════════════════════════════════════════════════════════
# SCAN QR — les deux routes acceptaient les badges de toute la plateforme
# ══════════════════════════════════════════════════════════════

class TestScanQrIsolation:
    def test_scan_eleve_badge_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "SQA"), Ecole(db, "SQB")
        eleve_b, _ = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/pointage-eleves/scan", json={"qr_data": eleve_b.matricule}, headers=headers)
        assert resp.status_code == 404
        assert db.query(PointageEleve).filter(PointageEleve.eleve_id == eleve_b.eleve_id).count() == 0

    def test_scan_eleve_propre_ecole_fonctionne(self, client: TestClient, db: Session):
        a = Ecole(db, "SQOK")
        eleve, _ = a.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/pointage-eleves/scan", json={"qr_data": eleve.matricule}, headers=headers)
        assert resp.status_code == 200, resp.text
        pointage = db.query(PointageEleve).filter(PointageEleve.eleve_id == eleve.eleve_id).first()
        assert pointage is not None
        assert pointage.etablissement_id == a.etab.etablissement_id

    def test_scan_agent_badge_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "SAA"), Ecole(db, "SAB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/presences-agents/scan", json={"qr_data": b.enseignant.matricule}, headers=headers)
        assert resp.status_code == 404

    def test_scan_agent_propre_ecole_fonctionne(self, client: TestClient, db: Session):
        a = Ecole(db, "SAOK")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post("/api/presences-agents/scan", json={"qr_data": a.enseignant.matricule}, headers=headers)
        assert resp.status_code == 200, resp.text


class TestPointageListesIsolees:
    def test_historique_eleves_isole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "HEA"), Ecole(db, "HEB")
        eleve_b, _ = b.eleve_inscrit(db)
        db.add(PointageEleve(
            eleve_id=eleve_b.eleve_id, etablissement_id=b.etab.etablissement_id,
            date_pointage=date.today(), statut="PRESENT",
        ))
        db.commit()
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/pointage-eleves/historique", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_stats_agents_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "SGA"), Ecole(db, "SGB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/presences-agents/stats", headers=headers)
        assert resp.status_code == 200
        # 1 enseignant + 1 admin de A seulement (jamais ceux de B)
        assert resp.json()["kpis"]["total_agents"] == 2

    def test_appel_du_jour_isole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "APA"), Ecole(db, "APB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/pointage-eleves/appel-du-jour", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["stats"]["total_classes"] == 1


# ══════════════════════════════════════════════════════════════
# PHOTOS
# ══════════════════════════════════════════════════════════════

class TestPhotosIsolation:
    def test_galerie_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "GPA"), Ecole(db, "GPB")
        eleve_a, _ = a.eleve_inscrit(db)
        eleve_b, _ = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        meta = client.get("/api/photos/galerie/meta", headers=headers)
        assert meta.status_code == 200
        assert meta.json()["stats"]["total_eleves"] == 1
        assert meta.json()["stats"]["total_enseignants"] == 1

        eleves = client.get("/api/photos/galerie/eleves", headers=headers)
        assert eleves.status_code == 200
        ids = {e["eleve_id"] for e in eleves.json()}
        assert eleve_a.eleve_id in ids
        assert eleve_b.eleve_id not in ids

    def test_get_photo_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PHA"), Ecole(db, "PHB")
        eleve_b, _ = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/photos/eleve/{eleve_b.eleve_id}", headers=headers)
        assert resp.status_code == 404

    def test_delete_photo_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "PDA"), Ecole(db, "PDB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/photos/enseignant/{b.enseignant.enseignant_id}", headers=headers)
        assert resp.status_code == 404

    def test_login_portail_parent_puis_upload_photo_enfant(self, client: TestClient, db: Session):
        """Régression : POST /api/portail-parent/login (la route réellement
        utilisée par le frontend parent, distincte de POST /api/auth/login)
        omettait `etablissement_id` dans le token émis, ce qui faisait
        échouer en 403 ("Établissement non déterminé") tout appel protégé
        par `require_etablissement` — dont l'upload de photo de l'enfant.
        Reproduit le parcours réel : vrai login parent, puis vrai upload."""
        a = Ecole(db, "PPL")
        eleve, _ = a.eleve_inscrit(db)
        parent = a.parent_de(db, eleve)

        login = client.post("/api/portail-parent/login", json={
            "telephone": parent.telephone_1, "mot_de_passe": "motdepasse123",
        })
        assert login.status_code == 200, login.text
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        fichier = {"fichier": ("enfant.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-bytes"), "image/jpeg")}
        resp = client.post(
            f"/api/photos/parent-upload/eleve/{eleve.eleve_id}?parent_id={parent.parent_id}",
            files=fichier, headers=headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["photo_url"]

    def test_parent_envoie_sa_propre_photo_admin_valide(self, client: TestClient, db: Session):
        """Régression : `_entite_appartient_a_etablissement` vérifiait
        l'appartenance d'un `parent` à l'établissement via une jointure
        indirecte EleveParent -> Eleve (motif du Lot 5, avant que `Parent`
        n'ait sa propre colonne `etablissement_id` NOT NULL, migration
        2026_08_multi_01). Reproduit le parcours réel signalé par
        l'utilisateur : le parent envoie SA PROPRE photo (pas celle d'un
        enfant), l'admin la valide — la colonne directe doit suffire, sans
        dépendre d'un lien EleveParent particulier."""
        a = Ecole(db, "PPP")
        eleve, _ = a.eleve_inscrit(db)
        parent = a.parent_de(db, eleve)
        admin_headers = _headers(client, a.admin.nom_utilisateur)

        login = client.post("/api/portail-parent/login", json={
            "telephone": parent.telephone_1, "mot_de_passe": "motdepasse123",
        })
        assert login.status_code == 200, login.text
        parent_headers = {"Authorization": f"Bearer {login.json()['token']}"}

        fichier = {"fichier": ("moi.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-parent"), "image/jpeg")}
        up = client.post(
            f"/api/photos/parent-upload/parent/{parent.parent_id}?parent_id={parent.parent_id}",
            files=fichier, headers=parent_headers,
        )
        assert up.status_code == 200, up.text

        pending = db.query(PhotoEnAttente).filter_by(
            entity_type="parent", entity_id=parent.parent_id, statut="EN_ATTENTE",
        ).first()
        assert pending is not None

        val = client.post(f"/api/photos/validate/{pending.photo_id}", headers=admin_headers)
        assert val.status_code == 200, val.text
        db.refresh(parent)
        assert parent.photo_url

    def test_modifier_photo_deja_validee_produit_une_url_differente(self, client: TestClient, db: Session):
        """Régression : le nom de fichier final était stable
        (`{type}_{id}.ext`) — en modifiant une photo déjà validée, la
        nouvelle image portait exactement la même URL que l'ancienne, et le
        navigateur affichait la version mise en cache (l'ancienne),
        donnant l'impression qu'aucune modification n'avait eu lieu
        ("je valide mais rien ne se passe"). Vérifie que deux validations
        successives du même élève produisent deux URLs distinctes."""
        a = Ecole(db, "PMU")
        eleve, _ = a.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        def _upload_et_valider(contenu: bytes) -> str:
            fichier = {"fichier": ("photo.jpg", io.BytesIO(contenu), "image/jpeg")}
            up = client.post(f"/api/photos/upload/eleve/{eleve.eleve_id}", files=fichier, headers=headers)
            assert up.status_code == 200, up.text
            pending = db.query(PhotoEnAttente).filter_by(
                entity_type="eleve", entity_id=eleve.eleve_id, statut="EN_ATTENTE",
            ).first()
            assert pending is not None
            val = client.post(f"/api/photos/validate/{pending.photo_id}", headers=headers)
            assert val.status_code == 200, val.text
            db.refresh(eleve)
            return eleve.photo_url

        url_1 = _upload_et_valider(b"\xff\xd8\xff\xe0fake-jpeg-bytes-v1")
        url_2 = _upload_et_valider(b"\xff\xd8\xff\xe0fake-jpeg-bytes-v2")
        assert url_1 and url_2
        assert url_1 != url_2


# ══════════════════════════════════════════════════════════════
# DEVOIRS
# ══════════════════════════════════════════════════════════════

class TestDevoirsIsolation:
    def test_liste_enseignant_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "DEA"), Ecole(db, "DEB")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/devoirs/enseignant/{b.enseignant.enseignant_id}", headers=headers)
        assert resp.status_code == 404

    def test_supprimer_devoir_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "DSA"), Ecole(db, "DSB")
        devoir_b = b.devoir(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/devoirs/{devoir_b.devoir_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(Devoir).filter(Devoir.devoir_id == devoir_b.devoir_id).first() is not None

    def test_enseignant_ne_peut_pas_lister_devoirs_dun_collegue(self, client: TestClient, db: Session):
        a = Ecole(db, "DCA")
        collegue = Enseignant(
            etablissement_id=a.etab.etablissement_id, matricule=f"L9CC-{_uid()}",
            nom="Sow", prenom="Ibrahima", sexe="M", telephone=f"60400{_uid():04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(collegue); db.commit(); db.refresh(collegue)
        headers = _headers(client, a.enseignant.matricule)

        resp = client.get(f"/api/devoirs/enseignant/{collegue.enseignant_id}", headers=headers)
        assert resp.status_code == 403

    def test_parent_ne_peut_pas_voir_devoirs_dun_autre_parent(self, client: TestClient, db: Session):
        a = Ecole(db, "DPA")
        eleve, _ = a.eleve_inscrit(db)
        parent1 = a.parent_de(db, eleve)
        eleve2, _ = a.eleve_inscrit(db)
        parent2 = a.parent_de(db, eleve2)
        headers = _headers(client, parent1.telephone_1)

        resp = client.get(f"/api/devoirs/parent/{parent2.parent_id}", headers=headers)
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════
# FOURNITURES / VIE SCOLAIRE / ÉVÉNEMENTS / ACTIVITÉS
# ══════════════════════════════════════════════════════════════

class TestFournituresIsolation:
    def test_liste_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "FLA"), Ecole(db, "FLB")
        f_a, f_b = a.fourniture(db), b.fourniture(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/fournitures", headers=headers)
        assert resp.status_code == 200
        ids = {f["fourniture_id"] for f in resp.json()}
        assert f_a.fourniture_id in ids and f_b.fourniture_id not in ids

    def test_delete_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "FDA"), Ecole(db, "FDB")
        f_b = b.fourniture(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/fournitures/{f_b.fourniture_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(FournitureScolaire).filter(
            FournitureScolaire.fourniture_id == f_b.fourniture_id
        ).first() is not None

    def test_create_rattache_a_la_bonne_ecole(self, client: TestClient, db: Session):
        """Le modèle avait un default=1 qui rattachait tout à l'école 1."""
        a = Ecole(db, "FCA")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/fournitures",
            json={"nom": f"Stylo {_uid()}", "categorie": "MATERIEL", "quantite": 2},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(FournitureScolaire).filter(
            FournitureScolaire.fourniture_id == resp.json()["fourniture_id"]
        ).first()
        assert cree.etablissement_id == a.etab.etablissement_id


class TestVieScolaireIsolation:
    def test_presences_isolees(self, client: TestClient, db: Session):
        a, b = Ecole(db, "VPA"), Ecole(db, "VPB")
        _, insc_b = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get(f"/api/vie-scolaire/presences?classe_id={b.classe.classe_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_batch_presences_inscription_autre_ecole_refuse(self, client: TestClient, db: Session):
        a, b = Ecole(db, "VBA"), Ecole(db, "VBB")
        _, insc_b = b.eleve_inscrit(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/vie-scolaire/presences/batch",
            json=[{
                "inscription_id": insc_b.inscription_id, "date_presence": "2026-01-15",
                "demi_journee": "MATIN", "statut_presence": "ABSENT",
            }],
            headers=headers,
        )
        assert resp.status_code == 404

    def test_incidents_isoles(self, client: TestClient, db: Session):
        a, b = Ecole(db, "VIA"), Ecole(db, "VIB")
        eleve_b, _ = b.eleve_inscrit(db)
        inc_b = b.incident(db, eleve_b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/vie-scolaire/incidents", headers=headers)
        assert resp.status_code == 200
        assert all(i["incident_id"] != inc_b.incident_id for i in resp.json())

    def test_traiter_incident_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "VTA"), Ecole(db, "VTB")
        eleve_b, _ = b.eleve_inscrit(db)
        inc_b = b.incident(db, eleve_b)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.put(
            f"/api/vie-scolaire/incidents/{inc_b.incident_id}/traiter?decision=OK&traite_par=X",
            headers=headers,
        )
        assert resp.status_code == 404
        db.refresh(inc_b)
        assert inc_b.statut == "OUVERT"


class TestEvenementsActivitesIsolation:
    def test_evenements_liste_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ELA"), Ecole(db, "ELB")
        e_a, e_b = a.evenement(db), b.evenement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/evenements", headers=headers)
        assert resp.status_code == 200
        ids = {e["evenement_id"] for e in resp.json()}
        assert e_a.evenement_id in ids and e_b.evenement_id not in ids

    def test_evenement_delete_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EDA"), Ecole(db, "EDB")
        e_b = b.evenement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.delete(f"/api/evenements/{e_b.evenement_id}", headers=headers)
        assert resp.status_code == 404
        assert db.query(Evenement).filter(Evenement.evenement_id == e_b.evenement_id).first() is not None

    def test_evenement_publier_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "EPA"), Ecole(db, "EPB")
        e_b = b.evenement(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/evenements/{e_b.evenement_id}/publier", headers=headers)
        assert resp.status_code == 404
        db.refresh(e_b)
        assert e_b.statut == "BROUILLON"

    def test_activites_liste_isolee(self, client: TestClient, db: Session):
        a, b = Ecole(db, "ALA"), Ecole(db, "ALB")
        act_a, act_b = a.activite(db), b.activite(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.get("/api/activites", headers=headers)
        assert resp.status_code == 200
        ids = {x["activite_id"] for x in resp.json()}
        assert act_a.activite_id in ids and act_b.activite_id not in ids

    def test_activite_publier_cross_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "APUA"), Ecole(db, "APUB")
        act_b = b.activite(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(f"/api/activites/{act_b.activite_id}/publier", headers=headers)
        assert resp.status_code == 404
        db.refresh(act_b)
        assert act_b.est_actif == "N"

    def test_activite_create_rattachee_a_la_bonne_ecole(self, client: TestClient, db: Session):
        a = Ecole(db, "ACA")
        headers = _headers(client, a.admin.nom_utilisateur)

        resp = client.post(
            "/api/activites",
            json={"titre": f"Sortie {_uid()}", "date_activite": "2026-03-01"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        cree = db.query(ActiviteJour).filter(ActiviteJour.activite_id == resp.json()["activite_id"]).first()
        assert cree.etablissement_id == a.etab.etablissement_id


class TestSuperAdminPlateformeRefuse:
    def test_super_admin_sans_etablissement_refuse_403(self, client: TestClient, db: Session):
        uid = _uid()
        admin = Utilisateur(
            nom="Super", prenom="Admin", nom_utilisateur=f"l9c.super.{uid}",
            email=f"l9c.super.{uid}@smartschool.gn", telephone=f"60500{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="SUPER_ADMIN", statut="ACTIF",
            etablissement_id=None,
        )
        db.add(admin); db.commit()
        headers = _headers(client, admin.nom_utilisateur)

        assert client.get("/api/fournitures", headers=headers).status_code == 403
        assert client.get("/api/evenements", headers=headers).status_code == 403
        assert client.get("/api/photos/galerie/meta", headers=headers).status_code == 403
