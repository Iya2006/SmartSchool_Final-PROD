'use client';

/**
 * Topbar — Barre de navigation principale de l'ERP SmartSchool.
 *
 * Ce composant est volontairement léger : il orchestre les sous-composants
 * sans contenir de logique métier directement.
 *
 * Sous-composants :
 *   - TopbarNotifications : cloche de notification + dropdown messages
 *   - TopbarUserMenu      : avatar utilisateur + dropdown déconnexion
 *
 * refactor(topbar): décomposer en sous-composants (NotifDropdown + UserMenu)
 */

import { Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import TopbarNotifications from './TopbarNotifications';
import TopbarUserMenu from './TopbarUserMenu';
import styles from './Topbar.module.css';

export default function Topbar() {
    const { anneeLibelle } = useApp();

    return (
        <header className={styles.topbar}>

            {/* ── Section gauche : Recherche + Badge année ── */}
            <div className={styles.leftSection}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Rechercher..."
                        className={styles.searchInput}
                        id="topbar-search-input"
                    />
                    <Search className={styles.searchIcon} size={16} strokeWidth={2.5} />
                </div>

                {anneeLibelle && (
                    <span style={{
                        fontSize: '12px', fontWeight: 600,
                        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
                        color: 'white', padding: '5px 14px', borderRadius: '20px',
                        marginLeft: '12px', whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    }}>
                        📅 {anneeLibelle}
                    </span>
                )}
            </div>

            {/* ── Section droite : Actions ── */}
            <div className={styles.actions}>
                {/* 🔔 Notifications */}
                <TopbarNotifications />

                {/* Séparateur visuel */}
                <div className={styles.divider} />

                {/* 👤 Menu utilisateur */}
                <TopbarUserMenu />
            </div>
        </header>
    );
}
