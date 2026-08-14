"""
Migration — le détail d'une retenue d'absence n'a pas de longueur maximale.

CE QUE ÇA RÈGLE
---------------
`ss_bulletins_paie.details_absences` était un VARCHAR(500). Ce champ porte la
justification ligne par ligne d'une retenue de salaire :

    7 h de cours non assurees sur 1 jour(s) d'absence
    2025-11-18 08:00–09:00 Mathématiques (7ème Année A) — 1 h x 18,000
    2025-11-18 09:00–10:00 Mathématiques (7ème Année A) — 1 h x 18,000
    ...

Un professeur qui manque une journée chargée dépasse les 500 caractères. Le
paiement de son salaire échouait alors en erreur serveur, au milieu de
l'opération : constaté sur la paie de TrillionX, deux mois sur neuf.

Tronquer n'était pas une option : une retenue de salaire se conteste, et un
justificatif coupé au milieu d'une ligne ne prouve plus rien. Le champ devient
donc TEXT — une justification n'a pas de longueur naturelle.

Idempotente : relancer ne fait rien si la colonne est déjà en TEXT.

Run with: python backend/migrations/2026_08_paie_01_details_absences_texte.py
          python backend/migrations/2026_08_paie_01_details_absences_texte.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine


def _type_colonne(conn):
    return conn.execute(text("""
        SELECT data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'ss_bulletins_paie' AND column_name = 'details_absences'
    """)).first()


def migrate() -> int:
    with engine.begin() as conn:
        actuel = _type_colonne(conn)
        if not actuel:
            print("[!!] Colonne ss_bulletins_paie.details_absences introuvable.")
            return 1
        type_sql, longueur = actuel
        if type_sql == "text":
            print("   [=]  details_absences est deja en TEXT")
            return 0

        # Combien de justificatifs frôlaient déjà la limite : c'est ce qui dit
        # si des retenues ont été enregistrées incomplètes avant ce correctif.
        proches = conn.execute(text("""
            SELECT count(*) FROM ss_bulletins_paie
            WHERE details_absences IS NOT NULL AND length(details_absences) >= 480
        """)).scalar()

        conn.execute(text(
            "ALTER TABLE ss_bulletins_paie ALTER COLUMN details_absences TYPE TEXT"
        ))
        print(f"   [OK] details_absences : VARCHAR({longueur}) -> TEXT")
        if proches:
            print(f"\n[A REGARDER] {proches} justificatif(s) frolaient la limite des 500")
            print("caracteres. Ils sont peut-etre incomplets : recalculer la paie du")
            print("mois concerne les regenerera entiers.")

    print("\n[DONE] Une retenue de salaire peut porter sa justification complete.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        actuel = _type_colonne(conn)
        if not actuel:
            print("   [!!] colonne introuvable")
            return 1
        type_sql, longueur = actuel
        marque = "[OK]" if type_sql == "text" else "[A FAIRE]"
        borne = "sans limite" if type_sql == "text" else f"limite a {longueur}"
        print(f"   {marque} details_absences : {type_sql} ({borne})")

        plus_long = conn.execute(text("""
            SELECT max(length(details_absences)) FROM ss_bulletins_paie
        """)).scalar()
        print(f"   justificatif le plus long en base : {plus_long or 0} caracteres")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
