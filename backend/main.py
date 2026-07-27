"""
SMARTSCHOOL ERP — Point d'entrée principal FastAPI
Assemble tous les routers de chaque module.
"""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.database import engine, Base
from app.models.academique import *  # Importe tous les modèles pour créer les tables

from app.api.dashboard import router as dashboard_router
from app.api.eleves import router as eleves_router
from app.api.enseignants import router as enseignants_router
from app.api.classes import router as classes_router
from app.api.classes import inscriptions_router
from app.api.evaluations import router as evaluations_router
from app.api.evaluations import notes_router
from app.api.finance import router as finance_router
from app.api.vie_scolaire import router as vie_scolaire_router
from app.api.parametrage import router as parametrage_router
from app.api.parametrage import public_router as parametrage_public_router
from app.api.matieres import router as matieres_router
from app.api.emploi_du_temps import router as emploi_router
from app.api.communication import router as comm_router
from app.api.examens import router as examens_router
from app.api.portail_parent import router as parent_portal_router
from app.api.portail_enseignant import router as teacher_portal_router
from app.api.portail_eleve import router as eleve_portal_router
from app.api.auth import router as auth_router
from app.api.devoirs import router as devoirs_router
from app.api.photos import router as photos_router
from app.api.fournitures import router as fournitures_router
from app.api.comptabilite import router as comptabilite_router
from app.api.personnel import router as personnel_router
from app.api.presence_agent import router as presence_agent_router
from app.api.securite import router as securite_router
from app.api.evenements import router as evenements_router
from app.api.activites import router as activites_router
from app.api.bibliotheque import router as bibliotheque_router
from app.api.informatique import router as informatique_router
from app.api.pointage_eleves import router as pointage_eleves_router


# Création des tables au démarrage
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="SMARTSCHOOL ERP API",
    description="""
## API du Système de Gestion Scolaire National — République de Guinée

### Modules disponibles :
- **Dashboard** — KPIs et statistiques globales
- **Élèves** — CRUD complet avec recherche et pagination
- **Enseignants** — CRUD + affectations par année
- **Classes** — Gestion des classes et effectifs
- **Inscriptions** — Inscription / annulation avec mise à jour effectifs
- **Évaluations & Notes** — Saisie, initialisation et mise à jour en lot
- **Finance** — Factures, paiements, dépenses, stats et recouvrement
- **Vie Scolaire** — Présences (saisie en lot), incidents disciplinaires
- **Paramétrage** — Établissements, années, cycles, niveaux, matières, salles
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)


# ── Headers de sécurité ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # En production HTTPS, activer HSTS :
        # response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# ── CORS ──
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100,http://localhost:3300,http://127.0.0.1:3300")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# ── Rate Limiting ──
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# ============================================================================
# ENREGISTREMENT DE TOUS LES ROUTERS
# ============================================================================
from fastapi import Depends
from app.core.auth import get_current_user, require_roles, ADMIN_TIER_ROLES

# Rôles autorisés sur les modules Finance / Comptabilité :
# l'équipe de direction (ADMIN_TIER_ROLES) + le rôle COMPTABLE dédié.
# Aucun rôle externe (ENSEIGNANT, PARENT, ELEVE) ne doit jamais y avoir accès.
FINANCE_ROLES = (*ADMIN_TIER_ROLES, "COMPTABLE")

# RH / Personnel : direction + rôles métiers internes autorisés à consulter leur espace.
PERSONNEL_ROLES = (
    *ADMIN_TIER_ROLES,
    "COMPTABLE",
    "BIBLIOTHECAIRE",
    "INFORMATICIEN",
    "SURVEILLANT",
    "OPERATEUR",
)

# Sujets d'examens : direction + enseignants uniquement.
# Un élève/parent authentifié ne doit jamais pouvoir lister ou télécharger un
# sujet d'examen (fuite possible avant l'épreuve).
EXAMENS_ROLES = (*ADMIN_TIER_ROLES, "ENSEIGNANT")

# ── Routes PROTÉGÉES par JWT (admin uniquement) ──
app.include_router(dashboard_router, dependencies=[Depends(get_current_user)])
app.include_router(eleves_router, dependencies=[Depends(get_current_user)])
app.include_router(enseignants_router, dependencies=[Depends(get_current_user)])
app.include_router(classes_router, dependencies=[Depends(get_current_user)])
app.include_router(inscriptions_router, dependencies=[Depends(get_current_user)])
app.include_router(evaluations_router, dependencies=[Depends(get_current_user)])
app.include_router(notes_router, dependencies=[Depends(get_current_user)])
# ── Routes COMPTABILITÉ / FINANCE / RH / PRÉSENCES AGENTS (rôles restreints) ──
app.include_router(finance_router, dependencies=[Depends(require_roles(*FINANCE_ROLES))])
app.include_router(comptabilite_router, dependencies=[Depends(require_roles(*FINANCE_ROLES))])
app.include_router(vie_scolaire_router, dependencies=[Depends(get_current_user)])
app.include_router(parametrage_router, dependencies=[Depends(get_current_user)])
app.include_router(securite_router, dependencies=[Depends(get_current_user)])
app.include_router(matieres_router, dependencies=[Depends(get_current_user)])
app.include_router(emploi_router, dependencies=[Depends(get_current_user)])
app.include_router(comm_router, dependencies=[Depends(get_current_user)])
app.include_router(examens_router, dependencies=[Depends(require_roles(*EXAMENS_ROLES))])
app.include_router(devoirs_router, dependencies=[Depends(get_current_user)])
app.include_router(photos_router, dependencies=[Depends(get_current_user)])
app.include_router(fournitures_router, dependencies=[Depends(get_current_user)])
app.include_router(personnel_router, dependencies=[Depends(require_roles(*PERSONNEL_ROLES))])
app.include_router(presence_agent_router, dependencies=[Depends(get_current_user)])
app.include_router(pointage_eleves_router, dependencies=[Depends(get_current_user)])
app.include_router(evenements_router, dependencies=[Depends(get_current_user)])
app.include_router(activites_router, dependencies=[Depends(get_current_user)])
app.include_router(bibliotheque_router)
app.include_router(informatique_router)

# ── Routes PUBLIQUES (gèrent leur propre authentification) ──
app.include_router(auth_router)           # Login admin → retourne le JWT
app.include_router(parent_portal_router)  # Login parent → son propre JWT
app.include_router(teacher_portal_router) # Login enseignant → son propre JWT
app.include_router(eleve_portal_router)   # Login élève → son propre JWT
app.include_router(parametrage_public_router) # GET établissement + settings (sans JWT)

# Servir les fichiers uploadés avec support CORS pour permettre l'exportation PDF/canvas côté client
from fastapi.staticfiles import StaticFiles
import os

class CORSStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "photos", "eleves"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "photos", "enseignants"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "photos", "parents"), exist_ok=True)
app.mount("/uploads", CORSStaticFiles(directory=uploads_dir), name="uploads")


@app.get("/", tags=["Système"])
def root():
    return {
        "application": "SMARTSCHOOL ERP",
        "version": "1.0.0",
        "documentation": "/docs",
        "status": "operational"
    }


@app.get("/health", tags=["Système"])
def health():
    return {"status": "ok", "database": "connected"}
