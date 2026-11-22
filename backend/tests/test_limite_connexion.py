"""
Les tentatives de connexion sont comptées par adresse ET par compte visé.

Par adresse seule, tous les utilisateurs d'un poste hors-ligne (127.0.0.1)
partageaient 5 tentatives par minute : une personne qui se trompait de mot de
passe bloquait tout l'ordinateur — constaté en validant le poste rôle par
rôle. La suite des tests désactive la limite (RATELIMIT_ENABLED=0) : on la
vérifie ici sur une application à part, avec un limiteur actif.
"""
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from app.core.rate_limit import cle_de_connexion, rate_limit_exceeded_handler


class Demande(BaseModel):
    identifiant: str
    mot_de_passe: str


def _application():
    limiteur = Limiter(key_func=cle_de_connexion, storage_uri="memory://")
    limiteur.enabled = True  # la suite des tests le désactive par variable d'environnement
    app = FastAPI()
    app.state.limiter = limiteur
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    @app.post("/connexion")
    @limiteur.limit("2/minute", key_func=cle_de_connexion)
    def connexion(request: Request, data: Demande):
        return {"ok": data.identifiant}

    return TestClient(app)


def test_chaque_compte_a_ses_tentatives():
    client = _application()
    essai = lambda qui: client.post("/connexion", json={"identifiant": qui, "mot_de_passe": "faux"}).status_code  # noqa: E731

    assert [essai("mariama"), essai("mariama"), essai("mariama")] == [200, 200, 429]
    # Même ordinateur, autre compte : pas bloqué par les erreurs de Mariama.
    assert essai("ousmane") == 200
    # La casse et les espaces ne contournent pas la limite.
    assert essai("  MARIAMA ") == 429


def test_cle_sans_corps_lisible():
    class Requete:
        client = type("C", (), {"host": "10.0.0.7"})()
        headers = {}
        scope = {"type": "http"}

    assert cle_de_connexion(Requete()) == "10.0.0.7"
    avec_corps = Requete()
    avec_corps._json = {"matricule": "ELV-0042", "mot_de_passe": "x"}
    assert cle_de_connexion(avec_corps) == "10.0.0.7|elv-0042"
