'use client';

/**
 * Page de repli affichée par le Service Worker (voir src/app/sw.ts) quand une
 * navigation échoue hors-ligne sans version déjà en cache — typiquement le
 * tout premier accès à l'app sans connexion. Ne doit dépendre d'aucun appel
 * réseau : c'est justement l'écran affiché quand il n'y en a aucun.
 */
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function HorsLignePage() {
    const [online, setOnline] = useState(true);

    useEffect(() => {
        setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
        const onOnline = () => {
            setOnline(true);
            window.location.reload();
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, []);

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: 24,
                textAlign: 'center',
                background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
            }}
        >
            <div
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fee2e2',
                    color: '#b91c1c',
                }}
            >
                <WifiOff size={30} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Aucune connexion internet
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', maxWidth: 380, margin: 0 }}>
                {online
                    ? 'La connexion vient de revenir, rechargement en cours…'
                    : 'Cette page n\'a pas encore été visitée avec une connexion active. Reconnecte-toi pour continuer — la saisie de notes et présences déjà ouverte reste disponible et se synchronisera automatiquement.'}
            </p>
            <button
                onClick={() => window.location.reload()}
                style={{
                    marginTop: 8,
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#059669',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                }}
            >
                Réessayer
            </button>
        </div>
    );
}
