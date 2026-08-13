import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

# Configure la base de données PostgreSQL
# À partir du docker-compose : postgres / admin / admin / mydb / 5433 (port hôte)
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql+pg8000://admin:admin@localhost:5433/mydb"
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

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_pool_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
