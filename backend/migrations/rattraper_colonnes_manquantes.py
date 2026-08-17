"""
MIGRATION — rattrape TOUTES les colonnes présentes dans les modèles mais
absentes de la base.

Pourquoi
--------
`main.py` appelle `Base.metadata.create_all()` au démarrage : cela CRÉE les
tables manquantes, mais n'AJOUTE JAMAIS une colonne à une table existante.
Chaque champ ajouté à un modèle sans migration laisse donc la base en retard,
et **toute requête touchant ce modèle échoue en 500**.

Panne réelle qui a motivé ce script : `POST /api/auth/login` appelle
`_role_base()`, qui interroge `ss_roles.role_base` — colonne jamais créée.
La connexion était donc impossible pour TOUS les comptes. Et comme la réponse
500 ne porte pas d'en-tête CORS, le navigateur la bloquait et l'interface
affichait « Serveur injoignable », désignant le réseau alors que le serveur
répondait parfaitement.

Comment
-------
Le DDL est généré depuis les modèles eux-mêmes (`Base.metadata`) : aucun type
n'est recopié à la main, donc aucune divergence possible avec le code.

Règles de sûreté, dans cet ordre :
  1. colonne NULLABLE            → ajoutée telle quelle, sans risque ;
  2. colonne NOT NULL AVEC défaut → ajoutée avec ce défaut, sûr même sur une
     table peuplée ;
  3. colonne NOT NULL SANS défaut → ajoutée NOT NULL **uniquement si la table
     est vide**. Sinon elle est **ignorée** et signalée : remplir une colonne
     obligatoire sur des lignes existantes est une décision métier, pas
     quelque chose qu'un script invente (rattacher des données à un
     établissement au hasard, par exemple).

Idempotente (`ADD COLUMN IF NOT EXISTS`), purement additive : aucune donnée
n'est modifiée, aucune colonne supprimée.

Usage
-----
    cd backend
    DATABASE_URL="..." python migrations/rattraper_colonnes_manquantes.py
    DATABASE_URL="..." python migrations/rattraper_colonnes_manquantes.py --appliquer
"""
import os
import sys

import sqlalchemy as sa

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("JWT_SECRET_KEY", "migration-uniquement")

from app.core.database import Base  # noqa: E402
import app.models.academique  # noqa: E402,F401  (enregistre tous les modeles)


def _defaut_sql(colonne) -> str | None:
    """Valeur par défaut du modèle, transcrite en littéral SQL."""
    defaut = colonne.default
    if defaut is None or getattr(defaut, "is_callable", False):
        return None
    valeur = getattr(defaut, "arg", None)
    if valeur is None or callable(valeur):
        return None
    if isinstance(valeur, bool):
        return "TRUE" if valeur else "FALSE"
    if isinstance(valeur, (int, float)):
        return str(valeur)
    return "'" + str(valeur).replace("'", "''") + "'"


def appliquer_colonnes_manquantes(engine, appliquer: bool = False):
    """Ajoute à la base les colonnes des modèles absentes des tables existantes.

    Retourne `(ajoutees, ignorees)`. `create_all()` ne crée que les tables
    manquantes, jamais les colonnes — cette fonction comble ce trou, de façon
    idempotente (`ADD COLUMN IF NOT EXISTS`) et purement additive (aucune donnée
    supprimée). Réutilisée par le CLI (`main()`) ET au démarrage de l'app
    (main.py) pour synchroniser la base à chaque déploiement.
    """
    dialecte = engine.dialect
    ajoutees, ignorees = [], []

    with engine.begin() as conn:
        tables_reelles = {
            r[0] for r in conn.execute(sa.text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
            """)).fetchall()
        }

        for nom, table in sorted(Base.metadata.tables.items()):
            if nom not in tables_reelles:
                print(f"[IGNORE] {nom} : table absente — create_all() la creera au demarrage.")
                continue

            reelles = {
                r[0] for r in conn.execute(sa.text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = :t
                """), {"t": nom}).fetchall()
            }
            manquantes = [c for c in table.columns if c.name not in reelles]
            if not manquantes:
                continue

            # Recompte AU MOMENT de l'execution : un audit prealable ne prouve rien.
            lignes = conn.execute(sa.text(f"SELECT COUNT(*) FROM {nom}")).scalar()

            for col in manquantes:
                type_sql = col.type.compile(dialect=dialecte)
                defaut = _defaut_sql(col)

                if col.nullable:
                    ddl = f"ALTER TABLE {nom} ADD COLUMN IF NOT EXISTS {col.name} {type_sql}"
                    if defaut is not None:
                        ddl += f" DEFAULT {defaut}"
                    etape2 = None
                elif defaut is not None:
                    ddl = (f"ALTER TABLE {nom} ADD COLUMN IF NOT EXISTS {col.name} {type_sql} "
                           f"NOT NULL DEFAULT {defaut}")
                    etape2 = None
                elif lignes == 0:
                    ddl = f"ALTER TABLE {nom} ADD COLUMN IF NOT EXISTS {col.name} {type_sql}"
                    etape2 = f"ALTER TABLE {nom} ALTER COLUMN {col.name} SET NOT NULL"
                else:
                    ignorees.append((nom, col.name, lignes))
                    continue

                ajoutees.append(f"{nom}.{col.name}  ({type_sql}, "
                                f"{'NOT NULL' if not col.nullable else 'NULL'})")
                if appliquer:
                    conn.execute(sa.text(ddl))
                    if etape2:
                        conn.execute(sa.text(etape2))

        if not appliquer:
            # Rien n'a ete execute : la transaction se ferme sans effet.
            pass

    return ajoutees, ignorees


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url or url.startswith("sqlite"):
        print("[STOP] Definissez DATABASE_URL sur la base PostgreSQL a mettre a jour.")
        return 1

    appliquer = "--appliquer" in sys.argv
    engine = sa.create_engine(url)
    ajoutees, ignorees = appliquer_colonnes_manquantes(engine, appliquer)

    print(f"\n--- COLONNES {'AJOUTEES' if appliquer else 'A AJOUTER'} ({len(ajoutees)}) ---")
    for a in ajoutees:
        print("   *", a)

    if ignorees:
        print(f"\n--- IGNOREES ({len(ignorees)}) : NOT NULL sans defaut, table NON vide ---")
        for nom, colonne, lignes in ignorees:
            print(f"   ! {nom}.{colonne} — {lignes} ligne(s) a renseigner d'abord")
        print("     Decidez de leur valeur, remplissez-les, puis passez la colonne")
        print("     en NOT NULL. Aucune valeur n'est inventee ici.")

    if not ajoutees and not ignorees:
        print("\n[OK] La base correspond deja aux modeles. Rien a faire.")
    elif appliquer:
        print("\n[DONE] Migration terminee.")
    else:
        print("\n[SIMULATION] Rien n'a ete ecrit. Relancez avec --appliquer.")

    return 1 if ignorees else 0


if __name__ == "__main__":
    sys.exit(main())
