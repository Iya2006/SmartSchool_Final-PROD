import re

def refactor_file(path, role, dash_api_route):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Imports
    if "useAuth" not in content:
        content = content.replace("import api from '@/lib/api';", "import api from '@/lib/api';\nimport { useAuth } from '@/context/AuthContext';")

    # 2. State variables
    content = re.sub(r"const \[step, setStep\] = useState<'login' \| 'dashboard'>\('login'\);\s*", "", content)
    content = re.sub(r"const \[phone, setPhone\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[matricule, setMatricule\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[password, setPassword\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[showPwd, setShowPwd\] = useState\(false\);\s*", "", content)
    content = re.sub(r"const \[loginError, setLoginError\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[loginLoading, setLoginLoading\] = useState\(false\);\s*", "", content)

    # 3. Add useAuth and fetch effect
    if "const { user, logout } = useAuth();" not in content:
        # Match function definition for either PortailParent or PortailEleve
        match = re.search(r"export default function (PortailParent|PortailEleve)\(\) \{\n", content)
        if match:
            auth_hook = f"""    const {{ user, logout }} = useAuth();

    // Initial load based on auth user
    useEffect(() => {{
        if (user && user.role === '{role}') {{
            const id = user.id;
            api.get(`{dash_api_route}${{id}}/dashboard`)
                .then(res => setData(res.data))
                .catch(err => console.error(err));
        }}
    }}, [user]);
"""
            content = content.replace(match.group(0), match.group(0) + auth_hook)

    # 4. Remove doLogin
    content = re.sub(r"/\* ═══ LOGIN ═══ \*/.*?const doLogin = useCallback.*?\}, \[(phone|matricule), password\]\);\s*", "", content, flags=re.DOTALL)

    # 5. Fix dependencies and step checks
    content = content.replace("step !== 'dashboard' || ", "")
    content = content.replace("step !== 'dashboard' && ", "")
    content = content.replace("step === 'dashboard' && ", "")
    content = content.replace("step,", "")
    content = content.replace("[step, activeTab, data]", "[activeTab, data]")
    content = content.replace("[step, data]", "[data]")
    content = content.replace("[step, activeTab, selectedChild, data]", "[activeTab, selectedChild, data]")
    content = content.replace("[step, activeTab, selectedChild, selectedTrimestre, data]", "[activeTab, selectedChild, selectedTrimestre, data]")

    # 6. Remove login UI
    login_ui_pattern = r"if \(step === 'login'\) \{.*?(?=if \(!data\))"
    content = re.sub(login_ui_pattern, f"if (!user || user.role !== '{role}') return <div style={{{{padding: '50px', textAlign: 'center'}}}}>Chargement ou accès refusé...</div>;\n    ", content, flags=re.DOTALL)

    # 7. Replace setStep('login') with logout()
    content = re.sub(r"setStep\('login'\);.*?setShowProfileDropdown\(false\);", "logout();", content)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Refactored {path}")

if __name__ == '__main__':
    refactor_file(r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\portail-parent\page.tsx', 'PARENT', '/api/portail-parent/')
    refactor_file(r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\portail-eleve\page.tsx', 'ELEVE', '/api/portail-eleve/')
