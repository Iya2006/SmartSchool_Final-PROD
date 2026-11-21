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


# Ordre rendu par PostgreSQL en_US.UTF-8 (collation de la production, et de la
# base de développement) pour ces textes, relevé tel quel : le poste doit
# rendre exactement le même.
ORDRE_DE_POSTGRESQL = [
    "10ème Année 1", "12ème Année SM 1", "1ère Année 1", "2ème Année 1", "a b", "a-b", "a_b", "ab",
    "Aïcha", "Aissata", "Aïssatou", "Ca", "Ça", "cote", "coté", "côte", "côté", "elodie", "Elodie",
    "Élodie", "jean", "Jean", "Jeanne", "Jean-Paul", "Jean Pierre", "Ndiaye", "N'Diaye", "NDIAYE",
    "Oeuvre", "Œuvre", "show_groupe_sanguin", "show_groupeSanguin",
]


def _moteurs_de_poste(tmp_path):
    from app.core.database import regler_sqlite
    clair = create_engine(f"sqlite:///{tmp_path / 'tri-clair.db'}")
    regler_sqlite(clair)
    yield "clair", clair
    pytest.importorskip("sqlcipher3")
    from app.core.database import moteur_chiffre
    chiffre = moteur_chiffre(str(tmp_path / "tri-chiffre.db"), "5a" * 32)
    regler_sqlite(chiffre)
    yield "chiffré", chiffre


def test_le_poste_trie_les_textes_comme_le_cloud(tmp_path):
    import random

    for nom, moteur in _moteurs_de_poste(tmp_path):
        Modele.metadata.create_all(moteur)
        melange = ORDRE_DE_POSTGRESQL[:]
        random.Random(7).shuffle(melange)
        with Session(moteur) as s:
            s.add_all([Personne(nom=n, prenom="x", matricule=f"M{i}") for i, n in enumerate(melange)])
            s.commit()
            assert s.scalars(select(Personne.nom).order_by(Personne.nom)).all() == ORDRE_DE_POSTGRESQL, nom
            assert s.scalars(select(Personne.nom).order_by(Personne.nom.desc())).all() == ORDRE_DE_POSTGRESQL[::-1], nom
            # Plusieurs critères, dont un qui n'est pas du texte.
            assert s.scalars(select(Personne.nom).order_by(Personne.prenom, Personne.nom, Personne.id)).all() \
                == ORDRE_DE_POSTGRESQL, nom
            # Seul l'ordre change : une égalité reste une égalité stricte.
            assert s.scalars(select(Personne.nom).where(Personne.nom == "Élodie")).all() == ["Élodie"], nom
        moteur.dispose()


def test_la_cle_alphabetique_suit_postgresql():
    from app.core.database import cle_alphabetique
    assert sorted(reversed(ORDRE_DE_POSTGRESQL), key=cle_alphabetique) == ORDRE_DE_POSTGRESQL


def test_les_statistiques_du_poste_guident_le_choix_des_index(tmp_path):
    """Sans statistiques, SQLite parcourait toutes les inscriptions de l'année
    pour chaque élève (1,8 s pour 5 000 élèves contre 4 ms) : elles sont
    calculées à l'installation et à chaque démarrage du poste."""
    from app.core.database import mettre_a_jour_les_statistiques, regler_sqlite

    moteur = create_engine(f"sqlite:///{tmp_path / 'stats.db'}")
    regler_sqlite(moteur)
    with moteur.begin() as cx:
        cx.execute(text("CREATE TABLE insc (id INTEGER PRIMARY KEY, eleve_id INTEGER, annee_id INTEGER)"))
        cx.execute(text("CREATE INDEX ix_annee ON insc (annee_id)"))
        cx.execute(text("CREATE INDEX ix_eleve ON insc (eleve_id)"))
        cx.execute(text("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 3000) "
                        "INSERT INTO insc (eleve_id, annee_id) SELECT i, 7 FROM n"))
    requete = "EXPLAIN QUERY PLAN SELECT id FROM insc WHERE eleve_id = 42 AND annee_id = 7"

    mettre_a_jour_les_statistiques(moteur)

    with moteur.connect() as cx:
        assert cx.execute(text("SELECT count(*) FROM sqlite_stat1")).scalar() > 0
        plan = " ".join(str(ligne[-1]) for ligne in cx.execute(text(requete)))
    assert "ix_eleve" in plan, plan
    moteur.dispose()
