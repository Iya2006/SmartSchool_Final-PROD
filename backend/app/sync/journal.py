"""
Journal des changements : ce qui a été écrit, et pour quelle école, afin que
les postes et le cloud se transmettent exactement ce qui a changé.

POURQUOI DES DÉCLENCHEURS
-------------------------
Le journal est tenu par la base elle-même : toute écriture y passe, par l'ORM
comme en SQL brut (les suppressions en cascade de `services/suppression.py`
sont écrites en SQL). Un journal tenu par le code Python en manquerait.

DEUX JOURNAUX
-------------
- Sur un poste (SQLite) : `ss_sync_journal_local`, ce qui reste à envoyer au
  cloud. Il se tait pendant l'application des lignes reçues du cloud (drapeau
  `application_distante`), sinon elles repartiraient aussitôt vers le cloud.
- Sur le cloud (PostgreSQL ; SQLite dans les tests) : `ss_sync_journal`, ce
  que les postes viennent lire. Chaque entrée porte l'appareil d'origine (vide
  pour la version web) et l'école concernée :
    * directement, quand la ligne porte `etablissement_id` ;
    * en remontant ses clés étrangères (une note → son évaluation → sa classe),
      calculé par le déclencheur lui-même ;
    * vide pour une ligne partagée entre écoles (parent dont les enfants sont
      dans deux écoles, plan comptable commun, photo en attente) : la
      réception la résout avec les règles du périmetre (app/sync/perimetre.py).
  Une suppression est lue avant l'effacement : la ligne et ses parents sont
  encore là pour dire à quelle école elle appartenait.

QUELLES TABLES
--------------
Toutes celles du périmètre, sauf :
- les compteurs de numérotation (`ss_sequences_matricule`) : chaque poste a
  les siens (clé ``REC42@P2``), ceux du cloud ne servent qu'au cloud ;
- côté cloud, le journal d'audit et les incidents : ils remontent des postes
  vers le cloud (supervision), ils ne redescendent pas.
"""
from functools import lru_cache
from typing import Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from app.sync.perimetre import REFERENTIELS_COMMUNS, colonne_cle, table, verifier_toutes_les_tables
from app.sync.tables_poste import completer_colonnes, journal_local, metadonnees_poste

TABLES_PROPRES_A_CHAQUE_BASE = frozenset({"ss_sequences_matricule"})
TABLES_REMONTANTES = frozenset({"ss_audit_log", "ss_incidents_applicatifs"})

# École résolue à la lecture, par le périmètre : la ligne peut concerner
# plusieurs écoles, ou n'a pas de clé étrangère qui la rattache.
ECOLE_A_LA_LECTURE = REFERENTIELS_COMMUNS | {"ss_parents", "ss_photos_en_attente"}

# Lier un parent existant à un élève ne modifie pas la ligne du parent : sans
# cette entrée supplémentaire, les postes de l'école de l'élève recevraient le
# lien sans jamais recevoir le parent.
DEPENDANCES_A_JOINDRE = {"ss_eleve_parent": (("parent_id", "ss_parents"),)}


def tables_journalisees_poste() -> tuple[str, ...]:
    return tuple(n for n in verifier_toutes_les_tables() if n not in TABLES_PROPRES_A_CHAQUE_BASE)


def tables_journalisees_cloud() -> tuple[str, ...]:
    return tuple(n for n in tables_journalisees_poste() if n not in TABLES_REMONTANTES)


def _expression_ecole(nom_table: str, ligne: str, niveau: int = 0,
                      en_cours: frozenset = frozenset()) -> Optional[str]:
    """Expression SQL qui donne l'école de la ligne `ligne` (NEW, OLD, ou un
    alias), ou None si elle se résout à la lecture."""
    t = table(nom_table)
    if nom_table in ECOLE_A_LA_LECTURE:
        return None
    if "etablissement_id" in t.c:
        return f"{ligne}.etablissement_id"
    chemins = []
    for fk in sorted(t.foreign_keys, key=lambda f: (f.parent.name, f.column.table.name)):
        parent = fk.column.table.name
        if parent in REFERENTIELS_COMMUNS or parent == nom_table or parent in en_cours:
            continue
        alias = f"ecole{niveau}"
        sous = _expression_ecole(parent, alias, niveau + 1, en_cours | {nom_table})
        if sous is None:
            continue
        chemins.append(
            f"(SELECT {sous} FROM {parent} {alias} WHERE {alias}.{fk.column.name} = {ligne}.{fk.parent.name})"
        )
    if not chemins:
        return None
    # Les chemins les plus courts suffisent : tous mènent à la même école
    # quand la donnée est cohérente, et une clé étrangère vide passe au suivant.
    plus_court = min(c.count("SELECT") for c in chemins)
    chemins = [c for c in chemins if c.count("SELECT") == plus_court]
    return chemins[0] if len(chemins) == 1 else f"COALESCE({', '.join(chemins)})"


@lru_cache(maxsize=None)
def expression_ecole(nom_table: str, ligne: str) -> str:
    return _expression_ecole(nom_table, ligne) or "NULL"


def _cle(nom_table: str) -> str:
    return colonne_cle(table(nom_table)).name


# ── Poste : ce qui reste à envoyer ─────────────────────────────────────────

def _ligne_en_json(nom: str, ligne: str) -> str:
    """json_object(...) de toutes les colonnes de la ligne (SQLite)."""
    paires = ", ".join(f"'{c.name}', {ligne}.{c.name}" for c in table(nom).columns)
    return f"json_object({paires})"


def installer_journal_poste(connexion: Connection) -> None:
    metadonnees_poste.create_all(connexion, tables=[journal_local])
    completer_colonnes(connexion)
    silence = "(SELECT application_distante FROM ss_sync_drapeaux WHERE id = 1) = 0"
    maintenant = "strftime('%Y-%m-%dT%H:%M:%f', 'now')"
    for nom in tables_journalisees_poste():
        cle = _cle(nom)
        for code, evenement, ligne, avant in (
            ("i", "INSERT", "NEW", "NULL"),
            ("u", "UPDATE", "NEW", _ligne_en_json(nom, "OLD")),
            ("d", "DELETE", "OLD", _ligne_en_json(nom, "OLD")),
        ):
            declencheur = f"ss_journal_{nom}_{code}"
            connexion.execute(text(f"DROP TRIGGER IF EXISTS {declencheur}"))
            connexion.execute(text(f"""
                CREATE TRIGGER {declencheur} AFTER {evenement} ON {nom}
                WHEN {silence}
                BEGIN
                  INSERT INTO ss_sync_journal_local (nom_table, cle, operation, avant, date)
                  VALUES ('{nom}', {ligne}.{cle}, '{code.upper()}', {avant}, {maintenant});
                END
            """))


# ── Cloud : ce que les postes viennent lire ────────────────────────────────

def _insertions_cloud(nom: str, operation_sql: str, ligne: str, origine: str) -> list[str]:
    colonnes = "(nom_table, cle, operation, etablissement_id, appareil_origine)"
    ecole = expression_ecole(nom, ligne)
    requetes = []
    if ligne == "NEW":
        # La ligne liée AVANT le lien : un poste qui lit le journal dans l'ordre
        # reçoit le parent avant la ligne qui le désigne.
        for colonne, cible in DEPENDANCES_A_JOINDRE.get(nom, ()):
            requetes.append(
                f"INSERT INTO ss_sync_journal {colonnes} "
                f"SELECT '{cible}', {ligne}.{colonne}, 'U', {ecole}, {origine} WHERE {ligne}.{colonne} IS NOT NULL;"
            )
    requetes.append(
        f"INSERT INTO ss_sync_journal {colonnes} "
        f"VALUES ('{nom}', {ligne}.{_cle(nom)}, {operation_sql}, {ecole}, {origine});"
    )
    return requetes


def _sql_cloud_sqlite(nom: str) -> list[str]:
    origine = "(SELECT appareil FROM ss_sync_contexte WHERE id = 1)"
    resultat = []
    for code, moment, evenement, ligne in (
        ("i", "AFTER", "INSERT", "NEW"), ("u", "AFTER", "UPDATE", "NEW"), ("d", "BEFORE", "DELETE", "OLD"),
    ):
        declencheur = f"ss_journal_{nom}_{code}"
        corps = "\n".join(_insertions_cloud(nom, f"'{code.upper()}'", ligne, origine))
        resultat.append(f"DROP TRIGGER IF EXISTS {declencheur}")
        resultat.append(f"CREATE TRIGGER {declencheur} {moment} {evenement} ON {nom}\nBEGIN\n{corps}\nEND")
    return resultat


def _sql_cloud_postgresql(nom: str) -> list[str]:
    origine = "NULLIF(current_setting('smartschool.appareil', true), '')::bigint"
    ecriture = "\n    ".join(_insertions_cloud(
        nom, "CASE TG_OP WHEN 'INSERT' THEN 'I' ELSE 'U' END", "NEW", origine))
    suppression = "\n    ".join(_insertions_cloud(nom, "'D'", "OLD", origine))
    fonction = f"ss_journal_fn_{nom}"
    return [
        f"""CREATE OR REPLACE FUNCTION {fonction}() RETURNS trigger LANGUAGE plpgsql AS $corps$
BEGIN
  IF TG_OP = 'DELETE' THEN
    {suppression}
    RETURN OLD;
  END IF;
  {ecriture}
  RETURN NEW;
END
$corps$""",
        f"DROP TRIGGER IF EXISTS ss_journal_ecriture ON {nom}",
        f"DROP TRIGGER IF EXISTS ss_journal_suppression ON {nom}",
        f"CREATE TRIGGER ss_journal_ecriture AFTER INSERT OR UPDATE ON {nom} "
        f"FOR EACH ROW EXECUTE FUNCTION {fonction}()",
        f"CREATE TRIGGER ss_journal_suppression BEFORE DELETE ON {nom} "
        f"FOR EACH ROW EXECUTE FUNCTION {fonction}()",
    ]


def verifier_expressions(connexion: Connection) -> None:
    """Fait préparer par la base tout ce qui varie d'une table à l'autre dans
    le corps des déclencheurs : la clé, les colonnes liées, le calcul de
    l'école (LIMIT 0, rien n'est lu). PostgreSQL ne vérifie le corps d'une
    fonction qu'à sa première exécution : une colonne mal nommée ferait
    échouer l'écriture d'un utilisateur. On veut l'erreur ici, à
    l'installation."""
    for nom in tables_journalisees_cloud():
        colonnes = [f"ligne.{_cle(nom)}", expression_ecole(nom, "ligne")]
        colonnes += [f"ligne.{colonne}" for colonne, _ in DEPENDANCES_A_JOINDRE.get(nom, ())]
        connexion.execute(text(f"SELECT {', '.join(colonnes)} FROM {nom} ligne LIMIT 0"))


def installer_journal_cloud(moteur: Engine) -> None:
    """Pose (ou remet à jour) les déclencheurs du journal du cloud. Tout ou
    rien : une erreur n'en laisse aucun à moitié posé.

    Le journal est créé ici s'il manque : un déclencheur qui écrirait dans
    une table absente ferait échouer TOUTES les écritures des utilisateurs
    (constaté sur une base de test où seul le déclencheur existait)."""
    from app.models.academique import SyncJournal

    with moteur.begin() as cx:
        SyncJournal.__table__.create(cx, checkfirst=True)
        verifier_expressions(cx)
        if cx.dialect.name == "postgresql":
            requetes = [r for nom in tables_journalisees_cloud() for r in _sql_cloud_postgresql(nom)]
        else:
            cx.execute(text("CREATE TABLE IF NOT EXISTS ss_sync_contexte (id INTEGER PRIMARY KEY, appareil INTEGER)"))
            cx.execute(text("INSERT OR IGNORE INTO ss_sync_contexte (id, appareil) VALUES (1, NULL)"))
            requetes = [r for nom in tables_journalisees_cloud() for r in _sql_cloud_sqlite(nom)]
        for requete in requetes:
            cx.execute(text(requete))


def ecrire_au_nom_de(connexion: Connection, numero_appareil: Optional[int]) -> None:
    """Les écritures de la transaction en cours seront attribuées au poste
    `numero_appareil` dans le journal du cloud (None : la version web). Sur
    PostgreSQL le réglage s'efface de lui-même à la fin de la transaction ;
    sous SQLite (tests), remettre None avant de valider."""
    if connexion.dialect.name == "postgresql":
        connexion.execute(text("SELECT set_config('smartschool.appareil', :n, true)"),
                          {"n": "" if numero_appareil is None else str(int(numero_appareil))})
    else:
        connexion.execute(text("UPDATE ss_sync_contexte SET appareil = :n WHERE id = 1"),
                          {"n": numero_appareil})
