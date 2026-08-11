'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar, Printer, Download, ChevronRight, ChevronDown, Loader2,
    FileText, CheckCircle2, TrendingUp, TrendingDown, Coins,
    Search, User, Landmark, BookOpen, AlertTriangle, ShieldCheck
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('fr-GN') + ' GNF';

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const CURRENT_YEAR = new Date().getFullYear();
const ANNEES = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 4 + i);

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
    // Distingue "aucune recherche lancée pour l'instant" de "recherche lancée,
    // 0 résultat" — sans ça, "Aucun élève trouvé" s'affichait dès la première
    // lettre tapée, avant même que la requête n'ait eu le temps de partir.
    const [hasSearched, setHasSearched] = useState(false);

    // Data states
    const [dataMois, setDataMois] = useState<any>(null);
    const [dataAnnuel, setDataAnnuel] = useState<any>(null);
    const [verifCloture, setVerifCloture] = useState<any>(null);
    const [clotureLoading, setClotureLoading] = useState(false);
    const [expandedPaiementEleve, setExpandedPaiementEleve] = useState<string | null>(null);

    const fetchVerificationCloture = useCallback(async () => {
        try {
            const res = await api.get(`/api/annee-scolaire/${anneeId}/verification-cloture`);
            setVerifCloture(res.data);
        } catch (e) {
            console.error(e);
            setVerifCloture(null);
        }
    }, [anneeId]);

    const fetchMonthlyReport = useCallback(async () => {
        setLoading(true);
        setDataMois(null);
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
        setDataAnnuel(null);
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
        setHasSearched(true);
        try {
            // Recherche déléguée au backend (paramètre `search`, déjà supporté) —
            // avant, cette page téléchargeait les 50 premiers élèves (limite par
            // défaut du backend, jamais changée ici) et filtrait côté client :
            // un élève au-delà des 50 premiers n'était donc JAMAIS trouvable,
            // quel que soit le texte recherché.
            const res = await api.get(`/api/eleves?etablissement_id=${etablissementId}&annee_id=${anneeId}&search=${encodeURIComponent(searchEleve)}&limit=50`);
            setElevesList(res.data || []);
        } catch (e) {
            console.error(e);
        }
        setEleveLoading(false);
    };

    // Recherche automatique dès la 1ère lettre (débounced) — avant, il fallait
    // cliquer explicitement sur "Rechercher" ; en attendant ce clic, le message
    // "Aucun élève trouvé" s'affichait déjà (voir `hasSearched` plus haut), ce
    // qui donnait l'impression trompeuse qu'aucune recherche ne fonctionnait.
    useEffect(() => {
        if (!searchEleve) {
            setElevesList([]);
            setHasSearched(false);
            return;
        }
        const timer = setTimeout(() => { searchElevesData(); }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchEleve, anneeId, etablissementId]);

    const fetchEleveHistory = async (eleveId: string) => {
        if (!eleveId) return;
        setEleveLoading(true);
        // Repartir de zéro à chaque nouvelle sélection : si la requête échoue, on ne
        // doit jamais laisser affichée la fiche du précédent élève consulté.
        setEleveDetail(null);
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
        } else if (tab === 'cloture') {
            fetchVerificationCloture();
        }
    }, [tab, fetchMonthlyReport, fetchAnnualReport, fetchVerificationCloture]);

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

    const handleCloture = async () => {
        if (!verifCloture?.peut_cloturer) return;
        if (!confirm(`Êtes-vous sûr de vouloir clôturer définitivement la comptabilité de ${verifCloture.annee_libelle} ? Plus aucune facture, paiement ou dépense ne pourra être créé ou modifié pour cette année — les données resteront consultables en lecture seule.`)) return;
        setClotureLoading(true);
        try {
            await api.post(`/api/annee-scolaire/${anneeId}/cloturer-comptabilite`);
            await fetchVerificationCloture();
            alert('Comptabilité clôturée avec succès.');
        } catch (e: any) {
            alert(e.response?.data?.detail || "Erreur lors de la clôture de la comptabilité.");
        }
        setClotureLoading(false);
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
                                    {(() => {
                                        if (!dataMois.paiements || dataMois.paiements.length === 0) {
                                            return (
                                                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>Aucune transaction enregistrée</div>
                                            );
                                        }

                                        const grouped = dataMois.paiements.reduce((acc: any, p: any) => {
                                            const key = p.eleve_nom + '|' + p.classe;
                                            if (!acc[key]) acc[key] = [];
                                            acc[key].push(p);
                                            return acc;
                                        }, {});

                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {Object.entries(grouped).map(([key, paiementsGroup]: [string, any]) => {
                                                    const isExpanded = expandedPaiementEleve === key;
                                                    const mainP = paiementsGroup[0];
                                                    const totalEleve = paiementsGroup.reduce((s: number, pt: any) => s + pt.montant, 0);

                                                    return (
                                                        <div key={key} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                                                            <div 
                                                                onClick={() => setExpandedPaiementEleve(isExpanded ? null : key)}
                                                                style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'transparent', transition: 'background 0.2s' }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569' }}>
                                                                        {mainP.eleve_nom.substring(0, 2).toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <span style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>{mainP.eleve_nom}</span>
                                                                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: '#e0f2fe', color: '#0369a1' }}>{mainP.classe}</span>
                                                                        </div>
                                                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                                                                            Dernier paiement : {mainP.date_paiement} ({mainP.mode_paiement})
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                    <div style={{ textAlign: 'right' }}>
                                                                        <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>Total sur le mois</span>
                                                                        <span style={{ fontWeight: 800, fontSize: '16px', color: '#10b981' }}>{fmt(totalEleve)}</span>
                                                                    </div>
                                                                    {paiementsGroup.length > 1 && (
                                                                        <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                                                                            {paiementsGroup.length} paiements {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {(isExpanded || paiementsGroup.length === 1) && (
                                                                <div style={{ background: '#f8fafc', padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                                                        <thead>
                                                                            <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                                                                                <th style={{ padding: '8px 0', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Reçu</th>
                                                                                <th style={{ padding: '8px 0', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Date</th>
                                                                                <th style={{ padding: '8px 0', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Mode</th>
                                                                                <th style={{ padding: '8px 0', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Montant</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {paiementsGroup.map((pt: any, i: number) => (
                                                                                <tr key={i} style={{ borderBottom: i < paiementsGroup.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                                                                                    <td style={{ padding: '10px 0', fontFamily: 'monospace', color: '#334155' }}>{pt.numero_recu}</td>
                                                                                    <td style={{ padding: '10px 0', color: '#475569' }}>{pt.date_paiement}</td>
                                                                                    <td style={{ padding: '10px 0', color: '#475569' }}>{pt.mode_paiement}</td>
                                                                                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmt(pt.montant)}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
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

                            {/* 3. YEAR END CLOSURE */}
                            {tab === 'cloture' && (
                                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
                                    {!verifCloture ? (
                                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                                            <Loader2 size={32} className="animate-spin" color="#10b981" />
                                        </div>
                                    ) : (
                                        <>
                                            {(() => {
                                                const estClotureee = verifCloture.annee_statut === 'CLOTURE_COMPTABLE' || verifCloture.annee_statut === 'ARCHIVEE';
                                                return (
                                                    <div style={{ width: 64, height: 64, borderRadius: 999, background: estClotureee ? '#ecfdf5' : '#fffbeb', color: estClotureee ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {estClotureee ? <ShieldCheck size={36} /> : <AlertTriangle size={36} />}
                                                    </div>
                                                );
                                            })()}

                                            <div>
                                                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>
                                                    {verifCloture.annee_statut === 'CLOTURE_COMPTABLE' || verifCloture.annee_statut === 'ARCHIVEE'
                                                        ? `Comptabilité de ${verifCloture.annee_libelle} clôturée`
                                                        : `Clôture Comptable — ${verifCloture.annee_libelle}`}
                                                </h3>
                                                <p style={{ fontSize: 13, color: '#64748b', maxWidth: 480, margin: '8px auto 0', lineHeight: 1.5 }}>
                                                    {verifCloture.annee_statut === 'CLOTURE_COMPTABLE' || verifCloture.annee_statut === 'ARCHIVEE'
                                                        ? `Clôturée le ${verifCloture.date_cloture_comptable || '—'}. Plus aucune facture, paiement ou dépense ne peut être créé ou modifié pour cette année. Toutes les données restent consultables en lecture seule.`
                                                        : "Les contrôles ci-dessous doivent tous passer (BLOQUANT) avant que la comptabilité de cette année puisse être clôturée définitivement."}
                                                </p>
                                            </div>

                                            {verifCloture.annee_statut !== 'CLOTURE_COMPTABLE' && verifCloture.annee_statut !== 'ARCHIVEE' && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 560, textAlign: 'left' }}>
                                                    {verifCloture.controles.map((c: any) => (
                                                        <div key={c.code} style={{
                                                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 8,
                                                            background: c.ok ? '#ecfdf5' : (c.severite === 'BLOQUANT' ? '#fef2f2' : '#fffbeb'),
                                                            border: `1px solid ${c.ok ? '#a7f3d0' : (c.severite === 'BLOQUANT' ? '#fecaca' : '#fde68a')}`,
                                                        }}>
                                                            {c.ok
                                                                ? <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
                                                                : <AlertTriangle size={18} color={c.severite === 'BLOQUANT' ? '#ef4444' : '#f59e0b'} style={{ flexShrink: 0, marginTop: 1 }} />}
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.label}</span>
                                                                    <span style={{
                                                                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                                                                        background: c.severite === 'BLOQUANT' ? '#fee2e2' : '#fef3c7',
                                                                        color: c.severite === 'BLOQUANT' ? '#b91c1c' : '#92400e',
                                                                    }}>{c.severite}</span>
                                                                </div>
                                                                <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{c.detail}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {verifCloture.annee_statut !== 'CLOTURE_COMPTABLE' && verifCloture.annee_statut !== 'ARCHIVEE' ? (
                                                <button onClick={handleCloture} disabled={clotureLoading || !verifCloture.peut_cloturer}
                                                    title={!verifCloture.peut_cloturer ? "Tous les contrôles bloquants doivent être résolus avant de pouvoir clôturer." : undefined}
                                                    style={{ padding: '12px 24px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: (clotureLoading || !verifCloture.peut_cloturer) ? 'not-allowed' : 'pointer', opacity: (clotureLoading || !verifCloture.peut_cloturer) ? 0.5 : 1, boxShadow: '0 4px 6px -1px rgba(245,158,11,0.2)' }}>
                                                    {clotureLoading ? 'Clôture en cours...' : "Clôturer la Comptabilité de l'Année"}
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700, fontSize: 14 }}>
                                                    <CheckCircle2 size={16} /> Statut : {verifCloture.annee_statut === 'ARCHIVEE' ? 'Archivée' : 'Clôturée (lecture seule)'}
                                                </div>
                                            )}
                                        </>
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
