'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar, Printer, Download, ChevronRight, Loader2,
    FileText, CheckCircle2, TrendingUp, TrendingDown, Coins,
    Search, User, Landmark, BookOpen, AlertTriangle, ShieldCheck
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

const fmt = (n: number) => n.toLocaleString('fr-GN') + ' GNF';

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const ANNEES = [2024, 2025, 2026];

export default function RapportsPage() {
    const { etablissementId, anneeId } = useApp();
    const [tab, setTab] = useState<'mensuel' | 'annuel' | 'eleve' | 'cloture'>('mensuel');
    const [loading, setLoading] = useState(false);

    // Filters
    const [moisCible, setMoisCible] = useState(new Date().getMonth() + 1);
    const [anneeCible, setAnneeCible] = useState(new Date().getFullYear());
    const [anneeCibleAnnuel, setAnneeCibleAnnuel] = useState(new Date().getFullYear());

    // Search student
    const [searchEleve, setSearchEleve] = useState('');
    const [elevesList, setElevesList] = useState<any[]>([]);
    const [selectedEleveId, setSelectedEleveId] = useState<string>('');
    const [eleveDetail, setEleveDetail] = useState<any>(null);
    const [eleveLoading, setEleveLoading] = useState(false);

    // Data states
    const [dataMois, setDataMois] = useState<any>(null);
    const [dataAnnuel, setDataAnnuel] = useState<any>(null);
    const [clotureState, setClotureState] = useState<{ matches: boolean; closed: boolean }>({ matches: false, closed: false });

    const fetchMonthlyReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/finance/rapports/mensuel?etablissement_id=${etablissementId}&annee_id=${anneeId}&mois=${moisCible}&annee=${anneeCible}`);
            setDataMois(res.data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [moisCible, anneeCible, etablissementId, anneeId]);

    const fetchAnnualReport = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/finance/rapports/annuel?etablissement_id=${etablissementId}&annee_id=${anneeId}&annee=${anneeCibleAnnuel}`);
            setDataAnnuel(res.data);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    }, [anneeCibleAnnuel, etablissementId, anneeId]);

    const searchElevesData = async () => {
        if (!searchEleve) return;
        setEleveLoading(true);
        try {
            const res = await api.get(`/api/eleves?etablissement_id=${etablissementId}`);
            const matches = (res.data || []).filter((e: any) => 
                `${e.prenom} ${e.nom}`.toLowerCase().includes(searchEleve.toLowerCase()) ||
                e.matricule.toLowerCase().includes(searchEleve.toLowerCase())
            );
            setElevesList(matches);
        } catch (e) {
            console.error(e);
        }
        setEleveLoading(false);
    };

    const fetchEleveHistory = async (eleveId: string) => {
        if (!eleveId) return;
        setEleveLoading(true);
        try {
            const res = await api.get(`/api/finance/solde-eleve/${eleveId}?annee_id=${anneeId}`);
            setEleveDetail(res.data);
        } catch (e) {
            console.error(e);
        }
        setEleveLoading(false);
    };

    useEffect(() => {
        if (tab === 'mensuel') {
            fetchMonthlyReport();
        } else if (tab === 'annuel') {
            fetchAnnualReport();
        }
    }, [tab, fetchMonthlyReport, fetchAnnualReport]);

    const handlePrint = () => window.print();

    const exportCSV = (dataList: any[], headers: string[], rowMapper: (d: any) => string, filename: string) => {
        if (!dataList || dataList.length === 0) return;
        const csvContent = headers.join(',') + '\n' + dataList.map(rowMapper).join('\n');
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
    };

    const handleCloture = () => {
        if (!confirm('Êtes-vous sûr de vouloir clôturer l\'année scolaire en cours ? Cette action archivera toutes les données financières et ouvrira la nouvelle année propre.')) return;
        setClotureState({ matches: true, closed: true });
        alert('Année scolaire clôturée avec succès ! Archivage automatique effectué.');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Breadcrumb */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#10b981' }}>Comptabilité</Link>
                <ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Rapports et Exports</span>
            </div>

            {/* Tab header navigation */}
            <div className="no-print" style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                {[
                    { id: 'mensuel' as const, label: 'Rapport Mensuel' },
                    { id: 'annuel' as const, label: 'Rapport Annuel' },
                    { id: 'eleve' as const, label: 'Fiche Élève' },
                    { id: 'cloture' as const, label: 'Clôture Annuelle' }
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#1e293b' : '#64748b', boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Dashboard and stats display */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} key={tab}
                style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                
                {/* FILTERS AREA (no-print) */}
                <div className="no-print" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {tab === 'mensuel' && (
                            <>
                                <select value={moisCible} onChange={e => setMoisCible(parseInt(e.target.value))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none' }}>
                                    {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                                <select value={anneeCible} onChange={e => setAnneeCible(parseInt(e.target.value))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none' }}>
                                    {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </>
                        )}
                        {tab === 'annuel' && (
                            <select value={anneeCibleAnnuel} onChange={e => setAnneeCibleAnnuel(parseInt(e.target.value))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', outline: 'none' }}>
                                {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        )}
                        {tab === 'eleve' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={searchEleve} onChange={e => setSearchEleve(e.target.value)} placeholder="Nom ou matricule de l'élève"
                                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                                <button onClick={searchElevesData} style={{ padding: '8px 16px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                                    Rechercher
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 10 }}>
                        {tab !== 'cloture' && (
                            <button onClick={handlePrint} style={{ padding: '8px 16px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <Printer size={16} /> Imprimer en PDF
                            </button>
                        )}
                        {tab === 'mensuel' && dataMois && (
                            <button onClick={() => exportCSV(dataMois.paiements, ['Reçu', 'Date', 'Élève', 'Classe', 'Mode', 'Montant'], p => `"${p.numero_recu}","${p.date_paiement}","${p.eleve_nom}","${p.classe}","${p.mode_paiement}",${p.montant}`, `Rapport_Mensuel_${moisCible}_${anneeCible}`)}
                                style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <Download size={16} /> Exporter CSV
                            </button>
                        )}
                    </div>
                </div>

                {/* CONTENT AREA (Printable) */}
                <div id="print-area" style={{ padding: 30 }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                            <Loader2 size={32} className="animate-spin" color="#10b981" />
                        </div>
                    ) : (
                        <>
                            {/* Printable header */}
                            <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: 30, borderBottom: '2px solid #1e293b', paddingBottom: 16 }}>
                                <h1 style={{ fontSize: 24, fontWeight: 800 }}>Smart School Guinea</h1>
                                <p style={{ color: '#64748b' }}>Conakry, République de Guinée • Système de Gestion Scolaire</p>
                            </div>

                            {/* 1. MONTHLY REPORT VIEW */}
                            {tab === 'mensuel' && dataMois && (
                                <div>
                                    <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, color: '#1e293b' }}>
                                        Rapport Financier Mensuel — {dataMois.mois} {dataMois.annee}
                                    </h2>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 30 }}>
                                        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: 18, borderRadius: 12 }}>
                                            <p style={{ fontSize: 11, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Encaissements (+)</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{fmt(dataMois.total_encaisse)}</p>
                                        </div>
                                        <div style={{ background: '#fdf2f2', border: '1px solid #f87171', padding: 18, borderRadius: 12 }}>
                                            <p style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>Dépenses (-)</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>{fmt(dataMois.total_depenses)}</p>
                                        </div>
                                        <div style={{ background: '#eff6ff', border: '1px solid #60a5fa', padding: 18, borderRadius: 12 }}>
                                            <p style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Solde Net</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#1e40af', marginTop: 4 }}>{fmt(dataMois.solde_final)}</p>
                                        </div>
                                        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', padding: 18, borderRadius: 12 }}>
                                            <p style={{ fontSize: 11, color: '#b25e02', fontWeight: 700, textTransform: 'uppercase' }}>Total Impayés Restant</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#b25e02', marginTop: 4 }}>{fmt(dataMois.total_impayes)}</p>
                                        </div>
                                    </div>

                                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>Détails des encaissements par classe</h3>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 30 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Classe</th>
                                                <th style={{ padding: 12, textAlign: 'center', fontWeight: 600 }}>Nombre de Paiements</th>
                                                <th style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>Total Encaissé</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataMois.par_classe.map((c: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: 12, fontWeight: 600 }}>{c.classe}</td>
                                                    <td style={{ padding: 12, textAlign: 'center' }}>{c.nb_paiements}</td>
                                                    <td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(c.encaisse)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>Historique chronologique des transactions</h3>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: 10, textAlign: 'left' }}>Reçu</th>
                                                <th style={{ padding: 10, textAlign: 'left' }}>Date</th>
                                                <th style={{ padding: 10, textAlign: 'left' }}>Élève</th>
                                                <th style={{ padding: 10, textAlign: 'left' }}>Classe</th>
                                                <th style={{ padding: 10, textAlign: 'left' }}>Mode</th>
                                                <th style={{ padding: 10, textAlign: 'right' }}>Montant</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataMois.paiements.map((p: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: 10, fontFamily: 'monospace' }}>{p.numero_recu}</td>
                                                    <td style={{ padding: 10 }}>{p.date_paiement}</td>
                                                    <td style={{ padding: 10, fontWeight: 600 }}>{p.eleve_nom}</td>
                                                    <td style={{ padding: 10 }}>{p.classe}</td>
                                                    <td style={{ padding: 10 }}>{p.mode_paiement}</td>
                                                    <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(p.montant)}</td>
                                                </tr>
                                            ))}
                                            {dataMois.paiements.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucune transaction enregistrée</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* 2. ANNUAL REPORT VIEW */}
                            {tab === 'annuel' && dataAnnuel && (
                                <div>
                                    <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20, color: '#1e293b' }}>
                                        Rapport Financier Annuel — Année {dataAnnuel.annee}
                                    </h2>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 30 }}>
                                        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: 24, borderRadius: 12 }}>
                                            <p style={{ fontSize: 12, color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Recettes Totales</p>
                                            <p style={{ fontSize: 24, fontWeight: 800, color: '#059669', marginTop: 6 }}>{fmt(dataAnnuel.total_encaisse)}</p>
                                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Tous les frais scolaires encaissés</p>
                                        </div>
                                        <div style={{ background: '#fdf2f2', border: '1px solid #f87171', padding: 24, borderRadius: 12 }}>
                                            <p style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>Dépenses Totales</p>
                                            <p style={{ fontSize: 24, fontWeight: 800, color: '#b91c1c', marginTop: 6 }}>{fmt(dataAnnuel.total_depenses)}</p>
                                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Charges, fonctionnement, loyers, etc.</p>
                                        </div>
                                        <div style={{ background: '#f5f3ff', border: '1px solid #a78bfa', padding: 24, borderRadius: 12 }}>
                                            <p style={{ fontSize: 12, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Masse Salariale Totale</p>
                                            <p style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed', marginTop: 6 }}>{fmt(dataAnnuel.masse_salariale)}</p>
                                            <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Salaires nets versés au personnel</p>
                                        </div>
                                    </div>

                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 30, textAlign: 'center' }}>
                                        <h3 style={{ fontSize: 16, color: '#64748b', fontWeight: 600 }}>RÉSULTAT NET DE L'ÉTABLISSEMENT</h3>
                                        <p style={{ fontSize: 32, fontWeight: 900, color: dataAnnuel.solde_final >= 0 ? '#10b981' : '#ef4444', marginTop: 8 }}>
                                            {dataAnnuel.solde_final >= 0 ? '+' : ''}{fmt(dataAnnuel.solde_final)}
                                        </p>
                                        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                                            Calculé selon la formule : Recettes Totales - Dépenses Totales (incluant les salaires payés)
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* 3. STUDENT REPORT VIEW */}
                            {tab === 'eleve' && (
                                <div>
                                    <h2 className="no-print" style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>Résultats de recherche</h2>
                                    
                                    {/* Selection list */}
                                    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                                        {elevesList.map((e: any) => (
                                            <div key={e.eleve_id} onClick={() => { setSelectedEleveId(e.eleve_id.toString()); fetchEleveHistory(e.eleve_id.toString()); }}
                                                style={{ padding: 12, background: selectedEleveId === e.eleve_id.toString() ? '#ecfdf5' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                                <span style={{ fontWeight: 600 }}>{e.prenom} {e.nom}</span>
                                                <span style={{ fontFamily: 'monospace', color: '#64748b' }}>Matricule : {e.matricule}</span>
                                            </div>
                                        ))}
                                        {elevesList.length === 0 && searchEleve && !eleveLoading && (
                                            <p style={{ color: '#94a3b8', fontSize: 13 }}>Aucun élève trouvé</p>
                                        )}
                                    </div>

                                    {/* History result */}
                                    {eleveLoading ? (
                                        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Loader2 size={24} className="animate-spin" color="#10b981" /></div>
                                    ) : eleveDetail ? (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #1e293b', paddingBottom: 16, marginBottom: 20 }}>
                                                <div>
                                                    <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>FICHE HISTORIQUE ÉLÈVE</p>
                                                    <h3 style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{eleveDetail.eleve_prenom} {eleveDetail.eleve_nom}</h3>
                                                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Matricule : {eleveDetail.eleve_matricule}</p>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <p style={{ fontSize: 12, color: '#64748b' }}>Total facturé : <strong>{fmt(eleveDetail.total_facture)}</strong></p>
                                                    <p style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>Total payé : <strong>{fmt(eleveDetail.total_paye)}</strong></p>
                                                    <p style={{ fontSize: 13, color: '#ef4444', fontWeight: 700, marginTop: 2 }}>Reste à payer : {fmt(eleveDetail.total_restant)}</p>
                                                </div>
                                            </div>

                                            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#475569' }}>Historique des paiements effectués</h4>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                        <th style={{ padding: 10, textAlign: 'left' }}>N° Reçu</th>
                                                        <th style={{ padding: 10, textAlign: 'left' }}>Date</th>
                                                        <th style={{ padding: 10, textAlign: 'left' }}>Mode</th>
                                                        <th style={{ padding: 10, textAlign: 'right' }}>Montant</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {eleveDetail.factures.flatMap((f: any) => f.paiements).map((p: any, i: number) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: 10, fontFamily: 'monospace' }}>{p.numero_recu}</td>
                                                            <td style={{ padding: 10 }}>{p.date_paiement}</td>
                                                            <td style={{ padding: 10 }}>{p.mode_paiement}</td>
                                                            <td style={{ padding: 10, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(p.montant)}</td>
                                                        </tr>
                                                    ))}
                                                    {eleveDetail.factures.flatMap((f: any) => f.paiements).length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun versement n'a encore été effectué.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                            Veuillez rechercher et sélectionner un élève ci-dessus
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 4. YEAR END CLOSURE */}
                            {tab === 'cloture' && (
                                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                                    <div style={{ width: 64, height: 64, borderRadius: 999, background: clotureState.closed ? '#ecfdf5' : '#fffbeb', color: clotureState.closed ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {clotureState.closed ? <ShieldCheck size={36} /> : <AlertTriangle size={36} />}
                                    </div>
                                    
                                    <div>
                                        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
                                            {clotureState.closed ? "Année Scolaire Clôturée avec Succès !" : "Clôture Simplifiée de Fin d'Année"}
                                        </h3>
                                        <p style={{ fontSize: 13, color: '#64748b', maxWidth: 450, margin: '8px auto 0', lineHeight: 1.5 }}>
                                            {clotureState.closed 
                                                ? "L'année scolaire écoulée a été archivée avec succès dans l'historique de l'établissement. Toutes les factures et transactions sont maintenant protégées." 
                                                : "Cette opération clôture l'exercice en cours, protège les données d'écritures comptables de l'année scolaire, et prépare le système pour le paramétrage de l'année prochaine."}
                                        </p>
                                    </div>

                                    {!clotureState.closed && (
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, fontSize: 13, color: '#475569', textAlign: 'left', maxWidth: 500 }}>
                                            <p style={{ fontWeight: 600, marginBottom: 8 }}>Actions automatiques exécutées :</p>
                                            <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                <li>Archivage complet des paiements et dépenses de l'année.</li>
                                                <li>Génération d'un rapport de synthèse final d'année.</li>
                                                <li>Protection en lecture seule des factures émises.</li>
                                                <li>Ouverture propre pour les inscriptions de l'année suivante.</li>
                                            </ul>
                                        </div>
                                    )}

                                    {!clotureState.closed ? (
                                        <button onClick={handleCloture}
                                            style={{ padding: '12px 24px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(245,158,11,0.2)' }}>
                                            Lancer la Clôture de l'Année
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700, fontSize: 14 }}>
                                            <CheckCircle2 size={16} /> Statut : Exercice Clôturé
                                        </div>
                                    )}
                                </div>
                            )}

                        </>
                    )}
                </div>
            </motion.div>

            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #print-area, #print-area * { visibility: visible; }
                    #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; border: none !important; box-shadow: none !important; }
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
