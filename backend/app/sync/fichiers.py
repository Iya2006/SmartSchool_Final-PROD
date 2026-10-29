"""
Fichiers cités par les données synchronisées : photos, logo, cachet,
signature, pièces jointes des devoirs, justificatifs de dépenses, sujets
d'examen...

Les lignes voyagent par la synchronisation ; les fichiers qu'elles citent
(`/uploads/...`) suivent :
- du poste vers le cloud : après chaque lot envoyé, le poste demande au cloud
  ceux qui lui manquent, et n'envoie que ceux-là ;
- du cloud vers le poste : après chaque page reçue, le poste télécharge ceux
  qu'il n'a pas.

Le cloud n'écrase JAMAIS un fichier existant : un poste ne peut que compléter,
pas remplacer (ni la photo d'une autre école, ni un logo). Les fichiers
nouveaux ont des noms uniques (photos.py, devoirs.py...) : rien ne se perd.
"""
import os
from typing import Iterable, Optional

from sqlalchemy import String, Text

from app.sync.perimetre import table

PREFIXE = "/uploads/"
TAILLE_MAX = 20 * 1024 * 1024


def chemin_sur(dossier_fichiers: str, relatif: str) -> Optional[str]:
    """Chemin local du fichier, ou None s'il sortirait du dossier des fichiers
    (« ../../ » glissé dans une donnée)."""
    racine = os.path.realpath(dossier_fichiers)
    cible = os.path.realpath(os.path.join(racine, relatif))
    return cible if cible.startswith(racine + os.sep) else None


def chemins_cites(nom_table: str, donnees: Optional[dict]) -> set[str]:
    """Les fichiers qu'une ligne cite, en chemins relatifs au dossier des
    fichiers (« photos/eleves/a.jpg »). Une adresse complète (https://...)
    désigne un stockage externe : elle ne voyage pas."""
    if not donnees:
        return set()
    t = table(nom_table)
    chemins = set()
    for colonne in t.columns:
        valeur = donnees.get(colonne.name)
        if not isinstance(colonne.type, (String, Text)) or not isinstance(valeur, str):
            continue
        if valeur.startswith(PREFIXE):
            chemins.add(valeur.split("?", 1)[0][len(PREFIXE):])
    # Les sujets d'examen enregistrent le nom seul, rangé dans « sujets/ ».
    if nom_table == "ss_sujets_examen":
        nom = donnees.get("fichier_path")
        if nom and not nom.startswith(("/", "http")):
            chemins.add(f"sujets/{nom}")
    return chemins


def cites_par(changements: Iterable[dict]) -> set[str]:
    chemins = set()
    for changement in changements:
        if changement.get("operation") != "D":
            chemins |= chemins_cites(changement["table"], changement.get("donnees"))
    return chemins


def presents(dossier_fichiers: str, chemins: Iterable[str]) -> list[str]:
    return [c for c in chemins if (cible := chemin_sur(dossier_fichiers, c)) and os.path.isfile(cible)]


def manquants(dossier_fichiers: str, chemins: Iterable[str]) -> list[str]:
    """Les chemins sûrs que ce dossier n'a pas."""
    return [c for c in chemins if (cible := chemin_sur(dossier_fichiers, c)) and not os.path.exists(cible)]


def ecrire(dossier_fichiers: str, relatif: str, contenu: bytes) -> bool:
    """Écrit le fichier s'il n'existe pas déjà. Rend False si le chemin est
    refusé ou le fichier déjà présent : on n'écrase jamais."""
    cible = chemin_sur(dossier_fichiers, relatif)
    if cible is None or os.path.exists(cible) or len(contenu) > TAILLE_MAX:
        return False
    os.makedirs(os.path.dirname(cible), exist_ok=True)
    with open(cible + ".tmp", "wb") as f:
        f.write(contenu)
    os.replace(cible + ".tmp", cible)
    return True
