"""
SMARTSCHOOL ERP — Point d'entrée principal FastAPI
Assemble tous les routers de chaque module.
"""
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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
from app.api.sync import router as sync_router
from app.api.seances import router as seances_teacher_router, router_admin as seances_admin_router
from app.api.portail_eleve import router as eleve_portal_router
from app.api.auth import router as auth_router
from app.api.inscription_etablissement import router as inscription_etablissement_router
from app.api.incidents import router as incidents_router
from app.api.export_donnees import router as export_router
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
from app.api.promotion import router as promotion_router
from app.api.annee_scolaire import router as annee_scolaire_router
from app.api.reinscription import router as reinscription_router
from app.api.tasks import router as tasks_router
from app.api.monitoring import router as monitoring_router


# Création des tables au démarrage
Base.metadata.create_all(bind=engine)

# Mise à niveau AUTOMATIQUE du schéma : `create_all` ci-dessus crée les tables
# manquantes mais JAMAIS les colonnes manquantes d'une table déjà existante
# (c'est la cause des « column ... does not exist » en production). On complète
# donc les colonnes absentes des modèles à chaque démarrage — idempotent
# (ADD COLUMN IF NOT EXISTS), purement additif, aucune donnée supprimée. Ainsi
# chaque redéploiement synchronise la base tout seul. Encapsulé : une migration
# qui échoue (ex. connexion en mode pooler transactionnel) ne doit JAMAIS
# empêcher l'application de démarrer.
try:
    from migrations.rattraper_colonnes_manquantes import appliquer_colonnes_manquantes
    _ajoutees, _ignorees = appliquer_colonnes_manquantes(engine, appliquer=True)
    if _ajoutees:
        print(f"[SCHEMA] {len(_ajoutees)} colonne(s) ajoutée(s) automatiquement au démarrage.")
    if _ignorees:
        print(f"[SCHEMA] {len(_ignorees)} colonne(s) NOT NULL à renseigner à la main "
              "(voir migrations/rattraper_colonnes_manquantes.py).")
except Exception as _e:  # noqa: BLE001 — le démarrage prime sur la migration
    print(f"[SCHEMA] Mise à niveau auto du schéma ignorée : {_e}")

# Colonnes rendues OPTIONNELLES après coup (le modèle passe nullable=True mais la
# base garde son ancienne contrainte NOT NULL). `create_all` ne touche jamais une
# colonne existante : on lève donc explicitement la contrainte, de façon
# idempotente. Cas : ss_eleves.date_naissance — à l'import en masse, seuls
# classe + nom + prénom sont exigés, la date est complétée plus tard.
try:
    import sqlalchemy as _sa
    if engine.dialect.name == "postgresql":
        with engine.begin() as _conn:
            _conn.execute(_sa.text("ALTER TABLE ss_eleves ALTER COLUMN date_naissance DROP NOT NULL"))
        print("[SCHEMA] ss_eleves.date_naissance : contrainte NOT NULL levée (optionnelle).")
except Exception as _e:  # noqa: BLE001
    print(f"[SCHEMA] Assouplissement date_naissance ignoré : {_e}")


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


# ── Combien de requêtes ce processus traite-t-il vraiment en même temps ? ──
#
# Toutes nos routes sont synchrones (`def`, pas `async def`) : FastAPI les
# exécute dans un pool de fils d'exécution qui en accepte 40 par défaut. Le
# pool de connexions à la base, lui, en offrait 10. Trente requêtes attendaient
# donc une connexion qui ne venait pas, et finissaient en erreur 500 au bout du
# délai d'attente — pas en lenteur, en panne.
#
# On aligne les deux. Une requête de trop attend alors son tour ICI, sans
# détenir de connexion à la base, et repart dès qu'une place se libère. C'est
# une file d'attente équitable au lieu d'une bousculade qui expire.
#
# `DB_CAPACITE` vient de app/core/database.py : c'est pool_size + max_overflow.
# Changer l'un sans l'autre recréerait exactement le déséquilibre corrigé ici,
# d'où la valeur unique et partagée.
@app.on_event("startup")
def _aligner_capacite_de_traitement() -> None:
    # `logging` plutôt qu'un `logger` de module : ce fichier n'en définit pas,
    # et un garde-fou qui journalise avec un nom inexistant empêche le
    # démarrage au lieu de le protéger — c'est exactement ce qui s'est produit
    # à la première écriture de cette fonction.
    import logging

    import anyio.to_thread

    from app.core.database import DB_CAPACITE

    journal = logging.getLogger("smartschool.capacite")
    try:
        limiteur = anyio.to_thread.current_default_thread_limiter()
        limiteur.total_tokens = DB_CAPACITE
        journal.info(
            "Capacite du processus : %d requetes simultanees, alignee sur le "
            "pool de connexions.", DB_CAPACITE,
        )
    except Exception as exc:  # pragma: no cover - dépend de la version d'anyio
        # Ne jamais empêcher le démarrage pour un réglage de performance : sans
        # cet alignement l'application fonctionne, elle encaisse simplement
        # moins de monde.
        journal.warning("Alignement de la capacite impossible : %s", exc)


# ── CORS ──
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100,http://localhost:3300,http://127.0.0.1:3300")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-Total-Count", "X-Meilleure-Moyenne", "X-Plus-Faible-Moyenne", "X-Moyenne-Classe"],
)


# ── Compression (Étape H) ──
# Gzip uniquement : Brotli nécessiterait un reverse proxy/CDN devant l'app
# (hors de ce dépôt — aucun nginx/Caddy/Traefik trouvé ici), pas une
# dépendance Python supplémentaire pour un gain marginal en plus de gzip.
# `minimum_size` = défaut Starlette (500 octets) : pas la peine de
# compresser les réponses déjà minuscules (overhead CPU > gain réseau).
# Compromis assumé : les endpoints PDF/photos (déjà compressés en interne —
# `/eleves/{id}/certificat-scolarite/pdf`, `/photos/...`) passent aussi par
# ce middleware, Starlette ne filtrant pas par Content-Type. Gzip ne les
# réduira quasiment pas (coût CPU mineur, pas un problème de correction) ;
# les exclure demanderait un middleware sur-mesure pour un gain marginal —
# non fait, cohérent avec "solution la moins invasive". Le vrai bénéfice
# visé est le JSON des listes (élèves, classes...), potentiellement gros à
# l'échelle réelle (5000 élèves) sur une connexion instable.
app.add_middleware(GZipMiddleware, minimum_size=500)


# ── Rate Limiting ──
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# ============================================================================
# ENREGISTREMENT DE TOUS LES ROUTERS
# ============================================================================
from fastapi import Depends, HTTPException
from app.core.auth import get_current_user, require_module, require_roles, ADMIN_TIER_ROLES

# Rôles autorisés sur les modules Finance / Comptabilité.
#
# LA CAISSE N'EST PAS UN DROIT QUI SE DÉLÈGUE AVEC LE RESTE
# Le DIRECTEUR_NIVEAU est le bras pédagogique de la direction : l'école lui
# confie les évaluations, la centralisation des notes, les bulletins, les
# résultats de fin d'année, le centre des examens et l'archive scolaire. Il a
# donc les mêmes droits que l'administrateur — SAUF la comptabilité. Cet
# écran-là reste à l'administrateur, à la direction générale et au comptable,
# et à personne d'autre.
#
# Il faisait partie de FINANCE_ROLES par simple héritage d'ADMIN_TIER_ROLES :
# le frontend lui fermait /comptabilite, mais l'API lui ouvrait les
# encaissements, les salaires et le grand livre à qui savait appeler la route.
# Un blocage qui n'existe que dans le navigateur n'est pas un blocage.
FINANCE_ROLES = ("SUPER_ADMIN", "ADMIN", "FONDATEUR", "DG", "COMPTABLE")


def exige_acces_finance(current_user: dict = Depends(get_current_user)) -> dict:
    """Accès à la finance — avec une exception pour le directeur général.

    ADMIN, FONDATEUR, COMPTABLE et SUPER_ADMIN y ont droit sans condition. Le
    DG, lui, n'y accède que si le fondateur l'a autorisé à sa création
    (`acces_comptabilite == 'O'`, la valeur par défaut). Un DG à qui le
    fondateur a fermé la comptabilité se voit répondre 403 côté serveur — pas
    seulement un menu caché, un vrai blocage.
    """
    from app.core.auth import roles_du_compte
    roles = roles_du_compte(current_user)
    if not (roles & set(FINANCE_ROLES)):
        raise HTTPException(status_code=403, detail="Acces refuse : privileges insuffisants pour cette ressource")
    # Le seul rôle finance soumis au choix du fondateur est le DG.
    if "DG" in roles and not (roles & {"SUPER_ADMIN", "ADMIN", "FONDATEUR", "COMPTABLE"}):
        if (current_user.get("acces_comptabilite") or "O") != "O":
            raise HTTPException(status_code=403, detail="Ce compte n'a pas acces a la comptabilite.")
    return current_user

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

# ── Matrice de permissions configurable (Paramètres > Sécurité) ──
# `require_module` applique la matrice module × action de `ss_permissions`.
# Elle ne peut que RETIRER un accès accordé par le rôle : cocher une case ne
# donne jamais un droit que le rôle statique refuse (voir app/core/auth.py).
# Seuls les modules déclarés dans `securite.py::SYSTEM_MODULES` sont câblés —
# ce sont les seuls que l'interface permet de configurer.
_MOD_ELEVES = require_module("eleves")
_MOD_ENSEIGNANTS = require_module("enseignants")
_MOD_NOTES = require_module("notes")
_MOD_FINANCE = require_module("finance")
_MOD_COMPTABILITE = require_module("comptabilite")
_MOD_VIE_SCOLAIRE = require_module("vie_scolaire")
_MOD_EMPLOI = require_module("emploi_du_temps")
_MOD_PARAMETRES = require_module("parametres")
_MOD_SECURITE = require_module("securite")

# ── Routes PROTÉGÉES par JWT (admin uniquement) ──
# ════════════════════════════════════════════════════════════════════════
# FILET À ERREURS — pour que l'éditeur sache avant les écoles
# ════════════════════════════════════════════════════════════════════════
# Sans lui, une erreur non gérée renvoyait une page cassée à l'école et ne
# laissait aucune trace : l'éditeur ne l'apprenait qu'en étant appelé.
#
# Ce gestionnaire n'intercepte QUE les erreurs non gérées. Les `HTTPException`
# (404, 403, 409…) sont des réponses voulues, pas des incidents — les
# enregistrer noierait les vrais bugs.

@app.exception_handler(Exception)
async def enregistrer_incident(request: Request, exc: Exception):
    import traceback as _traceback

    from app.api.incidents import enregistrer as _enregistrer
    from app.core.auth import decode_token as _decode_token
    from app.core.database import SessionLocal as _SessionLocal

    # L'identité vient du jeton, jamais d'un en-tête libre. Elle est
    # facultative : une erreur peut survenir avant toute connexion (page de
    # login, inscription publique).
    etablissement_id, role = None, None
    entete = request.headers.get("authorization") or ""
    if entete.lower().startswith("bearer "):
        try:
            charge = _decode_token(entete.split(" ", 1)[1]) or {}
            etablissement_id = charge.get("etablissement_id")
            role = charge.get("role") or charge.get("type")
        except Exception:
            pass

    # Session dédiée : celle de la requête est très probablement dans un état
    # invalide, c'est elle qui vient d'échouer.
    db = _SessionLocal()
    try:
        _enregistrer(
            db,
            route=str(request.url.path),
            methode=request.method,
            type_erreur=type(exc).__name__,
            message=str(exc),
            etablissement_id=etablissement_id,
            role=role,
            trace="".join(_traceback.format_exception(type(exc), exc, exc.__traceback__)),
        )
    finally:
        db.close()

    # L'utilisateur reçoit une phrase, pas une trace technique : elle ne
    # l'aiderait pas et exposerait la structure interne.
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Une erreur est survenue. L'équipe SmartSchool en a été "
                      "informée automatiquement. Réessayez dans un instant."
        },
    )

app.include_router(dashboard_router, dependencies=[Depends(get_current_user)])
app.include_router(eleves_router, dependencies=[Depends(get_current_user), Depends(_MOD_ELEVES)])
app.include_router(enseignants_router, dependencies=[Depends(get_current_user), Depends(_MOD_ENSEIGNANTS)])
app.include_router(classes_router, dependencies=[Depends(get_current_user)])
app.include_router(inscriptions_router, dependencies=[Depends(get_current_user)])
app.include_router(promotion_router, dependencies=[Depends(get_current_user)])
app.include_router(annee_scolaire_router, dependencies=[Depends(get_current_user)])
app.include_router(reinscription_router, dependencies=[Depends(get_current_user)])
app.include_router(evaluations_router, dependencies=[Depends(get_current_user), Depends(_MOD_NOTES)])
app.include_router(notes_router, dependencies=[Depends(get_current_user), Depends(_MOD_NOTES)])
# ── Routes COMPTABILITÉ / FINANCE / RH / PRÉSENCES AGENTS (rôles restreints) ──
app.include_router(finance_router, dependencies=[Depends(exige_acces_finance), Depends(_MOD_FINANCE)])
app.include_router(vie_scolaire_router, dependencies=[Depends(get_current_user), Depends(_MOD_VIE_SCOLAIRE)])
app.include_router(seances_admin_router, dependencies=[Depends(get_current_user), Depends(_MOD_VIE_SCOLAIRE)])
app.include_router(parametrage_router, dependencies=[Depends(get_current_user), Depends(_MOD_PARAMETRES)])
# Sécurité & audit : rôles, permissions et journal d'audit. Seule la page
# admin /parametres/securite consomme ces routes (vérifié côté frontend), donc
# les restreindre à l'équipe de direction ne casse aucun autre écran. Avant,
# n'importe quel token valide — y compris ENSEIGNANT, PARENT ou ELEVE —
# pouvait lire le journal d'audit de son établissement et redéfinir ses rôles.
app.include_router(securite_router, dependencies=[Depends(require_roles(*ADMIN_TIER_ROLES)), Depends(_MOD_SECURITE)])
app.include_router(matieres_router, dependencies=[Depends(get_current_user)])
app.include_router(emploi_router, dependencies=[Depends(get_current_user), Depends(_MOD_EMPLOI)])
app.include_router(comm_router, dependencies=[Depends(get_current_user)])
app.include_router(examens_router, dependencies=[Depends(require_roles(*EXAMENS_ROLES))])
app.include_router(devoirs_router, dependencies=[Depends(get_current_user)])
app.include_router(photos_router, dependencies=[Depends(get_current_user)])
app.include_router(fournitures_router, dependencies=[Depends(get_current_user)])
app.include_router(personnel_router, dependencies=[Depends(require_roles(*PERSONNEL_ROLES))])
# Présences agents : même sensibilité que le module Personnel (historique de
# présence RH) — trouvé non restreint (get_current_user seul, comme
# finance/comptabilité/personnel l'étaient avant leur propre correctif,
# voir tests/test_rbac_modules_sensibles.py) en exécutant la suite complète
# pour la validation préproduction. N'importe quel token valide, y compris
# ENSEIGNANT/PARENT/ELEVE, pouvait consulter l'historique de présence du
# personnel de tout l'établissement.
app.include_router(presence_agent_router, dependencies=[Depends(require_roles(*PERSONNEL_ROLES))])
app.include_router(pointage_eleves_router, dependencies=[Depends(get_current_user)])
app.include_router(evenements_router, dependencies=[Depends(get_current_user)])
app.include_router(activites_router, dependencies=[Depends(get_current_user)])
app.include_router(bibliotheque_router)
app.include_router(informatique_router)
# Comptabilité générale (SYSCOHADA) : mêmes rôles que Finance, plus d'auth
# maison séparée — l'accès passe uniquement par le JWT principal.
app.include_router(comptabilite_router, dependencies=[Depends(exige_acces_finance), Depends(_MOD_COMPTABILITE)])
# Suivi des tâches asynchrones (Étape F) — un id de tâche valide suffit à
# consulter son statut, mais on exige quand même une session valide (pas
# de fuite d'information à un client non authentifié).
app.include_router(tasks_router, dependencies=[Depends(get_current_user)])
# Monitoring infrastructure (Étape G) — détails d'infra (profondeur de
# file, noms de workers) réservés aux rôles admin, jamais publics (à la
# différence de /health, volontairement minimal et sans authentification
# pour rester utilisable par le HEALTHCHECK Docker).
app.include_router(monitoring_router, dependencies=[Depends(require_roles(*ADMIN_TIER_ROLES))])

# ── Routes PUBLIQUES (gèrent leur propre authentification) ──
app.include_router(auth_router)           # Login admin → retourne le JWT
# Inscription publique d'une ecole (POST) + validation SUPER_ADMIN (GET/PUT).
# Pas de dependance globale : la route d'inscription est volontairement
# ouverte, les routes de validation portent _require_super_admin chacune.
app.include_router(inscription_etablissement_router)
# Incidents applicatifs : vue de l'editeur de la plateforme.
# _require_super_admin est pose sur chaque route du module.
app.include_router(incidents_router)
# Export des donnees de l'ecole : _require_admin + require_etablissement
# sont poses sur chaque route du module.
app.include_router(export_router)
app.include_router(parent_portal_router)  # Login parent → son propre JWT
app.include_router(teacher_portal_router) # Login enseignant → son propre JWT
app.include_router(sync_router)           # Sync offline-first — auth via _enseignant_auth par route (même pattern que teacher_portal_router)
app.include_router(seances_teacher_router) # Séances (portail enseignant) — auth via _enseignant_auth par route
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
    """Étape F : avant, ce endpoint renvoyait toujours "connected" sans
    rien vérifier — exactement l'anti-motif "API up ≠ tout opérationnel".
    Vérifie maintenant réellement PostgreSQL et Redis (ce dernier
    conditionne désormais aussi la file de tâches, pas seulement le cache
    dashboard finance)."""
    from sqlalchemy import text
    from app.core.database import SessionLocal
    from app.core.cache import redis_is_reachable

    db_status = "down"
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_status = "up"
        finally:
            db.close()
    except Exception:
        db_status = "down"

    # Étape G : redis_is_reachable() fait un vrai PING à chaque appel,
    # contrairement à get_redis_client() (pensé pour le cache) qui ne
    # détectait ni une panne survenue après un succès initial, ni un
    # retour après panne (voir app/core/cache.py).
    redis_status = "up" if redis_is_reachable() else "down"

    overall = "ok" if db_status == "up" else "degraded"
    return {"status": overall, "database": db_status, "redis": redis_status}
