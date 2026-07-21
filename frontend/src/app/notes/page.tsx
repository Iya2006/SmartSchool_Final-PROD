'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ClipboardList, Search, Filter, BarChart3, Users, BookOpen, Trophy,
    ChevronDown, AlertCircle, Check, Edit3, Save, Eye, Calculator,
    FileText, X, ArrowUpDown, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';



interface MatiereInfo { matiere_id: number; code: string; libelle: string; coefficient: number; }
interface EleveNotes {
    eleve_id: number; inscription_id: number; nom: string; prenom: string;
    matricule: string; sexe: string; moyenne_generale: number | null;
    rang: number; mention: string | null;
    matieres: Record<string, { moyenne: number | null; nb_notes: number; appreciation: string | null }>;
}
interface ClasseData {
    classe: { classe_id: number; code: string; libelle: string };
    matieres: MatiereInfo[];
    matieres_stats: Record<string, { moyenne_classe: number | null; note_min: number | null; note_max: number | null }>;
    eleves: EleveNotes[];
    effectif: number;
}
interface EvalCentralisee {
    evaluation_id: number; libelle: string; date_evaluation: string;
    matiere: string; classe: string; classe_id: number; trimestre: string;
    enseignant: string; note_sur: number; coefficient: number;
    nb_notes: number; moyenne: number | null; statut: string;
}

export default function CentralisationNotesPage() {
    const { etablissementId } = useApp();

    // State
    const [classes, setClasses] = useState<any[]>([]);
    const [trimestres, setTrimestres] = useState<any[]>([]);
    const [selectedClasse, setSelectedClasse] = useState<number | null>(null);
    const [selectedTrimestre, setSelectedTrimestre] = useState<number>(1);
    const [classeData, setClasseData] = useState<ClasseData | null>(null);
    const [evalsCentralisees, setEvalsCentralisees] = useState<EvalCentralisee[]>([]);
    const [stats, setStats] = useState({ total_evaluations: 0, centralisees: 0, non_centralisees: 0, taux_centralisation: 0 });
    const [loading, setLoading] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
    const [successMsg, setSuccessMsg] = useState('');
    const [search, setSearch] = useState('');

    // Load initial data
    useEffect(() => {
        const loadInit = async () => {
            try {
                const [clsRes, triRes, statsRes, evalsRes] = await Promise.all([
                    api.get(`/api/classes?etablissement_id=${etablissementId}`),
                    api.get('/api/portail-enseignant/referentiels/trimestres'),
                    api.get('/api/evaluations/centralisation/stats'),
                    api.get('/api/evaluations/centralisees'),
                ]);
                setClasses(clsRes.data);
                setTrimestres(triRes.data);
                setStats(statsRes.data);
                setEvalsCentralisees(evalsRes.data);
            } catch (e) { console.error(e); }
        };
        loadInit();
    }, [etablissementId]);

    // Load classe detail view
    const loadClasseDetail = useCallback(async () => {
        if (!selectedClasse) return;
        setLoading(true);
        try {
            const res = await api.get(`/api/evaluations/classe/${selectedClasse}/notes-centralisees?trimestre_id=${selectedTrimestre}`);
            setClasseData(res.data);
            setViewMode('detail');
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [selectedClasse, selectedTrimestre]);

    useEffect(() => {
        if (selectedClasse) loadClasseDetail();
    }, [selectedClasse, selectedTrimestre, loadClasseDetail]);

    // Calculer moyennes
    const handleCalculerMoyennes = async () => {
        if (!selectedClasse) return;
        setCalculating(true);
        try {
            const res = await api.post(`/api/evaluations/classe/${selectedClasse}/calculer-moyennes?trimestre_id=${selectedTrimestre}`);
            setSuccessMsg(res.data.message);
            setTimeout(() => setSuccessMsg(''), 5000);
            await loadClasseDetail();
        } catch (e: any) { alert(e.message); }
        setCalculating(false);
    };

    // Filtered classes by cycle
    const groupedClasses = classes.reduce((acc: any, cls: any) => {
        const cycle = cls.libelle?.includes('Année') ? 'Primaire' :
            cls.libelle?.match(/[7-9]|10/) ? 'Collège' : 'Lycée';
        if (!acc[cycle]) acc[cycle] = [];
        acc[cycle].push(cls);
        return acc;
    }, {});

    // Filter evals
    const filteredEvals = evalsCentralisees.filter(ev =>
        ev.libelle.toLowerCase().includes(search.toLowerCase()) ||
        ev.classe.toLowerCase().includes(search.toLowerCase()) ||
        ev.matiere.toLowerCase().includes(search.toLowerCase()) ||
        ev.enseignant.toLowerCase().includes(search.toLowerCase())
    );

    // Note coloring
    const getNoteColor = (note: number | null) => {
        if (note === null) return '#94a3b8';
        if (note >= 16) return '#059669';
        if (note >= 14) return '#10b981';
        if (note >= 10) return '#3b82f6';
        if (note >= 8) return '#f59e0b';
        return '#ef4444';
    };

    const getNoteBackground = (note: number | null) => {
        if (note === null) return '#f1f5f9';
        if (note >= 16) return '#ecfdf5';
        if (note >= 14) return '#f0fdf4';
        if (note >= 10) return '#eff6ff';
        if (note >= 8) return '#fffbeb';
        return '#fef2f2';
    };

    return (
        <div style={{ padding: '24px 30px', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            {/* ═══ HEADER ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ClipboardList size={22} color="white" />
                        </div>
                        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>Centralisation des Notes</h1>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Centralisez, vérifiez et calculez les moyennes par classe et trimestre</p>
                </div>
                {viewMode === 'detail' && (
                    <button onClick={() => setViewMode('overview')}
                        style={{ padding: '8px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>
                        ← Vue d&apos;ensemble
                    </button>
                )}
            </div>

            {/* ═══ SUCCESS MESSAGE ═══ */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ padding: '14px 20px', borderRadius: '12px', background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1px solid #6ee7b7', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, color: '#065f46' }}>
                        <Check size={18} /> {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ KPI STATS ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Évaluations Totales', value: stats.total_evaluations, icon: BookOpen, color: '#6366f1', bg: '#eef2ff' },
                    { label: 'Centralisées', value: stats.centralisees, icon: Check, color: '#059669', bg: '#ecfdf5' },
                    { label: 'En Attente', value: stats.non_centralisees, icon: AlertCircle, color: '#f59e0b', bg: '#fffbeb' },
                    { label: 'Taux Centralisation', value: `${stats.taux_centralisation}%`, icon: TrendingUp, color: '#8b5cf6', bg: '#f5f3ff' },
                ].map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        style={{ padding: '18px 20px', borderRadius: '14px', background: 'white', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <kpi.icon size={20} color={kpi.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{kpi.value}</div>
                            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{kpi.label}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {viewMode === 'overview' ? (
                <>
                    {/* ═══ SÉLECTEURS ═══ */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <select value={selectedClasse || ''} onChange={e => setSelectedClasse(Number(e.target.value) || null)}
                            style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: 600, minWidth: '280px', background: 'white', cursor: 'pointer' }}>
                            <option value="">— Sélectionner une classe —</option>
                            {Object.entries(groupedClasses).map(([cycle, cls]: [string, any]) => (
                                <optgroup key={cycle} label={`📚 ${cycle}`}>
                                    {cls.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        <select value={selectedTrimestre} onChange={e => setSelectedTrimestre(Number(e.target.value))}
                            style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '14px', fontWeight: 600, minWidth: '200px', background: 'white', cursor: 'pointer' }}>
                            {trimestres.length > 0 ? trimestres.map((t: any) => (
                                <option key={t.trimestre_id} value={t.trimestre_id}>{t.libelle}</option>
                            )) : (
                                <>
                                    <option value={1}>1er Trimestre</option>
                                    <option value={2}>2ème Trimestre</option>
                                    <option value={3}>3ème Trimestre</option>
                                </>
                            )}
                        </select>
                        <button onClick={loadClasseDetail} disabled={!selectedClasse || loading}
                            style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: selectedClasse ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0', color: selectedClasse ? 'white' : '#94a3b8', fontSize: '14px', fontWeight: 700, cursor: selectedClasse ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Eye size={16} /> Voir les Notes
                        </button>
                    </div>

                    {/* ═══ LISTE DES ÉVALUATIONS CENTRALISÉES ═══ */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>📋 Évaluations Centralisées par les Enseignants</h3>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
                                    style={{ padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', width: '240px' }} />
                            </div>
                        </div>

                        {filteredEvals.length === 0 ? (
                            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8' }}>
                                <ClipboardList size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                <p style={{ fontSize: '15px', fontWeight: 600 }}>Aucune évaluation centralisée</p>
                                <p style={{ fontSize: '13px' }}>Les évaluations apparaîtront ici lorsque les enseignants les auront centralisées.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            {['Évaluation', 'Classe', 'Matière', 'Enseignant', 'Date', 'Notes', 'Moyenne', 'Statut'].map(h => (
                                                <th key={h} style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEvals.map((ev, i) => (
                                            <tr key={ev.evaluation_id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{ev.libelle}</div>
                                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>/{ev.note_sur} • Coef {ev.coefficient}</div>
                                                </td>
                                                <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 600 }}>{ev.classe}</td>
                                                <td style={{ padding: '14px 16px', fontSize: '13px' }}>{ev.matiere}</td>
                                                <td style={{ padding: '14px 16px', fontSize: '13px' }}>{ev.enseignant}</td>
                                                <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>{ev.date_evaluation}</td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '20px', background: '#eef2ff', color: '#6366f1', fontSize: '12px', fontWeight: 700 }}>{ev.nb_notes}</span>
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ fontSize: '14px', fontWeight: 700, color: getNoteColor(ev.moyenne) }}>
                                                        {ev.moyenne !== null ? ev.moyenne.toFixed(1) : '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{ padding: '4px 12px', borderRadius: '20px', background: '#ecfdf5', color: '#059669', fontSize: '11px', fontWeight: 700 }}>
                                                        ✅ Centralisée
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                </>
            ) : classeData ? (
                <>
                    {/* ═══ DETAIL VIEW: TABLEAU CROISÉ ÉLÈVES × MATIÈRES ═══ */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                                📊 {classeData.classe.libelle}
                            </h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                                {classeData.effectif} élèves • {classeData.matieres.length} matières • {trimestres.find((t: any) => t.trimestre_id === selectedTrimestre)?.libelle || `Trimestre ${selectedTrimestre}`}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={handleCalculerMoyennes} disabled={calculating}
                                style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(99,102,241,0.3)' }}>
                                <Calculator size={16} /> {calculating ? 'Calcul en cours...' : 'Calculer Moyennes & Classements'}
                            </button>
                            <button onClick={() => window.location.href = `/bulletins?classe_id=${selectedClasse}&trimestre_id=${selectedTrimestre}`}
                                style={{ padding: '10px 20px', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                                <FileText size={16} /> Bulletins →
                            </button>
                        </div>
                    </div>

                    {/* ═══ TABLEAU PIVOT ═══ */}
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${400 + classeData.matieres.length * 100}px` }}>
                                <thead>
                                    <tr style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)' }}>
                                        <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'center', width: '40px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>#</th>
                                        <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'left', width: '200px', position: 'sticky', left: '40px', background: '#f8fafc', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>ÉLÈVE</th>
                                        {classeData.matieres.map(m => (
                                            <th key={m.matiere_id} style={{ padding: '10px 8px', fontSize: '10px', fontWeight: 700, color: '#475569', textAlign: 'center', minWidth: '90px', borderLeft: '1px solid #e2e8f0' }}>
                                                <div>{m.libelle}</div>
                                                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>Coef {m.coefficient}</div>
                                            </th>
                                        ))}
                                        <th style={{ padding: '14px 10px', fontSize: '11px', fontWeight: 800, color: '#6366f1', textAlign: 'center', borderLeft: '3px solid #6366f1', minWidth: '90px' }}>MOY. GÉN.</th>
                                        <th style={{ padding: '14px 10px', fontSize: '11px', fontWeight: 800, color: '#f59e0b', textAlign: 'center', minWidth: '60px' }}>RANG</th>
                                        <th style={{ padding: '14px 10px', fontSize: '11px', fontWeight: 700, color: '#64748b', textAlign: 'center', minWidth: '80px' }}>MENTION</th>
                                    </tr>
                                    {/* Stats row */}
                                    <tr style={{ background: '#fafbff' }}>
                                        <td colSpan={2} style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', position: 'sticky', left: 0, background: '#fafbff', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>
                                            📊 Moyenne Classe
                                        </td>
                                        {classeData.matieres.map(m => {
                                            const st = classeData.matieres_stats[String(m.matiere_id)];
                                            return (
                                                <td key={m.matiere_id} style={{ padding: '6px 8px', textAlign: 'center', borderLeft: '1px solid #e2e8f0', fontSize: '11px' }}>
                                                    <div style={{ fontWeight: 700, color: getNoteColor(st?.moyenne_classe ?? null) }}>
                                                        {st?.moyenne_classe?.toFixed(1) ?? '—'}
                                                    </div>
                                                    <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                                                        {st?.note_min?.toFixed(0) ?? '—'} — {st?.note_max?.toFixed(0) ?? '—'}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                        <td colSpan={3} style={{ borderLeft: '3px solid #6366f1' }}></td>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classeData.eleves.map((eleve, idx) => (
                                        <tr key={eleve.eleve_id}
                                            style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#fafbff')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <td style={{ padding: '10px 16px', fontSize: '12px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, position: 'sticky', left: 0, background: 'inherit', zIndex: 1, borderRight: '2px solid #e2e8f0' }}>{idx + 1}</td>
                                            <td style={{ padding: '10px 16px', position: 'sticky', left: '40px', background: 'inherit', zIndex: 1, borderRight: '2px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{eleve.nom} {eleve.prenom}</div>
                                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{eleve.matricule}</div>
                                            </td>
                                            {classeData.matieres.map(m => {
                                                const matData = eleve.matieres[String(m.matiere_id)];
                                                const moy = matData?.moyenne;
                                                return (
                                                    <td key={m.matiere_id} style={{ padding: '6px 8px', textAlign: 'center', borderLeft: '1px solid #f1f5f9' }}>
                                                        <div style={{ padding: '4px 8px', borderRadius: '6px', background: getNoteBackground(moy ?? null), display: 'inline-block', minWidth: '40px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 700, color: getNoteColor(moy ?? null) }}>
                                                                {moy !== null && moy !== undefined ? moy.toFixed(1) : '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td style={{ padding: '10px 10px', textAlign: 'center', borderLeft: '3px solid #6366f1' }}>
                                                <div style={{ padding: '6px 12px', borderRadius: '8px', background: getNoteBackground(eleve.moyenne_generale), display: 'inline-block' }}>
                                                    <span style={{ fontSize: '15px', fontWeight: 800, color: getNoteColor(eleve.moyenne_generale) }}>
                                                        {eleve.moyenne_generale !== null ? eleve.moyenne_generale.toFixed(2) : '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                {eleve.rang <= 3 ? (
                                                    <span style={{ fontSize: '16px', fontWeight: 800, color: eleve.rang === 1 ? '#f59e0b' : eleve.rang === 2 ? '#94a3b8' : '#b45309' }}>
                                                        {eleve.rang === 1 ? '🥇' : eleve.rang === 2 ? '🥈' : '🥉'} {eleve.rang}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>{eleve.rang}<sup>e</sup></span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                {eleve.mention ? (
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                                        background: eleve.mention === 'TRÈS BIEN' ? '#ecfdf5' : eleve.mention === 'BIEN' ? '#f0fdf4' : eleve.mention === 'ASSEZ BIEN' ? '#eff6ff' : eleve.mention === 'PASSABLE' ? '#fffbeb' : '#fef2f2',
                                                        color: eleve.mention === 'TRÈS BIEN' ? '#065f46' : eleve.mention === 'BIEN' ? '#166534' : eleve.mention === 'ASSEZ BIEN' ? '#1e40af' : eleve.mention === 'PASSABLE' ? '#92400e' : '#991b1b',
                                                    }}>{eleve.mention}</span>
                                                ) : <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                </>
            ) : loading ? (
                <div style={{ textAlign: 'center', padding: '80px', color: '#94a3b8' }}>
                    <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTop: '3px solid #6366f1', borderRadius: '50%', margin: '0 auto 16px' }}></div>
                    <p>Chargement des données...</p>
                </div>
            ) : null}
        </div>
    );
}
