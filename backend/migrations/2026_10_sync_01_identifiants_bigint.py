"""
Migration — identifiants sur 64 bits (synchronisation des postes hors-ligne).

POURQUOI
--------
Chaque poste installé travaille hors-ligne sur sa propre base, et crée ses
lignes dans sa propre plage d'identifiants : numéro d'appareil × 2³² +
compteur (`app/sync/identifiants.py`). Deux postes ne peuvent ainsi jamais
attribuer le même identifiant, et un identifiant ne change jamais une fois
attribué — le QR d'un reçu imprimé couvre `paiement_id`.

Ces identifiants dépassent 2³¹ : une colonne INTEGER de PostgreSQL les refuse
(« integer out of range »). Toute colonne qui contient un identifiant de ligne
passe donc en BIGINT : les 76 clés primaires, les 146 clés étrangères et les
10 références sans clé étrangère (`ss_messages.destinataire_id`...). La liste
vient des modèles (`app/sync/schema.py`), pas d'une copie à la main.

CE QUI NE CHANGE PAS
--------------------
- Aucune valeur : un identifiant existant garde exactement sa valeur.
- Les séquences restent en INTEGER, volontairement. Le cloud est l'appareil 0 :
  ses identifiants doivent rester sous 2³², là où commence la plage du premier
  poste. Une séquence INTEGER s'arrête à 2³¹, bien avant.

COMMENT
-------
Une seule transaction : la base est migrée en entier ou pas du tout. Une seule
réécriture par table (toutes ses colonnes dans le même ALTER TABLE). Les tables
sont verrouillées pendant l'opération : à lancer hors des heures de saisie.
Idempotente : une colonne déjà en BIGINT n'est pas retouchée.

Usage :
    cd backend
    python migrations/2026_10_sync_01_identifiants_bigint.py              # simulation
    python migrations/2026_10_sync_01_identifiants_bigint.py --appliquer
"""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("JWT_SECRET_KEY", "migration-uniquement")

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402
from app.sync.schema import colonnes_a_elargir, colonnes_identifiants  # noqa: E402


def _par_table(colonnes):
    tables = defaultdict(list)
    for table, colonne in colonnes:
        tables[table].append(colonne)
    return tables


def migrer(appliquer: bool) -> int:
    if engine.dialect.name != "postgresql":
        print(f"[=] Base {engine.dialect.name} : un seul type entier, sur 64 bits. Rien à faire.")
        return 0

    with engine.connect() as conn:
        a_elargir = colonnes_a_elargir(conn)
    total = len(colonnes_identifiants())
    tables = _par_table(a_elargir)

    print(f"Colonnes d'identifiant : {total} | déjà en BIGINT : {total - len(a_elargir)} "
          f"| à élargir : {len(a_elargir)} ({len(tables)} tables)")
    if not a_elargir:
        print("[DONE] Le schéma est à jour.")
        return 0
    for table, colonnes in sorted(tables.items()):
        print(f"   {table} : {', '.join(colonnes)}")
    if not appliquer:
        print("\nSimulation : rien n'a été modifié. Relancer avec --appliquer.")
        return 0

    with engine.begin() as conn:
        for table, colonnes in sorted(tables.items()):
            clauses = ", ".join(f"ALTER COLUMN {c} TYPE BIGINT" for c in colonnes)
            conn.execute(text(f"ALTER TABLE {table} {clauses}"))
            print(f"[OK] {table} ({len(colonnes)})")

    with engine.connect() as conn:
        restantes = colonnes_a_elargir(conn)
    if restantes:
        print(f"[ERR] {len(restantes)} colonne(s) encore en INTEGER : {restantes}")
        return 1
    print(f"\n[DONE] {len(a_elargir)} colonne(s) élargie(s), schéma à jour.")
    return 0


if __name__ == "__main__":
    sys.exit(migrer(appliquer="--appliquer" in sys.argv))
