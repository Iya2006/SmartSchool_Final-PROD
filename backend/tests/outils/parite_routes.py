"""
Parité poste ↔ cloud : une fois synchronisés, un poste et le cloud ont les
mêmes données ; toute route de lecture doit donc rendre la même réponse des
deux côtés. Un écart signale un calcul qui dépend de la base (SQLite sur le
poste, PostgreSQL en ligne) : arrondi, tri, fonction de texte ou de date...

    python -m tests.outils.parite_routes --poste http://127.0.0.1:47830 \\
        --cloud http://127.0.0.1:8310 --identifiant admin --sortie parite.json

Le mot de passe est lu dans la variable PARITE_MOT_DE_PASSE (jamais en clair
sur la ligne de commande). Le poste est synchronisé avant la comparaison.

Les paramètres des routes (`eleve_id`, `classe_id`...) sont pris dans les
réponses des routes sans paramètre : on appelle d'abord celles-ci, puis on
remplit les autres avec les identifiants rencontrés.
"""
import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import date

import httpx

# Jamais comparées : propres au poste ou au cloud, ou sans réponse de lecture.
PREFIXES_EXCLUS = ("/api/sync/", "/api/poste/", "/api/tasks/", "/docs", "/redoc", "/openapi.json", "/uploads")
# Champs qui varient d'un appel à l'autre par nature (horodatage de la
# réponse, état de la connexion). Tout le reste doit être identique.
CHAMPS_VOLATILS = {"genere_le", "date_generation", "horodatage", "timestamp", "heure_serveur", "maintenant",
                   "derniere_synchronisation", "derniere_synchro", "serveur_heure", "en_ligne", "uptime",
                   "duree_ms", "temps_reponse_ms", "latency_ms",
                   "sync_at"}  # horloge de la base au moment de l'appel (api/eleves.py, delta)
# Routes dont la réponse diffère par nature entre un poste et le cloud. Elles
# sont comparées quand même, et rangées à part avec leur raison.
ECARTS_ATTENDUS = {
    "/api/auth/etablissements-disponibles": "un poste ne porte que son école",
    "/api/parametrage/etablissements": "un poste ne porte que son école",
    "/api/incidents": "incidents techniques propres à chaque appareil (ils remontent au cloud)",
    "/api/monitoring": "état technique de la machine qui répond",
}


def connexion(base: str, identifiant: str, mot_de_passe: str) -> dict:
    rep = httpx.post(f"{base}/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe}, timeout=60)
    rep.raise_for_status()
    return {"Authorization": f"Bearer {rep.json()['token']}"}


def synchroniser_le_poste(poste: str, entetes: dict) -> None:
    httpx.post(f"{poste}/api/poste/synchroniser", headers=entetes, timeout=60)
    for _ in range(120):
        etat = httpx.get(f"{poste}/api/poste/synchronisation", headers=entetes, timeout=60).json()
        if etat.get("statut") == "SYNCHRONISE" and not etat.get("en_attente"):
            return
        time.sleep(1)
    raise SystemExit(f"Le poste ne s'est pas synchronisé : {etat}")


def routes_de_lecture(base: str) -> dict[str, dict]:
    spec = httpx.get(f"{base}/openapi.json", timeout=60).json()
    return {chemin: ops["get"] for chemin, ops in spec["paths"].items()
            if "get" in ops and not chemin.startswith(PREFIXES_EXCLUS)}


def recolter(valeur, reserve: dict) -> None:
    """Note le premier identifiant rencontré pour chaque nom de champ."""
    if isinstance(valeur, dict):
        for cle, v in valeur.items():
            if (cle.endswith("_id") or cle in ("id", "matricule")) and isinstance(v, (int, str)) and v not in ("", None):
                reserve.setdefault(cle, v)
            recolter(v, reserve)
    elif isinstance(valeur, list):
        for element in valeur[:3]:
            recolter(element, reserve)


def remplir(chemin: str, operation: dict, reserve: dict):
    """Chemin et paramètres obligatoires remplis, ou None s'il en manque."""
    manquants = []

    def valeur(nom):
        if nom in reserve:
            return reserve[nom]
        if nom in ("date", "date_presence"):
            return date.today().isoformat()
        if nom == "matricules" and "matricule" in reserve:
            return reserve["matricule"]
        if nom == "employe_id_str" and "enseignant_id" in reserve:
            return f"ENS_{reserve['enseignant_id']}"
        manquants.append(nom)
        return None

    rempli = re.sub(r"\{(\w+)\}", lambda m: str(valeur(m.group(1))), chemin)
    requete = {p["name"]: valeur(p["name"]) for p in operation.get("parameters", [])
               if p["in"] == "query" and p.get("required")}
    return (None, manquants) if manquants else ((rempli, requete), [])


def normaliser(valeur):
    if isinstance(valeur, dict):
        return {k: normaliser(v) for k, v in sorted(valeur.items()) if k not in CHAMPS_VOLATILS}
    if isinstance(valeur, list):
        return [normaliser(v) for v in valeur]
    return valeur


def premier_ecart(a, b, chemin="$"):
    """Le premier endroit où deux réponses diffèrent, lisible."""
    if type(a) is not type(b):
        return chemin, a, b
    if isinstance(a, dict):
        for cle in sorted(set(a) | set(b)):
            if cle not in a or cle not in b:
                return f"{chemin}.{cle}", a.get(cle, "<absent>"), b.get(cle, "<absent>")
            ecart = premier_ecart(a[cle], b[cle], f"{chemin}.{cle}")
            if ecart:
                return ecart
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{chemin}[longueur]", len(a), len(b)
        for i, (x, y) in enumerate(zip(a, b)):
            ecart = premier_ecart(x, y, f"{chemin}[{i}]")
            if ecart:
                return ecart
        return None
    return None if a == b else (chemin, a, b)


def canonique(valeur):
    """Toutes les listes triées : deux réponses qui ne diffèrent que par
    l'ordre de leurs éléments deviennent égales."""
    if isinstance(valeur, dict):
        return {k: canonique(v) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return sorted((canonique(v) for v in valeur), key=lambda v: json.dumps(v, sort_keys=True, default=str))
    return valeur


def nature_et_ecart(a, b):
    """« ordre » si seul l'ordre des éléments diffère ; sinon « arrondi » ou
    « contenu », avec le premier écart RÉEL (sur les formes canoniques)."""
    ca, cb = canonique(a), canonique(b)
    if ca == cb:
        return ("ordre",) + (premier_ecart(a, b) or ("?", None, None))
    ecart = premier_ecart(ca, cb) or ("?", None, None)
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in ecart[1:]) and abs(ecart[1] - ecart[2]) < 1e-6:
        return ("arrondi",) + ecart
    return ("contenu",) + ecart


def texte_du_pdf(contenu: bytes) -> str:
    """Le texte d'un PDF, page par page : deux PDF identiques à l'écran ne le
    sont pas à l'octet près (date de création, identifiant du fichier)."""
    import hashlib
    import io

    from pypdf import PdfReader
    from pypdf.errors import PdfReadError
    try:
        return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(contenu)).pages)
    except PdfReadError:
        # PDF déposé tel quel (emploi du temps, sujet) : le même fichier des
        # deux côtés, à l'octet près.
        return f"pdf illisible, empreinte {hashlib.sha256(contenu).hexdigest()}"


def appeler(base, chemin, requete, entetes):
    rep = httpx.get(f"{base}{chemin}", params=requete, headers=entetes, timeout=120)
    type_contenu = rep.headers.get("content-type", "")
    if "json" in type_contenu:
        try:
            return rep.status_code, normaliser(rep.json())
        except ValueError:
            pass
    if "pdf" in type_contenu and rep.status_code == 200:
        return rep.status_code, {"pdf": texte_du_pdf(rep.content).splitlines()}
    return rep.status_code, f"<{type_contenu or 'sans type'} : {len(rep.content)} octets>"


def main() -> int:
    arguments = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    arguments.add_argument("--poste", required=True)
    arguments.add_argument("--cloud", required=True)
    arguments.add_argument("--identifiant", required=True)
    arguments.add_argument("--sortie", default="parite.json")
    arguments.add_argument("--sans-synchronisation", action="store_true")
    a = arguments.parse_args()
    mot_de_passe = os.environ["PARITE_MOT_DE_PASSE"]

    entetes_poste = connexion(a.poste, a.identifiant, mot_de_passe)
    entetes_cloud = connexion(a.cloud, a.identifiant, mot_de_passe)
    if not a.sans_synchronisation:
        synchroniser_le_poste(a.poste, entetes_poste)

    routes_cloud, routes_poste = routes_de_lecture(a.cloud), routes_de_lecture(a.poste)
    communes = {c: op for c, op in routes_cloud.items() if c in routes_poste}

    # D'abord les routes sans paramètre : elles fournissent les identifiants.
    reserve: dict = {}
    for chemin, operation in communes.items():
        if "{" not in chemin and not any(p.get("required") for p in operation.get("parameters", []) if p["in"] == "query"):
            try:
                rep = httpx.get(f"{a.cloud}{chemin}", headers=entetes_cloud, timeout=120)
                if "json" in rep.headers.get("content-type", ""):
                    recolter(rep.json(), reserve)
            except httpx.HTTPError:
                pass

    resultats = defaultdict(list)
    for chemin, operation in sorted(communes.items()):
        appel, manquants = remplir(chemin, operation, reserve)
        if not appel:
            resultats["non_couvertes"].append({"route": chemin, "manque": manquants})
            continue
        rempli, requete = appel
        statut_p, corps_p = appeler(a.poste, rempli, requete, entetes_poste)
        statut_c, corps_c = appeler(a.cloud, rempli, requete, entetes_cloud)
        if statut_p != statut_c:
            resultats["statuts_differents"].append({"route": rempli, "poste": statut_p, "cloud": statut_c,
                                                    "detail_poste": str(corps_p)[:300], "detail_cloud": str(corps_c)[:300]})
        elif statut_p >= 500:
            resultats["erreurs_des_deux_cotes"].append({"route": rempli, "statut": statut_p})
        elif corps_p == corps_c:
            resultats["identiques"].append(rempli)
        else:
            nature, ou, v_poste, v_cloud = nature_et_ecart(corps_p, corps_c)
            raison = next((r for prefixe, r in ECARTS_ATTENDUS.items() if chemin.startswith(prefixe)), None)
            resultats["ecarts_attendus" if raison else "reponses_differentes"].append({
                "route": rempli, "nature": nature, "endroit": ou, "raison": raison,
                "poste": str(v_poste)[:200], "cloud": str(v_cloud)[:200]})

    with open(a.sortie, "w", encoding="utf-8") as f:
        json.dump({"reserve": {k: reserve[k] for k in sorted(reserve)}, **resultats}, f, ensure_ascii=False, indent=2)
    print(f"{len(communes)} routes de lecture communes au poste et au cloud :")
    for categorie in ("identiques", "reponses_differentes", "ecarts_attendus", "statuts_differents",
                      "erreurs_des_deux_cotes", "non_couvertes"):
        print(f"  {categorie.replace('_', ' ')} : {len(resultats[categorie])}")
    for e in sorted(resultats["reponses_differentes"], key=lambda e: (e["nature"] == "ordre", e["route"])):
        print(f"  ≠ [{e['nature']}] {e['route']} {e['endroit']} : poste {e['poste'][:80]} | cloud {e['cloud'][:80]}")
    for e in resultats["ecarts_attendus"]:
        print(f"  ~ {e['route']} : {e['raison']}")
    for e in resultats["statuts_differents"]:
        print(f"  ≠ statut {e['route']} : poste {e['poste']} | cloud {e['cloud']}")
    return 0 if not (resultats["reponses_differentes"] or resultats["statuts_differents"]) else 1


if __name__ == "__main__":
    sys.exit(main())
