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

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Calendar, PanelLeftClose, PanelLeftOpen, Command } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { isAdminSystemRole } from '@/lib/roleAccess';
import TopbarNotifications from './TopbarNotifications';
import TopbarUserMenu from './TopbarUserMenu';
import styles from './Topbar.module.css';

const SEARCH_ITEMS = [
    { label: 'Dashboard', href: '/dashboard', keywords: ['dashboard', 'accueil', 'admin', 'tableau de bord'] },
    { label: 'Élèves', href: '/eleves', keywords: ['eleves', 'élèves', 'inscriptions'] },
    { label: 'Enseignants', href: '/enseignants', keywords: ['enseignants', 'professeurs'] },
    { label: 'Personnel', href: '/personnel', keywords: ['personnel', 'staff'] },
    { label: 'Classes', href: '/classes', keywords: ['classes', 'salles de classe'] },
    { label: 'Matières', href: '/matieres', keywords: ['matieres', 'matières', 'cours'] },
    { label: 'Emploi du temps', href: '/emploi-du-temps', keywords: ['emploi', 'temps', 'edt'] },
    { label: 'Événements', href: '/evenements', keywords: ['événements', 'agenda', 'events'] },
    { label: 'Activités', href: '/activites', keywords: ['activites', 'activités', 'jour'] },
    { label: 'Communication', href: '/communication', keywords: ['communication', 'messages'] },
    { label: 'Familles', href: '/familles', keywords: ['familles', 'parents'] },
    { label: 'Galerie', href: '/galerie', keywords: ['galerie', 'photos'] },
    { label: 'Fournitures', href: '/fournitures', keywords: ['fournitures', 'materiel', 'matériel'] },
    { label: 'Notes', href: '/notes', keywords: ['notes', 'evaluations', 'évaluations'] },
    { label: 'Bulletins', href: '/bulletins', keywords: ['bulletins', 'bulletin'] },
    // Page de validation des sujets d'examen — l'ancien nom "Centre d'évaluation"
    // était trompeur (les notes/moyennes vivent sous /notes et /bulletins).
    // Les anciens mots-clés restent pour ne pas casser la recherche des habitués.
    { label: 'Centre des Examens', href: '/centre-evaluation', keywords: ['centre examens', 'sujets', 'centre evaluation', 'évaluation'] },
    { label: 'Comptabilité', href: '/comptabilite', keywords: ['comptabilite', 'comptabilité', 'paiements', 'finance'] },
    { label: 'Paramètres', href: '/parametres', keywords: ['parametres', 'paramètres', 'settings'] },
];

// Réservé aux rôles admin (Étape G) — contrairement au reste de
// SEARCH_ITEMS ci-dessus, jamais filtré par rôle jusqu'ici : un clic sur
// une entrée non autorisée est de toute façon bloqué par le garde de
// route (AuthContext, canAccessPathForRole), mais un lien d'infrastructure
// (file d'attente, workers) n'a pas sa place dans la recherche d'un
// enseignant/parent/élève.
const MONITORING_SEARCH_ITEM = { label: 'Monitoring', href: '/monitoring', keywords: ['monitoring', 'infrastructure', 'redis', 'workers', 'file d\'attente'] };

export default function Topbar() {
    const { anneeLibelle } = useApp();
    const pathname = usePathname();
    const router = useRouter();
    const { sidebarCollapsed, toggleSidebarCollapsed } = useUI();
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const searchItems = useMemo(() => {
        return isAdminSystemRole(user?.role) ? [...SEARCH_ITEMS, MONITORING_SEARCH_ITEM] : SEARCH_ITEMS;
    }, [user?.role]);

    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return searchItems.filter(item =>
            item.label.toLowerCase().includes(q) || item.keywords.some(k => k.includes(q))
        ).slice(0, 6);
    }, [query, searchItems]);

    return (
        <header className={styles.topbar}>

            {/* ── Section gauche : Recherche + Badge année ── */}
            <div className={styles.leftSection}>
                <button
                    type="button"
                    className={styles.sidebarToggle}
                    onClick={toggleSidebarCollapsed}
                    aria-label={sidebarCollapsed ? 'Ouvrir le menu latéral' : 'Réduire le menu latéral'}
                >
                    {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </button>

                <div className={styles.searchShell}>
                    <div className={styles.searchContainer}>
                        <Search className={styles.searchIcon} size={16} strokeWidth={2.5} />
                        <input
                            type="text"
                            placeholder="Rechercher une page, un module ou une action..."
                            className={styles.searchInput}
                            id="topbar-search-input"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setTimeout(() => setIsFocused(false), 120)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchResults[0]) {
                                    router.push(searchResults[0].href);
                                    setQuery('');
                                    setIsFocused(false);
                                }
                            }}
                        />
                        <span className={styles.searchHint}><Command size={13} /> Recherche</span>
                    </div>

                    {isFocused && query.trim() && (
                        <div className={styles.searchDropdown}>
                            {searchResults.length > 0 ? searchResults.map((item) => (
                                <button
                                    key={item.href}
                                    type="button"
                                    className={`${styles.searchItem} ${pathname.startsWith(item.href) ? styles.searchItemActive : ''}`}
                                    onClick={() => {
                                        router.push(item.href);
                                        setQuery('');
                                        setIsFocused(false);
                                    }}
                                >
                                    <span>{item.label}</span>
                                    <span className={styles.searchItemPath}>{item.href}</span>
                                </button>
                            )) : (
                                <div className={styles.searchEmpty}>Aucun résultat pour cette recherche.</div>
                            )}
                        </div>
                    )}
                </div>

                {anneeLibelle && (
                    <div className={styles.yearBadge}>
                        <Calendar size={14} />
                        <span>{anneeLibelle}</span>
                    </div>
                )}
            </div>

            {/* ── Section droite : Actions ── */}
            <div className={styles.actions}>
                {/* Notifications */}
                <TopbarNotifications />

                {/* Séparateur visuel */}
                <div className={styles.divider} />

                {/* Menu utilisateur */}
                <TopbarUserMenu />
            </div>
        </header>
    );
}
