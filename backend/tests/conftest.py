"""
SMARTSCHOOL ERP — Configuration des tests pytest
Fournit un client de test FastAPI et une base de données SQLite en mémoire isolée.

IMPORTANT : DATABASE_URL doit être défini AVANT tout import de main.py
car main.py appelle Base.metadata.create_all(bind=engine) au niveau module.

StaticPool → toutes les connexions partagent le même contexte mémoire,
ce qui garantit que les données créées en test sont visibles par le client HTTP.

Usage :
    cd backend
    .\\venv\\Scripts\\pytest tests/ -v
"""
import os
import pytest

# ── 1. DÉFINIR LES VARIABLES D'ENVIRONNEMENT AVANT TOUT IMPORT ────────────
# DATABASE_URL → SQLite mémoire (pas de fichier, pas de verrouillage)
# RATELIMIT_ENABLED=0 → désactive slowapi pendant les tests (évite les 429)
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["RATELIMIT_ENABLED"] = "0"

# ── 2. Maintenant on peut importer en toute sécurité ──────────────────────
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.rate_limit import limiter  # importer AVANT main pour patcher
from main import app  # noqa: E402 — doit être APRÈS os.environ

# ── 3. Fixture pour réinitialiser le rate limiter avant chaque test ───────
# Le patch de limiter.limit est trop tard (décorateurs déjà appliqués à l'import).
# On reset le storage des compteurs avant chaque test via une fixture autouse.
@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Vide les compteurs du rate limiter avant ET après chaque test.
    
    Évite les 429 (Too Many Requests) quand plusieurs tests consécutifs
    appellent le même endpoint de login.
    """
    _reset_storage()
    yield
    _reset_storage()

def _reset_storage():
    """Réinitialise tous les compteurs de rate limit."""
    try:
        limiter._storage.reset()
    except Exception:
        try:
            limiter._limiter._storage.reset()
        except Exception:
            pass  # Si le storage n'a pas de reset(), les compteurs restent

# ── Base de données SQLite en mémoire partagée ────────────────────────────
# StaticPool : toutes les connexions partagent la même DB en mémoire.
# Sans StaticPool, chaque TestClient crée une nouvelle connexion = DB vide.
engine_test = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_test)


def override_get_db():
    """Remplace la vraie DB par la DB de test SQLite en mémoire."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Remplacement de la dépendance DB pour tous les tests
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Crée toutes les tables avant la session et les détruit à la fin.

    SQLite en mémoire (StaticPool) → pas de fichier, pas de verrouillage,
    isolation parfaite entre sessions pytest.
    """
    Base.metadata.create_all(bind=engine_test)
    yield
    Base.metadata.drop_all(bind=engine_test)


@pytest.fixture
def client():
    """Client de test FastAPI réutilisable dans chaque test."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    """Session de base de données pour les tests nécessitant un accès direct à la DB.
    
    L'isolation entre tests est assurée par les compteurs _uid() dans chaque fichier
    de test, qui génèrent des identifiants uniques (usernames, emails, téléphones).
    SQLAlchemy 2.0 ne supporte plus bind=connection dans Session, donc on utilise
    une session simple sans rollback transactionnel.
    """
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
