import sys
sys.path.append('C:/Users/hp/SMART_SCHOOL_FINAL/backend')
from app.core.database import SessionLocal
from app.models.academique import Classe, Inscription

db = SessionLocal()

try:
    print("Mise à jour des effectifs...")

    # 1. Update real effectif
    for c in db.query(Classe).all():
        inscrits = db.query(Inscription).filter_by(classe_id=c.classe_id, statut="ACTIVE").count()
        c.effectif_actuel = inscrits
    
    db.commit()

    # 2. Try to clean up solely the fake classes (with 0 students)
    fake_classes = db.query(Classe).filter(
        Classe.libelle.in_([
            "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", 
            "Class 6", "Class 7", "Class 8", "Class 9", "Class 10", 
            "Class 11", "Class 12", "7A1", "7A2", "8A1", "8A2", 
            "9A1", "9A2", "11A1", "11A2", "12A1", "12A2",
            "10 - A", "10 - B", "10 - C"
        ])
    ).all()

    for fc in fake_classes:
        if fc.effectif_actuel == 0:
            db.delete(fc)
            
    db.commit()
    print("Script terminé avec succès. Effectifs recalculés et fausses classes vides supprimées.")

except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
