"""
Version de SmartSchool : celle du moteur, et donc de l'application installée
sur les postes (alignée sur desktop/package.json à l'empaquetage, voir
desktop/scripts/empaqueter.mjs).

Un poste envoie sa version à chaque synchronisation. Le cloud refuse ceux qui
sont plus anciens que `VERSION_POSTE_MINIMALE` : un poste resté sur une vieille
version pourrait envoyer des lignes auxquelles manque une colonne devenue
obligatoire. Le poste l'affiche (« Mise à jour nécessaire ») et sa mise à jour
automatique s'en charge ; il continue de fonctionner hors-ligne en attendant.

À relever quand un changement du schéma rend les anciens postes incompatibles,
jamais par précaution : chaque relèvement oblige toutes les écoles à mettre à
jour avant de se synchroniser.
"""
VERSION = "0.3.0"
VERSION_POSTE_MINIMALE = "0.3.0"

ENTETE = "X-SmartSchool-Version"


def numeros(version: str) -> tuple[int, ...]:
    """« 0.3.10 » → (0, 3, 10). Une version illisible vaut 0 : la plus ancienne."""
    try:
        return tuple(int(partie) for partie in (version or "").strip().split("."))
    except ValueError:
        return (0,)


def poste_a_jour(version: str) -> bool:
    return numeros(version) >= numeros(VERSION_POSTE_MINIMALE)
