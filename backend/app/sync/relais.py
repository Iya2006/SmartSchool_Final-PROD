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
DELAIS = httpx.Timeout(30.0, connect=5.0)


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
