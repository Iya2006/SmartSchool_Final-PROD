"""
SMARTSCHOOL — Script de migration
Hashe tous les mots de passe existants en clair vers bcrypt.
À exécuter UNE SEULE FOIS après la mise à jour du code.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.core.security import hash_password, pwd_context
from app.models.academique import Enseignant, Parent


def is_already_hashed(pwd: str) -> bool:
    """Vérifie si un mot de passe est déjà hashé (commence par $2b$)."""
    return pwd.startswith("$2b$") or pwd.startswith("$2a$")


def migrate():
    db = SessionLocal()
    count_ens = 0
    count_par = 0

    print("=" * 50)
    print("MIGRATION: Hashage des mots de passe")
    print("=" * 50)

    # 1. Enseignants
    enseignants = db.query(Enseignant).filter(Enseignant.mot_de_passe.isnot(None)).all()
    for ens in enseignants:
        if ens.mot_de_passe and ens.mot_de_passe.strip() and not is_already_hashed(ens.mot_de_passe):
            print(f"  [ENS] {ens.matricule} {ens.prenom} {ens.nom} — hashage...")
            ens.mot_de_passe = hash_password(ens.mot_de_passe)
            count_ens += 1

    # 2. Parents
    parents = db.query(Parent).filter(Parent.mot_de_passe.isnot(None)).all()
    for par in parents:
        if par.mot_de_passe and par.mot_de_passe.strip() and not is_already_hashed(par.mot_de_passe):
            print(f"  [PAR] {par.prenom} {par.nom} — hashage...")
            par.mot_de_passe = hash_password(par.mot_de_passe)
            count_par += 1

    db.commit()
    db.close()

    print(f"\n✅ Migration terminée !")
    print(f"   Enseignants hashés : {count_ens}")
    print(f"   Parents hashés     : {count_par}")
    print(f"   Total              : {count_ens + count_par}")


if __name__ == "__main__":
    migrate()
