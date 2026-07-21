"""RESET complet des matières avec TRUNCATE CASCADE"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.core.database import SessionLocal
from app.models.academique import Matiere, Cycle
from sqlalchemy import text

db = SessionLocal()

print("=== NETTOYAGE COMPLET ===")
try:
    db.execute(text("TRUNCATE TABLE ss_classe_matieres CASCADE"))
    print("  ss_classe_matieres: vidée")
except: db.rollback()

try:
    db.execute(text("TRUNCATE TABLE ss_matieres CASCADE"))
    print("  ss_matieres: vidée")
except Exception as e:
    db.rollback()
    print(f"  ERREUR TRUNCATE ss_matieres: {str(e)[:100]}")
    # Essayons de supprimer les FK une par une
    for tbl in ["ss_notes", "ss_evaluations", "ss_affectations", "ss_creneaux_emploi", "ss_classe_matieres"]:
        try:
            db.execute(text(f"DELETE FROM {tbl}"))
            print(f"    DELETE FROM {tbl}: OK")
        except Exception as e2:
            db.rollback()
            print(f"    DELETE FROM {tbl}: SKIP ({str(e2)[:50]})")
    try:
        db.execute(text("DELETE FROM ss_matieres"))
        print("  ss_matieres: vidée via DELETE")
    except Exception as e3:
        db.rollback()
        print(f"  ERREUR FINALE: {str(e3)[:100]}")

db.commit()

# ÉTAPE 2: Recréer
print("\n=== CRÉATION DES MATIÈRES ===")
from app.api.matieres import PROGRAMME_GUINEEN

cycle_map = {}
for c in db.query(Cycle).filter(Cycle.etablissement_id == 1).all():
    cycle_map[c.code] = c.cycle_id

niveaux_primaire = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"]
niveaux_college = ["7EME", "8EME", "9EME", "10EME"]
niveaux_lycee = ["11SM", "12SM", "TSM", "11SE", "12SE", "TSE", "11SS", "12SS", "TSS"]

def get_cycle_code(niv):
    if niv in niveaux_primaire: return "PRM"
    if niv in niveaux_college: return "CLG"
    if niv in niveaux_lycee: return "LYC"
    return None

unique = {}
for niv_code, mats in PROGRAMME_GUINEEN.items():
    cc = get_cycle_code(niv_code)
    if not cc: continue
    for m in mats:
        key = (cc, m["code"])
        if key not in unique:
            unique[key] = {
                "cycle_id": cycle_map[cc],
                "code": m["code"],
                "libelle": m["libelle"],
                "categorie": m["categorie"],
                "coefficient_defaut": m["coef"],
                "nb_heures_semaine": m["heures"],
            }

added = 0
for (cc, code), data in unique.items():
    m = Matiere(cycle_id=data["cycle_id"], code=data["code"], libelle=data["libelle"],
                categorie=data["categorie"], coefficient_defaut=data["coefficient_defaut"],
                est_obligatoire="O", note_sur=20, nb_heures_semaine=data["nb_heures_semaine"])
    db.add(m)
    added += 1

db.commit()

# Vérification
print(f"\n✅ {added} matières créées\n")
for cc in ["PRM", "CLG", "LYC"]:
    mats = db.query(Matiere).filter(Matiere.cycle_id == cycle_map[cc]).all()
    print(f"{cc} ({len(mats)} matières):")
    for m in mats:
        print(f"  {m.matiere_id:>3} | {m.code:<6} | {m.libelle}")

db.close()
