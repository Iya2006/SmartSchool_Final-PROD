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


@pytest.fixture(autouse=True)
def dossier_isole(tmp_path, monkeypatch):
    """
    Les PDF des tests n'écrivent JAMAIS dans `backend/uploads`.

    Ces fichiers vivent sur le disque, pas en base : ils survivent donc au
    recyclage de la base entre fichiers de tests, alors que les identifiants
    de classe repartent à 1. Un PDF laissé par un test précédent faisait
    croire au suivant qu'un emploi du temps était déjà déposé — et au passage
    on polluait le dépôt de travail.

    Même parade que `test_photo_eleve_par_la_direction.py`, qui redirige déjà
    son dossier d'upload vers un répertoire temporaire. Les PDF sont rangés
    avec les autres fichiers envoyés (`app.core.fichiers`), dans « emplois/ ».
    """
    from app.core import fichiers
    monkeypatch.setattr(fichiers, "DOSSIER_FICHIERS", str(tmp_path))
    return tmp_path


@pytest.fixture
def ecole(db: Session):
    uid = _uid()
    # Préfixe propre à ce fichier : `EDT-` est déjà pris par
    # `test_emploi_du_temps_eleve_parent.py`, et le code d'établissement est
    # unique pour toute la base — deux fichiers qui comptent chacun à partir
    # de 1 finissent par se marcher dessus.
    etab = Etablissement(code=f"EDTPDF-{uid}", nom=f"École {uid}", type_etablissement="COLLEGE")
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
    return {"eid": eid, "classe": classe, "admin": admin}


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


class TestLePdfSuitLaSynchronisation:
    """
    Un poste et le cloud doivent voir le même emploi du temps. La classe cite
    le PDF déposé (`Classe.emploi_pdf`) : elle voyage par la synchronisation,
    et le fichier qu'elle cite la suit (app/sync/fichiers.py), qui n'écrase
    jamais un fichier existant — d'où un nom nouveau à chaque dépôt.
    """

    def _classe(self, db, cid):
        db.expire_all()
        return db.get(Classe, cid)

    def test_la_classe_cite_le_pdf_et_la_synchronisation_le_voit(self, client, db, ecole, dossier_isole):
        from app.sync.fichiers import chemins_cites

        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id
        assert _deposer(client, h, cid).status_code == 201

        reference = self._classe(db, cid).emploi_pdf
        assert reference.startswith(f"/uploads/emplois/classe_{cid}_")
        relatif = reference[len("/uploads/"):]
        assert (dossier_isole / relatif).read_bytes() == PDF_MINIMAL
        ligne = {c.name: getattr(self._classe(db, cid), c.name) for c in Classe.__table__.columns}
        assert chemins_cites("ss_classes", ligne) == {relatif}

    def test_chaque_depot_porte_un_nom_nouveau(self, client, db, ecole, dossier_isole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id
        _deposer(client, h, cid)
        premier = self._classe(db, cid).emploi_pdf
        second = PDF_MINIMAL + b"\n% version deux"
        _deposer(client, h, cid, second)
        nouveau = self._classe(db, cid).emploi_pdf

        assert nouveau != premier
        assert client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h).content == second
        # Ici, le précédent ne sert plus : retiré. Ailleurs, chacun suit la classe.
        assert not (dossier_isole / premier[len("/uploads/"):]).exists()

    def test_retirer_efface_la_reference(self, client, db, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id
        _deposer(client, h, cid)
        assert client.delete(f"/api/emploi-du-temps/{cid}/pdf", headers=h).status_code == 200
        assert self._classe(db, cid).emploi_pdf is None
        assert client.get(f"/api/emploi-du-temps/{cid}/pdf/existe", headers=h).json()["existe"] is False

    def test_depose_ailleurs_et_pas_encore_arrive(self, client, db, ecole):
        """Déposé sur un autre appareil : la classe est arrivée, le fichier pas
        encore. On ne propose pas d'en déposer un autre, et on le dit."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id
        classe = self._classe(db, cid)
        classe.emploi_pdf = f"/uploads/emplois/classe_{cid}_20261102083000_a1b2c3.pdf"
        db.commit()

        existe = client.get(f"/api/emploi-du-temps/{cid}/pdf/existe", headers=h).json()
        assert existe == {"existe": True, "depose_le": "2026-11-02T08:30:00", "taille": None}
        r = client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h)
        assert r.status_code == 404 and "prochaine synchronisation" in r.json()["detail"]

    def test_les_premiers_depots_sont_rattaches_a_leur_classe(self, client, db, ecole, dossier_isole):
        """Déposés sous leur premier nom fixe, avant ce changement : toujours
        lisibles, puis cités par leur classe au démarrage du cloud."""
        from app.api.emploi_du_temps import rattacher_les_pdf_deposes

        h = _headers(client, ecole["admin"].nom_utilisateur)
        cid = ecole["classe"].classe_id
        (dossier_isole / "emplois").mkdir(exist_ok=True)
        (dossier_isole / "emplois" / f"classe_{cid}.pdf").write_bytes(PDF_MINIMAL)

        assert client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h).content == PDF_MINIMAL
        assert rattacher_les_pdf_deposes(db.get_bind()) >= 1
        assert self._classe(db, cid).emploi_pdf == f"/uploads/emplois/classe_{cid}.pdf"
        assert rattacher_les_pdf_deposes(db.get_bind()) == 0
        assert client.get(f"/api/emploi-du-temps/{cid}/pdf", headers=h).content == PDF_MINIMAL
