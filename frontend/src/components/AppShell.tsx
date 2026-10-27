'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { UIProvider, useUI } from '@/context/UIContext';
import { isAdminSystemRole } from '@/lib/roleAccess';
import { useIsMobile } from '@/hooks/useIsMobile';
import { startAutoSync } from '@/lib/syncEngine';
import { preparerSiNecessaire } from '@/lib/preparationHorsLigne';
import { estFenetrePreparation } from '@/lib/fenetrePreparation';
import { EST_POSTE } from '@/lib/poste';

const UNE_HEURE = 60 * 60 * 1000;
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import LectureSeuleBanner from '@/components/LectureSeuleBanner';

// Pages en plein écran (pas de Sidebar/Topbar)
const FULLSCREEN_PATHS = [
    '/login',
    '/portail-parent',
    '/portail-enseignant',
    '/portail-eleve',
    '/comptabilite',
    '/personnel/portail',
    '/hors-ligne',
    '/verifier-recu',
];

function AppShellInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { isAuthenticated, user } = useAuth();
    const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUI();
    const isMobile = useIsMobile();

    // Moteur de synchronisation (lib/syncEngine.ts) démarré une seule fois,
    // ici, pour toute l'application — plutôt que dans une page précise
    // (avant : uniquement le portail enseignant, donc la file locale
    // n'était rejouée que si l'utilisateur se trouvait justement dans ce
    // portail au retour de connexion). AppShell enveloppe déjà toutes les
    // routes (admin ET portails, voir le rendu ci-dessous), c'est le seul
    // point toujours monté pendant toute la session.
    useEffect(() => {
        if (!isAuthenticated) return;
        // Fenêtre invisible de préparation : passive (voir lib/fenetrePreparation.ts).
        // Un second moteur de rejeu y enverrait la même file en double.
        if (estFenetrePreparation()) return;
        const stopAutoSync = startAutoSync();
        // Poste local : les données sont déjà dans la base de l'ordinateur.
        if (EST_POSTE) return stopAutoSync;

        // Préparation hors-ligne (lib/preparationHorsLigne.ts), en arrière-plan.
        // Au démarrage, après un court délai pour laisser l'écran se charger ;
        // au retour du réseau ; et quand le Service Worker prend la main (tout
        // premier passage : sans lui, rien de préparé ne serait gardé).
        const auDemarrage = setTimeout(() => preparerSiNecessaire(6 * UNE_HEURE), 5000);
        const auRetourDuReseau = () => preparerSiNecessaire(UNE_HEURE);
        const quandLeServiceWorkerPrendLaMain = () => preparerSiNecessaire(6 * UNE_HEURE);
        window.addEventListener('online', auRetourDuReseau);
        navigator.serviceWorker?.addEventListener('controllerchange', quandLeServiceWorkerPrendLaMain);

        return () => {
            stopAutoSync();
            clearTimeout(auDemarrage);
            window.removeEventListener('online', auRetourDuReseau);
            navigator.serviceWorker?.removeEventListener('controllerchange', quandLeServiceWorkerPrendLaMain);
        };
    }, [isAuthenticated]);

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
                    <LectureSeuleBanner />
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

