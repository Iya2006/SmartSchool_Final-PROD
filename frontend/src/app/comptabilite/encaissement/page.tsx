'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Loader2, ChevronRight, Users, X, Printer,
    CheckCircle2, AlertTriangle, CreditCard, Banknote, Smartphone,
    FileText, Receipt, ArrowLeft, TrendingUp, Eye
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────
type EleveSearch = {
    eleve_id: number; eleve_nom: string; eleve_prenom: string; eleve_matricule: string;
    classe_id: number; classe_nom: string;
    total_facture: number; total_paye: number; total_restant: number;
    taux_paiement: number; indicateur: string;
};

type FactureDetail = {
    facture_id: number; numero_facture: string; date_facture: string;
    montant_total: number; montant_paye: number; montant_restant: number;
    statut: string; type_frais_libelle: string;
    echeances: { echeance_id: number; libelle: string; date_limite: string; montant_attendu: number; montant_paye: number; statut: string; }[];
    paiements: { paiement_id: number; numero_recu: string; date_paiement: string; montant: number; mode_paiement: string; }[];
};

type SoldeData = {
    eleve_id: number; eleve_nom: string; eleve_prenom: string; eleve_matricule: string;
    total_facture: number; total_paye: number; total_restant: number; taux_paiement: number;
    factures: FactureDetail[];
};

type RecuData = {
    recu: { numero_recu: string; date_paiement: string; montant: number; mode_paiement: string; reference_externe: string | null; devise: string; };
    facture: { facture_id: number; numero_facture: string; montant_total: number; montant_paye: number; montant_restant: number; statut: string; type_frais: string; };
    eleve: { eleve_id: number; nom: string; prenom: string; matricule: string; classe: string; };
    etablissement: { nom: string; adresse: string; telephone: string; email: string; directeur: string; };
    parent: { nom?: string; telephone?: string; };
    historique_paiements: { numero_recu: string; date_paiement: string; montant: number; mode_paiement: string; }[];
};

// ─── Constants ───────────────────────────────────────────────────────────────
const MODES_PAIEMENT = [
    { value: 'ESPECES', label: 'Espèces', icon: Banknote },
    { value: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone },
    { value: 'VIREMENT', label: 'Virement', icon: CreditCard },
    { value: 'CHEQUE', label: 'Chèque', icon: FileText },
];

const MODE_LABELS: Record<string, string> = {
    'ESPECES': 'Espèces', 'MOBILE_MONEY': 'Mobile Money',
    'VIREMENT': 'Virement', 'CHEQUE': 'Chèque',
};

const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'PARTIELLEMENT_PAYEE': { bg: '#dbeafe', color: '#2563eb', label: 'Partielle' },
    'PAYEE': { bg: '#d1fae5', color: '#059669', label: 'Payée' },
    'EN_RETARD': { bg: '#fee2e2', color: '#dc2626', label: 'En retard' },
};

const fmt = (n: number) => n.toLocaleString('fr-GN');

function Badge({ statut }: { statut: string }) {
    const s = STATUT_COLORS[statut] || { bg: '#f1f5f9', color: '#475569', label: statut };
    return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, backgroundColor: s.bg, color: s.color }}>{s.label}</span>;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function EncaissementPage() {
    const searchParams = useSearchParams();
    const urlEleveId = searchParams.get('eleve_id');

    // Steps: 'search' | 'solde' | 'payer' | 'recu'
    const [step, setStep] = useState<'search' | 'solde' | 'payer' | 'recu'>('search');

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<EleveSearch[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [allData, setAllData] = useState<EleveSearch[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [filterClasse, setFilterClasse] = useState('');
    const [initialLoading, setInitialLoading] = useState(true);

    // Solde state
    const [selectedEleve, setSelectedEleve] = useState<EleveSearch | null>(null);
    const [soldeData, setSoldeData] = useState<SoldeData | null>(null);
    const [soldeLoading, setSoldeLoading] = useState(false);

    // Payment state
    const [selectedFacture, setSelectedFacture] = useState<FactureDetail | null>(null);
    const [payMontant, setPayMontant] = useState('');
    const [payMode, setPayMode] = useState('ESPECES');
    const [payReference, setPayReference] = useState('');
    const [payEcheanceId, setPayEcheanceId] = useState('');
    const [payLoading, setPayLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Receipt state
    const [recuData, setRecuData] = useState<RecuData | null>(null);
    const [recuLoading, setRecuLoading] = useState(false);
    const recuRef = useRef<HTMLDivElement>(null);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    // ─── Load initial data ───
    const loadSolvabilite = useCallback(async () => {
        setInitialLoading(true);
        try {
            const [solvRes, classRes] = await Promise.all([
                api.get('/api/finance/solvabilite?etablissement_id=1&annee_id=1'),
                api.get('/api/classes?etablissement_id=1&annee_id=1'),
            ]);
            setAllData(solvRes.data || []);
            setSearchResults(solvRes.data || []);
            setClasses(classRes.data || []);
        } catch { }
        setInitialLoading(false);
    }, []);

    useEffect(() => { loadSolvabilite(); }, [loadSolvabilite]);

    // ─── Auto-select student from URL param ───
    useEffect(() => {
        if (urlEleveId && allData.length > 0 && step === 'search') {
            const eleve = allData.find(d => d.eleve_id === parseInt(urlEleveId));
            if (eleve) {
                if (eleve.total_restant <= 0) {
                    alert(`Non autorisé : L'élève ${eleve.eleve_prenom} ${eleve.eleve_nom} a déjà réglé l'intégralité de sa scolarité.`);
                    return;
                }
                selectEleve(eleve);
            }
        }
    }, [urlEleveId, allData]);

    // ─── Filter results ───
    useEffect(() => {
        let filtered = allData;
        if (filterClasse) {
            filtered = filtered.filter(d => String(d.classe_id) === filterClasse);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(d =>
                `${d.eleve_prenom} ${d.eleve_nom}`.toLowerCase().includes(q) ||
                d.eleve_matricule.toLowerCase().includes(q) ||
                d.classe_nom.toLowerCase().includes(q)
            );
        }
        setSearchResults(filtered);
    }, [searchQuery, filterClasse, allData]);

    // ─── Select student → load balance ───
    const selectEleve = async (eleve: EleveSearch) => {
        setSelectedEleve(eleve);
        setStep('solde');
        setSoldeLoading(true);
        try {
            const res = await api.get(`/api/finance/solde-eleve/${eleve.eleve_id}?annee_id=1`);
            setSoldeData(res.data);
        } catch {
            showMsg('Erreur lors du chargement du solde', 'error');
        }
        setSoldeLoading(false);
    };

    // ─── Open payment form ───
    const openPayer = (facture: FactureDetail) => {
        setSelectedFacture(facture);
        setPayMontant(facture.montant_restant.toString());
        setPayMode('ESPECES');
        setPayReference('');
        setPayEcheanceId('');
        setStep('payer');
    };

    // ─── Submit payment ───
    const submitPaiement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFacture) return;
        setPayLoading(true);
        try {
            const res = await api.post('/api/finance/paiements', {
                facture_id: selectedFacture.facture_id,
                echeance_id: payEcheanceId ? parseInt(payEcheanceId) : null,
                montant: parseFloat(payMontant),
                mode_paiement: payMode,
                reference_externe: payReference || null,
            });

            showMsg(res.data.message || 'Paiement enregistré avec succès !', 'success');

            // Load receipt
            if (res.data.paiement_id) {
                setRecuLoading(true);
                setStep('recu');
                try {
                    const recuRes = await api.get(`/api/finance/recu/${res.data.paiement_id}`);
                    setRecuData(recuRes.data);
                } catch {
                    showMsg('Paiement enregistré mais erreur lors du chargement du reçu', 'error');
                }
                setRecuLoading(false);
            }

            // Refresh solvabilite data in background
            loadSolvabilite();
        } catch (err: any) {
            showMsg(err.response?.data?.detail || 'Erreur lors du paiement', 'error');
        }
        setPayLoading(false);
    };

    // ─── Print receipt ───
    const printRecu = () => {
        window.print();
    };

    // ─── Back navigation ───
    const goBack = () => {
        if (step === 'recu') {
            // After receipt, go back to student balance
            if (selectedEleve) {
                selectEleve(selectedEleve);
            } else {
                setStep('search');
            }
        } else if (step === 'payer') {
            setStep('solde');
        } else if (step === 'solde') {
            setStep('search');
            setSelectedEleve(null);
            setSoldeData(null);
        }
    };

    // ─── Stats from data ───
    const totalEleves = allData.length;
    const totalFacture = allData.reduce((s, d) => s + d.total_facture, 0);
    const totalPaye = allData.reduce((s, d) => s + d.total_paye, 0);
    const totalRestant = allData.reduce((s, d) => s + d.total_restant, 0);

    if (initialLoading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#10b981" />
            <p style={{ color: '#64748b', fontSize: 14 }}>Chargement des données...</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Breadcrumb */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#10b981' }}>Comptabilité</Link><ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Encaissement des Frais de Scolarité</span>
            </div>

            {/* Message */}
            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ padding: '12px 16px', borderRadius: 10, backgroundColor: message.type === 'error' ? '#fee2e2' : '#d1fae5', color: message.type === 'error' ? '#dc2626' : '#059669', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                        {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════════════════════════════════════════════════════════════════
                STEP 1: SEARCH — Rechercher un élève
            ══════════════════════════════════════════════════════════════════ */}
            {step === 'search' && (
                <>
                    {/* KPI Cards */}
                    <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                        {[
                            { label: 'Total Élèves', value: totalEleves.toString(), color: '#6366f1', bg: '#eef2ff', icon: Users },
                            { label: 'Total Facturé', value: fmt(totalFacture) + ' GNF', color: '#3b82f6', bg: '#dbeafe', icon: FileText },
                            { label: 'Total Encaissé', value: fmt(totalPaye) + ' GNF', color: '#10b981', bg: '#d1fae5', icon: TrendingUp },
                            { label: 'Reste à Recouvrer', value: fmt(totalRestant) + ' GNF', color: '#f59e0b', bg: '#fef3c7', icon: AlertTriangle },
                        ].map((k, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</p>
                                        <p style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</p>
                                    </div>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: k.bg, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <k.icon size={22} />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Search + Filters */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        style={{ background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Search size={18} color="#10b981" /> Rechercher un élève pour encaisser
                        </h3>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: '1 1 300px' }}>
                                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Nom, prénom ou matricule de l'élève..."
                                    autoFocus
                                    style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s' }}
                                    onFocus={e => e.target.style.borderColor = '#10b981'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>
                            <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
                                style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                                <option value="">Toutes les classes</option>
                                {classes.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle || c.code}</option>)}
                            </select>
                        </div>
                    </motion.div>

                    {/* Results Table */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                        style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderBottom: '2px solid #e2e8f0' }}>
                                    {['Élève', 'Matricule', 'Classe', 'Total Facturé', 'Total Payé', 'Reste', 'Taux', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '13px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {searchResults.length === 0 ? (
                                    <tr><td colSpan={8} style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                                        <Users size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.5 }} />
                                        Aucun élève trouvé
                                    </td></tr>
                                ) : searchResults.slice(0, 50).map((d, idx) => (
                                    <motion.tr key={d.eleve_id}
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onClick={() => {
                                            if (d.total_restant <= 0) {
                                                alert(`Non autorisé : L'élève ${d.eleve_prenom} ${d.eleve_nom} a déjà réglé l'intégralité de sa scolarité.`);
                                                return;
                                            }
                                            selectEleve(d);
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>{d.eleve_prenom} {d.eleve_nom}</td>
                                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{d.eleve_matricule}</td>
                                        <td style={{ padding: '12px 14px' }}>{d.classe_nom}</td>
                                        <td style={{ padding: '12px 14px' }}>{fmt(d.total_facture)} GNF</td>
                                        <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 600 }}>{fmt(d.total_paye)} GNF</td>
                                        <td style={{ padding: '12px 14px', color: d.total_restant > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{fmt(d.total_restant)} GNF</td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ width: 50, height: 6, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
                                                    <div style={{ width: `${Math.min(d.taux_paiement, 100)}%`, height: '100%', borderRadius: 3, background: d.taux_paiement >= 100 ? '#10b981' : d.taux_paiement >= 50 ? '#3b82f6' : '#f59e0b' }} />
                                                </div>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{d.taux_paiement}%</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                if (d.total_restant <= 0) {
                                                    alert(`Non autorisé : L'élève ${d.eleve_prenom} ${d.eleve_nom} a déjà réglé l'intégralité de sa scolarité.`);
                                                    return;
                                                }
                                                selectEleve(d);
                                            }}
                                                style={{ padding: '6px 14px', background: d.total_restant <= 0 ? '#e2e8f0' : 'linear-gradient(135deg, #10b981, #059669)', color: d.total_restant <= 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: d.total_restant <= 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Banknote size={13} /> Encaisser
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{searchResults.length} élève(s) trouvé(s)</span>
                            {searchResults.length > 50 && <span style={{ color: '#f59e0b' }}>Affichage limité à 50 — affinez votre recherche</span>}
                        </div>
                    </motion.div>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 2: SOLDE — Voir le solde de l'élève
            ══════════════════════════════════════════════════════════════════ */}
            {step === 'solde' && (
                <>
                    <button className="no-print" onClick={goBack}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                        <ArrowLeft size={16} /> Retour à la recherche
                    </button>

                    {soldeLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                            <Loader2 size={32} className="animate-spin" color="#10b981" />
                        </div>
                    ) : soldeData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Student Header */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', borderRadius: 16, padding: '24px 28px', color: '#fff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{soldeData.eleve_prenom} {soldeData.eleve_nom}</h3>
                                        <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.9 }}>Matricule : {soldeData.eleve_matricule}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '12px 20px', backdropFilter: 'blur(10px)' }}>
                                            <p style={{ fontSize: 11, opacity: 0.85, margin: 0 }}>Taux de paiement</p>
                                            <p style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 0' }}>{soldeData.taux_paiement}%</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Balance Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                                {[
                                    { label: 'Total Facturé', value: fmt(soldeData.total_facture) + ' GNF', color: '#3b82f6', bg: '#dbeafe' },
                                    { label: 'Total Payé', value: fmt(soldeData.total_paye) + ' GNF', color: '#10b981', bg: '#d1fae5' },
                                    { label: 'Reste à Payer', value: fmt(soldeData.total_restant) + ' GNF', color: '#ef4444', bg: '#fee2e2' },
                                ].map((k, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                                        style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', borderLeft: `4px solid ${k.color}` }}>
                                        <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</p>
                                        <p style={{ fontSize: 24, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</p>
                                    </motion.div>
                                ))}
                            </div>

                            <h3 style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={18} color="#3b82f6" /> Factures
                            </h3>
                            {soldeData.factures.length === 0 ? (
                                <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
                                    Aucune facture pour cet élève
                                </div>
                            ) : soldeData.factures.map((f) => (
                                <motion.div key={f.facture_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    {/* Facture Header */}
                                    <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 14 }}>{f.numero_facture}</span>
                                            <Badge statut={f.statut} />
                                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{f.type_frais_libelle}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {f.statut !== 'PAYEE' && (
                                                <button className="no-print" onClick={() => openPayer(f)}
                                                    style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <Banknote size={15} /> Encaisser
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amounts */}
                                    <div style={{ padding: '14px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13 }}>
                                        <div><p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>Facturé</p><p style={{ fontWeight: 700, margin: '4px 0 0' }}>{fmt(f.montant_total)} GNF</p></div>
                                        <div><p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>Payé</p><p style={{ fontWeight: 700, color: '#10b981', margin: '4px 0 0' }}>{fmt(f.montant_paye)} GNF</p></div>
                                        <div><p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>Reste</p><p style={{ fontWeight: 700, color: '#ef4444', margin: '4px 0 0' }}>{fmt(f.montant_restant)} GNF</p></div>
                                    </div>

                                    {/* Progress bar */}
                                    <div style={{ padding: '0 22px 14px' }}>
                                        <div style={{ width: '100%', height: 8, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
                                            <div style={{ width: `${f.montant_total > 0 ? Math.min(100, (f.montant_paye / f.montant_total) * 100) : 0}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #10b981, #059669)', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>

                                    {/* Payment history */}
                                    {f.paiements && f.paiements.length > 0 && (
                                        <div style={{ padding: '0 22px 16px' }}>
                                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Historique des paiements</p>
                                            {f.paiements.map((p) => (
                                                <div key={p.paiement_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 4, fontSize: 12 }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Receipt size={12} color="#10b981" />
                                                        <strong>{p.numero_recu}</strong> — {p.date_paiement}
                                                    </span>
                                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{fmt(p.montant)} GNF <span style={{ fontWeight: 400, color: '#94a3b8' }}>({MODE_LABELS[p.mode_paiement] || p.mode_paiement})</span></span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ background: '#fff', borderRadius: 12, padding: 60, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
                            <Users size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                            <p>Données non disponibles</p>
                        </div>
                    )}
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 3: PAYER — Enregistrer un paiement
            ══════════════════════════════════════════════════════════════════ */}
            {step === 'payer' && selectedFacture && (
                <>
                    <button className="no-print" onClick={goBack}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                        <ArrowLeft size={16} /> Retour au solde
                    </button>

                    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                        style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
                        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '24px 28px', color: '#fff' }}>
                                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Banknote size={22} /> Enregistrer un Paiement
                                </h3>
                                <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.9 }}>
                                    {selectedEleve?.eleve_prenom} {selectedEleve?.eleve_nom} — {selectedFacture.numero_facture}
                                </p>
                            </div>

                            {/* Recap Facture */}
                            <div style={{ padding: '20px 28px', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 18, border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                        <div><p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Facturé</p><p style={{ fontWeight: 700, fontSize: 16, margin: '4px 0 0' }}>{fmt(selectedFacture.montant_total)} GNF</p></div>
                                        <div><p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Déjà payé</p><p style={{ fontWeight: 700, fontSize: 16, color: '#10b981', margin: '4px 0 0' }}>{fmt(selectedFacture.montant_paye)} GNF</p></div>
                                        <div><p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Reste à payer</p><p style={{ fontWeight: 800, fontSize: 18, color: '#ef4444', margin: '4px 0 0' }}>{fmt(selectedFacture.montant_restant)} GNF</p></div>
                                    </div>
                                </div>
                            </div>

                            {/* Form */}
                            <form onSubmit={submitPaiement} style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                                {/* Échéance selector */}
                                {selectedFacture.echeances && selectedFacture.echeances.filter(e => e.statut !== 'PAYEE').length > 0 && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Appliquer à une échéance (optionnel)</label>
                                        <select value={payEcheanceId} onChange={e => {
                                            setPayEcheanceId(e.target.value);
                                            if (e.target.value) {
                                                const ech = selectedFacture.echeances.find(ec => ec.echeance_id === parseInt(e.target.value));
                                                if (ech) setPayMontant((ech.montant_attendu - ech.montant_paye).toString());
                                            }
                                        }} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}>
                                            <option value="">— Paiement libre —</option>
                                            {selectedFacture.echeances.filter(e => e.statut !== 'PAYEE').map(e => (
                                                <option key={e.echeance_id} value={e.echeance_id}>
                                                    {e.libelle} — Reste: {fmt(e.montant_attendu - e.montant_paye)} GNF
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Montant */}
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Montant reçu (GNF) *</label>
                                    <input type="number" value={payMontant} onChange={e => setPayMontant(e.target.value)}
                                        required min="1" max={selectedFacture.montant_restant}
                                        style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '2px solid #10b981', fontSize: 20, fontWeight: 800, color: '#059669', boxSizing: 'border-box', textAlign: 'center', outline: 'none' }} />
                                    {parseFloat(payMontant) < selectedFacture.montant_restant && parseFloat(payMontant) > 0 && (
                                        <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 6, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <AlertTriangle size={14} color="#f59e0b" /> Paiement partiel — Reliquat après paiement : {fmt(selectedFacture.montant_restant - parseFloat(payMontant))} GNF
                                        </p>
                                    )}
                                </div>

                                {/* Mode de paiement */}
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 8, fontWeight: 600 }}>Mode de paiement *</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {MODES_PAIEMENT.map(m => {
                                            const Icon = m.icon;
                                            return (
                                                <button key={m.value} type="button" onClick={() => setPayMode(m.value)}
                                                    style={{
                                                        padding: '14px 12px', border: `2px solid ${payMode === m.value ? '#10b981' : '#e2e8f0'}`,
                                                        borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                                                        backgroundColor: payMode === m.value ? '#ecfdf5' : 'white',
                                                        color: payMode === m.value ? '#059669' : '#475569', transition: 'all 0.2s',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                                    }}>
                                                    <Icon size={18} /> {m.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Reference */}
                                {(payMode === 'CHEQUE' || payMode === 'MOBILE_MONEY' || payMode === 'VIREMENT') && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Référence externe</label>
                                        <input value={payReference} onChange={e => setPayReference(e.target.value)}
                                            placeholder="N° de transaction, chèque, etc."
                                            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                                    </div>
                                )}

                                {/* Submit */}
                                <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                                    <button type="button" onClick={goBack}
                                        style={{ flex: 1, padding: '14px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                                        Annuler
                                    </button>
                                    <button type="submit" disabled={payLoading}
                                        style={{ flex: 2, padding: '14px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: payLoading ? 0.7 : 1 }}>
                                        {payLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                        {payLoading ? 'Enregistrement...' : 'Valider le paiement'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                STEP 4: REÇU — Afficher et imprimer le reçu
            ══════════════════════════════════════════════════════════════════ */}
            {step === 'recu' && (
                <>
                    {/* Action bar (no-print) */}
                    <div className="no-print" style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={goBack}
                            style={{ padding: '10px 20px', borderRadius: 10, background: '#f1f5f9', color: '#475569', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ArrowLeft size={16} /> Retour au solde
                        </button>
                        <button onClick={printRecu}
                            style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Printer size={16} /> Imprimer le reçu (PDF)
                        </button>
                        <button onClick={() => { setStep('search'); setSelectedEleve(null); setSoldeData(null); setRecuData(null); }}
                            style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Banknote size={16} /> Nouvel encaissement
                        </button>
                    </div>

                    {recuLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                            <Loader2 size={32} className="animate-spin" color="#10b981" />
                        </div>
                    ) : recuData ? (
                        <div id="print-area" ref={recuRef} style={{ maxWidth: 650, margin: '0 auto', width: '100%' }}>
                            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                {/* Receipt Header */}
                                <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '28px 32px', color: '#fff', textAlign: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{recuData.etablissement.nom}</h2>
                                    <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.9 }}>
                                        {recuData.etablissement.adresse} {recuData.etablissement.telephone ? `• Tél: ${recuData.etablissement.telephone}` : ''}
                                    </p>
                                    <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: '8px 16px', display: 'inline-block' }}>
                                        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2 }}>REÇU DE PAIEMENT</span>
                                    </div>
                                </div>

                                {/* Receipt number + date */}
                                <div style={{ padding: '18px 32px', borderBottom: '2px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>N° Reçu</p>
                                        <p style={{ fontSize: 20, fontWeight: 800, color: '#10b981', margin: '2px 0 0', fontFamily: 'monospace' }}>{recuData.recu.numero_recu}</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Date</p>
                                        <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '2px 0 0' }}>
                                            {recuData.recu.date_paiement ? new Date(recuData.recu.date_paiement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
                                        </p>
                                    </div>
                                </div>

                                {/* Student & Parent info */}
                                <div style={{ padding: '18px 32px', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div>
                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Élève</p>
                                            <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>{recuData.eleve.prenom} {recuData.eleve.nom}</p>
                                            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Matricule : {recuData.eleve.matricule}</p>
                                            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Classe : {recuData.eleve.classe}</p>
                                        </div>
                                        {recuData.parent.nom && (
                                            <div>
                                                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Parent / Responsable</p>
                                                <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>{recuData.parent.nom}</p>
                                                {recuData.parent.telephone && <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Tél : {recuData.parent.telephone}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Payment details */}
                                <div style={{ padding: '22px 32px', borderBottom: '2px dashed #e2e8f0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                                <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Désignation</th>
                                                <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 0', fontSize: 14, color: '#1e293b' }}>{recuData.facture.type_frais}</td>
                                                <td style={{ padding: '12px 0', fontSize: 14, color: '#1e293b', textAlign: 'right' }}>{fmt(recuData.facture.montant_total)} GNF</td>
                                            </tr>
                                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '10px 0', fontSize: 13, color: '#64748b' }}>Montants précédemment payés</td>
                                                <td style={{ padding: '10px 0', fontSize: 13, color: '#64748b', textAlign: 'right' }}>{fmt(recuData.facture.montant_paye - recuData.recu.montant)} GNF</td>
                                            </tr>
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ borderTop: '2px solid #10b981' }}>
                                                <td style={{ padding: '14px 0', fontSize: 18, fontWeight: 800, color: '#059669' }}>MONTANT REÇU</td>
                                                <td style={{ padding: '14px 0', fontSize: 22, fontWeight: 800, color: '#059669', textAlign: 'right' }}>{fmt(recuData.recu.montant)} GNF</td>
                                            </tr>
                                            {recuData.facture.montant_restant > 0 && (
                                                <tr>
                                                    <td style={{ padding: '8px 0', fontSize: 14, fontWeight: 600, color: '#ef4444' }}>Reste à payer</td>
                                                    <td style={{ padding: '8px 0', fontSize: 16, fontWeight: 700, color: '#ef4444', textAlign: 'right' }}>{fmt(recuData.facture.montant_restant)} GNF</td>
                                                </tr>
                                            )}
                                        </tfoot>
                                    </table>
                                </div>

                                {/* Mode de paiement */}
                                <div style={{ padding: '16px 32px', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Mode de paiement</p>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '4px 0 0' }}>
                                                {MODE_LABELS[recuData.recu.mode_paiement] || recuData.recu.mode_paiement}
                                            </p>
                                        </div>
                                        {recuData.recu.reference_externe && (
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Référence</p>
                                                <p style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', margin: '4px 0 0' }}>{recuData.recu.reference_externe}</p>
                                            </div>
                                        )}
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'uppercase', fontWeight: 600 }}>Statut facture</p>
                                            <Badge statut={recuData.facture.statut} />
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div style={{ padding: '20px 32px', textAlign: 'center', background: '#f8fafc' }}>
                                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                                        Ce reçu fait foi de paiement. Conservez-le précieusement.
                                    </p>
                                    <div style={{ marginTop: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 10px' }}>
                                        <div style={{ width: 150, height: 80 }}>
                                            {/* Espace vide pour le cachet physique, sans mention textuelle */}
                                        </div>
                                        <div style={{ textAlign: 'center', minWidth: 180 }}>
                                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 65px 0' }}>Le Comptable</p>
                                            <div style={{ borderTop: '1.5px solid #94a3b8', paddingTop: 6, fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                                                Signature & Date
                                            </div>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 10, color: '#cbd5e1', marginTop: 16 }}>
                                        {recuData.etablissement.nom} — Document généré le {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Reçu non disponible</div>
                    )}
                </>
            )}

            {/* ─── Print Styles ─── */}
            <style>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

                @media print {
                    body * { visibility: hidden; }
                    #print-area, #print-area * { visibility: visible !important; }
                    #print-area {
                        position: absolute; left: 0; top: 0; width: 100%;
                        padding: 0 !important; border: none !important;
                        box-shadow: none !important;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
}
