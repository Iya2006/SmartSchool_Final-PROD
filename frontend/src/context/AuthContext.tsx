'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

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

// ─── Fonction utilitaire pour obtenir la route cible selon le rôle ───
export const getRedirectPath = (userRole: string): string => {
    // Tous les rôles administratifs ou de direction vont vers le dashboard unifié
    const adminRoles = ['SUPER_ADMIN', 'FONDATEUR', 'DG', 'DIRECTEUR_NIVEAU', 'ADMIN'];
    
    if (adminRoles.includes(userRole)) {
        return '/dashboard';
    }

    const ROLE_ROUTES: Record<string, string> = {
        'COMPTABLE': '/comptabilite/dashboard',
        'ENSEIGNANT': '/portail-enseignant',
        'BIBLIOTHECAIRE': '/portail-bibliotheque',
        'INFORMATICIEN': '/portail-informatique',
        'PARENT': '/portail-parent',
        'ELEVE': '/portail-eleve',
    };
    
    return ROLE_ROUTES[userRole] || '/dashboard';
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    // Charger les données depuis localStorage au démarrage.
    useEffect(() => {
        const savedToken = localStorage.getItem('smartschool_token');
        const savedUser  = localStorage.getItem('smartschool_user');

        if (savedToken && savedUser) {
            try {
                const parsedUser = JSON.parse(savedUser);
                setToken(savedToken);
                setUser(parsedUser);
            } catch (e) {
                console.error('Erreur parsing user', e);
            }
        }
        setChecked(true);
    }, []);

    // Protection des routes et redirection globale
    useEffect(() => {
        if (!checked) return;

        if (!token) {
            if (pathname !== '/login') {
                router.push('/login');
            }
        } else {
            // S'il est sur /login mais connecté, on le redirige vers son portail
            if (pathname === '/login' && user) {
                router.push(getRedirectPath(user.role));
            }
        }
    }, [checked, token, pathname, router, user]);

    const login = (newToken: string, newUser: UserInfo) => {
        setToken(newToken);
        setUser(newUser);
        
        localStorage.setItem('smartschool_token', newToken);
        localStorage.setItem('smartschool_user', JSON.stringify(newUser));
        
        router.push(getRedirectPath(newUser.role));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        
        localStorage.removeItem('smartschool_token');
        localStorage.removeItem('smartschool_user');
        
        router.push('/login');
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
