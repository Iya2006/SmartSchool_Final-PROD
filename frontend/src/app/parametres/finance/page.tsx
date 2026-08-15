'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wallet, Receipt, AlertTriangle, Users, Lock, Save, CheckCircle,
    Loader2, Plus, Trash2, Pencil, Check, X, KeyRound, ShieldCheck, Calendar
} from 'lucide-react';
import SettingsLayout from '@/components/SettingsLayout';
import api from '@/lib/api';
import styles from './Finance.module.css';

// ─── Constantes ─────────────────────────────────────────────────────────────
const DEVISES = [
    { code: 'GNF', label: 'Franc Guinéen (GNF)' },
    { code: 'XOF', label: 'Franc CFA (XOF)' },
    { code: 'EUR', label: 'Euro (EUR)' },
    { code: 'USD', label: 'Dollar Américain (USD)' },
];

const FREQUENCES_GLOBALES = [
    { id: 'MENSUEL', label: 'Mensuel' },
    { id: 'TRIMESTRIEL', label: 'Trimestriel' },
    { id: 'ANNUEL', label: 'Annuel' },
];

const CATEGORIES_FRAIS = ['Inscription', 'Scolarité', 'Transport', 'Cantine', 'Uniforme', 'Fournitures', 'Activités', 'Réinscription', 'Autre'];
const FREQUENCES_TYPE = ['ANNUEL', 'TRIMESTRIEL', 'MENSUEL', 'UNIQUE'];

const TABS = [
    { id: 'general',    label: 'Général',           Icon: Wallet },
    { id: 'frais',       label: 'Types de frais',    Icon: Receipt },
    { id: 'penalites',   label: 'Pénalités',         Icon: AlertTriangle },
    { id: 'reductions',  label: 'Réductions',        Icon: Users },
    { id: 'salaires',    label: 'Salaires',          Icon: Calendar },
    { id: 'securite',    label: 'Reçus & Sécurité',  Icon: Lock },
] as const;
type TabId = typeof TABS[number]['id'];

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface ParametreSetting {
    cle: string;
    valeur: string;
    type_valeur: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'JSON';
}

interface ReductionRule {
    rang: number;
    pourcentage: number;
}

interface FinanceSettings {
    devise: string;
    modes_paiement: string[];
    frequence_paiement: string;
    recu_prefixe: string;
    penalite_active: boolean;
    penalite_type: 'POURCENTAGE' | 'MONTANT';
    penalite_valeur: number;
    penalite_delai_jours: number;
    reduction_active: boolean;
    reductions: ReductionRule[];
    salaires_mois_debut: string; // YYYY-MM, période sur laquelle les salaires sont dus
    salaires_mois_fin: string;   // YYYY-MM, optionnel — vide = pas de fin (en cours)
}

interface TypeFrais {
    type_frais_id: number;
    code: string;
    libelle: string;
    categorie: string;
    montant_defaut: number;
    est_obligatoire: string;
    frequence: string;
    statut: string;
}

type ToastState = { msg: string; type: 'success' | 'error' } | null;

const DEFAULT_SETTINGS: FinanceSettings = {
    devise: 'GNF',
    modes_paiement: ['ESPECES', 'VIREMENT', 'ORANGE_MONEY', 'MTN_MONEY', 'CHEQUE'],
    frequence_paiement: 'ANNUEL',
    recu_prefixe: 'REC',
    penalite_active: false,
    penalite_type: 'POURCENTAGE',
    penalite_valeur: 0,
    penalite_delai_jours: 0,
    reduction_active: false,
    reductions: [],
    salaires_mois_debut: '',
    salaires_mois_fin: '',
};

const EMPTY_TYPE = { code: '', libelle: '', categorie: 'Scolarité', montant_defaut: 0, frequence: 'ANNUEL', est_obligatoire: 'O' };

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseSettings(list: ParametreSetting[]): Partial<FinanceSettings> {
    const out: Record<string, any> = {};
    for (const p of list) {
        const key = p.cle.replace('finance.', '');
        try {
            if (p.type_valeur === 'BOOLEAN') out[key] = p.valeur === 'true';
            else if (p.type_valeur === 'NUMBER') out[key] = parseFloat(p.valeur);
            else if (p.type_valeur === 'JSON') out[key] = JSON.parse(p.valeur);
            else out[key] = p.valeur;
        } catch {
            // ignore une entrée malformée
        }
    }
    return out;
}

function buildParam(key: string, value: any) {
    let type_valeur: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'JSON' = 'TEXT';
    let valeur: string;
    if (typeof value === 'boolean') { type_valeur = 'BOOLEAN'; valeur = String(value); }
    else if (typeof value === 'number') { type_valeur = 'NUMBER'; valeur = String(value); }
    else if (Array.isArray(value) || (value !== null && typeof value === 'object')) { type_valeur = 'JSON'; valeur = JSON.stringify(value); }
    else { valeur = String(value ?? ''); }
    return { etablissement_id: 1, categorie: 'FINANCE', cle: `finance.${key}`, valeur, type_valeur };
}

const extractError = (e: any, defaultMsg: string) => {
    if (e?.response?.data?.detail) {
        const d = e.response.data.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map((err: any) => err.msg).join(', ');
    }
    return e?.message || defaultMsg;
};

/* ─── Toggle Component ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className={styles.toggle}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className={styles.slider} />
        </label>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function FinancePage() {
    const [activeTab, setActiveTab] = useState<TabId>('general');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [toast, setToast] = useState<ToastState>(null);

    const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS);
    const [newModeInput, setNewModeInput] = useState('');

    // ── Types de frais ──
    const [typesFrais, setTypesFrais] = useState<TypeFrais[]>([]);
    const [showNewTypeForm, setShowNewTypeForm] = useState(false);
    const [newType, setNewType] = useState({ ...EMPTY_TYPE });
    const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
    const [editType, setEditType] = useState<Partial<TypeFrais>>({});

    // ── PIN comptabilité ──
    const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);
    const [pinForm, setPinForm] = useState({ ancien: '', nouveau: '', confirmer: '' });
    const [pinMsg, setPinMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [pinSaving, setPinSaving] = useState(false);

    // ─── Load ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const loadAll = async () => {
            try {
                const [settingsRes, typesRes, pinRes] = await Promise.all([
                    api.get('/api/parametrage/settings?etablissement_id=1&categorie=FINANCE').catch(() => ({ data: [] })),
                    api.get('/api/finance/types-frais').catch(() => ({ data: [] })),
                    api.get('/api/comptabilite/pin/status').catch(() => ({ data: { configured: false } })),
                ]);
                const parsed = parseSettings(settingsRes.data);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
                setTypesFrais(typesRes.data || []);
                setPinConfigured(!!pinRes.data?.configured);
            } catch (e) {
                console.error(e);
            }
            setLoading(false);
        };
        loadAll();
    }, []);

    const update = useCallback(<K extends keyof FinanceSettings>(key: K, value: FinanceSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    }, []);

    // ─── Save (paramètres généraux) ─────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        try {
            const params = Object.entries(settings).map(([k, v]) => buildParam(k, v));
            await api.put('/api/parametrage/settings?etablissement_id=1', params);
            setHasChanges(false);
            setToast({ msg: 'Paramètres financiers enregistrés avec succès', type: 'success' });
        } catch (e) {
            console.error(e);
            setToast({ msg: "Erreur lors de l'enregistrement", type: 'error' });
        }
        setSaving(false);
        setTimeout(() => setToast(null), 3500);
    };

    const handleCancel = () => {
        setHasChanges(false);
        window.location.reload();
    };

    // ─── Modes de paiement ──────────────────────────────────────────────────
    const addMode = () => {
        const v = newModeInput.trim().toUpperCase().replace(/\s+/g, '_');
        if (!v || settings.modes_paiement.includes(v)) { setNewModeInput(''); return; }
        update('modes_paiement', [...settings.modes_paiement, v]);
        setNewModeInput('');
    };
    const removeMode = (mode: string) => {
        update('modes_paiement', settings.modes_paiement.filter(m => m !== mode));
    };

    // ─── Réductions fratrie ─────────────────────────────────────────────────
    const addReduction = () => {
        const nextRang = (settings.reductions.reduce((max, r) => Math.max(max, r.rang), 1)) + 1;
        update('reductions', [...settings.reductions, { rang: nextRang, pourcentage: 10 }]);
    };
    const updateReduction = (idx: number, field: keyof ReductionRule, value: number) => {
        const copy = [...settings.reductions];
        copy[idx] = { ...copy[idx], [field]: value };
        update('reductions', copy);
    };
    const removeReduction = (idx: number) => {
        update('reductions', settings.reductions.filter((_, i) => i !== idx));
    };

    // ─── Types de frais : CRUD immédiat ─────────────────────────────────────
    const createType = async () => {
        if (!newType.code.trim() || !newType.libelle.trim()) return;
        try {
            const res = await api.post('/api/finance/types-frais', newType);
            setTypesFrais(prev => [...prev, res.data]);
            setNewType({ ...EMPTY_TYPE });
            setShowNewTypeForm(false);
            setToast({ msg: 'Type de frais créé', type: 'success' });
            setTimeout(() => setToast(null), 2500);
        } catch (e: any) {
            setToast({ msg: extractError(e, 'Erreur lors de la création'), type: 'error' });
            setTimeout(() => setToast(null), 3500);
        }
    };

    const startEditType = (tf: TypeFrais) => {
        setEditingTypeId(tf.type_frais_id);
        setEditType({ ...tf });
    };

    const saveEditType = async () => {
        if (editingTypeId == null) return;
        try {
            const res = await api.put(`/api/finance/types-frais/${editingTypeId}`, {
                code: editType.code, libelle: editType.libelle, categorie: editType.categorie,
                montant_defaut: editType.montant_defaut, est_obligatoire: editType.est_obligatoire,
                frequence: editType.frequence,
            });
            setTypesFrais(prev => prev.map(t => t.type_frais_id === editingTypeId ? res.data : t));
            setEditingTypeId(null);
        } catch (e: any) {
            setToast({ msg: extractError(e, 'Erreur lors de la mise à jour'), type: 'error' });
            setTimeout(() => setToast(null), 3500);
        }
    };

    const deleteType = async (id: number) => {
        if (!window.confirm('Supprimer ce type de frais ?')) return;
        try {
            await api.delete(`/api/finance/types-frais/${id}`);
            setTypesFrais(prev => prev.filter(t => t.type_frais_id !== id));
        } catch (e: any) {
            setToast({ msg: extractError(e, 'Suppression impossible'), type: 'error' });
            setTimeout(() => setToast(null), 3500);
        }
    };

    // ─── PIN comptabilité ───────────────────────────────────────────────────
    const submitPinChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinMsg(null);
        if (pinForm.nouveau.length < 4) { setPinMsg({ text: 'Le nouveau PIN doit contenir au moins 4 caractères', type: 'error' }); return; }
        if (pinForm.nouveau !== pinForm.confirmer) { setPinMsg({ text: 'La confirmation ne correspond pas au nouveau PIN', type: 'error' }); return; }
        setPinSaving(true);
        try {
            await api.put('/api/comptabilite/pin', {
                ...(pinConfigured ? { ancien_pin: pinForm.ancien } : {}),
                nouveau_pin: pinForm.nouveau,
            });
            setPinMsg({ text: 'PIN mis à jour avec succès', type: 'success' });
            setPinForm({ ancien: '', nouveau: '', confirmer: '' });
            setPinConfigured(true);
        } catch (e: any) {
            setPinMsg({ text: extractError(e, 'Erreur lors de la modification du PIN'), type: 'error' });
        }
        setPinSaving(false);
    };

    // ─────────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <SettingsLayout title="Finance & Comptabilité" subtitle="Chargement...">
                <div className={styles.loaderWrap}>
                    <Loader2 className={styles.spinner} size={32} style={{ color: '#10b981' }} />
                    <span>Chargement des paramètres financiers...</span>
                </div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout
            title="Finance & Comptabilité"
            subtitle="Devise, modes de paiement, types de frais, pénalités, réductions et sécurité."
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
                    TAB 1 : GÉNÉRAL
                ══════════════════════════════════════ */}
                {activeTab === 'general' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Wallet size={20} className={styles.sectionIcon} />
                                <h3>Devise & Fréquence de Paiement</h3>
                                <span className={styles.sectionSubtitle}>Paramètres globaux de facturation</span>
                            </div>
                            <div className={styles.fieldsGrid}>
                                <div className={styles.fieldRow}>
                                    <label>Devise de l'établissement</label>
                                    <select className={styles.selectFancy} value={settings.devise} onChange={e => update('devise', e.target.value)}>
                                        {DEVISES.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                                    </select>
                                    <span className={styles.infoHint}>Utilisée sur les reçus, factures et rapports financiers</span>
                                </div>
                                <div className={styles.fieldRow}>
                                    <label>Fréquence de paiement par défaut</label>
                                    <select className={styles.selectFancy} value={settings.frequence_paiement} onChange={e => update('frequence_paiement', e.target.value)}>
                                        {FREQUENCES_GLOBALES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                                    </select>
                                    <span className={styles.infoHint}>Valeur proposée par défaut lors de la création d'un type de frais</span>
                                </div>
                            </div>
                        </section>

                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Wallet size={20} className={styles.sectionIcon} />
                                <h3>Modes de Paiement Acceptés</h3>
                                <span className={styles.sectionSubtitle}>Liste configurable proposée dans les formulaires de paiement</span>
                            </div>
                            <div className={styles.chipsList}>
                                {settings.modes_paiement.map(mode => (
                                    <span key={mode} className={styles.chip}>
                                        {mode.replace(/_/g, ' ')}
                                        <button type="button" className={styles.chipRemove} onClick={() => removeMode(mode)}>
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                                {settings.modes_paiement.length === 0 && (
                                    <span className={styles.infoHint}>Aucun mode de paiement configuré</span>
                                )}
                            </div>
                            <div className={styles.chipAddForm}>
                                <input
                                    className={styles.inputFancy}
                                    placeholder="Ex: PAYPAL, MOBILE_MONEY..."
                                    value={newModeInput}
                                    onChange={e => setNewModeInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMode(); } }}
                                />
                                <button type="button" className={styles.chipAddBtn} onClick={addMode}>
                                    <Plus size={15} /> Ajouter
                                </button>
                            </div>
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB 2 : TYPES DE FRAIS
                ══════════════════════════════════════ */}
                {activeTab === 'frais' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Receipt size={20} className={styles.sectionIcon} />
                                <h3>Types de Frais</h3>
                                <span className={styles.sectionSubtitle}>Scolarité, inscription, cantine, transport...</span>
                            </div>

                            <div className={styles.tableWrap}>
                                <div className={styles.tableHeader}>
                                    <span>Code</span><span>Libellé</span><span>Catégorie</span>
                                    <span>Montant</span><span>Fréquence</span><span>Obligatoire</span><span></span>
                                </div>
                                {typesFrais.map(tf => {
                                    const isEditing = editingTypeId === tf.type_frais_id;
                                    return (
                                        <div key={tf.type_frais_id} className={styles.tableRow}>
                                            {isEditing ? (
                                                <>
                                                    <input className={styles.smallInput} value={editType.code || ''} onChange={e => setEditType(v => ({ ...v, code: e.target.value }))} />
                                                    <input className={styles.smallInput} value={editType.libelle || ''} onChange={e => setEditType(v => ({ ...v, libelle: e.target.value }))} />
                                                    <select className={styles.smallInput} value={editType.categorie || ''} onChange={e => setEditType(v => ({ ...v, categorie: e.target.value }))}>
                                                        {CATEGORIES_FRAIS.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    <input type="number" className={styles.smallInput} value={editType.montant_defaut ?? 0} onChange={e => setEditType(v => ({ ...v, montant_defaut: Number(e.target.value) }))} />
                                                    <select className={styles.smallInput} value={editType.frequence || 'ANNUEL'} onChange={e => setEditType(v => ({ ...v, frequence: e.target.value }))}>
                                                        {FREQUENCES_TYPE.map(f => <option key={f} value={f}>{f}</option>)}
                                                    </select>
                                                    <select className={styles.smallInput} value={editType.est_obligatoire || 'O'} onChange={e => setEditType(v => ({ ...v, est_obligatoire: e.target.value }))}>
                                                        <option value="O">Oui</option>
                                                        <option value="N">Non</option>
                                                    </select>
                                                    <div className={styles.actionsCell}>
                                                        <button className={styles.iconBtn} onClick={saveEditType}><Check size={14} /></button>
                                                        <button className={styles.iconBtn} onClick={() => setEditingTypeId(null)}><X size={14} /></button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span className={styles.codeCell}>{tf.code}</span>
                                                    <span className={styles.libelleCell}>{tf.libelle}</span>
                                                    <span className={styles.catPill}>{tf.categorie}</span>
                                                    <span className={styles.montantCell}>{Number(tf.montant_defaut).toLocaleString()} {settings.devise}</span>
                                                    <span className={styles.catPill}>{tf.frequence}</span>
                                                    <span className={styles.catPill}>{tf.est_obligatoire === 'O' ? 'Oui' : 'Non'}</span>
                                                    <div className={styles.actionsCell}>
                                                        <button className={styles.iconBtn} onClick={() => startEditType(tf)}><Pencil size={14} /></button>
                                                        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => deleteType(tf.type_frais_id)}><Trash2 size={14} /></button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}

                                {showNewTypeForm && (
                                    <div className={styles.newTypeForm}>
                                        <input className={styles.smallInput} placeholder="CODE" value={newType.code} onChange={e => setNewType(v => ({ ...v, code: e.target.value.toUpperCase() }))} />
                                        <input className={styles.smallInput} placeholder="Libellé" value={newType.libelle} onChange={e => setNewType(v => ({ ...v, libelle: e.target.value }))} />
                                        <select className={styles.smallInput} value={newType.categorie} onChange={e => setNewType(v => ({ ...v, categorie: e.target.value }))}>
                                            {CATEGORIES_FRAIS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <input type="number" className={styles.smallInput} placeholder="Montant" value={newType.montant_defaut} onChange={e => setNewType(v => ({ ...v, montant_defaut: Number(e.target.value) }))} />
                                        <select className={styles.smallInput} value={newType.frequence} onChange={e => setNewType(v => ({ ...v, frequence: e.target.value }))}>
                                            {FREQUENCES_TYPE.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                        <select className={styles.smallInput} value={newType.est_obligatoire} onChange={e => setNewType(v => ({ ...v, est_obligatoire: e.target.value }))}>
                                            <option value="O">Oui</option>
                                            <option value="N">Non</option>
                                        </select>
                                        <div className={styles.actionsCell}>
                                            <button className={styles.iconBtn} onClick={createType}><Check size={14} /></button>
                                            <button className={styles.iconBtn} onClick={() => setShowNewTypeForm(false)}><X size={14} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!showNewTypeForm && (
                                <button className={styles.addRowBtn} onClick={() => setShowNewTypeForm(true)}>
                                    <Plus size={16} /> Ajouter un type de frais
                                </button>
                            )}
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB 3 : PÉNALITÉS
                ══════════════════════════════════════ */}
                {activeTab === 'penalites' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <AlertTriangle size={20} className={styles.sectionIcon} />
                                <h3>Pénalités de Retard</h3>
                                <span className={styles.sectionSubtitle}>Appliquées automatiquement sur les factures en retard</span>
                            </div>

                            <div className={styles.toggleRow}>
                                <div className={styles.toggleLeft}>
                                    <div className={styles.toggleIconBox}><AlertTriangle size={18} /></div>
                                    <div className={styles.toggleText}>
                                        <h4>Activer les pénalités de retard</h4>
                                        <p>Calcule automatiquement une pénalité sur les échéances dépassées</p>
                                    </div>
                                </div>
                                <Toggle checked={settings.penalite_active} onChange={v => update('penalite_active', v)} />
                            </div>

                            <div className={settings.penalite_active ? '' : styles.disabledZone} style={{ marginTop: '1.5rem' }}>
                                <div className={styles.fieldRow} style={{ marginBottom: '1.25rem' }}>
                                    <label>Type de pénalité</label>
                                    <div className={styles.radioGroup}>
                                        <div
                                            className={`${styles.radioCard} ${settings.penalite_type === 'POURCENTAGE' ? styles.radioCardActive : ''}`}
                                            onClick={() => update('penalite_type', 'POURCENTAGE')}
                                        >
                                            <span className={`${styles.radioDot} ${settings.penalite_type === 'POURCENTAGE' ? styles.radioDotActive : ''}`} />
                                            <span>Pourcentage (%) du montant dû</span>
                                        </div>
                                        <div
                                            className={`${styles.radioCard} ${settings.penalite_type === 'MONTANT' ? styles.radioCardActive : ''}`}
                                            onClick={() => update('penalite_type', 'MONTANT')}
                                        >
                                            <span className={`${styles.radioDot} ${settings.penalite_type === 'MONTANT' ? styles.radioDotActive : ''}`} />
                                            <span>Montant fixe ({settings.devise})</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.fieldsGrid}>
                                    <div className={styles.fieldRow}>
                                        <label>Valeur de la pénalité {settings.penalite_type === 'POURCENTAGE' ? '(%)' : `(${settings.devise})`}</label>
                                        <input type="number" min={0} className={styles.inputFancy} value={settings.penalite_valeur} onChange={e => update('penalite_valeur', Number(e.target.value))} />
                                    </div>
                                    <div className={styles.fieldRow}>
                                        <label>Délai de grâce (jours)</label>
                                        <input type="number" min={0} className={styles.inputFancy} value={settings.penalite_delai_jours} onChange={e => update('penalite_delai_jours', Number(e.target.value))} />
                                        <span className={styles.infoHint}>Aucune pénalité avant ce nombre de jours de retard</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB 4 : RÉDUCTIONS FRATRIE
                ══════════════════════════════════════ */}
                {activeTab === 'reductions' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Users size={20} className={styles.sectionIcon} />
                                <h3>Réductions Automatiques (Fratrie)</h3>
                                <span className={styles.sectionSubtitle}>Réduction appliquée selon le rang de l'enfant dans la famille</span>
                            </div>

                            <div className={styles.toggleRow}>
                                <div className={styles.toggleLeft}>
                                    <div className={styles.toggleIconBox}><Users size={18} /></div>
                                    <div className={styles.toggleText}>
                                        <h4>Activer les réductions fratrie</h4>
                                        <p>Le rang est calculé automatiquement selon la date de naissance des enfants liés au même parent</p>
                                    </div>
                                </div>
                                <Toggle checked={settings.reduction_active} onChange={v => update('reduction_active', v)} />
                            </div>

                            <div className={settings.reduction_active ? '' : styles.disabledZone} style={{ marginTop: '1.25rem' }}>
                                {settings.reductions.map((r, idx) => (
                                    <div key={idx} className={styles.reductionRow}>
                                        <div className={styles.reductionBadge}>Enfant n°
                                            <input type="number" min={2} className={styles.smallInput} style={{ width: 60 }} value={r.rang} onChange={e => updateReduction(idx, 'rang', Number(e.target.value))} />
                                        </div>
                                        <div className={styles.fieldRow}>
                                            <input type="number" min={0} max={100} className={styles.smallInput} value={r.pourcentage} onChange={e => updateReduction(idx, 'pourcentage', Number(e.target.value))} />
                                        </div>
                                        <span className={styles.infoHint}>{r.pourcentage}% de réduction sur le montant facturé</span>
                                        <button className={styles.removeBtn} onClick={() => removeReduction(idx)}><Trash2 size={15} /></button>
                                    </div>
                                ))}
                                {settings.reductions.length === 0 && (
                                    <p className={styles.infoHint} style={{ marginBottom: '1rem' }}>Aucune règle configurée. Ex: 2ème enfant -10%, 3ème enfant -15%.</p>
                                )}
                                <button className={styles.addRowBtn} onClick={addReduction}>
                                    <Plus size={16} /> Ajouter une règle de réduction
                                </button>
</div>
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB : SALAIRES — période de paie
                ══════════════════════════════════════ */}
                {activeTab === 'salaires' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Calendar size={20} className={styles.sectionIcon} />
                                <h3>Période de Paie</h3>
                                <span className={styles.sectionSubtitle}>
                                    De quel mois à quel mois les salaires sont dus — pilote les "arriérés" affichés
                                    dans Comptabilité &gt; Gestion des Paiements &gt; Salaires
                                </span>
                            </div>
                            <div className={styles.fieldsGrid}>
                                <div className={styles.fieldRow}>
                                    <label>Mois de début</label>
                                    <input type="month" className={styles.inputFancy} value={settings.salaires_mois_debut}
                                        onChange={e => update('salaires_mois_debut', e.target.value)} />
                                    <span className={styles.infoHint}>Premier mois à partir duquel un salaire est dû (ex: début de l'année scolaire).</span>
                                </div>
                                <div className={styles.fieldRow}>
                                    <label>Mois de fin (optionnel)</label>
                                    <input type="month" className={styles.inputFancy} value={settings.salaires_mois_fin}
                                        onChange={e => update('salaires_mois_fin', e.target.value)} />
                                    <span className={styles.infoHint}>Laissez vide si la période est toujours en cours (jusqu'au mois actuel).</span>
                                </div>
                            </div>
                            <p className={styles.infoHint} style={{ marginTop: 8 }}>
                                Le Calendrier de paie (dans Comptabilité &gt; Salaires) reste l'outil du comptable pour
                                déclarer la date exacte de paiement de chaque mois — cette période-ci ne fait que
                                borner la fenêtre des mois considérés comme dus par le système.
                            </p>
                        </section>
                    </motion.div>
                )}

                {/* ══════════════════════════════════════
                    TAB 5 : REÇUS & SÉCURITÉ
                ══════════════════════════════════════ */}
                {activeTab === 'securite' && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Receipt size={20} className={styles.sectionIcon} />
                                <h3>Numérotation des Reçus</h3>
                                <span className={styles.sectionSubtitle}>Préfixe appliqué à chaque nouveau reçu de paiement</span>
                            </div>
                            <div className={styles.fieldsGrid}>
                                <div className={styles.fieldRow}>
                                    <label>Préfixe des reçus</label>
                                    <input className={styles.inputFancy} maxLength={10} value={settings.recu_prefixe} onChange={e => update('recu_prefixe', e.target.value.toUpperCase().replace(/\s+/g, ''))} />
                                    <span className={styles.infoHint}>Exemple de numéro généré : {settings.recu_prefixe || 'REC'}-000123</span>
                                </div>
                            </div>
                        </section>

                        <section className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <Lock size={20} className={styles.sectionIcon} />
                                <h3>PIN d'Accès Comptabilité</h3>
                                <span className={styles.sectionSubtitle}>Code de sécurité pour l'accès au module comptable</span>
                            </div>

                            <div className={styles.pinCard}>
                                <div className={styles.pinCardLeft}>
                                    <div className={styles.pinIconBox}><KeyRound size={20} /></div>
                                    <div>
                                        <h4>Code PIN Comptabilité</h4>
                                        <p>Protège l'accès au portail comptable</p>
                                    </div>
                                </div>
                                {pinConfigured !== null && (
                                    <span className={styles.pinStatusBadge}>
                                        <ShieldCheck size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                                        {pinConfigured ? 'Configuré' : 'Non configuré'}
                                    </span>
                                )}
                            </div>

                            <form className={styles.pinForm} onSubmit={submitPinChange}>
                                {/* Masqué tant qu'aucun PIN n'existe : réclamer un
                                    « PIN actuel » jamais choisi rendait la première
                                    configuration impossible. */}
                                {pinConfigured && (
                                    <div className={styles.pinFormRow}>
                                        <label>PIN actuel</label>
                                        <input type="password" className={styles.inputFancy} value={pinForm.ancien} onChange={e => setPinForm(v => ({ ...v, ancien: e.target.value }))} required />
                                    </div>
                                )}
                                <div className
={styles.pinFormRow}>
                                    <label>Nouveau PIN</label>
                                    <input type="password" className={styles.inputFancy} minLength={4} value={pinForm.nouveau} onChange={e => setPinForm(v => ({ ...v, nouveau: e.target.value }))} required />
                                </div>
                                <div className={styles.pinFormRow}>
                                    <label>Confirmer le nouveau PIN</label>
                                    <input type="password" className={styles.inputFancy} minLength={4} value={pinForm.confirmer} onChange={e => setPinForm(v => ({ ...v, confirmer: e.target.value }))} required />
                                </div>
                                {pinMsg && (
                                    <div className={`${styles.pinMsg} ${pinMsg.type === 'success' ? styles.pinMsgSuccess : styles.pinMsgError}`}>
                                        {pinMsg.text}
                                    </div>
                                )}
                                <div className={styles.pinFormActions}>
                                    <button type="submit" className={styles.pinSubmitBtn} disabled={pinSaving}>
                                        {pinSaving ? <Loader2 size={15} className={styles.spinner} /> : <KeyRound size={15} />}
                                        Modifier le PIN
                                    </button>
                                </div>
                            </form>
                        </section>
                    </motion.div>
                )}

            </div>

            {/* ── STICKY SAVE BAR ── */}
            <AnimatePresence>
                {hasChanges && (
                    <motion.div
                        className={styles.stickyBar}
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                    >
                        <div className={styles.stickyContent}>
                            <div className={styles.stickyLeft}>
                                <span className={styles.stickyDot} />
                                <span className={styles.stickyText}>Modifications non enregistrées</span>
                            </div>
                            <div className={styles.stickyActions}>
                                <button className={styles.cancelBtn} onClick={handleCancel}>Annuler</button>
                                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
                                    Enregistrer
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── TOAST ── */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 40 }}
                    >
                        <CheckCircle size={18} />
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </SettingsLayout>
    );
}
