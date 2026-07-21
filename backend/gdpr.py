# backend/gdpr.py — RGPD/GDPR Compliance Module (FastAPI)

from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
import json
import logging
import uuid

logger = logging.getLogger(__name__)

# ============================================
# MODÈLES SQLALCHEMY
# ============================================

from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class GDPRConsent(Base):
    """Enregistrement des consentements"""
    __tablename__ = "gdpr_consents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    consent_type = Column(String(50), nullable=False)  # DATA_PROCESSING, PHOTO_USAGE, etc.
    given_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # Traçabilité
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(Text, nullable=True)
    
    # Parent signature (si mineurs)
    parent_name = Column(String(255), nullable=True)
    parent_email = Column(String(255), nullable=True)


class GDPRAuditLog(Base):
    """Journal d'audit pour traçabilité"""
    __tablename__ = "gdpr_audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    school_id = Column(Integer, nullable=False, index=True)
    actor_user_id = Column(Integer, nullable=True)
    
    action = Column(String(20), nullable=False)  # CREATE, READ, UPDATE, DELETE, EXPORT, ANONYMIZE
    resource_type = Column(String(100), nullable=False, index=True)
    resource_id = Column(Integer, nullable=False, index=True)
    
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    
    # Contexte
    ip_address = Column(String(45), nullable=False)
    user_agent = Column(Text, nullable=True)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)


class GDPRDataExport(Base):
    """Demandes d'exportation de données (DSAR)"""
    __tablename__ = "gdpr_data_exports"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default='PENDING', nullable=False)  # PENDING, PROCESSING, COMPLETED, FAILED
    
    export_format = Column(String(10), default='JSON')
    export_file_path = Column(String(500), nullable=True)
    
    ip_address = Column(String(45), nullable=False)
    download_count = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=False)  # 30 jours


class GDPRDeletionRequest(Base):
    """Demandes de suppression (droit à l'oubli)"""
    __tablename__ = "gdpr_deletion_requests"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default='PENDING', nullable=False)  # PENDING, PROCESSING, COMPLETED, REJECTED
    
    reason = Column(Text, nullable=False)
    grace_period_ends_at = Column(DateTime, nullable=False)  # 30 jours pour annuler
    
    ip_address = Column(String(45), nullable=False)
    reviewed_by = Column(Integer, nullable=True)
    review_notes = Column(Text, nullable=True)


# ============================================
# SCHÉMAS PYDANTIC
# ============================================

class ConsentRequest(BaseModel):
    consent_type: str
    parent_name: Optional[str] = None
    parent_email: Optional[EmailStr] = None


class ConsentResponse(BaseModel):
    id: str
    consent_type: str
    given_at: datetime
    is_active: bool


class AuditLogResponse(BaseModel):
    timestamp: datetime
    action: str
    resource_type: str
    resource_id: int
    success: bool


class DataExportRequest(BaseModel):
    export_format: str = "JSON"


class DataExportResponse(BaseModel):
    id: str
    status: str
    requested_at: datetime
    completed_at: Optional[datetime]
    expires_at: datetime


class DeletionRequest(BaseModel):
    reason: str


class DeletionResponse(BaseModel):
    id: str
    status: str
    requested_at: datetime
    grace_period_ends_at: datetime


# ============================================
# UTILITAIRES GDPR
# ============================================

def get_client_ip(request) -> str:
    """Extraire l'adresse IP du client"""
    headers = request.headers
    
    # Considérer les headers de proxy
    if "x-forwarded-for" in headers:
        return headers["x-forwarded-for"].split(",")[0].strip()
    
    if "cf-connecting-ip" in headers:  # CloudFlare
        return headers["cf-connecting-ip"]
    
    return request.client.host if request.client else "0.0.0.0"


async def log_audit_action(
    db,
    school_id: int,
    actor_user_id: Optional[int],
    action: str,
    resource_type: str,
    resource_id: int,
    request,
    old_value: Optional[Dict] = None,
    new_value: Optional[Dict] = None,
    success: bool = True,
    error_message: Optional[str] = None
):
    """Enregistrer une action dans le journal d'audit"""
    try:
        audit_log = GDPRAuditLog(
            school_id=school_id,
            actor_user_id=actor_user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent", "")[:500],
            success=success,
            error_message=error_message
        )
        db.add(audit_log)
        await db.commit()
    except Exception as e:
        logger.error(f"Erreur lors de l'enregistrement audit: {e}")


async def check_consent(db, user_id: int, consent_type: str) -> bool:
    """Vérifier si l'utilisateur a donné un consentement valide"""
    from sqlalchemy import select
    
    stmt = select(GDPRConsent).where(
        (GDPRConsent.user_id == user_id) &
        (GDPRConsent.consent_type == consent_type) &
        (GDPRConsent.is_active == True)
    )
    
    result = await db.execute(stmt)
    consent = result.scalar_one_or_none()
    
    if not consent:
        return False
    
    # Vérifier l'expiration
    if consent.expires_at and consent.expires_at < datetime.utcnow():
        consent.is_active = False
        await db.commit()
        return False
    
    return True


async def export_user_data(db, user_id: int, school_id: int) -> str:
    """Exporter les données d'un utilisateur (DSAR)"""
    from sqlalchemy import select
    
    # Récupérer les consentements
    consents_stmt = select(GDPRConsent).where(
        (GDPRConsent.user_id == user_id) &
        (GDPRConsent.school_id == school_id)
    )
    result = await db.execute(consents_stmt)
    consents = result.scalars().all()
    
    # Récupérer les logs d'audit
    logs_stmt = select(GDPRAuditLog).where(
        (GDPRAuditLog.school_id == school_id) &
        (GDPRAuditLog.actor_user_id == user_id)
    ).order_by(GDPRAuditLog.timestamp.desc()).limit(100)
    
    result = await db.execute(logs_stmt)
    logs = result.scalars().all()
    
    # Construire le JSON d'exportation
    export_data = {
        "user_id": user_id,
        "school_id": school_id,
        "exported_at": datetime.utcnow().isoformat(),
        "consents": [
            {
                "consent_type": c.consent_type,
                "given_at": c.given_at.isoformat(),
                "is_active": c.is_active,
            }
            for c in consents
        ],
        "audit_logs": [
            {
                "timestamp": log.timestamp.isoformat(),
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
            }
            for log in logs
        ],
    }
    
    return json.dumps(export_data, indent=2, ensure_ascii=False)


async def anonymize_user(db, user_id: int, school_id: int):
    """Anonymiser complètement un utilisateur"""
    from sqlalchemy import update
    
    # Cette implémentation dépend de vos modèles User/Student/Parent
    # À adapter selon votre structure
    
    logger.info(f"Anonymisation de l'utilisateur {user_id} - école {school_id}")


async def handle_deletion_request(db, school_id: int, user_id: int, reason: str, request):
    """
    Créer une demande de suppression avec période de grâce (30 jours)
    """
    grace_period_ends = datetime.utcnow() + timedelta(days=30)
    
    deletion_req = GDPRDeletionRequest(
        school_id=school_id,
        user_id=user_id,
        reason=reason,
        grace_period_ends_at=grace_period_ends,
        ip_address=get_client_ip(request),
        status="PENDING"
    )
    
    db.add(deletion_req)
    await db.commit()
    
    # Enregistrer dans l'audit
    await log_audit_action(
        db=db,
        school_id=school_id,
        actor_user_id=user_id,
        action="DELETE",
        resource_type="user",
        resource_id=user_id,
        request=request,
        success=True
    )
    
    return deletion_req


# ============================================
# MIDDLEWARE GDPR
# ============================================

from fastapi import Request

async def gdpr_audit_middleware(request: Request, call_next):
    """
    Middleware pour auditer les requêtes sensibles
    """
    # Routes à auditer
    audit_paths = [
        "/api/students",
        "/api/grades",
        "/api/classes",
        "/api/users",
        "/api/parents",
    ]
    
    should_audit = any(request.url.path.startswith(path) for path in audit_paths)
    
    if should_audit and request.method in ["POST", "PUT", "DELETE"]:
        logger.info(f"[AUDIT] {request.method} {request.url.path} from {get_client_ip(request)}")
    
    response = await call_next(request)
    return response
