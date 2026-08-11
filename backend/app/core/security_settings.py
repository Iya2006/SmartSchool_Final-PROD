"""
SMARTSCHOOL — Configuration centralisée de la sécurité & gestion des accès
"""
from sqlalchemy.orm import Session
from app.models.academique import ParametreEtablissement

SECURITE_DEFAULTS = {
    "securite.pwd_min_length": "8",
    "securite.pwd_require_uppercase": "true",
    "securite.pwd_require_number": "true",
    "securite.pwd_require_special": "false",
    "securite.pwd_expiry_days": "90",
    "securite.session_timeout_minutes": "30",
    "securite.session_single_login": "false",
    "securite.audit_log_active": "true",
}

def get_security_settings(db: Session, etablissement_id: int) -> dict:
    """Charge les paramètres SECURITE depuis ss_parametres, fusionnés avec les défauts."""
    settings = dict(SECURITE_DEFAULTS)
    try:
        params = db.query(ParametreEtablissement).filter(
            ParametreEtablissement.etablissement_id == etablissement_id,
            ParametreEtablissement.categorie == "SECURITE",
        ).all()
        for p in params:
            settings[p.cle] = p.valeur
    except Exception:
        pass
    return settings
