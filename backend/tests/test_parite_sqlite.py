"""
Parité entre le poste (SQLite, chiffré ou non) et le cloud (PostgreSQL) sur
les fonctions de texte : une même recherche doit trouver les mêmes lignes.
"""
import pytest
from sqlalchemy import Column, Integer, String, create_engine, event, func, select, text
from sqlalchemy.orm import Session, declarative_base

from app.core.database import _reglages_sqlite
from app.core.recherche import filtre_nom_prenom_matricule, normaliser_terme

Modele = declarative_base()


class Personne(Modele):
    __tablename__ = "personnes"
    id = Column(Integer, primary_key=True)
    nom = Column(String)
    prenom = Column(String)
    matricule = Column(String)


def _moteurs(tmp_path):
    clair = create_engine(f"sqlite:///{tmp_path / 'clair.db'}")
    event.listen(clair, "connect", _reglages_sqlite)
    yield "clair", clair
    try:
        from app.core.database import moteur_chiffre
    except ImportError:
        return
    pytest.importorskip("sqlcipher3")
    chiffre = moteur_chiffre(str(tmp_path / "chiffre.db"), "5a" * 32)
    event.listen(chiffre, "connect", _reglages_sqlite)
    yield "chiffré", chiffre


def test_minuscules_et_majuscules_accentuees_comme_postgresql(tmp_path):
    for nom, moteur in _moteurs(tmp_path):
        with moteur.connect() as cx:
            assert cx.execute(text("SELECT lower('TRAORÉ'), upper('Néné Aïcha')")).one() == (
                "traoré", "NÉNÉ AÏCHA"), nom
            assert cx.execute(text("SELECT lower(NULL)")).scalar() is None, nom
        moteur.dispose()


def test_la_recherche_sans_accents_trouve_un_nom_en_majuscules_accentuees(tmp_path):
    for nom, moteur in _moteurs(tmp_path):
        Modele.metadata.create_all(moteur)
        with Session(moteur) as s:
            s.add_all([Personne(nom="TRAORÉ", prenom="FATOUMATA AÏCHA", matricule="ELV-00001"),
                       Personne(nom="Diallo", prenom="Mamadou", matricule="ELV-00002")])
            s.commit()
            for terme in ("traore", "TRAORE", "aicha", "aicha traore"):
                trouves = s.scalars(select(Personne.nom).where(filtre_nom_prenom_matricule(
                    normaliser_terme(terme), Personne.nom, Personne.prenom, Personne.matricule))).all()
                assert trouves == ["TRAORÉ"], (nom, terme)
            # ILIKE reste insensible à la casse, accentuée comprise.
            assert s.scalars(select(Personne.nom).where(Personne.nom.ilike("%traoré%"))).all() == ["TRAORÉ"], nom
        moteur.dispose()


def test_like_distingue_la_casse_comme_postgresql(tmp_path):
    for nom, moteur in _moteurs(tmp_path):
        with moteur.connect() as cx:
            assert cx.execute(text("SELECT 'Alerte paie' LIKE 'alerte%'")).scalar() == 0, nom
            assert cx.execute(text("SELECT 'Alerte paie' LIKE 'Alerte%'")).scalar() == 1, nom
            assert cx.execute(select(func.lower("ÉCOLE").like("école%"))).scalar() == 1, nom
        moteur.dispose()
