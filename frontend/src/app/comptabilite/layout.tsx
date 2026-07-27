'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
    Book, DollarSign, CreditCard, AlertTriangle, Link2, Search, 
    ClipboardList, Building, RefreshCw, FileText, LayoutDashboard, 
    Download, Scale, Calendar, Lock, Smartphone, Settings, LogOut,
    Menu, ChevronDown, ChevronRight, CheckCircle2
} from 'lucide-react';

const MODULES = [
    { id: 'dashboard', label: 'Tableaux de Bord', icon: LayoutDashboard, path: '/comptabilite/dashboard' },
    { 
        id: 'general', 
        label: 'Comptabilité Générale', 
        icon: Book, 
        path: '/comptabilite/general',
        subItems: [
            { id: 'saisie', label: 'Saisie manuelle des écritures', path: '/comptabilite/general?tab=saisie', tab: 'saisie' },
            { id: 'auto', label: 'Saisie automatique (Facturation)', path: '/comptabilite/general?tab=auto', tab: 'auto' },
            { id: 'recherche', label: 'Recherche et filtrage', path: '/comptabilite/general?tab=recherche', tab: 'recherche' },
            { id: 'exercices', label: 'Gestion des exercices', path: '/comptabilite/general?tab=exercices', tab: 'exercices' },
            { id: 'journaux', label: 'Journaux comptables', path: '/comptabilite/general?tab=journaux', tab: 'journaux' },
            { id: 'plan', label: 'Plan comptable', path: '/comptabilite/general?tab=plan', tab: 'plan' },
            { id: 'balance', label: 'Balance générale', path: '/comptabilite/general?tab=balance', tab: 'balance' },
            { id: 'livre', label: 'Grand livre', path: '/comptabilite/general?tab=livre', tab: 'livre' },
            { id: 'resultat', label: 'Compte de résultat', path: '/comptabilite/general?tab=resultat', tab: 'resultat' },
            { id: 'analytique', label: 'Compte de résultat analytique', path: '/comptabilite/general?tab=analytique', tab: 'analytique' },
            { id: 'balance_comptes', label: 'Balance des comptes', path: '/comptabilite/general?tab=balance_comptes', tab: 'balance_comptes' },
        ]
    },
    { 
        id: 'frais', 
        label: 'Frais Scolaires', 
        icon: DollarSign, 
        path: '/comptabilite/frais',
        subItems: [
            { id: 'types-frais', label: 'Paramétrage des tarifs', path: '/comptabilite/frais?tab=types', tab: 'types' },
            { id: 'factures', label: 'Gestion des factures', path: '/comptabilite/frais?tab=factures', tab: 'factures' },
            { id: 'echeances', label: 'Échéanciers de paiement', path: '/comptabilite/frais?tab=echeances', tab: 'echeances' },
            { id: 'paiements', label: 'Suivi des encaissements', path: '/comptabilite/frais?tab=paiements', tab: 'paiements' },
        ]
    },
    { id: 'paiements', label: 'Gestion des Paiements', icon: CreditCard, path: '/comptabilite/paiements' },
    { id: 'impayes', label: 'Suivi des Impayés', icon: AlertTriangle, path: '/comptabilite/impayes' },
    { id: 'auxiliaire', label: 'Comptabilité Auxiliaire', icon: Link2, path: '/comptabilite/auxiliaire' },
    { id: 'analytique', label: 'Comptabilité Analytique', icon: Search, path: '/comptabilite/analytique' },
    { id: 'budget', label: 'Comptabilité Budgétaire', icon: ClipboardList, path: '/comptabilite/budget' },
    { id: 'immobilisations', label: 'Immobilisations', icon: Building, path: '/comptabilite/immobilisations' },
    { id: 'arretes', label: 'Arrêtés Comptables', icon: RefreshCw, path: '/comptabilite/arretes' },
    { id: 'lettrage', label: 'Lettrage & Rapprochement', icon: CheckCircle2, path: '/comptabilite/lettrage' },
    { id: 'caisses', label: 'Gestion des Caisses', icon: FileText, path: '/comptabilite/caisses' },
    { id: 'exports', label: 'Exportations & Rapports', icon: Download, path: '/comptabilite/exports' },
    { id: 'fiscal', label: 'Obligations Fiscales', icon: Scale, path: '/comptabilite/fiscal' },
    { id: 'annees', label: 'Gestion Multi-Année', icon: Calendar, path: '/comptabilite/annees' },
    { id: 'securite', label: 'Sécurité & Contrôle', icon: Lock, path: '/comptabilite/securite' },
    { id: 'scolaire', label: 'Spécificités Scolaires', icon: Smartphone, path: '/comptabilite/scolaire' },
    { id: 'automatisations', label: 'Automatisations', icon: Settings, path: '/comptabilite/automatisations' },
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
                                    <Icon size={18} />
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

    useEffect(() => {
        const session = sessionStorage.getItem('comptabilite_auth');
        const smartschoolUser = localStorage.getItem('smartschool_user');

        if (smartschoolUser) {
            try {
                const parsed = JSON.parse(smartschoolUser);
                if (parsed?.role === 'COMPTABLE') {
                    setIsAuthenticated(true);
                    if (pathname === '/comptabilite' || pathname === '/comptabilite/login') {
                        router.push('/comptabilite/dashboard');
                    }
                    return;
                }
            } catch {
                // ignore broken storage and fallback to PIN flow
            }
        }

        if (!session && pathname !== '/comptabilite/login') {
            router.push('/comptabilite/login');
        } else if (session) {
            setIsAuthenticated(true);
            if (pathname === '/comptabilite') {
                router.push('/comptabilite/dashboard');
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#475569' }}>
                                A
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Admin Comptable</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                sessionStorage.removeItem('comptabilite_auth');
                                router.push('/dashboard');
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
                            Retour Admin
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
