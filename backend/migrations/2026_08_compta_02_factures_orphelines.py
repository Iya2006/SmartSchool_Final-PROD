"""
Migration — factures rattachées à rien.

CE QU'ON A TROUVÉ
-----------------
Les 45 factures de la base portent :

    type_frais_id = NULL   — on ne sait pas CE QUI est facturé
    annee_id      = NULL   — on ne sait pas SUR QUELLE ANNÉE

Une facture sans type de frais n'est pas rattachable à une recette : elle
n'apparaît sous aucun intitulé dans les rapports, et le total « recettes par
type de frais » l'ignore purement et simplement. Une facture sans année ne se
range dans aucun exercice.

Ce qui compte ici : ce sont des créances réelles, 1 500 000 GNF chacune, avec
des paiements déjà encaissés en face. On ne les supprime pas et on ne les
invente pas.

CE QUI SE DÉDUIT, ET CE QUI NE SE DÉDUIT PAS
--------------------------------------------
`annee_id` SE DÉDUIT : une facture porte une inscription, et une inscription
porte son année. C'est une relation réelle, pas une supposition.

    UPDATE ss_factures f SET annee_id = i.annee_id
    FROM ss_inscriptions i WHERE i.inscription_id = f.inscription_id

`type_frais_id` NE SE DÉDUIT PAS. L'école n'a qu'un seul type de frais, mais
lui rattacher 45 factures de 1 500 000 GNF parce qu'il est le seul disponible
écrirait une supposition avec l'autorité d'une donnée saisie — sur de l'argent.
Ces factures sont donc LISTÉES, et l'écran Frais & Tarifs les signale pour que
l'école les rattache elle-même, en connaissance de cause.

POURQUOI PAS UNE CONTRAINTE NOT NULL
------------------------------------
Poser `type_frais_id NOT NULL` échouerait tant que ces 45 lignes existent, et
la poser après les avoir « réparées » au hasard reviendrait à maquiller le
problème. Le verrou est mis à l'écriture — toutes les routes de création
exigent déjà un type, désormais borné à l'école appelante — et la contrainte
pourra être posée le jour où plus aucune facture orpheline ne subsiste.

Idempotente : relancer ne touche que ce qui est encore NULL.

Run with: python backend/migrations/2026_08_compta_02_factures_orphelines.py
          python backend/migrations/2026_08_compta_02_factures_orphelines.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine


def _compte(conn, condition: str) -> int:
    return conn.execute(text(f"SELECT count(*) FROM ss_factures WHERE {condition}")).scalar() or 0


def _sans_type(conn):
    """Factures sans type de frais, avec de quoi les reconnaitre a l'ecran."""
    return conn.execute(text("""
        SELECT f.facture_id, f.numero_facture, f.montant_net,
               COALESCE(e.prenom || ' ' || e.nom, '?') AS eleve,
               COALESCE(c.libelle, '?')                AS classe,
               COALESCE(cl.etablissement_id, 0)        AS etablissement_id
        FROM ss_factures f
        LEFT JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
        LEFT JOIN ss_eleves       e ON e.eleve_id       = i.eleve_id
        LEFT JOIN ss_classes      c ON c.classe_id      = i.classe_id
        LEFT JOIN ss_classes     cl ON cl.classe_id     = i.classe_id
        WHERE f.type_frais_id IS NULL
        ORDER BY f.facture_id
    """)).fetchall()


def migrate() -> int:
    with engine.begin() as conn:
        total = _compte(conn, "TRUE")
        sans_annee = _compte(conn, "annee_id IS NULL")
        print(f"Factures : {total} | sans annee : {sans_annee}")

        if sans_annee:
            # L'annee vient de l'inscription que la facture porte deja : une
            # relation reelle, pas une valeur choisie.
            res = conn.execute(text("""
                UPDATE ss_factures f
                SET    annee_id = i.annee_id
                FROM   ss_inscriptions i
                WHERE  i.inscription_id = f.inscription_id
                  AND  f.annee_id IS NULL
                  AND  i.annee_id IS NOT NULL
            """))
            print(f"[OK]   {res.rowcount} facture(s) rattachee(s) a l'annee de leur inscription")
            restant = _compte(conn, "annee_id IS NULL")
            if restant:
                print(f"[!]    {restant} facture(s) dont l'inscription elle-meme n'a pas d'annee")
        else:
            print("[=]    toutes les factures ont deja une annee")

        orphelines = _sans_type(conn)

    if orphelines:
        print(f"\n[A RATTACHER] {len(orphelines)} facture(s) sans type de frais.")
        print("Rien n'est devine : c'est l'ecole qui doit dire CE QUI est facture.")
        print("Ces factures apparaissent dans Comptabilite > Frais & Tarifs, avec")
        print("le moyen de les rattacher en une fois.\n")
        for fid, numero, montant, eleve, classe, etab in orphelines[:20]:
            print(f"   #{fid:<5} {numero:<12} {float(montant or 0):>13,.0f} GNF  "
                  f"{eleve:<24} {classe}")
        if len(orphelines) > 20:
            print(f"   ... et {len(orphelines) - 20} autre(s)")
    else:
        print("\n[DONE] Toutes les factures sont rattachees a un type de frais.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        print(f"Factures                : {_compte(conn, 'TRUE')}")
        print(f"  sans annee            : {_compte(conn, 'annee_id IS NULL')}")
        print(f"  sans type de frais    : {_compte(conn, 'type_frais_id IS NULL')}")
        orphelines = _sans_type(conn)
        if orphelines:
            print(f"\nA rattacher ({len(orphelines)}) :")
            for fid, numero, montant, eleve, classe, etab in orphelines[:20]:
                print(f"   #{fid:<5} {numero:<12} {float(montant or 0):>13,.0f} GNF  "
                      f"{eleve:<24} {classe}")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
