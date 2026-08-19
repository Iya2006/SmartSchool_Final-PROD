"""
Import en masse des élèves (Excel/CSV).

Un fichier peut mélanger toutes les classes : chaque élève est créé (matricule
auto, mot de passe par défaut) et inscrit dans la classe indiquée. Les lignes
dont la classe est introuvable ou la date invalide sont ignorées avec une raison,
sans bloquer les autres.
"""
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.academique import (
    AnneeScolaire, Classe, Cycle, Eleve, Etablissement, Facture, Inscription,
    Niveau, TarifClasse, TypeFrais, Utilisateur,
)

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def _headers(client: TestClient, identifiant: str) -> dict:
    r = client.post("/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": "motdepasse123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _ecole(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"IMP-{uid}", nom=f"École {uid}", type_etablissement="PRIMAIRE")
    db.add(etab); db.commit(); db.refresh(etab)
    annee = AnneeScolaire(
        etablissement_id=etab.etablissement_id, code=f"AN{uid}", libelle="2026-2027",
        date_debut=date(2026, 9, 1), date_fin=date(2027, 7, 1), statut="EN_COURS", est_courante="O",
    )
    db.add(annee); db.commit(); db.refresh(annee)
    cycle = Cycle(etablissement_id=etab.etablissement_id, code="PRM", libelle="Primaire", ordre=1)
    db.add(cycle); db.commit(); db.refresh(cycle)
    niveau = Niveau(cycle_id=cycle.cycle_id, code=f"N{uid}", libelle="2ème année", ordre=2)
    db.add(niveau); db.commit(); db.refresh(niveau)
    classe = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"C2-{uid}", libelle="2eme annee", statut="ACTIVE",
    )
    db.add(classe); db.commit(); db.refresh(classe)
    admin = Utilisateur(
        nom="Admin", prenom=f"I{uid}", nom_utilisateur=f"imp.admin.{uid}",
        email=f"imp.admin.{uid}@smartschool.gn", telephone=f"66600{uid:04d}",
        mot_de_passe=hash_password("motdepasse123"), role="ADMIN", statut="ACTIF",
        etablissement_id=etab.etablissement_id,
    )
    db.add(admin); db.commit(); db.refresh(admin)
    return etab, annee, classe, admin


def test_import_cree_les_eleves_et_ignore_les_classes_inconnues(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)

    csv = (
        "Nom;Prénom;Sexe;Date de naissance;Lieu de naissance;Téléphone;E-mail;Adresse;Groupe sanguin;Classe\n"
        "Camara;Mariam;F;12/03/2015;Conakry;620000000;;Madina;O+;2eme annee\n"
        "Bah;Ousmane;M;01/01/2014;;;;;;Classe Fantome\n"
        ";SansNom;M;01/01/2014;;;;;;2eme annee\n"
    )
    r = client.post(
        "/api/eleves/import",
        files={"fichier": ("eleves.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["crees"] == 1
    assert len(data["ignorees"]) == 2  # classe fantôme + nom manquant

    eleve = db.query(Eleve).filter(
        Eleve.etablissement_id == etab.etablissement_id, Eleve.nom == "Camara"
    ).first()
    assert eleve is not None
    assert eleve.matricule  # attribué automatiquement
    assert verify_password("12345678", eleve.mot_de_passe)  # mot de passe par défaut
    insc = db.query(Inscription).filter(Inscription.eleve_id == eleve.eleve_id).first()
    assert insc is not None and insc.classe_id == classe.classe_id and insc.annee_id == annee.annee_id
    assert insc.type_inscription == "REINSCRIPTION"


def test_import_en_masse_genere_les_frais_avec_numeros_uniques(client: TestClient, db: Session):
    """Import en masse : chaque élève reçoit sa facture de scolarité, avec des
    numéros de facture tous distincts (le chemin rapide numérote en mémoire),
    et l'effectif de la classe est incrémenté du bon nombre."""
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)

    # Frais de scolarité OBLIGATOIRE + tarif de la classe.
    tf = TypeFrais(
        etablissement_id=etab.etablissement_id, code="SCO", libelle="Scolarité",
        categorie="Scolarité", montant_defaut=100000, est_obligatoire="O",
        frequence="ANNUEL", statut="ACTIF",
    )
    db.add(tf); db.commit(); db.refresh(tf)
    db.add(TarifClasse(type_frais_id=tf.type_frais_id, classe_id=classe.classe_id, montant=100000))
    db.commit()

    effectif_avant = classe.effectif_actuel or 0
    lignes = "".join(
        f"Eleve{n};Prenom{n};M;0{n}/01/2014;;;;;;2eme annee\n" for n in range(1, 6)
    )
    csv = "Nom;Prénom;Sexe;Date de naissance;Lieu de naissance;Téléphone;E-mail;Adresse;Groupe sanguin;Classe\n" + lignes
    r = client.post(
        "/api/eleves/import",
        files={"fichier": ("eleves.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["crees"] == 5

    inscriptions = db.query(Inscription).filter(Inscription.classe_id == classe.classe_id).all()
    assert len(inscriptions) == 5
    factures = db.query(Facture).filter(
        Facture.inscription_id.in_([i.inscription_id for i in inscriptions])
    ).all()
    assert len(factures) == 5  # une scolarité par élève
    numeros = [f.numero_facture for f in factures]
    assert len(set(numeros)) == 5  # tous distincts

    db.refresh(classe)
    assert (classe.effectif_actuel or 0) == effectif_avant + 5

    matricules = [e.matricule for e in db.query(Eleve).filter(
        Eleve.etablissement_id == etab.etablissement_id
    ).all()]
    assert len(set(matricules)) == len(matricules)  # matricules uniques


def test_import_deux_fois_ne_cree_pas_de_doublon(client: TestClient, db: Session):
    """Relancer le MÊME import ne recrée pas les élèves : le 2e passage les
    signale « déjà présent » et n'écrit rien de plus (import idempotent)."""
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)
    csv = (
        "Nom;Prénom;Sexe;Date de naissance;Classe\n"
        "Camara;Mariam;F;12/03/2015;2eme annee\n"
        "Bah;Ousmane;M;01/01/2014;2eme annee\n"
    )
    files = {"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")}

    r1 = client.post("/api/eleves/import", files=files, headers=headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["crees"] == 2

    # Deuxième import identique : rien de créé, les 2 lignes ignorées.
    r2 = client.post(
        "/api/eleves/import",
        files={"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["crees"] == 0
    assert len(r2.json()["ignorees"]) == 2

    total = db.query(Eleve).filter(Eleve.etablissement_id == etab.etablissement_id).count()
    assert total == 2  # toujours 2, pas 4


def test_import_sans_date_de_naissance(client: TestClient, db: Session):
    """Seuls classe + nom + prénom sont exigés : un élève sans date est importé
    (date_naissance vide), à compléter plus tard."""
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)
    csv = (
        "Nom;Prénom;Classe\n"
        "Keita;Sekou;2eme annee\n"
    )
    r = client.post(
        "/api/eleves/import",
        files={"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["crees"] == 1
    e = db.query(Eleve).filter(
        Eleve.etablissement_id == etab.etablissement_id, Eleve.nom == "Keita"
    ).first()
    assert e is not None and e.date_naissance is None


def test_import_classe_tolere_les_ordinaux(client: TestClient, db: Session):
    """« 1 ANNEE » dans le fichier retrouve la classe « 1ère Année » de l'école
    (ordinaux 1er/1ère/2ème/8e… tolérés, en plus des accents/casse)."""
    etab, annee, _classe2, admin = _ecole(db)
    # Une classe nommée avec l'ordinal accentué.
    uid = _uid()
    niveau = db.query(Niveau).first()
    c1 = Classe(
        etablissement_id=etab.etablissement_id, annee_id=annee.annee_id, niveau_id=niveau.niveau_id,
        code=f"C1-{uid}", libelle="1ère Année", statut="ACTIVE",
    )
    db.add(c1); db.commit(); db.refresh(c1)
    headers = _headers(client, admin.nom_utilisateur)

    csv = "Nom;Prénom;Classe\nSoumah;Abdoulaye;1 ANNEE\n"
    r = client.post(
        "/api/eleves/import",
        files={"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["crees"] == 1
    insc = db.query(Inscription).filter(Inscription.classe_id == c1.classe_id).first()
    assert insc is not None  # bien placé dans « 1ère Année »


def test_import_homonymes_meme_classe_tous_importes_puis_reimport_sans_doublon(client: TestClient, db: Session):
    """Deux enfants de la MÊME classe, même nom, sans date : les DEUX sont
    importés (vrais homonymes). Un ré-import du même fichier n'en recrée aucun."""
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)
    csv = "Nom;Prénom;Classe\nCamara;Mohamed;2eme annee\nCamara;Mohamed;2eme annee\n"
    files = {"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")}

    r1 = client.post("/api/eleves/import", files=files, headers=headers)
    assert r1.status_code == 200, r1.text
    assert r1.json()["crees"] == 2  # les deux homonymes passent

    r2 = client.post(
        "/api/eleves/import",
        files={"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r2.json()["crees"] == 0  # ré-import : rien de plus
    assert db.query(Eleve).filter(Eleve.etablissement_id == etab.etablissement_id).count() == 2


def test_import_dry_run_n_ecrit_rien(client: TestClient, db: Session):
    etab, annee, classe, admin = _ecole(db)
    headers = _headers(client, admin.nom_utilisateur)
    csv = (
        "Nom;Prénom;Sexe;Date de naissance;Classe\n"
        "Sylla;Fatou;F;05/05/2015;2eme annee\n"
    )
    r = client.post(
        "/api/eleves/import?dry_run=true",
        files={"fichier": ("e.csv", csv.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["crees"] == 1
    # Rien écrit en base.
    assert db.query(Eleve).filter(Eleve.etablissement_id == etab.etablissement_id).count() == 0
