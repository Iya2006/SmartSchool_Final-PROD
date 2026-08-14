'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle, Search, RefreshCw, Download, Users, Banknote,
    TrendingUp, Loader2, Eye, Bell, X, Printer, ChevronRight,
    Phone, FileText, CheckCircle2, XCircle, Filter,
    ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import Pagination from '@/components/Pagination';
import AnneeFilter from '@/components/AnneeFilter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/* ───── Types ───── */
type Impaye = {
    facture_id: number; numero_facture: string;
    type_frais_libelle: string;
    eleve_id: number; eleve_nom: string; eleve_prenom: string; eleve_matricule: string;
    classe_id: number; classe_nom: string;
    parent_nom: string; parent_telephone: string;
    montant_total: number; montant_paye: number; montant_restant: number;
    statut: string; date_facture: string | null; date_limite: string | null;
    jours_retard: number;
};
type AvisData = {
    facture: any; eleve: any; etablissement: any; parent: any; echeances: any[]; paiements: any[];
};

const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'PARTIELLEMENT_PAYEE': { bg: '#dbeafe', color: '#2563eb', label: 'Partielle' },
    'EN_RETARD': { bg: '#fee2e2', color: '#dc2626', label: 'En retard' },
};

function Badge({ statut }: { statut: string }) {
    const s = STATUT_COLORS[statut] || { bg: '#f1f5f9', color: '#475569', label: statut };
    return <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, backgroundColor: s.bg, color: s.color }}>{s.label}</span>;
}

function RetardBadge({ jours }: { jours: number }) {
    const color = jours > 30 ? '#dc2626' : jours > 7 ? '#d97706' : '#64748b';
    const bg = jours > 30 ? '#fee2e2' : jours > 7 ? '#fef3c7' : '#f1f5f9';
    return <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, backgroundColor: bg, color }}>{jours}j</span>;
}

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('fr-GN') + ' GNF';

/* ───── Sorting ───── */
type SortKeyImp = 'eleve' | 'classe' | 'montant_restant' | 'jours_retard' | 'statut' | 'montant_total';
type SortDir = 'asc' | 'desc';

function SortHeader({ label, sortKey, currentKey, currentDir, onSort }: {
    label: string; sortKey: SortKeyImp; currentKey: SortKeyImp; currentDir: SortDir;
    onSort: (key: SortKeyImp) => void;
}) {
    const active = currentKey === sortKey;
    return (
        <th
            onClick={() => onSort(sortKey)}
            style={{
                padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569',
                cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label}
                {active ? (
                    currentDir === 'asc' ? <ArrowUp size={13} color="#3b82f6" /> : <ArrowDown size={13} color="#3b82f6" />
                ) : (
                    <ArrowUpDown size={13} style={{ opacity: 0.3 }} />
                )}
            </div>
        </th>
    );
}

export default function ImpayesPage() {
    const { etablissementId, anneeId } = useApp();
    // Année consultée — par défaut l'année en cours ; filtrable pour l'historique.
    const [filterAnnee, setFilterAnnee] = useState<number>(anneeId);
    useEffect(() => { setFilterAnnee(anneeId); }, [anneeId]);
    const [search, setSearch] = useState('');
    const [filterClasse, setFilterClasse] = useState('');
    const [filterStatut, setFilterStatut] = useState('');
    const [filterTypeFrais, setFilterTypeFrais] = useState('');
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Pagination
    const pageSize = 25;
    const [page, setPage] = useState(1);

    // Sorting
    const [sortKeyImp, setSortKeyImp] = useState<SortKeyImp>('jours_retard');
    const [sortDirImp, setSortDirImp] = useState<SortDir>('desc');

    // Modal avis
    const [showAvis, setShowAvis] = useState(false);
    const [avisData, setAvisData] = useState<AvisData | null>(null);
    const [avisLoading, setAvisLoading] = useState(false);

    // Notification
    const [notifying, setNotifying] = useState(false);

    const showMsg = (text: any, type: 'success' | 'error') => {
        let messageText = typeof text === 'string' ? text : 'Erreur inattendue';
        if (Array.isArray(text)) {
            messageText = text.map((t: any) => t.msg || JSON.stringify(t)).join(', ');
        } else if (typeof text === 'object' && text !== null) {
            messageText = text.msg || text.message || JSON.stringify(text);
        }
        setMessage({ text: messageText, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const queryClient = useQueryClient();

    const { data: pageData, isLoading: loading, refetch: fetchData } = useQuery({
        queryKey: ['impayes', etablissementId, filterAnnee, page, filterClasse, filterStatut, filterTypeFrais, search],
        queryFn: async () => {
            const skip = (page - 1) * pageSize;
            const params = new URLSearchParams({
                etablissement_id: String(etablissementId),
                annee_id: String(filterAnnee),
                skip: String(skip),
                limit: String(pageSize),
            });
            const statsParams = new URLSearchParams({
                etablissement_id: String(etablissementId),
                annee_id: String(filterAnnee),
            });
            if (filterClasse) { params.set('classe_id', filterClasse); statsParams.set('classe_id', filterClasse); }
            if (filterStatut) { params.set('statut', filterStatut); statsParams.set('statut', filterStatut); }
            if (filterTypeFrais) { params.set('type_frais_id', filterTypeFrais); statsParams.set('type_frais_id', filterTypeFrais); }
            if (search) params.set('search', search);

            const [impRes, statsRes, classRes, tfRes] = await Promise.all([
                api.get(`/api/finance/impayes?${params}`),
                api.get(`/api/finance/factures/stats?${statsParams}`),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${filterAnnee}`),
                api.get('/api/finance/types-frais').catch(() => ({ data: [] }))
            ]);

            const totalCount = impRes.headers?.['x-total-count'];

            return {
                impayes: impRes.data,
                total: totalCount !== undefined ? Number(totalCount) : impRes.data.length,
                stats: statsRes.data,
                classes: classRes.data || [],
                typesFrais: tfRes.data || []
            };
        }
    });

    const impayes = pageData?.impayes || [];
    const total = pageData?.total || 0;
    const stats = pageData?.stats || null;
    const classes = pageData?.classes || [];
    const typesFrais = pageData?.typesFrais || [];

    // Réinitialiser la pagination quand un filtre change, pour éviter une page vide
    useEffect(() => { setPage(1); }, [filterClasse, filterStatut, filterTypeFrais, search]);

    // La recherche est désormais envoyée au backend (voir queryKey ci-dessus) :
    // `impayes` ne contient déjà que les lignes de la page courante correspondant
    // à la recherche active. `filtered` reste défini par souci de compatibilité
    // avec le reste du fichier (tri, export...).
    const filtered = impayes;

    const openAvis = async (factureId: number) => {
        setAvisLoading(true); setShowAvis(true);
        try {
            const res = await api.get(`/api/finance/avis-paiement/${factureId}`);
            setAvisData(res.data);
        } catch { showMsg('Erreur chargement avis', 'error'); setShowAvis(false); }
        setAvisLoading(false);
    };

    const sendNotifications = async () => {
        if (!confirm('Envoyer les rappels de paiement à tous les parents concernés ?')) return;
        setNotifying(true);
        try {
            const res = await api.post(`/api/finance/communication/notifier-impayes?etablissement_id=${etablissementId}&annee_id=${filterAnnee}`);
            showMsg(`${res.data.nb_notifies} notification(s) envoyée(s) aux parents`, 'success');
        } catch { showMsg('Erreur lors de l\'envoi', 'error'); }
        setNotifying(false);
    };

    const exportCSV = () => {
        const header = 'Élève,Matricule,Classe,Parent,Tél. Parent,Montant Dû,Payé,Reste,Jours Retard,Statut\n';
        const rows = filtered.map((i: any) =>
            `"${i.eleve_prenom} ${i.eleve_nom}",${i.eleve_matricule},"${i.classe_nom}","${i.parent_nom}",${i.parent_telephone},${i.montant_total},${i.montant_paye},${i.montant_restant},${i.jours_retard},${i.statut}`
        ).join('\n');
        const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `impayes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    // Sorting logic
    const handleSortImp = (key: SortKeyImp) => {
        if (sortKeyImp === key) {
            setSortDirImp(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKeyImp(key);
            setSortDirImp('desc');
        }
    };

    const sorted = [...filtered].sort((a, b) => {
        const dir = sortDirImp === 'asc' ? 1 : -1;
        switch (sortKeyImp) {
            case 'eleve': return dir * (`${a.eleve_prenom} ${a.eleve_nom}`).localeCompare(`${b.eleve_prenom} ${b.eleve_nom}`);
            case 'classe': return dir * a.classe_nom.localeCompare(b.classe_nom);
            case 'montant_restant': return dir * (a.montant_restant - b.montant_restant);
            case 'montant_total': return dir * (a.montant_total - b.montant_total);
            case 'jours_retard': return dir * (a.jours_retard - b.jours_retard);
            case 'statut': return dir * a.statut.localeCompare(b.statut);
            default: return 0;
        }
    });

    // Total réel sur tout le jeu de résultats filtré (pas seulement la page
    // affichée) — voir stats_factures côté backend, appelé avec les mêmes filtres.
    const totalRestant = stats?.total_restant ?? sorted.reduce((s, i) => s + i.montant_restant, 0);
    const nbElevesConcernes = stats?.nb_eleves_impayes ?? filtered.length;

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#3b82f6" />
            <p style={{ color: '#64748b' }}>Chargement des impayés...</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Toast */}
            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', background: message.type === 'success' ? '#10b981' : '#ef4444' }}>
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                    <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link>
                    <ChevronRight size={14} />
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Suivi des Impayés</span>
                </div>
                <AnneeFilter value={filterAnnee} onChange={setFilterAnnee} />
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {[
                    { label: 'Total Impayés', value: fmt(totalRestant), icon: AlertTriangle, color: '#ef4444' },
                    { label: 'Élèves Concernés', value: nbElevesConcernes, icon: Users, color: '#f59e0b' },
                    { label: 'Taux Recouvrement', value: `${stats?.taux_recouvrement || 0}%`, icon: TrendingUp, color: '#10b981' },
                    { label: 'Total Facturé', value: fmt(stats?.total_facture || 0), icon: Banknote, color: '#3b82f6' },
                ].map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>{kpi.label}</p>
                                <p style={{ fontSize: 22, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
                            </div>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <kpi.icon size={24} />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Filters */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher élève, matricule, classe..."
                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                </div>
                <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                    <option value="">Toutes les classes</option>
                    {classes.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle || c.code}</option>)}
                </select>
                <select value={filterTypeFrais} onChange={e => setFilterTypeFrais(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                    <option value="">Tous les types de frais</option>
                    {typesFrais.map((t: any) => <option key={t.type_frais_id} value={t.type_frais_id}>{t.libelle}</option>)}
                </select>
                <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' }}>
                    <option value="">Tous les statuts</option>
                    <option value="EN_ATTENTE">En attente</option>
                    <option value="PARTIELLEMENT_PAYEE">Partielle</option>
                    <option value="EN_RETARD">En retard</option>
                </select>
                <button onClick={() => fetchData()} style={{ padding: '10px 14px', borderRadius: 8, background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                    <RefreshCw size={14} /> Actualiser
                </button>
                <button onClick={sendNotifications} disabled={notifying}
                    style={{ padding: '10px 16px', borderRadius: 8, background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, opacity: notifying ? 0.6 : 1 }}>
                    {notifying ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                    Notifier les parents
                </button>
                <button onClick={exportCSV} style={{ padding: '10px 14px', borderRadius: 8, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                    <Download size={14} /> CSV
                </button>
            </motion.div>

            {/* Table */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <SortHeader label="Élève" sortKey="eleve" currentKey={sortKeyImp} currentDir={sortDirImp} onSort={handleSortImp} />
                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Matricule</th>
                            <SortHeader label="Classe" sortKey="classe" currentKey={sortKeyImp} currentDir={sortDirImp} onSort={handleSortImp} />
                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Type de Facture</th>
                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Parent</th>
                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Tél. Parent</th>
                            <SortHeader label="Montant Dû" sortKey="montant_total" currentKey={sortKeyImp} currentDir={sortDirImp} onSort={handleSortImp} />
                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Payé</th>
                            <SortHeader label="Reste" sortKey="montant_restant" currentKey={sortKeyImp} currentDir={sortDirImp} onSort={handleSortImp} />
                            <SortHeader label="Retard" sortKey="jours_retard" currentKey={sortKeyImp} currentDir={sortDirImp} onSort={handleSortImp} />
                            <SortHeader label="Statut" sortKey="statut" currentKey={sortKeyImp} currentDir={sortDirImp} onSort={handleSortImp} />
                            <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 ? (
                            <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                <AlertTriangle size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.5 }} />
                                Aucun impayé trouvé
                            </td></tr>
                        ) : sorted.map((imp, idx) => (
                            <tr key={imp.facture_id} style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: imp.jours_retard > 30 ? '#fef2f2' : imp.jours_retard > 7 ? '#fffbeb' : 'transparent',
                                transition: 'background 0.15s',
                            }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                onMouseLeave={e => (e.currentTarget.style.background = imp.jours_retard > 30 ? '#fef2f2' : imp.jours_retard > 7 ? '#fffbeb' : 'transparent')}>
                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{imp.eleve_prenom} {imp.eleve_nom}</td>
                                <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{imp.eleve_matricule}</td>
                                <td style={{ padding: '12px 14px' }}>{imp.classe_nom}</td>
                                <td style={{ padding: '12px 14px', color: '#3b82f6', fontWeight: 500 }}>{imp.type_frais_libelle || '—'}</td>
                                <td style={{ padding: '12px 14px' }}>{imp.parent_nom || '—'}</td>
                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{imp.parent_telephone || '—'}</td>
                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>{fmt(imp.montant_total)}</td>
                                <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 600 }}>{fmt(imp.montant_paye)}</td>
                                <td style={{ padding: '12px 14px', color: '#ef4444', fontWeight: 700 }}>{fmt(imp.montant_restant)}</td>
                                <td style={{ padding: '12px 14px' }}>{imp.jours_retard > 0 ? <RetardBadge jours={imp.jours_retard} /> : '—'}</td>
                                <td style={{ padding: '12px 14px' }}><Badge statut={imp.statut} /></td>
                                <td style={{ padding: '12px 14px', display: 'flex', gap: 6 }}>
                                    <Link href={`/comptabilite/encaissement?eleve_id=${imp.eleve_id}`} title="Encaisser un paiement"
                                        style={{ padding: '6px 10px', borderRadius: 6, background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', border: '1px solid #a7f3d0' }}>
                                        <Banknote size={13} /> Encaisser
                                    </Link>
                                    <button onClick={() => openAvis(imp.facture_id)} title="Voir avis de paiement"
                                        style={{ padding: '6px 10px', borderRadius: 6, background: '#eff6ff', color: '#3b82f6', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer' }}>
                                        <Eye size={13} /> Avis
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
                    <span>{sorted.length} impayé(s) affiché(s)</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>Total restant : {fmt(totalRestant)}</span>
                </div>
                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            </motion.div>

            {/* Modal Avis de Paiement */}
            <AnimatePresence>
                {showAvis && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                        onClick={() => setShowAvis(false)}>
                        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                            {avisLoading ? (
                                <div style={{ padding: 60, textAlign: 'center' }}><Loader2 size={32} className="animate-spin" color="#3b82f6" /></div>
                            ) : avisData ? (
                                <div id="avis-print">
                                    {/* Header non imprimable */}
                                    <div className="no-print" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Avis de Paiement</h3>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Printer size={14} /> Imprimer
                                            </button>
                                            <button onClick={() => setShowAvis(false)} style={{ padding: 8, borderRadius: 8, background: '#f1f5f9' }}><X size={16} /></button>
                                        </div>
                                    </div>
                                    {/* Contenu imprimable */}
                                    <div style={{ padding: 32 }}>
                                        {/* En-tête école */}
                                        <div style={{ textAlign: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #1e293b' }}>
                                            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{avisData.etablissement.nom}</h2>
                                            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{avisData.etablissement.adresse}</p>
                                            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 12, color: '#3b82f6' }}>AVIS DE PAIEMENT</h3>
                                        </div>
                                        {/* Infos élève + facture */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                                            <div>
                                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>ÉLÈVE</p>
                                                <p style={{ fontWeight: 700 }}>{avisData.eleve.prenom} {avisData.eleve.nom}</p>
                                                <p style={{ fontSize: 12, color: '#64748b' }}>Matricule : {avisData.eleve.matricule}</p>
                                                <p style={{ fontSize: 12, color: '#64748b' }}>Classe : {avisData.eleve.classe}</p>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>FACTURE</p>
                                                <p style={{ fontWeight: 700 }}>{avisData.facture.numero_facture}</p>
                                                <p style={{ fontSize: 12, color: '#64748b' }}>Date : {avisData.facture.date_facture}</p>
                                                <p style={{ fontSize: 12, color: '#64748b' }}>Type : {avisData.facture.type_frais}</p>
                                            </div>
                                        </div>
                                        {/* Tableau échéances */}
                                        <div className="table-scroll">
                                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13, minWidth: '480px' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc' }}>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Échéance</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Attendu</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Payé</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Statut</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {avisData.echeances.map((e: any) => (
                                                    <tr key={e.echeance_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '10px 12px' }}>{e.libelle} — {e.date_limite}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(e.montant_attendu)}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>{fmt(e.montant_paye)}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}><Badge statut={e.statut} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                        {/* Résumé */}
                                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' }}>
                                            <div><p style={{ fontSize: 11, color: '#94a3b8' }}>Total Facturé</p><p style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{fmt(avisData.facture.montant_net)}</p></div>
                                            <div><p style={{ fontSize: 11, color: '#94a3b8' }}>Total Payé</p><p style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{fmt(avisData.facture.montant_paye)}</p></div>
                                            <div><p style={{ fontSize: 11, color: '#94a3b8' }}>Reste à Payer</p><p style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{fmt(avisData.facture.montant_restant)}</p></div>
                                        </div>
                                        {avisData.parent?.nom && (
                                            <div style={{ marginTop: 16, padding: 12, background: '#eff6ff', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
                                                <strong>Parent / Tuteur :</strong> {avisData.parent.nom} — Tél : {avisData.parent.telephone}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Print styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #avis-print, #avis-print * { visibility: visible; }
                    #avis-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
