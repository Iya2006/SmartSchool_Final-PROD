"""
Tests — trois demandes de l'école autour de la scolarité, plus le matricule.

1. Un encaissement n'est plus plafonné par le tarif : une école encaisse ce que
   la famille lui remet, y compris au-dessus du montant dû.
2. Un tarif créé pour une classe est facturé à TOUS ses élèves, y compris ceux
   déjà inscrits depuis des mois — sans réimport ni ressaisie.
3. Le matricule peut être saisi par l'école au lieu d'être généré, et modifié
   ensuite ; il reste unique, parce que c'est l'identifiant de connexion de
   l'élève.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, TarifClasse, TypeFrais, Utilisateur,
)

SCOLARITE = 300_000
_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    """Une école avec une classe, deux élèves déjà inscrits, et la scolarité."""
    uid = _uid()
    etab = Etablissement(code=f"STM-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CY{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NV{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CL{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    scolarite = TypeFrais(
        etablissement_id=eid, code=f"SCO{uid}", libelle="Scolarité", categorie="SCOLARITE",
        montant_defaut=0, est_obligatoire="O", statut="ACTIF",
    )
    db.add(scolarite); db.commit(); db.refresh(scolarite)
    db.add(TarifClasse(classe_id=classe.classe_id, type_frais_id=scolarite.type_frais_id, montant=SCOLARITE))

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    # Deux élèves DÉJÀ en place : c'est eux que doit rattraper un tarif créé
    # plus tard dans l'année.
    eleves = []
    for i in range(2):
        el = Eleve(
            etablissement_id=eid, matricule=f"ELV-{uid}-{i}", nom=f"Eleve{i}", prenom="Test",
            sexe="M", statut="ACTIF",
        )
        db.add(el); db.commit(); db.refresh(el)
        insc = Inscription(
            eleve_id=el.eleve_id, classe_id=classe.classe_id, annee_id=annee.annee_id,
            statut="ACTIVE", type_inscription="REINSCRIPTION",
        )
        db.add(insc); db.commit(); db.refresh(insc)
        eleves.append((el, insc))
    db.commit()

    return {
        "etab": etab, "annee": annee, "classe": classe, "admin": admin,
        "scolarite": scolarite, "eleves": eleves, "eid": eid,
    }


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _facturer_scolarite(client, headers, ecole) -> dict:
    """Génère la facture de scolarité de la classe et renvoie la première."""
    r = client.post(
        f"/api/finance/factures/generer-classe",
        headers=headers,
        json={
            "classe_id": ecole["classe"].classe_id,
            "annee_id": ecole["annee"].annee_id,
            "type_frais_id": ecole["scolarite"].type_frais_id,
            "montant": SCOLARITE,
        },
    )
    assert r.status_code == 201, r.text
    liste = client.get(
        f"/api/finance/factures?classe_id={ecole['classe'].classe_id}", headers=headers
    )
    assert liste.status_code == 200, liste.text
    factures = liste.json()
    factures = factures if isinstance(factures, list) else factures.get("items", [])
    assert factures, "aucune facture générée"
    return factures[0]


class TestEncaissementSansPlafond:
    """Le tarif dit ce qui est dû, pas ce qu'on a le droit d'encaisser."""

    def test_encaisse_plus_que_le_tarif(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        facture = _facturer_scolarite(client, h, ecole)

        # 310 000 sur une scolarité de 300 000 : exactement le cas signalé.
        r = client.post("/api/finance/paiements", headers=h, json={
            "facture_id": facture["facture_id"],
            "montant": SCOLARITE + 10_000,
            "mode_paiement": "ESPECES",
        })
        assert r.status_code == 201, r.text
        assert float(r.json()["montant"]) == SCOLARITE + 10_000
        assert r.json()["facture_statut"] == "PAYEE"

    def test_encaisse_encore_sur_une_facture_deja_soldee(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        facture = _facturer_scolarite(client, h, ecole)

        premier = client.post("/api/finance/paiements", headers=h, json={
            "facture_id": facture["facture_id"], "montant": SCOLARITE,
            "mode_paiement": "ESPECES",
        })
        assert premier.status_code == 201, premier.text

        # Facture soldée : un second versement doit quand même entrer en caisse.
        second = client.post("/api/finance/paiements", headers=h, json={
            "facture_id": facture["facture_id"], "montant": 25_000,
            "mode_paiement": "ESPECES",
        })
        assert second.status_code == 201, second.text

    def test_le_reste_a_payer_ne_devient_jamais_negatif(self, client, db, ecole):
        """Sinon les états d'impayés compteraient une dette négative."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        facture = _facturer_scolarite(client, h, ecole)
        client.post("/api/finance/paiements", headers=h, json={
            "facture_id": facture["facture_id"], "montant": SCOLARITE + 50_000,
            "mode_paiement": "ESPECES",
        })
        f = db.query(Facture).filter(Facture.facture_id == facture["facture_id"]).first()
        db.refresh(f)
        assert float(f.montant_restant) == 0
        # Le trop-perçu n'est pas effacé : il reste visible sur le montant payé.
        assert float(f.montant_paye) == SCOLARITE + 50_000

    def test_un_montant_nul_ou_negatif_reste_refuse(self, client, ecole):
        """Lever le plafond ne veut pas dire tout accepter."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        facture = _facturer_scolarite(client, h, ecole)
        r = client.post("/api/finance/paiements", headers=h, json={
            "facture_id": facture["facture_id"], "montant": 0, "mode_paiement": "ESPECES",
        })
        assert r.status_code == 400


class TestNouveauTarifFactureToutLeMonde:
    """« Frais de badge » créé en novembre doit atteindre toute la classe."""

    def _creer_type(self, db, ecole, libelle, categorie="DIVERS", obligatoire="O"):
        tf = TypeFrais(
            etablissement_id=ecole["eid"], code=f"{libelle[:3].upper()}{_uid()}",
            libelle=libelle, categorie=categorie, montant_defaut=0,
            est_obligatoire=obligatoire, statut="ACTIF",
        )
        db.add(tf); db.commit(); db.refresh(tf)
        return tf

    def _factures_du_type(self, db, ecole, type_frais_id):
        return db.query(Facture).join(
            Inscription, Inscription.inscription_id == Facture.inscription_id
        ).filter(
            Inscription.classe_id == ecole["classe"].classe_id,
            Facture.type_frais_id == type_frais_id,
        ).all()

    def test_le_tarif_cree_atteint_les_eleves_deja_inscrits(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        badge = self._creer_type(db, ecole, "Frais de badge")

        r = client.put("/api/finance/tarifs-classe", headers=h, json=[
            {"classe_id": ecole["classe"].classe_id,
             "type_frais_id": badge.type_frais_id, "montant": 25_000},
        ])
        assert r.status_code == 200, r.text

        factures = self._factures_du_type(db, ecole, badge.type_frais_id)
        assert len(factures) == len(ecole["eleves"]), (
            "chaque élève déjà inscrit doit recevoir le nouveau frais"
        )
        assert all(float(f.montant_net) == 25_000 for f in factures)

    def test_reenregistrer_la_grille_ne_cree_pas_de_doublon(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        badge = self._creer_type(db, ecole, "Frais de badge")
        corps = [{"classe_id": ecole["classe"].classe_id,
                  "type_frais_id": badge.type_frais_id, "montant": 25_000}]

        client.put("/api/finance/tarifs-classe", headers=h, json=corps)
        client.put("/api/finance/tarifs-classe", headers=h, json=corps)

        factures = self._factures_du_type(db, ecole, badge.type_frais_id)
        assert len(factures) == len(ecole["eleves"]), "un seul frais par élève"

    def test_un_frais_facultatif_n_est_pas_impose_a_toute_la_classe(self, client, db, ecole):
        """La cantine ne se facture qu'aux familles qui y adhèrent."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cantine = self._creer_type(db, ecole, "Cantine", obligatoire="N")

        r = client.put("/api/finance/tarifs-classe", headers=h, json=[
            {"classe_id": ecole["classe"].classe_id,
             "type_frais_id": cantine.type_frais_id, "montant": 50_000},
        ])
        assert r.status_code == 200, r.text
        assert self._factures_du_type(db, ecole, cantine.type_frais_id) == []


class TestMatricule:
    """Généré par défaut, saisissable par l'école, et toujours unique."""

    def _inscrire(self, client, headers, ecole, nom, matricule=None):
        corps = {
            "nom": nom, "prenom": "Test", "sexe": "M",
            "classe_id": ecole["classe"].classe_id,
            "type_inscription": "NOUVELLE",
        }
        if matricule is not None:
            corps["matricule"] = matricule
        return client.post("/api/eleves/inscription-complete", headers=headers, json=corps)

    def test_sans_saisie_le_matricule_est_genere(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = self._inscrire(client, h, ecole, "SansMatricule")
        assert r.status_code == 201, r.text
        el = db.query(Eleve).filter(Eleve.eleve_id == r.json()["eleve_id"]).first()
        assert el.matricule, "un matricule doit toujours exister : c'est l'identifiant de connexion"

    def test_le_matricule_saisi_est_conserve_tel_quel(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = self._inscrire(client, h, ecole, "AvecMatricule", matricule="ECOLE-2026-0042")
        assert r.status_code == 201, r.text
        el = db.query(Eleve).filter(Eleve.eleve_id == r.json()["eleve_id"]).first()
        assert el.matricule == "ECOLE-2026-0042"

    def test_un_matricule_deja_pris_est_refuse(self, client, ecole):
        """Deux élèves avec le même matricule, c'est l'un qui entre chez l'autre."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        deja = ecole["eleves"][0][0].matricule
        r = self._inscrire(client, h, ecole, "Doublon", matricule=deja)
        assert r.status_code == 409, r.text

    def test_le_matricule_se_modifie_ensuite(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve = ecole["eleves"][0][0]
        r = client.put(f"/api/eleves/{eleve.eleve_id}", headers=h,
                       json={"matricule": "NOUVEAU-001"})
        assert r.status_code == 200, r.text
        db.refresh(eleve)
        assert eleve.matricule == "NOUVEAU-001"

    def test_un_matricule_vide_est_refuse(self, client, ecole):
        """Un élève sans matricule ne peut plus accéder à son espace."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eleve = ecole["eleves"][0][0]
        r = client.put(f"/api/eleves/{eleve.eleve_id}", headers=h, json={"matricule": "   "})
        assert r.status_code == 400, r.text
