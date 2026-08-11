"""
SMARTSCHOOL — Tâches worker (Étape F)
Fonctions exécutées par un worker RQ (`rq worker`, voir app/core/task_queue.py),
PAS par un process FastAPI — pas de `Depends(get_db)` ici, chaque tâche
ouvre et ferme sa propre session DB.

Une tâche ne doit JAMAIS faire confiance aveuglément aux identifiants
qu'elle a reçus dans son payload (ils ont pu être mis en file il y a
longtemps, l'état réel a pu changer) — elle revérifie contre la base au
moment de l'exécution, même principe que "le serveur reste l'autorité"
déjà appliqué partout ailleurs dans ce projet (sync.py, GET /eleves/delta).
"""
import os

from app.core.database import SessionLocal
from app.models.academique import Bulletin, Inscription, Classe


def generate_bulletin_pdf_task(bulletin_id: int, etablissement_id: int) -> dict:
    """Génère un bulletin PDF et l'écrit dans backend/uploads/bulletins/
    (convention de stockage déjà utilisée par le projet — pas de nouvelle
    brique, indépendant de Cloudflare R2 qui reste bloqué par les
    credentials). Réutilise `_build_bulletin_pdf_bytes`
    (backend/app/api/evaluations.py), extraite de l'ancien endpoint
    monolithique pour être appelable ici sans contexte de requête HTTP.

    Naturellement idempotente : régénérer le même bulletin produit le même
    fichier, sans effet de bord — aucune infrastructure d'idempotency-key
    nécessaire pour cette tâche (voir le plan Étape F, section J).
    """
    from app.api.evaluations import _build_bulletin_pdf_bytes  # import tardif : évite un cycle (evaluations.py importera task_queue pour enqueue)

    db = SessionLocal()
    try:
        bulletin = db.query(Bulletin).filter(Bulletin.bulletin_id == bulletin_id).first()
        if not bulletin:
            raise ValueError(f"Bulletin {bulletin_id} introuvable")

        inscription = db.query(Inscription).filter(
            Inscription.inscription_id == bulletin.inscription_id
        ).first()
        if not inscription:
            raise ValueError(f"Inscription introuvable pour le bulletin {bulletin_id}")

        classe = db.query(Classe).filter(Classe.classe_id == inscription.classe_id).first()
        if not classe:
            raise ValueError(f"Classe introuvable pour le bulletin {bulletin_id}")

        # Isolation multi-école (plan Étape F, section L) : refus net si la
        # tâche a été mise en file pour un établissement qui ne correspond
        # plus (ou n'a jamais correspondu) à la donnée réelle — jamais de
        # traitement silencieux "au cas où".
        if classe.etablissement_id != etablissement_id:
            raise PermissionError(
                f"Bulletin {bulletin_id} appartient à l'établissement {classe.etablissement_id}, "
                f"pas {etablissement_id} — tâche refusée."
            )

        pdf_bytes, nom_fichier = _build_bulletin_pdf_bytes(bulletin_id, db)

        # backend/app/tasks/bulletin_tasks.py -> backend/uploads/bulletins/
        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        upload_dir = os.path.join(backend_root, "uploads", "bulletins")
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, nom_fichier)
        with open(file_path, "wb") as f:
            f.write(pdf_bytes)

        return {"filename": nom_fichier, "download_url": f"/uploads/bulletins/{nom_fichier}"}
    finally:
        db.close()
