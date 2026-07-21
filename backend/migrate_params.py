import os
import sys
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql+pg8000://admin:admin@localhost:5433/mydb"
engine = create_engine(DATABASE_URL)

def upgrade():
    with engine.begin() as conn:
        try:
            conn.execute(text('ALTER TABLE ss_etablissements ADD COLUMN favicon_url VARCHAR(500)'))
            print("favicon_url added")
        except Exception as e:
            print("favicon_url error:", e)

        try:
            conn.execute(text('ALTER TABLE ss_etablissements ADD COLUMN cachet_url VARCHAR(500)'))
            print("cachet_url added")
        except Exception as e:
            print("cachet_url error:", e)

        try:
            conn.execute(text('ALTER TABLE ss_etablissements ADD COLUMN signature_url VARCHAR(500)'))
            print("signature_url added")
        except Exception as e:
            print("signature_url error:", e)

        try:
            conn.execute(text('ALTER TABLE ss_etablissements ADD COLUMN slogan VARCHAR(255)'))
            print("slogan added")
        except Exception as e:
            print("slogan error:", e)

        try:
            conn.execute(text('''
                CREATE TABLE IF NOT EXISTS ss_parametres (
                    parametre_id SERIAL PRIMARY KEY,
                    etablissement_id INTEGER NOT NULL REFERENCES ss_etablissements(etablissement_id),
                    categorie VARCHAR(50) NOT NULL,
                    cle VARCHAR(100) NOT NULL,
                    valeur TEXT NOT NULL,
                    type_valeur VARCHAR(20) DEFAULT 'TEXT',
                    UNIQUE(etablissement_id, cle)
                )
            '''))
            print("table ss_parametres created")
        except Exception as e:
            print("table ss_parametres error:", e)

if __name__ == '__main__':
    upgrade()
