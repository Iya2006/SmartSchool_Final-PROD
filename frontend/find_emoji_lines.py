import os

emoji_map = {
    '🎓': 'GraduationCap', '🏫': 'School', '📚': 'BookOpen', '📅': 'Calendar',
    '🗑': 'Trash2', '🪄': 'Wand2', '📷': 'Camera', '📱': 'Smartphone',
    '🔒': 'Lock', '📄': 'FileText', '💬': 'MessageSquare', '📍': 'MapPin',
    '📋': 'ClipboardList', '✅': 'CheckCircle2', '📝': 'FileEdit', '👨': 'User',
    '👩': 'User', '🧑‍🏫': 'UserCircle', '👤': 'User', '🌍': 'Globe',
    '📊': 'BarChart2', '🌿': 'Leaf', '🌊': 'Waves', '🔑': 'Key',
    '🎭': 'Theater', '🪪': 'IdCard', '📢': 'Megaphone', '⚖️': 'Scale',
    '🤝': 'Handshake', '💰': 'DollarSign', '🎄': 'TreePine', '🇬🇳': 'Flag',
    '☀️': 'Sun', '📐': 'Ruler', '🧪': 'FlaskConical', '💻': 'Laptop',
    '📜': 'ScrollText', '📖': 'BookOpen', '🏆': 'Trophy', '🚀': 'Rocket',
    '🌟': 'Star', '👋': 'Hand', '⚠️': 'AlertTriangle', '⚠': 'AlertTriangle',
    '❌': 'XCircle', '🚨': 'AlertCircle', 'ℹ️': 'Info', '💡': 'Lightbulb',
    '🔍': 'Search', '➕': 'Plus', '➖': 'Minus', '🔗': 'Link', '🔔': 'Bell',
    '⚙️': 'Settings', '🏠': 'Home', '📘': 'Book', '📉': 'TrendingDown',
    '📈': 'TrendingUp', '💵': 'Banknote', '💶': 'Banknote', '🧑‍🎓': 'GraduationCap',
    '👨‍🎓': 'GraduationCap', '👩‍🎓': 'GraduationCap', '👨‍🏫': 'UserCircle',
    '👩‍🏫': 'UserCircle', '🌅': 'SunMedium', '👑': 'Crown', '🌹': 'Flower',
    '🎨': 'Palette', '🌈': 'Rainbow', '⚡': 'Zap', '🔮': 'Crystal',
    '🔤': 'Type', '🌙': 'Moon', '💼': 'Briefcase', '📁': 'Folder', '📂': 'FolderOpen',
    '⚙': 'Settings', '📊': 'BarChart', '📈': 'TrendingUp', '🏆': 'Trophy', '📬': 'Mail'
}

files_to_check = [
    r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\bulletins\page.tsx',
    r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\communication\page.tsx',
    r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\comptabilite\frais\page.tsx',
    r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\classes\[id]\page.tsx',
    r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\classes\configurer\[id]\page.tsx',
]

for path in files_to_check:
    print(f"--- {os.path.basename(path)} ---")
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    for i, line in enumerate(lines):
        for emoji in emoji_map:
            if emoji in line:
                print(f"L{i+1}: {line.strip()}")
                break
