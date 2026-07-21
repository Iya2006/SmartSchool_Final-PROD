'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';

// Components
import EleveSidebar from './components/EleveSidebar';
import EleveHeader from './components/EleveHeader';
import EleveDashboard from './components/EleveDashboard';
import EleveNotes from './components/EleveNotes';
import EleveBulletin from './components/EleveBulletin';
import EleveEmploi from './components/EleveEmploi';
import EleveAbsences from './components/EleveAbsences';
import EleveMessages from './components/EleveMessages';
import EleveFournitures from './components/EleveFournitures';
import EleveDevoirs from './components/EleveDevoirs';
import EleveRessources from './components/EleveRessources';
import EleveProfil from './components/EleveProfil';
import EleveScolarite from './components/EleveScolarite';

// Hook & types
import { useEleveData } from './hooks/useEleveData';
import { Tab } from './types';

// Styles
import styles from './portail-eleve.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const tabVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export default function PortailEleve() {
    const { user, logout, isAuthenticated } = useAuth();
    const { theme, etablissementNom, etablissementLogo } = useApp();
    const router = useRouter();

    // ── Dynamic theme values from admin settings ──
    const couleurPortail = theme.couleurEleve || '#0284c7';
    const messageBienvenue = theme.msgEleve || "Bienvenue sur ton espace élève SmartSchool ! Prêt pour une nouvelle journée d'apprentissage ?";

    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Auth guard
    useEffect(() => {
        if (!isAuthenticated || (user && user.role !== 'ELEVE')) {
            router.replace('/login');
        }
    }, [isAuthenticated, user, router]);

    const eleveId = user?.id ?? null;

    const {
        dashboardData,
        dashboardLoading,
        pendingPhoto,
        setPendingPhoto,
        notesData,
        notesLoading,
        edtData,
        edtLoading,
        absencesData,
        absencesLoading,
        bulletinData,
        bulletinLoading,
        bulletinTrimestre,
        setBulletinTrimestre,
        messagesData,
        messagesLoading,
        fournituresData,
        fournituresLoading,
        devoirsData,
        devoirsLoading,
        ressourcesData,
        ressourcesLoading,
        error,
        refreshDashboard,
        loadTabCached,
        refetchMessages,
    } = useEleveData(eleveId);

    // Load data when tab changes
    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        loadTabCached(tab);
    };

    // Resolve photo src for sidebar
    const pendingPhotoUrl = pendingPhoto?.photo_url ?? null;
    const elevePhotoUrl = dashboardData?.eleve?.photo_url ?? null;
    const rawPhotoPath = pendingPhotoUrl || elevePhotoUrl;
    const photoSrc = rawPhotoPath ? `${API_BASE}${rawPhotoPath}` : null;

    // Count unread messages
    const nbMessagesNonLus = dashboardData?.nb_messages_non_lus ?? 0;

    // Loading / error screen
    if (!isAuthenticated || !user || user.role !== 'ELEVE') {
        return null;
    }

    if (dashboardLoading && !dashboardData) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: `4px solid ${couleurPortail}30`, borderTopColor: couleurPortail, animation: 'spin 0.8s linear infinite' }} />
                <p style={{ color: '#64748b', fontWeight: 600, fontSize: '14px' }}>Chargement du portail élève...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (error && !dashboardData) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: '12px' }}>
                <p style={{ color: '#ef4444', fontWeight: 700 }}>Erreur de chargement</p>
                <p style={{ color: '#64748b', fontSize: '13px' }}>{error}</p>
                <button onClick={refreshDashboard} style={{ padding: '10px 20px', background: couleurPortail, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
                    Réessayer
                </button>
            </div>
        );
    }

    const eleveData = dashboardData?.eleve ?? {
        eleve_id: eleveId ?? 0,
        nom: user.nom,
        prenom: user.prenom,
        matricule: user.nom_utilisateur,
        sexe: '',
        photo_url: null,
        date_naissance: null,
        lieu_naissance: null,
        statut: '',
        classe_code: '',
        classe: '',
        classe_id: null,
    };

    return (
        <>
            {/* Global spin animation */}
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .${styles.sidebar} { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
            `}</style>

            <div className={styles.container}>
                {/* Mobile overlay */}
                {sidebarOpen && (
                    <div
                        className={`${styles.mobileOverlay} ${sidebarOpen ? styles.mobileOverlayOpen : ''}`}
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <EleveSidebar
                    eleveData={eleveData}
                    activeTab={activeTab}
                    setActiveTab={handleTabChange}
                    nbMessagesNonLus={nbMessagesNonLus}
                    logout={logout}
                    photoSrc={photoSrc}
                    setLightboxUrl={setLightboxUrl}
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    couleurPortail={couleurPortail}
                />

                {/* Main content */}
                <div className={styles.mainContent}>
                    {/* Header */}
                    <EleveHeader
                        eleveData={eleveData}
                        setActiveTab={handleTabChange}
                        logout={logout}
                        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                        couleurPortail={couleurPortail}
                    />

                    {/* Tab content */}
                    <div className={styles.viewContainer}>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                variants={tabVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                            >
                                {activeTab === 'dashboard' && dashboardData && (
                                    <EleveDashboard
                                        data={dashboardData}
                                        setActiveTab={handleTabChange}
                                        couleurPortail={couleurPortail}
                                        messageBienvenue={messageBienvenue}
                                    />
                                )}

                                {activeTab === 'notes' && (
                                    <EleveNotes
                                        notesData={notesData}
                                        loading={notesLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'bulletin' && (
                                    <EleveBulletin
                                        bulletinData={bulletinData}
                                        bulletinTrimestre={bulletinTrimestre}
                                        setBulletinTrimestre={setBulletinTrimestre}
                                        loading={bulletinLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'emploi' && (
                                    <EleveEmploi
                                        edtData={edtData}
                                        loading={edtLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'absences' && (
                                    <EleveAbsences
                                        absData={absencesData}
                                        loading={absencesLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'messages' && eleveId && (
                                    <EleveMessages
                                        eleveId={eleveId}
                                        msgData={messagesData}
                                        loading={messagesLoading}
                                        refetchMessages={refetchMessages}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'fournitures' && (
                                    <EleveFournitures
                                        fournituresData={fournituresData}
                                        loading={fournituresLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'devoirs' && eleveId && (
                                    <EleveDevoirs
                                        devoirsData={devoirsData}
                                        loading={devoirsLoading}
                                        apiBase={API_BASE}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'scolarite' && (
                                    <EleveScolarite
                                        financeData={dashboardData?.finance ?? null}
                                        loading={dashboardLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'liens' && (
                                    <EleveRessources
                                        ressourcesData={ressourcesData}
                                        loading={ressourcesLoading}
                                        couleurPortail={couleurPortail}
                                    />
                                )}

                                {activeTab === 'profil' && eleveId && (
                                    <EleveProfil
                                        eleveId={eleveId}
                                        eleveData={eleveData}
                                        pendingPhoto={pendingPhoto}
                                        setPendingPhoto={setPendingPhoto}
                                        apiBase={API_BASE}
                                        couleurPortail={couleurPortail}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Photo lightbox */}
            {lightboxUrl && (
                <div
                    onClick={() => setLightboxUrl(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        cursor: 'zoom-out',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    <img
                        src={lightboxUrl}
                        alt="Photo élève"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            borderRadius: '20px',
                            boxShadow: '0 20px 80px rgba(0,0,0,0.6)',
                            objectFit: 'contain',
                        }}
                    />
                </div>
            )}
        </>
    );
}
