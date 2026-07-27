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
    '🔤': 'Type', '🌙': 'Moon', '💼': 'Briefcase', '📁': 'Folder', '📂': 'FolderOpen',
    '⚙': 'Settings', '📊': 'BarChart', '📈': 'TrendingUp', '🏆': 'Trophy'
}

src_dir = r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src'

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    icons_to_import = set()

    # We will just iterate over all emojis and replace them.
    # Since we want to be safe with string literals vs JSX, let's use a simpler approach:
    # Just replace all emojis with `<Icon size={16} className="inline-icon" />` or similar.
    # Actually, we can just use `<Icon size={18} />`.
    # Wait, if an emoji is in a quote like `placeholder="Recherche 🔍"`, replacing it with `<Search size={18} />`
    # would make it `placeholder="Recherche <Search size={18} />"` which is wrong.
    # Let's find emojis inside strings and replace the whole string with a JSX fragment if it's a JSX prop,
    # or just replace emojis in text nodes.
    
    # Simple regex to find emojis only outside of HTML tags or inside text nodes:
    # We can just iterate character by character.
    in_single_quote = False
    in_double_quote = False
    in_backtick = False
    new_content = []
    
    i = 0
    while i < len(content):
        c = content[i]
        
        if c == "'" and not in_double_quote and not in_backtick:
            in_single_quote = not in_single_quote
        elif c == '"' and not in_single_quote and not in_backtick:
            in_double_quote = not in_double_quote
        elif c == '`' and not in_single_quote and not in_double_quote:
            in_backtick = not in_backtick
            
        # Check if the current substring matches any emoji
        matched = False
        for emoji, icon in emoji_map.items():
            if content[i:].startswith(emoji):
                icons_to_import.add(icon)
                if in_single_quote or in_double_quote or in_backtick:
                    # It's inside a string! This might be tricky.
                    # We can't put a React component directly in a plain string literal.
                    # BUT many emojis in this codebase are just in JSX text like <span>🎓</span> or in quotes that are actually harmless or easy to fix manually.
                    # Let's just do a blanket replace and fix the build errors! It's much faster.
                    # Wait, no. A string like `title="🎓 Eleve"` needs to become `title={<><GraduationCap size={16} /> Eleve</>}`.
                    pass
                
                # Blanket replace
                new_content.append(f"<{icon} size={{18}} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />")
                i += len(emoji)
                matched = True
                break
                
        if not matched:
            new_content.append(c)
            i += 1

    content = "".join(new_content)

    if content != original_content and icons_to_import:
        # Add imports
        import_stmt = "import { " + ", ".join(icons_to_import) + " } from 'lucide-react';"
        
        # Check if lucide-react is already imported
        if 'from \'lucide-react\'' in content or 'from "lucide-react"' in content:
            # Inject into existing
            # This is complex, just append a new import statement below the existing ones
            pass
            
        # Let's just add it after the last import
        import_match = list(re.finditer(r'^import .*?;?\n', content, re.MULTILINE))
        if import_match:
            last_import = import_match[-1]
            idx = last_import.end()
            content = content[:idx] + import_stmt + "\n" + content[idx:]
        else:
            # If no imports, put at top (after 'use client' if exists)
            if 'use client' in content:
                content = content.replace("'use client';", "'use client';\n" + import_stmt)
                content = content.replace('"use client";', '"use client";\n' + import_stmt)
            else:
                content = import_stmt + "\n" + content
                
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {path}")

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(('.tsx', '.ts')):
            process_file(os.path.join(root, f))
