'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Hash, Award, BookOpen, ToggleRight, Save, CheckCircle,
    Loader2, TrendingUp, Eye, Pencil, Check, ClipboardList,
    Plus, Trash2, RotateCcw, Settings, Type as TypeIcon, Microscope, Info, BarChart3, GraduationCap, CheckCircle2, AlertTriangle, Zap, Trophy, Medal, MessageSquare, Users
} from 'lucide-react';
import SettingsLayout from '@/components/SettingsLayout';
import api from '@/lib/api';
import styles from './Notation.module.css';

// ─── Constantes cycles ─────────────────────────────────────────────────────
const CYCLES = [
    {
        key: 'primaire', label: 'Primaire', emoji: '',
        classes: '1ère → 6ème Année',
        cardClass: styles.cardPrimaire,
        tabClass: `${styles.mentionCycleTab} ${styles.mentionCycleTabPrimaire}`,
        filterClass: `${styles.filterBtn} ${styles.filterBtnPrimaire}`,
        pillClass: styles.pillPrimaire,
        color: '#f59e0b', defaultNoteSur: 10, defaultPassage: 5,
    },
    {
        key: 'college', label: 'Collège', emoji: '',
        classes: '7ème → 10ème Année',
        cardClass: styles.cardCollege,
        tabClass: `${styles.mentionCycleTab} ${styles.mentionCycleTabCollege}`,
        filterClass: `${styles.filterBtn} ${styles.filterBtnCollege}`,
        pillClass: styles.pillCollege,
        color: '#3b82f6', defaultNoteSur: 20, defaultPassage: 10,
    },
    {
        key: 'lycee', label: 'Lycée', emoji: '',
        classes: '11ème → Terminale',
        cardClass: styles.cardLycee,
        tabClass: `${styles.mentionCycleTab} ${styles.mentionCycleTabLycee}`,
        filterClass: `${styles.filterBtn} ${styles.filterBtnLycee}`,
        pillClass: styles.pillLycee,
        color: '#8b5cf6', defaultNoteSur: 20, defaultPassage: 10,
    },
];

const MENTION_DEFS = [
    { key: 'tb',  label: 'TRÈS BIEN',  color: '#10b981', bg: '#d1fae5', text: '#065f46', defaultVals: { primaire: 9, college: 16, lycee: 16 } },
    { key: 'b',   label: 'BIEN',       color: '#3b82f6', bg: '#dbeafe', text: '#1e40af', defaultVals: { primaire: 7, college: 14, lycee: 14 } },
    { key: 'ab',  label: 'ASSEZ BIEN', color: '#f59e0b', bg: '#fef3c7', text: '#92400e', defaultVals: { primaire: 6, college: 12, lycee: 12 } },
    { key: 'p',   label: 'PASSABLE',   color: '#f97316', bg: '#ffedd5', text: '#9a3412', defaultVals: { primaire: 5, college: 10, lycee: 10 } },
    { key: 'ins', label: 'INSUFFISANT',color: '#ef4444', bg: '#fee2e2', text: '#7f1d1d', defaultVals: { primaire: 0, college: 0, lycee: 0 }, readonly: true },
];

const TABS = [
    { id: 'bareme',      label: 'Barème & Passage',  Icon: Hash },
    { id: 'mentions',    label: 'Mentions',           Icon: Award },
    { id: 'evaluations', label: 'Évaluations & Poids',Icon: ClipboardList },
    { id: 'coefficients',label: 'Coefficients',       Icon: BookOpen },
    { id: 'affichage',   label: 'Affichage Bulletins',Icon: Eye },
];

// ─── Interfaces ────────────────────────────────────────────────────────────
interface ParametreSetting {
    cle: string;
    valeur: string;
    type_valeur: 'BOOLEAN' | 'NUMBER' | 'TEXT';
}

interface Matiere {
    matiere_id: number;
    code: string;
    libelle: string;
    categorie: string;
    coefficient_defaut?: number;
    coefficient?: number;
    note_sur: number;
    cycle_id: number;
}

interface MatiereEdit {
    coefficient_defaut?: number;
    coefficient?: number;
    note_sur?: number;
}

interface Cycle {
    cycle_id: number;
    code: string;
    libelle: string;
    ordre: number;
}

interface SerieData {
    classes_count: number;
    matieres: Matiere[];
}

interface TypeEval {
    type_eval_id: number;
    code: string;
    libelle: string;
    poids_pourcentage: number;
    statut: string;
}

interface MentionDef {
    key: string;
    label: string;
    color: string;
    bg: string;
    text: string;
    defaultVals: { primaire: number; college: number; lycee: number; };
    readonly?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function parseSettings(list: ParametreSetting[]) {
    const out: Record<string, string | number | boolean> = {};
    for (const p of list) {
        const k = p.cle.replace('notation.', '');
        out[k] = p.type_valeur === 'BOOLEAN' ? p.valeur === 'true'
                : p.type_valeur === 'NUMBER'  ? parseFloat(p.valeur)
                : p.valeur;
    }
    return out;
}

function buildParam(key: string, value: string | number | boolean) {
    const type = typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? 'NUMBER' : 'TEXT';
    return { etablissement_id: 1, categorie: 'NOTATION', cle: `notation.${key}`, valeur: String(value), type_valeur: type as 'BOOLEAN' | 'NUMBER' | 'TEXT' };
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function NotationPage() {
    const [activeTab, setActiveTab] = useState('bareme');
    const [baremeCycle, setBaremeCycle] = useState('college');
    const [loading, setLoading]     = useState(true);
    const [saving, setSaving]       = useState(false);
    const [success, setSuccess]     = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // ── Barème par cycle ──
    const [baremes, setBaremes] = useState<Record<string,number>>({
        primaire: 10, college: 20, lycee: 20,
    });
    const [passages, setPassages] = useState<Record<string,number>>({
        primaire: 5, college: 10, lycee: 10,
    });
    const [rangMode, setRangMode] = useState('classe');

    // ── Mentions par cycle ──
    const [mentionCycle, setMentionCycle] = useState('college');
    const [mentions, setMentions] = useState<Record<string, Record<string,number>>>({
        primaire: { tb: 9, b: 7, ab: 6, p: 5 },
        college:  { tb: 16, b: 14, ab: 12, p: 10 },
        lycee:    { tb: 16, b: 14, ab: 12, p: 10 },
    });

    // ── Coefficients matières ──
    const [matieres, setMatieres] = useState<Matiere[]>([]);
    const [matieresEdited, setMatieresEdited] = useState<Record<number, MatiereEdit>>({});
    const [coefFilter, setCoefFilter] = useState('all');
    const [cyclesList, setCyclesList] = useState<Cycle[]>([]);
    // Lycée per-series
    const [lyceeSerie, setLyceeSerie] = useState<'all'|'SM'|'SE'|'SS'>('all');
    const [seriesData, setSeriesData] = useState<Record<string, SerieData>>({});
    const [seriesEdited, setSeriesEdited] = useState<Record<string, Record<number, MatiereEdit>>>({}); // serie -> matiere_id -> edits

    // ── Affichage ──
    const [display, setDisplay] = useState({
        rang: true, mention: true, appreciation: true,
        effectif: true, stats_matiere: true,
    });

    // ── Système de lettres per-cycle ──
    const [lettresActif, setLettresActif] = useState<Record<string, boolean>>({
        primaire: false, college: false, lycee: false
    });
    const [lettresTable, setLettresTable] = useState<Record<string, { lettre: string; label: string; min: number; max: number; }[]>>({
        primaire: [
            { lettre: 'A+', label: 'Excellent',   min: 9, max: 10 },
            { lettre: 'A',  label: 'Très Bien',   min: 8, max: 8.99 },
            { lettre: 'B',  label: 'Bien',         min: 7, max: 7.99 },
            { lettre: 'C',  label: 'Assez Bien',   min: 6, max: 6.99 },
            { lettre: 'D',  label: 'Passable',     min: 5, max: 5.99 },
            { lettre: 'F',  label: 'Insuffisant',  min: 0, max: 4.99 },
        ],
        college: [
            { lettre: 'A+', label: 'Excellent',   min: 18, max: 20 },
            { lettre: 'A',  label: 'Très Bien',   min: 16, max: 17.99 },
            { lettre: 'B',  label: 'Bien',         min: 14, max: 15.99 },
            { lettre: 'C',  label: 'Assez Bien',   min: 12, max: 13.99 },
            { lettre: 'D',  label: 'Passable',     min: 10, max: 11.99 },
            { lettre: 'F',  label: 'Insuffisant',  min: 0,  max: 9.99 },
        ],
        lycee: [
            { lettre: 'A+', label: 'Excellent',   min: 18, max: 20 },
            { lettre: 'A',  label: 'Très Bien',   min: 16, max: 17.99 },
            { lettre: 'B',  label: 'Bien',         min: 14, max: 15.99 },
            { lettre: 'C',  label: 'Assez Bien',   min: 12, max: 13.99 },
            { lettre: 'D',  label: 'Passable',     min: 10, max: 11.99 },
            { lettre: 'F',  label: 'Insuffisant',  min: 0,  max: 9.99 },
        ],
    });

    // ── Redoublement automatique per-cycle ──
    const [redoublementActif, setRedoublementActif] = useState<Record<string, boolean>>({
        primaire: false, college: false, lycee: false
    });
    const [seuilRedoublement, setSeuilRedoublement] = useState<Record<string, number>>({
        primaire: 5, college: 10, lycee: 10
    });

    // ── Types d'évaluation ──
    const [typesEval, setTypesEval] = useState<TypeEval[]>([]);
    const [newTypeCode, setNewTypeCode] = useState('');
    const [newTypeLibelle, setNewTypeLibelle] = useState('');
    const [newTypePoids, setNewTypePoids] = useState(0);
    const [showNewTypeForm, setShowNewTypeForm] = useState(false);
    const [editingTypeId, setEditingTypeId] = useState<number | null>(null);

    // ─── Load ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const loadAll = async () => {
            try {
                const [settingsRes, matieresRes, cyclesRes, typesRes] = await Promise.all([
                    api.get('/api/parametrage/settings?etablissement_id=1&categorie=NOTATION').catch(() => ({ data: [] })),
                    api.get('/api/parametrage/matieres').catch(() => ({ data: [] })),
                    api.get('/api/parametrage/cycles').catch(() => ({ data: [] })),
                    api.get('/api/evaluations/types').catch(() => ({ data: [] })),
                ]);

                // Parse settings
                const s = parseSettings(settingsRes.data || []);
                if (Object.keys(s).length > 0) {
                    setBaremes({
                        primaire: (s['bareme.primaire'] as number) ?? 10,
                        college:  (s['bareme.college'] as number)  ?? 20,
                        lycee:    (s['bareme.lycee'] as number)    ?? 20,
                    });
                    setPassages({
                        primaire: (s['passage.primaire'] as number) ?? 5,
                        college:  (s['passage.college'] as number)  ?? 10,
                        lycee:    (s['passage.lycee'] as number)    ?? 10,
                    });
                    setRangMode((s['rang_mode'] as string) ?? 'classe');
                    setMentions({
                        primaire: { 
                            tb: (s['mention.primaire.tb'] as number) ?? 9,  
                            b:  (s['mention.primaire.b'] as number) ?? 7,  
                            ab: (s['mention.primaire.ab'] as number) ?? 6,  
                            p:  (s['mention.primaire.p'] as number) ?? 5  
                        },
                        college:  { 
                            tb: (s['mention.college.tb'] as number) ?? 16,  
                            b:  (s['mention.college.b'] as number) ?? 14,  
                            ab: (s['mention.college.ab'] as number) ?? 12,  
                            p:  (s['mention.college.p'] as number) ?? 10 
                        },
                        lycee:    { 
                            tb: (s['mention.lycee.tb'] as number) ?? 16,    
                            b:  (s['mention.lycee.b'] as number) ?? 14,    
                            ab: (s['mention.lycee.ab'] as number) ?? 12,    
                            p:  (s['mention.lycee.p'] as number) ?? 10   
                        },
                    });
                    setDisplay({
                        rang:          (s['display.rang'] as boolean)          ?? true,
                        mention:       (s['display.mention'] as boolean)       ?? true,
                        appreciation:  (s['display.appreciation'] as boolean)  ?? true,
                        effectif:      (s['display.effectif'] as boolean)      ?? true,
                        stats_matiere: (s['display.stats_matiere'] as boolean) ?? true,
                    });
                    const laGlobal = (s['lettres_actif'] as boolean) ?? false;
                    setLettresActif({
                        primaire: (s['lettres_actif.primaire'] as boolean) ?? laGlobal,
                        college:  (s['lettres_actif.college'] as boolean)  ?? laGlobal,
                        lycee:    (s['lettres_actif.lycee'] as boolean)    ?? laGlobal,
                    });
                    
                    const raGlobal = (s['redoublement_actif'] as boolean) ?? false;
                    setRedoublementActif({
                        primaire: (s['redoublement_actif.primaire'] as boolean) ?? raGlobal,
                        college:  (s['redoublement_actif.college'] as boolean)  ?? raGlobal,
                        lycee:    (s['redoublement_actif.lycee'] as boolean)    ?? raGlobal,
                    });
                    
                    const srGlobal = (s['seuil_redoublement'] as number) ?? 10;
                    setSeuilRedoublement({
                        primaire: (s['seuil_redoublement.primaire'] as number) ?? (srGlobal === 10 ? 5 : srGlobal / 2),
                        college:  (s['seuil_redoublement.college'] as number)  ?? srGlobal,
                        lycee:    (s['seuil_redoublement.lycee'] as number)    ?? srGlobal,
                    });

                    if (s['lettres_table.primaire']) {
                        try { setLettresTable(prev => ({ ...prev, primaire: JSON.parse(s['lettres_table.primaire'] as string) })); } catch(e) {}
                    } else if (s['lettres_table']) {
                        try {
                            const parsed = JSON.parse(s['lettres_table'] as string);
                            const primScaled = parsed.map((x: any) => ({ ...x, min: x.min / 2, max: x.max / 2 }));
                            setLettresTable(prev => ({ ...prev, primaire: primScaled }));
                        } catch(e) {}
                    }
                    
                    if (s['lettres_table.college']) {
                        try { setLettresTable(prev => ({ ...prev, college: JSON.parse(s['lettres_table.college'] as string) })); } catch(e) {}
                    } else if (s['lettres_table']) {
                        try { setLettresTable(prev => ({ ...prev, college: JSON.parse(s['lettres_table'] as string) })); } catch(e) {}
                    }
                    
                    if (s['lettres_table.lycee']) {
                        try { setLettresTable(prev => ({ ...prev, lycee: JSON.parse(s['lettres_table.lycee'] as string) })); } catch(e) {}
                    } else if (s['lettres_table']) {
                        try { setLettresTable(prev => ({ ...prev, lycee: JSON.parse(s['lettres_table'] as string) })); } catch(e) {}
                    }
                }

                // Cycles List
                if (cyclesRes.data) setCyclesList(cyclesRes.data);

                // Matières
                if (matieresRes.data) setMatieres(matieresRes.data);
                if (typesRes.data) setTypesEval(typesRes.data);

                // Lycée series coefficients
                try {
                    const seriesRes = await api.get('/api/classes/lycee-series-coefficients').catch(() => ({ data: {} }));
                    if (seriesRes.data) setSeriesData(seriesRes.data);
                } catch (e) { /* ignore if no lycée classes yet */ }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        loadAll();
    }, []);

    const markChanged = () => setHasChanges(true);

    // ─── Helpers setters ──────────────────────────────────────────────────
    const setBareme  = (cycle: string, v: number) => { setBaremes(p => ({...p,[cycle]:v}));  markChanged(); };
    const setPassage = (cycle: string, v: number) => { setPassages(p => ({...p,[cycle]:v})); markChanged(); };
    const setMention = (cycle: string, key: string, v: number) => {
        setMentions(p => ({ ...p, [cycle]: { ...p[cycle], [key]: v } }));
        markChanged();
    };
    const setDisplayFlag = (k: string, v: boolean) => { setDisplay(p => ({...p,[k]:v})); markChanged(); };
    const editCoef = (id: number, field: keyof MatiereEdit, val: number) => {
        setMatieresEdited(p => ({ ...p, [id]: { ...(p[id]||{}), [field]: val } }));
        markChanged();
    };
    const editSerieCoef = (serie: string, matiereId: number, field: keyof MatiereEdit, val: number) => {
        setSeriesEdited(p => ({ ...p, [serie]: { ...(p[serie]||{}), [matiereId]: { ...(p[serie]?.[matiereId]||{}), [field]: val } } }));
        markChanged();
    };

    // ─── Get mention preview ─────────────────────────────────────────────
    const getMentionPreview = (note: number, cycle: string) => {
        const m = mentions[cycle] || mentions['college'];
        const noteSur = baremes[cycle] || 20;
        if (note >= m.tb)  return { label: 'TRÈS BIEN',  bg: '#d1fae5', text: '#065f46' };
        if (note >= m.b)   return { label: 'BIEN',       bg: '#dbeafe', text: '#1e40af' };
        if (note >= m.ab)  return { label: 'ASSEZ BIEN', bg: '#fef3c7', text: '#92400e' };
        if (note >= m.p)   return { label: 'PASSABLE',   bg: '#ffedd5', text: '#9a3412' };
        return { label: 'INSUFFISANT', bg: '#fee2e2', text: '#7f1d1d' };
    };

    // ─── Save all ─────────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Settings (barème, passages, mentions, affichage)
            const params = [
                buildParam('bareme.primaire', baremes.primaire),
                buildParam('bareme.college',  baremes.college),
                buildParam('bareme.lycee',    baremes.lycee),
                buildParam('passage.primaire', passages.primaire),
                buildParam('passage.college',  passages.college),
                buildParam('passage.lycee',    passages.lycee),
                buildParam('rang_mode', rangMode),
                ...(['primaire','college','lycee'] as const).flatMap(cycle =>
                    ['tb','b','ab','p'].map(mk => buildParam(`mention.${cycle}.${mk}`, mentions[cycle][mk]))
                ),
                buildParam('display.rang',          display.rang),
                buildParam('display.mention',       display.mention),
                buildParam('display.appreciation',  display.appreciation),
                buildParam('display.effectif',      display.effectif),
                buildParam('display.stats_matiere', display.stats_matiere),
                ...(['primaire','college','lycee'] as const).flatMap(cycle => [
                    buildParam(`lettres_actif.${cycle}`, lettresActif[cycle]),
                    buildParam(`lettres_table.${cycle}`, JSON.stringify(lettresTable[cycle])),
                    buildParam(`redoublement_actif.${cycle}`, redoublementActif[cycle]),
                    buildParam(`seuil_redoublement.${cycle}`, seuilRedoublement[cycle]),
                ]),
            ];
            await api.put('/api/parametrage/settings?etablissement_id=1', params);

            // 2. Coefficients matières (si modifiés)
            const batch = Object.entries(matieresEdited).map(([id, vals]) => ({
                matiere_id: parseInt(id), ...vals,
            }));
            if (batch.length > 0) {
                await api.put('/api/parametrage/matieres-batch', batch);
                setMatieres(prev => prev.map(m => {
                    const edit = matieresEdited[m.matiere_id];
                    return edit ? { ...m, ...edit } : m;
                }));
                setMatieresEdited({});
            }

            // 3. Lycée per-series coefficients
            for (const [serie, matiereEdits] of Object.entries(seriesEdited)) {
                const serieUpdates = Object.entries(matiereEdits).map(([mid, vals]: [string, any]) => ({
                    matiere_id: parseInt(mid),
                    coefficient: vals.coefficient,
                    note_sur: vals.note_sur,
                }));
                if (serieUpdates.length > 0) {
                    await api.put(`/api/classes/lycee-series-coefficients/${serie}`, serieUpdates);
                }
            }
            setSeriesEdited({});

            // 4. Refetch data to synchronize state
            try {
                const [matieresRes, seriesRes] = await Promise.all([
                    api.get('/api/parametrage/matieres').catch(() => ({ data: [] })),
                    api.get('/api/classes/lycee-series-coefficients').catch(() => ({ data: {} })),
                ]);
                if (matieresRes.data) setMatieres(matieresRes.data);
                if (seriesRes.data) setSeriesData(seriesRes.data);
            } catch (e) { console.error("Error refreshing data:", e); }

            setHasChanges(false);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3500);
        } catch(e) { console.error(e); }
        setSaving(false);
    };

    const handleCancel = () => {
        setMatieresEdited({});
        setSeriesEdited({});
        setHasChanges(false);
        // Reload
        window.location.reload();
    };


    // ─── Filtered matieres ─────────────────────────────────────────────────
    const getCycleKey = (cycleId: number) => {
        const cyc = cyclesList.find(c => c.cycle_id === cycleId);
        if (!cyc) return '';
        const code = cyc.code?.toUpperCase();
        if (code === 'PRM' || cyc.libelle?.toLowerCase().includes('prim')) return 'primaire';
        if (code === 'CLG' || cyc.libelle?.toLowerCase().includes('coll')) return 'college';
        if (code === 'LYC' || cyc.libelle?.toLowerCase().includes('lyc')) return 'lycee';
        return '';
    };

    const filteredMatieres = matieres.filter(m => {
        if (coefFilter === 'all') return true;
        return getCycleKey(m.cycle_id) === coefFilter;
    });

    if (loading) {
        return (
            <SettingsLayout title="Système de Notation" subtitle="Chargement...">
                <div className={styles.loaderWrap}>
                    <Loader2 className={styles.spinner} size={32} style={{ color: 'var(--brand-primary)' }} />
                    <span>Chargement des paramètres de notation...</span>
                </div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout
            title="Système de Notation"
            subtitle="Configurez le barème par cycle, les mentions, les coefficients et l'affichage des bulletins."
        >
            <div className={styles.page}>

                {/* ── TABS ── */}
                <div className={styles.tabsNav}>
                    {TABS.map(({ id, label, Icon }) => (
                        <button
                            key={id}
                            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(id)}
                        >
                            <Icon size={15} className={styles.tabIcon} />
                            {label}
                        </button>
                    ))}
                </div>

                {/* ══════════════════════════════════════
                    TAB 1 : BARÈME & PASSAGE
                ══════════════════════════════════════ */}
                {activeTab === 'bareme' && (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Hash size={20} className={styles.sectionIcon} />
                                <h3>Barème & Note de Passage par Cycle</h3>
                                <span className={styles.sectionSubtitle}>Chaque cycle peut avoir son propre barème et sa note de passage</span>
                            </div>
                            <div className={styles.cyclesGrid}>
                                {CYCLES.map(cycle => {
                                    const isSelected = baremeCycle === cycle.key;
                                    return (
                                        <div key={cycle.key} 
                                            className={`${styles.cycleCard} ${cycle.cardClass}`}
                                            onClick={() => setBaremeCycle(cycle.key)}
                                            style={{
                                                cursor: 'pointer',
                                                borderWidth: '2px',
                                                borderColor: isSelected ? cycle.color : 'transparent',
                                                boxShadow: isSelected ? `0 0 0 4px ${cycle.color}22` : undefined,
                                                transform: isSelected ? 'scale(1.02)' : undefined,
                                                transition: 'all 0.25s'
                                            }}
                                        >
                                            <div className={styles.cycleHeader}>
                                                <span className={styles.cycleEmoji}>{cycle.emoji}</span>
                                                <div className={styles.cycleHeaderText}>
                                                    <h3>{cycle.label}</h3>
                                                    <p>{cycle.classes}</p>
                                                </div>
                                            </div>
                                            <div className={styles.cycleBody}>
                                                <div className={styles.cycleFields}>
                                                    <div className={styles.fieldRow}>
                                                        <label>Note maximale</label>
                                                        <select
                                                            className={styles.selectFancy}
                                                            value={baremes[cycle.key]}
                                                            onChange={e => setBareme(cycle.key, Number(e.target.value))}
                                                        >
                                                            <option value={10}>Sur 10</option>
                                                            <option value={20}>Sur 20</option>
                                                            <option value={100}>Sur 100</option>
                                                        </select>
                                                        <span className={styles.infoHint}>Barème par défaut pour ce cycle</span>
                                                    </div>
                                                    <hr className={styles.divider} />
                                                    <div className={styles.fieldRow}>
                                                        <label>Note de passage</label>
                                                        <input
                                                            type="number" className={styles.inputFancy}
                                                            min={0} max={baremes[cycle.key]} step={0.5}
                                                            value={passages[cycle.key]}
                                                            onChange={e => setPassage(cycle.key, Number(e.target.value))}
                                                        />
                                                        <span className={styles.infoHint}>Moyenne minimale pour valider /{baremes[cycle.key]}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Calcul du rang */}
                            <div style={{ marginTop: '2rem', padding: '1.25rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                    <TrendingUp size={18} style={{ color: 'var(--brand-primary)' }} />
                                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Calcul du Classement (Rang)</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {[
                                        { value: 'classe', label: 'Par classe', desc: "L'élève est classé parmi tous les élèves de sa classe uniquement." },
                                        { value: 'niveau', label: 'Par niveau', desc: "L'élève est classé parmi tous les élèves du même niveau (ex: toutes les 7ème)." },
                                    ].map(opt => (
                                        <label key={opt.value} style={{
                                            display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                                            padding: '1rem', borderRadius: '10px', cursor: 'pointer',
                                            border: `2px solid ${rangMode === opt.value ? 'var(--brand-primary)' : '#e2e8f0'}`,
                                            background: rangMode === opt.value ? 'var(--brand-primary-light)' : 'white',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input type="radio" name="rangMode" value={opt.value}
                                                checked={rangMode === opt.value}
                                                onChange={() => { setRangMode(opt.value); markChanged(); }}
                                                style={{ marginTop: '3px', accentColor: 'var(--brand-primary)' }}
                                            />
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{opt.label}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{opt.desc}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Cycle details subtitle */}
                            <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--brand-primary-light, #eff6ff)', borderRadius: '10px', border: '1px solid var(--brand-primary, #3b82f6)' }}>
                                <span style={{ fontSize: '1.2rem', display: 'inline-flex', alignItems: 'center' }}><Settings size={18} /></span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-primary, #2563eb)' }}>
                                    Configuration avancée pour le cycle : {CYCLES.find(c => c.key === baremeCycle)?.label}
                                </span>
                            </div>

                            {/* Système de lettres */}
                            <div style={{ marginTop: '1rem', padding: '1.25rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.3rem', display: 'inline-flex', alignItems: 'center' }}><TypeIcon size={20} /></span>
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Système de Notation par Lettres ({CYCLES.find(c => c.key === baremeCycle)?.label})</span>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>Affiche A+/A/B/C/D/F en plus de la note numérique</div>
                                        </div>
                                    </div>
                                    <label className={styles.toggle}>
                                        <input type="checkbox" 
                                            checked={lettresActif[baremeCycle] ?? false} 
                                            onChange={e => { 
                                                setLettresActif(prev => ({ ...prev, [baremeCycle]: e.target.checked })); 
                                                markChanged(); 
                                            }} 
                                        />
                                        <span className={styles.slider}></span>
                                    </label>
                                </div>
                                {(lettresActif[baremeCycle] ?? false) && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px', gap: '0.5rem', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
                                            {['Lettre', 'Mention', 'Min', 'Max'].map(h => (
                                                <span key={h} style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                                            ))}
                                        </div>
                                        {(lettresTable[baremeCycle] || []).map((row, i) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px', gap: '0.5rem', padding: '0.4rem 0.5rem', borderRadius: '8px', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                                                <span style={{ fontWeight: 800, color: 'var(--brand-primary)', fontSize: '0.95rem' }}>{row.lettre}</span>
                                                <span style={{ color: '#475569', fontSize: '0.88rem' }}>{row.label}</span>
                                                <input type="number" value={row.min} min={0} max={baremes[baremeCycle] || 20} step={0.5}
                                                    style={{ width: '70px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', textAlign: 'center' }}
                                                    onChange={e => { 
                                                        const v = [...(lettresTable[baremeCycle] || [])]; 
                                                        v[i] = {...v[i], min: Number(e.target.value)}; 
                                                        setLettresTable(prev => ({ ...prev, [baremeCycle]: v })); 
                                                        markChanged(); 
                                                    }}
                                                />
                                                <input type="number" value={row.max} min={0} max={baremes[baremeCycle] || 20} step={0.01}
                                                    style={{ width: '70px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', textAlign: 'center' }}
                                                    onChange={e => { 
                                                        const v = [...(lettresTable[baremeCycle] || [])]; 
                                                        v[i] = {...v[i], max: Number(e.target.value)}; 
                                                        setLettresTable(prev => ({ ...prev, [baremeCycle]: v })); 
                                                        markChanged(); 
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Redoublement automatique */}
                            <div style={{ marginTop: '2rem', padding: '1.25rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (lettresActif[baremeCycle] ?? false) ? '0' : undefined }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <RotateCcw size={18} style={{ color: '#ef4444' }} />
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Redoublement Automatique ({CYCLES.find(c => c.key === baremeCycle)?.label})</span>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>Marque automatiquement les élèves en redoublement si leur moyenne est inférieure au seuil</div>
                                        </div>
                                    </div>
                                    <label className={styles.toggle}>
                                        <input type="checkbox" 
                                            checked={redoublementActif[baremeCycle] ?? false} 
                                            onChange={e => { 
                                                setRedoublementActif(prev => ({ ...prev, [baremeCycle]: e.target.checked })); 
                                                markChanged(); 
                                            }} 
                                        />
                                        <span className={styles.slider}></span>
                                    </label>
                                </div>
                                {(redoublementActif[baremeCycle] ?? false) && (
                                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <label style={{ fontSize: '0.88rem', color: '#475569', fontWeight: 600 }}>Seuil de redoublement :</label>
                                        <input type="number" value={seuilRedoublement[baremeCycle] ?? 10} min={0} max={baremes[baremeCycle] || 20} step={0.5}
                                            style={{ width: '80px', padding: '0.4rem 0.6rem', borderRadius: '8px', border: '2px solid var(--brand-primary, #3b82f6)', fontSize: '0.95rem', fontWeight: 700, textAlign: 'center' }}
                                            onChange={e => { 
                                                const val = Number(e.target.value);
                                                setSeuilRedoublement(prev => ({ ...prev, [baremeCycle]: val })); 
                                                markChanged(); 
                                            }}
                                        />
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>/ {baremes[baremeCycle] || 20} — Les élèves en dessous de ce seuil seront automatiquement marqués &quot;REDOUBLE&quot;</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB 2 : MENTIONS PAR CYCLE
                ══════════════════════════════════════ */}
                {activeTab === 'mentions' && (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Award size={20} className={styles.sectionIcon} />
                                <h3>Seuils des Mentions par Cycle</h3>
                                <span className={styles.sectionSubtitle}>Chaque cycle peut avoir ses propres seuils de mention</span>
                            </div>

                            {/* Cycle selector */}
                            <div className={styles.mentionsCyclesTabs}>
                                {CYCLES.map(cycle => (
                                    <button key={cycle.key}
                                        className={`${styles.mentionCycleTab} ${styles[`mentionCycleTab${cycle.label.replace('è','e').replace('é','e')}`]} ${mentionCycle === cycle.key ? styles.mentionCycleTabActive : ''}`}
                                        onClick={() => setMentionCycle(cycle.key)}
                                        style={mentionCycle === cycle.key ? { background: `linear-gradient(135deg, ${cycle.color}, ${cycle.color}bb)`, color: 'white', borderColor: 'transparent' } : {}}
                                    >
                                        {cycle.emoji} {cycle.label}
                                    </button>
                                ))}
                            </div>

                            <div className={styles.mentionsLayout}>
                                {/* Left: mention rows */}
                                <div>
                                    {/* Header */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '16px 140px 1fr auto', gap: '1rem', padding: '0 1rem', marginBottom: '0.5rem' }}>
                                        {['','Mention','Seuil minimal (≥)','Plage'].map((h,i) => (
                                            <span key={i} style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                                        ))}
                                    </div>
                                    <div className={styles.mentionsList}>
                                        {(MENTION_DEFS as MentionDef[]).map((md, i) => {
                                            const isReadonly = md.readonly;
                                            const val = isReadonly ? 0 : (mentions[mentionCycle]?.[md.key] ?? md.defaultVals[mentionCycle as keyof typeof md.defaultVals]);
                                            const noteSur = baremes[mentionCycle] || 20;
                                            const nextDef = MENTION_DEFS[i + 1] as MentionDef | undefined;
                                            const nextVal = nextDef?.readonly ? 0 : (nextDef ? (mentions[mentionCycle]?.[nextDef.key] ?? nextDef.defaultVals[mentionCycle as keyof typeof nextDef.defaultVals]) : 0);
                                            const prevDef = MENTION_DEFS[i - 1] as MentionDef | undefined;
                                            const maxVal = i === 0 ? noteSur : (prevDef ? (mentions[mentionCycle]?.[prevDef.key] ?? prevDef.defaultVals[mentionCycle as keyof typeof prevDef.defaultVals]) : noteSur);

                                            return (
                                                <div key={md.key} className={styles.mentionRow} style={isReadonly ? { opacity: 0.55 } : {}}>
                                                    <span className={styles.mentionDot} style={{ background: md.color }} />
                                                    <span className={styles.mentionLabel} style={{ color: md.color }}>{md.label}</span>
                                                    <div className={styles.mentionSeuil}>
                                                        <span>≥</span>
                                                        <input
                                                            type="number"
                                                            className={styles.mentionInput}
                                                            value={val}
                                                            disabled={isReadonly}
                                                            min={0} max={noteSur} step={0.5}
                                                            onChange={e => setMention(mentionCycle, md.key, Number(e.target.value))}
                                                        />
                                                        <span>/{noteSur}</span>
                                                    </div>
                                                    <span className={styles.mentionRange}>
                                                        {val} → {isReadonly ? (nextVal - 0.5 > 0 ? nextVal - 0.5 : noteSur) : maxVal}/{noteSur}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Right: live preview */}
                                <div className={styles.previewCard}>
                                    <div className={styles.previewTitle} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={14} /> Aperçu en direct — {CYCLES.find(c=>c.key===mentionCycle)?.label}</div>
                                    {Array.from({ length: 8 }, (_, i) => {
                                        const noteSur = baremes[mentionCycle] || 20;
                                        const note = Math.round((noteSur / 7) * (7 - i) * 10) / 10;
                                        const m = getMentionPreview(note, mentionCycle);
                                        return (
                                            <div key={note} className={styles.previewItem}>
                                                <div>
                                                    <span className={styles.previewNote}>{note}</span>
                                                    <span className={styles.previewSur}>/{noteSur}</span>
                                                </div>
                                                <span className={styles.previewBadge} style={{ background: m.bg, color: m.text }}>
                                                    {m.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB 3 : COEFFICIENTS MATIÈRES
                ══════════════════════════════════════ */}
                {activeTab === 'coefficients' && (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <BookOpen size={20} className={styles.sectionIcon} />
                                <h3>Coefficients & Barèmes par Matière</h3>
                                <span className={styles.sectionSubtitle}>
                                    {(Object.keys(matieresEdited).length + Object.values(seriesEdited).reduce((a,s) => a + Object.keys(s).length, 0)) > 0
                                        ? `${Object.keys(matieresEdited).length + Object.values(seriesEdited).reduce((a,s) => a + Object.keys(s).length, 0)} modification(s) en attente`
                                        : 'Aucune modification'}
                                </span>
                            </div>

                            {/* Cycle filter */}
                            <div className={styles.coefCycleFilter}>
                                {[
                                    { key: 'all', label: 'Tous les cycles', class: styles.filterBtnAll },
                                    ...CYCLES.map(c => ({ key: c.key, label: `${c.emoji} ${c.label}`, class: styles[`filterBtn${c.label.charAt(0).toUpperCase()}${c.label.slice(1)}`] })),
                                ].map(f => (
                                    <button key={f.key}
                                        className={`${styles.filterBtn} ${coefFilter === f.key ? styles.filterBtnActive : ''}`}
                                        style={coefFilter === f.key ? (
                                            f.key === 'all' ? { background: 'linear-gradient(135deg,#1e293b,#334155)', color: 'white', borderColor: 'transparent' } :
                                            f.key === 'primaire' ? { background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', color: 'white', borderColor: 'transparent' } :
                                            f.key === 'college'  ? { background: 'linear-gradient(135deg,#3b82f6,#60a5fa)', color: 'white', borderColor: 'transparent' } :
                                            { background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', color: 'white', borderColor: 'transparent' }
                                        ) : {}}
                                        onClick={() => { setCoefFilter(f.key); if (f.key !== 'lycee') setLyceeSerie('all'); }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {/* ── Lycée Series Sub-Filter ── */}
                            {coefFilter === 'lycee' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    style={{ marginTop: '1rem', padding: '1rem', background: 'linear-gradient(135deg,#faf5ff,#ede9fe)', borderRadius: '14px', border: '1px solid #c4b5fd' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.85rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            <GraduationCap size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Configurer par série :
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {[
                                            { key: 'all' as const, label: 'Barème général', desc: 'Valeurs par défaut partagées', color: '#8b5cf6', bg: '#7c3aed' },
                                            { key: 'SM' as const, label: 'Sciences Mathématiques', desc: `${seriesData.SM?.classes_count ?? 0} classe(s)`, color: '#3b82f6', bg: '#2563eb' },
                                            { key: 'SE' as const, label: 'Sciences Expérimentales', desc: `${seriesData.SE?.classes_count ?? 0} classe(s)`, color: '#10b981', bg: '#059669' },
                                            { key: 'SS' as const, label: 'Sciences Sociales', desc: `${seriesData.SS?.classes_count ?? 0} classe(s)`, color: '#f97316', bg: '#ea580c' },
                                        ].map(s => (
                                            <button key={s.key}
                                                onClick={() => setLyceeSerie(s.key)}
                                                style={{
                                                    padding: '0.6rem 1.2rem',
                                                    borderRadius: '12px',
                                                    border: `2px solid ${lyceeSerie === s.key ? s.color : '#ddd6fe'}`,
                                                    background: lyceeSerie === s.key ? `linear-gradient(135deg, ${s.color}, ${s.bg})` : 'white',
                                                    color: lyceeSerie === s.key ? 'white' : s.color,
                                                    fontWeight: 700, fontSize: '0.82rem',
                                                    cursor: 'pointer', transition: 'all 0.18s',
                                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                                                    boxShadow: lyceeSerie === s.key ? `0 4px 14px ${s.color}40` : 'none',
                                                }}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{s.key === 'all' ? <Settings size={14} /> : <Microscope size={14} />} {s.label}</span>
                                                <span style={{ fontSize: '0.7rem', opacity: 0.75, fontWeight: 500 }}>{s.desc}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {lyceeSerie !== 'all' && seriesData[lyceeSerie] && (
                                        <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.6)', borderRadius: '10px', fontSize: '0.78rem', color: '#5b21b6' }}>
                                            <Info size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Les coefficients ci-dessous s'appliquent aux classes <strong>
                                                {lyceeSerie === 'SM' ? '11SM, 12SM, Terminale SM' : lyceeSerie === 'SE' ? '11SE, 12SE, Terminale SE' : '11SS, 12SS, Terminale SS'}
                                            </strong> uniquement. Ils remplacent les valeurs par défaut pour cette série.
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* Table */}
                            <div className={styles.coefTableWrap}>

                                {/* ═══════════════════════════════════════════════════════════
                                    VUE COMPARATIVE LYCÉE — Barème général (toutes séries)
                                    Affiche SM / SE / SS côte à côte
                                 ═══════════════════════════════════════════════════════════ */}
                                {coefFilter === 'lycee' && lyceeSerie === 'all' ? (
                                    <div style={{ overflowX: 'auto' }}>
                                        {/* Info Banner */}
                                        <div style={{
                                            background: 'linear-gradient(135deg, #faf5ff, #ede9fe)',
                                            border: '1px solid #c4b5fd', borderRadius: '12px',
                                            padding: '0.85rem 1.2rem', marginBottom: '1rem',
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            fontSize: '0.82rem', color: '#5b21b6'
                                        }}>
                                            <span style={{ fontSize: '1.1rem', display: 'inline-flex', alignItems: 'center' }}><BarChart3 size={20} /></span>
                                            <div>
                                                <strong>Vue comparative des 3 séries du Lycée</strong><br/>
                                                <span style={{ opacity: 0.8 }}>Cliquez sur une série (SM / SE / SS) ci-dessus pour modifier ses coefficients</span>
                                            </div>
                                        </div>

                                        {/* Comparison table header */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                            gap: '1px',
                                            background: '#e2e8f0',
                                            borderRadius: '12px 12px 0 0',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{ padding: '0.75rem 1rem', background: '#1e293b', color: 'white', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Matière</div>
                                            {(['SM', 'SE', 'SS'] as const).map(s => {
                                                const colors: Record<string, string> = { SM: '#2563eb', SE: '#059669', SS: '#ea580c' };
                                                const labels: Record<string, string> = { SM: 'Sc. Math.', SE: 'Sc. Exp.', SS: 'Sc. Soc.' };
                                                return (
                                                    <div key={s} style={{ padding: '0.75rem 1rem', background: colors[s], color: 'white', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                                                        <div style={{ fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><GraduationCap size={14} /> {s}</div>
                                                        <div style={{ fontSize: '0.68rem', opacity: 0.85, marginTop: '2px' }}>{labels[s]} · {seriesData[s]?.classes_count ?? 0} classe(s)</div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Build unified matière list (union of all series matières) */}
                                        {(() => {
                                            // Build a map: code → { libelle, SM coef, SE coef, SS coef }
                                            const allMatieres: Record<string, { libelle: string; SM?: Matiere; SE?: Matiere; SS?: Matiere }> = {};
                                            for (const serie of ['SM', 'SE', 'SS'] as const) {
                                                for (const m of (seriesData[serie]?.matieres || [])) {
                                                    if (!allMatieres[m.code]) {
                                                        allMatieres[m.code] = { libelle: m.libelle };
                                                    }
                                                    allMatieres[m.code][serie] = m;
                                                }
                                            }
                                            const rows = Object.entries(allMatieres);
                                            if (rows.length === 0) {
                                                return (
                                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem', background: 'white', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
                                                        Aucune matière lycée trouvée. Assurez-vous que des classes de lycée actives existent avec des matières attribuées.
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                                                    {rows.map(([code, matData], idx) => (
                                                        <div key={code} style={{
                                                            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                                            background: idx % 2 === 0 ? 'white' : '#f8fafc',
                                                            borderBottom: idx < rows.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                            gap: '1px'
                                                        }}>
                                                            {/* Matière name */}
                                                            <div style={{ padding: '0.7rem 1rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{matData.libelle}</span>
                                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{code}</span>
                                                            </div>
                                                            {/* Each serie column */}
                                                            {(['SM', 'SE', 'SS'] as const).map(serie => {
                                                                const colors: Record<string, string> = { SM: '#2563eb', SE: '#059669', SS: '#ea580c' };
                                                                const m = matData[serie];
                                                                if (!m) {
                                                                    return (
                                                                        <div key={serie} style={{ padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: '0.75rem', background: idx % 2 === 0 ? '#fafafa' : '#f4f6f8' }}>
                                                                            <span>—</span>
                                                                        </div>
                                                                    );
                                                                }
                                                                const serieEdit = seriesEdited[serie]?.[m.matiere_id] || {};
                                                                const coef = serieEdit.coefficient ?? m.coefficient ?? 1;
                                                                const noteSur = serieEdit.note_sur ?? m.note_sur ?? 20;
                                                                const isEdited = !!(seriesEdited[serie]?.[m.matiere_id]);
                                                                return (
                                                                    <div key={serie} style={{ padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', position: 'relative' }}>
                                                                        {isEdited && (
                                                                            <div style={{ position: 'absolute', top: '4px', right: '6px' }}>
                                                                                <Pencil size={10} color="#f59e0b" />
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', width: '100%' }}>
                                                                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, minWidth: '24px' }}>Coef</span>
                                                                            <input
                                                                                type="number" min={0.5} max={10} step={0.5}
                                                                                value={coef}
                                                                                style={{
                                                                                    width: '52px', padding: '3px 6px', borderRadius: '6px', fontSize: '0.82rem',
                                                                                    fontWeight: 700, textAlign: 'center', color: colors[serie],
                                                                                    border: `1.5px solid ${isEdited ? '#f59e0b' : colors[serie] + '50'}`,
                                                                                    background: isEdited ? '#fef9ee' : `${colors[serie]}08`,
                                                                                    outline: 'none'
                                                                                }}
                                                                                onChange={e => editSerieCoef(serie, m.matiere_id, 'coefficient', Number(e.target.value))}
                                                                            />
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', width: '100%' }}>
                                                                            <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, minWidth: '24px' }}>/ </span>
                                                                            <select
                                                                                value={noteSur}
                                                                                style={{
                                                                                    width: '52px', padding: '2px 4px', borderRadius: '6px', fontSize: '0.78rem',
                                                                                    fontWeight: 600, color: '#64748b',
                                                                                    border: `1.5px solid ${isEdited ? '#f59e0b' : '#e2e8f0'}`,
                                                                                    background: isEdited ? '#fef9ee' : 'white',
                                                                                    outline: 'none', cursor: 'pointer'
                                                                                }}
                                                                                onChange={e => editSerieCoef(serie, m.matiere_id, 'note_sur', Number(e.target.value))}
                                                                            >
                                                                                <option value={10}>10</option>
                                                                                <option value={20}>20</option>
                                                                                <option value={100}>100</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                ) : /* ═══════════════════════════════════════════════════════════
                                    VUE PAR SÉRIE SPÉCIFIQUE (SM / SE / SS)
                                ═══════════════════════════════════════════════════════════ */
                                coefFilter === 'lycee' && lyceeSerie !== 'all' ? (
                                    <>
                                        <div className={styles.coefTableHeader}>
                                            <span>#</span>
                                            <span>Matière</span>
                                            <span>Série {lyceeSerie}</span>
                                            <span>Coefficient</span>
                                            <span>Note sur</span>
                                            <span>État</span>
                                        </div>
                                        {(seriesData[lyceeSerie]?.matieres || []).map((m: Matiere, idx: number) => {
                                            const serieEdit = seriesEdited[lyceeSerie]?.[m.matiere_id] || {};
                                            const coef = serieEdit.coefficient ?? m.coefficient ?? 1;
                                            const noteSur = serieEdit.note_sur ?? m.note_sur ?? 20;
                                            const isEdited = !!(seriesEdited[lyceeSerie]?.[m.matiere_id]);
                                            const serieColor = lyceeSerie === 'SM' ? '#3b82f6' : lyceeSerie === 'SE' ? '#10b981' : '#f97316';
                                            return (
                                                <div key={m.matiere_id} className={`${styles.coefRow} ${isEdited ? styles.coefRowEdited : ''}`}>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>
                                                    <div>
                                                        <div className={styles.matiereName}>{m.libelle}</div>
                                                        <div className={styles.matiereCode}>{m.code}</div>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: '20px',
                                                        background: `${serieColor}18`, color: serieColor
                                                    }}>
                                                        {lyceeSerie}
                                                    </span>
                                                    <input
                                                        type="number" min={0.5} max={10} step={0.5}
                                                        value={coef}
                                                        className={`${styles.coefInput} ${isEdited && 'coefficient' in serieEdit ? styles.coefInputEdited : ''}`}
                                                        onChange={e => editSerieCoef(lyceeSerie, m.matiere_id, 'coefficient', Number(e.target.value))}
                                                    />
                                                    <select
                                                        value={noteSur}
                                                        className={`${styles.noteSurSelect} ${isEdited && 'note_sur' in serieEdit ? styles.noteSurEdited : ''}`}
                                                        onChange={e => editSerieCoef(lyceeSerie, m.matiere_id, 'note_sur', Number(e.target.value))}
                                                    >
                                                        <option value={10}>/ 10</option>
                                                        <option value={20}>/ 20</option>
                                                        <option value={100}>/ 100</option>
                                                    </select>
                                                    <div className={styles.checkCell}>
                                                        {isEdited
                                                            ? <Pencil size={14} color="#f59e0b" />
                                                            : <Check size={14} className={styles.checkIcon} />
                                                        }
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {(seriesData[lyceeSerie]?.matieres || []).length === 0 && (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
                                                Aucune matière trouvée pour la série {lyceeSerie}. Assurez-vous que des classes de Lycée existent et ont des matières attribuées.
                                            </div>
                                        )}
                                    </>

                                ) : (
                                    /* ── Default / All cycles table (Primaire, Collège, ou vue globale) ── */
                                    <>
                                        <div className={styles.coefTableHeader}>
                                            <span>#</span>
                                            <span>Matière</span>
                                            <span>Cycle</span>
                                            <span>Coefficient</span>
                                            <span>Note sur</span>
                                            <span>État</span>
                                        </div>
                                        {filteredMatieres.map((m, idx) => {
                                            const edited = matieresEdited[m.matiere_id] || {};
                                            const coef = edited.coefficient_defaut ?? m.coefficient_defaut ?? 1;
                                            const noteSur = edited.note_sur ?? m.note_sur ?? 20;
                                            const isEdited = !!matieresEdited[m.matiere_id];
                                            const cycleKey = getCycleKey(m.cycle_id);
                                            const cycleLibelle = cyclesList.find(c => c.cycle_id === m.cycle_id)?.libelle || '—';
                                            const pillClass = cycleKey === 'primaire' ? styles.pillPrimaire
                                                            : cycleKey === 'college'  ? styles.pillCollege
                                                            : styles.pillLycee;

                                            return (
                                                <div key={m.matiere_id} className={`${styles.coefRow} ${isEdited ? styles.coefRowEdited : ''}`}>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</span>
                                                    <div>
                                                        <div className={styles.matiereName}>{m.libelle}</div>
                                                        <div className={styles.matiereCode}>{m.code}</div>
                                                    </div>
                                                    <span className={`${styles.cyclePill} ${pillClass}`}>
                                                        {cycleLibelle}
                                                    </span>
                                                    <input
                                                        type="number" min={0.5} max={10} step={0.5}
                                                        value={coef}
                                                        className={`${styles.coefInput} ${isEdited && 'coefficient_defaut' in edited ? styles.coefInputEdited : ''}`}
                                                        onChange={e => editCoef(m.matiere_id, 'coefficient_defaut', Number(e.target.value))}
                                                    />
                                                    <select
                                                        value={noteSur}
                                                        className={`${styles.noteSurSelect} ${isEdited && 'note_sur' in edited ? styles.noteSurEdited : ''}`}
                                                        onChange={e => editCoef(m.matiere_id, 'note_sur', Number(e.target.value))}
                                                    >
                                                        <option value={10}>/ 10</option>
                                                        <option value={20}>/ 20</option>
                                                        <option value={100}>/ 100</option>
                                                    </select>
                                                    <div className={styles.checkCell}>
                                                        {isEdited
                                                            ? <Pencil size={14} color="#f59e0b" />
                                                            : <Check size={14} className={styles.checkIcon} />
                                                        }
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {filteredMatieres.length === 0 && (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
                                                Aucune matière trouvée pour ce cycle.
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    </motion.div>
                )}


                {/* ══════════════════════════════════════
                    TAB : ÉVALUATIONS & PONDÉRATION
                ══════════════════════════════════════ */}
                {activeTab === 'evaluations' && (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <ClipboardList size={20} className={styles.sectionIcon} />
                                <h3>Types d&apos;Évaluation &amp; Pondération</h3>
                                <span className={styles.sectionSubtitle}>Définissez les types d&apos;évaluation et leur poids dans le calcul de la moyenne</span>
                            </div>

                            {/* Weight progress bar */}
                            {(() => {
                                const total = typesEval.filter(t => t.statut === 'ACTIF').reduce((s, t) => s + Number(t.poids_pourcentage), 0);
                                const isValid = Math.abs(total - 100) < 0.01;
                                return (
                                    <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', borderRadius: '12px', background: isValid ? '#f0fdf4' : '#fef2f2', border: `1px solid ${isValid ? '#bbf7d0' : '#fecaca'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isValid ? '#166534' : '#991b1b' }}>
                                                {isValid ? <><CheckCircle2 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Pondération valide</> : <><AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> La somme des poids doit être égale à 100%</>}
                                            </span>
                                            <span style={{ fontWeight: 800, fontSize: '1rem', color: isValid ? '#166534' : '#991b1b' }}>{total.toFixed(1)}%</span>
                                        </div>
                                        <div style={{ height: '8px', borderRadius: '99px', background: '#e5e7eb', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${Math.min(total, 100)}%`, borderRadius: '99px', background: isValid ? '#22c55e' : '#ef4444', transition: 'width 0.4s' }} />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Type list */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {typesEval.map(te => (
                                    <div key={te.type_eval_id} style={{
                                        display: 'grid', gridTemplateColumns: '100px 1fr 120px 80px',
                                        alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                                        borderRadius: '12px', background: 'white', border: '1px solid #e2e8f0',
                                        opacity: te.statut === 'INACTIF' ? 0.5 : 1,
                                    }}>
                                        {editingTypeId === te.type_eval_id ? (
                                            <>
                                                <input value={te.code} style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                                                    onChange={e => setTypesEval(prev => prev.map(t => t.type_eval_id === te.type_eval_id ? {...t, code: e.target.value} : t))} />
                                                <input value={te.libelle} style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                                                    onChange={e => setTypesEval(prev => prev.map(t => t.type_eval_id === te.type_eval_id ? {...t, libelle: e.target.value} : t))} />
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <input type="number" value={te.poids_pourcentage} min={0} max={100} step={0.5}
                                                        style={{ width: '70px', padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textAlign: 'center' }}
                                                        onChange={e => setTypesEval(prev => prev.map(t => t.type_eval_id === te.type_eval_id ? {...t, poids_pourcentage: Number(e.target.value)} : t))} />
                                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>%</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button onClick={async () => {
                                                        try {
                                                            await api.put(`/api/evaluations/types/${te.type_eval_id}`, { code: te.code, libelle: te.libelle, poids_pourcentage: te.poids_pourcentage });
                                                            setEditingTypeId(null);
                                                        } catch(e) { console.error(e); }
                                                    }} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', background: 'var(--brand-primary, #3b82f6)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                                                        <Check size={14} />
                                                    </button>
                                                    <button onClick={() => setEditingTypeId(null)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ fontWeight: 800, color: 'var(--brand-primary, #3b82f6)', fontSize: '0.9rem', fontFamily: 'monospace' }}>{te.code}</span>
                                                <span style={{ color: '#334155', fontSize: '0.9rem' }}>{te.libelle}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <div style={{ width: '50px', height: '6px', borderRadius: '99px', background: '#e5e7eb', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${te.poids_pourcentage}%`, borderRadius: '99px', background: 'var(--brand-primary, #3b82f6)' }} />
                                                    </div>
                                                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{te.poids_pourcentage}%</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                    <button onClick={() => setEditingTypeId(te.type_eval_id)} style={{ padding: '0.3rem', borderRadius: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                                        <Pencil size={14} color="#64748b" />
                                                    </button>
                                                    <button onClick={async () => {
                                                        if (!confirm('Supprimer ce type d\'évaluation ?')) return;
                                                        try {
                                                            await api.delete(`/api/evaluations/types/${te.type_eval_id}`);
                                                            setTypesEval(prev => prev.filter(t => t.type_eval_id !== te.type_eval_id));
                                                        } catch(e: any) { alert(e?.response?.data?.detail || 'Erreur'); }
                                                    }} style={{ padding: '0.3rem', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', cursor: 'pointer' }}>
                                                        <Trash2 size={14} color="#ef4444" />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Add new type */}
                            {showNewTypeForm ? (
                                <div style={{ marginTop: '1rem', padding: '1.25rem', borderRadius: '12px', border: '2px dashed var(--brand-primary, #3b82f6)', background: 'var(--brand-primary-light, #eff6ff)' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={16} /> Nouveau type d&apos;évaluation</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px auto', gap: '0.75rem', alignItems: 'end' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Code</label>
                                            <input placeholder="EX" value={newTypeCode} onChange={e => setNewTypeCode(e.target.value.toUpperCase())}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 700 }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Libellé</label>
                                            <input placeholder="Examen" value={newTypeLibelle} onChange={e => setNewTypeLibelle(e.target.value)}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '0.25rem' }}>Poids (%)</label>
                                            <input type="number" placeholder="60" value={newTypePoids || ''} min={0} max={100} step={0.5}
                                                onChange={e => setNewTypePoids(Number(e.target.value))}
                                                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', textAlign: 'center' }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={async () => {
                                                if (!newTypeCode || !newTypeLibelle || !newTypePoids) return;
                                                try {
                                                    const res = await api.post('/api/evaluations/types', { code: newTypeCode, libelle: newTypeLibelle, poids_pourcentage: newTypePoids, statut: 'ACTIF' });
                                                    setTypesEval(prev => [...prev, res.data]);
                                                    setNewTypeCode(''); setNewTypeLibelle(''); setNewTypePoids(0); setShowNewTypeForm(false);
                                                } catch(e: any) { alert(e?.response?.data?.detail || 'Erreur'); }
                                            }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', background: 'var(--brand-primary, #3b82f6)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                                                Ajouter
                                            </button>
                                            <button onClick={() => { setShowNewTypeForm(false); setNewTypeCode(''); setNewTypeLibelle(''); setNewTypePoids(0); }}
                                                style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.85rem' }}>
                                                Annuler
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setShowNewTypeForm(true)} style={{
                                    marginTop: '1rem', width: '100%', padding: '0.8rem',
                                    borderRadius: '12px', border: '2px dashed #cbd5e1',
                                    background: 'transparent', color: '#64748b', cursor: 'pointer',
                                    fontSize: '0.88rem', fontWeight: 600,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}>
                                    <Plus size={18} /> Ajouter un type d&apos;évaluation
                                </button>
                            )}
                        </section>
                    </motion.div>
                )}


                {/* ══════════════════════════════════════
                    TAB 4 : AFFICHAGE BULLETINS
                ══════════════════════════════════════ */}
                {activeTab === 'affichage' && (
                    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Eye size={20} className={styles.sectionIcon} />
                                <h3>Informations Affichées sur les Bulletins</h3>
                            </div>
                            <div className={styles.toggleSection}>
                                {[
                                    { key:'rang',          icon:'Trophy', color:'#f59e0b', bg:'#fef3c7', label:'Classement (Rang)',           desc:"Affiche la position de l'élève dans sa classe (ex: 3ème / 42)." },
                                    { key:'mention',       icon:'Medal', color:'#3b82f6', bg:'#dbeafe', label:'Mention',                     desc:'Affiche la mention obtenue (TRÈS BIEN, BIEN, ASSEZ BIEN…).' },
                                    { key:'appreciation',  icon:'MessageSquare', color:'#10b981', bg:'#d1fae5', label:'Appréciation par matière',     desc:'Génère une appréciation automatique pour chaque matière (Passable, Bien…).' },
                                    { key:'effectif',      icon:'Users', color:'#8b5cf6', bg:'#ede9fe', label:"Effectif de la classe",        desc:"Affiche le nombre total d'élèves dans la classe sur le bulletin." },
                                    { key:'stats_matiere', icon:'BarChart3', color:'#ec4899', bg:'#fce7f3', label:'Stats de classe par matière',  desc:'Affiche la moyenne de classe, le min et le max pour chaque matière.' },
                                ].map(item => (
                                    <div key={item.key} className={styles.toggleRow}>
                                        <div className={styles.toggleLeft}>
                                            <div className={styles.toggleIconBox} style={{ background: item.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {item.icon === 'Trophy' && <Trophy size={18} color={item.color} />}
                                                {item.icon === 'Medal' && <Medal size={18} color={item.color} />}
                                                {item.icon === 'MessageSquare' && <MessageSquare size={18} color={item.color} />}
                                                {item.icon === 'Users' && <Users size={18} color={item.color} />}
                                                {item.icon === 'BarChart3' && <BarChart3 size={18} color={item.color} />}
                                            </div>
                                            <div className={styles.toggleText}>
                                                <h4>{item.label}</h4>
                                                <p>{item.desc}</p>
                                            </div>
                                        </div>
                                        <label className={styles.toggle}>
                                            <input type="checkbox"
                                                checked={(display as any)[item.key]}
                                                onChange={e => setDisplayFlag(item.key, e.target.checked)}
                                            />
                                            <span className={styles.slider}></span>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </motion.div>
                )}

            </div>

            {/* ── Sticky Save Bar ── */}
            <AnimatePresence>
                {hasChanges && (
                    <motion.div className={styles.stickyBar}
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    >
                        <div className={styles.stickyContent}>
                            <div className={styles.stickyLeft}>
                                <span className={styles.stickyDot} />
                                <span className={styles.stickyText}>Modifications non sauvegardées</span>
                            </div>
                            <div className={styles.stickyActions}>
                                <button className={styles.cancelBtn} onClick={handleCancel}>Annuler</button>
                                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 size={15} className={styles.spinner} /> : <Save size={15} />}
                                    {saving ? 'Sauvegarde en cours...' : 'Sauvegarder tout'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Toast ── */}
            <AnimatePresence>
                {success && (
                    <motion.div className={styles.toast}
                        initial={{ opacity:0, x:80 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:80 }}>
                        <CheckCircle size={20} />
                        Tous les paramètres de notation ont été sauvegardés !
                    </motion.div>
                )}
            </AnimatePresence>
        </SettingsLayout>
    );
}
