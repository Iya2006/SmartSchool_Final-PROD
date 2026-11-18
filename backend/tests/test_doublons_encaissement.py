"""
Tests — corriger un encaissement saisi plusieurs fois.

Un double-clic sur « Encaisser » produit deux versements, un triple-clic
trois. L'argent n'a été reçu qu'une fois : la caisse et le solde de l'élève
sont alors faux. Jusqu'ici, l'école devait retrouver chaque reçu facture par
facture et les annuler un par un — en pratique, elle ne le faisait pas, et
les comptes restaient faux.

Deux tests pèsent plus que les autres :

- **La détection ne marque jamais le premier versement d'un groupe.** Il y a
  bien eu un paiement, et c'est son reçu que la famille détient. Marquer les
  trois conduirait l'école à tout annuler et à perdre un encaissement réel.
- **L'annulation en lot est tout ou rien.** Un lot à moitié passé laisserait
  une caisse impossible à rapprocher, et l'école sans savoir lesquels
  reprendre.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    LigneEcriture, Niveau, Paiement, TypeFrais, Utilisateur,
)

SCOLARITE = 300_000
_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"DBL-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"AND{uid}", libelle="2026-2027",
        date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CYD{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVD{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLD{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    tf = TypeFrais(
        etablissement_id=eid, code=f"SCD{uid}", libelle="Scolarité", categorie="SCOLARITE",
        montant_defaut=SCOLARITE, est_obligatoire="O", statut="ACTIF",
    )
    db.add(tf); db.commit(); db.refresh(tf)

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.dbl.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return {"eid": eid, "annee": annee, "classe": classe, "frais": tf, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _eleve_facture(db, ecole, montant=SCOLARITE, avec_tarif=True):
    uid = _uid()
    el = Eleve(
        etablissement_id=ecole["eid"], matricule=f"DBL-{uid}", nom="Sow", prenom="Mariama",
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
        type_frais_id=ecole["frais"].type_frais_id if avec_tarif else None,
        numero_facture=f"FAC-DBL-{uid}",
        montant_total=montant, montant_remise=0, montant_net=montant,
        montant_paye=0, montant_restant=montant, statut="EN_ATTENTE",
    )
    db.add(f); db.commit(); db.refresh(f)
    return el, f


def _encaisser(client, headers, facture_id, montant):
    r = client.post("/api/finance/paiements", headers=headers, json={
        "facture_id": facture_id, "montant": montant, "mode_paiement": "ESPECES",
    })
    assert r.status_code == 201, r.text
    return r.json()["paiement_id"]


def _versements(client, headers, eleve_id):
    r = client.get(f"/api/finance/eleve/{eleve_id}/versements", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _annuler_lot(client, headers, ids, motif="Triple clic lors de l encaissement par classe"):
    return client.post("/api/finance/paiements/annuler-en-lot", headers=headers,
                       json={"paiement_ids": ids, "motif": motif})


class TestDetectionDesDoublons:

    def test_trois_clics_laissent_deux_doublons_reperes(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        el, f = _eleve_facture(db, ecole)
        for _ in range(3):
            _encaisser(client, h, f.facture_id, 100_000)

        vue = _versements(client, h, el.eleve_id)
        assert vue["nb_versements"] == 3
        assert vue["total_paye"] == 300_000
        assert vue["total_doublons_probables"] == 200_000

        marques = [v["doublon_probable"] for v in vue["versements"]]
        assert marques == [False, True, True], (
            "Le premier versement a bien eu lieu : il ne doit jamais être marqué"
        )
        assert all(v["nb_identiques"] == 3 for v in vue["versements"])

    def test_des_montants_differents_ne_sont_pas_des_doublons(self, client, db, ecole):
        """Deux versements réels le même jour : acompte puis complément."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        el, f = _eleve_facture(db, ecole)
        _encaisser(client, h, f.facture_id, 100_000)
        _encaisser(client, h, f.facture_id, 50_000)

        vue = _versements(client, h, el.eleve_id)
        assert vue["total_doublons_probables"] == 0
        assert not any(v["doublon_probable"] for v in vue["versements"])

    def test_la_vue_donne_le_tarif_et_le_numero_de_recu(self, client, db, ecole):
        """Sans eux, l'école ne peut pas reconnaître le reçu à annuler."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        el, f = _eleve_facture(db, ecole)
        _encaisser(client, h, f.facture_id, 100_000)

        v = _versements(client, h, el.eleve_id)["versements"][0]
        assert v["tarif"] == "Scolarité"
        assert v["numero_recu"]
        assert v["numero_facture"] == f.numero_facture

    def test_une_vente_sans_tarif_reste_visible(self, client, db, ecole):
        """
        Une jointure stricte sur le type de frais ferait disparaître ces
        versements — donc le doublon qu'on cherche justement à corriger.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        el, f = _eleve_facture(db, ecole, avec_tarif=False)
        _encaisser(client, h, f.facture_id, 20_000)
        _encaisser(client, h, f.facture_id, 20_000)

        vue = _versements(client, h, el.eleve_id)
        assert vue["nb_versements"] == 2
        assert vue["total_doublons_probables"] == 20_000


class TestAnnulationEnLot:

    def test_annuler_les_doublons_corrige_le_solde(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        el, f = _eleve_facture(db, ecole)
        ids = [_encaisser(client, h, f.facture_id, 100_000) for _ in range(3)]

        r = _annuler_lot(client, h, ids[1:])
        assert r.status_code == 200, r.text
        assert r.json()["nb_annules"] == 2
        assert r.json()["total_annule"] == 200_000

        db.refresh(f)
        assert float(f.montant_paye) == 100_000
        assert float(f.montant_restant) == 200_000
        assert f.statut == "PARTIELLEMENT_PAYEE"

        vue = _versements(client, h, el.eleve_id)
        assert vue["nb_versements"] == 1, "Les reçus annulés ne doivent plus compter"
        assert vue["total_paye"] == 100_000

    def test_les_recus_annules_restent_lisibles_avec_leur_motif(self, client, db, ecole):
        """On ne fait jamais disparaître une pièce dont un parent a l'original."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _el, f = _eleve_facture(db, ecole)
        ids = [_encaisser(client, h, f.facture_id, 50_000) for _ in range(2)]

        assert _annuler_lot(client, h, [ids[1]], motif="Doublon de saisie").status_code == 200

        annule = db.query(Paiement).filter(Paiement.paiement_id == ids[1]).first()
        assert annule is not None
        assert annule.statut == "ANNULE"
        assert annule.motif_annulation == "Doublon de saisie"
        assert annule.numero_recu, "Le numéro de reçu reste"

    def test_rien_n_est_annule_si_une_ligne_du_lot_echoue(self, client, db, ecole):
        """
        Tout ou rien. Un lot à moitié passé laisserait une caisse qu'on ne
        peut plus rapprocher.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _el, f = _eleve_facture(db, ecole)
        ids = [_encaisser(client, h, f.facture_id, 100_000) for _ in range(2)]

        # Le second identifiant n'existe pas : le lot entier doit être refusé.
        r = _annuler_lot(client, h, [ids[0], 9_999_999])
        assert r.status_code == 404

        db.refresh(f)
        assert float(f.montant_paye) == 200_000, "Le premier ne devait pas être annulé"
        assert db.query(Paiement).filter(
            Paiement.paiement_id == ids[0], Paiement.statut == "VALIDE"
        ).count() == 1

    def test_un_recu_deja_annule_fait_refuser_le_lot(self, client, db, ecole):
        """
        Refus explicite plutôt que silence : si l'écran de l'école n'est plus
        à jour, le reste de sa sélection est peut-être faux aussi.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _el, f = _eleve_facture(db, ecole)
        ids = [_encaisser(client, h, f.facture_id, 100_000) for _ in range(3)]

        assert _annuler_lot(client, h, [ids[2]]).status_code == 200
        r = _annuler_lot(client, h, [ids[1], ids[2]])
        assert r.status_code == 400
        assert "déjà annulé" in r.json()["detail"]

        db.refresh(f)
        assert float(f.montant_paye) == 200_000, "Le lot refusé ne doit rien changer"

    def test_le_motif_est_obligatoire(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _el, f = _eleve_facture(db, ecole)
        pid = _encaisser(client, h, f.facture_id, 100_000)

        r = _annuler_lot(client, h, [pid], motif=" ")
        assert r.status_code == 400
        assert "motif" in r.json()["detail"].lower()

    def test_une_selection_vide_est_refusee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        assert _annuler_lot(client, h, []).status_code == 400

    def test_le_journal_reste_equilibre(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _el, f = _eleve_facture(db, ecole)
        ids = [_encaisser(client, h, f.facture_id, 100_000) for _ in range(3)]
        recus = {
            p.numero_recu for p in db.query(Paiement).filter(Paiement.paiement_id.in_(ids)).all()
        }

        assert _annuler_lot(client, h, ids[1:]).status_code == 200

        lignes = db.query(LigneEcriture).filter(LigneEcriture.description.in_(recus)).all()
        debit = sum(float(l.debit or 0) for l in lignes)
        credit = sum(float(l.credit or 0) for l in lignes)
        assert round(debit, 2) == round(credit, 2), f"débit {debit} ≠ crédit {credit}"

    def test_le_versement_d_une_autre_ecole_est_introuvable(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)

        uid = _uid()
        autre = Etablissement(code=f"DBLX-{uid}", nom="Autre", type_etablissement="COLLEGE")
        db.add(autre); db.commit(); db.refresh(autre)
        a_an = AnneeScolaire(
            etablissement_id=autre.etablissement_id, code=f"ANW{uid}", libelle="2026-2027",
            date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
            est_courante="O", statut="EN_COURS",
        )
        db.add(a_an); db.commit(); db.refresh(a_an)
        a_cy = Cycle(etablissement_id=autre.etablissement_id, code=f"CYW{uid}", libelle="C", ordre=1)
        db.add(a_cy); db.commit(); db.refresh(a_cy)
        a_nv = Niveau(cycle_id=a_cy.cycle_id, code=f"NVW{uid}", libelle="N", ordre=1)
        db.add(a_nv); db.commit(); db.refresh(a_nv)
        a_cl = Classe(
            etablissement_id=autre.etablissement_id, annee_id=a_an.annee_id,
            niveau_id=a_nv.niveau_id, code=f"CLW{uid}", libelle="X",
            capacite_max=10, effectif_actuel=0, statut="ACTIVE",
        )
        db.add(a_cl); db.commit(); db.refresh(a_cl)
        a_el = Eleve(
            etablissement_id=autre.etablissement_id, matricule=f"DBLX-{uid}",
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
            numero_facture=f"FAC-DBLX-{uid}",
            montant_total=100_000, montant_remise=0, montant_net=100_000,
            montant_paye=100_000, montant_restant=0, statut="PAYEE",
        )
        db.add(a_fa); db.commit(); db.refresh(a_fa)
        a_pa = Paiement(
            facture_id=a_fa.facture_id, annee_id=a_an.annee_id,
            numero_recu=f"REC-DBLX-{uid}", date_paiement=date.today(),
            montant=100_000, mode_paiement="ESPECES", statut="VALIDE",
        )
        db.add(a_pa); db.commit(); db.refresh(a_pa)

        assert _annuler_lot(client, h, [a_pa.paiement_id]).status_code == 404
        db.refresh(a_pa)
        assert a_pa.statut == "VALIDE", "Le versement d'une autre école ne doit pas bouger"

        assert client.get(
            f"/api/finance/eleve/{a_el.eleve_id}/versements", headers=h
        ).status_code == 404
