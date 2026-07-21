'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen, Loader2, Sparkles, Search, Plus, Zap,
    GraduationCap, Clock, Hash, Trash2, CheckCircle,
    AlertTriangle, X, School, Flag, Globe, BookOpenCheck,
    Languages, Compass, PenTool, FileText, Info
} from 'lucide-react';
import api from '@/lib/api';
import styles from './Matieres.module.css';

/* ─── TypeScript Interfaces ─── */
interface Cycle {
    cycle_id: number;
    code: string;
    libelle: string;
}

interface ClasseItem {
    classe_id: number;
    code: string;
    libelle: string;
    niveau_libelle?: string;
    nb_matieres?: number;
}

interface DeployItem {
    code: string;
    libelle: string;
    categorie: string;
    coefficient_defaut: number;
    nb_heures_semaine: number;
    est_obligatoire: string;
    cycle_code: string;
}

/* ─── Programme Guinéen complet pour le mode checkbox ─── */
const PROGRAMME_GUINEEN_UI: Record<string, { label: string; cycle: string; matieres: { code: string; libelle: string; categorie: string; coef: number; heures: number }[] }> = {
    CP1: { label: '1ère Année', cycle: 'PRM', matieres: [
        { code: 'FRA', libelle: 'Français / Lecture', categorie: 'Langues', coef: 5, heures: 8 },
        { code: 'CAL', libelle: 'Calcul', categorie: 'Sciences', coef: 4, heures: 6 },
        { code: 'SCO', libelle: "Science d'Observation", categorie: 'Sciences', coef: 2, heures: 2 },
        { code: 'ECM', libelle: 'Éducation Civique et Morale', categorie: 'Sciences Sociales', coef: 1, heures: 1 },
        { code: 'DES', libelle: 'Dessin / Arts Plastiques', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'EPS', libelle: 'Éducation Physique et Sportive', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'MUS', libelle: 'Chant et Musique', categorie: 'Pratique', coef: 1, heures: 1 },
    ]},
    CE1: { label: '3ème Année', cycle: 'PRM', matieres: [
        { code: 'FRA', libelle: 'Français', categorie: 'Langues', coef: 5, heures: 7 },
        { code: 'LEC', libelle: 'Lecture et Écriture', categorie: 'Langues', coef: 3, heures: 3 },
        { code: 'CAL', libelle: 'Calcul', categorie: 'Sciences', coef: 4, heures: 5 },
        { code: 'SCI', libelle: 'Sciences', categorie: 'Sciences', coef: 2, heures: 2 },
        { code: 'HIS', libelle: 'Histoire', categorie: 'Sciences Sociales', coef: 2, heures: 1 },
        { code: 'GEO', libelle: 'Géographie', categorie: 'Sciences Sociales', coef: 2, heures: 1 },
        { code: 'ECM', libelle: 'Éducation Civique et Morale', categorie: 'Sciences Sociales', coef: 1, heures: 1 },
        { code: 'DES', libelle: 'Dessin / Arts Plastiques', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'EPS', libelle: 'Éducation Physique et Sportive', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'MUS', libelle: 'Chant et Musique', categorie: 'Pratique', coef: 1, heures: 1 },
    ]},
    CM1: { label: '5ème Année', cycle: 'PRM', matieres: [
        { code: 'FRA', libelle: 'Français', categorie: 'Langues', coef: 5, heures: 7 },
        { code: 'CAL', libelle: 'Calcul', categorie: 'Sciences', coef: 4, heures: 5 },
        { code: 'SCO', libelle: "Sciences d'Observation", categorie: 'Sciences', coef: 2, heures: 2 },
        { code: 'HIS', libelle: 'Histoire', categorie: 'Sciences Sociales', coef: 2, heures: 1 },
        { code: 'GEO', libelle: 'Géographie', categorie: 'Sciences Sociales', coef: 2, heures: 1 },
        { code: 'ECM', libelle: 'Éducation Civique et Morale', categorie: 'Sciences Sociales', coef: 1, heures: 1 },
        { code: 'DES', libelle: 'Dessin / Arts Plastiques', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'EPS', libelle: 'Éducation Physique et Sportive', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'MUS', libelle: 'Chant et Musique', categorie: 'Pratique', coef: 1, heures: 1 },
    ]},
    '7EME': { label: '7ème Année', cycle: 'CLG', matieres: [
        { code: 'FRA', libelle: 'Français', categorie: 'Langues', coef: 4, heures: 5 },
        { code: 'MAT', libelle: 'Mathématiques', categorie: 'Sciences', coef: 4, heures: 5 },
        { code: 'ANG', libelle: 'Anglais', categorie: 'Langues', coef: 3, heures: 3 },
        { code: 'PHY', libelle: 'Physique', categorie: 'Sciences', coef: 2, heures: 2 },
        { code: 'CHI', libelle: 'Chimie', categorie: 'Sciences', coef: 2, heures: 2 },
        { code: 'BIO', libelle: 'Biologie', categorie: 'Sciences', coef: 2, heures: 2 },
        { code: 'HIS', libelle: 'Histoire', categorie: 'Sciences Sociales', coef: 2, heures: 2 },
        { code: 'GEO', libelle: 'Géographie', categorie: 'Sciences Sociales', coef: 2, heures: 2 },
        { code: 'ECM', libelle: 'Éducation Civique et Morale', categorie: 'Sciences Sociales', coef: 1, heures: 1 },
        { code: 'EPS', libelle: 'Éducation Physique et Sportive', categorie: 'Pratique', coef: 1, heures: 2 },
        { code: 'DES', libelle: 'Dessin', categorie: 'Pratique', coef: 1, heures: 1 },
        { code: 'INF', libelle: 'Informatique', categorie: 'Pratique', coef: 1, heures: 1 },
    ]},
    '11SM': { label: '11ème SM', cycle: 'LYC', matieres: [
        { code: 'FRA', libelle: 'Français', categorie: 'Langues', coef: 3, heures: 3 },
        { code: 'MAT', libelle: 'Mathématiques', categorie: 'Sciences', coef: 5, heures: 6 },
        { code: 'ANG', libelle: 'Anglais', categorie: 'Langues', coef: 2, heures: 2 },
        { code: 'PHY', libelle: 'Physique', categorie: 'Sciences', coef: 4, heures: 4 },
        { code: 'CHI', libelle: 'Chimie', categorie: 'Sciences', coef: 3, heures: 3 },
        { code: 'PHI', libelle: 'Philosophie', categorie: 'Sciences Sociales', coef: 2, heures: 2 },
        { code: 'ECO', libelle: 'Économie', categorie: 'Sciences Sociales', coef: 2, heures: 2 },
    ]},
    '11SE': { label: '11ème SE', cycle: 'LYC', matieres: [
        { code: 'FRA', libelle: 'Français', categorie: 'Langues', coef: 3, heures: 3 },
        { code: 'MAT', libelle: 'Mathématiques', categorie: 'Sciences', coef: 3, heures: 4 },
        { code: 'ANG', libelle: 'Anglais', categorie: 'Langues', coef: 2, heures: 2 },
        { code: 'PHY', libelle: 'Physique', categorie: 'Sciences', coef: 3, heures: 3 },
        { code: 'CHI', libelle: 'Chimie', categorie: 'Sciences', coef: 3, heures: 3 },
        { code: 'BIO', libelle: 'Biologie', categorie: 'Sciences', coef: 4, heures: 5 },
        { code: 'PHI', libelle: 'Philosophie', categorie: 'Sciences Sociales', coef: 2, heures: 2 },
        { code: 'ECO', libelle: 'Économie', categorie: 'Sciences Sociales', coef: 2, heures: 2 },
    ]},
    '11SS': { label: '11ème SS', cycle: 'LYC', matieres: [
        { code: 'FRA', libelle: 'Français', categorie: 'Langues', coef: 3, heures: 4 },
        { code: 'MAT', libelle: 'Mathématiques', categorie: 'Sciences', coef: 2, heures: 3 },
        { code: 'ANG', libelle: 'Anglais', categorie: 'Langues', coef: 2, heures: 3 },
        { code: 'HIS', libelle: 'Histoire', categorie: 'Sciences Sociales', coef: 3, heures: 3 },
        { code: 'GEO', libelle: 'Géographie', categorie: 'Sciences Sociales', coef: 3, heures: 3 },
        { code: 'PHI', libelle: 'Philosophie', categorie: 'Sciences Sociales', coef: 3, heures: 3 },
        { code: 'ECO', libelle: 'Économie', categorie: 'Sciences Sociales', coef: 4, heures: 4 },
    ]},
};

/* On regroupe par cycle pour l'affichage */
const CYCLE_META: Record<string, { label: string; icon: any; color: string; bg: string; badgeClass: string }> = {
    PRM: { label: 'Primaire', icon: <School size={15} />, color: '#f59e0b', bg: '#fef3c7', badgeClass: styles.badgePrimaire },
    CLG: { label: 'Collège', icon: <Compass size={15} />, color: '#3b82f6', bg: '#dbeafe', badgeClass: styles.badgeCollege },
    LYC: { label: 'Lycée', icon: <GraduationCap size={15} />, color: '#8b5cf6', bg: '#ede9fe', badgeClass: styles.badgeLycee },
};

const CATEGORY_THEME: Record<string, { gradient: string; bg: string; text: string; border: string; icon: any }> = {
    Sciences: { gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd', icon: <Compass size={15} /> },
    Langues: { gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)', bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd', icon: <Languages size={15} /> },
    'Sciences Sociales': { gradient: 'linear-gradient(135deg, #f97316, #ea580c)', bg: '#fff7ed', text: '#ea580c', border: '#fdba74', icon: <FileText size={15} /> },
    Pratique: { gradient: 'linear-gradient(135deg, #10b981, #059669)', bg: '#ecfdf5', text: '#059669', border: '#6ee7b7', icon: <PenTool size={15} /> },
    Autres: { gradient: 'linear-gradient(135deg, #64748b, #475569)', bg: '#f8fafc', text: '#475569', border: '#cbd5e1', icon: <BookOpen size={15} /> },
};
const getCatTheme = (cat: string | null) => CATEGORY_THEME[cat || 'Autres'] || CATEGORY_THEME['Autres'];

/** Retourne l'icône Lucide correspondant à une catégorie (taille configurable). */
const getBigIcon = (cat: string | null, size: number): ReactNode => {
    const map: Record<string, ReactNode> = {
        Sciences: <Compass size={size} />,
        Langues: <Languages size={size} />,
        'Sciences Sociales': <FileText size={size} />,
        Pratique: <PenTool size={size} />,
        Autres: <BookOpen size={size} />,
    };
    return map[cat || 'Autres'] ?? map['Autres'];
};

const getClassGradient = (classLibelle: string, levelLibelle: string, isEmpty: boolean) => {
    if (isEmpty) return 'linear-gradient(135deg, #fff5f5, #fee2e2)';
    const lib = `${classLibelle} ${levelLibelle}`.toLowerCase();
    if (lib.includes('prim') || lib.includes('1ère') || lib.includes('2ème') || lib.includes('3ème') || lib.includes('4ème') || lib.includes('5ème') || lib.includes('6ème') || lib.includes('cp') || lib.includes('ce') || lib.includes('cm') || lib.includes('prm') || lib.includes('1a') || lib.includes('2a') || lib.includes('3a') || lib.includes('4a') || lib.includes('5a') || lib.includes('6a')) {
        return 'linear-gradient(135deg, #fffbeb, #fef3c7)';
    }
    if (lib.includes('coll') || lib.includes('7ème') || lib.includes('8ème') || lib.includes('9ème') || lib.includes('10ème') || lib.includes('7a') || lib.includes('8a') || lib.includes('9a') || lib.includes('10a') || lib.includes('clg')) {
        return 'linear-gradient(135deg, #eff6ff, #dbeafe)';
    }
    if (lib.includes('lyc') || lib.includes('11ème') || lib.includes('12ème') || lib.includes('term') || lib.includes('11sm') || lib.includes('11se') || lib.includes('11ss') || lib.includes('12sm') || lib.includes('12se') || lib.includes('12ss') || lib.includes('tsm') || lib.includes('tse') || lib.includes('tss')) {
        return 'linear-gradient(135deg, #faf5ff, #ede9fe)';
    }
    return 'linear-gradient(135deg, #f8fafc, #f1f5f9)';
};

const TABS = [
    { id: 'deploy', label: 'Déployer les Matières', Icon: Sparkles },
    { id: 'manage', label: 'Gérer les Matières', Icon: BookOpen },
    { id: 'classes', label: 'Attribution aux Classes', Icon: GraduationCap },
];

interface Matiere {
    matiere_id: number;
    cycle_id: number;
    code: string;
    libelle: string;
    categorie: string | null;
    coefficient_defaut: number;
    est_obligatoire: string;
    nb_heures_semaine: number;
    cycle?: string;
}

export default function MatieresPage() {
    const [tab, setTab] = useState('deploy');
    const [loading, setLoading] = useState(true);
    const [matieres, setMatieres] = useState<Matiere[]>([]);
    const [cycles, setCycles] = useState<Cycle[]>([]);
    const [classes, setClasses] = useState<ClasseItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Confirmation Modal state
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        confirmText: string;
        type: 'warning' | 'danger' | 'info';
        action: () => void;
    } | null>(null);

    // Deploy tab state
    const [deployMode, setDeployMode] = useState<'guinee' | 'custom'>('guinee');
    const [selectedMatieres, setSelectedMatieres] = useState<Record<string, boolean>>({});
    const [editOverrides, setEditOverrides] = useState<Record<string, { libelle?: string; coef?: number; heures?: number }>>({});
    const [deployFilter, setDeployFilter] = useState<string>('ALL');

    // Manage tab state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCycle, setFilterCycle] = useState<string>('ALL');

    // Custom subject form
    const [showAddForm, setShowAddForm] = useState(false);
    const [newSubject, setNewSubject] = useState({ code: '', libelle: '', categorie: 'Sciences', cycle_id: 0, coefficient_defaut: 2, nb_heures_semaine: 2, est_obligatoire: 'O' });

    // Classes tab
    const [assigning, setAssigning] = useState(false);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const [matRes, cycRes, classRes] = await Promise.all([
                api.get('/api/matieres').catch(() => ({ data: [] })),
                api.get('/api/parametrage/cycles').catch(() => ({ data: [] })),
                api.get('/api/classes?etablissement_id=1&annee_id=1').catch(() => ({ data: [] })),
            ]);
            setMatieres(matRes.data || []);
            setCycles(cycRes.data || []);
            setClasses(classRes.data || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Init all Guinea checkboxes ON by default
    useEffect(() => {
        if (Object.keys(selectedMatieres).length === 0) {
            const init: Record<string, boolean> = {};
            for (const [niv, data] of Object.entries(PROGRAMME_GUINEEN_UI)) {
                for (const m of data.matieres) {
                    init[`${data.cycle}_${m.code}`] = true;
                }
            }
            setSelectedMatieres(init);
        }
    }, []);

    // Helper for trigger confirmation modals
    const triggerConfirm = (title: string, message: string, confirmText: string, type: 'warning' | 'danger' | 'info', action: () => void) => {
        setConfirmModal({ title, message, confirmText, type, action });
    };

    // ─── Deploy: collect unique selected matieres ─────────────────────
    const getSelectedForDeploy = () => {
        const unique: Record<string, DeployItem> = {};
        for (const [niv, data] of Object.entries(PROGRAMME_GUINEEN_UI)) {
            for (const m of data.matieres) {
                const key = `${data.cycle}_${m.code}`;
                if (!selectedMatieres[key]) continue;
                if (!unique[key]) {
                    const override = editOverrides[key] || {};
                    unique[key] = {
                        code: m.code,
                        libelle: override.libelle ?? m.libelle,
                        categorie: m.categorie,
                        coefficient_defaut: override.coef ?? m.coef,
                        nb_heures_semaine: override.heures ?? m.heures,
                        est_obligatoire: 'O',
                        cycle_code: data.cycle,
                    };
                }
            }
        }
        return Object.values(unique);
    };

    const handleDeploy = async () => {
        const items = getSelectedForDeploy();
        if (items.length === 0) { showToast('Aucune matière sélectionnée', 'error'); return; }
        setSaving(true);
        try {
            // First make sure auto-gen ran (creates cycles+matieres)
            await api.post('/api/matieres/auto-generation');

            // Group by cycle
            const cycleMap: Record<string, number> = {};
            for (const c of cycles) {
                cycleMap[c.code] = c.cycle_id;
            }

            // Then batch update with overrides
            const batch = items.map(it => ({
                code: it.code,
                libelle: it.libelle,
                categorie: it.categorie,
                coefficient_defaut: it.coefficient_defaut,
                nb_heures_semaine: it.nb_heures_semaine,
                est_obligatoire: it.est_obligatoire,
                cycle_id: cycleMap[it.cycle_code] || 1,
            }));

            if (batch.length > 0) {
                await api.post('/api/matieres/batch-create', batch);
            }

            showToast(`✅ ${items.length} matières déployées avec succès !`);
            await fetchAll();
            setTab('manage');
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Erreur lors du déploiement', 'error');
        }
        setSaving(false);
    };

    // ─── Add custom subject ───────────────────────────────────────────
    const handleAddCustom = async () => {
        if (!newSubject.code || !newSubject.libelle || !newSubject.cycle_id) {
            showToast('Remplissez tous les champs obligatoires', 'error');
            return;
        }
        setSaving(true);
        try {
            await api.post('/api/matieres', newSubject);
            showToast(`✅ ${newSubject.libelle} créée !`);
            setNewSubject({ code: '', libelle: '', categorie: 'Sciences', cycle_id: 0, coefficient_defaut: 2, nb_heures_semaine: 2, est_obligatoire: 'O' });
            setShowAddForm(false);
            await fetchAll();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'Erreur', 'error');
        }
        setSaving(false);
    };

    // ─── Delete ──────────────────────────────────────────────────────
    const handleDelete = async (id: number, name: string) => {
        triggerConfirm(
            'Supprimer la matière ?',
            `Êtes-vous sûr de vouloir supprimer la matière « ${name} » ? Elle sera également retirée de toutes les classes associées dans l'école.`,
            'Supprimer la matière',
            'danger',
            async () => {
                try {
                    await api.delete(`/api/matieres/${id}`);
                    showToast(`✅ Matière ${name} supprimée !`);
                    await fetchAll();
                } catch (e: any) {
                    showToast(e.response?.data?.detail || 'Erreur lors de la suppression', 'error');
                }
            }
        );
    };

    // ─── Assign to all classes ──────────────────────────────────────
    const handleAssignAll = async () => {
        triggerConfirm(
            'Lancer l\'attribution intelligente ?',
            'Le système va associer automatiquement les matières déployées aux classes en fonction de leur cycle et de leur niveau (y compris les spécialités du Lycée). Les attributions existantes seront conservées.',
            'Lancer l\'attribution',
            'warning',
            async () => {
                setAssigning(true);
                try {
                    const res = await api.post('/api/matieres/attribuer-programme');
                    showToast(`✅ Attribution terminée : ${res.data.assigned} nouvelles matières attribuées.`);
                    await fetchAll();
                } catch (e: any) {
                    showToast(e.response?.data?.detail || 'Erreur d\'attribution', 'error');
                } finally {
                    setAssigning(false);
                }
            }
        );
    };

    // ─── Filtered matieres ──────────────────────────────────────────
    const filteredMatieres = matieres.filter(m => {
        if (filterCycle !== 'ALL') {
            const cycleName = cycles.find((c: any) => c.cycle_id === m.cycle_id)?.libelle || '';
            if (cycleName !== filterCycle) return false;
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return m.libelle.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
        }
        return true;
    });

    const groupedMatieres = filteredMatieres.reduce((acc, m) => {
        const cat = m.categorie || 'Autres';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(m);
        return acc;
    }, {} as Record<string, Matiere[]>);

    const getCycleName = (cid: number) => cycles.find((c: any) => c.cycle_id === cid)?.libelle || '';

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loaderWrap}>
                    <Loader2 className={styles.spinner} size={36} color="#4f46e5" />
                    <span>Chargement des programmes scolaires...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* ── Banner ── */}
            <div className={styles.bannerCard}>
                <div className={styles.bannerDeco} />
                <div className={styles.bannerDeco2} />
                <div className={styles.bannerContent}>
                    <div className={styles.bannerIconBox}>
                        <BookOpenCheck size={28} />
                    </div>
                    <div>
                        <h1 className={styles.bannerTitle}>Programme & Matières</h1>
                        <p className={styles.bannerDesc}>
                            Gérez le curriculum académique complet et l'attribution des matières aux classes de l'établissement.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className={styles.tabsNav}>
                {TABS.map(({ id, label, Icon }) => (
                    <button key={id}
                        className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
                        onClick={() => setTab(id)}
                    >
                        <Icon size={16} />
                        {label}
                    </button>
                ))}
            </div>

            {/* ═══════════════════════════════════════════
                TAB 1: DÉPLOYER LES MATIÈRES
            ═══════════════════════════════════════════ */}
            {tab === 'deploy' && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <div className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <h2><Sparkles size={20} color="#f59e0b" /> Déployer les Matières</h2>
                        </div>

                        {/* Mode Selection */}
                        <div className={styles.modeSelectGrid}>
                            <div className={`${styles.modeCard} ${deployMode === 'guinee' ? styles.modeCardActive : ''}`}
                                onClick={() => setDeployMode('guinee')}>
                                <div className={styles.modeIconBox}>
                                    <Flag size={24} />
                                </div>
                                <div className={styles.modeInfo}>
                                    <h3>Programme Guinéen</h3>
                                    <p>Matières officielles structurées selon le programme national guinéen.</p>
                                </div>
                            </div>
                            <div className={`${styles.modeCard} ${deployMode === 'custom' ? styles.modeCardActive : ''}`}
                                onClick={() => setDeployMode('custom')}>
                                <div className={styles.modeIconBox}>
                                    <Globe size={24} />
                                </div>
                                <div className={styles.modeInfo}>
                                    <h3>Autre Pays / Spécifique</h3>
                                    <p>Créez et organisez vos propres matières adaptées à votre règlementation.</p>
                                </div>
                            </div>
                        </div>

                        {deployMode === 'guinee' ? (
                            <>
                                {/* Warning */}
                                <div className={styles.warningBox}>
                                    <AlertTriangle size={20} className={styles.warningIcon} />
                                    <div className={styles.warningText}>
                                        <strong>Vérification conseillée :</strong> Vous pouvez décocher les matières inutilisées ou modifier leurs coefficients et volumes d'heures de cours avant de lancer le déploiement global.
                                    </div>
                                </div>

                                {/* Cycle Filter */}
                                <div className={styles.filtersRow} style={{ marginTop: '1.5rem' }}>
                                    <div className={styles.filterGroup}>
                                        {[{ key: 'ALL', label: '🌍 Tous' }, { key: 'PRM', label: '📚 Primaire' }, { key: 'CLG', label: '🏫 Collège' }, { key: 'LYC', label: '🎓 Lycée' }].map(f => (
                                            <button key={f.key}
                                                className={`${styles.filterBtn} ${deployFilter === f.key ? styles.filterBtnActive : ''}`}
                                                onClick={() => setDeployFilter(f.key)}>
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Matières Table grouped by cycle */}
                                {['PRM', 'CLG', 'LYC'].filter(cc => deployFilter === 'ALL' || deployFilter === cc).map(cycleCode => {
                                    const cm = CYCLE_META[cycleCode];
                                    const niveaux = Object.entries(PROGRAMME_GUINEEN_UI).filter(([, d]) => d.cycle === cycleCode);
                                    // Collect unique matieres for this cycle
                                    const uniqueMap: Record<string, any> = {};
                                    for (const [, d] of niveaux) {
                                        for (const m of d.matieres) {
                                            if (!uniqueMap[m.code]) uniqueMap[m.code] = m;
                                        }
                                    }
                                    const uniqueMats = Object.values(uniqueMap);

                                    return (
                                        <div key={cycleCode} style={{ marginBottom: '2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                                                <span style={{ color: cm.color }}>{cm.icon}</span>
                                                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: cm.color }}>{cm.label}</h3>
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({uniqueMats.length} matières)</span>
                                            </div>
                                            <div className={styles.tableWrap}>
                                                <div className={styles.tableHeader}>
                                                    <span>✓</span><span>Code</span><span>Matière</span><span>Catégorie</span><span>Coef.</span><span>Heures/s</span>
                                                </div>
                                                {uniqueMats.map(m => {
                                                    const key = `${cycleCode}_${m.code}`;
                                                    const checked = selectedMatieres[key] ?? true;
                                                    const override = editOverrides[key] || {};
                                                    return (
                                                        <div key={key} className={`${styles.tableRow} ${!checked ? styles.tableRowInactive : ''}`}>
                                                            <input type="checkbox" className={styles.checkbox}
                                                                checked={checked}
                                                                onChange={e => setSelectedMatieres(p => ({ ...p, [key]: e.target.checked }))}
                                                            />
                                                            <span style={{ fontWeight: 800, fontSize: '0.82rem', color: cm.color }}>{m.code}</span>
                                                            <input className={styles.inputInline}
                                                                value={override.libelle ?? m.libelle}
                                                                disabled={!checked}
                                                                onChange={e => setEditOverrides(p => ({ ...p, [key]: { ...override, libelle: e.target.value } }))}
                                                            />
                                                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{m.categorie}</span>
                                                            <input type="number" className={styles.inputInline}
                                                                style={{ width: '70px', textAlign: 'center', fontWeight: 700 }}
                                                                value={override.coef ?? m.coef}
                                                                disabled={!checked}
                                                                min={0.5} max={10} step={0.5}
                                                                onChange={e => setEditOverrides(p => ({ ...p, [key]: { ...override, coef: Number(e.target.value) } }))}
                                                            />
                                                            <input type="number" className={styles.inputInline}
                                                                style={{ width: '70px', textAlign: 'center', fontWeight: 700 }}
                                                                value={override.heures ?? m.heures}
                                                                disabled={!checked}
                                                                min={1} max={12}
                                                                onChange={e => setEditOverrides(p => ({ ...p, [key]: { ...override, heures: Number(e.target.value) } }))}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}

                                <div className={styles.deployActions}>
                                    <button className={styles.btnPrimary} onClick={() => {
                                        triggerConfirm(
                                            'Déployer le programme ?',
                                            'Êtes-vous sûr de vouloir déployer les matières cochées ? Les matières existantes seront mises à jour avec les nouveaux coefficients et volumes horaires.',
                                            'Déployer le programme',
                                            'warning',
                                            handleDeploy
                                        );
                                    }} disabled={saving}>
                                        {saving ? <Loader2 size={16} className={styles.spinner} /> : <Sparkles size={16} />}
                                        {saving ? 'Déploiement en cours...' : 'Déployer les matières sélectionnées'}
                                    </button>
                                </div>
                            </>
                        ) : (
                            /* Custom / Autre Pays */
                            <div className={styles.emptyPanel}>
                                <div className={styles.emptyPanelIconBox} style={{ color: '#4f46e5', background: '#e0e7ff' }}>
                                    <Globe size={32} />
                                </div>
                                <h3>Mode Personnalisé Actif</h3>
                                <p style={{ marginBottom: '1.5rem', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                                    Vous avez choisi de configurer votre propre programme. Allez dans l'onglet <strong>« Gérer les Matières »</strong> pour créer vos matières manuellement.
                                </p>
                                <button className={styles.btnPrimary} onClick={() => { setTab('manage'); setShowAddForm(true); }}>
                                    <Plus size={16} /> Créer mes matières
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ═══════════════════════════════════════════
                TAB 2: GÉRER LES MATIÈRES (SUPER CLEAN REDESIGNED)
            ═══════════════════════════════════════════ */}
            {tab === 'manage' && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <div className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <h2><BookOpenCheck size={20} color="#4f46e5" /> Matières enregistrées ({matieres.length})</h2>
                            <button className={styles.btnSecondary} onClick={() => setShowAddForm(!showAddForm)}>
                                {showAddForm ? <X size={16} /> : <Plus size={16} />}
                                {showAddForm ? 'Annuler' : 'Ajouter une matière'}
                            </button>
                        </div>

                        {/* Add Form */}
                        <AnimatePresence>
                            {showAddForm && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden', marginBottom: '1.5rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 1rem', fontWeight: 800, fontSize: '0.95rem' }}>➕ Nouvelle matière</h4>
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label>Code *</label>
                                            <input className={styles.textInput} placeholder="Ex: MAT" maxLength={5}
                                                value={newSubject.code}
                                                onChange={e => setNewSubject(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Nom de la matière *</label>
                                            <input className={styles.textInput} placeholder="Ex: Mathématiques"
                                                value={newSubject.libelle}
                                                onChange={e => setNewSubject(p => ({ ...p, libelle: e.target.value }))} />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Cycle *</label>
                                            <select className={styles.selectInput}
                                                value={newSubject.cycle_id}
                                                onChange={e => setNewSubject(p => ({ ...p, cycle_id: Number(e.target.value) }))}>
                                                <option value={0}>— Choisir —</option>
                                                {cycles.map((c: any) => (
                                                    <option key={c.cycle_id} value={c.cycle_id}>{c.libelle}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label>Catégorie</label>
                                            <select className={styles.selectInput}
                                                value={newSubject.categorie}
                                                onChange={e => setNewSubject(p => ({ ...p, categorie: e.target.value }))}>
                                                {Object.keys(CATEGORY_THEME).map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Coefficient</label>
                                            <input type="number" className={styles.textInput} min={0.5} max={10} step={0.5}
                                                value={newSubject.coefficient_defaut}
                                                onChange={e => setNewSubject(p => ({ ...p, coefficient_defaut: Number(e.target.value) }))} />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Heures / semaine</label>
                                            <input type="number" className={styles.textInput} min={1} max={12}
                                                value={newSubject.nb_heures_semaine}
                                                onChange={e => setNewSubject(p => ({ ...p, nb_heures_semaine: Number(e.target.value) }))} />
                                        </div>
                                    </div>
                                    <button className={styles.addBtn} onClick={handleAddCustom} disabled={saving}>
                                        {saving ? <Loader2 size={14} className={styles.spinner} /> : <Plus size={14} />}
                                        Créer la matière
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Filters */}
                        <div className={styles.filtersRow}>
                            <div className={styles.searchBox}>
                                <Search size={16} className={styles.searchIcon} />
                                <input className={styles.searchInput} placeholder="Rechercher une matière..."
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                            </div>
                            <div className={styles.filterGroup}>
                                {['ALL', ...cycles.map((c: any) => c.libelle)].map(f => (
                                    <button key={f}
                                        className={`${styles.filterBtn} ${filterCycle === f ? styles.filterBtnActive : ''}`}
                                        onClick={() => setFilterCycle(f)}>
                                        {f === 'ALL' ? '🌍 Tous' : f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Subjects Grid */}
                        {matieres.length === 0 ? (
                            <div className={styles.emptyPanel}>
                                <div className={styles.emptyPanelIconBox} style={{ color: '#6366f1', background: '#eff6ff' }}>
                                    <BookOpenCheck size={32} />
                                </div>
                                <h3>Aucune matière dans le système</h3>
                                <p>Utilisez l'onglet "Déployer les Matières" pour commencer.</p>
                            </div>
                        ) : (
                            <div className={styles.categoriesWrap}>
                                {Object.keys(groupedMatieres).sort().map(category => {
                                    const theme = getCatTheme(category);
                                    return (
                                        <div key={category}>
                                            <div className={styles.categoryHeader}>
                                                <span style={{ color: theme.text, background: theme.bg, padding: '8px', borderRadius: '12px', display: 'flex' }}>
                                                    {theme.icon}
                                                </span>
                                                <h3 className={styles.categoryTitle} style={{ color: '#1e293b' }}>{category}</h3>
                                                <span className={styles.categoryCount} style={{ background: theme.bg, color: theme.text }}>
                                                    {groupedMatieres[category].length}
                                                </span>
                                            </div>
                                            <div className={styles.subjectsGrid}>
                                                {groupedMatieres[category].map(mat => {
                                                    const cycleName = getCycleName(mat.cycle_id);
                                                    const badgeClass = cycleName === 'Primaire' ? styles.badgePrimaire
                                                        : cycleName === 'Collège' ? styles.badgeCollege : styles.badgeLycee;
                                                    return (
                                                        <motion.div
                                                            key={mat.matiere_id}
                                                            className={styles.subjectCard}
                                                            style={{
                                                                background: theme.bg,
                                                                borderColor: theme.border,
                                                            }}
                                                            initial={{ opacity: 0, y: 8 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                        >
                                                            {/* ─ Ligne haute : icône + code + supprimer ─ */}
                                                            <div className={styles.cardTopLine}>
                                                                <div className={styles.cardIconCircle} style={{ background: theme.gradient }}>
                                                                    {getBigIcon(mat.categorie, 22)}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                                    <span className={styles.subjectCodeBadge}
                                                                        style={{ background: 'white', color: theme.text, border: `1px solid ${theme.border}` }}>
                                                                        {mat.code}
                                                                    </span>
                                                                    <button
                                                                        className={styles.deleteBtn}
                                                                        onClick={() => handleDelete(mat.matiere_id, mat.libelle)}
                                                                        title="Supprimer"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* ─ Nom de la matière ─ */}
                                                            <div className={styles.cardSubjectTitle}>
                                                                {mat.libelle}
                                                            </div>

                                                            {/* ─ Ligne basse : métadonnées + cycle ─ */}
                                                            <div className={styles.cardBottomLine} style={{ borderTop: `1px solid ${theme.border}` }}>
                                                                <div className={styles.metadataPills}>
                                                                    <span className={styles.metaPill}
                                                                        style={{ background: 'white', color: theme.text, borderColor: theme.border }}>
                                                                        <Hash size={11} />
                                                                        Coef {mat.coefficient_defaut}
                                                                    </span>
                                                                    <span className={styles.metaPill}
                                                                        style={{ background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                                                                        <Clock size={11} />
                                                                        {mat.nb_heures_semaine}h/s
                                                                    </span>
                                                                </div>
                                                                <span className={`${styles.cycleBadge} ${badgeClass}`}>
                                                                    {cycleName}
                                                                </span>
                                                            </div>

                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredMatieres.length === 0 && matieres.length > 0 && (
                                    <div className={styles.emptyPanel}>
                                        <div className={styles.emptyPanelIconBox}>
                                            <Search size={32} />
                                        </div>
                                        <p style={{ fontWeight: 650 }}>Aucun résultat pour vos filtres.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ═══════════════════════════════════════════
                TAB 3: ATTRIBUTION AUX CLASSES
            ═══════════════════════════════════════════ */}
            {tab === 'classes' && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                    <div className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <h2><GraduationCap size={20} color="#10b981" /> Attribution aux Classes</h2>
                            <button className={styles.btnPrimary} onClick={handleAssignAll} disabled={assigning}>
                                {assigning ? <Loader2 size={16} className={styles.spinner} /> : <Zap size={16} />}
                                {assigning ? 'Attribution en cours...' : 'Attribuer à toutes les classes'}
                            </button>
                        </div>

                        <div className={styles.warningBox}>
                            <AlertTriangle size={20} className={styles.warningIcon} />
                            <div className={styles.warningText}>
                                <strong>Attribution intelligente :</strong> Le système distribue automatiquement les matières en se basant sur le niveau et la série (au Lycée, par exemple 11SM reçoit le pack Sciences Mathématiques).
                            </div>
                        </div>

                        <div className={styles.classesGrid} style={{ marginTop: '1.5rem' }}>
                            {classes.map((cl: any) => {
                                const nbMat = cl.nb_matieres ?? 0;
                                const isEmpty = nbMat === 0;
                                return (
                                    <div key={cl.classe_id} className={`${styles.classCard} ${isEmpty ? styles.classCardEmpty : ''}`}
                                        style={{ background: getClassGradient(cl.libelle, cl.niveau_libelle || '', isEmpty) }}>
                                        <div>
                                            <div className={styles.className} style={{ color: '#0f172a' }}>{cl.libelle}</div>
                                            <div className={styles.classLevel} style={{ color: '#475569' }}>{cl.niveau_libelle || cl.niveau?.libelle || '—'}</div>
                                        </div>
                                        <span className={styles.classStatus} style={{
                                            background: isEmpty ? '#fecaca' : '#bbf7d0',
                                            color: isEmpty ? '#991b1b' : '#166534',
                                        }}>
                                            {isEmpty ? 'Pas de matière' : `${nbMat} matière${nbMat > 1 ? 's' : ''}`}
                                        </span>
                                    </div>
                                );
                            })}
                            {classes.length === 0 && (
                                <div className={styles.emptyPanel}>
                                    <div className={styles.emptyPanelIconBox}>
                                        <School size={32} />
                                    </div>
                                    <h3>Aucune classe enregistrée</h3>
                                    <p>Créez d'abord des classes depuis la section Paramètres de l'école.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ── Custom Animated Confirmation Dialog ── */}
            <AnimatePresence>
                {confirmModal && (
                    <motion.div className={styles.modalOverlay}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div className={styles.modalBox}
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className={`${styles.modalIconBox} ${
                                confirmModal.type === 'danger' ? styles.modalIconBoxDanger :
                                confirmModal.type === 'info' ? styles.modalIconBoxInfo : styles.modalIconBoxWarning
                            }`}>
                                {confirmModal.type === 'danger' ? <Trash2 size={24} /> :
                                 confirmModal.type === 'info' ? <Info size={24} /> : <AlertTriangle size={24} />}
                            </div>

                            <h3 className={styles.modalTitle}>{confirmModal.title}</h3>
                            <p className={styles.modalMessage}>{confirmModal.message}</p>

                            <div className={styles.modalButtons}>
                                <button className={styles.modalBtnCancel} onClick={() => setConfirmModal(null)}>
                                    Annuler
                                </button>
                                <button className={`${styles.modalBtnConfirm} ${
                                    confirmModal.type === 'danger' ? styles.modalBtnConfirmDanger :
                                    confirmModal.type === 'info' ? styles.modalBtnConfirmInfo : styles.modalBtnConfirmWarning
                                }`} onClick={() => {
                                    confirmModal.action();
                                    setConfirmModal(null);
                                }}>
                                    {confirmModal.confirmText}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Toast notifications ── */}
            <AnimatePresence>
                {toast && (
                    <motion.div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}
                        initial={{ opacity: 0, x: 80 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 80 }}>
                        {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
