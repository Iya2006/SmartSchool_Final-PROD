"""
Migration — une campagne de sujets et un calendrier disent de QUELLE épreuve
il s'agit.

CE QUE ÇA RÈGLE
---------------
Une année scolaire ne contient pas que des compositions. À TrillionX : quatre
évaluations et trois compositions, sept épreuves distinctes, chacune avec ses
sujets à déposer et ses dates à publier.

Or les deux écrans ne connaissaient que la PÉRIODE :

  * « Demander les sujets » envoyait « Merci de déposer vos sujets d'examen
    pour le 1er Semestre ». Un enseignant qui reçoit ça en novembre puis en
    décembre ne sait pas si on lui reparle de la même chose. Et rien ne dit
    s'il s'agit de la 2ᵉ évaluation ou de la composition.
  * Le calendrier d'épreuves s'appelait « Emploi des Examens » et ne portait
    qu'un titre libre. Deux calendriers du même semestre étaient
    indiscernables sans lire leurs créneaux.

CE QUI EST FAIT
---------------
`ss_demandes_emploi` et `ss_emplois_examen` gagnent `type_eval_id` : le type
d'épreuve concerné (Évaluation, Composition, Interrogation... selon ce que
l'école a configuré). Nullable — une campagne peut légitimement viser toute
la période, et les enregistrements existants n'ont pas à être devinés.

`ss_demandes_emploi` gagne aussi `date_limite` : « avant le 7 novembre » est
l'information qui fait déposer un sujet à l'heure. Sans échéance, une relance
ne s'appuie sur rien.

Idempotente.

Run with: python backend/migrations/2026_08_examens_01_type_epreuve.py
          python backend/migrations/2026_08_examens_01_type_epreuve.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

AJOUTS = [
    ("ss_demandes_emploi", "type_eval_id", "INTEGER REFERENCES ss_types_evaluation(type_eval_id)"),
    ("ss_demandes_emploi", "date_limite", "DATE"),
    ("ss_emplois_examen", "type_eval_id", "INTEGER REFERENCES ss_types_evaluation(type_eval_id)"),
]


def _existe(conn, table: str, colonne: str) -> bool:
    return conn.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = :t AND column_name = :c
    """), {"t": table, "c": colonne}).first() is not None


def migrate() -> int:
    with engine.begin() as conn:
        for table, colonne, type_sql in AJOUTS:
            if _existe(conn, table, colonne):
                print(f"   [=]  {table}.{colonne} existe deja")
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {colonne} {type_sql}"))
            print(f"   [OK] {table}.{colonne} ajoutee")

    print("\n[DONE] Une campagne de sujets et un calendrier peuvent nommer leur epreuve.")
    print("Les enregistrements existants restent sans type : on ne devine pas")
    print("apres coup si une demande visait une evaluation ou une composition.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        for table, colonne, _ in AJOUTS:
            present = _existe(conn, table, colonne)
            print(f"   {'[OK]' if present else '[A FAIRE]'} {table}.{colonne}")
        if _existe(conn, "ss_demandes_emploi", "type_eval_id"):
            lignes = conn.execute(text("""
                SELECT count(*) FILTER (WHERE type_eval_id IS NOT NULL) AS avec,
                       count(*) AS total
                FROM ss_demandes_emploi WHERE objet_type = 'EXAMENS'
            """)).first()
            print(f"\n   campagnes de sujets : {lignes[0]} sur {lignes[1]} nomment leur epreuve")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
