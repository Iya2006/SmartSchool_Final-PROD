'use client';

/**
 * Application installée : tant que l'école n'a pas été téléchargée sur cet
 * ordinateur, aucun compte n'existe dans la base locale — on mène donc à
 * l'écran d'installation plutôt qu'à une connexion vouée à l'échec.
 * Ne fait rien dans la version web.
 */
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { EST_POSTE } from '@/lib/poste';

export default function GardeInstallationPoste() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!EST_POSTE || pathname === '/installation') return;
        let annule = false;
        api.get('/api/poste/etat')
            .then((res) => {
                if (!annule && res.data?.statut !== 'INSTALLE') router.replace('/installation');
            })
            .catch(() => {
                // Moteur injoignable : l'écran d'installation l'explique.
                if (!annule) router.replace('/installation');
            });
        return () => { annule = true; };
    }, [pathname, router]);

    return null;
}
