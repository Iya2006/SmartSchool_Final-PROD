import sqlite3

def add_columns():
    conn = sqlite3.connect('smartschool.db')
    cursor = conn.cursor()
    columns_to_add = [
        ("sexe", "VARCHAR(10) DEFAULT 'M'"),
        ("roles_secondaires", "JSON"),
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
    
    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE ss_utilisateurs ADD COLUMN {col_name} {col_type}")
            print(f"Added {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column {col_name} already exists")
            else:
                print(f"Error adding {col_name}: {e}")
                
    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_columns()
