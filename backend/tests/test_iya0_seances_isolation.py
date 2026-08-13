"""
Tests — IYA0 (séances pédagogiques) : la présence par cours n'est plus
mélangée entre matières, et reste isolée par établissement/enseignant.

Scénario central visé par ce chantier : un enseignant qui enseigne
plusieurs matières à la même classe (ex. Maths + Dessin en 7e A) ne pouvait
faire qu'un seul appel par demi-journée — le second écrasait silencieusement
le premier (Presence n'avait pas de matière/séance). Ce fichier vérifie que
ce n'est plus le cas, sans rien casser des données/chemins d'écriture
historiques (seance_id=NULL).
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    Affectation, AnneeScolaire, Classe, CreneauEmploi, Cycle, Enseignant,
    Etablissement, Eleve, Inscription, Matiere, Niveau, Presence, Seance,
    Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


# Un jour de semaine fixe (lundi) pour que les créneaux LUNDI générés
# matchent toujours la date utilisée dans les tests, quel que soit le jour
# réel d'exécution de la suite.
_PROCHAIN_LUNDI = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)


class Ecole:
    """École complète : établissement, année, classe, 2 matières, 1
    enseignant affecté aux deux matières de la classe (le cas central du
    chantier), 1 admin, 1 élève inscrit."""

    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(code=f"IYA0-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE")
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Secondaire", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="7e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"7e A {uid}",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.matiere_maths = Matiere(cycle_id=self.cycle.cycle_id, code=f"MATH{uid}", libelle="Mathématiques")
        self.matiere_dessin = Matiere(cycle_id=self.cycle.cycle_id, code=f"DES{uid}", libelle="Dessin")
        db.add_all([self.matiere_maths, self.matiere_dessin]); db.commit()
        db.refresh(self.matiere_maths); db.refresh(self.matiere_dessin)

        self.enseignant = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"IYA0ENS-{uid}",
            nom="Camara", prenom="Ousmane", sexe="M", telephone=f"76000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(self.enseignant); db.commit(); db.refresh(self.enseignant)

        for mat in (self.matiere_maths, self.matiere_dessin):
            db.add(Affectation(
                enseignant_id=self.enseignant.enseignant_id, matiere_id=mat.matiere_id,
                classe_id=self.classe.classe_id, annee_id=self.annee.annee_id, statut="ACTIVE",
            ))
        db.commit()

        # 2 créneaux LUNDI, même classe/enseignant, matières différentes —
        # le cas central du bug corrigé.
        self.creneau_maths = CreneauEmploi(
            classe_id=self.classe.classe_id, matiere_id=self.matiere_maths.matiere_id,
            enseignant_id=self.enseignant.enseignant_id, jour="LUNDI",
            heure_debut="08:00", heure_fin="09:00", annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        self.creneau_dessin = CreneauEmploi(
            classe_id=self.classe.classe_id, matiere_id=self.matiere_dessin.matiere_id,
            enseignant_id=self.enseignant.enseignant_id, jour="LUNDI",
            heure_debut="10:30", heure_fin="11:30", annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add_all([self.creneau_maths, self.creneau_dessin]); db.commit()
        db.refresh(self.creneau_maths); db.refresh(self.creneau_dessin)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"IYA0{uid}", nom_utilisateur=f"iya0.admin.{uid}",
            email=f"iya0.admin.{uid}@smartschool.gn", telephone=f"77000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)

        self.eleve = Eleve(
            etablissement_id=self.etab.etablissement_id, matricule=f"IYA0ELV-{uid}",
            nom="Diallo", prenom="Fatoumata", date_naissance=date(2013, 1, 1), sexe="F", statut="ACTIF",
        )
        db.add(self.eleve); db.commit(); db.refresh(self.eleve)

        self.inscription = Inscription(
            eleve_id=self.eleve.eleve_id, classe_id=self.classe.classe_id,
            annee_id=self.annee.annee_id, statut="ACTIVE",
        )
        db.add(self.inscription); db.commit(); db.refresh(self.inscription)

    def ajouter_enseignant(self, db: Session) -> Enseignant:
        uid = _uid()
        ens = Enseignant(
            etablissement_id=self.etab.etablissement_id, matricule=f"IYA0ENS2-{uid}",
            nom="Bah", prenom="Mariama", sexe="F", telephone=f"78000{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(ens); db.commit(); db.refresh(ens)
        return ens


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _jour():
    return _PROCHAIN_LUNDI.isoformat()


class TestGenerationSeances:
    def test_seances_generees_depuis_creneaux_du_jour(self, client: TestClient, db: Session):
        ecole = Ecole(db, "GEN")
        headers = _headers(client, ecole.enseignant.matricule)

        resp = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        )
        assert resp.status_code == 200, resp.text
        seances = resp.json()
        assert len(seances) == 2
        matieres = {s["matiere"] for s in seances}
        assert matieres == {"Mathématiques", "Dessin"}
        assert all(s["statut"] == "PREVUE" for s in seances)

    def test_generation_idempotente(self, client: TestClient, db: Session):
        ecole = Ecole(db, "IDEM")
        headers = _headers(client, ecole.enseignant.matricule)
        url = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}"

        premier = client.get(url, headers=headers).json()
        second = client.get(url, headers=headers).json()
        assert {s["seance_id"] for s in premier} == {s["seance_id"] for s in second}
        assert db.query(Seance).filter(Seance.classe_id == ecole.classe.classe_id).count() == 2


class TestAppelSeparParMatiere:
    """Le bug central : deux matières, même classe, même enseignant, même
    jour -> deux appels totalement indépendants, aucun écrasement."""

    def test_deux_matieres_appels_distincts(self, client: TestClient, db: Session):
        ecole = Ecole(db, "SEP")
        headers = _headers(client, ecole.enseignant.matricule)
        seances = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        ).json()
        maths = next(s for s in seances if s["matiere"] == "Mathématiques")
        dessin = next(s for s in seances if s["matiere"] == "Dessin")
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances"

        for s in (maths, dessin):
            r = client.post(f"{base}/{s['seance_id']}/commencer", headers=headers)
            assert r.status_code == 200, r.text

        r = client.post(
            f"{base}/{maths['seance_id']}/appel", headers=headers,
            json={"items": [{"inscription_id": ecole.inscription.inscription_id, "statut": "PRESENT"}]},
        )
        assert r.status_code == 200, r.text
        r = client.post(
            f"{base}/{dessin['seance_id']}/appel", headers=headers,
            json={"items": [{"inscription_id": ecole.inscription.inscription_id, "statut": "ABSENT"}]},
        )
        assert r.status_code == 200, r.text

        presences = db.query(Presence).filter(Presence.inscription_id == ecole.inscription.inscription_id).all()
        assert len(presences) == 2, "Les deux appels doivent créer 2 lignes Presence distinctes, pas 1 écrasée"
        par_seance = {p.seance_id: p.statut_presence for p in presences}
        assert par_seance[maths["seance_id"]] == "PRESENT"
        assert par_seance[dessin["seance_id"]] == "ABSENT"

    def test_appel_idempotent_pas_de_doublon(self, client: TestClient, db: Session):
        ecole = Ecole(db, "IDEMAPP")
        headers = _headers(client, ecole.enseignant.matricule)
        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        ).json()[0]
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/{seance['seance_id']}"
        client.post(f"{base}/commencer", headers=headers)

        client.post(f"{base}/appel", headers=headers, json={"items": [{"inscription_id": ecole.inscription.inscription_id, "statut": "PRESENT"}]})
        client.post(f"{base}/appel", headers=headers, json={"items": [{"inscription_id": ecole.inscription.inscription_id, "statut": "RETARD"}]})

        presences = db.query(Presence).filter(Presence.seance_id == seance["seance_id"]).all()
        assert len(presences) == 1
        assert presences[0].statut_presence == "RETARD"

    def test_appel_refuse_inscription_dune_autre_classe(self, client: TestClient, db: Session):
        ecole = Ecole(db, "INTRUS")
        autre = Ecole(db, "INTRUSB")
        headers = _headers(client, ecole.enseignant.matricule)
        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        ).json()[0]
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/{seance['seance_id']}"
        client.post(f"{base}/commencer", headers=headers)

        resp = client.post(f"{base}/appel", headers=headers, json={
            "items": [{"inscription_id": autre.inscription.inscription_id, "statut": "PRESENT"}]
        })
        assert resp.status_code == 400


class TestCycleDeVieSeance:
    def test_cycle_complet_commencer_appel_terminer(self, client: TestClient, db: Session):
        ecole = Ecole(db, "CYCLE")
        headers = _headers(client, ecole.enseignant.matricule)
        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        ).json()[0]
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/{seance['seance_id']}"

        r = client.post(f"{base}/commencer", headers=headers)
        assert r.json()["statut"] == "EN_COURS"

        client.post(f"{base}/appel", headers=headers, json={"items": [{"inscription_id": ecole.inscription.inscription_id, "statut": "PRESENT"}]})

        r = client.post(f"{base}/terminer", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["statut"] == "EFFECTUEE"
        assert r.json()["nb_presents"] == 1
        assert r.json()["nb_absents"] == 0

    def test_terminer_sans_appel_ne_bloque_pas(self, client: TestClient, db: Session):
        ecole = Ecole(db, "NOAPPEL")
        headers = _headers(client, ecole.enseignant.matricule)
        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        ).json()[0]
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/{seance['seance_id']}"
        client.post(f"{base}/commencer", headers=headers)
        r = client.post(f"{base}/terminer", headers=headers)
        assert r.status_code == 200
        assert r.json()["statut"] == "EFFECTUEE"
        assert r.json()["nb_presents"] is None

    def test_annulation_avec_motif(self, client: TestClient, db: Session):
        ecole = Ecole(db, "ANNUL")
        headers = _headers(client, ecole.enseignant.matricule)
        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers,
        ).json()[0]
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/{seance['seance_id']}"

        r = client.put(f"{base}/annuler", headers=headers, json={"motif": "Réunion pédagogique"})
        assert r.status_code == 200
        assert r.json()["statut"] == "ANNULEE"
        assert r.json()["motif_statut"] == "Réunion pédagogique"

        r = client.post(f"{base}/commencer", headers=headers)
        assert r.status_code == 400


class TestPermissions:
    def test_enseignant_ne_peut_pas_agir_sur_seance_dautrui(self, client: TestClient, db: Session):
        ecole = Ecole(db, "AUTRUI")
        autre_ens = ecole.ajouter_enseignant(db)
        headers_proprio = _headers(client, ecole.enseignant.matricule)
        headers_autre = _headers(client, autre_ens.matricule)

        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers_proprio,
        ).json()[0]

        resp = client.post(
            f"/api/portail-enseignant/{autre_ens.enseignant_id}/seances/{seance['seance_id']}/commencer",
            headers=headers_autre,
        )
        assert resp.status_code == 404

    def test_seance_cross_ecole_404_cote_admin(self, client: TestClient, db: Session):
        ecole_a = Ecole(db, "CROSSA")
        ecole_b = Ecole(db, "CROSSB")
        headers_a = _headers(client, ecole_a.enseignant.matricule)
        headers_b_admin = _headers(client, ecole_b.admin.nom_utilisateur)

        seance = client.get(
            f"/api/portail-enseignant/{ecole_a.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers_a,
        ).json()[0]

        resp = client.get(f"/api/seances/{seance['seance_id']}", headers=headers_b_admin)
        assert resp.status_code == 404


class TestDonneesLegacy:
    def test_presences_legacy_seance_id_null_toujours_lisibles(self, client: TestClient, db: Session):
        """Une présence créée par l'ancien chemin (enregistrer_appel, sans
        matière) doit rester intacte et lisible — jamais rattachée à une
        matière inventée."""
        ecole = Ecole(db, "LEGACY")
        db.add(Presence(
            inscription_id=ecole.inscription.inscription_id, date_presence=date.today(),
            demi_journee="MATIN", statut_presence="PRESENT", est_justifie="N",
        ))
        db.commit()

        legacy = db.query(Presence).filter(
            Presence.inscription_id == ecole.inscription.inscription_id, Presence.seance_id.is_(None)
        ).all()
        assert len(legacy) == 1
        assert legacy[0].seance_id is None


class TestAdministration:
    def test_remplacement_enseignant_ne_reecrit_pas_le_prevu(self, client: TestClient, db: Session):
        ecole = Ecole(db, "REMPL")
        remplacant = ecole.ajouter_enseignant(db)
        db.add(Affectation(
            enseignant_id=remplacant.enseignant_id, matiere_id=ecole.matiere_maths.matiere_id,
            classe_id=ecole.classe.classe_id, annee_id=ecole.annee.annee_id, statut="ACTIVE",
        ))
        db.commit()

        headers_ens = _headers(client, ecole.enseignant.matricule)
        headers_admin = _headers(client, ecole.admin.nom_utilisateur)
        seances = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers_ens,
        ).json()
        maths = next(s for s in seances if s["matiere"] == "Mathématiques")

        resp = client.put(
            f"/api/seances/{maths['seance_id']}/remplacer", headers=headers_admin,
            json={"enseignant_remplacant_id": remplacant.enseignant_id, "motif": "Congé maladie"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["enseignant_prevu_id"] == ecole.enseignant.enseignant_id
        assert body["enseignant_reel_id"] == remplacant.enseignant_id
        assert body["statut"] == "REMPLACEE"

    def test_remplacement_refuse_si_pas_affecte(self, client: TestClient, db: Session):
        ecole = Ecole(db, "REMPLKO")
        non_affecte = ecole.ajouter_enseignant(db)
        headers_ens = _headers(client, ecole.enseignant.matricule)
        headers_admin = _headers(client, ecole.admin.nom_utilisateur)
        seances = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers_ens,
        ).json()
        maths = seances[0]

        resp = client.put(
            f"/api/seances/{maths['seance_id']}/remplacer", headers=headers_admin,
            json={"enseignant_remplacant_id": non_affecte.enseignant_id, "motif": "Test"},
        )
        assert resp.status_code == 400

    def test_admin_filtre_par_enseignant_et_matiere(self, client: TestClient, db: Session):
        ecole = Ecole(db, "FILTRE")
        headers_ens = _headers(client, ecole.enseignant.matricule)
        headers_admin = _headers(client, ecole.admin.nom_utilisateur)
        client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers_ens,
        )

        resp = client.get(
            f"/api/seances?enseignant_id={ecole.enseignant.enseignant_id}&matiere_id={ecole.matiere_maths.matiere_id}",
            headers=headers_admin,
        )
        assert resp.status_code == 200
        assert all(s["matiere_id"] == ecole.matiere_maths.matiere_id for s in resp.json())

    def test_historique_eleve_avec_matiere_et_enseignant(self, client: TestClient, db: Session):
        ecole = Ecole(db, "HISTELEVE")
        headers_ens = _headers(client, ecole.enseignant.matricule)
        headers_admin = _headers(client, ecole.admin.nom_utilisateur)
        seance = client.get(
            f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/jour?date={_jour()}",
            headers=headers_ens,
        ).json()[0]
        base = f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/seances/{seance['seance_id']}"
        client.post(f"{base}/commencer", headers=headers_ens)
        client.post(f"{base}/appel", headers=headers_ens, json={"items": [{"inscription_id": ecole.inscription.inscription_id, "statut": "ABSENT"}]})

        resp = client.get(f"/api/seances/eleve/{ecole.eleve.eleve_id}", headers=headers_admin)
        assert resp.status_code == 200
        historique = resp.json()["historique"]
        assert len(historique) == 1
        assert historique[0]["matiere"] in ("Mathématiques", "Dessin")
        assert historique[0]["statut"] == "ABSENT"
