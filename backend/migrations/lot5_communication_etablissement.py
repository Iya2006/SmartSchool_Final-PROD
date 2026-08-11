"""
Migration — Lot 5 (chantier multi-écoles centralisé) : ajoute
etablissement_id à ss_demandes_emploi et ss_messages.

Avant ce lot, ces deux tables n'avaient aucune colonne établissement
(classées "À DÉCIDER" dans .ai/MULTI_TENANT_PLAN.md, section E) : un message
"TOUS_ENSEIGNANTS"/"TOUS_PARENTS" partait vers TOUTE la plateforme, pas
seulement l'école concernée.

SÉCURITÉ : chaque table est re-comptée RÉELLEMENT (SELECT count(*)) au
moment de l'exécution, jamais supposée vide depuis un audit antérieur. Si
l'une contient déjà des lignes, la migration s'arrête PROPREMENT sans rien
modifier : aucun rattachement automatique, jamais de
`UPDATE ... SET etablissement_id = 1`.

Idempotente : peut être exécutée plusieurs fois sans erreur.

Run with: python backend/migrations/lot5_communication_etablissement.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine

TABLES = ["ss_demandes_emploi", "ss_messages"]


def migrate():
    with engine.connect() as conn:
        comptages = {t: conn.execute(text(f"SELECT count(*) FROM {t}")).scalar() for t in TABLES}
    print("État réel avant migration :")
    for t, n in comptages.items():
        print(f"  {t} : {n} ligne(s)")

    non_vides = {t: n for t, n in comptages.items() if n > 0}
    if non_vides:
        print("\n[STOP] STOP — des données existent déjà dans :", non_vides)
        print("   Cette migration ne fait AUCUN rattachement automatique")
        print("   (pas de UPDATE ... SET etablissement_id = 1). Inventoriez")
        print("   ces lignes manuellement avant de relancer la migration.")
        return

    for t in TABLES:
        with engine.begin() as conn:
            conn.execute(text(
                f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
                f"REFERENCES ss_etablissements(etablissement_id)"
            ))
            conn.execute(text(f"ALTER TABLE {t} ALTER COLUMN etablissement_id SET NOT NULL"))
        print(f"[OK] {t} : etablissement_id ajouté (NOT NULL)")

    print("\n[DONE] Migration Lot 5 (communication) terminée.")


if __name__ == "__main__":
    migrate()
