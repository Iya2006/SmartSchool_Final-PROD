'use client';

/**
 * Sidebar — Navigation latérale principale de l'ERP SmartSchool.
 *
 * Modifications :
 *  - Section "PORTAILS" supprimée (liens bloqués côté admin)
 *  - Icônes profil/settings bas remplacés par une carte utilisateur moderne
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PieChart, Users, GraduationCap, Building, Book, PencilLine, FileText, BookUser, Calendar, MessageCircle, Award, Shield, Briefcase, Heart, Camera, ShoppingBag, Banknote, ScanLine, History, Archive, Activity, LogOut } from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import styles from './Sidebar.module.css';

export default function Sidebar() {
    const pathname = usePathname();
    const { etablissementNom, etablissementLogo } = useApp();
    const { user, logout } = useAuth();
    const { sidebarCollapsed } = useUI();
    const [unreadCount, setUnreadCount] = useState(0);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    // Fetch unread messages count
    useEffect(() => {
        const fetchUnread = async () => {
            try {
                const res = await api.get('/api/communication/messages?role=ADMIN');
                const msgs = res.data || [];
                const unread = msgs.filter((m: any) => m.statut === 'ENVOYE' && m.expediteur_type !== 'ADMIN').length;
                setUnreadCount(unread);
            } catch {}
        };
        fetchUnread();
        
        const handleVisibility = () => {
            if (!document.hidden) fetchUnread();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    const displayName = user ? `${user.prenom} ${user.nom}` : 'Administrateur';
    const displayRole = user?.role || 'Superviseur ERP';
    const initials = user ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}` : 'AD';

    return (
        <nav id="sidebar" className={`${styles.sidebarWrapper} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>

            {/* App brand */}
            <div className={styles.appBrand}>
                <Link href="/dashboard" className={styles.logoLink} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {etablissementLogo ? (
                        <img 
                            src={getPhotoUrl(etablissementLogo)!} 
                            alt={etablissementNom} 
                            style={{ height: '32px', width: 'auto', minWidth: '32px', maxHeight: '100%', objectFit: 'contain', flexShrink: 0 }} 
                        />
                    ) : (
                        <div className={styles.logoIcon}>{etablissementNom.charAt(0)}</div>
                    )}
                    <span className={styles.logoText} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                        {etablissementNom}
                    </span>
                </Link>
            </div>

            {/* Sidebar menu starts */}
            <div className={styles.sidebarMenuScroll}>
                <ul className={styles.sidebarMenu}>

                    <li className={styles.sidebarTitle}>
                        <h6 className={styles.titleText}>Dashboards</h6>
                    </li>
                    <li className={pathname === '/dashboard' ? styles.currentPage : ''}>
                        <Link href="/dashboard">
                            <PieChart size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Dashboard</span>
                        </Link>
                    </li>


                    <li className={styles.sidebarTitle}>
                        <h6 className={styles.titleText}>ACADÉMIQUE</h6>
                    </li>
                    <li className={pathname.startsWith('/eleves') ? styles.currentPage : ''}>
                        <Link href="/eleves">
                            <Users size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Élèves</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/enseignants') ? styles.currentPage : ''}>
                        <Link href="/enseignants">
                            <GraduationCap size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Enseignants</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/personnel') ? styles.currentPage : ''}>
                        <Link href="/personnel">
                            <Shield size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Personnel</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/dashboard/presences/scan') ? styles.currentPage : ''}>
                        <Link href="/dashboard/presences/scan">
                            <ScanLine size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Pointage QR</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/dashboard/presences/historique') ? styles.currentPage : ''}>
                        <Link href="/dashboard/presences/historique">
                            <History size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Historique Présence</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/salle-des-profs') ? styles.currentPage : ''}>
                        <Link href="/salle-des-profs">
                            <Briefcase size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Salle des Profs</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/classes') ? styles.currentPage : ''}>
                        <Link href="/classes">
                            <Building size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Classes</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/matieres') ? styles.currentPage : ''}>
                        <Link href="/matieres">
                            <Book size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Matières</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/emploi-du-temps') ? styles.currentPage : ''}>
                        <Link href="/emploi-du-temps">
                            <Calendar size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Emploi du Temps</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/evenements') ? styles.currentPage : ''}>
                        <Link href="/evenements">
                            <Calendar size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Événements</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/activites') ? styles.currentPage : ''}>
                        <Link href="/activites">
                            <Activity size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Activités du Jour</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/communication') ? styles.currentPage : ''}>
                        <Link href="/communication" className={styles.commLink}
                            onClick={() => {
                                if (unreadCount > 0) {
                                    setUnreadCount(0);
                                    api.put('/api/communication/messages/marquer-tous-lus').catch(() => {});
                                }
                            }}>
                            <MessageCircle size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Communication</span>
                            {unreadCount > 0 && (
                                <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                            )}
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/familles') ? styles.currentPage : ''}>
                        <Link href="/familles">
                            <Heart size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Familles</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/galerie') ? styles.currentPage : ''}>
                        <Link href="/galerie">
                            <Camera size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Galerie Photos</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/fournitures') ? styles.currentPage : ''}>
                        <Link href="/fournitures">
                            <ShoppingBag size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Fournitures</span>
                        </Link>
                    </li>

                    <li className={styles.sidebarTitle}>
                        <h6 className={styles.titleText}>ÉVALUATIONS</h6>
                    </li>
                    <li className={pathname.startsWith('/notes') ? styles.currentPage : ''}>
                        <Link href="/notes">
                            <PencilLine size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Centralisation Notes</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/bulletins') ? styles.currentPage : ''}>
                        <Link href="/bulletins">
                            <FileText size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Bulletins</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/centre-evaluation') ? styles.currentPage : ''}>
                        <Link href="/centre-evaluation">
                            <Award size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Centre d&apos;Évaluation</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/archive') ? styles.currentPage : ''}>
                        <Link href="/archive">
                            <Archive size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Archive Scolaire</span>
                        </Link>
                    </li>

                    <li className={styles.sidebarTitle}>
                        <h6 className={styles.titleText}>FINANCE &amp; ADMIN</h6>
                    </li>
                    <li className={pathname.startsWith('/comptabilite') ? styles.currentPage : ''}>
                        <Link href="/comptabilite">
                            <Banknote size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Comptabilité</span>
                        </Link>
                    </li>
                </ul>
            </div>
            {/* Sidebar menu ends */}

            {/* ── Carte utilisateur moderne en bas ── */}
            <div className={styles.sidebarUserCard}>
                {/* Avatar + Infos — cliquables vers /profil */}
                <Link href="/profil" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none' }}>
                    {/* Avatar */}
                    <div className={styles.userCardAvatar}>
                        {initials}
                    </div>
                    {/* Infos nom + rôle */}
                    <div className={styles.userCardInfo}>
                        <p className={styles.userCardName}>{displayName}</p>
                        <p className={styles.userCardRole}>{displayRole}</p>
                    </div>
                </Link>
                {/* Actions rapides */}
                <div className={styles.userCardActions}>
                    <button
                        className={`${styles.userCardActionBtn} ${styles.userCardLogout}`}
                        title="Se déconnecter"
                        onClick={() => logout()}
                    >
                        <LogOut size={15} />
                    </button>
                </div>
            </div>
        </nav>
    );
}
