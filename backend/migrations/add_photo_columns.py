"""
Migration: Add photo_url to parents and enseignants tables
Run with: python backend/migrations/add_photo_columns.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Add photo_url to ss_parents
        try:
            conn.execute(text("ALTER TABLE ss_parents ADD COLUMN photo_url VARCHAR(500)"))
            print("✅ Added photo_url to ss_parents")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("⏭️  photo_url already exists in ss_parents")
            else:
                print(f"⚠️  ss_parents: {e}")

        # Add photo_url to ss_enseignants
        try:
            conn.execute(text("ALTER TABLE ss_enseignants ADD COLUMN photo_url VARCHAR(500)"))
            print("✅ Added photo_url to ss_enseignants")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("⏭️  photo_url already exists in ss_enseignants")
            else:
                print(f"⚠️  ss_enseignants: {e}")

        conn.commit()
        print("🎉 Migration complete!")

if __name__ == "__main__":
    migrate()
