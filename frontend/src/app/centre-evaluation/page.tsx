'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, Loader2, FileText, Download, CheckCircle2, AlertCircle,
    X, Shield, Search, Filter, Clock, Users, BookOpen, Send, Eye,
    XCircle, BarChart3, FileUp, Award, Printer, PenLine, Inbox, Paperclip, UserCheck, Calendar
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface SujetItem {
    sujet_id: number; enseignant_id: number; enseignant_nom: string;
    enseignant_specialite: string | null;
    matiere_id: number; matiere_code: string; matiere_libelle: string;
    classe_id: number | null; classe_libelle: string | null;
    trimestre: number; titre: string; fichier_nom: string;
    fichier_type: string; fichier_taille: number; duree_minutes: number;
    statut: string; commentaire: string | null;
    date_depot: string | null; date_envoi: string | null;
}

interface StatsData {
    total_sujets: number; brouillons: number; envoyes: number;
    valides: number; rejetes: number; enseignants_soumis: number;
    total_enseignants: number; taux_soumission: number;
}

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    BROUILLON: { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9', icon: PenLine },
    ENVOYE: { label: 'Reçu', color: '#0d9488', bg: '#ccfbf1', icon: Inbox },
    VALIDE: { label: 'Validé', color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
    REJETE: { label: 'Rejeté', color: '#dc2626', bg: '#fee2e2', icon: XCircle },
};

export default function CentreEvaluationPage() {
    const [loading, setLoading] = useState(true);
    const [sujets, setSujets] = useState<SujetItem[]>([]);
    const [stats, setStats] = useState<StatsData | null>(null);
    const [filterStatut, setFilterStatut] = useState('');
    const [filterTrimestre, setFilterTrimestre] = useState<number | null>(null);
    const [searchQ, setSearchQ] = useState('');
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewSujet, setPreviewSujet] = useState<SujetItem | null>(null);
    const [rejectId, setRejectId] = useState<number | null>(null);
    const [rejectRaison, setRejectRaison] = useState('');

    const showSuccess = (m: string) => { setSuccessMsg(m); setTimeout(() => setSuccessMsg(null), 3500); };
    const showError = (m: string) => { setErrorMsg(m); setTimeout(() => setErrorMsg(null), 4000); };

    const handleDownloadSujet = async (sujetId: number, filename: string) => {
        try {
            const res = await api.get(`/api/examens/sujets/${sujetId}/fichier`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename || `sujet_${sujetId}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Erreur lors du téléchargement du fichier.');
        }
    };

    const loadData = useCallback(async () => {
        try {
            const [sujR, statsR] = await Promise.all([
                api.get('/api/examens/sujets'),
                api.get('/api/examens/admin/stats'),
            ]);
            setSujets(sujR.data);
            setStats(statsR.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleValider = async (id: number) => {
        try {
            await api.put(`/api/examens/sujets/${id}/valider`);
            showSuccess('Sujet validé avec succès.');
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
    };

    const handleRejeter = async () => {
        if (!rejectId) return;
        try {
            await api.put(`/api/examens/sujets/${rejectId}/rejeter?raison=${encodeURIComponent(rejectRaison)}`);
            showSuccess('Sujet rejeté, enseignant notifié.');
            setRejectId(null); setRejectRaison('');
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
    };

    const formatFileSize = (bytes: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    // Filter sujets - only show ENVOYE and above for admin
    const adminSujets = sujets.filter(s => s.statut !== 'BROUILLON');
    const filtered = adminSujets.filter(s => {
        if (filterStatut && s.statut !== filterStatut) return false;
        if (filterTrimestre && s.trimestre !== filterTrimestre) return false;
        if (searchQ) {
            const q = searchQ.toLowerCase();
            return s.enseignant_nom.toLowerCase().includes(q) || s.matiere_libelle.toLowerCase().includes(q) || s.titre.toLowerCase().includes(q);
        }
        return true;
    });

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column', gap: '16px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            <p style={{ color: 'var(--text-secondary)' }}>Chargement du centre d&apos;évaluation...</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link><ChevronRight size={14} /><span>Centre d&apos;Évaluation</span>
            </div>

            {/* Toasts */}
            <AnimatePresence>
                {successMsg && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#f0fdf4', color: '#166534', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #bbf7d0' }}>
                    <CheckCircle2 size={17} /> {successMsg}
                </motion.div>}
                {errorMsg && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #fecaca' }}>
                    <AlertCircle size={17} /> {errorMsg}
                </motion.div>}
            </AnimatePresence>

            {/* Hero Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    padding: '28px 32px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
                    color: 'white', position: 'relative', overflow: 'hidden'
                }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ position: 'absolute', bottom: '-30px', right: '80px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ padding: '14px', borderRadius: '16px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
                            <Award size={28} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Centre d&apos;Évaluation</h1>
                            <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>Réception et validation des sujets d&apos;examen</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Link href="/examens/emploi" style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', color: 'white',
                            textDecoration: 'none', fontSize: '13px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)'
                        }}>
                            <Clock size={15} /> Emploi des Examens
                        </Link>
                    </div>
                </div>
            </motion.div>

            {/* KPI Cards */}
            {stats && (
                <div className="kpi-grid">
                    {[
                        { label: 'Sujets Reçus', value: stats.envoyes + stats.valides, icon: FileUp, color: '#0d9488' },
                        { label: 'Validés', value: stats.valides, icon: CheckCircle2, color: '#16a34a' },
                        { label: 'En Attente', value: stats.envoyes, icon: Clock, color: '#f59e0b' },
                        { label: 'Taux Soumission', value: `${stats.taux_soumission}%`, icon: BarChart3, color: '#3b82f6' },
                    ].map((kpi, i) => (
                        <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div><p className="kpi-label">{kpi.label}</p><p className="kpi-value">{kpi.value}</p></div>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <kpi.icon size={24} />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '300px' }}>
                        <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                            placeholder="Rechercher enseignant, matière..."
                            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                    </div>
                    {/* Trimestre */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setFilterTrimestre(null)} style={{
                            padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: !filterTrimestre ? '#d97706' : '#f8fafc', color: !filterTrimestre ? 'white' : '#64748b',
                            border: 'none', cursor: 'pointer'
                        }}>Tous</button>
                        {[1, 2, 3].map(t => (
                            <button key={t} onClick={() => setFilterTrimestre(t)} style={{
                                padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                background: filterTrimestre === t ? '#d97706' : '#f8fafc', color: filterTrimestre === t ? 'white' : '#64748b',
                                border: 'none', cursor: 'pointer'
                            }}>T{t}</button>
                        ))}
                    </div>
                    {/* Statut */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setFilterStatut('')} style={{
                            padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: !filterStatut ? '#4f46e5' : '#f8fafc', color: !filterStatut ? 'white' : '#64748b',
                            border: 'none', cursor: 'pointer'
                        }}>Tous</button>
                        {['ENVOYE', 'VALIDE', 'REJETE'].map(st => {
                            const cfg = STATUT_CONFIG[st];
                            return (
                                <button key={st} onClick={() => setFilterStatut(st)} style={{
                                    padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                    background: filterStatut === st ? cfg.color : '#f8fafc', color: filterStatut === st ? 'white' : '#64748b',
                                    border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}><cfg.icon size={14} /> {cfg.label}</button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            {/* Sujets Grid */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                {filtered.length === 0 ? (
                    <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <FileText size={48} style={{ opacity: 0.15, margin: '0 auto 16px' }} />
                        <p style={{ fontWeight: 600, fontSize: '15px' }}>Aucun sujet trouvé.</p>
                        <p style={{ fontSize: '13px' }}>Les sujets des enseignants apparaîtront ici une fois envoyés.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                        {filtered.map((s, i) => {
                            const stCfg = STATUT_CONFIG[s.statut] || STATUT_CONFIG.ENVOYE;
                            const fileIcon = s.fichier_type === 'pdf' ? <FileText size={22} /> : s.fichier_type === 'docx' || s.fichier_type === 'doc' ? <PenLine size={22} /> : <Paperclip size={22} />;
                            return (
                                <motion.div key={s.sujet_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                                    className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                    {/* Top status band */}
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: stCfg.color }} />
                                    
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                                                {fileIcon}
                                            </div>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.titre}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{s.fichier_nom} • {formatFileSize(s.fichier_taille)}</p>
                                            </div>
                                        </div>
                                        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: stCfg.bg, color: stCfg.color, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><stCfg.icon size={12} /> {stCfg.label}</span>
                                    </div>

                                    {/* Info rows */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}><UserCheck size={14} style={{ marginRight: '4px' }} /></span> {s.enseignant_nom}
                                            {s.enseignant_specialite && <span style={{ color: 'var(--text-muted)' }}>({s.enseignant_specialite})</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={14} /> {s.matiere_libelle}</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {s.duree_minutes} min</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> T{s.trimestre}</span>
                                        </div>
                                        {s.date_envoi && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                Envoyé le {new Date(s.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleDownloadSujet(s.sujet_id, s.fichier_nom || `sujet_${s.sujet_id}`)}
                                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#3b82f6', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                            <Download size={13} /> Télécharger
                                        </button>
                                        {s.statut === 'ENVOYE' && (
                                            <>
                                                <button onClick={() => handleValider(s.sujet_id)} style={{
                                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                                    padding: '9px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                                    background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: 'white', border: 'none', cursor: 'pointer'
                                                }}>
                                                    <CheckCircle2 size={13} /> Valider
                                                </button>
                                                <button onClick={() => { setRejectId(s.sujet_id); setRejectRaison(''); }} style={{
                                                    padding: '9px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                                    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer'
                                                }}>
                                                    <XCircle size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </motion.div>

            {/* Reject Modal */}
            <AnimatePresence>
                {rejectId && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setRejectId(null)}>
                        <motion.div initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: 'white' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <XCircle size={18} />
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Rejeter le Sujet</h3>
                                </div>
                            </div>
                            <div style={{ padding: '24px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Raison du rejet</label>
                                <textarea value={rejectRaison} onChange={e => setRejectRaison(e.target.value)} rows={3}
                                    placeholder="Ex: Le format du fichier n'est pas conforme..."
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none', resize: 'vertical' }} />
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setRejectId(null)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleRejeter} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: 'white', border: 'none', cursor: 'pointer'
                                }}><XCircle size={14} /> Rejeter</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
