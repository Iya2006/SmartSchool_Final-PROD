"""
Migration — une absence d'enseignant se constate d'un côté, se décide de l'autre.

LE PROBLÈME
-----------
La seule route qui enregistre l'absence d'un enseignant vit dans le module
financier, réservé à la direction et au comptable. Or c'est le surveillant qui
constate qu'un professeur n'est pas venu — et lui n'y a pas accès (403 vérifié).

Conséquence : c'est le comptable qui décide qu'un professeur était absent, et
cette décision retire de l'argent sur sa paie. Le comptable n'était pas dans la
cour à 8 h. Celui qui a l'information n'a pas le droit de la saisir ; celui qui
a le droit n'a pas l'information.

CE QUE CETTE MIGRATION AJOUTE
-----------------------------
`statut`      SIGNALE  — constaté par la surveillance, ne touche pas la paie
              VALIDE   — confirmé par la direction, la retenue s'applique
              ECARTE   — écarté après vérification, aucune retenue

`signale_par` qui l'a constatée, et `valide_par` qui a tranché. Une retenue se
conteste : elle doit pouvoir dire de qui elle vient.

CE QUI NE CHANGE PAS
--------------------
Les lignes déjà en base passent en `VALIDE`. Elles ont été saisies par la
direction ou la comptabilité, qui étaient jusqu'ici les seules à le pouvoir :
leur effet sur la paie reste exactement le même qu'avant cette migration.
Aucune retenue existante n'est annulée ni créée.

Idempotente : relançable sans erreur.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402

COLONNES = [
    ("statut", "VARCHAR(20) DEFAULT 'VALIDE'",
     "SIGNALE (constate) / VALIDE (retenue appliquee) / ECARTE"),
    ("signale_par", "VARCHAR(120)", "qui a constate l'absence"),
    ("valide_par", "VARCHAR(120)", "qui a tranche"),
    ("date_signalement", "TIMESTAMP DEFAULT NOW()", "quand elle a ete constatee"),
    ("date_decision", "TIMESTAMP", "quand la direction a tranche"),
]


def main() -> None:
    db = SessionLocal()
    try:
        total = db.execute(text("SELECT count(*) FROM ss_absences_personnel")).scalar()
        print(f"Etat reel avant migration : {total} absence(s) deja enregistree(s).")

        crees, presentes = 0, 0
        for nom, definition, commentaire in COLONNES:
            existe = db.execute(text("""
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'ss_absences_personnel' AND column_name = :c
            """), {"c": nom}).first()
            if existe:
                presentes += 1
                print(f"[deja] {nom:<18} {commentaire}")
                continue
            db.execute(text(
                f"ALTER TABLE ss_absences_personnel ADD COLUMN {nom} {definition}"))
            db.commit()
            crees += 1
            print(f"[OK]   {nom:<18} {commentaire}")

        # Les lignes anterieures gardent leur effet : elles venaient de la
        # direction ou de la comptabilite, donc elles etaient deja des
        # decisions, pas des signalements.
        rattrapees = db.execute(text("""
            UPDATE ss_absences_personnel SET statut = 'VALIDE'
            WHERE statut IS NULL
        """)).rowcount
        db.commit()
        if rattrapees:
            print(f"[OK]   {rattrapees} absence(s) anterieure(s) confirmee(s) en VALIDE.")

        db.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_absences_personnel_statut
            ON ss_absences_personnel (employe_id, statut)
        """))
        db.commit()
        print("[OK]   index (employe_id, statut) pret.")

        repartition = db.execute(text(
            "SELECT statut, count(*) FROM ss_absences_personnel GROUP BY 1 ORDER BY 1"
        )).fetchall()
        print(f"\n[DONE] {crees} colonne(s) creee(s), {presentes} deja presente(s).")
        print(f"       Repartition : {dict(repartition)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
