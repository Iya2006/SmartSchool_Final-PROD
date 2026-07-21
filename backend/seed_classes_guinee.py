"""
SMARTSCHOOL — Seed complet du système scolaire guinéen
Crée : Cycles → Niveaux → Classes → Matières → Attribution automatique
Basé sur le programme officiel de la République de Guinée (MEPU-A)
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.academique import Cycle, Niveau, Classe, Matiere, ClasseMatiere

db = SessionLocal()

ETABLISSEMENT_ID = 1
ANNEE_ID = 1

# ============================================================================
# ÉTAPE 1 : CYCLES
# ============================================================================
print("\n" + "="*70)
print("ÉTAPE 1 : Création des Cycles")
print("="*70)

CYCLES = [
    {"code": "PRM", "libelle": "Primaire", "ordre": 1, "duree_annees": 6},
    {"code": "CLG", "libelle": "Collège", "ordre": 2, "duree_annees": 4},
    {"code": "LYC", "libelle": "Lycée", "ordre": 3, "duree_annees": 3},
]

cycle_map = {}  # code -> cycle_id
for cd in CYCLES:
    c = db.query(Cycle).filter(Cycle.code == cd["code"], Cycle.etablissement_id == ETABLISSEMENT_ID).first()
    if not c:
        c = Cycle(etablissement_id=ETABLISSEMENT_ID, code=cd["code"], libelle=cd["libelle"], ordre=cd["ordre"], duree_annees=cd["duree_annees"])
        db.add(c)
        db.commit()
        db.refresh(c)
        print(f"  ✅ Cycle créé : {cd['libelle']}")
    else:
        print(f"  ⏩ Cycle existant : {cd['libelle']} (id={c.cycle_id})")
    cycle_map[cd["code"]] = c.cycle_id

# ============================================================================
# ÉTAPE 2 : NIVEAUX
# ============================================================================
print("\n" + "="*70)
print("ÉTAPE 2 : Création des Niveaux")
print("="*70)

NIVEAUX = [
    # --- PRIMAIRE ---
    {"cycle": "PRM", "code": "1A",   "libelle": "1ère Année",   "ordre": 1, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "2A",   "libelle": "2ème Année",   "ordre": 2, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "3A",   "libelle": "3ème Année",   "ordre": 3, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "4A",   "libelle": "4ème Année",   "ordre": 4, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "5A",   "libelle": "5ème Année",   "ordre": 5, "est_examen": "N", "examen": None},
    {"cycle": "PRM", "code": "6A",   "libelle": "6ème Année",   "ordre": 6, "est_examen": "O", "examen": "CEE"},
    # --- COLLEGE ---
    {"cycle": "CLG", "code": "7A",   "libelle": "7ème Année",   "ordre": 7,  "est_examen": "N", "examen": None},
    {"cycle": "CLG", "code": "8A",   "libelle": "8ème Année",   "ordre": 8,  "est_examen": "N", "examen": None},
    {"cycle": "CLG", "code": "9A",   "libelle": "9ème Année",   "ordre": 9,  "est_examen": "N", "examen": None},
    {"cycle": "CLG", "code": "10A",  "libelle": "10ème Année",  "ordre": 10, "est_examen": "O", "examen": "BEPC"},
    # --- LYCEE ---
    {"cycle": "LYC", "code": "11SE", "libelle": "11ème Année SE","ordre": 11, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "11SM", "libelle": "11ème Année SM","ordre": 12, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "11SS", "libelle": "11ème Année SS","ordre": 13, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "12SE", "libelle": "12ème Année SE","ordre": 14, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "12SM", "libelle": "12ème Année SM","ordre": 15, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "12SS", "libelle": "12ème Année SS","ordre": 16, "est_examen": "N", "examen": None},
    {"cycle": "LYC", "code": "TSE",  "libelle": "Terminale SE", "ordre": 17, "est_examen": "O", "examen": "BAC"},
    {"cycle": "LYC", "code": "TSM",  "libelle": "Terminale SM", "ordre": 18, "est_examen": "O", "examen": "BAC"},
    {"cycle": "LYC", "code": "TSS",  "libelle": "Terminale SS", "ordre": 19, "est_examen": "O", "examen": "BAC"},
]

niveau_map = {}  # code -> niveau_id
for nd in NIVEAUX:
    cycle_id = cycle_map[nd["cycle"]]
    n = db.query(Niveau).filter(Niveau.code == nd["code"], Niveau.cycle_id == cycle_id).first()
    if not n:
        n = Niveau(cycle_id=cycle_id, code=nd["code"], libelle=nd["libelle"], ordre=nd["ordre"],
                   est_examen=nd["est_examen"], examen_national=nd["examen"])
        db.add(n)
        db.commit()
        db.refresh(n)
        print(f"  ✅ Niveau créé : {nd['libelle']} ({nd['code']})")
    else:
        print(f"  ⏩ Niveau existant : {nd['libelle']} (id={n.niveau_id})")
    niveau_map[nd["code"]] = n.niveau_id

# ============================================================================
# ÉTAPE 3 : CLASSES (1 classe par niveau par défaut)
# ============================================================================
print("\n" + "="*70)
print("ÉTAPE 3 : Création des Classes")
print("="*70)

CLASSES = [
    # --- PRIMAIRE ---
    {"niveau": "1A",   "code": "1A-1", "libelle": "1ère Année 1"},
    {"niveau": "2A",   "code": "2A-1", "libelle": "2ème Année 1"},
    {"niveau": "3A",   "code": "3A-1", "libelle": "3ème Année 1"},
    {"niveau": "4A",   "code": "4A-1", "libelle": "4ème Année 1"},
    {"niveau": "5A",   "code": "5A-1", "libelle": "5ème Année 1"},
    {"niveau": "6A",   "code": "6A-1", "libelle": "6ème Année 1"},
    # --- COLLEGE ---
    {"niveau": "7A",   "code": "7A-1", "libelle": "7ème Année 1"},
    {"niveau": "8A",   "code": "8A-1", "libelle": "8ème Année 1"},
    {"niveau": "9A",   "code": "9A-1", "libelle": "9ème Année 1"},
    {"niveau": "10A",  "code": "10A-1","libelle": "10ème Année 1"},
    # --- LYCEE ---
    {"niveau": "11SE", "code": "11SE-1", "libelle": "11ème Année SE 1"},
    {"niveau": "11SM", "code": "11SM-1", "libelle": "11ème Année SM 1"},
    {"niveau": "11SS", "code": "11SS-1", "libelle": "11ème Année SS 1"},
    {"niveau": "12SE", "code": "12SE-1", "libelle": "12ème Année SE 1"},
    {"niveau": "12SM", "code": "12SM-1", "libelle": "12ème Année SM 1"},
    {"niveau": "12SS", "code": "12SS-1", "libelle": "12ème Année SS 1"},
    {"niveau": "TSE",  "code": "TSE-1",  "libelle": "Terminale SE 1"},
    {"niveau": "TSM",  "code": "TSM-1",  "libelle": "Terminale SM 1"},
    {"niveau": "TSS",  "code": "TSS-1",  "libelle": "Terminale SS 1"},
]

classe_map = {}  # code -> classe_id
for cd in CLASSES:
    niv_id = niveau_map[cd["niveau"]]
    cl = db.query(Classe).filter(
        Classe.code == cd["code"],
        Classe.etablissement_id == ETABLISSEMENT_ID,
        Classe.annee_id == ANNEE_ID
    ).first()
    if not cl:
        cl = Classe(
            etablissement_id=ETABLISSEMENT_ID,
            annee_id=ANNEE_ID,
            niveau_id=niv_id,
            code=cd["code"],
            libelle=cd["libelle"],
            capacite_max=50,
            effectif_actuel=0,
            statut="ACTIVE"
        )
        db.add(cl)
        db.commit()
        db.refresh(cl)
        print(f"  ✅ Classe créée : {cd['libelle']} (niveau={cd['niveau']})")
    else:
        # Mettre à jour le niveau_id si incorrect
        if cl.niveau_id != niv_id:
            cl.niveau_id = niv_id
            db.commit()
            print(f"  🔄 Classe mise à jour : {cd['libelle']} → niveau={cd['niveau']}")
        else:
            print(f"  ⏩ Classe existante : {cd['libelle']} (id={cl.classe_id})")
    classe_map[cd["code"]] = cl.classe_id

# Mettre à jour les classes existantes (7ème Année 1, etc.) qui n'ont pas le bon code
for old_code, new_code in [("7A1", "7A-1"), ("8A1", "8A-1"), ("9A1", "9A-1"), ("10A1", "10A-1")]:
    cl = db.query(Classe).filter(Classe.code == old_code, Classe.etablissement_id == ETABLISSEMENT_ID).first()
    if cl:
        cl.code = new_code
        print(f"  🔄 Code classe mis à jour : {old_code} → {new_code}")

db.commit()

# ============================================================================
# ÉTAPE 4 : MATIÈRES (Programme Guinéen complet)
# ============================================================================
print("\n" + "="*70)
print("ÉTAPE 4 : Création/Vérification des Matières")
print("="*70)

# On va utiliser le endpoint auto-generation déjà existant
# Mais d'abord, mettons aussi à jour le mapping NIVEAU_TO_PROGRAMME dans matieres.py
# pour inclure les nouveaux codes de niveau primaire

# Lançons l'auto-generation
from app.api.matieres import PROGRAMME_GUINEEN, NIVEAU_TO_PROGRAMME

# Ajoutons les niveaux primaire au mapping
PRIMAIRE_CODES = {
    "1A": "CP1", "2A": "CP2", "3A": "CE1", "4A": "CE2", "5A": "CM1", "6A": "CM2"
}

for niv_code, prog_key in PRIMAIRE_CODES.items():
    if niv_code not in NIVEAU_TO_PROGRAMME:
        print(f"  ⚠️ Le code {niv_code} manque dans NIVEAU_TO_PROGRAMME, il faut mettre à jour matieres.py")

# Créons les matières manuellement cycle par cycle
niveaux_primaire = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"]
niveaux_college = ["7EME", "8EME", "9EME", "10EME"]
niveaux_lycee = ["11SM", "12SM", "TSM", "11SE", "12SE", "TSE", "11SS", "12SS", "TSS"]

def get_cycle_code(niveau_code):
    if niveau_code in niveaux_primaire: return "PRM"
    if niveau_code in niveaux_college: return "CLG"
    if niveau_code in niveaux_lycee: return "LYC"
    return None

# Collecter matières uniques par cycle
unique_matieres = {}
for niv_code, mats in PROGRAMME_GUINEEN.items():
    cc = get_cycle_code(niv_code)
    if not cc:
        continue
    for mat in mats:
        key = (cc, mat["code"])
        if key not in unique_matieres:
            unique_matieres[key] = {
                "cycle_id": cycle_map[cc],
                "code": mat["code"],
                "libelle": mat["libelle"],
                "categorie": mat["categorie"],
                "coefficient_defaut": mat["coef"],
                "est_obligatoire": "N" if "Option" in mat["libelle"] else "O",
                "nb_heures_semaine": mat["heures"],
            }

added_mat = 0
for (cc, code), data in unique_matieres.items():
    exists = db.query(Matiere).filter(
        Matiere.code == code, Matiere.cycle_id == data["cycle_id"]
    ).first()
    if not exists:
        m = Matiere(
            cycle_id=data["cycle_id"],
            code=data["code"],
            libelle=data["libelle"],
            categorie=data["categorie"],
            coefficient_defaut=data["coefficient_defaut"],
            est_obligatoire=data["est_obligatoire"],
            note_sur=20,
            nb_heures_semaine=data["nb_heures_semaine"],
        )
        db.add(m)
        added_mat += 1

db.commit()
total_mat = db.query(Matiere).count()
print(f"  ✅ {added_mat} nouvelles matières ajoutées. Total : {total_mat}")

# ============================================================================
# ÉTAPE 5 : ATTRIBUTION des matières aux classes
# ============================================================================
print("\n" + "="*70)
print("ÉTAPE 5 : Attribution des matières aux classes")
print("="*70)

# Mapping complet : code_niveau → clé du programme guinéen
FULL_MAPPING = {
    # Primaire
    "1A": "CP1", "2A": "CP2", "3A": "CE1", "4A": "CE2", "5A": "CM1", "6A": "CM2",
    # Collège
    "7A": "7EME", "8A": "8EME", "9A": "9EME", "10A": "10EME",
    # Lycée
    "11SM": "11SM", "11SE": "11SE", "11SS": "11SS",
    "12SM": "12SM", "12SE": "12SE", "12SS": "12SS",
    "TSM": "TSM", "TSE": "TSE", "TSS": "TSS",
}

all_classes = db.query(Classe).filter(Classe.statut == "ACTIVE", Classe.etablissement_id == ETABLISSEMENT_ID).all()
assigned_total = 0
skipped_total = 0

for classe in all_classes:
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    if not niveau:
        print(f"  ❌ Classe '{classe.libelle}' : niveau introuvable")
        continue
    
    programme_key = FULL_MAPPING.get(niveau.code)
    if not programme_key:
        print(f"  ⚠️ Classe '{classe.libelle}' (niveau={niveau.code}) : pas de programme configuré")
        continue
    
    programme_matieres = PROGRAMME_GUINEEN.get(programme_key, [])
    if not programme_matieres:
        print(f"  ⚠️ Aucune matière dans le programme pour '{programme_key}'")
        continue
    
    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first()
    if not cycle:
        continue
    
    assigned_for_class = 0
    skipped_for_class = 0
    
    for mat_def in programme_matieres:
        matiere = db.query(Matiere).filter(
            Matiere.code == mat_def["code"],
            Matiere.cycle_id == cycle.cycle_id
        ).first()
        
        if not matiere:
            continue
        
        exists = db.query(ClasseMatiere).filter(
            ClasseMatiere.classe_id == classe.classe_id,
            ClasseMatiere.matiere_id == matiere.matiere_id
        ).first()
        
        if exists:
            skipped_for_class += 1
            continue
        
        cm = ClasseMatiere(
            classe_id=classe.classe_id,
            matiere_id=matiere.matiere_id,
            coefficient=mat_def["coef"],
            nb_heures_semaine=mat_def["heures"],
            est_active="O"
        )
        db.add(cm)
        assigned_for_class += 1
    
    assigned_total += assigned_for_class
    skipped_total += skipped_for_class
    
    total_for_class = assigned_for_class + skipped_for_class
    status = "✅" if assigned_for_class > 0 else "⏩"
    print(f"  {status} {classe.libelle} ({niveau.code}) : {total_for_class} matières "
          f"({assigned_for_class} nouvelles, {skipped_for_class} déjà existantes)")

db.commit()

# ============================================================================
# RÉSUMÉ FINAL
# ============================================================================
print("\n" + "="*70)
print("✅ RÉSUMÉ FINAL")
print("="*70)
total_cycles = db.query(Cycle).filter(Cycle.etablissement_id == ETABLISSEMENT_ID).count()
total_niveaux = db.query(Niveau).count()
total_classes = db.query(Classe).filter(Classe.statut == "ACTIVE", Classe.etablissement_id == ETABLISSEMENT_ID).count()
total_matieres = db.query(Matiere).count()
total_attributions = db.query(ClasseMatiere).filter(ClasseMatiere.est_active == "O").count()

print(f"  📚 Cycles      : {total_cycles}")
print(f"  📊 Niveaux     : {total_niveaux}")
print(f"  🏫 Classes     : {total_classes}")
print(f"  📖 Matières    : {total_matieres}")
print(f"  🔗 Attributions: {total_attributions}")
print(f"  ➕ Nouvelles   : {assigned_total}")
print(f"  ⏩ Déjà exist. : {skipped_total}")

# Vérification par classe
print("\n" + "-"*70)
print("DÉTAIL PAR CLASSE")
print("-"*70)
for classe in db.query(Classe).filter(Classe.statut == "ACTIVE", Classe.etablissement_id == ETABLISSEMENT_ID).all():
    nb = db.query(ClasseMatiere).filter(ClasseMatiere.classe_id == classe.classe_id, ClasseMatiere.est_active == "O").count()
    niveau = db.query(Niveau).filter(Niveau.niveau_id == classe.niveau_id).first()
    niv_code = niveau.code if niveau else "?"
    cycle = db.query(Cycle).filter(Cycle.cycle_id == niveau.cycle_id).first() if niveau else None
    cycle_lib = cycle.libelle if cycle else "?"
    print(f"  {cycle_lib:>10} | {classe.libelle:<25} | {niv_code:<5} | {nb} matières")

db.close()
print("\n🎉 Seed terminé avec succès !")
