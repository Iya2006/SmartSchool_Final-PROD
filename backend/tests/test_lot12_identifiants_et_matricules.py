"""
Tests — Lot 12 (chantier multi-écoles) : matricules par établissement,
unicité des identifiants de connexion, et prise de contrôle de compte parent.

Trois problèmes traités ici, tous découverts en produisant la synthèse finale :

1. Le matricule était généré depuis un `COUNT` GLOBAL : une école déduisait le
   volume de toute la plateforme depuis ses propres numéros, et une suppression
   faisait régresser le compteur, régénérant un matricule déjà pris (500).
2. E-mails et téléphones servent à se connecter mais n'étaient pas uniques :
   le second compte portant la même valeur ne pouvait plus jamais se connecter.
3. Saisir le téléphone d'un parent d'une AUTRE école lors d'une inscription
   réécrivait son mot de passe et révélait son nom réel.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.identifiants import identifiant_deja_pris
from app.core.matricules import PREFIXE_ELEVE, generer_matricule
from app.core.security import hash_password, verify_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, EleveParent, Enseignant, Etablissement,
    Inscription, Niveau, Parent, Utilisateur,
)

_COUNTER = 0


def _uid() -> int:
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


class Ecole:
    def __init__(self, db: Session, suffix: str):
        uid = _uid()
        self.etab = Etablissement(
            code=f"L12-{suffix}-{uid}", nom=f"École {suffix} {uid}", type_etablissement="LYCEE",
        )
        db.add(self.etab); db.commit(); db.refresh(self.etab)

        self.annee = AnneeScolaire(
            etablissement_id=self.etab.etablissement_id, code=f"AN{uid}", libelle=f"2025-2026 {uid}",
            date_debut=date(2025, 9, 1), date_fin=date(2026, 7, 1), statut="EN_COURS", est_courante="O",
        )
        db.add(self.annee); db.commit(); db.refresh(self.annee)

        self.cycle = Cycle(etablissement_id=self.etab.etablissement_id, code=f"CY{uid}", libelle="Collège", ordre=1)
        db.add(self.cycle); db.commit(); db.refresh(self.cycle)

        self.niveau = Niveau(cycle_id=self.cycle.cycle_id, code=f"NV{uid}", libelle="6e", ordre=1)
        db.add(self.niveau); db.commit(); db.refresh(self.niveau)

        self.classe = Classe(
            etablissement_id=self.etab.etablissement_id, annee_id=self.annee.annee_id,
            niveau_id=self.niveau.niveau_id, code=f"CL{uid}", libelle=f"6e A {uid}", statut="ACTIVE",
        )
        db.add(self.classe); db.commit(); db.refresh(self.classe)

        self.admin = Utilisateur(
            nom="Admin", prenom=f"L12{uid}", nom_utilisateur=f"l12.admin.{uid}",
            email=f"l12.admin.{uid}@smartschool.gn", telephone=f"65100{uid:04d}",
            mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
            etablissement_id=self.etab.etablissement_id,
        )
        db.add(self.admin); db.commit(); db.refresh(self.admin)


def _headers(client: TestClient, identifiant: str) -> dict:
    resp = client.post(
        "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"}
    )
    assert resp.status_code == 200, f"Login échoué: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['token']}"}


def _creer_eleve(client: TestClient, headers: dict, suffixe: str) -> dict:
    resp = client.post(
        "/api/eleves",
        json={"nom": "Diallo", "prenom": f"Test{suffixe}", "date_naissance": "2012-01-01",
              "sexe": "F", "etablissement_id": 1},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ══════════════════════════════════════════════════════════════
# Matricules par établissement
# ══════════════════════════════════════════════════════════════

class TestMatriculeParEtablissement:
    def test_chaque_ecole_a_sa_propre_numerotation(self, client: TestClient, db: Session):
        """Le compteur global laissait fuiter le volume de la plateforme et
        trouait la numérotation de chaque école."""
        a, b = Ecole(db, "MA"), Ecole(db, "MB")
        h_a, h_b = _headers(client, a.admin.nom_utilisateur), _headers(client, b.admin.nom_utilisateur)

        # A crée 2 élèves, B en intercale un.
        m_a1 = _creer_eleve(client, h_a, "A1")["matricule"]
        _creer_eleve(client, h_b, "B1")
        m_a2 = _creer_eleve(client, h_a, "A2")["matricule"]

        # Le matricule est `ELV-{CODE_ÉCOLE}-{NNNNN}` : on vérifie le suffixe et
        # que les deux matricules de A partagent le même préfixe d'école — donc
        # une numérotation CONTIGUË chez A malgré la création intercalée de B.
        assert m_a1.startswith(f"{PREFIXE_ELEVE}-") and m_a1.endswith("-00001")
        assert m_a2.endswith("-00002")
        assert m_a1.rsplit("-", 1)[0] == m_a2.rsplit("-", 1)[0]

    def test_deux_ecoles_demarrent_toutes_les_deux_a_1(self, client: TestClient, db: Session):
        a, b = Ecole(db, "NA"), Ecole(db, "NB")

        m_a = _creer_eleve(client, _headers(client, a.admin.nom_utilisateur), "A")["matricule"]
        m_b = _creer_eleve(client, _headers(client, b.admin.nom_utilisateur), "B")["matricule"]

        assert m_a.endswith("-00001") and m_b.endswith("-00001")
        assert m_a != m_b, "Les matricules doivent rester globalement uniques (login par matricule)"

    def test_suppression_ne_fait_pas_regresser_le_compteur(self, client: TestClient, db: Session):
        """`COUNT + 1` régénérait un matricule déjà attribué après une
        suppression, ce qui violait l'index unique (500)."""
        a = Ecole(db, "SA")
        headers = _headers(client, a.admin.nom_utilisateur)

        premier = _creer_eleve(client, headers, "1")
        second = _creer_eleve(client, headers, "2")
        assert second["matricule"].endswith("-00002")

        db.query(Eleve).filter(Eleve.eleve_id == second["eleve_id"]).delete()
        db.commit()

        troisieme = _creer_eleve(client, headers, "3")
        assert troisieme["matricule"].endswith("-00003")
        assert troisieme["matricule"] != premier["matricule"]

    def test_generateur_ignore_les_eleves_des_autres_ecoles(self, db: Session):
        a, b = Ecole(db, "GA"), Ecole(db, "GB")
        for i in range(3):
            db.add(Eleve(
                etablissement_id=b.etab.etablissement_id,
                matricule=f"{PREFIXE_ELEVE}-{b.etab.etablissement_id}-{i + 1:05d}",
                nom="X", prenom=f"B{i}", date_naissance=date(2012, 1, 1), sexe="M", statut="ACTIF",
            ))
        db.commit()

        assert generer_matricule(db, Eleve, PREFIXE_ELEVE, a.etab.etablissement_id).endswith("-00001")


# ══════════════════════════════════════════════════════════════
# Unicité des identifiants de connexion
# ══════════════════════════════════════════════════════════════

class TestUniciteIdentifiants:
    def test_meme_telephone_dans_deux_ecoles_desormais_autorise(
        self, client: TestClient, db: Session
    ):
        """RÈGLE INVERSÉE (migration 2026_08_multi_01).

        Ce test exigeait un 409 : le téléphone était unique sur toute la
        plateforme. C'était une impossibilité, pas une protection — un
        enseignant qui exerce dans cinq écoles ne pouvait être inscrit que par
        la première. Chaque école a désormais SA fiche pour cette personne, et
        le code d'établissement les départage au login.
        """
        a, b = Ecole(db, "TA"), Ecole(db, "TB")
        telephone = f"65900{_uid():04d}"

        db.add(Enseignant(
            etablissement_id=b.etab.etablissement_id, matricule=f"L12T-{_uid()}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=telephone,
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        ))
        db.commit()

        resp = client.post(
            "/api/enseignants",
            json={"nom": "Sow", "prenom": "Ibrahima", "sexe": "M", "telephone": telephone,
                  "etablissement_id": a.etab.etablissement_id},
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code in (200, 201), resp.text
        # Deux fiches distinctes, chacune dans son école.
        fiches = db.query(Enseignant).filter(Enseignant.telephone == telephone).all()
        assert len(fiches) == 2
        assert {f.etablissement_id for f in fiches} == {
            a.etab.etablissement_id, b.etab.etablissement_id
        }

    def test_meme_telephone_dans_la_meme_ecole_toujours_refuse(
        self, client: TestClient, db: Session
    ):
        """Ce qui reste interdit : deux comptes du MÊME établissement.

        À l'intérieur d'une école, le code ne départage rien : le second compte
        serait définitivement inconnectable.
        """
        a = Ecole(db, "TS")
        telephone = f"65910{_uid():04d}"

        db.add(Enseignant(
            etablissement_id=a.etab.etablissement_id, matricule=f"L12S-{_uid()}",
            nom="Bah", prenom="Ousmane", sexe="M", telephone=telephone,
            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF",
        ))
        db.commit()

        resp = client.post(
            "/api/enseignants",
            json={"nom": "Sow", "prenom": "Ibrahima", "sexe": "M", "telephone": telephone,
                  "etablissement_id": a.etab.etablissement_id},
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code == 409, resp.text
        # Le message ne révèle toujours ni le propriétaire ni son établissement.
        detail = resp.json()["detail"]
        assert "Bah" not in detail and a.etab.nom not in detail

    def test_collision_inter_tables_detectee(self, client: TestClient, db: Session):
        """Un index unique ne couvre qu'une table : la collision entre le
        téléphone d'un utilisateur et celui d'un enseignant lui échappe."""
        a = Ecole(db, "IA")

        resp = client.post(
            "/api/enseignants",
            json={"nom": "Sow", "prenom": "Ibrahima", "sexe": "M",
                  "telephone": a.admin.telephone,  # déjà celui d'un Utilisateur
                  "etablissement_id": a.etab.etablissement_id},
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code == 409, resp.text

    def test_email_libre_accepte(self, client: TestClient, db: Session):
        a = Ecole(db, "LA")
        uid = _uid()

        resp = client.post(
            "/api/enseignants",
            json={"nom": "Sow", "prenom": "Ibrahima", "sexe": "M",
                  "telephone": f"65700{uid:04d}", "email": f"libre.{uid}@smartschool.gn",
                  "etablissement_id": a.etab.etablissement_id},
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code == 201, resp.text

    def test_valeur_vide_ne_bloque_jamais(self, db: Session):
        """L'e-mail est facultatif : deux fiches sans e-mail ne sont pas des
        doublons."""
        assert identifiant_deja_pris(db, None) is False
        assert identifiant_deja_pris(db, "") is False
        assert identifiant_deja_pris(db, "   ") is False

    def test_ignorer_permet_de_se_modifier_soi_meme(self, db: Session):
        a = Ecole(db, "MO")
        assert identifiant_deja_pris(db, a.admin.email) is True
        assert identifiant_deja_pris(
            db, a.admin.email, ignorer=(Utilisateur, a.admin.utilisateur_id)
        ) is False


# ══════════════════════════════════════════════════════════════
# Prise de contrôle d'un compte parent d'une autre école
# ══════════════════════════════════════════════════════════════

class TestParentPasDePriseDeControle:
    def _parent_avec_enfant(self, db: Session, ecole: Ecole, mot_de_passe: str) -> Parent:
        uid = _uid()
        enfant = Eleve(
            etablissement_id=ecole.etab.etablissement_id, matricule=f"L12PE-{uid}",
            nom="Camara", prenom=f"E{uid}", date_naissance=date(2012, 1, 1), sexe="M", statut="ACTIF",
        )
        db.add(enfant); db.commit(); db.refresh(enfant)
        db.add(Inscription(
            eleve_id=enfant.eleve_id, classe_id=ecole.classe.classe_id,
            annee_id=ecole.annee.annee_id, statut="ACTIVE",
        ))
        parent = Parent(
            # Un parent releve d'UNE ecole depuis la migration 2026_08_multi_01
            # (une fiche par ecole ou l'un de ses enfants est scolarise).
            etablissement_id=ecole.etab.etablissement_id,
            nom="Victime", prenom="Réelle", telephone_1=f"65800{uid:04d}",
            email=f"victime.{uid}@smartschool.gn",
            mot_de_passe=hash_password(mot_de_passe), statut="ACTIF",
        )
        db.add(parent); db.commit(); db.refresh(parent)
        db.add(EleveParent(
            eleve_id=enfant.eleve_id, parent_id=parent.parent_id, lien_parente="PERE",
        ))
        db.commit()
        return parent

    def test_le_mot_de_passe_du_parent_dune_autre_ecole_nest_pas_reecrit(
        self, client: TestClient, db: Session
    ):
        a, b = Ecole(db, "PA"), Ecole(db, "PB")
        victime = self._parent_avec_enfant(db, b, "motdepasseVICTIME")
        hash_avant = victime.mot_de_passe

        resp = client.post(
            "/api/eleves/inscription-complete",
            json={
                "nom": "Nouveau", "prenom": "Élève", "date_naissance": "2012-05-05", "sexe": "M",
                "classe_id": a.classe.classe_id, "annee_id": a.annee.annee_id,
                "parent": {
                    "nom": "Attaquant", "prenom": "Faux",
                    "telephone_1": victime.telephone_1,
                    "lien_parente": "PERE",
                    "mot_de_passe": "motdepasseATTAQUANT",
                },
            },
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code in (200, 201), resp.text

        db.refresh(victime)
        assert victime.mot_de_passe == hash_avant, "Le mot de passe du parent a été réécrit"
        assert verify_password("motdepasseVICTIME", victime.mot_de_passe)
        assert not verify_password("motdepasseATTAQUANT", victime.mot_de_passe)

    def test_le_nom_reel_du_parent_dune_autre_ecole_nest_pas_revele(
        self, client: TestClient, db: Session
    ):
        a, b = Ecole(db, "QA"), Ecole(db, "QB")
        victime = self._parent_avec_enfant(db, b, "motdepasseVICTIME")

        resp = client.post(
            "/api/eleves/inscription-complete",
            json={
                "nom": "Nouveau", "prenom": "Élève", "date_naissance": "2012-05-05", "sexe": "M",
                "classe_id": a.classe.classe_id, "annee_id": a.annee.annee_id,
                "parent": {
                    "nom": "Attaquant", "prenom": "Faux",
                    "telephone_1": victime.telephone_1, "lien_parente": "PERE",
                },
            },
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code in (200, 201), resp.text
        assert "Victime" not in resp.text
        assert "Réelle" not in resp.text

    def test_parent_de_la_meme_ecole_reste_modifiable(self, client: TestClient, db: Session):
        """Le cas légitime ne doit pas être cassé par la correction."""
        a = Ecole(db, "RA")
        parent = self._parent_avec_enfant(db, a, "ancienMotDePasse")

        resp = client.post(
            "/api/eleves/inscription-complete",
            json={
                "nom": "Second", "prenom": "Enfant", "date_naissance": "2013-05-05", "sexe": "F",
                "classe_id": a.classe.classe_id, "annee_id": a.annee.annee_id,
                "parent": {
                    "nom": "Victime", "prenom": "Réelle",
                    "telephone_1": parent.telephone_1, "lien_parente": "PERE",
                    "mot_de_passe": "nouveauMotDePasse",
                },
            },
            headers=_headers(client, a.admin.nom_utilisateur),
        )
        assert resp.status_code in (200, 201), resp.text

        db.refresh(parent)
        assert verify_password("nouveauMotDePasse", parent.mot_de_passe)


def test_matricule_reste_court_pour_une_ecole_a_code_long(db: Session):
    """Une école au code très long ne déborde pas de la colonne matricule
    (String(30)) : le code est nettoyé (alphanumérique) et tronqué à 12."""
    etab = Etablissement(
        code="GROUPE-SCOLAIRE-EXCELLENCE-DE-CONAKRY-2026",
        nom="Groupe Scolaire Excellence de Conakry", type_etablissement="COMPLEXE",
    )
    db.add(etab); db.commit(); db.refresh(etab)

    m = generer_matricule(db, Eleve, PREFIXE_ELEVE, etab.etablissement_id)
    assert len(m) <= 30
    assert m.endswith("-00001")
    assert m.startswith("ELV-GROUPESCOLAI-")  # code nettoyé + tronqué à 12
