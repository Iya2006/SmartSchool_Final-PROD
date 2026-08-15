"""
MIGRATION — colonnes présentes dans les modèles mais absentes de la base.

Pourquoi
--------
`main.py` appelle `Base.metadata.create_all()` au démarrage : cela CRÉE les
tables manquantes, mais n'AJOUTE JAMAIS une colonne à une table existante.
Deux colonnes ajoutées aux modèles n'ont donc jamais atteint la base :

  * `ss_enseignants.mode_remuneration`  (commit « feat(paie) »)
  * `ss_parents.etablissement_id`

Conséquence observée en production : `POST /api/auth/login` interroge les
quatre tables de comptes en cascade. Dès qu'un identifiant n'est pas un
`Utilisateur`, la requête sur `ss_enseignants` échoue
(`column does not exist`) et l'API renvoie **500**. Comme cette réponse
d'erreur ne porte pas d'en-tête CORS, le navigateur la bloque et l'interface
affiche « Serveur injoignable » — un message trompeur : le serveur répond,
mais il plante.

**La connexion des enseignants, parents et élèves est donc impossible.**

Sécurité
--------
- Purement ADDITIVE : `ADD COLUMN IF NOT EXISTS`, aucune donnée modifiée.
- Idempotente : rejouable sans effet.
- `mode_remuneration` est NOT NULL avec un défaut métier explicite
  (« HORAIRE », celui du modèle) : sûr même sur une table peuplée.
- `ss_parents.etablissement_id` est NOT NULL SANS défaut possible — on
  n'invente pas l'établissement d'un parent. Si la table contient des lignes,
  la migration S'ARRÊTE et laisse la colonne nullable plutôt que de rattacher
  arbitrairement des parents existants à une école.

Usage :
    cd backend && python migrations/ajout_colonnes_manquantes_login.py
"""
import os
import sys

import sqlalchemy as sa

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[STOP] DATABASE_URL n'est pas defini.")
    sys.exit(1)


def colonne_existe(conn, table: str, colonne: str) -> bool:
    return conn.execute(sa.text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = :t AND column_name = :c
    """), {"t": table, "c": colonne}).fetchone() is not None


def main() -> int:
    engine = sa.create_engine(DATABASE_URL)

    with engine.begin() as conn:
        # ── 1. ss_enseignants.mode_remuneration ──────────────────────────
        if colonne_existe(conn, "ss_enseignants", "mode_remuneration"):
            print("[OK] ss_enseignants.mode_remuneration existe deja.")
        else:
            conn.execute(sa.text("""
                ALTER TABLE ss_enseignants
                ADD COLUMN IF NOT EXISTS mode_remuneration VARCHAR(20)
                NOT NULL DEFAULT 'HORAIRE'
            """))
            n = conn.execute(sa.text("SELECT COUNT(*) FROM ss_enseignants")).scalar()
            print(f"[OK] ss_enseignants.mode_remuneration creee "
                  f"(defaut 'HORAIRE' applique a {n} ligne(s) existante(s)).")

        # ── 2. ss_parents.etablissement_id ───────────────────────────────
        if colonne_existe(conn, "ss_parents", "etablissement_id"):
            print("[OK] ss_parents.etablissement_id existe deja.")
        else:
            nb_parents = conn.execute(sa.text("SELECT COUNT(*) FROM ss_parents")).scalar()
            conn.execute(sa.text("""
                ALTER TABLE ss_parents
                ADD COLUMN IF NOT EXISTS etablissement_id INTEGER
                REFERENCES ss_etablissements(etablissement_id)
            """))
            if nb_parents == 0:
                conn.execute(sa.text("""
                    ALTER TABLE ss_parents ALTER COLUMN etablissement_id SET NOT NULL
                """))
                print("[OK] ss_parents.etablissement_id creee en NOT NULL (table vide).")
            else:
                print(f"[ATTENTION] ss_parents contient {nb_parents} ligne(s) : la colonne "
                      f"a ete creee NULLABLE.")
                print("            Rattachez ces parents a leur etablissement (via leurs")
                print("            enfants, table ss_eleve_parent), PUIS passez la colonne")
                print("            en NOT NULL. Aucun rattachement automatique n'est fait.")

    print("\n[DONE] Migration terminee.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
