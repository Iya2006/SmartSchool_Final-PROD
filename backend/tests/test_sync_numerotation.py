"""
Pièces émises par un poste hors-ligne (étape B2 du chantier offline-first).

- Chaque poste numérote ses reçus, factures, matricules et exemplaires de son
  côté, avec son rang (« P2 ») : deux postes hors-ligne n'émettent jamais le
  même numéro.
- Le reçu imprimé sur un poste est définitif : son QR se vérifie sur le cloud
  dès que le paiement y est synchronisé, et un autre poste le réimprime à
  l'identique.
"""
import re
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.core.matricules import generer_matricule
from app.core.numerotation import generer_numero_facture, generer_numero_recu
from app.core.recu_paiement import base_url_publique, code_est_valide, code_verification
from app.models.academique import Eleve, Facture, Inscription, Paiement
from app.sync.identifiants import application_distante
from app.sync.instantane import exporter_page
from app.sync.serialisation import ligne_vers_json
from app.sync.perimetre import table
from tests.test_isolation_multi_ecole import Ecole
from tests.test_sync_identifiants import _poste_installe

CODE = re.compile(r"^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$")


def test_chaque_poste_numerote_ses_pieces_de_son_cote(db: Session):
    a = Ecole(db, "A")
    etab, annee = a.etab.etablissement_id, a.annee.annee_id
    postes = {1: _poste_installe(db, a, 31, rang=1), 2: _poste_installe(db, a, 32, rang=2)}

    pieces = {}
    for rang, moteur in postes.items():
        with Session(moteur) as s:
            pieces[rang] = (
                generer_numero_recu(s, etab, annee),
                generer_numero_recu(s, etab, annee),
                generer_numero_facture(s, etab, annee),
                generer_matricule(s, Eleve, "ELV", etab),
            )
            s.commit()

    for rang, (recu, recu_suivant, facture, matricule) in pieces.items():
        assert recu == f"REC-{etab}-2025-P{rang}-00001"
        assert recu_suivant == f"REC-{etab}-2025-P{rang}-00002"
        assert facture == f"FAC-{etab}-2025-P{rang}-00001"
        assert f"-P{rang}-" in matricule
    assert pieces[1][3] != pieces[2][3]

    # Le cloud garde son format, sans segment de poste.
    assert re.fullmatch(rf"REC-{etab}-2025-\d{{5}}", generer_numero_recu(db, etab, annee))
    db.rollback()


def _encaisser_sur_le_poste(moteur, ecole: Ecole, inscription_id: int) -> dict:
    etab, annee = ecole.etab.etablissement_id, ecole.annee.annee_id
    with Session(moteur) as s:
        facture = Facture(
            inscription_id=inscription_id, annee_id=annee,
            numero_facture=generer_numero_facture(s, etab, annee),
            montant_total=300000, montant_net=300000, montant_paye=0, montant_restant=300000,
            statut="EN_ATTENTE",
        )
        s.add(facture)
        s.flush()
        paiement = Paiement(
            facture_id=facture.facture_id, annee_id=annee, numero_recu=generer_numero_recu(s, etab, annee),
            montant=100000, mode_paiement="ESPECES", date_paiement=date(2026, 1, 10), statut="VALIDE",
        )
        s.add(paiement)
        s.flush()
        # Même geste que l'encaissement (finance.py) : le code est figé à l'émission.
        paiement.code_verification = code_verification(paiement)
        s.commit()
        return {"facture": _ligne(facture), "paiement": _ligne(paiement)}


def _ligne(objet) -> dict:
    t = objet.__table__
    return ligne_vers_json(t, {c.name: getattr(objet, c.name) for c in t.columns})


def test_un_recu_emis_hors_ligne_se_verifie_sur_le_cloud(client: TestClient, db: Session):
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    inscription = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one()
    poste1, poste2 = _poste_installe(db, a, 41, rang=1), _poste_installe(db, a, 42, rang=2)

    lignes = _encaisser_sur_le_poste(poste1, a, inscription.inscription_id)
    recu = lignes["paiement"]
    assert CODE.match(recu["code_verification"])

    # Le paiement arrive sur le cloud et sur l'autre poste, avec ses identifiants.
    for moteur in (db.get_bind(), poste2):
        with moteur.begin() as cx:
            if moteur is poste2:
                application_distante(cx, True)
            cx.execute(insert(table("ss_factures")).values(**_valeurs("ss_factures", lignes["facture"])))
            cx.execute(insert(table("ss_paiements")).values(**_valeurs("ss_paiements", recu)))
            if moteur is poste2:
                application_distante(cx, False)

    # Le cloud recalcule le code avec la clé du poste émetteur : il le reconnaît.
    paiement_cloud = db.get(Paiement, recu["paiement_id"])
    assert code_est_valide(paiement_cloud, recu["code_verification"])
    rep = client.get("/api/public/recus/verifier",
                     params={"n": recu["numero_recu"], "c": recu["code_verification"]})
    assert rep.status_code == 200 and rep.json()["authentique"] is True
    # Un montant retouché sur le papier ne passe pas.
    paiement_cloud.montant = 900000
    assert not code_est_valide(paiement_cloud, recu["code_verification"])
    db.rollback()

    # Le second poste n'a pas la clé du premier : il réimprime le code figé.
    with Session(poste2) as s:
        assert code_verification(s.get(Paiement, recu["paiement_id"])) == recu["code_verification"]


def _valeurs(nom_table: str, ligne: dict) -> dict:
    from app.sync.serialisation import ligne_depuis_json
    return ligne_depuis_json(table(nom_table), ligne)


def test_l_installation_joint_le_code_des_recus_emis_avant(db: Session):
    """Un reçu du cloud antérieur à l'enregistrement du code (colonne vide) :
    le poste le reçoit avec son code, qu'il ne saurait pas calculer."""
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    inscription = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).one()
    facture = Facture(inscription_id=inscription.inscription_id, annee_id=a.annee.annee_id,
                      numero_facture=f"FAC-ANCIEN-{eleve.eleve_id}", montant_total=1000, montant_net=1000,
                      montant_paye=1000, montant_restant=0, statut="PAYEE")
    db.add(facture)
    db.flush()
    ancien = Paiement(facture_id=facture.facture_id, annee_id=a.annee.annee_id,
                      numero_recu=f"REC-ANCIEN-{eleve.eleve_id}", montant=1000, mode_paiement="ESPECES",
                      date_paiement=date(2025, 10, 1), statut="VALIDE")
    db.add(ancien)
    db.commit()
    assert ancien.code_verification is None

    page = exporter_page(db, a.etab.etablissement_id, "ss_paiements")
    exporte = next(l for l in page["lignes"] if l["paiement_id"] == ancien.paiement_id)
    assert exporte["code_verification"] == code_verification(ancien)


def test_le_qr_d_un_poste_mene_au_site_public(monkeypatch):
    import app.core.mode as mode

    class Requete:
        headers = {"origin": "http://127.0.0.1:47831"}

    monkeypatch.setattr(mode, "MODE_POSTE", True)
    monkeypatch.delenv("FRONTEND_PUBLIC_URL", raising=False)
    monkeypatch.setenv("CORS_ORIGINS", "http://127.0.0.1:47831,http://localhost:47831")
    assert base_url_publique(Requete()) == "https://trxsmartschool.com"
    # L'application installée fournit l'adresse du site (desktop/main.js).
    monkeypatch.setenv("FRONTEND_PUBLIC_URL", "https://trxsmartschool.com")
    assert base_url_publique(Requete()) == "https://trxsmartschool.com"
