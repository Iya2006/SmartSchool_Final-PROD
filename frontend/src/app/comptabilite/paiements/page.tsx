'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
    CreditCard, DollarSign, FileText, Users, Search, RefreshCw,
    Download, Banknote, Smartphone, Building2, X, CheckCircle2,
    AlertTriangle, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
    Plus, Eye, Printer, XCircle, ChevronDown, Filter, Calendar,
    Briefcase, PieChart, BarChart3, Receipt, Wallet, HandCoins,
    CircleDollarSign, Landmark, Percent, Award, Ban, Clock, ChevronRight, CheckCircle,
    AlertCircle, Loader2, Store, Package, Wrench, Monitor, Bus, Signal, ClipboardList
} from 'lucide-react';
import Pagination from '@/components/Pagination';
import { fetchModesPaiement, modePaiementLabel, DEFAULT_MODES_PAIEMENT } from '@/lib/modesPaiement';
import { useApp } from '@/context/AppContext';
import AnneeFilter from '@/components/AnneeFilter';

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */
type Paiement = {
    paiement_id: number; numero_recu: string; date_paiement: string;
    montant: number; mode_paiement: string; statut: string;
    numero_facture: string; eleve_nom: string; eleve_prenom: string;
    facture_id: number; echeance_id: number | null; reference_externe: string | null;
};

type Facture = {
    facture_id: number; numero_facture: string; date_facture: string;
    montant_total: number; montant_paye: number; montant_restant: number;
    statut: string; type_frais_libelle: string; eleve_id: number; eleve_nom: string;
    eleve_prenom: string; classe_nom: string; classe_id: number;
    inscription_id: number; type_frais_id: number; echeances: any[];
};

type Depense = {
    depense_id: number; categorie: string; description: string;
    montant: number; date_depense: string; fournisseur: string;
    reference: string; statut: string;
};

type DashboardData = {
    total_encaisse: number; total_depense: number; solde_net: number;
    nb_paiements: number; nb_factures_impayees: number;
    par_mode: { mode: string; total: number; count: number }[];
    recents: Paiement[];
};

type Fournisseur = {
    fournisseur: string; total_depenses: number; nb_transactions: number;
};

type EmployeSalaire = {
    id: string; // e.g. "ENS_1" or "PERS_2"
    type_employe: string;
    nom: string; prenom: string;
    role_label: string;
    salaire_base: number;
    prime_mensuelle: number;
    telephone: string; paye_ce_mois: boolean; total_paye_annee: number;
    nb_paiements: number;
    historique: { depense_id: number; date: string; montant: number; libelle: string; statut: string }[];
};

type SoldeEleve = {
    eleve_id: number; eleve_nom: string; eleve_prenom: string; eleve_matricule: string;
    factures: any[];
    total_facture: number; total_paye: number; total_restant: number; taux_paiement: number;
};

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════════════════════ */
// Icônes/couleurs pour les modes de paiement CONNUS — la liste réellement
// proposée dans les formulaires vient de Paramètres > Finance & Comptabilité
// (voir modesPaiementDisponibles state + fetchModesPaiement), pas d'ici. Un
// mode ajouté dans Paramètres sans entrée ici retombe sur l'icône par défaut.
const MODE_ICONS: Record<string, { icon: typeof Banknote; color: string }> = {
    ESPECES: { icon: Banknote, color: '#10b981' },
    ORANGE_MONEY: { icon: Smartphone, color: '#f97316' },
    MTN_MONEY: { icon: Smartphone, color: '#eab308' },
    VIREMENT: { icon: Landmark, color: '#3b82f6' },
    CHEQUE: { icon: FileText, color: '#8b5cf6' },
    CARTE_BANCAIRE: { icon: CreditCard, color: '#ec4899' },
    MOBILE_MONEY: { icon: Smartphone, color: '#f97316' },
};
const MODE_ICON_DEFAUT = { icon: Wallet, color: '#64748b' };

const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'VALIDE': { bg: '#d1fae5', color: '#059669', label: 'Valide' },
    'ANNULE': { bg: '#fee2e2', color: '#dc2626', label: 'Annule' },
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'PARTIELLEMENT_PAYEE': { bg: '#dbeafe', color: '#2563eb', label: 'Partielle' },
    'PAYEE': { bg: '#d1fae5', color: '#059669', label: 'Payee' },
    'EN_RETARD': { bg: '#fee2e2', color: '#dc2626', label: 'En retard' },
    'APPROUVEE': { bg: '#d1fae5', color: '#059669', label: 'Approuvee' },
};

const CATEGORIE_DEPENSES = [
    'FOURNISSEUR', 'SALAIRES', 'FOURNITURES', 'MAINTENANCE',
    'EQUIPEMENT', 'TRANSPORT', 'COMMUNICATION', 'AUTRE'
];

const CATEGORIE_INFO: Record<string, { label: string; color: string; bg: string; icon: any; benefLabel: string; benefPlaceholder: string }> = {
    'FOURNISSEUR':   { label: 'Fournisseur',   color: '#7c3aed', bg: '#ede9fe', icon: Store, benefLabel: 'Nom du fournisseur *', benefPlaceholder: 'Ex: Librairie Scolaire, Imprimerie ABC...' },
    'SALAIRES':      { label: 'Salaires',       color: '#0891b2', bg: '#e0f2fe', icon: Briefcase, benefLabel: 'Bénéficiaire (employé ou groupe) *', benefPlaceholder: 'Ex: Corps Enseignant - Juin, M. Diallo Ibrahima...' },
    'FOURNITURES':   { label: 'Fournitures',    color: '#d97706', bg: '#fef3c7', icon: Package, benefLabel: 'Fournisseur', benefPlaceholder: 'Ex: Papeterie Centrale...' },
    'MAINTENANCE':   { label: 'Maintenance',    color: '#dc2626', bg: '#fee2e2', icon: Wrench, benefLabel: 'Prestataire / Technicien', benefPlaceholder: 'Ex: Entreprise XYZ Maintenance...' },
    'EQUIPEMENT':    { label: 'Équipement',     color: '#059669', bg: '#d1fae5', icon: Monitor, benefLabel: 'Fournisseur / Vendeur', benefPlaceholder: 'Ex: Magasin Électronique...' },
    'TRANSPORT':     { label: 'Transport',      color: '#2563eb', bg: '#dbeafe', icon: Bus, benefLabel: 'Prestataire Transport', benefPlaceholder: 'Ex: Société de Transport Alpha...' },
    'COMMUNICATION': { label: 'Communication',  color: '#7c3aed', bg: '#ede9fe', icon: Signal, benefLabel: 'Opérateur / Fournisseur', benefPlaceholder: 'Ex: Orange Guinée, Connexion Internet...' },
    'AUTRE':         { label: 'Autre',           color: '#475569', bg: '#f1f5f9', icon: ClipboardList, benefLabel: 'Bénéficiaire / Destinataire', benefPlaceholder: 'Ex: Nom de la personne ou entité...' },
};

function Badge({ statut }: { statut: string }) {
    const s = STATUT_COLORS[statut] || { bg: '#f1f5f9', color: '#475569', label: statut };
    return (
        <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600', backgroundColor: s.bg, color: s.color }}>
            {s.label}
        </span>
    );
}

function formatMoney(n: number) {
    return new Intl.NumberFormat('fr-GN', { maximumFractionDigits: 0 }).format(n) + ' GNF';
}

function formatDate(d: string | null) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
}

/* ═══════════════════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════ */
function GestionPaiements() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { anneeId: anneeCouranteId } = useApp();
    // Année scolaire consultée — par défaut l'année en cours ; le comptable
    // peut basculer sur une année clôturée pour consulter l'historique.
    const [filterAnnee, setFilterAnnee] = useState<number>(anneeCouranteId);
    useEffect(() => { setFilterAnnee(anneeCouranteId); }, [anneeCouranteId]);
    const [activeTab, setActiveTab] = useState<'overview' | 'encaissements' | 'recus' | 'fournisseurs' | 'decaissements' | 'reductions'>('overview');

    // ── Donnees globales ──
    const [paiements, setPaiements] = useState<Paiement[]>([]);
    const [factures, setFactures] = useState<Facture[]>([]);
    const [depenses, setDepenses] = useState<Depense[]>([]);
    const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // ── Modes de paiement configurés (Paramètres > Finance & Comptabilité) ──
    // Source unique de vérité pour tous les sélecteurs de mode de paiement de
    // cette page (encaissement, décaissement) — avant ce fetch, la liste était
    // codée en dur ici et ne reflétait jamais les modes ajoutés dans Paramètres.
    const [modesPaiementConfig, setModesPaiementConfig] = useState<string[]>(DEFAULT_MODES_PAIEMENT);
    useEffect(() => { fetchModesPaiement().then(setModesPaiementConfig); }, []);
    const modesAffichables = modesPaiementConfig.map(value => ({
        value,
        label: modePaiementLabel(value),
        icon: (MODE_ICONS[value] || MODE_ICON_DEFAUT).icon,
        color: (MODE_ICONS[value] || MODE_ICON_DEFAUT).color,
    }));

    // ── Dashboard KPIs ──
    const [kpis, setKpis] = useState({ total_encaisse: 0, total_depense: 0, nb_impayes: 0 });
    const [parMode, setParMode] = useState<{ mode: string; total: number; nb: number }[]>([]);
    const [depensesStats, setDepensesStats] = useState<{ total_depenses: number; total_valide: number; total_en_attente: number; par_categorie: { categorie: string; total: number; nb: number }[] }>({ total_depenses: 0, total_valide: 0, total_en_attente: 0, par_categorie: [] });

    // ── Modal paiement ──
    const [showPayModal, setShowPayModal] = useState(false);
    const [payForm, setPayForm] = useState({ facture_id: 0, echeance_id: null as number | null, montant: '', mode_paiement: 'ESPECES', reference_externe: '', operateur: '' });
    const [payLoading, setPayLoading] = useState(false);
    const [payResult, setPayResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null);

    // ── Modal annulation ──
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelPaiementId, setCancelPaiementId] = useState<number | null>(null);
    const [cancelMotif, setCancelMotif] = useState('');
    const [cancelLoading, setCancelLoading] = useState(false);

    // ── Modal solde eleve ──
    const [showSoldeModal, setShowSoldeModal] = useState(false);
    const [soldeData, setSoldeData] = useState<SoldeEleve | null>(null);
    const [soldeLoading, setSoldeLoading] = useState(false);
    const [soldeSearch, setSoldeSearch] = useState('');

    // ── Decaissement form (universal) ──
    const [showFournisseurForm, setShowFournisseurForm] = useState(false);
    const [decaisFormCategorie, setDecaisFormCategorie] = useState('FOURNISSEUR');
    const [fournisseurForm, setFournisseurForm] = useState({
        fournisseur: '', montant: '', description: '', reference: '', mode_paiement: 'ESPECES',
        source_fonds: 'CAISSE_PRINCIPALE', classe_id: '', departement: '',
    });
    const [fournisseurLoading, setFournisseurLoading] = useState(false);
    const [justificatifFile, setJustificatifFile] = useState<File | null>(null);
    const [classes, setClasses] = useState<{ classe_id: number; libelle: string }[]>([]);

    // ── Module Salaires ──
    const [showSalaireModal, setShowSalaireModal] = useState(false);
    const [employesSalaires, setEmployesSalaires] = useState<EmployeSalaire[]>([]);
    const [salairesMois, setSalairesMois] = useState(() => {
        const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    });
    const [salaireSearch, setSalaireSearch] = useState('');
    const [salaireLoading, setSalaireLoading] = useState(false);
    const [selectedEns, setSelectedEns] = useState<EmployeSalaire | null>(null);
    // Arriérés multi-mois : le backend calcule et impose son propre net_a_payer par
    // mois (base + primes - absences - avances) — jamais un montant libre. On liste
    // ici TOUS les mois en retard (pas seulement le mois sélectionné dans le
    // calendrier), pour permettre de régler un mois précis ou la totalité en un clic.
    const [arrieres, setArrieres] = useState<{ mois_du: any[]; total_du: number } | null>(null);
    const [arrieresLoading, setArrieresLoading] = useState(false);
    const [arrieresError, setArrieresError] = useState(false);
    const [moisSelectionnes, setMoisSelectionnes] = useState<string[]>([]);

    useEffect(() => {
        if (!selectedEns) { setArrieres(null); setMoisSelectionnes([]); setArrieresError(false); return; }
        setArrieresLoading(true);
        setArrieresError(false);
        api.get(`/api/finance/salaires/arrieres/${selectedEns.id}?etablissement_id=1&nb_mois=12`)
            .then(res => {
                setArrieres(res.data);
                setMoisSelectionnes((res.data?.mois_du || []).map((m: any) => m.mois_concerne));
            })
            .catch(() => { setArrieres(null); setMoisSelectionnes([]); setArrieresError(true); })
            .finally(() => setArrieresLoading(false));
    }, [selectedEns]);

    const toggleMoisSelectionne = (mois: string) => {
        setMoisSelectionnes(prev => prev.includes(mois) ? prev.filter(m => m !== mois) : [...prev, mois]);
    };

    const montantSelectionne = (arrieres?.mois_du || [])
        .filter((m: any) => moisSelectionnes.includes(m.mois_concerne))
        .reduce((s: number, m: any) => s + m.net_a_payer, 0);
    const [salairePaying, setSalairePaying] = useState<string | null>(null); // employe_id (ex: ENS_1) en cours

    // ── Filtres decaissements ──
    const [decaisFilterCat, setDecaisFilterCat] = useState('');
    const [decaisDateDebut, setDecaisDateDebut] = useState('');
    const [decaisDateFin, setDecaisDateFin] = useState('');

    // ── Pagination (paiements & decaissements) ──
    const pageSize = 25;
    const [pagePaiements, setPagePaiements] = useState(1);
    const [totalPaiements, setTotalPaiements] = useState(0);
    const [pageDepenses, setPageDepenses] = useState(1);
    const [totalDepenses, setTotalDepenses] = useState(0);

    /* ═══ CHARGEMENT DES DONNEES ═══ */
    const loadPaiements = useCallback(async (page: number) => {
        try {
            const skip = (page - 1) * pageSize;
            const res = await api.get(`/api/finance/paiements?skip=${skip}&limit=${pageSize}&annee_id=${filterAnnee}`);
            setPaiements(res.data || []);
            const totalCount = res.headers?.['x-total-count'];
            setTotalPaiements(totalCount !== undefined ? Number(totalCount) : (res.data || []).length);
        } catch (err) {
            console.error('Erreur chargement paiements:', err);
        }
    }, [filterAnnee]);

    const loadDepensesList = useCallback(async (page: number) => {
        try {
            const skip = (page - 1) * pageSize;
            const res = await api.get(`/api/finance/depenses?skip=${skip}&limit=${pageSize}&annee_id=${filterAnnee}`);
            setDepenses(res.data || []);
            const totalCount = res.headers?.['x-total-count'];
            setTotalDepenses(totalCount !== undefined ? Number(totalCount) : (res.data || []).length);
        } catch (err) {
            console.error('Erreur chargement depenses:', err);
        }
    }, [filterAnnee]);

    const loadOverview = useCallback(async () => {
        setLoading(true);
        try {
            const [facRes, dashRes, fournRes, depStatsRes, classRes] = await Promise.all([
                api.get(`/api/finance/factures?annee_id=${filterAnnee}`),
                api.get(`/api/finance/dashboard?annee_id=${filterAnnee}`),
                api.get('/api/finance/fournisseurs').catch(() => ({ data: [] })),
                api.get(`/api/finance/depenses/stats?annee_id=${filterAnnee}`).catch(() => ({ data: null })),
                api.get(`/api/classes?etablissement_id=1&annee_id=${filterAnnee}`).catch(() => ({ data: [] })),
            ]);
            setFactures(facRes.data || []);
            setFournisseurs(fournRes.data || []);
            if (depStatsRes.data) setDepensesStats(depStatsRes.data);
            setClasses(classRes.data || []);

            // GET /api/finance/dashboard renvoie {kpis: {...}, repartition_modes: [...]}
            // (pas de total_encaisse/nb_paiements/par_mode à plat — les anciennes
            // clés lues ici n'existaient nulle part dans la vraie réponse, donc
            // ces KPIs "Vue d'ensemble" restaient toujours à 0/vide).
            const dash = dashRes.data || {};
            setKpis({
                total_encaisse: dash.kpis?.total_paye || 0,
                total_depense: dash.kpis?.total_depenses || 0,
                nb_impayes: dash.kpis?.nb_impayes || 0,
            });
            setParMode(dash.repartition_modes || []);
        } catch (err) {
            console.error('Erreur chargement données paiements:', err);
        } finally { setLoading(false); }
    }, [filterAnnee]);

    // Rafraichissement combine (utilise apres les mutations et par les boutons "Actualiser")
    const loadData = useCallback(() => {
        loadOverview();
        loadPaiements(pagePaiements);
        loadDepensesList(pageDepenses);
    }, [loadOverview, loadPaiements, loadDepensesList, pagePaiements, pageDepenses]);

    useEffect(() => { loadOverview(); }, [loadOverview]);
    useEffect(() => { loadPaiements(pagePaiements); }, [pagePaiements, loadPaiements]);
    useEffect(() => { loadDepensesList(pageDepenses); }, [pageDepenses, loadDepensesList]);

    // Reinitialiser la pagination quand un filtre change, pour eviter une page vide
    useEffect(() => { setPagePaiements(1); }, [searchTerm]);
    useEffect(() => { setPageDepenses(1); }, [decaisFilterCat, decaisDateDebut, decaisDateFin]);

    /* ═══ AUTO-DISMISS TOAST après 4 secondes ═══ */
    useEffect(() => {
        if (!payResult) return;
        const timer = setTimeout(() => setPayResult(null), 4000);
        return () => clearTimeout(timer);
    }, [payResult]);


    /* ═══ ENREGISTRER UN PAIEMENT ═══ */
    const handlePay = async () => {
        if (!payForm.facture_id || !payForm.montant || parseFloat(payForm.montant) <= 0) {
            setPayResult({ type: 'error', msg: 'Veuillez remplir tous les champs obligatoires' });
            return;
        }
        setPayLoading(true);
        setPayResult(null);
        try {
            const payload: any = {
                facture_id: payForm.facture_id,
                montant: parseFloat(payForm.montant),
                mode_paiement: payForm.mode_paiement,
                reference_externe: payForm.reference_externe || null,
            };
            if (payForm.echeance_id) payload.echeance_id = payForm.echeance_id;

            const res = await api.post('/api/finance/paiements', payload);
            setPayResult({ type: 'success', msg: `Paiement enregistre ! Recu N ${res.data.numero_recu}` });
            setShowPayModal(false);
            setPayForm({ facture_id: 0, echeance_id: null, montant: '', mode_paiement: 'ESPECES', reference_externe: '', operateur: '' });
            setSelectedFacture(null);
            loadData();
        } catch (err: any) {
            setPayResult({ type: 'error', msg: err.response?.data?.detail || 'Erreur lors du paiement' });
        } finally { setPayLoading(false); }
    };

    /* ═══ ANNULER UN PAIEMENT ═══ */
    const handleCancel = async () => {
        if (!cancelPaiementId || !cancelMotif.trim()) return;
        setCancelLoading(true);
        try {
            await api.put(`/api/finance/paiements/${cancelPaiementId}/annuler`, { motif: cancelMotif });
            setShowCancelModal(false);
            setCancelPaiementId(null);
            setCancelMotif('');
            setPayResult({ type: 'success', msg: 'Paiement annule avec succes' });
            loadData();
        } catch (err: any) {
            setPayResult({ type: 'error', msg: err.response?.data?.detail || 'Erreur annulation' });
        } finally { setCancelLoading(false); }
    };

    /* ═══ TELECHARGER RECU PDF ═══ */
    const downloadRecuPDF = async (paiementId: number, numeroRecu: string) => {
        try {
            const res = await api.get(`/api/finance/paiements/${paiementId}/recu-pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${numeroRecu}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            setPayResult({ type: 'error', msg: 'Erreur lors du telechargement du recu' });
        }
    };

    /* ═══ VALIDER UNE DEPENSE ═══ */
    const validerDepense = async (depenseId: number) => {
        try {
            await api.put(`/api/finance/depenses/${depenseId}/valider`);
            setPayResult({ type: 'success', msg: 'Depense validee avec succes' });
            loadData();
        } catch (err: any) {
            setPayResult({ type: 'error', msg: err.response?.data?.detail || 'Erreur lors de la validation' });
        }
    };

    /* ═══ REJETER UNE DEPENSE (EN_ATTENTE) ═══ */
    const rejeterDepense = async (depenseId: number) => {
        if (!confirm('Rejeter ce décaissement ? Cette action ne peut plus être annulée depuis cet écran.')) return;
        try {
            await api.put(`/api/finance/depenses/${depenseId}/statut?statut=REJETEE`);
            setPayResult({ type: 'success', msg: 'Décaissement rejeté' });
            loadData();
        } catch (err: any) {
            setPayResult({ type: 'error', msg: err.response?.data?.detail || 'Erreur lors du rejet' });
        }
    };

    /* ═══ CHARGER LES ENSEIGNANTS AVEC SALAIRES ═══ */
    const loadEnseignantsSalaires = async (mois: string) => {
        setSalaireLoading(true);
        try {
            const res = await api.get(`/api/finance/salaires/employes?etablissement_id=1&annee_id=${filterAnnee}&mois=${mois}`);
            setEmployesSalaires(res.data || []);
        } catch { setEmployesSalaires([]); }
        finally { setSalaireLoading(false); }
    };

    /* ═══ PAYER UNE LISTE DE MOIS PRÉCISE POUR UN EMPLOYÉ DONNÉ ═══
       Helper partagé : ne lit JAMAIS un état partagé (moisSelectionnes) au nom d'un
       autre employé — la liste des mois à payer est toujours passée explicitement
       par l'appelant, pour éviter qu'un bouton "rapide" sur une ligne de la liste
       paie accidentellement les mois cochés dans le panneau d'un AUTRE employé. */
    const payerMoisPourEmploye = async (ens: EmployeSalaire, moisList: string[]) => {
        if (moisList.length === 0) {
            setPayResult({ type: 'error', msg: 'Sélectionnez au moins un mois à payer' });
            return;
        }
        // Si le mois en cours fait partie de la sélection, on vérifie que sa date de
        // paie officielle (Calendrier de paie) est bien arrivée ; sinon on demande
        // confirmation avant de payer en avance plutôt que de bloquer purement.
        const moisActuel = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
        if (moisList.includes(moisActuel)) {
            try {
                const dpRes = await api.get(`/api/finance/salaires/date-paie?etablissement_id=1&mois_concerne=${moisActuel}`);
                const datePaie = dpRes.data?.date_paie;
                if (datePaie && new Date().toISOString().split('T')[0] < datePaie) {
                    const ok = confirm(`La date de paie officielle du mois en cours (${datePaie}) n'est pas encore arrivée. Payer quand même ?`);
                    if (!ok) return;
                }
            } catch { /* si la vérification échoue, on ne bloque pas le paiement */ }
        }
        setSalairePaying(ens.id);
        try {
            const res = await api.post('/api/finance/salaires/payer-plusieurs-mois', {
                enseignant_id: ens.id,
                mois_list: moisList,
                mode_paiement: 'Cash',
                etablissement_id: 1,
                annee_id: filterAnnee,
            });
            setPayResult({ type: res.data?.erreurs?.length ? 'error' : 'success', msg: res.data?.message || `Salaire de ${ens.prenom} ${ens.nom} enregistré !` });
            setSelectedEns(null);
            await loadEnseignantsSalaires(salairesMois);
            loadData();
            // La page Salaires lit ces mêmes données via React Query — sans invalidation
            // ici, un paiement effectué depuis ce module (redirigé) laissait "Non payé"
            // affiché là-bas jusqu'à un refresh manuel.
            queryClient.invalidateQueries({ queryKey: ['salaires-employes'] });
            queryClient.invalidateQueries({ queryKey: ['salaires-calculer'] });
        } catch (err: any) {
            setPayResult({ type: 'error', msg: err.response?.data?.detail || 'Erreur paiement salaire' });
        } finally { setSalairePaying(null); }
    };

    // Panneau détaillé (arriérés multi-mois cochés par le comptable pour l'employé
    // actuellement sélectionné) :
    const payerSalaireEnseignant = (ens: EmployeSalaire) => payerMoisPourEmploye(ens, moisSelectionnes);

    // Bouton rapide "Payer ce mois" sur chaque ligne de la liste : ne doit payer QUE
    // le mois actuellement affiché dans le sélecteur de mois (salairesMois) pour
    // CETTE ligne, jamais la sélection multi-mois d'un autre employé dont le
    // panneau serait resté ouvert.
    const payerMoisCourantRapide = (ens: EmployeSalaire) => payerMoisPourEmploye(ens, [salairesMois]);

    /* ═══ OUVRIR LE MODULE SALAIRES ═══ */
    const openSalaireModal = () => {
        setShowSalaireModal(true);
        loadEnseignantsSalaires(salairesMois);
    };

    /* ═══ ARRIVÉE DEPUIS SALAIRES > CALCUL DES SALAIRES ═══
       Le bouton "Payer" de cet onglet ne paie plus sur place : il redirige ici
       (?tab=fournisseurs&payerSalaire=ENS_7&mois=2026-07) pour que TOUT paiement
       de salaire passe par ce même formulaire (Centre de Décaissement), qui affiche
       le net à payer réel calculé par le backend plutôt qu'un montant libre. */
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'fournisseurs') setActiveTab('fournisseurs');

        const payerSalaireId = searchParams.get('payerSalaire');
        if (!payerSalaireId) return;

        const mois = searchParams.get('mois');
        const moisCible = mois || salairesMois;
        if (mois && mois !== salairesMois) setSalairesMois(mois);
        setShowSalaireModal(true);
        api.get(`/api/finance/salaires/employes?etablissement_id=1&annee_id=${filterAnnee}&mois=${moisCible}`)
            .then(res => {
                setEmployesSalaires(res.data || []);
                const match = (res.data || []).find((e: any) => e.id === payerSalaireId);
                if (match) setSelectedEns(match);
            })
            .catch(() => {});
        // Nettoie l'URL pour ne pas rouvrir le modal à chaque rafraîchissement de page.
        router.replace('/comptabilite/paiements?tab=fournisseurs');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ═══ IMPRIMER RECU PDF ═══ */
    const printRecuPDF = async (paiementId: number) => {
        try {
            const res = await api.get(`/api/finance/paiements/${paiementId}/recu-pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const printWindow = window.open(url, '_blank');
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.print();
                };
            }
        } catch {
            setPayResult({ type: 'error', msg: 'Erreur lors de l\'impression du recu' });
        }
    };

    /* ═══ CONSULTER SOLDE ELEVE ═══ */
    const fetchSoldeEleve = async (eleveId: number) => {
        setSoldeLoading(true);
        setShowSoldeModal(true);
        try {
            const res = await api.get(`/api/finance/solde-eleve/${eleveId}?annee_id=${filterAnnee}`);
            setSoldeData(res.data);
        } catch { setSoldeData(null); }
        finally { setSoldeLoading(false); }
    };

    /* ═══ ENREGISTREMENT DECAISSEMENT (toutes catégories) ═══ */
    const resetFournisseurForm = () => {
        setFournisseurForm({ fournisseur: '', montant: '', description: '', reference: '', mode_paiement: 'ESPECES', source_fonds: 'CAISSE_PRINCIPALE', classe_id: '', departement: '' });
        setJustificatifFile(null);
    };

    const handleFournisseurPayment = async () => {
        if (!fournisseurForm.montant || parseFloat(fournisseurForm.montant) <= 0) {
            setPayResult({ type: 'error', msg: 'Veuillez saisir un montant valide' });
            return;
        }
        setFournisseurLoading(true);
        try {
            let factureUrl: string | null = null;
            if (justificatifFile) {
                try {
                    const formData = new FormData();
                    formData.append('file', justificatifFile);
                    const uploadRes = await api.post('/api/finance/upload-justificatif', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    factureUrl = uploadRes.data.facture_url || null;
                } catch {
                    setPayResult({ type: 'error', msg: "Le justificatif n'a pas pu être téléversé — décaissement non enregistré." });
                    setFournisseurLoading(false);
                    return;
                }
            }
            const isFournisseur = decaisFormCategorie === 'FOURNISSEUR';
            await api.post('/api/finance/reglements-fournisseurs', {
                categorie: decaisFormCategorie,
                fournisseur: fournisseurForm.fournisseur,
                beneficiaire: fournisseurForm.fournisseur,
                montant: parseFloat(fournisseurForm.montant),
                description: fournisseurForm.description,
                reference: fournisseurForm.reference,
                mode_paiement: fournisseurForm.mode_paiement,
                facture_url: isFournisseur ? factureUrl : null,
                source_fonds: isFournisseur ? fournisseurForm.source_fonds : null,
                classe_id: isFournisseur && fournisseurForm.classe_id ? parseInt(fournisseurForm.classe_id) : null,
                departement: isFournisseur ? (fournisseurForm.departement || null) : null,
            });
            setShowFournisseurForm(false);
            resetFournisseurForm();
            const catLabel = CATEGORIE_INFO[decaisFormCategorie]?.label || decaisFormCategorie;
            setPayResult({ type: 'success', msg: `Décaissement "${catLabel}" enregistré avec succès !` });
            loadData();
        } catch (err: any) {
            setPayResult({ type: 'error', msg: err.response?.data?.detail || 'Erreur lors de l\'enregistrement' });
        } finally { setFournisseurLoading(false); }
    };

    /* ═══ FILTRES ═══ */
    const filteredPaiements = paiements.filter(p => {
        const term = searchTerm.toLowerCase();
        return !term || p.numero_recu?.toLowerCase().includes(term) || p.eleve_nom?.toLowerCase().includes(term) || p.eleve_prenom?.toLowerCase().includes(term) || p.numero_facture?.toLowerCase().includes(term);
    });

    const filteredDepenses = depenses.filter(d => {
        if (decaisFilterCat && d.categorie !== decaisFilterCat) return false;
        if (decaisDateDebut && d.date_depense < decaisDateDebut) return false;
        if (decaisDateFin && d.date_depense > decaisDateFin) return false;
        return true;
    });

    const facturesImpayees = factures.filter(f => ['EN_ATTENTE', 'PARTIELLEMENT_PAYEE', 'EN_RETARD'].includes(f.statut));

    // KPIs Vue d'ensemble : issus de `kpis`/`parMode` (GET /api/finance/dashboard,
    // non paginé, voir loadOverview) plutôt que recalculés depuis `paiements`/
    // `depenses`, qui ne contiennent chacun que la page courante (25 lignes).
    const totalEncaisse = kpis.total_encaisse;
    const totalDecaisse = kpis.total_depense;
    const soldeNet = totalEncaisse - totalDecaisse;

    /* ═══ STYLES COMMUNS ═══ */
    const cardStyle: React.CSSProperties = {
        background: 'white', borderRadius: '16px', padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        border: '1px solid #f1f5f9',
    };
    const btnPrimary: React.CSSProperties = {
        background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
        border: 'none', borderRadius: '12px', padding: '10px 20px', fontSize: '13px',
        fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
    };
    const btnSecondary: React.CSSProperties = {
        background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0',
        borderRadius: '12px', padding: '10px 20px', fontSize: '13px',
        fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
    };
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px 14px', borderRadius: '10px',
        border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none',
        fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
    };
    const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
    const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block' };
    const modalOverlay: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
    };
    const modalBox: React.CSSProperties = {
        background: 'white', borderRadius: '20px', padding: '32px', maxWidth: '600px',
        width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
    };

    const TABS = [
        { key: 'overview' as const, label: "Vue d'ensemble", icon: PieChart },
        { key: 'encaissements' as const, label: 'Encaissements', icon: HandCoins },
        { key: 'recus' as const, label: 'Recus & Soldes', icon: Receipt },
        { key: 'fournisseurs' as const, label: 'Centre Décaissements', icon: Wallet },
        { key: 'decaissements' as const, label: 'Historique Décaissements', icon: ArrowDownRight },
        { key: 'reductions' as const, label: 'Reductions & Config', icon: Percent },
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ textAlign: 'center' }}>
                    <RefreshCw size={32} color="#10b981" style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ marginTop: '12px', color: '#64748b', fontSize: '14px' }}>Chargement des donnees financieres...</p>
                    <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                </div>
            </div>
        );
    }

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", padding: '0' }}>
            {/* ── TOAST NOTIFICATION ── */}
            {payResult && (
                <div style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 2000,
                    padding: '14px 24px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '10px',
                    background: payResult.type === 'success' ? '#d1fae5' : '#fee2e2',
                    color: payResult.type === 'success' ? '#065f46' : '#991b1b',
                    border: `1px solid ${payResult.type === 'success' ? '#6ee7b7' : '#fca5a5'}`,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 600, fontSize: '13px',
                    animation: 'slideIn 0.3s ease'
                }}>
                    {payResult.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    {payResult.msg}
                    <button onClick={() => setPayResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '8px', opacity: 0.6 }}>
                        <X size={16} />
                    </button>
                </div>
            )}
            <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>

            {/* ── EN-TETE ── */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CreditCard size={22} color="white" />
                        </div>
                        Gestion des Paiements
                    </h1>
                    <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '14px' }}>
                        Encaissements, recus, fournisseurs, decaissements et reductions
                    </p>
                </div>
                <AnneeFilter value={filterAnnee} onChange={setFilterAnnee} />
            </div>
            {filterAnnee !== anneeCouranteId && (
                <div style={{ padding: '10px 16px', borderRadius: 10, background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: '16px' }}>
                    Vous consultez une année scolaire archivée.
                </div>
            )}

            {/* ── ONGLETS ── */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: '#f1f5f9', borderRadius: '14px', padding: '4px', overflowX: 'auto' }}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                                flex: '1 1 auto', padding: '10px 16px', borderRadius: '10px', border: 'none',
                                cursor: 'pointer', fontSize: '13px', fontWeight: isActive ? 700 : 500,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                background: isActive ? 'white' : 'transparent',
                                color: isActive ? '#059669' : '#64748b',
                                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s', whiteSpace: 'nowrap',
                            }}>
                            <tab.icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ════════════════════════════════════════════════════════════════
                ONGLET 1 : VUE D'ENSEMBLE
               ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
                <div>
                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        {[
                            { label: 'Total Encaisse', value: totalEncaisse, icon: TrendingUp, color: '#10b981', bg: '#ecfdf5' },
                            { label: 'Total Decaisse', value: totalDecaisse, icon: TrendingDown, color: '#ef4444', bg: '#fef2f2' },
                            { label: 'Solde Net', value: soldeNet, icon: Wallet, color: soldeNet >= 0 ? '#10b981' : '#ef4444', bg: soldeNet >= 0 ? '#ecfdf5' : '#fef2f2' },
                            { label: 'Paiements', value: totalPaiements, icon: CheckCircle2, color: '#3b82f6', bg: '#eff6ff', isMoney: false },
                            { label: 'Factures Impayees', value: kpis.nb_impayes, icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', isMoney: false },
                        ].map((kpi, i) => (
                            <div key={i} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <kpi.icon size={22} color={kpi.color} />
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{kpi.label}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                                        {(kpi as any).isMoney === false ? kpi.value : formatMoney(kpi.value as number)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Repartition par mode de paiement */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BarChart3 size={18} color="#10b981" /> Repartition par Mode
                            </h3>
                            {modesAffichables.map(mode => {
                                const modeTotal = parMode.find(m => m.mode === mode.value)?.total || 0;
                                const pct = totalEncaisse > 0 ? (modeTotal / totalEncaisse) * 100 : 0;
                                return (
                                    <div key={mode.value} style={{ marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <mode.icon size={14} color={mode.color} /> {mode.label}
                                            </span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{formatMoney(modeTotal)}</span>
                                        </div>
                                        <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: mode.color, borderRadius: '99px', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Derniers paiements */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} color="#3b82f6" /> Derniers Paiements
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {paiements.slice(0, 8).map(p => (
                                    <div key={p.paiement_id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 14px', borderRadius: '10px', background: '#f8fafc',
                                        transition: 'background 0.15s', cursor: 'pointer'
                                    }}>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{p.eleve_prenom} {p.eleve_nom}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{p.numero_recu} — {formatDate(p.date_paiement)}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: p.statut === 'ANNULE' ? '#ef4444' : '#059669' }}>{formatMoney(p.montant)}</p>
                                            <Badge statut={p.statut} />
                                        </div>
                                    </div>
                                ))}
                                {paiements.length === 0 && (
                                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px 0' }}>Aucun paiement enregistre</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                ONGLET 2 : ENCAISSEMENTS
               ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'encaissements' && (
                <div>
                    {/* Barre d'actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '400px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input placeholder="Rechercher par eleve, N recu, N facture..."
                                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                style={{ ...inputStyle, paddingLeft: '38px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button style={btnPrimary} onClick={() => setShowPayModal(true)}>
                                <Plus size={16} /> Nouveau Paiement
                            </button>
                            <button style={btnSecondary} onClick={loadData}>
                                <RefreshCw size={16} /> Actualiser
                            </button>
                        </div>
                    </div>

                    {/* Tableau des paiements */}
                    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    {['N Recu', 'Date', 'Eleve', 'Montant', 'Mode', 'N Facture', 'Statut', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPaiements.map(p => (
                                    <tr key={p.paiement_id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                        onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{p.numero_recu}</td>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{formatDate(p.date_paiement)}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{p.eleve_prenom} {p.eleve_nom}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: p.statut === 'ANNULE' ? '#ef4444' : '#059669' }}>{formatMoney(p.montant)}</td>
                                        <td style={{ padding: '12px 16px', color: '#475569' }}>{modePaiementLabel(p.mode_paiement)}</td>
                                        <td style={{ padding: '12px 16px', color: '#3b82f6', fontWeight: 500 }}>{p.numero_facture}</td>
                                        <td style={{ padding: '12px 16px' }}><Badge statut={p.statut} /></td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button title="Telecharger Recu PDF" onClick={() => downloadRecuPDF(p.paiement_id, p.numero_recu)}
                                                    style={{ background: '#eff6ff', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                                                    <Download size={14} color="#3b82f6" />
                                                </button>
                                                <button title="Imprimer Recu" onClick={() => printRecuPDF(p.paiement_id)}
                                                    style={{ background: '#f0fdf4', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                                                    <Printer size={14} color="#10b981" />
                                                </button>
                                                {p.statut === 'VALIDE' && (
                                                    <button title="Annuler ce paiement"
                                                        onClick={() => { setCancelPaiementId(p.paiement_id); setShowCancelModal(true); }}
                                                        style={{ background: '#fef2f2', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}>
                                                        <Ban size={14} color="#ef4444" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPaiements.length === 0 && (
                                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucun paiement trouve</td></tr>
                                )}
                            </tbody>
                        </table>
                        <Pagination page={pagePaiements} pageSize={pageSize} total={totalPaiements} onPageChange={setPagePaiements} />
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                ONGLET 3 : RECUS & SOLDES
               ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'recus' && (
                <div>
                    {/* Recherche solde eleve */}
                    <div style={{ ...cardStyle, marginBottom: '20px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={18} color="#3b82f6" /> Consulter le Solde d'un Eleve
                        </h3>
                        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>
                            Cliquez sur un eleve dans la liste ci-dessous pour voir son solde en temps reel, ses factures et son historique de paiements.
                        </p>
                        <div style={{ position: 'relative', maxWidth: '400px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input placeholder="Rechercher un eleve par nom..."
                                value={soldeSearch} onChange={e => setSoldeSearch(e.target.value)}
                                style={{ ...inputStyle, paddingLeft: '38px' }} />
                        </div>
                        {/* Liste des eleves avec factures */}
                        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                            {facturesImpayees
                                .filter(f => !soldeSearch || f.eleve_nom?.toLowerCase().includes(soldeSearch.toLowerCase()) || f.eleve_prenom?.toLowerCase().includes(soldeSearch.toLowerCase()))
                                .slice(0, 20)
                                .map(f => (
                                    <div key={f.facture_id}
                                        onClick={() => {
                                            if (f.eleve_id) {
                                                fetchSoldeEleve(f.eleve_id);
                                            }
                                        }}
                                        style={{
                                            padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            background: 'white',
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(16,185,129,0.15)'; }}
                                        onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}>
                                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{f.eleve_prenom} {f.eleve_nom}</p>
                                        <p style={{ margin: '4px 0', fontSize: '12px', color: '#64748b' }}>{f.classe_nom} — {f.type_frais_libelle}</p>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                            <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>Reste: {formatMoney(f.montant_restant)}</span>
                                            <Badge statut={f.statut} />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Liste des recus */}
                    <div style={cardStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Receipt size={18} color="#10b981" /> Historique des Recus
                            </h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {paiements.filter(p => p.statut === 'VALIDE').slice(0, 20).map(p => (
                                <div key={p.paiement_id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', borderRadius: '10px', background: '#f8fafc',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Receipt size={16} color="#10b981" />
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{p.numero_recu}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{p.eleve_prenom} {p.eleve_nom} — {formatDate(p.date_paiement)}</p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>{formatMoney(p.montant)}</span>
                                        <button onClick={() => downloadRecuPDF(p.paiement_id, p.numero_recu)}
                                            style={{ ...btnSecondary, padding: '6px 12px', fontSize: '12px' }}>
                                            <Download size={14} /> PDF
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                ONGLET 4 : CENTRE DE DÉCAISSEMENTS
               ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'fournisseurs' && (
                <div>
                    {/* En-tête */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>💸 Centre de Décaissements</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Gérez toutes les sorties de fonds de l'école par catégorie</p>
                        </div>
                        <button style={btnPrimary} onClick={() => { resetFournisseurForm(); setDecaisFormCategorie('FOURNISSEUR'); setShowFournisseurForm(true); }}>
                            <Plus size={16} /> Nouveau Décaissement
                        </button>
                    </div>

                    {/* Cartes par catégorie — cliquez pour créer */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                        {CATEGORIE_DEPENSES.map(cat => {
                            const info = CATEGORIE_INFO[cat];
                            // Totaux réels (toutes pages confondues) via /api/finance/depenses/stats,
                            // pas seulement les dépenses de la page courante (25 lignes).
                            const catStats = depensesStats.par_categorie.find(c => c.categorie === cat);
                            const total = catStats?.total || 0;
                            const nb = catStats?.nb || 0;
                            return (
                                <div key={cat}
                                    onClick={() => {
                                        if (cat === 'SALAIRES') { openSalaireModal(); }
                                        else { resetFournisseurForm(); setDecaisFormCategorie(cat); setShowFournisseurForm(true); }
                                    }}
                                    style={{
                                        ...cardStyle, cursor: 'pointer', borderLeft: `4px solid ${info.color}`,
                                        transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                                    }}
                                    onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                                    onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <info.icon size={24} style={{ color: info.color }} />
                                            <div>
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{info.label}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{nb} opération(s)</p>
                                            </div>
                                        </div>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: info.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Plus size={16} color={info.color} />
                                        </div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: total > 0 ? info.color : '#cbd5e1' }}>
                                        {total > 0 ? formatMoney(total) : '0 GNF'}
                                    </p>
                                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>Cliquer pour enregistrer</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Total général */}
                    <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #0f172a, #1e293b)', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Total Général Décaissements</p>
                                <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: 800, color: '#ef4444' }}>
                                    {formatMoney(depensesStats.total_depenses)}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Validés</p>
                                <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                                    {formatMoney(depensesStats.total_valide)}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>En attente</p>
                                <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>
                                    {formatMoney(depensesStats.total_en_attente)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Dernières opérations */}
                    <div style={cardStyle}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}><Clock size={16} /> Dernières Opérations</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {depenses.slice(0, 15).map(d => {
                                const info = CATEGORIE_INFO[d.categorie] || CATEGORIE_INFO['AUTRE'];
                                return (
                                    <div key={d.depense_id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '12px 16px', borderRadius: '10px', background: '#f8fafc',
                                        borderLeft: `3px solid ${info.color}`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <info.icon size={18} style={{ color: info.color }} />
                                            <div>
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                                                    {d.fournisseur || d.description || info.label}
                                                </p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                                    {info.label} — {formatDate(d.date_depense)}
                                                </p>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ef4444' }}>{formatMoney(d.montant)}</p>
                                                <Badge statut={d.statut} />
                                            </div>
                                            {(d.statut === 'EN_ATTENTE' || d.statut === 'APPROUVEE') && (
                                                <>
                                                    <button onClick={e => { e.stopPropagation(); validerDepense(d.depense_id); }}
                                                        style={{ padding: '5px 10px', fontSize: '11px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle size={12} /> Valider
                                                    </button>
                                                    <button onClick={e => { e.stopPropagation(); rejeterDepense(d.depense_id); }}
                                                        style={{ padding: '5px 10px', fontSize: '11px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <XCircle size={12} /> Rejeter
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {depenses.length === 0 && (
                                <p style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '14px' }}>Aucun décaissement enregistré. Cliquez sur une catégorie pour commencer.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                ONGLET 5 : DECAISSEMENTS
               ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'decaissements' && (
                <div>
                    {/* Filtres */}
                    <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={labelStyle}>Categorie</label>
                            <select value={decaisFilterCat} onChange={e => setDecaisFilterCat(e.target.value)} style={selectStyle}>
                                <option value="">Toutes</option>
                                {CATEGORIE_DEPENSES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: '1 1 180px' }}>
                            <label style={labelStyle}>Date debut</label>
                            <input type="date" value={decaisDateDebut} onChange={e => setDecaisDateDebut(e.target.value)} style={inputStyle} />
                        </div>
                        <div style={{ flex: '1 1 180px' }}>
                            <label style={labelStyle}>Date fin</label>
                            <input type="date" value={decaisDateFin} onChange={e => setDecaisDateFin(e.target.value)} style={inputStyle} />
                        </div>
                        <button style={btnSecondary} onClick={() => { setDecaisFilterCat(''); setDecaisDateDebut(''); setDecaisDateFin(''); }}>
                            <X size={14} /> Effacer
                        </button>
                    </div>

                    {/* Resume par categorie */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                        {CATEGORIE_DEPENSES.map(cat => {
                            const total = depensesStats.par_categorie.find(c => c.categorie === cat)?.total || 0;
                            if (total === 0) return null;
                            return (
                                <div key={cat} style={{ ...cardStyle, padding: '16px', cursor: 'pointer', transition: 'all 0.15s', borderLeft: '4px solid #ef4444' }}
                                    onClick={() => setDecaisFilterCat(cat)}>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>{cat}</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{formatMoney(total)}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Tableau des decaissements */}
                    <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    {['Date', 'Categorie', 'Description', 'Fournisseur', 'Reference', 'Montant', 'Statut'].map(h => (
                                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDepenses.map(d => (
                                    <tr key={d.depense_id} style={{ borderBottom: '1px solid #f1f5f9' }}
                                        onMouseOver={e => (e.currentTarget.style.background = '#f8fafc')}
                                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '12px 16px', color: '#64748b' }}>{formatDate(d.date_depense)}</td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{d.categorie}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</td>
                                        <td style={{ padding: '12px 16px', color: '#475569' }}>{d.fournisseur || '—'}</td>
                                        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>{d.reference || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#ef4444' }}>{formatMoney(d.montant)}</td>
                                        <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Badge statut={d.statut} />
                                            {(d.statut === 'EN_ATTENTE' || d.statut === 'APPROUVEE') && (
                                                <>
                                                    <button onClick={() => validerDepense(d.depense_id)}
                                                        style={{ padding: '4px 8px', fontSize: '11px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle size={12} /> Valider
                                                    </button>
                                                    <button onClick={() => rejeterDepense(d.depense_id)}
                                                        style={{ padding: '4px 8px', fontSize: '11px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <XCircle size={12} /> Rejeter
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredDepenses.length === 0 && (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucun decaissement trouve</td></tr>
                                )}
                            </tbody>
                        </table>
                        <Pagination page={pageDepenses} pageSize={pageSize} total={totalDepenses} onPageChange={setPageDepenses} />
                    </div>

                    {/* Total */}
                    <div style={{ ...cardStyle, marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>Total des decaissements affiches :</span>
                        <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{formatMoney(filteredDepenses.reduce((s, d) => s + d.montant, 0))}</span>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                ONGLET 6 : REDUCTIONS & CONFIG
               ════════════════════════════════════════════════════════════════ */}
            {activeTab === 'reductions' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {/* Remises / Reductions */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Percent size={18} color="#f59e0b" /> Reductions & Remises
                            </h3>
                            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                                Les reductions sont appliquees directement sur les factures. Rendez-vous dans
                                <strong> Frais Scolaires &gt; Factures</strong> pour appliquer une remise sur une facture specifique.
                            </p>
                            <div style={{ marginTop: '16px', padding: '16px', background: '#fffbeb', borderRadius: '12px', border: '1px solid #fde68a' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertTriangle size={16} /> Factures avec remises appliquees
                                </p>
                                <p style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: 800, color: '#d97706' }}>
                                    {factures.filter(f => f.montant_total !== f.montant_restant + (f.montant_paye || 0)).length}
                                </p>
                            </div>
                        </div>

                        {/* Bourses */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Award size={18} color="#3b82f6" /> Bourses Scolaires
                            </h3>
                            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                                La gestion des bourses se fait via le module <strong>Specificites Scolaires</strong> dans le menu de gauche.
                                Les bourses attribuees sont automatiquement deduites des factures concernees.
                            </p>
                            <div style={{ marginTop: '16px', padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Award size={16} /> Module disponible
                                </p>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#3b82f6' }}>
                                    Specificites Scolaires dans le menu comptabilite
                                </p>
                            </div>
                        </div>

                        {/* Penalites */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CircleDollarSign size={18} color="#ef4444" /> Penalites & Frais Supplementaires
                            </h3>
                            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                                Les penalites de retard et frais supplementaires peuvent etre configures dans
                                <strong> Frais Scolaires &gt; Parametrage des tarifs</strong>. Creez un nouveau type de frais avec la categorie appropriee.
                            </p>
                            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['Inscription', 'Scolarite', 'Transport', 'Cantine', 'Uniforme', 'Activites'].map(cat => (
                                    <span key={cat} style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, background: '#f1f5f9', color: '#475569' }}>{cat}</span>
                                ))}
                            </div>
                        </div>

                        {/* Modes de paiement acceptes */}
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CreditCard size={18} color="#10b981" /> Modes de Paiement Acceptes
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {modesAffichables.map(m => (
                                    <div key={m.value} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', background: '#f8fafc' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${m.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <m.icon size={16} color={m.color} />
                                        </div>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{m.label}</span>
                                        <CheckCircle2 size={16} color="#10b981" style={{ marginLeft: 'auto' }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                MODAL : NOUVEAU PAIEMENT
               ════════════════════════════════════════════════════════════════ */}
            {showPayModal && (
                <div style={modalOverlay} onClick={() => setShowPayModal(false)}>
                    <div style={modalBox} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <HandCoins size={22} color="#10b981" /> Enregistrer un Paiement
                            </h2>
                            <button onClick={() => setShowPayModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Selection de la facture */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Facture a payer *</label>
                            <select value={payForm.facture_id || ''} onChange={e => {
                                const fid = parseInt(e.target.value);
                                const fac = factures.find(f => f.facture_id === fid);
                                setPayForm({ ...payForm, facture_id: fid, echeance_id: null, montant: '' });
                                setSelectedFacture(fac || null);
                            }} style={selectStyle}>
                                <option value="">-- Selectionner une facture --</option>
                                {facturesImpayees.map(f => (
                                    <option key={f.facture_id} value={f.facture_id}>
                                        {f.numero_facture} — {f.eleve_prenom} {f.eleve_nom} — Reste: {formatMoney(f.montant_restant)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Info facture selectionnee */}
                        {selectedFacture && (
                            <div style={{ padding: '14px', background: '#f0fdf4', borderRadius: '12px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                                    <div><span style={{ color: '#64748b' }}>Eleve:</span> <strong>{selectedFacture.eleve_prenom} {selectedFacture.eleve_nom}</strong></div>
                                    <div><span style={{ color: '#64748b' }}>Classe:</span> <strong>{selectedFacture.classe_nom}</strong></div>
                                    <div><span style={{ color: '#64748b' }}>Total:</span> <strong>{formatMoney(selectedFacture.montant_total)}</strong></div>
                                    <div><span style={{ color: '#64748b' }}>Reste:</span> <strong style={{ color: '#ef4444' }}>{formatMoney(selectedFacture.montant_restant)}</strong></div>
                                </div>

                                {/* Echeances */}
                                {selectedFacture.echeances?.length > 0 && (
                                    <div style={{ marginTop: '12px' }}>
                                        <label style={{ ...labelStyle, fontSize: '12px' }}>Echeance (optionnel)</label>
                                        <select value={payForm.echeance_id || ''} onChange={e => setPayForm({ ...payForm, echeance_id: e.target.value ? parseInt(e.target.value) : null })} style={selectStyle}>
                                            <option value="">-- Paiement libre --</option>
                                            {selectedFacture.echeances.filter(e => e.statut !== 'PAYEE').map(e => (
                                                <option key={e.echeance_id} value={e.echeance_id}>
                                                    {e.libelle} — {formatDate(e.date_limite)} — Reste: {formatMoney(e.montant_attendu - e.montant_paye)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Montant */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Montant (GNF) *</label>
                            <input type="number" value={payForm.montant}
                                onChange={e => setPayForm({ ...payForm, montant: e.target.value })}
                                placeholder="Ex: 500000" style={inputStyle} />
                        </div>

                        {/* Mode de paiement */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Mode de paiement *</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                {modesAffichables.map(m => (
                                    <button key={m.value} onClick={() => setPayForm({ ...payForm, mode_paiement: m.value })}
                                        style={{
                                            padding: '10px', borderRadius: '10px', border: `2px solid ${payForm.mode_paiement === m.value ? m.color : '#e2e8f0'}`,
                                            background: payForm.mode_paiement === m.value ? `${m.color}10` : 'white',
                                            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                                            transition: 'all 0.15s',
                                        }}>
                                        <m.icon size={20} color={payForm.mode_paiement === m.value ? m.color : '#94a3b8'} />
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: payForm.mode_paiement === m.value ? m.color : '#64748b' }}>{m.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Reference externe */}
                        <div style={{ marginBottom: '24px' }}>
                            <label style={labelStyle}>Reference externe (optionnel)</label>
                            <input type="text" value={payForm.reference_externe}
                                onChange={e => setPayForm({ ...payForm, reference_externe: e.target.value })}
                                placeholder="N de cheque, ID transaction mobile, etc." style={inputStyle} />
                        </div>

                        {/* Boutons */}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowPayModal(false)} style={btnSecondary}>Annuler</button>
                            <button onClick={handlePay} disabled={payLoading}
                                style={{ ...btnPrimary, opacity: payLoading ? 0.6 : 1 }}>
                                {payLoading ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={16} />}
                                {payLoading ? 'Enregistrement...' : 'Enregistrer le Paiement'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                MODAL : ANNULATION PAIEMENT
               ════════════════════════════════════════════════════════════════ */}
            {showCancelModal && (
                <div style={modalOverlay} onClick={() => setShowCancelModal(false)}>
                    <div style={{ ...modalBox, maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Ban size={22} /> Annuler un Paiement
                        </h2>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                            Cette action est irreversible. Le montant sera rembourse sur la facture correspondante.
                        </p>
                        <label style={labelStyle}>Motif d'annulation *</label>
                        <textarea value={cancelMotif} onChange={e => setCancelMotif(e.target.value)}
                            placeholder="Expliquez la raison de l'annulation..."
                            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button onClick={() => setShowCancelModal(false)} style={btnSecondary}>Retour</button>
                            <button onClick={handleCancel} disabled={cancelLoading || !cancelMotif.trim()}
                                style={{ ...btnPrimary, background: 'linear-gradient(135deg, #ef4444, #dc2626)', opacity: cancelLoading || !cancelMotif.trim() ? 0.5 : 1 }}>
                                {cancelLoading ? 'Annulation...' : 'Confirmer l\'annulation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                MODAL : SOLDE ELEVE
               ════════════════════════════════════════════════════════════════ */}
            {showSoldeModal && (
                <div style={modalOverlay} onClick={() => setShowSoldeModal(false)}>
                    <div style={{ ...modalBox, maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Fiche Financiere de l'Eleve</h2>
                                {soldeData && (
                                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>{soldeData.eleve_prenom} {soldeData.eleve_nom} — {soldeData.eleve_matricule}</p>
                                )}
                            </div>
                            <button onClick={() => setShowSoldeModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}>
                                <X size={18} />
                            </button>
                        </div>
                        {soldeLoading ? (
                            <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Chargement...</p>
                        ) : soldeData ? (
                            <div>
                                {/* Resume */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Total facture</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{formatMoney(soldeData.total_facture)}</p>
                                    </div>
                                    <div style={{ padding: '16px', background: '#ecfdf5', borderRadius: '12px', textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#064e3b' }}>Total paye</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#059669' }}>{formatMoney(soldeData.total_paye)}</p>
                                    </div>
                                    <div style={{ padding: '16px', background: soldeData.total_restant > 0 ? '#fef2f2' : '#ecfdf5', borderRadius: '12px', textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: '12px', color: soldeData.total_restant > 0 ? '#991b1b' : '#064e3b' }}>Solde restant</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: soldeData.total_restant > 0 ? '#dc2626' : '#059669' }}>{formatMoney(soldeData.total_restant)}</p>
                                    </div>
                                </div>

                                {/* Details Factures */}
                                {soldeData.factures?.length > 0 && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Details des Factures</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {soldeData.factures.map((f: any, i: number) => (
                                                <div key={i} style={{ padding: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                                                        <div>
                                                            <strong style={{ fontSize: '14px', color: '#3b82f6' }}>{f.numero_facture}</strong>
                                                            <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '12px' }}>— {f.type_frais_libelle}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <Badge statut={f.statut} />
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', color: '#475569' }}>
                                                        <div>Montant: <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatMoney(f.montant_total)}</span></div>
                                                        <div>Paye: <span style={{ fontWeight: 600, color: '#059669' }}>{formatMoney(f.montant_paye)}</span></div>
                                                        <div>Reste: <span style={{ fontWeight: 600, color: '#dc2626' }}>{formatMoney(f.montant_restant)}</span></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Historique paiements — aplati depuis chaque facture (la réponse
                                    backend n'a pas de tableau `paiements` à plat au niveau racine) */}
                                {(() => {
                                    const tousPaiements = (soldeData.factures || []).flatMap((f: any) => f.paiements || []);
                                    return tousPaiements.length > 0 && (
                                        <>
                                            <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Historique des Paiements</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {tousPaiements.map((p: any, i: number) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '13px' }}>
                                                        <div>
                                                            <span style={{ fontWeight: 600 }}>{p.numero_recu}</span>
                                                            <span style={{ color: '#94a3b8', marginLeft: '8px' }}>{formatDate(p.date_paiement)}</span>
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: '#059669' }}>{formatMoney(p.montant)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Impossible de charger les donnees</p>
                        )}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                MODAL : ENREGISTREMENT DÉCAISSEMENT (toutes catégories)
               ════════════════════════════════════════════════════════════════ */}
            {showFournisseurForm && (() => {
                const info = CATEGORIE_INFO[decaisFormCategorie] || CATEGORIE_INFO['AUTRE'];
                return (
                    <div style={modalOverlay} onClick={() => { setShowFournisseurForm(false); resetFournisseurForm(); }}>
                        <div style={modalBox} onClick={e => e.stopPropagation()}>
                            {/* Header coloré selon la catégorie */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '16px 20px', borderRadius: '12px', background: info.bg, border: `1px solid ${info.color}30` }}>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: info.color, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {info.icon && <info.icon size={22} />}
                                    Nouveau Décaissement — {info.label}
                                </h2>
                                <button onClick={() => { setShowFournisseurForm(false); resetFournisseurForm(); }} style={{ background: 'white', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Sélecteur de catégorie */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={labelStyle}>Catégorie de dépense</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {/* SALAIRES exclu ici : les salaires se paient uniquement via la carte
                                        "Salaires" (qui ouvre le formulaire dédié affichant le net à payer
                                        réel), jamais via ce formulaire générique à montant libre. */}
                                    {CATEGORIE_DEPENSES.filter(cat => cat !== 'SALAIRES').map(cat => {
                                        const ci = CATEGORIE_INFO[cat];
                                        const isActive = decaisFormCategorie === cat;
                                        return (
                                            <button key={cat} onClick={() => {
                                                setDecaisFormCategorie(cat);
                                                // Le justificatif et le suivi analytique sont spécifiques à
                                                // FOURNISSEUR : on les efface pour ne jamais rattacher le
                                                // fichier/la classe d'une catégorie précédente à celle-ci.
                                                setJustificatifFile(null);
                                                setFournisseurForm(f => ({ ...f, source_fonds: 'CAISSE_PRINCIPALE', classe_id: '', departement: '' }));
                                            }}
                                                style={{ padding: '6px 12px', borderRadius: '8px', border: `2px solid ${isActive ? ci.color : '#e2e8f0'}`, background: isActive ? ci.bg : 'white', color: isActive ? ci.color : '#64748b', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                                                {ci.icon && <ci.icon size={14} />} {ci.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={labelStyle}>{info.benefLabel}</label>
                                    <input value={fournisseurForm.fournisseur}
                                        onChange={e => setFournisseurForm({ ...fournisseurForm, fournisseur: e.target.value })}
                                        placeholder={info.benefPlaceholder}
                                        style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Montant (GNF) *</label>
                                    <input type="number" value={fournisseurForm.montant}
                                        onChange={e => setFournisseurForm({ ...fournisseurForm, montant: e.target.value })}
                                        placeholder="Ex: 2 500 000" style={{ ...inputStyle, fontSize: '16px', fontWeight: 600 }} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Description / Motif</label>
                                    <textarea value={fournisseurForm.description}
                                        onChange={e => setFournisseurForm({ ...fournisseurForm, description: e.target.value })}
                                        placeholder={decaisFormCategorie === 'SALAIRES' ? 'Ex: Salaires corps enseignant mois de juin 2026...' : 'Ex: Achat de matériel, prestation de service...'}
                                        style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={labelStyle}>Mode de paiement</label>
                                        <select value={fournisseurForm.mode_paiement}
                                            onChange={e => setFournisseurForm({ ...fournisseurForm, mode_paiement: e.target.value })}
                                            style={selectStyle}>
                                            {modesAffichables.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Référence / N° Pièce</label>
                                        <input value={fournisseurForm.reference}
                                            onChange={e => setFournisseurForm({ ...fournisseurForm, reference: e.target.value })}
                                            placeholder="N° facture, bon de caisse..." style={inputStyle} />
                                    </div>
                                </div>

                                {decaisFormCategorie === 'FOURNISSEUR' && (
                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'grid', gap: '14px' }}>
                                        <div>
                                            <label style={labelStyle}>Justificatif (facture / reçu)</label>
                                            <input type="file" accept="image/*,.pdf"
                                                onChange={e => setJustificatifFile(e.target.files?.[0] || null)}
                                                style={{ ...inputStyle, padding: '8px' }} />
                                        </div>
                                        <div>
                                            <label style={labelStyle}>Sortie de fonds depuis</label>
                                            <select value={fournisseurForm.source_fonds}
                                                onChange={e => setFournisseurForm({ ...fournisseurForm, source_fonds: e.target.value })}
                                                style={selectStyle}>
                                                <option value="CAISSE_PRINCIPALE">Caisse Principale (espèces)</option>
                                                <option value="BANQUE">Compte Bancaire</option>
                                                <option value="MOBILE_MONEY">Mobile Money (OM / MTN)</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            <div>
                                                <label style={labelStyle}>Suivi analytique — Classe</label>
                                                <select value={fournisseurForm.classe_id}
                                                    onChange={e => setFournisseurForm({ ...fournisseurForm, classe_id: e.target.value })}
                                                    style={selectStyle}>
                                                    <option value="">— Non affecté —</option>
                                                    {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Suivi analytique — Département</label>
                                                <input value={fournisseurForm.departement}
                                                    onChange={e => setFournisseurForm({ ...fournisseurForm, departement: e.target.value })}
                                                    placeholder="Ex: Administration, Pédagogie..." style={inputStyle} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                                <button onClick={() => { setShowFournisseurForm(false); resetFournisseurForm(); }} style={btnSecondary}>Annuler</button>
                                <button onClick={handleFournisseurPayment} disabled={fournisseurLoading}
                                    style={{ ...btnPrimary, background: `linear-gradient(135deg, ${info.color}, ${info.color}cc)`, opacity: fournisseurLoading ? 0.6 : 1 }}>
                                    {fournisseurLoading ? 'Enregistrement...' : `Enregistrer le Décaissement`}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* ════════════════════════════════════════════════════════════════
                MODAL : GESTION DES SALAIRES ENSEIGNANTS
               ════════════════════════════════════════════════════════════════ */}
            {showSalaireModal && (
                <div style={modalOverlay} onClick={() => { setShowSalaireModal(false); setSelectedEns(null); }}>
                    <div style={{ ...modalBox, maxWidth: '860px', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Briefcase size={20} /> Gestion des Salaires — Corps Enseignant
                                </h2>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.8)' }}>Sélectionnez un enseignant pour enregistrer son paiement</p>
                            </div>
                            <button onClick={() => { setShowSalaireModal(false); setSelectedEns(null); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'white' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: selectedEns ? '1fr 380px' : '1fr', height: '600px' }}>
                            {/* Panneau gauche : liste des enseignants */}
                            <div style={{ padding: '20px', overflowY: 'auto', borderRight: selectedEns ? '1px solid #e2e8f0' : 'none' }}>
                                {/* Filtre mois + recherche */}
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 180px' }}>
                                        <label style={labelStyle}>Mois de paiement</label>
                                        <input type="month" value={salairesMois}
                                            onChange={e => { setSalairesMois(e.target.value); loadEnseignantsSalaires(e.target.value); }}
                                            style={inputStyle} />
                                    </div>
                                    <div style={{ flex: '2 1 200px' }}>
                                        <label style={labelStyle}>Rechercher un enseignant</label>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                            <input value={salaireSearch} onChange={e => setSalaireSearch(e.target.value)}
                                                placeholder="Nom, prénom, matricule..."
                                                style={{ ...inputStyle, paddingLeft: '36px' }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Liste des enseignants */}
                                {salaireLoading ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                                        <p style={{ marginTop: '8px' }}>Chargement...</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {employesSalaires.filter(e =>
                                            e.nom.toLowerCase().includes(salaireSearch.toLowerCase()) ||
                                            e.prenom.toLowerCase().includes(salaireSearch.toLowerCase())
                                        ).map((ens) => (
                                            <div key={ens.id} style={{ padding: '24px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: ens.type_employe === 'ENSEIGNANT' ? '#e0f2fe' : '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: ens.type_employe === 'ENSEIGNANT' ? '#0284c7' : '#7e22ce', fontSize: '18px', fontWeight: 700 }}>
                                                            {ens.prenom.charAt(0)}{ens.nom.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                                                {ens.prenom} {ens.nom}
                                                            </h3>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                                                                    {ens.role_label}
                                                                </span>
                                                                {ens.telephone && (
                                                                    <>
                                                                        <span style={{ color: '#cbd5e1' }}>•</span>
                                                                        <span style={{ fontSize: '13px', color: '#64748b' }}>{ens.telephone}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>Base mensuelle (avec primes)</p>
                                                        <p style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                                                            {formatMoney(ens.salaire_base + ens.prime_mensuelle)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        {ens.paye_ce_mois ? (
                                                            <div style={{ padding: '8px 12px', background: '#dcfce7', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>Mois payé</span>
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <AlertCircle size={16} style={{ color: '#dc2626' }} />
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>Salaire en attente</span>
                                                            </div>
                                                        )}
                                                        <span style={{ fontSize: '13px', color: '#64748b' }}>Total payé année : {formatMoney(ens.total_paye_annee)}</span>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <button
                                                            onClick={() => setSelectedEns(ens)}
                                                            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                                        >
                                                            <Clock size={16} /> Historique ({ens.nb_paiements})
                                                        </button>
                                                        {!ens.paye_ce_mois && (ens.salaire_base + ens.prime_mensuelle) > 0 && (
                                                            <button
                                                                onClick={() => payerMoisCourantRapide(ens)}
                                                                disabled={salairePaying === ens.id}
                                                                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', fontSize: '13px', fontWeight: 600, cursor: salairePaying === ens.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                                            >
                                                                {salairePaying === ens.id ? <Loader2 size={16} className="animate-spin" /> : <DollarSign size={16} />}
                                                                Payer ce mois
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {employesSalaires.length === 0 && (
                                            <p style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>Aucun employé trouvé.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Panneau droit : formulaire de paiement */}
                            {selectedEns && (
                                <div style={{ padding: '24px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                                    <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                        <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                            {selectedEns.prenom} {selectedEns.nom}
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                            {selectedEns.role_label}
                                        </p>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                            📞 {selectedEns.telephone} — 🆔 {selectedEns.id}
                                        </p>
                                    </div>

                                    {/* Statut du mois */}
                                    <div style={{
                                        padding: '12px 16px', borderRadius: '10px',
                                        background: selectedEns.paye_ce_mois ? '#d1fae5' : '#fef3c7',
                                        border: `1px solid ${selectedEns.paye_ce_mois ? '#6ee7b7' : '#fde68a'}`
                                    }}>
                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: selectedEns.paye_ce_mois ? '#059669' : '#d97706' }}>
                                            {selectedEns.paye_ce_mois
                                                ? <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}><CheckCircle2 size={14} /> Salaire déjà payé pour {salairesMois}</span>
                                                : <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}><Clock size={14} /> Salaire non payé pour {salairesMois}</span>
                                            }
                                        </p>
                                    </div>

                                    {/* Arriérés multi-mois — calculés par le backend (base + primes - absences
                                        - avances par mois), jamais un montant libre saisi ici. Le comptable
                                        coche le(s) mois qu'il veut régler (tous par défaut), ou décoche pour
                                        ne payer qu'un mois précis. */}
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {arrieresLoading ? (
                                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Calcul des arriérés...</p>
                                        ) : arrieresError ? (
                                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px' }}>
                                                <p style={{ margin: 0, fontSize: '13px', color: '#991b1b', fontWeight: 600 }}>
                                                    Impossible de calculer les arriérés pour cet employé. Réessayez ou vérifiez sa fiche.
                                                </p>
                                            </div>
                                        ) : arrieres && arrieres.mois_du.length > 0 ? (
                                            <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '10px', padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#0891b2', fontWeight: 700 }}>
                                                        Mois en retard ({arrieres.mois_du.length}) — Total dû : {formatMoney(arrieres.total_du)}
                                                    </p>
                                                    <button type="button" onClick={() => setMoisSelectionnes(
                                                        moisSelectionnes.length === arrieres.mois_du.length ? [] : arrieres.mois_du.map((m: any) => m.mois_concerne)
                                                    )} style={{ background: 'none', border: 'none', color: '#0891b2', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                        {moisSelectionnes.length === arrieres.mois_du.length ? 'Tout décocher' : 'Tout cocher'}
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                                                    {arrieres.mois_du.map((m: any) => (
                                                        <label key={m.mois_concerne} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 8px', background: 'white', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <input type="checkbox" checked={moisSelectionnes.includes(m.mois_concerne)} onChange={() => toggleMoisSelectionne(m.mois_concerne)} />
                                                                {m.mois_concerne}
                                                            </span>
                                                            <span style={{ fontWeight: 700, color: '#0e7490' }}>{formatMoney(m.net_a_payer)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #99f6e4', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Total sélectionné ({moisSelectionnes.length} mois)</span>
                                                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#0e7490' }}>{formatMoney(montantSelectionne)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px' }}>
                                                <p style={{ margin: 0, fontSize: '13px', color: '#166534', fontWeight: 600 }}>À jour — aucun mois en retard sur les 12 derniers mois.</p>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => payerSalaireEnseignant(selectedEns)}
                                            disabled={salairePaying === selectedEns.id || arrieresLoading || moisSelectionnes.length === 0}
                                            style={{
                                                ...btnPrimary, background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                                                opacity: (salairePaying === selectedEns.id || arrieresLoading || moisSelectionnes.length === 0) ? 0.6 : 1,
                                                justifyContent: 'center', fontSize: '14px'
                                            }}>
                                            {salairePaying === selectedEns.id
                                                ? 'Enregistrement...'
                                                : <span style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}><Banknote size={14} /> Payer {moisSelectionnes.length > 1 ? `${moisSelectionnes.length} mois` : 'le mois coché'} ({formatMoney(montantSelectionne)})</span>
                                            }
                                        </button>
                                    </div>

                                    {/* Historique des paiements de cet enseignant */}
                                    {selectedEns.historique.length > 0 && (
                                        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                                            <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Calendar size={14} /> Historique des paiements
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {selectedEns.historique.map((h, i) => (
                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', fontSize: '12px' }}>
                                                        <span style={{ color: '#475569' }}>{h.date ? new Date(h.date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—'}</span>
                                                        <span style={{ fontWeight: 700, color: '#059669' }}>{formatMoney(h.montant)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ marginTop: '10px', padding: '8px 12px', background: '#0891b215', borderRadius: '8px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0891b2' }}>
                                                    Total payé cette année : {formatMoney(selectedEns.total_paye_annee)}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Chargement...</div>}>
            <GestionPaiements />
        </Suspense>
    );
}
