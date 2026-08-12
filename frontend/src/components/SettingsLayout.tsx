'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
    Settings, Building, Palette, CreditCard, Calendar, FileText, 
    Shield, Bell, Clock, Database, ArrowLeft
} from 'lucide-react';
import styles from './SettingsLayout.module.css';

const SIDEBAR_LINKS = [
    { id: 'identite', title: "Identité", icon: Building, href: '/parametres/identite' },
    { id: 'apparence', title: "Apparence", icon: Palette, href: '/parametres/apparence' },
    { id: 'cartes', title: "Cartes Scolaires", icon: Settings, href: '/parametres/cartes' },
    { id: 'notation', title: "Notation", icon: Settings, href: '/parametres/notation' },
    { id: 'finance', title: "Finance", icon: CreditCard, href: '/parametres/finance' },
    { id: 'calendrier', title: "Calendrier", icon: Calendar, href: '/parametres/calendrier' },
    { id: 'documents', title: "Documents", icon: FileText, href: '/parametres/documents' },
    { id: 'securite', title: "Sécurité", icon: Shield, href: '/parametres/securite' },
    { id: 'notifications', title: "Communication", icon: Bell, href: '/parametres/notifications' },
    { id: 'horaires', title: "Horaires", icon: Clock, href: '/parametres/horaires' },
    { id: 'data', title: "Import / Export", icon: Database, href: '/parametres/import-export' },
];

export default function SettingsLayout({ children, title, subtitle }: { children: React.ReactNode, title: string, subtitle: string }) {
    const pathname = usePathname();

    return (
        <div className={styles.layoutContainer}>
            <div className={styles.topNav}>
                <Link href="/parametres" className={styles.backLink}>
                    <ArrowLeft size={16} />
                    <span>Retour aux paramètres généraux</span>
                </Link>
            </div>

            {/* Navigation horizontale en tête de page.
                Elle occupait auparavant une colonne de 250 px à gauche : sur les
                écrans étroits, le contenu d'un onglet — souvent des tableaux de
                réglages — se retrouvait comprimé sur la moitié de la largeur
                disponible. En haut, chaque section dispose de toute la page. */}
            <nav className={styles.navMenu}>
                {SIDEBAR_LINKS.map(link => {
                    const isActive = pathname.startsWith(link.href);
                    return (
                        <Link
                            key={link.id}
                            href={link.href}
                            className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                        >
                            <link.icon size={16} className={styles.navIcon} />
                            <span>{link.title}</span>
                        </Link>
                    );
                })}
            </nav>

            <main className={styles.contentArea}>
                <div className={styles.pageHeader}>
                    <h1 className={styles.pageTitle}>{title}</h1>
                    <p className={styles.pageSubtitle}>{subtitle}</p>
                </div>

                <div className={styles.pageBody}>
                    {children}
                </div>
            </main>
        </div>
    );
}
