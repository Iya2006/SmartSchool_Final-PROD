"""
Migration — index de la deuxième vague : tenir à un million d'élèves.

CE QUE LA PREMIÈRE VAGUE A COUVERT, ET CE QU'ELLE A LAISSÉ
----------------------------------------------------------
`2026_08_perf_01_index_notation.py` a indexé le moteur de notation et les
colonnes d'isolation multi-écoles. Il restait tout le reste : la facturation,
les encaissements, les présences, la paie, la comptabilité et les liens
élève↔parent. Ces tables ne portaient QUE leur clé primaire — donc un
`Seq Scan` sur chaque lecture.

L'ORDRE DE GRANDEUR VISÉ
------------------------
Un million d'élèves, ce n'est pas « la même chose en plus gros » : ça change la
table qui fait mal.

    ss_presences        1 000 000 × 180 jours × 2 demi-journées  ≈ 360 M/an
    ss_pointage_eleves  1 000 000 × 180 jours                    ≈ 180 M/an
    ss_notes            1 000 000 × 10 matières × 6 épreuves      ≈  60 M/an
    ss_bulletin_lignes  1 000 000 × 10 matières × 3 périodes      ≈  30 M/an
    ss_paiements                                                  ≈  10 M/an
    ss_factures         1 000 000 × 3 frais                       ≈   3 M/an

Sur `ss_presences`, un `Seq Scan` lit 360 millions de lignes pour afficher
l'assiduité d'UN élève. Avec l'index, PostgreSQL en lit quelques centaines.
Ce n'est pas un gain de confort : c'est la différence entre une page qui
s'affiche et une page qui expire.

CE QUI GUIDE LE CHOIX DES COLONNES
----------------------------------
Chaque index vient d'un filtre réellement présent dans le code, pas d'une
intuition ; le commentaire dit quelle requête il sert, pour qu'on puisse le
supprimer en connaissance de cause s'il devient inutile.

Les index sont **composites** et ordonnés par sélectivité : la colonne qui
découpe le plus d'abord. Un index `(a, b)` sert aussi les requêtes sur `(a)`
seul — deux index en un, et un seul à maintenir en écriture. C'est pourquoi on
n'ajoute pas d'index à une colonne déjà en tête d'un composite existant.

UN INDEX UNIQUE, ET UN SEUL
---------------------------
`ss_tarifs_classe (classe_id, type_frais_id)` est posé en UNIQUE : deux tarifs
différents pour le même frais dans la même classe n'est pas un cas métier,
c'est une saisie en double. La table est vide aujourd'hui, donc la contrainte
ne peut rien casser ; posée plus tard, elle échouerait sur les doublons déjà
en place.

SANS INTERRUPTION DE SERVICE
----------------------------
`CREATE INDEX CONCURRENTLY` : la table reste lisible ET modifiable pendant la
construction. CONCURRENTLY interdit la transaction — chaque index est créé en
autocommit, et un échec n'annule pas les précédents. La migration est donc
rejouable et reprend là où elle s'est arrêtée.

AUCUNE DONNÉE TOUCHÉE, AUCUN COMPORTEMENT CHANGÉ — sauf l'unique ci-dessus,
qui refuse un doublon qui n'aurait jamais dû exister. Réversible : supprimer un
index ne perd rien.

Run with: python backend/migrations/2026_08_perf_02_index_montee_en_charge.py
          python backend/migrations/2026_08_perf_02_index_montee_en_charge.py --verifier
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text

from app.core.database import engine

# (nom, table, colonnes, unique, raison)
INDEX = [
    # ── ss_presences : LA table du million d'élèves ─────────────────────────
    ("ix_presences_inscription_date", "ss_presences", ["inscription_id", "date_presence"],
     False,
     "assiduité d'un élève, bulletin, alerte d'absentéisme — la requête la "
     "plus coûteuse de l'application une fois le volume atteint"),
    ("ix_presences_date", "ss_presences", ["date_presence"], False,
     "appel du jour et statistiques de présence sur une période"),

    ("ix_pointage_eleves_etab_date", "ss_pointage_eleves",
     ["etablissement_id", "date_pointage"], False,
     "pointage QR du jour pour une école"),
    ("ix_pointage_eleves_eleve_date", "ss_pointage_eleves",
     ["eleve_id", "date_pointage"], False,
     "historique de pointage d'un élève"),

    # ── élèves : la liste et la recherche ───────────────────────────────────
    ("ix_eleves_etab_nom_prenom", "ss_eleves", ["etablissement_id", "nom", "prenom"],
     False,
     "liste des élèves triée par nom, et recherche par début de nom ; "
     "remplace un tri en mémoire sur toute l'école"),
    ("ix_eleves_etab_statut", "ss_eleves", ["etablissement_id", "statut"], False,
     "effectifs actifs / radiés d'une école"),

    ("ix_inscriptions_annee_statut", "ss_inscriptions", ["annee_id", "statut"], False,
     "effectif d'une année entière : clôture, promotion, statistiques"),

    # ── liens élève ↔ parent : la table n'avait QUE sa clé primaire ─────────
    ("ix_eleve_parent_eleve", "ss_eleve_parent", ["eleve_id"], False,
     "parents d'un élève — lu à chaque ouverture de fiche élève"),
    ("ix_eleve_parent_parent", "ss_eleve_parent", ["parent_id"], False,
     "enfants d'un parent — point d'entrée du portail parent"),

    # ── facturation ─────────────────────────────────────────────────────────
    ("ix_factures_inscription", "ss_factures", ["inscription_id"], False,
     "factures d'un élève : la jointure de tout l'écran de recouvrement"),
    ("ix_factures_annee_statut", "ss_factures", ["annee_id", "statut"], False,
     "impayés de l'année — tableau de bord du comptable"),
    ("ix_factures_type_frais", "ss_factures", ["type_frais_id"], False,
     "recettes par type de frais, et contrôle avant suppression d'un type"),
    ("ix_echeances_facture", "ss_echeances_factures", ["facture_id"], False,
     "échéancier d'une facture"),

    ("ix_paiements_facture", "ss_paiements", ["facture_id"], False,
     "encaissements d'une facture — recalcule le montant restant"),
    ("ix_paiements_date_statut", "ss_paiements", ["date_paiement", "statut"], False,
     "recette du jour, du mois, de l'exercice"),
    ("ix_paiements_echeance", "ss_paiements", ["echeance_id"], False,
     "rapprochement d'un versement avec son échéance"),

    ("ix_tarifs_classe_unique", "ss_tarifs_classe", ["classe_id", "type_frais_id"],
     True,
     "tarif d'un frais dans une classe. UNIQUE : deux montants pour le même "
     "frais dans la même classe est une saisie en double, pas un cas métier"),

    # ── dépenses et comptabilité ────────────────────────────────────────────
    ("ix_depenses_etab_annee_date", "ss_depenses",
     ["etablissement_id", "annee_id", "date_depense"], False,
     "dépenses d'une école sur une année, du plus récent au plus ancien"),
    ("ix_depenses_etab_categorie_statut", "ss_depenses",
     ["etablissement_id", "categorie", "statut"], False,
     "dépenses de fonctionnement hors salaires, et validation en attente"),
    ("ix_depenses_fournisseur", "ss_depenses", ["fournisseur"], False,
     "historique de paie d'un employé : la colonne porte 'ENS_x'/'PERS_x'"),

    ("ix_ecritures_etab_date", "ss_ecritures_comptables",
     ["etablissement_id", "date_ecriture"], False,
     "journal comptable d'une école sur une période"),
    ("ix_ecritures_exercice", "ss_ecritures_comptables", ["exercice_id"], False,
     "clôture d'exercice, balance générale"),
    ("ix_lignes_ecritures_ecriture", "ss_lignes_ecritures", ["ecriture_id"], False,
     "lignes d'une écriture — lues à chaque affichage du journal"),
    ("ix_lignes_ecritures_compte", "ss_lignes_ecritures", ["compte_id"], False,
     "grand livre d'un compte, balance"),

    # ── paie ────────────────────────────────────────────────────────────────
    ("ix_employes_source_ref", "ss_employes", ["source_ref"], False,
     "miroir de paie retrouvé à chaque calcul de salaire ('ENS_x'/'PERS_x')"),
    ("ix_bulletins_paie_employe_mois", "ss_bulletins_paie",
     ["employe_id", "mois_concerne"], False,
     "bulletin d'un employé pour un mois — lu avant chaque paiement pour ne "
     "pas payer deux fois"),
    ("ix_avances_employe_mois_statut", "ss_avances",
     ["employe_id", "mois_concerne", "statut"], False,
     "avances à déduire du salaire du mois"),
    ("ix_primes_employe_mois", "ss_primes", ["employe_id", "mois_concerne"], False,
     "primes ponctuelles du mois"),
    ("ix_absences_personnel_employe_date", "ss_absences_personnel",
     ["employe_id", "date_absence"], False,
     "retenue pour absence non justifiée"),
    ("ix_presences_agents_agent_date", "ss_presences_agents",
     ["type_agent", "agent_id", "date_presence"], False,
     "pointage du personnel, source de la retenue automatique"),

    # ── emploi du temps et messagerie ───────────────────────────────────────
    ("ix_creneaux_annee_classe", "ss_creneaux_emploi", ["annee_id", "classe_id"], False,
     "emploi du temps d'une classe"),
    ("ix_creneaux_annee_enseignant", "ss_creneaux_emploi",
     ["annee_id", "enseignant_id"], False,
     "emploi du temps personnel d'un enseignant, détection de conflit"),

    ("ix_messages_destinataire", "ss_messages",
     ["destinataire_type", "destinataire_id", "statut"], False,
     "boîte de réception : messages non lus d'un utilisateur"),
    ("ix_messages_date_envoi", "ss_messages", ["date_envoi"], False,
     "fil de discussion et purge des anciens messages"),
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


def _doublons(conn, table: str, colonnes: list) -> int:
    """Un index UNIQUE échoue sur une base qui contient déjà des doublons.
    On le dit avant, avec le compte : sinon le message de PostgreSQL ne nomme
    qu'une seule ligne fautive et on cherche les autres à l'aveugle."""
    cols = ", ".join(colonnes)
    return conn.execute(text(
        f"SELECT count(*) FROM (SELECT {cols} FROM {table} "
        f"GROUP BY {cols} HAVING count(*) > 1) d"
    )).scalar() or 0


def migrate() -> int:
    crees, deja, ignores, echecs = 0, 0, 0, 0

    # CONCURRENTLY ne tolère aucune transaction : autocommit obligatoire.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for nom, table, colonnes, unique, raison in INDEX:
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

            if unique:
                n = _doublons(conn, table, colonnes)
                if n:
                    print(f"[SKIP] {nom} — {n} doublon(s) sur ({', '.join(colonnes)}) "
                          f"dans {table}. Corrigez-les, puis relancez.")
                    ignores += 1
                    continue

            cols = ", ".join(colonnes)
            mot = "UNIQUE INDEX" if unique else "INDEX"
            try:
                conn.execute(text(
                    f"CREATE {mot} CONCURRENTLY IF NOT EXISTS {nom} ON {table} ({cols})"
                ))
                print(f"[OK]   {nom}  ->  {table} ({cols}){' UNIQUE' if unique else ''}")
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
        manquants = [n for n, _, _, _, _ in INDEX if not _index_existe(conn, n)]
        invalides = [n for n, _, _, _, _ in INDEX
                     if _index_existe(conn, n) and _index_invalide(conn, n)]
        print(f"Index attendus : {len(INDEX)} | presents : {len(INDEX) - len(manquants)} "
              f"| manquants : {len(manquants)} | invalides : {len(invalides)}")
        for n in manquants:
            print(f"   [MANQUE]   {n}")
        for n in invalides:
            print(f"   [INVALIDE] {n}")

        print("\nPlan reel de PostgreSQL sur les requetes chaudes :")
        for libelle, requete in [
            ("assiduite d'un eleve",
             "SELECT * FROM ss_presences WHERE inscription_id = 1"),
            ("factures d'un eleve",
             "SELECT * FROM ss_factures WHERE inscription_id = 1"),
            ("encaissements d'une facture",
             "SELECT * FROM ss_paiements WHERE facture_id = 1"),
            ("parents d'un eleve",
             "SELECT * FROM ss_eleve_parent WHERE eleve_id = 1"),
            ("historique de paie d'un employe",
             "SELECT * FROM ss_depenses WHERE fournisseur = 'ENS_1'"),
        ]:
            plan = [r[0] for r in conn.execute(text("EXPLAIN " + requete))]
            tete = plan[0].strip()
            print(f"   {'[LENT]' if 'Seq Scan' in tete else '[OK]  '} "
                  f"{libelle:34s} {tete[:66]}")
        print("\nNote : sur une table de quelques lignes, PostgreSQL prefere sciemment")
        print("le Seq Scan — lire 45 lignes coute moins cher que passer par l'index.")
        print("Le plan bascule tout seul des que le volume le justifie ; ce qui compte")
        print("ici est que l'index EXISTE le jour ou le volume arrive.")
    return 0


if __name__ == "__main__":
    sys.exit(verifier() if "--verifier" in sys.argv else migrate())
