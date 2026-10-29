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
(« NULL identity key », vérifié). En production, le moteur poste branche le
générateur sur toutes ses tables ; le cloud seulement sur les tables à clé
naturelle (ci-dessous), et garde ses séquences PostgreSQL pour le reste.

LIGNES À CLÉ NATURELLE
----------------------
Certaines lignes sont définies par ce qu'elles désignent : le journal « AC »,
la séance de tel créneau à telle date, la présence de tel élève à telle
séance, la note de tel élève à telle évaluation... Le code les cherche puis
les crée si elles manquent. Deux postes hors-ligne (ou un poste et la
version web) les créeraient chacun, sous deux identifiants : doublon, refusé
par la contrainte d'unicité du cloud.

Leur identifiant est donc DÉRIVÉ de leur clé naturelle (empreinte, entre 2⁵² et
2⁵³), le même partout : deux créations de la même séance se rejoignent en une
seule ligne, fusionnée champ par champ. Si l'empreinte tombe sur une ligne
d'une autre clé (collision, rarissime), le compteur ordinaire prend le relais.
Le cloud les attribue aussi, une fois sa migration des identifiants passée.
Les types d'évaluation n'en font pas partie : le code prend le plus petit
identifiant comme type par défaut, l'ordre de création compte.

GARDE-FOU
---------
Une écriture en SQL brut contournerait le générateur, et SQLite prendrait le
plus grand identifiant présent + 1, peut-être dans la plage d'un autre poste.
Un déclencheur refuse donc tout nouvel identifiant hors plage : un oubli échoue
bruyamment au lieu de corrompre en silence. Les lignes reçues du cloud passent,
parce que la synchronisation lève le drapeau `application_distante` le temps
de sa transaction.
"""
import datetime as dt
import hashlib
import threading
import weakref
from typing import Callable, Optional

from sqlalchemy import BigInteger, ColumnDefault, Table, func, select, text
from sqlalchemy.engine import Connection, Engine

from app.core.database import Base
from app.sync.tables_poste import drapeaux, metadonnees_poste

TAILLE_PLAGE = 2 ** 32

# Les postes restent sous 2⁵² ; au-delà commencent les identifiants dérivés
# d'une clé naturelle, jusqu'à 2⁵³ (au-delà, un nombre n'est plus exact en
# JavaScript).
NUMERO_APPAREIL_MAX = 2 ** 20 - 1
DEBUT_NATUREL = 2 ** 52


def _colonnes(*noms: str) -> Callable[[dict], tuple]:
    return lambda v: tuple(v.get(n) for n in noms)


def _cle_presence(v: dict) -> tuple:
    if v.get("seance_id") is not None:
        return ("seance", v.get("seance_id"), v.get("inscription_id"))
    return ("jour", v.get("inscription_id"), v.get("date_presence"), v.get("demi_journee"))


def _cle_bulletin(v: dict) -> Optional[tuple]:
    if v.get("trimestre_id") is not None:
        return ("periode", v.get("inscription_id"), v.get("trimestre_id"))
    if v.get("type_bulletin") == "ANNUEL":
        return ("annuel", v.get("inscription_id"))
    return None


# Les clés d'unicité réellement posées en base (index uniques des migrations),
# pour les lignes que le code crée « si elles manquent ».
CLES_NATURELLES: dict[str, Callable[[dict], Optional[tuple]]] = {
    "ss_journaux_comptables": _colonnes("code"),
    "ss_comptes_comptables": _colonnes("numero_compte"),
    "ss_exercices_comptables": _colonnes("etablissement_id", "annee"),
    "ss_parametres_comptabilite": _colonnes("etablissement_id", "cle"),
    "ss_parametres": _colonnes("etablissement_id", "cle"),
    "ss_types_frais": _colonnes("etablissement_id", "code"),
    "ss_tarifs_classe": _colonnes("classe_id", "type_frais_id"),
    "ss_seances": _colonnes("creneau_id", "date_seance"),
    "ss_presences": _cle_presence,
    "ss_notes": _colonnes("evaluation_id", "inscription_id"),
    "ss_periode_epreuves": _colonnes("classe_id", "trimestre_id", "evaluation_id"),
    "ss_bulletins": _cle_bulletin,
    "ss_resultats_officiels_examen": _colonnes("inscription_id"),
    "ss_messages_masques": _colonnes("message_id", "viewer_type", "viewer_id"),
}


def _texte(valeur) -> str:
    return valeur.isoformat() if isinstance(valeur, (dt.date, dt.datetime)) else str(valeur)


def cle_naturelle(nom_table: str, valeurs: dict) -> Optional[tuple[str, ...]]:
    """La clé naturelle de la ligne, en texte, ou None si elle n'en a pas
    (table ordinaire, ou clé incomplète)."""
    regle = CLES_NATURELLES.get(nom_table)
    cle = regle(valeurs) if regle else None
    if not cle or any(v is None for v in cle):
        return None
    return tuple(_texte(v) for v in cle)


def identifiant_naturel(nom_table: str, valeurs: dict) -> Optional[int]:
    """Identifiant dérivé de la clé naturelle de la ligne, ou None."""
    cle = cle_naturelle(nom_table, valeurs)
    if cle is None:
        return None
    texte = "|".join([nom_table, *cle])
    empreinte = int.from_bytes(hashlib.sha256(texte.encode("utf-8")).digest()[:8], "big")
    return DEBUT_NATUREL + empreinte % DEBUT_NATUREL


def est_naturel(identifiant: int) -> bool:
    return int(identifiant) >= DEBUT_NATUREL


def plage(numero_appareil: int) -> tuple[int, int]:
    """[début, fin) des identifiants de l'appareil `numero_appareil`
    (0 = le cloud, 1 et plus = les postes)."""
    if not 0 <= numero_appareil <= NUMERO_APPAREIL_MAX:
        raise ValueError(f"Numéro d'appareil invalide : {numero_appareil}")
    return numero_appareil * TAILLE_PLAGE, (numero_appareil + 1) * TAILLE_PLAGE


def appareil_de(identifiant: int) -> int:
    """Numéro de l'appareil qui a créé la ligne (0 = le cloud)."""
    return int(identifiant) // TAILLE_PLAGE


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


def _naturel_libre(contexte, nom_table: str) -> Optional[int]:
    """L'identifiant naturel de la ligne en cours d'insertion, s'il n'est pas
    déjà pris par une ligne d'une AUTRE clé (collision d'empreinte). Pris par
    la même clé : c'est un vrai doublon, l'insertion échouera comme le
    voudrait la contrainte d'unicité."""
    valeurs = contexte.get_current_parameters()
    naturel = identifiant_naturel(nom_table, valeurs)
    if naturel is None:
        return None
    t = table_par_nom(nom_table)
    cle = list(t.primary_key.columns)[0]
    occupant = contexte.connection.execute(select(t).where(cle == naturel)).mappings().first()
    # On compare les CLÉS, pas les identifiants : en cas de collision, les deux
    # clés donnent justement le même identifiant.
    if occupant is not None and cle_naturelle(nom_table, dict(occupant)) != cle_naturelle(nom_table, valeurs):
        return None
    return naturel


def _suivant(contexte, nom_table: str) -> int:
    if nom_table in CLES_NATURELLES:
        naturel = _naturel_libre(contexte, nom_table)
        if naturel is not None:
            return naturel
    generateur = _generateurs.get(contexte.connection.engine)
    if generateur is not None:
        return generateur.suivant(nom_table)
    if contexte.dialect.name == "postgresql":
        # Le cloud : hors clé naturelle, la séquence de la table, comme avant.
        cle = list(table_par_nom(nom_table).primary_key.columns)[0].name
        return contexte.connection.execute(
            text("SELECT nextval(pg_get_serial_sequence(:t, :c))"), {"t": nom_table, "c": cle}
        ).scalar()
    raise BaseSansGenerateur(
        "Cette base n'a pas de générateur d'identifiants : appeler generateur_de(moteur) au démarrage."
    )


def table_par_nom(nom_table: str) -> Table:
    return Base.metadata.tables[nom_table]


def brancher_generateur(seulement_cles_naturelles: bool = False) -> None:
    """À appeler au démarrage du moteur, avant toute écriture : sur toutes les
    tables pour un poste, sur les tables à clé naturelle pour le cloud.

    Définitif pour le processus : retirer ces valeurs par défaut après coup
    laisserait des insertions déjà compilées qui les attendent."""
    for t in tables_a_identifiant():
        if seulement_cles_naturelles and t.name not in CLES_NATURELLES:
            continue
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
        # La plage du poste, ou celle des identifiants dérivés d'une clé
        # naturelle (les mêmes sur tous les appareils, voir plus haut).
        naturel = f" AND NEW.{cle} < {DEBUT_NATUREL}" if t.name in CLES_NATURELLES else ""
        connexion.execute(text(f"""
            CREATE TRIGGER {_nom_garde(t.name)} BEFORE INSERT ON {t.name}
            WHEN (NEW.{cle} IS NULL OR ((NEW.{cle} <= {debut} OR NEW.{cle} >= {fin}){naturel}))
              AND (SELECT application_distante FROM ss_sync_drapeaux WHERE id = 1) = 0
            BEGIN
              SELECT RAISE(ABORT, 'SmartSchool : identifiant hors de la plage de ce poste ({t.name})');
            END
        """))


def retirer_les_gardes(connexion: Connection) -> None:
    for t in tables_a_identifiant():
        connexion.execute(text(f"DROP TRIGGER IF EXISTS {_nom_garde(t.name)}"))


def preparer_tables_du_poste(moteur: Engine) -> None:
    from app.sync.tables_poste import completer_colonnes

    metadonnees_poste.create_all(moteur)
    with moteur.begin() as cx:
        completer_colonnes(cx)
        if cx.execute(select(drapeaux.c.id).where(drapeaux.c.id == 1)).first() is None:
            cx.execute(drapeaux.insert().values(id=1, application_distante=0))


def activer_le_poste(moteur: Engine, numero_appareil: int, rang: int, cle_signature: str) -> None:
    """Le poste a son numéro : il peut créer des lignes, dans sa plage, et
    émettre des pièces numérotées et signées à son nom. Ce qu'il écrit est
    désormais noté dans son journal, pour être envoyé au cloud."""
    from app.sync.journal import installer_journal_poste

    if numero_appareil < 1:
        raise ValueError("Un poste a un numéro d'appareil supérieur ou égal à 1 (0 est le cloud).")
    preparer_tables_du_poste(moteur)
    generateur = generateur_de(moteur)
    generateur.rang, generateur.cle_signature = int(rang), cle_signature
    with moteur.begin() as cx:
        poser_les_gardes(cx, numero_appareil)
        installer_journal_poste(cx)
        generateur.configurer(cx, numero_appareil)


def application_distante(connexion: Connection, active: bool) -> None:
    """Lève (ou baisse) le drapeau dans la transaction en cours : les lignes
    venues du cloud gardent leurs identifiants sans déclencher les gardes."""
    connexion.execute(drapeaux.update().where(drapeaux.c.id == 1).values(application_distante=1 if active else 0))
