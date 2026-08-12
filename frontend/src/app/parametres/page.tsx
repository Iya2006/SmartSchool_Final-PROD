'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
    Settings, Building, Palette, CreditCard, Calendar, FileText, 
    Shield, Bell, Clock, Database, ChevronRight
} from 'lucide-react';
import styles from './Parametres.module.css';

const SECTIONS = [
    { 
        id: 'identite', 
        title: "Identité de l'Établissement", 
        desc: "Nom, logo, cachet, signature, adresses et contacts.",
        icon: Building, 
        color: 'from-blue-500 to-cyan-400',
        bgIcon: 'bg-blue-100 text-blue-600',
        href: '/parametres/identite' 
    },
    { 
        id: 'apparence', 
        title: "Apparence (Theming)", 
        desc: "Couleurs, mode sombre, thèmes saisonniers.",
        icon: Palette, 
        color: 'from-pink-500 to-rose-400', 
        bgIcon: 'bg-pink-100 text-pink-600',
        href: '/parametres/apparence' 
    },
    { 
        id: 'cartes', 
        title: "Cartes Scolaires", 
        desc: "Format des badges, arrière-plan, couleurs.",
        icon: Settings, 
        color: 'from-purple-500 to-indigo-400', 
        bgIcon: 'bg-purple-100 text-purple-600',
        href: '/parametres/cartes' 
    },
    { 
        id: 'notation', 
        title: "Système de Notation", 
        desc: "Barème, types d'évaluation, rang et mentions.",
        icon: Settings, 
        color: 'from-amber-500 to-orange-400', 
        bgIcon: 'bg-amber-100 text-amber-600',
        href: '/parametres/notation' 
    },
    { 
        id: 'finance', 
        title: "Finance & Comptabilité", 
        desc: "Devise, pénalités, reçus et réductions.",
        icon: CreditCard, 
        color: 'from-emerald-500 to-teal-400', 
        bgIcon: 'bg-emerald-100 text-emerald-600',
        href: '/parametres/finance' 
    },
    { 
        id: 'calendrier', 
        title: "Années & Trimestres", 
        desc: "Gestion des périodes, semestres et vacances.",
        icon: Calendar, 
        color: 'from-orange-500 to-red-400', 
        bgIcon: 'bg-orange-100 text-orange-600',
        href: '/parametres/calendrier' 
    },
    { 
        id: 'documents', 
        title: "Modèles de Documents", 
        desc: "Modèles de bulletins, signatures et filigranes.",
        icon: FileText, 
        color: 'from-indigo-500 to-blue-400', 
        bgIcon: 'bg-indigo-100 text-indigo-600',
        href: '/parametres/documents' 
    },
    { 
        id: 'securite', 
        title: "Sécurité & Accès", 
        desc: "Rôles, permissions, mots de passe et audit.",
        icon: Shield, 
        color: 'from-red-500 to-rose-400', 
        bgIcon: 'bg-red-100 text-red-600',
        href: '/parametres/securite' 
    },
    { 
        id: 'notifications', 
        title: "Communication", 
        desc: "Envoi de SMS et d'e-mails vers l'extérieur. La messagerie interne, elle, fonctionne déjà depuis l'écran Communication.",
        icon: Bell, 
        color: 'from-teal-500 to-emerald-400', 
        bgIcon: 'bg-teal-100 text-teal-600',
        href: '/parametres/notifications',
        aVenir: true 
    },
    { 
        id: 'horaires', 
        title: "Emploi du Temps", 
        desc: "Horaires, pauses, et seuils de retard.",
        icon: Clock, 
        color: 'from-cyan-500 to-blue-400', 
        bgIcon: 'bg-cyan-100 text-cyan-600',
        href: '/parametres/horaires' 
    },
    { 
        id: 'data', 
        title: "Import / Export", 
        desc: "Sauvegardes, restaurations, imports Excel.",
        icon: Database, 
        color: 'from-lime-500 to-green-400', 
        bgIcon: 'bg-lime-100 text-lime-600',
        href: '/parametres/import-export' 
    }
];

export default function ParametresDashboard() {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredSections = SECTIONS.filter(s => 
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const itemVariants: any = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
    };

    return (
        <div className={styles.dashboardContainer}>
            {/* Header Section */}
            <div className={styles.header}>
                <div className={styles.headerContent}>
                    <h1 className={styles.pageTitle}>Paramètres Généraux</h1>
                    <p className={styles.pageSubtitle}>Gérez la configuration globale, la sécurité et l'identité de votre établissement.</p>
                </div>
                <div className={styles.searchWrapper}>
                    <input 
                        type="text" 
                        placeholder="Rechercher un paramètre..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>
            </div>

            {/* Grid Section */}
            <motion.div 
                className={styles.gridContainer}
                variants={containerVariants}
                initial="hidden"
                animate="show"
            >
                {filteredSections.length > 0 ? (
                    filteredSections.map((section) => {
                        const contenu = (
                            <div className={styles.cardInner}>
                                <div className={styles.iconWrapper}>
                                    <div className={`${styles.iconBackground} ${section.bgIcon}`}>
                                        <section.icon size={24} strokeWidth={2} />
                                    </div>
                                </div>
                                <div className={styles.cardContent}>
                                    <h3 className={styles.cardTitle}>
                                        {section.title}
                                        {section.aVenir && (
                                            <span style={{
                                                marginLeft: 8, padding: '2px 8px', borderRadius: 99,
                                                background: '#f1f5f9', color: '#64748b',
                                                fontSize: '10.5px', fontWeight: 800,
                                                textTransform: 'uppercase', letterSpacing: '0.4px',
                                                verticalAlign: 'middle',
                                            }}>Bientôt</span>
                                        )}
                                    </h3>
                                    <p className={styles.cardDesc}>{section.desc}</p>
                                </div>
                                {!section.aVenir && (
                                    <div className={styles.cardArrow}>
                                        <ChevronRight size={20} />
                                    </div>
                                )}
                            </div>
                        );
                        return (
                            <motion.div key={section.id} variants={itemVariants}>
                                {/* Une tuile « Bientôt » ne mène nulle part : le lien
                                    tombait sur un 404, ce qui donne l'impression que
                                    l'application est cassée alors que la page n'a
                                    simplement pas encore été construite. */}
                                {section.aVenir ? (
                                    <div
                                        className={styles.card}
                                        title="Cette section n'est pas encore disponible"
                                        style={{ opacity: 0.6, cursor: 'not-allowed' }}
                                        aria-disabled="true"
                                    >
                                        {contenu}
                                    </div>
                                ) : (
                                    <Link href={section.href} className={styles.card}>
                                        {contenu}
                                    </Link>
                                )}
                            </motion.div>
                        );
                    })
                ) : (
                    <div className={styles.emptyState}>
                        <p>Aucun paramètre trouvé pour "{searchQuery}"</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
