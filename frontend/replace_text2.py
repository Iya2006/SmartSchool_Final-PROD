"""
Second pass: remove remaining emojis from string values only (not JSX).
"""
from pathlib import Path

BASE = Path(r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src')

REPLACEMENTS = {
    r'app\emploi-du-temps\page.tsx': [
        ("showSuccess(`🪄 ${res.data.created} créneaux générés automatiquement !`);", 
         "showSuccess(`${res.data.created} créneaux générés automatiquement !`);"),
    ],
    r'app\emploi-du-temps\generes\page.tsx': [
        ("'✅ Publié'", "'Publié'"),
        ("'📝 Brouillon'", "'Brouillon'"),
    ],
    r'app\examens\emploi\page.tsx': [
        ("showSuccess('✅ Emploi des examens créé !');", "showSuccess('Emploi des examens créé !');"),
        ("showSuccess('Créneau ajouté ✅');", "showSuccess('Créneau ajouté');"),
        ("showSuccess('📋 Emploi publié ! Tous les enseignants ont été notifiés.');",
         "showSuccess('Emploi publié ! Tous les enseignants ont été notifiés.');"),
        ("'✅ Publié'", "'Publié'"),
        ("'📝 Brouillon'", "'Brouillon'"),
    ],
    r'app\enseignants\[id]\page.tsx': [
        ("'● Actif'", "'Actif'"),
        ("'● Inactif'", "'Inactif'"),
    ],
    r'app\matieres\page.tsx': [
        ("showToast(`✅ Attribution terminée : ${res.data.assigned} nouvelles matières attr",
         None),  # partial, skip
    ],
    r'app\familles\page.tsx': [
        ("'🔒 Sécurisé'", "'Sécurisé'"),
        ("'⚠️ Non défini'", "'Non défini'"),
        ("'✓ Configuré'", "'Configuré'"),
        ("'⚠ Non configuré'", "'Non configuré'"),
    ],
    r'app\familles\[id]\page.tsx': [
        ("'♂ Père'", "'Père'"),
        ("'♀ Mère'", "'Mère'"),
        ("'🔒 Compte actif'", "'Compte actif'"),
        ("'⚠ MdP non configuré'", "'MdP non configuré'"),
        ("'✓ Configuré'", "'Configuré'"),
        ("'⚠ Non configuré'", "'Non configuré'"),
    ],
    r'app\portail-eleve\components\EleveMessages.tsx': [
        ("'🏫 Administration'", "'Administration'"),
        ("✍️ Écrire à l'administration", "Écrire à l'administration"),
    ],
    r'app\portail-eleve\components\EleveProfil.tsx': [
        ("'♂ Masculin'", "'Masculin'"),
        ("'♀ Féminin'", "'Féminin'"),
    ],
    r'app\portail-enseignant\page.tsx': [
        ("setAppelSaved(`✅ ${res.data.message}`);", "setAppelSaved(`${res.data.message}`);"),
        ("'● Actif'", "'Actif'"),
        ("'○ Inactif'", "'Inactif'"),
    ],
    r'app\parametres\notation\page.tsx': [
        ("'🌍 Tous les cycles'", "'Tous les cycles'"),
    ],
    r'app\parametres\cartes\page.tsx': [
        ("emoji: '🌙'", "emoji: ''"),
        ("icon: '▯'", "icon: '□'"),
        ("icon: '▭'", "icon: '▭'"),
    ],
    r'app\teacher-dashboard\page.tsx': [
        ("showSuccess(`✅ ${dispoSlots.length} créneaux de disponibilité envoyés !`);",
         "showSuccess(`${dispoSlots.length} créneaux de disponibilité envoyés !`);"),
        ("'⏰ Expiré'", "'Expiré'"),
    ],
    r'app\student-dashboard\page.tsx': [
        ("'📐'", "''"),
        ("'🧪'", "''"),
        ("'🌍'", "''"),
        ("'💻'", "''"),
        ("'📝'", "''"),
        ("'📚'", "''"),
        ("'🔬'", "''"),
        ("'🏛️'", "''"),
        ("'✍️'", "''"),
    ],
    r'components\Topbar.tsx': [
        ("{/* 🔔 Notifications */}", "{/* Notifications */}"),
        ("{/* 👤 Menu utilisateur */}", "{/* Menu utilisateur */}"),
    ],
    r'components\TopbarNotifications.tsx': [
        ("// ✅ Logique de données déléguée au hook", "// Logique de données déléguée au hook"),
        ("{/* 🔔 Bouton cloche */}", "{/* Bouton cloche */}"),
        ("{/* 🗂️ Panel notifications */}", "{/* Panel notifications */}"),
    ],
}

for rel_path, replacements in REPLACEMENTS.items():
    filepath = BASE / rel_path
    if not filepath.exists():
        print(f"  SKIP: {rel_path}")
        continue
    content = filepath.read_text(encoding='utf-8')
    original = content
    for old, new in replacements:
        if new is None: continue
        content = content.replace(old, new)
    if content != original:
        filepath.write_text(content, encoding='utf-8')
        print(f"  UPDATED: {rel_path}")
    else:
        print(f"  NO CHANGE: {rel_path}")

print("Done.")
