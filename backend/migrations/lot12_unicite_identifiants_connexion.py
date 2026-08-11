"""
MIGRATION — Lot 12 (chantier multi-écoles)
Index uniques sur les identifiants de connexion.

Contexte
--------
`POST /api/auth/login` accepte un seul champ `identifiant` et le cherche dans
quatre tables, par `.first()` :

    Utilisateur : nom_utilisateur | email | telephone
    Enseignant  : telephone | email | matricule
    Parent      : telephone_1 | email
    Eleve       : matricule

Seuls `ss_utilisateurs.nom_utilisateur`, `ss_eleves.matricule` et
`ss_enseignants.matricule` portaient un index unique. Les e-mails et
téléphones n'en avaient aucun : deux comptes pouvaient partager la même valeur,
et le second devenait alors définitivement incapable de se connecter — en
silence. En multi-écoles, deux établissements inscrivent naturellement des
personnes différentes portant le même numéro.

Le contrôle applicatif (`app/core/identifiants.py`) couvre aussi les collisions
INTER-tables, qu'aucun index ne peut exprimer. Cette migration ajoute le filet
de sécurité au niveau base pour les collisions intra-table.

Index PARTIELS (`WHERE ... IS NOT NULL AND <> ''`) : l'e-mail et le téléphone
sont facultatifs, et une chaîne vide n'est pas un identifiant. Sans la clause,
tous les enregistrements sans e-mail entreraient en collision entre eux.

Sécurité
--------
- Aucune écriture de données : ni backfill, ni fusion, ni suppression.
- Recherche RÉELLE des doublons avant chaque index. S'il en existe un, la
  migration S'ARRÊTE et les liste : le choix de ce qu'il faut en faire
  appartient à l'exploitant, jamais à ce script.
- Idempotente : `CREATE UNIQUE INDEX IF NOT EXISTS`.
- Non destructive : ne supprime aucun index existant.

Usage :
    cd backend && python migrations/lot12_unicite_identifiants_connexion.py
"""
import os
import sys

import sqlalchemy as sa

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[STOP] DATABASE_URL n'est pas defini.")
    sys.exit(1)

# (table, colonne, nom de l'index)
CIBLES = [
    ("ss_utilisateurs", "email", "uq_utilisateurs_email"),
    ("ss_utilisateurs", "telephone", "uq_utilisateurs_telephone"),
    ("ss_parents", "telephone_1", "uq_parents_telephone_1"),
    ("ss_parents", "email", "uq_parents_email"),
    ("ss_enseignants", "telephone", "uq_enseignants_telephone"),
    ("ss_enseignants", "email", "uq_enseignants_email"),
]


def main() -> int:
    engine = sa.create_engine(DATABASE_URL)
    cree, deja, bloques = 0, 0, []

    with engine.begin() as conn:
        for table, colonne, index in CIBLES:
            existe = conn.execute(sa.text("""
                SELECT 1 FROM pg_indexes WHERE tablename = :t AND indexname = :i
            """), {"t": table, "i": index}).fetchone()
            if existe:
                print(f"[OK] {index} existe deja - rien a faire.")
                deja += 1
                continue

            # Recomptage AU MOMENT de l'execution : un audit prealable ne suffit
            # pas, des doublons ont pu apparaitre entre-temps.
            doublons = conn.execute(sa.text(f"""
                SELECT {colonne}, COUNT(*) AS n
                FROM {table}
                WHERE {colonne} IS NOT NULL AND {colonne} <> ''
                GROUP BY {colonne} HAVING COUNT(*) > 1
                ORDER BY n DESC LIMIT 20
            """)).fetchall()

            if doublons:
                print(f"[STOP] {table}.{colonne} contient {len(doublons)} valeur(s) en double :")
                for valeur, n in doublons:
                    print(f"         {valeur!r} -> {n} enregistrements")
                print("       Index NON cree. Tranchez manuellement quel compte conserve")
                print("       cette valeur avant de rejouer la migration.")
                bloques.append(f"{table}.{colonne}")
                continue

            conn.execute(sa.text(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS {index}
                ON {table} ({colonne})
                WHERE {colonne} IS NOT NULL AND {colonne} <> ''
            """))
            print(f"[OK] {index} cree sur {table}.{colonne} (0 doublon).")
            cree += 1

    print(f"\n[DONE] {cree} index cree(s), {deja} deja present(s), {len(bloques)} bloque(s).")
    if bloques:
        print("       Bloques : " + ", ".join(bloques))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
