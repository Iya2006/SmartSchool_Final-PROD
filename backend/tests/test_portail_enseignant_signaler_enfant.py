"""
« Signaler mon enfant » (portail enseignant) : un enseignant dont l'enfant est
élève de l'école le signale à la direction, qui rattache son compte parent.

L'envoi finissait toujours en erreur 500 : `Message` n'était pas importé dans
app/api/portail_enseignant.py (trouvé par analyse statique, le 22/11/2026).
"""
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.academique import Message
from tests.test_lot5_communication_isolation import Ecole, _headers


def test_l_enseignant_signale_son_enfant_a_la_direction(client: TestClient, db: Session):
    ecole = Ecole(db, "SIGN")
    entetes = _headers(client, ecole.enseignant.matricule)

    rep = client.post(
        f"/api/portail-enseignant/{ecole.enseignant.enseignant_id}/signaler-enfant", headers=entetes,
        json={"nom_enfant": "Bah", "prenom_enfant": "Aïcha", "classe_detail": "6e A", "remarque": "Ma fille"},
    )
    assert rep.status_code == 200, rep.text
    msg = db.get(Message, rep.json()["message_id"])
    assert (msg.etablissement_id, msg.expediteur_type, msg.expediteur_id, msg.destinataire_type) == (
        ecole.etab.etablissement_id, "ENSEIGNANT", ecole.enseignant.enseignant_id, "ADMIN")
    assert "Aïcha" in msg.contenu and "6e A" in msg.contenu
