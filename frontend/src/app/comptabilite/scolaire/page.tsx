'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, RefreshCw, Download, Loader2, ChevronRight, Users, X,
    CheckCircle2, AlertTriangle, XCircle, TrendingUp, FileText, CreditCard,
    ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

type SolvEntry = {
    eleve_id: number; eleve_nom: string; eleve_prenom: string; eleve_matricule: string;
    classe_id: number; classe_nom: string;
    total_facture: number; total_paye: number; total_restant: number;
    taux_paiement: number; indicateur: string; nb_factures: number;
};
type SoldeData = {
    eleve_id: number; eleve_nom: string; eleve_prenom: string; eleve_matricule: string;
    total_facture: number; total_paye: number; total_restant: number; taux_paiement: number;
    factures: any[];
};

const IND_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'SOLVABLE': { bg: '#d1fae5', color: '#059669', label: 'Solvable' },
    'PARTIEL': { bg: '#dbeafe', color: '#2563eb', label: 'Partiel' },
    'NON_SOLVABLE': { bg: '#fef3c7', color: '#d97706', label: 'Non solvable' },
    'CRITIQUE': { bg: '#fee2e2', color: '#dc2626', label: 'Critique' },
    'AUCUNE_FACTURE': { bg: '#f1f5f9', color: '#64748b', label: 'Sans facture' },
};
const STATUT_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'EN_ATTENTE': { bg: '#fef3c7', color: '#d97706', label: 'En attente' },
    'PARTIELLEMENT_PAYEE': { bg: '#dbeafe', color: '#2563eb', label: 'Partielle' },
    'PAYEE': { bg: '#d1fae5', color: '#059669', label: 'Payée' },
    'EN_RETARD': { bg: '#fee2e2', color: '#dc2626', label: 'En retard' },
};

function Badge({ statut, map }: { statut: string; map: Record<string, { bg: string; color: string; label: string }> }) {
    const s = map[statut] || { bg: '#f1f5f9', color: '#475569', label: statut };
    return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, backgroundColor: s.bg, color: s.color }}>{s.label}</span>;
}

const fmt = (n: number) => n.toLocaleString('fr-GN');

/* ─── Sorting ─── */
type SortKeySolv = 'eleve' | 'classe' | 'total_facture' | 'total_restant' | 'taux_paiement' | 'indicateur';
type SortDir = 'asc' | 'desc';
function SortHeaderS({ label, sortKey, currentKey, currentDir, onSort }: {
    label: string; sortKey: SortKeySolv; currentKey: SortKeySolv; currentDir: SortDir; onSort: (k: SortKeySolv) => void;
}) {
    const active = currentKey === sortKey;
    return (
        <th onClick={() => onSort(sortKey)} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {label}
                {active ? (currentDir === 'asc' ? <ArrowUp size={13} color="#3b82f6" /> : <ArrowDown size={13} color="#3b82f6" />) : <ArrowUpDown size={13} style={{ opacity: 0.3 }} />}
            </div>
        </th>
    );
}

export default function ScolairePage() {
    const { etablissementId, anneeId } = useApp();
    const [tab, setTab] = useState<'solvabilite' | 'solde'>('solvabilite');
    const [data, setData] = useState<SolvEntry[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterClasse, setFilterClasse] = useState('');
    const [filterInd, setFilterInd] = useState('');
    const [sortK, setSortK] = useState<SortKeySolv>('total_restant');
    const [sortD, setSortD] = useState<SortDir>('desc');

    // Solde élève
    const [soldeData, setSoldeData] = useState<SoldeData | null>(null);
    const [soldeLoading, setSoldeLoading] = useState(false);

    const fetchSolvabilite = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ etablissement_id: String(etablissementId), annee_id: String(anneeId) });
            if (filterClasse) params.set('classe_id', filterClasse);
            const [solvRes, classRes] = await Promise.all([
                api.get(`/api/finance/solvabilite?${params}`),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
            ]);
            setData(solvRes.data);
            setClasses(classRes.data || []);
        } catch { }
        setLoading(false);
    }, [etablissementId, anneeId, filterClasse]);

    useEffect(() => { fetchSolvabilite(); }, [fetchSolvabilite]);

    const openSolde = async (eleveId: number) => {
        setTab('solde'); setSoldeLoading(true);
        try {
            const res = await api.get(`/api/finance/solde-eleve/${eleveId}?annee_id=${anneeId}`);
            setSoldeData(res.data);
        } catch { }
        setSoldeLoading(false);
    };

    const filtered = data.filter(d => {
        if (filterInd && d.indicateur !== filterInd) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return `${d.eleve_prenom} ${d.eleve_nom}`.toLowerCase().includes(q) || d.eleve_matricule.toLowerCase().includes(q) || d.classe_nom.toLowerCase().includes(q);
    });

    const handleSortS = (key: SortKeySolv) => {
        if (sortK === key) setSortD(p => p === 'asc' ? 'desc' : 'asc');
        else { setSortK(key); setSortD('desc'); }
    };
    const sorted = [...filtered].sort((a, b) => {
        const dir = sortD === 'asc' ? 1 : -1;
        switch (sortK) {
            case 'eleve': return dir * `${a.eleve_prenom} ${a.eleve_nom}`.localeCompare(`${b.eleve_prenom} ${b.eleve_nom}`);
            case 'classe': return dir * a.classe_nom.localeCompare(b.classe_nom);
            case 'total_facture': return dir * (a.total_facture - b.total_facture);
            case 'total_restant': return dir * (a.total_restant - b.total_restant);
            case 'taux_paiement': return dir * (a.taux_paiement - b.taux_paiement);
            case 'indicateur': return dir * a.indicateur.localeCompare(b.indicateur);
            default: return 0;
        }
    });

    const counts = { SOLVABLE: 0, PARTIEL: 0, NON_SOLVABLE: 0, CRITIQUE: 0 };
    data.forEach(d => { if (d.indicateur in counts) (counts as any)[d.indicateur]++; });

    const exportCSV = () => {
        const header = 'Élève,Matricule,Classe,Total Facturé,Total Payé,Reste,Taux %,Indicateur\n';
        const rows = filtered.map(d => `"${d.eleve_prenom} ${d.eleve_nom}",${d.eleve_matricule},"${d.classe_nom}",${d.total_facture},${d.total_paye},${d.total_restant},${d.taux_paiement},${d.indicateur}`).join('\n');
        const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = `solvabilite_${new Date().toISOString().split('T')[0]}.csv`; link.click();
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#3b82f6" /><p style={{ color: '#64748b' }}>Chargement...</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link><ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Spécificités Scolaires</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                {[{ id: 'solvabilite' as const, label: 'Solvabilité' }, { id: 'solde' as const, label: 'Solde Élève' }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#1e293b' : '#64748b', boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'solvabilite' && (
                <>
                    {/* Summary KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        {[
                            { label: 'Solvable', count: counts.SOLVABLE, color: '#059669', bg: '#d1fae5', icon: CheckCircle2 },
                            { label: 'Partiel', count: counts.PARTIEL, color: '#2563eb', bg: '#dbeafe', icon: TrendingUp },
                            { label: 'Non Solvable', count: counts.NON_SOLVABLE, color: '#d97706', bg: '#fef3c7', icon: AlertTriangle },
                            { label: 'Critique', count: counts.CRITIQUE, color: '#dc2626', bg: '#fee2e2', icon: XCircle },
                        ].map((k, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                                style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                                onClick={() => setFilterInd(filterInd === ['SOLVABLE', 'PARTIEL', 'NON_SOLVABLE', 'CRITIQUE'][i] ? '' : ['SOLVABLE', 'PARTIEL', 'NON_SOLVABLE', 'CRITIQUE'][i])}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{k.label}</p>
                                        <p style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.count}</p>
                                    </div>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <k.icon size={20} />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Filters */}
                    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: '1 1 220px' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
                                style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                        </div>
                        <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)}
                            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                            <option value="">Toutes les classes</option>
                            {classes.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle || c.code}</option>)}
                        </select>
                        <select value={filterInd} onChange={e => setFilterInd(e.target.value)}
                            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                            <option value="">Tous indicateurs</option>
                            {Object.entries(IND_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button onClick={exportCSV} style={{ padding: '9px 14px', borderRadius: 8, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                            <Download size={14} /> CSV
                        </button>
                    </div>

                    {/* Table */}
                    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <SortHeaderS label="Élève" sortKey="eleve" currentKey={sortK} currentDir={sortD} onSort={handleSortS} />
                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Matricule</th>
                                    <SortHeaderS label="Classe" sortKey="classe" currentKey={sortK} currentDir={sortD} onSort={handleSortS} />
                                    <SortHeaderS label="Total Facturé" sortKey="total_facture" currentKey={sortK} currentDir={sortD} onSort={handleSortS} />
                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>Total Payé</th>
                                    <SortHeaderS label="Reste" sortKey="total_restant" currentKey={sortK} currentDir={sortD} onSort={handleSortS} />
                                    <SortHeaderS label="Taux" sortKey="taux_paiement" currentKey={sortK} currentDir={sortD} onSort={handleSortS} />
                                    <SortHeaderS label="Indicateur" sortKey="indicateur" currentKey={sortK} currentDir={sortD} onSort={handleSortS} />
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.length === 0 ? (
                                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun résultat</td></tr>
                                ) : sorted.map(d => (
                                    <tr key={d.eleve_id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                        onClick={() => openSolde(d.eleve_id)}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{d.eleve_prenom} {d.eleve_nom}</td>
                                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{d.eleve_matricule}</td>
                                        <td style={{ padding: '12px 14px' }}>{d.classe_nom}</td>
                                        <td style={{ padding: '12px 14px' }}>{fmt(d.total_facture)}</td>
                                        <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 600 }}>{fmt(d.total_paye)}</td>
                                        <td style={{ padding: '12px 14px', color: '#ef4444', fontWeight: 700 }}>{fmt(d.total_restant)}</td>
                                        <td style={{ padding: '12px 14px', fontWeight: 700 }}>{d.taux_paiement}%</td>
                                        <td style={{ padding: '12px 14px' }}><Badge statut={d.indicateur} map={IND_COLORS} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>{sorted.length} élève(s)</div>
                    </div>
                </>
            )}

            {tab === 'solde' && (
                <>
                    {soldeLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={32} className="animate-spin" color="#3b82f6" /></div>
                    ) : soldeData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Student header */}
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                                    <div>
                                        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{soldeData.eleve_prenom} {soldeData.eleve_nom}</h3>
                                        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Matricule : {soldeData.eleve_matricule}</p>
                                    </div>
                                    <button onClick={() => { setTab('solvabilite'); setSoldeData(null); }}
                                        style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#475569' }}>
                                        ← Retour au tableau
                                    </button>
                                </div>
                            </motion.div>

                            {/* Solde summary */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                                {[
                                    { label: 'Total Facturé', value: fmt(soldeData.total_facture) + ' GNF', color: '#3b82f6' },
                                    { label: 'Total Payé', value: fmt(soldeData.total_paye) + ' GNF', color: '#10b981' },
                                    { label: 'Reste à Payer', value: fmt(soldeData.total_restant) + ' GNF', color: '#ef4444' },
                                    { label: 'Taux de Paiement', value: `${soldeData.taux_paiement}%`, color: '#6366f1' },
                                ].map((k, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                                        style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                                        <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{k.label}</p>
                                        <p style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 2 }}>{k.value}</p>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Factures */}
                            {soldeData.factures.map((f: any) => (
                                <motion.div key={f.facture_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, marginRight: 8 }}>{f.numero_facture}</span>
                                            <Badge statut={f.statut} map={STATUT_COLORS} />
                                        </div>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>{f.date_facture}</span>
                                    </div>
                                    <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13 }}>
                                        <div><p style={{ color: '#94a3b8', fontSize: 11 }}>Facturé</p><p style={{ fontWeight: 700 }}>{fmt(f.montant_total)} GNF</p></div>
                                        <div><p style={{ color: '#94a3b8', fontSize: 11 }}>Payé</p><p style={{ fontWeight: 700, color: '#10b981' }}>{fmt(f.montant_paye)} GNF</p></div>
                                        <div><p style={{ color: '#94a3b8', fontSize: 11 }}>Reste</p><p style={{ fontWeight: 700, color: '#ef4444' }}>{fmt(f.montant_restant)} GNF</p></div>
                                    </div>
                                    {f.paiements.length > 0 && (
                                        <div style={{ padding: '0 20px 16px' }}>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>HISTORIQUE DES PAIEMENTS</p>
                                            {f.paiements.map((p: any) => (
                                                <div key={p.paiement_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 8, marginBottom: 4, fontSize: 12 }}>
                                                    <span><CreditCard size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />{p.numero_recu} — {p.date_paiement}</span>
                                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{fmt(p.montant)} GNF ({p.mode_paiement})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ background: '#fff', borderRadius: 12, padding: 60, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                            <Users size={48} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                            <p style={{ color: '#94a3b8', fontSize: 14 }}>Cliquez sur un élève dans l'onglet Solvabilité pour voir son solde détaillé</p>
                        </div>
                    )}
                </>
            )}

            <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
