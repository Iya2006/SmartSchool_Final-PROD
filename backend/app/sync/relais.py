"""
Ce qu'un poste demande au cloud pour le compte de son utilisateur (la liste
« À vérifier » et ses décisions), avec le jeton de l'appareil.

Sans internet, la réponse doit venir VITE et dire ce qu'elle est :
- 5 s pour joindre le cloud, pas 30 : un routeur sans accès à internet laisse
  souvent la connexion en suspens au lieu de la refuser ;
- un 503 MARQUÉ (`ENTETE_HORS_LIGNE`) : l'interface ne le réessaie pas
  (frontend/src/lib/api.ts), puisque c'est internet qui manque, et non une
  coupure passagère. Sans la marque, elle insistait quatre fois de plus, et
  l'écran tournait sans fin.
"""
import httpx
from fastapi import HTTPException

ENTETE_HORS_LIGNE = "X-SmartSchool-Hors-Ligne"
HORS_LIGNE = "Ces décisions se prennent avec internet : reconnectez ce poste, puis réessayez."
LISTE_HORS_LIGNE = ("La liste « À vérifier » se consulte avec internet : "
                    "elle s'affichera dès que ce poste sera reconnecté.")
DELAIS = httpx.Timeout(30.0, connect=5.0)


def conflits_du_cloud(cloud_url: str, jeton: str | None, tous: bool) -> dict:
    """La liste « À vérifier », lue au cloud. Sans internet, ce n'est pas une
    erreur mais un état du poste : une réponse normale le dit, et l'écran
    l'affiche, sans erreur dans le navigateur. Les décisions, elles, restent
    refusées (503 marqué) : elles ne peuvent pas se prendre hors-ligne."""
    try:
        return vers_le_cloud(cloud_url, jeton, "GET", "/api/sync/appareil/conflits", params={"tous": tous})
    except HTTPException as refus:
        if (refus.headers or {}).get(ENTETE_HORS_LIGNE):
            return {"conflits": [], "hors_ligne": True, "message": LISTE_HORS_LIGNE}
        raise


def vers_le_cloud(cloud_url: str, jeton: str | None, methode: str, chemin: str, **options):
    if not jeton:
        raise HTTPException(409, "Ce poste n'est pas encore installé.")
    try:
        with httpx.Client(base_url=cloud_url, timeout=DELAIS) as client:
            rep = client.request(methode, chemin, headers={"Authorization": f"Appareil {jeton}"}, **options)
    except httpx.TransportError:
        raise HTTPException(503, HORS_LIGNE, headers={ENTETE_HORS_LIGNE: "1"})
    if rep.status_code >= 400:
        detail = rep.json().get("detail") if rep.headers.get("content-type", "").startswith("application/json") else None
        raise HTTPException(rep.status_code, detail or "Le serveur a refusé la demande.")
    return rep.json()
