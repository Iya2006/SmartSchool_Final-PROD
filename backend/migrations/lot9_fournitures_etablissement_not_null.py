"""
MIGRATION — Lot 9 (chantier multi-écoles)
`ss_fournitures_scolaires.etablissement_id` : NULL autorisé → NOT NULL.

Contexte
--------
Le modèle portait un `default=1` (défaut Python, PAS un défaut SQL : la colonne
n'a aucun `column_default` en base). Toute création qui ne précisait pas
l'établissement rattachait donc la fourniture à l'établissement 1. Le défaut a
été retiré du modèle et l'API impose désormais la valeur du compte authentifié.
Cette migration aligne la contrainte en base.

Sécurité
--------
- Aucune écriture de données, aucun backfill : si la table contient la moindre
  ligne, la migration S'ARRÊTE et n'applique rien (une ligne existante pourrait
  avoir un etablissement_id NULL, et le remplir automatiquement reviendrait à
  inventer un rattachement — interdit par le cahier des charges).
- Idempotente : si la colonne est déjà NOT NULL, il n'y a rien à faire.
- Non destructive : ne supprime ni ne modifie aucune donnée.

Usage :
    cd backend && python migrations/lot9_fournitures_etablissement_not_null.py
"""
import os
import sys

import sqlalchemy as sa

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[STOP] DATABASE_URL n'est pas defini.")
    sys.exit(1)

TABLE = "ss_fournitures_scolaires"
COLONNE = "etablissement_id"


def main() -> int:
    engine = sa.create_engine(DATABASE_URL)

    with engine.begin() as conn:
        etat = conn.execute(sa.text("""
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_name = :t AND column_name = :c
        """), {"t": TABLE, "c": COLONNE}).fetchone()

        if etat is None:
            print(f"[STOP] La colonne {TABLE}.{COLONNE} est introuvable.")
            return 1

        if etat[0] == "NO":
            print(f"[OK] {TABLE}.{COLONNE} est deja NOT NULL - rien a faire.")
            return 0

        # Re-comptage AU MOMENT de l'execution (l'audit prealable ne suffit pas :
        # des lignes ont pu etre creees entre-temps).
        nb = conn.execute(sa.text(f"SELECT COUNT(*) FROM {TABLE}")).scalar()
        if nb:
            print(f"[STOP] {TABLE} contient {nb} ligne(s). Aucune modification appliquee.")
            print("       Inventoriez et rattachez ces lignes manuellement avant de rejouer :")
            for etab_id, compte in conn.execute(sa.text(
                f"SELECT {COLONNE}, COUNT(*) FROM {TABLE} GROUP BY 1 ORDER BY 1"
            )).fetchall():
                print(f"         etablissement_id={etab_id!r} -> {compte} ligne(s)")
            return 1

        conn.execute(sa.text(f"ALTER TABLE {TABLE} ALTER COLUMN {COLONNE} SET NOT NULL"))
        print(f"[OK] {TABLE}.{COLONNE} est desormais NOT NULL (table vide, 0 ligne touchee).")

    print("[DONE] Migration Lot 9 terminee.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
