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
import { PieChart, Users, GraduationCap, Building, Book, PencilLine, FileText, BookUser, Calendar, MessageCircle, Award, Shield, Briefcase, Heart, Camera, ShoppingBag, Banknote, ScanLine, Archive, Activity, LogOut, Clock, Trophy, Building2, AlertTriangle, UserX } from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { canAccessPathForRole } from '@/lib/roleAccess';
import { useUI } from '@/context/UIContext';
import styles from './Sidebar.module.css';

export default function Sidebar() {
    const pathname = usePathname();
    const { etablissementNom, etablissementLogo } = useApp();
    const { user, logout } = useAuth();
    const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUI();
    const [unreadCount, setUnreadCount] = useState(0);
    // Statut « en ligne » affiché dans la carte profil du menu latéral.
    const [online, setOnline] = useState(true);
    useEffect(() => {
        setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

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
        <nav id="sidebar" className={`${styles.sidebarWrapper} ${sidebarCollapsed ? styles.sidebarCollapsed : ''} ${mobileSidebarOpen ? styles.mobileOpen : ''}`}>

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
                {/* Ferme le tiroir mobile au clic sur n'importe quel lien —
                    delegation d'evenement plutot qu'un onClick sur chacun des
                    26 liens de navigation. */}
                <ul className={styles.sidebarMenu} onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a')) closeMobileSidebar();
                }}>

                    {/* Le tableau de bord est un poste de PILOTAGE, pas un écran
                        de travail : réservé au fondateur, et au directeur général
                        seulement si le fondateur lui a ouvert la comptabilité (les
                        deux vont ensemble). Le directeur de niveau ne le voit plus.
                        Le contrôle réel reste côté serveur ; on aligne le menu. */}
                    {canAccessPathForRole(user?.role, '/dashboard', user?.role_base, user?.acces_comptabilite) && (
                        <>
                            <li className={styles.sidebarTitle}>
                                <h6 className={styles.titleText}>Dashboards</h6>
                            </li>
                            <li className={pathname === '/dashboard' ? styles.currentPage : ''}>
                                <Link href="/dashboard">
                                    <PieChart size={18} className={styles.menuIcon} />
                                    <span className={styles.menuText}>Dashboard</span>
                                </Link>
                            </li>
                        </>
                    )}


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
                    {/* Créer/gérer les fiches du personnel reste au fondateur et
                        au directeur général : le directeur de niveau (pédagogique)
                        n'y accède pas. Verrou réel côté serveur. */}
                    {canAccessPathForRole(user?.role, '/personnel', user?.role_base, user?.acces_comptabilite) && (
                        <li className={pathname.startsWith('/personnel') ? styles.currentPage : ''}>
                            <Link href="/personnel">
                                <Shield size={18} className={styles.menuIcon} />
                                <span className={styles.menuText}>Personnel</span>
                            </Link>
                        </li>
                    )}
                    {/* Le pointage vit techniquement sous /dashboard : il suit donc
                        le même droit — masqué à qui n'a pas le tableau de bord,
                        pour ne pas laisser un lien qui renverrait ailleurs. */}
                    {canAccessPathForRole(user?.role, '/dashboard/presences/scan', user?.role_base, user?.acces_comptabilite) && (
                        <li className={pathname.startsWith('/dashboard/presences/scan') ? styles.currentPage : ''}>
                            <Link href="/dashboard/presences/scan">
                                <ScanLine size={18} className={styles.menuIcon} />
                                <span className={styles.menuText}>Pointage enseignants</span>
                            </Link>
                        </li>
                    )}
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
                    <li className={pathname.startsWith('/vie-scolaire/seances') ? styles.currentPage : ''}>
                        <Link href="/vie-scolaire/seances">
                            <Clock size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Séances (Appel)</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/vie-scolaire/incidents') ? styles.currentPage : ''}>
                        <Link href="/vie-scolaire/incidents">
                            <AlertTriangle size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Incidents</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/vie-scolaire/absences-enseignants') ? styles.currentPage : ''}>
                        <Link href="/vie-scolaire/absences-enseignants">
                            <UserX size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Absences enseignants</span>
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
                    <li className={pathname.startsWith('/resultats-annuels') ? styles.currentPage : ''}>
                        <Link href="/resultats-annuels">
                            <Trophy size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Résultats de fin d&apos;année</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/centre-evaluation') ? styles.currentPage : ''}>
                        <Link href="/centre-evaluation">
                            <Award size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Centre des Examens</span>
                        </Link>
                    </li>
                    <li className={pathname.startsWith('/archive') ? styles.currentPage : ''}>
                        <Link href="/archive">
                            <Archive size={18} className={styles.menuIcon} />
                            <span className={styles.menuText}>Archive Scolaire</span>
                        </Link>
                    </li>

                    {/* La comptabilité n'apparaît que pour qui y a droit : le
                        directeur de niveau (comme d'autres postes) n'y accède
                        pas, et voyait pourtant l'onglet. Le contrôle réel reste
                        côté serveur ; on aligne simplement le menu dessus. */}
                    {canAccessPathForRole(user?.role, '/comptabilite', user?.role_base)
                        && !(user?.role === 'DG' && user?.acces_comptabilite === 'N') && (
                        <>
                            <li className={styles.sidebarTitle}>
                                <h6 className={styles.titleText}>FINANCE &amp; ADMIN</h6>
                            </li>
                            <li className={pathname.startsWith('/comptabilite') ? styles.currentPage : ''}>
                                <Link href="/comptabilite">
                                    <Banknote size={18} className={styles.menuIcon} />
                                    <span className={styles.menuText}>Comptabilité</span>
                                </Link>
                            </li>
                        </>
                    )}

                        {/* ESPACE PLATEFORME — l'editeur de SmartSchool, pas une
                        ecole. Regroupe ce qui porte SUR les ecoles plutot que
                        DANS une ecole. Masque partout ailleurs ; le controle
                        reel reste backend. */}
                    {user?.role === 'SUPER_ADMIN' && (
                        <>
                            <li className={styles.sidebarTitle}>
                                <h6 className={styles.titleText}>PLATEFORME</h6>
                            </li>
                            <li className={pathname.startsWith('/administration/etablissements') ? styles.currentPage : ''}>
                                <Link href="/administration/etablissements">
                                    <Building2 size={18} className={styles.menuIcon} />
                                    <span className={styles.menuText}>Établissements</span>
                                </Link>
                            </li>
                            <li className={pathname.startsWith('/administration/incidents') ? styles.currentPage : ''}>
                                <Link href="/administration/incidents">
                                    <AlertTriangle size={18} className={styles.menuIcon} />
                                    <span className={styles.menuText}>Incidents</span>
                                </Link>
                            </li>
                            <li className={pathname.startsWith('/monitoring') ? styles.currentPage : ''}>
                                <Link href="/monitoring">
                                    <Activity size={18} className={styles.menuIcon} />
                                    <span className={styles.menuText}>Monitoring</span>
                                </Link>
                            </li>
                        </>
                    )}
                </ul>
            </div>
            {/* Sidebar menu ends */}

            {/* ── Carte utilisateur moderne en bas ── */}
            <div className={styles.sidebarUserCard}>
                {/* Avatar + Infos — cliquables vers /profil */}
                <Link href="/profil" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none' }}>
                    {/* Avatar + pastille de statut en ligne */}
                    <div className={styles.userCardAvatar} style={{ position: 'relative' }}>
                        {initials}
                        <span
                            title={online ? 'En ligne' : 'Hors ligne'}
                            style={{
                                position: 'absolute', bottom: '-2px', right: '-2px',
                                width: '11px', height: '11px', borderRadius: '50%',
                                background: online ? '#22c55e' : '#94a3b8',
                                border: '2px solid var(--bg-elevated, #ffffff)',
                            }}
                        />
                    </div>
                    {/* Infos nom + rôle + statut en ligne */}
                    <div className={styles.userCardInfo}>
                        <p className={styles.userCardName}>{displayName}</p>
                        <p className={styles.userCardRole}>{displayRole}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', fontWeight: 700, color: online ? '#059669' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: online ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
                            {online ? 'En ligne' : 'Hors ligne'}
                        </p>
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
