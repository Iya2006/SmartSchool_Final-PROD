'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CreditCard, Save, Loader2, Layout, Palette, 
    Eye, AlignCenter, AlignLeft, AlignRight, 
    ToggleLeft, Type, Check, X,
    Upload, ImageIcon, Sparkles, Monitor, GraduationCap, Briefcase
} from 'lucide-react';
import SettingsLayout from '@/components/SettingsLayout';
import BadgeCarte from '@/components/BadgeCarte';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import styles from './Cartes.module.css';

/* ─── Interfaces ─── */
interface ParametreSetting {
    etablissement_id: number;
    categorie: string;
    cle: string;
    valeur: string;
    type_valeur: string;
}

interface CarteConfig {
    format: 'vertical' | 'horizontal' | 'compact';
    colorStart: string;
    colorEnd: string;
    gradientAngle: number;
    logoPosition: 'left' | 'center' | 'right';
    footerText: string;
    template: string;
    showQrCode: boolean;
    showDateNaissance: boolean;
    showClasse: boolean;
    showMatricule: boolean;
    showAdresse: boolean;
    showGroupeSanguin: boolean;
    bgImageUrl: string;
    showMatieres?: boolean;
}

type TabId = 'modeles' | 'format' | 'couleurs' | 'champs' | 'logo' | 'pied';
type ToastState = { msg: string; type: 'success' | 'error' } | null;

/* ─── Constants ─── */
const TEMPLATES = [
    { id: 'classique', label: 'Classique',        emoji: '', colorStart: '#1e293b', colorEnd: '#0f172a', angle: 135, description: 'Fond sombre élégant' },
    { id: 'ocean',     label: 'Océan',             emoji: '', colorStart: '#0369a1', colorEnd: '#0c4a6e', angle: 135, description: 'Bleus profonds' },
    { id: 'foret',     label: 'Forêt',             emoji: '', colorStart: '#166534', colorEnd: '#14532d', angle: 135, description: 'Verts naturels' },
    { id: 'royal',     label: 'Royal',             emoji: '', colorStart: '#7e22ce', colorEnd: '#581c87', angle: 135, description: 'Violets raffinés' },
    { id: 'sunset',    label: 'Coucher de Soleil', emoji: '', colorStart: '#c2410c', colorEnd: '#7c2d12', angle: 135, description: 'Orangés chaleureux' },
    { id: 'minuit',    label: 'Minuit',            emoji: '', colorStart: '#312e81', colorEnd: '#1e1b4b', angle: 160, description: 'Indigo mystérieux' },
];

const FORMATS = [
    { id: 'vertical',   label: 'Portrait',   icon: '□', desc: '320 × 500 px', sub: 'Format standard badge' },
    { id: 'horizontal', label: 'Paysage',    icon: '▭', desc: '500 × 320 px', sub: 'Format carte magnétique' },
    { id: 'compact',    label: 'Compact',    icon: '⬜', desc: '280 × 400 px', sub: 'Format économique' },
];

const LOGO_POSITIONS = [
    { id: 'left',   label: 'Gauche',  icon: AlignLeft,   desc: 'Logo à gauche' },
    { id: 'center', label: 'Centre',  icon: AlignCenter, desc: 'Logo centré' },
    { id: 'right',  label: 'Droite', icon: AlignRight,  desc: 'Logo à droite' },
];

const TABS_NAV: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'modeles', label: 'Modèles',         icon: Sparkles,    desc: 'Thèmes de fond' },
    { id: 'format',  label: 'Format',          icon: Layout,      desc: 'Orientation carte' },
    { id: 'couleurs',label: 'Couleurs & Image',icon: Palette,     desc: 'Dégradé personnalisé' },
    { id: 'champs',  label: 'Champs visibles', icon: ToggleLeft,  desc: 'Informations' },
    { id: 'logo',    label: 'Logo',            icon: Monitor,     desc: 'Position logo' },
    { id: 'pied',    label: 'Pied de carte',   icon: Type,        desc: 'Texte bas de page' },
];

const DEFAULT_CONFIG: CarteConfig = {
    format: 'vertical', colorStart: '#1e293b', colorEnd: '#0f172a', gradientAngle: 135,
    logoPosition: 'center', footerText: 'SmartSchool — Excellence Éducative',
    template: 'classique', showQrCode: true, showDateNaissance: false, showClasse: true,
    showMatricule: true, showAdresse: false, showGroupeSanguin: false, bgImageUrl: '', showMatieres: false
};

const DEFAULT_CONFIG_ENSEIGNANT: CarteConfig = {
    format: 'vertical', colorStart: '#581c87', colorEnd: '#3b0764', gradientAngle: 135,
    logoPosition: 'center', footerText: 'SmartSchool — Personnel Enseignant',
    template: 'royal', showQrCode: true, showDateNaissance: false, showClasse: true,
    showMatricule: true, showAdresse: true, showGroupeSanguin: false, bgImageUrl: '', showMatieres: true
};

const MOCK_AGENT = {
    nom: 'DUPONT', prenom: 'Jean', matricule: 'EL2026849', role: 'ÉLÈVE',
    classe: '6ème A', date_naissance: '12/04/2014',
    adresse: '12 Rue de la République, Conakry', groupe_sanguin: 'O+', photo_url: null
};

const MOCK_ENSEIGNANT = {
    nom: 'SOUMAH', prenom: 'Amadou', matricule: 'ENS2026951', role: 'ENSEIGNANT',
    classe: 'Tle SS, 11ème SM', date_naissance: '28/09/1984',
    adresse: 'Quartier Kipé, Conakry', groupe_sanguin: 'A+', photo_url: null,
    matieres: 'Mathématiques, Physique'
};

/* ─── Toggle Component ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        >
            <span className={styles.toggleThumb} />
        </button>
    );
}

/* ─── Main Page ─── */
export default function CartesPage() {
    const { setCarteConfig, setCarteConfigEleve, setCarteConfigEnseignant, refreshTheme } = useApp();

    const [activeRole, setActiveRole] = useState<'eleve' | 'enseignant'>('eleve');
    const [configEleve, setConfigEleve] = useState<CarteConfig>(DEFAULT_CONFIG);
    const [savedEleve, setSavedEleve] = useState<CarteConfig>(DEFAULT_CONFIG);
    const [configEnseignant, setConfigEnseignant] = useState<CarteConfig>(DEFAULT_CONFIG_ENSEIGNANT);
    const [savedEnseignant, setSavedEnseignant] = useState<CarteConfig>(DEFAULT_CONFIG_ENSEIGNANT);
    const [config, setConfig] = useState<CarteConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>('modeles');
    const [toast, setToast] = useState<ToastState>(null);
    const [uploadingBg, setUploadingBg] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(true);
    const etablissementId = 1;

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get<any[]>(`/api/parametrage/settings?etablissement_id=${etablissementId}`);
            const settings = res.data;
            const get = (cle: string, fb: string): string => settings.find((x: any) => x.cle === cle)?.valeur ?? fb;

            const loadedEleve: CarteConfig = {
                format: get('carte.format', get('carte.eleve.format', DEFAULT_CONFIG.format)) as any,
                colorStart: get('carte.color_start', get('carte.eleve.color_start', DEFAULT_CONFIG.colorStart)),
                colorEnd: get('carte.color_end', get('carte.eleve.color_end', DEFAULT_CONFIG.colorEnd)),
                gradientAngle: parseInt(get('carte.gradient_angle', get('carte.eleve.gradient_angle', String(DEFAULT_CONFIG.gradientAngle))), 10),
                logoPosition: get('carte.logo_position', get('carte.eleve.logo_position', DEFAULT_CONFIG.logoPosition)) as any,
                footerText: get('carte.footer_text', get('carte.eleve.footer_text', DEFAULT_CONFIG.footerText)),
                template: get('carte.template', get('carte.eleve.template', DEFAULT_CONFIG.template)),
                showQrCode: get('carte.show_qrcode', get('carte.eleve.show_qrcode', 'true')) === 'true',
                showDateNaissance: get('carte.show_date_naissance', get('carte.eleve.show_date_naissance', 'false')) === 'true',
                showClasse: get('carte.show_classe', get('carte.eleve.show_classe', 'true')) === 'true',
                showMatricule: get('carte.show_matricule', get('carte.eleve.show_matricule', 'true')) === 'true',
                showAdresse: get('carte.show_adresse', get('carte.eleve.show_adresse', 'false')) === 'true',
                showGroupeSanguin: get('carte.show_groupe_sanguin', get('carte.show_groupeSanguin', get('carte.eleve.show_groupe_sanguin', 'false'))) === 'true',
                bgImageUrl: get('carte.bg_image_url', get('carte.eleve.bg_image_url', DEFAULT_CONFIG.bgImageUrl)),
                showMatieres: false
            };

            const loadedEnseignant: CarteConfig = {
                format: get('carte.prof.format', DEFAULT_CONFIG_ENSEIGNANT.format) as any,
                colorStart: get('carte.prof.color_start', DEFAULT_CONFIG_ENSEIGNANT.colorStart),
                colorEnd: get('carte.prof.color_end', DEFAULT_CONFIG_ENSEIGNANT.colorEnd),
                gradientAngle: parseInt(get('carte.prof.gradient_angle', String(DEFAULT_CONFIG_ENSEIGNANT.gradientAngle)), 10),
                logoPosition: get('carte.prof.logo_position', DEFAULT_CONFIG_ENSEIGNANT.logoPosition) as any,
                footerText: get('carte.prof.footer_text', DEFAULT_CONFIG_ENSEIGNANT.footerText),
                template: get('carte.prof.template', DEFAULT_CONFIG_ENSEIGNANT.template),
                showQrCode: get('carte.prof.show_qrcode', 'true') === 'true',
                showDateNaissance: get('carte.prof.show_date_naissance', 'false') === 'true',
                showClasse: get('carte.prof.show_classe', 'true') === 'true',
                showMatricule: get('carte.prof.show_matricule', 'true') === 'true',
                showAdresse: get('carte.prof.show_adresse', 'true') === 'true',
                showGroupeSanguin: get('carte.prof.show_groupe_sanguin', get('carte.prof.show_groupeSanguin', 'false')) === 'true',
                bgImageUrl: get('carte.prof.bg_image_url', DEFAULT_CONFIG_ENSEIGNANT.bgImageUrl),
                showMatieres: get('carte.prof.show_matieres', 'true') === 'true',
            };

            setConfigEleve(loadedEleve);
            setSavedEleve(loadedEleve);
            setConfigEnseignant(loadedEnseignant);
            setSavedEnseignant(loadedEnseignant);
            setConfig(activeRole === 'eleve' ? loadedEleve : loadedEnseignant);
        } catch (err) {
            console.error('Erreur chargement config cartes:', err);
            showToast('Impossible de charger les paramètres.', 'error');
        } finally {
            setLoading(false);
        }
    }, [etablissementId]);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    const handleRoleChange = (newRole: 'eleve' | 'enseignant') => {
        if (newRole === activeRole) return;
        // Snapshot the current `config` before any state updates
        const snapshot = config;
        if (activeRole === 'eleve') {
            setConfigEleve(snapshot);
            setConfig(configEnseignant);
        } else {
            setConfigEnseignant(snapshot);
            setConfig(configEleve);
        }
        setActiveRole(newRole);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const currentEleve = activeRole === 'eleve' ? config : configEleve;
            const currentEnseignant = activeRole === 'enseignant' ? config : configEnseignant;

            const settings: ParametreSetting[] = [
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.format', valeur: currentEleve.format, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.format', valeur: currentEleve.format, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.color_start', valeur: currentEleve.colorStart, type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.color_start', valeur: currentEleve.colorStart, type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.color_end', valeur: currentEleve.colorEnd, type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.color_end', valeur: currentEleve.colorEnd, type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.gradient_angle', valeur: String(currentEleve.gradientAngle), type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.gradient_angle', valeur: String(currentEleve.gradientAngle), type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.logo_position', valeur: currentEleve.logoPosition, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.logo_position', valeur: currentEleve.logoPosition, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.footer_text', valeur: currentEleve.footerText, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.footer_text', valeur: currentEleve.footerText, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.template', valeur: currentEleve.template, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.template', valeur: currentEleve.template, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_qrcode', valeur: String(currentEleve.showQrCode), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.show_qrcode', valeur: String(currentEleve.showQrCode), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_date_naissance', valeur: String(currentEleve.showDateNaissance), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.show_date_naissance', valeur: String(currentEleve.showDateNaissance), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_classe', valeur: String(currentEleve.showClasse), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.show_classe', valeur: String(currentEleve.showClasse), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_matricule', valeur: String(currentEleve.showMatricule), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.show_matricule', valeur: String(currentEleve.showMatricule), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_adresse', valeur: String(currentEleve.showAdresse), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.show_adresse', valeur: String(currentEleve.showAdresse), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_groupeSanguin', valeur: String(currentEleve.showGroupeSanguin), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.show_groupe_sanguin', valeur: String(currentEleve.showGroupeSanguin), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.show_groupe_sanguin', valeur: String(currentEleve.showGroupeSanguin), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.bg_image_url', valeur: currentEleve.bgImageUrl, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.eleve.bg_image_url', valeur: currentEleve.bgImageUrl, type_valeur: 'TEXT' },

                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.format', valeur: currentEnseignant.format, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.color_start', valeur: currentEnseignant.colorStart, type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.color_end', valeur: currentEnseignant.colorEnd, type_valeur: 'COLOR' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.gradient_angle', valeur: String(currentEnseignant.gradientAngle), type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.logo_position', valeur: currentEnseignant.logoPosition, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.footer_text', valeur: currentEnseignant.footerText, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.template', valeur: currentEnseignant.template, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_qrcode', valeur: String(currentEnseignant.showQrCode), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_date_naissance', valeur: String(currentEnseignant.showDateNaissance), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_classe', valeur: String(currentEnseignant.showClasse), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_matricule', valeur: String(currentEnseignant.showMatricule), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_adresse', valeur: String(currentEnseignant.showAdresse), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_groupeSanguin', valeur: String(currentEnseignant.showGroupeSanguin), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_groupe_sanguin', valeur: String(currentEnseignant.showGroupeSanguin), type_valeur: 'BOOLEAN' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.bg_image_url', valeur: currentEnseignant.bgImageUrl, type_valeur: 'TEXT' },
                { etablissement_id: etablissementId, categorie: 'CARTE', cle: 'carte.prof.show_matieres', valeur: String(currentEnseignant.showMatieres), type_valeur: 'BOOLEAN' },
            ];

            await api.put(`/api/parametrage/settings?etablissement_id=${etablissementId}`, settings);

            setSavedEleve(currentEleve);
            setSavedEnseignant(currentEnseignant);
            setConfigEleve(currentEleve);
            setConfigEnseignant(currentEnseignant);
            // Update global AppContext immediately (no page refresh needed)
            setCarteConfigEleve(currentEleve);
            setCarteConfigEnseignant(currentEnseignant);
            setCarteConfig(activeRole === 'eleve' ? currentEleve : currentEnseignant);
            
            // Cache to localStorage immediately to prevent race conditions during refresh
            if (typeof window !== 'undefined') {
                localStorage.setItem('carte_config_eleve', JSON.stringify(currentEleve));
                localStorage.setItem('carte_config_enseignant', JSON.stringify(currentEnseignant));
            }

            // Re-sync AppContext from DB to confirm persistence
            refreshTheme();
            showToast('Configuration enregistrée avec succès !', 'success');
        } catch (err) {
            console.error('Erreur sauvegarde:', err);
            showToast('Une erreur est survenue lors de la sauvegarde.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleApplyTemplate = (tpl: typeof TEMPLATES[number]) => {
        setConfig(prev => ({ ...prev, template: tpl.id, colorStart: tpl.colorStart, colorEnd: tpl.colorEnd, gradientAngle: tpl.angle }));
    };

    const updateConfig = (key: keyof CarteConfig, val: CarteConfig[keyof CarteConfig]) => {
        setConfig(prev => ({ ...prev, [key]: val }));
    };

    const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('Sélectionnez un fichier image (PNG, JPG, WEBP).', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast("L'image ne doit pas dépasser 5 Mo.", 'error'); return; }
        try {
            setUploadingBg(true);
            const formData = new FormData();
            formData.append('fichier', file);
            const uploadField = activeRole === 'eleve' ? 'card_bg_eleve' : 'card_bg_prof';
            const res = await api.post<{ url: string }>(
                `/api/parametrage/etablissements/${etablissementId}/upload/${uploadField}`,
                formData, { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            updateConfig('bgImageUrl', res.data.url);
            showToast('Image de fond téléversée !', 'success');
        } catch (err) {
            console.error(err);
            showToast('Erreur lors du téléversement.', 'error');
        } finally {
            setUploadingBg(false);
        }
    };

    const handleRemoveBg = () => { updateConfig('bgImageUrl', ''); showToast('Image retirée.', 'success'); };

    const currentEleve = activeRole === 'eleve' ? config : configEleve;
    const currentEnseignant = activeRole === 'enseignant' ? config : configEnseignant;
    const isDirty = JSON.stringify(currentEleve) !== JSON.stringify(savedEleve) || JSON.stringify(currentEnseignant) !== JSON.stringify(savedEnseignant);
    const mockAgent = activeRole === 'eleve' ? MOCK_AGENT : MOCK_ENSEIGNANT;

    if (loading) {
        return (
            <SettingsLayout title="Format des Cartes Scolaires" subtitle="Personnalisation visuelle des badges scolaires">
                <div className={styles.loadingWrapper}>
                    <Loader2 size={40} className={styles.spinner} />
                    <p>Chargement des paramètres...</p>
                </div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout title="Format des Cartes Scolaires" subtitle="Gérez l'orientation, les couleurs, le logo et les informations à afficher">
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                         className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
                        initial={{ opacity: 0, y: -30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    >
                        {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
                        <span>{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Prominent Role Selector Banner */}
            <div className={styles.roleSelectionBanner}>
                <span className={styles.roleSelectionLabel}>Type de badge à configurer :</span>
                <div className={styles.roleSelector}>
                    <button
                        type="button"
                        className={`${styles.roleTab} ${activeRole === 'eleve' ? styles.roleTabActive : ''}`}
                        onClick={() => handleRoleChange('eleve')}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><GraduationCap size={16} /> Élève</span>
                    </button>
                    <button
                        type="button"
                        className={`${styles.roleTab} ${activeRole === 'enseignant' ? styles.roleTabActive : ''}`}
                        onClick={() => handleRoleChange('enseignant')}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Briefcase size={16} /> Enseignant</span>
                    </button>
                </div>
            </div>

            {/* ─── 2-Column Premium Spacious Layout ─── */}
            <div className={styles.pageLayout}>

                {/* ── Left side: Config Panel (Grid of Cards) ── */}
                <main className={styles.configArea}>
                    <div className={styles.matrixGrid}>

                        {/* Block 1: Modèles de Thèmes */}
                        <div className={styles.matrixCard}>
                            <div className={styles.matrixCardHeader}>
                                <div className={styles.matrixCardIcon}>
                                    <Sparkles size={16} />
                                </div>
                                <div className={styles.matrixCardTitle}>
                                    <h3>Thèmes de Base</h3>
                                    <p>Appliquez instantanément un dégradé de couleur harmonieux.</p>
                                </div>
                            </div>
                            <div className={styles.templatesGrid}>
                                {TEMPLATES.map(tpl => {
                                    const isSelected = config.colorStart === tpl.colorStart && config.colorEnd === tpl.colorEnd;
                                    return (
                                        <button
                                            key={tpl.id}
                                            type="button"
                                            className={`${styles.tplCard} ${isSelected ? styles.tplCardActive : ''}`}
                                            onClick={() => handleApplyTemplate(tpl)}
                                        >
                                            <div
                                                className={styles.tplPreview}
                                                style={{ background: `linear-gradient(${tpl.angle}deg, ${tpl.colorStart}, ${tpl.colorEnd})` }}
                                            >
                                                <span className={styles.tplEmoji}>{tpl.emoji}</span>
                                                {isSelected && (
                                                    <span className={styles.tplCheck}><Check size={12} /></span>
                                                )}
                                            </div>
                                            <div className={styles.tplInfo}>
                                                <span className={styles.tplName}>{tpl.label}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Block 2: Format & Orientation */}
                        <div className={styles.matrixCard}>
                            <div className={styles.matrixCardHeader}>
                                <div className={styles.matrixCardIcon}>
                                    <Layout size={16} />
                                </div>
                                <div className={styles.matrixCardTitle}>
                                    <h3>Format & Dimensions</h3>
                                    <p>Choisissez le rapport de forme optimal pour l'orientation.</p>
                                </div>
                            </div>
                            <div className={styles.formatGrid}>
                                {FORMATS.map(f => {
                                    const isActive = config.format === f.id;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            className={`${styles.formatCard} ${isActive ? styles.formatCardActive : ''}`}
                                            onClick={() => updateConfig('format', f.id)}
                                        >
                                            <div className={`${styles.formatShape} ${styles[`formatShape_${f.id}`]}`} />
                                            <span className={styles.formatLabel}>{f.label}</span>
                                            <span className={styles.formatDims}>{f.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Block 3: Couleurs & Arrière-plan */}
                        <div className={styles.matrixCard}>
                            <div className={styles.matrixCardHeader}>
                                <div className={styles.matrixCardIcon}>
                                    <Palette size={16} />
                                </div>
                                <div className={styles.matrixCardTitle}>
                                    <h3>Dégradés & Image</h3>
                                    <p>Couleurs personnalisées et filigrane d'arrière-plan.</p>
                                </div>
                            </div>
                            
                            <div className={styles.colorSection}>
                                <div className={styles.colorRow}>
                                    <div className={styles.colorField}>
                                        <label className={styles.colorLabel}>Départ</label>
                                        <div className={styles.colorInputGroup}>
                                            <div className={styles.colorSwatch} style={{ background: config.colorStart }}>
                                                <input type="color" value={config.colorStart} onChange={e => updateConfig('colorStart', e.target.value)} className={styles.colorNativeInput} />
                                            </div>
                                            <input
                                                type="text" value={config.colorStart.toUpperCase()}
                                                onChange={e => updateConfig('colorStart', e.target.value)}
                                                maxLength={7} className={styles.colorHexInput}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.colorArrow}>→</div>
                                    <div className={styles.colorField}>
                                        <label className={styles.colorLabel}>Fin</label>
                                        <div className={styles.colorInputGroup}>
                                            <div className={styles.colorSwatch} style={{ background: config.colorEnd }}>
                                                <input type="color" value={config.colorEnd} onChange={e => updateConfig('colorEnd', e.target.value)} className={styles.colorNativeInput} />
                                            </div>
                                            <input
                                                type="text" value={config.colorEnd.toUpperCase()}
                                                onChange={e => updateConfig('colorEnd', e.target.value)}
                                                maxLength={7} className={styles.colorHexInput}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.sliderSection}>
                                    <div className={styles.sliderLabelRow}>
                                        <label>Orientation ({config.gradientAngle}°)</label>
                                    </div>
                                    <input
                                        type="range" min="0" max="360" value={config.gradientAngle}
                                        onChange={e => updateConfig('gradientAngle', parseInt(e.target.value, 10))}
                                        className={styles.rangeSlider}
                                    />
                                </div>

                                <div className={styles.bgImageSection}>
                                    {config.bgImageUrl ? (
                                        <div className={styles.bgPreview}>
                                            <div
                                                className={styles.bgThumb}
                                                style={{ backgroundImage: `url(${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${config.bgImageUrl})` }}
                                            />
                                            <div className={styles.bgInfo}>
                                                <span className={styles.bgName}>Image active</span>
                                            </div>
                                            <button type="button" className={styles.bgRemove} onClick={handleRemoveBg}>
                                                <X size={15} />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className={styles.bgDropZone}>
                                            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleBgUpload} style={{ display: 'none' }} disabled={uploadingBg} />
                                            {uploadingBg ? (
                                                <><Loader2 size={16} className={styles.spinIcon} /><span>Envoi...</span></>
                                            ) : (
                                                <><Upload size={16} /><span>Sélectionner une image de fond</span></>
                                            )}
                                        </label>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Block 4: Champs Visibles */}
                        <div className={styles.matrixCard}>
                            <div className={styles.matrixCardHeader}>
                                <div className={styles.matrixCardIcon}>
                                    <ToggleLeft size={16} />
                                </div>
                                <div className={styles.matrixCardTitle}>
                                    <h3>Champs Visibles</h3>
                                    <p>Activez ou désactivez les informations à faire figurer.</p>
                                </div>
                            </div>
                            <div className={styles.toggleList}>
                                {[
                                    { key: 'showQrCode', label: 'Code QR de pointage', desc: 'Matricule pour scan des présences' },
                                    { key: 'showClasse', label: activeRole === 'eleve' ? "Classe de l'élève" : 'Classes enseignées', desc: activeRole === 'eleve' ? "Classe de l'élève (ex: 6ème A)" : 'Classes attribuées à l\'enseignant' },
                                    ...(activeRole === 'enseignant' ? [{ key: 'showMatieres', label: 'Matières enseignées', desc: 'Disciplines attribuées' }] : []),
                                    { key: 'showMatricule', label: 'Numéro matricule', desc: 'Identifiant officiel de l\'établissement' },
                                    { key: 'showDateNaissance', label: 'Date de naissance', desc: 'Affiche la date de naissance' },
                                    { key: 'showAdresse', label: 'Adresse résidentielle', desc: 'Adresse déclarée de l\'agent ou de l\'élève' },
                                    { key: 'showGroupeSanguin', label: 'Groupe sanguin', desc: 'Sécurité et urgence médicale' },
                                ].map(item => (
                                    <div key={item.key} className={styles.toggleItem}>
                                        <div className={styles.toggleItemText}>
                                            <span className={styles.toggleItemLabel}>{item.label}</span>
                                            <span className={styles.toggleItemDesc}>{item.desc}</span>
                                        </div>
                                        <Toggle
                                            checked={!!config[item.key as keyof CarteConfig]}
                                            onChange={v => updateConfig(item.key as keyof CarteConfig, v)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Block 5: Alignement du Logo */}
                        <div className={styles.matrixCard}>
                            <div className={styles.matrixCardHeader}>
                                <div className={styles.matrixCardIcon}>
                                    <Monitor size={16} />
                                </div>
                                <div className={styles.matrixCardTitle}>
                                    <h3>Alignement du Logo</h3>
                                    <p>Position du logo d'établissement dans la bande supérieure.</p>
                                </div>
                            </div>
                            <div className={styles.logoPosGrid}>
                                {LOGO_POSITIONS.map(p => {
                                    const Icon = p.icon;
                                    const isActive = config.logoPosition === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            className={`${styles.logoPosCard} ${isActive ? styles.logoPosCardActive : ''}`}
                                            onClick={() => updateConfig('logoPosition', p.id)}
                                        >
                                            <div className={styles.logoPosIcon}><Icon size={18} /></div>
                                            <span className={styles.logoPosLabel}>{p.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Block 6: Mention de Bas de page */}
                        <div className={styles.matrixCard}>
                            <div className={styles.matrixCardHeader}>
                                <div className={styles.matrixCardIcon}>
                                    <Type size={16} />
                                </div>
                                <div className={styles.matrixCardTitle}>
                                    <h3>Mention de Bas de Page</h3>
                                    <p>Texte ou slogan officiel à inscrire tout en bas.</p>
                                </div>
                            </div>
                            <div className={styles.footerSection}>
                                <textarea
                                    className={styles.footerTextarea}
                                    value={config.footerText}
                                    onChange={e => updateConfig('footerText', e.target.value.slice(0, 100))}
                                    placeholder="Ex: SmartSchool — Excellence Éducative"
                                    maxLength={100}
                                    rows={3}
                                />
                                <div className={styles.charCount}>
                                    <span>{config.footerText.length}/100 caractères</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

            </div>

            {/* ── Floating Draggable Preview Widget ── */}
            <div className={styles.floatingContainer}>
                <AnimatePresence mode="wait">
                    {!previewOpen ? (
                        <motion.div
                            key="fab"
                            drag
                            dragMomentum={false}
                            dragElastic={0.1}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className={styles.draggableWrapper}
                        >
                            <button
                                type="button"
                                onClick={() => setPreviewOpen(true)}
                                className={styles.floatingBtn}
                            >
                                <span className={styles.floatingBtnIcon}>
                                    <Eye size={18} />
                                </span>
                                <span>Aperçu du Badge</span>
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="window"
                            drag
                            dragMomentum={false}
                            dragElastic={0.1}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className={styles.draggableWrapper}
                        >
                            <div className={styles.floatingWindow}>
                                {/* Drag Handle / Header */}
                                <div className={styles.floatingWinHeader}>
                                    <div className={styles.floatingWinTitle}>
                                        <Eye size={16} />
                                        <span>Aperçu ({activeRole === 'eleve' ? 'Élève' : 'Enseignant'})</span>
                                    </div>
                                    <div className={styles.floatingWinActions}>
                                        <button
                                            type="button"
                                            title="Masquer l'aperçu"
                                            onClick={() => setPreviewOpen(false)}
                                            className={styles.floatingWinBtn}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className={styles.floatingWinBody}>
                                    <div className={styles.floatingWinScale}>
                                        <BadgeCarte
                                            agent={mockAgent}
                                            carteConfig={config}
                                            id="preview-badge-carte"
                                        />
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className={styles.floatingWinFooter}>
                                    <span>Maintenez et glissez pour déplacer</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ─── Sticky Action Bar ─── */}
            <AnimatePresence>
                {isDirty && (
                    <motion.div
                        className={styles.stickyBar}
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    >
                        <div className={styles.stickyInner}>
                            <div className={styles.stickyLeft}>
                                <span className={styles.stickyDot} />
                                <span className={styles.stickyText}>Modifications non enregistrées</span>
                            </div>
                            <div className={styles.stickyActions}>
                                <button type="button" className={styles.stickyCancel} onClick={loadSettings}>Annuler</button>
                                <button type="button" className={styles.stickySave} onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 size={16} className={styles.spinIcon} /> : <Save size={16} />}
                                    <span>Enregistrer les modifications</span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </SettingsLayout>
    );
}
