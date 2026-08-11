"""
SMARTSCHOOL — Création du premier compte administrateur.

Il n'existe aucun endpoint d'inscription pour un compte SUPER_ADMIN (par
conception — seul un compte déjà admin peut en créer d'autres via
l'interface). Ce script comble ce point de départ : à exécuter UNE FOIS,
manuellement, après le premier déploiement (voir GUIDE_DEPLOIEMENT.md).

Usage :
    cd backend
    python create_admin.py

Lit DATABASE_URL depuis l'environnement (ou backend/.env) — pointez-le
vers votre base réelle (Supabase en production) avant de lancer ce script.
"""
import getpass
import sys

from app.core.database import SessionLocal, Base, engine
from app.core.security import hash_password
from app.models.academique import Utilisateur


def main():
    Base.metadata.create_all(bind=engine)  # garantit que la table existe déjà
    db = SessionLocal()
    try:
        nom_utilisateur = input("Nom d'utilisateur (identifiant de connexion) : ").strip()
        if not nom_utilisateur:
            print("Annulé : nom d'utilisateur vide.")
            sys.exit(1)

        existant = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == nom_utilisateur
        ).first()
        if existant:
            print(f"Erreur : un compte '{nom_utilisateur}' existe déjà (rôle: {existant.role}).")
            sys.exit(1)

        nom = input("Nom : ").strip() or "Admin"
        prenom = input("Prénom : ").strip() or "Principal"
        mot_de_passe = getpass.getpass("Mot de passe (saisie masquée) : ")
        confirmation = getpass.getpass("Confirmez le mot de passe : ")
        if mot_de_passe != confirmation:
            print("Annulé : les deux mots de passe ne correspondent pas.")
            sys.exit(1)
        if len(mot_de_passe) < 8:
            print("Annulé : mot de passe trop court (8 caractères minimum).")
            sys.exit(1)

        admin = Utilisateur(
            nom_utilisateur=nom_utilisateur,
            mot_de_passe=hash_password(mot_de_passe),
            nom=nom,
            prenom=prenom,
            role="SUPER_ADMIN",
            statut="ACTIF",
        )
        db.add(admin)
        db.commit()
        print(f"\nCompte SUPER_ADMIN '{nom_utilisateur}' créé avec succès.")
        print("Connectez-vous via /api/auth/login avec ces identifiants.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
