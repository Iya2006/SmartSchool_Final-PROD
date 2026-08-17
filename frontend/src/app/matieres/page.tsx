'use client';

import { useState, useEffect, useCallback, type ReactNode, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BookOpen, Loader2, Sparkles, Search, Plus, Zap,
    GraduationCap, Clock, Hash, Trash2, CheckCircle,
    AlertTriangle, X, School, Flag, Globe, BookOpenCheck,
    Languages, Compass, PenTool, FileText, Info, Pencil, Save
} from 'lucide-react';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
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

const CATEGORY_THEME: Record<string, { gradient: string; bg: string; text: string; border: string; icon: any }> = {
    Sciences: { gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd', icon: <Compass size={15} /> },
    Langues: { gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)', bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd', icon: <Languages size={15} /> },
    'Sciences Sociales': { gradient: 'linear-gradient(135deg, #f97316, #ea580c)', bg: '#fff7ed', text: '#ea580c', border: '#fdba74', icon: <FileText size={15} /> },
    Pratique: { gradient: 'linear-gradient(135deg, #10b981, #059669)', bg: '#ecfdf5', text: '#059669', border: '#6ee7b7', icon: <PenTool size={15} /> },
    Autres: { gradient: 'linear-gradient(135deg, #64748b, #475569)', bg: '#f8fafc', text: '#475569', border: '#cbd5e1', icon: <BookOpen size={15} /> },
    // Au Lycée, la catégorie d'une matière est sa série. Les libellés
    // génériques ci-dessus ne concernent que le Primaire et le Collège, et
    // restent utilisés par les matières créées avant ce changement.
    SM: { gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', bg: '#f5f3ff', text: '#7c3aed', border: '#c4b5fd', icon: <Compass size={15} /> },
    SE: { gradient: 'linear-gradient(135deg, #06b6d4, #0e7490)', bg: '#ecfeff', text: '#0891b2', border: '#67e8f9', icon: <Compass size={15} /> },
    SS: { gradient: 'linear-gradient(135deg, #f59e0b, #b45309)', bg: '#fffbeb', text: '#d97706', border: '#fcd34d', icon: <FileText size={15} /> },
    // Groupes par cycle (Primaire / Collège) et par série au Lycée
    'Primaire': { gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', bg: '#fef3c7', text: '#b45309', border: '#fcd34d', icon: <School size={15} /> },
    'Collège': { gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', icon: <Compass size={15} /> },
    'Lycée': { gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd', icon: <GraduationCap size={15} /> },
    'Lycée — SM': { gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', bg: '#f5f3ff', text: '#7c3aed', border: '#c4b5fd', icon: <GraduationCap size={15} /> },
    'Lycée — SE': { gradient: 'linear-gradient(135deg, #06b6d4, #0e7490)', bg: '#ecfeff', text: '#0891b2', border: '#67e8f9', icon: <GraduationCap size={15} /> },
    'Lycée — SS': { gradient: 'linear-gradient(135deg, #f59e0b, #b45309)', bg: '#fffbeb', text: '#d97706', border: '#fcd34d', icon: <GraduationCap size={15} /> },
};

/** La catégorie n'existe qu'au Lycée, où elle désigne la série de la matière.
 *  Au Primaire et au Collège il n'y a pas de série : le champ est masqué et
 *  la matière est enregistrée sans catégorie. */
const CATEGORIES_LYCEE = ['SM', 'SE', 'SS'];
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

// Un seul onglet : la page affiche uniquement les matières réellement
// enregistrées en base. Le catalogue du programme guinéen (données codées
// dans le front) et l'attribution en masse ont été retirés.
const TABS = [
    { id: 'manage', label: 'Gérer les Matières', Icon: BookOpen },
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
    const { etablissementId, anneeId } = useApp();
    const [tab, setTab] = useState('manage');
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

    // Édition d'une matière existante.
    const [editMatiere, setEditMatiere] = useState<Matiere | null>(null);
    const [editForm, setEditForm] = useState({ libelle: '', code: '', coefficient_defaut: 1, nb_heures_semaine: 2, note_sur: 20, categorie: '' });
    const [editSaving, setEditSaving] = useState(false);

    const ouvrirEditionMatiere = (m: Matiere) => {
        setEditForm({
            libelle: m.libelle, code: m.code,
            coefficient_defaut: m.coefficient_defaut ?? 1,
            nb_heures_semaine: m.nb_heures_semaine ?? 2,
            note_sur: (m as Matiere & { note_sur?: number }).note_sur ?? 20,
            categorie: m.categorie || '',
        });
        setEditMatiere(m);
    };

    const enregistrerEditionMatiere = async () => {
        if (!editMatiere) return;
        if (!editForm.libelle.trim() || !editForm.code.trim()) {
            showToast('Le nom et le code sont obligatoires', 'error');
            return;
        }
        setEditSaving(true);
        try {
            await api.put(`/api/matieres/${editMatiere.matiere_id}`, {
                cycle_id: editMatiere.cycle_id,
                code: editForm.code.trim(),
                libelle: editForm.libelle.trim(),
                coefficient_defaut: Number(editForm.coefficient_defaut) || 1,
                nb_heures_semaine: Number(editForm.nb_heures_semaine) || 1,
                note_sur: Number(editForm.note_sur) || 20,
                categorie: editForm.categorie || null,
                est_obligatoire: editMatiere.est_obligatoire || 'O',
            });
            setEditMatiere(null);
            showToast('Matière modifiée !');
            await fetchAll();
        } catch (e: any) {
            showToast(e.response?.data?.detail || 'La modification a échoué', 'error');
        } finally {
            setEditSaving(false);
        }
    };

    // Deploy tab state
    const [deployMode, setDeployMode] = useState<'guinee' | 'custom'>('guinee');

    // Manage tab state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCycle, setFilterCycle] = useState<string>('ALL');

    // Custom subject form
    const [showAddForm, setShowAddForm] = useState(false);
    // categorie = série du Lycée (SM/SE/SS) ; vide pour Primaire et Collège
    const [newSubject, setNewSubject] = useState({ code: '', libelle: '', categorie: '', cycle_id: 0, coefficient_defaut: 2, nb_heures_semaine: 2, est_obligatoire: 'O' });
    // Classes auxquelles rattacher la matière dès sa création
    const [classesSelectionnees, setClassesSelectionnees] = useState<number[]>([]);

    // Classes tab

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
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`).catch(() => ({ data: [] })),
            ]);
            setMatieres(matRes.data || []);
            setCycles(cycRes.data || []);
            setClasses(classRes.data || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [etablissementId, anneeId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);


    // Helper for trigger confirmation modals
    const triggerConfirm = (title: string, message: string, confirmText: string, type: 'warning' | 'danger' | 'info', action: () => void) => {
        setConfirmModal({ title, message, confirmText, type, action });
    };

    // ─── Deploy: collect unique selected matieres ─────────────────────

    /**
     * Écrit les coefficients propres à chaque série du Lycée (SM / SE / SS).
     *
     * Une Matiere est rattachée à un CYCLE : « Mathématiques » est donc unique
     * pour tout le Lycée et ne peut pas porter à la fois le coef. 5 de SM et le
     * coef. 2 de SS. Le coefficient réellement utilisé dans les moyennes est
     * celui de ClasseMatiere — propre à chaque classe, donc à chaque série.
     *
     * Appelée après le déploiement ET après l'attribution aux classes, car les
     * lignes ClasseMatiere doivent exister pour être mises à jour.
     * Retourne le nombre de coefficients appliqués.
     */

    // Le cycle sélectionné dans le formulaire de création est-il le Lycée ?
    const cycleChoisiEstLycee = cycles.find((c: any) => c.cycle_id === newSubject.cycle_id)?.code === 'LYC';


    // Classes du cycle sélectionné — au Lycée, restreintes à la série choisie
    // (une matière SM n'a rien à faire dans une classe SS). Le rattachement
    // classe → cycle passe par le niveau, fourni par /api/parametrage/cycles.
    const niveauDuCycle = (cycleId: number): Record<number, string> => {
        const cyc = cycles.find((c: any) => c.cycle_id === cycleId);
        const map: Record<number, string> = {};
        for (const n of (cyc as any)?.niveaux || []) map[n.niveau_id] = n.code;
        return map;
    };
    const niveauxCycle = niveauDuCycle(newSubject.cycle_id);
    const classesDuCycle = classes.filter((cl: any) => {
        if (!newSubject.cycle_id) return false;
        const codeNiveau = niveauxCycle[cl.niveau_id];
        if (!codeNiveau) return false;                  // classe d'un autre cycle
        if (cycleChoisiEstLycee && newSubject.categorie) {
            return codeNiveau.toUpperCase().endsWith(newSubject.categorie);
        }
        return true;
    });

    // ─── Add custom subject ───────────────────────────────────────────
    const handleAddCustom = async () => {
        if (!newSubject.code || !newSubject.libelle || !newSubject.cycle_id) {
            showToast('Remplissez tous les champs obligatoires', 'error');
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/api/matieres', newSubject);
            const nouvelleId = res.data?.matiere_id;

            // Rattachement aux classes cochées : la matière devient utilisable
            // pour les évaluations de ces classes, avec son coefficient.
            let rattachees = 0;
            if (nouvelleId && classesSelectionnees.length) {
                await Promise.all(classesSelectionnees.map(cid =>
                    api.post(`/api/matieres/classe/${cid}/matiere`, {
                        matiere_id: nouvelleId,
                        coefficient: newSubject.coefficient_defaut,
                        nb_heures_semaine: newSubject.nb_heures_semaine,
                    }).then(() => { rattachees += 1; }).catch(() => { /* déjà attribuée */ })
                ));
            }

            showToast(rattachees
                ? `${newSubject.libelle} créée et attribuée à ${rattachees} classe(s) !`
                : `${newSubject.libelle} créée !`);
            setNewSubject({ code: '', libelle: '', categorie: '', cycle_id: 0, coefficient_defaut: 2, nb_heures_semaine: 2, est_obligatoire: 'O' });
            setClassesSelectionnees([]);
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
                    showToast(`Matière ${name} supprimée !`);
                    await fetchAll();
                } catch (e: any) {
                    showToast(e.response?.data?.detail || 'Erreur lors de la suppression', 'error');
                }
            }
        );
    };

    // ─── Assign to all classes ──────────────────────────────────────

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

    // Regroupement : au Lycée par série (SM/SE/SS), ailleurs par cycle —
    // sinon Primaire et Collège se retrouvaient mélangés sous « Autres ».
    const groupedMatieres = filteredMatieres.reduce((acc, m) => {
        const cyc = cycles.find((c: any) => c.cycle_id === m.cycle_id);
        const groupe = cyc?.code === 'LYC'
            ? (m.categorie ? `Lycée — ${m.categorie}` : 'Lycée')
            : (cyc?.libelle || 'Autres');
        if (!acc[groupe]) acc[groupe] = [];
        acc[groupe].push(m);
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
                                                onChange={e => {
                                                    const id = Number(e.target.value);
                                                    const estLycee = cycles.find((c: any) => c.cycle_id === id)?.code === 'LYC';
                                                    // Série obligatoire au Lycée, aucune catégorie ailleurs :
                                                    // on repositionne une valeur cohérente avec le cycle choisi.
                                                    setNewSubject(p => ({
                                                        ...p,
                                                        cycle_id: id,
                                                        categorie: estLycee
                                                            ? (CATEGORIES_LYCEE.includes(p.categorie) ? p.categorie : 'SM')
                                                            : '',
                                                    }));
                                                }}>
                                                <option value={0}>— Choisir —</option>
                                                {cycles.map((c: any) => (
                                                    <option key={c.cycle_id} value={c.cycle_id}>{c.libelle}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className={styles.formRow}>
                                        {/* La série n'existe qu'au Lycée : au Primaire et au
                                            Collège, aucune catégorie n'est demandée. */}
                                        {cycleChoisiEstLycee && (
                                            <div className={styles.formGroup}>
                                                <label>Série *</label>
                                                <select className={styles.selectInput}
                                                    value={newSubject.categorie}
                                                    onChange={e => setNewSubject(p => ({ ...p, categorie: e.target.value }))}>
                                                    {CATEGORIES_LYCEE.map(c => (
                                                        <option key={c} value={c}>
                                                            {c === 'SM' ? 'SM — Sciences Mathématiques'
                                                                : c === 'SE' ? 'SE — Sciences Expérimentales'
                                                                    : 'SS — Sciences Sociales'}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
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

                                    {/* Répartition dans les classes, dès la création :
                                        sans ça la matière existe mais n'est utilisable
                                        dans aucune classe. */}
                                    {newSubject.cycle_id > 0 && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '8px' }}>
                                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                                                    Attribuer aux classes
                                                    <span style={{ fontWeight: 500, color: '#94a3b8' }}>
                                                        {' '}— {classesSelectionnees.length} / {classesDuCycle.length} sélectionnée(s)
                                                    </span>
                                                </label>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button type="button" onClick={() => setClassesSelectionnees(classesDuCycle.map((c: any) => c.classe_id))}
                                                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                                                        Toutes
                                                    </button>
                                                    <button type="button" onClick={() => setClassesSelectionnees([])}
                                                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                                                        Aucune
                                                    </button>
                                                </div>
                                            </div>
                                            {classesDuCycle.length === 0 ? (
                                                <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: 0 }}>
                                                    Aucune classe {cycleChoisiEstLycee && newSubject.categorie ? `de la série ${newSubject.categorie}` : 'pour ce cycle'}.
                                                </p>
                                            ) : (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '130px', overflowY: 'auto' }}>
                                                    {classesDuCycle.map((cl: any) => {
                                                        const coche = classesSelectionnees.includes(cl.classe_id);
                                                        return (
                                                            <button key={cl.classe_id} type="button"
                                                                onClick={() => setClassesSelectionnees(prev =>
                                                                    coche ? prev.filter(id => id !== cl.classe_id) : [...prev, cl.classe_id])}
                                                                style={{
                                                                    padding: '5px 11px', borderRadius: '999px', cursor: 'pointer',
                                                                    fontSize: '0.75rem', fontWeight: 600,
                                                                    border: `1px solid ${coche ? '#4f46e5' : '#e2e8f0'}`,
                                                                    background: coche ? '#eef2ff' : 'white',
                                                                    color: coche ? '#4338ca' : '#94a3b8',
                                                                }}>
                                                                {coche ? '✓ ' : ''}{cl.libelle}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

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
                                        {f === 'ALL' ? 'Tous' : f}
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
                                {Object.keys(groupedMatieres).sort((a, b) => {
                                    // Ordre scolaire (Primaire → Collège → Lycée SM/SE/SS)
                                    // plutôt qu'alphabétique.
                                    const rang = (g: string) =>
                                        g === 'Primaire' ? 0 : g === 'Collège' ? 1
                                            : g.startsWith('Lycée') ? 2 : 3;
                                    return rang(a) - rang(b) || a.localeCompare(b);
                                }).map(category => {
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
                                                                        onClick={() => ouvrirEditionMatiere(mat)}
                                                                        title="Modifier"
                                                                        style={{ color: '#2563eb' }}
                                                                    >
                                                                        <Pencil size={13} />
                                                                    </button>
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
                {editMatiere && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => !editSaving && setEditMatiere(null)}
                    >
                        <motion.div
                            initial={{ y: 28, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 18, opacity: 0, scale: 0.97 }}
                            style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '460px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Pencil size={16} /> Modifier la matière
                                </h2>
                                <button onClick={() => !editSaving && setEditMatiere(null)} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <span style={champLabel}>Nom de la matière</span>
                                    <input value={editForm.libelle} onChange={e => setEditForm(f => ({ ...f, libelle: e.target.value }))} style={champInput} placeholder="Ex : Mathématiques" />
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <span style={champLabel}>Code</span>
                                        <input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))} style={champInput} placeholder="Ex : MATH" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <span style={champLabel}>Coefficient</span>
                                        <input type="number" min={0.5} step={0.5} value={editForm.coefficient_defaut} onChange={e => setEditForm(f => ({ ...f, coefficient_defaut: Number(e.target.value) }))} style={champInput} />
                                    </label>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <span style={champLabel}>Heures / semaine</span>
                                        <input type="number" min={0} value={editForm.nb_heures_semaine} onChange={e => setEditForm(f => ({ ...f, nb_heures_semaine: Number(e.target.value) }))} style={champInput} />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <span style={champLabel}>Note sur (barème)</span>
                                        <input type="number" min={1} max={100} value={editForm.note_sur} onChange={e => setEditForm(f => ({ ...f, note_sur: Number(e.target.value) }))} style={champInput} />
                                    </label>
                                </div>
                            </div>
                            <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setEditMatiere(null)} disabled={editSaving} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                                <button onClick={enregistrerEditionMatiere} disabled={editSaving} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#4f46e5', color: 'white', fontSize: '13px', fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.6 : 1 }}>
                                    {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

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

const champLabel: CSSProperties = { fontSize: '12px', fontWeight: 700, color: '#475569' };
const champInput: CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none',
    color: '#0f172a', background: 'white', fontFamily: 'inherit',
};
