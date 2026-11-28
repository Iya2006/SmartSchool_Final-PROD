"""
Les anciennes présences d'agents et les anciens pointages d'élèves, sans école
renseignée, n'arrivaient sur aucun poste alors que les écrans les comptaient :
ils sont rattachés à l'école de leur agent ou de leur élève, et entrent alors
dans le périmètre que reçoit un poste.
"""
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.academique import PointageEleve, PresenceAgent
from app.sync.perimetre import requete_lignes
from app.sync.rattrapage import rattacher_les_lignes_sans_ecole
from tests.test_isolation_multi_ecole import Ecole


def _sans_ecole(db, **champs):
    ligne = PresenceAgent(date_presence=date(2026, 3, 2), heure_arrivee=time(7, 55), statut="PRESENT", **champs)
    db.add(ligne); db.commit(); db.refresh(ligne)
    return ligne


def test_les_lignes_anciennes_rejoignent_l_ecole_de_leur_agent_ou_eleve(db: Session):
    a, b = Ecole(db, "A"), Ecole(db, "B")
    du_prof = _sans_ecole(db, type_agent="ENSEIGNANT", agent_id=a.enseignant.enseignant_id)
    du_personnel = _sans_ecole(db, type_agent="PERSONNEL", agent_id=b.admin.utilisateur_id)
    inconnu = _sans_ecole(db, type_agent="ENSEIGNANT", agent_id=987654321)
    eleve = a.eleve(db)
    pointage = PointageEleve(eleve_id=eleve.eleve_id, date_pointage=date(2026, 3, 2), heure_arrivee=time(7, 40))
    db.add(pointage); db.commit(); db.refresh(pointage)

    def perimetre(nom_table, ecole):
        return set(db.execute(select(requete_lignes(nom_table, ecole.etab.etablissement_id).subquery().c[0])).scalars())

    # Avant : hors de tout périmètre, donc d'aucun poste.
    assert du_prof.presence_id not in perimetre("ss_presences_agents", a)
    assert pointage.pointage_id not in perimetre("ss_pointage_eleves", a)

    rattachees = rattacher_les_lignes_sans_ecole(db.get_bind())
    assert rattachees["ss_presences_agents (enseignants)"] >= 1
    assert rattachees["ss_presences_agents (personnel)"] >= 1
    assert rattachees["ss_pointage_eleves"] >= 1

    db.expire_all()
    assert db.get(PresenceAgent, du_prof.presence_id).etablissement_id == a.etab.etablissement_id
    assert db.get(PresenceAgent, du_personnel.presence_id).etablissement_id == b.etab.etablissement_id
    assert db.get(PointageEleve, pointage.pointage_id).etablissement_id == a.etab.etablissement_id
    # Un agent introuvable : la ligne reste sans école, plutôt qu'attribuée au hasard.
    assert db.get(PresenceAgent, inconnu.presence_id).etablissement_id is None

    assert du_prof.presence_id in perimetre("ss_presences_agents", a)
    assert du_personnel.presence_id in perimetre("ss_presences_agents", b)
    assert du_personnel.presence_id not in perimetre("ss_presences_agents", a)
    assert pointage.pointage_id in perimetre("ss_pointage_eleves", a)

    # Rejouer ne change plus rien.
    assert rattacher_les_lignes_sans_ecole(db.get_bind()) == {}
