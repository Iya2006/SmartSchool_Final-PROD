'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, LogOut, Menu } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from '../portail-eleve.module.css';
import { EleveInfo, Tab } from '../types';

interface EleveHeaderProps {
    eleveData: EleveInfo;
    setActiveTab: (tab: Tab) => void;
    logout: () => void;
    toggleSidebar: () => void;
    couleurPortail: string;
}

export default function EleveHeader({
    eleveData,
    setActiveTab,
    logout,
    toggleSidebar,
    couleurPortail,
}: EleveHeaderProps) {
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Handle click outside dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowProfileDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleProfileClick = () => {
        setActiveTab('profil');
        setShowProfileDropdown(false);
    };

    return (
        <header className={styles.header}>
            {/* Hamburger menu for mobile */}
            <button onClick={toggleSidebar} className={styles.mobileMenuBtn} aria-label="Ouvrir le menu">
                <Menu size={24} />
            </button>

            {/* Profile Dropdown */}
            <div className={styles.headerRight}>
                <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <button 
                        onClick={() => setShowProfileDropdown(!showProfileDropdown)} 
                        className={styles.userDropdownBtn}
                    >
                        <div 
                            className={styles.userDropdownAvatar}
                            style={{ backgroundColor: couleurPortail }}
                        >
                            {((eleveData.prenom?.[0] || '') + (eleveData.nom?.[0] || '')).toUpperCase()}
                        </div>
                        <div className={styles.userDropdownInfo}>
                            <p className={styles.userDropdownName}>{eleveData.prenom} {eleveData.nom}</p>
                            <p className={styles.userDropdownRole}>Élève</p>
                        </div>
                        <ChevronDown size={14} color="#64748b" />
                    </button>
                    
                    <AnimatePresence>
                        {showProfileDropdown && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }} 
                                animate={{ opacity: 1, y: 0 }} 
                                exit={{ opacity: 0, y: 10 }} 
                                className={styles.dropdownMenu}
                            >
                                <button 
                                    onClick={handleProfileClick} 
                                    className={styles.dropdownItem}
                                >
                                    <User size={16} /> 
                                    <span>Mon Profil</span>
                                </button>
                                <button 
                                    onClick={() => { logout(); setShowProfileDropdown(false); }} 
                                    className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                >
                                    <LogOut size={16} /> 
                                    <span>Déconnexion</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
}
