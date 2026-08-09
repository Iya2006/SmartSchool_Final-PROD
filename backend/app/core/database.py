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
_pool_kwargs = {"pool_pre_ping": True, "pool_recycle": 300}
if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    _pool_kwargs["pool_size"] = 5
    _pool_kwargs["max_overflow"] = 5

engine = create_engine(SQLALCHEMY_DATABASE_URL, **_pool_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
