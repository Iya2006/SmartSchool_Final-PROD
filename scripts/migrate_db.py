import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from sqlalchemy import text
from app.core.database import engine, Base
from app.models.academique import *

# Create any missing tables (like ss_echeances_factures)
Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    try:
        conn.execute(text('ALTER TABLE ss_factures ADD COLUMN IF NOT EXISTS type_frais_id INTEGER REFERENCES ss_types_frais(type_frais_id)'))
    except Exception as e:
        print("Could not alter ss_factures:", e)
        
    try:
        conn.execute(text('ALTER TABLE ss_paiements ADD COLUMN IF NOT EXISTS echeance_id INTEGER REFERENCES ss_echeances_factures(echeance_id)'))
    except Exception as e:
        print("Could not alter ss_paiements:", e)
        
    conn.commit()

print("Database updated successfully.")
