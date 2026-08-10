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

const PUBLIC_PATHS = ['/login'];

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

        const targetPath = getRedirectPath(user.role);

        if (pathname === '/login') {
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
