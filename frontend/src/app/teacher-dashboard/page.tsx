'use client';

import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, BookOpen, ClipboardList, CheckCircle, ChevronRight,
    Loader2, Megaphone, Clock, Play, Eye, Star, MessageCircle,
    Send, Calendar, FileText, Link2, FolderOpen, Wrench, Mail,
    Plus, X, CheckCircle2, AlertCircle, Trash2, Upload, Download, FileUp, AlertTriangle, PenLine, Paperclip
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'];
const JOURS_L: Record<string, string> = { LUNDI: 'Lundi', MARDI: 'Mardi', MERCREDI: 'Mercredi', JEUDI: 'Jeudi', VENDREDI: 'Vendredi' };
const HEURES = [
    { debut: '08:00', fin: '09:00' }, { debut: '09:00', fin: '10:00' },
    { debut: '10:00', fin: '11:00' }, { debut: '11:00', fin: '12:00' },
    { debut: '14:00', fin: '15:00' }, { debut: '15:00', fin: '16:00' },
    { debut: '16:00', fin: '17:00' },
];

interface AdminMessage {
    message_id: number; demande_id: number | null; expediteur_type: string;
    expediteur_nom: string; objet_type: string; sujet: string; contenu: string;
    statut: string; date_envoi: string | null;
}
interface Classe { classe_id: number; libelle: string; }
interface Matiere { matiere_id: number; code: string; libelle: string; }
interface DispoSlot { classe_id: number; jour: string; heure_debut: string; heure_fin: string; }
interface SujetExamen {
    sujet_id: number; demande_id: number | null; enseignant_id: number; matiere_id: number; matiere_libelle: string;
    trimestre: number; titre: string; fichier_nom: string; fichier_type: string;
    fichier_taille: number; duree_minutes: number; statut: string;
    date_depot: string | null; date_envoi: string | null;
}

const OBJET_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
    EMPLOI: { icon: '', color: '#0d9488', bg: '#ccfbf1' },
    DISCIPLINE: { icon: '', color: '#dc2626', bg: '#fee2e2' },
    GENERAL: { icon: '', color: '#3b82f6', bg: '#dbeafe' },
    REUNION: { icon: '', color: '#7c3aed', bg: '#ede9fe' },
    EXAMENS: { icon: '', color: '#f59e0b', bg: '#fef3c7' },
};

// Keep mock data for other sections
const upcomingClasses = [
    { subject: 'Mathématiques', time: '10h30', room: 'Salle 204', color: '#3b82f6' },
    { subject: 'Sciences Physiques', time: '12h00', room: 'Labo 3', color: '#10b981' },
    { subject: 'Histoire-Géographie', time: '14h15', room: 'Salle 112', color: '#f59e0b' },
];

const subjectPerformance = [
    { subject: 'Maths', moyenne: 78, max: 96 },
    { subject: 'Sciences', moyenne: 82, max: 94 },
    { subject: 'Histoire', moyenne: 71, max: 93 },
    { subject: 'Français', moyenne: 75, max: 91 },
    { subject: 'Informatique', moyenne: 85, max: 95 },
];

const topStudents = [
    { name: 'Amadou Diallo', score: 96, subject: 'Mathématiques' },
    { name: 'Fatoumata Camara', score: 94, subject: 'Sciences' },
    { name: 'Ibrahim Bah', score: 93, subject: 'Histoire' },
    { name: 'Aissatou Sow', score: 91, subject: 'Français' },
    { name: 'Mamadou Barry', score: 90, subject: 'Informatique' },
];

export default function TeacherDashboard() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { etablissementId, anneeId } = useApp();
    const { user } = useAuth();
    const enseignantId = user?.id ?? null;
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ nb_eleves: 0, nb_enseignants: 0 });
    const [messages, setMessages] = useState<AdminMessage[]>([]);
    const [classes, setClasses] = useState<Classe[]>([]);
    const [matieres, setMatieres] = useState<Matiere[]>([]);

    // Dispo form
    const [showDispoForm, setShowDispoForm] = useState(false);
    const [activeDemande, setActiveDemande] = useState<AdminMessage | null>(null);
    const [dispoSlots, setDispoSlots] = useState<DispoSlot[]>([]);
    const [dispoClasse, setDispoClasse] = useState<number | null>(null);
    const [dispoJour, setDispoJour] = useState('LUNDI');
    const [dispoHeure, setDispoHeure] = useState('08:00');
    const [submitting, setSubmitting] = useState(false);

    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const showSuccess = (m: string) => { setSuccessMsg(m); setTimeout(() => setSuccessMsg(null), 3500); };
    const showError = (m: string) => { setErrorMsg(m); setTimeout(() => setErrorMsg(null), 4000); };

    // Upload sujet exam
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [activeExamDemande, setActiveExamDemande] = useState<AdminMessage | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadTitre, setUploadTitre] = useState('');
    const [uploadMatiere, setUploadMatiere] = useState<number | null>(null);
    const [uploadDuree, setUploadDuree] = useState(60);
    const [uploadTrimestre, setUploadTrimestre] = useState(1);
    const [uploading, setUploading] = useState(false);

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

    // Mes Sujets
    const [mesSujets, setMesSujets] = useState<SujetExamen[]>([]);
    const [sendingSujetId, setSendingSujetId] = useState<number | null>(null);

    const loadData = useCallback(async () => {
        if (!enseignantId) return;
        try {
            const [dashR, msgR, clR, matR] = await Promise.all([
                api.get(`/api/dashboard?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                api.get(`/api/communication/messages?role=ENSEIGNANT&enseignant_id=${enseignantId}`),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                api.get('/api/matieres').catch(() => ({ data: [] })),
            ]);
            setStats({ nb_eleves: dashR.data.kpi.nb_eleves, nb_enseignants: dashR.data.kpi.nb_enseignants });
            setMessages(msgR.data);
            setClasses(clR.data);
            setMatieres(matR.data);
            if (clR.data.length > 0) setDispoClasse(clR.data[0].classe_id);
            if (matR.data.length > 0) setUploadMatiere(matR.data[0].matiere_id);
            // Load sujets
            const sujR = await api.get(`/api/examens/sujets?enseignant_id=${enseignantId}`);
            setMesSujets(sujR.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [enseignantId, etablissementId, anneeId]);

    useEffect(() => { loadData(); }, [loadData]);

    const openDispoForm = (msg: AdminMessage) => {
        setActiveDemande(msg);
        setDispoSlots([]);
        setShowDispoForm(true);
    };

    const addSlot = () => {
        if (!dispoClasse) return;
        const h = HEURES.find(x => x.debut === dispoHeure);
        if (!h) return;
        // Check duplicate
        const dup = dispoSlots.find(s => s.classe_id === dispoClasse && s.jour === dispoJour && s.heure_debut === dispoHeure);
        if (dup) { showError("Ce créneau est déjà ajouté."); return; }
        setDispoSlots([...dispoSlots, { classe_id: dispoClasse, jour: dispoJour, heure_debut: h.debut, heure_fin: h.fin }]);
    };

    const removeSlot = (idx: number) => {
        setDispoSlots(dispoSlots.filter((_, i) => i !== idx));
    };

    const submitDispos = async () => {
        if (!activeDemande?.demande_id || dispoSlots.length === 0) {
            showError("Ajoutez au moins un créneau de disponibilité.");
            return;
        }
        try {
            setSubmitting(true);
            await api.post('/api/communication/disponibilites', {
                demande_id: activeDemande.demande_id,
                enseignant_id: enseignantId,
                slots: dispoSlots,
            });
            showSuccess(`${dispoSlots.length} créneaux de disponibilité envoyés !`);
            setShowDispoForm(false);
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || "Erreur d'envoi"); }
        finally { setSubmitting(false); }
    };

    // ====== EXAM SUBJECT UPLOAD ======
    const openExamUpload = (msg: AdminMessage) => {
        setActiveExamDemande(msg);
        setUploadFile(null);
        setUploadTitre('');
        setUploadDuree(60);
        setShowUploadForm(true);
    };

    const handleUploadSujet = async () => {
        if (!uploadFile) { showError('Sélectionnez un fichier.'); return; }
        if (!uploadTitre.trim()) { showError('Le titre est requis.'); return; }
        if (!uploadMatiere) { showError('Sélectionnez une matière.'); return; }
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('fichier', uploadFile);
            formData.append('enseignant_id', String(enseignantId));
            formData.append('matiere_id', String(uploadMatiere));
            formData.append('trimestre', String(uploadTrimestre));
            formData.append('titre', uploadTitre);
            formData.append('duree_minutes', String(uploadDuree));
            if (activeExamDemande?.demande_id) formData.append('demande_id', String(activeExamDemande.demande_id));

            await api.post('/api/examens/sujets/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showSuccess('\u2705 Sujet téléversé avec succès ! Vérifiez-le dans "Mes Sujets" avant de l\'envoyer.');
            setShowUploadForm(false);
            loadData();
            // Scroll to Mes Sujets section
            setTimeout(() => {
                document.getElementById('mes-sujets-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 500);
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur lors du téléversement.'); }
        finally { setUploading(false); }
    };

    const handleSendSujet = async (sujetId: number) => {
        setSendingSujetId(sujetId);
        try {
            await api.put(`/api/examens/sujets/${sujetId}/envoyer`);
            showSuccess('\ud83d\udce8 Sujet envoyé à l\'administration avec succès !');
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur d\'envoi.'); }
        finally { setSendingSujetId(null); }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column', gap: '16px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            <p style={{ color: 'var(--text-secondary)' }}>Chargement du tableau de bord enseignant...</p>
        </div>
    );

    const kpis = [
        { label: 'Total Élèves', value: stats.nb_eleves, icon: Users, color: '#3b82f6' },
        { label: "Cours Aujourd'hui", value: '5 Sessions', icon: BookOpen, color: '#10b981' },
        { label: 'Messages', value: messages.length, icon: Mail, color: '#7c3aed' },
        { label: 'Présence', value: '92%', icon: CheckCircle, color: '#6366f1' },
    ];

    const emploiMessages = messages.filter(m => m.objet_type === 'EMPLOI' && m.expediteur_type === 'ADMIN');
    const examMessages = messages.filter(m => m.objet_type === 'EXAMENS' && m.expediteur_type === 'ADMIN');
    const otherMessages = messages.filter(m => !(m.objet_type === 'EMPLOI' && m.expediteur_type === 'ADMIN') && !(m.objet_type === 'EXAMENS' && m.expediteur_type === 'ADMIN'));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link><ChevronRight size={14} /><span>Teacher Dashboard</span>
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

            {/* KPIs */}
            <div className="kpi-grid">
                {kpis.map((kpi, i) => (
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

            {/* ═══════════════ COMMUNICATION SECTION ═══════════════ */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="card" style={{ overflow: 'hidden' }}>
                <div style={{
                    padding: '20px 24px', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)' }}><MessageCircle size={20} /></div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Centre de Communication</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.8 }}>Messages de l&apos;administration et demandes</p>
                        </div>
                    </div>
                    {emploiMessages.length > 0 && (
                        <span style={{ padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                            <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {emploiMessages.length} demande(s) d&apos;emploi
                        </span>
                    )}
                </div>
                <div style={{ padding: '16px 24px', maxHeight: '400px', overflow: 'auto' }}>
                    {messages.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Mail size={36} style={{ opacity: 0.2, margin: '0 auto 10px' }} />
                            <p>Aucun message pour le moment.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {messages.map((m, i) => {
                                const cfg = OBJET_ICONS[m.objet_type] || OBJET_ICONS.GENERAL;
                                const isEmploiDemande = m.objet_type === 'EMPLOI' && m.expediteur_type === 'ADMIN' && m.demande_id;
                                return (
                                    <motion.div key={m.message_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                        style={{
                                            padding: '14px 16px', borderRadius: '12px', border: `1.5px solid ${isEmploiDemande ? cfg.color + '50' : '#e2e8f0'}`,
                                            background: isEmploiDemande ? cfg.bg : 'white',
                                        }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                            <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
                                                <div style={{
                                                    width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                                                    background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                                                }}>{cfg.icon}</div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.sujet}</p>
                                                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        De : {m.expediteur_nom} • {m.date_envoi ? new Date(m.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                    </p>
                                                    {m.contenu && <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{m.contenu}</p>}
                                                </div>
                                            </div>
                                            {isEmploiDemande && (() => {
                                                const nbDispos = mesSujets.length; // will reuse for display
                                                const msgDate = m.date_envoi ? new Date(m.date_envoi) : null;
                                                const deadline = msgDate ? new Date(msgDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
                                                const now = new Date();
                                                const expired = deadline && now > deadline;
                                                const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                                        <button onClick={() => openDispoForm(m)} disabled={!!expired} style={{
                                                            display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '10px',
                                                            fontSize: '12px', fontWeight: 700,
                                                            background: expired ? '#94a3b8' : 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                                            color: 'white', border: 'none', cursor: expired ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: expired ? 0.7 : 1,
                                                        }}>
                                                            <Calendar size={13} /> {expired ? 'Expiré' : 'Répondre Disponibilité'}
                                                        </button>
                                                        {daysLeft !== null && !expired && (
                                                            <span style={{ fontSize: '10px', color: daysLeft <= 2 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                                                                {daysLeft}j restant{daysLeft > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            {m.objet_type === 'EXAMENS' && m.expediteur_type === 'ADMIN' && m.demande_id && (() => {
                                                const nbSujetsDeposes = mesSujets.filter(s => s.demande_id === m.demande_id).length;
                                                const msgDate = m.date_envoi ? new Date(m.date_envoi) : null;
                                                const deadline = msgDate ? new Date(msgDate.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
                                                const now = new Date();
                                                const expired = deadline && now > deadline;
                                                const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                                        <button onClick={() => openExamUpload(m)} disabled={!!expired} style={{
                                                            display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', borderRadius: '10px',
                                                            fontSize: '12px', fontWeight: 700,
                                                            background: expired ? '#94a3b8' : 'linear-gradient(135deg, #d97706, #f59e0b)',
                                                            color: 'white', border: 'none', cursor: expired ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: expired ? 0.7 : 1,
                                                        }}>
                                                            <FileUp size={13} />
                                                            {expired ? 'Expiré' : nbSujetsDeposes > 0 ? `${nbSujetsDeposes} déposé(s) — Ajouter` : 'Déposer un Sujet'}
                                                        </button>
                                                        {daysLeft !== null && !expired && (
                                                            <span style={{ fontSize: '10px', color: daysLeft <= 2 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                                                                {daysLeft}j restant{daysLeft > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>

            {/* ═══════ MODAL: DISPONIBILITÉ FORM ═══════ */}
            <AnimatePresence>
                {showDispoForm && activeDemande && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowDispoForm(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '85vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Calendar size={18} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Soumettre vos Disponibilités</h3>
                                    </div>
                                    <button onClick={() => setShowDispoForm(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                                </div>
                                <p style={{ margin: '6px 0 0', fontSize: '12px', opacity: 0.85 }}>📩 En réponse à : {activeDemande.sujet}</p>
                            </div>

                            {/* Add slot form */}
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
                                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px' }}>Ajouter un créneau de disponibilité :</p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div style={{ flex: '1 1 120px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Classe</label>
                                        <select value={dispoClasse || ''} onChange={e => setDispoClasse(Number(e.target.value))}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '12px', outline: 'none' }}>
                                            {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ flex: '1 1 100px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Jour</label>
                                        <select value={dispoJour} onChange={e => setDispoJour(e.target.value)}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '12px', outline: 'none' }}>
                                            {JOURS.map(j => <option key={j} value={j}>{JOURS_L[j]}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ flex: '1 1 100px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Heure</label>
                                        <select value={dispoHeure} onChange={e => setDispoHeure(e.target.value)}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '12px', outline: 'none' }}>
                                            {HEURES.map(h => <option key={h.debut} value={h.debut}>{h.debut} - {h.fin}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={addSlot} style={{
                                        padding: '8px 14px', borderRadius: '8px', background: '#0f766e', color: 'white',
                                        border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}><Plus size={13} /> Ajouter</button>
                                </div>
                            </div>

                            {/* Slots list */}
                            <div style={{ padding: '16px 24px', overflow: 'auto', flex: 1 }}>
                                {dispoSlots.length === 0 ? (
                                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '20px' }}>
                                        Ajoutez vos créneaux de disponibilité ci-dessus.
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                            {dispoSlots.length} créneau(x) ajouté(s) :
                                        </p>
                                        {dispoSlots.map((s, i) => {
                                            const clsName = classes.find(c => c.classe_id === s.classe_id)?.libelle || '?';
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 12px', borderRadius: '10px', background: '#f0fdfa', border: '1px solid #ccfbf1', fontSize: '12px'
                                                }}>
                                                    <div style={{ display: 'flex', gap: '12px', fontWeight: 600, color: '#0f766e' }}>
                                                        <span><BookOpen size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> {clsName}</span>
                                                        <span>{JOURS_L[s.jour]}</span>
                                                        <span>{s.heure_debut} - {s.heure_fin}</span>
                                                    </div>
                                                    <button onClick={() => removeSlot(i)} style={{
                                                        width: '24px', height: '24px', borderRadius: '6px', background: '#fee2e2',
                                                        color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}><Trash2 size={11} /></button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                <button onClick={() => setShowDispoForm(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={submitDispos} disabled={submitting || dispoSlots.length === 0} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: dispoSlots.length > 0 ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : '#e2e8f0',
                                    color: dispoSlots.length > 0 ? 'white' : '#94a3b8', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer'
                                }}>
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    Envoyer ({dispoSlots.length})
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Row: Performance Chart + Top Students */}
            <div className="grid-60-40">
                <motion.div className="card" initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
                    <div className="card-header"><h5>Performance par Matière</h5></div>
                    <div className="card-body">
                        <div style={{ height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={subjectPerformance} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="subject" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <Bar dataKey="moyenne" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={24} name="Moyenne" />
                                    <Bar dataKey="max" fill="#10b981" radius={[6, 6, 0, 0]} barSize={24} name="Meilleure Note" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </motion.div>

                <motion.div className="card" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
                    <div className="card-header"><h5>Meilleurs Élèves</h5></div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {topStudents.map((s, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: i < topStudents.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${avatarColors[i]}15`, color: avatarColors[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>{i + 1}</div>
                                    <div>
                                        <p style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</p>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.subject}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                                    <Star size={14} fill="#f59e0b" /><span style={{ fontWeight: 700, fontSize: '14px' }}>{s.score}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Row: Upcoming Classes */}
            <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                <div className="card-header"><h5>Cours à Venir</h5></div>
                <div className="card-body" style={{ padding: 0 }}>
                    {upcomingClasses.map((cls, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: i < upcomingClasses.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${cls.color}15`, color: cls.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={22} /></div>
                                <div>
                                    <p style={{ fontWeight: 700, fontSize: '15px' }}>{cls.subject}</p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cls.time} • {cls.room}</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-primary btn-sm"><Play size={14} /> Commencer</button>
                                <button className="btn btn-outline btn-sm"><Eye size={14} /> Détails</button>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* ═══════════════ UPLOAD SUJET MODAL ═══════════════ */}
            <AnimatePresence>
                {showUploadForm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowUploadForm(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '540px', maxHeight: '85vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: 'white', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <FileUp size={18} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Déposer un Sujet d&apos;Examen</h3>
                                    </div>
                                    <button onClick={() => setShowUploadForm(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                                </div>
                                {activeExamDemande && <p style={{ margin: '6px 0 0', fontSize: '12px', opacity: 0.85 }}>📩 En réponse à : {activeExamDemande.sujet}</p>}
                            </div>
                            {/* Form */}
                            <div style={{ padding: '24px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Trimestre */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Trimestre *</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[1, 2, 3].map(t => (
                                            <button key={t} type="button" onClick={() => setUploadTrimestre(t)} style={{
                                                flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                                background: uploadTrimestre === t ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#f8fafc',
                                                color: uploadTrimestre === t ? 'white' : '#64748b',
                                                border: uploadTrimestre === t ? 'none' : '1px solid var(--border-light)',
                                                cursor: 'pointer', transition: 'all 0.2s'
                                            }}>T{t}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Matiere */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Matière *</label>
                                    <select value={uploadMatiere || ''} onChange={e => setUploadMatiere(Number(e.target.value))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                        {matieres.map(m => <option key={m.matiere_id} value={m.matiere_id}>{m.libelle}</option>)}
                                    </select>
                                </div>
                                {/* Titre */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Titre du sujet *</label>
                                    <input value={uploadTitre} onChange={e => setUploadTitre(e.target.value)}
                                        placeholder="Ex: Devoir de Mathématiques — Chapitre 5" style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                </div>
                                {/* Durée */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Durée de l&apos;évaluation *</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[30, 45, 60, 90, 120, 180].map(d => (
                                            <button key={d} type="button" onClick={() => setUploadDuree(d)} style={{
                                                padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                                background: uploadDuree === d ? '#4f46e5' : '#f1f5f9',
                                                color: uploadDuree === d ? 'white' : '#64748b',
                                                border: 'none', cursor: 'pointer'
                                            }}>{d < 60 ? `${d}min` : `${d / 60}h`}{d === 90 ? '30' : ''}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* File Drop Zone */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Fichier du sujet * (PDF, Word)</label>
                                    <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png,.webp" style={{ display: 'none' }}
                                        onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
                                    <div onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            padding: '28px', borderRadius: '14px',
                                            border: uploadFile ? '2px solid #10b981' : '2px dashed #cbd5e1',
                                            background: uploadFile ? '#f0fdf4' : '#f8fafc',
                                            textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                        onMouseOver={e => { if (!uploadFile) e.currentTarget.style.borderColor = '#4f46e5'; }}
                                        onMouseOut={e => { if (!uploadFile) e.currentTarget.style.borderColor = '#cbd5e1'; }}>
                                        {uploadFile ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <FileText size={20} />
                                                </div>
                                                <div style={{ textAlign: 'left' }}>
                                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#166534' }}>{uploadFile.name}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#16a34a' }}>{formatFileSize(uploadFile.size)} • Cliquez pour changer</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <Upload size={28} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Cliquez pour sélectionner un fichier</p>
                                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>PDF, Word, Excel, Image • Max 20 MB</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                <button onClick={() => setShowUploadForm(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleUploadSujet} disabled={uploading || !uploadFile} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: uploadFile ? 'linear-gradient(135deg, #d97706, #f59e0b)' : '#e2e8f0',
                                    color: uploadFile ? 'white' : '#94a3b8', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer'
                                }}>
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    Téléverser
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════════ MES SUJETS D'EXAMEN ═══════════════ */}
            <motion.div id="mes-sujets-section" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                className="card" style={{ overflow: 'hidden' }}>
                <div style={{
                    padding: '20px 24px', background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)' }}><FolderOpen size={20} /></div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Mes Sujets d&apos;Examen</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.85 }}>{mesSujets.length} sujet(s) déposé(s)</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {mesSujets.filter(s => s.statut === 'BROUILLON').length > 0 && (
                            <span style={{ padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.2)' }}>
                                <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> {mesSujets.filter(s => s.statut === 'BROUILLON').length} à envoyer
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ padding: '16px 24px' }}>
                    {mesSujets.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <FolderOpen size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                            <p style={{ fontWeight: 600 }}>Aucun sujet déposé.</p>
                            <p style={{ fontSize: '12px' }}>Répondez à une demande d&apos;examens pour déposer votre premier sujet.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {mesSujets.map((s, i) => {
                                const statusCfg: Record<string, { label: string; color: string; bg: string }> = {
                                    BROUILLON: { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9' },
                                    ENVOYE: { label: 'Envoyé', color: '#0d9488', bg: '#ccfbf1' },
                                    VALIDE: { label: 'Validé', color: '#16a34a', bg: '#dcfce7' },
                                    REJETE: { label: 'Rejeté', color: '#dc2626', bg: '#fee2e2' },
                                };
                                const st = statusCfg[s.statut] || statusCfg.BROUILLON;
                                const fileIcon = s.fichier_type === 'pdf' ? <FileText size={14} /> : s.fichier_type === 'docx' || s.fichier_type === 'doc' ? <PenLine size={14} /> : <Paperclip size={14} />;
                                return (
                                    <motion.div key={s.sujet_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                                        style={{
                                            padding: '16px 18px', borderRadius: '14px', border: '1px solid var(--border-light)',
                                            background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            gap: '14px', transition: 'all 0.2s', position: 'relative'
                                        }}
                                        onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'}
                                        onMouseOut={e => e.currentTarget.style.boxShadow = ''}>
                                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                                                {fileIcon}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.titre}</p>
                                                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {s.matiere_libelle} • T{s.trimestre} • {s.duree_minutes}min • {s.fichier_nom}
                                                </p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: st.bg, color: st.color }}>{st.label}</span>
                                            {s.statut === 'BROUILLON' && (
                                                <button onClick={() => handleSendSujet(s.sujet_id)} disabled={sendingSujetId === s.sujet_id}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '10px',
                                                        fontSize: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                        color: 'white', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap'
                                                    }}>
                                                    {sendingSujetId === s.sujet_id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                    Envoyer
                                                </button>
                                            )}
                                            <button onClick={() => handleDownloadSujet(s.sujet_id, s.fichier_nom || `sujet_${s.sujet_id}`)} style={{ padding: '7px', borderRadius: '8px', border: '1px solid var(--border-light)', display: 'flex', cursor: 'pointer', color: 'var(--text-secondary)', background: 'transparent' }}>
                                                <Download size={14} />
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

