"""
Migration — rend les TYPES D'ÉVALUATION propres à chaque école.

POURQUOI
--------
`ss_types_evaluation` (Composition, Évaluation, Interrogation…) était une table
partagée par toute la plateforme : une seule liste pour toutes les écoles.

Le POIDS de ces types était déjà réglable par école (paramètre
`notation.coef_type.{cycle}.{code}`), mais pas leur NOM ni leur EXISTENCE. Une
école qui renommait « Composition » en « Devoir de synthèse » changeait donc
l'intitulé des colonnes de bulletin de toutes les autres, sans que personne
chez elles n'ait rien touché. Une école pouvait aussi supprimer un type
inutilisé chez elle, et le faire disparaître chez les voisines.

Ce n'était pas une fuite de données : c'était une école qui décidait pour les
autres. Cette migration ferme ce point.

CE QU'ELLE FAIT
---------------
1. Ajoute `etablissement_id` (nullable dans un premier temps).
2. Remplace l'unicité GLOBALE de `code` par une unicité PAR ÉCOLE — sans quoi
   deux écoles ne pourraient pas avoir chacune leur « COMPO ».
3. Passe la colonne en NOT NULL une fois qu'aucune ligne n'est orpheline.

AUCUN RATTACHEMENT AUTOMATIQUE
------------------------------
Conformément à la règle du chantier multi-écoles
(`docs/MULTI_ECOLES_REGLES_DEV.md` §10), cette migration ne fait JAMAIS de
`UPDATE ... SET etablissement_id = 1`. Si des types existent déjà, elle
s'arrête et affiche à qui ils devraient revenir : c'est une décision humaine.

Pour rattacher explicitement les types existants à une école :

    python backend/migrations/2026_08_notation_09_type_evaluation_etablissement.py --rattacher-a 1

Idempotente : rejouable sans dégât.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

TABLE = "ss_types_evaluation"
INDEX_UNIQUE = "uq_types_evaluation_etablissement_code"


def _colonne_existe(conn, table: str, colonne: str) -> bool:
    return conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": colonne}).first() is not None


def _contraintes_unicite_sur_code(conn) -> list:
    """Contraintes/index d'unicité portant sur `code` SEUL (l'ancienne règle)."""
    lignes = conn.execute(text("""
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = :t AND c.contype = 'u'
          AND (SELECT count(*) FROM unnest(c.conkey)) = 1
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = t.oid AND a.attnum = c.conkey[1] AND a.attname = 'code'
          )
    """), {"t": TABLE}).all()
    return [r[0] for r in lignes]


def _index_unique_sur_code(conn) -> list:
    lignes = conn.execute(text("""
        SELECT i.relname
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        WHERE t.relname = :t AND x.indisunique AND NOT x.indisprimary
          AND x.indnatts = 1
          AND EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = t.oid AND a.attnum = x.indkey[0] AND a.attname = 'code'
          )
    """), {"t": TABLE}).all()
    return [r[0] for r in lignes]


def migrate(rattacher_a: int = None) -> int:
    with engine.connect() as conn:
        total = conn.execute(text(f"SELECT count(*) FROM {TABLE}")).scalar()
        deja = _colonne_existe(conn, TABLE, "etablissement_id")
        orphelins = 0
        if deja:
            orphelins = conn.execute(text(
                f"SELECT count(*) FROM {TABLE} WHERE etablissement_id IS NULL"
            )).scalar()
        ecoles = conn.execute(text(
            "SELECT etablissement_id, code, nom FROM ss_etablissements ORDER BY etablissement_id"
        )).all()

    print(f"Etat reel avant migration : {TABLE} = {total} ligne(s), "
          f"colonne etablissement_id {'presente' if deja else 'absente'}")

    # ── 1. Colonne + unicite par ecole ────────────────────────────────────
    with engine.begin() as conn:
        conn.execute(text(
            f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
            "REFERENCES ss_etablissements(etablissement_id)"
        ))
        for nom in _contraintes_unicite_sur_code(conn):
            conn.execute(text(f'ALTER TABLE {TABLE} DROP CONSTRAINT "{nom}"'))
            print(f"[OK] ancienne unicite globale retiree : contrainte {nom}")
        for nom in _index_unique_sur_code(conn):
            conn.execute(text(f'DROP INDEX IF EXISTS "{nom}"'))
            print(f"[OK] ancienne unicite globale retiree : index {nom}")
        conn.execute(text(
            f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_UNIQUE} "
            f"ON {TABLE} (etablissement_id, code)"
        ))
    print(f"[OK] unicite du code desormais PAR ECOLE ({INDEX_UNIQUE})")

    # ── 2. Rattachement des lignes existantes : jamais automatique ────────
    with engine.connect() as conn:
        orphelins = conn.execute(text(
            f"SELECT count(*) FROM {TABLE} WHERE etablissement_id IS NULL"
        )).scalar()

    if orphelins:
        if rattacher_a is None:
            print(f"\n[STOP] STOP — {orphelins} type(s) d'evaluation n'appartiennent a aucune ecole.")
            print("   Cette migration ne rattache RIEN automatiquement")
            print("   (pas de UPDATE ... SET etablissement_id = 1) : c'est une decision humaine.")
            print("\n   Types concernes :")
            with engine.connect() as conn:
                for r in conn.execute(text(
                    f"SELECT type_eval_id, code, libelle, statut FROM {TABLE} "
                    "WHERE etablissement_id IS NULL ORDER BY type_eval_id"
                )):
                    print(f"     #{r[0]:<3} {r[1]:<15} {r[2]:<24} {r[3]}")
            print("\n   Ecoles disponibles :")
            for e in ecoles:
                print(f"     #{e[0]:<3} {e[1]:<14} {e[2]}")
            print("\n   Relancez en designant explicitement l'ecole proprietaire :")
            print("     python backend/migrations/"
                  "2026_08_notation_09_type_evaluation_etablissement.py --rattacher-a <etablissement_id>")
            return 1

        with engine.connect() as conn:
            connue = conn.execute(text(
                "SELECT nom FROM ss_etablissements WHERE etablissement_id = :e"
            ), {"e": rattacher_a}).first()
        if not connue:
            print(f"\n[STOP] Aucune ecole ne porte l'identifiant {rattacher_a}. Rien n'a ete modifie.")
            return 1

        with engine.begin() as conn:
            conn.execute(text(
                f"UPDATE {TABLE} SET etablissement_id = :e WHERE etablissement_id IS NULL"
            ), {"e": rattacher_a})
        print(f"[OK] {orphelins} type(s) rattache(s) a l'ecole #{rattacher_a} ({connue[0]}) "
              "— sur decision explicite.")
        print("     Les evaluations existantes pointent sur les MEMES lignes : aucune note ne bouge.")

    # ── 3. NOT NULL une fois la table saine ───────────────────────────────
    with engine.connect() as conn:
        restants = conn.execute(text(
            f"SELECT count(*) FROM {TABLE} WHERE etablissement_id IS NULL"
        )).scalar()
    if restants:
        print(f"[INFO] {restants} ligne(s) encore sans ecole : colonne laissee nullable.")
        return 1

    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {TABLE} ALTER COLUMN etablissement_id SET NOT NULL"))
    print("[OK] etablissement_id est desormais NOT NULL.")
    print("\n[DONE] Types d'evaluation propres a chaque ecole.")
    return 0


if __name__ == "__main__":
    cible = None
    if "--rattacher-a" in sys.argv:
        cible = int(sys.argv[sys.argv.index("--rattacher-a") + 1])
    sys.exit(migrate(cible))
