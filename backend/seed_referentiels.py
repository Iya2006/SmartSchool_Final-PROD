"""
SMARTSCHOOL — Initialisation des données de référence
Insère les trimestres (année courante) et les types d'évaluation.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models.academique import Trimestre, TypeEvaluation, AnneeScolaire

db = SessionLocal()

# ═══════════════════════════════════════════
# 1. TRIMESTRES pour l'année 2025-2026
# ═══════════════════════════════════════════
annee = db.query(AnneeScolaire).filter(AnneeScolaire.est_courante == "O").first()
if not annee:
    print("❌ Aucune année scolaire courante trouvée !")
    sys.exit(1)

print(f"📅 Année scolaire courante : {annee.libelle} (ID={annee.annee_id})")

# Vérifier si des trimestres existent déjà
existing_tri = db.query(Trimestre).filter(Trimestre.annee_id == annee.annee_id).count()
if existing_tri > 0:
    print(f"ℹ️  {existing_tri} trimestre(s) déjà existants — ignorés.")
else:
    from datetime import date
    trimestres_data = [
        {"code": "T1", "libelle": "1er Trimestre", "numero": 1,
         "date_debut": date(2025, 10, 1), "date_fin": date(2025, 12, 20), "statut": "EN_COURS"},
        {"code": "T2", "libelle": "2ème Trimestre", "numero": 2,
         "date_debut": date(2026, 1, 5), "date_fin": date(2026, 3, 28), "statut": "EN_COURS"},
        {"code": "T3", "libelle": "3ème Trimestre", "numero": 3,
         "date_debut": date(2026, 4, 7), "date_fin": date(2026, 6, 30), "statut": "PLANIFIE"},
    ]
    for t in trimestres_data:
        tri = Trimestre(annee_id=annee.annee_id, **t)
        db.add(tri)
    db.flush()
    print(f"✅ {len(trimestres_data)} trimestres créés")

# ═══════════════════════════════════════════
# 2. TYPES D'ÉVALUATION
# ═══════════════════════════════════════════
existing_types = db.query(TypeEvaluation).count()
if existing_types > 0:
    print(f"ℹ️  {existing_types} type(s) d'évaluation déjà existants — ignorés.")
else:
    types_data = [
        {"code": "EVAL", "libelle": "Évaluation", "coefficient": 1, "statut": "ACTIF"},
        {"code": "INTERRO", "libelle": "Interrogation", "coefficient": 1, "statut": "ACTIF"},
        {"code": "COMPO", "libelle": "Composition", "coefficient": 2, "statut": "ACTIF"},
        {"code": "EXAMEN", "libelle": "Examen", "coefficient": 2, "statut": "ACTIF"},
        {"code": "TP", "libelle": "Travaux Pratiques", "coefficient": 1, "statut": "ACTIF"},
        {"code": "EXPOSE", "libelle": "Exposé / Présentation", "coefficient": 1, "statut": "ACTIF"},
        {"code": "PARTICIPATION", "libelle": "Participation", "coefficient": 1, "statut": "ACTIF"},
    ]
    for t in types_data:
        te = TypeEvaluation(**t)
        db.add(te)
    db.flush()
    print(f"✅ {len(types_data)} types d'évaluation créés")

db.commit()
db.close()
print("\n🎉 Données de référence initialisées avec succès !")
