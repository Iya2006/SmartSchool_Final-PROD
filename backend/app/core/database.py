import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# Configure la base de données PostgreSQL
# À partir du docker-compose : postgres / admin / admin / mydb / 15433 (port hôte)
# Port 15433 (au lieu de 5433) : Windows/Hyper-V réserve dynamiquement des
# plages de ports (netsh int ipv4 show excludedportrange) qui incluaient 5433,
# rendant le bind Docker impossible ("access forbidden by its permissions").
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+pg8000://admin:admin@localhost:15433/mydb"
)

# pool_pre_ping : vérifie qu'une connexion du pool est toujours vivante avant
# de l'utiliser — nécessaire avec un Postgres managé distant (Supabase) qui
# peut fermer une connexion inactive côté serveur ; sans ça, la première
# requête après une période d'inactivité échoue avec "server closed the
# connection unexpectedly" au lieu d'ouvrir silencieusement une nouvelle
# connexion. pool_recycle=300 referme proactivement toute connexion de plus
# de 5 min (marge sous les délais habituels des poolers managés).
#
# pool_size/max_overflow sont spécifiques à QueuePool (Postgres) — SQLite
# (utilisé par les tests, voir tests/conftest.py) utilise SingletonThreadPool
# par défaut, qui ne les accepte pas (TypeError à l'import de ce module,
# donc à la collecte de TOUS les tests — vérifié réellement). D'où le
# dialecte testé explicitement plutôt que de les passer inconditionnellement.
#
# COMBIEN DE PERSONNES EN MÊME TEMPS ?
# ------------------------------------
# Le pool valait 5 + 5, soit DIX connexions par processus. Or FastAPI exécute
# les routes synchrones (toutes les nôtres) dans un pool de fils d'exécution
# qui en accepte QUARANTE simultanément. Trente requêtes se battaient donc pour
# dix connexions ; passé `pool_timeout` (30 s par défaut), elles ne
# s'affichaient pas lentement — elles tombaient en erreur 500.
#
# Le mur n'était donc pas à un million d'élèves : il était à une dizaine de
# personnes qui cliquent en même temps sur un même processus. Une rentrée dans
# une seule école suffisait à l'atteindre.
#
# LA RÈGLE À NE JAMAIS PERDRE DE VUE
#     nombre de processus × (pool_size + max_overflow) ≤ max_connections
#
# PostgreSQL accepte 100 connexions par défaut et en réserve 3 pour
# l'administration. Avec les 4 processus lancés par Dockerfile.prod :
#
#     4 × (15 + 5) = 80 connexions
#     + le worker de tâches, les migrations, une session psql d'urgence
#     ────────────────────────────────────────────────────────────────
#     ≈ 90, sous la limite de 97 réellement disponibles.
#
# Ces valeurs se règlent par variables d'environnement : un hébergement qui
# autorise davantage de connexions n'a qu'à les relever. Mais l'inégalité
# ci-dessus doit être revérifiée à chaque fois — la dépasser ne dégrade pas
# les performances, elle fait échouer l'ouverture de connexion, donc la
# requête.
#
# `main.py` aligne le pool de fils d'exécution sur cette capacité au démarrage :
# une requête attend alors son tour DANS l'application, sans détenir de
# connexion, plutôt que d'expirer sur le pool de la base.
#
# Au-delà, ça ne se règle plus ici : il faudra un répartiteur de connexions
# (PgBouncer) et des serveurs de lecture séparés. C'est de l'hébergement, et ça
# ne se décide qu'une fois que le code a cessé de gaspiller ce qu'il a.
def _entier_env(nom: str, defaut: int) -> int:
    try:
        valeur = int(os.getenv(nom, defaut))
    except (TypeError, ValueError):
        return defaut
    return valeur if valeur > 0 else defaut


DB_POOL_SIZE = _entier_env("DB_POOL_SIZE", 15)
DB_MAX_OVERFLOW = _entier_env("DB_MAX_OVERFLOW", 5)
# Capacité totale d'un processus : ce que `main.py` recopie sur le pool de fils.
DB_CAPACITE = DB_POOL_SIZE + DB_MAX_OVERFLOW

# pool_size/max_overflow sont spécifiques à QueuePool (Postgres) — SQLite
# (utilisé par les tests, voir tests/conftest.py) utilise SingletonThreadPool
# par défaut, qui ne les accepte pas (TypeError à l'import de ce module, donc à
# la collecte de TOUS les tests — vérifié réellement). D'où le dialecte testé
# explicitement plutôt que de les passer inconditionnellement.
_pool_kwargs = {"pool_pre_ping": True, "pool_recycle": 300}
if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _pool_kwargs["pool_size"] = DB_POOL_SIZE
    _pool_kwargs["max_overflow"] = DB_MAX_OVERFLOW
    # Attendre trente secondes une connexion, c'est faire patienter quelqu'un
    # devant un écran figé pour lui servir une erreur au bout du compte. Dix
    # secondes suffisent : au-delà, la charge dépasse la capacité et il vaut
    # mieux le dire tout de suite que de laisser la file s'allonger.
    _pool_kwargs["pool_timeout"] = _entier_env("DB_POOL_TIMEOUT", 10)

EST_SQLITE = SQLALCHEMY_DATABASE_URL.startswith("sqlite")
if EST_SQLITE:
    # Poste local (offline-first) et tests. Les routes s'exécutent dans un pool
    # de fils : la connexion doit pouvoir changer de fil, et une écriture
    # attend son tour (30 s) au lieu d'échouer en « database is locked ».
    _pool_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}


# ── Base chiffrée d'un poste installé ──────────────────────────────────────
# Un ordinateur volé ne doit pas livrer l'école. Sur un poste, l'application
# installée fournit une clé de 256 bits (SMARTSCHOOL_CLE_BASE, protégée par le
# compte Windows, voir desktop/main.js) : la base est chiffrée par SQLCipher,
# illisible sans elle. Sans clé (tests, développement), rien ne change.

def _chemin_sqlite(url: str) -> str:
    return url.split(":///", 1)[1] if ":///" in url else url


def connexion_chiffree(chemin: str, cle_hex: str):
    """Ouvre la base chiffrée. La clé brute (64 caractères hexadécimaux) est
    passée telle quelle : pas de dérivation à chaque ouverture."""
    import sqlcipher3.dbapi2 as sqlcipher

    connexion = sqlcipher.connect(chemin, check_same_thread=False, timeout=30)
    connexion.execute(f"PRAGMA key = \"x'{cle_hex}'\"")
    return connexion


def moteur_chiffre(chemin: str, cle_hex: str, **options):
    """Moteur SQLAlchemy sur une base SQLCipher. Le module de SQLCipher est
    déclaré comme pilote : sans cela, ses erreurs (doublon, clé étrangère) ne
    seraient pas reconnues comme telles par SQLAlchemy.

    Le pool est imposé (QueuePool, comme pour un fichier SQLite ordinaire) :
    avec l'adresse « sqlite:// », SQLAlchemy croirait à une base en mémoire et
    prendrait un SingletonThreadPool, qui ne garde que cinq fils et ferme la
    connexion des autres pendant qu'ils s'en servent. Le moteur en sert
    quarante à la fois : le poste s'arrêtait net, sans aucune trace, au premier
    afflux de requêtes (constaté sur l'application installée)."""
    import sqlcipher3.dbapi2 as sqlcipher
    from sqlalchemy.pool import QueuePool

    options.setdefault("poolclass", QueuePool)
    options.setdefault("pool_size", DB_POOL_SIZE)
    options.setdefault("max_overflow", DB_MAX_OVERFLOW)
    return create_engine("sqlite://", creator=lambda: connexion_chiffree(chemin, cle_hex),
                         module=sqlcipher, **options)


def chiffrer_base_en_clair(chemin: str, cle_hex: str) -> bool:
    """Convertit, une seule fois, une base de poste encore en clair (installée
    avant le chiffrement). Rend True si une conversion a eu lieu. Le fichier
    n'est remplacé qu'une fois la copie chiffrée complète."""
    import sqlcipher3.dbapi2 as sqlcipher

    if not os.path.exists(chemin):
        return False
    with open(chemin, "rb") as f:
        if f.read(16) != b"SQLite format 3\x00":
            return False  # déjà chiffrée (ou vide)
    provisoire = chemin + ".chiffrement"
    if os.path.exists(provisoire):
        os.remove(provisoire)
    en_clair = sqlcipher.connect(chemin)
    try:
        en_clair.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        chemin_sql = provisoire.replace("'", "''")
        en_clair.execute(f"ATTACH DATABASE '{chemin_sql}' AS chiffree KEY \"x'{cle_hex}'\"")
        en_clair.execute("SELECT sqlcipher_export('chiffree')")
        en_clair.execute("DETACH DATABASE chiffree")
    finally:
        en_clair.close()
    for suffixe in ("-wal", "-shm"):
        if os.path.exists(chemin + suffixe):
            os.remove(chemin + suffixe)
    os.replace(provisoire, chemin)
    return True


CLE_BASE = (os.getenv("SMARTSCHOOL_CLE_BASE") or "").strip()
if EST_SQLITE and CLE_BASE:
    _chemin_base = _chemin_sqlite(SQLALCHEMY_DATABASE_URL)
    chiffrer_base_en_clair(_chemin_base, CLE_BASE)
    _pool_kwargs.pop("connect_args", None)
    engine = moteur_chiffre(_chemin_base, CLE_BASE, **_pool_kwargs)
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, **_pool_kwargs)


def _reglages_sqlite(connexion_dbapi, _enregistrement):
    """Réglages de chaque connexion SQLite, en clair ou chiffrée."""
    curseur = connexion_dbapi.cursor()
    # WAL : on peut lire pendant qu'une écriture est en cours.
    curseur.execute("PRAGMA journal_mode=WAL")
    curseur.execute("PRAGMA synchronous=NORMAL")
    # SQLite n'applique pas les clés étrangères par défaut, PostgreSQL si :
    # sans ce réglage, le poste accepterait hors-ligne une donnée que le
    # cloud refuserait ensuite à la synchronisation.
    curseur.execute("PRAGMA foreign_keys=ON")
    curseur.close()


if EST_SQLITE:
    event.listen(engine, "connect", _reglages_sqlite)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
