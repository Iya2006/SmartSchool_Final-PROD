"""
Tests — l'historique des encaissements dit POUR QUOI et POUR QUI on a payé.

La liste des paiements renvoyait le nom de l'élève et le numéro de reçu, mais
ni sa classe ni le frais concerné — alors que la classe était déjà jointe dans
la requête. Impossible, depuis cet écran, de savoir si un versement couvrait la
scolarité ou la cantine, ni de retrouver les encaissements d'une classe. Il
fallait ouvrir chaque reçu un par un.

Le cas qui mérite un test à lui seul : un encaissement dont la facture ne porte
AUCUN type de frais — une vente libre, ou une facture antérieure aux types de
frais. Avec une jointure stricte, ces paiements disparaîtraient purement et
simplement de l'historique. De l'argent réellement encaissé, invisible.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, Paiement, TypeFrais, Utilisateur,
)

_C = [0]


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"HIS-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANH{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CYH{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVH{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)

    classes = {}
    for code, libelle in [("A", "7e A"), ("B", "7e B")]:
        cl = Classe(
            etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
            code=f"CLH{uid}{code}", libelle=libelle, capacite_max=50,
            effectif_actuel=0, statut="ACTIVE",
        )
        db.add(cl); db.commit(); db.refresh(cl)
        classes[code] = cl

    scolarite = TypeFrais(
        etablissement_id=eid, code=f"SCH{uid}", libelle="Scolarité", categorie="SCOLARITE",
        montant_defaut=0, est_obligatoire="O", statut="ACTIF",
    )
    db.add(scolarite); db.commit(); db.refresh(scolarite)

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.his.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    return {"eid": eid, "annee": annee, "classes": classes,
            "scolarite": scolarite, "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _encaisser(db: Session, ecole, classe_code: str, nom: str, type_frais, montant=50_000):
    """Crée un élève, sa facture et un versement. `type_frais=None` = vente libre."""
    uid = _uid()
    eleve = Eleve(
        etablissement_id=ecole["eid"], matricule=f"HIS-{uid}", nom=nom, prenom="Test",
        sexe="F", statut="ACTIF",
    )
    db.add(eleve); db.commit(); db.refresh(eleve)

    insc = Inscription(
        eleve_id=eleve.eleve_id, classe_id=ecole["classes"][classe_code].classe_id,
        annee_id=ecole["annee"].annee_id, statut="ACTIVE", type_inscription="NOUVELLE",
    )
    db.add(insc); db.commit(); db.refresh(insc)

    facture = Facture(
        inscription_id=insc.inscription_id, annee_id=ecole["annee"].annee_id,
        type_frais_id=type_frais.type_frais_id if type_frais else None,
        numero_facture=f"FAC-HIS-{uid}",
        montant_total=montant, montant_net=montant, montant_paye=montant,
        montant_restant=0, statut="PAYEE",
        description=None if type_frais else "3 cahiers et une règle",
    )
    db.add(facture); db.commit(); db.refresh(facture)

    paiement = Paiement(
        facture_id=facture.facture_id, annee_id=ecole["annee"].annee_id,
        numero_recu=f"REC-HIS-{uid}", montant=montant,
        mode_paiement="ESPECES", statut="VALIDE", date_paiement=date.today(),
    )
    db.add(paiement); db.commit(); db.refresh(paiement)
    return eleve, paiement


class TestHistoriqueDesEncaissements:

    def test_chaque_versement_dit_sa_classe_et_son_tarif(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _encaisser(db, ecole, "A", "Diallo", ecole["scolarite"])

        r = client.get("/api/finance/paiements", headers=h)
        assert r.status_code == 200, r.text
        ligne = next(x for x in r.json() if x["eleve_nom"] == "Diallo")

        assert ligne["classe_libelle"] == "7e A"
        assert ligne["type_frais_libelle"] == "Scolarité"
        assert ligne["matricule"]
        assert ligne["eleve_id"]

    def test_un_encaissement_sans_tarif_reste_visible(self, client, db, ecole):
        """
        Vente libre : la facture ne porte aucun type de frais. Avec une
        jointure stricte, ce versement disparaîtrait de l'historique — de
        l'argent encaissé, invisible.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _encaisser(db, ecole, "A", "Camara", None)

        lignes = client.get("/api/finance/paiements", headers=h).json()
        ligne = next((x for x in lignes if x["eleve_nom"] == "Camara"), None)

        assert ligne is not None, "le versement sans tarif doit rester dans l'historique"
        assert ligne["type_frais_libelle"] is None
        # L'écran retombe sur la description, qui dit ce qui a été acheté.
        assert ligne["description"] == "3 cahiers et une règle"

    def test_filtrer_par_classe(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _encaisser(db, ecole, "A", "EleveDeA", ecole["scolarite"])
        _encaisser(db, ecole, "B", "EleveDeB", ecole["scolarite"])

        classe_a = ecole["classes"]["A"].classe_id
        lignes = client.get(f"/api/finance/paiements?classe_id={classe_a}", headers=h).json()
        noms = {x["eleve_nom"] for x in lignes}

        assert "EleveDeA" in noms
        assert "EleveDeB" not in noms

    def test_recherche_par_nom_toujours_fonctionnelle(self, client, db, ecole):
        """
        Non-régression : la recherche existante ne doit pas être cassée.

        IGNORÉ SOUS SQLITE, et ce n'est pas un contournement de complaisance.
        La recherche insensible aux accents empile une trentaine de `replace()`
        par colonne (voir `app/core/recherche.py`). PostgreSQL, qui tourne en
        production, l'exécute sans difficulté ; SQLite, utilisé par les tests,
        refuse d'analyser une expression aussi profonde et lève
        « parser stack overflow ». Le défaut appartient au moteur de test, pas
        au code — il touche aussi `test_eleves.py::test_recherche_par_nom`,
        bien antérieur à ce lot.
        """
        if db.bind.dialect.name == "sqlite":
            pytest.skip("recherche sans accents : SQLite ne sait pas analyser la requête (OK en PostgreSQL)")

        h = _headers(client, ecole["admin"].nom_utilisateur)
        _encaisser(db, ecole, "A", "Souare", ecole["scolarite"])
        _encaisser(db, ecole, "B", "Kourouma", ecole["scolarite"])

        lignes = client.get("/api/finance/paiements?search=Souare", headers=h).json()
        noms = {x["eleve_nom"] for x in lignes}

        assert "Souare" in noms
        assert "Kourouma" not in noms

    def test_les_encaissements_d_une_autre_ecole_restent_invisibles(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _encaisser(db, ecole, "A", "ChezNous", ecole["scolarite"])

        # Une seconde école, avec son propre encaissement.
        uid = _uid()
        autre = Etablissement(code=f"AUT-{uid}", nom="Autre", type_etablissement="COLLEGE")
        db.add(autre); db.commit(); db.refresh(autre)
        a_annee = AnneeScolaire(
            etablissement_id=autre.etablissement_id, code=f"ANX{uid}", libelle="2025-2026",
            date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
            est_courante="O", statut="EN_COURS",
        )
        db.add(a_annee); db.commit(); db.refresh(a_annee)
        a_cycle = Cycle(etablissement_id=autre.etablissement_id, code=f"CYX{uid}", libelle="C", ordre=1)
        db.add(a_cycle); db.commit(); db.refresh(a_cycle)
        a_niv = Niveau(cycle_id=a_cycle.cycle_id, code=f"NVX{uid}", libelle="N", ordre=1)
        db.add(a_niv); db.commit(); db.refresh(a_niv)
        a_cl = Classe(
            etablissement_id=autre.etablissement_id, annee_id=a_annee.annee_id,
            niveau_id=a_niv.niveau_id, code=f"CLX{uid}", libelle="X", capacite_max=10,
            effectif_actuel=0, statut="ACTIVE",
        )
        db.add(a_cl); db.commit(); db.refresh(a_cl)
        a_el = Eleve(
            etablissement_id=autre.etablissement_id, matricule=f"AUTX-{uid}",
            nom="ChezEux", prenom="T", sexe="M", statut="ACTIF",
        )
        db.add(a_el); db.commit(); db.refresh(a_el)
        a_in = Inscription(
            eleve_id=a_el.eleve_id, classe_id=a_cl.classe_id, annee_id=a_annee.annee_id,
            statut="ACTIVE", type_inscription="NOUVELLE",
        )
        db.add(a_in); db.commit(); db.refresh(a_in)
        a_fa = Facture(
            inscription_id=a_in.inscription_id, annee_id=a_annee.annee_id,
            numero_facture=f"FAC-X-{uid}", montant_total=1, montant_net=1,
            montant_paye=1, montant_restant=0, statut="PAYEE",
        )
        db.add(a_fa); db.commit(); db.refresh(a_fa)
        db.add(Paiement(
            facture_id=a_fa.facture_id, annee_id=a_annee.annee_id,
            numero_recu=f"REC-X-{uid}", montant=1, mode_paiement="ESPECES",
            statut="VALIDE", date_paiement=date.today(),
        ))
        db.commit()

        noms = {x["eleve_nom"] for x in client.get("/api/finance/paiements", headers=h).json()}
        assert "ChezNous" in noms
        assert "ChezEux" not in noms


class TestRecapitulatifPdf:
    """
    Un récapitulatif rassemble plusieurs reçus d'un même élève sur un seul
    feuillet. Ce n'est pas une facture : il ne crée aucune pièce comptable.
    """

    def _versements(self, db, ecole, classe, nom, combien):
        """Plusieurs versements pour UN même élève, via des factures distinctes."""
        ids = []
        eleve = None
        for _ in range(combien):
            el, p = _encaisser(db, ecole, classe, nom, ecole["scolarite"])
            # `_encaisser` crée un élève par appel : on rattache les versements
            # suivants au premier, pour simuler un élève qui paie en plusieurs
            # fois.
            if eleve is None:
                eleve = el
            else:
                facture = db.query(Facture).filter(Facture.facture_id == p.facture_id).first()
                insc_premier = db.query(Inscription).filter(
                    Inscription.eleve_id == eleve.eleve_id).first()
                facture.inscription_id = insc_premier.inscription_id
                db.commit()
            ids.append(p.paiement_id)
        return eleve, ids

    def test_produit_un_pdf_valide(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, ids = self._versements(db, ecole, "A", "Bah", 3)

        r = client.get(f"/api/finance/paiements/recapitulatif-pdf?ids={','.join(map(str, ids))}",
                       headers=h)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        # Un vrai PDF, pas une page d'erreur déguisée.
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 1000

    def test_la_route_n_est_pas_masquee_par_celle_du_recu(self, client, db, ecole):
        """
        `/paiements/{id}/recu-pdf` est déclarée avant `/paiements/recapitulatif-pdf`.
        Si l'ordre posait problème, « recapitulatif-pdf » serait pris pour un
        identifiant de paiement et la route répondrait 404 ou 422.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, ids = self._versements(db, ecole, "A", "Sylla", 1)

        r = client.get(f"/api/finance/paiements/recapitulatif-pdf?ids={ids[0]}", headers=h)
        assert r.status_code == 200, r.text

    def test_refuse_de_melanger_plusieurs_eleves(self, client, db, ecole):
        """
        Additionner les versements de deux familles donnerait un total que
        personne ne doit, et qu'aucun parent ne pourrait vérifier.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, p1 = _encaisser(db, ecole, "A", "Premier", ecole["scolarite"])
        _, p2 = _encaisser(db, ecole, "A", "Second", ecole["scolarite"])

        r = client.get(
            f"/api/finance/paiements/recapitulatif-pdf?ids={p1.paiement_id},{p2.paiement_id}",
            headers=h)
        assert r.status_code == 400
        assert "plusieurs élèves" in r.json()["detail"]

    def test_refuse_un_versement_annule(self, client, db, ecole):
        """Un paiement annulé gonflerait un total remis à une famille."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        _, p = _encaisser(db, ecole, "A", "Annule", ecole["scolarite"])
        paiement = db.query(Paiement).filter(Paiement.paiement_id == p.paiement_id).first()
        paiement.statut = "ANNULE"
        db.commit()

        r = client.get(f"/api/finance/paiements/recapitulatif-pdf?ids={p.paiement_id}", headers=h)
        assert r.status_code == 400
        assert "annulé" in r.json()["detail"].lower()

    def test_une_selection_vide_est_refusee(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        assert client.get("/api/finance/paiements/recapitulatif-pdf?ids=", headers=h).status_code == 400

    def test_les_versements_d_une_autre_ecole_sont_introuvables(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        # Un identifiant qui n'appartient pas à cette école : le filtre sur
        # l'établissement doit le faire disparaître, pas produire son PDF.
        r = client.get("/api/finance/paiements/recapitulatif-pdf?ids=999999", headers=h)
        assert r.status_code == 404
