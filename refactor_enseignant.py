import re
import sys

def refactor_enseignant():
    path = r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\app\portail-enseignant\page.tsx'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Imports
    if "useAuth" not in content:
        content = content.replace("import api from '@/lib/api';", "import api from '@/lib/api';\nimport { useAuth } from '@/context/AuthContext';")

    # 2. State variables
    content = re.sub(r"const \[step, setStep\] = useState<'login' \| 'dashboard'>\('login'\);\s*", "", content)
    content = re.sub(r"const \[phone, setPhone\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[password, setPassword\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[showPwd, setShowPwd\] = useState\(false\);\s*", "", content)
    content = re.sub(r"const \[loginError, setLoginError\] = useState\(''\);\s*", "", content)
    content = re.sub(r"const \[loginLoading, setLoginLoading\] = useState\(false\);\s*", "", content)

    # 3. Add useAuth and fetch effect
    if "const { user, logout } = useAuth();" not in content:
        auth_hook = """    const { user, logout } = useAuth();

    // Initial load based on auth user
    useEffect(() => {
        if (user && user.role === 'ENSEIGNANT') {
            const eid = user.id;
            enseignantIdRef.current = eid;
            api.get(`/api/portail-enseignant/${eid}/dashboard`)
                .then(res => setData(res.data))
                .catch(err => console.error(err));
        }
    }, [user]);
"""
        content = content.replace("export default function PortailEnseignant() {\n", "export default function PortailEnseignant() {\n" + auth_hook)

    # 4. Remove doLogin
    content = re.sub(r"/\* ═══ LOGIN ═══ \*/.*?const doLogin = useCallback.*?\}, \[phone, password\]\);\s*", "", content, flags=re.DOTALL)

    # 5. Fix dependencies and step checks
    content = content.replace("step !== 'dashboard' || ", "")
    content = content.replace("step !== 'dashboard' && ", "")
    content = content.replace("step,", "")
    content = content.replace("[step, activeTab, data]", "[activeTab, data]")
    content = content.replace("[step, data]", "[data]")
    content = content.replace("[step, activeTab, data, notesSaved]", "[activeTab, data, notesSaved]")
    content = content.replace("[step, activeTab, data, appelSaved]", "[activeTab, data, appelSaved]")

    # 6. Remove login UI
    login_ui_pattern = r"if \(step === 'login'\) \{.*?(?=if \(!data\))"
    content = re.sub(login_ui_pattern, "if (!user || user.role !== 'ENSEIGNANT') return <div style={{padding: '50px', textAlign: 'center'}}>Chargement ou accès refusé...</div>;\n    ", content, flags=re.DOTALL)

    # 7. Replace setStep('login') with logout()
    content = re.sub(r"setStep\('login'\);.*?setShowProfileDropdown\(false\);", "logout();", content)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Refactored portail-enseignant/page.tsx")

if __name__ == '__main__':
    refactor_enseignant()
