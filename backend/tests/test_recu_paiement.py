"""
Tests — reçu de paiement unique (app/core/recu_paiement.py).

Le même reçu sort de l'écran d'encaissement (JSON), de la comptabilité
(PDF) et du portail parent (PDF), et chacun porte un code de vérification
que la page publique /verifier-recu contrôle.
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.recu_paiement import code_est_valide, code_verification, montant_en_lettres
from app.core.security import hash_password
from app.models.academique import EleveParent, Paiement, Parent
from tests.test_lot2_finance_isolation import Ecole, _headers, _type_frais, _uid


def _facture_et_deux_paiements(client: TestClient, db: Session, ecole: Ecole):
    headers = _headers(client, ecole.admin.nom_utilisateur)
    tf = _type_frais(db, ecole.etab.etablissement_id)
    resp = client.post(
        "/api/finance/factures",
        json={"inscription_id": ecole.inscription.inscription_id, "type_frais_id": tf.type_frais_id, "montant_total": 450000},
        headers=headers,
    )
    assert resp.status_code in (200, 201), resp.text
    facture_id = resp.json()["facture_id"]
    ids = []
    for montant in (150000, 80000):
        r = client.post(
            "/api/finance/paiements",
            json={"facture_id": facture_id, "montant": montant, "mode_paiement": "ESPECES"},
            headers=headers,
        )
        assert r.status_code in (200, 201), r.text
        ids.append(r.json()["paiement_id"])
    return headers, ids


class TestMontantEnLettres:
    def test_regles_du_francais(self):
        assert montant_en_lettres(80000) == "quatre-vingt mille"
        assert montant_en_lettres(80) == "quatre-vingts"
        assert montant_en_lettres(71) == "soixante et onze"
        assert montant_en_lettres(91) == "quatre-vingt-onze"
        assert montant_en_lettres(21) == "vingt et un"
        assert montant_en_lettres(200) == "deux cents"
        assert montant_en_lettres(200000) == "deux cent mille"
        assert montant_en_lettres(1281) == "mille deux cent quatre-vingt-un"
        assert montant_en_lettres(1500000) == "un million cinq cent mille"
        assert montant_en_lettres(2000000) == "deux millions"


class TestRecu:
    def test_json_ecran_et_pdf(self, client: TestClient, db: Session):
        ecole = Ecole(db, "RCA")
        headers, (p1, p2) = _facture_et_deux_paiements(client, db, ecole)

        r = client.get(f"/api/finance/recu/{p2}", headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["numero_recu"] and d["code_verification"]
        assert d["montant"] == 80000
        assert d["montant_en_lettres"] == "quatre-vingt mille"
        assert d["mode_paiement_libelle"] == "Espèces"
        # Situation de la facture À LA DATE de ce reçu.
        assert d["facture"]["deja_paye"] == 150000
        assert d["facture"]["paye_a_date"] == 230000
        assert d["facture"]["reste_a_date"] == 220000
        assert [a["montant"] for a in d["anterieurs"]] == [150000]
        # Clés historiques toujours là pour les écrans existants.
        assert d["recu"]["numero_recu"] == d["numero_recu"]
        assert d["facture"]["type_frais"] == "Scolarité"

        # Réimprimer le PREMIER reçu ne doit pas compter le second versement.
        r1 = client.get(f"/api/finance/recu/{p1}", headers=headers).json()
        assert r1["facture"]["paye_a_date"] == 150000
        assert r1["anterieurs"] == []

        pdf = client.get(f"/api/finance/paiements/{p2}/recu-pdf", headers=headers)
        assert pdf.status_code == 200, pdf.text
        assert pdf.headers["content-type"] == "application/pdf"
        assert pdf.content.startswith(b"%PDF")

    def test_recu_autre_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RCB"), Ecole(db, "RCC")
        _, (p1, _) = _facture_et_deux_paiements(client, db, b)
        headers_a = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/finance/recu/{p1}", headers=headers_a).status_code == 404
        assert client.get(f"/api/finance/paiements/{p1}/recu-pdf", headers=headers_a).status_code == 404
        assert client.get(f"/api/portail-parent/paiements/{p1}/recu-pdf", headers=headers_a).status_code == 404

    def test_portail_parent_meme_recu(self, client: TestClient, db: Session):
        ecole = Ecole(db, "RCP")
        _, (p1, _) = _facture_et_deux_paiements(client, db, ecole)
        uid = _uid()
        parent = Parent(
            etablissement_id=ecole.etab.etablissement_id, nom="Diallo", prenom="Mamadou",
            telephone_1=f"62900{uid:04d}", mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add(parent); db.commit(); db.refresh(parent)
        db.add(EleveParent(eleve_id=ecole.eleve.eleve_id, parent_id=parent.parent_id, lien_parente="PERE"))
        db.commit()
        login = client.post("/api/portail-parent/login", json={"telephone": parent.telephone_1, "mot_de_passe": "motdepasse123"})
        assert login.status_code == 200, login.text
        h = {"Authorization": f"Bearer {login.json()['token']}"}
        r = client.get(f"/api/portail-parent/paiements/{p1}/recu-pdf", headers=h)
        assert r.status_code == 200, r.text
        assert r.content.startswith(b"%PDF")


class TestVerificationPublique:
    def test_code_valide_faux_et_inconnu(self, client: TestClient, db: Session):
        ecole = Ecole(db, "RCV")
        headers, (_, p2) = _facture_et_deux_paiements(client, db, ecole)
        d = client.get(f"/api/finance/recu/{p2}", headers=headers).json()

        ok = client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": d["code_verification"]})
        assert ok.status_code == 200
        v = ok.json()
        assert v["authentique"] is True
        assert v["statut"] == "VALIDE"
        assert v["montant"] == 80000
        assert v["facture"]["reste_a_date"] == 220000
        assert v["eleve"]["nom"] == "Diallo"
        assert "parent" not in v  # rien au-delà de ce qui figure sur le reçu

        # Sans tiret / en minuscules : accepté.
        assert client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": d["code_verification"].replace("-", "").lower()}).json()["authentique"] is True
        # Code faux, numéro inconnu, rien du tout : même réponse.
        assert client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": "AAAA-BBBB-CCCC"}).json() == {"authentique": False}
        assert client.get("/api/public/recus/verifier", params={"n": "REC-INCONNU", "c": d["code_verification"]}).json() == {"authentique": False}
        assert client.get("/api/public/recus/verifier").json() == {"authentique": False}

    def test_montant_retouche_invalide_le_code(self, client: TestClient, db: Session):
        ecole = Ecole(db, "RCT")
        headers, (_, p2) = _facture_et_deux_paiements(client, db, ecole)
        paiement = db.query(Paiement).filter(Paiement.paiement_id == p2).one()
        code = code_verification(paiement)
        assert code_est_valide(paiement, code)
        paiement.montant = 800000
        assert not code_est_valide(paiement, code)
        db.rollback()

    def test_paiement_annule_signale(self, client: TestClient, db: Session):
        ecole = Ecole(db, "RCN")
        headers, (_, p2) = _facture_et_deux_paiements(client, db, ecole)
        d = client.get(f"/api/finance/recu/{p2}", headers=headers).json()
        r = client.put(f"/api/finance/paiements/{p2}/annuler", json={"motif": "erreur de saisie"}, headers=headers)
        assert r.status_code == 200, r.text
        v = client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": d["code_verification"]}).json()
        assert v["authentique"] is True
        assert v["statut"] == "ANNULE"
        pdf = client.get(f"/api/finance/paiements/{p2}/recu-pdf", headers=headers)
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
