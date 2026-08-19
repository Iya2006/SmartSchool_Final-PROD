"""
Fondation Maternelle : le cycle et ses 3 sections se créent automatiquement
pour un complexe, sont jugés « sans moyenne », et la Grande Section mène à la
1ère Année du primaire.
"""
from sqlalchemy.orm import Session

from app.models.academique import Cycle, Niveau, Etablissement
from app.services.referentiel_scolaire import amorcer_referentiel_scolaire
from app.api.promotion import _niveau_suivant

_C = 0


def _uid() -> int:
    global _C
    _C += 1
    return _C


def test_complexe_cree_la_maternelle_et_ses_sections(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"MAT-{uid}", nom=f"Complexe {uid}", type_etablissement="COMPLEXE")
    db.add(etab); db.commit(); db.refresh(etab)

    # Le fondateur coche Maternelle + Primaire.
    amorcer_referentiel_scolaire(db, etab.etablissement_id, "COMPLEXE", cycles=["MAT", "PRM"])
    db.commit()

    mat = db.query(Cycle).filter(
        Cycle.etablissement_id == etab.etablissement_id, Cycle.code == "MAT"
    ).first()
    assert mat is not None
    sections = db.query(Niveau).filter(Niveau.cycle_id == mat.cycle_id).order_by(Niveau.ordre).all()
    assert [s.code for s in sections] == ["PS", "MS", "GS"]
    # Toutes jugées sans moyenne.
    assert all(s.evaluation_simple == "O" for s in sections)
    # Aucune n'est un examen national.
    assert all(s.est_examen == "N" for s in sections)


def test_grande_section_mene_en_premiere_annee(db: Session):
    uid = _uid()
    etab = Etablissement(code=f"MATP-{uid}", nom=f"Complexe {uid}", type_etablissement="COMPLEXE")
    db.add(etab); db.commit(); db.refresh(etab)
    amorcer_referentiel_scolaire(db, etab.etablissement_id, "COMPLEXE", cycles=["MAT", "PRM"])
    db.commit()

    mat = db.query(Cycle).filter(
        Cycle.etablissement_id == etab.etablissement_id, Cycle.code == "MAT"
    ).first()
    ps = db.query(Niveau).filter(Niveau.cycle_id == mat.cycle_id, Niveau.code == "PS").first()
    ms = db.query(Niveau).filter(Niveau.cycle_id == mat.cycle_id, Niveau.code == "MS").first()
    gs = db.query(Niveau).filter(Niveau.cycle_id == mat.cycle_id, Niveau.code == "GS").first()

    # Petite → Moyenne → Grande.
    assert _niveau_suivant(db, ps).code == "MS"
    assert _niveau_suivant(db, ms).code == "GS"
    # Grande Section → 1ère Année du primaire.
    suivant_gs = _niveau_suivant(db, gs)
    assert suivant_gs is not None and suivant_gs.code == "1A"
