import os
import re

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
    '🔤': 'Type', '🌙': 'Moon', '💼': 'Briefcase'
}

src_dir = r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src'

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    imports_needed = set()

    # Search for all emojis in the content
    for emoji, icon in emoji_map.items():
        if emoji in content:
            imports_needed.add(icon)
            # Replace emoji with icon component. We wrap it in a span for safety in JSX, 
            # or just put the icon. If it's inside quotes, it might break JS syntax.
            # But since these are mostly in JSX text nodes like <div>🎓 Text</div>, 
            # <Icon size={16} /> is perfect.
            # If it's inside quotes like placeholder="🎓", this will produce placeholder="<Icon...>" which is wrong,
            # but we can fix those manually or adjust the regex.
            # A safer regex: find emoji, check context.
            pass

    # A simpler approach: we just replace the exact emojis in JSX text with <Icon size={16} />
    # For emojis in strings, we can just replace them with the icon component inside curly braces if it's JSX, 
    # but strings in regular JS need different handling.
    # Actually, we can use a simpler replacement for now:
    for emoji, icon in emoji_map.items():
        if emoji in content:
            imports_needed.add(icon)
            # Replace outside of quotes (best effort)
            content = content.replace(emoji, f"<{icon} size={{16}} />")

    if content != original_content and imports_needed:
        # Add imports if there's 'lucide-react'
        if 'lucide-react' in content:
            # We can't simply append, we need to add to the existing import.
            # Let's just print the files that need manual attention or have simple replacements.
            pass

    if content != original_content:
        # For simplicity, we just print the file paths that contain emojis.
        print(f"File has emojis: {path}")

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, f))
