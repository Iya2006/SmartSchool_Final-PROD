"""
SMARTSCHOOL — Cache Redis
Petite couche utilitaire pour mettre en cache les réponses API coûteuses
(ex: tableau de bord financier), afin de réduire la charge sur la base de
données et d'améliorer la résilience face à une connexion instable.

Comportement volontairement défensif : si Redis n'est pas disponible
(non démarré, connexion refusée, timeout...), toutes les fonctions
échouent silencieusement (avec un simple warning dans les logs) plutôt
que de faire planter la requête API appelante.
"""
import json
import logging
import os
from typing import Optional

logger = logging.getLogger("smartschool.cache")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis_client = None
_redis_unavailable = False


def get_redis_client():
    """
    Retourne un client Redis partagé, ou None si Redis est indisponible.

    Le client est instancié une seule fois (lazy singleton). Si la
    connexion échoue une première fois, on évite de retenter à chaque
    appel pour ne pas ralentir les requêtes suivantes.
    """
    global _redis_client, _redis_unavailable

    if _redis_unavailable:
        return None

    if _redis_client is not None:
        return _redis_client

    try:
        import redis

        client = redis.from_url(
            REDIS_URL,
            socket_connect_timeout=1,
            socket_timeout=1,
            decode_responses=True,
        )
        # Vérifie immédiatement que la connexion fonctionne.
        client.ping()
        _redis_client = client
        return _redis_client
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        logger.warning("Redis indisponible (%s) — cache désactivé.", exc)
        _redis_unavailable = True
        return None


def cache_get(key: str) -> Optional[dict]:
    """
    Récupère une valeur JSON depuis le cache Redis.

    Retourne None si la clé n'existe pas, si Redis est indisponible,
    ou si la valeur stockée n'est pas un JSON valide.
    """
    client = get_redis_client()
    if client is None:
        return None

    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        logger.warning("Erreur lecture cache Redis (clé=%s): %s", key, exc)
        return None


def cache_set(key: str, value: dict, ttl_seconds: int = 60) -> None:
    """
    Stocke une valeur JSON dans le cache Redis avec une durée de vie (TTL).

    N'échoue jamais : en cas de problème (Redis indisponible, valeur non
    sérialisable...), un warning est loggé et la fonction retourne
    silencieusement.
    """
    client = get_redis_client()
    if client is None:
        return

    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        logger.warning("Erreur écriture cache Redis (clé=%s): %s", key, exc)


def cache_del(key: str) -> None:
    """
    Supprime une clé du cache Redis (invalidation après une mutation).

    À appeler après tout encaissement/décaissement/paiement de salaire pour
    que le tableau de bord financier ne serve pas des chiffres périmés
    pendant la durée du TTL. N'échoue jamais (même logique défensive que
    cache_get/cache_set).
    """
    client = get_redis_client()
    if client is None:
        return

    try:
        client.delete(key)
    except Exception as exc:  # pragma: no cover - dépend de l'environnement
        logger.warning("Erreur suppression cache Redis (clé=%s): %s", key, exc)
