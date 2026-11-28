"""
Poste retiré par la direction : plus personne ne s'y connecte.

Le cloud a refusé ce poste comme retiré (ordinateur perdu, volé, remplacé ;
voir POST /api/sync/postes/{rang}/retirer). Le moteur du poste refuse alors
toute requête de l'application, connexion comprise. Les données restent sur le
disque, chiffrées, rien n'est effacé ; la synchronisation continue d'essayer,
et une remise en service par la direction lève le verrou au premier échange
réussi (app/sync/service.py).
"""
from fastapi.responses import JSONResponse
from sqlalchemy.engine import Engine

from app.sync.service import poste_retire

# L'écran d'installation lit l'état du poste pour afficher le message.
ROUTES_TOUJOURS_OUVERTES = ("/api/poste/etat", "/health")

MESSAGE_RETIRE = ("Ce poste a été retiré par la direction de l'école : on ne peut plus s'y connecter. "
                  "Si c'est une erreur, la direction peut le remettre en service depuis l'écran "
                  "Synchronisation ; sinon, installez SmartSchool sur le nouvel ordinateur.")


def verrou_pour(moteur: Engine):
    """Intergiciel HTTP qui ferme le poste dès qu'il est noté retiré."""

    async def verrou(request, call_next):
        chemin = request.url.path
        if chemin.startswith("/api/") and chemin not in ROUTES_TOUJOURS_OUVERTES and poste_retire(moteur):
            return JSONResponse(status_code=403, content={"detail": MESSAGE_RETIRE})
        return await call_next(request)

    return verrou
