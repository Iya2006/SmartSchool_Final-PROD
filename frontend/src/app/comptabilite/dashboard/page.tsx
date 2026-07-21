'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { motion } from 'framer-motion';
import {
    DollarSign, CheckCircle2, AlertTriangle, TrendingUp, Loader2,
    ChevronRight, Calendar, CreditCard, Banknote, Smartphone, Wallet, ArrowDownRight
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import api from '@/lib/api';
import Link from 'next/link';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];
const fmt = (n: number) => n.toLocaleString('fr-GN');

const MODE_LABELS: Record<string, string> = {
    'ESPECES': 'Espèces', 'CHEQUE': 'Chèque', 'MOBILE_MONEY': 'Mobile Money',
    'VIREMENT': 'Virement', 'ORANGE_MONEY': 'Orange Money', 'MTN_MONEY': 'MTN Money',
};

export default function DashboardFinancierPage() {
    const { etablissementId, anneeId } = useApp();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/api/finance/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`)
            .then(res => { setData(res.data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [etablissementId, anneeId]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#3b82f6" />
            <p style={{ color: '#64748b' }}>Chargement du tableau de bord financier...</p>
        </div>
    );

    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Erreur de chargement</div>;

    const kpis = data.kpis;
    const tauxPct = Math.min(kpis.taux_recouvrement, 100);

    const mainKpis = [
        { label: 'Total Facturé', value: fmt(kpis.total_facture) + ' GNF', icon: DollarSign, color: '#3b82f6' },
        { label: 'Total Encaissé', value: fmt(kpis.total_paye) + ' GNF', icon: CheckCircle2, color: '#10b981' },
        { label: 'Reste à Percevoir', value: fmt(kpis.total_restant) + ' GNF', icon: AlertTriangle, color: '#f59e0b' },
        { label: 'Taux de Recouvrement', value: `${kpis.taux_recouvrement}%`, icon: TrendingUp, color: '#6366f1', hasBadge: true },
        { label: 'Solde en Caisse (Net)', value: fmt(kpis.solde_caisse) + ' GNF', icon: Wallet, color: '#059669', isHighlight: true },
        { label: 'Total Décaissements', value: fmt(kpis.total_depenses) + ' GNF', icon: ArrowDownRight, color: '#ef4444' },
    ];

    const revenueKpis = [
        { label: 'Revenus du Jour', value: fmt(kpis.revenus_jour), color: '#10b981' },
        { label: 'Revenus Semaine', value: fmt(kpis.revenus_semaine), color: '#3b82f6' },
        { label: 'Revenus du Mois', value: fmt(kpis.revenus_mois), color: '#6366f1' },
        { label: 'Revenus Année', value: fmt(kpis.revenus_annee), color: '#f59e0b' },
    ];

    const pieData = (data.repartition_modes || []).map((m: any) => ({
        name: MODE_LABELS[m.mode] || m.mode, value: m.total
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Tableau de Bord Financier</span>
            </div>

            {/* Main KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 30 }}>
                {mainKpis.map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                        style={{
                            background: kpi.isHighlight ? '#ecfdf5' : 'white', 
                            padding: '20px 24px', 
                            borderRadius: 16, 
                            border: kpi.isHighlight ? '2px solid #10b981' : '1px solid #e2e8f0', 
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                            display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden'
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>{kpi.label}</span>
                            <div style={{ padding: 10, background: `${kpi.color}15`, borderRadius: 12 }}>
                                <kpi.icon size={20} color={kpi.color} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 24, fontWeight: 800, color: kpi.isHighlight ? '#047857' : kpi.color, letterSpacing: '-0.5px' }}>
                                {kpi.value.split(' ')[0]}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>GNF</span>
                            {kpi.hasBadge && (
                                <span style={{ marginLeft: 'auto', background: '#e0e7ff', color: '#4f46e5', padding: '4px 8px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                                    <TrendingUp size={14} style={{ display: 'inline', marginRight: 4 }} />
                                    {kpi.value}
                                </span>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Revenue KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {revenueKpis.map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
                        style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                        <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{kpi.label}</p>
                        <p style={{ fontSize: 20, fontWeight: 800, color: kpi.color, marginTop: 2 }}>{kpi.value} <span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8' }}>GNF</span></p>
                    </motion.div>
                ))}
            </div>

            {/* Charts Row 1: Evolution + Pie */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
                <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                    style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <h5 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} color="#3b82f6"/> Évolution Mensuelle</h5>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={data.evolution_mensuelle}>
                            <defs>
                                <linearGradient id="colorEnc" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorFac" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000000).toFixed(0)}M`} />
                            <Tooltip formatter={(v: any) => fmt(Number(v)) + ' GNF'} />
                            <Legend />
                            <Area type="monotone" dataKey="encaisse" name="Encaissé" stroke="#10b981" fill="url(#colorEnc)" strokeWidth={2} />
                            <Area type="monotone" dataKey="facture" name="Facturé" stroke="#3b82f6" fill="url(#colorFac)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>

                <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
                    style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <h5 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={18} color="#f59e0b"/> Répartition par Mode</h5>
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v: any) => fmt(Number(v)) + ' GNF'} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Aucune donnée</div>
                    )}
                </motion.div>
            </div>

            {/* Chart Row 2: Bar chart par classe */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                <h5 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={18} color="#10b981"/> Répartition par Classe</h5>
                {data.repartition_classes.length > 0 ? (
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={data.repartition_classes} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="classe" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000000).toFixed(0)}M`} />
                            <Tooltip formatter={(v: any) => fmt(Number(v)) + ' GNF'} />
                            <Legend />
                            <Bar dataKey="encaisse" name="Encaissé" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="restant" name="Restant" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Aucune donnée par classe</div>
                )}
            </motion.div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Nombre d'Élèves</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{kpis.nb_eleves}</p>
                </div>
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Factures Payées</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{kpis.nb_payees}</p>
                </div>
                <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Factures Impayées</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{kpis.nb_impayes}</p>
                </div>
            </div>

            <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
