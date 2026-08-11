"""
SMARTSCHOOL API — Authentification Unifiée
Login unique pour tous les rôles : Admin, Enseignant, Parent, Eleve
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import verify_password
from app.core.auth import create_access_token, get_current_user
from app.core.rate_limit import limiter, _DEFAULT_LIMIT
from app.models.academique import Utilisateur, Enseignant, Parent, Eleve, EleveParent

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


def _derive_parent_etablissement(db: Session, parent_id: int) -> Optional[int]:
    """Détermine l'établissement unique d'un parent via ses enfants réels.

    Ne choisit JAMAIS arbitrairement (pas de `.first()`) : retourne None si le
    parent n'a aucun enfant rattaché, ou si ses enfants sont répartis dans
    plusieurs établissements différents (cas multi-écoles — voir portail
    parent, qui vérifie l'ownership via EleveParent sur chaque route plutôt
    que de se fier à un seul etablissement_id scalaire dans ce cas).
    """
    lignes = (
        db.query(Eleve.etablissement_id)
        .join(EleveParent, EleveParent.eleve_id == Eleve.eleve_id)
        .filter(EleveParent.parent_id == parent_id)
        .distinct()
        .all()
    )
    etablissements = {etab_id for (etab_id,) in lignes if etab_id is not None}
    if len(etablissements) == 1:
        return etablissements.pop()
    return None

# ── Schémas ──
class LoginRequest(BaseModel):
    identifiant: str  # nom_utilisateur, email, telephone, ou matricule
    mot_de_passe: str

class LoginResponse(BaseModel):
    token: str
    user: dict

# ════════════════════════════════════════════════════════════
# LOGIN UNIFIÉ — Rate limited: 5 tentatives/minute max
# ════════════════════════════════════════════════════════════
@router.post("/login", response_model=LoginResponse)
@limiter.limit(_DEFAULT_LIMIT)
def unified_login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    """
    Connexion unifiée. Cherche l'utilisateur dans l'ordre :
    1. Utilisateur (admin, fondateur, etc.)
    2. Enseignant
    3. Parent
    4. Eleve
    """
    identifiant = data.identifiant.strip()
    mot_de_passe = data.mot_de_passe

    # 1. Chercher dans Utilisateur
    user = db.query(Utilisateur).filter(
        (Utilisateur.nom_utilisateur == identifiant) |
        (Utilisateur.email == identifiant) |
        (Utilisateur.telephone == identifiant)
    ).first()

    if user:
        if user.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        if not verify_password(mot_de_passe, user.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
        
        token_data = {
            "sub": str(user.utilisateur_id),
            "nom": user.nom,
            "prenom": user.prenom,
            "role": user.role,
            "type": "admin",
            # None = SUPER_ADMIN plateforme (compte non rattaché à une école
            # précise, capacité multi-écoles explicite) — jamais "sans filtre"
            # par accident, voir get_current_establishment/require_etablissement.
            "etablissement_id": user.etablissement_id,
            # Cumul de responsabilités saisi dans l'assistant Personnel. Porté
            # par le token pour éviter une requête à chaque appel ; un token
            # émis avant ce champ vaut liste vide (ancien comportement).
            "roles_secondaires": user.roles_secondaires or [],
        }
        return {
            "token": create_access_token(token_data),
            "user": {
                "id": user.utilisateur_id,
                "nom": user.nom,
                "prenom": user.prenom,
                "nom_utilisateur": user.nom_utilisateur,
                "email": user.email,
                "telephone": user.telephone,
                "role": user.role,
                # Repris de token_data : la réponse et le JWT portent forcément
                # la même valeur. Le frontend en a besoin pour afficher la bonne
                # identité d'école (il était figé sur l'établissement 1).
                "etablissement_id": token_data["etablissement_id"],
            }
        }

    # 2. Chercher dans Enseignant
    ens = db.query(Enseignant).filter(
        (Enseignant.telephone == identifiant) |
        (Enseignant.email == identifiant) |
        (Enseignant.matricule == identifiant)
    ).first()

    if ens:
        if ens.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        if not verify_password(mot_de_passe, ens.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
            
        token_data = {
            "sub": str(ens.enseignant_id),
            "nom": ens.nom,
            "prenom": ens.prenom,
            "role": "ENSEIGNANT",
            "type": "enseignant",
            "etablissement_id": ens.etablissement_id,
        }
        return {
            "token": create_access_token(token_data),
            "user": {
                "id": ens.enseignant_id,
                "nom": ens.nom,
                "prenom": ens.prenom,
                "nom_utilisateur": ens.matricule,
                "email": ens.email,
                "telephone": ens.telephone,
                "role": "ENSEIGNANT",
                "etablissement_id": token_data["etablissement_id"],
            }
        }

    # 3. Chercher dans Parent
    parent = db.query(Parent).filter(
        (Parent.telephone_1 == identifiant) |
        (Parent.email == identifiant)
    ).first()

    if parent:
        if parent.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        if not verify_password(mot_de_passe, parent.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
            
        token_data = {
            "sub": str(parent.parent_id),
            "nom": parent.nom,
            "prenom": parent.prenom,
            "role": "PARENT",
            "type": "parent",
            # None = enfants dans 0 ou plusieurs établissements (jamais choisi
            # arbitrairement) — voir _derive_parent_etablissement. Les routes
            # du portail parent vérifient l'ownership via EleveParent, pas ce
            # champ seul, donc None ici ne restreint ni n'élargit leur accès.
            "etablissement_id": _derive_parent_etablissement(db, parent.parent_id),
        }
        return {
            "token": create_access_token(token_data),
            "user": {
                "id": parent.parent_id,
                "nom": parent.nom,
                "prenom": parent.prenom,
                "nom_utilisateur": parent.telephone_1,
                "email": parent.email,
                "telephone": parent.telephone_1,
                "role": "PARENT",
                # Peut valoir None : parent sans enfant, ou enfants répartis
                # dans plusieurs écoles (jamais choisi arbitrairement).
                "etablissement_id": token_data["etablissement_id"],
            }
        }

    # 4. Chercher dans Eleve
    eleve = db.query(Eleve).filter(
        (Eleve.matricule == identifiant)
    ).first()

    if eleve:
        if eleve.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        if not verify_password(mot_de_passe, eleve.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
            
        token_data = {
            "sub": str(eleve.eleve_id),
            "nom": eleve.nom,
            "prenom": eleve.prenom,
            "role": "ELEVE",
            "type": "eleve",
            "etablissement_id": eleve.etablissement_id,
        }
        return {
            "token": create_access_token(token_data),
            "user": {
                "id": eleve.eleve_id,
                "nom": eleve.nom,
                "prenom": eleve.prenom,
                "nom_utilisateur": eleve.matricule,
                "email": "",
                "telephone": "",
                "role": "ELEVE",
                "etablissement_id": token_data["etablissement_id"],
            }
        }

    raise HTTPException(401, "Identifiant ou mot de passe incorrect")

# ════════════════════════════════════════════════════════════
# PROFIL (route protégée)
# ════════════════════════════════════════════════════════════
@router.get("/me")
def get_my_profile(current_user: dict = Depends(get_current_user)):
    """Retourne le profil de l'utilisateur connecté."""
    return {
        "id": current_user.get("sub"),
        "nom": current_user.get("nom"),
        "prenom": current_user.get("prenom"),
        "role": current_user.get("role", "admin"),
        "type": current_user.get("type", "admin"),
        "etablissement_id": current_user.get("etablissement_id"),
    }
