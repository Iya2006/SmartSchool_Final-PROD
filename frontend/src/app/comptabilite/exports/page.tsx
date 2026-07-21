'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { motion } from 'framer-motion';
import {
    Calendar, Printer, Download, ChevronRight, Loader2,
    DollarSign, AlertTriangle, FileText, CheckCircle2
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

const fmt = (n: number) => n.toLocaleString('fr-GN');

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const ANNEES = [2023, 2024, 2025, 2026]; // Idealement dynamique

export default function ExportsPage() {
    const { etablissementId, anneeId } = useApp();
    const [tab, setTab] = useState<'journalier' | 'mensuel' | 'classe'>('journalier');
    const [loading, setLoading] = useState(false);

    // Header Ecole (pour impression)
    const [headerInfo, setHeaderInfo] = useState<any>(null);

    // Filtres
    const [dateRapport, setDateRapport] = useState(new Date().toISOString().split('T')[0]);
    const [moisCible, setMoisCible] = useState(new Date().getMonth() + 1);
    const [anneeCible, setAnneeCible] = useState(new Date().getFullYear());
    const [classeCible, setClasseCible] = useState('');

    const [classes, setClasses] = useState<any[]>([]);

    // Données
    const [dataJour, setDataJour] = useState<any>(null);
    const [dataMois, setDataMois] = useState<any>(null);
    const [dataClasse, setDataClasse] = useState<any>(null);

    useEffect(() => {
        // Fetch classes & header info once
        api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`).then(res => {
            if (res.data?.length > 0) {
                setClasses(res.data);
                if (!classeCible) setClasseCible(res.data[0].classe_id.toString());
            }
        });
        // On simule headerInfo avec une requete bidon ou statique car pas d'endpoint dédié ecole, on recupere de la premiere classe par ex
        setHeaderInfo({ nom: 'SmartSchool', adresse: 'Conakry, Guinée', tel: '+224 620 00 00 00' });
    }, [etablissementId, anneeId]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === 'journalier') {
                const res = await api.get(`/api/finance/rapports/journalier?etablissement_id=${etablissementId}&annee_id=${anneeId}&date_rapport=${dateRapport}`);
                setDataJour(res.data);
            } else if (tab === 'mensuel') {
                const res = await api.get(`/api/finance/rapports/mensuel?etablissement_id=${etablissementId}&annee_id=${anneeId}&mois=${moisCible}&annee=${anneeCible}`);
                setDataMois(res.data);
            } else if (tab === 'classe' && classeCible) {
                const res = await api.get(`/api/finance/factures?etablissement_id=${etablissementId}&annee_id=${anneeId}&classe_id=${classeCible}`);
                setDataClasse(res.data);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [tab, dateRapport, moisCible, anneeCible, classeCible, etablissementId, anneeId]);

    useEffect(() => { fetchData(); }, [fetchData]);

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                <Link href="/comptabilite" style={{ color: '#3b82f6' }}>Comptabilité</Link><ChevronRight size={14} />
                <span style={{ fontWeight: 600, color: '#1e293b' }}>Exports & Rapports</span>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                {[{ id: 'journalier' as const, label: 'Rapport Journalier' }, { id: 'mensuel' as const, label: 'Rapport Mensuel' }, { id: 'classe' as const, label: 'Par Classe' }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#1e293b' : '#64748b', boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} key={tab}
                style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                
                {/* FILTERS AREA */}
                <div className="no-print" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, background: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {tab === 'journalier' && (
                            <input type="date" value={dateRapport} onChange={e => setDateRapport(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none' }} />
                        )}
                        {tab === 'mensuel' && (
                            <>
                                <select value={moisCible} onChange={e => setMoisCible(parseInt(e.target.value))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                    {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                                </select>
                                <select value={anneeCible} onChange={e => setAnneeCible(parseInt(e.target.value))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                    {ANNEES.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </>
                        )}
                        {tab === 'classe' && (
                            <select value={classeCible} onChange={e => setClasseCible(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
                                <option value="">Choisir une classe...</option>
                                {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                            </select>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={handlePrint} style={{ padding: '8px 16px', borderRadius: 8, background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Printer size={16} /> Imprimer
                        </button>
                        <button onClick={() => {
                            if (tab === 'journalier' && dataJour) exportCSV(dataJour.paiements, ['Reçu', 'Facture', 'Élève', 'Classe', 'Mode', 'Montant'], p => `"${p.numero_recu}","${p.numero_facture}","${p.eleve_nom}","${p.classe}","${p.mode_paiement}",${p.montant}`, `Rapport_Jour_${dateRapport}`);
                            if (tab === 'mensuel' && dataMois) exportCSV(dataMois.paiements, ['Reçu', 'Date', 'Élève', 'Classe', 'Mode', 'Montant'], p => `"${p.numero_recu}","${p.date_paiement}","${p.eleve_nom}","${p.classe}","${p.mode_paiement}",${p.montant}`, `Rapport_Mois_${moisCible}_${anneeCible}`);
                            if (tab === 'classe' && dataClasse) exportCSV(dataClasse, ['Facture', 'Élève', 'Type Frais', 'Montant Net', 'Payé', 'Reste', 'Statut'], f => `"${f.numero_facture}","${f.eleve_prenom} ${f.eleve_nom}","${f.type_frais_libelle}",${f.montant_total},${f.montant_paye},${f.montant_restant},"${f.statut}"`, `Rapport_Classe_${classeCible}`);
                        }} style={{ padding: '8px 16px', borderRadius: 8, background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Download size={16} /> CSV
                        </button>
                    </div>
                </div>

                {/* CONTENT AREA (Printable) */}
                <div id="print-area" style={{ padding: 30 }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 size={32} className="animate-spin" color="#3b82f6" /></div>
                    ) : (
                        <>
                            {/* Print Header */}
                            <div className="print-only" style={{ display: 'none', textAlign: 'center', marginBottom: 30, borderBottom: '2px solid #1e293b', paddingBottom: 16 }}>
                                <h1 style={{ fontSize: 24, fontWeight: 800 }}>{headerInfo?.nom}</h1>
                                <p style={{ color: '#64748b' }}>{headerInfo?.adresse} • {headerInfo?.tel}</p>
                            </div>

                            {tab === 'journalier' && dataJour && (
                                <div>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#1e293b' }}>Rapport Financier Journalier du {dataJour.date}</h2>
                                    <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
                                        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px 20px', borderRadius: 10, flex: 1 }}>
                                            <p style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Total Encaissé</p>
                                            <p style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{fmt(dataJour.total_encaisse)} GNF</p>
                                        </div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px 20px', borderRadius: 10, flex: 1 }}>
                                            <p style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Paiements Reçus</p>
                                            <p style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{dataJour.nb_paiements}</p>
                                        </div>
                                    </div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead><tr style={{ background: '#f1f5f9' }}><th style={{ padding: 12, textAlign: 'left' }}>Reçu</th><th style={{ padding: 12, textAlign: 'left' }}>Élève</th><th style={{ padding: 12, textAlign: 'left' }}>Classe</th><th style={{ padding: 12, textAlign: 'left' }}>Facture</th><th style={{ padding: 12, textAlign: 'left' }}>Mode</th><th style={{ padding: 12, textAlign: 'right' }}>Montant</th></tr></thead>
                                        <tbody>
                                            {dataJour.paiements.map((p: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 12 }}>{p.numero_recu}</td><td style={{ padding: 12, fontWeight: 600 }}>{p.eleve_nom}</td><td style={{ padding: 12 }}>{p.classe}</td><td style={{ padding: 12 }}>{p.numero_facture}</td><td style={{ padding: 12 }}>{p.mode_paiement}</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(p.montant)}</td></tr>
                                            ))}
                                            {dataJour.paiements.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun encaissement ce jour.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'mensuel' && dataMois && (
                                <div>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#1e293b' }}>Rapport Financier Mensuel — {dataMois.mois} {dataMois.annee}</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                                        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '16px', borderRadius: 10 }}>
                                            <p style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Total Encaissé</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#10b981' }}>{fmt(dataMois.total_encaisse)} GNF</p>
                                        </div>
                                        <div style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: '16px', borderRadius: 10 }}>
                                            <p style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>Impayés du Mois</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{fmt(dataMois.total_impayes)} GNF</p>
                                        </div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '16px', borderRadius: 10 }}>
                                            <p style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Nombre de Paiements</p>
                                            <p style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>{dataMois.nb_paiements}</p>
                                        </div>
                                    </div>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 30, marginBottom: 10, color: '#475569' }}>Résumé par Classe</h3>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 30 }}>
                                        <thead><tr style={{ background: '#f1f5f9' }}><th style={{ padding: 10, textAlign: 'left' }}>Classe</th><th style={{ padding: 10, textAlign: 'center' }}>Nb Paiements</th><th style={{ padding: 10, textAlign: 'right' }}>Total Encaissé</th></tr></thead>
                                        <tbody>
                                            {dataMois.par_classe.map((c: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 10, fontWeight: 600 }}>{c.classe}</td><td style={{ padding: 10, textAlign: 'center' }}>{c.nb_paiements}</td><td style={{ padding: 10, textAlign: 'right', fontWeight: 700 }}>{fmt(c.encaisse)} GNF</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {tab === 'classe' && dataClasse && (
                                <div>
                                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#1e293b' }}>Situation Financière — Classe sélectionnée</h2>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead><tr style={{ background: '#f1f5f9' }}><th style={{ padding: 10, textAlign: 'left' }}>Élève</th><th style={{ padding: 10, textAlign: 'left' }}>Facture</th><th style={{ padding: 10, textAlign: 'right' }}>Montant</th><th style={{ padding: 10, textAlign: 'right' }}>Payé</th><th style={{ padding: 10, textAlign: 'right' }}>Reste</th><th style={{ padding: 10, textAlign: 'center' }}>Statut</th></tr></thead>
                                        <tbody>
                                            {dataClasse.map((f: any, i: number) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: 10, fontWeight: 600 }}>{f.eleve_prenom} {f.eleve_nom}</td><td style={{ padding: 10 }}>{f.numero_facture}</td><td style={{ padding: 10, textAlign: 'right' }}>{fmt(f.montant_total)}</td><td style={{ padding: 10, textAlign: 'right', color: '#10b981' }}>{fmt(f.montant_paye)}</td><td style={{ padding: 10, textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{fmt(f.montant_restant)}</td><td style={{ padding: 10, textAlign: 'center' }}>{f.statut.replace('_', ' ')}</td></tr>
                                            ))}
                                            {dataClasse.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucune donnée</td></tr>}
                                        </tbody>
                                    </table>
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
