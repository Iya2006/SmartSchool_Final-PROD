'use client';
import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import Link from 'next/link';
import BadgeCarte from '@/components/BadgeCarte';
import html2canvas from 'html2canvas';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import Pagination from '@/components/Pagination';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import MesSeances from './_components/MesSeances';
import { startAutoSync } from '@/lib/syncEngine';
import { LIBELLE_JOUR, chargerHoraires, creneauxDeLaJournee, HORAIRES_DEFAUT, type Horaires } from '@/lib/horaires';
import { useJoursOuvres } from '@/hooks/useJoursOuvres';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Phone, User, GraduationCap, BookOpen, Clock, Calendar, AlertCircle,
    CheckCircle, Bell, Eye, EyeOff, ArrowRight, Shield, Loader2, Lock, Home,
    Users, BarChart3, FileText, ClipboardList, Briefcase, MapPin, Award,
    ChevronRight, ChevronLeft, X, Star, TrendingUp, Send, Plus, Trash2, Upload, FileUp,
    Settings, LogOut, ChevronDown, Key, Mail as MailIcon, Save,
    Camera, ImageIcon, Activity, PieChart, Target, Zap, Hash, Building2,
    ExternalLink, Link as LinkIcon, Banknote, Download, UserCheck,
    School, PenLine, XCircle, AlertTriangle, Smartphone, CheckCircle2, Lightbulb, Package, RefreshCw, Wallet, MessageSquare, Megaphone, Search, Rocket, Paperclip, Utensils
} from 'lucide-react';

// Jours ouvres de l'ecole (Parametres > Emploi du temps) : les listes etaient
// figees du lundi au vendredi, donc ni la grille ni la declaration de
// disponibilite ne connaissaient le samedi.
const DISPO_JOURS_L = LIBELLE_JOUR;
const DISPO_HEURES = [
    { debut: '08:00', fin: '09:00' }, { debut: '09:00', fin: '10:00' },
    { debut: '10:00', fin: '11:00' }, { debut: '11:00', fin: '12:00' },
    { debut: '14:00', fin: '15:00' }, { debut: '15:00', fin: '16:00' },
    { debut: '16:00', fin: '17:00' },
];

/* ═══ TYPES ═══ */
interface AffectationData {
    affectation_id: number; classe_id: number; classe_code: string; classe: string;
    niveau: string; matiere_id: number; matiere: string; coefficient: number;
    heures_semaine: number; effectif: number; nb_notes: number;
}
interface EnseignantInfo {
    enseignant_id: number; nom: string; prenom: string; matricule: string;
    telephone: string; email: string; specialite: string; diplome: string;
    type_contrat: string; date_embauche: string | null; statut: string;
    photo_url: string | null; sexe: string;
    date_naissance: string | null; lieu_naissance: string | null;
    adresse: string | null; nom_urgence: string | null; telephone_urgence: string | null;
}
interface DashData {
    enseignant: EnseignantInfo;
    affectations: AffectationData[];
    stats: { nb_classes: number; nb_matieres: number; total_heures: number; total_eleves: number; nb_creneaux: number; };
}
interface EdtSlot {
    jour: string; heure_debut: string; heure_fin: string;
    matiere: string; classe: string; classe_code: string; salle: string;
}
interface EleveItem {
    eleve_id: number; inscription_id: number; nom: string; prenom: string;
    matricule: string; sexe: string; notes: any[]; moyenne: number | null;
    nb_notes: number; nb_absences: number;
}

/* ═══ CONSTANTS ═══ */
const HEURES =['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00'];
const SLOT_COLORS: Record<string, {bg:string;border:string;text:string}> = {
    'default': { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
};
const CLASS_COLORS = ['#6366f1','#10b981','#f59e0b','#ec4899','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];

function getSlotColor(index: number) {
    const colors = [
        { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
        { bg: '#f0fdf4', border: '#10b981', text: '#065f46' },
        { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
        { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
        { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
        { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
        { bg: '#ecfdf5', border: '#14b8a6', text: '#134e4a' },
        { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },
    ];
    return colors[index % colors.length];
}

export default function PortailEnseignant() {
    const { user, logout } = useAuth();
    const { etablissementNom, etablissementLogo, theme, applyTheme } = useApp();
    const JOURS = useJoursOuvres();
    const DISPO_JOURS = JOURS;

    const primaryColor = theme.couleurEnseignant || '#8b5cf6';
    const accentColor = theme.couleurEnseignant ? theme.couleurEnseignant + 'cc' : '#6366f1';

    // Initial load based on auth user
    useEffect(() => {
        if (user && user.role === 'ENSEIGNANT') {
            const eid = user.id;
            enseignantIdRef.current = eid;
            api.get(`/api/portail-enseignant/${eid}/dashboard`)
                .then(res => setData(res.data))
                .catch(err => console.error(err));
        }
    }, [user]);

    // Module offline-first (Phase 1) : rejoue la file locale (notes/présences
    // saisies hors-ligne) dès le montage du portail, et à chaque retour de
    // connexion/premier plan ensuite — voir lib/syncEngine.ts.
    useEffect(() => {
        const stopAutoSync = startAutoSync();
        return stopAutoSync;
    }, []);

    const [data, setData] = useState<DashData | null>(null);
    const [activeTab, setActiveTab] = useState<'overview'|'emploi'|'classes'|'notes'|'appel'|'seances'|'dashboard'|'messages'|'parametres'|'devoirs'|'documents'|'liens'|'paiements'|'carte'|'evenements'|'activites'>('overview');
    const [edtSlots, setEdtSlots] = useState<EdtSlot[]>([]);
    const [edtLoading, setEdtLoading] = useState(false);
    // Horaires configurés de l'école (Paramètres > Emploi du temps) : la grille
    // de l'enseignant doit être IDENTIQUE à celle de l'administration, donc
    // suivre les mêmes heures et les mêmes pauses, pas une grille figée.
    const [horaires, setHoraires] = useState<Horaires>(HORAIRES_DEFAUT);
    useEffect(() => { chargerHoraires().then(setHoraires).catch(() => {}); }, []);
    const lignesHoraires = React.useMemo(() => {
        const debuts = new Map<string, string>();
        creneauxDeLaJournee(horaires).forEach(h => debuts.set(h.debut, h.fin));
        // On ajoute aussi les heures réelles des cours posés, pour qu'un créneau
        // à une heure non standard apparaisse quand même.
        edtSlots.forEach(s => { if (s.heure_debut) debuts.set(s.heure_debut.slice(0, 5), (s.heure_fin || '').slice(0, 5)); });
        return Array.from(debuts.entries())
            .map(([debut, fin]) => ({ debut, fin }))
            .sort((a, b) => a.debut.localeCompare(b.debut));
    }, [edtSlots, horaires]);
    const [selectedClass, setSelectedClass] = useState<AffectationData|null>(null);
    const [classEleves, setClassEleves] = useState<EleveItem[]>([]);
    const [elevesLoading, setElevesLoading] = useState(false);
    // Pagination des listes d'élèves (Mes Classes / Saisie des notes / Appel) —
    // certaines classes réelles dépassent maintenant 150 élèves, un affichage
    // non paginé ralentissait fortement ces 3 écrans. Un seul état partagé,
    // remis à la page 1 à chaque changement de classe (voir loadClassForNotes/
    // loadClassForAppel/loadClassEleves).
    const [elevesPage, setElevesPage] = useState(1);
    const ELEVES_PAGE_SIZE = 25;

    // ── Notes state ──
    const [notesData, setNotesData] = useState<Record<number, { valeur: string; absent: boolean }>>({});
    const [notesLoading, setNotesLoading] = useState(false);
    const [evalLibelle, setEvalLibelle] = useState('');
    const [evalNoteSur, setEvalNoteSur] = useState('20');
    const [notesSaved, setNotesSaved] = useState('');
    const [trimestres, setTrimestres] = useState<any[]>([]);
    const [typesEval, setTypesEval] = useState<any[]>([]);
    const [selectedTrimestre, setSelectedTrimestre] = useState<number | null>(null);
    const [selectedTypeEval, setSelectedTypeEval] = useState<number | null>(null);
    // L'enseignant ne crée plus d'évaluation : il choisit parmi celles que
    // l'administration a créées pour sa classe/matière, puis remplit les notes.
    const [evaluationsDispo, setEvaluationsDispo] = useState<any[]>([]);
    const [selectedEvaluationId, setSelectedEvaluationId] = useState<number | null>(null);
    const [evalHistory, setEvalHistory] = useState<any[]>([]);
    const [expandedNotesClasse, setExpandedNotesClasse] = useState<number | null>(null);
    const [expandedPerfClasse, setExpandedPerfClasse] = useState<number | null>(null);
    const [expandedNotesAff, setExpandedNotesAff] = useState<number | null>(null); // for Mes Affectations
    const [showEvalHistory, setShowEvalHistory] = useState(false);

    // ── Eval Detail Modal state ──
    const [showEvalDetail, setShowEvalDetail] = useState(false);
    const [evalDetailData, setEvalDetailData] = useState<any>(null);
    const [evalDetailLoading, setEvalDetailLoading] = useState(false);
    const [editingNotes, setEditingNotes] = useState<Record<number, { valeur: string; absent: boolean; observation: string; updatedAt?: string | null }>>({});
    const [savingNotes, setSavingNotes] = useState(false);
    const [centralizingEval, setCentralizingEval] = useState(false);
    const [showConfirmCentralize, setShowConfirmCentralize] = useState(false);

    // ── Appel state ──
    const [appelData, setAppelData] = useState<Record<number, string>>({});  // inscription_id -> P/A/R
    const [appelLoading, setAppelLoading] = useState(false);
    const [appelDemiJournee, setAppelDemiJournee] = useState('MATIN');
    const [appelSaved, setAppelSaved] = useState('');
    const [appelHistory, setAppelHistory] = useState<any[]>([]);
    const [showAppelHistory, setShowAppelHistory] = useState(false);


    // ── Messages state ──
    const [messages, setMessages] = useState<any[]>([]);
    const [teacherEvts, setTeacherEvts] = useState<any[]>([]);
    const [teacherActs, setTeacherActs] = useState<any[]>([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<any>(null);
    const [replyText, setReplyText] = useState('');
    const [replySending, setReplySending] = useState(false);
    const [msgFilter, setMsgFilter] = useState('TOUS');
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowProfileDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Disponibilité form state ──
    const [showDispoForm, setShowDispoForm] = useState(false);
    const [activeDemande, setActiveDemande] = useState<any>(null);
    const [dispoSlots, setDispoSlots] = useState<{classe_id: number; jour: string; heure_debut: string; heure_fin: string}[]>([]);
    const [dispoClasse, setDispoClasse] = useState<number | null>(null);
    const [dispoJour, setDispoJour] = useState('LUNDI');
    const [dispoHeure, setDispoHeure] = useState('08:00');
    const [dispoSubmitting, setDispoSubmitting] = useState(false);

    // ── Upload sujet exam state ──
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [activeExamDemande, setActiveExamDemande] = useState<any>(null);

    // ── Photo upload & Lightbox state ──
    const [photoUploading, setPhotoUploading] = useState(false);
    const [photoSuccess, setPhotoSuccess] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    // Ref stable pour l'enseignant_id — évite les dépendances circulaires
    const enseignantIdRef = useRef<number | null>(null);
    const [uploadTitre, setUploadTitre] = useState('');
    const [uploadMatiere, setUploadMatiere] = useState<number | null>(null);
    const [uploadDuree, setUploadDuree] = useState(60);
    // Période réelle de l'établissement (trimestre_id). L'écran proposait
    // « T1 T2 T3 » en dur : une école à deux semestres voyait un T3
    // inexistant, et personne ne lisait le nom réel de sa période.
    const [uploadTrimestre, setUploadTrimestre] = useState<number | null>(null);
    const [uploading, setUploading] = useState(false);
    const [mesSujets, setMesSujets] = useState<any[]>([]);
    const [sujetsLoading, setSujetsLoading] = useState(false);
    const [showEditSujet, setShowEditSujet] = useState(false);
    const [editSujetData, setEditSujetData] = useState<{sujet_id: number; titre: string; duree_minutes: number; trimestre_id: number | null} | null>(null);
    const [editSujetSaving, setEditSujetSaving] = useState(false);
    const [toastMsg, setToastMsg] = useState<{type: 'success'|'error'; text: string} | null>(null);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);

    // ── Devoirs state ──
    const [devoirs, setDevoirs] = useState<any[]>([]);
    const [devoirsLoading, setDevoirsLoading] = useState(false);
    const [showNewDevoir, setShowNewDevoir] = useState(false);
    const [devoirForm, setDevoirForm] = useState<{titre: string; description: string; type_devoir: string; classe_id: number|null; matiere_id: number|null; date_limite: string}>({titre: '', description: '', type_devoir: 'EXERCICE', classe_id: null, matiere_id: null, date_limite: ''});
    const [devoirFile, setDevoirFile] = useState<File|null>(null);
    const [devoirSaving, setDevoirSaving] = useState(false);
    const devoirFileRef = useRef<HTMLInputElement>(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [passwordChanging, setPasswordChanging] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState<{type: 'success'|'error'; text: string} | null>(null);


    // ── Signalement Enfant Parent state ──
    const [mesEnfantsData, setMesEnfantsData] = useState<{ est_parent: boolean; enfants: any[] } | null>(null);
    const [showSignalerEnfantModal, setShowSignalerEnfantModal] = useState(false);
    const [signalerForm, setSignalerForm] = useState({ nom_enfant: '', prenom_enfant: '', classe_detail: '', remarque: '' });
    const [signalerSending, setSignalerSending] = useState(false);

    // ── Paiements state ──
    const [paiementsData, setPaiementsData] = useState<any[]>([]);
    const [paiementsLoading, setPaiementsLoading] = useState(false);
    const [selectedBulletin, setSelectedBulletin] = useState<any>(null);
    const [bulletinLoading, setBulletinLoading] = useState(false);

    const loadPaiements = useCallback(async () => {
        if (!data) return;
        setPaiementsLoading(true);
        try {
            const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/paiements`);
            setPaiementsData(res.data || []);
        } catch { setPaiementsData([]); }
        finally { setPaiementsLoading(false); }
    }, [data]);

    const loadBulletinDetail = async (bulletinId: number) => {
        if (!data || !bulletinId) return;
        setBulletinLoading(true);
        try {
            const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/paiements/${bulletinId}`);
            setSelectedBulletin(res.data);
        } catch { setSelectedBulletin(null); }
        finally { setBulletinLoading(false); }
    };

    const loadMesEnfants = useCallback(async () => {
        if (!data) return;
        try {
            const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/mes-enfants`);
            setMesEnfantsData(res.data);
        } catch { setMesEnfantsData(null); }
    }, [data]);

    useEffect(() => {
        if (data) loadMesEnfants();
    }, [data, loadMesEnfants]);

    const handleSignalerEnfant = async () => {
        if (!data || !signalerForm.nom_enfant.trim()) {
            showToast('error', 'Veuillez saisir le nom de votre enfant.');
            return;
        }
        setSignalerSending(true);
        try {
            await api.post(`/api/portail-enseignant/${data.enseignant.enseignant_id}/signaler-enfant`, signalerForm);
            showToast('success', 'Demande de raccordement transmise à la direction avec succès !');
            setShowSignalerEnfantModal(false);
            setSignalerForm({ nom_enfant: '', prenom_enfant: '', classe_detail: '', remarque: '' });
        } catch (err: any) {
            showToast('error', err.response?.data?.detail || 'Erreur lors du signalement.');
        } finally {
            setSignalerSending(false);
        }
    };

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

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

    const handleTeacherPhotoUpload = async () => {
        if (!data) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPhotoUploading(true);
            try {
                const fd = new FormData();
                fd.append('fichier', file);
                await api.post(`/api/photos/upload/enseignant/${data.enseignant.enseignant_id}`, fd,
                    { headers: { 'Content-Type': 'multipart/form-data' } });
                // Refresh dashboard data
                const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/dashboard`);
                setData(res.data);
                setToastMsg({ type: 'success', text: 'Photo mise à jour avec succès !' });
                setTimeout(() => setToastMsg(null), 3000);
            } catch {
                setToastMsg({ type: 'error', text: 'Erreur lors de l\'envoi de la photo' });
                setTimeout(() => setToastMsg(null), 3000);
            }
            setPhotoUploading(false);
        };
        input.click();
    };

    // ── Load devoirs when tab is opened ──
    useEffect(() => {
        if (activeTab !== 'devoirs' || !data) return;
        setDevoirsLoading(true);
        api.get(`/api/devoirs/enseignant/${data.enseignant.enseignant_id}`)
            .then(res => setDevoirs(res.data))
            .catch(() => {})
            .finally(() => setDevoirsLoading(false));
    }, [activeTab, data]);

    // ── Load mes sujets when documents tab is opened ──
    const loadMesSujets = useCallback(async () => {
        if (!data) return;
        setSujetsLoading(true);
        try {
            const res = await api.get(`/api/examens/sujets`, { params: { enseignant_id: data.enseignant.enseignant_id } });
            setMesSujets(res.data);
        } catch { setMesSujets([]); }
        finally { setSujetsLoading(false); }
    }, [data]);

    useEffect(() => {
        if (activeTab === 'documents' && data) loadMesSujets();
    }, [activeTab, data, loadMesSujets]);

    /* ═══ FETCH EDT ═══ */
    useEffect(() => {
        if (activeTab !== 'emploi' || !data) return;
        const fetchEdt = async () => {
            setEdtLoading(true);
            try {
                const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/emploi-du-temps`);
                setEdtSlots(res.data);
            } catch { setEdtSlots([]); }
            finally { setEdtLoading(false); }
        };
        fetchEdt();
    }, [ activeTab, data]);

    /* ═══ FETCH REFERENTIELS (trimestres + types eval) ═══ */
    useEffect(() => {
        if (!data) return;
        const fetchRefs = async () => {
            try {
                const [triRes, typeRes] = await Promise.all([
                    api.get('/api/portail-enseignant/referentiels/trimestres'),
                    api.get('/api/portail-enseignant/referentiels/types-evaluation'),
                ]);
                setTrimestres(triRes.data);
                setTypesEval(typeRes.data);
                if (triRes.data.length > 0 && !selectedTrimestre) setSelectedTrimestre(triRes.data[0].trimestre_id);
                // Dépôt d'un sujet : on présélectionne la période en cours
                // plutôt qu'un « T1 » qui n'est presque jamais le bon.
                if (triRes.data.length > 0) {
                    const enCours = triRes.data.find((p: any) => p.statut === 'EN_COURS') || triRes.data[0];
                    setUploadTrimestre(prev => prev ?? enCours.trimestre_id);
                }
                if (typeRes.data.length > 0 && !selectedTypeEval) setSelectedTypeEval(typeRes.data[0].type_eval_id);
            } catch { /* silently fail */ }
        };
        fetchRefs();
    }, [ data]);

    /* ═══ FETCH EVAL HISTORY ═══ */
    useEffect(() => {
        if (activeTab !== 'notes' || !data) return;
        const fetchHistory = async () => {
            try {
                const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations`);
                setEvalHistory(res.data);
            } catch { setEvalHistory([]); }
        };
        fetchHistory();
    }, [ activeTab, data, notesSaved]);

    /* ═══ FETCH APPEL HISTORY ═══ */
    useEffect(() => {
        if (activeTab !== 'appel' || !data) return;
        const fetchAppelHist = async () => {
            try {
                const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/historique-appels`);
                setAppelHistory(res.data);
            } catch { setAppelHistory([]); }
        };
        fetchAppelHist();
    }, [ activeTab, data, appelSaved]);

    /* ═══ FETCH MESSAGES ═══ */
    const loadMessages = useCallback(async () => {
        if (!data) return;
        setMessagesLoading(true);
        try {
            const res = await api.get(`/api/communication/messages`, {
                params: { role: 'ENSEIGNANT', enseignant_id: data.enseignant.enseignant_id }
            });
            setMessages(res.data);
        } catch { setMessages([]); }
        finally { setMessagesLoading(false); }
    }, [data]);

    useEffect(() => {
        if (data) {
            loadMessages();
        }
    }, [data, loadMessages]);

    // ── Auto-mark messages as read when messages tab is active ──
    useEffect(() => {
        if (activeTab !== 'messages' || !data) return;
        const unread = messages.filter(m => m.statut === 'ENVOYE' && m.expediteur_type === 'ADMIN');
        if (unread.length === 0) return;
        // Mark all unread messages as read silently
        Promise.all(unread.map(m => api.put(`/api/communication/messages/${m.message_id}/lire`).catch(() => {})))
            .then(() => loadMessages());
    }, [activeTab, data]);

    useEffect(() => {
        if (activeTab === 'evenements' && data) {
            api.get('/api/evenements').then(r => {
                setTeacherEvts((r.data || []).filter((e: any) => e.statut === 'PUBLIE'));
            }).catch(() => {});
        }
        if (activeTab === 'activites' && data) {
            api.get('/api/activites').then(r => {
                setTeacherActs((r.data || []).filter((a: any) => a.est_actif === 'O'));
            }).catch(() => {});
        }
        if (activeTab === 'paiements' && data) {
            loadPaiements();
        }
    }, [activeTab, data]);

    // ═══ REFRESH AUTOMATIQUE du tableau de bord ═══
    const refreshDashboard = useCallback(async () => {
        const eid = enseignantIdRef.current;
        if (!eid) return;
        try {
            const dash = await api.get(`/api/portail-enseignant/${eid}/dashboard`);
            setData(dash.data);
        } catch { /* Silencieux */ }
    }, []);

    useEffect(() => {
        if (!data) return;
        // Refresh quand l'onglet redevient visible
        const handleVisibility = () => {
            if (!document.hidden) refreshDashboard();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [ refreshDashboard]);

    const sendReply = useCallback(async (parentMsg: any) => {
        if (!data || !replyText.trim()) return;
        setReplySending(true);
        try {
            // La réponse revient à qui a écrit : à un parent si c'est lui qui a
            // ouvert l'échange, sinon à l'administration. Répondre toujours à
            // l'admin renvoyait la réponse du professeur au mauvais endroit.
            const versParent = parentMsg.expediteur_type === 'PARENT' && parentMsg.expediteur_id;
            await api.post('/api/communication/messages', {
                expediteur_type: 'ENSEIGNANT',
                expediteur_id: data.enseignant.enseignant_id,
                destinataire_type: versParent ? 'PARENT' : 'ADMIN',
                destinataire_id: versParent ? parentMsg.expediteur_id : undefined,
                objet_type: parentMsg.objet_type,
                sujet: `RE: ${parentMsg.sujet}`,
                contenu: replyText.trim(),
                parent_message_id: parentMsg.message_id,
                demande_id: parentMsg.demande_id,
            });
            setReplyText('');
            setSelectedMessage(null);
            loadMessages();
        } catch { /* ignore */ }
        finally { setReplySending(false); }
    }, [data, replyText, loadMessages]);

    const markAsRead = useCallback(async (msg: any) => {
        if (msg.statut === 'ENVOYE') {
            try { await api.put(`/api/communication/messages/${msg.message_id}/lire`); } catch { /* ignore */ }
        }
    }, []);

    const showToast = (type: 'success'|'error', text: string) => {
        setToastMsg({ type, text });
        setTimeout(() => setToastMsg(null), 3500);
    };

    /* ═══ DISPONIBILITÉ FUNCTIONS ═══ */
    const openDispoForm = (msg: any) => {
        setActiveDemande(msg);
        setDispoSlots([]);
        if (data && data.affectations.length > 0) setDispoClasse(data.affectations[0].classe_id);
        setShowDispoForm(true);
    };

    const addDispoSlot = () => {
        if (!dispoClasse) return;
        const h = DISPO_HEURES.find(x => x.debut === dispoHeure);
        if (!h) return;
        const dup = dispoSlots.find(s => s.classe_id === dispoClasse && s.jour === dispoJour && s.heure_debut === dispoHeure);
        if (dup) { showToast('error', 'Ce créneau est déjà ajouté.'); return; }
        setDispoSlots([...dispoSlots, { classe_id: dispoClasse, jour: dispoJour, heure_debut: h.debut, heure_fin: h.fin }]);
    };

    const removeDispoSlot = (idx: number) => setDispoSlots(dispoSlots.filter((_, i) => i !== idx));

    const submitDispos = async () => {
        if (!data || !activeDemande?.demande_id || dispoSlots.length === 0) {
            showToast('error', 'Ajoutez au moins un créneau.'); return;
        }
        try {
            setDispoSubmitting(true);
            await api.post('/api/communication/disponibilites', {
                demande_id: activeDemande.demande_id,
                enseignant_id: data.enseignant.enseignant_id,
                slots: dispoSlots,
            });
            showToast('success', `${dispoSlots.length} créneaux envoyés !`);
            setShowDispoForm(false);
            loadMessages();
        } catch (err: any) { showToast('error', err.response?.data?.detail || "Erreur d'envoi"); }
        finally { setDispoSubmitting(false); }
    };

    /* ═══ UPLOAD SUJET EXAM FUNCTIONS ═══ */
    const openExamUpload = (msg: any) => {
        setActiveExamDemande(msg);
        setUploadFile(null);
        setUploadTitre('');
        setUploadDuree(60);
        if (data && data.affectations.length > 0) setUploadMatiere(data.affectations[0].matiere_id);
        setShowUploadForm(true);
    };

    const handleUploadSujet = async () => {
        if (!data || !uploadFile) { showToast('error', 'Sélectionnez un fichier.'); return; }
        if (!uploadTitre.trim()) { showToast('error', 'Le titre est requis.'); return; }
        if (!uploadMatiere) { showToast('error', 'Sélectionnez une matière.'); return; }
        if (!uploadTrimestre) { showToast('error', 'Sélectionnez une période.'); return; }
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('fichier', uploadFile);
            formData.append('enseignant_id', String(data.enseignant.enseignant_id));
            formData.append('matiere_id', String(uploadMatiere));
            formData.append('trimestre_id', String(uploadTrimestre));
            formData.append('titre', uploadTitre);
            formData.append('duree_minutes', String(uploadDuree));
            if (activeExamDemande?.demande_id) formData.append('demande_id', String(activeExamDemande.demande_id));

            const uploadRes = await api.post('/api/examens/sujets/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast('success', uploadRes.data.message || 'Sujet envoyé à l\'administration avec succès !');
            setShowUploadForm(false);
            loadMessages();
            loadMesSujets(); // refresh historique
        } catch (err: any) { showToast('error', err.response?.data?.detail || 'Erreur lors du téléversement.'); }
        finally { setUploading(false); }
    };

    const handleDeleteSujet = async (sujetId: number) => {
        if (!confirm('Supprimer ce sujet ?')) return;
        try {
            await api.delete(`/api/examens/sujets/${sujetId}`);
            showToast('success', 'Sujet supprimé.');
            loadMesSujets();
        } catch (err: any) { showToast('error', err.response?.data?.detail || 'Erreur lors de la suppression.'); }
    };

    const handleEditSujet = async () => {
        if (!editSujetData) return;
        setEditSujetSaving(true);
        try {
            await api.put(`/api/examens/sujets/${editSujetData.sujet_id}/modifier`, {
                titre: editSujetData.titre,
                duree_minutes: editSujetData.duree_minutes,
                trimestre_id: editSujetData.trimestre_id,
            });
            showToast('success', 'Sujet mis à jour avec succès.');
            setShowEditSujet(false);
            setEditSujetData(null);
            loadMesSujets();
        } catch (err: any) { showToast('error', err.response?.data?.detail || 'Erreur lors de la modification.'); }
        finally { setEditSujetSaving(false); }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    /* ═══ FETCH CLASS STUDENTS ═══ */
    const loadClassEleves = useCallback(async (aff: AffectationData) => {
        if (!data) return;
        setSelectedClass(aff); setElevesLoading(true); setElevesPage(1);
        try {
            const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/classe/${aff.classe_id}/eleves`);
            setClassEleves(res.data);
        } catch { setClassEleves([]); }
        finally { setElevesLoading(false); }
    }, [data]);

    /* ═══ INIT NOTES/APPEL DATA WHEN LOADING CLASS ═══ */
    const loadClassForNotes = useCallback(async (aff: AffectationData) => {
        await loadClassEleves(aff);
        setNotesData({});
        setNotesSaved('');
        setSelectedEvaluationId(null);
        // Charger les évaluations créées par l'administration pour cette
        // classe/matière — c'est ce que l'enseignant vient remplir.
        if (data) {
            try {
                const res = await api.get(
                    `/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations?classe_id=${aff.classe_id}&matiere_id=${aff.matiere_id}`);
                setEvaluationsDispo(Array.isArray(res.data) ? res.data : []);
            } catch { setEvaluationsDispo([]); }
        }
    }, [loadClassEleves, data]);

    // Quand l'enseignant choisit une évaluation, on précharge les notes déjà
    // saisies (s'il revient corriger) ; le barème vient de l'évaluation.
    const chargerNotesEvaluation = useCallback(async (evaluationId: number) => {
        if (!data) return;
        setNotesData({});
        try {
            const res = await api.get(
                `/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations/${evaluationId}/notes`);
            const prefill: Record<number, { valeur: string; absent: boolean }> = {};
            (res.data?.notes || []).forEach((n: any) => {
                prefill[n.inscription_id] = {
                    valeur: n.valeur !== null && n.valeur !== undefined ? String(n.valeur) : '',
                    absent: n.est_absent === 'O' || n.est_absent === true,
                };
            });
            setNotesData(prefill);
        } catch { /* pas encore de notes : on part d'une grille vide */ }
    }, [data]);

    const loadClassForAppel = useCallback(async (aff: AffectationData) => {
        await loadClassEleves(aff);
        setAppelSaved('');
        // Init all students as PRESENT by default
        const initAppel: Record<number, string> = {};
        // We'll set this after classEleves is loaded via useEffect
    }, [loadClassEleves]);

    // When classEleves changes and we're on appel tab, init all as PRESENT
    useEffect(() => {
        if (activeTab === 'appel' && classEleves.length > 0) {
            const init: Record<number, string> = {};
            classEleves.forEach(e => { init[e.inscription_id] = 'PRESENT'; });
            setAppelData(init);
        }
    }, [classEleves, activeTab]);

    /* ═══ SAVE NOTES ═══ */
    const saveNotes = useCallback(async () => {
        if (!data || !selectedClass || !selectedEvaluationId) return;
        setNotesLoading(true);
        setNotesSaved('');
        try {
            const notesPayload = classEleves.map(e => ({
                inscription_id: e.inscription_id,
                valeur: notesData[e.inscription_id]?.absent ? null
                    : (notesData[e.inscription_id]?.valeur ? parseFloat(notesData[e.inscription_id].valeur) : null),
                est_absent: notesData[e.inscription_id]?.absent || false,
            }));
            // On REMPLIT l'évaluation créée par l'administration (upsert par
            // élève), on n'en crée pas de nouvelle.
            await api.post(
                `/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations/${selectedEvaluationId}/saisir`,
                { notes: notesPayload });
            const evNom = evaluationsDispo.find(e => e.evaluation_id === selectedEvaluationId)?.libelle || 'Évaluation';
            setNotesSaved(`"${evNom}" enregistrée avec succès`);
        } catch (err: any) {
            setNotesSaved(`${err.response?.data?.detail || 'Erreur'}`);
        } finally { setNotesLoading(false); }
    }, [data, selectedClass, selectedEvaluationId, classEleves, notesData, evaluationsDispo]);

    /* ═══ EVAL DETAIL: VIEW, EDIT, CENTRALIZE ═══ */
    const openEvalDetail = useCallback(async (evalId: number) => {
        if (!data) return;
        setEvalDetailLoading(true);
        setShowEvalDetail(true);
        try {
            const res = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations/${evalId}/notes`);
            setEvalDetailData(res.data);
            // Init editing state
            const initEdit: Record<number, { valeur: string; absent: boolean; observation: string; updatedAt?: string | null }> = {};
            (res.data.notes || []).forEach((n: any) => {
                initEdit[n.note_id] = {
                    valeur: n.valeur !== null ? String(n.valeur) : '',
                    absent: n.est_absent,
                    observation: n.observation || '',
                    // Horodatage connu au moment de cette lecture — renvoyé lors
                    // de la sauvegarde (base_updated_at) pour que la synchro
                    // hors-ligne détecte un éventuel conflit (voir sync.py).
                    updatedAt: n.updated_at,
                };
            });
            setEditingNotes(initEdit);
        } catch (e: any) { console.error(e); setShowEvalDetail(false); }
        finally { setEvalDetailLoading(false); }
    }, [data]);

    const saveEvalNotes = useCallback(async () => {
        if (!data || !evalDetailData) return;
        setSavingNotes(true);
        try {
            const items = Object.entries(editingNotes).map(([noteId, v]) => ({
                note_id: Number(noteId),
                valeur: v.absent ? null : (v.valeur ? parseFloat(v.valeur) : null),
                est_absent: v.absent,
                observation: v.observation || null,
                base_updated_at: v.updatedAt || null,
            }));
            // Passe par /api/sync (plutôt que l'ancien PUT .../evaluations/{id}/notes) :
            // même effet en ligne, mais cet appel est éligible à la file
            // hors-ligne (voir lib/api.ts) — une coupure réseau pendant la
            // saisie n'empêche plus l'enseignant de continuer.
            const res = await api.post(`/api/sync/${data.enseignant.enseignant_id}/notes`, { items });

            if (res.data.queued) {
                showToast('success', res.data.message);
            } else {
                const nbConflits = res.data.conflicts?.length || 0;
                showToast('success',
                    `${res.data.nb_synchronises} note(s) enregistrée(s)` +
                    (nbConflits > 0 ? ` — ${nbConflits} conflit(s) résolu(s) automatiquement` : ''));
                // Reload detail + historique — seulement si la sauvegarde a
                // réellement atteint le serveur (inutile, voire trompeur, de
                // recharger juste après une mise en file hors-ligne).
                await openEvalDetail(evalDetailData.evaluation.evaluation_id);
                const histRes = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations`);
                setEvalHistory(histRes.data);
            }
        } catch (e: any) { showToast('error', e.response?.data?.detail || 'Erreur de sauvegarde'); }
        finally { setSavingNotes(false); }
    }, [data, evalDetailData, editingNotes, openEvalDetail]);

    const centralizeEval = useCallback(async () => {
        if (!data || !evalDetailData) return;
        if (!showConfirmCentralize) { setShowConfirmCentralize(true); return; }
        setShowConfirmCentralize(false);
        setCentralizingEval(true);
        try {
            const res = await api.put(
                `/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations/${evalDetailData.evaluation.evaluation_id}/centraliser`
            );
            showToast('success', res.data.message);
            setShowEvalDetail(false);
            // Reload history
            const histRes = await api.get(`/api/portail-enseignant/${data.enseignant.enseignant_id}/evaluations`);
            setEvalHistory(histRes.data);
        } catch (e: any) { showToast('error', e.response?.data?.detail || 'Erreur de centralisation'); }
        finally { setCentralizingEval(false); }
    }, [data, evalDetailData, showConfirmCentralize]);


    /* ═══ SAVE APPEL ═══ */
    const saveAppel = useCallback(async () => {
        if (!data || !selectedClass) return;
        setAppelLoading(true);
        setAppelSaved('');
        try {
            const items = classEleves.map(e => ({
                inscription_id: e.inscription_id,
                statut: appelData[e.inscription_id] || 'PRESENT',
            }));
            // Passe par /api/sync (plutôt que POST .../presences directement) :
            // même effet en ligne, mais éligible à la file hors-ligne (voir
            // lib/api.ts) si le réseau manque au moment de l'appel.
            const res = await api.post(`/api/sync/${data.enseignant.enseignant_id}/presences`, {
                classe_id: selectedClass.classe_id,
                demi_journee: appelDemiJournee,
                items,
            });
            setAppelSaved(`${res.data.message}`);
        } catch (err: any) {
            setAppelSaved(`${err.response?.data?.detail || 'Erreur'}`);
        } finally { setAppelLoading(false); }
    }, [data, selectedClass, classEleves, appelData, appelDemiJournee]);

    const inputStyle = {
        width: '100%', padding: '14px 16px 14px 46px', borderRadius: '14px',
        border: `2px solid #e2e8f0`, fontSize: '16px',
        outline: 'none', transition: 'border-color 0.2s',
        fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' as const,
    };

    /* ═══════════ LOGIN PAGE ═══════════ */
    if (!user || user.role !== 'ENSEIGNANT') return <div style={{padding: '50px', textAlign: 'center'}}>Chargement ou accès refusé...</div>;
    if (!data) return (
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ textAlign: 'center' }}>
                <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: '#8b5cf6', marginBottom: '16px' }} />
                <p style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>Chargement du portail enseignant...</p>
            </div>
        </div>
    );
    const { enseignant: ens, affectations, stats } = data;

    // Map classes for unique display
    const uniqueClasses = [...new Map(affectations.map(a => [a.classe_id, a])).values()];

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Inter', sans-serif", background: '#f8fafc' }}>
            <style>{`
                @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
                @keyframes bellShake{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-14deg)}45%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}75%{transform:rotate(4deg)}}
                @keyframes badgePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
                @keyframes notifSlideIn{from{opacity:0;transform:translateY(-8px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}
            `}</style>

            {/* SIDEBAR ENSEIGNANT (Ambre) */}
            <div style={{ width: '240px', background: `linear-gradient(180deg, ${primaryColor} 0%, ${accentColor} 100%)`, display: 'flex', flexDirection: 'column', flexShrink: 0, boxShadow: '4px 0 24px rgba(0,0,0,0.2)' }}>
                {/* Logo */}
                <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, color: 'white' }}>S</div>
                        <div>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>SMARTSCHOOL</p>
                            <p style={{ margin: 0, fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Portail Enseignant</p>
                        </div>
                    </div>
                </div>
                {/* Avatar */}
                <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0, background: ens.photo_url ? `url(${API_BASE}${ens.photo_url}) center/cover no-repeat` : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800, color: 'white', border: '2px solid rgba(255,255,255,0.2)', cursor: ens.photo_url ? 'zoom-in' : 'default' }}
                            onClick={() => ens.photo_url && setLightboxUrl(`${API_BASE}${ens.photo_url}`)}>
                            {!ens.photo_url && `${ens.prenom[0]}${ens.nom[0]}`}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ens.prenom} {ens.nom}</p>
                            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{ens.specialite || ens.type_contrat}</p>
                        </div>
                    </div>
                </div>
                {/* Nav */}
                <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
                    {([
                        { key: 'overview' as const, label: "Vue d'ensemble", icon: User },
                        { key: 'dashboard' as const, label: 'Dashboard', icon: PieChart },
                        { key: 'emploi' as const, label: 'Emploi du Temps', icon: Calendar },
                        { key: 'classes' as const, label: 'Mes Classes', icon: Users },
                        { key: 'notes' as const, label: 'Saisie Notes', icon: FileText },
                        { key: 'seances' as const, label: 'Mes Séances', icon: Clock },
                        { key: 'appel' as const, label: 'Appel (classe)', icon: ClipboardList },
                        { key: 'messages' as const, label: 'Messages', icon: MailIcon },
                        { key: 'devoirs' as const, label: 'Devoirs', icon: BookOpen },
                        { key: 'documents' as const, label: 'Documents & Partages', icon: FileText },
                        { key: 'liens' as const, label: 'Liens Externes', icon: ExternalLink },
                        { key: 'evenements' as const, label: 'Événements', icon: Calendar },
                        { key: 'activites' as const, label: 'Activités', icon: Activity },
                        { key: 'paiements' as const, label: 'Mes Paiements', icon: Banknote }
                    ] as const).map(item => {
                        const isActive = activeTab === item.key;
                        const badge = item.key === 'messages' ? messages.filter(m => m.statut === 'ENVOYE' && m.expediteur_type === 'ADMIN').length : 0;
                        return (
                            <button key={item.key}
                                onClick={() => { setActiveTab(item.key); setSelectedClass(null); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', marginBottom: '2px', transition: 'all 0.15s', background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent', color: isActive ? 'white' : 'rgba(255,255,255,0.55)', fontWeight: isActive ? 700 : 500, fontSize: '13px', borderLeft: isActive ? `3px solid ${primaryColor}` : '3px solid transparent' }}>
                                <item.icon size={16} />
                                {item.label}
                                {badge > 0 && <span style={{ marginLeft: 'auto', background: '#ef4444', color: 'white', borderRadius: '20px', fontSize: '10px', fontWeight: 700, padding: '1px 6px' }}>{badge}</span>}
                            </button>
                        );
                    })}
                </nav>
                {/* Logout */}
                <div style={{ padding: '16px' }}>
                </div>
            </div>

            {/* CONTENU PRINCIPAL */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {/* ── HEADER ── */}
                <div style={{ height: '60px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px', padding: '0 32px', flexShrink: 0, position: 'relative' }}>
                    <SyncStatusIndicator />
                    <div ref={dropdownRef} style={{ position: 'relative' }}>
                        <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                {data?.enseignant?.prenom[0]}{data?.enseignant?.nom[0]}
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{data?.enseignant?.prenom} {data?.enseignant?.nom}</p>
                                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Enseignant</p>
                            </div>
                            <ChevronDown size={14} color="#64748b" />
                        </button>
                        <AnimatePresence>
                            {showProfileDropdown && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, width: '200px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', overflow: 'hidden', zIndex: 100 }}>
                                    <button onClick={() => { setActiveTab('parametres'); setShowProfileDropdown(false); }} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <Settings size={16} /> Mon Profil
                                    </button>
                                    <button onClick={() => { setActiveTab('carte'); setShowProfileDropdown(false); }} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <UserCheck size={16} /> Ma Carte (Badge)
                                    </button>
                                    <button onClick={() => { logout(); }} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#ef4444' }}>
                                        <LogOut size={16} /> Déconnexion
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
                {!['parametres', 'carte', 'evenements', 'activites'].includes(activeTab) && (
                    <>
                        {/* ═══ WELCOME ═══ */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1e293b', margin: '0 0 4px' }}>
                        Bonjour, {ens.prenom}
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
                        {ens.specialite || 'Enseignant'} • Matricule : {ens.matricule}
                    </p>
                </motion.div>

                {/* ═══ KPI CARDS ═══ */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', margin: '24px 0' }}>
                    {[
                        { label: 'Classes gérées', value: stats.nb_classes, icon: <Users size={22} />, color: accentColor, bg: '#ede9fe' },
                        { label: 'Matières enseignées', value: stats.nb_matieres, icon: <BookOpen size={22} />, color: '#10b981', bg: '#d1fae5' },
                        { label: 'Heures / semaine', value: stats.total_heures, icon: <Clock size={22} />, color: '#f59e0b', bg: '#fef3c7' },
                        { label: 'Élèves total', value: stats.total_eleves, icon: <GraduationCap size={22} />, color: '#ec4899', bg: '#fce7f3' },
                    ].map((k, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            style={{ background: 'white', borderRadius: '16px', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</p>
                                <p style={{ margin: '6px 0 0', fontSize: '28px', fontWeight: 800, color: '#1e293b' }}>{k.value}</p>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>{k.icon}</div>
                        </motion.div>
                    ))}
                </div>

                    </>
                )}

                {/* ═══ TAB CONTENT ═══ */}
                <AnimatePresence mode="wait">
                    {/* ──── OVERVIEW TAB (PREMIUM PROFILE) ──── */}
                    {activeTab === 'overview' && (
                        <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {/* Profile Hero Banner */}
                            <div style={{ background: `linear-gradient(135deg, #1e1b4b, #4338ca, ${accentColor})`, borderRadius: '24px', padding: '32px', marginBottom: '20px', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: '-50px', right: '-30px', width: '220px', height: '220px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                                <div style={{ position: 'absolute', bottom: '-40px', left: '20%', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '28px', position: 'relative', zIndex: 1 }}>
                                    {/* Photo with upload */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div onClick={() => ens.photo_url && setLightboxUrl(`${API_BASE}${ens.photo_url}`)}
                                            style={{
                                                width: '110px', height: '110px', borderRadius: '24px',
                                                background: ens.photo_url
                                                    ? `url(${API_BASE}${ens.photo_url}) center/cover no-repeat`
                                                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '36px', fontWeight: 900, color: 'white',
                                                border: '4px solid rgba(255,255,255,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                                cursor: ens.photo_url ? 'zoom-in' : 'default', transition: 'transform 0.2s',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                                            {!ens.photo_url && `${ens.prenom[0]}${ens.nom[0]}`}
                                        </div>
                                        {!ens.photo_url && (
                                            <button onClick={handleTeacherPhotoUpload} disabled={photoUploading}
                                                style={{
                                                    position: 'absolute', bottom: '-6px', right: '-6px',
                                                    width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #1e1b4b',
                                                    background: 'linear-gradient(135deg, #f59e0b, #d97706)', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                                                }}>
                                                {photoUploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={14} />}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ color: 'white', flex: 1 }}>
                                        <h1 style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 900 }}>{ens.prenom} {ens.nom}</h1>
                                        <p style={{ margin: '0 0 12px', fontSize: '15px', opacity: 0.8 }}>{ens.specialite || 'Enseignant'}</p>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ padding: '5px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                                                <Hash size={11} style={{ marginRight: '4px', verticalAlign: '-1px' }} />{ens.matricule}
                                            </span>
                                            <span style={{ padding: '5px 14px', borderRadius: '10px', background: ens.statut === 'ACTIF' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', fontSize: '12px', fontWeight: 700 }}>
                                                {ens.statut === 'ACTIF' ? 'Actif' : 'Inactif'}
                                            </span>
                                            <span style={{ padding: '5px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.25)', fontSize: '12px', fontWeight: 700 }}>
                                                <Briefcase size={11} style={{ marginRight: '4px', verticalAlign: '-1px' }} />{ens.type_contrat}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Quick stats in hero */}
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        {[
                                            { val: stats.nb_classes, lbl: 'Classes', icon: <Building2 size={18} /> },
                                            { val: stats.total_eleves, lbl: 'Élèves', icon: <Users size={18} /> },
                                            { val: `${stats.total_heures}h`, lbl: '/sem', icon: <Clock size={18} /> },
                                        ].map((s, i) => (
                                            <div key={i} style={{
                                                textAlign: 'center', padding: '14px 18px', borderRadius: '16px',
                                                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
                                                minWidth: '80px',
                                            }}>
                                                <div style={{ marginBottom: '4px', opacity: 0.7 }}>{s.icon}</div>
                                                <p style={{ margin: 0, fontSize: '22px', fontWeight: 900 }}>{s.val}</p>
                                                <p style={{ margin: 0, fontSize: '10px', opacity: 0.6 }}>{s.lbl}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Profile Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                {/* Informations Personnelles */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor }}>
                                            <User size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Informations Personnelles</h3>
                                    </div>
                                    <div style={{ padding: '16px 24px' }}>
                                        {[
                                            { icon: <User size={14} />, label: 'Nom complet', value: `${ens.prenom} ${ens.nom}` },
                                            { icon: <Phone size={14} />, label: 'Téléphone', value: ens.telephone },
                                            { icon: <MailIcon size={14} />, label: 'Email', value: ens.email || '—' },
                                            { icon: <Calendar size={14} />, label: 'Date de naissance', value: ens.date_naissance || '—' },
                                            { icon: <MapPin size={14} />, label: 'Lieu de naissance', value: ens.lieu_naissance || '—' },
                                            { icon: <Home size={14} />, label: 'Adresse', value: ens.adresse || '—' },
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 5 ? '1px solid #f8fafc' : 'none' }}>
                                                <span style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>{item.icon} {item.label}</span>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', maxWidth: '200px', textAlign: 'right' }}>{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Informations Professionnelles */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                                            <Briefcase size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Informations Professionnelles</h3>
                                    </div>
                                    <div style={{ padding: '16px 24px' }}>
                                        {[
                                            { icon: <Award size={14} />, label: 'Diplôme', value: ens.diplome || '—' },
                                            { icon: <Star size={14} />, label: 'Spécialité', value: ens.specialite || '—' },
                                            { icon: <Briefcase size={14} />, label: 'Type de contrat', value: ens.type_contrat || '—' },
                                            { icon: <Calendar size={14} />, label: 'Date d\'embauche', value: ens.date_embauche || '—' },
                                            { icon: <Hash size={14} />, label: 'Matricule', value: ens.matricule },
                                            { icon: <Shield size={14} />, label: 'Statut', value: ens.statut },
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 5 ? '1px solid #f8fafc' : 'none' }}>
                                                <span style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>{item.icon} {item.label}</span>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Affectations */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                            <BookOpen size={18} />
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Mes Affectations</h3>
                                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>{affectations.length} affectation(s) active(s) — {stats.nb_matieres} matière(s)</p>
                                        </div>
                                    </div>
                                    <div style={{ padding: '16px 20px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                                            {uniqueClasses.map((uCls, i) => {
                                                const c = getSlotColor(i);
                                                const classAffs = affectations.filter(a => a.classe_id === uCls.classe_id);
                                                const isExpanded = expandedNotesAff === uCls.classe_id;
                                                return (
                                                    <div key={uCls.classe_id} style={{ borderRadius: '16px', overflow: 'hidden', border: `1px solid ${c.border}30`, background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                                        <div onClick={() => setExpandedNotesAff(isExpanded ? null : uCls.classe_id)}
                                                            style={{ padding: '16px 20px', background: `linear-gradient(135deg, ${c.border}18, ${c.bg})`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isExpanded ? `1px solid ${c.border}30` : 'none' }}>
                                                            <div>
                                                                <p style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: c.text }}>{uCls.classe}</p>
                                                                <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b' }}>{classAffs.length} matière{classAffs.length > 1 ? 's' : ''} • {uCls.effectif} élèves</p>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {classAffs.map((a, ai) => {
                                                                    const ac = getSlotColor(affectations.indexOf(a));
                                                                    return <span key={a.affectation_id} style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: ac.bg, color: ac.text }}>{a.matiere}</span>;
                                                                })}
                                                                <ChevronRight size={16} color={c.text} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                                            </div>
                                                        </div>
                                                        {isExpanded && (
                                                            <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {classAffs.map((a, ai) => {
                                                                    const ac = getSlotColor(affectations.indexOf(a));
                                                                    return (
                                                                        <div key={a.affectation_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '10px', background: ac.bg }}>
                                                                            <div>
                                                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: ac.text }}>{a.matiere}</p>
                                                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>{a.heures_semaine}h/sem • Coeff {a.coefficient}</p>
                                                                            </div>
                                                                            <div style={{ textAlign: 'right' }}>
                                                                                <p style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: ac.text }}>{a.effectif}</p>
                                                                                <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>élèves</p>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {affectations.length === 0 && (
                                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                                    <BookOpen size={36} style={{ marginBottom: '8px', opacity: 0.4 }} />
                                                    <p style={{ fontSize: '13px', fontWeight: 600 }}>Aucune affectation pour le moment</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Urgence */}
                                {(ens.nom_urgence || ens.telephone_urgence) && (
                                    <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', gridColumn: '1 / -1' }}>
                                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                                <Phone size={16} />
                                            </div>
                                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Contact d'Urgence</h4>
                                        </div>
                                        <div style={{ padding: '14px 24px', display: 'flex', gap: '24px' }}>
                                            {ens.nom_urgence && <span style={{ fontSize: '13px', color: '#64748b' }}><strong>Nom :</strong> {ens.nom_urgence}</span>}
                                            {ens.telephone_urgence && <span style={{ fontSize: '13px', color: '#64748b' }}><strong>Tél :</strong> {ens.telephone_urgence}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ──── DASHBOARD TAB (PREMIUM) ──── */}
                    {activeTab === 'dashboard' && (
                        <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {/* Dashboard Header */}
                            <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b, #334155)', borderRadius: '24px', padding: '32px', marginBottom: '24px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: '-40px', right: '-20px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(245,158,11,0.08)' }} />
                                <div style={{ position: 'absolute', bottom: '-50px', left: '30%', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(99,102,241,0.06)' }} />
                                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Activity size={28} />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900 }}>Mon Dashboard</h2>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.7 }}>
                                            {theme.msgEnseignant || `Bienvenue ${ens.prenom} — Synthèse de vos activités pédagogiques`}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Cards — Premium Lucide Icons */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                {[
                                    { label: 'Total Élèves', value: stats.total_eleves, icon: <GraduationCap size={24} />, color: '#3b82f6', bg: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '#93c5fd' },
                                    { label: 'Heures / Semaine', value: `${stats.total_heures}h`, icon: <Clock size={24} />, color: '#10b981', bg: 'linear-gradient(135deg, #f0fdf4, #d1fae5)', border: '#6ee7b7' },
                                    { label: 'Mes Classes', value: stats.nb_classes, icon: <Building2 size={24} />, color: '#f59e0b', bg: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '#fcd34d' },
                                    { label: 'Mes Matières', value: stats.nb_matieres, icon: <BookOpen size={24} />, color: primaryColor, bg: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '#c4b5fd' },
                                ].map((s, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                                        style={{
                                            background: s.bg, borderRadius: '18px', padding: '24px',
                                            border: `1px solid ${s.border}`, cursor: 'pointer',
                                            transition: 'all 0.25s',
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 28px ${s.color}20`; }}
                                        onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
                                                <p style={{ margin: '8px 0 0', fontSize: '32px', fontWeight: 900, color: '#0f172a' }}>{s.value}</p>
                                            </div>
                                            <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, boxShadow: `0 4px 12px ${s.color}15` }}>
                                                {s.icon}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Charge horaire par niveau (Visual Progress) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                                <div style={{ background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor }}>
                                            <Target size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Répartition par Classe</h3>
                                    </div>
                                    {uniqueClasses.map((uCls, i) => {
                                        const c = getSlotColor(i);
                                        const classAffs = affectations.filter(a => a.classe_id === uCls.classe_id);
                                        const classHeures = classAffs.reduce((sum, a) => sum + a.heures_semaine, 0);
                                        const pct = stats.total_heures > 0 ? Math.round((classHeures / stats.total_heures) * 100) : 0;
                                        const matieresList = classAffs.map(a => a.matiere).join(', ');
                                        return (
                                            <div key={uCls.classe_id} style={{ marginBottom: '14px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{uCls.classe} <span style={{fontSize: '11px', color: '#94a3b8', fontWeight: 400}}>({matieresList})</span></span>
                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: c.border }}>{classHeures}h ({pct}%)</span>
                                                </div>
                                                <div style={{ height: '8px', borderRadius: '4px', background: '#f1f5f9', overflow: 'hidden' }}>
                                                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}
                                                        style={{ height: '100%', borderRadius: '4px', background: `linear-gradient(135deg, ${c.border}, ${c.text})` }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Notes Overview */}
                                <div style={{ background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                            <BarChart3 size={18} />
                                        </div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Notes Saisies</h3>
                                    </div>
                                    {uniqueClasses.map((uCls, i) => {
                                        const c = getSlotColor(i);
                                        const classAffs = affectations.filter(a => a.classe_id === uCls.classe_id);
                                        const totalNotes = classAffs.reduce((sum, a) => sum + a.nb_notes, 0);
                                        const matieresList = classAffs.map(a => a.matiere).join(', ');
                                        const isExpanded = expandedNotesClasse === uCls.classe_id;
                                        return (
                                            <div key={uCls.classe_id} style={{ borderBottom: i < uniqueClasses.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                                <div onClick={() => setExpandedNotesClasse(isExpanded ? null : uCls.classe_id)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0', cursor: 'pointer' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.border, fontWeight: 800, fontSize: '14px' }}>
                                                        {totalNotes}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{uCls.classe}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{matieresList} • {uCls.effectif} élèves</p>
                                                    </div>
                                                    <span style={{
                                                        padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                                        background: totalNotes > 0 ? '#d1fae5' : '#fee2e2',
                                                        color: totalNotes > 0 ? '#059669' : '#dc2626',
                                                    }}>{totalNotes > 0 ? `${totalNotes} notes` : 'Aucune'}</span>
                                                    <ChevronRight size={14} color='#94a3b8' style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                </div>
                                                {isExpanded && (
                                                    <div style={{ paddingLeft: '54px', paddingBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {classAffs.map(a => (
                                                            <div key={a.affectation_id} 
                                                                onClick={() => { loadClassForNotes(a); setActiveTab('notes'); }}
                                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', transition: 'background 0.2s' }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}>
                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{a.matiere}</span>
                                                                <span style={{
                                                                    padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                                                    background: a.nb_notes > 0 ? '#d1fae5' : '#fef2f2',
                                                                    color: a.nb_notes > 0 ? '#059669' : '#dc2626'
                                                                }}>{a.nb_notes > 0 ? `${a.nb_notes} note${a.nb_notes > 1 ? 's' : ''}` : 'Aucune'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Performance Table */}
                            <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '24px' }}>
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                                        <Zap size={18} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Performance par Classe</h3>
                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>Détail des affectations et activités</p>
                                    </div>
                                </div>
                                <div className="table-scroll" style={{ padding: '0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '600px' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Classe</th>
                                                <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Matière</th>
                                                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Effectif</th>
                                                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Heures/sem</th>
                                                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Notes saisies</th>
                                                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Coef.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {uniqueClasses.map((uCls, i) => {
                                                const c = getSlotColor(i);
                                                const classAffs = affectations.filter(a => a.classe_id === uCls.classe_id);
                                                const isExpanded = expandedPerfClasse === uCls.classe_id;
                                                return (
                                                    <React.Fragment key={uCls.classe_id}>
                                                        <tr onClick={() => setExpandedPerfClasse(isExpanded ? null : uCls.classe_id)}
                                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isExpanded ? '#f8faff' : 'transparent' }}
                                                            onMouseEnter={ev => !isExpanded && (ev.currentTarget.style.background = '#fafaff')}
                                                            onMouseLeave={ev => !isExpanded && (ev.currentTarget.style.background = 'transparent')}>
                                                            <td style={{ padding: '14px 20px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <ChevronRight size={14} color={c.border} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.border, flexShrink: 0 }} />
                                                                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{uCls.classe}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '14px 20px' }}>
                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                    {classAffs.map(a => (
                                                                        <span key={a.affectation_id} style={{ padding: '2px 8px', borderRadius: '6px', background: c.bg, color: c.text, fontSize: '11px', fontWeight: 600 }}>{a.matiere}</span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#3b82f6' }}>{uCls.effectif}</td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600 }}>{classAffs.reduce((s,a) => s+a.heures_semaine,0)}h</td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                                <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: classAffs.reduce((s,a) => s+a.nb_notes,0) > 0 ? '#f0fdf4' : '#fef2f2', color: classAffs.reduce((s,a) => s+a.nb_notes,0) > 0 ? '#10b981' : '#ef4444' }}>{classAffs.reduce((s,a) => s+a.nb_notes,0)}</span>
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600 }}>{classAffs.reduce((s,a) => s+(Number(a.coefficient)||0),0)}</td>
                                                        </tr>
                                                        {isExpanded && classAffs.map((a, ai) => {
                                                            const ac = getSlotColor(affectations.indexOf(a));
                                                            return (
                                                                <tr key={a.affectation_id} 
                                                                    onClick={() => { loadClassForNotes(a); setActiveTab('notes'); }}
                                                                    style={{ background: '#fafafa', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                                                                    onMouseEnter={ev => ev.currentTarget.style.background = '#f1f5f9'}
                                                                    onMouseLeave={ev => ev.currentTarget.style.background = '#fafafa'}>
                                                                    <td style={{ padding: '10px 20px 10px 44px', fontSize: '12px', color: '#64748b' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: ac.border, flexShrink: 0 }} />
                                                                            <span style={{ fontWeight: 600, color: '#475569' }}></span>
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ padding: '10px 16px' }}>
                                                                        <span style={{ padding: '3px 10px', borderRadius: '6px', background: ac.bg, color: ac.text, fontSize: '12px', fontWeight: 700 }}>{a.matiere}</span>
                                                                    </td>
                                                                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{uCls.effectif}</td>
                                                                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{a.heures_semaine}h</td>
                                                                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                                                        <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: a.nb_notes > 0 ? '#d1fae5' : '#fef2f2', color: a.nb_notes > 0 ? '#059669' : '#dc2626' }}>{a.nb_notes}</span>
                                                                    </td>
                                                                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{a.coefficient}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Quick Actions — Premium with Lucide Icons */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                                {[
                                    { label: 'Saisir des Notes', icon: <FileText size={22} color="white" />, desc: 'Évaluations & notes', tab: 'notes' as const, gradient: `linear-gradient(135deg, ${accentColor}, ${primaryColor})` },
                                    { label: 'Faire l\'Appel', icon: <ClipboardList size={22} color="white" />, desc: 'Présences du jour', tab: 'appel' as const, gradient: 'linear-gradient(135deg, #10b981, #059669)' },
                                    { label: 'Emploi du Temps', icon: <Calendar size={22} color="white" />, desc: 'Mon planning', tab: 'emploi' as const, gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
                                    { label: 'Messages', icon: <MailIcon size={22} color="white" />, desc: `${messages.filter(m => m.statut === 'ENVOYE' && m.expediteur_type === 'ADMIN').length} non lu(s)`, tab: 'messages' as const, gradient: 'linear-gradient(135deg, #ec4899, #db2777)' },
                                ].map((action, i) => (
                                    <motion.button key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}
                                        onClick={() => setActiveTab(action.tab)}
                                        style={{
                                            background: 'white', borderRadius: '18px', padding: '24px', border: '1px solid #f1f5f9',
                                            cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                            transition: 'all 0.25s',
                                        }}
                                        onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-3px)'; ev.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.12)'; }}
                                        onMouseLeave={ev => { ev.currentTarget.style.transform = ''; ev.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
                                        <div style={{
                                            width: '48px', height: '48px', borderRadius: '14px', background: action.gradient,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        }}>{action.icon}</div>
                                        <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{action.label}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>{action.desc}</p>
                                    </motion.button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* ──── EMPLOI DU TEMPS TAB ──── */}
                    {activeTab === 'emploi' && (
                        <motion.div key="emploi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar size={18} /> Mon Emploi du Temps</h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>{edtSlots.length} créneaux programmés</p>
                                </div>
                                <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>Année en cours</span>
                            </div>
                            <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
                                {edtLoading ? (
                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                        <Loader2 size={32} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite' }} />
                                        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>Chargement...</p>
                                    </div>
                                ) : edtSlots.length === 0 ? (
                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                        <Calendar size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                                        <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Aucun créneau programmé</p>
                                    </div>
                                ) : (
                                    <div className="table-scroll">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ padding: '10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'center', width: '70px', borderBottom: '2px solid #f1f5f9' }}>HEURE</th>
                                                {JOURS.map(j => <th key={j} style={{ padding: '10px', fontSize: '12px', fontWeight: 700, color: '#475569', textAlign: 'center', borderBottom: '2px solid #f1f5f9' }}>{DISPO_JOURS_L[j] || j}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lignesHoraires.map(({ debut: h, fin: endH }) => {
                                                // Bandeau de pause avant le créneau qui suit la fin d'une pause,
                                                // exactement comme la grille de l'administration.
                                                const pauses = horaires.pauses?.length ? horaires.pauses : [{ debut: horaires.pauseDebut, fin: horaires.pauseFin }];
                                                const pauseAvant = pauses.find(p => p.fin === h);
                                                return (
                                                    <Fragment key={h}>
                                                    {pauseAvant && (
                                                        <tr key={`pause-${pauseAvant.debut}`}>
                                                            <td colSpan={JOURS.length + 1} style={{ padding: '6px', textAlign: 'center', background: '#fef3c7', fontSize: '11px', color: '#92400e', fontWeight: 700 }}>
                                                                <Utensils size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {pauseAvant.debut} — {pauseAvant.fin} • Pause
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                                                        <td style={{ padding: '8px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, verticalAlign: 'top' }}>
                                                            {h}<br /><span style={{ fontSize: '10px' }}>{endH}</span>
                                                        </td>
                                                        {JOURS.map(j => {
                                                            const slot = edtSlots.find(s => s.jour.toUpperCase() === j.toUpperCase() && s.heure_debut.slice(0, 5) === h);
                                                            if (!slot) return <td key={j} style={{ padding: '4px' }} />;
                                                            const ci = Math.max(0, affectations.findIndex(a => a.classe === slot.classe && a.matiere === slot.matiere));
                                                            const colors = getSlotColor(ci);
                                                            return (
                                                                <td key={j} style={{ padding: '4px' }}>
                                                                    <div style={{
                                                                        padding: '8px 10px', borderRadius: '10px', background: colors.bg,
                                                                        borderLeft: `3px solid ${colors.border}`, minHeight: '50px',
                                                                    }}>
                                                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: colors.text }}>{slot.matiere}</p>
                                                                        <p style={{ margin: '2px 0 0', fontSize: '10px', color: colors.text, opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={10} /> {slot.classe}</p>
                                                                        {slot.salle && <p style={{ margin: '2px 0 0', fontSize: '10px', color: colors.text, opacity: 0.5, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><School size={10} /> {slot.salle}</p>}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ──── MES CLASSES TAB ──── */}
                    {activeTab === 'classes' && (
                        <motion.div key="classes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {!selectedClass ? (
                                /* Class selection grid */
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                    {uniqueClasses.map((uCls, i) => {
                                        const c = getSlotColor(i);
                                        const classAffs = affectations.filter(x => x.classe_id === uCls.classe_id);
                                        const matieresList = classAffs.map(x => x.matiere).join(', ');
                                        const totalHeures = classAffs.reduce((sum, x) => sum + x.heures_semaine, 0);
                                        const totalCoeff = classAffs.reduce((sum, x) => sum + (Number(x.coefficient) || 0), 0);

                                        return (
                                            <motion.div key={uCls.affectation_id} whileHover={{ scale: 1.02, y: -3 }}
                                                onClick={() => loadClassEleves(uCls)}
                                                style={{ background: 'white', borderRadius: '18px', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', transition: 'all 0.2s' }}>
                                                <div style={{ background: `linear-gradient(135deg, ${c.border}, ${c.text})`, padding: '20px', color: 'white' }}>
                                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{uCls.classe}</h3>
                                                    <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.8 }}>{matieresList}</p>
                                                </div>
                                                <div style={{ padding: '16px 20px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                                                        <div>
                                                            <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: c.border }}>{uCls.effectif}</p>
                                                            <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>Élèves</p>
                                                        </div>
                                                        <div>
                                                            <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: c.border }}>{totalHeures}</p>
                                                            <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>h/sem</p>
                                                        </div>
                                                        <div>
                                                            <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: c.border }}>{totalCoeff}</p>
                                                            <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>Coeff</p>
                                                        </div>
                                                    </div>
                                                    <button style={{
                                                        width: '100%', padding: '10px', marginTop: '12px', borderRadius: '10px',
                                                        border: `1px solid ${c.border}`, background: c.bg, color: c.text,
                                                        fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    }}>
                                                        <Users size={14} /> Voir les élèves <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                    {affectations.length === 0 && (
                                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                            <Users size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                            <p style={{ fontSize: '15px', fontWeight: 600 }}>Aucune classe affectée</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Student list for selected class */
                                <div>
                                    <button onClick={() => setSelectedClass(null)}
                                        style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        ← Retour aux classes
                                    </button>

                                    <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><GraduationCap size={18} /> {selectedClass.classe} — {selectedClass.matiere}</h3>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>{classEleves.length} élèves inscrits</p>
                                            </div>
                                        </div>

                                        {elevesLoading ? (
                                            <div style={{ padding: '40px', textAlign: 'center' }}>
                                                <Loader2 size={32} style={{ color: '#f59e0b', animation: 'spin 1s linear infinite' }} />
                                            </div>
                                        ) : (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'left' }}>#</th>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'left' }}>ÉLÈVE</th>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'left' }}>MATRICULE</th>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'center' }}>SEXE</th>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'center' }}>NOTES</th>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'center' }}>MOYENNE</th>
                                                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'center' }}>ABSENCES</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {classEleves.slice((elevesPage - 1) * ELEVES_PAGE_SIZE, elevesPage * ELEVES_PAGE_SIZE).map((el, i) => (
                                                            <tr key={el.eleve_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#94a3b8' }}>{(elevesPage - 1) * ELEVES_PAGE_SIZE + i + 1}</td>
                                                                <td style={{ padding: '12px 16px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: el.sexe === 'F' ? '#fce7f3' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: el.sexe === 'F' ? '#ec4899' : '#3b82f6' }}>
                                                                            {el.prenom[0]}{el.nom[0]}
                                                                        </div>
                                                                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{el.prenom} {el.nom}</span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{el.matricule}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '12px', textAlign: 'center' }}>
                                                                    <span style={{ padding: '2px 8px', borderRadius: '6px', background: el.sexe === 'F' ? '#fce7f3' : '#eff6ff', color: el.sexe === 'F' ? '#ec4899' : '#3b82f6', fontSize: '11px', fontWeight: 600 }}>{el.sexe === 'F' ? '♀' : '♂'}</span>
                                                                </td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, textAlign: 'center', color: '#475569' }}>{el.nb_notes}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 800, textAlign: 'center', color: el.moyenne === null ? '#94a3b8' : el.moyenne >= 10 ? '#10b981' : '#ef4444' }}>
                                                                    {el.moyenne !== null ? `${el.moyenne}/20` : '—'}
                                                                </td>
                                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                                    <span style={{ padding: '4px 10px', borderRadius: '8px', background: el.nb_absences > 3 ? '#fef2f2' : '#f0fdf4', color: el.nb_absences > 3 ? '#ef4444' : '#10b981', fontSize: '12px', fontWeight: 700 }}>{el.nb_absences}</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                {classEleves.length === 0 && (
                                                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                                        <GraduationCap size={36} style={{ marginBottom: '8px', opacity: 0.3 }} />
                                                        <p style={{ fontSize: '13px', fontWeight: 600 }}>Aucun élève inscrit dans cette classe</p>
                                                    </div>
                                                )}
                                                <Pagination page={elevesPage} pageSize={ELEVES_PAGE_SIZE} total={classEleves.length} onPageChange={setElevesPage} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                    {/* ──── NOTES TAB ──── */}
                    {activeTab === 'notes' && (
                        <motion.div key="notes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><PenLine size={18} /> Saisie des Notes</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Sélectionnez une classe, nommez l&apos;évaluation, puis saisissez les notes</p>
                                </div>
                                <div style={{ padding: '20px 24px' }}>
                                    {/* Choix de la classe / matière — card grid */}
                                    {!selectedClass ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                            {uniqueClasses.map((uCls, i) => {
                                                const c = getSlotColor(i);
                                                const classAffs = affectations.filter(a => a.classe_id === uCls.classe_id);
                                                const totalNotes = classAffs.reduce((s, a) => s + a.nb_notes, 0);
                                                const totalHeures = classAffs.reduce((s, a) => s + a.heures_semaine, 0);
                                                return (
                                                    <div key={uCls.classe_id} style={{ background: 'white', borderRadius: '18px', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', transition: 'all 0.2s' }}
                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}>
                                                        <div style={{ background: `linear-gradient(135deg, ${c.border}, ${c.text})`, padding: '18px 20px' }}>
                                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'white' }}>{uCls.classe}</h3>
                                                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>{classAffs.length} matière{classAffs.length > 1 ? 's' : ''} • {uCls.effectif} élèves</p>
                                                        </div>
                                                        <div style={{ padding: '14px 20px' }}>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                                                                {classAffs.map(a => {
                                                                    const ac = getSlotColor(affectations.indexOf(a));
                                                                    return (
                                                                        <button key={a.affectation_id} onClick={() => loadClassForNotes(a)}
                                                                            style={{ padding: '6px 14px', borderRadius: '20px', border: `1.5px solid ${ac.border}`, background: ac.bg, color: ac.text, fontWeight: 700, fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s' }}
                                                                            onMouseEnter={e => { e.currentTarget.style.background = ac.border; e.currentTarget.style.color = 'white'; }}
                                                                            onMouseLeave={e => { e.currentTarget.style.background = ac.bg; e.currentTarget.style.color = ac.text; }}>
                                                                            {a.matiere}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                                                                <span>{totalNotes} note{totalNotes > 1 ? 's' : ''} saisie{totalNotes > 1 ? 's' : ''}</span>
                                                                <span>{totalHeures}h/sem</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (<div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button onClick={() => setSelectedClass(null)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            ← Toutes les classes
                                        </button>
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>{selectedClass.classe} — {selectedClass.matiere}</span>
                                    </div>)}

                                    {selectedClass ? (
                                        <div>
                                            {/* L'enseignant CHOISIT une évaluation créée par l'administration
                                                (il n'en crée aucune). Le barème et le type viennent d'elle. */}
                                            <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
                                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}><ClipboardList size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Choisir l&apos;évaluation ou la composition (créée par l&apos;administration)</label>
                                                <select value={selectedEvaluationId || ''}
                                                    onChange={e => { const id = Number(e.target.value) || null; setSelectedEvaluationId(id); if (id) chargerNotesEvaluation(id); else setNotesData({}); }}
                                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', outline: 'none', background: 'white' }}>
                                                    <option value="">— Sélectionner une évaluation —</option>
                                                    {evaluationsDispo.map(ev => (
                                                        <option key={ev.evaluation_id} value={ev.evaluation_id}>
                                                            {ev.libelle}{ev.type_libelle ? ` · ${ev.type_libelle}` : ''}{ev.trimestre ? ` · ${ev.trimestre}` : ''} — /{ev.note_sur}
                                                        </option>
                                                    ))}
                                                </select>
                                                {evaluationsDispo.length === 0 ? (
                                                    <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <AlertTriangle size={14} /> Aucune évaluation créée par l&apos;administration pour cette classe/matière. Elle apparaîtra ici dès qu&apos;elle sera créée.
                                                    </p>
                                                ) : (() => {
                                                    const evSel = evaluationsDispo.find(e => e.evaluation_id === selectedEvaluationId);
                                                    if (!evSel) return null;
                                                    return (
                                                        <p style={{ margin: '10px 0 0', fontSize: '11.5px', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <ClipboardList size={13} />
                                                            {`Barème : /${evSel.note_sur} · Coefficient : ${evSel.coefficient} (configuré par l'administration). Vous saisissez seulement les notes.`}
                                                        </p>
                                                    );
                                                })()}
                                            </div>

                                            {elevesLoading ? (
                                                <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={28} className="animate-spin" color={accentColor} /></div>
                                            ) : classEleves.length > 0 ? (
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                        <thead>
                                                            <tr style={{ background: '#f1f5f9' }}>
                                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Élève</th>
                                                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Matricule</th>
                                                                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Note /{evaluationsDispo.find(e => e.evaluation_id === selectedEvaluationId)?.note_sur ?? 20}</th>
                                                                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Absent</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {classEleves.slice((elevesPage - 1) * ELEVES_PAGE_SIZE, elevesPage * ELEVES_PAGE_SIZE).map((e, i) => {
                                                                const nd = notesData[e.inscription_id] || { valeur: '', absent: false };
                                                                return (
                                                                <tr key={e.eleve_id} style={{ borderBottom: '1px solid #f1f5f9', background: nd.absent ? '#fef2f2' : 'transparent' }}>
                                                                    <td style={{ padding: '10px 16px', color: '#94a3b8', fontWeight: 600 }}>{(elevesPage - 1) * ELEVES_PAGE_SIZE + i + 1}</td>
                                                                    <td style={{ padding: '10px 16px', fontWeight: 600, color: nd.absent ? '#94a3b8' : '#1e293b' }}>{e.prenom} {e.nom}</td>
                                                                    <td style={{ padding: '10px 16px' }}>
                                                                        <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{e.matricule}</code>
                                                                    </td>
                                                                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                                                        <input type="number" min="0" max={evaluationsDispo.find(ev => ev.evaluation_id === selectedEvaluationId)?.note_sur ?? 20} step="0.25" disabled={nd.absent}
                                                                            value={nd.valeur} placeholder="—"
                                                                            onChange={ev => setNotesData(prev => ({ ...prev, [e.inscription_id]: { ...nd, valeur: ev.target.value } }))}
                                                                            style={{
                                                                                width: '70px', padding: '8px 12px', borderRadius: '10px',
                                                                                border: '1px solid #e2e8f0', textAlign: 'center',
                                                                                fontSize: '14px', fontWeight: 700, outline: 'none', opacity: nd.absent ? 0.3 : 1,
                                                                            }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                                                        <input type="checkbox" checked={nd.absent}
                                                                            onChange={ev => setNotesData(prev => ({ ...prev, [e.inscription_id]: { valeur: '', absent: ev.target.checked } }))}
                                                                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ef4444' }} />
                                                                    </td>
                                                                </tr>
                                                            );})}
                                                        </tbody>
                                                    </table>
                                                    <Pagination page={elevesPage} pageSize={ELEVES_PAGE_SIZE} total={classEleves.length} onPageChange={setElevesPage} />
                                                    {notesSaved && (
                                                        <div style={{ padding: '12px 16px', borderRadius: '12px', marginTop: '12px', fontSize: '13px', fontWeight: 600,
                                                            background: notesSaved.includes('succès') ? '#f0fdf4' : '#fef2f2',
                                                            color: notesSaved.includes('succès') ? '#065f46' : '#991b1b',
                                                        }}>{notesSaved}</div>
                                                    )}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', gap: '10px' }}>
                                                        {!selectedEvaluationId && (
                                                            <p style={{ margin: 0, fontSize: '12px', color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={14} /> Choisissez une évaluation pour activer le bouton</p>
                                                        )}
                                                        {selectedEvaluationId && <div />}
                                                        <button onClick={saveNotes} disabled={notesLoading || !selectedEvaluationId}
                                                            style={{
                                                                padding: '12px 28px', borderRadius: '12px', border: 'none',
                                                                background: !selectedEvaluationId ? '#cbd5e1' : `linear-gradient(135deg, ${accentColor}, ${primaryColor})`,
                                                                color: 'white', fontWeight: 700, fontSize: '14px', cursor: !selectedEvaluationId ? 'not-allowed' : 'pointer',
                                                                boxShadow: !selectedEvaluationId ? 'none' : '0 4px 12px rgba(99,102,241,0.3)',
                                                                opacity: notesLoading ? 0.6 : 1, transition: 'all 0.2s',
                                                            }}>
                                                            {notesLoading ? 'Enregistrement...' : 'Enregistrer les notes'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                                    <GraduationCap size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                                    <p style={{ fontSize: '13px', fontWeight: 600 }}>Aucun élève dans cette classe</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                            <FileText size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
                                            <p style={{ fontSize: '14px', fontWeight: 600 }}>Sélectionnez une classe ci-dessus</p>
                                            <p style={{ fontSize: '12px' }}>pour commencer la saisie des notes</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* ── Historique des évaluations ── */}
                            <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginTop: '20px' }}>
                                <div onClick={() => setShowEvalHistory(!showEvalHistory)}
                                    style={{ padding: '16px 24px', borderBottom: showEvalHistory ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><BarChart3 size={16} /> Historique des évaluations</h3>
                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>{evalHistory.length} évaluation(s) enregistrée(s)</p>
                                    </div>
                                    <ChevronDown size={18} color="#94a3b8" style={{ transition: 'transform 0.2s', transform: showEvalHistory ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                </div>
                                {showEvalHistory && (
                                    <div style={{ padding: '0 24px 16px' }}>
                                        {evalHistory.length > 0 ? (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Date</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Évaluation</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Classe</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Matière</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Notes</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Moyenne</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Statut</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {evalHistory.map((ev: any) => (
                                                            <tr key={ev.evaluation_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '10px 12px', color: '#64748b' }}>{ev.date_evaluation ? new Date(ev.date_evaluation).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'}</td>
                                                                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{ev.libelle}</td>
                                                                <td style={{ padding: '10px 12px' }}><span style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, fontSize: '11px' }}>{ev.classe}</span></td>
                                                                <td style={{ padding: '10px 12px', color: '#475569' }}>{ev.matiere}</td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{ev.nb_notes}</td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                                    {ev.moyenne != null ? (
                                                                        <span style={{ background: ev.moyenne >= 10 ? '#f0fdf4' : '#fef2f2', color: ev.moyenne >= 10 ? '#10b981' : '#ef4444', padding: '3px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '12px' }}>{ev.moyenne}/{ev.note_sur}</span>
                                                                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                                                                </td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                                                        background: ev.statut === 'CENTRALISEE' ? '#ecfdf5' : ev.statut === 'PUBLIEE' ? '#eff6ff' : '#f8fafc',
                                                                        color: ev.statut === 'CENTRALISEE' ? '#059669' : ev.statut === 'PUBLIEE' ? '#3b82f6' : '#64748b',
                                                                    }}>{ev.statut === 'CENTRALISEE' ? 'Centralisée' : ev.statut === 'PUBLIEE' ? 'Publiée' : ev.statut}</span>
                                                                </td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                                    <button onClick={() => openEvalDetail(ev.evaluation_id)}
                                                                        style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 700, cursor: 'pointer', color: accentColor }}>
                                                                        <Eye size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Détail
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>Aucune évaluation pour le moment</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ═══ EVAL DETAIL MODAL ═══ */}
                            {showEvalDetail && (
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                                    onClick={() => setShowEvalDetail(false)}>
                                    <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '900px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                                        onClick={e => e.stopPropagation()}>
                                        {evalDetailLoading ? (
                                            <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={32} className="animate-spin" color={accentColor} /><p style={{ marginTop: '12px', color: '#64748b' }}>Chargement...</p></div>
                                        ) : evalDetailData ? (
                                            <>
                                                {/* Header */}
                                                <div style={{ padding: '20px 28px', background: `linear-gradient(135deg, ${accentColor}, ${primaryColor})`, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{evalDetailData.evaluation.libelle}</h2>
                                                <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.85 }}>{evalDetailData.evaluation.classe} • {evalDetailData.evaluation.matiere} • {evalDetailData.evaluation.trimestre}</p>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                                    background: evalDetailData.evaluation.statut === 'CENTRALISEE' ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.2)', color: 'white' }}>
                                                    {evalDetailData.evaluation.statut === 'CENTRALISEE' ? 'Centralisée' : evalDetailData.evaluation.statut}
                                                </span>
                                                <button onClick={() => setShowEvalDetail(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <X size={16} color="white" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Stats bar */}
                                        <div style={{ padding: '12px 28px', background: '#f8fafc', display: 'flex', gap: '20px', borderBottom: '1px solid #e2e8f0' }}>
                                            {[{ label: 'Élèves', value: evalDetailData.stats.total_eleves, color: accentColor },
                                              { label: 'Notes saisies', value: evalDetailData.stats.nb_notes_saisies, color: '#10b981' },
                                              { label: 'Absents', value: evalDetailData.stats.nb_absents, color: '#ef4444' },
                                              { label: 'Moyenne', value: evalDetailData.stats.moyenne ? `${evalDetailData.stats.moyenne}/${evalDetailData.evaluation.note_sur}` : '—', color: '#f59e0b' },
                                              { label: 'Min', value: evalDetailData.stats.note_min ?? '—', color: '#94a3b8' },
                                              { label: 'Max', value: evalDetailData.stats.note_max ?? '—', color: '#059669' },
                                            ].map((s, i) => (
                                                <div key={i} style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '16px', fontWeight: 800, color: s.color }}>{s.value}</div>
                                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Notes table */}
                                        <div className="table-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '620px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '11px' }}>#</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '11px' }}>ÉLÈVE</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '11px' }}>MATRICULE</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '11px' }}>NOTE /{evalDetailData.evaluation.note_sur}</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '11px' }}>ABSENT</th>
                                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '11px' }}>OBSERVATION</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(evalDetailData.notes || []).map((n: any, idx: number) => {
                                                        const ed = editingNotes[n.note_id] || { valeur: '', absent: false, observation: '' };
                                                        const isCentralized = evalDetailData.evaluation.statut === 'CENTRALISEE';
                                                        return (
                                                            <tr key={n.note_id} style={{ borderBottom: '1px solid #f1f5f9', background: ed.absent ? '#fef2f2' : 'transparent' }}>
                                                                <td style={{ padding: '8px 16px', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                                                                <td style={{ padding: '8px 16px', fontWeight: 600, color: ed.absent ? '#94a3b8' : '#1e293b' }}>
                                                                    {n.prenom} {n.nom}
                                                                    <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '6px' }}>{n.sexe === 'M' ? '♂' : '♀'}</span>
                                                                </td>
                                                                <td style={{ padding: '8px 16px' }}>
                                                                    <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{n.matricule}</code>
                                                                </td>
                                                                <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                                                    {isCentralized ? (
                                                                        <span style={{ fontWeight: 700, color: (n.valeur ?? 0) >= 10 ? '#10b981' : '#ef4444' }}>{n.valeur ?? '—'}</span>
                                                                    ) : (
                                                                        <input type="number" min="0" max={evalDetailData.evaluation.note_sur} step="0.25" disabled={ed.absent}
                                                                            value={ed.valeur} placeholder="—"
                                                                            onChange={ev => setEditingNotes(prev => ({ ...prev, [n.note_id]: { ...ed, valeur: ev.target.value } }))}
                                                                            style={{ width: '65px', padding: '6px 8px', borderRadius: '8px', border: '1.5px solid #e2e8f0', textAlign: 'center', fontSize: '13px', fontWeight: 700, outline: 'none', opacity: ed.absent ? 0.3 : 1 }} />
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                                                    {isCentralized ? (
                                                                        <span>{ed.absent ? <XCircle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> : '—'}</span>
                                                                    ) : (
                                                                        <input type="checkbox" checked={ed.absent}
                                                                            onChange={ev => setEditingNotes(prev => ({ ...prev, [n.note_id]: { ...ed, absent: ev.target.checked, valeur: ev.target.checked ? '' : ed.valeur } }))}
                                                                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#ef4444' }} />
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '8px 16px' }}>
                                                                    {isCentralized ? (
                                                                        <span style={{ fontSize: '12px', color: '#64748b' }}>{n.observation || '—'}</span>
                                                                    ) : (
                                                                        <input type="text" value={ed.observation} placeholder="Optionnel..."
                                                                            onChange={ev => setEditingNotes(prev => ({ ...prev, [n.note_id]: { ...ed, observation: ev.target.value } }))}
                                                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', minWidth: '120px' }} />
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Footer with action buttons */}
                                        <div style={{ padding: '16px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbff' }}>
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>Note sur {evalDetailData.evaluation.note_sur} • Coef {evalDetailData.evaluation.coefficient}</span>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                {evalDetailData.evaluation.statut !== 'CENTRALISEE' && (
                                                    <>
                                                        <button onClick={saveEvalNotes} disabled={savingNotes}
                                                            style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b' }}>
                                                            <Save size={14} /> {savingNotes ? 'Sauvegarde...' : 'Enregistrer les Modifications'}
                                                        </button>
                                                        <button onClick={centralizeEval} disabled={centralizingEval}
                                                            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: showConfirmCentralize ? 'linear-gradient(135deg, #dc2626, #ef4444)' : 'linear-gradient(135deg, #059669, #10b981)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: showConfirmCentralize ? '0 4px 12px rgba(220,38,38,0.3)' : '0 4px 12px rgba(5,150,105,0.3)', transition: 'all 0.3s' }}>
                                                            <Send size={14} /> {centralizingEval ? 'Centralisation...' : showConfirmCentralize ? 'Confirmer la centralisation ?' : 'Centraliser vers Admin'}
                                                        </button>
                                                        {showConfirmCentralize && (
                                                            <button onClick={() => setShowConfirmCentralize(false)}
                                                                style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
                                                                Annuler
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                                {evalDetailData.evaluation.statut === 'CENTRALISEE' && (
                                                    <div style={{ padding: '10px 20px', borderRadius: '10px', background: '#ecfdf5', color: '#065f46', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <CheckCircle size={14} /> Notes envoyées à l&apos;administration
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                                    </div>
                                </div>
                            )}

                        </motion.div>
                    )}

                    {/* ──── APPEL TAB ──── */}
                    {activeTab === 'appel' && (
                        <motion.div key="appel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} /> Faire l&apos;Appel</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Sélectionnez une classe pour l&apos;appel</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <select value={appelDemiJournee} onChange={e => setAppelDemiJournee(e.target.value)}
                                            style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                            <option value="MATIN">Matin</option>
                                            <option value="APRES_MIDI">Après-midi</option>
                                        </select>
                                        <span style={{ fontSize: '12px', color: accentColor, fontWeight: 600 }}>
                                            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ padding: '20px 24px' }}>
                                    {/* Class selection — card grid like Mes Classes */}
                                    {!selectedClass ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                            {uniqueClasses.map((uCls, i) => {
                                                const c = getSlotColor(i);
                                                const classAffs = affectations.filter(a => a.classe_id === uCls.classe_id);
                                                const matieresList = classAffs.map(a => a.matiere).join(', ');
                                                const totalHeures = classAffs.reduce((s, a) => s + a.heures_semaine, 0);
                                                return (
                                                    <div key={uCls.classe_id}
                                                        onClick={() => loadClassForAppel(uCls)}
                                                        style={{ background: 'white', borderRadius: '18px', overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', transition: 'all 0.2s' }}
                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}>
                                                        <div style={{ background: `linear-gradient(135deg, ${c.border}, ${c.text})`, padding: '18px 20px', color: 'white' }}>
                                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{uCls.classe}</h3>
                                                            <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.85 }}>{matieresList}</p>
                                                        </div>
                                                        <div style={{ padding: '14px 20px' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '12px' }}>
                                                                <div>
                                                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: c.border }}>{uCls.effectif}</p>
                                                                    <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>Élèves</p>
                                                                </div>
                                                                <div>
                                                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: c.border }}>{totalHeures}</p>
                                                                    <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>h/sem</p>
                                                                </div>
                                                                <div>
                                                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: c.border }}>{classAffs.length}</p>
                                                                    <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8' }}>matières</p>
                                                                </div>
                                                            </div>
                                                            <button style={{ width: '100%', padding: '8px', borderRadius: '10px', border: `1px solid ${c.border}`, background: c.bg, color: c.text, fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                Faire l’appel →
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button onClick={() => setSelectedClass(null)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
                                                ← Toutes les classes
                                            </button>
                                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>{selectedClass.classe}</span>
                                        </div>
                                    )}

                                    {selectedClass ? (
                                        <div>
                                            {elevesLoading ? (
                                                <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={28} className="animate-spin" color="#10b981" /></div>
                                            ) : classEleves.length > 0 ? (
                                                <div>
                                                    {/* Summary bar — dynamic */}
                                                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                                        <div style={{ flex: 1, background: '#f0fdf4', borderRadius: '12px', padding: '12px 16px', textAlign: 'center' }}>
                                                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#10b981' }}>
                                                                {Object.values(appelData).filter(s => s === 'PRESENT').length}
                                                            </p>
                                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#065f46' }}>Présents</p>
                                                        </div>
                                                        <div style={{ flex: 1, background: '#fef2f2', borderRadius: '12px', padding: '12px 16px', textAlign: 'center' }}>
                                                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#ef4444' }}>
                                                                {Object.values(appelData).filter(s => s === 'ABSENT').length}
                                                            </p>
                                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#991b1b' }}>Absents</p>
                                                        </div>
                                                        <div style={{ flex: 1, background: '#fffbeb', borderRadius: '12px', padding: '12px 16px', textAlign: 'center' }}>
                                                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f59e0b' }}>
                                                                {Object.values(appelData).filter(s => s === 'RETARD').length}
                                                            </p>
                                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#92400e' }}>Retards</p>
                                                        </div>
                                                    </div>

                                                    <div style={{ overflowX: 'auto' }}>
                                                        {classEleves.slice((elevesPage - 1) * ELEVES_PAGE_SIZE, elevesPage * ELEVES_PAGE_SIZE).map((e, i) => {
                                                            const currentStatus = appelData[e.inscription_id] || 'PRESENT';
                                                            return (
                                                            <div key={e.eleve_id} style={{
                                                                display: 'flex', alignItems: 'center', gap: '14px',
                                                                padding: '12px 16px', borderBottom: '1px solid #f8fafc',
                                                                borderRadius: '10px', transition: 'background 0.15s',
                                                                background: currentStatus === 'ABSENT' ? '#fef2f208' : 'transparent',
                                                            }}>
                                                                <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: '12px', minWidth: '24px' }}>{(elevesPage - 1) * ELEVES_PAGE_SIZE + i + 1}</span>
                                                                <div style={{
                                                                    width: '36px', height: '36px', borderRadius: '50%',
                                                                    background: `${CLASS_COLORS[i % CLASS_COLORS.length]}15`,
                                                                    color: CLASS_COLORS[i % CLASS_COLORS.length],
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    fontWeight: 700, fontSize: '13px', flexShrink: 0,
                                                                }}>{e.prenom.charAt(0)}{e.nom.charAt(0)}</div>
                                                                <div style={{ flex: 1 }}>
                                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{e.prenom} {e.nom}</p>
                                                                    <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{e.matricule}</p>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    {([
                                                                        { label: 'P', value: 'PRESENT', color: '#10b981', bg: '#f0fdf4' },
                                                                        { label: 'A', value: 'ABSENT', color: '#ef4444', bg: '#fef2f2' },
                                                                        { label: 'R', value: 'RETARD', color: '#f59e0b', bg: '#fffbeb' },
                                                                    ] as const).map(btn => {
                                                                        const isActive = currentStatus === btn.value;
                                                                        return (
                                                                            <button key={btn.label} title={btn.value}
                                                                                onClick={() => setAppelData(prev => ({ ...prev, [e.inscription_id]: btn.value }))}
                                                                                style={{
                                                                                    width: '34px', height: '34px', borderRadius: '10px',
                                                                                    border: isActive ? 'none' : `1px solid ${btn.color}30`,
                                                                                    background: isActive ? btn.color : btn.bg,
                                                                                    color: isActive ? 'white' : btn.color,
                                                                                    fontWeight: 800, fontSize: '13px',
                                                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                                                    boxShadow: isActive ? `0 2px 8px ${btn.color}40` : 'none',
                                                                                }}>{btn.label}</button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );})}
                                                    </div>
                                                    <Pagination page={elevesPage} pageSize={ELEVES_PAGE_SIZE} total={classEleves.length} onPageChange={setElevesPage} />
                                                    {appelSaved && (
                                                        <div style={{ padding: '12px 16px', borderRadius: '12px', marginTop: '12px', fontSize: '13px', fontWeight: 600,
                                                            background: appelSaved.includes('succès') ? '#f0fdf4' : '#fef2f2',
                                                            color: appelSaved.includes('succès') ? '#065f46' : '#991b1b',
                                                        }}>{appelSaved}</div>
                                                    )}
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0', gap: '10px' }}>
                                                        <button onClick={saveAppel} disabled={appelLoading}
                                                            style={{
                                                                padding: '12px 24px', borderRadius: '12px', border: 'none',
                                                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                                                color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                                                                boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                                                                opacity: appelLoading ? 0.6 : 1,
                                                            }}>
                                                            {appelLoading ? 'Enregistrement...' : 'Valider l\'appel'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                                    <Users size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                                    <p style={{ fontSize: '13px', fontWeight: 600 }}>Aucun élève dans cette classe</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                            <ClipboardList size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
                                            <p style={{ fontSize: '14px', fontWeight: 600 }}>Sélectionnez une classe ci-dessus</p>
                                            <p style={{ fontSize: '12px' }}>pour commencer l&apos;appel</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* ── Historique des appels ── */}
                            <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginTop: '20px' }}>
                                <div onClick={() => setShowAppelHistory(!showAppelHistory)}
                                    style={{ padding: '16px 24px', borderBottom: showAppelHistory ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><ClipboardList size={16} /> Historique des appels (30 derniers jours)</h3>
                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>{appelHistory.length} appel(s) enregistré(s)</p>
                                    </div>
                                    <ChevronDown size={18} color="#94a3b8" style={{ transition: 'transform 0.2s', transform: showAppelHistory ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                </div>
                                {showAppelHistory && (
                                    <div style={{ padding: '0 24px 16px' }}>
                                        {appelHistory.length > 0 ? (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Date</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Classe</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Session</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>Présents</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#ef4444' }}>Absents</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#f59e0b' }}>Retards</th>
                                                            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {appelHistory.map((a: any, i: number) => (
                                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{new Date(a.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                                                <td style={{ padding: '10px 12px' }}><span style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 8px', borderRadius: '6px', fontWeight: 600, fontSize: '11px' }}>{a.classe}</span></td>
                                                                <td style={{ padding: '10px 12px', color: '#64748b' }}>{a.demi_journee === 'MATIN' ? 'Matin' : 'Après-midi'}</td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ background: '#f0fdf4', color: '#10b981', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>{a.presents}</span></td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ background: a.absents > 0 ? '#fef2f2' : '#f8fafc', color: a.absents > 0 ? '#ef4444' : '#94a3b8', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>{a.absents}</span></td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center' }}><span style={{ background: a.retards > 0 ? '#fffbeb' : '#f8fafc', color: a.retards > 0 ? '#f59e0b' : '#94a3b8', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>{a.retards}</span></td>
                                                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{a.total}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '13px' }}>Aucun appel enregistré pour le moment</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ──── MES SÉANCES TAB ──── */}
                    {activeTab === 'seances' && (
                        <motion.div key="seances" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <MesSeances enseignantId={ens.enseignant_id} primaryColor={primaryColor} accentColor={accentColor} affectations={affectations} />
                        </motion.div>
                    )}

                    {/* ──── MESSAGES TAB ──── */}
                    {activeTab === 'messages' && (
                        <motion.div key="messages" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: selectedMessage ? '380px 1fr' : '1fr', gap: '20px' }}>
                                {/* Message list */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><MailIcon size={18} /> Centre de Communication</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                            {messages.filter(m => m.statut === 'ENVOYE' && m.expediteur_type === 'ADMIN').length} message(s) non lu(s)
                                        </p>
                                        {/* Filters */}
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                                            {['TOUS', 'EMPLOI', 'EXAMENS', 'GENERAL', 'REUNION', 'DISCIPLINE'].map(f => (
                                                <button key={f} onClick={() => setMsgFilter(f)}
                                                    style={{
                                                        padding: '4px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                                        background: msgFilter === f ? '#6366f1' : '#f1f5f9',
                                                        color: msgFilter === f ? 'white' : '#64748b',
                                                        fontSize: '11px', fontWeight: 700, transition: 'all 0.15s',
                                                    }}>{f}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                        {messagesLoading ? (
                                            <div style={{ textAlign: 'center', padding: '40px' }}>
                                                <Loader2 size={24} className="animate-spin" color={accentColor} />
                                            </div>
                                        ) : (() => {
                                            const filtered = msgFilter === 'TOUS' ? messages : messages.filter(m => m.objet_type === msgFilter);
                                            return filtered.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                                    <FileText size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                                    <p style={{ fontSize: '13px', fontWeight: 600 }}>Aucun message</p>
                                                </div>
                                            ) : filtered.map(msg => {
                                                const isUnread = msg.statut === 'ENVOYE' && msg.expediteur_type === 'ADMIN';
                                                const isSelected = selectedMessage?.message_id === msg.message_id;
                                                const isFromMe = msg.expediteur_type === 'ENSEIGNANT';
                                                const typeColors: Record<string, string> = { EMPLOI: '#0d9488', EXAMENS: '#f59e0b', GENERAL: '#3b82f6', REUNION: '#7c3aed', DISCIPLINE: '#dc2626' };
                                                const typeColor = typeColors[msg.objet_type] || '#64748b';
                                                return (
                                                    <div key={msg.message_id} onClick={() => { setSelectedMessage(msg); setReplyText(''); markAsRead(msg); }}
                                                        style={{
                                                            padding: '14px 20px', borderBottom: '1px solid #f8fafc', cursor: 'pointer',
                                                            background: isSelected ? '#f0f0ff' : isUnread ? '#fefce8' : 'transparent',
                                                            borderLeft: isSelected ? `3px solid ${accentColor}` : '3px solid transparent',
                                                            transition: 'all 0.15s',
                                                        }}
                                                        onMouseEnter={ev => { if (!isSelected) ev.currentTarget.style.background = '#f8fafc'; }}
                                                        onMouseLeave={ev => { if (!isSelected) ev.currentTarget.style.background = isUnread ? '#fefce8' : 'transparent'; }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {isUnread && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: accentColor, flexShrink: 0 }} />}
                                                                <span style={{ fontSize: '13px', fontWeight: isUnread ? 800 : 600, color: '#1e293b' }}>
                                                                    {isFromMe ? '→ Vous' : msg.expediteur_nom}
                                                                </span>
                                                            </div>
                                                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: `${typeColor}15`, color: typeColor, fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                                                {msg.objet_type}
                                                            </span>
                                                        </div>
                                                        <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: isUnread ? 700 : 500, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {msg.sujet}
                                                        </p>
                                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                                                            {msg.date_envoi ? new Date(msg.date_envoi).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </p>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>

                                {/* Message detail */}
                                {selectedMessage && (
                                    <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                        <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#1e293b', flex: 1 }}>{selectedMessage.sujet}</h3>
                                                <button onClick={() => setSelectedMessage(null)}
                                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                                                    ✕ Fermer
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                                                <span>De: <strong style={{ color: '#1e293b' }}>{selectedMessage.expediteur_type === 'ADMIN' ? 'Administration' : 'Vous'}</strong></span>
                                                <span>•</span>
                                                <span>{selectedMessage.date_envoi ? new Date(selectedMessage.date_envoi).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                <span>•</span>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '6px', fontWeight: 700,
                                                    background: selectedMessage.statut === 'ENVOYE' ? '#fef3c7' : selectedMessage.statut === 'LU' ? '#dbeafe' : '#f0fdf4',
                                                    color: selectedMessage.statut === 'ENVOYE' ? '#92400e' : selectedMessage.statut === 'LU' ? '#1e40af' : '#065f46',
                                                }}>{selectedMessage.statut}</span>
                                            </div>
                                        </div>
                                        <div style={{ padding: '24px 28px', minHeight: '200px' }}>
                                            <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#334155', whiteSpace: 'pre-wrap' }}>
                                                {selectedMessage.contenu || '(Pas de contenu)'}
                                            </div>
                                        </div>
                                        {/* Response section - specialized by message type */}
                                        {selectedMessage.expediteur_type === 'ADMIN' && (
                                            <div style={{ padding: '20px 28px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                                {/* Specialized action buttons */}
                                                {selectedMessage.objet_type === 'EMPLOI' && selectedMessage.demande_id && (
                                                    <button onClick={() => openDispoForm(selectedMessage)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', marginBottom: '14px', width: '100%', justifyContent: 'center' }}>
                                                        <Calendar size={16} /> Répondre — Soumettre mes Disponibilités
                                                    </button>
                                                )}
                                                {selectedMessage.objet_type === 'EXAMENS' && selectedMessage.demande_id && (
                                                    <button onClick={() => openExamUpload(selectedMessage)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer', marginBottom: '14px', width: '100%', justifyContent: 'center' }}>
                                                        <FileUp size={16} /> Répondre — Déposer un Sujet d&apos;Examen
                                                    </button>
                                                )}
                                                {/* Text reply */}
                                                <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>Réponse écrite</p>
                                                <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                                    placeholder="Écrivez votre réponse ici..."
                                                    rows={3}
                                                    style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '13px', resize: 'vertical', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
                                                    onFocus={ev => ev.target.style.borderColor = accentColor}
                                                    onBlur={ev => ev.target.style.borderColor = '#e2e8f0'}
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                                    <button onClick={() => sendReply(selectedMessage)} disabled={replySending || !replyText.trim()}
                                                        style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: !replyText.trim() ? '#cbd5e1' : `linear-gradient(135deg, ${accentColor}, ${primaryColor})`, color: 'white', fontWeight: 700, fontSize: '13px', cursor: !replyText.trim() ? 'not-allowed' : 'pointer', opacity: replySending ? 0.6 : 1 }}>
                                                        {replySending ? 'Envoi...' : 'Envoyer la réponse'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ──── DEVOIRS TAB ──── */}
                    {activeTab === 'devoirs' && (() => {

                        const handleCreateDevoir = async () => {
                            if (!data || !devoirForm.titre || !devoirForm.classe_id || !devoirForm.matiere_id) return;
                            setDevoirSaving(true);
                            try {
                                const fd = new FormData();
                                fd.append('enseignant_id', String(data.enseignant.enseignant_id));
                                fd.append('classe_id', String(devoirForm.classe_id));
                                fd.append('matiere_id', String(devoirForm.matiere_id));
                                fd.append('titre', devoirForm.titre);
                                fd.append('description', devoirForm.description);
                                fd.append('type_devoir', devoirForm.type_devoir);
                                if (devoirForm.date_limite) fd.append('date_limite', devoirForm.date_limite);
                                if (devoirFile) fd.append('fichier', devoirFile);
                                await api.post('/api/devoirs/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                                setToastMsg({ type: 'success', text: 'Devoir créé avec succès !' });
                                setShowNewDevoir(false);
                                setDevoirForm({titre: '', description: '', type_devoir: 'EXERCICE', classe_id: null, matiere_id: null, date_limite: ''});
                                setDevoirFile(null);
                                const res = await api.get(`/api/devoirs/enseignant/${data.enseignant.enseignant_id}`);
                                setDevoirs(res.data);
                            } catch { setToastMsg({ type: 'error', text: 'Erreur lors de la création' }); }
                            finally { setDevoirSaving(false); }
                        };

                        const handleDeleteDevoir = async (id: number) => {
                            if (!data || !confirm('Supprimer ce devoir ?')) return;
                            try {
                                await api.delete(`/api/devoirs/${id}`);
                                setDevoirs(prev => prev.filter(d => d.devoir_id !== id));
                                setToastMsg({ type: 'success', text: 'Devoir supprimé' });
                            } catch {}
                        };

                        const typeColors: Record<string,{bg:string;color:string;icon:React.ReactNode}> = {
                            EXERCICE: { bg: '#dbeafe', color: '#2563eb', icon: <PenLine size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> },
                            RECHERCHE: { bg: '#fef3c7', color: '#d97706', icon: <Search size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> },
                            LECTURE: { bg: '#ede9fe', color: '#7c3aed', icon: <BookOpen size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> },
                            PROJET: { bg: '#d1fae5', color: '#059669', icon: <Rocket size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> },
                        };

                        return (
                            <motion.div key="devoirs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <BookOpen size={22} color="#f59e0b" /> Devoirs
                                        </h2>
                                        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '13px' }}>Assignez des devoirs à vos classes</p>
                                    </div>
                                    <button onClick={() => setShowNewDevoir(!showNewDevoir)}
                                        style={{ padding: '12px 24px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 15px rgba(245,158,11,0.3)' }}>
                                        <Plus size={16} /> Nouveau Devoir
                                    </button>
                                </div>

                                {/* Create Form */}
                                <AnimatePresence>
                                    {showNewDevoir && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            style={{ background: 'white', borderRadius: '20px', padding: '28px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                            <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Plus size={16} color="#f59e0b" /> Créer un devoir
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1/-1' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Titre du devoir *</label>
                                                    <input value={devoirForm.titre} onChange={e => setDevoirForm({...devoirForm, titre: e.target.value})}
                                                        placeholder="Ex: Exercices chapitre 5" style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none' }}
                                                        onFocus={e => e.currentTarget.style.borderColor = '#f59e0b'} onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Classe *</label>
                                                    <select value={devoirForm.classe_id || ''} onChange={e => setDevoirForm({...devoirForm, classe_id: Number(e.target.value)})}
                                                        style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', cursor: 'pointer' }}>
                                                        <option value="">Sélectionner...</option>
                                                        {(() => {
                                                            const seen = new Set<number>();
                                                            return data?.affectations.filter(a => {
                                                                if (seen.has(a.classe_id)) return false;
                                                                seen.add(a.classe_id); return true;
                                                            }).map(a => <option key={`cls-${a.affectation_id}`} value={a.classe_id}>{a.classe}</option>);
                                                        })()}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Matière *</label>
                                                    <select value={devoirForm.matiere_id || ''} onChange={e => setDevoirForm({...devoirForm, matiere_id: Number(e.target.value)})}
                                                        style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', cursor: 'pointer' }}>
                                                        <option value="">Sélectionner...</option>
                                                        {(() => {
                                                            const seen = new Set<number>();
                                                            return data?.affectations.filter(a => !devoirForm.classe_id || a.classe_id === devoirForm.classe_id).filter(a => {
                                                                if (seen.has(a.matiere_id)) return false;
                                                                seen.add(a.matiere_id); return true;
                                                            }).map(a => <option key={`mat-${a.affectation_id}`} value={a.matiere_id}>{a.matiere}</option>);
                                                        })()}
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Type</label>
                                                    <select value={devoirForm.type_devoir} onChange={e => setDevoirForm({...devoirForm, type_devoir: e.target.value})}
                                                        style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', cursor: 'pointer' }}>
                                                        <option value="EXERCICE">Exercice</option>
                                                        <option value="RECHERCHE">Recherche</option>
                                                        <option value="LECTURE">Lecture</option>
                                                        <option value="PROJET">Projet</option>
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Date limite</label>
                                                    <input type="date" value={devoirForm.date_limite} onChange={e => setDevoirForm({...devoirForm, date_limite: e.target.value})}
                                                        style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none' }} />
                                                </div>
                                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Description / Consignes</label>
                                                    <textarea value={devoirForm.description} onChange={e => setDevoirForm({...devoirForm, description: e.target.value})}
                                                        placeholder="Décrivez le devoir... Ex: Page 45, exercices 1 à 5 du manuel de Mathématiques"
                                                        rows={4} style={{ padding: '12px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                                        onFocus={e => e.currentTarget.style.borderColor = '#f59e0b'} onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                                                </div>
                                                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}><Paperclip size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Fichier joint (optionnel)</label>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <input ref={devoirFileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png,.xlsx" style={{ display: 'none' }}
                                                            onChange={e => setDevoirFile(e.target.files?.[0] || null)} />
                                                        <button onClick={() => devoirFileRef.current?.click()} type="button"
                                                            style={{ padding: '10px 20px', borderRadius: '10px', border: '2px dashed #e2e8f0', background: '#f8fafc', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Upload size={14} /> {devoirFile ? devoirFile.name : 'Choisir un fichier'}
                                                        </button>
                                                        {devoirFile && <button onClick={() => setDevoirFile(null)} style={{ border: 'none', background: '#fee2e2', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>✕ Retirer</button>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                                                <button onClick={() => setShowNewDevoir(false)}
                                                    style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #f1f5f9', background: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
                                                    Annuler
                                                </button>
                                                <button onClick={handleCreateDevoir} disabled={devoirSaving || !devoirForm.titre || !devoirForm.classe_id || !devoirForm.matiere_id}
                                                    style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: devoirSaving ? '#fcd34d' : 'linear-gradient(135deg, #f59e0b, #d97706)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', opacity: (!devoirForm.titre || !devoirForm.classe_id || !devoirForm.matiere_id) ? 0.5 : 1 }}>
                                                    {devoirSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                                                    {devoirSaving ? 'Envoi...' : 'Publier le devoir'}
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Devoirs List */}
                                {devoirsLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#f59e0b' }} /></div>
                                ) : devoirs.length === 0 ? (
                                    <div style={{ background: 'white', borderRadius: '20px', padding: '60px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                        <BookOpen size={40} color="#e2e8f0" style={{ marginBottom: '12px' }} />
                                        <p style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 600 }}>Aucun devoir créé</p>
                                        <p style={{ color: '#cbd5e1', fontSize: '12px' }}>Cliquez sur "Nouveau Devoir" pour commencer</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {devoirs.map((d, i) => {
                                            const tc = typeColors[d.type_devoir] || typeColors.EXERCICE;
                                            return (
                                                <motion.div key={d.devoir_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                                    style={{ background: 'white', borderRadius: '16px', padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${tc.color}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                                <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: tc.bg, color: tc.color }}>
                                                                    {tc.icon} {d.type_devoir}
                                                                </span>
                                                                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {d.classe}</span>
                                                                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} /> {d.matiere}</span>
                                                            </div>
                                                            <h4 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{d.titre}</h4>
                                                            {d.description && <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>{d.description.length > 150 ? d.description.slice(0, 150) + '...' : d.description}</p>}
                                                            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#94a3b8' }}>
                                                                {d.date_limite && <span>Limite: {new Date(d.date_limite).toLocaleDateString('fr-FR')}</span>}
                                                                {d.fichier_nom && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileUp size={11} /> {d.fichier_nom}</span>}
                                                                <span>Créé le {d.date_creation ? new Date(d.date_creation).toLocaleDateString('fr-FR') : '—'}</span>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => handleDeleteDevoir(d.devoir_id)}
                                                            style={{ border: 'none', background: '#fef2f2', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: '#ef4444' }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })()}

                    {/* ──── DOCUMENTS & SUJETS TAB ──── */}
                    {activeTab === 'documents' && (
                        <motion.div key="documents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FileText size={20} color={primaryColor} /> Historique de mes Sujets d'Examen
                                        </h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                                            Consultez, modifiez ou déposez vos sujets transmis à l'administration.
                                        </p>
                                    </div>
                                    <button onClick={() => {
                                        setActiveExamDemande(null);
                                        setUploadFile(null);
                                        setUploadTitre('');
                                        setUploadDuree(60);
                                        if (data && data.affectations.length > 0) setUploadMatiere(data.affectations[0].matiere_id);
                                        setShowUploadForm(true);
                                    }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: 'white', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                        <Plus size={16} /> Nouveau Sujet
                                    </button>
                                </div>

                                {sujetsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '40px' }}>
                                        <Loader2 size={24} className="animate-spin" color={accentColor} />
                                    </div>
                                ) : mesSujets.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>
                                        <FileText size={40} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                        <p style={{ fontSize: '14px', fontWeight: 600 }}>Aucun sujet d'examen déposé pour le moment.</p>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #f1f5f9', textAlign: 'left', color: '#64748b' }}>
                                                    <th style={{ padding: '12px 16px' }}>Titre du sujet</th>
                                                    <th style={{ padding: '12px 16px' }}>Matière</th>
                                                    <th style={{ padding: '12px 16px' }}>Trimestre</th>
                                                    <th style={{ padding: '12px 16px' }}>Durée</th>
                                                    <th style={{ padding: '12px 16px' }}>Statut</th>
                                                    <th style={{ padding: '12px 16px' }}>Date dépôt</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {mesSujets.map((s: any) => {
                                                    const isValide = s.statut === 'VALIDE';
                                                    const isRejete = s.statut === 'REJETE';
                                                    const isEnvoye = s.statut === 'ENVOYE';
                                                    const badgeColor = isValide ? { bg: '#dcfce7', text: '#15803d' } : isRejete ? { bg: '#fee2e2', text: '#b91c1c' } : isEnvoye ? { bg: '#e0f2fe', text: '#0369a1' } : { bg: '#f1f5f9', text: '#475569' };

                                                    return (
                                                        <tr key={s.sujet_id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>
                                                                {s.titre}
                                                                {isRejete && s.commentaire && (
                                                                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#dc2626', fontWeight: 500 }}>
                                                                        <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Raison du rejet : {s.commentaire}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#475569' }}>{s.matiere_libelle || '—'}</td>
                                                            <td style={{ padding: '12px 16px' }}><span style={{ padding: '2px 8px', borderRadius: '6px', background: '#f1f5f9', fontWeight: 700 }}>{s.periode_libelle || `T${s.trimestre}`}</span></td>
                                                            <td style={{ padding: '12px 16px', color: '#475569' }}>{s.duree_minutes} min</td>
                                                            <td style={{ padding: '12px 16px' }}>
                                                                <span style={{ padding: '4px 10px', borderRadius: '8px', background: badgeColor.bg, color: badgeColor.text, fontSize: '11px', fontWeight: 700 }}>
                                                                    {isValide ? 'VALIDÉ' : isRejete ? 'REJETÉ' : isEnvoye ? 'REÇU (ADMIN)' : 'BROUILLON'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>
                                                                {s.date_depot ? new Date(s.date_depot).toLocaleDateString('fr-FR') : '—'}
                                                            </td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                    <button onClick={() => handleDownloadSujet(s.sujet_id, s.fichier_nom || `sujet_${s.sujet_id}`)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#3b82f6', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                                        <Download size={13} /> Télécharger
                                                                    </button>
                                                                    {!isValide && (
                                                                        <button onClick={() => {
                                                                            setEditSujetData({ sujet_id: s.sujet_id, titre: s.titre, duree_minutes: s.duree_minutes, trimestre_id: s.trimestre_id ?? null });
                                                                            setShowEditSujet(true);
                                                                        }} style={{ padding: '6px 12px', borderRadius: '8px', background: '#e0e7ff', color: '#4338ca', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                                            Modifier
                                                                        </button>
                                                                    )}
                                                                    {!isValide && (
                                                                        <button onClick={() => handleDeleteSujet(s.sujet_id)}
                                                                            style={{ padding: '6px 10px', borderRadius: '8px', background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer' }}>
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ──── LIENS EXTERNES TAB ──── */}
                    {activeTab === 'liens' && <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}><LinkIcon size={48} style={{ marginBottom: '12px', opacity: 0.3 }} /><p>Liens non implémentés</p></div>}

                    {/* ──── PARAMETRES TAB ──── */}
                    {activeTab === 'parametres' && (
                        <motion.div key="parametres" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ maxWidth: '700px' }}>
                                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#1e293b', margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Settings size={22} color={primaryColor} /> Paramètres
                                </h2>

                                {/* Profile Info Card */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                                    <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '28px', display: 'flex', alignItems: 'center', gap: '20px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                                        <div onClick={() => { if (ens.photo_url) setLightboxUrl(`${API_BASE}${ens.photo_url}`); }} style={{ width: '72px', height: '72px', borderRadius: '20px', background: ens.photo_url ? `url(${API_BASE}${ens.photo_url}) center/cover no-repeat` : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800, backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0, cursor: ens.photo_url ? 'pointer' : 'default' }}>
                                            {!ens.photo_url && `${ens.prenom[0]}${ens.nom[0]}`}
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>{ens.prenom} {ens.nom}</h3>
                                            <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.85 }}>{ens.specialite || 'Enseignant'}</p>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', fontSize: '11px', fontWeight: 600 }}>{ens.matricule}</span>
                                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', fontSize: '11px', fontWeight: 600 }}>{ens.type_contrat}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '20px 24px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                            {[
                                                { label: 'Téléphone', value: ens.telephone, icon: <Smartphone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: 'Email', value: ens.email || '—', icon: <MailIcon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: 'Spécialité', value: ens.specialite || '—', icon: <BookOpen size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: 'Diplôme', value: ens.diplome || '—', icon: <GraduationCap size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: 'Type de contrat', value: ens.type_contrat || '—', icon: <ClipboardList size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: "Date d'embauche", value: ens.date_embauche ? new Date(ens.date_embauche).toLocaleDateString('fr-FR') : '—', icon: <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: 'Statut', value: ens.statut, icon: <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                                { label: 'Classes', value: `${stats.nb_classes} classe(s)`, icon: <School size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> },
                                            ].map((f, i) => (
                                                <div key={i} style={{ padding: '14px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                                    <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{f.icon} {f.label}</p>
                                                    <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{f.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Photo Selection */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Ma Photo de Profil
                                        </h4>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Envoyez ou modifiez votre photo de profil</p>
                                    </div>
                                    <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                        <div onClick={() => { if (ens.photo_url) setLightboxUrl(`${API_BASE}${ens.photo_url}`); }} style={{ width: '80px', height: '80px', borderRadius: '50%', flexShrink: 0, background: ens.photo_url ? `url(${API_BASE}${ens.photo_url}) center/cover no-repeat` : 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 800, border: '3px solid #e2e8f0', cursor: ens.photo_url ? 'pointer' : 'default', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                            {!ens.photo_url && `${ens.prenom[0]}${ens.nom[0]}`}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{ens.prenom} {ens.nom}</p>
                                            <p style={{ margin: '0 0 12px', fontSize: '12px', color: ens.photo_url ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>{ens.photo_url ? <><CheckCircle2 size={12} /> Photo de profil définie</> : <><AlertTriangle size={12} /> Aucune photo de profil</>}</p>
                                            <button onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
                                                input.onchange = async (e: any) => {
                                                    const file = e.target.files?.[0]; if (!file) return;
                                                    setPhotoUploading(true);
                                                    try {
                                                        const fd = new FormData(); fd.append('fichier', file);
                                                        await api.post(`/api/photos/upload/enseignant/${ens.enseignant_id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                                                        setPhotoSuccess('Photo enregistrée avec succès !');
                                                        setTimeout(() => setPhotoSuccess(null), 4000);
                                                        const dash = await api.get(`/api/portail-enseignant/${ens.enseignant_id}/dashboard`);
                                                        if (dash.data?.enseignant?.photo_url) {
                                                            dash.data.enseignant.photo_url += '?t=' + Date.now();
                                                        }
                                                        setData(dash.data);
                                                    } catch { setPhotoSuccess('Erreur lors de l\'envoi'); }
                                                    finally { setPhotoUploading(false); }
                                                };
                                                input.click();
                                            }} disabled={photoUploading} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {photoUploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>}
                                                {ens.photo_url ? 'Modifier ma photo' : 'Envoyer ma photo'}
                                            </button>
                                            {photoSuccess && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> {photoSuccess}</p>}
                                        </div>
                                </div>
                                </div>

                                {/* Statut Parent d'Élève Section */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Users size={16} /> Statut Parent d'Élève
                                            </h4>
                                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                                Avez-vous des enfants scolarisés dans l'école ? Signalez-les pour que votre compte soit raccordé.
                                            </p>
                                        </div>
                                        <button onClick={() => setShowSignalerEnfantModal(true)} style={{ padding: '8px 14px', borderRadius: '10px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                            Signaler un enfant
                                        </button>
                                    </div>
                                    <div style={{ padding: '20px 24px' }}>
                                        {mesEnfantsData?.est_parent && mesEnfantsData.enfants.length > 0 ? (
                                            <div>
                                                <p style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>
                                                    <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} /> Compte raccordé — {mesEnfantsData.enfants.length} enfant(s) scolarisé(s) dans l'école :
                                                </p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {mesEnfantsData.enfants.map((ef: any, idx: number) => (
                                                        <div key={idx} style={{ padding: '10px 14px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#14532d' }}><GraduationCap size={13} style={{ display: 'inline', marginRight: '4px' }} /> {ef.prenom} {ef.nom}</span>
                                                                <span style={{ fontSize: '11px', color: '#166534', marginLeft: '10px' }}>({ef.classe})</span>
                                                            </div>
                                                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: '#dcfce7', color: '#15803d' }}>
                                                                Lien: {ef.lien_parente}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '10px' }}>
                                                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                                                    Aucun enfant raccordé à votre profil pour le moment.
                                                </p>
                                                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                                    Si vous avez des enfants inscrits dans l'établissement, cliquez sur "Signaler un enfant" ci-dessus pour avertir l'administration.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Password Change Section */}
                                <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Lock size={18} color="#f59e0b" /> Modifier le mot de passe
                                        </h4>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Sécurisez votre compte en définissant un mot de passe fort</p>
                                    </div>
                                    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {passwordMsg && (
                                            <div style={{ padding: '10px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, background: passwordMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: passwordMsg.type === 'success' ? '#166534' : '#b91c1c', border: `1px solid ${passwordMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                                                {passwordMsg.text}
                                            </div>
                                        )}
                                        <div>
                                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}><Key size={12} style={{ display: 'inline', marginRight: '4px' }} /> Ancien mot de passe</label>
                                            <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Votre ancien mot de passe"
                                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                onFocus={e => e.currentTarget.style.borderColor = '#f59e0b'}
                                                onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}><Lock size={12} style={{ display: 'inline', marginRight: '4px' }} /> Nouveau mot de passe</label>
                                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 caractères"
                                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                onFocus={e => e.currentTarget.style.borderColor = '#f59e0b'}
                                                onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}><Lock size={12} style={{ display: 'inline', marginRight: '4px' }} /> Confirmer le mot de passe</label>
                                            <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Retapez le nouveau mot de passe"
                                                style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                onFocus={e => e.currentTarget.style.borderColor = '#f59e0b'}
                                                onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                                        </div>
                                        <button disabled={passwordChanging || !newPassword || newPassword !== confirmNewPassword}
                                            onClick={async () => {
                                                if (!data) return;
                                                if (newPassword.length < 6) { setPasswordMsg({ type: 'error', text: 'Le mot de passe doit avoir au moins 6 caractères.' }); return; }
                                                if (newPassword !== confirmNewPassword) { setPasswordMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' }); return; }
                                                try {
                                                    setPasswordChanging(true); setPasswordMsg(null);
                                                    await api.put(`/api/portail-enseignant/${data.enseignant.enseignant_id}/changer-mot-de-passe`, {
                                                        ancien_mdp: oldPassword || null,
                                                        nouveau_mdp: newPassword,
                                                    });
                                                    setPasswordMsg({ type: 'success', text: 'Mot de passe modifié avec succès !' });
                                                    setOldPassword(''); setNewPassword(''); setConfirmNewPassword('');
                                                } catch (err: any) {
                                                    setPasswordMsg({ type: 'error', text: err.response?.data?.detail || 'Erreur lors du changement.' });
                                                } finally { setPasswordChanging(false); }
                                            }}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, background: (!newPassword || newPassword !== confirmNewPassword) ? '#e2e8f0' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: (!newPassword || newPassword !== confirmNewPassword) ? '#94a3b8' : 'white', border: 'none', cursor: passwordChanging ? 'not-allowed' : 'pointer', width: '100%' }}>
                                            {passwordChanging ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={16} />}
                                            {passwordChanging ? 'Modification...' : 'Modifier le mot de passe'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* ═══ CARTE (BADGE) ═══ */}
                    {activeTab === 'carte' && (
                        <motion.div key="carte" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>Ma Carte de Pointage</h2>
                                    <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '400px' }}>
                                        Présentez cette carte au scanner à votre arrivée et à votre départ. Vous pouvez la télécharger sur votre téléphone.
                                    </p>
                                </div>
                                {data?.enseignant && (
                                    <BadgeCarte agent={data.enseignant} id="enseignant-badge-view" />
                                )}
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <button 
                                        className="btn btn-primary"
                                        onClick={async () => {
                                            const element = document.getElementById('enseignant-badge-view');
                                            if (element) {
                                                const canvas = await html2canvas(element, { scale: 3, backgroundColor: null });
                                                const imgData = canvas.toDataURL('image/png');
                                                const link = document.createElement('a');
                                                link.href = imgData;
                                                link.download = `Badge-${data?.enseignant?.matricule}.png`;
                                                link.click();
                                            }
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        <Download size={18} /> Télécharger Image
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                    
                    {activeTab === 'evenements' && (
                        <motion.div key="evenements" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>Événements de l'École</h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Retrouvez ici les événements publiés par l'administration.</p>
                            </div>
                            {teacherEvts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                    <Calendar size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                                    <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '16px', fontWeight: 600 }}>Aucun événement</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Il n'y a pas d'événement publié pour le moment.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                                    {teacherEvts.map(evt => (
                                        <div key={evt.evenement_id} style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', borderTop: `4px solid ${primaryColor}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{evt.titre}</h3>
                                                {evt.type_evenement && (
                                                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '12px', background: '#f1f5f9', color: '#475569' }}>
                                                        {evt.type_evenement}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>
                                                <Calendar size={14} />
                                                <span>{new Date(evt.date_debut).toLocaleDateString('fr-FR')} {evt.date_fin && `- ${new Date(evt.date_fin).toLocaleDateString('fr-FR')}`}</span>
                                            </div>
                                            {evt.lieu && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>
                                                    <MapPin size={14} />
                                                    <span>{evt.lieu}</span>
                                                </div>
                                            )}
                                            {evt.description && (
                                                <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: '12px', borderRadius: '10px' }}>
                                                    {evt.description}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'activites' && (
                        <motion.div key="activites" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>Activités du Jour</h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Suivez les activités parascolaires et clubs.</p>
                            </div>
                            {teacherActs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                    <Activity size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                                    <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '16px', fontWeight: 600 }}>Aucune activité</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Il n'y a pas d'activité planifiée pour aujourd'hui.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {teacherActs.map(act => (
                                        <div key={act.activite_id} style={{ display: 'flex', gap: '20px', background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                                                <div style={{ fontSize: '14px', fontWeight: 800, color: primaryColor }}>{act.heure_debut?.substring(0,5)}</div>
                                                <div style={{ width: '2px', flex: 1, background: '#e2e8f0', margin: '8px 0' }}></div>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>{act.heure_fin?.substring(0,5)}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{act.titre}</h3>
                                                    {act.type_activite && (
                                                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '12px', background: '#e0e7ff', color: '#3730a3' }}>
                                                            {act.type_activite}
                                                        </span>
                                                    )}
                                                </div>
                                                {act.description && (
                                                    <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>{act.description}</p>
                                                )}
                                                {act.lieu && (
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', padding: '6px 12px', background: '#f8fafc', borderRadius: '20px', fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                                        <MapPin size={12} /> {act.lieu}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'paiements' && (
                        <motion.div key="paiements" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>Mes Paiements</h2>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Historique de vos fiches de paie et bulletins de salaire.</p>
                            </div>

                            {paiementsLoading ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                    <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: primaryColor }} />
                                    <p style={{ marginTop: '12px', color: '#64748b', fontSize: '14px' }}>Chargement des paiements...</p>
                                </div>
                            ) : paiementsData.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                    <Wallet size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                                    <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '16px', fontWeight: 600 }}>Aucun paiement enregistré</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Vos fiches de paie apparaîtront ici après le premier versement.</p>
                                </div>
                            ) : (
                                <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
                                    {/* Summary cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
                                        <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '12px', textAlign: 'center' }}>
                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Reçu</p>
                                            <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 900, color: '#166534' }}>
                                                {new Intl.NumberFormat('fr-GN').format(paiementsData.reduce((s: number, p: any) => s + (p.net_a_payer || p.montant || 0), 0))} GNF
                                            </p>
                                        </div>
                                        <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '12px', textAlign: 'center' }}>
                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nb Paiements</p>
                                            <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 900, color: '#1e40af' }}>{paiementsData.length}</p>
                                        </div>
                                        <div style={{ padding: '16px', background: '#fefce8', borderRadius: '12px', textAlign: 'center' }}>
                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dernier Paiement</p>
                                            <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 700, color: '#92400e' }}>
                                                {paiementsData[0]?.date ? new Date(paiementsData[0].date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '\u2014'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Date</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Base</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Primes</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Retenues</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Net Pay\u00e9</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>Fiche</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paiementsData.map((p: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <div style={{ fontWeight: 700, color: '#1e293b' }}>
                                                                {p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014'}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{p.libelle}</div>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                                                            {new Intl.NumberFormat('fr-GN').format(p.salaire_base || 0)}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                                                            +{new Intl.NumberFormat('fr-GN').format(p.total_primes || 0)}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            <span style={{ fontWeight: 600, color: '#ef4444' }}>-{new Intl.NumberFormat('fr-GN').format((p.total_absences || 0) + (p.total_avances || 0))}</span>
                                                            {p.details_absences && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{p.details_absences}</div>}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#059669' }}>
                                                            {new Intl.NumberFormat('fr-GN').format(p.net_a_payer || p.montant || 0)} GNF
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                            {p.bulletin_id ? (
                                                                <button onClick={() => loadBulletinDetail(p.bulletin_id)}
                                                                    style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Eye size={12} /> Voir
                                                                </button>
                                                            ) : <span style={{ color: '#cbd5e1' }}>\u2014</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Bulletin Detail Modal */}
                            {selectedBulletin && (
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                                    onClick={() => setSelectedBulletin(null)}>
                                    <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', maxWidth: '550px', width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
                                        {bulletinLoading ? (
                                            <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: primaryColor }} /></div>
                                        ) : (
                                            <div style={{ padding: '28px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                                    <div>
                                                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', margin: 0 }}>Bulletin de Paie</h3>
                                                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>{selectedBulletin.bulletin?.mois_concerne}</p>
                                                    </div>
                                                    <button onClick={() => setSelectedBulletin(null)} style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#f8fafc', borderRadius: '12px', marginBottom: '20px' }}>
                                                    <div>
                                                        <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: '#1e293b' }}>{selectedBulletin.employe?.prenom} {selectedBulletin.employe?.nom}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>Poste : {selectedBulletin.employe?.poste}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Pay\u00e9 le : {selectedBulletin.bulletin?.date_paiement || '\u2014'}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>Mode : {selectedBulletin.bulletin?.mode_paiement || 'VIREMENT'}</p>
                                                    </div>
                                                </div>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                    <tbody>
                                                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                            <td style={{ padding: '12px 0', color: '#475569' }}>Salaire de Base</td>
                                                            <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 700 }}>{new Intl.NumberFormat('fr-GN').format(selectedBulletin.bulletin?.salaire_base || 0)} GNF</td>
                                                        </tr>
                                                        {selectedBulletin.details?.primes?.map((p: any, i: number) => (
                                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '10px 0 10px 16px', color: '#10b981' }}>+ Prime : {p.motif}</td>
                                                                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>+{new Intl.NumberFormat('fr-GN').format(p.montant)} GNF</td>
                                                            </tr>
                                                        ))}
                                                        {(selectedBulletin.bulletin?.total_absences || 0) > 0 && (
                                                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '12px 0', color: '#ef4444' }}>
                                                                    - Retenues Absences
                                                                    {selectedBulletin.details?.details_absences_texte && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{selectedBulletin.details.details_absences_texte}</div>}
                                                                </td>
                                                                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>-{new Intl.NumberFormat('fr-GN').format(selectedBulletin.bulletin.total_absences)} GNF</td>
                                                            </tr>
                                                        )}
                                                        {(selectedBulletin.bulletin?.total_avances || 0) > 0 && (
                                                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                <td style={{ padding: '12px 0', color: '#f59e0b' }}>- Avances D\u00e9duites</td>
                                                                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>-{new Intl.NumberFormat('fr-GN').format(selectedBulletin.bulletin.total_avances)} GNF</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                                <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderRadius: '12px', textAlign: 'center' }}>
                                                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#15803d', textTransform: 'uppercase', letterSpacing: '1px' }}>Net \u00e0 Payer</p>
                                                    <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: 900, color: '#059669' }}>{new Intl.NumberFormat('fr-GN').format(selectedBulletin.bulletin?.net_a_payer || 0)} GNF</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>

            {/* ─── LIGHTBOX MODAL ─── */}
            {lightboxUrl && (
                <div onClick={() => setLightboxUrl(null)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
                        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'zoom-out',
                    }}>
                    <button onClick={() => setLightboxUrl(null)}
                        style={{
                            position: 'absolute', top: '20px', right: '20px',
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            cursor: 'pointer', color: 'white', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                        <X size={20} />
                    </button>
                    <img src={lightboxUrl} alt="Photo" onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw', maxHeight: '90vh',
                            borderRadius: '16px', objectFit: 'contain',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.5)', cursor: 'default',
                        }} />
                </div>
            )}

            {/* ═══ MODAL: CHANGER MOT DE PASSE ═══ */}
            <AnimatePresence>
                {showPasswordModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '24px' }}
                        onClick={() => setShowPasswordModal(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Key size={18} />
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Changer le mot de passe</h3>
                                    </div>
                                    <button onClick={() => setShowPasswordModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                                </div>
                            </div>
                            {/* Form */}
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {passwordMsg && (
                                    <div style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, background: passwordMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: passwordMsg.type === 'success' ? '#166534' : '#b91c1c', border: `1px solid ${passwordMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                                        {passwordMsg.text}
                                    </div>
                                )}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}><Lock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Ancien mot de passe</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="Votre mot de passe actuel"
                                            style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                                            onFocus={e => e.target.style.borderColor = '#f59e0b'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}><Key size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Nouveau mot de passe</label>
                                    <div style={{ position: 'relative' }}>
                                        <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 caractères"
                                            style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                                            onFocus={e => e.target.style.borderColor = '#f59e0b'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}><CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} /> Confirmer le nouveau mot de passe</label>
                                    <div style={{ position: 'relative' }}>
                                        <CheckCircle size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: newPassword && confirmNewPassword && newPassword === confirmNewPassword ? '#10b981' : '#94a3b8' }} />
                                        <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Retapez le nouveau mot de passe"
                                            style={{ width: '100%', padding: '10px 12px 10px 38px', borderRadius: '10px', border: `1.5px solid ${newPassword && confirmNewPassword ? (newPassword === confirmNewPassword ? '#10b981' : '#ef4444') : '#e2e8f0'}`, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                                            onFocus={e => e.target.style.borderColor = '#f59e0b'} onBlur={e => e.target.style.borderColor = newPassword && confirmNewPassword ? (newPassword === confirmNewPassword ? '#10b981' : '#ef4444') : '#e2e8f0'} />
                                    </div>
                                    {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><XCircle size={12} /> Les mots de passe ne correspondent pas</p>
                                    )}
                                </div>
                            </div>
                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => { setShowPasswordModal(false); setOldPassword(''); setNewPassword(''); setConfirmNewPassword(''); setPasswordMsg(null); }}
                                    style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                    Annuler
                                </button>
                                <button disabled={passwordChanging || !newPassword || newPassword !== confirmNewPassword}
                                    onClick={async () => {
                                        if (!data) return;
                                        if (newPassword.length < 6) { setPasswordMsg({ type: 'error', text: 'Le mot de passe doit avoir au moins 6 caractères.' }); return; }
                                        if (newPassword !== confirmNewPassword) { setPasswordMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas.' }); return; }
                                        try {
                                            setPasswordChanging(true); setPasswordMsg(null);
                                            await api.put(`/api/portail-enseignant/${data.enseignant.enseignant_id}/changer-mot-de-passe`, {
                                                ancien_mdp: oldPassword || null,
                                                nouveau_mdp: newPassword,
                                            });
                                            setPasswordMsg({ type: 'success', text: 'Mot de passe modifié avec succès !' });
                                            setOldPassword(''); setNewPassword(''); setConfirmNewPassword('');
                                            setTimeout(() => setShowPasswordModal(false), 1500);
                                        } catch (err: any) {
                                            setPasswordMsg({ type: 'error', text: err.response?.data?.detail || 'Erreur lors du changement.' });
                                        } finally { setPasswordChanging(false); }
                                    }}
                                    style={{ padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', background: (!newPassword || newPassword !== confirmNewPassword) ? '#e2e8f0' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: (!newPassword || newPassword !== confirmNewPassword) ? '#94a3b8' : 'white', border: 'none', cursor: passwordChanging ? 'not-allowed' : 'pointer' }}>
                                    {passwordChanging ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                                    Modifier
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ TOAST NOTIFICATIONS ═══ */}
            <AnimatePresence>
                {toastMsg && (
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
                        style={{ position: 'fixed', bottom: '24px', right: '24px', padding: '14px 24px', borderRadius: '14px', fontSize: '13px', fontWeight: 600, zIndex: 2000, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', background: toastMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: toastMsg.type === 'success' ? '#166534' : '#b91c1c', border: `1px solid ${toastMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                        {toastMsg.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ MODAL: DISPONIBILITÉ FORM ═══ */}
            <AnimatePresence>
                {showDispoForm && activeDemande && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '24px' }}
                        onClick={() => setShowDispoForm(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '580px', maxHeight: '80vh', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
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
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                                <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '10px' }}>Ajouter un créneau :</p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div style={{ flex: '1 1 120px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Classe</label>
                                        <select value={dispoClasse || ''} onChange={e => setDispoClasse(Number(e.target.value))}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none' }}>
                                            {(() => { const seen = new Set<number>(); return (data?.affectations || []).filter(a => { if (seen.has(a.classe_id)) return false; seen.add(a.classe_id); return true; }).map(a => <option key={`dispo-cls-${a.classe_id}`} value={a.classe_id}>{a.classe}</option>); })()}
                                        </select>
                                    </div>
                                    <div style={{ flex: '1 1 100px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Jour</label>
                                        <select value={dispoJour} onChange={e => setDispoJour(e.target.value)}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none' }}>
                                            {DISPO_JOURS.map(j => <option key={j} value={j}>{DISPO_JOURS_L[j]}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ flex: '1 1 100px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Heure</label>
                                        <select value={dispoHeure} onChange={e => setDispoHeure(e.target.value)}
                                            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none' }}>
                                            {DISPO_HEURES.map(h => <option key={h.debut} value={h.debut}>{h.debut} - {h.fin}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={addDispoSlot} style={{ padding: '8px 14px', borderRadius: '8px', background: '#0f766e', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={13} /> Ajouter</button>
                                </div>
                            </div>
                            {/* Slots list */}
                            <div style={{ padding: '16px 24px', overflow: 'auto', flex: 1 }}>
                                {dispoSlots.length === 0 ? (
                                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px' }}>Ajoutez vos créneaux de disponibilité ci-dessus.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>{dispoSlots.length} créneau(x) ajouté(s) :</p>
                                        {dispoSlots.map((s, i) => {
                                            const clsName = (data?.affectations || []).find(a => a.classe_id === s.classe_id)?.classe || '?';
                                            return (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', background: '#f0fdfa', border: '1px solid #ccfbf1', fontSize: '12px' }}>
                                                    <div style={{ display: 'flex', gap: '12px', fontWeight: 600, color: '#0f766e' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> {clsName}</span>
                                                        <span>{DISPO_JOURS_L[s.jour]}</span>
                                                        <span>{s.heure_debut} - {s.heure_fin}</span>
                                                    </div>
                                                    <button onClick={() => removeDispoSlot(i)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#fee2e2', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={11} /></button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                <button onClick={() => setShowDispoForm(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={submitDispos} disabled={dispoSubmitting || dispoSlots.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, background: dispoSlots.length > 0 ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : '#e2e8f0', color: dispoSlots.length > 0 ? 'white' : '#94a3b8', border: 'none', cursor: dispoSubmitting ? 'not-allowed' : 'pointer' }}>
                                    {dispoSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    Envoyer ({dispoSlots.length})
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ MODAL: UPLOAD SUJET EXAMEN ═══ */}
            <AnimatePresence>
                {showUploadForm && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '24px' }}
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
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '6px' }}>Période *</label>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {trimestres.length === 0 && (
                                            <span style={{ fontSize: '12.5px', color: '#b45309' }}>
                                                Aucune période configurée pour cette année.
                                            </span>
                                        )}
                                        {trimestres.map((p: any) => (
                                            <button key={p.trimestre_id} type="button" onClick={() => setUploadTrimestre(p.trimestre_id)}
                                                style={{ flex: '1 1 100px', padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, background: uploadTrimestre === p.trimestre_id ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#f8fafc', color: uploadTrimestre === p.trimestre_id ? 'white' : '#64748b', border: uploadTrimestre === p.trimestre_id ? 'none' : '1px solid #e2e8f0', cursor: 'pointer' }}>
                                                {p.libelle}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Matière */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Matière *</label>
                                    <select value={uploadMatiere || ''} onChange={e => setUploadMatiere(Number(e.target.value))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                                        {(() => { const seen = new Set<number>(); return (data?.affectations || []).filter(a => { if (seen.has(a.matiere_id)) return false; seen.add(a.matiere_id); return true; }).map(a => <option key={`upload-mat-${a.matiere_id}`} value={a.matiere_id}>{a.matiere}</option>); })()}
                                    </select>
                                </div>
                                {/* Titre */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Titre du sujet *</label>
                                    <input value={uploadTitre} onChange={e => setUploadTitre(e.target.value)}
                                        placeholder="Ex: Devoir de Mathématiques — Chapitre 5"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                {/* Durée */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Durée de l&apos;évaluation *</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[30, 45, 60, 90, 120, 180].map(d => (
                                            <button key={d} type="button" onClick={() => setUploadDuree(d)} style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, background: uploadDuree === d ? '#4f46e5' : '#f1f5f9', color: uploadDuree === d ? 'white' : '#64748b', border: 'none', cursor: 'pointer' }}>
                                                {d < 60 ? `${d}min` : `${d / 60}h`}{d === 90 ? '30' : ''}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* File Drop Zone */}
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Fichier du sujet * (PDF, Word)</label>
                                    <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png,.webp" style={{ display: 'none' }}
                                        onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
                                    <div onClick={() => fileInputRef.current?.click()}
                                        style={{ padding: '28px', borderRadius: '14px', border: uploadFile ? '2px solid #10b981' : '2px dashed #cbd5e1', background: uploadFile ? '#f0fdf4' : '#f8fafc', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                                        {uploadFile ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={20} /></div>
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
                            <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                <button onClick={() => setShowUploadForm(false)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleUploadSujet} disabled={uploading || !uploadFile} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, background: uploadFile ? 'linear-gradient(135deg, #d97706, #f59e0b)' : '#e2e8f0', color: uploadFile ? 'white' : '#94a3b8', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                    Téléverser
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ MODAL: MODIFIER UN SUJET ═══ */}
            <AnimatePresence>
                {showEditSujet && editSujetData && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '24px' }}
                        onClick={() => setShowEditSujet(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Modifier le Sujet</h3>
                                <button onClick={() => setShowEditSujet(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Période</label>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {trimestres.map((p: any) => (
                                            <button key={p.trimestre_id} type="button" onClick={() => setEditSujetData({ ...editSujetData, trimestre_id: p.trimestre_id })}
                                                style={{ flex: '1 1 100px', padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, background: editSujetData.trimestre_id === p.trimestre_id ? primaryColor : '#f8fafc', color: editSujetData.trimestre_id === p.trimestre_id ? 'white' : '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                                {p.libelle}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Titre du sujet</label>
                                    <input value={editSujetData.titre} onChange={e => setEditSujetData({ ...editSujetData, titre: e.target.value })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>Durée (minutes)</label>
                                    <input type="number" value={editSujetData.duree_minutes} onChange={e => setEditSujetData({ ...editSujetData, duree_minutes: Number(e.target.value) })}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button onClick={() => setShowEditSujet(false)} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
                                    <button onClick={handleEditSujet} disabled={editSujetSaving}
                                        style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: primaryColor, color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                        {editSujetSaving ? 'Enregistrement...' : 'Mettre à jour'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ MODAL: SIGNALER UN ENFANT SCOLARISÉ ═══ */}
            <AnimatePresence>
                {showSignalerEnfantModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '24px' }}
                        onClick={() => setShowSignalerEnfantModal(false)}>
                        <motion.div initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 25 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Signaler un Enfant Scolarisé</h3>
                                <button onClick={() => setShowSignalerEnfantModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Nom de l'enfant *</label>
                                    <input value={signalerForm.nom_enfant} onChange={e => setSignalerForm({ ...signalerForm, nom_enfant: e.target.value })}
                                        placeholder="Ex: Camara"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Prénom de l'enfant</label>
                                    <input value={signalerForm.prenom_enfant} onChange={e => setSignalerForm({ ...signalerForm, prenom_enfant: e.target.value })}
                                        placeholder="Ex: Mohamed"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Classe / Précisions</label>
                                    <input value={signalerForm.classe_detail} onChange={e => setSignalerForm({ ...signalerForm, classe_detail: e.target.value })}
                                        placeholder="Ex: 6ème Année A"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Remarque / Précisions complémentaires</label>
                                    <textarea value={signalerForm.remarque} onChange={e => setSignalerForm({ ...signalerForm, remarque: e.target.value })}
                                        placeholder="Toute information utile pour la direction..."
                                        rows={3}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button onClick={() => setShowSignalerEnfantModal(false)} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
                                    <button onClick={handleSignalerEnfant} disabled={signalerSending || !signalerForm.nom_enfant.trim()}
                                        style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                        {signalerSending ? 'Envoi...' : 'Transmettre à la direction'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ LIGHTBOX ═══ */}
            <AnimatePresence>
                {lightboxUrl && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => setLightboxUrl(null)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'column', gap: '16px', padding: '40px',
                        }}>
                        <button onClick={() => setLightboxUrl(null)} style={{
                            position: 'absolute', top: '20px', right: '20px', zIndex: 10,
                            width: '44px', height: '44px', borderRadius: '50%', border: 'none',
                            background: 'rgba(255,255,255,0.1)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <X size={22} color="white" />
                        </button>
                        <motion.img initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', damping: 20 }}
                            src={lightboxUrl} alt="Photo"
                            onClick={e => e.stopPropagation()}
                            style={{
                                maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain',
                                borderRadius: '16px', boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                            }} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT : DOCUMENTS & PARTAGES
// ══════════════════════════════════════════════════════════════════════════════

const DOC_TYPES = [
  { key: 'YOUTUBE', label: 'YouTube',     color: '#ef4444', icon: '▶️' },
  { key: 'GFORM',   label: 'Google Form', color: '#7c3aed', icon: 'ClipboardList' },
  { key: 'GDOC',    label: 'Google Doc',  color: '#2563eb', icon: 'FileText' },
  { key: 'PDF',     label: 'PDF',         color: '#dc2626', icon: '📕' },
  { key: 'LIEN',    label: 'Lien',        color: '#0891b2', icon: '🔗' },
];

function DocumentsTab({ enseignantId }: { enseignantId?: number }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titre: '', url: '', type: 'DOCUMENT', description: '' });

  const loadDocs = async () => {
    if (!enseignantId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/portail-enseignant/${enseignantId}/ressources`);
      setDocs(res.data.filter((d: any) => d.type !== 'LIEN'));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadDocs(); }, [enseignantId]);

  const addDoc = async () => {
    if (!form.titre.trim() || !form.url.trim() || !enseignantId) return;
    try {
      await api.post(`/api/portail-enseignant/${enseignantId}/ressources`, { ...form, type_ressource: form.type, categorie: 'RESSOURCE' });
      setForm({ titre: '', url: '', type: 'DOCUMENT', description: '' });
      setShowForm(false);
      loadDocs();
    } catch { alert('Erreur'); }
  };
  const removeDoc = async (id: number) => {
    if (!enseignantId) return;
    try {
      await api.delete(`/api/portail-enseignant/${enseignantId}/ressources/${id}`);
      loadDocs();
    } catch { alert('Erreur'); }
  };

  return (
    <motion.div key="documents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={22} color="#d97706" /> Documents &amp; Partages
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Partagez des ressources YouTube, Google Forms, PDFs…</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ background: 'white', borderRadius: '14px', border: '1.5px solid #fde68a', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>Titre *</label>
                <input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Cours Mathématiques T1"
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>Type</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                  <option value="DOCUMENT">Document</option>
                  <option value="FORM">Formulaire</option>
                  <option value="LIEN">Lien</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>URL *</label>
              <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..."
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Facultatif"
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
              <button onClick={addDoc} disabled={!form.titre.trim() || !form.url.trim()}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: form.titre.trim() && form.url.trim() ? 'linear-gradient(135deg,#d97706,#f59e0b)' : '#e2e8f0', color: form.titre.trim() && form.url.trim() ? 'white' : '#94a3b8', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Ajouter
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px', border: '1px dashed #e2e8f0', color: '#94a3b8' }}>
          <FileText size={44} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Aucun document partagé</p>
          <p style={{ fontSize: '13px', margin: '4px 0 0' }}>Vidéos YouTube, Google Forms, PDFs…</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {docs.map((d: any) => {
            const tp = DOC_TYPES.find(t => t.key === d.type) || DOC_TYPES[4];
            return (
              <motion.div key={d.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{ background: 'white', borderRadius: '14px', border: `1.5px solid ${tp.color}30`, overflow: 'hidden' }}>
                <div style={{ padding: '4px 14px', background: `${tp.color}15`, fontSize: '10px', fontWeight: 700, color: tp.color, letterSpacing: '1px' }}>
                  {tp.icon} {tp.label}
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{d.titre}</div>
                  {d.description && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{d.description}</div>}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>{d.date}</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <a href={d.url} target="_blank" rel="noreferrer"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', background: `${tp.color}15`, color: tp.color, fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                      <ExternalLink size={12} /> Ouvrir
                    </a>
                    <button onClick={() => removeDoc(d.id)} style={{ padding: '8px 10px', borderRadius: '8px', border: 'none', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPOSANT : LIENS EXTERNES
// ══════════════════════════════════════════════════════════════════════════════

const LINK_CATS = [
  { key: 'PEDAGOGIE', label: 'Pédagogie',  color: '#8b5cf6', icon: 'GraduationCap' },
  { key: 'RESSOURCE', label: 'Ressources', color: '#059669', icon: 'BookOpen' },
  { key: 'OUTIL',     label: 'Outils',     color: '#0891b2', icon: '🛠️' },
  { key: 'AUTRE',     label: 'Autre',      color: '#64748b', icon: '🔗' },
];

function LiensExternesTab({ enseignantId }: { enseignantId?: number }) {
  const [liens, setLiens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titre: '', url: '', categorie: 'AUTRE', description: '' });

  const loadLiens = async () => {
    if (!enseignantId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/portail-enseignant/${enseignantId}/ressources`);
      setLiens(res.data.filter((d: any) => d.type === 'LIEN'));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadLiens(); }, [enseignantId]);

  const addLien = async () => {
    if (!form.titre.trim() || !form.url.trim() || !enseignantId) return;
    try {
      await api.post(`/api/portail-enseignant/${enseignantId}/ressources`, { ...form, type_ressource: 'LIEN' });
      setForm({ titre: '', url: '', categorie: 'AUTRE', description: '' });
      setShowForm(false);
      loadLiens();
    } catch { alert('Erreur'); }
  };
  const removeLien = async (id: number) => {
    if (!enseignantId) return;
    try {
      await api.delete(`/api/portail-enseignant/${enseignantId}/ressources/${id}`);
      loadLiens();
    } catch { alert('Erreur'); }
  };
  const grouped = LINK_CATS.map(c => ({ ...c, items: liens.filter((l: any) => l.categorie === c.key) })).filter(g => g.items.length > 0);

  return (
    <motion.div key="liens" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ExternalLink size={22} color="#d97706" /> Liens Externes
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>Vos favoris et ressources en ligne</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#d97706,#f59e0b)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ background: 'white', borderRadius: '14px', border: '1.5px solid #fde68a', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>Titre *</label>
                <input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: Khan Academy"
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>Catégorie</label>
                <select value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
                  style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                  {LINK_CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>URL *</label>
              <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..."
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const }}>Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Facultatif"
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: 'white', fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
              <button onClick={addLien} disabled={!form.titre.trim() || !form.url.trim()}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: form.titre.trim() && form.url.trim() ? 'linear-gradient(135deg,#d97706,#f59e0b)' : '#e2e8f0', color: form.titre.trim() && form.url.trim() ? 'white' : '#94a3b8', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Ajouter
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : liens.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '16px', border: '1px dashed #e2e8f0', color: '#94a3b8' }}>
          <ExternalLink size={44} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Aucun lien enregistré</p>
          <p style={{ fontSize: '13px', margin: '4px 0 0' }}>Ajoutez vos sites préférés</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {grouped.map(g => (
            <div key={g.key}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: g.color, textTransform: 'uppercase' as const, letterSpacing: '1px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {g.icon} {g.label}
                <span style={{ background: `${g.color}15`, color: g.color, borderRadius: '20px', padding: '1px 8px', fontSize: '10px' }}>{g.items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '12px' }}>
                {g.items.map((l: any) => (
                  <motion.div key={l.ressource_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{l.titre}</div>
                      <button onClick={() => removeLien(l.ressource_id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}><X size={14} /></button>
                    </div>
                    {l.description && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{l.description}</div>}
                    <a href={l.url} target="_blank" rel="noreferrer"
                      style={{ fontSize: '11px', color: g.color, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ExternalLink size={11} /> {l.url}
                    </a>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
