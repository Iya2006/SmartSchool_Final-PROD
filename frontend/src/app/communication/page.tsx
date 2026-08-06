'use client';

import { useApp } from '@/context/AppContext';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle, ChevronRight, Loader2, Plus, Send, Eye, X, Calendar,
    CheckCircle2, AlertCircle, Users, Clock, BookOpen, Wand2, Check, XCircle,
    Mail, MailOpen, Filter, ArrowRight, Zap, FileText, Shield, Award, Download,
    UserPlus, Search, Phone, Inbox, TrendingUp, BarChart3, Radio, Megaphone,
    Handshake, ClipboardCheck, Wallet, ScrollText, Sparkles, Bell, Lock, User, Smartphone, School, Edit3, AlertTriangle, GraduationCap
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface MessageItem {
    message_id: number; demande_id: number | null;
    expediteur_type: string; expediteur_id: number | null; expediteur_nom: string;
    destinataire_type: string; objet_type: string; sujet: string; contenu: string;
    statut: string; date_envoi: string | null;
}
interface DemandeItem {
    demande_id: number; titre: string; description: string; objet_type: string;
    classes_concernees: string; statut: string; date_creation: string | null;
    nb_disponibilites: number; nb_validees: number; nb_enseignants_repondu: number;
}
interface Classe { classe_id: number; libelle: string; code: string; }
interface ParentItem {
    parent_id: number; nom: string; prenom: string; telephone: string; email: string; profession: string;
    nb_enfants: number; enfants: { eleve_id: number; nom: string; prenom: string; matricule: string; classe: string; classe_id: number | null; lien_parente: string }[];
}
interface ParentMsgItem {
    message_id: number; expediteur_type: string; expediteur_id: number | null; expediteur_nom: string;
    destinataire_type: string; destinataire_id: number | null; destinataire_nom: string;
    objet_type: string; sujet: string; contenu: string; statut: string; date_envoi: string | null;
}
interface DispoSlot {
    disponibilite_id: number; classe_id: number; classe_libelle: string;
    jour: string; heure_debut: string; heure_fin: string; statut: string; commentaire_admin: string | null;
}
interface EnseignantDispos {
    enseignant_id: number; nom: string; prenom: string; specialite: string | null;
    slots: DispoSlot[]; nb_validees: number; nb_rejetees: number;
}
interface SujetItem {
    sujet_id: number; matiere_libelle: string; matiere_code: string;
    titre: string; fichier_nom: string; fichier_taille: number;
    duree_minutes: number; statut: string; date_envoi: string | null;
}
interface EnseignantSujets {
    enseignant_id: number; nom: string; prenom: string; specialite: string | null;
    sujets: SujetItem[]; nb_valides: number; nb_envoyes: number; nb_rejetes: number;
}

const OBJET_ICONS: Record<string, React.ReactNode> = {
    EMPLOI: <Calendar size={16} />,
    DISCIPLINE: <Shield size={16} />,
    GENERAL: <Megaphone size={16} />,
    REUNION: <Handshake size={16} />,
    EXAMENS: <ClipboardCheck size={16} />,
    PAIEMENT: <Wallet size={16} />,
    BULLETIN: <ScrollText size={16} />,
};
const OBJET_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; lucide: React.ReactNode }> = {
    EMPLOI: { label: 'Emploi du Temps', icon: '', color: '#0d9488', bg: '#ccfbf1', lucide: <Calendar size={16} /> },
    DISCIPLINE: { label: 'Discipline', icon: '', color: '#dc2626', bg: '#fee2e2', lucide: <Shield size={16} /> },
    GENERAL: { label: 'Général', icon: '', color: '#3b82f6', bg: '#dbeafe', lucide: <Megaphone size={16} /> },
    REUNION: { label: 'Réunion', icon: '', color: '#7c3aed', bg: '#ede9fe', lucide: <Handshake size={16} /> },
    EXAMENS: { label: 'Examens', icon: '', color: '#f59e0b', bg: '#fef3c7', lucide: <ClipboardCheck size={16} /> },
    PAIEMENT: { label: 'Paiement', icon: '', color: '#059669', bg: '#d1fae5', lucide: <Wallet size={16} /> },
    BULLETIN: { label: 'Bulletin', icon: '', color: '#ea580c', bg: '#fff7ed', lucide: <ScrollText size={16} /> },
};
const JOURS_L: Record<string, string> = { LUNDI: 'Lun', MARDI: 'Mar', MERCREDI: 'Mer', JEUDI: 'Jeu', VENDREDI: 'Ven' };

function CommunicationAdminPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [tab, setTab] = useState<'messages' | 'demandes' | 'parents'>('demandes');
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [demandes, setDemandes] = useState<DemandeItem[]>([]);
    const [classes, setClasses] = useState<Classe[]>([]);
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(true);
    const [filterObjet, setFilterObjet] = useState<string>('');

    // Create demande modal
    const [showNewDemande, setShowNewDemande] = useState(false);
    const [newTitre, setNewTitre] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newObjet, setNewObjet] = useState('EMPLOI');
    const [newClasses, setNewClasses] = useState<string>('TOUTES');
    const [newTrimestre, setNewTrimestre] = useState(1);
    const [sending, setSending] = useState(false);

    // Detail demande modal
    const [showDetail, setShowDetail] = useState(false);
    const [detailDemande, setDetailDemande] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [confirmGenerate, setConfirmGenerate] = useState<number | null>(null);

    // Parent messaging state
    const [parentsList, setParentsList] = useState<ParentItem[]>([]);
    const [enseignantsList, setEnseignantsList] = useState<any[]>([]);
    const [elevesList, setElevesList] = useState<any[]>([]);
    const [parentMessages, setParentMessages] = useState<ParentMsgItem[]>([]);
    const [parentMsgLoading, setParentMsgLoading] = useState(false);
    const [showNewParentMsg, setShowNewParentMsg] = useState(false);
    const [pmDestType, setPmDestType] = useState<'TOUS_PARENTS'|'CLASSE_PARENTS'|'PARENT'|'TOUS_ENSEIGNANTS'|'CLASSE_ENSEIGNANTS'|'ENSEIGNANT'|'TOUS_ELEVES'|'CLASSE_ELEVES'|'ELEVE'>('TOUS_PARENTS');
    const [pmDestId, setPmDestId] = useState<number|null>(null);
    const [pmObjet, setPmObjet] = useState('GENERAL');
    const [pmSujet, setPmSujet] = useState('');
    const [pmContenu, setPmContenu] = useState('');
    const [pmSending, setPmSending] = useState(false);
    const [pmSearch, setPmSearch] = useState('');
    const [selectedParentFilter, setSelectedParentFilter] = useState<ParentItem|null>(null);

    // Messages
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

    const loadAll = useCallback(async () => {
        try {
            const [msgR, demR, clR, parR, ensR, elvR] = await Promise.all([
                api.get('/api/communication/messages?role=ADMIN'),
                api.get('/api/communication/demandes'),
                api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                api.get('/api/communication/parents-list'),
                api.get(`/api/enseignants?etablissement_id=${etablissementId}`),
                api.get(`/api/eleves?etablissement_id=${etablissementId}&annee_id=${anneeId}&limit=500`),
            ]);
            setMessages(msgR.data);
            setDemandes(demR.data);
            setClasses(clR.data);
            setParentsList(parR.data);
            setEnseignantsList(ensR.data);
            setElevesList(elvR.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [etablissementId, anneeId]);

    const loadParentMessages = useCallback(async () => {
        setParentMsgLoading(true);
        try {
            const res = await api.get('/api/communication/messages-parents');
            setParentMessages(res.data);
        } catch { setParentMessages([]); }
        finally { setParentMsgLoading(false); }
    }, []);

    useEffect(() => { if (tab === 'parents') loadParentMessages(); }, [tab, loadParentMessages]);

    const handleSendParentMsg = async () => {
        if (!pmSujet.trim()) { showError('Le sujet est requis'); return; }
        setPmSending(true);
        try {
            // /messages-parents n'accepte QUE les destinataires PARENT/TOUS_PARENTS/
            // CLASSE_PARENTS (rejette tout le reste avec "destinataire_type invalide")
            // — pourtant ce même modal sert aussi à écrire à un enseignant ou un élève
            // (pré-rempli depuis leur fiche profil). On route donc vers l'endpoint
            // générique /messages pour tout destinataire non-parent.
            const estParent = pmDestType === 'PARENT' || pmDestType === 'TOUS_PARENTS' || pmDestType === 'CLASSE_PARENTS';
            if (estParent) {
                await api.post('/api/communication/messages-parents', {
                    destinataire_type: pmDestType,
                    destinataire_id: pmDestId,
                    objet_type: pmObjet,
                    sujet: pmSujet,
                    contenu: pmContenu,
                });
            } else {
                await api.post('/api/communication/messages', {
                    expediteur_type: 'ADMIN',
                    destinataire_type: pmDestType,
                    destinataire_id: pmDestId,
                    objet_type: pmObjet,
                    sujet: pmSujet,
                    contenu: pmContenu,
                });
            }
            showSuccess('Message envoyé avec succès !');
            setShowNewParentMsg(false);
            setPmSujet(''); setPmContenu('');
            if (estParent) loadParentMessages();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
        finally { setPmSending(false); }
    };

    useEffect(() => { loadAll(); }, [loadAll]);

    // Read query params for pre-filled messaging from admin dossiers
    useEffect(() => {
        const qTab = searchParams.get('tab');
        const qDestType = searchParams.get('dest_type');
        const qDestId = searchParams.get('dest_id');
        if (qTab === 'parents') {
            setTab('parents');
        } else if (qTab === 'messages') {
            setTab('messages');
        }
        // If dest_type and dest_id are provided, pre-fill the message modal
        if (qDestType && qDestId) {
            setPmDestType(qDestType as any);
            setPmDestId(Number(qDestId));
            setShowNewParentMsg(true);
        }
    }, [searchParams]);

    const handleCreateDemande = async () => {
        if (!newTitre.trim()) { showError("Le titre est requis."); return; }
        try {
            setSending(true);
            await api.post('/api/communication/demandes', {
                titre: newTitre, description: newDesc, objet_type: newObjet,
                classes_concernees: newClasses,
                ...(newObjet === 'EXAMENS' ? { trimestre: newTrimestre } : {}),
            });
            showSuccess("Demande envoyée à tous les enseignants !");
            setShowNewDemande(false);
            setNewTitre(''); setNewDesc('');
            loadAll();
        } catch (err: any) { showError(err.response?.data?.detail || "Erreur"); }
        finally { setSending(false); }
    };

    const openDetail = async (demandeId: number) => {
        setDetailLoading(true); setShowDetail(true);
        try {
            const res = await api.get(`/api/communication/demandes/${demandeId}`);
            setDetailDemande(res.data);
        } catch (err) { console.error(err); }
        finally { setDetailLoading(false); }
    };

    const handleValidateSlot = async (dispoId: number) => {
        try {
            await api.put(`/api/communication/disponibilites/${dispoId}/valider`);
            showSuccess("Créneau validé");
            if (detailDemande) openDetail(detailDemande.demande_id);
        } catch (err: any) { showError(err.response?.data?.detail || "Conflit détecté"); }
    };

    const handleRejectSlot = async (dispoId: number) => {
        const raison = prompt("Raison du rejet :");
        if (raison === null) return;
        try {
            await api.put(`/api/communication/disponibilites/${dispoId}/rejeter`, { raison });
            showSuccess("Créneau rejeté, enseignant notifié.");
            if (detailDemande) openDetail(detailDemande.demande_id);
        } catch (err: any) { showError(err.response?.data?.detail || "Erreur"); }
    };

    const handleValidateAll = async (demandeId: number) => {
        try {
            const res = await api.put(`/api/communication/disponibilites/valider-tout/${demandeId}`);
            showSuccess(`${res.data.validated} validées, ${res.data.conflicts} conflits`);
            openDetail(demandeId);
            loadAll();
        } catch (err: any) { showError(err.response?.data?.detail || "Erreur"); }
    };

    const handleGenerateEmplois = async (demandeId: number) => {
        // First click: show confirmation
        if (confirmGenerate !== demandeId) {
            setConfirmGenerate(demandeId);
            return;
        }
        // Second click: actually generate
        setConfirmGenerate(null);
        setGenerating(true);
        try {
            const res = await api.post(`/api/communication/demandes/${demandeId}/generer-emplois`);
            showSuccess(`${res.data.total_created} créneaux générés pour ${res.data.classes.length} classes ! Redirection...`);
            setShowDetail(false);
            setGenerating(false);
            loadAll();
            setTimeout(() => router.push('/emploi-du-temps/generes'), 1200);
        } catch (err: any) {
            showError(err.response?.data?.detail || "Erreur lors de la génération");
            setGenerating(false);
        }
    };

    const filteredMsgs = filterObjet ? messages.filter(m => m.objet_type === filterObjet) : messages;

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link><ChevronRight size={14} /><span>Communication</span>
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
                style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 40%, #6366f1 70%, #818cf8 100%)', borderRadius: '24px', padding: '32px 36px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-60px', right: '-30px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ position: 'absolute', bottom: '-40px', left: '30%', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
                <div style={{ position: 'absolute', top: '20px', right: '120px', width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                <div style={{ position: 'absolute', bottom: '30px', right: '60px', width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <MessageCircle size={28} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Communication</h1>
                            <p style={{ margin: '6px 0 0', opacity: 0.75, fontSize: '14px', fontWeight: 500 }}>Centre de messagerie, demandes et coordination</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setShowNewParentMsg(true)} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '14px',
                            fontSize: '13px', fontWeight: 700, background: 'rgba(255,255,255,0.25)', color: 'white',
                            border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer', backdropFilter: 'blur(8px)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        ><Send size={15} /> Nouveau Message</button>
                        <button onClick={() => setShowNewDemande(true)} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '14px',
                            fontSize: '13px', fontWeight: 700, background: 'rgba(255,255,255,0.15)', color: 'white',
                            border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', backdropFilter: 'blur(8px)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                        ><Sparkles size={15} /> Nouvelle Demande</button>
                    </div>
                </div>
            </motion.div>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                {[
                    { label: 'Demandes', value: demandes.length, icon: <FileText size={22} />, color: '#6366f1', gradient: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' },
                    { label: 'Messages', value: messages.length, icon: <Mail size={22} />, color: '#0d9488', gradient: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)' },
                    { label: 'Non lus', value: messages.filter(m => m.statut === 'ENVOYE' && m.expediteur_type !== 'ADMIN').length, icon: <Bell size={22} />, color: '#f59e0b', gradient: 'linear-gradient(135deg, #fffbeb, #fef3c7)' },
                    { label: 'Emplois Générés', value: demandes.filter(d => d.statut === 'EMPLOIS_GENERES').length, icon: <Zap size={22} />, color: '#10b981', gradient: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' },
                ].map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        style={{
                            background: 'white', borderRadius: '18px', padding: '22px 24px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
                            border: '1px solid #f1f5f9', transition: 'all 0.2s', cursor: 'default',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
                                <p style={{ margin: '8px 0 0', fontSize: '28px', fontWeight: 800, color: '#1e293b', letterSpacing: '-1px' }}>{s.value}</p>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: s.gradient, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: 'white', borderRadius: '16px', padding: '5px', width: 'fit-content', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                {[
                    { key: 'demandes' as const, label: 'Demandes & Disponibilités', icon: <Radio size={15} /> },
                    { key: 'messages' as const, label: `Messages (${messages.length})`, icon: <Inbox size={15} /> },
                    { key: 'parents' as const, label: 'Messages Parents', icon: <Users size={15} /> },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 22px', borderRadius: '12px',
                        fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: tab === t.key ? 'linear-gradient(135deg, #6366f1, #818cf8)' : 'transparent',
                        color: tab === t.key ? 'white' : '#64748b',
                        boxShadow: tab === t.key ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                        transition: 'all 0.2s',
                    }}>{t.icon} {t.label}</button>
                ))}
            </div>

            {/* ═══════════════ TAB: DEMANDES ═══════════════ */}
            {tab === 'demandes' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {demandes.length === 0 ? (
                        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Calendar size={44} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                            <p style={{ fontWeight: 600 }}>Aucune demande créée.</p>
                            <p style={{ fontSize: '13px' }}>Créez une demande pour collecter les disponibilités des enseignants.</p>
                        </div>
                    ) : demandes.map((d, i) => {
                        const cfg = OBJET_CONFIG[d.objet_type] || OBJET_CONFIG.GENERAL;
                        const stColor = d.statut === 'EN_COURS' ? '#f59e0b' : d.statut === 'EMPLOIS_GENERES' ? '#10b981' : d.statut === 'CLOTUREE' ? '#64748b' : '#3b82f6';
                        return (
                            <motion.div key={d.demande_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                className="card" style={{ padding: '20px', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                                onClick={() => openDetail(d.demande_id)}
                                onMouseOver={(e) => e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'}
                                onMouseOut={(e) => e.currentTarget.style.boxShadow = ''}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: 1 }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                                            {cfg.lucide}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.titre}</h4>
                                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>{d.description || '—'}</p>
                                            <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} /> {d.date_creation ? new Date(d.date_creation).toLocaleDateString('fr-FR') : '—'}</span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={11} /> {d.nb_enseignants_repondu} réponse(s)</span>
                                                {d.objet_type === 'EXAMENS' ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={11} /> {d.nb_disponibilites} sujet(s) déposé(s) ({d.nb_validees} validé(s))</span>
                                                ) : (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BarChart3 size={11} /> {d.nb_disponibilites} créneaux ({d.nb_validees} validés)</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: stColor + '15', color: stColor }}>
                                            {d.statut.replace(/_/g, ' ')}
                                        </span>
                                        <ArrowRight size={16} color="var(--text-muted)" />
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {/* ═══════════════ TAB: MESSAGES ═══════════════ */}
            {tab === 'messages' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Filter */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button onClick={() => setFilterObjet('')} style={{
                            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                            background: !filterObjet ? '#4f46e5' : '#f1f5f9', color: !filterObjet ? 'white' : '#64748b',
                            border: 'none', cursor: 'pointer'
                        }}>Tous</button>
                        {Object.entries(OBJET_CONFIG).map(([k, v]) => (
                            <button key={k} onClick={() => setFilterObjet(k)} style={{
                                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                background: filterObjet === k ? v.color : '#f1f5f9', color: filterObjet === k ? 'white' : '#64748b',
                                border: 'none', cursor: 'pointer'
                            }}>{v.lucide} <span style={{marginLeft:'2px'}}>{v.label}</span></button>
                        ))}
                    </div>
                    {filteredMsgs.length === 0 ? (
                        <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Mail size={40} style={{ opacity: 0.2, margin: '0 auto 12px' }} /><p>Aucun message.</p>
                        </div>
                    ) : filteredMsgs.map((m, i) => {
                        const cfg = OBJET_CONFIG[m.objet_type] || OBJET_CONFIG.GENERAL;
                        const isAdmin = m.expediteur_type === 'ADMIN';
                        return (
                            <motion.div key={m.message_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                                className="card" style={{ padding: '16px 20px', borderLeft: `4px solid ${cfg.color}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '10px',
                                            background: isAdmin ? '#e0e7ff' : '#ccfbf1',
                                            color: isAdmin ? '#4f46e5' : '#0d9488',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px'
                                        }}>
                                            {isAdmin ? <Shield size={16} /> : m.expediteur_nom.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.sujet}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {isAdmin ? <><Lock size={14} style={{display:'inline', verticalAlign:'middle'}}/> Admin</> : <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> {m.expediteur_nom}</>} • {m.date_envoi ? new Date(m.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', gap: '4px' }}>{cfg.lucide} {cfg.label}</span>
                                </div>
                                {m.contenu && (() => {
                                    const parts = m.contenu.split('---PHOTO_META---');
                                    const textContent = parts[0].trim();
                                    const hasMeta = parts.length > 1;
                                    const meta: any = {};
                                    if (hasMeta) {
                                        parts[1].trim().split('\n').forEach((ligne: string) => {
                                            const [k, v] = ligne.split('=');
                                            if (k && v) meta[k.trim()] = v.trim();
                                        });
                                    }
                                    return (
                                        <div style={{ margin: '10px 0 0 48px' }}>
                                            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                                {textContent}
                                            </p>
                                            {hasMeta && meta['entity_id'] && (
                                                <button onClick={() => window.location.href=`/galerie?search=${encodeURIComponent(meta['target_name'] || '')}&tab=${meta['entity_type'] === 'parent' ? 'parents' : (meta['entity_type'] === 'enseignant' ? 'enseignants' : 'eleves')}&highlight=${meta['entity_id']}`}
                                                    style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: '#e0e7ff', color: '#4f46e5', border: 'none', cursor: 'pointer' }}>
                                                    <Eye size={14} /> Voir dans la Galerie
                                                </button>
                                            )}
                                        </div>
                                    )
                                })()}
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {/* ═══════════════ TAB: MESSAGES PARENTS ═══════════════ */}
            {tab === 'parents' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Action bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input value={pmSearch} onChange={e => setPmSearch(e.target.value)} placeholder="Rechercher un parent..."
                                    style={{ padding: '8px 12px 8px 32px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '12px', outline: 'none', width: '260px' }} />
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{parentsList.length} parent(s)</span>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{parentMessages.length} message(s)</span>
                    </div>

                    {/* Two columns: Parents list + Messages */}
                    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '16px', alignItems: 'start' }}>
                        {/* Parents list */}
                        <div className="card" style={{ maxHeight: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-light)' }}>
                                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16} color="#059669" /> Répertoire Parents</h4>
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
                                {parentsList.filter(p => `${p.prenom} ${p.nom} ${p.telephone}`.toLowerCase().includes(pmSearch.toLowerCase())).map(p => (
                                    <div key={p.parent_id} style={{
                                        padding: '12px', borderRadius: '12px', marginBottom: '6px', border: '1px solid var(--border-light)',
                                        cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.background = '#f0fdf4'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = ''; }}
                                    onClick={() => { setSelectedParentFilter(p); }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #059669, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>
                                                {p.prenom[0]}{p.nom[0]}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.prenom} {p.nom}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={10} /> {p.telephone} • {p.nb_enfants} enfant(s)</p>
                                            </div>
                                        </div>
                                        {p.enfants.length > 0 && (
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px', paddingLeft: '46px' }}>
                                                {p.enfants.map(e => (
                                                    <span key={e.eleve_id} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: '#e0f2fe', color: '#0369a1' }}>
                                                        {e.prenom} {e.nom} — {e.classe} ({e.lien_parente})
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Messages history — filtered by selected parent */}
                        <div className="card" style={{ maxHeight: '600px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                                        {selectedParentFilter ? `📨 Messages — ${selectedParentFilter.prenom} ${selectedParentFilter.nom}` : '📨 Historique des Messages'}
                                    </h4>
                                    {selectedParentFilter && (
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            <Smartphone size={14} style={{display:'inline', verticalAlign:'middle'}}/> {selectedParentFilter.telephone} • {selectedParentFilter.nb_enfants} enfant(s)
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    {selectedParentFilter && (
                                        <>
                                            <button onClick={() => { setPmDestType('PARENT'); setPmDestId(selectedParentFilter.parent_id); setShowNewParentMsg(true); setPmSujet(''); setPmContenu(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: '#059669', color: 'white', border: 'none', cursor: 'pointer' }}>
                                                <Send size={12} /> Écrire
                                            </button>
                                            <button onClick={() => setSelectedParentFilter(null)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}>
                                                <X size={12} /> Tous
                                            </button>
                                        </>
                                    )}
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {(() => {
                                            const filtered = selectedParentFilter
                                                ? parentMessages.filter(m =>
                                                    (m.destinataire_type === 'PARENT' && m.destinataire_id === selectedParentFilter.parent_id) ||
                                                    (m.expediteur_type === 'PARENT' && m.expediteur_id === selectedParentFilter.parent_id)
                                                )
                                                : parentMessages;
                                            return `${filtered.length} message(s)`;
                                        })()}
                                    </span>
                                </div>
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
                                {parentMsgLoading ? (
                                    <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={28} className="animate-spin" color="#059669" /></div>
                                ) : (() => {
                                    const filtered = selectedParentFilter
                                        ? parentMessages.filter(m =>
                                            (m.destinataire_type === 'PARENT' && m.destinataire_id === selectedParentFilter.parent_id) ||
                                            (m.expediteur_type === 'PARENT' && m.expediteur_id === selectedParentFilter.parent_id)
                                        )
                                        : parentMessages;
                                    return filtered.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <Mail size={32} style={{ opacity: 0.15, marginBottom: '8px' }} />
                                            <p style={{ fontSize: '13px' }}>{selectedParentFilter ? `Aucun message échangé avec ${selectedParentFilter.prenom} ${selectedParentFilter.nom}.` : 'Aucun message avec les parents.'}</p>
                                            {selectedParentFilter && (
                                                <button onClick={() => { setPmDestType('PARENT'); setPmDestId(selectedParentFilter.parent_id); setShowNewParentMsg(true); setPmSujet(''); setPmContenu(''); }}
                                                    style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, background: '#059669', color: 'white', border: 'none', cursor: 'pointer' }}>
                                                    <Send size={14} /> Envoyer le premier message
                                                </button>
                                            )}
                                        </div>
                                    ) : filtered.map((m) => {
                                        const cfg = OBJET_CONFIG[m.objet_type] || OBJET_CONFIG.GENERAL;
                                        const isFromParent = m.expediteur_type === 'PARENT';
                                        return (
                                            <div key={m.message_id} style={{
                                                padding: '12px 14px', borderRadius: '12px', marginBottom: '6px',
                                                border: '1px solid var(--border-light)', borderLeft: `4px solid ${isFromParent ? '#0d9488' : cfg.color}`,
                                                background: isFromParent ? '#f0fdfa' : 'white'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.sujet}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>
                                                            {isFromParent ? <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> {m.expediteur_nom} → Admin</> : <><Lock size={14} style={{display:'inline', verticalAlign:'middle'}}/> Admin → {m.destinataire_nom}</>}
                                                            {' • '}{m.date_envoi ? new Date(m.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </p>
                                                    </div>
                                                    <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, background: cfg.bg, color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                                                </div>
                                                {m.contenu && (() => {
                                                    const parts = m.contenu.split('---PHOTO_META---');
                                                    const textContent = parts[0].trim();
                                                    const hasMeta = parts.length > 1;
                                                    const meta: any = {};
                                                    if (hasMeta) {
                                                        parts[1].trim().split('\n').forEach((ligne: string) => {
                                                            const [k, v] = ligne.split('=');
                                                            if (k && v) meta[k.trim()] = v.trim();
                                                        });
                                                    }
                                                    return (
                                                        <div style={{ marginTop: '8px' }}>
                                                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                                                {textContent}
                                                            </p>
                                                            {(hasMeta && meta['entity_id']) ? (
                                                                <button onClick={() => window.location.href=`/galerie?search=${encodeURIComponent(meta['target_name'] || '')}&tab=${meta['entity_type'] === 'parent' ? 'parents' : (meta['entity_type'] === 'enseignant' ? 'enseignants' : 'eleves')}&highlight=${meta['entity_id']}`}
                                                                    style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: '#e0e7ff', color: '#4f46e5', border: 'none', cursor: 'pointer' }}>
                                                                    <Eye size={14} /> Voir dans la Galerie
                                                                </button>
                                                            ) : (m.sujet?.includes('📷') || m.sujet?.toLowerCase().includes('photo') || textContent.toLowerCase().includes('photo')) ? (
                                                                <button onClick={() => window.location.href='/galerie?tab=attente'}
                                                                    style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: '#e0e7ff', color: '#4f46e5', border: 'none', cursor: 'pointer' }}>
                                                                    <Eye size={14} /> Voir les Photos en Attente dans la Galerie
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══════════════ MODAL: NOUVEAU MESSAGE ═══════════════ */}
            <AnimatePresence>
                {showNewParentMsg && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowNewParentMsg(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '580px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Send size={18} /><h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Nouveau Message</h3></div>
                                <button onClick={() => setShowNewParentMsg(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}><X size={16} /></button>
                            </div>
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Destinataire */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Destinataire *</label>
                                    {/* Section Parents */}
                                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Parents</p>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {[
                                            { key: 'TOUS_PARENTS' as const, color: '#059669', label: <span style={{display:'inline-flex', alignItems:'center', gap:'4px'}}><Users size={14} /> Tous les parents</span> },
                                            { key: 'CLASSE_PARENTS' as const, color: '#059669', label: <><School size={14} style={{display:'inline', verticalAlign:'middle'}}/> Parents par classe</> },
                                            { key: 'PARENT' as const, color: '#059669', label: <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> Un parent</> },
                                        ].map(d => (
                                            <button key={d.key} onClick={() => { setPmDestType(d.key); setPmDestId(null); }} style={{
                                                padding: '7px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                                background: pmDestType === d.key ? d.color : '#f1f5f9', color: pmDestType === d.key ? 'white' : '#64748b',
                                                border: 'none', cursor: 'pointer', transition: 'all 0.15s'
                                            }}>{d.label}</button>
                                        ))}
                                    </div>
                                    {/* Section Enseignants */}
                                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Enseignants</p>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {[
                                            { key: 'TOUS_ENSEIGNANTS' as const, color: '#3b82f6', label: <><Users size={14} style={{display:'inline', verticalAlign:'middle'}}/> Tous les enseignants</> },
                                            { key: 'CLASSE_ENSEIGNANTS' as const, color: '#3b82f6', label: <><School size={14} style={{display:'inline', verticalAlign:'middle'}}/> Enseignants par classe</> },
                                            { key: 'ENSEIGNANT' as const, color: '#3b82f6', label: <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> Un enseignant</> },
                                        ].map(d => (
                                            <button key={d.key} onClick={() => { setPmDestType(d.key); setPmDestId(null); }} style={{
                                                padding: '7px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                                background: pmDestType === d.key ? d.color : '#f1f5f9', color: pmDestType === d.key ? 'white' : '#64748b',
                                                border: 'none', cursor: 'pointer', transition: 'all 0.15s'
                                            }}>{d.label}</button>
                                        ))}
                                    </div>
                                    {/* Section Élèves */}
                                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>Élèves</p>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {[
                                            { key: 'TOUS_ELEVES' as const, color: '#6366f1', label: <><GraduationCap size={14} style={{display:'inline', verticalAlign:'middle'}}/> Tous les élèves</> },
                                            { key: 'CLASSE_ELEVES' as const, color: '#6366f1', label: <><School size={14} style={{display:'inline', verticalAlign:'middle'}}/> Élèves par classe</> },
                                            { key: 'ELEVE' as const, color: '#6366f1', label: <><User size={14} style={{display:'inline', verticalAlign:'middle'}}/> Un élève</> },
                                        ].map(d => (
                                            <button key={d.key} onClick={() => { setPmDestType(d.key); setPmDestId(null); }} style={{
                                                padding: '7px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                                background: pmDestType === d.key ? d.color : '#f1f5f9', color: pmDestType === d.key ? 'white' : '#64748b',
                                                border: 'none', cursor: 'pointer', transition: 'all 0.15s'
                                            }}>{d.label}</button>
                                        ))}
                                    </div>
                                </div>
                                {(pmDestType === 'CLASSE_PARENTS' || pmDestType === 'CLASSE_ELEVES' || pmDestType === 'CLASSE_ENSEIGNANTS') && (
                                    <select value={pmDestId || ''} onChange={e => setPmDestId(Number(e.target.value) || null)}
                                        style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px' }}>
                                        <option value="">— Choisir une classe —</option>
                                        {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                                    </select>
                                )}
                                {pmDestType === 'PARENT' && (
                                    <select value={pmDestId || ''} onChange={e => setPmDestId(Number(e.target.value) || null)}
                                        style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px' }}>
                                        <option value="">— Choisir un parent —</option>
                                        {parentsList.map(p => <option key={p.parent_id} value={p.parent_id}>{p.prenom} {p.nom} ({p.enfants.map(e => e.prenom).join(', ')})</option>)}
                                    </select>
                                )}
                                {pmDestType === 'ENSEIGNANT' && (
                                    <select value={pmDestId || ''} onChange={e => setPmDestId(Number(e.target.value) || null)}
                                        style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px' }}>
                                        <option value="">— Choisir un enseignant —</option>
                                        {enseignantsList.map(ens => <option key={ens.enseignant_id} value={ens.enseignant_id}>{ens.prenom} {ens.nom}</option>)}
                                    </select>
                                )}
                                {pmDestType === 'ELEVE' && (
                                    <select value={pmDestId || ''} onChange={e => setPmDestId(Number(e.target.value) || null)}
                                        style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px' }}>
                                        <option value="">— Choisir un élève —</option>
                                        {elevesList.map((el: any) => <option key={el.eleve_id} value={el.eleve_id}>{el.prenom} {el.nom} — {el.matricule} ({el.classe_code || 'N/A'})</option>)}
                                    </select>
                                )}
                                {/* Type objet */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Type</label>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {Object.entries(OBJET_CONFIG).map(([k, v]) => (
                                            <button key={k} onClick={() => setPmObjet(k)} style={{
                                                padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                                background: pmObjet === k ? v.color : '#f8fafc', color: pmObjet === k ? 'white' : '#64748b',
                                                border: 'none', cursor: 'pointer'
                                            }}>{v.icon} {v.label}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Sujet + Contenu */}
                                <input value={pmSujet} onChange={e => setPmSujet(e.target.value)} placeholder="Sujet du message *"
                                    style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                <textarea value={pmContenu} onChange={e => setPmContenu(e.target.value)} rows={4} placeholder="Contenu du message..."
                                    style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none', resize: 'vertical' }} />
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setShowNewParentMsg(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleSendParentMsg} disabled={pmSending} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', border: 'none', cursor: pmSending ? 'not-allowed' : 'pointer'
                                }}>{pmSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Envoyer</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════════ MODAL: NEW DEMANDE ═══════════════ */}
            <AnimatePresence>
                {showNewDemande && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowNewDemande(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Send size={18} /><h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Nouvelle Demande</h3></div>
                                <button onClick={() => setShowNewDemande(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}><X size={16} /></button>
                            </div>
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type d&apos;objet *</label>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {Object.entries(OBJET_CONFIG).map(([k, v]) => (
                                            <button key={k} onClick={() => setNewObjet(k)} style={{
                                                padding: '7px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                                background: newObjet === k ? v.color : '#f1f5f9', color: newObjet === k ? 'white' : '#64748b',
                                                border: 'none', cursor: 'pointer'
                                            }}>{v.icon} {v.label}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Titre *</label>
                                    <input value={newTitre} onChange={e => setNewTitre(e.target.value)} placeholder="Ex: Collecte des disponibilités pour les emplois du temps"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
                                    <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} placeholder="Détails de la demande..."
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none', resize: 'vertical' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Classes concernées</label>
                                    <select value={newClasses} onChange={e => setNewClasses(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                        <option value="TOUTES">Toutes les classes</option>
                                        {classes.map(c => <option key={c.classe_id} value={String(c.classe_id)}>{c.libelle}</option>)}
                                    </select>
                                </div>
                                {/* Trimestre selector - visible only for EXAMENS */}
                                {newObjet === 'EXAMENS' && (
                                    <div>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Trimestre *</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {[1, 2, 3].map(t => (
                                                <button key={t} type="button" onClick={() => setNewTrimestre(t)} style={{
                                                    flex: 1, padding: '12px', borderRadius: '12px', fontSize: '14px', fontWeight: 700,
                                                    background: newTrimestre === t ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#f8fafc',
                                                    color: newTrimestre === t ? 'white' : '#64748b',
                                                    border: newTrimestre === t ? 'none' : '1px solid var(--border-light)',
                                                    cursor: 'pointer', transition: 'all 0.2s'
                                                }}>
                                                    T{t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setShowNewDemande(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleCreateDemande} disabled={sending} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', border: 'none', cursor: sending ? 'not-allowed' : 'pointer'
                                }}>{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Envoyer</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════════════ MODAL: DETAIL DEMANDE ═══════════════ */}
            <AnimatePresence>
                {showDetail && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setShowDetail(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '700px', maxHeight: '85vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                            onClick={e => e.stopPropagation()}>
                            {detailLoading ? (
                                <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={36} className="animate-spin" color="var(--brand-primary)" /></div>
                            ) : detailDemande && (
                                <>
                                    <div style={{ padding: '20px 24px', background: detailDemande.objet_type === 'EXAMENS' ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{detailDemande.titre}</h3>
                                            <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>{detailDemande.description}{detailDemande.trimestre ? ` • Trimestre ${detailDemande.trimestre}` : ''}</p>
                                        </div>
                                        <button onClick={() => setShowDetail(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}><X size={16} /></button>
                                    </div>

                                    {/* === EXAMENS MODE === */}
                                    {detailDemande.objet_type === 'EXAMENS' ? (
                                        <>
                                            {/* Actions Bar */}
                                            <div style={{ padding: '12px 24px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', color: '#92400e', fontWeight: 600 }}>
                                                    <Award size={16} /> {detailDemande.enseignants.length} enseignant(s) ont déposé des sujets
                                                </div>
                                                <Link href="/centre-evaluation" onClick={() => setShowDetail(false)} style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: '10px',
                                                    fontSize: '12px', fontWeight: 700, background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: 'white',
                                                    border: 'none', textDecoration: 'none', cursor: 'pointer'
                                                }}>
                                                    <Award size={14} /> Ouvrir le Centre d&apos;Évaluation
                                                </Link>
                                            </div>
                                            {/* Enseignants with their sujets */}
                                            <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
                                                {detailDemande.enseignants.length === 0 ? (
                                                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>Aucun sujet déposé pour le moment.</p>
                                                ) : detailDemande.enseignants.map((ens: EnseignantSujets) => (
                                                    <div key={ens.enseignant_id} style={{ marginBottom: '20px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                                            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                                                                {ens.prenom[0]}{ens.nom[0]}
                                                            </div>
                                                            <div>
                                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{ens.prenom} {ens.nom}</p>
                                                                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                    {ens.specialite || 'Enseignant'} • {ens.sujets.length} sujet(s) • {ens.nb_valides} <CheckCircle2 size={12} color="#16a34a" style={{display:'inline', verticalAlign:'middle'}}/> {ens.nb_envoyes} <Clock size={12} color="#d97706" style={{display:'inline', verticalAlign:'middle'}}/> {ens.nb_rejetes} <XCircle size={12} color="#dc2626" style={{display:'inline', verticalAlign:'middle'}}/>
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '44px' }}>
                                                            {ens.sujets.map((s: SujetItem) => {
                                                                const stColor = s.statut === 'VALIDE' ? '#16a34a' : s.statut === 'REJETE' ? '#dc2626' : s.statut === 'ENVOYE' ? '#d97706' : '#64748b';
                                                                const stBg = s.statut === 'VALIDE' ? '#f0fdf4' : s.statut === 'REJETE' ? '#fef2f2' : s.statut === 'ENVOYE' ? '#fffbeb' : '#f8fafc';
                                                                const stBorder = s.statut === 'VALIDE' ? '#bbf7d0' : s.statut === 'REJETE' ? '#fecaca' : s.statut === 'ENVOYE' ? '#fde68a' : '#e2e8f0';
                                                                const stLabel = s.statut === 'VALIDE' ? <><CheckCircle2 size={12} style={{display:'inline', verticalAlign:'middle'}}/> Validé</> : s.statut === 'REJETE' ? <><XCircle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Rejeté</> : s.statut === 'ENVOYE' ? <><Clock size={12} style={{display:'inline', verticalAlign:'middle'}}/> En attente</> : <><Edit3 size={12} style={{display:'inline', verticalAlign:'middle'}}/> Brouillon</>;
                                                                return (
                                                                    <div key={s.sujet_id} style={{
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                                                                        padding: '10px 14px', borderRadius: '10px', background: stBg, border: `1px solid ${stBorder}`, fontSize: '12px'
                                                                    }}>
                                                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                                                            <span style={{ fontSize: '16px' }}><FileText size={16} /></span>
                                                                            <div style={{ minWidth: 0 }}>
                                                                                <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.titre}</p>
                                                                                <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>
                                                                                    <BookOpen size={12} style={{display:'inline', verticalAlign:'middle'}}/> {s.matiere_libelle} • <Clock size={12} style={{display:'inline', verticalAlign:'middle'}}/> {s.duree_minutes} min • {s.fichier_nom}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                                                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: stBg, color: stColor, border: `1px solid ${stBorder}` }}>{stLabel}</span>
                                                                            <button onClick={() => handleDownloadSujet(s.sujet_id, s.fichier_nom || `sujet_${s.sujet_id}`)} title="Télécharger"
                                                                                style={{ width: '26px', height: '26px', borderRadius: '7px', background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                                                                                <Download size={12} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        /* === EMPLOI MODE (existing) === */
                                        <>
                                            {/* Actions Bar */}
                                            <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                                                <button onClick={() => handleValidateAll(detailDemande.demande_id)} style={{
                                                    display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px',
                                                    fontSize: '12px', fontWeight: 700, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', cursor: 'pointer'
                                                }}><Check size={13} /> Tout Valider</button>
                                                <button onClick={() => handleGenerateEmplois(detailDemande.demande_id)} disabled={generating} style={{
                                                    display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px',
                                                    fontSize: '12px', fontWeight: 700,
                                                    background: confirmGenerate === detailDemande.demande_id
                                                        ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                                                        : 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                                    color: 'white', border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {generating ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                                                    {generating ? 'Génération en cours...' : confirmGenerate === detailDemande.demande_id ? <><AlertTriangle size={14} style={{display:'inline', verticalAlign:'middle'}}/> Confirmer la génération</> : <><Wand2 size={14} style={{display:'inline', verticalAlign:'middle'}}/> Générer les Emplois</>}
                                                </button>
                                                {confirmGenerate === detailDemande.demande_id && (
                                                    <button onClick={() => setConfirmGenerate(null)} style={{
                                                        display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px',
                                                        fontSize: '12px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer'
                                                    }}>Annuler</button>
                                                )}
                                            </div>
                                            {/* Enseignants disponibilités */}
                                            <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
                                                {detailDemande.enseignants.length === 0 ? (
                                                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>Aucune réponse reçue pour le moment.</p>
                                                ) : detailDemande.enseignants.map((ens: EnseignantDispos) => (
                                                    <div key={ens.enseignant_id} style={{ marginBottom: '20px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                                            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                                                                {ens.prenom[0]}{ens.nom[0]}
                                                            </div>
                                                            <div>
                                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{ens.prenom} {ens.nom}</p>
                                                                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{ens.specialite || 'Enseignant'} • {ens.slots.length} créneaux • {ens.nb_validees} <CheckCircle2 size={12} color="#16a34a" style={{display:'inline', verticalAlign:'middle'}}/> {ens.nb_rejetees} <XCircle size={12} color="#dc2626" style={{display:'inline', verticalAlign:'middle'}}/></p>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '44px' }}>
                                                            {ens.slots.map(s => {
                                                                const stBg = s.statut === 'VALIDEE' ? '#f0fdf4' : s.statut === 'REJETEE' ? '#fef2f2' : '#f8fafc';
                                                                const stBorder = s.statut === 'VALIDEE' ? '#bbf7d0' : s.statut === 'REJETEE' ? '#fecaca' : '#e2e8f0';
                                                                return (
                                                                    <div key={s.disponibilite_id} style={{
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                                                                        padding: '8px 12px', borderRadius: '10px', background: stBg, border: `1px solid ${stBorder}`, fontSize: '12px'
                                                                    }}>
                                                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                                            <span style={{ width: '30px' }}>{JOURS_L[s.jour] || s.jour}</span>
                                                                            <span>{s.heure_debut} - {s.heure_fin}</span>
                                                                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}><BookOpen size={12} style={{display:'inline', verticalAlign:'middle'}}/> {s.classe_libelle}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                            {s.statut === 'SOUMISE' && (
                                                                                <>
                                                                                    <button onClick={() => handleValidateSlot(s.disponibilite_id)} title="Valider" style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} /></button>
                                                                                    <button onClick={() => handleRejectSlot(s.disponibilite_id)} title="Rejeter" style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><XCircle size={12} /></button>
                                                                                </>
                                                                            )}
                                                                            {s.statut === 'VALIDEE' && <span style={{ color: '#16a34a', fontWeight: 700 }}><CheckCircle2 size={14} /></span>}
                                                                            {s.statut === 'REJETEE' && <span style={{ color: '#dc2626', fontWeight: 700 }}><XCircle size={14} /></span>}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function CommunicationAdminPage() {
    return (
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} /></div>}>
            <CommunicationAdminPageInner />
        </Suspense>
    );
}
