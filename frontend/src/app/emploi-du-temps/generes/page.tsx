'use client';

import { useApp } from '@/context/AppContext';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar, ChevronRight, Loader2, Eye, Edit3, X, Clock, Send,
    CheckCircle2, AlertCircle, AlertTriangle, ArrowRight, Zap, BookOpen
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Classe { classe_id: number; libelle: string; code: string; }
interface Creneau {
    creneau_id: number; classe_id: number; matiere_id: number; matiere_libelle: string;
    matiere_code: string; enseignant_id: number | null; enseignant_nom: string;
    jour: string; heure_debut: string; heure_fin: string; salle: string;
}
interface EmploiClasse {
    classe_id: number; classe_libelle: string; creneaux: Creneau[];
    nb_creneaux: number;
}

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'];
const JOURS_L: Record<string, string> = { LUNDI: 'Lundi', MARDI: 'Mardi', MERCREDI: 'Mercredi', JEUDI: 'Jeudi', VENDREDI: 'Vendredi' };
const HEURES = [
    { debut: '08:00', fin: '09:00' }, { debut: '09:00', fin: '10:00' },
    { debut: '10:00', fin: '11:00' }, { debut: '11:00', fin: '12:00' },
    { debut: '14:00', fin: '15:00' }, { debut: '15:00', fin: '16:00' },
    { debut: '16:00', fin: '17:00' },
];
const MATIERE_COLORS: Record<string, string> = {
    FRA: '#3b82f6', MAT: '#10b981', PHY: '#f59e0b', SVT: '#8b5cf6', HGE: '#ef4444',
    ANG: '#ec4899', EPS: '#14b8a6', INF: '#6366f1', PHI: '#a855f7', default: '#64748b'
};

export default function EmploisGeneresPage() {
    const [classes, setClasses] = useState<Classe[]>([]);
    const [emplois, setEmplois] = useState<EmploiClasse[]>([]);
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(true);
    const [selectedEmploi, setSelectedEmploi] = useState<EmploiClasse | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [publishing, setPublishing] = useState<number | null>(null);

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const showSuccess = (m: string) => { setSuccessMsg(m); setTimeout(() => setSuccessMsg(null), 3500); };
    const showError = (m: string) => { setErrorMsg(m); setTimeout(() => setErrorMsg(null), 4000); };

    const loadData = useCallback(async () => {
        try {
            const clR = await api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`);
            setClasses(clR.data);

            const emploiList: EmploiClasse[] = [];
            for (const cls of clR.data) {
                try {
                    const r = await api.get(`/api/emploi-du-temps/classe/${cls.classe_id}`);
                    if (r.data.nb_creneaux > 0) {
                        emploiList.push({
                            classe_id: cls.classe_id,
                            classe_libelle: r.data.classe_libelle || cls.libelle,
                            creneaux: r.data.creneaux || [],
                            nb_creneaux: r.data.nb_creneaux,
                        });
                    }
                } catch { /* no timetable for this class */ }
            }
            setEmplois(emploiList);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openPreview = (e: EmploiClasse) => {
        setSelectedEmploi(e);
        setShowPreview(true);
    };

    const getColor = (code: string) => {
        const c = code?.substring(0, 3).toUpperCase();
        return MATIERE_COLORS[c] || MATIERE_COLORS.default;
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link><ChevronRight size={14} />
                <Link href="/emploi-du-temps">Emploi du Temps</Link><ChevronRight size={14} />
                <span>Emplois Générés</span>
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

            {/* Hero */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 50%, #2dd4bf 100%)', borderRadius: '24px', padding: '28px 32px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-30px', right: '-10px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ padding: '12px', borderRadius: '16px', background: 'rgba(255,255,255,0.2)' }}><Zap size={26} /></div>
                        <div>
                            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Emplois du Temps Générés</h1>
                            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '14px' }}>{emplois.length} classes avec emploi du temps • Vérifiez avant de publier</p>
                        </div>
                    </div>
                    <Link href="/emploi-du-temps" style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '12px',
                        fontSize: '13px', fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none'
                    }}><Calendar size={16} /> Gestion Complète</Link>
                </div>
            </motion.div>

            {/* Warning Banner */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '14px', fontSize: '13px', color: '#92400e' }}>
                <AlertTriangle size={18} /><span><strong>⚠️ Rappel :</strong> Veuillez bien vérifier chaque emploi du temps avant de le rendre définitif. Les modifications sont possibles via la page de gestion complète.</span>
            </motion.div>

            {/* Liste des emplois */}
            {emplois.length === 0 ? (
                <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Calendar size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                    <p style={{ fontSize: '16px', fontWeight: 600 }}>Aucun emploi du temps généré.</p>
                    <p style={{ fontSize: '13px' }}>Utilisez le système de communication pour collecter les disponibilités et générer automatiquement les emplois.</p>
                    <Link href="/communication" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', textDecoration: 'none', marginTop: '14px' }}>
                        <Zap size={14} /> Aller à Communication
                    </Link>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {emplois.map((e, i) => {
                        const joursUtilises = [...new Set(e.creneaux.map(c => c.jour))];
                        return (
                            <motion.div key={e.classe_id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                                className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseOver={(ev) => { ev.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)'; ev.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseOut={(ev) => { ev.currentTarget.style.boxShadow = ''; ev.currentTarget.style.transform = ''; }}
                            >
                                {/* Top colored stripe */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #0f766e, #14b8a6, #2dd4bf)' }}></div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>📚 {e.classe_libelle}</h3>
                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{e.nb_creneaux} créneaux • {joursUtilises.length} jours</p>
                                    </div>
                                    <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>✅ Généré</span>
                                </div>

                                {/* Mini timetable preview */}
                                <div style={{ display: 'flex', gap: '3px', marginBottom: '16px', height: '40px' }}>
                                    {JOURS.map(j => {
                                        const dayCount = e.creneaux.filter(c => c.jour === j).length;
                                        return (
                                            <div key={j} style={{
                                                flex: 1, borderRadius: '6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                background: dayCount > 0 ? '#f0fdfa' : '#f8fafc', border: `1px solid ${dayCount > 0 ? '#99f6e4' : '#e2e8f0'}`, fontSize: '10px'
                                            }}>
                                                <span style={{ fontWeight: 700, color: dayCount > 0 ? '#0f766e' : '#94a3b8' }}>{j.slice(0, 3)}</span>
                                                <span style={{ fontWeight: 800, color: '#0f766e', fontSize: '11px' }}>{dayCount || '—'}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Hover-visible actions bar */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => openPreview(e)} style={{
                                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                        padding: '9px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                        background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', cursor: 'pointer'
                                    }}><Eye size={13} /> Voir l&apos;emploi</button>
                                    <Link href={`/emploi-du-temps?classe=${e.classe_id}`} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                        padding: '9px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                        background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer', textDecoration: 'none'
                                    }}><Edit3 size={13} /> Modifier</Link>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* ═══════ MODAL: PREVIEW EMPLOI ═══════ */}
            <AnimatePresence>
                {showPreview && selectedEmploi && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowPreview(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '900px', maxHeight: '90vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>📚 {selectedEmploi.classe_libelle}</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.85 }}>{selectedEmploi.nb_creneaux} créneaux • Veuillez vérifier avant de publier</p>
                                </div>
                                <button onClick={() => setShowPreview(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                            </div>

                            {/* Timetable Grid */}
                            <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px', fontSize: '12px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding: '10px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'left', width: '80px' }}>Heure</th>
                                            {JOURS.map(j => (
                                                <th key={j} style={{ padding: '10px', fontWeight: 700, color: '#0f766e', textAlign: 'center', background: '#f0fdfa', borderRadius: '8px' }}>{JOURS_L[j]}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {HEURES.map(h => {
                                            const isPause = h.debut === '14:00';
                                            return (
                                                <React.Fragment key={h.debut}>
                                                    {isPause && (
                                                        <tr><td colSpan={6} style={{ padding: '6px', textAlign: 'center', fontSize: '11px', color: '#f59e0b', fontWeight: 700, background: '#fffbeb', borderRadius: '6px' }}>🕐 Pause déjeuner — 12h00 - 14h00</td></tr>
                                                    )}
                                                    <tr>
                                                        <td style={{ padding: '8px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h.debut}-{h.fin}</td>
                                                        {JOURS.map(j => {
                                                            const slot = selectedEmploi.creneaux.find(c => c.jour === j && c.heure_debut === h.debut);
                                                            if (!slot) return <td key={j} style={{ padding: '8px', background: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#cbd5e1' }}>—</td>;
                                                            const color = getColor(slot.matiere_code);
                                                            return (
                                                                <td key={j} style={{ padding: '8px', background: color + '10', borderRadius: '8px', borderLeft: `3px solid ${color}`, textAlign: 'center' }}>
                                                                    <p style={{ margin: 0, fontWeight: 700, fontSize: '11px', color }}>{slot.matiere_code}</p>
                                                                    <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>{slot.matiere_libelle}</p>
                                                                    {slot.enseignant_nom && <p style={{ margin: '1px 0 0', fontSize: '9px', color: 'var(--text-muted)' }}>👤 {slot.enseignant_nom}</p>}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                <Link href={`/emploi-du-temps?classe=${selectedEmploi.classe_id}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 18px', borderRadius: '10px',
                                    fontSize: '12px', fontWeight: 700, background: 'white', color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-light)', textDecoration: 'none', cursor: 'pointer'
                                }}><Edit3 size={13} /> Modifier cet emploi</Link>
                                <button onClick={() => { showSuccess(`✅ Emploi de ${selectedEmploi.classe_libelle} validé !`); setShowPreview(false); }} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px',
                                    fontSize: '13px', fontWeight: 700, background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                    color: 'white', border: 'none', cursor: 'pointer'
                                }}><CheckCircle2 size={14} /> Valider et Publier</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
