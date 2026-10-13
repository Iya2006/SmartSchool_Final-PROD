"""
Suppression d'une personne et de tout ce qui dépend d'elle.

POURQUOI CE MODULE EXISTE
Les routes de suppression faisaient `db.delete(personne)` et rien d'autre. Or
une personne est référencée partout : un élève par ses inscriptions, qui
portent elles-mêmes bulletins, factures, notes et présences ; un enseignant par
ses affectations, ses séances, ses évaluations. PostgreSQL refusait donc la
suppression sur violation de clé étrangère, et l'école voyait une erreur
technique sans comprendre pourquoi « ça ne marche pas ». Supprimer suppose de
démonter la dépendance dans l'ordre — c'est ce que fait ce module, en une seule
transaction.

CE QUI N'EST JAMAIS SUPPRIMÉ, ET POURQUOI
Deux familles de données survivent à la personne, détachées et non effacées :

- **Les écritures comptables** (`ss_lignes_ecritures`). Une écriture est
  équilibrée : débit = crédit. En effacer une ligne parce que l'élève s'en va
  déséquilibre le journal et fausse définitivement les comptes de l'école.
  L'argent a été encaissé, il doit rester dans les livres. On retire seulement
  le lien vers l'élève (le compte auxiliaire), pas le mouvement.
- **Les dépenses** (`ss_depenses`). Une dépense engagée par l'école lui
  appartient, même si elle avait été rattachée à un élève.

Même raisonnement pour les **séances déjà tenues** : le cours a eu lieu, il
reste à l'emploi du temps ; seul le nom de l'enseignant s'en détache.

Les tables sont nommées en SQL plutôt que par leurs modèles : la liste se lit
d'un coup, dans l'ordre exact où elle s'exécute, et c'est cet ordre qui est le
cœur du sujet.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session


def _executer(db: Session, requete: str, **params) -> int:
    """Exécute une instruction et renvoie le nombre de lignes touchées."""
    return db.execute(text(requete), params).rowcount or 0


def supprimer_eleve(db: Session, eleve_id: int) -> dict:
    """
    Démonte tout ce qui dépend d'un élève, puis le supprime.

    L'appelant reste responsable de vérifier que l'élève appartient bien à
    l'établissement appelant, et de committer.
    """
    compte = {}

    # 1) Ce qui pend aux FACTURES de ses inscriptions (petits-enfants d'abord).
    compte["paiements"] = _executer(db, """
        DELETE FROM ss_paiements WHERE facture_id IN (
            SELECT f.facture_id FROM ss_factures f
            JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
            WHERE i.eleve_id = :id)
    """, id=eleve_id)
    compte["echeances"] = _executer(db, """
        DELETE FROM ss_echeances_factures WHERE facture_id IN (
            SELECT f.facture_id FROM ss_factures f
            JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
            WHERE i.eleve_id = :id)
    """, id=eleve_id)

    # 2) Ce qui pend aux BULLETINS de ses inscriptions.
    compte["lignes_bulletin"] = _executer(db, """
        DELETE FROM ss_bulletin_lignes WHERE bulletin_id IN (
            SELECT b.bulletin_id FROM ss_bulletins b
            JOIN ss_inscriptions i ON i.inscription_id = b.inscription_id
            WHERE i.eleve_id = :id)
    """, id=eleve_id)

    # 3) Les enfants directs des INSCRIPTIONS.
    for table, cle in [
        ("ss_factures", "factures"),
        ("ss_bulletins", "bulletins"),
        ("ss_notes", "notes"),
        ("ss_presences", "presences"),
        ("ss_resultats_officiels_examen", "resultats_examen"),
    ]:
        compte[cle] = _executer(db, f"""
            DELETE FROM {table} WHERE inscription_id IN (
                SELECT inscription_id FROM ss_inscriptions WHERE eleve_id = :id)
        """, id=eleve_id)

    compte["inscriptions"] = _executer(
        db, "DELETE FROM ss_inscriptions WHERE eleve_id = :id", id=eleve_id)

    # 4) Les enfants directs de l'ÉLÈVE.
    for table, cle in [
        ("ss_eleve_parent", "liens_parents"),
        ("ss_emprunts", "emprunts"),
        ("ss_incidents", "incidents"),
        ("ss_pointage_eleves", "pointages"),
    ]:
        compte[cle] = _executer(db, f"DELETE FROM {table} WHERE eleve_id = :id", id=eleve_id)

    # 5) Ce qui SURVIT, détaché (voir l'en-tête du module).
    compte["ecritures_detachees"] = _executer(
        db, "UPDATE ss_lignes_ecritures SET eleve_id = NULL WHERE eleve_id = :id", id=eleve_id)
    compte["depenses_detachees"] = _executer(
        db, "UPDATE ss_depenses SET eleve_id = NULL WHERE eleve_id = :id", id=eleve_id)

    compte["eleve"] = _executer(db, "DELETE FROM ss_eleves WHERE eleve_id = :id", id=eleve_id)
    return compte


def supprimer_enseignant(db: Session, enseignant_id: int) -> dict:
    """
    Démonte tout ce qui dépend d'un enseignant, puis le supprime.

    Les SÉANCES et les ÉVALUATIONS déjà tenues ne sont pas effacées : le cours
    a eu lieu, les notes appartiennent aux élèves. Seul le lien vers
    l'enseignant est retiré — sinon supprimer un professeur effacerait les
    notes de ses classes.
    """
    compte = {}

    # Ce qui n'a plus de sens sans lui.
    for table, cle in [
        ("ss_affectations", "affectations"),
        ("ss_creneaux_emploi", "creneaux"),
        ("ss_disponibilites", "disponibilites"),
        ("ss_devoirs", "devoirs"),
        ("ss_ressources_pedagogiques", "ressources"),
        ("ss_sujets_examen", "sujets_examen"),
    ]:
        compte[cle] = _executer(db, f"DELETE FROM {table} WHERE enseignant_id = :id", id=enseignant_id)

    compte["emprunts"] = _executer(
        db, "DELETE FROM ss_emprunts WHERE enseignant_id = :id", id=enseignant_id)

    # Ce qui survit, détaché.
    compte["classes_detachees"] = _executer(
        db, "UPDATE ss_classes SET professeur_principal = NULL WHERE professeur_principal = :id",
        id=enseignant_id)
    compte["seances_detachees"] = _executer(
        db, "UPDATE ss_seances SET enseignant_prevu_id = NULL WHERE enseignant_prevu_id = :id",
        id=enseignant_id)
    compte["seances_detachees"] += _executer(
        db, "UPDATE ss_seances SET enseignant_reel_id = NULL WHERE enseignant_reel_id = :id",
        id=enseignant_id)
    compte["evaluations_detachees"] = _executer(
        db, "UPDATE ss_evaluations SET enseignant_id = NULL WHERE enseignant_id = :id",
        id=enseignant_id)
    compte["sessions_detachees"] = _executer(
        db, "UPDATE ss_evaluation_sessions SET enseignant_id = NULL WHERE enseignant_id = :id",
        id=enseignant_id)

    compte["enseignant"] = _executer(
        db, "DELETE FROM ss_enseignants WHERE enseignant_id = :id", id=enseignant_id)
    return compte


def supprimer_parent(db: Session, parent_id: int) -> dict:
    """Retire un parent et ses rattachements aux élèves."""
    compte = {}
    compte["liens_eleves"] = _executer(
        db, "DELETE FROM ss_eleve_parent WHERE parent_id = :id", id=parent_id)
    compte["parent"] = _executer(
        db, "DELETE FROM ss_parents WHERE parent_id = :id", id=parent_id)
    return compte
