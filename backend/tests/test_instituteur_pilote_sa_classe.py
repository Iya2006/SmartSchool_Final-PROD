"""
Tests — l'instituteur du primaire pilote sa classe, le professeur du
secondaire saisit ses notes.

LA RÈGLE, ET POURQUOI ELLE EST CELLE-LÀ
---------------------------------------
Au collège et au lycée, un professeur tient UNE matière dans plusieurs
classes. Les moyennes, les bulletins et les résultats de fin d'année
rassemblent le travail de douze collègues : ce n'est le rôle d'aucun d'eux,
et laisser le professeur de sport arrêter les bulletins de la Terminale
n'aurait aucun sens.

Au primaire, c'est l'inverse : l'instituteur tient UNE classe et y assure
TOUTES les matières. Les moyennes de sa classe ne dépendent que de ses
propres notes. Lui imposer de passer par le secrétariat pour calculer ce
qu'il a lui-même noté n'ajoute aucun contrôle, seulement un délai.

La condition est vérifiable et non déclarative : cycle primaire, ET
affectation à toutes les matières actives de la classe.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    Affectation, AnneeScolaire, Classe, ClasseMatiere, Cycle, Enseignant,
    Etablissement, Matiere, Niveau, Trimestre,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"INS-{uid}", nom=f"École INS {uid}", type_etablissement="COMPLEXE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        code=f"AN{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS", etablissement_id=etab.etablissement_id,
    )
    db.add(annee); db.commit(); db.refresh(annee)
    periode = Trimestre(
        annee_id=annee.annee_id, code="S1", libelle="1er Semestre", numero=1,
        date_debut=date(2025, 10, 1), date_fin=date(2026, 1, 31), statut="EN_COURS",
    )
    db.add(periode); db.commit(); db.refresh(periode)
    return etab, annee, periode


def _classe(db: Session, etab, annee, code_cycle: str, nb_matieres: int):
    """Une classe d'un cycle donné, avec ses matières actives."""
    uid = _uid()
    cycle = Cycle(code=code_cycle, libelle=code_cycle, ordre=1,
                  etablissement_id=etab.etablissement_id)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle=f"Niveau {uid}", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        code=f"C{uid}", libelle=f"Classe {uid}", niveau_id=niveau.niveau_id,
        annee_id=annee.annee_id, capacite_max=40, statut="ACTIVE",
        etablissement_id=etab.etablissement_id,
    )
    db.add(classe); db.commit(); db.refresh(classe)

    matieres = []
    for i in range(nb_matieres):
        m = Matiere(code=f"M{uid}{i}", libelle=f"Matière {uid}-{i}",
                    cycle_id=cycle.cycle_id, coefficient_defaut=1)
        db.add(m); db.commit(); db.refresh(m)
        db.add(ClasseMatiere(classe_id=classe.classe_id, matiere_id=m.matiere_id,
                             coefficient=1, est_active="O"))
        matieres.append(m)
    db.commit()
    return classe, matieres


def _enseignant(db: Session, etab, classe, matieres, annee):
    """Un enseignant affecté aux matières indiquées de cette classe."""
    uid = _uid()
    ens = Enseignant(
        nom="Camara", prenom=f"Ens{uid}", matricule=f"ENS-INS-{uid}", sexe="M",
        telephone=f"66000{uid:04d}", email=f"ins.{uid}@smartschool.gn",
        mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(ens); db.commit(); db.refresh(ens)
    for m in matieres:
        db.add(Affectation(
            enseignant_id=ens.enseignant_id, classe_id=classe.classe_id,
            matiere_id=m.matiere_id, annee_id=annee.annee_id, statut="ACTIVE",
        ))
    db.commit()
    return ens


def _headers(client: TestClient, matricule: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": matricule, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


class TestLInstituteurDuPrimaire:
    def test_il_pilote_sa_classe(self, client: TestClient, db: Session):
        etab, annee, _ = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "PRM", 5)
        ens = _enseignant(db, etab, classe, matieres, annee)

        r = client.get(
            f"/api/portail-enseignant/{ens.enseignant_id}/classe/{classe.classe_id}/pilotage",
            headers=_headers(client, ens.matricule))
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["cycle"] == "primaire"
        assert p["peut_calculer_moyennes"] is True
        assert p["peut_voir_bulletins"] is True
        assert p["peut_calculer_resultats_annuels"] is True

    def test_il_calcule_les_moyennes_de_sa_classe(self, client: TestClient, db: Session):
        etab, annee, periode = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "PRM", 3)
        ens = _enseignant(db, etab, classe, matieres, annee)

        r = client.post(
            f"/api/portail-enseignant/{ens.enseignant_id}/classe/{classe.classe_id}"
            f"/calculer-moyennes?trimestre_id={periode.trimestre_id}",
            headers=_headers(client, ens.matricule))
        assert r.status_code == 200, r.text

    def test_il_arrete_les_resultats_annuels(self, client: TestClient, db: Session):
        etab, annee, _ = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "PRM", 3)
        ens = _enseignant(db, etab, classe, matieres, annee)

        r = client.post(
            f"/api/portail-enseignant/{ens.enseignant_id}/classe/{classe.classe_id}"
            f"/resultats-annuels",
            headers=_headers(client, ens.matricule))
        assert r.status_code == 200, r.text

    def test_il_consulte_les_bulletins_de_sa_classe(self, client: TestClient, db: Session):
        etab, annee, periode = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "PRM", 3)
        ens = _enseignant(db, etab, classe, matieres, annee)

        r = client.get(
            f"/api/portail-enseignant/{ens.enseignant_id}/classe/{classe.classe_id}"
            f"/bulletins?trimestre_id={periode.trimestre_id}",
            headers=_headers(client, ens.matricule))
        assert r.status_code == 200, r.text
        assert r.json()["type"] == "TRIMESTRIEL"


class TestLeProfesseurDuSecondaire:
    def test_il_ne_calcule_pas_les_moyennes(self, client: TestClient, db: Session):
        """Elles rassemblent les notes de douze collègues, pas les siennes."""
        etab, annee, periode = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "LYC", 8)
        # Il n'a qu'une matière sur les huit — le cas normal au lycée.
        prof = _enseignant(db, etab, classe, matieres[:1], annee)

        r = client.post(
            f"/api/portail-enseignant/{prof.enseignant_id}/classe/{classe.classe_id}"
            f"/calculer-moyennes?trimestre_id={periode.trimestre_id}",
            headers=_headers(client, prof.matricule))
        assert r.status_code == 403
        assert "administration" in r.json()["detail"]

    def test_son_ecran_ne_lui_propose_pas_ces_boutons(self, client: TestClient, db: Session):
        etab, annee, _ = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "CLG", 8)
        prof = _enseignant(db, etab, classe, matieres[:1], annee)

        r = client.get(
            f"/api/portail-enseignant/{prof.enseignant_id}/classe/{classe.classe_id}/pilotage",
            headers=_headers(client, prof.matricule))
        assert r.status_code == 200
        p = r.json()
        assert p["peut_saisir_notes"] is True
        assert p["peut_calculer_moyennes"] is False
        assert p["motif"]  # le refus dit pourquoi

    def test_il_ne_voit_pas_les_bulletins_de_la_classe(self, client: TestClient, db: Session):
        etab, annee, periode = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "LYC", 8)
        prof = _enseignant(db, etab, classe, matieres[:1], annee)

        r = client.get(
            f"/api/portail-enseignant/{prof.enseignant_id}/classe/{classe.classe_id}"
            f"/bulletins?trimestre_id={periode.trimestre_id}",
            headers=_headers(client, prof.matricule))
        assert r.status_code == 403


class TestLesCasQuiRessemblentSansEnEtre:
    def test_un_prof_de_sport_au_primaire_ne_pilote_rien(self, client: TestClient, db: Session):
        """Le cycle ne suffit pas : il faut assurer TOUTES les matières."""
        etab, annee, periode = _ecole(db)
        classe, matieres = _classe(db, etab, annee, "PRM", 5)
        specialiste = _enseignant(db, etab, classe, matieres[:1], annee)

        r = client.post(
            f"/api/portail-enseignant/{specialiste.enseignant_id}/classe/{classe.classe_id}"
            f"/calculer-moyennes?trimestre_id={periode.trimestre_id}",
            headers=_headers(client, specialiste.matricule))
        assert r.status_code == 403
        assert "instituteur" in r.json()["detail"]

    def test_la_classe_d_une_autre_ecole_reste_invisible(self, client: TestClient, db: Session):
        etab_a, annee_a, _ = _ecole(db)
        classe_a, matieres_a = _classe(db, etab_a, annee_a, "PRM", 3)

        etab_b, annee_b, _ = _ecole(db)
        classe_b, matieres_b = _classe(db, etab_b, annee_b, "PRM", 3)
        instituteur_b = _enseignant(db, etab_b, classe_b, matieres_b, annee_b)

        r = client.get(
            f"/api/portail-enseignant/{instituteur_b.enseignant_id}"
            f"/classe/{classe_a.classe_id}/bulletins",
            headers=_headers(client, instituteur_b.matricule))
        # 404 et non 403 : on ne confirme jamais qu'une classe existe ailleurs.
        assert r.status_code == 404

    def test_la_periode_d_une_autre_annee_est_refusee(self, client: TestClient, db: Session):
        etab_a, annee_a, periode_a = _ecole(db)
        etab_b, annee_b, _ = _ecole(db)
        classe_b, matieres_b = _classe(db, etab_b, annee_b, "PRM", 3)
        instituteur_b = _enseignant(db, etab_b, classe_b, matieres_b, annee_b)

        r = client.post(
            f"/api/portail-enseignant/{instituteur_b.enseignant_id}/classe/{classe_b.classe_id}"
            f"/calculer-moyennes?trimestre_id={periode_a.trimestre_id}",
            headers=_headers(client, instituteur_b.matricule))
        assert r.status_code == 404
