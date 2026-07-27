'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, LayoutTemplate, ToggleLeft, ShieldAlert,
    PenTool, Image as ImageIcon, Save, CheckCircle,
    Loader2, X, Info
} from 'lucide-react';
import SettingsLayout from '@/components/SettingsLayout';
import api from '@/lib/api';
import styles from './Documents.module.css';

// ─── Constantes ─────────────────────────────────────────────────────────────
const TABS = [
    { id: 'modeles',       label: 'Modèles',        Icon: LayoutTemplate },
    { id: 'entete',        label: 'En-tête',        Icon: FileText },
    { id: 'champs',        label: 'Champs',         Icon: ToggleLeft },
    { id: 'appreciations', label: 'Appréciations',  Icon: ShieldAlert },
    { id: 'signatures',    label: 'Signatures',     Icon: PenTool },
    { id: 'filigrane',     label: 'Filigrane',      Icon: ImageIcon },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface ParametreSetting {
    etablissement_id: number;
    categorie: string;
    cle: string;
    valeur: string;
    type_valeur: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'JSON';
}

interface DocumentsSettings {
    template_bulletin: 'classique' | 'moderne' | 'officiel_gn' | 'minimaliste';
    entete_logo: boolean;
    entete_slogan: boolean;
    champ_rang: boolean;
    champ_moyenne_classe: boolean;
    champ_min_max: boolean;
    champ_graphique: boolean;
    champ_photo: boolean;
    seuil_tres_bien: number;
    seuil_bien: number;
    seuil_assez_bien: number;
    seuil_passable: number;
    signature_directeur: boolean;
    signature_prof: boolean;
    signature_parent: boolean;
    filigrane_actif: boolean;
    filigrane_texte: string;
    filigrane_opacite: number;
    filigrane_bulletins: boolean;
    filigrane_certificats: boolean;
    filigrane_recus: boolean;
}

type ToastState = { msg: string; type: 'success' | 'error' } | null;

const DEFAULT_SETTINGS: DocumentsSettings = {
    template_bulletin: 'classique',
    entete_logo: true,
    entete_slogan: true,
    champ_rang: true,
    champ_moyenne_classe: true,
    champ_min_max: true,
    champ_graphique: false,
    champ_photo: true,
    seuil_tres_bien: 16,
    seuil_bien: 14,
    seuil_assez_bien: 12,
    seuil_passable: 10,
    signature_directeur: true,
    signature_prof: true,
    signature_parent: true,
    filigrane_actif: false,
    filigrane_texte: 'SMART SCHOOL',
    filigrane_opacite: 0.08,
    filigrane_bulletins: true,
    filigrane_certificats: true,
    filigrane_recus: false,
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseSettings(list: ParametreSetting[]): Partial<DocumentsSettings> {
    const out: Record<string, any> = {};
    for (const p of list) {
        const key = p.cle.replace('documents.', '');
        try {
            if (p.type_valeur === 'BOOLEAN') out[key] = p.valeur === 'true';
            else if (p.type_valeur === 'NUMBER') out[key] = parseFloat(p.valeur);
            else if (p.type_valeur === 'TEXT') out[key] = p.valeur;
            else if (p.type_valeur === 'JSON') out[key] = JSON.parse(p.valeur);
        } catch (e) {
            console.error(`Erreur parsing ${p.cle}`, e);
        }
    }
    return out;
}

function buildParam(key: string, value: any, type: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'JSON'): ParametreSetting {
    return {
        etablissement_id: 1,
        categorie: 'DOCUMENTS',
        cle: `documents.${key}`,
        valeur: type === 'JSON' ? JSON.stringify(value) : String(value),
        type_valeur: type
    };
}

// ─── Composants Réutilisables ───────────────────────────────────────────────
const ToggleItem = ({ label, desc, checked, onChange, icon: Icon }: any) => (
    <div className={styles.toggleRow}>
        <div className={styles.toggleLeft}>
            <div className={styles.toggleIconBox}>
                <Icon size={20} />
            </div>
            <div className={styles.toggleText}>
                <h4>{label}</h4>
                {desc && <p>{desc}</p>}
            </div>
        </div>
        <label className={styles.toggle}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className={styles.slider}></span>
        </label>
    </div>
);

// ─── Page Principale ────────────────────────────────────────────────────────
export default function DocumentsPage() {
    const [activeTab, setActiveTab] = useState<TabId>('modeles');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<ToastState>(null);

    const [settings, setSettings] = useState<DocumentsSettings>(DEFAULT_SETTINGS);
    const [original, setOriginal] = useState<DocumentsSettings>(DEFAULT_SETTINGS);

    const ETABLISSEMENT_ID = 1; // Temporaire, à remplacer par le vrai contexte
    const CATEGORIE = 'DOCUMENTS';

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/parametrage/settings?etablissement_id=${ETABLISSEMENT_ID}&categorie=${CATEGORIE}`);
            const parsed = parseSettings(res.data);
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            setSettings(merged);
            setOriginal(merged);
        } catch (error) {
            console.error(error);
            showToast('Erreur lors du chargement des paramètres', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const hasChanges = JSON.stringify(settings) !== JSON.stringify(original);

    const handleSave = async () => {
        try {
            setSaving(true);
            const paramsToSave = [
                buildParam('template_bulletin', settings.template_bulletin, 'TEXT'),
                buildParam('entete_logo', settings.entete_logo, 'BOOLEAN'),
                buildParam('entete_slogan', settings.entete_slogan, 'BOOLEAN'),
                buildParam('champ_rang', settings.champ_rang, 'BOOLEAN'),
                buildParam('champ_moyenne_classe', settings.champ_moyenne_classe, 'BOOLEAN'),
                buildParam('champ_min_max', settings.champ_min_max, 'BOOLEAN'),
                buildParam('champ_graphique', settings.champ_graphique, 'BOOLEAN'),
                buildParam('champ_photo', settings.champ_photo, 'BOOLEAN'),
                buildParam('seuil_tres_bien', settings.seuil_tres_bien, 'NUMBER'),
                buildParam('seuil_bien', settings.seuil_bien, 'NUMBER'),
                buildParam('seuil_assez_bien', settings.seuil_assez_bien, 'NUMBER'),
                buildParam('seuil_passable', settings.seuil_passable, 'NUMBER'),
                buildParam('signature_directeur', settings.signature_directeur, 'BOOLEAN'),
                buildParam('signature_prof', settings.signature_prof, 'BOOLEAN'),
                buildParam('signature_parent', settings.signature_parent, 'BOOLEAN'),
                buildParam('filigrane_actif', settings.filigrane_actif, 'BOOLEAN'),
                buildParam('filigrane_texte', settings.filigrane_texte, 'TEXT'),
                buildParam('filigrane_opacite', settings.filigrane_opacite, 'NUMBER'),
                buildParam('filigrane_bulletins', settings.filigrane_bulletins, 'BOOLEAN'),
                buildParam('filigrane_certificats', settings.filigrane_certificats, 'BOOLEAN'),
                buildParam('filigrane_recus', settings.filigrane_recus, 'BOOLEAN'),
            ];

            await api.put(`/api/parametrage/settings?etablissement_id=${ETABLISSEMENT_ID}`, paramsToSave);

            setOriginal(settings);
            showToast('Paramètres enregistrés avec succès !');
        } catch (error) {
            console.error(error);
            showToast('Erreur lors de l\'enregistrement', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => setSettings(original);

    const update = <K extends keyof DocumentsSettings>(k: K, v: DocumentsSettings[K]) => {
        setSettings(s => ({ ...s, [k]: v }));
    };

    if (loading) {
        return (
            <SettingsLayout title="Documents & Bulletins" subtitle="Configuration des modèles et impressions">
                <div className={styles.loaderWrap}>
                    <Loader2 className={styles.spinner} size={40} />
                    <p>Chargement de la configuration...</p>
                </div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout title="Documents & Bulletins" subtitle="Configuration des modèles et impressions">
            <div className={styles.page}>
                {/* ── Navigation Tabs ── */}
                <div className={styles.tabsNav}>
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.Icon className={styles.tabIcon} size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Tab: Modèles ── */}
                {activeTab === 'modeles' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <LayoutTemplate className={styles.sectionIcon} size={24} />
                            <h3>Modèle de Bulletin</h3>
                            <span className={styles.sectionSubtitle}>Choisissez le design officiel de vos bulletins</span>
                        </div>

                        <div className={styles.templateGrid}>
                            <div
                                className={`${styles.templateCard} ${settings.template_bulletin === 'classique' ? styles.templateCardActive : ''}`}
                                onClick={() => update('template_bulletin', 'classique')}
                            >
                                <div className={`${styles.templateMockup} ${styles.mockup_classique}`}>
                                    <div className={styles.mockupHeader}></div>
                                    <div className={styles.mockupBody}>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                    </div>
                                </div>
                                <div className={styles.templateInfo}>
                                    <div className={styles.radioDot}></div>
                                    <div className={styles.templateText}>
                                        <h4>Classique</h4>
                                        <p>Design sobre et traditionnel. Couleur dominante bleu marine. Idéal pour une présentation formelle.</p>
                                    </div>
                                </div>
                            </div>

                            <div
                                className={`${styles.templateCard} ${settings.template_bulletin === 'moderne' ? styles.templateCardActive : ''}`}
                                onClick={() => update('template_bulletin', 'moderne')}
                            >
                                <div className={`${styles.templateMockup} ${styles.mockup_moderne}`}>
                                    <div className={styles.mockupHeader}></div>
                                    <div className={styles.mockupBody}>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                    </div>
                                </div>
                                <div className={styles.templateInfo}>
                                    <div className={styles.radioDot}></div>
                                    <div className={styles.templateText}>
                                        <h4>Moderne</h4>
                                        <p>Épuré et contemporain. Couleurs gris foncé avec nuances claires. Mise en avant des graphiques.</p>
                                    </div>
                                </div>
                            </div>

                            <div
                                className={`${styles.templateCard} ${settings.template_bulletin === 'officiel_gn' ? styles.templateCardActive : ''}`}
                                onClick={() => update('template_bulletin', 'officiel_gn')}
                            >
                                <div className={`${styles.templateMockup} ${styles.mockup_officiel_gn}`}>
                                    <div className={styles.mockupHeader}></div>
                                    <div className={styles.mockupBody}>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                    </div>
                                </div>
                                <div className={styles.templateInfo}>
                                    <div className={styles.radioDot}></div>
                                    <div className={styles.templateText}>
                                        <h4>Officiel Guinéen</h4>
                                        <p>Format aligné sur les standards nationaux. Couleurs de la République (Rouge-Jaune-Vert) en entête.</p>
                                    </div>
                                </div>
                            </div>

                            <div
                                className={`${styles.templateCard} ${settings.template_bulletin === 'minimaliste' ? styles.templateCardActive : ''}`}
                                onClick={() => update('template_bulletin', 'minimaliste')}
                            >
                                <div className={`${styles.templateMockup} ${styles.mockup_minimaliste}`}>
                                    <div className={styles.mockupHeader}></div>
                                    <div className={styles.mockupBody}>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                        <div className={styles.mockupLine}></div>
                                    </div>
                                </div>
                                <div className={styles.templateInfo}>
                                    <div className={styles.radioDot}></div>
                                    <div className={styles.templateText}>
                                        <h4>Minimaliste</h4>
                                        <p>Simple, noir et blanc, très lisible. Consomme moins d'encre à l'impression.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── Tab: En-tête ── */}
                {activeTab === 'entete' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <FileText className={styles.sectionIcon} size={24} />
                            <h3>Éléments d'En-tête</h3>
                            <span className={styles.sectionSubtitle}>Personnalisez le haut des documents</span>
                        </div>
                        <ToggleItem
                            label="Afficher le logo de l'école"
                            desc="Le logo configuré dans les paramètres généraux sera affiché en haut à gauche."
                            checked={settings.entete_logo}
                            onChange={(v: boolean) => update('entete_logo', v)}
                            icon={ImageIcon}
                        />
                        <ToggleItem
                            label="Afficher le slogan"
                            desc="Affiche le slogan de l'école sous le nom de l'établissement."
                            checked={settings.entete_slogan}
                            onChange={(v: boolean) => update('entete_slogan', v)}
                            icon={FileText}
                        />
                    </motion.div>
                )}

                {/* ── Tab: Champs ── */}
                {activeTab === 'champs' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <ToggleLeft className={styles.sectionIcon} size={24} />
                            <h3>Champs du Bulletin</h3>
                            <span className={styles.sectionSubtitle}>Activez ou désactivez les colonnes facultatives</span>
                        </div>
                        <ToggleItem
                            label="Afficher le rang de l'élève"
                            desc="Affiche la position de l'élève par matière et pour le classement général."
                            checked={settings.champ_rang}
                            onChange={(v: boolean) => update('champ_rang', v)}
                            icon={ToggleLeft}
                        />
                        <ToggleItem
                            label="Moyenne de la classe"
                            desc="Ajoute une colonne indiquant la moyenne générale de la classe par matière."
                            checked={settings.champ_moyenne_classe}
                            onChange={(v: boolean) => update('champ_moyenne_classe', v)}
                            icon={ToggleLeft}
                        />
                        <ToggleItem
                            label="Extrêmes (Min / Max)"
                            desc="Affiche la plus faible et la plus forte note de la classe pour chaque matière."
                            checked={settings.champ_min_max}
                            onChange={(v: boolean) => update('champ_min_max', v)}
                            icon={ToggleLeft}
                        />
                        <ToggleItem
                            label="Graphique d'évolution"
                            desc="Affiche un mini graphique radar ou en barre de la performance de l'élève."
                            checked={settings.champ_graphique}
                            onChange={(v: boolean) => update('champ_graphique', v)}
                            icon={ToggleLeft}
                        />
                        <ToggleItem
                            label="Photo de l'élève"
                            desc="Intègre la photo de profil de l'élève sur le bulletin s'il en possède une."
                            checked={settings.champ_photo}
                            onChange={(v: boolean) => update('champ_photo', v)}
                            icon={ImageIcon}
                        />
                    </motion.div>
                )}

                {/* ── Tab: Appréciations ── */}
                {activeTab === 'appreciations' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <ShieldAlert className={styles.sectionIcon} size={24} />
                            <h3>Seuils d'Appréciation</h3>
                            <span className={styles.sectionSubtitle}>Définissez les notes minimales pour chaque mention</span>
                        </div>

                        <div className={styles.thresholdsContainer}>
                            <div className={styles.thresholdRow}>
                                <div className={styles.thresholdDot} style={{ background: '#22c55e' }}></div>
                                <div className={styles.thresholdInfo}>
                                    <h4>Très Bien</h4>
                                    <p>Mention attribuée pour une moyenne supérieure ou égale au seuil.</p>
                                </div>
                                <div className={styles.thresholdInputWrap}>
                                    <span>≥</span>
                                    <input
                                        type="number"
                                        className={styles.thresholdInput}
                                        value={settings.seuil_tres_bien}
                                        onChange={(e) => update('seuil_tres_bien', Number(e.target.value))}
                                        step="0.5"
                                        min="0"
                                        max="20"
                                    />
                                </div>
                            </div>

                            <div className={styles.thresholdRow}>
                                <div className={styles.thresholdDot} style={{ background: '#3b82f6' }}></div>
                                <div className={styles.thresholdInfo}>
                                    <h4>Bien</h4>
                                    <p>Mention attribuée pour une moyenne supérieure ou égale au seuil.</p>
                                </div>
                                <div className={styles.thresholdInputWrap}>
                                    <span>≥</span>
                                    <input
                                        type="number"
                                        className={styles.thresholdInput}
                                        value={settings.seuil_bien}
                                        onChange={(e) => update('seuil_bien', Number(e.target.value))}
                                        step="0.5"
                                        min="0"
                                        max="20"
                                    />
                                </div>
                            </div>

                            <div className={styles.thresholdRow}>
                                <div className={styles.thresholdDot} style={{ background: '#f97316' }}></div>
                                <div className={styles.thresholdInfo}>
                                    <h4>Assez Bien</h4>
                                    <p>Mention attribuée pour une moyenne supérieure ou égale au seuil.</p>
                                </div>
                                <div className={styles.thresholdInputWrap}>
                                    <span>≥</span>
                                    <input
                                        type="number"
                                        className={styles.thresholdInput}
                                        value={settings.seuil_assez_bien}
                                        onChange={(e) => update('seuil_assez_bien', Number(e.target.value))}
                                        step="0.5"
                                        min="0"
                                        max="20"
                                    />
                                </div>
                            </div>

                            <div className={styles.thresholdRow}>
                                <div className={styles.thresholdDot} style={{ background: '#eab308' }}></div>
                                <div className={styles.thresholdInfo}>
                                    <h4>Passable</h4>
                                    <p>Mention attribuée pour une moyenne supérieure ou égale au seuil.</p>
                                </div>
                                <div className={styles.thresholdInputWrap}>
                                    <span>≥</span>
                                    <input
                                        type="number"
                                        className={styles.thresholdInput}
                                        value={settings.seuil_passable}
                                        onChange={(e) => update('seuil_passable', Number(e.target.value))}
                                        step="0.5"
                                        min="0"
                                        max="20"
                                    />
                                </div>
                            </div>

                            <div className={styles.thresholdRow} style={{ opacity: 0.7 }}>
                                <div className={styles.thresholdDot} style={{ background: '#ef4444' }}></div>
                                <div className={styles.thresholdInfo}>
                                    <h4>Insuffisant</h4>
                                    <p>Pour toute note inférieure à {settings.seuil_passable}.</p>
                                </div>
                                <div className={styles.thresholdInputWrap}>
                                    <span>&lt;</span>
                                    <input type="number" className={styles.thresholdInput} value={settings.seuil_passable} disabled />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── Tab: Signatures ── */}
                {activeTab === 'signatures' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <PenTool className={styles.sectionIcon} size={24} />
                            <h3>Zones de Signature</h3>
                            <span className={styles.sectionSubtitle}>Configurez les emplacements de signature en bas de document</span>
                        </div>
                        <ToggleItem
                            label="Signature de la Direction"
                            desc="Prévient un espace pour la signature du directeur ou chef d'établissement."
                            checked={settings.signature_directeur}
                            onChange={(v: boolean) => update('signature_directeur', v)}
                            icon={PenTool}
                        />
                        <ToggleItem
                            label="Signature du Professeur Titulaire"
                            desc="Prévient un espace pour le professeur principal."
                            checked={settings.signature_prof}
                            onChange={(v: boolean) => update('signature_prof', v)}
                            icon={PenTool}
                        />
                        <ToggleItem
                            label="Signature des Parents"
                            desc="Prévient un espace de signature pour les parents ou tuteurs."
                            checked={settings.signature_parent}
                            onChange={(v: boolean) => update('signature_parent', v)}
                            icon={PenTool}
                        />
                    </motion.div>
                )}

                {/* ── Tab: Filigrane ── */}
                {activeTab === 'filigrane' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <ImageIcon className={styles.sectionIcon} size={24} />
                            <h3>Filigrane (Watermark)</h3>
                            <span className={styles.sectionSubtitle}>Protégez vos documents contre la falsification</span>
                        </div>

                        <ToggleItem
                            label="Activer le filigrane"
                            desc="Affiche un texte semi-transparent en arrière-plan des documents générés."
                            checked={settings.filigrane_actif}
                            onChange={(v: boolean) => update('filigrane_actif', v)}
                            icon={ImageIcon}
                        />

                        {settings.filigrane_actif && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className={styles.watermarkOptions}>
                                <div className={styles.fieldsGrid} style={{ marginBottom: '1.5rem' }}>
                                    <div className={styles.fieldRow}>
                                        <label>Texte du filigrane</label>
                                        <input
                                            type="text"
                                            className={styles.inputFancy}
                                            value={settings.filigrane_texte}
                                            onChange={(e) => update('filigrane_texte', e.target.value)}
                                            placeholder="Ex: COPIE ORIGINALE"
                                            maxLength={30}
                                        />
                                    </div>
                                    <div className={styles.fieldRow}>
                                        <label>Opacité (0.01 à 0.5)</label>
                                        <input
                                            type="number"
                                            className={styles.inputFancy}
                                            value={settings.filigrane_opacite}
                                            onChange={(e) => update('filigrane_opacite', Number(e.target.value))}
                                            step="0.01"
                                            min="0.01"
                                            max="0.5"
                                        />
                                    </div>
                                </div>

                                <div className={styles.watermarkPreviewBox}>
                                    <span
                                        className={styles.watermarkText}
                                        style={{ opacity: settings.filigrane_opacite }}
                                    >
                                        {settings.filigrane_texte || 'APERÇU'}
                                    </span>
                                </div>

                                <hr className={styles.divider} style={{ margin: '1.5rem 0' }} />

                                <h4 style={{ fontSize: '0.9rem', color: '#1e293b', marginBottom: '1rem', fontWeight: 700 }}>Appliquer sur :</h4>
                                <ToggleItem
                                    label="Bulletins de notes"
                                    checked={settings.filigrane_bulletins}
                                    onChange={(v: boolean) => update('filigrane_bulletins', v)}
                                    icon={FileText}
                                />
                                <ToggleItem
                                    label="Certificats de scolarité"
                                    checked={settings.filigrane_certificats}
                                    onChange={(v: boolean) => update('filigrane_certificats', v)}
                                    icon={FileText}
                                />
                                <ToggleItem
                                    label="Reçus de paiement"
                                    checked={settings.filigrane_recus}
                                    onChange={(v: boolean) => update('filigrane_recus', v)}
                                    icon={FileText}
                                />
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </div>

            {/* ── Sticky Save Bar ── */}
            <AnimatePresence>
                {hasChanges && (
                    <motion.div
                        className={styles.stickyBar}
                        initial={{ y: 100, opacity: 0, x: '-50%' }}
                        animate={{ y: 0, opacity: 1, x: '-50%' }}
                        exit={{ y: 100, opacity: 0, x: '-50%' }}
                    >
                        <div className={styles.stickyContent}>
                            <div className={styles.stickyLeft}>
                                <div className={styles.stickyDot} />
                                <span className={styles.stickyText}>Modifications non enregistrées</span>
                            </div>
                            <div className={styles.stickyActions}>
                                <button
                                    type="button"
                                    className={styles.cancelBtn}
                                    onClick={handleCancel}
                                    disabled={saving}
                                >
                                    Annuler
                                </button>
                                <button
                                    type="button"
                                    className={styles.saveBtn}
                                    onClick={handleSave}
                                    disabled={saving}
                                >
                                    {saving ? <Loader2 className={styles.spinner} size={18} /> : <Save size={18} />}
                                    Enregistrer
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Toast ── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}
                        initial={{ opacity: 0, y: -50, x: 20 }}
                        animate={{ opacity: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                    >
                        {toast.type === 'success' ? <CheckCircle size={20} /> : <X size={20} />}
                        <span>{toast.msg}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </SettingsLayout>
    );
}
