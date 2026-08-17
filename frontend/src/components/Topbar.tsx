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
import { Search, Calendar, PanelLeftClose, PanelLeftOpen, Command, Settings, User, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { useUI } from '@/context/UIContext';
import { useAuth } from '@/context/AuthContext';
import { isAdminSystemRole, canAccessPathForRole } from '@/lib/roleAccess';
import TopbarNotifications from './TopbarNotifications';
import TopbarUserMenu from './TopbarUserMenu';
import styles from './Topbar.module.css';
import { useIsMobile } from '@/hooks/useIsMobile';

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
    const { anneeLibelle, anneeId, annees, setAnneeId, anneeCouranteId } = useApp();
    const enConsultation = anneeId !== anneeCouranteId;
    const anneeSelLibelle = annees.find(a => a.annee_id === anneeId)?.libelle || anneeLibelle;
    const pathname = usePathname();
    const router = useRouter();
    const { sidebarCollapsed, toggleSidebarCollapsed, openMobileSidebar } = useUI();
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

    const searchItems = useMemo(() => {
        const base = isAdminSystemRole(user?.role) ? [...SEARCH_ITEMS, MONITORING_SEARCH_ITEM] : SEARCH_ITEMS;
        // La recherche ne propose que des écrans auxquels ce compte a droit :
        // sinon un directeur de niveau retrouvait « Comptabilité » par la
        // recherche, un écran qui lui est justement fermé.
        return base.filter((item) => {
            if (!canAccessPathForRole(user?.role, item.href, user?.role_base)) return false;
            // Un DG à qui le fondateur a fermé la comptabilité ne la retrouve
            // pas non plus par la recherche.
            if (item.href.startsWith('/comptabilite') && user?.role === 'DG' && user?.acces_comptabilite === 'N') return false;
            return true;
        });
    }, [user?.role, user?.role_base, user?.acces_comptabilite]);

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
                {/* Repli desktop (rail icone-seule) — masque sous 768px, remplace
                    par le bouton hamburger ci-dessous qui ouvre le tiroir. */}
                <button
                    type="button"
                    className={styles.sidebarToggle}
                    onClick={toggleSidebarCollapsed}
                    aria-label={sidebarCollapsed ? 'Ouvrir le menu latéral' : 'Réduire le menu latéral'}
                >
                    {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </button>

                {/* Hamburger mobile — masque au-dessus de 768px (voir Topbar.module.css) */}
                <button
                    type="button"
                    className={styles.mobileMenuBtn}
                    onClick={openMobileSidebar}
                    aria-label="Ouvrir le menu de navigation"
                >
                    <Menu size={20} />
                </button>

                {/* Sur mobile, la barre de recherche complète prend trop de place
                    face aux icônes d'actions (cause du chevauchement avec la
                    cloche) — repliée en simple bouton, elle s'ouvre en recouvrement
                    plein-largeur au tap, comme dans la plupart des applis mobiles. */}
                {isMobile && !mobileSearchOpen ? (
                    <button
                        type="button"
                        className={styles.mobileMenuBtn}
                        style={{ display: 'inline-flex' }}
                        onClick={() => setMobileSearchOpen(true)}
                        aria-label="Rechercher"
                    >
                        <Search size={18} />
                    </button>
                ) : (
                <div className={`${styles.searchShell} ${isMobile ? styles.searchShellMobile : ''}`}>
                    <div className={styles.searchContainer}>
                        <Search className={styles.searchIcon} size={16} strokeWidth={2.5} />
                        <input
                            type="text"
                            placeholder="Rechercher une page, un module ou une action..."
                            className={styles.searchInput}
                            id="topbar-search-input"
                            autoFocus={isMobile}
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
                                if (e.key === 'Escape' && isMobile) {
                                    setMobileSearchOpen(false);
                                }
                            }}
                        />
                        {isMobile ? (
                            <button
                                type="button"
                                className={styles.searchCloseBtn}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { setMobileSearchOpen(false); setQuery(''); setIsFocused(false); }}
                                aria-label="Fermer la recherche"
                            >
                                <X size={16} />
                            </button>
                        ) : (
                            <span className={styles.searchHint}><Command size={13} /> Recherche</span>
                        )}
                    </div>

                    {isFocused && query.trim() && (
                        <div className={styles.searchDropdown}>
                            {searchResults.length > 0 ? searchResults.map((item) => (
                                <button
                                    key={item.href}
                                    type="button"
                                    className={`${styles.searchItem} ${pathname.startsWith(item.href) ? styles.searchItemActive : ''}`}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Prevent onBlur from firing before navigation
                                        router.push(item.href);
                                        setQuery('');
                                        setIsFocused(false);
                                        if (isMobile) setMobileSearchOpen(false);
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
                )}

                {annees.length > 0 && !isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Sélecteur d'année : choisir une année passée fait basculer
                            TOUT le système en consultation (lecture seule — l'écriture
                            reste bloquée côté serveur pour une année clôturée). */}
                        <div
                            className={styles.yearBadge}
                            style={enConsultation ? { background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' } : undefined}
                            title={enConsultation ? 'Consultation d’une année passée (lecture seule)' : 'Année en cours'}
                        >
                            <Calendar size={14} />
                            <select
                                value={anneeId}
                                onChange={(e) => setAnneeId(Number(e.target.value))}
                                style={{
                                    border: 'none', background: 'transparent', font: 'inherit',
                                    color: 'inherit', cursor: 'pointer', outline: 'none', fontWeight: 600,
                                }}
                            >
                                {annees.map(a => (
                                    <option key={a.annee_id} value={a.annee_id}>
                                        {a.libelle}{a.est_courante === 'O' ? ' — en cours' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {enConsultation && (
                            <button
                                onClick={() => setAnneeId(anneeCouranteId)}
                                title="Revenir à l’année en cours"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
                                    border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e',
                                    fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                                }}
                            >
                                Lecture seule · Revenir à l’année en cours
                            </button>
                        )}
                    </div>
                )}
                {anneeLibelle && isMobile && enConsultation && (
                    <button
                        onClick={() => setAnneeId(anneeCouranteId)}
                        title="Revenir à l’année en cours"
                        style={{
                            padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
                            border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e',
                            fontSize: '12px', fontWeight: 700,
                        }}
                    >
                        {anneeSelLibelle} · lecture seule ✕
                    </button>
                )}
            </div>

            {/* ── Section droite : Actions ── */}
            <div className={styles.actions} style={isMobile && mobileSearchOpen ? { display: 'none' } : undefined}>
                {/* Notifications */}
                <TopbarNotifications />

                {/* Profil — masqué sur mobile : déjà accessible depuis le menu
                    avatar (TopbarUserMenu), évite l'encombrement d'icônes qui
                    faisait sembler la cloche "posée" sur la recherche. */}
                {!isMobile && (
                <Link
                    href="/profil"
                    id="topbar-profil-link"
                    title="Mon profil"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '38px', height: '38px', borderRadius: '10px',
                        color: 'var(--text-muted)', background: 'transparent',
                        border: '1px solid transparent', transition: 'all 0.2s ease',
                        textDecoration: 'none',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
                        (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                        (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                    }}
                >
                    <User size={17} strokeWidth={2} />
                </Link>
                )}

                {/* Paramètres — même raison, masqué sur mobile */}
                {!isMobile && (
                <Link
                    href="/parametres"
                    id="topbar-settings-link"
                    title="Paramètres"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '38px', height: '38px', borderRadius: '10px',
                        color: 'var(--text-muted)', background: 'transparent',
                        border: '1px solid transparent', transition: 'all 0.2s ease',
                        textDecoration: 'none',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
                        (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0';
                        (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                    }}
                >
                    <Settings size={17} strokeWidth={2} />
                </Link>
                )}

                {/* Séparateur visuel — masqué sur mobile (rien à séparer, les
                    2 liens ci-dessus sont cachés) */}
                {!isMobile && <div className={styles.divider} />}

                {/* Menu utilisateur */}
                <TopbarUserMenu />
            </div>
        </header>
    );
}
