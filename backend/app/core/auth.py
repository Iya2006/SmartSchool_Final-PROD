"""
SMARTSCHOOL — Module d'authentification JWT
Génération et validation de tokens pour l'accès admin.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.secrets import read_secret

# Charger le .env depuis le dossier backend
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

# Clé secrète — depuis backend/.env (JWT_SECRET_KEY) ou un Docker Secret
# (JWT_SECRET_KEY_FILE, ex: /run/secrets/jwt_secret en production)
SECRET_KEY = read_secret("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("⚠️  JWT_SECRET_KEY manquante ! Configurez-la dans backend/.env (ou JWT_SECRET_KEY_FILE en prod)")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crée un token JWT avec les données fournies."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Décode et valide un token JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expiré, veuillez vous reconnecter",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Dependency FastAPI: retourne les données de l'utilisateur connecté."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


async def get_current_user_optionnel(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """Comme get_current_user, mais ne refuse pas les appels anonymes.

    Reservee aux rares routes volontairement publiques (page de login, portails
    avant authentification) qui doivent servir un contenu reduit a un visiteur
    anonyme, et le contenu complet de SON etablissement a un compte connecte.

    Un token absent, expire ou invalide donne None : sur une route publique, un
    token pourri ne doit pas transformer une consultation anonyme legitime en
    401. Le refus d'un token invalide reste le role de get_current_user sur les
    routes protegees.
    """
    if credentials is None:
        return None
    try:
        return decode_token(credentials.credentials)
    except HTTPException:
        return None


def etablissement_optionnel(
    current_user: Optional[dict] = Depends(get_current_user_optionnel),
) -> Optional[int]:
    """Etablissement du compte connecte s'il y en a un, sinon None.

    None signifie ici "appelant anonyme ou sans etablissement determine", et
    JAMAIS "aucune restriction" : l'appelant doit traiter ce cas explicitement.
    """
    if not current_user:
        return None
    return current_user.get("etablissement_id")


def get_current_establishment(current_user: dict = Depends(get_current_user)) -> Optional[int]:
    """Etablissement du compte connecte, tel que derive au login (jamais fourni par le client).

    None peut signifier deux choses distinctes selon le type de compte
    (voir current_user["type"]) - ce n'est JAMAIS "aucune restriction" :
    - type == "admin" : SUPER_ADMIN plateforme (pas de tenant unique, capacite
      multi-ecoles explicite - voir require_roles/logique dediee, pas ce helper).
    - type == "parent" : le parent n'a pas un unique etablissement determinable
      (aucun enfant, ou enfants dans plusieurs ecoles) - les routes du portail
      parent doivent alors verifier l'ownership via EleveParent, pas ce champ.
    - Tokens emis avant l'ajout de ce champ (transition) : traites comme None.
    """
    return current_user.get("etablissement_id")


def require_etablissement(current_user: dict = Depends(get_current_user)) -> int:
    """Comme get_current_establishment, mais exige un etablissement concret.

    A utiliser sur les routes "tenant" qui doivent imperativement filtrer par
    ecole. Refuse explicitement l'acces (403) si le compte n'a pas
    d'etablissement determine, plutot que de retomber silencieusement sur une
    valeur par defaut (ex. etablissement_id=1) ou sur "pas de filtre".

    Un SUPER_ADMIN plateforme (etablissement_id=None) est lui aussi refuse par
    cette dependency : agir "au nom" d'une ecole precise pour un compte
    plateforme est un besoin distinct, hors perimetre de ce chantier.
    """
    etablissement_id = current_user.get("etablissement_id")
    if etablissement_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Etablissement non determine pour ce compte : reconnectez-vous, ou contactez un administrateur si le probleme persiste",
        )
    return etablissement_id


# Controle d'acces par role (RBAC)
# Roles "admin" au sens large (direction / rectorat), tous rediriges vers le
# back-office complet cote frontend (voir AuthContext.getRedirectPath).
ADMIN_TIER_ROLES = {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU"}


# ── LES ESPACES QU'UN RÔLE PERSONNALISÉ PEUT REPRENDRE ───────────────────────
#
# Une école ne parle pas de « DIRECTEUR_NIVEAU » mais de « censeur », de
# « surveillant général », de « caissier ». Elle doit pouvoir donner ces noms-là
# à ses agents — sans que cela crée un pouvoir nouveau.
#
# Un rôle personnalisé désigne donc un rôle standard dont il hérite l'espace :
# « Censeur des études » se base sur DIRECTEUR_NIVEAU, « Caissier » sur
# COMPTABLE. Il n'obtient JAMAIS plus que sa base, et la matrice de permissions
# continue de ne faire que restreindre.
#
# SUPER_ADMIN n'y figure pas : c'est le compte de l'éditeur de la plateforme,
# pas un poste qu'une école attribue.
ROLES_ATTRIBUABLES = (
    "FONDATEUR", "DG", "DIRECTEUR_NIVEAU", "ADMIN", "COMPTABLE",
    "BIBLIOTHECAIRE", "INFORMATICIEN", "SURVEILLANT", "OPERATEUR",
    "AGENT_ENTRETIEN", "GARDIEN", "CHAUFFEUR", "AUTRE",
)

# Comment ces postes se nomment à l'écran.
#
# Ces libellés n'existaient que côté frontend, dans l'assistant de création de
# rôle. L'écran « Rôles » ne listait donc QUE les rôles créés à la main par
# l'école : une direction qui ouvrait cet écran voyait « Personne n'occupe
# encore ce poste » en face de la comptabilité, alors que son comptable est en
# poste, se connecte tous les jours et touche un salaire. Les postes du système
# doivent apparaître dans la même liste, avec leurs titulaires.
LIBELLES_DES_ROLES = {
    "SUPER_ADMIN":      ("Éditeur de la plateforme", "Compte de maintenance : n'est pas un poste de l'école."),
    "FONDATEUR":        ("Fondateur", "Vision exécutive sur toute la plateforme."),
    "DG":               ("Direction générale", "Pilotage de l'école, comptabilité comprise."),
    "ADMIN":            ("Administration complète", "Tous les écrans, comptabilité comprise."),
    "DIRECTEUR_NIVEAU": ("Direction des études", "Évaluations, notes, bulletins, résultats de fin d'année, examens, archive. Pas la comptabilité."),
    "COMPTABLE":        ("Comptabilité", "Encaissements, dépenses, salaires, rapports. Rien de pédagogique."),
    "SURVEILLANT":      ("Surveillance", "Discipline, présences, remontées terrain."),
    "OPERATEUR":        ("Secrétariat / opérations", "Accueil, inscriptions, saisie courante."),
    "BIBLIOTHECAIRE":   ("Bibliothèque", "Fonds documentaire, prêts et retours."),
    "INFORMATICIEN":    ("Informatique", "Équipements, incidents, support technique."),
    "AGENT_ENTRETIEN":  ("Entretien", "Aucun écran : la personne existe en RH et à la paie, sans compte."),
    "GARDIEN":          ("Gardiennage", "Aucun écran : la personne existe en RH et à la paie, sans compte."),
    "CHAUFFEUR":        ("Transport", "Aucun écran : la personne existe en RH et à la paie, sans compte."),
    "AUTRE":            ("Autre", "Aucun écran : la personne existe en RH et à la paie, sans compte."),
}


def roles_du_compte(current_user: dict) -> set:
    """Role principal + roles secondaires declares sur la fiche.

    `roles_secondaires` est saisi dans l'assistant Personnel sous l'intitule
    "cumul de responsabilites". Il etait stocke, affiche... et jamais lu :
    donner COMPTABLE en role secondaire a un surveillant ne lui ouvrait rien,
    et l'administrateur concluait a un bug. Il est desormais reellement pris en
    compte, au meme titre que le role principal.

    Il est porte par le JWT (comme etablissement_id depuis le Lot 0) pour eviter
    une requete par appel. Un token emis avant l'ajout du champ n'en a pas :
    traite comme une liste vide, donc strictement l'ancien comportement.
    """
    roles = {current_user.get("role", "")}
    secondaires = current_user.get("roles_secondaires") or []
    if isinstance(secondaires, (list, tuple, set)):
        roles.update(r for r in secondaires if isinstance(r, str) and r)
    # Rôle personnalisé (« CENSEUR ») : il vaut son rôle de base et rien de
    # plus. Le jeton le porte, résolu à la connexion, pour éviter une requête
    # à chaque appel. Un jeton émis avant ce champ n'en a pas et se comporte
    # exactement comme avant.
    base = current_user.get("role_base")
    if isinstance(base, str) and base:
        roles.add(base)
    return roles


def require_roles(*roles: str):
    """Dependency factory FastAPI : exige qu'un des roles du compte figure dans `roles`.

    Prend en compte le role principal ET les roles secondaires.

    Usage: app.include_router(finance_router, dependencies=[Depends(require_roles("ADMIN", "COMPTABLE"))])
    """
    allowed = set(roles)

    async def _role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if not (roles_du_compte(current_user) & allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acces refuse : privileges insuffisants pour cette ressource",
            )
        return current_user

    return _role_checker


# ── Permissions configurables (ss_roles / ss_permissions) ────────────────────
# La page Parametres > Securite laisse un administrateur cocher/decocher, pour
# chaque role, une matrice module x action. Ces reglages etaient enregistres
# mais JAMAIS lus : decocher une permission n'enlevait rien, ce qui donnait a
# la direction une fausse assurance. Ils sont desormais appliques.
#
# REGLE DE SECURITE CENTRALE : ces permissions ne peuvent que RESTREINDRE.
# Elles retirent un acces que le role statique accorde deja ; elles n'en
# ouvrent JAMAIS un nouveau. Sans cette regle, cocher une case dans une table
# de configuration suffirait a donner la finance a un ENSEIGNANT, c'est-a-dire
# a contourner par la base tout le durcissement fait au niveau du code.
#
# Consequence assumee : un role personnalise (absent des ensembles statiques)
# n'obtient aucun acces, meme avec toutes ses cases cochees.

ACTION_PAR_METHODE = {
    "GET": "lecture",
    "HEAD": "lecture",
    "OPTIONS": "lecture",
    "POST": "ecriture",
    "PUT": "ecriture",
    "PATCH": "ecriture",
    "DELETE": "suppression",
}


def permission_refusee(db, etablissement_id: Optional[int], roles: set, module: str, action: str) -> bool:
    """La matrice interdit-elle EXPLICITEMENT ce couple (module, action) ?

    Renvoie True seulement si un role du compte porte une ligne de permission
    disant "non". Absence de role configure, absence de ligne, etablissement
    inconnu : on ne refuse rien — c'est le role statique qui decide, comme
    avant. On ne refuse jamais sur une simple absence de donnee.

    Il suffit qu'UN role du compte autorise pour que l'acces passe : les roles
    secondaires servent a cumuler des responsabilites, pas a s'annuler entre
    eux.
    """
    if etablissement_id is None or not roles:
        return False

    from app.models.academique import Permission, Role

    lignes = (
        db.query(Role.code, Permission.est_autorise)
        .join(Permission, Permission.role_id == Role.role_id)
        .filter(
            Role.etablissement_id == etablissement_id,
            Role.code.in_(roles),
            Permission.module == module,
            Permission.action == action,
        )
        .all()
    )
    if not lignes:
        return False
    return all(valeur != "O" for _code, valeur in lignes)


def require_module(module: str):
    """Couche de restriction configurable, a poser APRES le controle de role.

    `module` doit etre l'un des codes de `securite.py::SYSTEM_MODULES` — ce
    sont les seuls que l'interface permet de configurer.
    """

    async def _verifier(
        request: Request,
        current_user: dict = Depends(get_current_user),
        db=Depends(_get_db_dependency()),
    ) -> dict:
        action = ACTION_PAR_METHODE.get(request.method.upper())
        if action is None:
            return current_user
        if permission_refusee(
            db,
            current_user.get("etablissement_id"),
            roles_du_compte(current_user),
            module,
            action,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                # Message lu par un utilisateur final : accentué, contrairement
                # au reste de ce fichier, et surtout ACTIONNABLE — il indique
                # où le réglage a été fait plutôt qu'un « accès refusé » sec.
                detail=(
                    f"Accès refusé : la permission « {action} » sur le module "
                    f"« {module} » a été retirée à votre rôle dans Paramètres > Sécurité."
                ),
            )
        return current_user

    return _verifier


def _get_db_dependency():
    """Import tardif : app.core.database importe la configuration, qui importe
    ce module — le faire au niveau du fichier creerait un cycle."""
    from app.core.database import get_db

    return get_db
