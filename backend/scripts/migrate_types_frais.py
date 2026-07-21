import sys
import os

# Add the root directory to sys.path to be able to import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine, text
from app.core.database import engine

def migrate():
    with engine.connect() as conn:
        try:
            print("Checking if montant_defaut exists in ss_types_frais...")
            conn.execute(text("SELECT montant_defaut FROM ss_types_frais LIMIT 1"))
            print("Column 'montant_defaut' already exists.")
        except Exception as e:
            conn.execute(text("ROLLBACK"))
            print("Adding column 'montant_defaut' to ss_types_frais...")
            conn.execute(text("ALTER TABLE ss_types_frais ADD COLUMN montant_defaut NUMERIC(12, 2) DEFAULT 0"))
            print("Column 'montant_defaut' added successfully.")
            
        print("Checking if est_obligatoire exists in ss_types_frais...")
        try:
            conn.execute(text("SELECT est_obligatoire FROM ss_types_frais LIMIT 1"))
            print("Column 'est_obligatoire' already exists.")
        except Exception as e:
            conn.execute(text("ROLLBACK"))
            print("Adding column 'est_obligatoire' to ss_types_frais...")
            conn.execute(text("ALTER TABLE ss_types_frais ADD COLUMN est_obligatoire VARCHAR(1) DEFAULT 'N'"))
            print("Column 'est_obligatoire' added successfully.")

        # Seed categories
        categories_to_seed = [
            {"code": "UNIF", "libelle": "Frais d'Uniforme Scolaire", "categorie": "Uniforme", "montant": 150000, "obligatoire": "O"},
            {"code": "TRAN", "libelle": "Frais de Transport Mensuel", "categorie": "Transport", "montant": 250000, "obligatoire": "N"},
            {"code": "FOUR", "libelle": "Kit de Fournitures", "categorie": "Fourniture", "montant": 100000, "obligatoire": "N"},
            {"code": "ACTI", "libelle": "Activités Extra-Scolaires", "categorie": "Activité", "montant": 50000, "obligatoire": "N"},
            {"code": "REIN", "libelle": "Frais de Réinscription", "categorie": "Réinscription", "montant": 300000, "obligatoire": "O"},
        ]

        print("Seeding new categories...")
        for cat in categories_to_seed:
            result = conn.execute(
                text("SELECT type_frais_id FROM ss_types_frais WHERE code = :code"), 
                {"code": cat['code']}
            ).fetchone()
            if not result:
                print(f"Adding category: {cat['categorie']}")
                conn.execute(
                    text("""
                        INSERT INTO ss_types_frais (code, libelle, categorie, montant_defaut, est_obligatoire, frequence, statut)
                        VALUES (:code, :libelle, :categorie, :montant, :obligatoire, 'ANNUEL', 'ACTIF')
                    """),
                    {"code": cat['code'], "libelle": cat['libelle'], "categorie": cat['categorie'], "montant": cat['montant'], "obligatoire": cat['obligatoire']}
                )
            else:
                print(f"Category {cat['categorie']} already exists, updating...")
                conn.execute(
                    text("""
                        UPDATE ss_types_frais 
                        SET montant_defaut = :montant, est_obligatoire = :obligatoire 
                        WHERE code = :code
                    """),
                    {"montant": cat['montant'], "obligatoire": cat['obligatoire'], "code": cat['code']}
                )

        conn.commit()
        print("Migration and seeding completed successfully.")

if __name__ == "__main__":
    migrate()
