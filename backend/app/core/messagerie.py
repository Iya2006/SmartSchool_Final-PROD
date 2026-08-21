"""
SMARTSCHOOL — « Supprimer pour moi » (masquage de messages)

Logique partagée entre la messagerie back-office (communication.py) et les
portails élève/parent/enseignant, pour éviter que la même règle soit réécrite
— et divergente — à quatre endroits.

Principe : on ne supprime jamais la ligne ss_messages (un message diffusé à
toute une classe est UNE seule ligne vue par plusieurs personnes). Chaque
destinataire masque le message de SA vue via une ligne ss_messages_masques.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.academique import Message, MessageMasque


def sous_requete_messages_masques(db: Session, viewer_type: str, viewer_id: int):
    """Sous-requête des message_id masqués pour CE destinataire.

    À injecter dans un `Message.message_id.notin_(...)` sur toute liste de
    messages, exactement comme le reste du code fait déjà
    `... .in_(db.query(sous_requete))`.
    """
    return db.query(MessageMasque.message_id).filter(
        MessageMasque.viewer_type == viewer_type,
        MessageMasque.viewer_id == viewer_id,
    )


def masquer_message(db: Session, message_id: int, viewer_type: str, viewer_id: int) -> bool:
    """Masque un message pour ce destinataire (idempotent).

    Retourne True si une nouvelle ligne a été créée, False si le message était
    déjà masqué. Ne commit pas : l'appelant reste maître de sa transaction.
    """
    deja = db.query(MessageMasque.id).filter(
        MessageMasque.message_id == message_id,
        MessageMasque.viewer_type == viewer_type,
        MessageMasque.viewer_id == viewer_id,
    ).first()
    if deja:
        return False
    db.add(MessageMasque(
        message_id=message_id,
        viewer_type=viewer_type,
        viewer_id=viewer_id,
    ))
    return True


def message_dans_etablissements(db: Session, message_id: int, etablissement_ids) -> Optional[Message]:
    """Renvoie le message s'il appartient à l'un des établissements donnés, sinon None.

    Garde-fou avant de masquer : on ne laisse masquer qu'un message réellement
    rattaché à l'école (ou aux écoles) de l'appelant — jamais un id arbitraire.
    """
    ids = [e for e in (etablissement_ids or []) if e is not None]
    if not ids:
        return None
    return db.query(Message).filter(
        Message.message_id == message_id,
        Message.etablissement_id.in_(ids),
    ).first()
