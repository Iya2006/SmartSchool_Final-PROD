"""
Migration — un enseignant ou un parent peut relever de PLUSIEURS écoles.

LE PROBLÈME
-----------
Les identifiants de connexion étaient uniques sur TOUTE la plateforme (Lot 12,
`lot12_unicite_identifiants_connexion.py`). Conséquence concrète :

    L'école A inscrit le parent au 622 00 00 00.
    L'école B, où son deuxième enfant est scolarisé, tente de l'inscrire.
    -> refusé : « ce numéro est déjà pris » — par une école qu'elle ne voit pas.

Même blocage pour un enseignant qui exerce dans cinq établissements. Ce
n'était pas un inconfort : c'était une impossibilité.

LA DÉCISION
-----------
Une personne = **une fiche par école**. Pas de compte unique qui rassemblerait
tout : il faudrait un endroit central où les écoles se croisent, c'est-à-dire
exactement ce que le chantier multi-écoles a supprimé.

Les identifiants deviennent donc uniques **PAR ÉCOLE** pour les enseignants et
les parents. Ils restent uniques **GLOBALEMENT** pour les comptes utilisateurs
(direction, personnel administratif) : ceux-là se connectent sans code d'école,
et deux valeurs identiques y seraient impossibles à départager.

CE QU'ELLE FAIT
---------------
1. `ss_parents.etablissement_id` — les parents n'avaient aucune colonne
   établissement, leur école était déduite de leurs enfants. Un parent
   multi-écoles renvoyait alors `None`, donc aucun accès.
2. Remplace les index uniques globaux de `ss_parents` et `ss_enseignants` par
   des index uniques `(etablissement_id, colonne)`.

`ss_utilisateurs` n'est pas touchée.

AUCUN RATTACHEMENT ARBITRAIRE
-----------------------------
Le rattachement d'un parent existant se lit dans ses enfants réels — ce n'est
pas un choix, c'est la vérité déjà présente en base. Un parent dont les enfants
sont répartis sur plusieurs écoles ne peut pas être rattaché automatiquement :
il faudrait le DÉDOUBLER, ce qui est une décision humaine. La migration
s'arrête alors et le liste.

Run with: python backend/migrations/2026_08_multi_01_parents_enseignants_multi_ecoles.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from sqlalchemy import create_engine

from app.core.database import SQLALCHEMY_DATABASE_URL, engine

# (table, colonne, ancien index global pose par le Lot 12, nouvel index par ecole)
INDEX_A_BASCULER = [
    ("ss_parents", "telephone_1", "uq_parents_telephone_1", "uq_parents_etab_telephone_1"),
    ("ss_parents", "email", "uq_parents_email", "uq_parents_etab_email"),
    ("ss_enseignants", "telephone", "uq_enseignants_telephone", "uq_enseignants_etab_telephone"),
    ("ss_enseignants", "email", "uq_enseignants_email", "uq_enseignants_etab_email"),
]


def _colonne_existe(conn, table: str, colonne: str) -> bool:
    return conn.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": colonne}).first() is not None


def _index_existe(conn, nom: str) -> bool:
    return conn.execute(text(
        "SELECT 1 FROM pg_class WHERE relkind='i' AND relname=:n"
    ), {"n": nom}).first() is not None


def migrate() -> int:
    # ── 1. La colonne, d'abord nullable ───────────────────────────────────
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE ss_parents ADD COLUMN IF NOT EXISTS etablissement_id INTEGER "
            "REFERENCES ss_etablissements(etablissement_id)"
        ))
    print("[OK] ss_parents.etablissement_id present")

    # ── 2. Rattachement lu dans les enfants réels ─────────────────────────
    with engine.connect() as conn:
        total = conn.execute(text("SELECT count(*) FROM ss_parents")).scalar()
        sans_ecole = conn.execute(text(
            "SELECT count(*) FROM ss_parents WHERE etablissement_id IS NULL"
        )).scalar()
        ambigus = conn.execute(text("""
            SELECT p.parent_id, p.nom, p.prenom, p.telephone_1, count(DISTINCT e.etablissement_id) AS nb
            FROM ss_parents p
            JOIN ss_eleve_parent ep ON ep.parent_id = p.parent_id
            JOIN ss_eleves e ON e.eleve_id = ep.eleve_id
            WHERE p.etablissement_id IS NULL
            GROUP BY p.parent_id, p.nom, p.prenom, p.telephone_1
            HAVING count(DISTINCT e.etablissement_id) > 1
        """)).all()

    print(f"Etat reel : {total} parent(s), dont {sans_ecole} sans ecole, "
          f"{len(ambigus)} reparti(s) sur plusieurs ecoles")

    if ambigus:
        print("\n[STOP] STOP — ces parents ont des enfants dans PLUSIEURS ecoles.")
        print("   Les rattacher a une seule serait un choix arbitraire ; il faut les")
        print("   DEDOUBLER (une fiche par ecole), ce qui est une decision humaine.")
        for r in ambigus:
            print(f"     #{r[0]:<5} {r[2]} {r[1]:<20} {r[3]:<15} {r[4]} ecoles")
        print("\n   Traitez ces cas, puis relancez la migration.")
        return 1

    if sans_ecole:
        with engine.begin() as conn:
            # Lecture de la verite deja en base, pas une attribution arbitraire :
            # chacun de ces parents n'a d'enfants que dans UNE ecole.
            rattaches = conn.execute(text("""
                UPDATE ss_parents p SET etablissement_id = sous.etab
                FROM (
                    SELECT ep.parent_id, min(e.etablissement_id) AS etab
                    FROM ss_eleve_parent ep JOIN ss_eleves e ON e.eleve_id = ep.eleve_id
                    GROUP BY ep.parent_id
                ) sous
                WHERE p.parent_id = sous.parent_id AND p.etablissement_id IS NULL
            """)).rowcount
        print(f"[OK] {rattaches} parent(s) rattache(s) d'apres leurs enfants reels")

    # ── 3. NOT NULL si plus aucun orphelin ────────────────────────────────
    with engine.connect() as conn:
        restants = conn.execute(text(
            "SELECT count(*) FROM ss_parents WHERE etablissement_id IS NULL"
        )).scalar()
    if restants:
        print(f"[INFO] {restants} parent(s) sans enfant rattache : colonne laissee")
        print("       nullable. Rattachez-les a une ecole, puis relancez.")
    else:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE ss_parents ALTER COLUMN etablissement_id SET NOT NULL"
            ))
        print("[OK] ss_parents.etablissement_id est NOT NULL")

    # ── 4. Unicite : globale -> par ecole ─────────────────────────────────
    # CONCURRENTLY interdit toute transaction. Le moteur partage a deja servi
    # a des `engine.begin()` plus haut et son pool rend des connexions deja
    # engagees : on en ouvre un DEDIE, en autocommit des sa creation.
    moteur_autocommit = create_engine(SQLALCHEMY_DATABASE_URL, isolation_level="AUTOCOMMIT")
    with moteur_autocommit.connect() as conn:
        for table, colonne, ancien, nouveau in INDEX_A_BASCULER:
            if not _colonne_existe(conn, table, "etablissement_id"):
                print(f"[SKIP] {table} n'a pas encore etablissement_id")
                continue
            # Le nouvel index d'abord : ne jamais laisser la table sans
            # protection, meme une seconde.
            if not _index_existe(conn, nouveau):
                conn.execute(text(
                    f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {nouveau} "
                    f"ON {table} (etablissement_id, {colonne}) WHERE {colonne} IS NOT NULL"
                ))
                print(f"[OK] {nouveau} : {colonne} unique PAR ECOLE")
            else:
                print(f"[=]  {nouveau} deja present")
            if _index_existe(conn, ancien):
                conn.execute(text(f"DROP INDEX CONCURRENTLY IF EXISTS {ancien}"))
                print(f"[OK] ancien index global {ancien} retire")

    print("\n[DONE] Enseignants et parents peuvent relever de plusieurs ecoles.")
    return 0


if __name__ == "__main__":
    sys.exit(migrate())
