"""
Tests — un élève entre dans une classe, et sa scolarité entre avec lui.

CE QUI A ÉTÉ TROUVÉ
-------------------
L'école configure ses tarifs par classe (`ss_tarifs_classe`) : 1 200 000 GNF de
scolarité en 1ère Année, 150 000 GNF d'inscription. C'est la grille réelle, et
le serveur la traite déjà comme la seule source de vérité — il refuse un montant
client qui ne lui correspond pas.

Deux trous, vérifiés sur les données réelles de l'école 3 (68 tarifs configurés) :

1. INSCRIPTION D'UN NOUVEL ÉLÈVE — l'écran d'inscription précharge les montants
   depuis `ss_types_frais.montant_defaut`, qui vaut 0 dans cette école (le
   montant ne vit pas là, il vit dans la grille par classe). Le formulaire
   envoyait donc `montant: 0`, et le serveur faisait `if montant <= 0: continue`.
   Résultat : l'élève est inscrit, placé dans sa classe... et ne doit rien. Aucune
   facture, aucune erreur, aucun message. L'école perdait la scolarité en
   silence, et personne ne pouvait le voir depuis l'écran.

2. RÉINSCRIPTION — `_generer_frais_reinscription` appelait
   `generer_numero_facture(db, etablissement_id, ...)` alors que
   `etablissement_id` n'est pas un paramètre de cette fonction : NameError, donc
   500. Le chemin ne s'ouvrait qu'une fois la première facture atteinte, c'est-à-
   dire uniquement quand la classe cible a des tarifs configurés — exactement le
   cas d'une école qui travaille pour de vrai. Une école sans tarif sortait avant
   (`if not tarifs: return 0`) et ne voyait rien.

LA RÈGLE POSÉE
--------------
La grille tarifaire de la classe s'applique d'elle-même. L'écran n'a pas à
connaître les montants pour que la scolarité soit due : il peut les proposer,
mais c'est le serveur qui tranche. Un montant client qui contredit la grille est
toujours refusé — ce garde-fou-là ne bouge pas.
"""
from datetime import date

import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Etablissement, Facture, Inscription, Niveau,
    TarifClasse, TypeFrais, Utilisateur, Eleve,
)

_JETON = uuid.uuid4().hex[:6]
_C = 0

SCOLARITE = 1_200_000
INSCRIPTION = 150_000
CANTINE = 300_000


def _uid() -> int:
    global _C
    _C += 1
    return _C


@pytest.fixture
def ecole(db: Session):
    """Une école qui a fait son travail : des tarifs par classe, pas un
    montant par défaut d'établissement."""
    uid = _uid()
    etab = Etablissement(code=f"SCO-{_JETON}-{uid}", nom=f"École SCO {uid}",
                         type_etablissement="COLLEGE")
    db.add(etab); db.commit(); db.refresh(etab)
    eid = etab.etablissement_id

    annee = AnneeScolaire(
        etablissement_id=eid, code=f"AN{_JETON}{uid}", libelle="2025-2026",
        date_debut=date(2025, 10, 1), date_fin=date(2026, 6, 30),
        est_courante="O", statut="EN_COURS",
    )
    db.add(annee); db.commit(); db.refresh(annee)

    cycle = Cycle(etablissement_id=eid, code=f"CO{_JETON}{uid}", libelle="Collège",
                  ordre=2)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N7{_JETON}{uid}",
                    libelle="7ème Année", ordre=1)
    db.add(niveau); db.commit(); db.refresh(niveau)

    classe = Classe(
        etablissement_id=eid, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"7A{_JETON}{uid}", libelle="7ème Année A", capacite_max=50,
        effectif_actuel=0, statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)

    # Les montants vivent dans la grille par classe. Le défaut d'établissement
    # reste à 0 — c'est exactement la configuration de l'école 3.
    frais = {}
    for code, libelle, oblig, montant in [
        ("SCO", "Frais de scolarité", "O", SCOLARITE),
        ("INS", "Frais d'inscription", "O", INSCRIPTION),
        ("CAN", "Cantine", "N", CANTINE),
    ]:
        tf = TypeFrais(etablissement_id=eid, code=f"{code}{_JETON}{uid}",
                       libelle=libelle, categorie="SCOLARITE", montant_defaut=0,
                       est_obligatoire=oblig, statut="ACTIF")
        db.add(tf); db.commit(); db.refresh(tf)
        db.add(TarifClasse(classe_id=classe.classe_id,
                           type_frais_id=tf.type_frais_id, montant=montant))
        frais[code] = tf
    db.commit()

    admin = Utilisateur(
        nom="Camara", prenom="Direction",
        nom_utilisateur=f"dir.{_JETON}.{uid}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN",
        statut="ACTIF", etablissement_id=eid,
    )
    db.add(admin); db.commit(); db.refresh(admin)

    return {"etab": etab, "annee": annee, "classe": classe, "frais": frais,
            "admin": admin}


def _headers(client: TestClient, login: str) -> dict:
    r = client.post("/api/auth/login",
                    json={"identifiant": login, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _inscrire(client, headers, classe_id, frais_scolaires=None, nom="Diallo"):
    corps = {
        "nom": nom, "prenom": "Mariama", "date_naissance": "2012-05-14",
        "sexe": "F", "classe_id": classe_id,
    }
    if frais_scolaires is not None:
        corps["frais_scolaires"] = frais_scolaires
    return client.post("/api/eleves/inscription-complete", headers=headers,
                       json=corps)


def _factures(db: Session, eleve_id: int):
    return db.query(Facture).join(
        Inscription, Inscription.inscription_id == Facture.inscription_id
    ).filter(Inscription.eleve_id == eleve_id).all()


class TestUnNouvelEleveArriveAvecSaScolarite:

    def test_sans_montants_envoyes_la_grille_de_la_classe_s_applique(
            self, client: TestClient, db: Session, ecole):
        """L'écran n'envoie rien : la scolarité est due quand même."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _inscrire(client, h, ecole["classe"].classe_id)
        assert r.status_code == 201, r.text

        factures = _factures(db, r.json()["eleve_id"])
        montants = sorted(float(f.montant_net) for f in factures)
        # Les deux frais obligatoires, pas la cantine.
        assert montants == [INSCRIPTION, SCOLARITE], montants
        assert r.json()["factures_generees"] == 2

    def test_montants_a_zero_ne_font_pas_disparaitre_la_scolarite(
            self, client: TestClient, db: Session, ecole):
        """Le cas réel : le formulaire préchargeait 0 depuis le défaut
        d'établissement. Un 0 ne vaut pas « gratuit » quand la classe a un
        tarif — c'est le tarif qui gagne."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        zeros = [{"type_frais_id": tf.type_frais_id, "montant": 0}
                 for tf in ecole["frais"].values()]
        r = _inscrire(client, h, ecole["classe"].classe_id, frais_scolaires=zeros)
        assert r.status_code == 201, r.text

        factures = _factures(db, r.json()["eleve_id"])
        montants = sorted(float(f.montant_net) for f in factures)
        assert SCOLARITE in montants, "la scolarité a disparu en silence"
        assert INSCRIPTION in montants

    def test_la_cantine_choisie_a_zero_prend_son_tarif(
            self, client: TestClient, db: Session, ecole):
        """Un frais facultatif coché reste facultatif dans son principe, mais
        s'il est coché il vaut le tarif de la classe, pas zéro."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _inscrire(client, h, ecole["classe"].classe_id, frais_scolaires=[
            {"type_frais_id": ecole["frais"]["CAN"].type_frais_id, "montant": 0},
        ])
        assert r.status_code == 201, r.text
        montants = [float(f.montant_net) for f in _factures(db, r.json()["eleve_id"])]
        assert CANTINE in montants, montants

    def test_un_montant_qui_contredit_la_grille_est_toujours_refuse(
            self, client: TestClient, ecole):
        """Ce garde-fou existait déjà et ne doit pas bouger : on ne facture
        pas 500 000 GNF une classe tarifée 1 200 000."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _inscrire(client, h, ecole["classe"].classe_id, frais_scolaires=[
            {"type_frais_id": ecole["frais"]["SCO"].type_frais_id,
             "montant": 500_000},
        ])
        assert r.status_code == 400, r.text
        assert "tarif" in r.json()["detail"].lower()

    def test_sans_classe_aucune_facture(self, client: TestClient, db: Session, ecole):
        """Un élève enregistré sans classe n'a pas de scolarité : on ne sait
        pas encore ce qu'il doit."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = client.post("/api/eleves/inscription-complete", headers=h, json={
            "nom": "Sow", "prenom": "Ibrahima", "date_naissance": "2011-03-02",
            "sexe": "M",
        })
        assert r.status_code == 201, r.text
        assert r.json()["factures_generees"] == 0

    def test_l_eleve_est_bien_place_dans_sa_classe(
            self, client: TestClient, db: Session, ecole):
        """Inscrire, c'est aussi asseoir l'élève quelque part."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        avant = ecole["classe"].effectif_actuel or 0
        r = _inscrire(client, h, ecole["classe"].classe_id)
        assert r.status_code == 201, r.text

        insc = db.query(Inscription).filter(
            Inscription.eleve_id == r.json()["eleve_id"]).first()
        assert insc is not None
        assert insc.classe_id == ecole["classe"].classe_id
        assert insc.annee_id == ecole["annee"].annee_id
        assert insc.statut == "ACTIVE"
        db.refresh(ecole["classe"])
        assert ecole["classe"].effectif_actuel == avant + 1

    def test_le_matricule_est_attribue(self, client: TestClient, ecole):
        h = _headers(client, ecole["admin"].nom_utilisateur)
        r = _inscrire(client, h, ecole["classe"].classe_id)
        assert r.status_code == 201, r.text
        assert r.json()["matricule"], "un élève sans matricule ne se retrouve pas"


class TestLaReinscriptionNePlantePlus:

    def test_confirmer_une_reinscription_genere_les_frais(
            self, client: TestClient, db: Session, ecole):
        """Le cas qui levait NameError : une classe cible AVEC des tarifs.

        Sans tarifs la fonction sortait avant la ligne fautive, donc le défaut
        restait invisible tant que l'école n'avait rien configuré.
        """
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eid = ecole["etab"].etablissement_id

        # L'année suivante, avec sa classe et sa grille.
        annee2 = AnneeScolaire(
            etablissement_id=eid, code=f"AN2{_JETON}", libelle="2026-2027",
            date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
            est_courante="N", statut="PLANIFIEE",
        )
        db.add(annee2); db.commit(); db.refresh(annee2)
        classe2 = Classe(
            etablissement_id=eid, annee_id=annee2.annee_id,
            niveau_id=ecole["classe"].niveau_id, code=f"8A{_JETON}",
            libelle="8ème Année A", capacite_max=50, effectif_actuel=0,
            statut="ACTIVE",
        )
        db.add(classe2); db.commit(); db.refresh(classe2)
        db.add(TarifClasse(classe_id=classe2.classe_id,
                           type_frais_id=ecole["frais"]["SCO"].type_frais_id,
                           montant=SCOLARITE))
        db.commit()

        # Un élève de l'an dernier, promu et validé.
        r = _inscrire(client, h, ecole["classe"].classe_id, nom="Barry")
        assert r.status_code == 201, r.text
        insc = db.query(Inscription).filter(
            Inscription.eleve_id == r.json()["eleve_id"]).first()
        insc.statut_promotion = "VALIDE"
        insc.statut_reinscription = "A_REINSCRIRE"
        insc.classe_cible_id = classe2.classe_id
        db.commit()

        rep = client.post(f"/api/reinscription/{insc.inscription_id}/confirmer",
                          headers=h)
        assert rep.status_code == 200, rep.text
        assert rep.json()["factures_generees"] == 1

        nouvelle = db.query(Inscription).filter(
            Inscription.eleve_id == insc.eleve_id,
            Inscription.classe_id == classe2.classe_id).first()
        assert nouvelle is not None
        facture = db.query(Facture).filter(
            Facture.inscription_id == nouvelle.inscription_id).first()
        assert facture is not None
        assert float(facture.montant_net) == SCOLARITE
        assert facture.numero_facture, "une facture sans numéro ne se retrouve pas"

    def test_une_classe_cible_sans_tarif_ne_facture_rien(
            self, client: TestClient, db: Session, ecole):
        """Une école qui n'a pas encore posé sa grille réinscrit quand même :
        on ne bloque pas l'élève parce que la comptabilité n'est pas prête."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        eid = ecole["etab"].etablissement_id
        annee2 = AnneeScolaire(
            etablissement_id=eid, code=f"AN3{_JETON}", libelle="2026-2027",
            date_debut=date(2026, 10, 1), date_fin=date(2027, 6, 30),
            est_courante="N", statut="PLANIFIEE",
        )
        db.add(annee2); db.commit(); db.refresh(annee2)
        classe2 = Classe(
            etablissement_id=eid, annee_id=annee2.annee_id,
            niveau_id=ecole["classe"].niveau_id, code=f"8B{_JETON}",
            libelle="8ème Année B", capacite_max=50, effectif_actuel=0,
            statut="ACTIVE",
        )
        db.add(classe2); db.commit(); db.refresh(classe2)

        r = _inscrire(client, h, ecole["classe"].classe_id, nom="Kolie")
        insc = db.query(Inscription).filter(
            Inscription.eleve_id == r.json()["eleve_id"]).first()
        insc.statut_promotion = "VALIDE"
        insc.statut_reinscription = "A_REINSCRIRE"
        insc.classe_cible_id = classe2.classe_id
        db.commit()

        rep = client.post(f"/api/reinscription/{insc.inscription_id}/confirmer",
                          headers=h)
        assert rep.status_code == 200, rep.text
        assert rep.json()["factures_generees"] == 0


class TestChaqueEcoleResteChezElle:

    def test_le_tarif_d_une_autre_ecole_ne_s_applique_pas(
            self, client: TestClient, db: Session, ecole):
        """Le type de frais d'une autre école est refusé — sinon une facture
        pouvait porter le libellé d'un établissement étranger."""
        h = _headers(client, ecole["admin"].nom_utilisateur)
        autre = Etablissement(code=f"AUT-{_JETON}", nom="Autre école",
                              type_etablissement="LYCEE")
        db.add(autre); db.commit(); db.refresh(autre)
        tf_autre = TypeFrais(etablissement_id=autre.etablissement_id,
                             code=f"XX{_JETON}", libelle="Frais d'ailleurs",
                             categorie="SCOLARITE", montant_defaut=999,
                             est_obligatoire="O", statut="ACTIF")
        db.add(tf_autre); db.commit(); db.refresh(tf_autre)

        r = _inscrire(client, h, ecole["classe"].classe_id, frais_scolaires=[
            {"type_frais_id": tf_autre.type_frais_id, "montant": 999},
        ])
        assert r.status_code == 404, r.text
