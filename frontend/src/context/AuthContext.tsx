'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { canAccessPathForRole, getRedirectPathForRole } from '@/lib/roleAccess';
import { purgeLocalSessionData } from '@/lib/sessionCleanup';

export interface UserInfo {
    id: number;
    nom: string;
    prenom: string;
    nom_utilisateur: string;
    email: string;
    telephone: string;
    role: string;
    /**
     * Établissement du compte, dérivé côté serveur au moment du login — jamais
     * fourni ni modifiable par le client. Sert uniquement à afficher la bonne
     * identité d'école ; l'isolation réelle des données reste imposée par le
     * JWT côté backend.
     *
     * `null`      : SUPER_ADMIN plateforme, ou parent dont les enfants sont
     *               répartis dans zéro ou plusieurs écoles (aucun établissement
     *               unique déterminable — on n'en choisit jamais un au hasard).
     * `undefined` : session ouverte avant l'ajout de ce champ ; l'utilisateur
     *               doit se reconnecter pour que son école soit connue.
     */
    etablissement_id?: number | null;
}

export interface AuthContextType {
    user: UserInfo | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string, user: UserInfo) => void;
    logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isAuthenticated: false,
    login: () => {},
    logout: () => {},
});

export const getRedirectPath = (userRole: string): string => {
    return getRedirectPathForRole(userRole);
};

// Pages accessibles sans compte. `/inscription` en fait partie : un
// fondateur qui vient inscrire son ecole n'a par definition aucun compte,
// et sans cette ligne il serait renvoye au login qu'il ne peut pas passer.
const PUBLIC_PATHS = ['/login', '/inscription'];

/** Écran où un administrateur plateforme choisit l'école dans laquelle il
 * travaille. Il n'appartient à aucune école : sans ce passage, toutes les
 * routes métier lui répondent 403 et l'application paraît cassée. */
const SELECTION_ETABLISSEMENT = '/selection-etablissement';

/** Un SUPER_ADMIN qui n'a pas encore choisi son école active. `undefined`
 * (session ouverte avant l'ajout du champ) compte aussi : on le fait choisir
 * plutôt que de le laisser se heurter à des 403 sur chaque écran. */
export const doitChoisirEtablissement = (user: UserInfo | null): boolean =>
    !!user && user.role === 'SUPER_ADMIN' &&
    (user.etablissement_id === null || user.etablissement_id === undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const savedToken = localStorage.getItem('smartschool_token');
        const savedUser = localStorage.getItem('smartschool_user');

        let parsedToken: string | null = null;
        let parsedUser: UserInfo | null = null;

        if (savedToken && savedUser) {
            try {
                parsedUser = JSON.parse(savedUser);
                parsedToken = savedToken;
            } catch (e) {
                console.error('Erreur parsing user', e);
                localStorage.removeItem('smartschool_token');
                localStorage.removeItem('smartschool_user');
            }
        }

        setToken(parsedToken);
        setUser(parsedUser);
        setChecked(true);
    }, []);

    useEffect(() => {
        if (!checked) return;

        const isPublicPath = PUBLIC_PATHS.includes(pathname);

        if (!token || !user) {
            if (!isPublicPath) {
                router.push('/login');
            }
            return;
        }

        // Un administrateur plateforme doit d'abord désigner son école active :
        // tant qu'il ne l'a pas fait, aucune route métier ne lui répond.
        if (doitChoisirEtablissement(user)) {
            if (pathname !== SELECTION_ETABLISSEMENT) {
                router.push(SELECTION_ETABLISSEMENT);
            }
            return;
        }

        const targetPath = getRedirectPath(user.role);

        if (pathname === SELECTION_ETABLISSEMENT) {
            router.push(targetPath);
            return;
        }

        if (pathname === '/login' || pathname === '/inscription') {
            router.push(targetPath);
            return;
        }

        if (!canAccessPathForRole(user.role, pathname)) {
            router.push(targetPath);
        }
    }, [checked, token, user, pathname, router]);

    const login = (newToken: string, newUser: UserInfo) => {
        setToken(newToken);
        setUser(newUser);

        localStorage.setItem('smartschool_token', newToken);
        localStorage.setItem('smartschool_user', JSON.stringify(newUser));

        router.push(getRedirectPath(newUser.role));
    };

    const logout = async () => {
        setToken(null);
        setUser(null);

        if (typeof window !== 'undefined') {
            localStorage.removeItem('smartschool_token');
            localStorage.removeItem('smartschool_user');
            // Purge des données locales du module offline-first (§13 du guide
            // fourni : "suppression des données locales après déconnexion") —
            // le cache React Query persisté (voir components/QueryProvider.tsx),
            // le Cache Storage du Service Worker, la file offline (si vide) et
            // le cache delta (Étape C) ne doivent pas survivre à une
            // déconnexion, surtout sur un poste partagé. Logique commune avec
            // l'intercepteur 401 (lib/api.ts) — voir lib/sessionCleanup.ts.
            localStorage.removeItem('smartschool-query-cache');
            await purgeLocalSessionData();
            sessionStorage.clear();
            window.location.href = '/login';
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
