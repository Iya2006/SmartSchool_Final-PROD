'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UIProvider, useUI } from '@/context/UIContext';
import { isAdminSystemRole } from '@/lib/roleAccess';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

// Pages en plein écran (pas de Sidebar/Topbar)
const FULLSCREEN_PATHS = [
    '/login',
    '/portail-parent',
    '/portail-enseignant',
    '/portail-eleve',
    '/comptabilite',
    '/personnel/portail',
];

function AppShellInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthenticated, user } = useAuth();
    const { sidebarCollapsed } = useUI();

    const isFullscreen = FULLSCREEN_PATHS.some(p => pathname.startsWith(p));

    if (isFullscreen || !isAuthenticated) {
        return <>{children}</>;
    }

    if (!isAdminSystemRole(user?.role)) {
        return <>{children}</>;
    }

    const sidebarWidth = sidebarCollapsed ? 96 : 280;

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}>
            <div className="no-print"><Sidebar /></div>
            <div
                className="main-content"
                style={{
                    flex: 1,
                    marginLeft: `${sidebarWidth}px`,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    minHeight: '100vh',
                    transition: 'margin-left 0.28s ease',
                }}
            >
                <div className="no-print"><Topbar /></div>
                <main style={{ padding: '118px 24px 30px', flex: 1, minWidth: 0 }}>
                    {children}
                </main>
            </div>
        </div>
    );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <UIProvider>
            <AppShellInner>{children}</AppShellInner>
        </UIProvider>
    );
}

