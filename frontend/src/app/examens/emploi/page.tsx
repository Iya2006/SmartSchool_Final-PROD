'use client';

import { useApp } from '@/context/AppContext';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, Loader2, CheckCircle2, AlertCircle, X, Plus, Trash2,
    Calendar, Clock, Users, BookOpen, Send, Eye, Printer, Save,
    Award, Building, UserCheck, ArrowLeft, ClipboardList, School, DoorOpen, User
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Classe { classe_id: number; libelle: string; }
interface Matiere { matiere_id: number; code: string; libelle: string; }
interface Enseignant { enseignant_id: number; nom: string; prenom: string; specialite: string | null; }
interface EmploiExam {
    emploi_examen_id: number; trimestre: number; titre: string;
    date_debut: string; date_fin: string; statut: string; nb_creneaux: number;
}
interface Creneau {
    creneau_examen_id: number; classe_id: number; classe_libelle: string;
    matiere_id: number; matiere_libelle: string; matiere_code: string;
    date_examen: string; heure_debut: string; heure_fin: string;
    salle: string | null; surveillant_type: string;
    surveillant_id: number | null; surveillant_nom: string | null;
}

const HEURES = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

export default function EmploiExamenPage() {
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(true);
    const [emplois, setEmplois] = useState<EmploiExam[]>([]);
    const [classes, setClasses] = useState<Classe[]>([]);
    const [matieres, setMatieres] = useState<Matiere[]>([]);
    const [enseignants, setEnseignants] = useState<Enseignant[]>([]);

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const showSuccess = (m: string) => { setSuccessMsg(m); setTimeout(() => setSuccessMsg(null), 3500); };
    const showError = (m: string) => { setErrorMsg(m); setTimeout(() => setErrorMsg(null), 4000); };

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [newTitre, setNewTitre] = useState('');
    const [newTrimestre, setNewTrimestre] = useState(1);
    const [newDateDebut, setNewDateDebut] = useState('');
    const [newDateFin, setNewDateFin] = useState('');
    const [creating, setCreating] = useState(false);

    // Detail view
    const [selectedEmploi, setSelectedEmploi] = useState<EmploiExam | null>(null);
    const [creneaux, setCreneaux] = useState<Creneau[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // Add creneau
    const [showAddCreneau, setShowAddCreneau] = useState(false);
    const [crClasse, setCrClasse] = useState<number | null>(null);
    const [crMatiere, setCrMatiere] = useState<number | null>(null);
    const [crDate, setCrDate] = useState('');
    const [crHDebut, setCrHDebut] = useState('08:00');
    const [crHFin, setCrHFin] = useState('10:00');
    const [crSalle, setCrSalle] = useState('');
    const [crSurvType, setCrSurvType] = useState('ENSEIGNANT');
    const [crSurvId, setCrSurvId] = useState<number | null>(null);
    const [crSurvNom, setCrSurvNom] = useState('');
    const [addingCreneau, setAddingCreneau] = useState(false);

    const [publishing, setPublishing] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [empR, clR, matR, ensR] = await Promise.all([
                api.get('/api/examens/emploi'),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                api.get('/api/matieres').catch(() => ({ data: [] })),
                api.get(`/api/enseignants?etablissement_id=${etablissementId}`).catch(() => ({ data: [] })),
            ]);
            setEmplois(empR.data);
            setClasses(clR.data);
            setMatieres(matR.data);
            setEnseignants(ensR.data);
            if (clR.data.length > 0) setCrClasse(clR.data[0].classe_id);
            if (matR.data.length > 0) setCrMatiere(matR.data[0].matiere_id);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCreate = async () => {
        if (!newTitre.trim() || !newDateDebut || !newDateFin) { showError('Remplissez tous les champs.'); return; }
        try {
            setCreating(true);
            const res = await api.post('/api/examens/emploi', {
                trimestre: newTrimestre, titre: newTitre, date_debut: newDateDebut, date_fin: newDateFin,
            });
            showSuccess('Emploi des examens créé !');
            setShowCreate(false);
            setNewTitre(''); setNewDateDebut(''); setNewDateFin('');
            loadData();
            // Open detail
            openDetail(res.data.emploi_examen_id);
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
        finally { setCreating(false); }
    };

    const openDetail = async (id: number) => {
        setDetailLoading(true);
        try {
            const res = await api.get(`/api/examens/emploi/${id}`);
            setSelectedEmploi({ emploi_examen_id: res.data.emploi_examen_id, trimestre: res.data.trimestre, titre: res.data.titre, date_debut: res.data.date_debut, date_fin: res.data.date_fin, statut: res.data.statut, nb_creneaux: res.data.creneaux.length });
            setCreneaux(res.data.creneaux);
        } catch (err: any) { showError('Erreur de chargement'); }
        finally { setDetailLoading(false); }
    };

    const handleAddCreneau = async () => {
        if (!selectedEmploi || !crClasse || !crMatiere || !crDate) { showError('Remplissez tous les champs.'); return; }
        try {
            setAddingCreneau(true);
            await api.post(`/api/examens/emploi/${selectedEmploi.emploi_examen_id}/creneaux`, {
                classe_id: crClasse, matiere_id: crMatiere, date_examen: crDate,
                heure_debut: crHDebut, heure_fin: crHFin, salle: crSalle || null,
                surveillant_type: crSurvType,
                surveillant_id: crSurvType === 'ENSEIGNANT' ? crSurvId : null,
                surveillant_nom: crSurvType === 'EXTERNE' ? crSurvNom : null,
            });
            showSuccess('Créneau ajouté');
            setShowAddCreneau(false);
            openDetail(selectedEmploi.emploi_examen_id);
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
        finally { setAddingCreneau(false); }
    };

    const handleDeleteCreneau = async (creneauId: number) => {
        if (!selectedEmploi) return;
        try {
            await api.delete(`/api/examens/emploi/${selectedEmploi.emploi_examen_id}/creneaux/${creneauId}`);
            openDetail(selectedEmploi.emploi_examen_id);
            loadData();
        } catch (err: any) { showError('Erreur'); }
    };

    const handlePublish = async () => {
        if (!selectedEmploi) return;
        try {
            setPublishing(true);
            await api.put(`/api/examens/emploi/${selectedEmploi.emploi_examen_id}/publier`);
            showSuccess('Emploi publié ! Tous les enseignants ont été notifiés.');
            openDetail(selectedEmploi.emploi_examen_id);
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
        finally { setPublishing(false); }
    };

    // Group creneaux by date
    const creneauxByDate: Record<string, Creneau[]> = {};
    creneaux.forEach(c => {
        if (!creneauxByDate[c.date_examen]) creneauxByDate[c.date_examen] = [];
        creneauxByDate[c.date_examen].push(c);
    });

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column', gap: '16px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            <p style={{ color: 'var(--text-secondary)' }}>Chargement...</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #emploi-print, #emploi-print * { visibility: visible !important; }
                    #emploi-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                }
            `}</style>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div className="breadcrumb">
                    <Link href="/">Accueil</Link><ChevronRight size={14} />
                    <Link href="/centre-evaluation">Centre des Examens</Link><ChevronRight size={14} />
                    <span>Emploi des Examens</span>
                </div>
                <Link href="/centre-evaluation" style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                    border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none',
                    fontSize: '13px', fontWeight: 600, background: 'white'
                }}><ArrowLeft size={15} /> Centre des Examens</Link>
            </div>

            {/* Toasts */}
            <AnimatePresence>
                {successMsg && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#f0fdf4', color: '#166534', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #bbf7d0' }}>
                    <CheckCircle2 size={17} /> {successMsg}</motion.div>}
                {errorMsg && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #fecaca' }}>
                    <AlertCircle size={17} /> {errorMsg}</motion.div>}
            </AnimatePresence>

            {/* Hero */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{ padding: '28px 32px', borderRadius: '20px', background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #c4b5fd 100%)', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ padding: '14px', borderRadius: '16px', background: 'rgba(255,255,255,0.2)' }}><Calendar size={28} /></div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Emploi des Examens</h1>
                            <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>Planification des examens : salles, surveillants, horaires</p>
                        </div>
                    </div>
                    <button onClick={() => setShowCreate(true)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', color: 'white',
                        fontSize: '14px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer'
                    }}><Plus size={18} /> Créer un Emploi</button>
                </div>
            </motion.div>

            {/* Two columns: list + detail */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedEmploi ? '320px 1fr' : '1fr', gap: '20px' }}>
                {/* Left: Emplois list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {emplois.length === 0 ? (
                        <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Calendar size={40} style={{ opacity: 0.15, margin: '0 auto 12px' }} /><p style={{ fontWeight: 600 }}>Aucun emploi d&apos;examen.</p>
                            <p style={{ fontSize: '13px' }}>Créez-en un pour planifier vos examens.</p>
                        </div>
                    ) : emplois.map((e, i) => {
                        const isActive = selectedEmploi?.emploi_examen_id === e.emploi_examen_id;
                        return (
                            <motion.div key={e.emploi_examen_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                                onClick={() => openDetail(e.emploi_examen_id)}
                                className="card" style={{
                                    padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s',
                                    border: isActive ? '2px solid #7c3aed' : '1px solid var(--border-light)',
                                    background: isActive ? '#f5f3ff' : 'white',
                                }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{e.titre}</h4>
                                    <span style={{
                                        padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                        background: e.statut === 'PUBLIE' ? '#dcfce7' : '#f1f5f9',
                                        color: e.statut === 'PUBLIE' ? '#16a34a' : '#64748b',
                                    }}>{e.statut === 'PUBLIE' ? 'Publié' : 'Brouillon'}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> T{e.trimestre}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ClipboardList size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {e.nb_creneaux} créneaux</span>
                                    <span>{e.date_debut} → {e.date_fin}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Right: Detail */}
                {selectedEmploi && (
                    <motion.div initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }}
                        id="emploi-print" className="card" style={{ overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{selectedEmploi.titre}</h3>
                                <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.85 }}>T{selectedEmploi.trimestre} • {selectedEmploi.date_debut} → {selectedEmploi.date_fin} • {creneaux.length} créneaux</p>
                            </div>
                            <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
                                {selectedEmploi.statut === 'BROUILLON' && (
                                    <>
                                        <button onClick={() => { setShowAddCreneau(true); if (selectedEmploi) setCrDate(selectedEmploi.date_debut); }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                                            <Plus size={14} /> Créneau
                                        </button>
                                        <button onClick={handlePublish} disabled={publishing || creneaux.length === 0}
                                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, background: creneaux.length > 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.3)', color: creneaux.length > 0 ? '#7c3aed' : 'rgba(255,255,255,0.5)', border: 'none', cursor: creneaux.length > 0 ? 'pointer' : 'not-allowed' }}>
                                            {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publier
                                        </button>
                                    </>
                                )}
                                {selectedEmploi.statut === 'PUBLIE' && (
                                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                                        <Printer size={14} /> Imprimer
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Creneaux by date */}
                        <div style={{ padding: '20px 24px' }}>
                            {detailLoading ? (
                                <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={28} className="animate-spin" color="var(--brand-primary)" /></div>
                            ) : creneaux.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Calendar size={40} style={{ opacity: 0.15, margin: '0 auto 12px' }} />
                                    <p style={{ fontWeight: 600 }}>Aucun créneau planifié.</p>
                                    <p style={{ fontSize: '13px' }}>Cliquez sur &quot;+ Créneau&quot; pour ajouter des examens.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {Object.entries(creneauxByDate).sort().map(([date, slots]) => (
                                        <div key={date}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                                <div style={{ padding: '6px 14px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700, fontSize: '13px' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}</span>
                                                </div>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{slots.length} épreuve(s)</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {slots.map(c => (
                                                    <div key={c.creneau_examen_id} style={{
                                                        display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px',
                                                        borderRadius: '12px', border: '1px solid var(--border-light)', background: '#fafafa',
                                                    }}>
                                                        <div style={{ padding: '8px 14px', borderRadius: '10px', background: '#e0e7ff', color: '#4f46e5', fontWeight: 700, fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                            {c.heure_debut} - {c.heure_fin}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.matiere_libelle}</p>
                                                            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', flexWrap: 'wrap' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><School size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {c.classe_libelle}</span>
                                                                {c.salle && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><DoorOpen size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {c.salle}</span>}
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {c.surveillant_nom || '—'} ({c.surveillant_type === 'EXTERNE' ? 'Ext.' : 'Ens.'})</span>
                                                            </div>
                                                        </div>
                                                        {selectedEmploi.statut === 'BROUILLON' && (
                                                            <button onClick={() => handleDeleteCreneau(c.creneau_examen_id)}
                                                                style={{ padding: '6px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex' }}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* ═══════ CREATE EMPLOI MODAL ═══════ */}
            <AnimatePresence>
                {showCreate && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowCreate(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: 'white' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Calendar size={18} /><h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Créer un Emploi d&apos;Examens</h3></div>
                            </div>
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Trimestre *</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[1, 2, 3].map(t => (
                                            <button key={t} onClick={() => setNewTrimestre(t)} style={{
                                                flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                                background: newTrimestre === t ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : '#f8fafc',
                                                color: newTrimestre === t ? 'white' : '#64748b',
                                                border: newTrimestre === t ? 'none' : '1px solid var(--border-light)', cursor: 'pointer'
                                            }}>T{t}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Titre *</label>
                                    <input value={newTitre} onChange={e => setNewTitre(e.target.value)} placeholder="Ex: Examens du 1er Trimestre 2025-2026"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Date début *</label>
                                        <input type="date" value={newDateDebut} onChange={e => setNewDateDebut(e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Date fin *</label>
                                        <input type="date" value={newDateFin} onChange={e => setNewDateFin(e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleCreate} disabled={creating} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: 'white', border: 'none', cursor: creating ? 'not-allowed' : 'pointer'
                                }}>{creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Créer</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════ ADD CRENEAU MODAL ═══════ */}
            <AnimatePresence>
                {showAddCreneau && selectedEmploi && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowAddCreneau(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '85vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Clock size={18} /><h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Ajouter un Créneau d&apos;Examen</h3></div>
                                    <button onClick={() => setShowAddCreneau(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                                </div>
                            </div>
                            <div style={{ padding: '24px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Classe *</label>
                                        <select value={crClasse || ''} onChange={e => setCrClasse(Number(e.target.value))}
                                            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                            {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Matière *</label>
                                        <select value={crMatiere || ''} onChange={e => setCrMatiere(Number(e.target.value))}
                                            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                            {matieres.map(m => <option key={m.matiere_id} value={m.matiere_id}>{m.libelle}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Date de l&apos;examen *</label>
                                    <input type="date" value={crDate} onChange={e => setCrDate(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Heure début *</label>
                                        <select value={crHDebut} onChange={e => setCrHDebut(e.target.value)}
                                            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                            {HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Heure fin *</label>
                                        <select value={crHFin} onChange={e => setCrHFin(e.target.value)}
                                            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                            {[...HEURES, '17:00', '18:00'].map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Salle</label>
                                    <input value={crSalle} onChange={e => setCrSalle(e.target.value)} placeholder="Ex: Salle A1 / Grand Amphithéâtre"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                </div>
                                {/* Surveillant */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Surveillant</label>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                        <button onClick={() => setCrSurvType('ENSEIGNANT')} style={{
                                            flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                            background: crSurvType === 'ENSEIGNANT' ? '#4f46e5' : '#f1f5f9', color: crSurvType === 'ENSEIGNANT' ? 'white' : '#64748b',
                                            border: 'none', cursor: 'pointer'
                                        }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><UserCheck size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Enseignant</span></button>
                                        <button onClick={() => setCrSurvType('EXTERNE')} style={{
                                            flex: 1, padding: '9px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                            background: crSurvType === 'EXTERNE' ? '#4f46e5' : '#f1f5f9', color: crSurvType === 'EXTERNE' ? 'white' : '#64748b',
                                            border: 'none', cursor: 'pointer'
                                        }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> Externe</span></button>
                                    </div>
                                    {crSurvType === 'ENSEIGNANT' ? (
                                        <select value={crSurvId || ''} onChange={e => setCrSurvId(Number(e.target.value))}
                                            style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                            <option value="">— Sélectionner —</option>
                                            {enseignants.map(e => <option key={e.enseignant_id} value={e.enseignant_id}>{e.prenom} {e.nom} ({e.specialite || '—'})</option>)}
                                        </select>
                                    ) : (
                                        <input value={crSurvNom} onChange={e => setCrSurvNom(e.target.value)} placeholder="Nom complet du surveillant externe"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                    )}
                                </div>
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                <button onClick={() => setShowAddCreneau(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleAddCreneau} disabled={addingCreneau} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', border: 'none', cursor: addingCreneau ? 'not-allowed' : 'pointer'
                                }}>{addingCreneau ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
