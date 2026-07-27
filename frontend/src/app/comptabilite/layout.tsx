'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
    Banknote, AlertTriangle, Wallet, LayoutDashboard, 
    FileText, Users, LogOut, Menu, ChevronDown, ChevronRight
} from 'lucide-react';

const MODULES = [
    { 
        id: 'encaissement', 
        label: 'Encaissement Scolarité', 
        icon: Banknote, 
        path: '/comptabilite/encaissement',
    },
    { id: 'impayes', label: 'Suivi des Impayés', icon: AlertTriangle, path: '/comptabilite/impayes' },
    { id: 'depenses', label: 'Dépenses', icon: Wallet, path: '/comptabilite/depenses' },
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard, path: '/comptabilite/dashboard' },
    { id: 'rapports', label: 'Rapports et Exports', icon: FileText, path: '/comptabilite/rapports' },
    { 
        id: 'salaires', 
        label: 'Salaires et Personnel', 
        icon: Users, 
        path: '/comptabilite/salaires',
        subItems: [
            { id: 'personnel', label: 'Liste du personnel', path: '/comptabilite/salaires?tab=personnel', tab: 'personnel' },
            { id: 'paie', label: 'Calcul des salaires', path: '/comptabilite/salaires?tab=paie', tab: 'paie' },
            { id: 'avances', label: 'Primes & Avances', path: '/comptabilite/salaires?tab=avances', tab: 'avances' },
            { id: 'sources', label: 'Source des absences', path: '/comptabilite/salaires?tab=sources', tab: 'sources' },
            { id: 'calendrier', label: 'Calendrier de paie', path: '/comptabilite/salaires?tab=calendrier', tab: 'calendrier' },
            { id: 'bulletins', label: 'Bulletins de paie', path: '/comptabilite/salaires?tab=bulletins', tab: 'bulletins' },
            { id: 'historique', label: 'Historique de paie', path: '/comptabilite/salaires?tab=historique', tab: 'historique' },
        ]
    },
];

function SidebarMenu({ isSidebarOpen }: { isSidebarOpen: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({ general: true });
    
    const activeTab = searchParams.get('tab') || 'saisie';

    const toggleMenu = (id: string) => {
        setOpenMenus(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <aside style={{
            width: isSidebarOpen ? '320px' : '0px',
            backgroundColor: '#ffffff',
            borderRight: '1px solid #e2e8f0',
            transition: 'all 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Logo Area */}
            <div style={{
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid #e2e8f0',
                minWidth: '320px'
            }}>
                <div style={{
                    width: '40px', height: '40px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 'bold', fontSize: '18px'
                }}>
                    CP
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Comptabilité</h1>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Portail Financier</p>
                </div>
            </div>

            {/* Menu Items */}
            <div className="sidebar-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', minWidth: '320px' }}>
                {MODULES.map((mod) => {
                    const Icon = mod.icon;
                    const isActive = pathname.startsWith(mod.path);
                    const isOpen = openMenus[mod.id];
                    const hasSubItems = mod.subItems && mod.subItems.length > 0;

                    return (
                        <div key={mod.id} style={{ marginBottom: '4px' }}>
                            <div 
                                onClick={() => hasSubItems ? toggleMenu(mod.id) : router.push(mod.path)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    backgroundColor: isActive && !hasSubItems ? '#ecfdf5' : 'transparent',
                                    color: isActive && !hasSubItems ? '#059669' : '#475569',
                                    transition: 'all 0.2s ease',
                                    fontWeight: isActive ? '600' : '500',
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {Icon === Banknote ? (
                                        <span style={{ 
                                            fontSize: '9px', 
                                            fontWeight: '800', 
                                            backgroundColor: '#10b981', 
                                            color: '#ffffff', 
                                            padding: '3px 5px', 
                                            borderRadius: '4px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            lineHeight: '1',
                                            width: '24px',
                                            height: '18px',
                                            boxSizing: 'border-box'
                                        }}>
                                            GNF
                                        </span>
                                    ) : (
                                        <Icon size={18} />
                                    )}
                                    <span>{mod.label}</span>
                                </div>
                                {hasSubItems && (
                                    isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                                )}
                            </div>
                            
                            {/* SubItems */}
                            {hasSubItems && isOpen && (
                                <div style={{ marginLeft: '14px', paddingLeft: '14px', borderLeft: '1px solid #e2e8f0', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {mod.subItems?.map(sub => {
                                        const isSubActive = isActive && activeTab === sub.tab;
                                        return (
                                            <Link key={sub.id} href={sub.path} style={{ textDecoration: 'none' }}>
                                                <div style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '13px',
                                                    color: isSubActive ? '#059669' : '#64748b',
                                                    backgroundColor: isSubActive ? '#ecfdf5' : 'transparent',
                                                    fontWeight: isSubActive ? '600' : '500',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                                onMouseEnter={(e) => { if (!isSubActive) e.currentTarget.style.color = '#0f172a'; }}
                                                onMouseLeave={(e) => { if (!isSubActive) e.currentTarget.style.color = '#64748b'; }}
                                                >
                                                    {sub.label}
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}

export default function ComptabiliteLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [comptableInfo, setComptableInfo] = useState<{
        nom?: string;
        prenom?: string;
        etablissement_nom?: string;
    } | null>(null);

    useEffect(() => {
        const session = sessionStorage.getItem('comptabilite_auth');
        const token = localStorage.getItem('smartschool_token');
        const smartschoolUser = localStorage.getItem('smartschool_user');

        let isAuth = false;
        if (smartschoolUser) {
            try {
                const parsed = JSON.parse(smartschoolUser);
                if (parsed?.role === 'COMPTABLE' || parsed?.role === 'ADMIN') {
                    isAuth = true;
                }
            } catch {}
        }
        if (session || token) {
            isAuth = true;
        }

        if (!isAuth && pathname !== '/comptabilite/login') {
            router.push('/comptabilite/login');
        } else if (isAuth) {
            setIsAuthenticated(true);
            if (pathname === '/comptabilite') {
                router.push('/comptabilite/dashboard');
            }
            if (session) {
                try {
                    const data = JSON.parse(session);
                    setComptableInfo(data);
                } catch (e) {
                    setComptableInfo({
                        nom: 'Comptable',
                        prenom: 'Admin',
                        etablissement_nom: 'Portail Financier'
                    });
                }
            }
        }
    }, [pathname, router]);

    if (!isAuthenticated && pathname === '/comptabilite/login') {
        return <>{children}</>;
    }

    if (!isAuthenticated) return null;

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f8fafc', overflow: 'hidden' }}>
            <style>{`
                .sidebar-scroll::-webkit-scrollbar {
                    display: none;
                }
                .sidebar-scroll {
                    -ms-overflow-style: none;  /* IE and Edge */
                    scrollbar-width: none;  /* Firefox */
                }
            `}</style>
            
            <Suspense fallback={<aside style={{width: '320px', borderRight: '1px solid #e2e8f0'}} />}>
                <SidebarMenu isSidebarOpen={isSidebarOpen} />
            </Suspense>

            {/* Main Content */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Topbar */}
                <header style={{
                    height: '70px',
                    backgroundColor: '#ffffff',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 24px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button 
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                        >
                            <Menu size={24} />
                        </button>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#0f172a' }}>
                            {MODULES.find(m => pathname.startsWith(m.path))?.label || 'Comptabilité'}
                        </h2>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ 
                                width: '38px', height: '38px', 
                                borderRadius: '50%', 
                                backgroundColor: '#ecfdf5', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                fontWeight: '700', color: '#059669',
                                border: '1px solid #d1fae5',
                                fontSize: '14px'
                            }}>
                                {comptableInfo?.prenom?.[0] || 'C'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a', lineHeight: '1.2' }}>
                                    {comptableInfo ? `${comptableInfo.prenom} ${comptableInfo.nom}` : 'Admin Comptable'}
                                </p>
                                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b', fontWeight: '500', lineHeight: '1.1' }}>
                                    {comptableInfo?.etablissement_nom || 'Portail Financier'}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                sessionStorage.removeItem('comptabilite_auth');
                                localStorage.removeItem('smartschool_token');
                                localStorage.removeItem('smartschool_user');
                                router.push('/comptabilite/login');
                            }}
                            style={{
                                background: '#fee2e2',
                                color: '#ef4444',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                fontWeight: '500',
                                fontSize: '14px'
                            }}
                        >
                            <LogOut size={16} />
                            Se déconnecter
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
