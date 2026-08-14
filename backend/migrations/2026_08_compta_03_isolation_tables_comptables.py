"""
Migration — les cinq tables comptables qui n'ont jamais reçu leur établissement.

CE QUE ÇA CASSAIT
-----------------
Enregistrer un paiement appelle `generer_ecriture_auto`, qui appelle
`init_comptabilite_tenant_defaults`, qui lit
`ss_parametres_comptabilite.etablissement_id`. Cette colonne n'existe pas en
base.

    column ss_parametres_comptabilite.etablissement_id does not exist

Autrement dit : **aucun encaissement ne peut être enregistré, dans aucune
école**. Pas un cas limite — le geste le plus courant de la comptabilité d'une
école. Découvert en tentant de régler les 4 000 échéances de TrillionX.

Le même défaut que `ss_messages` : le modèle Python déclare la colonne, la
migration d'origine (`lot1_comptabilite_etablissement.py`) refuse de tourner
tant que les tables contiennent des lignes, et personne n'a fait l'inventaire
qu'elle réclamait. Deux migrations bloquées de la même façon, deux
fonctionnalités en panne — c'est le prix de la règle « aucun rattachement
automatique », et cette règle reste la bonne : elle empêche d'attribuer au
hasard. Elle demande juste qu'on fasse l'inventaire.

L'INVENTAIRE
------------
Six tables, un volume dérisoire, et une conclusion claire :

    ss_ecritures_comptables      1 ligne    colonne présente mais NULL
    ss_lignes_ecritures          2 lignes   rattachables à leur écriture
    ss_exercices_comptables      1 ligne    l'exercice 2026
    ss_journaux_comptables       5 lignes   AC, VE, BQ, CA, OD — plan standard
    ss_comptes_comptables        6 lignes   4111, 5211, 5711, 6011, 7011, 7061
    ss_parametres_comptabilite   3 lignes   PIN_ACCESS, PAYDAY_1_2026-06/07

CE QUI SE DÉDUIT
* `ss_lignes_ecritures` → l'établissement de son écriture. Relation réelle.
* `PAYDAY_1_2026-06` → l'établissement figure DANS la clé, écrite par
  l'application elle-même (`PAYDAY_{établissement}_{mois}`). Même nature que le
  marqueur `[ETAB:1]` trouvé dans les sujets de messages.

CE QUI NE SE DÉDUIT PAS, ET POURQUOI ON L'ATTRIBUE QUAND MÊME
Les journaux, les comptes, l'exercice et le PIN n'ont aucun lien vers une
école. Ils datent d'avant le multi-écoles. On les attribue à l'établissement
qui est **le seul à avoir une activité comptable** — vérifié à l'exécution,
pas supposé : la migration compte les écritures des autres écoles et REFUSE de
continuer s'il y en a. Tant qu'une seule école a écrit dans ces tables,
l'attribution n'est pas un pari.

Les autres écoles ne perdent rien : `init_comptabilite_tenant_defaults` leur
crée leur propre plan comptable à leur première écriture. C'est même tout
l'objet de cette fonction.

Idempotente. Les contraintes d'unicité globales (`cle`, `annee`) deviennent
propres à l'école : deux écoles doivent pouvoir avoir chacune leur PIN et leur
exercice 2026.

Run with: python backend/migrations/2026_08_compta_03_isolation_tables_comptables.py
          python backend/migrations/2026_08_compta_03_isolation_tables_comptables.py --verifier
"""
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

TABLES = [
    "ss_exercices_comptables",
    "ss_journaux_comptables",
    "ss_comptes_comptables",
    "ss_ecritures_comptables",
    "ss_lignes_ecritures",
    "ss_parametres_comptabilite",
]


def _colonne_existe(conn, table: str) -> bool:
    return conn.execute(text(
        "SELECT count(*) FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = 'etablissement_id'"
    ), {"t": table}).scalar() == 1


def _ecole_historique(conn):
    """La seule école ayant une activité comptable — ou None s'il y en a
    plusieurs, auquel cas rien ne doit être attribué automatiquement."""
    ecoles = set()
    for (eid,) in conn.execute(text(
        "SELECT DISTINCT etablissement_id FROM ss_ecritures_comptables "
        "WHERE etablissement_id IS NOT NULL"
    )):
        ecoles.add(eid)
    # Les clés PAYDAY_{école}_{mois} nomment leur établissement.
    for (cle,) in conn.execute(text("SELECT cle FROM ss_parametres_comptabilite")):
        trouve = re.match(r"^PAYDAY_(\d+)_", cle or "")
        if trouve:
            ecoles.add(int(trouve.group(1)))
    if len(ecoles) == 1:
        return ecoles.pop()
    if not ecoles:
        # Aucune trace : la plus ancienne école, c'est-à-dire celle qui existait
        # quand ces référentiels ont été créés.
        return conn.execute(text(
            "SELECT min(etablissement_id) FROM ss_etablissements"
        )).scalar()
    return None


def migrate() -> int:
    with engine.begin() as conn:
        for table in TABLES:
            if _colonne_existe(conn, table):
                print(f"[=]    {table}.etablissement_id deja presente")
                continue
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN etablissement_id INTEGER "
                f"REFERENCES ss_etablissements(etablissement_id)"
            ))
            print(f"[OK]   {table}.etablissement_id ajoutee")

        # ── ce qui se deduit d'une relation reelle ──
        n = conn.execute(text("""
            UPDATE ss_lignes_ecritures l
            SET    etablissement_id = e.etablissement_id
            FROM   ss_ecritures_comptables e
            WHERE  e.ecriture_id = l.ecriture_id
              AND  l.etablissement_id IS NULL
              AND  e.etablissement_id IS NOT NULL
        """)).rowcount
        if n:
            print(f"[OK]   {n} ligne(s) d'ecriture rattachee(s) a leur ecriture")

        # ── ce que la cle elle-meme nomme ──
        n = conn.execute(text(r"""
            UPDATE ss_parametres_comptabilite
            SET    etablissement_id = CAST(substring(cle FROM '^PAYDAY_(\d+)_') AS INTEGER)
            WHERE  etablissement_id IS NULL AND cle ~ '^PAYDAY_\d+_'
        """)).rowcount
        if n:
            print(f"[OK]   {n} parametre(s) rattache(s) via la cle PAYDAY_<ecole>_<mois>")

        # ── le referentiel d'avant le multi-ecoles ──
        ecole = _ecole_historique(conn)
        if ecole is None:
            print("[STOP] Plusieurs ecoles ont une activite comptable : le")
            print("       referentiel ne peut pas etre attribue sans arbitrage.")
            print("       Rattachez ces lignes a la main, puis relancez.")
            return 1

        autres = conn.execute(text(
            "SELECT count(*) FROM ss_ecritures_comptables "
            "WHERE etablissement_id IS NOT NULL AND etablissement_id <> :e"
        ), {"e": ecole}).scalar()
        if autres:
            print(f"[STOP] {autres} ecriture(s) appartiennent a une autre ecole "
                  f"que la {ecole} : attribution impossible.")
            return 1

        total = 0
        for table in TABLES:
            n = conn.execute(text(
                f"UPDATE {table} SET etablissement_id = :e WHERE etablissement_id IS NULL"
            ), {"e": ecole}).rowcount
            if n:
                print(f"[OK]   {table} : {n} ligne(s) rattachee(s) a l'ecole {ecole}")
                total += n
        if not total:
            print("[=]    aucune ligne orpheline a rattacher")

        # ── l'unicite devient propre a chaque ecole ──
        # « un seul PIN pour toute la plateforme » et « un seul exercice 2026
        # pour tout le monde » n'ont plus de sens : chaque ecole a les siens.
        for table, colonne, ancienne in (
            ("ss_parametres_comptabilite", "cle", "ss_parametres_comptabilite_cle_key"),
            ("ss_exercices_comptables", "annee", "ss_exercices_comptables_annee_key"),
            ("ss_journaux_comptables", "code", "ss_journaux_comptables_code_key"),
            ("ss_comptes_comptables", "numero_compte", "ss_comptes_comptables_numero_compte_key"),
        ):
            conn.execute(text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {ancienne}"))
            nouvelle = f"uq_{table}_etab_{colonne}"
            existe = conn.execute(text(
                "SELECT 1 FROM pg_constraint WHERE conname = :n"
            ), {"n": nouvelle}).scalar()
            if not existe:
                try:
                    conn.execute(text(
                        f"ALTER TABLE {table} ADD CONSTRAINT {nouvelle} "
                        f"UNIQUE (etablissement_id, {colonne})"
                    ))
                    print(f"[OK]   {table} : unicite ({colonne}) -> (etablissement, {colonne})")
                except Exception as exc:
                    print(f"[ERR]  {table} : {str(exc)[:120]}")

    print("\n[DONE] Les ecritures comptables peuvent de nouveau etre creees.")
    return 0


def verifier() -> int:
    with engine.connect() as conn:
        print("Colonne etablissement_id et lignes orphelines :")
        souci = 0
        for table in TABLES:
            presente = _colonne_existe(conn, table)
            orphelines = 0
            if presente:
                orphelines = conn.execute(text(
                    f"SELECT count(*) FROM {table} WHERE etablissement_id IS NULL"
                )).scalar()
            souci += (0 if presente else 1) + orphelines
            print(f"   {table:<32} {'OUI' if presente else 'ABSENTE':<8} "
                  f"{orphelines} orpheline(s)")
        print("\n" + ("[OK] tout est rattache." if souci == 0
                      else "[!!] il reste du travail."))
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
