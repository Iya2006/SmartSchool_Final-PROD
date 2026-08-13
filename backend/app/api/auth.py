"""
SMARTSCHOOL API — Authentification Unifiée
Login unique pour tous les rôles : Admin, Enseignant, Parent, Eleve
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import compte_sans_mot_de_passe, verify_password
from app.core.auth import create_access_token, get_current_user
from app.core.rate_limit import limiter, _DEFAULT_LIMIT
from app.models.academique import (
    Eleve, EleveParent, Enseignant, Etablissement, Parent, Utilisateur,
)

router = APIRouter(prefix="/api/auth", tags=["Authentification"])


# Une ecole inscrite depuis le site public est creee EN_ATTENTE : ses comptes
# existent mais ne doivent pas pouvoir entrer tant que la plateforme n'a pas
# valide. Le controle est ici, au login, et non dans chaque route : c'est le
# seul passage obligatoire.
_STATUTS_ECOLE_BLOQUANTS = {
    "EN_ATTENTE": ("Votre etablissement est en cours de validation par SmartSchool. "
                   "Vous recevrez un e-mail des qu'il sera active."),
    "REFUSE": "La demande d'inscription de cet etablissement n'a pas ete retenue.",
    "SUSPENDU": "Cet etablissement est suspendu. Contactez SmartSchool.",
}


def _verifier_etablissement_actif(db: Session, etablissement_id: Optional[int]) -> None:
    """Refuse la connexion si l'ecole n'est pas active.

    `None` = compte plateforme (SUPER_ADMIN), qui n'appartient a aucune ecole :
    rien a verifier. Une ecole introuvable n'est pas bloquante ici — le compte
    serait de toute facon inutilisable, et inventer un message a ce stade
    renseignerait un attaquant sur l'etat de la base.
    """
    if etablissement_id is None:
        return
    ecole = db.query(Etablissement.statut).filter(
        Etablissement.etablissement_id == etablissement_id
    ).first()
    if not ecole:
        return
    message = _STATUTS_ECOLE_BLOQUANTS.get(ecole[0])
    if message:
        raise HTTPException(403, message)



def _etablissement_du_code(db: Session, code: Optional[str]):
    """Ecole designee par son code, ou None si aucun code n'est fourni.

    Le code est celui de `ss_etablissements.code` — genere a l'inscription,
    unique sur la plateforme, et communique par l'ecole a ses enseignants et
    parents. Un code inconnu est refuse tout de suite : le laisser passer
    ferait chercher dans TOUTES les ecoles, c'est-a-dire l'inverse du but.
    """
    if not code or not code.strip():
        return None
    ecole = db.query(Etablissement).filter(
        Etablissement.code == code.strip().upper()
    ).first()
    if not ecole:
        raise HTTPException(404, "Code d'etablissement inconnu. Verifiez auprès de votre école.")
    return ecole


def _exiger_un_seul(comptes: list, quoi: str):
    """Un identifiant doit designer UNE personne.

    Plusieurs ecoles peuvent inscrire le meme numero : la resolution par
    `.first()` en choisirait une au hasard, et l'interesse se connecterait
    tantot a l'une tantot a l'autre sans comprendre. On demande le code plutot
    que de deviner.
    """
    if len(comptes) > 1:
        raise HTTPException(
            409,
            f"Ce {quoi} est utilise dans plusieurs etablissements. "
            "Indiquez le code de votre ecole pour continuer.",
        )
    return comptes[0] if comptes else None


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
    # Code de l'école, saisi UNIQUEMENT quand c'est nécessaire.
    #
    # Un enseignant peut exercer dans plusieurs établissements, un parent avoir
    # des enfants dans plusieurs écoles : une fiche par école, donc le même
    # numéro de téléphone plusieurs fois sur la plateforme. Le code lève
    # l'ambiguïté. Laissé vide quand l'identifiant ne désigne qu'une personne —
    # inutile d'imposer un code aux écoles qui n'en ont pas besoin.
    code_etablissement: Optional[str] = None


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
    # Ecole designee par le code, si l'utilisateur en a saisi un. Refuse tout
    # de suite si le code est inconnu.
    ecole_demandee = _etablissement_du_code(db, data.code_etablissement)

    # 1. Chercher dans Utilisateur
    user = db.query(Utilisateur).filter(
        (Utilisateur.nom_utilisateur == identifiant) |
        (Utilisateur.email == identifiant) |
        (Utilisateur.telephone == identifiant)
    ).first()

    if user:
        if user.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        # Distinguer « pas de mot de passe » de « mauvais mot de passe » :
        # sans ce message, la personne cherche indefiniment un mot qui
        # n'existe pas, et l'ecole conclut a une panne.
        if compte_sans_mot_de_passe(user.mot_de_passe):
            raise HTTPException(403, "Ce compte n'a pas encore de mot de passe. L'administration de l'ecole doit lui en attribuer un.")
        if not verify_password(mot_de_passe, user.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
        _verifier_etablissement_actif(db, user.etablissement_id)

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
    #    Le meme enseignant peut exister dans plusieurs ecoles (une fiche par
    #    ecole). Le code, s'il est fourni, borne la recherche ; sinon on exige
    #    que l'identifiant ne designe qu'une seule personne.
    requete_ens = db.query(Enseignant).filter(
        (Enseignant.telephone == identifiant) |
        (Enseignant.email == identifiant) |
        (Enseignant.matricule == identifiant)
    )
    if ecole_demandee:
        requete_ens = requete_ens.filter(
            Enseignant.etablissement_id == ecole_demandee.etablissement_id
        )
    ens = _exiger_un_seul(requete_ens.all(), "identifiant")

    if ens:
        if ens.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        # Distinguer « pas de mot de passe » de « mauvais mot de passe » :
        # sans ce message, la personne cherche indefiniment un mot qui
        # n'existe pas, et l'ecole conclut a une panne.
        if compte_sans_mot_de_passe(ens.mot_de_passe):
            raise HTTPException(403, "Ce compte n'a pas encore de mot de passe. L'administration de l'ecole doit lui en attribuer un.")
        if not verify_password(mot_de_passe, ens.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
        _verifier_etablissement_actif(db, ens.etablissement_id)
            
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
    #    Un parent a une fiche par ecole ou l'un de ses enfants est scolarise.
    #    Meme regle que pour l'enseignant : le code borne la recherche, sinon
    #    l'identifiant doit ne designer qu'une seule personne.
    requete_parent = db.query(Parent).filter(
        (Parent.telephone_1 == identifiant) |
        (Parent.email == identifiant)
    )
    if ecole_demandee:
        requete_parent = requete_parent.filter(
            Parent.etablissement_id == ecole_demandee.etablissement_id
        )
    parent = _exiger_un_seul(requete_parent.all(), "identifiant")

    if parent:
        if parent.statut != "ACTIF":
            raise HTTPException(403, "Ce compte est désactivé")
        # Distinguer « pas de mot de passe » de « mauvais mot de passe » :
        # sans ce message, la personne cherche indefiniment un mot qui
        # n'existe pas, et l'ecole conclut a une panne.
        if compte_sans_mot_de_passe(parent.mot_de_passe):
            raise HTTPException(403, "Ce compte n'a pas encore de mot de passe. L'administration de l'ecole doit lui en attribuer un.")
        if not verify_password(mot_de_passe, parent.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
        _verifier_etablissement_actif(db, parent.etablissement_id)
            
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
            # La fiche porte son ecole : plus de deduction par les enfants, qui
            # renvoyait None des que le parent en avait dans plusieurs ecoles.
            "etablissement_id": parent.etablissement_id,
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
        # Distinguer « pas de mot de passe » de « mauvais mot de passe » :
        # sans ce message, la personne cherche indefiniment un mot qui
        # n'existe pas, et l'ecole conclut a une panne.
        if compte_sans_mot_de_passe(eleve.mot_de_passe):
            raise HTTPException(403, "Ce compte n'a pas encore de mot de passe. L'administration de l'ecole doit lui en attribuer un.")
        if not verify_password(mot_de_passe, eleve.mot_de_passe):
            raise HTTPException(401, "Identifiant ou mot de passe incorrect")
        _verifier_etablissement_actif(db, eleve.etablissement_id)
            
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


# ════════════════════════════════════════════════════════════
# ÉTABLISSEMENT ACTIF D'UN ADMINISTRATEUR PLATEFORME
# ════════════════════════════════════════════════════════════

class EtablissementActifRequest(BaseModel):
    etablissement_id: int


@router.get("/etablissements-disponibles")
def lister_etablissements_disponibles(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Écoles dans lesquelles un administrateur plateforme peut entrer.

    Réservée au SUPER_ADMIN : c'est le seul compte qui n'est rattaché à aucune
    école et qui a vocation à en changer.
    """
    if current_user.get("role") != "SUPER_ADMIN":
        raise HTTPException(403, "Réservé aux administrateurs de la plateforme")

    from app.models.academique import Etablissement

    etablissements = db.query(Etablissement).order_by(Etablissement.nom).all()
    return {
        "etablissement_actif": current_user.get("etablissement_id"),
        "etablissements": [
            {
                "etablissement_id": e.etablissement_id,
                "code": e.code,
                "nom": e.nom,
                "ville": e.ville,
                "statut": e.statut,
            }
            for e in etablissements
        ],
    }


@router.post("/etablissement-actif")
def choisir_etablissement_actif(
    data: EtablissementActifRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Délivre un nouveau jeton portant l'établissement choisi.

    Un SUPER_ADMIN n'est rattaché à aucune école : `require_etablissement` le
    refuse donc partout, volontairement — `None` ne doit jamais valoir « accès
    à tout ». Sans cette route, la plateforme devenait inexploitable : son
    administrateur pouvait créer une école mais pas y entrer, ni lui créer un
    administrateur.

    Le choix est ici **explicite, vérifié côté serveur et matérialisé par un
    nouveau jeton** — jamais un `etablissement_id` glissé dans une requête
    métier, qui est précisément le motif supprimé partout ailleurs. Le jeton
    porte `agit_pour_etablissement` pour que ce contexte reste identifiable.
    """
    if current_user.get("role") != "SUPER_ADMIN":
        raise HTTPException(403, "Réservé aux administrateurs de la plateforme")

    from app.models.academique import Etablissement

    etablissement = db.query(Etablissement).filter(
        Etablissement.etablissement_id == data.etablissement_id
    ).first()
    if not etablissement:
        raise HTTPException(404, "Établissement introuvable")

    token_data = {
        "sub": current_user.get("sub"),
        "nom": current_user.get("nom"),
        "prenom": current_user.get("prenom"),
        "role": "SUPER_ADMIN",
        "type": "admin",
        "etablissement_id": etablissement.etablissement_id,
        "roles_secondaires": current_user.get("roles_secondaires") or [],
        # Trace explicite : ce compte n'appartient pas à cette école, il y agit.
        "agit_pour_etablissement": True,
    }
    return {
        "token": create_access_token(token_data),
        "etablissement": {
            "etablissement_id": etablissement.etablissement_id,
            "code": etablissement.code,
            "nom": etablissement.nom,
        },
        "message": f"Vous travaillez désormais dans : {etablissement.nom}",
    }
