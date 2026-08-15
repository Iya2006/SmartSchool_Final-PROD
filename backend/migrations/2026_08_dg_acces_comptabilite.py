"""
Migration — le fondateur choisit si le directeur général voit la comptabilité.

POURQUOI
--------
Le directeur général avait accès à la comptabilité d'office. Certains
établissements le souhaitent, d'autres non : le fondateur doit pouvoir trancher,
compte par compte, à la création. On ajoute donc un réglage sur le compte.

CE QU'ELLE FAIT
---------------
Ajoute `ss_utilisateurs.acces_comptabilite` (CHAR(1), défaut « O »). « O » par
défaut pour que les comptes existants gardent exactement leur accès actuel — le
réglage ne change rien tant que le fondateur ne décoche pas à la création d'un
nouveau DG. Ce champ n'est lu que pour le DG ; les autres rôles finance
(ADMIN, FONDATEUR, COMPTABLE, SUPER_ADMIN) ne le consultent jamais.

Idempotente : rejouable sans dégât.
Run: python backend/migrations/2026_08_dg_acces_comptabilite.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text


def migrate():
    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE ss_utilisateurs ADD COLUMN acces_comptabilite VARCHAR(1) DEFAULT 'O'"
            ))
            conn.commit()
            print("OK — colonne acces_comptabilite ajoutee (defaut 'O')")
        except Exception as e:
            conn.rollback()
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("Deja present — acces_comptabilite existe deja")
            else:
                print(f"Attention — ss_utilisateurs: {e}")
        # Les lignes deja en base recoivent 'O' explicitement (au cas ou le
        # DEFAULT ne s'applique pas retroactivement selon le moteur).
        try:
            conn.execute(text(
                "UPDATE ss_utilisateurs SET acces_comptabilite='O' WHERE acces_comptabilite IS NULL"
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            print(f"Note — backfill: {e}")
        print("Migration terminee.")


if __name__ == "__main__":
    migrate()
