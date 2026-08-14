"""
Migration — un membre du personnel peut exister sans compte de connexion.

CE QUE ÇA RÈGLE
---------------
`app/api/personnel.py::create_personnel` annonce depuis toujours :

    - Si mot_de_passe fourni → compte système créé, accès logiciel activé.
    - Si mot_de_passe absent → staff technique sans accès (nettoyeurs, gardiens…).

La deuxième ligne ne fonctionnait pas. `ss_utilisateurs.nom_utilisateur` et
`ss_utilisateurs.mot_de_passe` étaient NOT NULL : créer un gardien sans compte
échouait en erreur serveur, sans message compréhensible pour la secrétaire qui
remplissait le formulaire.

Une école a pourtant besoin d'eux EN BASE même sans accès logiciel : il faut
les payer. Le gardien, l'agent d'entretien et le chauffeur n'ont aucun écran à
consulter, mais ils ont un salaire mensuel, des absences et un bulletin de
paie.

CE QUI EST FAIT
---------------
Les deux colonnes deviennent facultatives. Un compte sans mot de passe ne peut
de toute façon plus s'ouvrir (voir `app/core/security.py::verify_password`, qui
n'accepte plus de passe-partout) : l'absence de mot de passe signifie
maintenant exactement ce qu'elle dit — pas d'accès.

L'index unique sur `nom_utilisateur` est conservé tel quel : PostgreSQL
autorise plusieurs NULL dans un index unique, donc dix gardiens sans login ne
se gênent pas.

Idempotente : relancer ne fait rien si les colonnes sont déjà facultatives.

Run with: python backend/migrations/2026_08_personnel_01_compte_facultatif.py
          python backend/migrations/2026_08_personnel_01_compte_facultatif.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

COLONNES = ("nom_utilisateur", "mot_de_passe")


def _nullable(conn) -> dict:
    lignes = conn.execute(text("""
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = 'ss_utilisateurs' AND column_name = ANY(:cols)
    """), {"cols": list(COLONNES)}).fetchall()
    return {nom: (etat == "YES") for nom, etat in lignes}


def migrate() -> int:
    with engine.begin() as conn:
        etat = _nullable(conn)
        if not etat:
            print("[!!] Table ss_utilisateurs introuvable ou colonnes absentes.")
            return 1

        for colonne in COLONNES:
            if etat.get(colonne):
                print(f"   [=]  {colonne} deja facultative")
                continue
            conn.execute(text(
                f"ALTER TABLE ss_utilisateurs ALTER COLUMN {colonne} DROP NOT NULL"
            ))
            print(f"   [OK] {colonne} devient facultative")

        # Un compte à moitié ouvert (login sans mot de passe, ou l'inverse) est
        # inutilisable : on le signale plutôt que de le corriger d'office, car
        # seule l'école sait si la personne doit avoir un accès ou non.
        boiteux = conn.execute(text("""
            SELECT count(*) FROM ss_utilisateurs
            WHERE (nom_utilisateur IS NULL) <> (mot_de_passe IS NULL)
               OR (nom_utilisateur = '') <> (mot_de_passe = '')
        """)).scalar()
        if boiteux:
            print(f"\n[A REGARDER] {boiteux} compte(s) a moitie ouverts : un login")
            print("sans mot de passe, ou l'inverse. Ils ne peuvent pas se connecter.")
            print("A l'ecole de decider si ces personnes doivent avoir un acces.")

    print("\n[DONE] Un membre du personnel peut exister sans compte de connexion.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        for colonne, facultative in _nullable(conn).items():
            marque = "[OK]" if facultative else "[A FAIRE]"
            print(f"   {marque} {colonne} : "
                  f"{'facultative' if facultative else 'obligatoire'}")
        sans_compte = conn.execute(text("""
            SELECT role, count(*) FROM ss_utilisateurs
            WHERE nom_utilisateur IS NULL GROUP BY role ORDER BY role
        """)).fetchall()
        if sans_compte:
            print("\n   Personnel sans compte de connexion :")
            for role, nb in sans_compte:
                print(f"      {role:<20} {nb}")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
