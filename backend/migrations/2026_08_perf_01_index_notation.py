"""
Migration — index de performance sur les tables de notation et d'isolation.

POURQUOI
--------
Aucune des colonnes que le moteur de notation interroge en permanence n'était
indexée. PostgreSQL relisait donc la table ENTIÈRE à chaque requête :

    EXPLAIN SELECT * FROM ss_notes WHERE evaluation_id = 1
    -> Seq Scan on ss_notes

Invisible aujourd'hui (2 900 notes, quelques millisecondes), fatal ensuite : le
coût d'un `Seq Scan` croît linéairement avec le volume. Une plateforme de
quelques centaines d'écoles produit des millions de notes, et chaque affichage
d'épreuve les relirait toutes.

Le chantier multi-écoles a aggravé le point sans le savoir : presque chaque
requête passe désormais par `ss_classes.etablissement_id` ou
`ss_eleves.etablissement_id`, devenues les colonnes les plus sollicitées de
l'application — et justement dépourvues d'index.

CE QUI EST POSÉ
---------------
Des index **composites**, calqués sur les combinaisons de filtres réellement
présentes dans le code (relevées automatiquement, pas devinées). Un index
composite `(a, b, c)` sert aussi les requêtes sur `(a)` et `(a, b)` : trois
index en un, et un seul à maintenir en écriture.

L'ordre des colonnes suit la sélectivité : la colonne qui découpe le plus (un
identifiant) d'abord, le statut ou le drapeau ensuite.

SANS INTERRUPTION DE SERVICE
----------------------------
`CREATE INDEX CONCURRENTLY` : la table reste lisible ET modifiable pendant la
construction. C'est plus lent qu'un `CREATE INDEX` classique, mais celui-ci
verrouille la table en écriture — inacceptable sur une base en production où
des enseignants saisissent des notes.

CONCURRENTLY interdit la transaction : chaque index est créé en autocommit, et
un échec n'annule pas les précédents. La migration est donc rejouable et
reprend là où elle s'était arrêtée.

AUCUNE DONNÉE TOUCHÉE, AUCUN COMPORTEMENT CHANGÉ. Uniquement la vitesse de
lecture. Réversible : supprimer un index ne perd rien.

Run with: python backend/migrations/2026_08_perf_01_index_notation.py
          python backend/migrations/2026_08_perf_01_index_notation.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

# (nom, table, colonnes, raison)
#
# Les combinaisons viennent d'un relevé des filtres du code (app/services/ et
# app/api/), pas d'une intuition. Le commentaire dit QUELLE requête chaque index
# sert, pour qu'on puisse le supprimer en connaissance de cause s'il devient
# inutile.
INDEX = [
    # ── ss_notes : la table qui grossit le plus vite ────────────────────────
    ("ix_notes_evaluation_inscription", "ss_notes", ["evaluation_id", "inscription_id"],
     "precharger_notes() fait Note.evaluation_id.in_([...]) puis indexe par "
     "(evaluation_id, inscription_id) : l'index sert la recherche ET la clé"),
    ("ix_notes_inscription", "ss_notes", ["inscription_id"],
     "portails élève/parent : toutes les notes d'un élève"),

    # ── ss_evaluations ──────────────────────────────────────────────────────
    ("ix_evaluations_classe_trimestre_statut", "ss_evaluations",
     ["classe_id", "trimestre_id", "statut"],
     "requête centrale du moteur (calcul de période, aperçu, classement) ; "
     "sert aussi (classe_id) et (classe_id, trimestre_id) seuls"),
    ("ix_evaluations_enseignant", "ss_evaluations", ["enseignant_id"],
     "portail enseignant : ses épreuves"),
    ("ix_evaluations_matiere", "ss_evaluations", ["matiere_id"],
     "moyenne par matière, détail par type"),
    ("ix_evaluations_type_eval", "ss_evaluations", ["type_eval_id"],
     "contrôle avant suppression d'un type d'évaluation"),

    # ── ss_inscriptions ─────────────────────────────────────────────────────
    ("ix_inscriptions_classe_statut", "ss_inscriptions", ["classe_id", "statut"],
     "effectif d'une classe — appelé par tout calcul de moyenne et de rang"),
    ("ix_inscriptions_eleve_statut", "ss_inscriptions", ["eleve_id", "statut"],
     "la combinaison la plus fréquente du code : la scolarité d'un élève"),
    ("ix_inscriptions_annee", "ss_inscriptions", ["annee_id"],
     "résultats annuels, clôture d'année, promotion"),

    # ── bulletins ───────────────────────────────────────────────────────────
    ("ix_bulletin_lignes_bulletin", "ss_bulletin_lignes", ["bulletin_id"],
     "lignes d'un bulletin : lues à chaque affichage et à chaque PDF"),
    ("ix_bulletin_lignes_matiere", "ss_bulletin_lignes", ["matiere_id"],
     "statistiques de classe par matière (moyenne, min, max)"),
    ("ix_bulletins_inscription_type", "ss_bulletins", ["inscription_id", "type_bulletin"],
     "sépare le bulletin annuel des bulletins de période pour un élève"),

    # ── isolation multi-écoles : les colonnes devenues les plus sollicitées ──
    ("ix_classes_etab_annee_statut", "ss_classes", ["etablissement_id", "annee_id", "statut"],
     "filtre d'isolation présent sur presque toutes les routes ; sert aussi "
     "(etablissement_id) et (etablissement_id, annee_id) seuls"),
    ("ix_eleves_etablissement", "ss_eleves", ["etablissement_id"],
     "filtre d'isolation des élèves"),
    ("ix_parametres_etab_categorie_cle", "ss_parametres",
     ["etablissement_id", "categorie", "cle"],
     "réglages de notation : barème, mentions, coefficients de type, seuil de "
     "passage, lettres — relus à chaque calcul"),

    # ── référentiels de classe ──────────────────────────────────────────────
    ("ix_classe_matieres_classe_active", "ss_classe_matieres", ["classe_id", "est_active"],
     "matières actives d'une classe : coefficients de la moyenne générale"),
    ("ix_classe_matieres_matiere", "ss_classe_matieres", ["matiere_id"],
     "barème par classe+matière"),

    # ── affectations et calendrier ──────────────────────────────────────────
    ("ix_affectations_enseignant_statut", "ss_affectations", ["enseignant_id", "statut"],
     "classes et matières d'un enseignant"),
    ("ix_affectations_classe_matiere_statut", "ss_affectations",
     ["classe_id", "matiere_id", "statut"],
     "contrôle d'affectation à la saisie de notes"),
    ("ix_affectations_annee_statut", "ss_affectations", ["annee_id", "statut"],
     "sujets d'examen attendus (suivi du Centre des Examens)"),
    ("ix_trimestres_annee_numero", "ss_trimestres", ["annee_id", "numero"],
     "périodes d'une année, dans l'ordre chronologique"),
    ("ix_annees_etab_courante", "ss_annees_scolaires", ["etablissement_id", "est_courante"],
     "année en cours d'une école — point d'entrée de presque tout"),

    # ── sujets d'examen ─────────────────────────────────────────────────────
    ("ix_sujets_examen_enseignant", "ss_sujets_examen", ["enseignant_id"],
     "isolation des sujets (via leur auteur) et suivi des dépôts"),
    ("ix_sujets_examen_trimestre", "ss_sujets_examen", ["trimestre_id"],
     "sujets d'une période"),
    ("ix_sujets_examen_demande", "ss_sujets_examen", ["demande_id"],
     "clôture d'une campagne de collecte"),
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

        print("\nPlan reel de PostgreSQL sur les requetes chaudes :")
        for libelle, requete in [
            ("notes d'une epreuve", "SELECT * FROM ss_notes WHERE evaluation_id = 1"),
            ("epreuves d'une classe/periode",
             "SELECT * FROM ss_evaluations WHERE classe_id = 1 AND trimestre_id = 1"),
            ("eleves d'une classe",
             "SELECT * FROM ss_inscriptions WHERE classe_id = 1 AND statut = 'ACTIVE'"),
            ("classes d'une ecole", "SELECT * FROM ss_classes WHERE etablissement_id = 1"),
        ]:
            plan = [r[0] for r in conn.execute(text("EXPLAIN " + requete))]
            tete = plan[0].strip()
            marque = "Seq Scan" in tete
            print(f"   {'[LENT]' if marque else '[OK]  '} {libelle:32s} {tete[:70]}")
        print("\nNote : sur une table de quelques lignes, PostgreSQL prefere sciemment")
        print("le Seq Scan — lire 19 lignes coute moins cher que passer par l'index.")
        print("Le plan bascule tout seul des que le volume le justifie.")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
