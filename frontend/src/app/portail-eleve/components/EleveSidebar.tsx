'use client';

import React from 'react';
import { 
    Home, BarChart3, Award, Calendar, Clock, 
    CreditCard, BookMarked, MessageSquare, ShoppingBag, 
    ExternalLink, User, LogOut
} from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { EleveInfo, Tab } from '../types';

interface EleveSidebarProps {
    eleveData: EleveInfo;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    nbMessagesNonLus: number;
    logout: () => void;
    photoSrc: string | null;
    setLightboxUrl: (url: string | null) => void;
    isOpen: boolean;
    onClose: () => void;
    couleurPortail: string;
}

export default function EleveSidebar({
    eleveData,
    activeTab,
    setActiveTab,
    nbMessagesNonLus,
    logout,
    photoSrc,
    setLightboxUrl,
    isOpen,
    onClose,
    couleurPortail,
}: EleveSidebarProps) {
    const initials = ((eleveData?.prenom?.[0] || '') + (eleveData?.nom?.[0] || '')).toUpperCase();

    const navItems = [
        { id: 'dashboard', label: 'Tableau de bord', icon: Home },
        { id: 'notes', label: 'Mes Notes', icon: BarChart3 },
        { id: 'bulletin', label: 'Bulletin', icon: Award },
        { id: 'emploi', label: 'Emploi du temps', icon: Calendar },
        { id: 'absences', label: 'Absences', icon: Clock },
        { id: 'scolarite', label: 'Scolarité', icon: CreditCard },
        { id: 'devoirs', label: 'Devoirs', icon: BookMarked },
        { id: 'messages', label: 'Messages', icon: MessageSquare },
        { id: 'fournitures', label: 'Fournitures', icon: ShoppingBag },
        { id: 'liens', label: 'Ressources', icon: ExternalLink },
        { id: 'profil', label: 'Mon Profil', icon: User },
    ] as const;

    const handleTabClick = (tabId: Tab) => {
        setActiveTab(tabId);
        onClose(); // Close sidebar on mobile
    };

    return (
        <aside 
            className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}
            style={{
                background: `linear-gradient(180deg, ${couleurPortail} 0%, ${couleurPortail}cc 100%)`
            }}
        >
            {/* Logo */}
            <div className={styles.logoContainer}>
                <div className={styles.logoWrapper}>
                    <div className={styles.logoBox} style={{ background: 'rgba(255, 255, 255, 0.2)', backdropFilter: 'blur(4px)' }}>S</div>
                    <div>
                        <p className={styles.logoTitle}>SMARTSCHOOL</p>
                        <p className={styles.logoSubtitle}>Portail Élève</p>
                    </div>
                </div>
            </div>

            {/* User Profile */}
            <div className={styles.userProfile}>
                <div className={styles.avatarWrapper}>
                    <div 
                        className={styles.avatar}
                        style={{
                            backgroundImage: photoSrc ? `url(${photoSrc})` : 'none',
                            backgroundColor: photoSrc ? 'transparent' : couleurPortail,
                            borderColor: `${couleurPortail}40`
                        }} 
                        onClick={() => photoSrc && setLightboxUrl(photoSrc)}
                    >
                        {!photoSrc && initials}
                    </div>
                    <div className={styles.userInfoText}>
                        <p className={styles.userName} title={`${eleveData.prenom} ${eleveData.nom}`}>
                            {eleveData.prenom} {eleveData.nom}
                        </p>
                        <p className={styles.userClass}>{eleveData.classe_code || 'Aucune classe'}</p>
                    </div>
                </div>
            </div>

            {/* Navigation links */}
            <nav className={styles.nav}>
                {navItems.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                        <button 
                            key={item.id}
                            onClick={() => handleTabClick(item.id)}
                            className={`${styles.navButton} ${isActive ? styles.navButtonActive : ''}`}
                            style={isActive ? { 
                                borderLeft: `3px solid ${couleurPortail}`,
                                color: '#ffffff',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)'
                            } : undefined}
                        >
                            <item.icon size={16} style={isActive ? { color: couleurPortail } : undefined} />
                            <span>{item.label}</span>
                            {item.id === 'messages' && nbMessagesNonLus > 0 && (
                                <span className={styles.badgeMsg}>
                                    {nbMessagesNonLus}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Logout button */}
            <div className={styles.logoutContainer}>
                <button onClick={logout} className={styles.logoutButton}>
                    <LogOut size={15} /> 
                    <span>Déconnexion</span>
                </button>
            </div>
        </aside>
    );
}
