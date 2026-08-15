"""
SMARTSCHOOL — API Gestion du Personnel
Couvre tous les rôles : FONDATEUR, DG, DIRECTEUR_NIVEAU, ADMIN, COMPTABLE,
BIBLIOTHECAIRE, INFORMATICIEN, SURVEILLANT, AGENT_ENTRETIEN, GARDIEN, OPERATEUR...
`roles_secondaires` (JSONB) enregistre le cumul de responsabilités déclaré sur
la fiche.

⚠️ Ce champ est PUREMENT DESCRIPTIF aujourd'hui : `app/core/auth.py::require_roles`
n'examine que le rôle PRINCIPAL du compte. Ajouter COMPTABLE en rôle secondaire
à un surveillant ne lui ouvre donc pas la finance — il continue de recevoir un
403. Le libellé du formulaire le précise à l'utilisateur ; le brancher
réellement relève du chantier RBAC (§6.1 de `.ai/LOT12_RAPPORT.md`).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, case
from typing import List, Optional
from pydantic import BaseModel
import hashlib

from app.core.database import get_db
from app.core.auth import (
    ADMIN_TIER_ROLES, get_current_user, require_etablissement, require_roles,
    roles_du_compte,
)
from app.models.academique import Utilisateur
from app.schemas.schemas import PersonnelCreate, PersonnelUpdate, PersonnelOut
from app.core.security import hash_password, verify_password
from app.core.identifiants import exiger_identifiants_libres

router = APIRouter(prefix="/api/personnel", tags=["Personnel"])


# ─── Helpers ───────────────────────────────────────────────────────────────────
ROLES_AVEC_ACCES = {
    "SUPER_ADMIN", "FONDATEUR", "DG", "DIRECTEUR_NIVEAU",
    "ADMIN", "COMPTABLE", "BIBLIOTHECAIRE", "INFORMATICIEN", "SURVEILLANT", "OPERATEUR"
}

ROLES_SANS_ACCES = {"AGENT_ENTRETIEN", "GARDIEN", "CHAUFFEUR", "AUTRE"}


def resoudre_role(db: Session, role: str, etablissement_id: int) -> tuple:
    """(rôle retenu, espace hérité) — accepte les rôles créés par l'école.

    Une école nomme ses postes comme elle les vit : « censeur », « surveillant
    général », « caissier ». Ces rôles-là sont créés dans Paramètres >
    Sécurité et désignent l'espace d'un rôle standard. Le formulaire du
    personnel ne connaissait que la liste figée dans le code : un censeur
    fraîchement créé n'était donc jamais proposé, et s'il était forcé par
    l'API, son compte n'ouvrait aucun écran.

    Retourne l'espace hérité pour que l'appelant sache s'il doit générer un
    login — un rôle basé sur GARDIEN n'a pas plus d'écran que le gardien.
    """
    from app.models.academique import Role

    code = (role or "").upper()
    if code in ROLES_AVEC_ACCES or code in ROLES_SANS_ACCES:
        return code, code

    perso = db.query(Role).filter(
        Role.etablissement_id == etablissement_id, Role.code == code
    ).first()
    if not perso:
        raise HTTPException(
            status_code=400,
            detail=f"Rôle « {code} » inconnu. Créez-le d'abord dans "
                   f"Paramètres > Sécurité, ou choisissez un rôle existant.",
        )
    if not perso.role_base:
        raise HTTPException(
            status_code=400,
            detail=f"Le rôle « {perso.libelle} » n'a pas d'espace : personne ne "
                   f"pourrait s'en servir. Indiquez de quel rôle il hérite.",
        )
    return code, perso.role_base

# ── QUI TOUCHE AUX FICHES DU PERSONNEL ───────────────────────────────────────
#
# Le module entier était ouvert à PERSONNEL_ROLES, c'est-à-dire aussi au
# comptable, au surveillant, au bibliothécaire, à l'informaticien et à
# l'opérateur. Chacun d'eux pouvait donc :
#   créer un compte ADMIN à son nom,
#   changer le salaire de n'importe qui, y compris le sien,
#   désactiver le directeur,
#   et — c'est le cas qui a fait trouver le trou — se RÉACTIVER lui-même
#   après que la direction l'a désactivé à la clôture de l'année.
#
# Une désactivation que la personne désactivée peut annuler n'est pas une
# désactivation. Écrire sur une fiche du personnel est donc réservé à la
# direction, et à elle seule.
_direction_seule = require_roles(*ADMIN_TIER_ROLES)

# Lire une fiche reste ouvert aux rôles internes (l'annuaire sert à tout le
# monde), mais la rémunération et les pièces d'identité n'en font pas partie :
# un surveillant n'a pas à connaître le salaire du comptable. Seules la
# direction et la comptabilité — qui prépare la paie — les voient.
ROLES_VOIENT_LA_REMUNERATION = set(ADMIN_TIER_ROLES) | {"COMPTABLE"}
CHAMPS_CONFIDENTIELS = (
    "salaire_base", "taux_horaire", "prime_mensuelle", "rib",
    "numero_cni", "date_naissance", "lieu_naissance", "adresse",
)


def _voit_la_remuneration(current_user: dict) -> bool:
    return bool(roles_du_compte(current_user) & ROLES_VOIENT_LA_REMUNERATION)


def _masquer(fiche: dict) -> dict:
    """Retire d'une fiche ce qui ne regarde que la direction et la paie."""
    allege = dict(fiche)
    for champ in CHAMPS_CONFIDENTIELS:
        allege.pop(champ, None)
    return allege


def generer_nom_utilisateur(db: Session, prenom: str, nom: str) -> str:
    """Login proposé à la création : « ma.sylla », puis « ma.sylla2 », etc.

    Fonction partagée plutôt que règle recopiée : le scénario de recette crée
    du personnel par le même chemin que l'écran, sinon il vérifierait une
    logique qui n'est pas celle en production.

    L'unicité est cherchée sur TOUTE la plateforme, pas dans l'école seule :
    `auth.py` identifie par login sans savoir de quelle école on vient.
    """
    base = f"{(prenom or '')[:2].lower()}.{(nom or '').lower()}".strip(".")
    base = base or "utilisateur"
    existants = db.query(func.count(Utilisateur.utilisateur_id)).filter(
        Utilisateur.nom_utilisateur.ilike(f"{base}%")
    ).scalar() or 0
    return base if existants == 0 else f"{base}{existants + 1}"


def _row_to_dict(p: Utilisateur) -> dict:
    """Sérialise un Utilisateur en dict compatible avec PersonnelOut."""
    return {
        "utilisateur_id": p.utilisateur_id,
        "etablissement_id": p.etablissement_id,
        "nom": p.nom,
        "prenom": p.prenom,
        "sexe": p.sexe,
        "photo_url": p.photo_url,
        "telephone": p.telephone,
        "email": p.email,
        "role": p.role,
        "roles_secondaires": p.roles_secondaires or [],
        "statut": p.statut,
        "nom_utilisateur": p.nom_utilisateur,
        "type_contrat": p.type_contrat,
        "date_embauche": str(p.date_embauche) if p.date_embauche else None,
        "salaire_base": float(p.salaire_base) if p.salaire_base else 0,
        "taux_horaire": float(p.taux_horaire) if p.taux_horaire else 0,
        "prime_mensuelle": float(p.prime_mensuelle) if p.prime_mensuelle else 0,
        "heures_hebdo": p.heures_hebdo or 0,
        "rib": p.rib,
        "mode_paiement_salaire": p.mode_paiement_salaire,
        "date_naissance": str(p.date_naissance) if p.date_naissance else None,
        "lieu_naissance": p.lieu_naissance,
        "adresse": p.adresse,
        "numero_cni": p.numero_cni,
        "created_date": str(p.created_date) if p.created_date else None,
    }


# ─── LISTE du personnel ────────────────────────────────────────────────────────
@router.get("", summary="Lister tout le personnel")
def list_personnel(
    response: Response,
    role: Optional[str] = Query(None, description="Filtrer par rôle principal"),
    statut: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Recherche par nom/prénom"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    """Retourne la liste du personnel non-enseignant avec filtres optionnels,
    paginée (skip/limit) — un établissement à grand effectif ne doit jamais
    tout charger d'un coup. Total réel exposé via X-Total-Count (même
    convention que communication.py/finance.py)."""
    query = db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == etablissement_id
    )
    if role:
        query = query.filter(Utilisateur.role == role)
    if statut:
        query = query.filter(Utilisateur.statut == statut)
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Utilisateur.nom.ilike(search),
                Utilisateur.prenom.ilike(search),
                Utilisateur.telephone.ilike(search)
            )
        )
    # La liste est paginée (sinon une école de 200 agents renvoie tout à
    # chaque ouverture d'écran), ET la rémunération reste masquée pour qui
    # n'a pas à la voir. Les deux règles s'appliquent ensemble : paginer ne
    # doit pas rouvrir la fiche de paie, masquer ne doit pas ramener toute
    # la table.
    response.headers["X-Total-Count"] = str(query.count())
    personnel = query.order_by(Utilisateur.role, Utilisateur.nom).offset(skip).limit(limit).all()
    fiches = [_row_to_dict(p) for p in personnel]
    if _voit_la_remuneration(current_user):
        return fiches
    return [_masquer(f) for f in fiches]


# ─── Récapitulatif par rôle ────────────────────────────────────────────────────
@router.get("/stats", summary="Statistiques du personnel par rôle",
            dependencies=[Depends(_direction_seule)])
def stats_personnel(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Compte le nombre de membres par rôle, le total des salaires, les actifs
    et ceux qui ont un accès système.

    Les totaux sont des agrégats SQL, jamais un décompte de la page affichée
    côté frontend — celle-ci est paginée, et compter ses lignes donnerait
    l'effectif de la page pour l'effectif de l'école.

    Réservé à la direction : la masse salariale par rôle se déduit d'un simple
    total, et un effectif de 2 suffit à retrouver deux salaires individuels.
    """
    rows = db.query(
        Utilisateur.role,
        func.count(Utilisateur.utilisateur_id).label("total"),
        func.coalesce(func.sum(Utilisateur.salaire_base), 0).label("masse_salariale"),
        func.sum(case((Utilisateur.statut == "ACTIF", 1), else_=0)).label("actifs"),
        func.sum(case((Utilisateur.nom_utilisateur.isnot(None), 1), else_=0)).label("avec_acces"),
    ).filter(
        Utilisateur.etablissement_id == etablissement_id
    ).group_by(Utilisateur.role).all()

    return [
        {
            "role": r.role, "total": r.total, "masse_salariale": float(r.masse_salariale),
            "actifs": r.actifs or 0, "avec_acces": r.avec_acces or 0,
        }
        for r in rows
    ]


# ─── DÉTAIL d'un membre du personnel ──────────────────────────────────────────
@router.get("/{personnel_id}", summary="Détail d'un membre du personnel")
def get_personnel(
    personnel_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    p = db.query(Utilisateur).filter(
        Utilisateur.utilisateur_id == personnel_id, Utilisateur.etablissement_id == etablissement_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
    fiche = _row_to_dict(p)
    # Sa propre fiche se lit en entier : chacun a le droit de connaître son
    # salaire et ce que l'école a enregistré sur lui.
    if _voit_la_remuneration(current_user) or str(current_user.get("sub")) == str(personnel_id):
        return fiche
    return _masquer(fiche)


# ─── CRÉER un nouveau membre du personnel ─────────────────────────────────────
@router.post("", status_code=201, summary="Créer un membre du personnel",
             dependencies=[Depends(_direction_seule)])
def create_personnel(data: PersonnelCreate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """
    Crée un nouveau membre du personnel.
    - Si mot_de_passe fourni → compte système créé, accès logiciel activé.
    - Si mot_de_passe absent → staff technique sans accès (nettoyeurs, gardiens…).
    - roles_secondaires → liste JSON permettant le cumul de rôles.

    `data.etablissement_id` (champ obligatoire du schéma PersonnelBase) est
    ignoré et remplacé par l'établissement authentifié — avant le Lot 3,
    n'importe quel client pouvait choisir librement l'école propriétaire du
    compte créé.
    """
    # Le rôle peut être un rôle créé par l'école (« CENSEUR ») : on résout
    # l'espace dont il hérite pour savoir s'il ouvre un accès.
    role_retenu, espace = resoudre_role(db, data.role, etablissement_id)

    # Génération du login si non fourni mais rôle avec accès
    nom_utilisateur = data.nom_utilisateur
    if espace in ROLES_AVEC_ACCES and not nom_utilisateur and data.mot_de_passe:
        nom_utilisateur = generer_nom_utilisateur(db, data.prenom, data.nom)

    # Vérifie unicité du login si fourni
    if nom_utilisateur:
        existing = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == nom_utilisateur
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Le nom d'utilisateur '{nom_utilisateur}' est déjà utilisé."
            )

    # L'e-mail et le téléphone sont eux aussi des identifiants de connexion
    # (voir auth.py) : un doublon, même dans une autre table ou une autre
    # école, empêcherait définitivement l'un des deux comptes de se connecter.
    exiger_identifiants_libres(db, [data.email, data.telephone])

    payload = data.model_dump(exclude={"nom_utilisateur", "mot_de_passe"})
    payload["etablissement_id"] = etablissement_id
    payload["role"] = role_retenu
    mot_de_passe_hashed = hash_password(data.mot_de_passe) if data.mot_de_passe else None

    p = Utilisateur(
        **payload,
        nom_utilisateur=nom_utilisateur,
        mot_de_passe=mot_de_passe_hashed
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    result = _row_to_dict(p)
    # Retourner le mot de passe en clair (une seule fois) si créé
    result["mot_de_passe_clair"] = data.mot_de_passe if data.mot_de_passe else None
    # L'espace où cette personne atterrira en se connectant : la direction doit
    # pouvoir le vérifier au moment où elle crée le compte, pas le découvrir
    # quand l'intéressé se plaint de tomber sur un écran vide.
    result["espace"] = espace
    return result


# ─── METTRE À JOUR un membre du personnel ────────────────────────────────────
@router.put("/{personnel_id}", summary="Modifier un membre du personnel",
            dependencies=[Depends(_direction_seule)])
def update_personnel(personnel_id: int, data: PersonnelUpdate, db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    p = db.query(Utilisateur).filter(
        Utilisateur.utilisateur_id == personnel_id, Utilisateur.etablissement_id == etablissement_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")

    update_data = data.model_dump(exclude_unset=True)

    # Hash mot de passe si modifié
    if "mot_de_passe" in update_data and update_data["mot_de_passe"]:
        update_data["mot_de_passe"] = hash_password(update_data["mot_de_passe"])
    elif "mot_de_passe" in update_data and not update_data["mot_de_passe"]:
        del update_data["mot_de_passe"]  # Pas de mise à zéro

    # Vérifier unicité du login si modifié
    if "nom_utilisateur" in update_data and update_data["nom_utilisateur"]:
        existing = db.query(Utilisateur).filter(
            Utilisateur.nom_utilisateur == update_data["nom_utilisateur"],
            Utilisateur.utilisateur_id != personnel_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Le nom d'utilisateur '{update_data['nom_utilisateur']}' est déjà utilisé."
            )

    for key, value in update_data.items():
        setattr(p, key, value)

    db.commit()
    db.refresh(p)
    return _row_to_dict(p)


# ─── ARCHIVER / Changer le statut ─────────────────────────────────────────────
STATUTS_PERSONNEL = {"ACTIF", "INACTIF", "SUSPENDU", "CONGE"}


@router.patch("/{personnel_id}/statut", summary="Changer le statut d'un membre",
              dependencies=[Depends(_direction_seule)])
def change_statut(
    personnel_id: int,
    statut: str = Query(..., description="ACTIF, INACTIF, SUSPENDU, CONGE"),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    """Active ou désactive un compte du personnel.

    C'est le geste que la direction pose à la clôture de l'année : le compte
    comptable est désactivé une fois les comptes arrêtés, et réactivé à la
    réouverture. `auth.py` refuse la connexion de tout compte dont le statut
    n'est pas ACTIF, donc désactiver ferme réellement la porte — ce n'est pas
    un simple libellé.
    """
    statut = (statut or "").strip().upper()
    if statut not in STATUTS_PERSONNEL:
        raise HTTPException(
            status_code=400,
            detail=f"Statut invalide. Valeurs acceptées : {', '.join(sorted(STATUTS_PERSONNEL))}",
        )

    p = db.query(Utilisateur).filter(
        Utilisateur.utilisateur_id == personnel_id, Utilisateur.etablissement_id == etablissement_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")

    # LE COMPTE COMPTABLE NE SE GÈLE QU'À LA MAIN DU FONDATEUR
    # Désactiver le comptable en fin d'année (puis le réactiver à la
    # réouverture) est un geste de clôture qui appartient au fondateur seul.
    # Le directeur général et le directeur de niveau, eux, ne doivent pas
    # pouvoir couper l'accès de la comptabilité — la séparation des pouvoirs
    # vaut aussi entre la direction et le propriétaire de l'école.
    from app.core.auth import roles_du_compte
    FONDATEUR_SEUL = {"SUPER_ADMIN", "FONDATEUR", "ADMIN"}
    if p.role == "COMPTABLE" and not (roles_du_compte(current_user) & FONDATEUR_SEUL):
        raise HTTPException(
            status_code=403,
            detail="Seul le fondateur de l'école peut activer ou désactiver le compte du comptable.",
        )

    if statut != "ACTIF":
        # Se désactiver soi-même verrouille l'école dehors : plus personne pour
        # rouvrir le compte, et le support doit intervenir en base.
        if str(current_user.get("sub")) == str(personnel_id):
            raise HTTPException(
                status_code=400,
                detail="Vous ne pouvez pas désactiver votre propre compte : "
                       "plus personne ne pourrait le réactiver.",
            )
        # Même raison pour le dernier compte de direction actif de l'école.
        if p.role in ADMIN_TIER_ROLES and p.statut == "ACTIF":
            restants = db.query(func.count(Utilisateur.utilisateur_id)).filter(
                Utilisateur.etablissement_id == etablissement_id,
                Utilisateur.role.in_(list(ADMIN_TIER_ROLES)),
                Utilisateur.statut == "ACTIF",
                Utilisateur.utilisateur_id != personnel_id,
            ).scalar() or 0
            if restants == 0:
                raise HTTPException(
                    status_code=400,
                    detail="C'est le dernier compte de direction actif de l'école. "
                           "Le désactiver fermerait l'accès à tout le monde.",
                )

    p.statut = statut
    db.commit()
    return {"message": f"Statut mis à jour : {statut}", "utilisateur_id": personnel_id,
            "statut": statut}


# ─── SUPPRIMER un membre du personnel ─────────────────────────────────────────
@router.delete("/{personnel_id}", summary="Supprimer un membre du personnel",
               dependencies=[Depends(_direction_seule)])
def delete_personnel(
    personnel_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
    current_user: dict = Depends(get_current_user),
):
    p = db.query(Utilisateur).filter(
        Utilisateur.utilisateur_id == personnel_id, Utilisateur.etablissement_id == etablissement_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Membre du personnel introuvable")
    if str(current_user.get("sub")) == str(personnel_id):
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte.")
    db.delete(p)
    db.commit()
    return {"message": "Membre supprimé avec succès"}


# ─── LISTE pour le paiement des salaires ──────────────────────────────────────
# Réservée à la direction et à la comptabilité : c'est la liste des salaires
# nominatifs de toute l'école.
@router.get("/salaires/liste", summary="Liste du personnel avec salaires pour la comptabilité",
            dependencies=[Depends(require_roles(*ADMIN_TIER_ROLES, "COMPTABLE"))])
def liste_salaires(db: Session = Depends(get_db), etablissement_id: int = Depends(require_etablissement)):
    """Retourne uniquement les membres avec un salaire > 0, pour le Centre de Décaissement."""
    rows = db.query(Utilisateur).filter(
        Utilisateur.etablissement_id == etablissement_id,
        Utilisateur.statut == "ACTIF",
        Utilisateur.salaire_base > 0
    ).order_by(Utilisateur.role, Utilisateur.nom).all()
    return [_row_to_dict(p) for p in rows]


# ─── CHANGER SON PROPRE MOT DE PASSE ───────────────────────────────────────────
class ChangePasswordRequest(BaseModel):
    ancien_mdp: Optional[str] = None
    nouveau_mdp: str


@router.put("/me/changer-mot-de-passe", summary="Changer mon propre mot de passe")
def changer_mon_mot_de_passe(
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-service, avec vérification de l'ancien mot de passe — contrairement
    à `PUT /{personnel_id}`, qui permet à un admin de réinitialiser le mot de
    passe d'un AUTRE membre du personnel sans le connaître (gestion RH), cette
    route ne touche que le compte du jeton présenté et exige l'ancien mot de
    passe, comme l'équivalent déjà en place pour les enseignants
    (`portail_enseignant.py::changer_mot_de_passe`)."""
    if current_user.get("type") != "admin":
        raise HTTPException(403, "Réservé aux comptes du personnel")
    p = db.query(Utilisateur).filter(Utilisateur.utilisateur_id == int(current_user["sub"])).first()
    if not p:
        raise HTTPException(404, "Compte introuvable")

    if p.mot_de_passe:
        if not data.ancien_mdp:
            raise HTTPException(400, "L'ancien mot de passe est requis")
        if not verify_password(data.ancien_mdp, p.mot_de_passe):
            raise HTTPException(401, "Ancien mot de passe incorrect")

    if len(data.nouveau_mdp) < 6:
        raise HTTPException(400, "Le nouveau mot de passe doit faire au moins 6 caractères")

    p.mot_de_passe = hash_password(data.nouveau_mdp)
    db.commit()
    return {"message": "Mot de passe modifié avec succès"}
