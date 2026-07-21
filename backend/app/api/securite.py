"""
SMARTSCHOOL API — Security & Access Control Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
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
    etablissement_id: int = 1

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
    etablissement_id: int = 1
    utilisateur_id: Optional[int] = None
    nom_utilisateur: Optional[str] = "Système"
    module: str
    action: str
    details: Optional[str] = None

@router.get("/modules")
def list_modules():
    return {"modules": SYSTEM_MODULES, "actions": STANDARD_ACTIONS}

@router.get("/roles")
def list_roles(etablissement_id: int = 1, db: Session = Depends(get_db)):
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
def create_role(data: RoleCreate, db: Session = Depends(get_db)):
    existing = db.query(Role).filter(Role.etablissement_id == data.etablissement_id, Role.code == data.code.upper()).first()
    if existing:
        raise HTTPException(400, "Un rôle avec ce code existe déjà")
    
    role = Role(
        etablissement_id=data.etablissement_id,
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
    return {"message": "Rôle créé avec succès", "role_id": role.role_id}

@router.put("/roles/{role_id}")
def update_role(role_id: int, data: RoleUpdate, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    if not role:
        raise HTTPException(404, "Rôle non trouvé")
    role.libelle = data.libelle
    role.description = data.description
    db.commit()
    return {"message": "Rôle mis à jour"}

@router.delete("/roles/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    if not role:
        raise HTTPException(404, "Rôle non trouvé")
    if role.est_systeme == "O":
        raise HTTPException(400, "Impossible de supprimer un rôle système")
    
    db.query(Permission).filter(Permission.role_id == role_id).delete()
    db.delete(role)
    db.commit()
    return {"message": "Rôle supprimé avec succès"}

@router.put("/roles/{role_id}/permissions")
def update_permissions(role_id: int, data: PermissionUpdate, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.role_id == role_id).first()
    if not role:
        raise HTTPException(404, "Rôle non trouvé")

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
    return {"message": "Permissions mises à jour avec succès"}

@router.get("/audit-log")
def list_audit_log(
    etablissement_id: int = 1,
    module: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
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
def create_audit_entry(data: AuditLogCreate, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    log = AuditLog(
        etablissement_id=data.etablissement_id,
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
