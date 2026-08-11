"""
AMORÇAGE DE LA PLATEFORME — première école + rattachement de l'administrateur.

À quoi ça sert
--------------
Depuis le chantier multi-écoles, `etablissement_id` vient exclusivement du JWT
et `require_etablissement` refuse (403) tout compte qui n'en a pas. C'est
voulu : `None` ne doit jamais valoir « accès à tout ».

Conséquence sur une plateforme NEUVE : le premier SUPER_ADMIN, créé par
`create_admin.py` sans établissement, ne peut entrer dans aucun écran métier.
Il peut créer une école, mais pas y travailler ni lui créer un administrateur.
Ce script règle cet amorçage.

Ce qu'il fait
-------------
1. Crée un établissement s'il n'en existe AUCUN (jamais s'il en existe déjà).
2. Crée une année scolaire courante pour cet établissement s'il n'en a aucune
   (l'application en a besoin partout : classes, notes, factures).
3. Rattache à cet établissement les comptes SUPER_ADMIN qui n'en ont pas.

Ce qu'il ne fait PAS
--------------------
- Il ne touche à aucun compte déjà rattaché à une école.
- Il ne crée rien si une école existe déjà : dans ce cas, passer par
  l'interface (le SUPER_ADMIN choisit son école active, voir
  `POST /api/auth/etablissement-actif`).
- Aucune suppression, aucune fusion, aucun écrasement.

Usage
-----
    cd backend
    python scripts/amorcer_plateforme.py                  # affiche ce qui serait fait
    python scripts/amorcer_plateforme.py --appliquer      # applique
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal  # noqa: E402
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

        orphelins = db.query(Utilisateur).filter(
            Utilisateur.role == "SUPER_ADMIN",
            Utilisateur.etablissement_id.is_(None),
        ).all()

        for u in orphelins:
            actions.append(f"RATTACHER le compte « {u.nom_utilisateur} » (SUPER_ADMIN) "
                           f"a cet etablissement")
            if appliquer and cible is not None:
                u.etablissement_id = cible.etablissement_id

        if not orphelins:
            print("[OK] Aucun SUPER_ADMIN sans etablissement. Aucun rattachement.")

        if not actions:
            print("\n[DONE] Rien a faire : la plateforme est deja amorcee.")
            return 0

        print("\n--- ACTIONS " + ("APPLIQUEES" if appliquer else "PREVUES") + " ---")
        for a in actions:
            print("   *", a)

        if appliquer:
            db.commit()
            print(f"\n[DONE] Amorcage termine. Reconnectez-vous pour que votre jeton "
                  f"porte le nouvel etablissement.")
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
