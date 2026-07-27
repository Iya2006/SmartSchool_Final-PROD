'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirige la page de comptabilité générale (non utilisée dans ce profil d'école) vers le Tableau de Bord.
 */
export default function GeneralPageRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/comptabilite/dashboard');
    }, [router]);

    return null;
}
