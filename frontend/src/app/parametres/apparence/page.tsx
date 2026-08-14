'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Sun, Moon, Type, Save, Check, Loader2, Sparkles, Monitor, RefreshCcw, Layout, Calendar, AlertTriangle, Bell, Clock, GraduationCap, Users, BookOpen, ClipboardList } from 'lucide-react';
import SettingsLayout from '@/components/SettingsLayout';
import api from '@/lib/api';
import { useApp, applyThemeStyles } from '@/context/AppContext';
import styles from './Apparence.module.css';
import { useIsMobile } from '@/hooks/useIsMobile';

/* ─── Types ─── */
interface ParametreSetting {
    etablissement_id: number;
    categorie: string;
    cle: string;
    valeur: string;
    type_valeur: string;
}
interface ThemeConfig {
    primary: string; secondary: string; accent: string;
    darkMode: boolean; preset: string; font: string;
    // Specific portals
    couleurEleve: string; couleurParent: string; couleurEnseignant: string;
    msgEleve: string; msgParent: string; msgEnseignant: string;
    // Seasonal
    seasonalEnabled: boolean;
    seasonalAutoApply: boolean;
    seasonalThemesJson: string;
}
type ThemeColorKey = 'primary' | 'secondary' | 'accent';
type ToastState = { msg: string; type: 'success' | 'error' } | null;

/* ─── Data ─── */
const PRESETS = [
    { id: 'smartschool', label: 'SmartSchool', emoji: '', primary: '#4f46e5', secondary: '#6366f1', accent: '#0ea5e9', gradient: 'linear-gradient(135deg,#4f46e5,#6366f1)', description: "Le thème officiel SmartSchool" },
    { id: 'ocean',       label: 'Océan',        emoji: '', primary: '#0369a1', secondary: '#0284c7', accent: '#38bdf8', gradient: 'linear-gradient(135deg,#0369a1,#0ea5e9)', description: 'Bleus profonds et dynamiques' },
    { id: 'forest',      label: 'Forêt',        emoji: '', primary: '#166534', secondary: '#16a34a', accent: '#4ade80', gradient: 'linear-gradient(135deg,#166534,#16a34a)', description: 'Verts naturels et apaisants' },
    { id: 'sunset',      label: 'Coucher de Soleil', emoji: '', primary: '#c2410c', secondary: '#ea580c', accent: '#fb923c', gradient: 'linear-gradient(135deg,#c2410c,#f97316)', description: 'Orangés chauds et énergiques' },
    { id: 'royal',       label: 'Royal',        emoji: '', primary: '#7e22ce', secondary: '#9333ea', accent: '#c084fc', gradient: 'linear-gradient(135deg,#7e22ce,#a855f7)', description: 'Violets élégants et raffinés' },
    { id: 'rouge',       label: 'Grenade',      emoji: '', primary: '#9f1239', secondary: '#be123c', accent: '#fb7185', gradient: 'linear-gradient(135deg,#9f1239,#e11d48)', description: 'Rouges profonds et distingués' },
];
const FONTS = [
    { id: 'inter',       label: 'Inter',        style: "'Inter', sans-serif" },
    { id: 'plusjakarta', label: 'Plus Jakarta',  style: "'Plus Jakarta Sans', sans-serif" },
    { id: 'nunito',      label: 'Nunito',        style: "'Nunito', sans-serif" },
    { id: 'poppins',     label: 'Poppins',       style: "'Poppins', sans-serif" },
];
const COLOR_FIELDS: { key: ThemeColorKey; label: string; hint: string; placeholder: string }[] = [
    { key: 'primary',   label: 'Couleur Principale',  hint: 'Boutons, liens actifs, barres de navigation', placeholder: '#4f46e5' },
    { key: 'secondary', label: 'Couleur Secondaire',   hint: 'Survols, dégradés, arrière-plans actifs',     placeholder: '#6366f1' },
    { key: 'accent',    label: 'Couleur Accent',        hint: 'Badges, alertes, étiquettes, indicateurs',    placeholder: '#0ea5e9' },
];
const TABS = [
    { id: 'presets' as const, label: 'Thèmes'   },
    { id: 'colors'  as const, label: 'Couleurs' },
    { id: 'font'    as const, label: 'Police'   },
    { id: 'portails' as const, label: 'Portails' },
    { id: 'saison'  as const, label: 'Saisonnier' },
    { id: 'preview' as const, label: 'Aperçu'   },
];
type TabId = typeof TABS[number]['id'];

const DEFAULT: ThemeConfig = {
    primary: '#4f46e5', secondary: '#6366f1', accent: '#0ea5e9',
    darkMode: false, preset: 'smartschool', font: 'inter',
    couleurEleve: '#0284c7', couleurParent: '#16a34a', couleurEnseignant: '#7e22ce',
    msgEleve: "Bonjour et bienvenue sur ton espace Élève SmartSchool ! Prêt pour une nouvelle journée d'apprentissage ?",
    msgParent: "Bienvenue sur l'espace Parents. Suivez en temps réel la scolarité, les notes et les présences de vos enfants.",
    msgEnseignant: "Bienvenue sur l'espace Enseignant. Gérez vos classes, saisissez les devoirs et suivez vos élèves.",
    seasonalEnabled: false,
    seasonalAutoApply: false,
    seasonalThemesJson: JSON.stringify([
        { id: "noel", label: "Noël & Fêtes", emoji: "", primary: "#b91c1c", secondary: "#15803d", accent: "#fbbf24", start: "12-15", end: "01-05", description: "Thème festif rouge et vert pour les fêtes de fin d'année" },
        { id: "independance", label: "Fête Nationale", emoji: "", primary: "#be123c", secondary: "#15803d", accent: "#f59e0b", start: "09-25", end: "10-05", description: "Thème tricolore aux couleurs de la Guinée" },
        { id: "vacances", label: "Vacances d'Été", emoji: "", primary: "#ea580c", secondary: "#ca8a04", accent: "#06b6d4", start: "07-01", end: "08-31", description: "Thème ensoleillé et rafraîchissant pour l'été" }
    ])
};

/* ─── Page ─── */
export default function ApparencePage() {
    const { theme: globalTheme, setTheme: setGlobalTheme, applyTheme } = useApp();
    const isMobile = useIsMobile();
    const [theme, setTheme]     = useState<ThemeConfig>(globalTheme);
    const [saved, setSaved]     = useState<ThemeConfig>(globalTheme);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [toast, setToast]     = useState<ToastState>(null);
    const [activeTab, setActiveTab] = useState<TabId>('presets');
    const etablissementId = 1;

    const savedRef = useRef<ThemeConfig>(saved);

    useEffect(() => {
        savedRef.current = saved;
    }, [saved]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
    };

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get<any[]>(`/api/parametrage/settings?etablissement_id=${etablissementId}`);
            const s = res.data;
            const get = (cle: string, fb: string): string => s.find((x: any) => x.cle === cle)?.valeur ?? fb;
            const loaded: ThemeConfig = {
                primary:   get('theme.primary',   DEFAULT.primary),
                secondary: get('theme.secondary', DEFAULT.secondary),
                accent:    get('theme.accent',    DEFAULT.accent),
                darkMode:  get('theme.dark_mode', 'false') === 'true',
                preset:    get('theme.preset',    DEFAULT.preset),
                font:      get('theme.font',      DEFAULT.font),
                
                couleurEleve:      get('theme.couleur_eleve',      DEFAULT.couleurEleve),
                couleurParent:     get('theme.couleur_parent',     DEFAULT.couleurParent),
                couleurEnseignant: get('theme.couleur_enseignant', DEFAULT.couleurEnseignant),
                
                msgEleve:          get('theme.msg_eleve',          DEFAULT.msgEleve),
                msgParent:         get('theme.msg_parent',         DEFAULT.msgParent),
                msgEnseignant:     get('theme.msg_enseignant',     DEFAULT.msgEnseignant),
                
                seasonalEnabled:   get('theme.seasonal_enabled',   'false') === 'true',
                seasonalAutoApply: get('theme.seasonal_auto_apply', 'false') === 'true',
                seasonalThemesJson:get('theme.seasonal_themes',     DEFAULT.seasonalThemesJson),
            };
            setTheme(loaded); setSaved(loaded);
            applyThemeStyles(loaded);
        } catch { /* use defaults */ } finally { setLoading(false); }
    }, [etablissementId]);

    // On mount, load settings from database
    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    // Live update dynamic CSS variables in real-time as user interacts
    useEffect(() => {
        if (!loading) {
            applyTheme(theme);
        }
    }, [theme, applyTheme, loading]);

    // Clean up: on unmount, if modifications were not saved, revert back to saved theme
    useEffect(() => {
        return () => {
            applyThemeStyles(savedRef.current);
        };
    }, []);

    const handleSave = async () => {
        try {
            setSaving(true);
            const settings: ParametreSetting[] = [
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.primary',   valeur: theme.primary,               type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.secondary', valeur: theme.secondary,             type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.accent',    valeur: theme.accent,                type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.dark_mode', valeur: theme.darkMode ? 'true' : 'false', type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.preset',    valeur: theme.preset,                type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.font',      valeur: theme.font,                  type_valeur: 'TEXT' },
                
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.couleur_eleve',      valeur: theme.couleurEleve,      type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.couleur_parent',     valeur: theme.couleurParent,     type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.couleur_enseignant', valeur: theme.couleurEnseignant, type_valeur: 'COLOR' },
                
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.msg_eleve',          valeur: theme.msgEleve,          type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.msg_parent',         valeur: theme.msgParent,         type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.msg_enseignant',     valeur: theme.msgEnseignant,     type_valeur: 'TEXT' },
                
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.seasonal_enabled',    valeur: theme.seasonalEnabled ? 'true' : 'false',    type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.seasonal_auto_apply', valeur: theme.seasonalAutoApply ? 'true' : 'false',  type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'THEME', cle: 'theme.seasonal_themes',     valeur: theme.seasonalThemesJson,                    type_valeur: 'TEXT' },
            ];
            await api.put(`/api/parametrage/settings?etablissement_id=${etablissementId}`, settings);
            setSaved(theme); 
            setGlobalTheme(theme);
            showToast('Thème sauvegardé avec succès !', 'success');
        } catch { showToast('Erreur lors de la sauvegarde.', 'error'); } finally { setSaving(false); }
    };

    const applyPreset = (id: string) => {
        const p = PRESETS.find((x) => x.id === id); if (!p) return;
        setTheme((prev) => ({ ...prev, primary: p.primary, secondary: p.secondary, accent: p.accent, preset: p.id }));
    };

    const isDirty = JSON.stringify(theme) !== JSON.stringify(saved);

    if (loading) return (
        <SettingsLayout title="Apparence" subtitle="Thèmes, couleurs et polices">
            <div className={styles.loader}><Loader2 size={32} className={styles.spin} /><span>Chargement du thème…</span></div>
        </SettingsLayout>
    );

    return (
        <SettingsLayout title="Apparence" subtitle="Personnalisez les couleurs, la police et le mode d'affichage">
            <div className={styles.container}>

                <AnimatePresence>
                    {toast && (
                        <motion.div
                            className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        >
                            {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />} {toast.msg}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Banner */}
                <div className={styles.banner} style={{ background: `linear-gradient(135deg,${theme.primary},${theme.secondary})` }}>
                    <div className={styles.bannerDeco} /><div className={styles.bannerDeco2} />
                    <div className={styles.bannerContent}>
                        <div className={styles.bannerIconBox}><Palette size={28} /></div>
                        <div>
                            <h1 className={styles.bannerTitle}>Apparence &amp; Thème</h1>
                            <p className={styles.bannerDesc}>Personnalisez les couleurs, la police et le mode d'affichage de SmartSchool.</p>
                        </div>
                    </div>
                    <div className={styles.colorDots}>
                        {[theme.primary, theme.secondary, theme.accent].map((c, i) => <div key={i} style={{ background: c }} />)}
                    </div>
                </div>

                {/* Tabs */}
                <div className={styles.tabsNav}>
                    {TABS.map((t) => (
                        <button key={t.id} id={`tab-apparence-${t.id}`}
                            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(t.id)}
                            style={activeTab === t.id ? { color: theme.primary } : {}}
                        >{t.label}</button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>

                        {/* ═══ PRESETS ═══ */}
                        {activeTab === 'presets' && (
                            <div className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2><Sparkles size={18} /> Thèmes prédéfinis</h2>
                                    <span className={styles.hint}>Sélectionnez un thème ou personnalisez via l'onglet Couleurs.</span>
                                </div>
                                <div className={styles.presetsGrid}>
                                    {PRESETS.map((p) => {
                                        const isActive = theme.preset === p.id;
                                        return (
                                            <motion.button key={p.id} id={`preset-${p.id}`}
                                                className={`${styles.presetCard} ${isActive ? styles.presetActive : ''}`}
                                                onClick={() => applyPreset(p.id)}
                                                whileHover={{ scale: 1.02, y: -3 }} whileTap={{ scale: 0.98 }}
                                                style={isActive ? { borderColor: p.primary, boxShadow: `0 0 0 3px ${p.primary}33` } : {}}
                                            >
                                                <div className={styles.presetGradientBar} style={{ background: p.gradient }}>
                                                    <span className={styles.presetEmoji}>{p.emoji}</span>
                                                    {isActive && <span className={styles.presetCheckBadge}><Check size={13} /></span>}
                                                </div>
                                                <div className={styles.presetSwatches}>
                                                    <div style={{ background: p.primary }} />
                                                    <div style={{ background: p.secondary }} />
                                                    <div style={{ background: p.accent }} />
                                                </div>
                                                <div className={styles.presetInfo}>
                                                    <span className={styles.presetName}>{p.label}</span>
                                                    <span className={styles.presetDesc}>{p.description}</span>
                                                </div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ═══ COLORS ═══ */}
                        {activeTab === 'colors' && (
                            <div className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2><Palette size={18} /> Couleurs personnalisées</h2>
                                    <span className={styles.hint}>Modifier manuellement remplace le thème sélectionné.</span>
                                </div>
                                <div className={styles.colorGrid}>
                                    {COLOR_FIELDS.map(({ key, label, hint, placeholder }) => (
                                        <div key={key} className={styles.colorCard}>
                                            <div className={styles.colorPreviewLarge} style={{ background: theme[key] }} />
                                            <div className={styles.colorInfo}>
                                                <label className={styles.colorLabel} htmlFor={`picker-${key}`}>{label}</label>
                                                <p className={styles.colorHint}>{hint}</p>
                                                <div className={styles.colorInputRow}>
                                                    <input id={`picker-${key}`} type="color" value={theme[key]}
                                                        onChange={(e) => setTheme((p) => ({ ...p, [key]: e.target.value, preset: 'custom' }))}
                                                        className={styles.colorPicker} />
                                                    <input type="text" value={theme[key]} placeholder={placeholder}
                                                        onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setTheme((p) => ({ ...p, [key]: v, preset: 'custom' })); }}
                                                        className={styles.colorHexInput} maxLength={7} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.darkModeRow}>
                                    <div className={styles.darkModeInfo}>
                                        <div className={styles.darkModeIconBox}>{theme.darkMode ? <Moon size={22} /> : <Sun size={22} />}</div>
                                        <div>
                                            <div className={styles.darkModeLabel}>Mode Sombre</div>
                                            <div className={styles.darkModeHint}>{theme.darkMode ? 'Interface en mode nuit — repose les yeux' : 'Interface en mode jour — lumineux et clair'}</div>
                                        </div>
                                    </div>
                                    <button id="toggle-dark-mode"
                                        className={`${styles.toggleSwitch} ${theme.darkMode ? styles.toggleOn : ''}`}
                                        onClick={() => setTheme((p) => ({ ...p, darkMode: !p.darkMode }))}
                                        style={theme.darkMode ? { background: theme.primary } : {}}
                                    ><span className={styles.toggleKnob} /></button>
                                </div>
                            </div>
                        )}

                        {/* ═══ FONT ═══ */}
                        {activeTab === 'font' && (
                            <div className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2><Type size={18} /> Police de caractères</h2>
                                    <span className={styles.hint}>Appliquée sur toute l'interface SmartSchool.</span>
                                </div>
                                <div className={styles.fontsGrid}>
                                    {FONTS.map((f) => {
                                        const isActive = theme.font === f.id;
                                        return (
                                            <motion.button key={f.id} id={`font-${f.id}`}
                                                className={`${styles.fontCard} ${isActive ? styles.fontActive : ''}`}
                                                style={isActive ? { borderColor: theme.primary, boxShadow: `0 0 0 3px ${theme.primary}22` } : {}}
                                                onClick={() => setTheme((p) => ({ ...p, font: f.id }))}
                                                whileHover={{ y: -3 }}
                                            >
                                                <div className={styles.fontSample} style={{ fontFamily: f.style }}>Aa</div>
                                                <div className={styles.fontName}>{f.label}</div>
                                                <div className={styles.fontPreview} style={{ fontFamily: f.style }}>Smart School 2025</div>
                                                {isActive && <div className={styles.fontActiveBadge} style={{ background: theme.primary }}><Check size={11} /> Active</div>}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ═══ PORTAILS SPECIFIC ═══ */}
                        {activeTab === 'portails' && (
                            <div className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2><Layout size={18} /> Configuration Spécifique par Portail</h2>
                                    <span className={styles.hint}>Personnalisez les couleurs d&apos;accentuation et les messages d&apos;accueil pour chaque portail d&apos;accès.</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                                    {[
                                        { key: 'Eleve' as const, label: 'Portail Élève', desc: "S'applique à l'espace élève", colorKey: 'couleurEleve' as const, msgKey: 'msgEleve' as const, icon: <GraduationCap size={24} />, defaultColor: '#0284c7' },
                                        { key: 'Parent' as const, label: 'Portail Parent', desc: "S'applique à l'espace parent", colorKey: 'couleurParent' as const, msgKey: 'msgParent' as const, icon: <Users size={24} />, defaultColor: '#16a34a' },
                                        { key: 'Enseignant' as const, label: 'Portail Enseignant', desc: "S'applique à l'espace enseignant", colorKey: 'couleurEnseignant' as const, msgKey: 'msgEnseignant' as const, icon: <BookOpen size={24} />, defaultColor: '#7e22ce' }
                                    ].map(p => (
                                        <div key={p.key} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '1.5rem' }}>{p.icon}</span>
                                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{p.label}</h3>
                                                </div>
                                                <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#64748b' }}>{p.desc}</p>
                                                
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.4rem' }}>Couleur d&apos;accent</label>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <input type="color" value={theme[p.colorKey]} 
                                                        onChange={e => setTheme(prev => ({ ...prev, [p.colorKey]: e.target.value }))}
                                                        style={{ width: '40px', height: '40px', padding: 0, border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }} />
                                                    <input type="text" value={theme[p.colorKey]} maxLength={7}
                                                        onChange={e => setTheme(prev => ({ ...prev, [p.colorKey]: e.target.value }))}
                                                        style={{ width: '100px', padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.88rem', fontWeight: 600 }} />
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '0.5rem' }}>Message d&apos;accueil personnalisé</label>
                                                <textarea value={theme[p.msgKey]} rows={3}
                                                    onChange={e => setTheme(prev => ({ ...prev, [p.msgKey]: e.target.value }))}
                                                    placeholder="Saisissez le message d'accueil pour ce portail..."
                                                    style={{ width: '100%', padding: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'inherit' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ SAISONNIERS ═══ */}
                        {activeTab === 'saison' && (
                            <div className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2><Calendar size={18} /> Gestion des Thèmes Saisonniers</h2>
                                    <span className={styles.hint}>Configurez des thèmes temporaires qui s&apos;activent automatiquement lors de périodes festives ou de vacances.</span>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', padding: '1.25rem', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Clock size={20} style={{ color: theme.primary }} />
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Activer les thèmes saisonniers</span>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>Applique automatiquement le thème correspondant selon la date système</div>
                                        </div>
                                    </div>
                                    <button className={`${styles.toggleSwitch} ${theme.seasonalEnabled ? styles.toggleOn : ''}`}
                                        onClick={() => setTheme(p => ({ ...p, seasonalEnabled: !p.seasonalEnabled }))}
                                        style={theme.seasonalEnabled ? { background: theme.primary } : {}}
                                    ><span className={styles.toggleKnob} /></button>
                                </div>

                                {theme.seasonalEnabled && (
                                    <>
                                        {/* Notifications / Auto-Apply Preference */}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', padding: '1.25rem', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <Bell size={20} style={{ color: theme.accent }} />
                                                <div>
                                                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Application automatique (sans confirmation)</span>
                                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>Si décoché, l&apos;administrateur recevra une demande de validation avant l&apos;activation</div>
                                                </div>
                                            </div>
                                            <button className={`${styles.toggleSwitch} ${theme.seasonalAutoApply ? styles.toggleOn : ''}`}
                                                onClick={() => setTheme(p => ({ ...p, seasonalAutoApply: !p.seasonalAutoApply }))}
                                                style={theme.seasonalAutoApply ? { background: theme.primary } : {}}
                                            ><span className={styles.toggleKnob} /></button>
                                        </div>

                                        {/* Seasonal themes list */}
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ClipboardList size={20} /> Liste des thèmes configurés</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {(() => {
                                                let themesList: any[] = [];
                                                try { themesList = JSON.parse(theme.seasonalThemesJson); } catch(e) {}
                                                return themesList.map((t: any, index: number) => (
                                                    <div key={t.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '50px 1.5fr 1fr 1fr auto', alignItems: isMobile ? 'stretch' : 'center', gap: '1rem', padding: '1.25rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px' }}>
                                                        <span style={{ fontSize: '2rem', textAlign: 'center' }}>{t.emoji}</span>
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>{t.label}</div>
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{t.description}</div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.25rem', flexDirection: 'column' }}>
                                                            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Début (MM-JJ)</label>
                                                            <input type="text" value={t.start}
                                                                onChange={e => {
                                                                    const updated = [...themesList];
                                                                    updated[index] = { ...t, start: e.target.value };
                                                                    setTheme(prev => ({ ...prev, seasonalThemesJson: JSON.stringify(updated) }));
                                                                }}
                                                                style={{ width: '80px', padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }} />
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.25rem', flexDirection: 'column' }}>
                                                            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Fin (MM-JJ)</label>
                                                            <input type="text" value={t.end}
                                                                onChange={e => {
                                                                    const updated = [...themesList];
                                                                    updated[index] = { ...t, end: e.target.value };
                                                                    setTheme(prev => ({ ...prev, seasonalThemesJson: JSON.stringify(updated) }));
                                                                }}
                                                                style={{ width: '80px', padding: '0.35rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }} />
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            {[
                                                                { k: 'primary', label: 'P' },
                                                                { k: 'secondary', label: 'S' },
                                                                { k: 'accent', label: 'A' }
                                                            ].map(item => (
                                                                <div key={item.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', background: t[item.k], border: '1px solid #e2e8f0' }} />
                                                                    <input type="color" value={t[item.k]}
                                                                        onChange={e => {
                                                                            const updated = [...themesList];
                                                                            updated[index] = { ...t, [item.k]: e.target.value };
                                                                            setTheme(prev => ({ ...prev, seasonalThemesJson: JSON.stringify(updated) }));
                                                                        }}
                                                                        style={{ width: '16px', height: '16px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0, position: 'absolute' }} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ═══ PREVIEW ═══ */}
                        {activeTab === 'preview' && (
                            <div className={styles.panel}>
                                <div className={styles.panelHeader}>
                                    <h2><Monitor size={18} /> Aperçu en temps réel</h2>
                                    <span className={styles.hint}>Simulation de l'interface avec votre thème.</span>
                                </div>
                                <div className={styles.previewFrame} style={{ background: theme.darkMode ? '#0f172a' : '#f8fafc' }}>
                                    <div className={styles.previewSidebar} style={{ background: `linear-gradient(180deg,${theme.primary},${theme.secondary})` }}>
                                        <div className={styles.previewLogo}>SS</div>
                                        {[65, 80, 70, 60, 75].map((w, i) => (
                                            <div key={i} className={styles.previewSidebarItem} style={{ background: i === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)', width: `${w}%` }} />
                                        ))}
                                    </div>
                                    <div className={styles.previewContent}>
                                        <div className={styles.previewTopbar} style={{ background: theme.darkMode ? '#1e293b' : 'white' }}>
                                            <div className={styles.previewTopbarDot} style={{ background: theme.primary }} />
                                            <div className={styles.previewTopbarLine} style={{ background: theme.darkMode ? '#334155' : '#f1f5f9' }} />
                                            <div className={styles.previewTopbarAvatar} style={{ background: theme.accent }} />
                                        </div>
                                        <div className={styles.previewCards}>
                                            {[theme.primary, theme.secondary, theme.accent, '#10b981'].map((c, i) => (
                                                <div key={i} className={styles.previewCard} style={{ background: theme.darkMode ? '#1e293b' : 'white', borderTop: `3px solid ${c}` }}>
                                                    <div style={{ width: '70%', height: 6, background: theme.darkMode ? '#334155' : '#f1f5f9', borderRadius: 3 }} />
                                                    <div style={{ width: '40%', height: 14, background: c, borderRadius: 3, marginTop: 6 }} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className={styles.previewButtons}>
                                            <div className={styles.previewBtn} style={{ background: `linear-gradient(135deg,${theme.primary},${theme.secondary})` }}>
                                                <div style={{ width: 50, height: 8, background: 'rgba(255,255,255,0.8)', borderRadius: 2 }} />
                                            </div>
                                            <div className={styles.previewBtnOutline} style={{ border: `2px solid ${theme.primary}` }} />
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.themeSummary}>
                                    {([
                                        { label: 'Thème', value: PRESETS.find((p) => p.id === theme.preset)?.label ?? 'Personnalisé' },
                                        { label: 'Police', value: FONTS.find((f) => f.id === theme.font)?.label ?? 'Inter' },
                                        { label: 'Mode', value: theme.darkMode ? 'Sombre' : 'Clair' },
                                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                                        <div key={label} className={styles.themeSummaryItem}>
                                            <span>{label}</span><strong>{value}</strong>
                                        </div>
                                    ))}
                                    <div className={styles.themeSummaryItem}>
                                        <span>Couleurs</span>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {[theme.primary, theme.secondary, theme.accent].map((c, i) => (
                                                <div key={i} style={{ width: 20, height: 20, borderRadius: 6, background: c }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>

                {/* Action Bar */}
                <div className={styles.actionBar}>
                    <button className={styles.resetBtn} onClick={() => setTheme(saved)} disabled={!isDirty || saving} id="reset-theme">
                        <RefreshCcw size={15} /> Annuler
                    </button>
                    <div className={styles.actionRight}>
                        {isDirty && (
                            <motion.span className={styles.unsavedBadge} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                                Modifications non sauvegardées
                            </motion.span>
                        )}
                        <motion.button className={styles.saveBtn} onClick={handleSave} disabled={!isDirty || saving}
                            style={{ background: isDirty ? `linear-gradient(135deg,${theme.primary},${theme.secondary})` : '#cbd5e1' }}
                            whileHover={isDirty ? { scale: 1.03 } : {}} whileTap={isDirty ? { scale: 0.97 } : {}} id="save-theme"
                        >
                            {saving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
                            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                        </motion.button>
                    </div>
                </div>

            </div>
        </SettingsLayout>
    );
}
