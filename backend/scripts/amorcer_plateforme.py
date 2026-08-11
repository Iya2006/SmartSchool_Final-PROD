"""
AMORÇAGE DE LA PLATEFORME — première école et son administrateur.

À quoi ça sert
--------------
Depuis le chantier multi-écoles, `etablissement_id` vient exclusivement du JWT
et `require_etablissement` refuse (403) tout compte qui n'en a pas. C'est
voulu : `None` ne doit jamais valoir « accès à tout ».

Conséquence sur une plateforme NEUVE : le premier SUPER_ADMIN, créé par
`create_admin.py` sans établissement, ne peut entrer dans aucun écran métier.
Il peut créer une école, mais pas y travailler ni lui créer un administrateur.
Ce script règle cet amorçage.

Deux rôles à ne pas confondre
-----------------------------
- **SUPER_ADMIN = l'éditeur de la plateforme** (vous). Il n'appartient à
  AUCUNE école : il les crée, les supervise, et entre dans l'une d'elles
  quand il en a besoin via `POST /api/auth/etablissement-actif`. Le
  rattacher à une école le dégraderait en simple administrateur.
- **ADMIN = le directeur / gestionnaire d'une école.** C'est lui qui vit
  dans l'établissement au quotidien.

Ce qu'il fait
-------------
1. Crée un établissement s'il n'en existe AUCUN (jamais s'il en existe déjà).
2. Crée une année scolaire courante pour cet établissement s'il n'en a aucune
   (l'application en a besoin partout : classes, notes, factures).
3. Crée le compte ADMIN de cette école, et affiche son mot de passe UNE FOIS.

Ce qu'il ne fait PAS
--------------------
- **Il ne rattache jamais un SUPER_ADMIN à une école** — il le détache même
  s'il en trouve un rattaché par erreur.
- Il ne touche à aucun compte ADMIN existant.
- Il ne crée aucune école s'il en existe déjà une.
- Aucune suppression, aucune fusion, aucun écrasement.

Usage
-----
    cd backend
    python scripts/amorcer_plateforme.py                  # affiche ce qui serait fait
    python scripts/amorcer_plateforme.py --appliquer      # applique
"""
import os
import secrets
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.academique import AnneeScolaire, Etablissement, Utilisateur  # noqa: E402

CODE_DEFAUT = "ETAB-001"
NOM_DEFAUT = "Mon établissement"
TYPE_DEFAUT = "LYCEE"


def _annee_scolaire_courante() -> tuple:
    """Année scolaire en cours, découpée sur septembre comme en Guinée."""
    aujourd_hui = date.today()
    debut = aujourd_hui.year if aujourd_hui.month >= 9 else aujourd_hui.year - 1
    return debut, debut + 1


def main() -> int:
    appliquer = "--appliquer" in sys.argv
    db = SessionLocal()
    actions = []

    try:
        etablissement = db.query(Etablissement).order_by(Etablissement.etablissement_id).first()

        if etablissement is None:
            actions.append(f"CREER l'etablissement « {NOM_DEFAUT} » (code {CODE_DEFAUT})")
            if appliquer:
                etablissement = Etablissement(
                    code=CODE_DEFAUT, nom=NOM_DEFAUT, type_etablissement=TYPE_DEFAUT,
                    statut="ACTIF", created_by="amorcage",
                )
                db.add(etablissement)
                db.flush()
        else:
            print(f"[OK] Un etablissement existe deja : #{etablissement.etablissement_id} "
                  f"{etablissement.nom}. Aucune creation.")

        cible = etablissement

        # En simulation, l'etablissement n'existe pas encore : il n'a donc
        # aucune annee. On l'annonce quand meme — une simulation qui tait une
        # action qu'elle finira par faire ne sert a rien.
        annee = None
        if cible is not None and cible.etablissement_id is not None:
            annee = db.query(AnneeScolaire).filter(
                AnneeScolaire.etablissement_id == cible.etablissement_id
            ).first()

        if annee is None:
            debut, fin = _annee_scolaire_courante()
            actions.append(f"CREER l'annee scolaire {debut}-{fin} (courante) pour cet etablissement")
            if appliquer and cible is not None:
                db.add(AnneeScolaire(
                    etablissement_id=cible.etablissement_id,
                    code=f"{debut}-{fin}", libelle=f"{debut}-{fin}",
                    date_debut=date(debut, 9, 1), date_fin=date(fin, 7, 31),
                    statut="EN_COURS", est_courante="O",
                ))
        else:
            print(f"[OK] Une annee scolaire existe deja : {annee.libelle}. Aucune creation.")

        # Un SUPER_ADMIN rattache a une ecole est une erreur : il devient un
        # simple administrateur de cette ecole et perd sa position d'editeur
        # de la plateforme. On le detache.
        rattaches_par_erreur = db.query(Utilisateur).filter(
            Utilisateur.role == "SUPER_ADMIN",
            Utilisateur.etablissement_id.isnot(None),
        ).all()

        for u in rattaches_par_erreur:
            actions.append(
                f"DETACHER le compte plateforme « {u.nom_utilisateur} » (SUPER_ADMIN) "
                f"de l'etablissement #{u.etablissement_id} — il supervise, il n'appartient "
                f"a aucune ecole"
            )
            if appliquer:
                u.etablissement_id = None

        if not rattaches_par_erreur:
            print("[OK] Aucun SUPER_ADMIN rattache a une ecole. Rien a detacher.")

        # Administrateur de l'ecole : c'est LUI qui la gere au quotidien.
        admin_ecole = None
        if cible is not None and cible.etablissement_id is not None:
            admin_ecole = db.query(Utilisateur).filter(
                Utilisateur.role == "ADMIN",
                Utilisateur.etablissement_id == cible.etablissement_id,
            ).first()

        mot_de_passe = None
        if admin_ecole is None:
            identifiant = "admin.ecole"
            actions.append(f"CREER le compte ADMIN de l'ecole « {identifiant} » "
                           f"(mot de passe affiche une seule fois)")
            if appliquer and cible is not None:
                mot_de_passe = secrets.token_urlsafe(9)
                db.add(Utilisateur(
                    nom="Administrateur", prenom="École",
                    nom_utilisateur=identifiant,
                    mot_de_passe=hash_password(mot_de_passe),
                    role="ADMIN", statut="ACTIF",
                    etablissement_id=cible.etablissement_id,
                ))
        else:
            print(f"[OK] L'ecole a deja un administrateur : « {admin_ecole.nom_utilisateur} ». "
                  f"Aucune creation.")

        if not actions:
            print("\n[DONE] Rien a faire : la plateforme est deja amorcee.")
            return 0

        print("\n--- ACTIONS " + ("APPLIQUEES" if appliquer else "PREVUES") + " ---")
        for a in actions:
            print("   *", a)

        if appliquer:
            db.commit()
            print("\n[DONE] Amorcage termine.")
            if mot_de_passe:
                print("\n" + "=" * 64)
                print("  IDENTIFIANTS DE L'ADMINISTRATEUR DE L'ECOLE")
                print("  Login        : admin.ecole")
                print(f"  Mot de passe : {mot_de_passe}")
                print("  A changer des la premiere connexion. Non reaffichable.")
                print("=" * 64)
            print("\nVotre compte SUPER_ADMIN reste l'editeur de la plateforme :")
            print("  il n'appartient a aucune ecole, et entre dans l'une d'elles")
            print("  via l'ecran de selection d'etablissement.")
        else:
            db.rollback()
            print("\n[SIMULATION] Rien n'a ete ecrit. Relancez avec --appliquer pour appliquer.")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"[ERREUR] {type(exc).__name__}: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
