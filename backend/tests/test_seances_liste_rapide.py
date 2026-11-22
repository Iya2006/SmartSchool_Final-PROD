"""
La liste des séances (administration, portail enseignant) : mêmes lignes,
en 3 requêtes au lieu de 4 par séance — jusqu'à 2 000 allers-retours avec la
base pour 500 séances, 9 s mesurées.
"""
from datetime import date, timedelta

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.api.seances import _serialiser_les_seances, _serialize_seance
from app.models.academique import Enseignant, Matiere, Seance
from app.core.security import hash_password
from tests.test_isolation_multi_ecole import Ecole, _uid


def test_meme_resultat_en_trois_requetes(db: Session):
    a = Ecole(db, "A")
    matieres = [Matiere(cycle_id=a.cycle.cycle_id, code=f"SQ{_uid()}", libelle=f"Matière {i}") for i in range(3)]
    remplacant = Enseignant(etablissement_id=a.etab.etablissement_id, matricule=f"REMP-{_uid()}", nom="Sow",
                            prenom="Aminata", sexe="F", telephone=f"62300{_uid():04d}",
                            mot_de_passe=hash_password("motdepasse123"), statut="ACTIF")
    db.add_all(matieres + [remplacant])
    db.commit()
    seances = []
    for i in range(12):
        s = Seance(classe_id=a.classe.classe_id, matiere_id=matieres[i % 3].matiere_id, annee_id=a.annee.annee_id,
                   enseignant_prevu_id=a.enseignant.enseignant_id,
                   enseignant_reel_id=remplacant.enseignant_id if i % 4 == 0 else None,
                   date_seance=date(2026, 11, 2) + timedelta(days=i), heure_debut_prevue="08:00",
                   heure_fin_prevue="09:00", statut="PREVUE")
        db.add(s)
        seances.append(s)
    db.commit()

    attendu = [_serialize_seance(db, s) for s in seances]
    requetes = []
    ecouter = lambda *args: requetes.append(args[2])  # noqa: E731
    moteur = db.get_bind()
    event.listen(moteur, "before_cursor_execute", ecouter)
    try:
        obtenu = _serialiser_les_seances(db, seances)
    finally:
        event.remove(moteur, "before_cursor_execute", ecouter)

    assert obtenu == attendu
    assert len(requetes) <= 3
    assert any(ligne["enseignant_reel"] == "Aminata Sow" for ligne in obtenu)
    assert _serialiser_les_seances(db, []) == []
