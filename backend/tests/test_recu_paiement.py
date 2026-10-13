"""
Tests — reçu de paiement unique (app/core/recu_paiement.py).

Le même reçu sort de l'écran d'encaissement (JSON), de la comptabilité
(PDF) et du portail parent (PDF), et chacun porte un code de vérification
que la page publique /verifier-recu contrôle.
"""
import re
from datetime import date, timedelta
from urllib.parse import urlencode

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import create_access_token
from app.core.recu_paiement import (
    COULEUR_DEFAUT, _contraste_avec_blanc, base_url_publique, code_est_valide,
    code_verification, couleur_lisible, formater_montant, generer_pdf_recu,
    montant_en_lettres, somme_en_lettres, texte_pdf,
)
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


class TestSommeEnLettres:
    def test_phrase_complete_accordee(self):
        assert somme_en_lettres(2000000, "GNF") == "Deux millions de francs guinéens"
        assert somme_en_lettres(10 ** 9, "GNF") == "Un milliard de francs guinéens"
        # « de » seulement derrière million / milliard eux-mêmes.
        assert somme_en_lettres(1500000, "GNF") == "Un million cinq cent mille francs guinéens"
        assert somme_en_lettres(80000, None) == "Quatre-vingt mille francs guinéens"
        assert somme_en_lettres(3000, "xof") == "Trois mille francs CFA"
        assert somme_en_lettres(1250.5, "USD") == "Mille deux cent cinquante dollars US et cinquante cents"
        assert somme_en_lettres(12.05, "EUR") == "Douze euros et cinq centimes"
        assert somme_en_lettres(1, "EUR") == "Un euro"
        assert somme_en_lettres(0.5, "EUR") == "Cinquante centimes"
        assert somme_en_lettres(10, "CAD") == "Dix CAD"


class TestMiseEnForme:
    def test_montants_a_la_francaise(self):
        assert formater_montant(80000) == "80 000"
        assert formater_montant(1250.5) == "1 250,50"
        assert formater_montant(1250.499) == "1 250,50"
        assert formater_montant(0.004) == "0"
        assert formater_montant(None) == "0"

    def test_couleur_normalisee_et_lisible(self):
        assert couleur_lisible("#1E3A8A") == "#1e3a8a"
        assert couleur_lisible(" 0f766e ") == "#0f766e"
        for invalide in ("red", "#12345", "url(x)", "#1e3a8a;}", "", None):
            assert couleur_lisible(invalide) == COULEUR_DEFAUT
        # Trop claire : assombrie (même teinte), pas remplacée par le bleu.
        for claire in ("#fde047", "#ffffff", "#abc"):
            v = couleur_lisible(claire)
            assert re.fullmatch(r"#[0-9a-f]{6}", v) and v != COULEUR_DEFAUT
            r, g, b = (int(v[i:i + 2], 16) for i in (1, 3, 5))
            assert _contraste_avec_blanc(r, g, b) >= 4.5
        r, g, b = (int(couleur_lisible("#fde047")[i:i + 2], 16) for i in (1, 3, 5))
        assert r > g > b  # toujours un jaune (foncé)

    def test_texte_pdf_winansi(self):
        assert texte_pdf("A\u00a0B\u202fC\u2009D\tE\nF\rG") == "A B C D E F G"
        assert texte_pdf("x\u200by\u200e") == "xy"
        assert texte_pdf("Élève Œuvre — 5 €") == "Élève Œuvre — 5 €"
        assert texte_pdf("Nguyễn Ā") == "Nguyen A"
        assert texte_pdf("Fodé 😀 名") == "Fodé  "

    def test_qr_ignore_origines_invalides(self, monkeypatch):
        monkeypatch.delenv("FRONTEND_PUBLIC_URL", raising=False)
        monkeypatch.setenv("CORS_ORIGINS", "*, localhost:3000, http://localhost:3000, https://ecole.example.gn/")
        assert base_url_publique() == "https://ecole.example.gn"

    def test_cle_de_signature_dediee(self, monkeypatch):
        p = Paiement(paiement_id=1, numero_recu="REC-1-2026-00001", montant=1000,
                     date_paiement=date(2026, 1, 1), facture_id=2)
        monkeypatch.delenv("RECU_SIGNING_KEY", raising=False)
        monkeypatch.delenv("RECU_SIGNING_KEY_FILE", raising=False)
        code_jwt = code_verification(p)
        monkeypatch.setenv("RECU_SIGNING_KEY", "cle-des-recus-0123456789abcdef")
        assert code_verification(p) != code_jwt
        monkeypatch.delenv("RECU_SIGNING_KEY")
        assert code_verification(p) == code_jwt


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
        assert d["somme_en_lettres"] == "Quatre-vingt mille francs guinéens"
        assert re.fullmatch(r"#[0-9a-f]{6}", d["etablissement"]["couleur"])
        # L'écran reçoit l'URL exacte du QR code imprimé sur le PDF.
        assert d["url_verification"].endswith(
            "/verifier-recu?" + urlencode({"n": d["numero_recu"], "c": d["code_verification"]}))
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

    def test_versement_antidate_ne_change_pas_un_ancien_recu(self, client: TestClient, db: Session):
        """« Antérieur » = saisi avant, pas daté avant : le 2e versement,
        saisi après mais antidaté, ne doit pas apparaître sur le reçu du 1er
        (déjà remis à la famille)."""
        ecole = Ecole(db, "RCD")
        headers = _headers(client, ecole.admin.nom_utilisateur)
        tf = _type_frais(db, ecole.etab.etablissement_id)
        facture_id = client.post(
            "/api/finance/factures",
            json={"inscription_id": ecole.inscription.inscription_id, "type_frais_id": tf.type_frais_id, "montant_total": 450000},
            headers=headers,
        ).json()["facture_id"]
        ids = []
        for montant, jour in ((150000, None), (80000, str(date.today() - timedelta(days=3)))):
            corps = {"facture_id": facture_id, "montant": montant, "mode_paiement": "ESPECES"}
            if jour:
                corps["date_paiement"] = jour
            r = client.post("/api/finance/paiements", json=corps, headers=headers)
            assert r.status_code in (200, 201), r.text
            ids.append(r.json()["paiement_id"])

        r1 = client.get(f"/api/finance/recu/{ids[0]}", headers=headers).json()
        assert r1["anterieurs"] == []
        assert r1["facture"]["paye_a_date"] == 150000
        r2 = client.get(f"/api/finance/recu/{ids[1]}", headers=headers).json()
        assert [a["montant"] for a in r2["anterieurs"]] == [150000]
        assert r2["facture"]["deja_paye"] == 150000
        assert r2["facture"]["reste_a_date"] == 220000
        # Saisi aujourd'hui pour un jour passé : pas d'heure imprimée.
        assert r2["heure"] is None

    def test_pdf_textes_extremes(self, client: TestClient, db: Session):
        """Noms interminables, caractères hors WinAnsi, montants à
        décimales : le PDF sort quand même (pas de 500)."""
        ecole = Ecole(db, "RCX")
        headers, (_, p2) = _facture_et_deux_paiements(client, db, ecole)
        d = client.get(f"/api/finance/recu/{p2}", headers=headers).json()
        d["eleve"]["nom"] = "Nguyễn\u200b 😀 " * 12
        d["etablissement"]["nom"] = "Groupe scolaire " + "très long " * 9
        d["parent"] = {"nom": "Ā" * 80, "telephone": "+224 620 00 00 00"}
        d["facture"]["motif"] = "Frais\tde\nscolarité " * 10
        d["montant"] = 1250.5
        d["devise"] = "USD"
        d["somme_en_lettres"] = somme_en_lettres(1250.5, "USD")
        d["anterieurs"] = d["anterieurs"] * 6
        assert generer_pdf_recu(d).startswith(b"%PDF")

    def test_url_du_qr_suit_le_site_appelant(self, client: TestClient, db: Session, monkeypatch):
        """L'écran reçoit l'URL calculée sur l'origine de la requête (si elle
        est autorisée), comme le PDF."""
        monkeypatch.delenv("FRONTEND_PUBLIC_URL", raising=False)
        monkeypatch.setenv("CORS_ORIGINS", "https://a.example.gn,https://b.example.gn")
        ecole = Ecole(db, "RCU")
        headers, (_, p2) = _facture_et_deux_paiements(client, db, ecole)
        d = client.get(f"/api/finance/recu/{p2}", headers={**headers, "Origin": "https://b.example.gn"}).json()
        assert d["url_verification"].startswith("https://b.example.gn/verifier-recu?")

    def test_recu_autre_ecole_404(self, client: TestClient, db: Session):
        a, b = Ecole(db, "RCB"), Ecole(db, "RCC")
        _, (p1, _) = _facture_et_deux_paiements(client, db, b)
        headers_a = _headers(client, a.admin.nom_utilisateur)
        assert client.get(f"/api/finance/recu/{p1}", headers=headers_a).status_code == 404
        assert client.get(f"/api/finance/paiements/{p1}/recu-pdf", headers=headers_a).status_code == 404
        assert client.get(f"/api/portail-parent/paiements/{p1}/recu-pdf", headers=headers_a).status_code == 404
        facture_id = db.query(Paiement).filter(Paiement.paiement_id == p1).one().facture_id
        assert client.get(f"/api/portail-parent/factures/{facture_id}/pdf", headers=headers_a).status_code == 404

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

    def test_portail_parent_refuse_les_autres_jetons(self, client: TestClient, db: Session):
        """Seuls le parent de l'élève et la caisse de l'école y ont accès.
        Un jeton élève ou enseignant dont le `sub` vaut l'identifiant du
        parent passait pour ce parent."""
        ecole = Ecole(db, "RCQ")
        headers_admin, (p1, _) = _facture_et_deux_paiements(client, db, ecole)
        uid = _uid()
        parent = Parent(
            etablissement_id=ecole.etab.etablissement_id, nom="Diallo", prenom="Mamadou",
            telephone_1=f"62901{uid:04d}", mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        autre = Parent(
            etablissement_id=ecole.etab.etablissement_id, nom="Camara", prenom="Aïssatou",
            telephone_1=f"62902{uid:04d}", mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        )
        db.add_all([parent, autre]); db.commit(); db.refresh(parent); db.refresh(autre)
        db.add(EleveParent(eleve_id=ecole.eleve.eleve_id, parent_id=parent.parent_id, lien_parente="PERE"))
        db.commit()
        facture_id = db.query(Paiement).filter(Paiement.paiement_id == p1).one().facture_id

        def jeton(donnees):
            return {"Authorization": f"Bearer {create_access_token(donnees)}"}

        etab_id = ecole.etab.etablissement_id
        login = client.post("/api/portail-parent/login", json={"telephone": autre.telephone_1, "mot_de_passe": "motdepasse123"})
        assert login.status_code == 200, login.text
        h_autre_parent = {"Authorization": f"Bearer {login.json()['token']}"}
        login = client.post("/api/portail-parent/login", json={"telephone": parent.telephone_1, "mot_de_passe": "motdepasse123"})
        h_parent = {"Authorization": f"Bearer {login.json()['token']}"}

        # Le reçu ET la facture du portail parent suivent les mêmes règles.
        for url in (f"/api/portail-parent/paiements/{p1}/recu-pdf", f"/api/portail-parent/factures/{facture_id}/pdf"):
            # Portail élève (sans rôle ni école) et connexion unifiée.
            assert client.get(url, headers=jeton({"sub": str(parent.parent_id), "type": "eleve"})).status_code == 403
            assert client.get(url, headers=jeton({"sub": str(parent.parent_id), "type": "eleve", "role": "ELEVE",
                                                  "etablissement_id": etab_id})).status_code == 403
            assert client.get(url, headers=jeton({"sub": str(parent.parent_id), "type": "enseignant", "role": "ENSEIGNANT",
                                                  "etablissement_id": etab_id})).status_code == 403
            # Super-admin plateforme sans école choisie.
            assert client.get(url, headers=jeton({"sub": "1", "type": "admin", "role": "SUPER_ADMIN",
                                                  "etablissement_id": None})).status_code == 403
            # Le parent d'un autre élève.
            assert client.get(url, headers=h_autre_parent).status_code == 403
            # Le parent de l'élève et la caisse de l'école, eux, y ont accès.
            assert client.get(url, headers=h_parent).status_code == 200, url
            assert client.get(url, headers=headers_admin).status_code == 200, url

    def test_roles_personnel_alignes_sur_la_finance(self):
        from app.api.portail_parent import ROLES_RECU_PERSONNEL
        from main import FINANCE_ROLES
        assert ROLES_RECU_PERSONNEL == set(FINANCE_ROLES)


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
        assert v["somme_en_lettres"] == "Quatre-vingt mille francs guinéens"
        assert v["eleve"]["nom"] == "Diallo"
        assert "parent" not in v  # rien au-delà de ce qui figure sur le reçu
        # Ni la situation ACTUELLE de la facture : elle ne figure pas sur le
        # papier, et la famille n'a pas à la révéler à qui tient le reçu.
        assert "reste_actuel" not in v["facture"] and "statut_actuel" not in v["facture"]

        # Sans tiret / en minuscules : accepté. Numéro en minuscules aussi.
        assert client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": d["code_verification"].replace("-", "").lower()}).json()["authentique"] is True
        assert client.get("/api/public/recus/verifier", params={"n": d["numero_recu"].lower(), "c": d["code_verification"]}).json()["authentique"] is True
        # Tirets cadratins (copié depuis un traitement de texte) : accepté.
        assert client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": d["code_verification"].replace("-", "\u2014")}).json()["authentique"] is True
        # Caractère non ASCII sur un numéro EXISTANT : même réponse qu'un
        # code faux (et pas une erreur 500, qui trahissait le numéro).
        r = client.get("/api/public/recus/verifier", params={"n": d["numero_recu"], "c": "é"})
        assert r.status_code == 200 and r.json() == {"authentique": False}
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
