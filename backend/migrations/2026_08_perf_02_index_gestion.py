"""
Migration — index de performance sur personnel/finance/vie scolaire.

POURQUOI
--------
Suite directe de `2026_08_perf_01_index_notation.py` (qui couvrait le
domaine notation/évaluation) : un audit de fluidité à grande échelle
(objectif 1 000 000 d'élèves par école) a trouvé les mêmes filtres sans
index dans les domaines personnel, finance et vie scolaire — relevés dans
le vrai code (`app/api/personnel.py`, `finance.py`, `vie_scolaire.py`,
`eleves.py`), pas devinés.

CE QUI EST POSÉ
---------------
Même principe que la migration 01 : des index composites calqués sur les
combinaisons de filtres réellement présentes dans le code, `CREATE INDEX
CONCURRENTLY` (aucune interruption de service, aucune donnée touchée,
aucun comportement changé — uniquement la vitesse de lecture).

Ce fichier est indépendant de `2026_08_perf_01_index_notation.py` (jamais
modifié) : mêmes fonctions utilitaires dupliquées volontairement plutôt
que factorisées, pour que chaque migration reste un script autonome et
rejouable isolément, comme le veut la convention déjà établie dans ce
dossier.

Run with: python backend/migrations/2026_08_perf_02_index_gestion.py
          python backend/migrations/2026_08_perf_02_index_gestion.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

# (nom, table, colonnes, raison)
INDEX = [
    # ── personnel (list_personnel filtre etablissement_id à chaque appel) ───
    ("ix_utilisateurs_etablissement", "ss_utilisateurs", ["etablissement_id"],
     "list_personnel/stats_personnel (personnel.py) : filtré à chaque appel, "
     "aucun index aujourd'hui — seul nom_utilisateur (unique) l'est"),
    ("ix_enseignants_etab_statut", "ss_enseignants", ["etablissement_id", "statut"],
     "list_enseignants/count_enseignants (enseignants.py) : seul matricule "
     "est indexé aujourd'hui"),

    # ── finance : factures, échéances, paiements, dépenses ──────────────────
    ("ix_factures_inscription", "ss_factures", ["inscription_id"],
     "factures d'un élève (portail parent, fiche élève, solde_eleve)"),
    ("ix_factures_annee_statut", "ss_factures", ["annee_id", "statut"],
     "list_factures/stats_factures (finance.py) : filtre combiné le plus fréquent"),
    ("ix_paiements_facture", "ss_paiements", ["facture_id"],
     "paiements d'une facture (solde_eleve, détail facture)"),
    ("ix_paiements_annee_date", "ss_paiements", ["annee_id", "date_paiement"],
     "list_paiements/dashboard_financier/rapports : filtrés et triés par période"),
    ("ix_echeances_facture_statut", "ss_echeances_factures", ["facture_id", "statut"],
     "échéances non soldées d'une facture (finance.py)"),
    ("ix_echeances_statut_date_limite", "ss_echeances_factures", ["statut", "date_limite"],
     "list_retards (finance.py) : échéances en retard toutes factures confondues"),
    ("ix_depenses_etab_annee", "ss_depenses", ["etablissement_id", "annee_id"],
     "list_depenses/stats_depenses (finance.py) : ces deux colonnes filtrées ensemble"),

    # ── vie scolaire ─────────────────────────────────────────────────────────
    ("ix_presences_inscription_date", "ss_presences", ["inscription_id", "date_presence"],
     "vérif doublon dans saisie_presences_batch ; combinaison la plus filtrée de la table"),
    ("ix_incidents_etablissement", "ss_incidents", ["etablissement_id"],
     "list_incidents/stats_incidents (vie_scolaire.py) : liste des incidents de l'école"),
    ("ix_incidents_eleve", "ss_incidents", ["eleve_id"],
     "incidents d'un élève (eleves.py), filtré seul, sans etablissement_id"),
]


def _table_et_colonnes_existent(conn, table: str, colonnes: list) -> tuple:
    """Ne jamais supposer le schéma : une base peut être en retard de migration."""
    presentes = {r[0] for r in conn.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = :t"
    ), {"t": table})}
    if not presentes:
        return False, f"table {table} absente"
    manquantes = [c for c in colonnes if c not in presentes]
    if manquantes:
        return False, f"{table} : colonne(s) {', '.join(manquantes)} absente(s)"
    return True, ""


def _index_existe(conn, nom: str) -> bool:
    return conn.execute(text(
        "SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = :n"
    ), {"n": nom}).first() is not None


def _index_invalide(conn, nom: str) -> bool:
    """Un CONCURRENTLY interrompu laisse un index INVALIDE, jamais utilisé par
    le planificateur. Il faut le supprimer et le refaire, sinon il occupe de la
    place et ne sert à rien — silencieusement."""
    return conn.execute(text("""
        SELECT NOT x.indisvalid FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid WHERE i.relname = :n
    """), {"n": nom}).scalar() is True


def migrate() -> int:
    crees, deja, ignores, echecs = 0, 0, 0, 0

    # CONCURRENTLY ne tolère aucune transaction : autocommit obligatoire.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for nom, table, colonnes, raison in INDEX:
            ok, motif = _table_et_colonnes_existent(conn, table, colonnes)
            if not ok:
                print(f"[SKIP] {nom} — {motif}")
                ignores += 1
                continue

            if _index_existe(conn, nom):
                if not _index_invalide(conn, nom):
                    print(f"[=]    {nom} deja present")
                    deja += 1
                    continue
                print(f"[FIX]  {nom} etait INVALIDE (creation interrompue) — on le refait")
                conn.execute(text(f"DROP INDEX IF EXISTS {nom}"))

            cols = ", ".join(colonnes)
            try:
                conn.execute(text(
                    f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {nom} ON {table} ({cols})"
                ))
                print(f"[OK]   {nom}  ->  {table} ({cols})")
                print(f"          {raison}")
                crees += 1
            except Exception as exc:
                # Un index en echec n'annule pas les autres : ils sont
                # independants, et un index manquant degrade sans casser.
                print(f"[ERR]  {nom} : {str(exc)[:140]}")
                echecs += 1

    print(f"\n[DONE] {crees} cree(s), {deja} deja present(s), "
          f"{ignores} ignore(s), {echecs} en echec.")
    if echecs:
        print("       Relancez la migration : elle reprend la ou elle s'est arretee.")
    return 1 if echecs else 0


def verifier() -> int:
    """Etat des index, et preuve que le planificateur les utilise vraiment."""
    with engine.connect() as conn:
        manquants = [n for n, _, _, _ in INDEX if not _index_existe(conn, n)]
        invalides = [n for n, _, _, _ in INDEX
                     if _index_existe(conn, n) and _index_invalide(conn, n)]
        print(f"Index attendus : {len(INDEX)} | presents : {len(INDEX) - len(manquants)} "
              f"| manquants : {len(manquants)} | invalides : {len(invalides)}")
        for n in manquants:
            print(f"   [MANQUE]   {n}")
        for n in invalides:
            print(f"   [INVALIDE] {n}")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
