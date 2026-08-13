'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    Banknote, AlertTriangle, FileText, Users, LogOut, Menu,
    ChevronDown, ChevronRight, Receipt, UserCheck, Wallet
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';

// SEPT ENTREES, pas douze.
//
// Un comptable d'ecole fait six choses : encaisser, definir les frais, savoir
// qui doit combien, reinscrire, payer les depenses et le personnel, sortir les
// chiffres. Le menu suit ce metier plutot que le decoupage technique du code.
//
// Rien n'a ete supprime : ce qui n'apparait plus ici (comptabilite auxiliaire,
// automatisations, solvabilite) releve d'un metier d'expert-comptable ou n'a
// jamais eu de contenu. Les pages restent dans le code, non referencees — les
// remettre est une ligne.
//
// Ce qui etait un module a part et devient un sous-menu : la gestion des
// paiements (c'est l'historique de l'encaissement), le tableau de bord et les
// exports (ce sont deux facons de lire les memes chiffres).
interface SousMenu {
    id: string;
    label: string;
    path: string;
    /** Onglet de la page parente. Absent quand le sous-menu mène à une page
     *  entière (l'historique des paiements, le tableau de bord). */
    tab?: string;
}

const MODULES = [
    {
        id: 'encaissement',
        label: 'Encaissement',
        icon: Banknote,
        path: '/comptabilite/encaissement',
        subItems: [
            { id: 'encaisser', label: 'Encaisser un paiement', path: '/comptabilite/encaissement' },
            { id: 'paiements', label: 'Historique des paiements', path: '/comptabilite/paiements' },
        ]
    },
    {
        id: 'frais', label: 'Frais & Tarifs', icon: Receipt, path: '/comptabilite/frais',
        // « Tarifs par classe » vivait derriere un petit bouton sur une ligne de
        // la liste des types de frais. C'est pourtant LE reglage du module : le
        // prix de l'annee. Il devient une destination, juste apres l'ecran qui
        // dit CE QUE l'ecole fait payer — quoi, puis combien.
        subItems: [
            { id: 'frais-types', label: 'Types de frais', path: '/comptabilite/frais?tab=types', tab: 'types' },
            { id: 'frais-tarifs', label: 'Tarifs par classe', path: '/comptabilite/frais?tab=tarifs', tab: 'tarifs' },
            { id: 'frais-factures', label: 'Factures', path: '/comptabilite/frais?tab=factures', tab: 'factures' },
            { id: 'frais-echeances', label: 'Échéanciers', path: '/comptabilite/frais?tab=echeances', tab: 'echeances' },
        ]
    },
    { id: 'impayes', label: 'Impayés', icon: AlertTriangle, path: '/comptabilite/impayes' },
    { id: 'reinscription', label: 'Réinscriptions', icon: UserCheck, path: '/comptabilite/reinscription' },
    { id: 'depenses', label: 'Dépenses', icon: Wallet, path: '/comptabilite/depenses' },
    {
        id: 'salaires',
        label: 'Salaires',
        icon: Users,
        path: '/comptabilite/salaires',
        // Sept onglets ramenes a quatre : payer le personnel, c'est preparer la
        // paie, verser des avances, editer les bulletins, et retrouver un
        // versement passe. « Source des absences » et « Calendrier de paie »
        // restent accessibles depuis l'ecran lui-meme.
        subItems: [
            { id: 'personnel', label: 'Personnel', path: '/comptabilite/salaires?tab=personnel', tab: 'personnel' },
            { id: 'paie', label: 'Préparer la paie', path: '/comptabilite/salaires?tab=paie', tab: 'paie' },
            { id: 'avances', label: 'Primes & avances', path: '/comptabilite/salaires?tab=avances', tab: 'avances' },
            { id: 'bulletins', label: 'Bulletins de paie', path: '/comptabilite/salaires?tab=bulletins', tab: 'bulletins' },
        ]
    },
    {
        id: 'rapports', label: 'Rapports', icon: FileText, path: '/comptabilite/rapports',
        subItems: [
            { id: 'dashboard', label: 'Tableau de bord', path: '/comptabilite/dashboard' },
            { id: 'rapports-fin', label: 'Rapports financiers', path: '/comptabilite/rapports' },
            { id: 'exports', label: 'Exports CSV', path: '/comptabilite/exports' },
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
                                        // Un sous-menu sans `tab` mene a une page entiere :
                                        // il est actif quand on est SUR cette page.
                                        const sousMenu = sub as SousMenu;
                                        const isSubActive = sousMenu.tab
                                            ? isActive && activeTab === sousMenu.tab
                                            : pathname === sousMenu.path;
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
    const pathname = usePathname();
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const { user, isAuthenticated, logout } = useAuth();
    const { etablissementNom } = useApp();

    // L'authentification et le contrôle d'accès par rôle sont déjà gérés
    // globalement par AuthProvider (voir frontend/src/context/AuthContext.tsx +
    // frontend/src/lib/roleAccess.ts), exactement comme les autres sections
    // admin (/parametres, /eleves, ...). Ce layout n'a plus besoin de sa propre
    // session parallèle (ancien PIN/login comptable) : on affiche simplement un
    // état de chargement tant que le contexte global n'a pas confirmé l'accès.
    if (!isAuthenticated || !user) return null;

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
                                {user.prenom?.[0] || 'C'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a', lineHeight: '1.2' }}>
                                    {user.prenom} {user.nom}
                                </p>
                                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#64748b', fontWeight: '500', lineHeight: '1.1' }}>
                                    {etablissementNom || 'Portail Financier'}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={logout}
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
