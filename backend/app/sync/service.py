"""
Service de synchronisation d'un poste : tourne en arrière-plan dans le moteur
local, sans qu'aucun utilisateur ait besoin d'être connecté.

Un cycle : envoyer tout ce qui attend (lot après lot), puis recevoir tout ce
qui a changé (page après page). Toutes les 30 secondes quand le cloud
répond ; hors-ligne, les tentatives s'espacent jusqu'à 5 minutes, et le
poste continue de fonctionner normalement. Un cycle peut aussi être demandé
tout de suite (bouton « Synchroniser »).

L'état est lisible à tout moment par l'interface : synchronisé, en cours,
hors ligne depuis..., N changements en attente, date du dernier échange.
"""
import logging
import threading
from datetime import datetime, timezone
from typing import Callable, Optional

import httpx
from sqlalchemy.engine import Engine

from app.sync.cote_poste import (
    a_verifier, accuser, appliquer_changements, changements_en_attente, construire_lot, curseur, mis_de_cote,
    noter_a_verifier,
)
from app.sync.fichiers import chemin_sur, cites_par, ecrire, manquants, presents

_journal = logging.getLogger("smartschool.synchronisation")

INTERVALLE = 30
ATTENTE_MAX = 300


class AppareilRefuse(Exception):
    """Le cloud ne reconnaît plus ce poste (retiré par la direction)."""


def _maintenant() -> str:
    return datetime.now(timezone.utc).isoformat()


class Synchroniseur:
    def __init__(self, moteur: Engine, jeton: Callable[[], Optional[str]], cloud_url: str,
                 dossier_fichiers: Optional[str] = None):
        self.moteur = moteur
        self._jeton = jeton
        self.cloud_url = cloud_url
        # Photos, logos, documents cités par les données : ils suivent.
        self.dossier_fichiers = dossier_fichiers
        self._verrou = threading.Lock()
        self._reveil = threading.Event()
        self._fil: Optional[threading.Thread] = None
        self.statut = "INACTIF"  # INACTIF, EN_COURS, SYNCHRONISE, HORS_LIGNE, REFUSE, ERREUR
        self.derniere_reussite: Optional[str] = None
        self.hors_ligne_depuis: Optional[str] = None
        self.erreur: Optional[str] = None
        self.envoyes = self.recus = 0

    # ── Un cycle ──────────────────────────────────────────────────────────

    def cycle(self, client: httpx.Client) -> None:
        """Envoie puis reçoit. Lève httpx.TransportError si le cloud ne répond pas."""
        jeton = self._jeton()
        if not jeton:
            return
        entetes = {"Authorization": f"Appareil {jeton}"}
        with self._verrou:
            self.statut = "EN_COURS"
            envoyes = recus = 0
            while True:
                changements, jusqu_a = construire_lot(self.moteur)
                if not changements:
                    break
                rep = client.post("/api/sync/appareil/envoi", json={"changements": changements}, headers=entetes)
                self._controler(rep)
                accuser(self.moteur, jusqu_a, rep.json()["refus"])
                self._envoyer_les_fichiers(client, entetes, changements)
                envoyes += len(changements)
            while True:
                rep = client.get("/api/sync/appareil/reception", params={"depuis": curseur(self.moteur)},
                                 headers=entetes)
                self._controler(rep)
                page = rep.json()
                recus += appliquer_changements(self.moteur, page)
                self._recevoir_les_fichiers(client, page["changements"])
                if not page["suivant"]:
                    noter_a_verifier(self.moteur, page.get("a_verifier", 0))
                    break
            self.envoyes, self.recus = envoyes, recus
            self.statut, self.erreur, self.hors_ligne_depuis = "SYNCHRONISE", None, None
            self.derniere_reussite = _maintenant()

    def _envoyer_les_fichiers(self, client: httpx.Client, entetes: dict, changements: list[dict]) -> None:
        if not self.dossier_fichiers:
            return
        locaux = presents(self.dossier_fichiers, cites_par(changements))
        if not locaux:
            return
        rep = client.post("/api/sync/appareil/fichiers/manquants", json={"chemins": locaux}, headers=entetes)
        self._controler(rep)
        for relatif in rep.json()["manquants"]:
            with open(chemin_sur(self.dossier_fichiers, relatif), "rb") as f:
                envoi = client.post("/api/sync/appareil/fichiers", headers=entetes,
                                    data={"chemin": relatif}, files={"fichier": (relatif.rsplit("/", 1)[-1], f)})
            self._controler(envoi)

    def _recevoir_les_fichiers(self, client: httpx.Client, changements: list[dict]) -> None:
        if not self.dossier_fichiers:
            return
        for relatif in manquants(self.dossier_fichiers, cites_par(changements)):
            rep = client.get(f"/uploads/{relatif}")
            # Un fichier cité mais absent du cloud (ancien, supprimé) ne bloque
            # pas la synchronisation : la donnée, elle, est arrivée.
            if rep.status_code == 200:
                ecrire(self.dossier_fichiers, relatif, rep.content)

    @staticmethod
    def _controler(rep: httpx.Response) -> None:
        if rep.status_code in (401, 403):
            raise AppareilRefuse(rep.json().get("detail") or "Poste non reconnu par le serveur.")
        rep.raise_for_status()

    # ── En arrière-plan ───────────────────────────────────────────────────

    def etat(self) -> dict:
        return {
            "statut": self.statut,
            "en_attente": changements_en_attente(self.moteur),
            # Refusé par le cloud ou impossible à appliquer ici.
            "mis_de_cote": mis_de_cote(self.moteur),
            # Ce que le cloud a gardé de côté pour la direction, toute l'école
            # confondue (connu au dernier échange).
            "a_verifier": a_verifier(self.moteur),
            "derniere_reussite": self.derniere_reussite,
            "hors_ligne_depuis": self.hors_ligne_depuis,
            "erreur": self.erreur,
        }

    def synchroniser_maintenant(self) -> None:
        self._reveil.set()

    def demarrer(self) -> None:
        if self._fil is None:
            self._fil = threading.Thread(target=self._boucle, daemon=True, name="synchronisation")
            self._fil.start()

    def _boucle(self) -> None:
        attente = 1
        while True:
            self._reveil.wait(attente)
            self._reveil.clear()
            try:
                with httpx.Client(base_url=self.cloud_url, timeout=60) as client:
                    self.cycle(client)
                attente = INTERVALLE
            except httpx.TransportError:
                if self.statut != "HORS_LIGNE":
                    self.hors_ligne_depuis = _maintenant()
                self.statut, self.erreur = "HORS_LIGNE", None
                attente = min(ATTENTE_MAX, max(INTERVALLE, attente * 2))
            except AppareilRefuse as refus:
                self.statut, self.erreur = "REFUSE", str(refus)
                attente = ATTENTE_MAX
            except Exception:  # noqa: BLE001 — le poste continue de fonctionner
                _journal.exception("Synchronisation : échec inattendu")
                self.statut = "ERREUR"
                self.erreur = "La synchronisation a rencontré un problème. Elle sera retentée."
                attente = ATTENTE_MAX
