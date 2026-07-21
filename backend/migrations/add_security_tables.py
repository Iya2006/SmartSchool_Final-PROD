import sys
import os

# Ajouter le répertoire parent au sys.path pour les imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal, Base
from app.models.academique import Role, Permission, AuditLog, Etablissement

def run_migration():
    print("Création des tables de sécurité...")
    Role.__table__.create(bind=engine, checkfirst=True)
    Permission.__table__.create(bind=engine, checkfirst=True)
    AuditLog.__table__.create(bind=engine, checkfirst=True)
    print("Tables créées.")

    db: Session = SessionLocal()
    try:
        # Vérifier si l'établissement par défaut existe
        etab = db.query(Etablissement).first()
        if not etab:
            print("Aucun établissement trouvé. Création de l'établissement par défaut...")
            etab = Etablissement(code="DEFAULT", nom="SmartSchool Default", type_etablissement="PUBLIC")
            db.add(etab)
            db.commit()
            db.refresh(etab)

        # Vérifier si les rôles existent déjà
        roles_count = db.query(Role).count()
        if roles_count == 0:
            print("Création des rôles par défaut...")
            system_roles = [
                {"code": "SUPER_ADMIN", "libelle": "Super Administrateur", "description": "Accès total au système", "est_systeme": "O"},
                {"code": "ADMIN", "libelle": "Administrateur", "description": "Gestion de l'établissement", "est_systeme": "O"},
                {"code": "ENSEIGNANT", "libelle": "Enseignant", "description": "Professeur", "est_systeme": "O"},
                {"code": "PARENT", "libelle": "Parent", "description": "Parent d'élève", "est_systeme": "O"},
                {"code": "ELEVE", "libelle": "Élève", "description": "Étudiant", "est_systeme": "O"}
            ]

            modules = ["Élèves", "Enseignants", "Notes", "Bulletins", "Finance", "Comptabilité", "Vie Scolaire", "Emploi du Temps", "Paramètres", "Sécurité"]
            actions = ["lecture", "ecriture", "suppression", "export"]

            for r_data in system_roles:
                role = Role(
                    etablissement_id=etab.etablissement_id,
                    code=r_data["code"],
                    libelle=r_data["libelle"],
                    description=r_data["description"],
                    est_systeme=r_data["est_systeme"]
                )
                db.add(role)
                db.flush()

                # Ajouter des permissions en fonction du rôle
                for mod in modules:
                    for act in actions:
                        est_autorise = "O" if r_data["code"] in ["SUPER_ADMIN", "ADMIN"] else "N"
                        
                        # Exemples de permissions spécifiques
                        if r_data["code"] == "ENSEIGNANT" and mod in ["Notes", "Élèves"] and act in ["lecture", "ecriture"]:
                            est_autorise = "O"
                        elif r_data["code"] == "PARENT" and mod in ["Notes", "Bulletins", "Vie Scolaire"] and act == "lecture":
                            est_autorise = "O"
                        elif r_data["code"] == "ELEVE" and mod in ["Notes", "Bulletins", "Emploi du Temps"] and act == "lecture":
                            est_autorise = "O"

                        perm = Permission(
                            role_id=role.role_id,
                            module=mod,
                            action=act,
                            est_autorise=est_autorise
                        )
                        db.add(perm)

            db.commit()
            print("Rôles par défaut et permissions créés avec succès.")
        else:
            print("Les rôles de sécurité existent déjà.")
    except Exception as e:
        db.rollback()
        print(f"Erreur lors de la migration: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
