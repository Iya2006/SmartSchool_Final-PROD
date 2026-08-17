'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CalendarDays, Plus, Save, CheckCircle, Loader2, Pencil, Trash2,
    Power, PlaneTakeoff, Settings2, AlertTriangle, RotateCcw, X, Lock, Coins
} from 'lucide-react';
import SettingsLayout from '@/components/SettingsLayout';
import api from '@/lib/api';
import styles from './Calendrier.module.css';
import { useApp } from '@/context/AppContext';

const ETABLISSEMENT_ID = 1;
const CATEGORIE = 'CALENDRIER';

interface ParametreSetting {
    cle: string;
    valeur: string;
    type_valeur: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'JSON';
}

interface AnneeScolaire {
    annee_id: number;
    etablissement_id: number;
    code: string;
    libelle: string;
    date_debut: string;
    date_fin: string;
    statut: string;
    est_courante: string;
}

interface Trimestre {
    trimestre_id: number;
    annee_id: number;
    code: string;
    libelle: string;
    numero: number;
    date_debut: string;
    date_fin: string;
    statut: string;
}

interface Vacance {
    id: string;
    libelle: string;
    date_debut: string;
    date_fin: string;
}

interface CalendrierSettings {
    mode_decoupage: 'TRIMESTRE' | 'SEMESTRE';
    vacances: Vacance[];
}

type ToastState = { msg: string; type: 'success' | 'error' } | null;
type DeleteDialogState = { id: number; label: string } | null;
type TarifsModalState = { nouvelleAnneeId: number; nouvelleAnneeLibelle: string } | null;
type TarifsMode = 'copier' | 'copier_editer' | 'vide';

const DEFAULT_SETTINGS: CalendrierSettings = {
    mode_decoupage: 'TRIMESTRE',
    vacances: [],
};

const EMPTY_ANNEE = {
    code: '',
    libelle: '',
    date_debut: '',
    date_fin: '',
    statut: 'PLANIFIEE',
    est_courante: 'N',
};

const EMPTY_PERIODE = {
    code: '',
    libelle: '',
    numero: 1,
    date_debut: '',
    date_fin: '',
    statut: 'PLANIFIE',
};

function parseSettings(list: ParametreSetting[]): Partial<CalendrierSettings> {
    const out: Record<string, string | number | boolean | Vacance[] | 'TRIMESTRE' | 'SEMESTRE'> = {};
    for (const p of list) {
        const key = p.cle.replace('calendrier.', '');
        try {
            if (p.type_valeur === 'BOOLEAN') out[key] = p.valeur === 'true';
            else if (p.type_valeur === 'NUMBER') out[key] = parseFloat(p.valeur);
            else if (p.type_valeur === 'JSON') out[key] = JSON.parse(p.valeur);
            else out[key] = p.valeur;
        } catch {
            // ignore malformed setting
        }
    }
    return out;
}

function buildParam(
    key: string,
    value: string | number | boolean | Vacance[]
): ParametreSetting & { etablissement_id: number; categorie: string } {
    let type_valeur: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'JSON' = 'TEXT';
    let valeur: string;

    if (typeof value === 'boolean') {
        type_valeur = 'BOOLEAN';
        valeur = String(value);
    } else if (typeof value === 'number') {
        type_valeur = 'NUMBER';
        valeur = String(value);
    } else if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
        type_valeur = 'JSON';
        valeur = JSON.stringify(value);
    } else {
        valeur = String(value ?? '');
    }

    return {
        etablissement_id: ETABLISSEMENT_ID,
        categorie: CATEGORIE,
        cle: `calendrier.${key}`,
        valeur,
        type_valeur,
    };
}

function uid() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeVacances(vacances: Vacance[] | undefined): Vacance[] {
    if (!Array.isArray(vacances)) return [];
    return vacances.map((vacance, index) => ({
        id: vacance?.id || `vacance_${index}_${uid()}`,
        libelle: vacance?.libelle || '',
        date_debut: vacance?.date_debut || '',
        date_fin: vacance?.date_fin || '',
    }));
}

export default function CalendrierPage() {
    const { refreshAnnee } = useApp();
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [toast, setToast] = useState<ToastState>(null);

    const [annees, setAnnees] = useState<AnneeScolaire[]>([]);
    const [selectedAnneeId, setSelectedAnneeId] = useState<number | null>(null);
    const [trimestres, setTrimestres] = useState<Trimestre[]>([]);

    const [settings, setSettings] = useState<CalendrierSettings>(DEFAULT_SETTINGS);
    const [originalSettings, setOriginalSettings] = useState<CalendrierSettings>(DEFAULT_SETTINGS);

    const [showAnneeForm, setShowAnneeForm] = useState(false);
    const [newAnnee, setNewAnnee] = useState({ ...EMPTY_ANNEE });
    const [editingAnneeId, setEditingAnneeId] = useState<number | null>(null);
    const [editAnnee, setEditAnnee] = useState<Partial<AnneeScolaire>>({});

    const [showPeriodeForm, setShowPeriodeForm] = useState(false);
    const [newPeriode, setNewPeriode] = useState({ ...EMPTY_PERIODE });
    const [editingPeriodeId, setEditingPeriodeId] = useState<number | null>(null);
    const [editPeriode, setEditPeriode] = useState<Partial<Trimestre>>({});
    const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
    const [deletingPeriode, setDeletingPeriode] = useState(false);

    const [tarifsModal, setTarifsModal] = useState<TarifsModalState>(null);
    const [tarifsAnneeSourceId, setTarifsAnneeSourceId] = useState<number | null>(null);
    const [tarifsMode, setTarifsMode] = useState<TarifsMode>('copier');
    const [tarifsLoading, setTarifsLoading] = useState(false);

    const labelPeriode = useMemo(() => settings.mode_decoupage === 'SEMESTRE' ? 'semestre' : 'trimestre', [settings.mode_decoupage]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const loadTrimestres = useCallback(async (anneeId: number) => {
        try {
            const res = await api.get(`/api/parametrage/trimestres?annee_id=${anneeId}`);
            setTrimestres(res.data || []);
        } catch (e) {
            console.error(e);
            setTrimestres([]);
        }
    }, []);

    const loadAll = useCallback(async () => {
        try {
            setLoading(true);
            const [anneesRes, settingsRes] = await Promise.all([
                api.get(`/api/parametrage/annees?etablissement_id=${ETABLISSEMENT_ID}`).catch(() => ({ data: [] })),
                api.get(`/api/parametrage/settings?etablissement_id=${ETABLISSEMENT_ID}&categorie=${CATEGORIE}`).catch(() => ({ data: [] })),
            ]);

            const anneesData: AnneeScolaire[] = anneesRes.data || [];
            const rawSettings = { ...DEFAULT_SETTINGS, ...parseSettings(settingsRes.data || []) };
            const parsedSettings: CalendrierSettings = {
                mode_decoupage: rawSettings.mode_decoupage === 'SEMESTRE' ? 'SEMESTRE' : 'TRIMESTRE',
                vacances: normalizeVacances(rawSettings.vacances as Vacance[] | undefined),
            };

            setAnnees(anneesData);
            setSettings(parsedSettings);
            setOriginalSettings(parsedSettings);

            const current = anneesData.find(a => a.est_courante === 'O') || anneesData[0] || null;
            const nextId = current?.annee_id ?? null;
            setSelectedAnneeId(nextId);

            if (nextId) await loadTrimestres(nextId);
            else setTrimestres([]);
        } catch (e) {
            console.error(e);
            showToast('Impossible de charger les paramètres du calendrier pour le moment.', 'error');
        } finally {
            setLoading(false);
        }
    }, [loadTrimestres]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    useEffect(() => {
        if (selectedAnneeId) {
            loadTrimestres(selectedAnneeId);
        } else {
            setTrimestres([]);
        }
    }, [selectedAnneeId, loadTrimestres]);

    const hasSettingsChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

    const handleSaveSettings = async () => {
        try {
            setSavingSettings(true);
            const params = [
                buildParam('mode_decoupage', settings.mode_decoupage),
                buildParam('vacances', settings.vacances),
            ];
            await api.put(`/api/parametrage/settings?etablissement_id=${ETABLISSEMENT_ID}`, params);
            setOriginalSettings(settings);
            showToast('Les paramètres du calendrier ont été enregistrés avec succès.', 'success');
        } catch (e) {
            console.error(e);
            showToast('La sauvegarde du calendrier a échoué. Veuillez réessayer.', 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    const createAnnee = async () => {
        if (!newAnnee.code || !newAnnee.libelle || !newAnnee.date_debut || !newAnnee.date_fin) {
            showToast('Veuillez renseigner tous les champs requis pour l’année scolaire.', 'error');
            return;
        }
        try {
            // L'année la plus récente avant création est le choix par défaut le
            // plus utile comme source de tarifs (le cas le plus fréquent : on
            // vient de clôturer l'année en cours et on ouvre la suivante).
            const anneeSourceParDefaut = annees.find(a => a.est_courante === 'O') || annees[0] || null;

            const res = await api.post('/api/parametrage/annees', {
                etablissement_id: ETABLISSEMENT_ID,
                ...newAnnee,
            });
            setNewAnnee({ ...EMPTY_ANNEE });
            setShowAnneeForm(false);
            await loadAll();
            showToast('La nouvelle année scolaire a été créée avec succès.', 'success');

            const nouvelleAnnee = res.data;
            if (nouvelleAnnee?.annee_id && anneeSourceParDefaut) {
                setTarifsAnneeSourceId(anneeSourceParDefaut.annee_id);
                setTarifsMode('copier');
                setTarifsModal({ nouvelleAnneeId: nouvelleAnnee.annee_id, nouvelleAnneeLibelle: nouvelleAnnee.libelle });
            }
        } catch (e) {
            console.error(e);
            showToast('La création de l’année scolaire a échoué. Vérifiez les informations saisies puis réessayez.', 'error');
        }
    };

    const confirmerTarifsModal = async () => {
        if (!tarifsModal) return;
        if (tarifsMode !== 'vide' && !tarifsAnneeSourceId) {
            showToast('Sélectionnez l’année source des tarifs à reprendre.', 'error');
            return;
        }
        setTarifsLoading(true);
        try {
            await api.post('/api/finance/tarifs/copier', {
                annee_source_id: tarifsAnneeSourceId,
                annee_cible_id: tarifsModal.nouvelleAnneeId,
                mode: tarifsMode,
            });
            showToast(
                tarifsMode === 'vide'
                    ? 'Grille tarifaire laissée vide pour la nouvelle année.'
                    : 'Les tarifs ont été copiés vers la nouvelle année.',
                'success'
            );
            const ouvrirTarifsApresCoup = tarifsMode === 'copier_editer';
            setTarifsModal(null);
            if (ouvrirTarifsApresCoup) {
                window.location.href = '/comptabilite/frais';
            }
        } catch (e: any) {
            console.error(e);
            showToast(e.response?.data?.detail || 'La copie des tarifs a échoué.', 'error');
        } finally {
            setTarifsLoading(false);
        }
    };

    const saveAnneeEdit = async (anneeId: number) => {
        try {
            await api.put(`/api/parametrage/annees/${anneeId}`, editAnnee);
            setEditingAnneeId(null);
            setEditAnnee({});
            await loadAll();
            showToast('Les informations de l’année scolaire ont été mises à jour.', 'success');
        } catch (e) {
            console.error(e);
            showToast('La mise à jour de l’année scolaire a échoué. Veuillez réessayer.', 'error');
        }
    };

    const activateAnnee = async (anneeId: number) => {
        try {
            await api.put(`/api/parametrage/annees/${anneeId}/activer`);
            await loadAll();
            // Propage immédiatement à TOUTE l'app (en-tête, filtres comptabilité,
            // page Classes...) — sans ça, seule cette page se mettait à jour et
            // le reste de l'app restait bloqué sur l'ancienne année jusqu'à un
            // rechargement manuel de la page.
            await refreshAnnee();
            showToast('Cette année scolaire est maintenant définie comme année en cours.', 'success');
        } catch (e) {
            console.error(e);
            showToast('Impossible d’activer cette année scolaire pour le moment.', 'error');
        }
    };

    const deleteAnnee = async (annee: AnneeScolaire) => {
        if (annee.est_courante === 'O') {
            showToast('Impossible de supprimer l’année courante. Activez d’abord une autre année.', 'error');
            return;
        }
        if (!window.confirm(`Supprimer définitivement l’année « ${annee.libelle} » ? (Uniquement si elle est vide — aucun élève, facture ni dépense.)`)) return;
        try {
            await api.delete(`/api/parametrage/annees/${annee.annee_id}`);
            await loadAll();
            showToast(`Année « ${annee.libelle} » supprimée.`, 'success');
        } catch (e: unknown) {
            const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            showToast(detail || 'Suppression impossible pour le moment.', 'error');
        }
    };

    const createPeriode = async () => {
        if (!selectedAnneeId) {
            showToast('Sélectionnez d’abord une année scolaire avant d’ajouter une période.', 'error');
            return;
        }
        if (!newPeriode.code || !newPeriode.libelle || !newPeriode.date_debut || !newPeriode.date_fin) {
            showToast(`Veuillez renseigner tous les champs requis pour ce ${labelPeriode}.`, 'error');
            return;
        }
        try {
            await api.post('/api/parametrage/trimestres', {
                annee_id: selectedAnneeId,
                ...newPeriode,
            });
            setNewPeriode({ ...EMPTY_PERIODE });
            setShowPeriodeForm(false);
            await loadTrimestres(selectedAnneeId);
            showToast(`Le ${labelPeriode} a été créé avec succès.`, 'success');
        } catch (e) {
            console.error(e);
            showToast(`La création du ${labelPeriode} a échoué. Veuillez réessayer.`, 'error');
        }
    };

    const savePeriodeEdit = async (trimestreId: number) => {
        try {
            await api.put(`/api/parametrage/trimestres/${trimestreId}`, editPeriode);
            setEditingPeriodeId(null);
            setEditPeriode({});
            if (selectedAnneeId) await loadTrimestres(selectedAnneeId);
            showToast(`Les informations du ${labelPeriode} ont été mises à jour.`, 'success');
        } catch (e) {
            console.error(e);
            showToast(`La mise à jour du ${labelPeriode} a échoué. Veuillez réessayer.`, 'error');
        }
    };

    const cloturerPeriode = async (trimestreId: number, libelle: string) => {
        if (!confirm(`Clôturer "${libelle}" ? Plus aucune évaluation ni note ne pourra être ajoutée pour cette période, et la période suivante démarrera automatiquement.`)) return;
        try {
            const res = await api.put(`/api/parametrage/trimestres/${trimestreId}/cloturer`);
            if (selectedAnneeId) await loadTrimestres(selectedAnneeId);
            showToast(res.data?.message || `${libelle} a été clôturé avec succès.`, 'success');
        } catch (e: any) {
            console.error(e);
            showToast(e.response?.data?.detail || `La clôture de ${libelle} a échoué.`, 'error');
        }
    };

    const askDeletePeriode = (trimestreId: number, libelle: string) => {
        setDeleteDialog({ id: trimestreId, label: libelle || `ce ${labelPeriode}` });
    };

    const confirmDeletePeriode = async () => {
        if (!deleteDialog) return;
        try {
            setDeletingPeriode(true);
            await api.delete(`/api/parametrage/trimestres/${deleteDialog.id}`);
            if (selectedAnneeId) await loadTrimestres(selectedAnneeId);
            setDeleteDialog(null);
            showToast(`Le ${labelPeriode} a bien été supprimé.`, 'success');
        } catch (e) {
            console.error(e);
            showToast(`La suppression du ${labelPeriode} a échoué. Veuillez réessayer.`, 'error');
        } finally {
            setDeletingPeriode(false);
        }
    };

    const addVacance = () => {
        setSettings(prev => ({
            ...prev,
            vacances: [...prev.vacances, { id: uid(), libelle: '', date_debut: '', date_fin: '' }],
        }));
    };

    const updateVacance = (id: string, field: keyof Vacance, value: string) => {
        setSettings(prev => ({
            ...prev,
            vacances: prev.vacances.map(v => v.id === id ? { ...v, [field]: value } : v),
        }));
    };

    const removeVacance = (id: string) => {
        setSettings(prev => ({
            ...prev,
            vacances: prev.vacances.filter(v => v.id !== id),
        }));
    };

    if (loading) {
        return (
            <SettingsLayout title="Années & Trimestres" subtitle="Configuration du calendrier scolaire, des périodes et des vacances">
                <div className={styles.loaderWrap}>
                    <Loader2 className={styles.spinner} size={40} />
                    <p>Chargement du calendrier scolaire...</p>
                </div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout title="Années & Trimestres" subtitle="Gérez les années scolaires, les périodes et les vacances de l'établissement">
            <div className={styles.page}>
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
                        >
                            {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                            <span>{toast.msg}</span>
                        </motion.div>
                    )}
                    {deleteDialog && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={styles.modalOverlay}
                            onClick={() => !deletingPeriode && setDeleteDialog(null)}
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                                className={styles.modalCard}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className={styles.modalHeader}>
                                    <div className={styles.modalIconWrap}>
                                        <AlertTriangle size={18} />
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.modalClose}
                                        onClick={() => setDeleteDialog(null)}
                                        disabled={deletingPeriode}
                                        aria-label="Fermer"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className={styles.modalBody}>
                                    <h3>Supprimer cette période ?</h3>
                                    <p>
                                        Vous êtes sur le point de supprimer <strong>{deleteDialog.label}</strong>.
                                        Cette action est définitive et ne pourra pas être annulée.
                                    </p>
                                </div>

                                <div className={styles.modalActions}>
                                    <button
                                        type="button"
                                        className={styles.modalSecondaryBtn}
                                        onClick={() => setDeleteDialog(null)}
                                        disabled={deletingPeriode}
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.modalDangerBtn}
                                        onClick={confirmDeletePeriode}
                                        disabled={deletingPeriode}
                                    >
                                        {deletingPeriode ? <Loader2 className={styles.spinInline} size={16} /> : <Trash2 size={16} />}
                                        <span>Supprimer</span>
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                    {tarifsModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={styles.modalOverlay}
                            onClick={() => !tarifsLoading && setTarifsModal(null)}
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                                className={styles.modalCard}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className={styles.modalHeader}>
                                    <div className={styles.modalIconWrap}>
                                        <Coins size={18} />
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.modalClose}
                                        onClick={() => setTarifsModal(null)}
                                        disabled={tarifsLoading}
                                        aria-label="Fermer"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className={styles.modalBody}>
                                    <h3>Grille tarifaire de {tarifsModal.nouvelleAnneeLibelle}</h3>
                                    <p>
                                        Cette nouvelle année ne contient encore aucun tarif. Comment voulez-vous
                                        démarrer sa grille tarifaire (frais par classe) ?
                                    </p>

                                    <div className={styles.formGrid} style={{ marginTop: 12 }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <span style={{ fontSize: 12, color: '#64748b' }}>Reprendre les tarifs de l’année</span>
                                            <select
                                                className={styles.input}
                                                value={tarifsAnneeSourceId ?? ''}
                                                disabled={tarifsMode === 'vide'}
                                                onChange={e => setTarifsAnneeSourceId(e.target.value ? Number(e.target.value) : null)}
                                            >
                                                <option value="">— Sélectionner —</option>
                                                {annees.filter(a => a.annee_id !== tarifsModal.nouvelleAnneeId).map(a => (
                                                    <option key={a.annee_id} value={a.annee_id}>{a.libelle}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                                        {([
                                            { value: 'copier' as const, label: 'Reprendre automatiquement', desc: 'Copie les tarifs existants tels quels vers la nouvelle année.' },
                                            { value: 'copier_editer' as const, label: 'Reprendre puis modifier', desc: 'Copie les tarifs, puis ouvre l’écran de modification.' },
                                            { value: 'vide' as const, label: 'Grille vide', desc: 'Ne rien copier — vous configurerez les tarifs manuellement.' },
                                        ]).map(opt => (
                                            <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 8, border: `1px solid ${tarifsMode === opt.value ? '#10b981' : '#e2e8f0'}`, background: tarifsMode === opt.value ? '#ecfdf5' : '#fff', cursor: 'pointer' }}>
                                                <input type="radio" name="tarifsMode" checked={tarifsMode === opt.value} onChange={() => setTarifsMode(opt.value)} style={{ marginTop: 3 }} />
                                                <span>
                                                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{opt.label}</span>
                                                    <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{opt.desc}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className={styles.modalActions}>
                                    <button
                                        type="button"
                                        className={styles.modalSecondaryBtn}
                                        onClick={() => setTarifsModal(null)}
                                        disabled={tarifsLoading}
                                    >
                                        Plus tard
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.primaryBtn}
                                        onClick={confirmerTarifsModal}
                                        disabled={tarifsLoading}
                                    >
                                        {tarifsLoading ? <Loader2 className={styles.spinInline} size={16} /> : <Save size={16} />}
                                        <span>Confirmer</span>
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <section className={styles.heroCard}>
                    <div>
                        <div className={styles.heroBadge}><CalendarDays size={16} /> Calendrier académique</div>
                        <h2>Découpage de l’année et vacances scolaires</h2>
                        <p>Choisissez le mode trimestre/semestre et personnalisez les vacances utilisées par l’administration.</p>
                    </div>
                    <div className={styles.heroActions}>
                        <button
                            className={`${styles.modeBtn} ${settings.mode_decoupage === 'TRIMESTRE' ? styles.modeBtnActive : ''}`}
                            onClick={() => setSettings(s => ({ ...s, mode_decoupage: 'TRIMESTRE' }))}
                        >
                            Trimestres
                        </button>
                        <button
                            className={`${styles.modeBtn} ${settings.mode_decoupage === 'SEMESTRE' ? styles.modeBtnActive : ''}`}
                            onClick={() => setSettings(s => ({ ...s, mode_decoupage: 'SEMESTRE' }))}
                        >
                            Semestres
                        </button>
                        <button className={styles.primaryBtn} onClick={handleSaveSettings} disabled={savingSettings || !hasSettingsChanges}>
                            {savingSettings ? <Loader2 className={styles.spinInline} size={16} /> : <Save size={16} />}
                            <span>Enregistrer</span>
                        </button>
                    </div>
                </section>

                <div className={styles.grid}>
                    <section className={styles.card}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h3>Années scolaires</h3>
                                <p>Créez, modifiez et activez l’année utilisée par l’établissement.</p>
                            </div>
                            <button className={styles.secondaryBtn} onClick={() => setShowAnneeForm(v => !v)}>
                                <Plus size={16} />
                                <span>Nouvelle année</span>
                            </button>
                        </div>

                        {showAnneeForm && (
                            <div className={styles.formBox}>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Code (ex: 2026-2027)" value={newAnnee.code} onChange={e => setNewAnnee(s => ({ ...s, code: e.target.value }))} />
                                    <input className={styles.input} placeholder="Libellé" value={newAnnee.libelle} onChange={e => setNewAnnee(s => ({ ...s, libelle: e.target.value }))} />
                                    <input className={styles.input} type="date" value={newAnnee.date_debut} onChange={e => setNewAnnee(s => ({ ...s, date_debut: e.target.value }))} />
                                    <input className={styles.input} type="date" value={newAnnee.date_fin} onChange={e => setNewAnnee(s => ({ ...s, date_fin: e.target.value }))} />
                                </div>
                                <div className={styles.formActions}>
                                    <button className={styles.primaryBtn} onClick={createAnnee}><Save size={16} /><span>Créer</span></button>
                                    <button className={styles.ghostBtn} onClick={() => { setShowAnneeForm(false); setNewAnnee({ ...EMPTY_ANNEE }); }}><RotateCcw size={16} /><span>Annuler</span></button>
                                </div>
                            </div>
                        )}

                        <div className={styles.list}>
                            {annees.map((annee) => {
                                const isEditing = editingAnneeId === annee.annee_id;
                                const model = isEditing ? { ...annee, ...editAnnee } : annee;
                                return (
                                    <div key={annee.annee_id} className={`${styles.listItem} ${selectedAnneeId === annee.annee_id ? styles.listItemActive : ''}`}>
                                        <div className={styles.itemTop}>
                                            <button className={styles.itemSelect} onClick={() => setSelectedAnneeId(annee.annee_id)}>
                                                <strong>{annee.code}</strong>
                                                <span>{annee.libelle}</span>
                                            </button>
                                            <div className={styles.badges}>
                                                {annee.est_courante === 'O' && <span className={styles.badgeCurrent}>Courante</span>}
                                                <span className={styles.badgeMuted}>{annee.statut}</span>
                                            </div>
                                        </div>

                                        {isEditing ? (
                                            <div className={styles.inlineEditor}>
                                                <div className={styles.formGrid}>
                                                    <input className={styles.input} value={String(model.code ?? '')} onChange={e => setEditAnnee(s => ({ ...s, code: e.target.value }))} />
                                                    <input className={styles.input} value={String(model.libelle ?? '')} onChange={e => setEditAnnee(s => ({ ...s, libelle: e.target.value }))} />
                                                    <input className={styles.input} type="date" value={String(model.date_debut ?? '')} onChange={e => setEditAnnee(s => ({ ...s, date_debut: e.target.value }))} />
                                                    <input className={styles.input} type="date" value={String(model.date_fin ?? '')} onChange={e => setEditAnnee(s => ({ ...s, date_fin: e.target.value }))} />
                                                </div>
                                                <div className={styles.formActions}>
                                                    <button className={styles.primaryBtn} onClick={() => saveAnneeEdit(annee.annee_id)}><Save size={16} /><span>Sauvegarder</span></button>
                                                    <button className={styles.ghostBtn} onClick={() => { setEditingAnneeId(null); setEditAnnee({}); }}><RotateCcw size={16} /><span>Fermer</span></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={styles.itemMeta}>
                                                <span>{annee.date_debut} → {annee.date_fin}</span>
                                            </div>
                                        )}

                                        <div className={styles.itemActions}>
                                            <button className={styles.iconBtn} onClick={() => { setEditingAnneeId(annee.annee_id); setEditAnnee(annee); }}><Pencil size={16} /></button>
                                            <button className={styles.iconBtn} onClick={() => activateAnnee(annee.annee_id)} title="Activer"><Power size={16} /></button>
                                            {annee.est_courante !== 'O' && (
                                                <button className={styles.iconBtnDanger} onClick={() => deleteAnnee(annee)} title="Supprimer (si vide)"><Trash2 size={16} /></button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {annees.length === 0 && <p className={styles.empty}>Aucune année scolaire enregistrée.</p>}
                        </div>
                    </section>

                    <section className={styles.card}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h3>{labelPeriode.charAt(0).toUpperCase() + labelPeriode.slice(1)}s de l’année sélectionnée</h3>
                                <p>Définissez les dates de début et de fin de chaque période académique.</p>
                            </div>
                            <button className={styles.secondaryBtn} onClick={() => setShowPeriodeForm(v => !v)} disabled={!selectedAnneeId}>
                                <Plus size={16} />
                                <span>Nouveau {labelPeriode}</span>
                            </button>
                        </div>

                        {showPeriodeForm && (
                            <div className={styles.formBox}>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Code" value={newPeriode.code} onChange={e => setNewPeriode(s => ({ ...s, code: e.target.value }))} />
                                    <input className={styles.input} placeholder="Libellé" value={newPeriode.libelle} onChange={e => setNewPeriode(s => ({ ...s, libelle: e.target.value }))} />
                                    <input className={styles.input} type="number" min={1} value={newPeriode.numero} onChange={e => setNewPeriode(s => ({ ...s, numero: Number(e.target.value) || 1 }))} />
                                    <input className={styles.input} type="date" value={newPeriode.date_debut} onChange={e => setNewPeriode(s => ({ ...s, date_debut: e.target.value }))} />
                                    <input className={styles.input} type="date" value={newPeriode.date_fin} onChange={e => setNewPeriode(s => ({ ...s, date_fin: e.target.value }))} />
                                </div>
                                <div className={styles.formActions}>
                                    <button className={styles.primaryBtn} onClick={createPeriode}><Save size={16} /><span>Créer</span></button>
                                    <button className={styles.ghostBtn} onClick={() => { setShowPeriodeForm(false); setNewPeriode({ ...EMPTY_PERIODE }); }}><RotateCcw size={16} /><span>Annuler</span></button>
                                </div>
                            </div>
                        )}

                        <div className={styles.list}>
                            {trimestres.map((periode) => {
                                const isEditing = editingPeriodeId === periode.trimestre_id;
                                const model = isEditing ? { ...periode, ...editPeriode } : periode;
                                return (
                                    <div key={periode.trimestre_id} className={styles.listItem}>
                                        <div className={styles.itemTop}>
                                            <div className={styles.itemSelectStatic}>
                                                <strong>{periode.code}</strong>
                                                <span>{periode.libelle}</span>
                                            </div>
                                            <div className={styles.badges}>
                                                <span className={styles.badgeMuted}>#{periode.numero}</span>
                                                <span className={styles.badgeMuted}>{periode.statut}</span>
                                            </div>
                                        </div>

                                        {isEditing ? (
                                            <div className={styles.inlineEditor}>
                                                <div className={styles.formGrid}>
                                                    <input className={styles.input} value={String(model.code ?? '')} onChange={e => setEditPeriode(s => ({ ...s, code: e.target.value }))} />
                                                    <input className={styles.input} value={String(model.libelle ?? '')} onChange={e => setEditPeriode(s => ({ ...s, libelle: e.target.value }))} />
                                                    <input className={styles.input} type="number" min={1} value={Number(model.numero ?? 1)} onChange={e => setEditPeriode(s => ({ ...s, numero: Number(e.target.value) || 1 }))} />
                                                    <input className={styles.input} type="date" value={String(model.date_debut ?? '')} onChange={e => setEditPeriode(s => ({ ...s, date_debut: e.target.value }))} />
                                                    <input className={styles.input} type="date" value={String(model.date_fin ?? '')} onChange={e => setEditPeriode(s => ({ ...s, date_fin: e.target.value }))} />
                                                </div>
                                                <div className={styles.formActions}>
                                                    <button className={styles.primaryBtn} onClick={() => savePeriodeEdit(periode.trimestre_id)}><Save size={16} /><span>Sauvegarder</span></button>
                                                    <button className={styles.ghostBtn} onClick={() => { setEditingPeriodeId(null); setEditPeriode({}); }}><RotateCcw size={16} /><span>Fermer</span></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={styles.itemMeta}>
                                                <span>{periode.date_debut} → {periode.date_fin}</span>
                                            </div>
                                        )}

                                        <div className={styles.itemActions}>
                                            {periode.statut !== 'CLOTURE' && (
                                                <button className={styles.iconBtn} title="Clôturer cette période" onClick={() => cloturerPeriode(periode.trimestre_id, periode.libelle)}><Lock size={16} /></button>
                                            )}
                                            <button className={styles.iconBtn} onClick={() => { setEditingPeriodeId(periode.trimestre_id); setEditPeriode(periode); }}><Pencil size={16} /></button>
                                            <button className={styles.iconBtnDanger} onClick={() => askDeletePeriode(periode.trimestre_id, periode.libelle)}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                );
                            })}
                            {trimestres.length === 0 && <p className={styles.empty}>Aucun {labelPeriode} enregistré pour cette année.</p>}
                        </div>
                    </section>
                </div>

                <section className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h3><PlaneTakeoff size={18} /> Vacances scolaires</h3>
                            <p>Ajoutez les congés et fermetures de l’établissement. Ils sont stockés dans les paramètres génériques de catégorie `CALENDRIER`.</p>
                        </div>
                        <button className={styles.secondaryBtn} onClick={addVacance}>
                            <Plus size={16} />
                            <span>Ajouter une vacance</span>
                        </button>
                    </div>

                    <div className={styles.vacancesList}>
                        {settings.vacances.map((vacance, index) => (
                            <div key={vacance.id || `vacance_fallback_${index}`} className={styles.vacanceRow}>
                                <input className={styles.input} placeholder="Libellé" value={vacance.libelle} onChange={e => updateVacance(vacance.id, 'libelle', e.target.value)} />
                                <input className={styles.input} type="date" value={vacance.date_debut} onChange={e => updateVacance(vacance.id, 'date_debut', e.target.value)} />
                                <input className={styles.input} type="date" value={vacance.date_fin} onChange={e => updateVacance(vacance.id, 'date_fin', e.target.value)} />
                                <button className={styles.iconBtnDanger} onClick={() => removeVacance(vacance.id)}><Trash2 size={16} /></button>
                            </div>
                        ))}
                        {settings.vacances.length === 0 && (
                            <div className={styles.emptyStateBox}>
                                <Settings2 size={24} />
                                <p>Aucune période de vacances configurée pour le moment.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </SettingsLayout>
    );
}
