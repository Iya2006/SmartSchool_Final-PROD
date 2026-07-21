"""Résout les doublons : garde les classes avec élèves, archive les doublons vides."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.core.database import SessionLocal
from app.models.academique import Classe, ClasseMatiere, Inscription, Niveau
from sqlalchemy import func

db = SessionLocal()

# Trouver les doublons par code
active = db.query(Classe).filter(Classe.statut == "ACTIVE", Classe.etablissement_id == 1).all()

# Grouper par code
by_code = {}
for cl in active:
    if cl.code not in by_code:
        by_code[cl.code] = []
    by_code[cl.code].append(cl)

for code, classes in by_code.items():
    if len(classes) > 1:
        # Trier : garder celle qui a des inscriptions (ou effectif > 0), sinon la plus ancienne (ID le plus bas)
        classes.sort(key=lambda c: (-c.effectif_actuel, c.classe_id))
        keeper = classes[0]
        print(f"\n  Code '{code}' ({len(classes)} doublons):")
        print(f"    KEEP: id={keeper.classe_id} | {keeper.libelle} | effectif={keeper.effectif_actuel}")
        for dup in classes[1:]:
            # Transférer les matières du doublon au keeper si le keeper n'en a pas
            keeper_mats = db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == keeper.classe_id, ClasseMatiere.est_active == "O").count()
            dup_mats = db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == dup.classe_id, ClasseMatiere.est_active == "O").count()
            if keeper_mats == 0 and dup_mats > 0:
                # Transférer les associations
                for cm in db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == dup.classe_id).all():
                    exists = db.query(ClasseMatiere).filter(
                        ClasseMatiere.classe_id == keeper.classe_id,
                        ClasseMatiere.matiere_id == cm.matiere_id
                    ).first()
                    if not exists:
                        new_cm = ClasseMatiere(
                            classe_id=keeper.classe_id,
                            matiere_id=cm.matiere_id,
                            coefficient=cm.coefficient,
                            nb_heures_semaine=cm.nb_heures_semaine,
                            est_active=cm.est_active
                        )
                        db.add(new_cm)
                print(f"    Transféré {dup_mats} matières de id={dup.classe_id} vers id={keeper.classe_id}")
            dup.statut = "ARCHIVEE"
            print(f"    ARCH: id={dup.classe_id} | {dup.libelle} | effectif={dup.effectif_actuel}")

db.commit()

# Vérification finale
remaining = db.query(Classe).filter(Classe.statut == "ACTIVE", Classe.etablissement_id == 1).order_by(Classe.code).all()
print(f"\n{'='*60}")
print(f"✅ CLASSES ACTIVES FINALES : {len(remaining)}")
print(f"{'='*60}")
for cl in remaining:
    niv = db.query(Niveau).filter(Niveau.niveau_id == cl.niveau_id).first()
    nb_mat = db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == cl.classe_id, ClasseMatiere.est_active == "O").count()
    print(f"  {cl.classe_id:>3} | {cl.code:<10} | {cl.libelle:<28} | {nb_mat} matières")

db.close()
