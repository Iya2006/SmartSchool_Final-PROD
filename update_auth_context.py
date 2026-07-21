import re

path = r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src\context\AuthContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update UserInfo interface
new_user_info = """interface UserInfo {
    id: number;
    nom: string;
    prenom: string;
    nom_utilisateur: string;
    email: string;
    telephone: string;
    role: string;
    roles_secondaires?: string[];
}"""
content = re.sub(r'interface UserInfo \{[\s\S]*?\}', new_user_info, content, count=1)

# Update AuthContextType
new_auth_context_type = """interface AuthContextType {
    user: UserInfo | null;
    token: string | null;
    isAuthenticated: boolean;
    activeRole: string | null;
    login: (token: string, user: UserInfo) => void;
    logout: () => void;
    switchRole: (role: string) => void;
}"""
content = re.sub(r'interface AuthContextType \{[\s\S]*?\}', new_auth_context_type, content, count=1)

# Update initial context
new_initial = """const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isAuthenticated: false,
    activeRole: null,
    login: () => {},
    logout: () => {},
    switchRole: () => {},
});"""
content = re.sub(r'const AuthContext = createContext<AuthContextType>\(\{[\s\S]*?\}\);', new_initial, content, count=1)

# Now inject activeRole logic inside AuthProvider
# Let's find the useStates
states_match = re.search(r'    const \[user, setUser\] = useState<UserInfo \| null>\(null\);\n    const \[token, setToken\] = useState<string \| null>\(null\);\n    const \[isMounted, setIsMounted\] = useState\(false\);', content)

if states_match:
    new_states = """    const [user, setUser] = useState<UserInfo | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);"""
    content = content.replace(states_match.group(0), new_states)

# Inside useEffect for initialization
init_effect = """        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }"""
new_init_effect = """        if (storedToken && storedUser) {
            setToken(storedToken);
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            const storedActiveRole = localStorage.getItem('activeRole');
            setActiveRole(storedActiveRole || parsedUser.role);
        }"""
content = content.replace(init_effect, new_init_effect)

# In login
login_func = """    const login = (newToken: string, newUser: UserInfo) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
        
        // Redirection en fonction du rôle
        router.push(getRedirectPath(newUser.role));
    };"""
new_login_func = """    const login = (newToken: string, newUser: UserInfo) => {
        setToken(newToken);
        setUser(newUser);
        setActiveRole(newUser.role);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
        localStorage.setItem('activeRole', newUser.role);
        
        // Redirection en fonction du rôle
        router.push(getRedirectPath(newUser.role));
    };"""
content = content.replace(login_func, new_login_func)

# SwitchRole and Logout
logout_func = """    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };"""
new_logout_func = """    const logout = () => {
        setToken(null);
        setUser(null);
        setActiveRole(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('activeRole');
        router.push('/login');
    };

    const switchRole = (role: string) => {
        if (!user) return;
        const allRoles = [user.role, ...(user.roles_secondaires || [])];
        if (allRoles.includes(role)) {
            setActiveRole(role);
            localStorage.setItem('activeRole', role);
            router.push(getRedirectPath(role));
        }
    };"""
content = content.replace(logout_func, new_logout_func)

# Return provider
prov_return = """    return (
        <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );"""
new_prov_return = """    return (
        <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, activeRole, login, logout, switchRole }}>
            {children}
        </AuthContext.Provider>
    );"""
content = content.replace(prov_return, new_prov_return)


# Also we need to check how LoginPage was doing auth, because the previous auth API returned:
# { "token": "...", "user": {...} }
# Now I should make sure the old login page calls the new API. Wait! The old login page was just calling authContext.login directly with token and user in the rewritten version?
# Let's check my LoginPage implementation in `frontend/src/app/login/page.tsx`. Wait, I didn't write an API call in the new `LoginPage`!
# Let me look at my `frontend/src/app/login/page.tsx` that I wrote.

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated AuthContext.tsx")
