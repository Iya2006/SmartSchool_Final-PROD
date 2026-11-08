"""
Tests — déposer son emploi du temps en PDF.

Beaucoup d'écoles construisent leur emploi du temps à la main et le diffusent
déjà en PDF. Le ressaisir créneau par créneau représente des heures pour un
résultat qu'elles possèdent. On leur permet donc de déposer le document tel
quel : il est conservé et consultable, il ne devient pas des créneaux en base.

Le test qui compte le plus ici est celui du fichier déguisé : un exécutable
renommé en `.pdf` ne doit pas être accepté puis servi à tous les parents. Le
type annoncé par le navigateur ne prouve rien — seule la signature du fichier
fait foi.
"""
import os
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Etablissement, Niveau, Utilisateur,
)

_C = [0]
PDF_MINIMAL = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


def _uid() -> int:
    _C[0] += 1
    return _C[0]


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"EDT-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"ANE{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=eid, code=f"CYE{uid}", libelle="Collège", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"NVE{uid}", libelle="7e", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"CLE{uid}", libelle="7e A", capacite_max=50, effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    admin = Utilisateur(
        nom="Dir", prenom="Ecole", nom_utilisateur=f"dir.edt.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    # Les PDF vivent sur le DISQUE, pas en base : ils survivent donc au
    # recyclage de la base entre fichiers de tests, alors que les
    # identifiants de classe, eux, repartent à 1. Sans ce nettoyage, un
    # fichier laissé par un test précédent ferait croire à celui-ci qu'un
    # emploi du temps est déjà déposé.
    from app.api.emploi_du_temps import _chemin_pdf
    chemin = _chemin_pdf(classe.classe_id)
    if os.path.exists(chemin):
        os.remove(chemin)

    yield {"eid": eid, "classe": classe, "admin": admin}

    if os.path.exists(chemin):
        os.remove(chemin)


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _deposer(client, headers, classe_id, contenu=PDF_MINIMAL, type_mime="application/pdf",
             nom="edt.pdf"):
    return client.post(
        f"/api/emploi-du-temps/{classe_id}/pdf",
        headers=headers,
        files={"fichier": (nom, contenu, type_mime)},
    )


class TestDepotEmploiDuTempsPdf:

    def test_deposer_puis_consulter(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id

        assert _deposer(client, h, cid).status_code == 201

        r = client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_un_nouveau_depot_remplace_le_precedent(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id

        _deposer(client, h, cid, PDF_MINIMAL)
        second = PDF_MINIMAL + b"\n% version deux"
        _deposer(client, h, cid, second)

        assert client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h).content == second

    def test_un_fichier_deguise_en_pdf_est_refuse(self, client, ecole):
        """
        Le type annoncé par le navigateur ne prouve rien. Sans contrôle de la
        signature, n'importe quoi renommé en .pdf serait accepté puis servi
        à tous les parents.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id

        r = _deposer(client, h, cid, b"MZ\x90\x00 ceci est un executable",
                     type_mime="application/pdf")
        assert r.status_code == 400
        assert "PDF valide" in r.json()["detail"]

    def test_un_autre_format_est_refuse(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _deposer(client, h, ecole["classe"].classe_id, b"nom;classe\n", "text/csv", "edt.csv")
        assert r.status_code == 400

    def test_un_fichier_vide_est_refuse(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        assert _deposer(client, h, ecole["classe"].classe_id, b"").status_code == 400

    def test_savoir_s_il_existe_sans_le_telecharger(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id

        avant = client.get(f"/api/emploi-du-temps/{cid}/pdf/existe", headers=h).json()
        assert avant["existe"] is False

        _deposer(client, h, cid)
        apres = client.get(f"/api/emploi-du-temps/{cid}/pdf/existe", headers=h).json()
        assert apres["existe"] is True
        assert apres["depose_le"]
        assert apres["taille"] == len(PDF_MINIMAL)

    def test_supprimer(self, client, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id

        _deposer(client, h, cid)
        assert client.delete(f"/api/emploi-du-temps/{cid}/pdf", headers=h).status_code == 200
        assert client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h).status_code == 404

    def test_classe_d_une_autre_ecole_refusee(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        uid = _uid()
        autre = Etablissement(code=f"AUE-{uid}", nom="Autre", type_etablissement="COLLEGE")
        db.add(autre); db.commit(); db.refresh(autre)
        a_an = AnneeScolaire(
            etablissement_id=autre.etablissement_id, code=f"ANZ{uid}", libelle="2025-2026",
            date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
            est_courante="O", statut="EN_COURS",
        )
        db.add(a_an); db.commit(); db.refresh(a_an)
        a_cy = Cycle(etablissement_id=autre.etablissement_id, code=f"CYZ{uid}", libelle="C", ordre=1)
        db.add(a_cy); db.commit(); db.refresh(a_cy)
        a_nv = Niveau(cycle_id=a_cy.cycle_id, code=f"NVZ{uid}", libelle="N", ordre=1)
        db.add(a_nv); db.commit(); db.refresh(a_nv)
        a_cl = Classe(
            etablissement_id=autre.etablissement_id, annee_id=a_an.annee_id,
            niveau_id=a_nv.niveau_id, code=f"CLZ{uid}", libelle="X",
            capacite_max=10, effectif_actuel=0, statut="ACTIVE",
        )
        db.add(a_cl); db.commit(); db.refresh(a_cl)

        assert _deposer(client, h, a_cl.classe_id).status_code == 404
        assert client.get(f"/api/emploi-du-temps/{a_cl.classe_id}/pdf", headers=h).status_code == 404
