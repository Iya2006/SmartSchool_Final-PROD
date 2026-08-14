"""
Migration — la colonne `ss_messages.etablissement_id` qui n'a jamais été posée.

CE QUE LE MONITORING A REMONTÉ
------------------------------
46 incidents applicatifs, tous la même cause :

    column ss_messages.etablissement_id does not exist

Le modèle `Message` déclare cette colonne depuis le Lot 5 du chantier
multi-écoles. La base ne l'a jamais reçue. Résultat : **toute lecture de la
messagerie plantait en erreur 500** — l'écran Communication de l'école, et
l'historique des alertes de paie qui lit la même table.

POURQUOI LA MIGRATION D'ORIGINE N'EST JAMAIS PASSÉE
---------------------------------------------------
`lot5_communication_etablissement.py` refuse de s'exécuter dès que la table
contient des lignes, et renvoie « inventoriez ces lignes manuellement ». C'est
la bonne règle — elle interdit un `UPDATE ... SET etablissement_id = 1` qui
rattacherait au hasard. Mais personne n'a fait l'inventaire, et la migration
est restée en travers : la colonne n'a pas été ajoutée, et la messagerie est
tombée en panne sans que le lien soit fait.

L'INVENTAIRE, DONC
------------------
Les 17 messages présents viennent tous d'un ADMIN, sans identifiant
d'expéditeur. Deux cas :

* **Rattachables** — ceux qui visent un destinataire précis (`destinataire_id`
  renseigné vers un utilisateur). L'utilisateur porte son établissement :
  c'est une relation réelle, pas une supposition.
* **Non rattachables** — les diffusions (TOUS_ENSEIGNANTS, TOUS_PARENTS,
  TOUS_PERSONNEL) n'ont aucun identifiant. Rien dans la ligne ne dit de quelle
  école elles viennent.

CE QU'ON FAIT DES NON RATTACHABLES
-----------------------------------
On les laisse à NULL, et la colonne reste donc NULLABLE en base — contrairement
au NOT NULL prévu à l'origine.

Ce n'est pas un renoncement : le filtre d'isolation des routes est
`Message.etablissement_id == <école du jeton>`, et un NULL n'y répond jamais.
Un message dont on ignore l'école devient donc **invisible pour tout le monde**
plutôt que visible par la mauvaise. C'est la seule direction acceptable quand
on doit choisir entre perdre un message de démonstration et en montrer un à une
école étrangère.

Les messages NEUFS, eux, portent tous leur école : les cinq points de création
de `communication.py` renseignent `etablissement_id` depuis le jeton. Le NOT
NULL pourra être posé par une migration ultérieure le jour où plus aucune ligne
orpheline ne subsiste — même démarche que les factures sans type de frais.

Idempotente : relancer n'ajoute rien et ne retouche que ce qui est encore NULL.

Run with: python backend/migrations/2026_08_multi_02_messages_etablissement.py
          python backend/migrations/2026_08_multi_02_messages_etablissement.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

TABLES = ("ss_messages", "ss_demandes_emploi")


def _colonne_existe(conn, table: str) -> bool:
    return conn.execute(text(
        "SELECT count(*) FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = 'etablissement_id'"
    ), {"t": table}).scalar() == 1


def _orphelins(conn):
    return conn.execute(text("""
        SELECT message_id, expediteur_type, destinataire_type, sujet, date_envoi
        FROM ss_messages
        WHERE etablissement_id IS NULL
        ORDER BY message_id
    """)).fetchall()


def migrate() -> int:
    with engine.begin() as conn:
        for table in TABLES:
            if _colonne_existe(conn, table):
                print(f"[=]    {table}.etablissement_id deja presente")
                continue
            # NULLABLE, volontairement : voir l'en-tete. Un NOT NULL echouerait
            # sur les diffusions sans destinataire, et les remplir au hasard
            # ferait apparaitre un message dans une ecole qui ne l'a pas ecrit.
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN etablissement_id INTEGER "
                f"REFERENCES ss_etablissements(etablissement_id)"
            ))
            print(f"[OK]   {table}.etablissement_id ajoutee (nullable)")

        # L'ecole vient du destinataire reel du message, jamais d'une valeur
        # choisie. Un message adresse a un utilisateur precis herite de SON
        # etablissement.
        rattaches = conn.execute(text("""
            UPDATE ss_messages m
            SET    etablissement_id = u.etablissement_id
            FROM   ss_utilisateurs u
            WHERE  u.utilisateur_id = m.destinataire_id
              AND  m.destinataire_id IS NOT NULL
              AND  m.etablissement_id IS NULL
              AND  u.etablissement_id IS NOT NULL
        """)).rowcount

        # Meme principe pour un message adresse a un enseignant ou a un parent.
        for table, cle in (("ss_enseignants", "enseignant_id"), ("ss_parents", "parent_id")):
            rattaches += conn.execute(text(f"""
                UPDATE ss_messages m
                SET    etablissement_id = e.etablissement_id
                FROM   {table} e
                WHERE  e.{cle} = m.destinataire_id
                  AND  m.destinataire_id IS NOT NULL
                  AND  m.etablissement_id IS NULL
                  AND  e.etablissement_id IS NOT NULL
                  AND  m.destinataire_type IN ('ENSEIGNANT', 'PARENT')
            """)).rowcount

        print(f"[OK]   {rattaches} message(s) rattache(s) depuis leur destinataire reel")

        # Les diffusions n'ont pas de destinataire, mais l'application y avait
        # ecrit son propre contournement : elle prefixait le sujet de
        # « [ETAB:1] » faute de colonne pour le porter. C'est une trace laissee
        # par le code lui-meme, pas une supposition de notre part — on la lit,
        # puis on la retire du sujet puisque la colonne la porte desormais.
        # Sans ce retrait, les parents continueraient de lire « [ETAB:1] » en
        # tete de chaque annonce.
        depuis_marqueur = conn.execute(text(r"""
            UPDATE ss_messages
            SET    etablissement_id = CAST(substring(sujet FROM '^\[ETAB:(\d+)\]') AS INTEGER),
                   sujet = regexp_replace(sujet, '^\[ETAB:\d+\]\s*', '')
            WHERE  etablissement_id IS NULL
              AND  sujet ~ '^\[ETAB:\d+\]'
              AND  EXISTS (
                     SELECT 1 FROM ss_etablissements e
                     WHERE e.etablissement_id =
                           CAST(substring(sujet FROM '^\[ETAB:(\d+)\]') AS INTEGER)
                   )
        """)).rowcount
        if depuis_marqueur:
            print(f"[OK]   {depuis_marqueur} diffusion(s) rattachee(s) via le marqueur "
                  f"[ETAB:n] du sujet, marqueur retire de l'affichage")

        restants = _orphelins(conn)

    if restants:
        print(f"\n[SANS ECOLE] {len(restants)} message(s) dont la ligne ne dit pas")
        print("l'ecole : ce sont des diffusions, sans destinataire identifie.")
        print("Ils restent a NULL, donc invisibles de toutes les ecoles — plutot")
        print("que visibles par la mauvaise. Rien n'est perdu, rien n'est invente.\n")
        for mid, exp, dest, sujet, quand in restants[:20]:
            print(f"   #{mid:<4} {exp:<8} -> {dest:<18} {str(sujet)[:38]:40} {quand}")
        if len(restants) > 20:
            print(f"   ... et {len(restants) - 20} autre(s)")
    else:
        print("\n[DONE] Tous les messages portent leur etablissement.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        for table in TABLES:
            print(f"{table}.etablissement_id : "
                  f"{'presente' if _colonne_existe(conn, table) else 'ABSENTE'}")
        if not _colonne_existe(conn, "ss_messages"):
            return 1
        total = conn.execute(text("SELECT count(*) FROM ss_messages")).scalar()
        sans = conn.execute(text(
            "SELECT count(*) FROM ss_messages WHERE etablissement_id IS NULL"
        )).scalar()
        print(f"\nMessages : {total} | rattaches : {total - sans} | sans ecole : {sans}")
        for r in conn.execute(text("""
            SELECT etablissement_id, count(*) FROM ss_messages
            GROUP BY etablissement_id ORDER BY etablissement_id NULLS LAST
        """)):
            libelle = f"ecole {r[0]}" if r[0] else "sans ecole (invisible)"
            print(f"   {libelle:<26} {r[1]} message(s)")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
