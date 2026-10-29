"""
Identifiants des lignes créées sur un poste hors-ligne.

LE PROBLÈME
-----------
Les identifiants de SmartSchool sont des compteurs, globaux à toutes les
écoles. Deux postes hors-ligne qui inscrivent chacun un élève lui donneraient
le même numéro : à la synchronisation, l'un écraserait l'autre.

LA RÈGLE
--------
Chaque poste a un numéro N, attribué par le cloud à son enregistrement
(`ss_appareils`). Il crée ses lignes dans SA plage, de N × 2³² + 1 à
(N + 1) × 2³² − 1 : quatre milliards d'identifiants par table, sans jamais
demander quoi que ce soit au cloud. Le cloud est l'appareil 0 (ses séquences
s'arrêtent à 2³¹). Un identifiant n'est jamais renuméroté après coup : le QR
d'un reçu imprimé couvre `paiement_id`.

COMMENT
-------
Chaque clé primaire reçoit une valeur par défaut calculée en Python. Elle
couvre l'ORM, `insert()` et `bulk_insert_mappings`, et laisse intacte une ligne
qui arrive avec son identifiant (installation, synchronisation).

Elle doit être branchée au démarrage du moteur, AVANT toute écriture : l'ORM
met en cache ses requêtes d'insertion et ignorerait une valeur par défaut
ajoutée ensuite (vérifié). Le numéro du poste n'est connu qu'à son
enregistrement : jusque-là, le générateur refuse toute création.

Un générateur par base (moteur SQLAlchemy), et non un seul pour le processus :
les tests simulent un cloud et plusieurs postes dans le même processus. Une
fois les valeurs par défaut branchées, toute base qui écrit doit donc avoir
son générateur. Rendre la main à l'auto-incrément de SQLite n'est pas
possible : l'ORM perd alors l'identifiant des lignes insérées par lot
(« NULL identity key », vérifié). En production, seul le moteur poste branche
le générateur ; le cloud garde ses séquences PostgreSQL.

GARDE-FOU
---------
Une écriture en SQL brut contournerait le générateur, et SQLite prendrait le
plus grand identifiant présent + 1, peut-être dans la plage d'un autre poste.
Un déclencheur refuse donc tout nouvel identifiant hors plage : un oubli échoue
bruyamment au lieu de corrompre en silence. Les lignes reçues du cloud passent,
parce que la synchronisation lève le drapeau `application_distante` le temps
de sa transaction.
"""
import threading
import weakref
from typing import Optional

from sqlalchemy import BigInteger, Column, ColumnDefault, Integer, MetaData, Table, func, select, text
from sqlalchemy.engine import Connection, Engine

from app.core.database import Base

TAILLE_PLAGE = 2 ** 32

# Au-delà de 2²⁰ postes, un identifiant dépasserait 2⁵³ et ne serait plus
# exact en JavaScript.
NUMERO_APPAREIL_MAX = 2 ** 20


def plage(numero_appareil: int) -> tuple[int, int]:
    """[début, fin) des identifiants de l'appareil `numero_appareil`
    (0 = le cloud, 1 et plus = les postes)."""
    if not 0 <= numero_appareil <= NUMERO_APPAREIL_MAX:
        raise ValueError(f"Numéro d'appareil invalide : {numero_appareil}")
    return numero_appareil * TAILLE_PLAGE, (numero_appareil + 1) * TAILLE_PLAGE


def appareil_de(identifiant: int) -> int:
    """Numéro de l'appareil qui a créé la ligne (0 = le cloud)."""
    return int(identifiant) // TAILLE_PLAGE


# Tables propres au poste, hors du schéma de l'application : jamais exportées,
# jamais synchronisées.
metadonnees_poste = MetaData()

drapeaux = Table(
    "ss_sync_drapeaux", metadonnees_poste,
    Column("id", Integer, primary_key=True),
    # 1 le temps d'une transaction qui applique des lignes venues du cloud,
    # 0 sinon. Jamais validé à 1 : la transaction le remet à 0 avant de valider.
    Column("application_distante", Integer, nullable=False, server_default="0"),
)


class PosteNonInstalle(RuntimeError):
    """Création d'une ligne avant que le poste ait reçu son numéro."""


class BaseSansGenerateur(RuntimeError):
    """Écriture dans une base qui n'a pas de générateur d'identifiants."""


def tables_a_identifiant() -> list[Table]:
    """Tables de l'application dont la clé primaire est un identifiant unique."""
    from app.sync.perimetre import TABLES_HORS_SYNCHRO
    import app.models.academique  # noqa: F401 — enregistre toutes les tables

    resultat = []
    for t in Base.metadata.sorted_tables:
        cles = list(t.primary_key.columns)
        if t.name in TABLES_HORS_SYNCHRO or len(cles) != 1:
            continue
        if isinstance(cles[0].type, BigInteger):
            resultat.append(t)
    return resultat


class Generateur:
    """Un compteur par table, dans la plage du poste. Les trous (transaction
    annulée) sont sans conséquence ; un doublon est impossible.

    Porte aussi l'identité du poste dont la base dépend : son rang dans l'école
    (segment « P2 » de ses numéros de pièces) et la clé qui signe ses reçus."""

    def __init__(self) -> None:
        self._verrou = threading.Lock()
        self._prochains: dict[str, int] = {}
        self.numero: Optional[int] = None
        self.rang: Optional[int] = None
        self.cle_signature: Optional[str] = None
        self._fin = 0

    def configurer(self, connexion: Connection, numero_appareil: int) -> None:
        """Reprend chaque compteur après le plus grand identifiant déjà créé
        par cet appareil (rien au premier démarrage d'un poste)."""
        debut, fin = plage(numero_appareil)
        prochains = {}
        for t in tables_a_identifiant():
            cle = list(t.primary_key.columns)[0]
            plus_grand = connexion.execute(
                select(func.max(cle)).where(cle > debut, cle < fin)
            ).scalar()
            prochains[t.name] = (plus_grand or debut) + 1
        with self._verrou:
            self._prochains, self.numero, self._fin = prochains, numero_appareil, fin

    def suivant(self, nom_table: str) -> int:
        with self._verrou:
            if self.numero is None:
                raise PosteNonInstalle(
                    "Ce poste n'est pas encore installé : aucune donnée ne peut y être créée."
                )
            valeur = self._prochains[nom_table]
            if valeur >= self._fin:
                raise RuntimeError(f"Plage d'identifiants épuisée pour {nom_table}")
            self._prochains[nom_table] = valeur + 1
            return valeur


_generateurs: "weakref.WeakKeyDictionary[Engine, Generateur]" = weakref.WeakKeyDictionary()
_registre = threading.Lock()
_branchees: set[str] = set()


def generateur_de(moteur: Engine) -> Generateur:
    """Le générateur de cette base, créé (sans numéro) au premier appel."""
    with _registre:
        if moteur not in _generateurs:
            _generateurs[moteur] = Generateur()
        return _generateurs[moteur]


def poste_de(moteur) -> Optional[Generateur]:
    """L'identité du poste si `moteur` est la base d'un poste installé, sinon
    None (le cloud, ou un poste pas encore installé). Accepte un moteur ou une
    connexion (Session.get_bind() rend l'un ou l'autre)."""
    moteur = getattr(moteur, "engine", moteur)
    generateur = _generateurs.get(moteur) if moteur is not None else None
    if generateur is None or not generateur.numero:
        return None
    return generateur


def segment_du_poste(db) -> str:
    """« P2- » à insérer dans un numéro de pièce émis par le poste de rang 2,
    « » sur le cloud. Deux postes hors-ligne ont chacun leur compteur : sans
    ce segment, ils émettraient le même numéro de reçu, comme deux caisses
    d'une pharmacie qui ne seraient pas numérotées."""
    poste = poste_de(db.get_bind())
    return f"P{poste.rang}-" if poste else ""


def _suivant(contexte, nom_table: str) -> int:
    generateur = _generateurs.get(contexte.connection.engine)
    if generateur is None:
        raise BaseSansGenerateur(
            "Cette base n'a pas de générateur d'identifiants : appeler generateur_de(moteur) au démarrage."
        )
    return generateur.suivant(nom_table)


def brancher_generateur() -> None:
    """À appeler au démarrage du moteur poste, avant toute écriture.

    Définitif pour le processus : retirer ces valeurs par défaut après coup
    laisserait des insertions déjà compilées qui les attendent."""
    for t in tables_a_identifiant():
        cle = list(t.primary_key.columns)[0]
        if t.name in _branchees:
            continue
        _branchees.add(t.name)
        # `_set_parent` est la façon dont SQLAlchemy rattache lui-même une
        # valeur par défaut à sa colonne (Column.__init__).
        ColumnDefault(lambda contexte, nom=t.name: _suivant(contexte, nom))._set_parent(cle)


def _nom_garde(nom_table: str) -> str:
    return f"ss_garde_plage_{nom_table}"


def poser_les_gardes(connexion: Connection, numero_appareil: int) -> None:
    """Déclencheurs qui refusent tout nouvel identifiant hors de la plage du
    poste, sauf pendant l'application de lignes venues du cloud."""
    debut, fin = plage(numero_appareil)
    for t in tables_a_identifiant():
        cle = list(t.primary_key.columns)[0].name
        connexion.execute(text(f"DROP TRIGGER IF EXISTS {_nom_garde(t.name)}"))
        connexion.execute(text(f"""
            CREATE TRIGGER {_nom_garde(t.name)} BEFORE INSERT ON {t.name}
            WHEN (NEW.{cle} IS NULL OR NEW.{cle} <= {debut} OR NEW.{cle} >= {fin})
              AND (SELECT application_distante FROM ss_sync_drapeaux WHERE id = 1) = 0
            BEGIN
              SELECT RAISE(ABORT, 'SmartSchool : identifiant hors de la plage de ce poste ({t.name})');
            END
        """))


def retirer_les_gardes(connexion: Connection) -> None:
    for t in tables_a_identifiant():
        connexion.execute(text(f"DROP TRIGGER IF EXISTS {_nom_garde(t.name)}"))


def preparer_tables_du_poste(moteur: Engine) -> None:
    metadonnees_poste.create_all(moteur)
    with moteur.begin() as cx:
        if cx.execute(select(drapeaux.c.id).where(drapeaux.c.id == 1)).first() is None:
            cx.execute(drapeaux.insert().values(id=1, application_distante=0))


def activer_le_poste(moteur: Engine, numero_appareil: int, rang: int, cle_signature: str) -> None:
    """Le poste a son numéro : il peut créer des lignes, dans sa plage, et
    émettre des pièces numérotées et signées à son nom."""
    if numero_appareil < 1:
        raise ValueError("Un poste a un numéro d'appareil supérieur ou égal à 1 (0 est le cloud).")
    preparer_tables_du_poste(moteur)
    generateur = generateur_de(moteur)
    generateur.rang, generateur.cle_signature = int(rang), cle_signature
    with moteur.begin() as cx:
        poser_les_gardes(cx, numero_appareil)
        generateur.configurer(cx, numero_appareil)


def application_distante(connexion: Connection, active: bool) -> None:
    """Lève (ou baisse) le drapeau dans la transaction en cours : les lignes
    venues du cloud gardent leurs identifiants sans déclencher les gardes."""
    connexion.execute(drapeaux.update().where(drapeaux.c.id == 1).values(application_distante=1 if active else 0))
