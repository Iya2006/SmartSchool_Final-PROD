from app.core.database import engine
from sqlalchemy import text

def add_columns():
    with engine.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        columns = [
            "sexe VARCHAR(10)",
            "roles_secondaires JSONB",
            "type_contrat VARCHAR(50)",
            "date_embauche DATE",
            "salaire_base NUMERIC(10, 2)",
            "taux_horaire NUMERIC(10, 2)",
            "prime_mensuelle NUMERIC(10, 2)",
            "heures_hebdo INTEGER",
            "rib VARCHAR(100)",
            "mode_paiement_salaire VARCHAR(50)",
            "date_naissance DATE",
            "lieu_naissance VARCHAR(100)",
            "adresse VARCHAR(255)",
            "numero_cni VARCHAR(50)"
        ]
        
        for col in columns:
            try:
                conn.execute(text(f"ALTER TABLE ss_utilisateurs ADD COLUMN {col}"))
                print(f"Added {col}")
            except Exception as e:
                print(f"Skipped {col} (probably exists)")

if __name__ == "__main__":
    add_columns()
    print("Done")
