"""
Instantané d'un établissement pour installer un poste local (app/sync/).

Ce qu'un poste reçoit doit être EXACTEMENT les données de son école : aucune
ligne d'une autre école (la base de test en contient beaucoup, créées par les
autres suites), et aucune référence cassée une fois importé dans la base
locale.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.security import hash_password
from app.models.academique import CompteComptable, Eleve, EleveParent, Parent, Utilisateur
from app.sync.instantane import exporter_page, importer_page, manifeste
from app.sync.perimetre import table, verifier_toutes_les_tables
from tests.test_isolation_multi_ecole import Ecole, _headers, _uid


def _parent_de(db: Session, *eleves: Eleve, etablissement_id: int) -> Parent:
    uid = _uid()
    p = Parent(nom="Camara", prenom=f"P{uid}", telephone_1=f"62{uid:07d}", statut="ACTIF",
               etablissement_id=etablissement_id)
    db.add(p); db.commit(); db.refresh(p)
    for e in eleves:
        db.add(EleveParent(eleve_id=e.eleve_id, parent_id=p.parent_id, lien_parente="PERE"))
    db.commit()
    return p


def _export_complet(db: Session, etablissement_id: int, limite: int = 1000) -> dict[str, list[dict]]:
    donnees = {}
    for entree in manifeste(db, etablissement_id):
        nom, lignes, apres = entree["table"], [], None
        while True:
            page = exporter_page(db, etablissement_id, nom, apres=apres, limite=limite)
            lignes.extend(page["lignes"])
            if page["suivant"] is None:
                break
            apres = page["suivant"]
        assert len(lignes) == entree["total"], f"{nom} : {len(lignes)} exportées pour {entree['total']} annoncées"
        donnees[nom] = lignes
    return donnees


def test_chaque_table_a_une_regle_de_rattachement():
    assert len(verifier_toutes_les_tables()) == len(Base.metadata.sorted_tables)


def test_aucune_ligne_d_une_autre_ecole(db: Session):
    a, b = Ecole(db, "A"), Ecole(db, "B")
    a.eleve(db)
    eleve_b = b.eleve(db)
    _parent_de(db, eleve_b, etablissement_id=b.etab.etablissement_id)

    donnees = _export_complet(db, a.etab.etablissement_id)

    for nom, lignes in donnees.items():
        if "etablissement_id" not in table(nom).c or nom == "ss_parents":
            continue
        autres = {l["etablissement_id"] for l in lignes} - {a.etab.etablissement_id}
        assert not autres, f"{nom} contient des lignes d'autres écoles : {autres}"

    ids_eleves = {l["eleve_id"] for l in donnees["ss_eleves"]}
    assert eleve_b.eleve_id not in ids_eleves
    assert all(l["classe_id"] != b.classe.classe_id for l in donnees["ss_inscriptions"])
    assert all(l["eleve_id"] in ids_eleves for l in donnees["ss_eleve_parent"])


def test_parent_rattache_a_une_autre_ecole_suit_son_enfant(db: Session):
    """Aujourd'hui un parent a une fiche PAR école. Mais une donnée ancienne
    peut relier un enfant de A à une fiche parent de B : le poste de A doit
    quand même recevoir ce parent, sinon la fiche famille est cassée
    hors-ligne (référence vers une ligne absente)."""
    a, b = Ecole(db, "A"), Ecole(db, "B")
    enfant_a, enfant_b = a.eleve(db), b.eleve(db)
    parent = _parent_de(db, enfant_a, enfant_b, etablissement_id=b.etab.etablissement_id)

    donnees = _export_complet(db, a.etab.etablissement_id)

    assert parent.parent_id in {l["parent_id"] for l in donnees["ss_parents"]}
    liens = {(l["eleve_id"], l["parent_id"]) for l in donnees["ss_eleve_parent"]}
    assert (enfant_a.eleve_id, parent.parent_id) in liens
    assert (enfant_b.eleve_id, parent.parent_id) not in liens


def test_le_plan_comptable_commun_est_copie_entier(db: Session):
    a = Ecole(db, "A")
    db.add(CompteComptable(numero_compte=f"411{_uid()}", libelle="Clients élèves", type_compte="ACTIF"))
    db.commit()

    donnees = _export_complet(db, a.etab.etablissement_id)

    total = db.execute(select(func.count()).select_from(table("ss_comptes_comptables"))).scalar_one()
    assert len(donnees["ss_comptes_comptables"]) == total


def test_pagination_reprend_sans_perte_ni_doublon(db: Session):
    a = Ecole(db, "A")
    for _ in range(5):
        a.eleve(db)

    par_page_de_un = _export_complet(db, a.etab.etablissement_id, limite=1)
    d_un_coup = _export_complet(db, a.etab.etablissement_id)

    ids = [l["eleve_id"] for l in par_page_de_un["ss_eleves"]]
    assert len(ids) == len(set(ids)) == 5
    assert ids == [l["eleve_id"] for l in d_un_coup["ss_eleves"]]


def test_import_dans_une_base_locale_vide(db: Session):
    a = Ecole(db, "A")
    eleve = a.eleve(db)
    _parent_de(db, eleve, etablissement_id=a.etab.etablissement_id)
    donnees = _export_complet(db, a.etab.etablissement_id)

    locale = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(locale)
    with locale.begin() as cx:
        for nom, lignes in donnees.items():
            importer_page(cx, nom, lignes)
        # Rejouer une page (reprise après coupure) ne crée aucun doublon.
        importer_page(cx, "ss_eleves", donnees["ss_eleves"])

    with Session(locale) as s:
        for nom, lignes in donnees.items():
            assert s.execute(select(func.count()).select_from(table(nom))).scalar_one() == len(lignes), nom
        local = s.get(Eleve, eleve.eleve_id)
        assert local is not None and local.nom == eleve.nom
        assert local.date_naissance == date(2012, 1, 1)


def _compte(db: Session, etablissement_id: int, role: str) -> Utilisateur:
    uid = _uid()
    u = Utilisateur(
        nom="Compte", prenom=f"R{uid}", nom_utilisateur=f"poste.{role.lower()}.{uid}",
        email=f"poste.{uid}@smartschool.gn", telephone=f"65{uid:07d}",
        mot_de_passe=hash_password("motdepasse123"), role=role, statut="ACTIF",
        etablissement_id=etablissement_id,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


class TestRoutesInstallationPoste:
    def test_la_direction_recoit_le_manifeste_et_les_pages_de_son_ecole(self, client: TestClient, db: Session):
        a, b = Ecole(db, "A"), Ecole(db, "B")
        eleve_a, eleve_b = a.eleve(db), b.eleve(db)
        headers = _headers(client, a.admin.nom_utilisateur)

        manif = client.get("/api/poste/instantane", headers=headers)
        assert manif.status_code == 200, manif.text
        corps = manif.json()
        assert corps["etablissement_id"] == a.etab.etablissement_id
        assert len(corps["tables"]) == len(Base.metadata.sorted_tables)

        page = client.get("/api/poste/instantane/ss_eleves", headers=headers)
        assert page.status_code == 200, page.text
        ids = {l["eleve_id"] for l in page.json()["lignes"]}
        assert eleve_a.eleve_id in ids and eleve_b.eleve_id not in ids

    @pytest.mark.parametrize("role", ["DIRECTEUR_NIVEAU", "COMPTABLE", "SECRETAIRE"])
    def test_hors_direction_refuse(self, client: TestClient, db: Session, role: str):
        a = Ecole(db, "A")
        compte = _compte(db, a.etab.etablissement_id, role)
        headers = _headers(client, compte.nom_utilisateur)
        assert client.get("/api/poste/instantane", headers=headers).status_code == 403
        assert client.get("/api/poste/instantane/ss_eleves", headers=headers).status_code == 403

    def test_sans_connexion_refuse(self, client: TestClient):
        assert client.get("/api/poste/instantane").status_code in (401, 403)

    def test_table_inconnue(self, client: TestClient, db: Session):
        a = Ecole(db, "A")
        headers = _headers(client, a.admin.nom_utilisateur)
        assert client.get("/api/poste/instantane/pg_user", headers=headers).status_code == 404
