'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import BackButton from '@/components/BackButton';

// Pages en plein écran (pas de Sidebar/Topbar)
const FULLSCREEN_PATHS = [
    '/login',
    '/portail-parent',
    '/portail-enseignant',
    '/portail-eleve',
    '/comptabilite',
];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthenticated } = useAuth();

    const isFullscreen = FULLSCREEN_PATHS.some(p => pathname.startsWith(p));

    // ─── Mode Plein Écran ───
    // Login, portails enseignant/parent → aucune sidebar/topbar
    if (isFullscreen || !isAuthenticated) {
        return <>{children}</>;
    }

    // ─── Mode Admin ───
    // L'admin est connecté → afficher Sidebar + Topbar + BackButton
    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-body)' }}>
            <div className="no-print"><Sidebar /></div>
            <div className="main-content" style={{ flex: 1, marginLeft: '260px', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <div className="no-print"><Topbar /></div>
                <main style={{ padding: '24px 30px', flex: 1, overflow: 'auto' }}>
                    {children}
                </main>
            </div>
        </div>
    );
}

