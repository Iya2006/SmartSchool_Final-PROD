"""
Installation d'un poste local : télécharge tout l'établissement depuis le
cloud dans la base locale. Ensuite, le poste travaille seul, avec ou sans
internet, et chacun s'y connecte avec ses identifiants habituels (les comptes
et leurs mots de passe hachés font partie du téléchargement).

Seule la direction peut installer un poste (voir app/api/poste.py, côté cloud).

Le téléchargement se fait table par table, page par page. Une coupure réseau
déclenche quelques nouvelles tentatives ; si elle dure, l'installation
s'arrête avec un message clair et reprend plus tard là où elle s'était
arrêtée (une page déjà importée n'est jamais dupliquée). Le poste n'est
déclaré « installé » qu'à la toute fin, par un marqueur écrit après le
dernier import : un téléchargement interrompu ne passe jamais pour complet.
"""
import json
import logging
import os
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import String, Text, select
from sqlalchemy.engine import Engine

from app.sync.instantane import importer_page
from app.sync.perimetre import table, verifier_toutes_les_tables

_journal = logging.getLogger("smartschool.poste")

FICHIER_MARQUEUR = "poste.json"

# Pause entre deux tentatives réseau (les tests la neutralisent).
_pause = time.sleep
TAILLE_PAGE = 2000
TENTATIVES = 4


class ErreurInstallation(Exception):
    """Échec dit en français, pour l'écran d'installation."""


@dataclass
class Progression:
    statut: str = "NON_INSTALLE"  # NON_INSTALLE, EN_COURS, INSTALLE, ECHEC
    etablissement_nom: Optional[str] = None
    tables_faites: int = 0
    tables_total: int = 0
    lignes_faites: int = 0
    lignes_total: int = 0
    fichiers_faits: int = 0
    fichiers_total: int = 0
    erreur: Optional[str] = None


def lire_marqueur(dossier_poste: str) -> Optional[dict]:
    try:
        with open(os.path.join(dossier_poste, FICHIER_MARQUEUR), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _ecrire_marqueur(dossier_poste: str, contenu: dict) -> None:
    os.makedirs(dossier_poste, exist_ok=True)
    chemin = os.path.join(dossier_poste, FICHIER_MARQUEUR)
    provisoire = chemin + ".tmp"
    with open(provisoire, "w", encoding="utf-8") as f:
        json.dump(contenu, f, ensure_ascii=False, indent=2)
    os.replace(provisoire, chemin)


def _requete(appel, *args, **kwargs) -> httpx.Response:
    """Appel au cloud avec nouvelles tentatives sur coupure réseau."""
    for essai in range(TENTATIVES):
        try:
            return appel(*args, **kwargs)
        except httpx.TransportError:
            if essai == TENTATIVES - 1:
                raise ErreurInstallation(
                    "Pas de connexion internet stable : l'installation reprendra là où elle "
                    "s'est arrêtée dès que vous relancerez."
                )
            _pause(2 ** essai)
    raise AssertionError("inatteignable")


def fichiers_references(moteur_local: Engine) -> list[str]:
    """Fichiers cités par la base locale, en chemins relatifs au dossier des
    fichiers (`photos/eleves/a.jpg`). Les modules enregistrent `/uploads/...`,
    sauf les sujets d'examen (nom seul, rangé dans `sujets/`). Une adresse
    complète (https://…) désigne un stockage externe : elle n'est pas copiée."""
    chemins: set[str] = set()
    with moteur_local.connect() as cx:
        for nom in verifier_toutes_les_tables():
            t = table(nom)
            for colonne in t.columns:
                if not isinstance(colonne.type, (String, Text)):
                    continue
                for (valeur,) in cx.execute(select(colonne).where(colonne.like("/uploads/%")).distinct()):
                    chemins.add(valeur.split("?", 1)[0][len("/uploads/"):])
        sujets = table("ss_sujets_examen").c.fichier_path
        for (valeur,) in cx.execute(select(sujets).where(sujets.isnot(None)).distinct()):
            if valeur and not valeur.startswith(("/", "http")):
                chemins.add(f"sujets/{valeur}")
    return sorted(chemins)


def _chemin_sur(dossier_fichiers: str, relatif: str) -> Optional[str]:
    """Chemin local du fichier, ou None s'il sortirait du dossier des fichiers."""
    racine = os.path.realpath(dossier_fichiers)
    cible = os.path.realpath(os.path.join(racine, relatif))
    return cible if cible.startswith(racine + os.sep) else None


def _telecharger_fichiers(client: httpx.Client, moteur_local: Engine, dossier_fichiers: str,
                          progression: Progression) -> None:
    chemins = fichiers_references(moteur_local)
    progression.fichiers_total, progression.fichiers_faits = len(chemins), 0
    for relatif in chemins:
        cible = _chemin_sur(dossier_fichiers, relatif)
        if cible and not os.path.exists(cible):
            rep = _requete(client.get, f"/uploads/{relatif}")
            # Un fichier cité mais absent du serveur (supprimé, ancien
            # déploiement) ne doit pas bloquer l'installation de toute l'école.
            if rep.status_code == 200:
                os.makedirs(os.path.dirname(cible), exist_ok=True)
                with open(cible + ".tmp", "wb") as f:
                    f.write(rep.content)
                os.replace(cible + ".tmp", cible)
        progression.fichiers_faits += 1


def installer(
    identifiant: str,
    mot_de_passe: str,
    *,
    client: httpx.Client,
    moteur_local: Engine,
    dossier_poste: str,
    progression: Progression,
    dossier_fichiers: Optional[str] = None,
) -> None:
    """Télécharge l'établissement du compte `identifiant` dans `moteur_local`.

    `client` pointe sur le cloud (httpx.Client avec base_url). Met à jour
    `progression` au fil de l'eau ; lève ErreurInstallation en cas d'échec."""
    progression.statut, progression.erreur = "EN_COURS", None

    rep = _requete(client.post, "/api/auth/login", json={"identifiant": identifiant, "mot_de_passe": mot_de_passe})
    if rep.status_code in (400, 401, 403, 404):
        raise ErreurInstallation("Identifiant ou mot de passe incorrect.")
    if rep.status_code >= 400:
        raise ErreurInstallation("Le serveur SmartSchool ne répond pas correctement. Réessayez dans un instant.")
    entetes = {"Authorization": f"Bearer {rep.json()['token']}"}

    rep = _requete(client.get, "/api/poste/instantane", headers=entetes)
    if rep.status_code == 403:
        raise ErreurInstallation(
            "Ce compte ne peut pas installer un poste : il faut un compte de direction "
            "(fondateur ou administrateur), car le poste reçoit toute l'école."
        )
    if rep.status_code >= 400:
        raise ErreurInstallation("Impossible de préparer l'installation sur le serveur. Réessayez dans un instant.")
    manifeste = rep.json()
    progression.etablissement_nom = manifeste["etablissement_nom"]
    progression.tables_total = len(manifeste["tables"])
    progression.lignes_total = sum(t["total"] for t in manifeste["tables"])
    progression.tables_faites = progression.lignes_faites = 0

    for entree in manifeste["tables"]:
        nom, apres = entree["table"], None
        while True:
            params = {"limite": TAILLE_PAGE}
            if apres is not None:
                params["apres"] = apres
            rep = _requete(client.get, f"/api/poste/instantane/{nom}", headers=entetes, params=params)
            if rep.status_code >= 400:
                raise ErreurInstallation(f"Téléchargement interrompu par le serveur ({nom}). Relancez l'installation.")
            page = rep.json()
            with moteur_local.begin() as cx:
                progression.lignes_faites += importer_page(cx, nom, page["lignes"])
            if page["suivant"] is None:
                break
            apres = page["suivant"]
        progression.tables_faites += 1

    if dossier_fichiers:
        _telecharger_fichiers(client, moteur_local, dossier_fichiers, progression)

    _ecrire_marqueur(dossier_poste, {
        "etablissement_id": manifeste["etablissement_id"],
        "etablissement_nom": manifeste["etablissement_nom"],
        "installe_le": datetime.now(timezone.utc).isoformat(),
        "instantane_du": manifeste["genere_le"],
    })
    progression.statut = "INSTALLE"


class Installateur:
    """Une seule installation à la fois, en arrière-plan, suivie par l'écran."""

    def __init__(self, dossier_poste: str, cloud_url: str, moteur_local: Engine,
                 dossier_fichiers: Optional[str] = None):
        self.dossier_poste = dossier_poste
        self.cloud_url = cloud_url
        self.moteur_local = moteur_local
        self.dossier_fichiers = dossier_fichiers
        self.progression = Progression()
        self._verrou = threading.Lock()
        marqueur = lire_marqueur(dossier_poste)
        if marqueur:
            self.progression.statut = "INSTALLE"
            self.progression.etablissement_nom = marqueur.get("etablissement_nom")

    def etat(self) -> dict:
        return asdict(self.progression)

    def demarrer(self, identifiant: str, mot_de_passe: str, client: Optional[httpx.Client] = None) -> bool:
        """Lance l'installation. Rend False si le poste est déjà installé ou
        si une installation est déjà en cours."""
        with self._verrou:
            if self.progression.statut in ("INSTALLE", "EN_COURS"):
                return False
            self.progression.statut = "EN_COURS"
        fil = threading.Thread(
            target=self._executer, args=(identifiant, mot_de_passe, client), daemon=True, name="installation-poste",
        )
        fil.start()
        return True

    def _executer(self, identifiant: str, mot_de_passe: str, client: Optional[httpx.Client]) -> None:
        propre = client is None
        if propre:
            client = httpx.Client(base_url=self.cloud_url, timeout=60)
        try:
            installer(identifiant, mot_de_passe, client=client, moteur_local=self.moteur_local,
                      dossier_poste=self.dossier_poste, progression=self.progression,
                      dossier_fichiers=self.dossier_fichiers)
        except ErreurInstallation as exc:
            self.progression.statut, self.progression.erreur = "ECHEC", str(exc)
        except Exception:  # noqa: BLE001 — jamais de trace technique à l'écran
            _journal.exception("Installation du poste : échec inattendu")
            self.progression.statut = "ECHEC"
            self.progression.erreur = "L'installation a rencontré un problème inattendu. Relancez-la."
        finally:
            if propre:
                client.close()
