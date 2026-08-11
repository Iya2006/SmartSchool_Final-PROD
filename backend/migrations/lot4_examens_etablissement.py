"""
Migration — Lot 4 (chantier multi-écoles centralisé) : ajoute
etablissement_id à ss_emplois_examen.

Avant ce lot, EmploiExamen n'avait aucune colonne ni relation fiable
permettant de déterminer son établissement : `demande_id` est nullable et
DemandeEmploi elle-même n'a pas d'etablissement_id (classée "À DÉCIDER",
hors périmètre de ce lot) ; `annee_id` a un défaut codé en dur (=1, jamais
fiable, non touché ici — aucune route d'examens.py ne filtre dessus).

SÉCURITÉ : la table est re-comptée RÉELLEMENT (SELECT count(*)) au moment de
l'exécution, jamais supposée vide depuis un audit antérieur. Si elle contient
déjà des lignes, la migration s'arrête PROPREMENT sans rien modifier : aucun
rattachement automatique, jamais de `UPDATE ... SET etablissement_id = 1`.

Idempotente : peut être exécutée plusieurs fois sans erreur.

Run with: python backend/migrations/lot4_examens_etablissement.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine


def migrate():
    with engine.connect() as conn:
        n = conn.execute(text("SELECT count(*) FROM ss_emplois_examen")).scalar()
    print(f"État réel avant migration : ss_emplois_examen = {n} ligne(s)")

    if n > 0:
        print("\n[STOP] STOP — des données existent déjà dans ss_emplois_examen.")
        print("   Cette migration ne fait AUCUN rattachement automatique")
        print("   (pas de UPDATE ... SET etablissement_id = 1). Inventoriez")
        print("   ces lignes manuellement avant de relancer la migration.")
        return

    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_emplois_examen "
            "ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
            "REFERENCES ss_etablissements(etablissement_id)"
        ))
        conn.execute(text(
            "ALTER TABLE ss_emplois_examen "
            "ALTER COLUMN etablissement_id SET NOT NULL"
        ))
    print("[OK] ss_emplois_examen : etablissement_id ajouté (NOT NULL)")
    print("\n[DONE] Migration Lot 4 (examens) terminée.")


if __name__ == "__main__":
    migrate()
