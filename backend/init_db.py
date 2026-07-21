from app.core.database import engine, Base
# Import global de tous les modèles pour s'assurer que Base les recense tous.
from app.models.academique import *

print("Création de TOUTES les tables dans la base de données PostgreSQL...")
Base.metadata.create_all(bind=engine)
print("Toutes les tables ont été créées avec succès !")
