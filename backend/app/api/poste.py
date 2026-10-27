"""
SMARTSCHOOL API — Installation d'un poste local (offline-first).

Un poste (ordinateur de l'école) reçoit, une fois, toutes les données de son
établissement, puis travaille sur sa base locale, avec ou sans internet.

Seule la direction peut installer un poste : il reçoit TOUTE l'école,
comptabilité comprise. Le directeur de niveau, qui n'a pas la caisse, ne le
peut donc pas ; le DG seulement si le fondateur lui a ouvert la comptabilité
(même règle que le tableau de bord). Une fois le poste installé, chaque
utilisateur s'y connecte avec ses propres droits, appliqués par le moteur local
exactement comme en ligne.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_etablissement, roles_du_compte
from app.core.database import get_db
from app.models.academique import Etablissement
from app.sync.instantane import TAILLE_PAGE_DEFAUT, TAILLE_PAGE_MAX, exporter_page, manifeste
from app.sync.perimetre import verifier_toutes_les_tables

router = APIRouter(prefix="/api/poste", tags=["Poste local (hors-ligne)"])

_DIRECTION_COMPLETE = {"SUPER_ADMIN", "ADMIN", "FONDATEUR"}


def exige_installation_poste(current_user: dict = Depends(get_current_user)) -> dict:
    roles = roles_du_compte(current_user)
    if roles & _DIRECTION_COMPLETE:
        return current_user
    if "DG" in roles and (current_user.get("acces_comptabilite") or "O") == "O":
        return current_user
    raise HTTPException(403, "Seule la direction peut installer un poste (il contient toute l'école).")


@router.get("/instantane", dependencies=[Depends(exige_installation_poste)])
def instantane(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Ce que le poste va recevoir : les tables, dans l'ordre d'import, et leur
    nombre de lignes (pour afficher la progression)."""
    etab = db.get(Etablissement, etablissement_id)
    if not etab:
        raise HTTPException(404, "Établissement introuvable")
    return {
        "etablissement_id": etablissement_id,
        "etablissement_nom": etab.nom,
        "genere_le": datetime.now(timezone.utc).isoformat(),
        "tables": manifeste(db, etablissement_id),
    }


@router.get("/instantane/{nom_table}", dependencies=[Depends(exige_installation_poste)])
def instantane_table(
    nom_table: str,
    apres: Optional[int] = Query(None, description="Dernière clé reçue (reprise)"),
    limite: int = Query(TAILLE_PAGE_DEFAUT, ge=1, le=TAILLE_PAGE_MAX),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if nom_table not in verifier_toutes_les_tables():
        raise HTTPException(404, "Table inconnue")
    return exporter_page(db, etablissement_id, nom_table, apres=apres, limite=limite)
