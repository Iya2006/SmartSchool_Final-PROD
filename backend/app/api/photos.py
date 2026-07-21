"""
API: Photo Upload & Management
Routes:
  GET  /api/photos/galerie/all                        → Gallery (all photos)
  POST /api/photos/upload/{entity_type}/{entity_id}   → Upload photo
  GET  /api/photos/{entity_type}/{entity_id}           → Get photo URL
  DELETE /api/photos/{entity_type}/{entity_id}         → Delete photo
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from sqlalchemy import text
from app.core.database import SessionLocal
import os, shutil, uuid

router = APIRouter(prefix="/api/photos", tags=["Photos"])

UPLOAD_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads", "photos")

ENTITY_MAP = {
    "eleve": {"table": "ss_eleves", "pk": "eleve_id", "folder": "eleves"},
    "enseignant": {"table": "ss_enseignants", "pk": "enseignant_id", "folder": "enseignants"},
    "parent": {"table": "ss_parents", "pk": "parent_id", "folder": "parents"},
}


# ================================================================
# GALERIE — Must be BEFORE /{entity_type}/{entity_id} to avoid
# FastAPI matching "galerie" as entity_type and "all" as entity_id
# ================================================================

@router.get("/galerie/all")
def get_galerie():
    """Retourne toutes les entités avec leur statut photo, classées pour la galerie admin."""
    db = SessionLocal()
    try:
        # Élèves avec classe
        eleves = db.execute(text("""
            SELECT e.eleve_id, e.nom, e.prenom, e.sexe, e.matricule, e.photo_url, e.statut,
                   COALESCE(c.code, '?') as classe_code, COALESCE(c.libelle, 'Non inscrit') as classe
            FROM ss_eleves e
            LEFT JOIN ss_inscriptions i ON e.eleve_id = i.eleve_id AND i.statut = 'ACTIVE'
            LEFT JOIN ss_classes c ON i.classe_id = c.classe_id
            WHERE e.statut = 'ACTIF'
            ORDER BY c.code, e.nom, e.prenom
        """)).fetchall()

        # Enseignants
        enseignants = db.execute(text("""
            SELECT enseignant_id, nom, prenom, sexe, matricule, photo_url, specialite, statut
            FROM ss_enseignants WHERE statut = 'ACTIF'
            ORDER BY nom, prenom
        """)).fetchall()

        # Parents
        parents = db.execute(text("""
            SELECT parent_id, nom, prenom, sexe, telephone_1, photo_url, profession, statut
            FROM ss_parents WHERE statut = 'ACTIF'
            ORDER BY nom, prenom
        """)).fetchall()

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
    finally:
        db.close()


# ================================================================
# UPLOAD (Mise à jour avec file d'attente)
# ================================================================

@router.post("/upload/{entity_type}/{entity_id}")
async def upload_photo(entity_type: str, entity_id: int, fichier: UploadFile = File(...)):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, f"Type invalide. Utilisez: {list(ENTITY_MAP.keys())}")

    cfg = ENTITY_MAP[entity_type]
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(fichier.filename)[1].lower() if fichier.filename else ".jpg"
    if ext not in allowed_ext:
        raise HTTPException(400, f"Format non supporté. Utilisez: {', '.join(allowed_ext)}")

    allowed_mime = {"image/jpeg", "image/png", "image/webp"}
    if fichier.content_type and fichier.content_type not in allowed_mime:
        raise HTTPException(400, f"Type MIME non supporté: {fichier.content_type}")

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
        db = SessionLocal()
        try:
            entity = db.query(Enseignant).filter(Enseignant.enseignant_id == entity_id).first()
            if entity:
                entity.photo_url = photo_url
                db.commit()
        finally:
            db.close()
        return {"photo_url": photo_url, "message": "Photo uploadée avec succès"}

    # For eleve/parent -> pending
    import uuid
    filename = f"pending_{entity_type}_{entity_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(folder, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(fichier.file, f)
    
    photo_url = f"/uploads/photos/{cfg['folder']}/{filename}"
    
    from app.models.academique import PhotoEnAttente
    db = SessionLocal()
    try:
        # Delete previous pending photo if exists
        old_pending = db.query(PhotoEnAttente).filter_by(entity_type=entity_type, entity_id=entity_id, statut='EN_ATTENTE').first()
        if old_pending:
            # Try to remove old file
            old_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), old_pending.file_path.lstrip("/"))
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
        contenu = f"Une nouvelle photo de profil a été soumise par {target_name} et nécessite votre validation."
        
        db.execute(text("""
            INSERT INTO ss_messages (expediteur_type, expediteur_id, destinataire_type, destinataire_id, objet_type, sujet, contenu, statut)
            VALUES ('SYSTEME', NULL, 'ADMIN', NULL, 'GENERAL', :sujet, :contenu, 'ENVOYE')
        """), {"sujet": sujet, "contenu": contenu})
        
        db.commit()
    finally:
        db.close()
        
    return {"photo_url": photo_url, "message": "Photo envoyée et en attente de validation par l'administration."}


@router.post("/parent-upload/{entity_type}/{entity_id}")
async def parent_upload_photo(entity_type: str, entity_id: int, parent_id: int = 0, fichier: UploadFile = File(...)):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, f"Type invalide. Utilisez: {list(ENTITY_MAP.keys())}")

    cfg = ENTITY_MAP[entity_type]
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(fichier.filename)[1].lower() if fichier.filename else ".jpg"
    if ext not in allowed_ext:
        raise HTTPException(400, "Format non supporté.")

    allowed_mime = {"image/jpeg", "image/png", "image/webp"}
    if fichier.content_type and fichier.content_type not in allowed_mime:
        raise HTTPException(400, f"Type MIME non supporté: {fichier.content_type}")

    MAX_SIZE = 5 * 1024 * 1024
    contents = await fichier.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "Fichier trop volumineux. Maximum: 5 Mo")
    await fichier.seek(0)

    folder = os.path.join(UPLOAD_BASE, cfg["folder"])
    os.makedirs(folder, exist_ok=True)

    import uuid
    filename = f"pending_{entity_type}_{entity_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(folder, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(fichier.file, f)

    photo_url = f"/uploads/photos/{cfg['folder']}/{filename}"
    
    from app.models.academique import PhotoEnAttente
    db = SessionLocal()
    try:
        old_pending = db.query(PhotoEnAttente).filter_by(entity_type=entity_type, entity_id=entity_id, statut='EN_ATTENTE').first()
        if old_pending:
            old_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), old_pending.file_path.lstrip("/"))
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
            contenu = f"Le parent {parent_name} a envoyé sa photo, elle est en attente de validation."
        else:
            sujet = f"📷 Photo reçue pour {target_name}"
            contenu = f"Le parent {parent_name} a envoyé la photo de {target_name}, elle est en attente de validation."

        db.execute(text("""
            INSERT INTO ss_messages (expediteur_type, expediteur_id, destinataire_type, destinataire_id, objet_type, sujet, contenu, statut)
            VALUES ('PARENT', :parent_id, 'ADMIN', NULL, 'GENERAL', :sujet, :contenu, 'ENVOYE')
        """), {"parent_id": parent_id, "sujet": sujet, "contenu": contenu})

        db.commit()
    finally:
        db.close()

    return {"photo_url": photo_url, "message": "Photo envoyée et en attente de validation par l'administration."}


# ================================================================
# VALIDATION SYSTEM
# ================================================================

@router.get("/pending/all")
def get_all_pending():
    db = SessionLocal()
    from app.models.academique import PhotoEnAttente
    try:
        pending = db.query(PhotoEnAttente).filter(PhotoEnAttente.statut == 'EN_ATTENTE').order_by(PhotoEnAttente.date_upload.desc()).all()
        result = []
        for p in pending:
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
    finally:
        db.close()

@router.get("/pending/{entity_type}/{entity_id}")
def get_entity_pending(entity_type: str, entity_id: int):
    db = SessionLocal()
    from app.models.academique import PhotoEnAttente
    try:
        p = db.query(PhotoEnAttente).filter_by(entity_type=entity_type, entity_id=entity_id, statut='EN_ATTENTE').first()
        if p:
            return {"photo_id": p.photo_id, "file_path": p.file_path, "date_upload": p.date_upload}
        return None
    finally:
        db.close()

@router.post("/validate/{photo_id}")
def validate_photo(photo_id: int):
    db = SessionLocal()
    from app.models.academique import PhotoEnAttente, Eleve, Parent
    try:
        p = db.query(PhotoEnAttente).filter_by(photo_id=photo_id, statut='EN_ATTENTE').first()
        if not p:
            raise HTTPException(404, "Photo introuvable")
            
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
                if old_file_path != os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), p.file_path.lstrip("/")):
                    os.remove(old_file_path)
                
        # Rename pending file to final
        old_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), p.file_path.lstrip("/"))
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
    finally:
        db.close()

@router.post("/reject/{photo_id}")
def reject_photo(photo_id: int):
    db = SessionLocal()
    from app.models.academique import PhotoEnAttente
    try:
        p = db.query(PhotoEnAttente).filter_by(photo_id=photo_id).first()
        if not p:
            raise HTTPException(404, "Photo introuvable")
            
        old_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), p.file_path.lstrip("/"))
        if os.path.exists(old_path):
            os.remove(old_path)
            
        db.delete(p)
        db.commit()
        return {"message": "Photo rejetée/supprimée"}
    finally:
        db.close()


# ================================================================
# GET / DELETE
# ================================================================

@router.get("/{entity_type}/{entity_id}")
def get_photo(entity_type: str, entity_id: int):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, "Type invalide")
    cfg = ENTITY_MAP[entity_type]
    db = SessionLocal()
    try:
        row = db.execute(
            text(f"SELECT photo_url FROM {cfg['table']} WHERE {cfg['pk']} = :id"),
            {"id": entity_id}
        ).fetchone()
        if not row:
            raise HTTPException(404, "Entité introuvable")
        return {"photo_url": row[0]}
    finally:
        db.close()

@router.delete("/{entity_type}/{entity_id}")
def delete_photo(entity_type: str, entity_id: int):
    if entity_type not in ENTITY_MAP:
        raise HTTPException(400, "Type invalide")
    cfg = ENTITY_MAP[entity_type]
    db = SessionLocal()
    try:
        row = db.execute(
            text(f"SELECT photo_url FROM {cfg['table']} WHERE {cfg['pk']} = :id"),
            {"id": entity_id}
        ).fetchone()
        if row and row[0]:
            full_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), row[0].lstrip("/"))
            if os.path.exists(full_path):
                os.remove(full_path)
            db.execute(
                text(f"UPDATE {cfg['table']} SET photo_url = NULL WHERE {cfg['pk']} = :id"),
                {"id": entity_id}
            )
            db.commit()
        return {"message": "Photo supprimée"}
    finally:
        db.close()

