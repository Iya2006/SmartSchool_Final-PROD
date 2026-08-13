"""
Migration — un rôle personnalisé hérite de l'espace d'un rôle existant.

CE QUE ÇA RÈGLE
---------------
L'écran « Paramètres > Sécurité » laisse créer un rôle — CENSEUR, Censeur des
études — et le crée réellement. Mais ce rôle n'ouvrait RIEN :

  * le formulaire du personnel propose une liste figée dans le code, où le
    nouveau rôle n'apparaît jamais ;
  * `require_roles` ne connaît que les rôles statiques, donc toutes les routes
    répondent 403 ;
  * la matrice de permissions ne peut que RETIRER un accès, jamais en ouvrir
    un — règle de sécurité centrale qu'il ne faut surtout pas casser.

L'endpoint le disait lui-même en réponse : « Il n'est pas attribuable à un
compte ». Une école qui crée un censeur se retrouvait donc avec un rôle
décoratif.

CE QUI EST FAIT
---------------
`ss_roles` gagne une colonne `role_base` : le rôle standard dont le rôle
personnalisé hérite l'espace. « Censeur des études » se base sur
DIRECTEUR_NIVEAU ; « Caissier » sur COMPTABLE.

La règle de sécurité reste intacte : un rôle personnalisé n'obtient JAMAIS
plus que sa base. La matrice continue de ne faire que restreindre. On ne crée
pas de nouveau pouvoir, on donne un nom local à un pouvoir qui existe déjà —
ce qui est exactement ce qu'une école veut dire par « censeur ».

Les rôles déjà créés sans base sont listés, pas devinés : personne d'autre que
l'école ne peut décider qu'un « Censeur » doit voir la comptabilité.

Idempotente.

Run with: python backend/migrations/2026_08_roles_01_role_base.py
          python backend/migrations/2026_08_roles_01_role_base.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine


def _colonne_existe(conn) -> bool:
    return conn.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ss_roles' AND column_name = 'role_base'
    """)).first() is not None


def migrate() -> int:
    with engine.begin() as conn:
        if _colonne_existe(conn):
            print("   [=]  ss_roles.role_base existe deja")
        else:
            conn.execute(text(
                "ALTER TABLE ss_roles ADD COLUMN role_base VARCHAR(30)"
            ))
            print("   [OK] ss_roles.role_base ajoutee")

        # Les rôles systèmes sont leur propre base : ce sont eux qui portent
        # les accès.
        maj = conn.execute(text("""
            UPDATE ss_roles SET role_base = code
            WHERE est_systeme = 'O' AND role_base IS NULL
        """)).rowcount
        if maj:
            print(f"   [OK] {maj} role(s) systeme(s) rattache(s) a eux-memes")

        orphelins = conn.execute(text("""
            SELECT etablissement_id, code, libelle FROM ss_roles
            WHERE role_base IS NULL ORDER BY etablissement_id, code
        """)).fetchall()
        if orphelins:
            print(f"\n[A TRANCHER] {len(orphelins)} role(s) personnalise(s) sans espace.")
            print("Ils restent sans acces tant que l'ecole n'a pas choisi le role")
            print("dont ils heritent. Personne d'autre ne peut decider qu'un")
            print("« Censeur » doit voir la comptabilite.\n")
            for eid, code, libelle in orphelins:
                print(f"   ecole {eid} : {code} — {libelle}")

    print("\n[DONE] Un role personnalise peut desormais heriter d'un espace.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        if not _colonne_existe(conn):
            print("   [A FAIRE] ss_roles.role_base absente")
            return 1
        print("   [OK] ss_roles.role_base presente")
        lignes = conn.execute(text("""
            SELECT etablissement_id, code, libelle, est_systeme, role_base
            FROM ss_roles ORDER BY etablissement_id, code
        """)).fetchall()
        if not lignes:
            print("   aucun role enregistre")
            return 0
        for eid, code, libelle, systeme, base in lignes:
            marque = "[OK]" if base else "[SANS ESPACE]"
            print(f"   {marque} ecole {eid} : {code:<18} {libelle:<28} "
                  f"base={base or '—'}{'  (systeme)' if systeme == 'O' else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
