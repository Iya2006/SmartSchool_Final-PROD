"""
Tests — corriger une facture émise par erreur, par une remise.

Une école se trompe : mauvais tarif appliqué, élève exonéré oublié, frais
facturé deux fois. Il faut pouvoir corriger. Mais écraser le montant d'origine
effacerait la trace de l'erreur, et une facture dont le montant a changé sans
explication est une facture que personne ne peut plus justifier devant un
parent. La remise dit les deux choses : ce qui était dû, et ce qu'on a décidé
de ne pas réclamer, avec le motif.

**Le test qui compte le plus ici est le refus du trop-perçu.** Si une remise
pouvait ramener le montant dû sous ce que la famille a déjà versé, on
fabriquerait une dette de l'école envers le parent que rien ne signalerait et
que personne ne rembourserait. Dans ce cas, il faut d'abord annuler le
versement en trop.

Le second test qui compte est l'équilibre du journal : une correction qui
déséquilibre la comptabilité générale est pire que l'erreur qu'elle corrige.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    LigneEcriture, Niveau, TypeFrais, Utilisateur,
)

SCOLARITE = 300_000
_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"REMI-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANR{uid}", libelle="2026-2027",
        date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CYR{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVR{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLR{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    tf = TypeFrais(
        etablissement_id=eid, code=f"SCR{uid}", libelle="Scolarité", categorie="SCOLARITE",
        montant_defaut=SCOLARITE, est_obligatoire="O", statut="ACTIF",
    )
    db.add(tf); db.commit(); db.refresh(tf)

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.remi.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    return {"eid": eid, "annee": annee, "classe": classe, "frais": tf, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _eleve_facture(db, ecole, montant=SCOLARITE):
    uid = _uid()
    el = Eleve(
        etablissement_id=ecole["eid"], matricule=f"REMI-{uid}", nom="Camara", prenom="Fatou",
        sexe="F", statut="ACTIF",
    )
    db.add(el); db.commit(); db.refresh(el)
    insc = Inscription(
        eleve_id=el.eleve_id, classe_id=ecole["classe"].classe_id,
        annee_id=ecole["annee"].annee_id, statut="ACTIVE", type_inscription="NOUVELLE",
    )
    db.add(insc); db.commit(); db.refresh(insc)
    f = Facture(
        inscription_id=insc.inscription_id, annee_id=ecole["annee"].annee_id,
        type_frais_id=ecole["frais"].type_frais_id,
        numero_facture=f"FAC-REMI-{uid}",
        montant_total=montant, montant_remise=0, montant_net=montant,
        montant_paye=0, montant_restant=montant, statut="EN_ATTENTE",
    )
    db.add(f); db.commit(); db.refresh(f)
    return el, f


def _remise(client, headers, facture_id, montant, motif="Mauvais tarif applique"):
    return client.put(
        f"/api/finance/factures/{facture_id}/remise",
        headers=headers,
        json={"montant_remise": montant, "motif": motif},
    )


class TestRemiseDiminueCeQuiEstDu:

    def test_une_remise_baisse_le_reste_a_payer(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        r = _remise(client, h, f.facture_id, 100_000)
        assert r.status_code == 200, r.text
        corps = r.json()

        assert corps["montant_total"] == SCOLARITE
        assert corps["montant_remise"] == 100_000
        assert corps["montant_net"] == 200_000
        assert corps["montant_restant"] == 200_000
        assert corps["statut"] == "EN_ATTENTE"

        db.refresh(f)
        assert float(f.montant_net) == 200_000
        assert float(f.montant_total) == SCOLARITE, "Le montant d'origine doit rester lisible"

    def test_une_facture_entierement_erronee_tombe_a_zero(self, client, db, ecole):
        """Sans trou dans le journal : la ligne reste, le dû disparaît."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        r = _remise(client, h, f.facture_id, SCOLARITE, motif="Frais facture deux fois")
        assert r.status_code == 200, r.text
        assert r.json()["montant_restant"] == 0
        assert r.json()["statut"] == "PAYEE"

        db.refresh(f)
        assert float(f.montant_total) == SCOLARITE
        assert float(f.montant_net) == 0

    def test_une_remise_partielle_apres_un_versement(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        p = client.post("/api/finance/paiements", headers=h, json={
            "facture_id": f.facture_id, "montant": 100_000, "mode_paiement": "ESPECES",
        })
        assert p.status_code == 201, p.text

        r = _remise(client, h, f.facture_id, 50_000)
        assert r.status_code == 200, r.text
        assert r.json()["montant_net"] == 250_000
        assert r.json()["montant_restant"] == 150_000
        assert r.json()["statut"] == "PARTIELLEMENT_PAYEE"

    def test_la_remise_se_voit_dans_l_encaissement_par_classe(self, client, db, ecole):
        """Corriger la facture doit corriger ce que le caissier voit à l'écran."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        _remise(client, h, f.facture_id, 120_000)

        situation = client.get(
            f"/api/finance/classe/{ecole['classe'].classe_id}/situation-encaissement"
            f"?annee_id={ecole['annee'].annee_id}",
            headers=h,
        ).json()
        ligne = situation["eleves"][0]["frais"][0]
        assert ligne["montant_du"] == 180_000
        assert ligne["reste"] == 180_000


class TestLesGardeFous:

    def test_une_remise_ne_peut_pas_creer_un_trop_percu(self, client, db, ecole):
        """
        Le garde-fou central. La famille a versé 250 000 : ramener le dû à
        100 000 lui devrait 150 000 que rien ne signalerait et que personne ne
        rembourserait. On refuse, et on dit quoi faire à la place.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        client.post("/api/finance/paiements", headers=h, json={
            "facture_id": f.facture_id, "montant": 250_000, "mode_paiement": "ESPECES",
        })

        r = _remise(client, h, f.facture_id, 200_000)
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert "trop-perçu" in detail
        assert "annulez" in detail.lower(), "Le message doit indiquer la sortie : annuler le versement en trop"

        db.refresh(f)
        assert float(f.montant_remise or 0) == 0, "Une remise refusée ne doit rien modifier"
        assert float(f.montant_net) == SCOLARITE

    def test_une_remise_superieure_au_montant_facture_est_refusee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        r = _remise(client, h, f.facture_id, SCOLARITE + 1)
        assert r.status_code == 400
        assert "dépasse" in r.json()["detail"]

    def test_une_remise_negative_est_refusee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        assert _remise(client, h, f.facture_id, -5_000).status_code == 400

    def test_le_motif_est_obligatoire(self, client, db, ecole):
        """Sans motif, la correction n'est plus justifiable six mois plus tard."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        r = _remise(client, h, f.facture_id, 50_000, motif="  ")
        assert r.status_code == 400
        assert "motif" in r.json()["detail"].lower()

    def test_la_facture_d_une_autre_ecole_est_introuvable(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)

        uid = _uid()
        autre = Etablissement(code=f"REMIX-{uid}", nom="Autre", type_etablissement="COLLEGE")
        db.add(autre); db.commit(); db.refresh(autre)
        a_an = AnneeScolaire(
            etablissement_id=autre.etablissement_id, code=f"ANX{uid}", libelle="2026-2027",
            date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
            est_courante="O", statut="EN_COURS",
        )
        db.add(a_an); db.commit(); db.refresh(a_an)
        a_cy = Cycle(etablissement_id=autre.etablissement_id, code=f"CYX{uid}", libelle="C", ordre=1)
        db.add(a_cy); db.commit(); db.refresh(a_cy)
        a_nv = Niveau(cycle_id=a_cy.cycle_id, code=f"NVX{uid}", libelle="N", ordre=1)
        db.add(a_nv); db.commit(); db.refresh(a_nv)
        a_cl = Classe(
            etablissement_id=autre.etablissement_id, annee_id=a_an.annee_id,
            niveau_id=a_nv.niveau_id, code=f"CLX{uid}", libelle="X",
            capacite_max=10, effectif_actuel=0, statut="ACTIVE",
        )
        db.add(a_cl); db.commit(); db.refresh(a_cl)
        a_el = Eleve(
            etablissement_id=autre.etablissement_id, matricule=f"REMIX-{uid}",
            nom="Autre", prenom="Eleve", sexe="M", statut="ACTIF",
        )
        db.add(a_el); db.commit(); db.refresh(a_el)
        a_in = Inscription(
            eleve_id=a_el.eleve_id, classe_id=a_cl.classe_id,
            annee_id=a_an.annee_id, statut="ACTIVE", type_inscription="NOUVELLE",
        )
        db.add(a_in); db.commit(); db.refresh(a_in)
        a_fa = Facture(
            inscription_id=a_in.inscription_id, annee_id=a_an.annee_id,
            numero_facture=f"FAC-REMIX-{uid}",
            montant_total=SCOLARITE, montant_remise=0, montant_net=SCOLARITE,
            montant_paye=0, montant_restant=SCOLARITE, statut="EN_ATTENTE",
        )
        db.add(a_fa); db.commit(); db.refresh(a_fa)

        assert _remise(client, h, a_fa.facture_id, 10_000).status_code == 404

        db.refresh(a_fa)
        assert float(a_fa.montant_net) == SCOLARITE


class TestComptabilite:

    def test_le_journal_reste_equilibre(self, client, db, ecole):
        """
        Une correction qui déséquilibre la comptabilité générale est pire que
        l'erreur qu'elle corrige : plus aucun état n'est utilisable.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        assert _remise(client, h, f.facture_id, 75_000).status_code == 200

        lignes = db.query(LigneEcriture).filter(
            LigneEcriture.description == f.numero_facture
        ).all()
        assert lignes, "La remise doit laisser une trace au journal"
        debit = sum(float(l.debit or 0) for l in lignes)
        credit = sum(float(l.credit or 0) for l in lignes)
        assert round(debit, 2) == round(credit, 2), f"débit {debit} ≠ crédit {credit}"

    def test_une_remise_corrigee_n_ecrit_que_l_ecart(self, client, db, ecole):
        """
        Rejouer l'écriture entière à chaque correction gonflerait le journal de
        mouvements qui n'ont jamais eu lieu. On n'écrit que la différence.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        assert _remise(client, h, f.facture_id, 100_000).status_code == 200
        r = _remise(client, h, f.facture_id, 130_000, motif="Remise revue a la hausse")
        assert r.status_code == 200, r.text
        assert r.json()["montant_net"] == 170_000

        lignes = db.query(LigneEcriture).filter(
            LigneEcriture.description == f.numero_facture
        ).all()
        total_debit = sum(float(l.debit or 0) for l in lignes)
        # 100 000 puis l'écart de 30 000 — jamais 100 000 + 130 000.
        assert round(total_debit, 2) == 130_000, (
            f"Le journal doit porter 100 000 + 30 000, reçu {total_debit}"
        )

    def test_reappliquer_la_meme_remise_ne_fait_rien(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        assert _remise(client, h, f.facture_id, 60_000).status_code == 200
        avant = db.query(LigneEcriture).filter(
            LigneEcriture.description == f.numero_facture
        ).count()

        r = _remise(client, h, f.facture_id, 60_000)
        assert r.status_code == 200
        assert "déjà" in r.json()["message"]

        apres = db.query(LigneEcriture).filter(
            LigneEcriture.description == f.numero_facture
        ).count()
        assert apres == avant, "Aucune écriture ne doit s'ajouter pour un changement nul"

    def test_diminuer_une_remise_remet_la_creance(self, client, db, ecole):
        """L'école s'est montrée trop généreuse : elle doit pouvoir revenir."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, f = _eleve_facture(db, ecole)

        assert _remise(client, h, f.facture_id, 150_000).status_code == 200
        r = _remise(client, h, f.facture_id, 40_000, motif="Remise accordee par erreur")
        assert r.status_code == 200, r.text
        assert r.json()["montant_net"] == 260_000
        assert r.json()["montant_restant"] == 260_000

        lignes = db.query(LigneEcriture).filter(
            LigneEcriture.description == f.numero_facture
        ).all()
        debit = sum(float(l.debit or 0) for l in lignes)
        credit = sum(float(l.credit or 0) for l in lignes)
        assert round(debit, 2) == round(credit, 2), "Le journal reste équilibré même en marche arrière"
