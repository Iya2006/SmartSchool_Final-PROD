"""
VÉRIFICATION DU SCHÉMA — écart entre les modèles SQLAlchemy et la base réelle.

Pourquoi cet outil existe
-------------------------
`main.py` appelle `Base.metadata.create_all()` au démarrage. Cela CRÉE les
tables manquantes, mais n'AJOUTE JAMAIS une colonne à une table déjà
existante. Ajouter un champ à un modèle ne suffit donc pas : sans migration,
la base reste en retard et **toute requête sur ce modèle échoue en 500**.

C'est exactement ce qui a mis la connexion hors service en production : deux
colonnes ajoutées aux modèles n'avaient jamais atteint Supabase, et
`POST /api/auth/login` — qui interroge quatre tables de comptes en cascade —
plantait dès qu'un identifiant n'était pas un `Utilisateur`. Le message
affiché (« Serveur injoignable ») désignait le réseau alors que le serveur
répondait parfaitement.

À lancer après toute modification de modèle, et avant chaque déploiement.

Usage
-----
    cd backend
    DATABASE_URL="..." python scripts/verifier_schema.py

Code de sortie 1 si un écart est trouvé (utilisable en CI).
"""
import os
import sys

import sqlalchemy as sa

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("JWT_SECRET_KEY", "verification-schema-uniquement")

from app.core.database import Base  # noqa: E402
import app.models.academique  # noqa: E402,F401  (enregistre tous les modeles)


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url or url.startswith("sqlite"):
        print("[STOP] Definissez DATABASE_URL sur la base PostgreSQL a verifier.")
        return 1

    engine = sa.create_engine(url)
    ecarts = []

    with engine.connect() as conn:
        tables_reelles = {
            r[0] for r in conn.execute(sa.text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
            """)).fetchall()
        }

        for nom, table in sorted(Base.metadata.tables.items()):
            if nom not in tables_reelles:
                ecarts.append((nom, "TABLE ABSENTE", []))
                continue

            reelles = {
                r[0] for r in conn.execute(sa.text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = :t
                """), {"t": nom}).fetchall()
            }
            manquantes = sorted({c.name for c in table.columns} - reelles)
            if manquantes:
                ecarts.append((nom, "COLONNES ABSENTES", manquantes))

    total = len(Base.metadata.tables)
    if not ecarts:
        print(f"[OK] {total} tables verifiees : la base correspond aux modeles.")
        return 0

    print(f"[ECART] {len(ecarts)} table(s) en retard sur les modeles "
          f"(sur {total} verifiees) :\n")
    for nom, genre, colonnes in ecarts:
        if colonnes:
            print(f"  {nom}")
            for c in colonnes:
                colonne = table_colonne(nom, c)
                print(f"      - {c}{colonne}")
        else:
            print(f"  {nom} : {genre}")

    print("\nCes ecarts font echouer en 500 toute requete touchant ces modeles.")
    print("Ecrivez une migration dans backend/migrations/ pour les combler.")
    return 1


def table_colonne(nom_table: str, nom_colonne: str) -> str:
    """Type et nullabilite attendus, pour aider a ecrire la migration."""
    table = Base.metadata.tables.get(nom_table)
    if table is None or nom_colonne not in table.columns:
        return ""
    col = table.columns[nom_colonne]
    contrainte = "NOT NULL" if not col.nullable else "NULL"
    return f"   ({col.type}, {contrainte})"


if __name__ == "__main__":
    sys.exit(main())
