"""
Migration — un rôle porte le salaire de référence de son poste.

CE QUE ÇA RÈGLE
---------------
Une école raisonne par poste : « un surveillant, c'est 1 400 000 ; un censeur,
2 800 000 ». Ce montant se décidait jusqu'ici personne par personne, au
moment de créer chaque compte. Sur une école qui embauche trois surveillants
dans l'année, la direction devait se souvenir du chiffre — ou le retrouver sur
une fiche existante.

Le rôle porte désormais son salaire de référence et sa prime. Créer quelqu'un
avec ce rôle pré-remplit les deux.

CE QUE CE MONTANT N'EST PAS
---------------------------
Ce n'est PAS le salaire réel : celui-là reste sur la fiche de la personne
(`ss_utilisateurs.salaire_base`). Deux surveillants ne sont pas payés pareil —
l'ancienneté, la négociation, un temps partiel. Si le montant du rôle faisait
foi, modifier la grille réécrirait en silence la paie de tout le monde, y
compris de ceux dont le contrat dit autre chose.

C'est donc une proposition au moment de l'embauche, que la direction accepte
ou corrige. La paie continue de lire la fiche, et elle seule.

Idempotente.

Run with: python backend/migrations/2026_08_roles_02_grille_salariale.py
          python backend/migrations/2026_08_roles_02_grille_salariale.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

COLONNES = {
    "salaire_mensuel": "NUMERIC(15, 2)",
    "prime_mensuelle": "NUMERIC(15, 2)",
}


def _presentes(conn) -> set:
    lignes = conn.execute(text("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'ss_roles' AND column_name = ANY(:cols)
    """), {"cols": list(COLONNES)}).fetchall()
    return {nom for (nom,) in lignes}


def migrate() -> int:
    with engine.begin() as conn:
        deja = _presentes(conn)
        for colonne, type_sql in COLONNES.items():
            if colonne in deja:
                print(f"   [=]  ss_roles.{colonne} existe deja")
                continue
            conn.execute(text(f"ALTER TABLE ss_roles ADD COLUMN {colonne} {type_sql}"))
            print(f"   [OK] ss_roles.{colonne} ajoutee")

    print("\n[DONE] Un role peut porter le salaire de reference de son poste.")
    print("Ce montant pre-remplit la fiche a l'embauche ; c'est la fiche de la")
    print("personne qui fait foi pour la paie, jamais la grille.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        deja = _presentes(conn)
        for colonne in COLONNES:
            print(f"   {'[OK]' if colonne in deja else '[A FAIRE]'} ss_roles.{colonne}")
        if len(deja) == len(COLONNES):
            lignes = conn.execute(text("""
                SELECT etablissement_id, code, libelle, salaire_mensuel, prime_mensuelle
                FROM ss_roles WHERE salaire_mensuel IS NOT NULL
                ORDER BY etablissement_id, code
            """)).fetchall()
            if lignes:
                print("\n   Grille en place :")
                for eid, code, libelle, salaire, prime in lignes:
                    print(f"      ecole {eid} : {code:<16} {libelle:<26} "
                          f"{float(salaire):>12,.0f} + {float(prime or 0):>10,.0f}")
            else:
                print("\n   Aucun role ne porte encore de salaire de reference.")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
