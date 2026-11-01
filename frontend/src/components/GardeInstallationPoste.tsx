'use client';

/**
 * Application installée : tant que l'école n'a pas été téléchargée sur cet
 * ordinateur, aucun compte n'existe dans la base locale — on mène donc à
 * l'écran d'installation plutôt qu'à une connexion vouée à l'échec.
 *
 * Si la direction a retiré ce poste (ordinateur perdu, volé, remplacé), le
 * moteur refuse toute connexion : on l'explique ici, en plein écran, plutôt
 * que de laisser l'utilisateur buter sur un refus de connexion.
 *
 * Ne fait rien dans la version web.
 */
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import { EST_POSTE } from '@/lib/poste';

export default function GardeInstallationPoste() {
    const router = useRouter();
    const pathname = usePathname();
    const [retire, setRetire] = useState<string | null>(null);

    useEffect(() => {
        if (!EST_POSTE) return;
        let annule = false;
        const verifier = () => api.get('/api/poste/etat')
            .then((res) => {
                if (annule) return;
                setRetire(res.data?.retire ?? null);
                if (res.data?.statut !== 'INSTALLE' && pathname !== '/installation') router.replace('/installation');
            })
            .catch(() => {
                // Moteur injoignable : l'écran d'installation l'explique.
                if (!annule && pathname !== '/installation') router.replace('/installation');
            });
        void verifier();
        // Un retrait (ou une remise en service) arrive par la synchronisation.
        const minuteur = setInterval(() => void verifier(), 60000);
        return () => { annule = true; clearInterval(minuteur); };
    }, [pathname, router]);

    if (!retire) return null;
    return (
        <div role="alert" style={{
            position: 'fixed', inset: 0, zIndex: 9999, display: 'grid', placeItems: 'center', padding: 16,
            background: '#0f172a',
        }}>
            <div style={{
                maxWidth: 520, background: '#fff', borderRadius: 18, padding: '28px 26px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
            }}>
                <ShieldAlert size={40} style={{ color: '#b91c1c' }} />
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Poste retiré par la direction</h1>
                <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.6 }}>{retire}</p>
            </div>
        </div>
    );
}
