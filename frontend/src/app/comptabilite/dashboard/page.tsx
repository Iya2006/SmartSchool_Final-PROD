'use client';

import React from 'react';
import { useQuery, useIsRestoring } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { motion } from 'framer-motion';
import {
    TrendingUp, TrendingDown, Coins, ArrowUpRight, ArrowDownRight,
    Loader2, ChevronRight, Calendar, CreditCard, Banknote, HelpCircle,
    Layers, RefreshCw
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import api from '@/lib/api';
import Link from 'next/link';
import { modePaiementLabel } from '@/lib/modesPaiement';
import { useIsMobile } from '@/hooks/useIsMobile';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#64748b'];
const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('fr-GN') + ' GNF';

export default function DashboardFinancierPage() {
    const { etablissementId, anneeId } = useApp();
    const isMobile = useIsMobile();
    const [period, setPeriod] = React.useState<'ANNEE' | 'TRIMESTRE' | 'MOIS' | 'PERSONNALISE'>('ANNEE');
    const [dateDebut, setDateDebut] = React.useState('');
    const [dateFin, setDateFin] = React.useState('');

    // React Query : les données sont mises en cache (localStorage) et servies
    // immédiatement même hors-ligne (networkMode: 'offlineFirst'), avec un
    // rafraîchissement en arrière-plan dès que la connexion le permet. Le
    // backend met lui-même en cache cette réponse côté Redis (TTL 60s).
    const { data, isLoading: queryLoading } = useQuery({
        queryKey: ['finance-dashboard', etablissementId, anneeId, dateDebut, dateFin],
        queryFn: async () => {
            let url = `/api/finance/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`;
            if (dateDebut) url += `&date_debut=${dateDebut}`;
            if (dateFin) url += `&date_fin=${dateFin}`;
            const res = await api.get(url);
            return res.data;
        },
        // Le cache Redis backend a lui-même un TTL de 60s : on repolle au même
        // rythme pour qu'un onglet resté ouvert ne reste jamais figé indéfiniment.
        refetchInterval: 60_000,
    });
    // Cache React Query persiste en localStorage (offline-first) : au tout
    // premier rendu client, avant restauration du cache, isLoading tombe a
    // false sans donnees — mismatch d'hydratation avec le serveur. Meme
    // correctif que classes/page.tsx et useEleves.ts.
    const isRestoring = useIsRestoring();
    const isLoading = queryLoading || isRestoring;

    if (isLoading && !data) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
            <Loader2 size={40} className="animate-spin" color="#10b981" />
            <p style={{ color: '#64748b' }}>Chargement du tableau de bord financier...</p>
        </div>
    );

    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Erreur de chargement</div>;

    const kpis = data.kpis;
    const depAttente = kpis.total_depenses_attente ?? 0;
    const depValide = kpis.total_depenses_valide ?? kpis.total_depenses ?? 0;

    // Les trois périodes sont désormais calculées côté backend à partir de
    // vraies requêtes datées (voir GET /api/finance/dashboard), plus de
    // multiplicateurs arbitraires côté client.
    const displayRevenu = period === 'PERSONNALISE' ? kpis.revenus_personnalise : period === 'MOIS' ? kpis.revenus_mois : period === 'TRIMESTRE' ? kpis.revenus_trimestre : kpis.total_paye;
    const displayDepense = period === 'PERSONNALISE' ? kpis.depenses_personnalise : period === 'MOIS' ? kpis.depenses_mois : period === 'TRIMESTRE' ? kpis.depenses_trimestre : kpis.total_depenses;
    const displaySolde = displayRevenu - (period === 'ANNEE' ? depValide : displayDepense);

    const mainKpis = [
        { 
            label: 'Total Encaissé', 
            value: fmt(displayRevenu), 
            sub: 'Frais de scolarité reçus',
            icon: ArrowUpRight, 
            color: '#10b981', 
            bg: '#e6fcf5',
            badge: null,
        },
        { 
            label: 'Total Dépensé', 
            value: fmt(displayDepense), 
            sub: depAttente > 0 ? `dont ${fmt(depAttente)} en attente de validation` : 'Salaires et charges',
            icon: ArrowDownRight, 
            color: '#ef4444', 
            bg: '#fdf2f2',
            badge: depAttente > 0 ? `⏳ ${fmt(depAttente)} non validé` : null,
        },
        { 
            label: 'Solde Disponible', 
            value: fmt(displaySolde), 
            sub: 'Après déduction des dépenses validées',
            icon: Coins, 
            color: '#3b82f6', 
            bg: '#eff6ff',
            badge: null,
        },
    ];

    const pieData = (data.repartition_modes || []).map((m: any) => ({
        name: modePaiementLabel(m.mode), value: m.total
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#10b981' }}>Comptabilité</Link>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Tableau de Bord</span>
            </div>

            {/* Title & Period Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Tableau de Bord Financier</h1>
                    <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>Vue d'ensemble en temps réel des encaissements, dépenses et soldes de caisse</p>
                </div>
                <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    {[
                        { value: 'ANNEE', label: 'Année Scolaire' },
                        { value: 'TRIMESTRE', label: 'Trimestre' },
                        { value: 'MOIS', label: 'Ce mois' },
                        { value: 'PERSONNALISE', label: 'Personnalisé' }
                    ].map(t => (
                        <button key={t.value} onClick={() => setPeriod(t.value as any)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: 'none',
                                fontSize: 12,
                                fontWeight: period === t.value ? 700 : 500,
                                background: period === t.value ? '#fff' : 'transparent',
                                color: period === t.value ? '#1e293b' : '#64748b',
                                cursor: 'pointer',
                                boxShadow: period === t.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>
                {period === 'PERSONNALISE' && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#f1f5f9', padding: 4, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} title="Date début" />
                        <span style={{ color: '#94a3b8' }}>-</span>
                        <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, outline: 'none' }} title="Date fin" />
                    </div>
                )}
            </div>

            {/* 3 Main KPIs from PDF spec (Encaissé / Dépensé / Solde) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {mainKpis.map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.02), 0 4px 6px -2px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{kpi.label}</p>
                                <p style={{ fontSize: 24, fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
                                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{kpi.sub}</p>
                                {kpi.badge && (
                                    <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>
                                        {kpi.badge}
                                    </span>
                                )}
                            </div>
                            <div style={{ width: 56, height: 56, borderRadius: 14, background: kpi.bg, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <kpi.icon size={28} />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>


            {/* Charts Row 1: Entrées vs Sorties monthly evolution */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 20, alignItems: 'stretch' }}>
                
                {/* Entrées vs Sorties Area Chart */}
                <motion.div initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
                    style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <h5 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={18} color="#10b981"/> 
                        Évolution Financière (Entrées vs Sorties)
                    </h5>
                    <div style={{ flex: 1 }}>
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={data.evolution_mensuelle}>
                                <defs>
                                    <linearGradient id="colorEnc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorDep" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000000).toFixed(0)}M`} />
                                <Tooltip formatter={(v: any) => fmt(Number(v || 0))} />
                                <Legend />
                                <Area type="monotone" dataKey="encaisse" name="Entrées (Paiements)" stroke="#10b981" fill="url(#colorEnc)" strokeWidth={2} />
                                <Area type="monotone" dataKey="depense" name="Sorties (Dépenses)" stroke="#ef4444" fill="url(#colorDep)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Pie Chart methods */}
                <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
                    style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <h5 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CreditCard size={18} color="#f59e0b"/> 
                        Modes d'encaissement
                    </h5>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={260}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value" label={({ name, percent }: any) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}>
                                        {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => fmt(Number(v || 0))} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Aucun encaissement enregistré</div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Secondary charts: Bar chart par classe */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                <h5 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Banknote size={18} color="#3b82f6"/> 
                    Encaissements restants par classe (Recouvrement)
                </h5>
                {data.repartition_classes.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={data.repartition_classes} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="classe" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${(v / 1000000).toFixed(0)}M`} />
                            <Tooltip formatter={(v: any) => fmt(Number(v || 0))} />
                            <Legend />
                            <Bar dataKey="encaisse" name="Déjà payé" fill="#10b981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="restant" name="Reste à payer" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Aucune facture générée</div>
                )}
            </motion.div>

            {/* Quick stats and action shortcuts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Taux de Recouvrement</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{kpis.taux_recouvrement || 0}%</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>des factures</span>
                    </div>
                </div>
                <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Factures non réglées</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{kpis.nb_impayes || 0}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>factures ({kpis.nb_eleves_impayes || 0} élève(s))</span>
                    </div>
                </div>
                <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Nombre d'Élèves actifs</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{kpis.nb_eleves || 0}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>inscrits</span>
                    </div>
                </div>
            </div>

            <style>{`.animate-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
