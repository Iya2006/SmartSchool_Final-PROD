import os

def insert_import_and_component(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if "import RoleSwitcher" not in content:
        # Find the last import
        import_idx = content.rfind("import ")
        newline_idx = content.find("\n", import_idx)
        content = content[:newline_idx+1] + "import RoleSwitcher from '@/components/RoleSwitcher';\n" + content[newline_idx+1:]

    # For portail-dg, portail-directeur, portail-comptable, dashboard
    # Replace header content
    # Look for: <div style={{ color: '#...
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for p in ["portail-fondateur", "portail-dg", "portail-directeur", "portail-comptable", "dashboard"]:
    path = f"c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\{p}\\page.tsx"
    if os.path.exists(path):
        insert_import_and_component(path)
        
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # specifically add RoleSwitcher right before the year or something similar
        if "Année Scolaire" in content and "<RoleSwitcher" not in content:
            content = content.replace("Année Scolaire 2024-2025\n                    </div>", "Année Scolaire 2024-2025\n                    </div>\n                    <RoleSwitcher />")
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
        elif "Réseau d'Établissements" in content and "<RoleSwitcher" not in content:
            # handled already for fondateur
            pass
            
print("Added RoleSwitcher to portals")
