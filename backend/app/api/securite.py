"""
SMARTSCHOOL API — Security & Access Control Endpoints

La matrice module × action gérée ici est **appliquée** par
`app/core/auth.py::require_module`, câblé dans `main.py` sur les routeurs
correspondant aux modules de `SYSTEM_MODULES`.

Deux règles à connaître avant de faire évoluer ce module :

  * **Retrait seulement.** Une permission peut fermer un accès que le rôle
    accorde, jamais en ouvrir un qu'il refuse. Sans cette règle, une ligne
    dans `ss_permissions` suffirait à donner la finance à un ENSEIGNANT,
    c'est-à-dire à contourner par la base tout le durcissement fait dans le
    code.
  * **Un rôle personnalisé n'obtient donc aucun accès** : n'étant dans aucun
    ensemble statique, il n'a rien à restreindre. Il reste par ailleurs non
    attribuable, le formulaire du personnel proposant une liste figée.

Pour élargir les droits de quelqu'un, on change son rôle principal ou on lui
ajoute un rôle secondaire (fiche Personnel) — pas cette matrice.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.auth import require_etablissement
from app.models.academique import Role, Permission, AuditLog, Utilisateur

router = APIRouter(prefix="/api/securite", tags=["Sécurité & Accès"])

SYSTEM_MODULES = [
    {"code": "eleves", "libelle": "Gestion des Élèves"},
    {"code": "enseignants", "libelle": "Gestion des Enseignants"},
    {"code": "notes", "libelle": "Saisie & Centralisation des Notes"},
    {"code": "bulletins", "libelle": "Génération des Bulletins PDF"},
    {"code": "finance", "libelle": "Gestion Financière & Reçus"},
    {"code": "comptabilite", "libelle": "Comptabilité Générale"},
    {"code": "vie_scolaire", "libelle": "Vie Scolaire & Discipline"},
    {"code": "emploi_du_temps", "libelle": "Emploi du Temps"},
    {"code": "parametres", "libelle": "Paramètres & Configuration"},
    {"code": "securite", "libelle": "Sécurité & Audit"},
]

STANDARD_ACTIONS = ["lecture", "ecriture", "suppression", "export"]

class RoleCreate(BaseModel):
    code: str
    libelle: str
    description: Optional[str] = None

class RoleUpdate(BaseModel):
    libelle: str
    description: Optional[str] = None

class PermissionItem(BaseModel):
    module: str
    action: str
    est_autorise: str # "O" ou "N"

class PermissionUpdate(BaseModel):
    permissions: List[PermissionItem]

class AuditLogCreate(BaseModel):
    utilisateur_id: Optional[int] = None
    nom_utilisateur: Optional[str] = "Système"
    module: str
    action: str
    details: Optional[str] = None

def _role_ou_404(db: Session, role_id: int, etablissement_id: int) -> Role:
    """Role porte une colonne etablissement_id directe (Lot 10).

    404 et non 403 pour un role d'une autre ecole : ne jamais confirmer son
    existence a un appelant qui n'a pas a le connaitre.
    """
    role = db.query(Role).filter(
        Role.role_id == role_id, Role.etablissement_id == etablissement_id
    ).first()
    if not role:
        raise HTTPException(404, "Rôle non trouvé")
    return role


@router.get("/modules")
def list_modules():
    return {"modules": SYSTEM_MODULES, "actions": STANDARD_ACTIONS}

@router.get("/roles")
def list_roles(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    roles = db.query(Role).filter(Role.etablissement_id == etablissement_id).all()
    res = []
    for r in roles:
        perms = db.query(Permission).filter(Permission.role_id == r.role_id).all()
        res.append({
            "role_id": r.role_id,
            "code": r.code,
            "libelle": r.libelle,
            "description": r.description,
            "est_systeme": r.est_systeme == "O",
            "created_date": r.created_date,
            "permissions": [
                {"module": p.module, "action": p.action, "est_autorise": p.est_autorise == "O"}
                for p in perms
            ]
        })
    return res

@router.post("/roles", status_code=201)
def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    existing = db.query(Role).filter(Role.etablissement_id == etablissement_id, Role.code == data.code.upper()).first()
    if existing:
        raise HTTPException(400, "Un rôle avec ce code existe déjà")

    role = Role(
        etablissement_id=etablissement_id,
        code=data.code.upper(),
        libelle=data.libelle,
        description=data.description,
        est_systeme="N"
    )
    db.add(role)
    db.commit()
    db.refresh(role)

    # Initialize default read permissions for custom role
    for m in SYSTEM_MODULES:
        for act in STANDARD_ACTIONS:
            perm = Permission(
                role_id=role.role_id,
                module=m["code"],
                action=act,
                est_autorise="O" if act == "lecture" else "N"
            )
            db.add(perm)
    db.commit()
    # Un rôle personnalisé reste non attribuable : le formulaire du personnel
    # propose une liste figée, et la matrice ne pouvant que RETIRER des accès,
    # un rôle hors des ensembles statiques n'obtiendrait de toute façon rien.
    return {
        "message": "Rôle créé. Il n'est pas attribuable à un compte : seuls les rôles "
                   "standards ouvrent des accès, la matrice ne pouvant que les restreindre.",
        "role_id": role.role_id,
        "attribuable": False,
    }

@router.put("/roles/{role_id}")
def update_role(
    role_id: int, data: RoleUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    role = _role_ou_404(db, role_id, etablissement_id)
    role.libelle = data.libelle
    role.description = data.description
    db.commit()
    return {"message": "Rôle mis à jour"}

@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    role = _role_ou_404(db, role_id, etablissement_id)
    if role.est_systeme == "O":
        raise HTTPException(400, "Impossible de supprimer un rôle système")
    
    db.query(Permission).filter(Permission.role_id == role_id).delete()
    db.delete(role)
    db.commit()
    return {"message": "Rôle supprimé avec succès"}

@router.put("/roles/{role_id}/permissions")
def update_permissions(
    role_id: int, data: PermissionUpdate,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    _role_ou_404(db, role_id, etablissement_id)

    for item in data.permissions:
        perm = db.query(Permission).filter(
            Permission.role_id == role_id,
            Permission.module == item.module,
            Permission.action == item.action
        ).first()
        val = "O" if item.est_autorise in [True, "O", "true", 1] else "N"
        if perm:
            perm.est_autorise = val
        else:
            new_perm = Permission(role_id=role_id, module=item.module, action=item.action, est_autorise=val)
            db.add(new_perm)

    db.commit()
    # La matrice est appliquée (`app/core/auth.py::require_module`), mais en
    # RETRAIT uniquement : décocher ferme un accès, cocher n'en ouvre jamais un
    # que le rôle refuse. La réponse le dit, pour qu'un client qui n'affiche que
    # le message reste exact.
    return {
        "message": "Permissions enregistrées et appliquées immédiatement. "
                   "Une case décochée retire l'accès ; une case cochée n'accorde "
                   "rien de plus que ce que le rôle permet déjà.",
        "appliquees": True,
        "peut_elargir": False,
    }

@router.get("/audit-log")
def list_audit_log(
    module: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    query = db.query(AuditLog).filter(AuditLog.etablissement_id == etablissement_id)
    if module:
        query = query.filter(AuditLog.module == module)
    if search:
        query = query.filter(
            (AuditLog.nom_utilisateur.like(f"%{search}%")) |
            (AuditLog.action.like(f"%{search}%")) |
            (AuditLog.details.like(f"%{search}%"))
        )
    
    total = query.count()
    items = query.order_by(AuditLog.created_date.desc()).offset(skip).limit(limit).all()
    return {"total": total, "items": items}

@router.post("/audit-log", status_code=201)
def create_audit_entry(
    data: AuditLogCreate, request: Request,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    # etablissement_id vient du compte authentifié : il etait fourni dans le
    # corps de la requete, ce qui permettait d'ecrire de fausses entrees dans
    # le journal d'audit de n'importe quelle autre ecole (Lot 10).
    log = AuditLog(
        etablissement_id=etablissement_id,
        utilisateur_id=data.utilisateur_id,
        nom_utilisateur=data.nom_utilisateur,
        module=data.module,
        action=data.action,
        details=data.details,
        ip_address=client_ip
    )
    db.add(log)
    db.commit()
    return {"message": "Log d'audit créé"}
