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
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_etablissement, roles_du_compte
from app.core.database import get_db
from app.core.recu_paiement import cle_signature_appareil
from app.models.academique import Appareil, Etablissement
from app.sync.identifiants import NUMERO_APPAREIL_MAX
from app.sync.instantane import TAILLE_PAGE_DEFAUT, TAILLE_PAGE_MAX, exporter_page, manifeste
from app.sync.perimetre import verifier_toutes_les_tables
from app.sync.schema import schema_identifiants_a_jour

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


def empreinte_jeton(jeton: str) -> str:
    return hashlib.sha256(jeton.encode("utf-8")).hexdigest()


class DemandeAppareil(BaseModel):
    nom: str = Field("", max_length=100, description="Nom de l'ordinateur, pour le reconnaître")


SCHEMA_PAS_PRET = (
    "Le serveur SmartSchool n'est pas encore prêt à accueillir des postes hors-ligne "
    "(mise à jour de sa base en attente). Réessayez plus tard."
)


@router.post("/appareils", status_code=201)
def enregistrer_appareil(
    demande: DemandeAppareil,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(exige_installation_poste),
):
    """Enregistre un nouveau poste de l'école, au début de son installation.

    Le poste reçoit son numéro (sa plage d'identifiants), son rang dans l'école
    (P1, P2... dans ses numéros de pièces), le jeton avec lequel il se
    synchronisera sans utilisateur connecté, et la clé qui signe ses reçus.
    Le jeton n'est montré qu'ici : seule son empreinte est conservée.
    """
    if not schema_identifiants_a_jour(db.get_bind()):
        raise HTTPException(503, SCHEMA_PAS_PRET)

    jeton = secrets.token_urlsafe(32)
    # Deux installations simultanées dans la même école peuvent viser le même
    # rang : la contrainte d'unicité tranche, on reprend avec le suivant.
    for _ in range(3):
        rang = (db.query(func.max(Appareil.rang))
                .filter(Appareil.etablissement_id == etablissement_id).scalar() or 0) + 1
        appareil = Appareil(
            etablissement_id=etablissement_id, rang=rang, nom=(demande.nom or "").strip()[:100] or None,
            jeton_empreinte=empreinte_jeton(jeton),
            enregistre_par=str(current_user.get("nom") or current_user.get("sub") or ""),
        )
        db.add(appareil)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
    else:
        raise HTTPException(409, "Plusieurs postes s'enregistrent en même temps. Réessayez.")

    if appareil.appareil_id > NUMERO_APPAREIL_MAX:
        db.rollback()
        raise HTTPException(503, "Nombre maximal de postes atteint sur ce serveur.")
    db.commit()
    return {
        "appareil_id": appareil.appareil_id,
        "rang": appareil.rang,
        "etablissement_id": etablissement_id,
        "jeton": jeton,
        "cle_signature": cle_signature_appareil(appareil.appareil_id),
    }
