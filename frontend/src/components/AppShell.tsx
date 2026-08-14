'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UIProvider, useUI } from '@/context/UIContext';
import { isAdminSystemRole } from '@/lib/roleAccess';
import { useIsMobile } from '@/hooks/useIsMobile';
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
    '/hors-ligne',
];

function AppShellInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthenticated, user } = useAuth();
    const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUI();
    const isMobile = useIsMobile();

    const isFullscreen = FULLSCREEN_PATHS.some(p => pathname.startsWith(p));

    if (isFullscreen || !isAuthenticated) {
        return <>{children}</>;
    }

    if (!isAdminSystemRole(user?.role)) {
        return <>{children}</>;
    }

    // Sous 768px, la sidebar est un tiroir masque par defaut (voir
    // Sidebar.module.css) : plus besoin de lui reserver de la place.
    const sidebarWidth = isMobile ? 0 : (sidebarCollapsed ? 96 : 280);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}>
            <div className="no-print"><Sidebar /></div>
            {mobileSidebarOpen && (
                <div
                    onClick={closeMobileSidebar}
                    aria-hidden="true"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 99 }}
                />
            )}
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

