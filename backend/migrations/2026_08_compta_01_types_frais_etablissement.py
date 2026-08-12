"""
Migration — les TYPES DE FRAIS appartiennent à chaque école.

LE PROBLÈME
-----------
`ss_types_frais` (Scolarité, Inscription, Cantine, Transport…) était une table
partagée par toute la plateforme, sans colonne établissement. Conséquences :

    L'école A renomme « Scolarité » en « Frais annuels ».
    Le lendemain, toutes les autres écoles voient ce nom sur LEURS factures
    et LEURS reçus.

Et les routes qui les créent, modifient et suppriment ne vérifiaient pas
l'école : n'importe quel comptable pouvait supprimer un type de frais utilisé
par une autre école, invalidant ses factures.

C'est le même défaut que celui corrigé sur les types d'évaluation
(2026_08_notation_09), mais il touche ici l'argent.

CE QU'ELLE FAIT
---------------
1. Ajoute `etablissement_id`.
2. Remplace l'unicité GLOBALE du code par une unicité PAR ÉCOLE — sans quoi
   deux écoles ne pourraient pas avoir chacune leur type « SCOL ».

RATTACHEMENT : LU, JAMAIS DEVINÉ
--------------------------------
Un type de frais est rattaché à l'école de ses FACTURES — jointe par
`Facture → Inscription → Classe`, la facture ne portant pas elle-même d'école.
Ce n'est pas un choix, c'est la vérité déjà en base. Un type facturé dans plusieurs écoles ne
peut pas être rattaché automatiquement — il faudrait le dédoubler, ce qui est
une décision humaine. La migration s'arrête alors et le liste.

Un type jamais facturé n'a aucune école déductible : `--rattacher-a` permet de
le désigner explicitement.

Run with: python backend/migrations/2026_08_compta_01_types_frais_etablissement.py
          python backend/migrations/2026_08_compta_01_types_frais_etablissement.py --rattacher-a 1
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, text

from app.core.database import SQLALCHEMY_DATABASE_URL, engine

TABLE = "ss_types_frais"
INDEX_PAR_ECOLE = "uq_types_frais_etab_code"


def _index_existe(conn, nom: str) -> bool:
    return conn.execute(text(
        "SELECT 1 FROM pg_class WHERE relkind='i' AND relname=:n"
    ), {"n": nom}).first() is not None


def _contraintes_code_seul(conn) -> list:
    lignes = conn.execute(text("""
        SELECT c.conname FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = :t AND c.contype = 'u'
          AND (SELECT count(*) FROM unnest(c.conkey)) = 1
          AND EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = t.oid AND a.attnum = c.conkey[1] AND a.attname = 'code')
    """), {"t": TABLE}).all()
    return [r[0] for r in lignes]


def migrate(rattacher_a: int = None) -> int:
    # ── 1. La colonne ─────────────────────────────────────────────────────
    with engine.begin() as conn:
        conn.execute(text(
            f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
            "REFERENCES ss_etablissements(etablissement_id)"
        ))
    print(f"[OK] {TABLE}.etablissement_id present")

    # ── 2. Rattachement lu dans les factures reelles ──────────────────────
    with engine.connect() as conn:
        total = conn.execute(text(f"SELECT count(*) FROM {TABLE}")).scalar()
        ambigus = conn.execute(text(f"""
            SELECT tf.type_frais_id, tf.code, tf.libelle,
                   count(DISTINCT cl.etablissement_id) AS nb
            FROM {TABLE} tf
            JOIN ss_factures f ON f.type_frais_id = tf.type_frais_id
            JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
            JOIN ss_classes cl ON cl.classe_id = i.classe_id
            WHERE tf.etablissement_id IS NULL
            GROUP BY tf.type_frais_id, tf.code, tf.libelle
            HAVING count(DISTINCT cl.etablissement_id) > 1
        """)).all()

    print(f"Etat reel : {total} type(s) de frais, {len(ambigus)} factures dans plusieurs ecoles")

    if ambigus:
        print("\n[STOP] STOP — ces types de frais sont factures dans PLUSIEURS ecoles.")
        print("   Les rattacher a une seule invaliderait les factures des autres ;")
        print("   il faut les DEDOUBLER, ce qui est une decision humaine.")
        for r in ambigus:
            print(f"     #{r[0]:<4} {r[1]:<14} {r[2]:<28} {r[3]} ecoles")
        return 1

    with engine.begin() as conn:
        rattaches = conn.execute(text(f"""
            UPDATE {TABLE} tf SET etablissement_id = sous.etab
            FROM (
                SELECT f.type_frais_id, min(cl.etablissement_id) AS etab
                FROM ss_factures f
                JOIN ss_inscriptions i ON i.inscription_id = f.inscription_id
                JOIN ss_classes cl ON cl.classe_id = i.classe_id
                WHERE f.type_frais_id IS NOT NULL
                GROUP BY f.type_frais_id
            ) sous
            WHERE tf.type_frais_id = sous.type_frais_id AND tf.etablissement_id IS NULL
        """)).rowcount
    if rattaches:
        print(f"[OK] {rattaches} type(s) rattache(s) d'apres leurs factures reelles")

    # ── 3. Les types jamais factures : decision explicite ─────────────────
    with engine.connect() as conn:
        orphelins = conn.execute(text(
            f"SELECT type_frais_id, code, libelle FROM {TABLE} WHERE etablissement_id IS NULL"
        )).all()
        ecoles = conn.execute(text(
            "SELECT etablissement_id, code, nom FROM ss_etablissements ORDER BY 1"
        )).all()

    if orphelins:
        if rattacher_a is None:
            print(f"\n[STOP] {len(orphelins)} type(s) de frais n'ont jamais ete factures :")
            print("   aucune ecole n'en decoule. Designez-la explicitement.")
            for r in orphelins:
                print(f"     #{r[0]:<4} {r[1]:<14} {r[2]}")
            print("\n   Ecoles disponibles :")
            for e in ecoles:
                print(f"     #{e[0]:<3} {e[1]:<14} {e[2]}")
            print("\n     python backend/migrations/"
                  "2026_08_compta_01_types_frais_etablissement.py --rattacher-a <id>")
            return 1

        with engine.connect() as conn:
            connue = conn.execute(text(
                "SELECT nom FROM ss_etablissements WHERE etablissement_id = :e"
            ), {"e": rattacher_a}).first()
        if not connue:
            print(f"\n[STOP] Aucune ecole ne porte l'identifiant {rattacher_a}.")
            return 1
        with engine.begin() as conn:
            conn.execute(text(
                f"UPDATE {TABLE} SET etablissement_id = :e WHERE etablissement_id IS NULL"
            ), {"e": rattacher_a})
        print(f"[OK] {len(orphelins)} type(s) rattache(s) a #{rattacher_a} ({connue[0]}) "
              "— sur decision explicite.")

    # ── 4. NOT NULL ───────────────────────────────────────────────────────
    with engine.connect() as conn:
        restants = conn.execute(text(
            f"SELECT count(*) FROM {TABLE} WHERE etablissement_id IS NULL"
        )).scalar()
    if restants:
        print(f"[INFO] {restants} ligne(s) sans ecole : colonne laissee nullable.")
    else:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {TABLE} ALTER COLUMN etablissement_id SET NOT NULL"))
        print("[OK] etablissement_id est NOT NULL")

    # ── 5. Unicite : globale -> par ecole ─────────────────────────────────
    # CONCURRENTLY interdit toute transaction, et le moteur partage a deja
    # servi a des `begin()` : on en ouvre un dedie, en autocommit.
    moteur = create_engine(SQLALCHEMY_DATABASE_URL, isolation_level="AUTOCOMMIT")
    with moteur.connect() as conn:
        if not _index_existe(conn, INDEX_PAR_ECOLE):
            conn.execute(text(
                f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {INDEX_PAR_ECOLE} "
                f"ON {TABLE} (etablissement_id, code)"
            ))
            print(f"[OK] {INDEX_PAR_ECOLE} : code unique PAR ECOLE")
        else:
            print(f"[=]  {INDEX_PAR_ECOLE} deja present")
        for nom in _contraintes_code_seul(conn):
            conn.execute(text(f'ALTER TABLE {TABLE} DROP CONSTRAINT "{nom}"'))
            print(f"[OK] ancienne unicite globale retiree : {nom}")
    moteur.dispose()

    print("\n[DONE] Les types de frais appartiennent a chaque ecole.")
    return 0


if __name__ == "__main__":
    cible = None
    if "--rattacher-a" in sys.argv:
        cible = int(sys.argv[sys.argv.index("--rattacher-a") + 1])
    sys.exit(migrate(cible))
