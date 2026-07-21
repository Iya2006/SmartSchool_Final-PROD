import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.core.database import SessionLocal
from app.models.academique import Classe, Niveau, Cycle, ClasseMatiere
db = SessionLocal()
print("CLASSES ACTIVES:")
for c in db.query(Classe).filter(Classe.statut=="ACTIVE", Classe.etablissement_id==1).order_by(Classe.code).all():
    n = db.query(Niveau).filter(Niveau.niveau_id==c.niveau_id).first()
    cy = db.query(Cycle).filter(Cycle.cycle_id==n.cycle_id).first() if n else None
    nb = db.query(ClasseMatiere).filter(ClasseMatiere.classe_id==c.classe_id, ClasseMatiere.est_active=="O").count()
    print(f"  {cy.libelle if cy else '?':>10} | {c.classe_id:>3} | {c.code:<10} | {c.libelle:<28} | {nb} matieres")
total = db.query(Classe).filter(Classe.statut=="ACTIVE", Classe.etablissement_id==1).count()
print(f"\nTotal: {total} classes actives")
db.close()
