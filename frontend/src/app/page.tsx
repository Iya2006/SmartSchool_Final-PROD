'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/**
 * Page racine : redirige vers le dashboard si connecté, sinon vers le login.
 */
export default function HomePage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            router.replace('/dashboard');
        } else {
            router.replace('/login');
        }
    }, [isAuthenticated, router]);

    // Afficher rien pendant la redirection
    return null;
}
