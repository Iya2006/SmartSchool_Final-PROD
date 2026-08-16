"""
MIGRATION — aligne les contraintes NOT NULL de la base sur les modèles.

Pourquoi
--------
La base était plus STRICTE que le code sur quatre colonnes : elles y étaient
`NOT NULL` alors que les modèles les déclarent facultatives. Aucune colonne ne
manquait — l'écart était invisible pour un contrôle qui ne regarde que les
colonnes absentes — mais toute insertion laissant ces champs vides échouait.

Cas constatés :

  * `ss_types_evaluation.poids_pourcentage` — champ marqué « legacy, jamais lu
    par le moteur de notation » dans le modèle. Le code ne le renseigne donc
    plus, et **la création d'une école échouait** en semant ses types
    d'évaluation.
  * `ss_utilisateurs.nom_utilisateur` et `.mot_de_passe` — les modèles
    autorisent désormais du personnel SANS accès au système (gardien,
    chauffeur, agent d'entretien : une fiche RH, pas un compte). La base
    l'interdisait encore.
  * `ss_sujets_examen.trimestre`.

Sûreté
------
Relâcher une contrainte `NOT NULL` ne peut **jamais** invalider une donnée
existante : toutes les lignes en place respectent déjà la règle plus stricte.
L'opération est donc sans risque, purement permissive, et idempotente — une
colonne déjà nullable est laissée telle quelle.

Aucune donnée n'est lue, modifiée ni supprimée.

Usage
-----
    cd backend
    DATABASE_URL="..." python migrations/aligner_contraintes_not_null.py
    DATABASE_URL="..." python migrations/aligner_contraintes_not_null.py --appliquer
"""
import os
import sys

import sqlalchemy as sa

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("JWT_SECRET_KEY", "migration-uniquement")

from app.core.database import Base  # noqa: E402
import app.models.academique  # noqa: E402,F401


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url or url.startswith("sqlite"):
        print("[STOP] Definissez DATABASE_URL sur la base PostgreSQL a mettre a jour.")
        return 1

    appliquer = "--appliquer" in sys.argv
    engine = sa.create_engine(url)
    a_relacher = []

    with engine.begin() as conn:
        tables_reelles = {
            r[0] for r in conn.execute(sa.text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
            """)).fetchall()
        }

        for nom, table in sorted(Base.metadata.tables.items()):
            if nom not in tables_reelles:
                continue

            contraintes = {
                r[0]: r[1] for r in conn.execute(sa.text("""
                    SELECT column_name, is_nullable FROM information_schema.columns
                    WHERE table_name = :t
                """), {"t": nom}).fetchall()
            }

            for col in table.columns:
                if col.name not in contraintes:
                    continue
                # Le modele l'autorise vide, la base l'interdit : on aligne.
                # On laisse tranquilles les colonnes qui portent un defaut :
                # elles ne peuvent pas se retrouver vides a l'insertion.
                if col.nullable and contraintes[col.name] == "NO" and col.default is None:
                    a_relacher.append((nom, col.name))
                    if appliquer:
                        conn.execute(sa.text(
                            f"ALTER TABLE {nom} ALTER COLUMN {col.name} DROP NOT NULL"
                        ))

    if not a_relacher:
        print("[OK] Aucune contrainte plus stricte que les modeles. Rien a faire.")
        return 0

    print(f"--- CONTRAINTES {'RELACHEES' if appliquer else 'A RELACHER'} "
          f"({len(a_relacher)}) ---")
    for table, colonne in a_relacher:
        print(f"   * {table}.{colonne}  ->  DROP NOT NULL")

    if appliquer:
        print("\n[DONE] Migration terminee. Aucune donnee existante n'est affectee.")
    else:
        print("\n[SIMULATION] Rien n'a ete ecrit. Relancez avec --appliquer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
