"""
SMARTSCHOOL — Lanceur de migrations avec suivi.

Le problème que cet outil supprime
----------------------------------
`backend/migrations/` contient des dizaines de scripts, et **rien n'enregistrait
lesquels avaient déjà tourné**. En pratique, ils n'étaient pas lancés du tout :
la base de production a accumulé un retard invisible sur les modèles, jusqu'à
mettre l'application hors service.

Toutes les pannes constatées le même jour venaient de là :

  * connexion impossible pour TOUS les comptes — `ss_roles.role_base` jamais
    créée, alors que le login la lit ;
  * inscription d'une école refusée — `poids_pourcentage` resté `NOT NULL` en
    base alors que le code ne le renseigne plus ;
  * amorçage bloqué — l'ancien index global `ss_types_evaluation_code_key`
    toujours en place, la migration `2026_08_notation_09` n'ayant jamais tourné.

Aucune de ces migrations n'était fautive : elles étaient simplement oubliées.

Comment ça marche
-----------------
Une table `ss_migrations_appliquees` retient le nom de chaque script exécuté
avec succès, et sa date. Le lanceur exécute, dans l'ordre alphabétique, ceux
qui n'y figurent pas encore.

Chaque script est exécuté dans son propre sous-processus, avec `DATABASE_URL`
transmis — exactement comme s'il était lancé à la main. Aucun script existant
n'a besoin d'être modifié.

Règles
------
* Un script qui échoue **n'est pas enregistré** : il sera retenté au prochain
  passage, et le lanceur s'arrête là plutôt que d'enchaîner sur des migrations
  qui supposaient la précédente appliquée.
* Les migrations du projet sont écrites idempotentes : marquer par erreur un
  script « déjà appliqué » ne casse rien, le rejouer non plus.
* `--marquer-tout-applique` sert UNE SEULE FOIS, à l'adoption de l'outil sur
  une base déjà à jour, pour éviter de rejouer l'historique.

⚠️ QUEL `DATABASE_URL` UTILISER
------------------------------
Sur Supabase, **les migrations ne passent pas par le pooler transactionnel**
(port **6543**), celui que l'application utilise en production. Ce mode ne
supporte ni les instructions `CREATE INDEX CONCURRENTLY`, ni les requêtes
préparées qu'elles laissent derrière elles : la session se retrouve dans un
état incohérent et la migration échoue avec

    bind message supplies 2 parameters, but prepared statement "" requires 0

Utilisez le **pooler de session (port 5432)** — même hôte, même identifiants,
seul le port change :

    postgresql+pg8000://…@aws-1-<region>.pooler.supabase.com:5432/postgres

Usage
-----
    cd backend
    DATABASE_URL="…:5432/postgres" python scripts/migrer.py                 # liste ce qui manque
    DATABASE_URL="…:5432/postgres" python scripts/migrer.py --appliquer     # exécute
    DATABASE_URL="…:5432/postgres" python scripts/migrer.py --marquer-tout-applique
"""
import os
import subprocess
import sys
from pathlib import Path

import sqlalchemy as sa

RACINE = Path(__file__).resolve().parent.parent
DOSSIER_MIGRATIONS = RACINE / "migrations"

TABLE_SUIVI = "ss_migrations_appliquees"


def _preparer_table(conn) -> None:
    conn.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS {TABLE_SUIVI} (
            nom          VARCHAR(200) PRIMARY KEY,
            applique_le  TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """))


def _deja_appliquees(conn) -> set:
    return {r[0] for r in conn.execute(sa.text(f"SELECT nom FROM {TABLE_SUIVI}")).fetchall()}


def _scripts_disponibles() -> list:
    if not DOSSIER_MIGRATIONS.is_dir():
        return []
    return sorted(
        p.name for p in DOSSIER_MIGRATIONS.glob("*.py")
        if not p.name.startswith("__")
    )


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("[STOP] DATABASE_URL n'est pas defini.")
        return 1

    # Le pooler transactionnel de Supabase fait echouer les migrations qui
    # utilisent CREATE INDEX CONCURRENTLY, avec un message incomprehensible.
    # Mieux vaut le dire tout de suite que de laisser chercher.
    if ":6543/" in url and "--ignorer-avertissement-pooler" not in sys.argv:
        print("[STOP] DATABASE_URL pointe vers le pooler TRANSACTIONNEL (port 6543).")
        print("       Les migrations doivent passer par le pooler de SESSION :")
        print("       remplacez  :6543/  par  :5432/  dans l'URL.")
        print("       (Pour passer outre malgre tout : --ignorer-avertissement-pooler)")
        return 1

    appliquer = "--appliquer" in sys.argv
    marquer_tout = "--marquer-tout-applique" in sys.argv

    engine = sa.create_engine(url)
    with engine.begin() as conn:
        _preparer_table(conn)
        faites = _deja_appliquees(conn)

    disponibles = _scripts_disponibles()
    manquantes = [n for n in disponibles if n not in faites]

    print(f"[ETAT] {len(disponibles)} migration(s) dans le depot, "
          f"{len(faites)} deja appliquee(s), {len(manquantes)} en attente.")

    if marquer_tout:
        if not manquantes:
            print("[OK] Rien a marquer.")
            return 0
        with engine.begin() as conn:
            for nom in manquantes:
                conn.execute(sa.text(
                    f"INSERT INTO {TABLE_SUIVI} (nom) VALUES (:n) ON CONFLICT DO NOTHING"
                ), {"n": nom})
        print(f"[DONE] {len(manquantes)} migration(s) marquee(s) comme appliquees SANS etre")
        print("       executees. A n'utiliser que sur une base deja a jour.")
        return 0

    if not manquantes:
        print("[OK] La base est a jour.")
        return 0

    print("\n--- EN ATTENTE ---")
    for nom in manquantes:
        print("   *", nom)

    if not appliquer:
        print("\n[SIMULATION] Rien n'a ete execute. Relancez avec --appliquer.")
        return 0

    print("\n--- EXECUTION ---")
    environnement = {**os.environ, "DATABASE_URL": url, "PYTHONIOENCODING": "utf-8"}
    reussies = 0

    for nom in manquantes:
        chemin = DOSSIER_MIGRATIONS / nom
        print(f"\n>>> {nom}")
        resultat = subprocess.run(
            [sys.executable, str(chemin), "--appliquer"],
            cwd=str(RACINE), env=environnement,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        sortie = (resultat.stdout or "").strip()
        if sortie:
            print("\n".join("    " + l for l in sortie.splitlines()[-12:]))

        if resultat.returncode != 0:
            erreur = (resultat.stderr or "").strip().splitlines()
            if erreur:
                print("    " + erreur[-1])
            print(f"\n[STOP] {nom} a echoue. Elle n'est PAS enregistree et sera retentee.")
            print("       Les migrations suivantes ne sont pas lancees : elles peuvent")
            print("       supposer celle-ci appliquee.")
            return 1

        with engine.begin() as conn:
            conn.execute(sa.text(
                f"INSERT INTO {TABLE_SUIVI} (nom) VALUES (:n) ON CONFLICT DO NOTHING"
            ), {"n": nom})
        reussies += 1

    print(f"\n[DONE] {reussies} migration(s) appliquee(s) et enregistree(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
