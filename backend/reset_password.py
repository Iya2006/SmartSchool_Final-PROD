"""
SMARTSCHOOL — Réinitialisation du mot de passe d'un compte existant.

Utile quand un mot de passe a été mal saisi lors de la création (via
create_admin.py) et qu'aucune interface de "mot de passe oublié" n'existe
encore. Ne crée jamais de compte — échoue proprement si l'identifiant
n'existe pas.

Usage :
    cd backend
    python reset_password.py
"""
import getpass
import sys

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.academique import Utilisateur


def main():
    db = SessionLocal()
    try:
        nom_utilisateur = input("Nom d'utilisateur du compte à réinitialiser : ").strip()
        user = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == nom_utilisateur
        ).first()
        if not user:
            print(f"Erreur : aucun compte '{nom_utilisateur}' trouvé.")
            sys.exit(1)

        print(f"Compte trouvé : {user.prenom} {user.nom} (rôle: {user.role}, statut: {user.statut})")

        mot_de_passe = getpass.getpass("Nouveau mot de passe (saisie masquée) : ")
        confirmation = getpass.getpass("Confirmez le nouveau mot de passe : ")
        if mot_de_passe != confirmation:
            print("Annulé : les deux mots de passe ne correspondent pas.")
            sys.exit(1)
        if len(mot_de_passe) < 8:
            print("Annulé : mot de passe trop court (8 caractères minimum).")
            sys.exit(1)

        user.mot_de_passe = hash_password(mot_de_passe)
        db.commit()
        print(f"\nMot de passe de '{nom_utilisateur}' mis à jour avec succès.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
