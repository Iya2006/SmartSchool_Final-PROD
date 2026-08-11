"""
Migration — Lot 1 (chantier multi-écoles centralisé) : isolation par
établissement des tables comptables directement concernées.

1. ss_exercices_comptables : ajoute etablissement_id (NOT NULL, FK vers
   ss_etablissements), remplace la contrainte UNIQUE(annee) par
   UNIQUE(etablissement_id, annee) — un même millésime ('2026') doit
   pouvoir exister dans plusieurs écoles (avant ce lot, un seul exercice
   '2026' pouvait exister pour TOUTE la plateforme).
2. ss_parametres_comptabilite : ajoute etablissement_id (NOT NULL, FK),
   remplace UNIQUE(cle) par UNIQUE(etablissement_id, cle) — le PIN d'accès
   comptabilité (PIN_ACCESS) devient propre à chaque école au lieu d'être
   unique pour toute la plateforme.
3. ss_ecritures_comptables.etablissement_id : passe de nullable à NOT NULL
   (la colonne existait déjà depuis le schéma initial mais n'était jamais
   peuplée ni filtrée nulle part dans le code — colonne morte).

SÉCURITÉ : chaque table est re-comptée RÉELLEMENT (SELECT count(*)) au
moment de l'exécution, jamais supposée vide depuis un audit antérieur. Si
une table contient déjà des lignes, la migration s'arrête PROPREMENT sans
rien modifier : aucun rattachement automatique, jamais de
`UPDATE ... SET etablissement_id = 1` en masse. Chaque ligne existante
devrait alors être rattachée manuellement à son établissement réel avant de
pouvoir relancer cette migration.

Idempotente : peut être exécutée plusieurs fois sans erreur (ADD COLUMN IF
NOT EXISTS, vérification explicite d'existence avant ADD CONSTRAINT).

Run with: python backend/migrations/lot1_comptabilite_etablissement.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine


TABLES_A_VERIFIER = [
    "ss_exercices_comptables",
    "ss_parametres_comptabilite",
    "ss_ecritures_comptables",
]


def _compter(conn, table: str) -> int:
    return conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()


def _constraint_existe(conn, nom: str) -> bool:
    return conn.execute(
        text("SELECT 1 FROM pg_constraint WHERE conname = :nom"), {"nom": nom}
    ).scalar() is not None


def migrate():
    # --- 1. Vérification réelle, au moment de l'exécution (pas supposée) ---
    with engine.connect() as conn:
        comptages = {t: _compter(conn, t) for t in TABLES_A_VERIFIER}
    print("État réel des tables avant migration :")
    for table, n in comptages.items():
        print(f"  {table} : {n} ligne(s)")

    non_vides = {t: n for t, n in comptages.items() if n > 0}
    if non_vides:
        print("\n[STOP] STOP — des données existent déjà dans :", non_vides)
        print("   Cette migration ne fait AUCUN rattachement automatique")
        print("   (pas de UPDATE ... SET etablissement_id = 1). Inventoriez")
        print("   ces lignes manuellement avant de relancer la migration.")
        return

    # --- 2. ss_exercices_comptables ---
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_exercices_comptables "
            "ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
            "REFERENCES ss_etablissements(etablissement_id)"
        ))
        conn.execute(text(
            "ALTER TABLE ss_exercices_comptables "
            "ALTER COLUMN etablissement_id SET NOT NULL"
        ))
        conn.execute(text(
            "ALTER TABLE ss_exercices_comptables "
            "DROP CONSTRAINT IF EXISTS ss_exercices_comptables_annee_key"
        ))
        if not _constraint_existe(conn, "uq_exercice_etablissement_annee"):
            conn.execute(text(
                "ALTER TABLE ss_exercices_comptables "
                "ADD CONSTRAINT uq_exercice_etablissement_annee UNIQUE (etablissement_id, annee)"
            ))
    print("[OK] ss_exercices_comptables : etablissement_id ajouté (NOT NULL), "
          "UNIQUE(annee) -> UNIQUE(etablissement_id, annee)")

    # --- 3. ss_parametres_comptabilite ---
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_parametres_comptabilite "
            "ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
            "REFERENCES ss_etablissements(etablissement_id)"
        ))
        conn.execute(text(
            "ALTER TABLE ss_parametres_comptabilite "
            "ALTER COLUMN etablissement_id SET NOT NULL"
        ))
        conn.execute(text(
            "ALTER TABLE ss_parametres_comptabilite "
            "DROP CONSTRAINT IF EXISTS ss_parametres_comptabilite_cle_key"
        ))
        if not _constraint_existe(conn, "uq_parametre_etablissement_cle"):
            conn.execute(text(
                "ALTER TABLE ss_parametres_comptabilite "
                "ADD CONSTRAINT uq_parametre_etablissement_cle UNIQUE (etablissement_id, cle)"
            ))
    print("[OK] ss_parametres_comptabilite : etablissement_id ajouté (NOT NULL), "
          "UNIQUE(cle) -> UNIQUE(etablissement_id, cle)")

    # --- 4. ss_ecritures_comptables ---
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_ecritures_comptables "
            "ALTER COLUMN etablissement_id SET NOT NULL"
        ))
    print("[OK] ss_ecritures_comptables : etablissement_id passé en NOT NULL")

    print("\n[DONE] Migration Lot 1 (comptabilité) terminée.")


if __name__ == "__main__":
    migrate()
