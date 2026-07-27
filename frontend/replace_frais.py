from pathlib import Path

file_path = Path(r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\comptabilite\frais\page.tsx')
content = file_path.read_text(encoding='utf-8')

replacements = [
    (
        "{ value: 'ESPECES', label: '💵 Espèces', icon: Banknote },",
        "{ value: 'ESPECES', label: 'Espèces', icon: Banknote },"
    ),
    (
        "{ value: 'CHEQUE', label: '📋 Chèque', icon: FileText },",
        "{ value: 'CHEQUE', label: 'Chèque', icon: FileText },"
    ),
    (
        "{ value: 'MOBILE_MONEY', label: '📱 Mobile Money', icon: Smartphone },",
        "{ value: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone },"
    ),
    (
        "{tf.frequence} · {tf.est_obligatoire === 'O' ? '⚠️ Obligatoire' : '✓ Facultatif'}",
        "{tf.frequence} · {tf.est_obligatoire === 'O' ? <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Obligatoire</> : '✓ Facultatif'}"
    ),
    (
        "{tf.montant_defaut > 0 && ` · 💰 ${tf.montant_defaut.toLocaleString('fr-FR')} GNF`}",
        "{tf.montant_defaut > 0 && <><Coins size={12} style={{display:'inline', verticalAlign:'middle'}}/> {' ' + tf.montant_defaut.toLocaleString('fr-FR') + ' GNF'}</>}"
    ),
    (
        "💡 Génère automatiquement une facture pour chaque élève actif de la classe sélectionnée, sans double saisie.",
        "<Lightbulb size={16} color=\"#d97706\" style={{display:'inline', verticalAlign:'middle'}}/> Génère automatiquement une facture pour chaque élève actif de la classe sélectionnée, sans double saisie."
    )
]

for old, new in replacements:
    if old not in content:
        print(f"Warning: Could not find chunk:\n{old}\n")
    content = content.replace(old, new)

file_path.write_text(content, encoding='utf-8')
print("Done comptabilite/frais/page.tsx")
