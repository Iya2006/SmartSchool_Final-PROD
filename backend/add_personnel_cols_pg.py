import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not found")
    exit(1)

print(f"Connecting to {DATABASE_URL}")
engine = create_engine(DATABASE_URL)

columns_to_add = [
    ("sexe", "VARCHAR(10) DEFAULT 'M'"),
    ("roles_secondaires", "JSONB"),
    ("photo_url", "VARCHAR(500)"),
    ("type_contrat", "VARCHAR(50) DEFAULT 'PERMANENT'"),
    ("date_embauche", "DATE"),
    ("salaire_base", "NUMERIC(10, 2) DEFAULT 0"),
    ("taux_horaire", "NUMERIC(10, 2) DEFAULT 0"),
    ("prime_mensuelle", "NUMERIC(10, 2) DEFAULT 0"),
    ("heures_hebdo", "INTEGER DEFAULT 0"),
    ("rib", "VARCHAR(100)"),
    ("mode_paiement_salaire", "VARCHAR(50) DEFAULT 'ESPECES'"),
    ("date_naissance", "DATE"),
    ("lieu_naissance", "VARCHAR(100)"),
    ("adresse", "VARCHAR(255)"),
    ("numero_cni", "VARCHAR(50)")
]

with engine.connect() as conn:
    for col_name, col_type in columns_to_add:
        try:
            conn.execute(text(f"ALTER TABLE ss_utilisateurs ADD COLUMN {col_name} {col_type}"))
            conn.commit()
            print(f"Added {col_name}")
        except ProgrammingError as e:
            if "already exists" in str(e).lower() or "existe déjà" in str(e).lower():
                print(f"Column {col_name} already exists")
            else:
                print(f"Error adding {col_name}: {e}")
            conn.rollback()

print("Migration done.")
