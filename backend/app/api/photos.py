"""
API: Photo Upload & Management
Routes:
  GET  /api/photos/galerie/all                        → Gallery (all photos)
  POST /api/photos/upload/{entity_type}/{entity_id}   → Upload photo
  GET  /api/photos/{entity_type}/{entity_id}           → Get photo URL
  DELETE /api/photos/{entity_type}/{entity_id}         → Delete photo
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.auth import require_etablissement
import os, shutil, uuid

router = APIRouter(prefix="/api/photos", tags=["Photos"])

UPLOAD_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "photos")

ENTITY_MAP = {
    "eleve": {"table": "ss_eleves", "pk": "eleve_id", "folder": "eleves"},
    "enseignant": {"table": "ss_enseignants", "pk": "enseignant_id", "folder": "enseignants"},
    "parent": {"table": "ss_parents", "pk": "parent_id", "folder": "parents"},
}

RACINE_PROJET = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _chemin_absolu(file_path: str) -> str:
    """Convertit une URL publique (/uploads/...) en chemin disque."""
    return os.path.join(RACINE_PROJET, file_path.lstrip("/"))


# ── Isolation par établissement (Lot 9) ───────────────────────────────────
# Ce module s'appuie sur du SQL brut : les vérifications sont donc écrites en
# SQL, au plus près de chaque requête. `parent` n'a pas de colonne
# etablissement_id : il est rattaché via ses enfants (EleveParent -> Eleve),
# comme au Lot 5.

def _entite_appartient_a_etablissement(db: Session, entity_type: str, entity_id: int, etablissement_id: int) -> bool:
    if entity_type == "eleve":
        row = db.execute(text(
            "SELECT 1 FROM ss_eleves WHERE eleve_id = :id AND etablissement_id = :etab"
        ), {"id": entity_id, "etab": etablissement_id}).fetchone()
    elif entity_type == "enseignant":
        row = db.execute(text(
            "SELECT 1 FROM ss_enseignants WHERE enseignant_id = :id AND etablissement_id = :etab"
        ), {"id": entity_id, "etab": etablissement_id}).fetchone()
    elif entity_type == "parent":
        row = db.execute(text(
            "SELECT 1 FROM ss_eleve_parent ep "
            "JOIN ss_eleves e ON e.eleve_id = ep.eleve_id "
            "WHERE ep.parent_id = :id AND e.etablissement_id = :etab LIMIT 1"
        ), {"id": entity_id, "etab": etablissement_id}).fetchone()
    else:
        return False
    return row is not None


def _exiger_entite_de_letablissement(db: Session, entity_type: str, entity_id: int, etablissement_id: int) -> None:
    if not _entite_appartient_a_etablissement(db, entity_type, entity_id, etablissement_id):
        raise HTTPException(404, "Entité non trouvée")


# ================================================================
# GALERIE — Must be BEFORE /{entity_type}/{entity_id} to avoid
# FastAPI matching "galerie" as entity_type and "all" as entity_id
# ================================================================

@router.get("/galerie/all")
def get_galerie(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """Galerie admin des photos — restreinte à CET établissement (Lot 9).

    Avant : listait tous les élèves, enseignants et parents de la plateforme
    (nom, prénom, matricule, téléphone parent, photo) sans aucun filtre.
    """
    # Élèves avec classe
    eleves = db.execute(text("""
        SELECT e.eleve_id, e.nom, e.prenom, e.sexe, e.matricule, e.photo_url, e.statut,
               COALESCE(c.code, '?') as classe_code, COALESCE(c.libelle, 'Non inscrit') as classe
        FROM ss_eleves e
        LEFT JOIN ss_inscriptions i ON e.eleve_id = i.eleve_id AND i.statut = 'ACTIVE'
        LEFT JOIN ss_classes c ON i.classe_id = c.classe_id
        WHERE e.statut = 'ACTIF' AND e.etablissement_id = :etab
        ORDER BY c.code, e.nom, e.prenom
    """), {"etab": etablissement_id}).fetchall()

    # Enseignants
    enseignants = db.execute(text("""
        SELECT enseignant_id, nom, prenom, sexe, matricule, photo_url, specialite, statut
        FROM ss_enseignants WHERE statut = 'ACTIF' AND etablissement_id = :etab
        ORDER BY nom, prenom
    """), {"etab": etablissement_id}).fetchall()

    # Parents — rattachés via leurs enfants de cet établissement
    parents = db.execute(text("""
        SELECT DISTINCT p.parent_id, p.nom, p.prenom, p.sexe, p.telephone_1, p.photo_url,
               p.profession, p.statut
        FROM ss_parents p
        JOIN ss_eleve_parent ep ON ep.parent_id = p.parent_id
        JOIN ss_eleves e ON e.eleve_id = ep.eleve_id
        WHERE p.statut = 'ACTIF' AND e.etablissement_id = :etab
        ORDER BY p.nom, p.prenom
    """), {"etab": etablissement_id}).fetchall()

    # Group élèves par classe
    classes_map: dict = {}
    for e in eleves:
        cls_key = e[7]  # classe_code
        if cls_key not in classes_map:
            classes_map[cls_key] = {"code": cls_key, "libelle": e[8], "eleves": []}
        classes_map[cls_key]["eleves"].append({
            "eleve_id": e[0], "nom": e[1], "prenom": e[2], "sexe": e[3],
            "matricule": e[4], "photo_url": e[5], "statut": e[6],
        })

    return {
        "eleves_par_classe": list(classes_map.values()),
        "enseignants": [{
            "enseignant_id": e[0], "nom": e[1], "prenom": e[2], "sexe": e[3],
            "matricule": e[4], "photo_url": e[5], "specialite": e[6], "statut": e[7],
        } for e in enseignants],
        "parents": [{
            "parent_id": p[0], "nom": p[1], "prenom": p[2], "sexe": p[3],
            "telephone_1": p[4], "photo_url": p[5], "profession": p[6], "statut": p[7],
        } for p in parents],
        "stats": {
            "total_eleves": len(eleves),
            "eleves_avec_photo": sum(1 for e in eleves if e[5]),
            "total_enseignants": len(enseignants),
            "enseignants_avec_photo": sum(1 for e in enseignants if e[5]),
            "total_parents": len(parents),
            "parents_avec_photo": sum(1 for p in parents if p[5]),
        }
    }


# ================================================================
# UPLOAD (Mise à jour avec file d'attente)
# ================================================================

def _valider_fichier_image(fichier: UploadFile) -> str:
    """Contrôles d'extension et de type MIME communs aux deux routes d'upload."""
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(fichier.filename)[1].lower() if fichier.filename else ".jpg"
    if ext not in allowed_ext:
        raise HTTPException(400, f"Format non supporté. Utilisez: {', '.join(allowed_ext)}")

    allowed_mime = {"image/jpeg", "image/png", "image/webp"}
    if fichier.content_type and fichier.content_type not in allowed_mime:
        raise HTTPException(400, f"Type MIME non supporté: {fichier.content_type}")
    return ext


@router.post("/upload/{entity_type}/{entity_id}")
async def upload_photo(
    entity_type: str, entity_id: int, fichier: UploadFile = File(...),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, f"Type invalide. Utilisez: {list(ENTITY_MAP.keys())}")

    # L'entité ciblée doit appartenir à cet établissement (Lot 9) — avant,
    # on pouvait remplacer la photo de profil de n'importe quel élève,
    # enseignant ou parent de la plateforme.
    _exiger_entite_de_letablissement(db, entity_type, entity_id, etablissement_id)

    cfg = ENTITY_MAP[entity_type]
    ext = _valider_fichier_image(fichier)

    MAX_SIZE = 5 * 1024 * 1024
    contents = await fichier.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "Fichier trop volumineux. Maximum: 5 Mo")
    await fichier.seek(0)

    folder = os.path.join(UPLOAD_BASE, cfg["folder"])
    os.makedirs(folder, exist_ok=True)

    # For enseignants, direct upload
    if entity_type == "enseignant":
        for old in os.listdir(folder):
            if old.startswith(f"enseignant_{entity_id}.") or old.startswith(f"enseignant_{entity_id}_"):
                os.remove(os.path.join(folder, old))
        filename = f"enseignant_{entity_id}{ext}"
        filepath = os.path.join(folder, filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(fichier.file, f)
        photo_url = f"/uploads/photos/enseignants/{filename}"

        from app.models.academique import Enseignant
        entity = db.query(Enseignant).filter(Enseignant.enseignant_id == entity_id).first()
        if entity:
            entity.photo_url = photo_url
            db.commit()
        return {"photo_url": photo_url, "message": "Photo uploadée avec succès"}

    # For eleve/parent -> pending
    filename = f"pending_{entity_type}_{entity_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(folder, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(fichier.file, f)

    photo_url = f"/uploads/photos/{cfg['folder']}/{filename}"

    from app.models.academique import PhotoEnAttente
    # Delete previous pending photo if exists
    old_pending = db.query(PhotoEnAttente).filter_by(entity_type=entity_type, entity_id=entity_id, statut='EN_ATTENTE').first()
    if old_pending:
        # Try to remove old file
        old_path = _chemin_absolu(old_pending.file_path)
        if os.path.exists(old_path):
            os.remove(old_path)
        db.delete(old_pending)

    new_pending = PhotoEnAttente(
        entity_type=entity_type,
        entity_id=entity_id,
        uploader_type=entity_type,
        uploader_id=entity_id,
        file_path=photo_url,
        statut="EN_ATTENTE"
    )
    db.add(new_pending)

    # Notify admin
    if entity_type == "eleve":
        row = db.execute(text("SELECT nom, prenom FROM ss_eleves WHERE eleve_id = :id"), {"id": entity_id}).fetchone()
        target_name = f"{row[1]} {row[0]}" if row else "Élève"
    else:
        row = db.execute(text("SELECT nom, prenom FROM ss_parents WHERE parent_id = :id"), {"id": entity_id}).fetchone()
        target_name = f"{row[1]} {row[0]}" if row else "Parent"

    sujet = f"📷 Nouvelle photo en attente de validation ({target_name})"
    contenu_base = f"Une nouvelle photo de profil a été soumise par {target_name} et nécessite votre validation."
    contenu = f"{contenu_base}\n---PHOTO_META---\nentity_id={entity_id}\nentity_type={entity_type}\ntarget_name={target_name}"

    # ss_messages.etablissement_id est NOT NULL depuis le Lot 5 : la
    # notification est rattachée à l'établissement du compte appelant.
    db.execute(text("""
        INSERT INTO ss_messages (etablissement_id, expediteur_type, expediteur_id, destinataire_type, destinataire_id, objet_type, sujet, contenu, statut)
        VALUES (:etab, 'SYSTEME', NULL, 'ADMIN', NULL, 'GENERAL', :sujet, :contenu, 'ENVOYE')
    """), {"etab": etablissement_id, "sujet": sujet, "contenu": contenu})

    db.commit()
    return {"photo_url": photo_url, "message": "Photo envoyée et en attente de validation par l'administration."}


@router.post("/parent-upload/{entity_type}/{entity_id}")
async def parent_upload_photo(
    entity_type: str, entity_id: int, parent_id: int = 0, fichier: UploadFile = File(...),
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, f"Type invalide. Utilisez: {list(ENTITY_MAP.keys())}")

    _exiger_entite_de_letablissement(db, entity_type, entity_id, etablissement_id)
    # Le parent déclaré comme uploadeur doit lui aussi relever de cet
    # établissement (Lot 9) : sinon on attribuerait l'envoi à un parent d'une
    # autre école.
    if parent_id > 0:
        _exiger_entite_de_letablissement(db, "parent", parent_id, etablissement_id)

    cfg = ENTITY_MAP[entity_type]
    ext = _valider_fichier_image(fichier)

    MAX_SIZE = 5 * 1024 * 1024
    contents = await fichier.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "Fichier trop volumineux. Maximum: 5 Mo")
    await fichier.seek(0)

    folder = os.path.join(UPLOAD_BASE, cfg["folder"])
    os.makedirs(folder, exist_ok=True)

    filename = f"pending_{entity_type}_{entity_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(folder, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(fichier.file, f)

    photo_url = f"/uploads/photos/{cfg['folder']}/{filename}"

    from app.models.academique import PhotoEnAttente
    old_pending = db.query(PhotoEnAttente).filter_by(entity_type=entity_type, entity_id=entity_id, statut='EN_ATTENTE').first()
    if old_pending:
        old_path = _chemin_absolu(old_pending.file_path)
        if os.path.exists(old_path):
            os.remove(old_path)
        db.delete(old_pending)

    new_pending = PhotoEnAttente(
        entity_type=entity_type,
        entity_id=entity_id,
        uploader_type="parent",
        uploader_id=parent_id,
        file_path=photo_url,
        statut="EN_ATTENTE"
    )
    db.add(new_pending)

    # Notification
    if entity_type == "eleve":
        row = db.execute(text("SELECT nom, prenom FROM ss_eleves WHERE eleve_id = :id"), {"id": entity_id}).fetchone()
        target_name = f"{row[1]} {row[0]}" if row else "Élève"
    elif entity_type == "parent":
        row = db.execute(text("SELECT nom, prenom FROM ss_parents WHERE parent_id = :id"), {"id": entity_id}).fetchone()
        target_name = f"{row[1]} {row[0]}" if row else "Parent"
    else:
        target_name = "Inconnu"

    parent_row = None
    if parent_id > 0:
        parent_row = db.execute(text("SELECT nom, prenom FROM ss_parents WHERE parent_id = :id"), {"id": parent_id}).fetchone()
    parent_name = f"{parent_row[1]} {parent_row[0]}" if parent_row else "Un parent"

    if entity_type == "parent":
        sujet = f"📷 {parent_name} a envoyé sa photo"
        contenu_base = f"Le parent {parent_name} a envoyé sa photo, elle est en attente de validation."
    else:
        sujet = f"📷 Photo reçue pour {target_name}"
        contenu_base = f"Le parent {parent_name} a envoyé la photo de {target_name}, elle est en attente de validation."

    contenu = f"{contenu_base}\n---PHOTO_META---\nentity_id={entity_id}\nentity_type={entity_type}\ntarget_name={target_name}"

    db.execute(text("""
        INSERT INTO ss_messages (etablissement_id, expediteur_type, expediteur_id, destinataire_type, destinataire_id, objet_type, sujet, contenu, statut)
        VALUES (:etab, 'PARENT', :parent_id, 'ADMIN', NULL, 'GENERAL', :sujet, :contenu, 'ENVOYE')
    """), {"etab": etablissement_id, "parent_id": parent_id, "sujet": sujet, "contenu": contenu})

    db.commit()
    return {"photo_url": photo_url, "message": "Photo envoyée et en attente de validation par l'administration."}


# ================================================================
# VALIDATION SYSTEM
# ================================================================

@router.get("/pending/all")
def get_all_pending(
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    """File de validation des photos — restreinte à CET établissement (Lot 9).

    PhotoEnAttente n'a pas de colonne etablissement_id et son couple
    (entity_type, entity_id) est générique : le filtrage se fait en Python
    via _entite_appartient_a_etablissement, entité par entité.
    """
    from app.models.academique import PhotoEnAttente

    pending = db.query(PhotoEnAttente).filter(PhotoEnAttente.statut == 'EN_ATTENTE').order_by(PhotoEnAttente.date_upload.desc()).all()
    result = []
    for p in pending:
        if not _entite_appartient_a_etablissement(db, p.entity_type, p.entity_id, etablissement_id):
            continue
        # get name
        name = "Inconnu"
        if p.entity_type == 'eleve':
            row = db.execute(text("SELECT nom, prenom FROM ss_eleves WHERE eleve_id = :id"), {"id": p.entity_id}).fetchone()
            if row: name = f"{row[1]} {row[0]}"
        elif p.entity_type == 'parent':
            row = db.execute(text("SELECT nom, prenom FROM ss_parents WHERE parent_id = :id"), {"id": p.entity_id}).fetchone()
            if row: name = f"{row[1]} {row[0]}"

        uploader_name = "Lui-même"
        if p.uploader_type == 'parent' and p.entity_type == 'eleve':
            row = db.execute(text("SELECT nom, prenom FROM ss_parents WHERE parent_id = :id"), {"id": p.uploader_id}).fetchone()
            if row: uploader_name = f"Parent: {row[1]} {row[0]}"

        result.append({
            "photo_id": p.photo_id,
            "entity_type": p.entity_type,
            "entity_id": p.entity_id,
            "name": name,
            "uploader_name": uploader_name,
            "file_path": p.file_path,
            "date_upload": p.date_upload
        })
    return result


@router.get("/pending/{entity_type}/{entity_id}")
def get_entity_pending(
    entity_type: str, entity_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    from app.models.academique import PhotoEnAttente

    _exiger_entite_de_letablissement(db, entity_type, entity_id, etablissement_id)
    p = db.query(PhotoEnAttente).filter_by(entity_type=entity_type, entity_id=entity_id, statut='EN_ATTENTE').first()
    if p:
        return {"photo_id": p.photo_id, "file_path": p.file_path, "date_upload": p.date_upload}
    return None


@router.get("/parent-pending/{parent_id}")
def get_parent_pending(
    parent_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    from app.models.academique import PhotoEnAttente
    from sqlalchemy import or_, and_

    _exiger_entite_de_letablissement(db, "parent", parent_id, etablissement_id)
    # Enfants restreints à cet établissement (Cas B : un parent
    # multi-écoles ne doit pas exposer ici ses enfants d'une autre école)
    children_ids = [r[0] for r in db.execute(text(
        "SELECT ep.eleve_id FROM ss_eleve_parent ep "
        "JOIN ss_eleves e ON e.eleve_id = ep.eleve_id "
        "WHERE ep.parent_id = :pid AND e.etablissement_id = :etab"
    ), {"pid": parent_id, "etab": etablissement_id}).fetchall()]
    conditions = [and_(PhotoEnAttente.entity_type == 'parent', PhotoEnAttente.entity_id == parent_id)]
    if children_ids:
        conditions.append(and_(PhotoEnAttente.entity_type == 'eleve', PhotoEnAttente.entity_id.in_(children_ids)))
    pending = db.query(PhotoEnAttente).filter(
        PhotoEnAttente.statut == 'EN_ATTENTE',
        or_(*conditions)
    ).all()
    return [
        {
            "photo_id": p.photo_id,
            "entity_type": p.entity_type,
            "entity_id": p.entity_id,
            "file_path": p.file_path,
            "date_upload": str(p.date_upload) if p.date_upload else None
        }
        for p in pending
    ]


@router.post("/validate/{photo_id}")
def validate_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    from app.models.academique import PhotoEnAttente, Eleve, Parent

    p = db.query(PhotoEnAttente).filter_by(photo_id=photo_id, statut='EN_ATTENTE').first()
    if not p:
        raise HTTPException(404, "Photo introuvable")
    _exiger_entite_de_letablissement(db, p.entity_type, p.entity_id, etablissement_id)

    cfg = ENTITY_MAP[p.entity_type]
    ext = os.path.splitext(p.file_path)[1]

    # New final filename
    filename = f"{p.entity_type}_{p.entity_id}{ext}"
    folder = os.path.join(UPLOAD_BASE, cfg["folder"])

    # Clean old final photos
    for old in os.listdir(folder):
        if old.startswith(f"{p.entity_type}_{p.entity_id}.") or old.startswith(f"{p.entity_type}_{p.entity_id}_"):
            old_file_path = os.path.join(folder, old)
            # don't delete if it's the pending file (although it shouldn't match)
            if old_file_path != _chemin_absolu(p.file_path):
                os.remove(old_file_path)

    # Rename pending file to final
    old_path = _chemin_absolu(p.file_path)
    new_path = os.path.join(folder, filename)
    if os.path.exists(old_path):
        os.rename(old_path, new_path)

    final_url = f"/uploads/photos/{cfg['folder']}/{filename}"

    # Update entity DB
    if p.entity_type == 'eleve':
        entity = db.query(Eleve).filter_by(eleve_id=p.entity_id).first()
        if entity: entity.photo_url = final_url
    elif p.entity_type == 'parent':
        entity = db.query(Parent).filter_by(parent_id=p.entity_id).first()
        if entity: entity.photo_url = final_url

    db.delete(p)
    db.commit()
    return {"message": "Photo validée"}


@router.post("/reject/{photo_id}")
def reject_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    from app.models.academique import PhotoEnAttente

    p = db.query(PhotoEnAttente).filter_by(photo_id=photo_id).first()
    if not p:
        raise HTTPException(404, "Photo introuvable")
    _exiger_entite_de_letablissement(db, p.entity_type, p.entity_id, etablissement_id)

    old_path = _chemin_absolu(p.file_path)
    if os.path.exists(old_path):
        os.remove(old_path)

    db.delete(p)
    db.commit()
    return {"message": "Photo rejetée/supprimée"}


# ================================================================
# GET / DELETE
# ================================================================

@router.get("/{entity_type}/{entity_id}")
def get_photo(
    entity_type: str, entity_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, "Type invalide")
    cfg = ENTITY_MAP[entity_type]

    _exiger_entite_de_letablissement(db, entity_type, entity_id, etablissement_id)
    row = db.execute(
        text(f"SELECT photo_url FROM {cfg['table']} WHERE {cfg['pk']} = :id"),
        {"id": entity_id}
    ).fetchone()
    if not row:
        raise HTTPException(404, "Entité introuvable")
    return {"photo_url": row[0]}


@router.delete("/{entity_type}/{entity_id}")
def delete_photo(
    entity_type: str, entity_id: int,
    db: Session = Depends(get_db),
    etablissement_id: int = Depends(require_etablissement),
):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, "Type invalide")
    cfg = ENTITY_MAP[entity_type]

    _exiger_entite_de_letablissement(db, entity_type, entity_id, etablissement_id)
    row = db.execute(
        text(f"SELECT photo_url FROM {cfg['table']} WHERE {cfg['pk']} = :id"),
        {"id": entity_id}
    ).fetchone()
    if row and row[0]:
        full_path = _chemin_absolu(row[0])
        if os.path.exists(full_path):
            os.remove(full_path)
        db.execute(
            text(f"UPDATE {cfg['table']} SET photo_url = NULL WHERE {cfg['pk']} = :id"),
            {"id": entity_id}
        )
        db.commit()
    return {"message": "Photo supprimée"}
