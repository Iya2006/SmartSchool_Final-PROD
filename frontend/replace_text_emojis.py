"""
Safe emoji replacement script for SmartSchool frontend.
Only replaces known safe patterns. Does NOT insert JSX (only removes emojis from strings).
"""
from pathlib import Path
import re

BASE = Path(r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src')

# Simple text-only replacements: remove emoji from string literals
# These are used in toast messages, labels, badge strings, etc.
TEXT_ONLY_REPLACEMENTS = [
    # galerie/page.tsx
    (r'app\galerie\page.tsx', [
        ('✓ Photos', 'Photos'),
        ('✗ Manquantes', 'Manquantes'),
        ("'✓ Photo'", "'Photo'"),
        ("'✗ Manquante'", "'Manquante'"),
    ]),
    # fournitures/page.tsx
    (r'app\fournitures\page.tsx', [
        ("'Fourniture modifiée ✅'", "'Fourniture modifiée'"),
        ("'Fourniture ajoutée ✅'", "'Fourniture ajoutée'"),
    ]),
    # personnel/page.tsx
    (r'app\personnel\page.tsx', [
        ("'● Actif'", "'Actif'"),
        ("'● ' + p.statut", "p.statut"),
    ]),
    # matieres/page.tsx
    (r'app\matieres\page.tsx', [
        ("`✅ ${items.length} matières déployées avec succès !`", "`${items.length} matières déployées avec succès !`"),
        ("`✅ ${newSubject.libelle} créée !`", "`${newSubject.libelle} créée !`"),
        ("`✅ Matière ${name} supprimée !`", "`Matière ${name} supprimée !`"),
        ("`✅ Attribution terminée : ${res.data.assigned} nouvelles matières attr", None),  # skip partial
        ("'🌍 Tous'", "'Tous'"),
        ("'📚 Primaire'", "'Primaire'"),
        ("'🏫 Collège'", "'Collège'"),
        ("'🎓 Lycée'", "'Lycée'"),
    ]),
    # notes/page.tsx
    (r'app\notes\page.tsx', [
        ("`📚 ${cycle}`", "`${cycle}`"),
    ]),
    # salle-des-profs/page.tsx
    (r'app\salle-des-profs\page.tsx', [
        ("'✅ Enseignant affecté avec succès !'", "'Enseignant affecté avec succès !'"),
        ("'🏫 Primaire'", "'Primaire'"),
        ("'📘 Collège'", "'Collège'"),
        ("'🎓 Lycée'", "'Lycée'"),
    ]),
    # portail-enseignant/page.tsx
    (r'app\portail-enseignant\page.tsx', [
        ("`✅ ${dispoSlots.length} créneaux envoyés !`", "`${dispoSlots.length} créneaux envoyés !`"),
        ("'✅ Sujet téléversé avec succès !'", "'Sujet téléversé avec succès !'"),
        ("`✅ \"${evalLibelle}\" enregistrée avec succès`", "`\"${evalLibelle}\" enregistrée avec succès`"),
        ("`❌ ${err.response?.data?.detail || 'Erreur'}`", "`${err.response?.data?.detail || 'Erreur'}`"),
        ("`✅ ${res.data.nb_modifiees} notes modifiées", "`${res.data.nb_modifiees} notes modifiées"),
    ]),
    # familles/page.tsx
    (r'app\familles\page.tsx', [
        ("'📋 Répertoire des Familles'", "'Répertoire des Familles'"),
        ("icon: '👨'", "icon: ''"),
        ("icon: '👩'", "icon: ''"),
        ("icon: '🧑\u200d🏫'", "icon: ''"),
        ("icon: '👩\u200d🏫'", "icon: ''"),
    ]),
    # fournitures/page.tsx
    (r'app\fournitures\page.tsx', [
        ("Fourniture modifiée ✅", "Fourniture modifiée"),
        ("Fourniture ajoutée ✅", "Fourniture ajoutée"),
    ]),
    # emploi-du-temps/page.tsx
    (r'app\emploi-du-temps\page.tsx', [
        ("'✅ Créneau", "'Créneau"),
    ]),
    # classe/page.tsx  
    (r'app\classes\page.tsx', [
        ("'🏫 Primaire'", "'Primaire'"),
        ("'📘 Collège'", "'Collège'"),
        ("'🎓 Lycée'", "'Lycée'"),
    ]),
    # portail-parent/page.tsx
    (r'app\portail-parent\page.tsx', [
        ("icon:'📢'", "icon:''"),
        ("icon:'📅'", "icon:''"),
        ("icon:'⚖️'", "icon:''"),
        ("icon:'🤝'", "icon:''"),
        ("icon:'📝'", "icon:''"),
        ("icon:'💰'", "icon:''"),
        ("icon:'📄'", "icon:''"),
    ]),
    # teacher-dashboard/page.tsx
    (r'app\teacher-dashboard\page.tsx', [
        ("icon: '📅'", "icon: ''"),
        ("icon: '⚖️'", "icon: ''"),
        ("icon: '📢'", "icon: ''"),
        ("icon: '🤝'", "icon: ''"),
        ("icon: '📝'", "icon: ''"),
        ("icon: '💰'", "icon: ''"),
        ("icon: '📄'", "icon: ''"),
    ]),
    # parametres/notation/page.tsx
    (r'app\parametres\notation\page.tsx', [
        ("emoji: '📚'", "emoji: ''"),
        ("emoji: '🏫'", "emoji: ''"),
        ("emoji: '🎓'", "emoji: ''"),
    ]),
    # parametres/apparence/page.tsx
    (r'app\parametres\apparence\page.tsx', [
        ("emoji: '🎓'", "emoji: ''"),
        ("emoji: '🌊'", "emoji: ''"),
        ("emoji: '🌿'", "emoji: ''"),
        ("emoji: '🌅'", "emoji: ''"),
        ("emoji: '👑'", "emoji: ''"),
        ("emoji: '🎨'", "emoji: ''"),
        ("emoji: '🌈'", "emoji: ''"),
        ("emoji: '⚡'", "emoji: ''"),
        ("emoji: '🔮'", "emoji: ''"),
    ]),
    # parametres/cartes/page.tsx
    (r'app\parametres\cartes\page.tsx', [
        ("emoji: '🎓'", "emoji: ''"),
        ("emoji: '🌊'", "emoji: ''"),
        ("emoji: '🌿'", "emoji: ''"),
        ("emoji: '👑'", "emoji: ''"),
        ("emoji: '🌅'", "emoji: ''"),
        ("emoji: '🎨'", "emoji: ''"),
        ("emoji: '⚡'", "emoji: ''"),
    ]),
]

for rel_path, replacements in TEXT_ONLY_REPLACEMENTS:
    filepath = BASE / rel_path
    if not filepath.exists():
        print(f"  SKIP (not found): {rel_path}")
        continue
    
    content = filepath.read_text(encoding='utf-8')
    original = content
    changed = []
    
    for old, new in replacements:
        if new is None:
            continue
        if old in content:
            content = content.replace(old, new)
            changed.append(old[:40])
        else:
            # try without whitespace sensitivity
            pass
    
    if content != original:
        filepath.write_text(content, encoding='utf-8')
        print(f"  UPDATED: {rel_path} ({len(changed)} replacements)")
    else:
        print(f"  NO CHANGE: {rel_path}")

print("\nDone with text-only pass.")
