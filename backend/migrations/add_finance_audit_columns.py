"""
Migration: Ajoute les colonnes d'audit manquantes sur ss_paiements et ss_depenses
- ss_paiements.motif_annulation : motif saisi lors de l'annulation d'un paiement
- ss_depenses.reference : référence externe d'un décaissement/règlement fournisseur

Run with: python backend/migrations/add_finance_audit_columns.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text


def migrate():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE ss_paiements ADD COLUMN motif_annulation VARCHAR(500)"))
            print("✅ Added motif_annulation to ss_paiements")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("⏭️  motif_annulation already exists in ss_paiements")
            else:
                print(f"⚠️  ss_paiements: {e}")

        try:
            conn.execute(text("ALTER TABLE ss_depenses ADD COLUMN reference VARCHAR(150)"))
            print("✅ Added reference to ss_depenses")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("⏭️  reference already exists in ss_depenses")
            else:
                print(f"⚠️  ss_depenses: {e}")

        conn.commit()
        print("🎉 Migration complete!")


if __name__ == "__main__":
    migrate()
