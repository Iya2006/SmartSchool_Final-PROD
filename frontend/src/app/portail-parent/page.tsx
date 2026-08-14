'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Phone, User, GraduationCap, Wallet, CreditCard, TrendingUp, ChevronRight,
    BookOpen, Clock, Calendar, AlertCircle, CheckCircle, Star, Bell,
    MessageSquare, FileText, BarChart3, Award, Eye, EyeOff, X, ArrowRight, Search,
    Shield, Loader2, Lock, Home, ArrowLeft, LogOut, ChevronDown, Send, Inbox,
    PieChart, Activity, TrendingDown, Mail, MailOpen, Settings, Key,
    Camera, Upload, ImageIcon, ChevronLeft, ShoppingBag, Download, CheckCircle2, XCircle, PenLine, AlertTriangle, Target,
    UserCheck, School, ClipboardList, Trophy, Smartphone, Users, Pencil, Hourglass, Menu
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import ClassementEpreuves from '@/components/ClassementEpreuves';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useIsMobile } from '@/hooks/useIsMobile';

interface MsgItem {
    message_id: number; expediteur_type: string; expediteur_id: number|null;
    destinataire_type: string; destinataire_id: number|null; objet_type: string;
    sujet: string; contenu: string; statut: string; date_envoi: string|null; date_lecture: string|null;
}
const OBJET_COLORS: Record<string,{icon:string;color:string;bg:string}> = {
    GENERAL:{icon:'',color:'#3b82f6',bg:'#dbeafe'}, EMPLOI:{icon:'',color:'#0d9488',bg:'#ccfbf1'},
    DISCIPLINE:{icon:'',color:'#dc2626',bg:'#fee2e2'}, REUNION:{icon:'',color:'#7c3aed',bg:'#ede9fe'},
    EXAMENS:{icon:'',color:'#f59e0b',bg:'#fef3c7'}, PAIEMENT:{icon:'',color:'#059669',bg:'#d1fae5'},
    BULLETIN:{icon:'',color:'#ea580c',bg:'#fff7ed'},
};

/* ─── Types ─── */
interface ParentInfo { parent_id: number; nom: string; prenom: string; telephone: string; email: string; profession: string; photo_url?: string | null; has_pending_photo?: boolean; }
interface NoteData { matiere: string; evaluation: string; note: number | null; note_sur: number; coefficient: number; est_absent: boolean; date: string | null; }
interface EcheanceData { echeance_id: number; libelle: string; date_limite: string | null; montant_attendu: number; montant_paye: number; statut: string; }
interface FactureData { facture_id: number; numero: string; date: string | null; montant_total: number; montant_paye: number; montant_restant: number; statut: string; type_frais?: string; echeances?: EcheanceData[]; }
interface PaiementData { paiement_id: number; numero_recu: string; date: string | null; montant: number; mode: string; statut: string; }
interface EdtSlot { jour: string; heure_debut: string; heure_fin: string; matiere: string; enseignant: string; salle: string | null; }
interface Enfant {
    eleve_id: number; nom: string; prenom: string; matricule: string; sexe: string; photo_url: string | null;
    classe_code: string; classe: string; lien_parente: string; moyenne: number | null; nb_notes: number;
    notes: NoteData[]; factures: FactureData[]; paiements: PaiementData[];
    nb_present: number; nb_absent: number; statut: string; has_pending_photo?: boolean;
}
interface FinResume { total_factures: number; total_paye: number; total_restant: number; taux: number; }
interface DashData { parent: ParentInfo; enfants: Enfant[]; finance_resume: FinResume; nb_enfants: number; }

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const HEURES = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'];
const SLOT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'Français': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    'Mathématiques': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    'Histoire-Géographie': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    'Physique-Chimie': { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
    'SVT': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    'Anglais': { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
    'default': { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
};

const CHILD_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#ef4444'];
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

function formatGNF(amount: number) {
    return new Intl.NumberFormat('fr-GN', { style: 'decimal', maximumFractionDigits: 0 }).format(amount) + ' GNF';
}

export default function PortailParent() {
    const { user, logout } = useAuth();
    const { etablissementNom, etablissementLogo, theme, applyTheme } = useApp();

    const primaryColor = theme.couleurParent || '#10b981';
    const accentColor = theme.couleurParent ? theme.couleurParent + 'cc' : '#059669';

    // Initial load based on auth user
    useEffect(() => {
        if (user && user.role === 'PARENT') {
            const id = user.id;
            api.get(`/api/portail-parent/${id}/dashboard`)
                .then(res => setData(res.data))
                .catch(err => console.error(err));
        }
    }, [user]);
    const router = useRouter();
    const [data, setData] = useState<DashData | null>(null);
    const [selectedChild, setSelectedChild] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<'notes' | 'paiements' | 'emploi' | 'bulletin' | 'absences' | 'messages' | 'dashboard' | 'profil' | 'parametres' | 'devoirs' | 'photos' | 'fournitures' | 'evenements' | 'activites'>('dashboard');
    const [parentEvts, setParentEvts] = useState<any[]>([]);
    const [parentActs, setParentActs] = useState<any[]>([]);
    const [detailModal, setDetailModal] = useState<Enfant | null>(null);
    const [edtSlots, setEdtSlots] = useState<EdtSlot[]>([]);
    const [edtLoading, setEdtLoading] = useState(false);
    const [bulletinData, setBulletinData] = useState<any>(null);
    const [bulletinLoading, setBulletinLoading] = useState(false);
    // La période part vide : on ne devine pas le découpage de l'année. Le
    // sélecteur se remplit avec les périodes réelles de l'école de l'enfant,
    // et le serveur choisit celle en cours tant qu'aucune n'est demandée.
    const [selectedTrimestre, setSelectedTrimestre] = useState<number | null>(null);
    const [periodes, setPeriodes] = useState<{ trimestre_id: number; libelle: string; statut: string }[]>([]);
    const [absencesData, setAbsencesData] = useState<any>(null);
    const [absencesLoading, setAbsencesLoading] = useState(false);

    // Messaging & notifications
    const [parentMessages, setParentMessages] = useState<{received: MsgItem[]; sent: MsgItem[]}>({received:[], sent:[]});
    const [msgLoading, setMsgLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifDrop, setShowNotifDrop] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showProfileDropdown, setShowProfileDropdown] = useState(false);
    // Tiroir mobile — aucun traitement responsive n'existait sur cette page
    // avant ce chantier (contrairement a portail-eleve, qui a servi de motif
    // de reference).
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const isMobile = useIsMobile();
    // Clé "type:id" (ex. "eleve:12") — jamais un id nu : Parent.parent_id et
    // Eleve.eleve_id sont deux séquences auto-incrémentées indépendantes qui
    // se recoupent facilement (ex. parent_id=12 et un eleve_id=12 sans lien
    // entre eux), ce qui mélangeait le statut "en attente" entre le parent
    // et son enfant quand seul l'id nu servait de clé.
    const [pendingPhotos, setPendingPhotos] = useState<Set<string>>(new Set());
    const [selectedMsg, setSelectedMsg] = useState<MsgItem|null>(null);
    const [newMsgSujet, setNewMsgSujet] = useState('');
    const [newMsgContenu, setNewMsgContenu] = useState('');
    const [newMsgObjet, setNewMsgObjet] = useState('GENERAL');
    const [sendingMsg, setSendingMsg] = useState(false);
    const [showComposeMsg, setShowComposeMsg] = useState(false);

    // Devoirs state
    const [parentDevoirs, setParentDevoirs] = useState<any[]>([]);
    const [devoirsLoading, setDevoirsLoading] = useState(false);

    // Load devoirs when tab opens (fresh each time)
    useEffect(() => {
        if (activeTab !== 'devoirs' || !data) return;
        setDevoirsLoading(true);
        api.get(`/api/devoirs/parent/${data.parent.parent_id}`)
            .then(res => setParentDevoirs(res.data))
            .catch(() => {})
            .finally(() => setDevoirsLoading(false));
    }, [activeTab, data]);

    // Fournitures state
    const [fournituresData, setFournituresData] = useState<any[]>([]);
    const [fournituresLoading, setFournituresLoading] = useState(false);

    useEffect(() => {
        if (activeTab !== 'fournitures' || !data) return;
        setFournituresLoading(true);
        api.get(`/api/portail-parent/${data.parent.parent_id}/fournitures`)
            .then(res => setFournituresData(res.data))
            .catch(() => {})
            .finally(() => setFournituresLoading(false));
    }, [activeTab, data]);

    // Profile & Settings state
    const [profilData, setProfilData] = useState<any>(null);
    const [profilLoading, setProfilLoading] = useState(false);
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState<any>({});
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState('');
    const [oldPwd, setOldPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdError, setPwdError] = useState('');
    const [pwdSuccess, setPwdSuccess] = useState('');
    const [changingPwd, setChangingPwd] = useState(false);

    // Photos state
    const [photoSuccess, setPhotoSuccess] = useState<string | null>(null);
    const [photoUploading, setPhotoUploading] = useState<string | null>(null);

    // Refs for carousel scrolling
    const childCarouselRef = useRef<HTMLDivElement>(null);
    const tabBarRef = useRef<HTMLDivElement>(null);
    // Lightbox state for viewing photos
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [expandedFactureId, setExpandedFactureId] = useState<number | null>(null);
    // Ref stable pour le parentId — évite les dépendances circulaires dans refreshDashboard
    const parentIdRef = useRef<number | null>(null);

    // Ferme le tiroir mobile a chaque changement d'onglet — la navigation ici
    // se fait via setActiveTab, pas via le routeur.
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [activeTab]);

    // Load timetable when tab changes to 'emploi' or child changes
    useEffect(() => {
        if (activeTab === 'emploi' && data && data.enfants[selectedChild]) {
            const parentId = data.parent.parent_id;
            const eleveId = data.enfants[selectedChild].eleve_id;
            setEdtLoading(true);
            api.get(`/api/portail-parent/${parentId}/enfant/${eleveId}/emploi-du-temps`)
                .then(res => setEdtSlots(res.data))
                .catch(() => setEdtSlots([]))
                .finally(() => setEdtLoading(false));
        }
    }, [activeTab, selectedChild, data]);

    // Load bulletin when tab changes to 'bulletin'
    useEffect(() => {
        if (activeTab === 'bulletin' && data && data.enfants[selectedChild]) {
            const parentId = data.parent.parent_id;
            const eleveId = data.enfants[selectedChild].eleve_id;
            setBulletinLoading(true);
            const periode = selectedTrimestre ? `?trimestre_id=${selectedTrimestre}` : '';
            api.get(`/api/portail-parent/${parentId}/enfant/${eleveId}/bulletin${periode}`)
                .then(res => setBulletinData(res.data))
                .catch(() => setBulletinData(null))
                .finally(() => setBulletinLoading(false));
        }
    }, [activeTab, selectedChild, selectedTrimestre, data]);

    // Les périodes de l'école de l'enfant, chargées une fois par enfant.
    useEffect(() => {
        if (!data || !data.enfants[selectedChild]) return;
        const parentId = data.parent.parent_id;
        const eleveId = data.enfants[selectedChild].eleve_id;
        api.get(`/api/portail-parent/${parentId}/enfant/${eleveId}/periodes`)
            .then(res => {
                setPeriodes(res.data || []);
                const enCours = (res.data || []).find((p: any) => p.statut === 'EN_COURS');
                setSelectedTrimestre((enCours || res.data?.[0])?.trimestre_id ?? null);
            })
            .catch(() => setPeriodes([]));
    }, [selectedChild, data]);

    // Load absences when tab changes to 'absences'
    useEffect(() => {
        if (activeTab === 'absences' && data && data.enfants[selectedChild]) {
            const parentId = data.parent.parent_id;
            const eleveId = data.enfants[selectedChild].eleve_id;
            setAbsencesLoading(true);
            api.get(`/api/portail-parent/${parentId}/enfant/${eleveId}/absences`)
                .then(res => setAbsencesData(res.data))
                .catch(() => setAbsencesData(null))
                .finally(() => setAbsencesLoading(false));
        }
    }, [activeTab, selectedChild, data]);

    useEffect(() => {
        if (activeTab === 'evenements') {
            api.get('/api/evenements').then(r => {
                setParentEvts((r.data || []).filter((e: any) => e.statut === 'PUBLIE'));
            }).catch(() => {});
        }
        if (activeTab === 'activites') {
            api.get('/api/activites').then(r => {
                setParentActs((r.data || []).filter((a: any) => a.est_actif === 'O'));
            }).catch(() => {});
        }
    }, [activeTab]);

    // Load profil when tab changes to 'profil'
    useEffect(() => {
        if (activeTab === 'profil' && data) {
            const parentId = data.parent.parent_id;
            setProfilLoading(true);
            api.get(`/api/portail-parent/${parentId}/profil`)
                .then(res => {
                    setProfilData(res.data);
                    setProfileForm({
                        prenom: res.data.prenom || '',
                        nom: res.data.nom || '',
                        telephone_1: res.data.telephone_1 || '',
                        telephone_2: res.data.telephone_2 || '',
                        email: res.data.email || '',
                        profession: res.data.profession || '',
                        adresse: res.data.adresse || '',
                    });
                })
                .catch(() => setProfilData(null))
                .finally(() => setProfilLoading(false));
        }
    }, [activeTab, data]);

    // P1 FIX: Sync pendingPhotos with actual server data — clear pending if photo_url already exists
    useEffect(() => {
        if (!data) return;
        setPendingPhotos(prev => {
            const next = new Set(prev);
            // Check parent photo
            const parentKey = `parent:${data.parent.parent_id}`;
            if (data.parent.has_pending_photo) {
                next.add(parentKey);
            } else if (data.parent.photo_url && next.has(parentKey)) {
                next.delete(parentKey);
            }
            // Check children photos
            for (const enf of data.enfants || []) {
                const eleveKey = `eleve:${enf.eleve_id}`;
                if (enf.has_pending_photo) {
                    next.add(eleveKey);
                } else if (enf.photo_url && next.has(eleveKey)) {
                    next.delete(eleveKey);
                }
            }
            return next;
        });
    }, [data]);

    // Poll notification count
    useEffect(() => {
        if (!data) return;
        const fetchCount = () => {
            api.get(`/api/portail-parent/${data.parent.parent_id}/messages/non-lus`)
                .then(res => setUnreadCount(res.data.non_lus || 0))
                .catch(() => {});
        };
        fetchCount();
        const interval = setInterval(fetchCount, 30000);
        return () => clearInterval(interval);
    }, [data]);

    // ═══ REFRESH AUTOMATIQUE du tableau de bord ═══
    // Utilise un ref stable pour le parentId pour éviter les dépendances circulaires.
    // Se déclenche : (1) toutes les 8 secondes, (2) quand l'onglet redevient actif.
    const refreshDashboard = useCallback(async () => {
        const pid = parentIdRef.current;
        if (!pid) return;
        try {
            const dash = await api.get(`/api/portail-parent/${pid}/dashboard`);
            setData(dash.data);
        } catch { /* Silencieux — ne pas afficher d'erreur sur les refreshs auto */ }
    }, []);

    useEffect(() => {
        // Refresh immédiat à l'entrée du dashboard
        refreshDashboard();
        // Refresh quand l'onglet redevient visible (ex: l'admin vient de modifier des données)
        const handleVisibility = () => {
            if (!document.hidden) refreshDashboard();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [ refreshDashboard]);
    const downloadFacturePDF = async (e: React.MouseEvent, factureId: number, numero: string) => {
        e.stopPropagation();
        try {
            const res = await api.get(`/api/portail-parent/factures/${factureId}/pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `facture_${numero}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Erreur lors du téléchargement de la facture');
        }
    };

    // Téléchargement du reçu d'un paiement précis — l'historique des paiements
    // n'offrait jusqu'ici aucun moyen de télécharger le reçu lui-même (seule la
    // facture globale était téléchargeable).
    const downloadRecuPDF = async (e: React.MouseEvent, paiementId: number, numeroRecu: string) => {
        e.stopPropagation();
        try {
            // L'endpoint /api/finance/paiements/{id}/recu-pdf est protégé par FINANCE_ROLES
            // et inaccessible au token parent. On utilise l'endpoint dédié du portail parent.
            const res = await api.get(`/api/portail-parent/paiements/${paiementId}/recu-pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `recu_${numeroRecu}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Erreur lors du téléchargement du reçu');
        }
    };

    const doLogin = async () => {
        /*
        if (!phone.trim()) { setLoginError('Entrez votre numéro de téléphone'); return; }
        setLoginLoading(true); setLoginError('');
        try {
            const loginPayload: any = { telephone: phone.trim() };
            if (password.trim()) loginPayload.mot_de_passe = password.trim();
            const res = await api.post('/api/portail-parent/login', loginPayload);
            const parentId = res.data.parent_id;
            parentIdRef.current = parentId;  // Stocker pour le refresh automatique
            const dash = await api.get(`/api/portail-parent/${parentId}/dashboard`);
            setData(dash.data);
            setStep('dashboard');
        } catch (e: any) {
            setLoginError(e.response?.data?.detail || 'Numéro non trouvé');
        } finally { setLoginLoading(false); }
        */
    };

    // ── Messaging functions ──
    const loadMessages = useCallback(async () => {
        if (!data) return;
        setMsgLoading(true);
        try {
            const res = await api.get(`/api/portail-parent/${data.parent.parent_id}/messages`);
            setParentMessages(res.data);
        } catch { setParentMessages({received:[], sent:[]}); }
        finally { setMsgLoading(false); }
    }, [data]);

    const loadUnread = useCallback(async () => {
        if (!data) return;
        try {
            const res = await api.get(`/api/portail-parent/${data.parent.parent_id}/messages/non-lus`);
            setUnreadCount(res.data.non_lus || 0);
        } catch { setUnreadCount(0); }
    }, [data]);

    useEffect(() => { if (data) { loadMessages(); loadUnread(); } }, [ data, loadMessages, loadUnread]);

    const markRead = async (msg: MsgItem) => {
        if (!data || msg.statut !== 'ENVOYE') return;
        try { await api.put(`/api/portail-parent/${data.parent.parent_id}/messages/${msg.message_id}/lire`); loadUnread(); } catch {}
    };

    const sendMessage = async () => {
        if (!data || !newMsgSujet.trim()) return;
        setSendingMsg(true);
        try {
            await api.post(`/api/portail-parent/${data.parent.parent_id}/messages/envoyer`, {
                sujet: newMsgSujet, contenu: newMsgContenu, objet_type: newMsgObjet,
            });
            setShowComposeMsg(false); setNewMsgSujet(''); setNewMsgContenu('');
            loadMessages(); loadUnread();
        } catch {} finally { setSendingMsg(false); }
    };

    const child = data?.enfants?.[selectedChild];

    // ─── LOGIN SCREEN ───
    if (!user || user.role !== 'PARENT') return <div style={{padding: '50px', textAlign: 'center'}}>Chargement ou accès refusé...</div>;
    if (!data) return null;

    const parentInitials = `${data.parent.prenom?.[0] ?? ''}${data.parent.nom?.[0] ?? ''}`;
    const parentPhotoSrc = data.parent.photo_url ? `${API_BASE}${data.parent.photo_url}` : null;

    const sideNavItems = [
        { key: 'dashboard' as const, label: 'Tableau de Bord', icon: PieChart },
        { key: 'notes' as const, label: 'Notes', icon: BarChart3 },
        { key: 'bulletin' as const, label: 'Bulletins', icon: FileText },
        { key: 'absences' as const, label: 'Absences', icon: Clock },
        { key: 'paiements' as const, label: 'Paiements', icon: CreditCard },
        { key: 'emploi' as const, label: 'Emploi du Temps', icon: Calendar },
        { key: 'messages' as const, label: 'Messages', icon: MessageSquare },
        { key: 'devoirs' as const, label: 'Devoirs', icon: BookOpen },
        { key: 'fournitures' as const, label: 'Fournitures', icon: ShoppingBag },
        { key: 'photos' as const, label: 'Photos', icon: Camera },
        { key: 'evenements' as const, label: 'Événements', icon: Calendar },
        { key: 'activites' as const, label: 'Activités', icon: Activity },
        { key: 'parametres' as const, label: 'Paramètres', icon: Settings },
    ];

    return (
        <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', fontFamily: 'Inter, -apple-system, sans-serif', background: '#f8fafc' }}>

            {/* ══ SIDEBAR PARENT (Émeraude) — tiroir sous 768px, aucun
                traitement responsive n'existait ici avant ce chantier ══ */}
            <div style={isMobile ? {
                width: 'min(240px, 84vw)', background: `linear-gradient(180deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                display: 'flex', flexDirection: 'column', flexShrink: 0,
                position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200,
                transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
                transition: 'transform 0.3s ease',
                boxShadow: mobileMenuOpen ? '10px 0 34px rgba(0,0,0,0.25)' : 'none',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                boxSizing: 'border-box',
            } : {
                width: '240px', background: `linear-gradient(180deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                display: 'flex', flexDirection: 'column', flexShrink: 0,
                boxShadow: '4px 0 24px rgba(0,0,0,0.2)',
            }}>
                {/* Logo */}
                <div style={{ padding: '24px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, color: 'white' }}>S</div>
                        <div>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: 'white', letterSpacing: '0.5px' }}>SMARTSCHOOL</p>
                            <p style={{ margin: 0, fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Portail Parent</p>
                        </div>
                    </div>
                </div>

                {/* Avatar */}
                <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                            background: parentPhotoSrc ? `url(${parentPhotoSrc}) center/cover no-repeat` : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,

                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '16px', fontWeight: 800, color: 'white',
                            border: '2px solid rgba(255,255,255,0.2)', cursor: parentPhotoSrc ? 'zoom-in' : 'default',
                        }} onClick={() => parentPhotoSrc && setLightboxUrl(parentPhotoSrc)}>
                            {!parentPhotoSrc && parentInitials}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {data.parent.prenom} {data.parent.nom}
                            </p>
                            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                                {data.nb_enfants} enfant{data.nb_enfants > 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
                    {sideNavItems.map(item => {
                        const isActive = activeTab === item.key;
                        const badge = item.key === 'messages' && unreadCount > 0 ? unreadCount : null;
                        return (
                            <button key={item.key}
                                onClick={() => { setActiveTab(item.key); setMobileMenuOpen(false); }}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '10px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                    marginBottom: '2px', transition: 'all 0.15s',
                                    background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                                    color: isActive ? 'white' : 'rgba(255,255,255,0.55)',
                                    fontWeight: isActive ? 700 : 500, fontSize: '13px',
                                    borderLeft: isActive ? `3px solid ${primaryColor}` : '3px solid transparent',
                                }}>
                                <item.icon size={16} />
                                {item.label}
                                {badge && (
                                    <span style={{ marginLeft: 'auto', background: '#ef4444', color: 'white', borderRadius: '20px', fontSize: '10px', fontWeight: 700, padding: '1px 6px' }}>
                                        {badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Logout */}
                <div style={{ padding: '16px' }}>
                    <button onClick={() => { logout(); }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px', transition: 'all 0.15s' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#fca5a5'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}>
                        <LogOut size={15} /> Déconnexion
                    </button>
                </div>
            </div>

            {/* Overlay du tiroir mobile — clic pour fermer */}
            {isMobile && mobileMenuOpen && (
                <div
                    onClick={() => setMobileMenuOpen(false)}
                    aria-hidden="true"
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 190 }}
                />
            )}

            {/* ══ CONTENU PRINCIPAL ══ */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* ── HEADER ── */}
                <div style={{ height: '60px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end', padding: isMobile ? '0 14px' : '0 32px', flexShrink: 0, position: 'relative' }}>
                    {isMobile && (
                        <button
                            onClick={() => setMobileMenuOpen(o => !o)}
                            aria-label="Ouvrir le menu de navigation"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: '6px' }}
                        >
                            <Menu size={22} />
                        </button>
                    )}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: primaryColor, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                                {parentInitials}
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{data.parent.prenom} {data.parent.nom}</p>
                                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Parent</p>
                            </div>
                            <ChevronDown size={14} color="#64748b" />
                        </button>
                        <AnimatePresence>
                            {showProfileDropdown && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, width: '200px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', overflow: 'hidden', zIndex: 100 }}>
                                    <button onClick={() => { setActiveTab('profil'); setShowProfileDropdown(false); }} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#334155', borderBottom: '1px solid #f1f5f9' }}>
                                        <User size={16} /> Mon Profil
                                    </button>
                                    <button onClick={() => { logout(); setShowProfileDropdown(false); }} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#ef4444' }}>
                                        <LogOut size={16} /> Déconnexion
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
                {!["profil", "parametres", "evenements", "activites"].includes(activeTab) && (
                    <>
                        {/* ═══ WELCOME + KPI CARDS ═══ */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 800, color: '#1e293b' }}>
                        Bonjour, {data.parent.prenom} 👋
                    </h2>
                    <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#64748b' }}>
                        {theme.msgParent || `Suivi scolaire de ${data.nb_enfants} enfant${data.nb_enfants > 1 ? 's' : ''} • Année en cours`}
                    </p>
                </motion.div>

                {/* KPI Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '18px', marginBottom: '28px' }}>
                    {[
                        { label: 'Enfants Inscrits', value: String(data.nb_enfants), icon: <GraduationCap size={22} />, color: '#6366f1', bg: '#ede9fe' },
                        { label: 'Total Facturé', value: formatGNF(data.finance_resume.total_factures), icon: <FileText size={22} />, color: '#f59e0b', bg: '#fef3c7' },
                        { label: 'Total Payé', value: formatGNF(data.finance_resume.total_paye), icon: <CheckCircle size={22} />, color: primaryColor, bg: '#d1fae5' },
                        { label: 'Restant à Payer', value: formatGNF(data.finance_resume.total_restant), icon: <AlertCircle size={22} />, color: data.finance_resume.total_restant > 0 ? '#ef4444' : '#10b981', bg: data.finance_resume.total_restant > 0 ? '#fee2e2' : '#d1fae5' },
                    ].map((kpi, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}
                            style={{
                                background: 'white', borderRadius: '16px', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${kpi.color}15`; }}
                            onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
                        >
                            <div>
                                <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{kpi.label}</p>
                                <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>{kpi.value}</p>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>
                                {kpi.icon}
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* ═══ CHILDREN SELECTOR (P3: arrows removed, scroll only) ═══ */}
                {data.enfants.length > 1 && (
                    <div style={{ position: 'relative', marginBottom: '24px' }}>
                        <div id="parent-child-carousel" style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px', scrollBehavior: 'smooth', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                            {data.enfants.map((enf, i) => (
                                <button key={enf.eleve_id} onClick={() => setSelectedChild(i)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
                                        borderRadius: '14px', border: selectedChild === i ? `2px solid ${CHILD_COLORS[i]}` : '2px solid #e2e8f0',
                                        background: selectedChild === i ? `${CHILD_COLORS[i]}10` : 'white',
                                        cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', minWidth: 'fit-content',
                                    }}>
                                    {/* P6: Clickable photo in carousel */}
                                    <div onClick={(e) => { if (enf.photo_url) { e.stopPropagation(); setLightboxUrl(`${API_BASE}${enf.photo_url}`); } }} style={{
                                        width: '36px', height: '36px', borderRadius: '50%',
                                        background: enf.photo_url
                                            ? `url(${API_BASE}${enf.photo_url}) center/cover no-repeat`
                                            : CHILD_COLORS[i],
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: '14px', fontWeight: 700,
                                        border: `2px solid ${selectedChild === i ? CHILD_COLORS[i] : '#e2e8f0'}`,
                                        cursor: enf.photo_url ? 'pointer' : 'default',
                                    }}>
                                        {!enf.photo_url && `${enf.prenom[0]}${enf.nom[0]}`}
                                    </div>
                                    <div style={{ textAlign: 'left' }}>
                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{enf.prenom} {enf.nom}</p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{enf.classe} • {enf.lien_parente}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                </>
                )}

                {/* ═══ MAIN CONTENT: TWO COLUMNS ═══ */}
                {child && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile || ['profil', 'parametres', 'evenements', 'activites'].includes(activeTab) ? '1fr' : '340px 1fr', gap: '24px', alignItems: 'start' }}>

                        {/* ─── LEFT: CHILD CARD ─── */}
                        {!['profil', 'parametres', 'evenements', 'activites'].includes(activeTab) && (
                        <motion.div key={child.eleve_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Student Card */}
                            <div style={{
                                background: 'white', borderRadius: '20px', overflow: 'hidden',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                            }}>
                                <div style={{
                                    background: `linear-gradient(135deg, ${CHILD_COLORS[selectedChild]}, ${CHILD_COLORS[selectedChild]}cc)`,
                                    padding: '28px', textAlign: 'center', position: 'relative', color: 'white',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px',
                                        borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
                                    }} />
                                    {/* P6: Clickable child photo in card */}
                                    <div onClick={() => { if (child.photo_url) setLightboxUrl(`${API_BASE}${child.photo_url}`); }} style={{
                                        width: '80px', height: '80px', borderRadius: '50%',
                                        background: child.photo_url
                                            ? `url(${API_BASE}${child.photo_url}) center/cover no-repeat`
                                            : 'rgba(255,255,255,0.25)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 12px', fontSize: '28px', fontWeight: 800,
                                        border: '3px solid rgba(255,255,255,0.4)',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                        cursor: child.photo_url ? 'pointer' : 'default',
                                        transition: 'transform 0.2s',
                                    }}
                                    onMouseEnter={e => { if (child.photo_url) e.currentTarget.style.transform = 'scale(1.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                                        {!child.photo_url && `${child.prenom[0]}${child.nom[0]}`}
                                    </div>
                                    <h3 style={{ margin: '0 0 2px', fontSize: '18px', fontWeight: 800 }}>{child.prenom} {child.nom}</h3>
                                    <p style={{ margin: 0, fontSize: '13px', opacity: 0.85 }}>{child.classe}</p>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '10px' }}>
                                        <span style={{
                                            padding: '3px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
                                        }}>{child.matricule}</span>
                                        <span style={{
                                            padding: '3px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                            background: child.statut === 'ACTIF' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
                                        }}>{child.statut}</span>
                                    </div>
                                </div>
                                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#f8fafc' }}>
                                        <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: child.moyenne && child.moyenne >= 10 ? '#10b981' : '#ef4444' }}>
                                            {child.moyenne !== null ? `${child.moyenne}/20` : '—'}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Moyenne</p>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#f8fafc' }}>
                                        <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#6366f1' }}>{child.nb_notes}</p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Notes</p>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#f8fafc' }}>
                                        <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: primaryColor }}>{child.nb_present}</p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Présences</p>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#f8fafc' }}>
                                        <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#ef4444' }}>{child.nb_absent}</p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Absences</p>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Finance Summary */}
                            <div style={{
                                background: 'white', borderRadius: '16px', padding: '20px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                            }}>
                                <h5 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
                                    <Wallet size={16} color="#f59e0b" /> Situation Financière
                                </h5>
                                {child.factures.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '12px' }}>Aucune facture</p>
                                ) : child.factures.map((f, i) => (
                                    <div key={i} style={{
                                        padding: '12px', borderRadius: '12px', marginBottom: i < child.factures.length - 1 ? '10px' : '0',
                                        background: '#f8fafc', border: '1px solid #e2e8f0',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>{f.numero}</span>
                                            <span style={{
                                                fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                                                background: f.statut === 'PAYEE' ? '#d1fae5' : f.statut === 'PARTIELLE' ? '#fef3c7' : '#fee2e2',
                                                color: f.statut === 'PAYEE' ? '#15803d' : f.statut === 'PARTIELLE' ? '#a16207' : '#dc2626',
                                            }}>{f.statut}</span>
                                        </div>
                                        <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${f.montant_total > 0 ? (f.montant_paye / f.montant_total * 100) : 0}%`,
                                                height: '100%', borderRadius: '2px',
                                                background: f.montant_paye >= f.montant_total ? '#10b981' : 'linear-gradient(90deg, #f59e0b, #ef4444)',
                                            }} />
                                        </div>
                                        <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                            {formatGNF(f.montant_paye)} / {formatGNF(f.montant_total)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                        )}

                        {/* ─── RIGHT: TABS CONTENT ─── */}
                        <motion.div key={`tabs-${child.eleve_id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Tab Content */}
                            <AnimatePresence mode="wait">
                                <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>

                                    {/* ─── NOTES TAB ─── */}
                                    {activeTab === 'notes' && (
                                        <div style={{
                                            background: 'white', borderRadius: '16px', overflow: 'hidden',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                                        }}>
                                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><BarChart3 size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Dernières Notes</h5>
                                                {child.moyenne !== null && (
                                                    <span style={{
                                                        padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700,
                                                        background: child.moyenne >= 10 ? '#d1fae5' : '#fee2e2',
                                                        color: child.moyenne >= 10 ? '#15803d' : '#dc2626',
                                                    }}>
                                                        Moyenne : {child.moyenne}/20
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ padding: '16px 24px' }}>
                                                {child.notes.length === 0 ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <BookOpen size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                                                        <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Aucune note enregistrée pour le moment</p>
                                                        <p style={{ fontSize: '12px', color: '#cbd5e1' }}>Les notes apparaîtront ici après les évaluations</p>
                                                    </div>
                                                ) : (
                                                    <div className="table-scroll">
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                                                        <thead>
                                                            <tr>
                                                                {['Matière', 'Évaluation', 'Note', 'Coef.', 'Date'].map(h => (
                                                                    <th key={h} style={{
                                                                        padding: '10px 12px', fontSize: '11px', fontWeight: 700,
                                                                        color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px',
                                                                        textAlign: 'left', borderBottom: '2px solid #f1f5f9',
                                                                    }}>{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {child.notes.map((n, i) => (
                                                                <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                                                                    onMouseOver={e => e.currentTarget.style.background = '#fafafe'}
                                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                                                    <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600 }}>{n.matiere}</td>
                                                                    <td style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>{n.evaluation}</td>
                                                                    <td style={{ padding: '12px' }}>
                                                                        {n.est_absent ? (
                                                                            <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>ABS</span>
                                                                        ) : n.note !== null ? (
                                                                            <span style={{
                                                                                fontSize: '14px', fontWeight: 800,
                                                                                color: (n.note / n.note_sur * 20) >= 10 ? '#10b981' : '#ef4444',
                                                                            }}>
                                                                                {n.note}/{n.note_sur}
                                                                            </span>
                                                                        ) : '—'}
                                                                    </td>
                                                                    <td style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>×{n.coefficient}</td>
                                                                    <td style={{ padding: '12px', fontSize: '12px', color: '#94a3b8' }}>
                                                                        {n.date ? new Date(n.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Classement par épreuve : le backend l'exposait
                                                (/epreuves + /classement), aucun écran ne l'appelait.
                                                Le parent peut désormais suivre le rang de son enfant
                                                composition par composition. */}
                                            {data?.parent?.parent_id && child?.eleve_id && (
                                                <div style={{ padding: '4px 24px 24px' }}>
                                                    <ClassementEpreuves
                                                        baseUrl={`/api/portail-parent/${data.parent.parent_id}/enfant/${child.eleve_id}`}
                                                        trimestreId={selectedTrimestre}
                                                        couleur="#7c3aed"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── PAIEMENTS TAB ─── */}
                                    {activeTab === 'paiements' && (() => {
                                        const totalFact = child.factures.reduce((s, f) => s + f.montant_total, 0);
                                        const totalPaye = child.factures.reduce((s, f) => s + f.montant_paye, 0);
                                        const totalRestant = child.factures.reduce((s, f) => s + f.montant_restant, 0);
                                        const pctPaye = totalFact > 0 ? Math.round(totalPaye / totalFact * 100) : 0;
                                        return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {/* Summary Cards */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                                {[
                                                    { label: 'Montant Total', value: formatGNF(totalFact), icon: <FileText size={24} />, color: '#6366f1', bg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' },
                                                    { label: 'Montant Payé', value: formatGNF(totalPaye), icon: <CheckCircle2 size={24} />, color: primaryColor, bg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
                                                    { label: 'Reste à Payer', value: formatGNF(totalRestant), icon: <Hourglass size={24} />, color: totalRestant > 0 ? '#ef4444' : '#10b981', bg: totalRestant > 0 ? 'linear-gradient(135deg, #fee2e2, #fecaca)' : 'linear-gradient(135deg, #d1fae5, #a7f3d0)' },
                                                ].map((s, i) => (
                                                    <div key={i} style={{
                                                        background: s.bg, borderRadius: '16px', padding: '24px',
                                                        border: '1px solid rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden',
                                                    }}>
                                                        <div style={{ position: 'absolute', top: '-15px', right: '-15px', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                                                        <span style={{ color: s.color, display: 'block' }}>{s.icon}</span>
                                                        <p style={{ margin: '8px 0 0', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
                                                        <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Progress bar */}
                                            <div style={{ background: 'white', borderRadius: '16px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Progression des paiements</span>
                                                    <span style={{ fontSize: '14px', fontWeight: 800, color: pctPaye >= 100 ? '#10b981' : '#6366f1' }}>{pctPaye}%</span>
                                                </div>
                                                <div style={{ height: '12px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${pctPaye}%`, height: '100%', borderRadius: '8px', background: pctPaye >= 100 ? `linear-gradient(90deg, ${primaryColor}, #34d399)` : 'linear-gradient(90deg, #6366f1, #818cf8)', transition: 'width 1s ease' }} />
                                                </div>
                                            </div>

                                            {/* Factures with Echeances */}
                                            <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                                    <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><FileText size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> État des Factures & Échéancier</h5>
                                                </div>
                                                <div style={{ padding: '0', overflowX: 'auto' }}>
                                                    {child.factures.length === 0 ? (
                                                        <div style={{ padding: '40px', textAlign: 'center' }}>
                                                            <FileText size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                                                            <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Aucune facture</p>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            {child.factures.map((f, i) => {
                                                                const isExpanded = expandedFactureId === f.facture_id;
                                                                const hasEcheances = f.echeances && f.echeances.length > 1;
                                                                return (
                                                                    <div key={i}>
                                                                        {/* Facture Row */}
                                                                        <div
                                                                            onClick={() => hasEcheances && setExpandedFactureId(isExpanded ? null : f.facture_id)}
                                                                            style={{
                                                                                padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
                                                                                display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center',
                                                                                cursor: hasEcheances ? 'pointer' : 'default',
                                                                                transition: 'background 0.2s',
                                                                                background: isExpanded ? '#f8fafc' : 'transparent',
                                                                            }}
                                                                            onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = '#fafafa'; }}
                                                                            onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                                                        >
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{f.numero}</span>
                                                                                    {f.type_frais && <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: '#ede9fe', color: '#6366f1' }}>{f.type_frais}</span>}
                                                                                    <span style={{
                                                                                        padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                                                                        background: f.statut === 'PAYEE' ? '#d1fae5' : f.statut === 'PARTIELLEMENT_PAYEE' ? '#fef3c7' : '#fee2e2',
                                                                                        color: f.statut === 'PAYEE' ? '#15803d' : f.statut === 'PARTIELLEMENT_PAYEE' ? '#92400e' : '#dc2626',
                                                                                    }}>
                                                                                        {f.statut === 'PAYEE' ? 'Payée' : f.statut === 'PARTIELLEMENT_PAYEE' ? 'Partiel' : 'En attente'}
                                                                                    </span>
                                                                                    {hasEcheances && (
                                                                                        <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600 }}>
                                                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {f.echeances!.length} tranches
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#64748b' }}>
                                                                                    <span>Date: {f.date ? new Date(f.date).toLocaleDateString('fr-FR') : '—'}</span>
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ textAlign: 'right', minWidth: '160px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                                                                <p style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>{formatGNF(f.montant_total)}</p>
                                                                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: primaryColor }}>Payé: {formatGNF(f.montant_paye)}</span>
                                                                                    {f.montant_restant > 0 && <span style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444' }}>Reste: {formatGNF(f.montant_restant)}</span>}
                                                                                </div>
                                                                                <button
                                                                                    onClick={(e) => downloadFacturePDF(e, f.facture_id, f.numero)}
                                                                                    style={{
                                                                                        background: 'none', border: 'none', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px',
                                                                                        fontSize: '11px', fontWeight: 600, color: '#3b82f6', cursor: 'pointer', borderRadius: '4px',
                                                                                    }}
                                                                                    onMouseOver={e => e.currentTarget.style.background = '#eff6ff'}
                                                                                    onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                                                >
                                                                                    <Download size={14} /> Télécharger
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {/* Expanded Echeances */}
                                                                        {isExpanded && f.echeances && (() => {
                                                                            // Cascade logic: distribute montant_paye from the facture
                                                                            // across echeances sorted by date_limite chronologically.
                                                                            // This corrects visual status when the backend hasn't propagated
                                                                            // payments down to individual tranche records yet.
                                                                            const sorted = [...f.echeances].sort((a, b) => {
                                                                                const da = a.date_limite ? new Date(a.date_limite).getTime() : 0;
                                                                                const db = b.date_limite ? new Date(b.date_limite).getTime() : 0;
                                                                                return da - db;
                                                                            });
                                                                            let remaining = f.montant_paye;
                                                                            const cascaded = sorted.map(ech => {
                                                                                const echPaye = Math.min(remaining, ech.montant_attendu);
                                                                                remaining = Math.max(0, remaining - ech.montant_attendu);
                                                                                const statut = echPaye >= ech.montant_attendu ? 'PAYEE' : echPaye > 0 ? 'PARTIELLEMENT_PAYEE' : 'EN_ATTENTE';
                                                                                return { ...ech, montant_paye: echPaye, statut };
                                                                            });
                                                                            // Re-sort back to original order for display
                                                                            const displayEcheances = f.echeances.map(orig =>
                                                                                cascaded.find(c => c.echeance_id === orig.echeance_id) || orig
                                                                            );
                                                                            return (
                                                                            <div style={{ background: '#f8fafc', padding: '0 20px 16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
                                                                                    <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Détail des tranches</p>
                                                                                    {displayEcheances.map((ech, j) => {
                                                                                        const echPct = ech.montant_attendu > 0 ? Math.round(ech.montant_paye / ech.montant_attendu * 100) : 0;
                                                                                        return (
                                                                                            <div key={j} style={{
                                                                                                background: 'white', borderRadius: '10px', padding: '12px 16px',
                                                                                                border: `1px solid ${ech.statut === 'PAYEE' ? '#a7f3d0' : ech.statut === 'PARTIELLEMENT_PAYEE' ? '#fde68a' : '#e2e8f0'}`,
                                                                                                display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center',
                                                                                            }}>
                                                                                                <div>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{ech.libelle}</span>
                                                                                                        <span style={{
                                                                                                            padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700,
                                                                                                            background: ech.statut === 'PAYEE' ? '#d1fae5' : ech.statut === 'PARTIELLEMENT_PAYEE' ? '#fef3c7' : '#fee2e2',
                                                                                                            color: ech.statut === 'PAYEE' ? '#15803d' : ech.statut === 'PARTIELLEMENT_PAYEE' ? '#92400e' : '#dc2626',
                                                                                                        }}>
                                                                                                            {ech.statut === 'PAYEE' ? '✓ Payée' : ech.statut === 'PARTIELLEMENT_PAYEE' ? 'Partiel' : 'En attente'}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                                                                                        Échéance : {ech.date_limite ? new Date(ech.date_limite).toLocaleDateString('fr-FR') : '—'}
                                                                                                    </p>
                                                                                                    {/* Mini progress */}
                                                                                                    <div style={{ marginTop: '6px', height: '4px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', width: '100%', maxWidth: '200px' }}>
                                                                                                        <div style={{ height: '100%', width: `${echPct}%`, background: echPct >= 100 ? '#10b981' : '#6366f1', borderRadius: '4px', transition: 'width 0.5s' }} />
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div style={{ textAlign: 'right' }}>
                                                                                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{formatGNF(ech.montant_attendu)}</p>
                                                                                                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: primaryColor, fontWeight: 600 }}>Payé: {formatGNF(ech.montant_paye)}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        ); })()}

                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Historique des Paiements */}
                                            <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                                    <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><CreditCard size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Historique des Paiements</h5>
                                                </div>
                                                <div style={{ padding: '16px 24px' }}>
                                                    {child.paiements.length === 0 ? (
                                                        <div style={{ padding: '40px', textAlign: 'center' }}>
                                                            <CreditCard size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                                                            <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Aucun paiement enregistré</p>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                            {(() => {
                                                                const grouped = Object.values(child.paiements.reduce((acc, p) => {
                                                                    if (!acc[p.numero_recu]) acc[p.numero_recu] = { ...p, total: 0 };
                                                                    acc[p.numero_recu].total += p.montant;
                                                                    return acc;
                                                                }, {} as Record<string, any>)).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                                                                
                                                                return grouped.map((p, i) => (
                                                                    <div key={i} style={{
                                                                        padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0',
                                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                        transition: 'border-color 0.2s, box-shadow 0.2s',
                                                                    }}
                                                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.1)'; }}
                                                                    onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                                            <div style={{
                                                                                width: '42px', height: '42px', borderRadius: '12px',
                                                                                background: p.mode === 'MOBILE_MONEY' ? '#fef3c7' : p.mode === 'ESPECES' ? '#d1fae5' : '#ede9fe',
                                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            }}>
                                                                                {p.mode === 'MOBILE_MONEY' ? <Phone size={18} color="#f59e0b" /> :
                                                                                p.mode === 'ESPECES' ? <Wallet size={18} color={primaryColor} /> :
                                                                                <CreditCard size={18} color="#6366f1" />}
                                                                            </div>
                                                                            <div>
                                                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Reçu: {p.numero_recu}</p>
                                                                                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                                                                                    {p.mode.replace('_', ' ')} • {p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '—'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                            <div>
                                                                                <p style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: primaryColor }}>
                                                                                    {formatGNF(p.total)}
                                                                                </p>
                                                                                <span style={{
                                                                                    fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '8px',
                                                                                    background: '#d1fae5', color: '#15803d',
                                                                                }}>{p.statut}</span>
                                                                            </div>
                                                                            <button onClick={(e) => downloadRecuPDF(e, p.paiement_id, p.numero_recu)}
                                                                                title="Télécharger le reçu"
                                                                                style={{ border: '1px solid #e2e8f0', background: 'white', borderRadius: '10px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                                                                <Download size={15} color="#64748b" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ));
                                                            })()}
                                                        </div>
                                                    )}
                                            </div>
                                        </div>
                                        </div>
                                        );
                                    })()}

                                    {/* ─── EMPLOI DU TEMPS TAB ─── */}
                                    {activeTab === 'emploi' && (
                                        <div style={{
                                            background: 'white', borderRadius: '16px', overflow: 'hidden',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                                        }}>
                                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><Calendar size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Emploi du Temps — {child.classe}</h5>
                                                <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600 }}>Année en cours</span>
                                            </div>
                                            <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
                                                {edtLoading ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                                                        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>Chargement...</p>
                                                    </div>
                                                ) : edtSlots.length === 0 ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <Calendar size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                                                        <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Emploi du temps non disponible</p>
                                                    </div>
                                                ) : (
                                                    <div className="table-scroll">
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={{ padding: '10px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textAlign: 'center', width: '70px', borderBottom: '2px solid #f1f5f9' }}>HEURE</th>
                                                                {JOURS.map(j => (
                                                                    <th key={j} style={{ padding: '10px', fontSize: '12px', fontWeight: 700, color: '#1e293b', textAlign: 'center', borderBottom: '2px solid #f1f5f9' }}>{j}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {HEURES.map((h, hi) => {
                                                                const endH = `${String(parseInt(h.split(':')[0]) + 1).padStart(2, '0')}:00`;
                                                                if (h === '12:00') return (
                                                                    <tr key={h}>
                                                                        <td colSpan={6} style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#94a3b8', fontWeight: 700, background: '#fafafa', letterSpacing: '2px' }}>
                                                                            — PAUSE DÉJEUNER —
                                                                        </td>
                                                                    </tr>
                                                                );
                                                                return (
                                                                    <tr key={h} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                                        <td style={{ padding: '8px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, verticalAlign: 'top' }}>
                                                                            {h}<br /><span style={{ fontSize: '10px' }}>{endH}</span>
                                                                        </td>
                                                                        {JOURS.map(j => {
                                                                            const slot = edtSlots.find(s => s.jour.toUpperCase() === j.toUpperCase() && s.heure_debut === h);
                                                                            if (!slot) return <td key={j} style={{ padding: '4px' }} />;
                                                                            const colors = SLOT_COLORS[slot.matiere] || SLOT_COLORS['default'];
                                                                            return (
                                                                                <td key={j} style={{ padding: '4px' }}>
                                                                                    <div style={{
                                                                                        padding: '8px 10px', borderRadius: '10px', background: colors.bg,
                                                                                        borderLeft: `3px solid ${colors.border}`, minHeight: '50px',
                                                                                    }}>
                                                                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: colors.text }}>{slot.matiere}</p>
                                                                                        <p style={{ margin: '2px 0 0', fontSize: '10px', color: colors.text, opacity: 0.7 }}><UserCheck size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {slot.enseignant}</p>
                                                                                        {slot.salle && <p style={{ margin: '1px 0 0', fontSize: '10px', color: colors.text, opacity: 0.6 }}><School size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {slot.salle}</p>}
                                                                                    </div>
                                                                                </td>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── BULLETIN TAB ─── */}
                                    {activeTab === 'bulletin' && (
                                        <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><FileText size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Bulletin Scolaire — {child.classe}</h5>
                                                <select value={selectedTrimestre ?? ''} onChange={e => setSelectedTrimestre(Number(e.target.value))}
                                                    style={{ padding: '8px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                                    {periodes.length === 0 && <option value="">Période en cours</option>}
                                                    {periodes.map(p => (
                                                        <option key={p.trimestre_id} value={p.trimestre_id}>{p.libelle}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div style={{ padding: '16px 24px' }}>
                                                {bulletinLoading ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                                                        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>Chargement du bulletin...</p>
                                                    </div>
                                                ) : !bulletinData ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <FileText size={40} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
                                                        <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Bulletin non disponible pour ce trimestre</p>
                                                        <p style={{ fontSize: '12px', color: '#cbd5e1' }}>Les bulletins seront disponibles après la centralisation des notes</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* KPI Summary */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                                                            {[
                                                                { label: 'Moyenne', value: bulletinData.moyenne_generale !== null ? `${bulletinData.moyenne_generale}/20` : '—', color: bulletinData.moyenne_generale >= 10 ? '#10b981' : '#ef4444' },
                                                                { label: 'Rang', value: (bulletinData.rang && bulletinData.effectif_classe) ? `${bulletinData.rang}e / ${bulletinData.effectif_classe}` : '—', color: '#6366f1' },
                                                                { label: 'Mention', value: bulletinData.mention || '—', color: '#f59e0b' },
                                                                { label: 'Total Coef.', value: String(bulletinData.total_coefficient), color: '#8b5cf6' },
                                                            ].map((k, i) => (
                                                                <div key={i} style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: k.color }}>{k.value}</p>
                                                                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{k.label}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {/* Grades Table */}
                                                        <div className="table-scroll">
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
                                                            <thead>
                                                                <tr style={{ background: 'linear-gradient(135deg, #064e3b, #059669)' }}>
                                                                    {['Matière', 'Coef', 'Moy. Élève', 'Moy. Cl.', 'Min', 'Max', 'Appréciation'].map(h => (
                                                                        <th key={h} style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'white', textAlign: 'left', letterSpacing: '0.5px' }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {bulletinData.matieres.map((m: any, i: number) => (
                                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                        <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600 }}>{m.matiere}</td>
                                                                        <td style={{ padding: '10px 12px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>{m.coefficient}</td>
                                                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                                            <span style={{ fontSize: '14px', fontWeight: 800, color: m.moyenne_eleve !== null && m.moyenne_eleve >= 10 ? '#10b981' : '#ef4444' }}>
                                                                                {m.moyenne_eleve !== null ? m.moyenne_eleve.toFixed(2) : '—'}
                                                                                {m.lettre ? ` ${m.lettre}` : ''}
                                                                            </span>
                                                                        </td>
                                                                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>{m.moyenne_classe !== null ? m.moyenne_classe.toFixed(2) : '—'}</td>
                                                                        <td style={{ padding: '10px 12px', fontSize: '12px', color: primaryColor, textAlign: 'center' }}>{m.note_min !== null ? m.note_min.toFixed(2) : '—'}</td>
                                                                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#ef4444', textAlign: 'center' }}>{m.note_max !== null ? m.note_max.toFixed(2) : '—'}</td>
                                                                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b' }}>{m.appreciation || '—'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                        </div>
                                                        {/* Decision */}
                                                        {bulletinData.decision && (
                                                            <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '12px', background: '#fef3c7', border: '1px solid #fbbf24' }}>
                                                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#92400e' }}><ClipboardList size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Décision du Conseil de Classe</p>
                                                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#78350f', fontWeight: 600 }}>{bulletinData.decision}</p>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── ABSENCES TAB ─── */}
                                    {activeTab === 'absences' && (
                                        <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><Clock size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Suivi des Présences & Absences</h5>
                                                {absencesData && (
                                                    <div style={{ display: 'flex', gap: '10px' }}>
                                                        <span style={{ padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: '#d1fae5', color: '#15803d' }}>
                                                            <CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> {absencesData.total_present} Présences
                                                        </span>
                                                        <span style={{ padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: '#fee2e2', color: '#dc2626' }}>
                                                            <XCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> {absencesData.total_absent} Absences
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ padding: '16px 24px' }}>
                                                {absencesLoading ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                                                    </div>
                                                ) : !absencesData || absencesData.presences.length === 0 ? (
                                                    <div style={{ padding: '40px', textAlign: 'center' }}>
                                                        <CheckCircle size={40} style={{ color: primaryColor, marginBottom: '12px' }} />
                                                        <p style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>Aucune donnée de présence enregistrée</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {absencesData.presences.map((p: any, i: number) => (
                                                            <div key={i} style={{
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                                                                background: p.statut === 'PRESENT' ? '#f0fdf4' : p.statut === 'ABSENT_JUSTIFIE' ? '#fefce8' : '#fef2f2',
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <div style={{
                                                                        width: '36px', height: '36px', borderRadius: '10px',
                                                                        background: p.statut === 'PRESENT' ? '#d1fae5' : p.statut === 'ABSENT_JUSTIFIE' ? '#fef3c7' : '#fee2e2',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                                                                    }}>
                                                                        {p.statut === 'PRESENT' ? <CheckCircle2 size={14} /> : p.statut === 'ABSENT_JUSTIFIE' ? <PenLine size={14} /> : <XCircle size={14} />}
                                                                    </div>
                                                                    <div>
                                                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                                                                            {p.date ? new Date(p.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}
                                                                        </p>
                                                                        {p.justification && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{p.justification}</p>}
                                                                    </div>
                                                                </div>
                                                                <span style={{
                                                                    padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                                                                    background: p.statut === 'PRESENT' ? '#d1fae5' : p.statut === 'ABSENT_JUSTIFIE' ? '#fef3c7' : '#fee2e2',
                                                                    color: p.statut === 'PRESENT' ? '#15803d' : p.statut === 'ABSENT_JUSTIFIE' ? '#a16207' : '#dc2626',
                                                                }}>{p.statut.replace('_', ' ')}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── MESSAGES TAB ─── */}
                                    {activeTab === 'messages' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {/* Header bar */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <MessageSquare size={18} color="#6366f1" /> Messagerie
                                                </h5>
                                                <button onClick={() => { setShowComposeMsg(true); setNewMsgSujet(''); setNewMsgContenu(''); setNewMsgObjet('GENERAL'); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                                                    <Send size={14} /> Nouveau Message
                                                </button>
                                            </div>

                                            {msgLoading ? (
                                                <div style={{ padding: '60px', textAlign: 'center' }}>
                                                    <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                                                </div>
                                            ) : selectedMsg ? (
                                                /* ── Message Detail View ── */
                                                <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <button onClick={() => setSelectedMsg(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer' }}>
                                                            ← Retour
                                                        </button>
                                                        <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: selectedMsg.statut === 'LU' ? '#d1fae5' : '#fef3c7', color: selectedMsg.statut === 'LU' ? '#15803d' : '#a16207' }}>
                                                            {selectedMsg.statut === 'LU' ? 'Lu' : 'Non lu'}
                                                        </span>
                                                    </div>
                                                    <div style={{ padding: '24px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: (OBJET_COLORS[selectedMsg.objet_type] || OBJET_COLORS.GENERAL).bg, color: (OBJET_COLORS[selectedMsg.objet_type] || OBJET_COLORS.GENERAL).color }}>
                                                                {(OBJET_COLORS[selectedMsg.objet_type] || OBJET_COLORS.GENERAL).icon} {selectedMsg.objet_type}
                                                            </span>
                                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                                {selectedMsg.date_envoi ? new Date(selectedMsg.date_envoi).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                                            </span>
                                                        </div>
                                                        <h4 style={{ margin: '12px 0 4px', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{selectedMsg.sujet}</h4>
                                                        <p style={{ margin: '0 0 20px', fontSize: '12px', color: '#94a3b8' }}>
                                                            {selectedMsg.expediteur_type === 'PARENT' ? 'Envoyé par vous' : 'De: Administration'}
                                                        </p>
                                                        <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '14px', color: '#334155', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                                                            {selectedMsg.contenu || 'Aucun contenu.'}
                                                        </div>
                                                        {/* Photo-related message: direct link to gallery/photos */}
                                                        {(selectedMsg.objet_type === 'PHOTO' || selectedMsg.sujet.toLowerCase().includes('photo')) && (
                                                            <button onClick={() => { setSelectedMsg(null); setActiveTab('photos'); }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px',
                                                                    padding: '14px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
                                                                    fontWeight: 700, fontSize: '13px', width: '100%', justifyContent: 'center',
                                                                    boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                                                                }}>
                                                                <Camera size={16} /> Voir les photos / Galerie
                                                            </button>
                                                        )}
                                                        {/* Reply area */}
                                                        {selectedMsg.expediteur_type !== 'PARENT' && (
                                                            <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', background: '#ede9fe', border: '1px solid #c4b5fd' }}>
                                                                <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 700, color: '#6366f1' }}>↩️ Répondre à l&apos;administration</p>
                                                                <textarea value={newMsgContenu} onChange={e => setNewMsgContenu(e.target.value)} rows={3} placeholder="Votre réponse..."
                                                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #c4b5fd', fontSize: '13px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                                <button onClick={async () => {
                                                                    if (!data || !newMsgContenu.trim()) return;
                                                                    setSendingMsg(true);
                                                                    try {
                                                                        await api.post(`/api/portail-parent/${data.parent.parent_id}/messages/envoyer`, {
                                                                            sujet: `RE: ${selectedMsg.sujet}`, contenu: newMsgContenu, objet_type: selectedMsg.objet_type,
                                                                        });
                                                                        setNewMsgContenu(''); setSelectedMsg(null); loadMessages();
                                                                    } catch {} finally { setSendingMsg(false); }
                                                                }} disabled={sendingMsg || !newMsgContenu.trim()}
                                                                    style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, background: sendingMsg ? '#a5b4fc' : '#6366f1', color: 'white', border: 'none', cursor: sendingMsg ? 'not-allowed' : 'pointer' }}>
                                                                    <Send size={14} /> {sendingMsg ? 'Envoi...' : 'Envoyer'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ── Inbox List ── */
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {/* Received messages */}
                                                    <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <h6 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>📥 Messages reçus</h6>
                                                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>{parentMessages.received.length} message(s)</span>
                                                        </div>
                                                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                                            {parentMessages.received.length === 0 ? (
                                                                <div style={{ padding: '40px', textAlign: 'center' }}>
                                                                    <CheckCircle size={32} style={{ color: primaryColor, marginBottom: '8px' }} />
                                                                    <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Aucun message reçu</p>
                                                                </div>
                                                            ) : parentMessages.received.map(m => {
                                                                const oc = OBJET_COLORS[m.objet_type] || OBJET_COLORS.GENERAL;
                                                                const isUnread = m.statut === 'ENVOYE';
                                                                return (
                                                                    <div key={m.message_id} onClick={() => { setSelectedMsg(m); if (isUnread) markRead(m); }}
                                                                        style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s', background: isUnread ? '#fffbeb' : 'white', borderLeft: isUnread ? '4px solid #f59e0b' : '4px solid transparent' }}
                                                                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                                        onMouseOut={e => e.currentTarget.style.background = isUnread ? '#fffbeb' : 'white'}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    {isUnread && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />}
                                                                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: isUnread ? 800 : 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.sujet}</p>
                                                                                </div>
                                                                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: isUnread ? '16px' : '0' }}>
                                                                                    {m.contenu ? m.contenu.substring(0, 80) + (m.contenu.length > 80 ? '...' : '') : 'Aucun contenu'}
                                                                                </p>
                                                                            </div>
                                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                                <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, background: oc.bg, color: oc.color }}>{oc.icon}</span>
                                                                                <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#94a3b8' }}>
                                                                                    {m.date_envoi ? new Date(m.date_envoi).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Sent messages */}
                                                    {parentMessages.sent.length > 0 && (
                                                        <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                                                <h6 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>📤 Messages envoyés</h6>
                                                            </div>
                                                            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                                {parentMessages.sent.map(m => (
                                                                    <div key={m.message_id} onClick={() => setSelectedMsg(m)}
                                                                        style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                                                        onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                                        onMouseOut={e => e.currentTarget.style.background = 'white'}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{m.sujet}</p>
                                                                                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#94a3b8' }}>→ Administration • {m.date_envoi ? new Date(m.date_envoi).toLocaleDateString('fr-FR') : ''}</p>
                                                                            </div>
                                                                            <Send size={14} color="#94a3b8" />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Compose Modal */}
                                            {showComposeMsg && (
                                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    onClick={e => { if (e.target === e.currentTarget) setShowComposeMsg(false); }}>
                                                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                                        style={{ background: 'white', borderRadius: '20px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                                                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}><Mail size={16} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Nouveau Message</h4>
                                                            <button onClick={() => setShowComposeMsg(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><X size={16} /></button>
                                                        </div>
                                                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                            <div>
                                                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Type d&apos;objet</label>
                                                                <select value={newMsgObjet} onChange={e => setNewMsgObjet(e.target.value)}
                                                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}>
                                                                    {Object.entries(OBJET_COLORS).map(([k, v]) => <option key={k} value={k}>{v.icon} {k}</option>)}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Sujet</label>
                                                                <input value={newMsgSujet} onChange={e => setNewMsgSujet(e.target.value)} placeholder="Objet du message..."
                                                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                                                            </div>
                                                            <div>
                                                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Message</label>
                                                                <textarea value={newMsgContenu} onChange={e => setNewMsgContenu(e.target.value)} rows={5} placeholder="Écrivez votre message..."
                                                                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                            </div>
                                                            <button onClick={sendMessage} disabled={sendingMsg || !newMsgSujet.trim()}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, background: sendingMsg ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', cursor: sendingMsg ? 'not-allowed' : 'pointer' }}>
                                                                <Send size={16} /> {sendingMsg ? 'Envoi en cours...' : 'Envoyer à l\'administration'}
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── DEVOIRS TAB ─── */}
                                    {activeTab === 'devoirs' && (() => {

                                        const typeColors: Record<string,{bg:string;color:string;icon:string}> = {
                                            EXERCICE: { bg: '#dbeafe', color: '#2563eb', icon: 'PenLine' },
                                            RECHERCHE: { bg: '#fef3c7', color: '#d97706', icon: 'Search' },
                                            LECTURE: { bg: '#ede9fe', color: '#7c3aed', icon: 'BookOpen' },
                                            PROJET: { bg: '#d1fae5', color: accentColor, icon: 'Rocket' },
                                        };

                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                                        <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><BookOpen size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Devoirs de {child.prenom}</h5>
                                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Devoirs assignés par les enseignants</p>
                                                    </div>
                                                    {devoirsLoading ? (
                                                        <div style={{ padding: '40px', textAlign: 'center' }}>
                                                            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
                                                        </div>
                                                    ) : parentDevoirs.length === 0 ? (
                                                        <div style={{ padding: '60px', textAlign: 'center' }}>
                                                            <BookOpen size={36} color="#e2e8f0" style={{ marginBottom: '8px' }} />
                                                            <p style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8', margin: 0 }}>Aucun devoir pour le moment</p>
                                                            <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0 0' }}>Les devoirs assignés apparaîtront ici</p>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            {parentDevoirs.map((d, i) => {
                                                                const tc = typeColors[d.type_devoir] || typeColors.EXERCICE;
                                                                const isExpired = d.date_limite && new Date(d.date_limite) < new Date();
                                                                return (
                                                                    <div key={d.devoir_id} style={{
                                                                        padding: '18px 24px', borderBottom: '1px solid #f1f5f9',
                                                                        borderLeft: `4px solid ${tc.color}`,
                                                                        background: isExpired ? '#fefce8' : 'white',
                                                                    }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                            <div style={{ flex: 1 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                                                                    <span style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: tc.bg, color: tc.color }}>
                                                                                        {tc.icon} {d.type_devoir}
                                                                                    </span>
                                                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>📘 {d.matiere}</span>
                                                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}><UserCheck size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {d.enseignant}</span>
                                                                                    {isExpired && <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: '#fef2f2', color: '#dc2626' }}>⏰ Expiré</span>}
                                                                                </div>
                                                                                <h5 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{d.titre}</h5>
                                                                                {d.description && (
                                                                                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#64748b', lineHeight: 1.6, background: '#f8fafc', padding: '12px 16px', borderRadius: '10px' }}>
                                                                                        {d.description}
                                                                                    </p>
                                                                                )}
                                                                                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#94a3b8', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                    {d.date_limite && <span><Calendar size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Limite: {new Date(d.date_limite).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
                                                                                    <span>Publié le {d.date_creation ? new Date(d.date_creation).toLocaleDateString('fr-FR') : '—'}</span>
                                                                                    {d.fichier_nom && (
                                                                                        <a href={`http://localhost:8300${d.fichier_path}`} target="_blank" rel="noreferrer"
                                                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: '#ede9fe', color: '#7c3aed', textDecoration: 'none' }}>
                                                                                            📎 {d.fichier_nom}
                                                                                        </a>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* ─── DASHBOARD TAB ─── */}
                                    {activeTab === 'dashboard' && (() => {
                                        const validNotes = child.notes.filter(n => n.note !== null && !n.est_absent);
                                        const byMatiere: Record<string, {total: number; count: number}> = {};
                                        for (const n of validNotes) {
                                            if (!byMatiere[n.matiere]) byMatiere[n.matiere] = {total: 0, count: 0};
                                            byMatiere[n.matiere].total += (n.note || 0);
                                            byMatiere[n.matiere].count += 1;
                                        }
                                        const matieres = Object.entries(byMatiere).map(([name, d]) => ({ name, avg: Math.round((d.total / d.count) * 10) / 10 }));
                                        const topMat = [...matieres].sort((a, b) => b.avg - a.avg);
                                        const totalPresences = child.nb_present + child.nb_absent;
                                        const pctPresent = totalPresences > 0 ? Math.round(child.nb_present / totalPresences * 100) : 0;
                                        const totalFact = child.factures.reduce((s, f) => s + f.montant_total, 0);
                                        const totalPaye = child.factures.reduce((s, f) => s + f.montant_paye, 0);
                                        const pctPaye = totalFact > 0 ? Math.round(totalPaye / totalFact * 100) : 0;
                                        const Donut = ({ pct, color, label, value }: {pct: number; color: string; label: string; value: string}) => {
                                            const r = 54, ci = 2 * Math.PI * r, off = ci - (pct / 100) * ci;
                                            return (
                                                <div style={{ textAlign: 'center' }}>
                                                    <svg width="130" height="130" viewBox="0 0 130 130">
                                                        <circle cx="65" cy="65" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
                                                        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12" strokeDasharray={ci} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 65 65)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
                                                        <text x="65" y="60" textAnchor="middle" style={{ fontSize: '22px', fontWeight: 800, fill: '#1e293b' }}>{value}</text>
                                                        <text x="65" y="80" textAnchor="middle" style={{ fontSize: '11px', fill: '#94a3b8', fontWeight: 600 }}>{label}</text>
                                                    </svg>
                                                </div>
                                            );
                                        };
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                {/* Donut charts row */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                        <h5 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#475569' }}><Target size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Moyenne Générale</h5>
                                                        <Donut pct={child.moyenne ? (child.moyenne / 20) * 100 : 0} color={child.moyenne && child.moyenne >= 10 ? '#10b981' : '#ef4444'} label="sur 20" value={child.moyenne ? `${child.moyenne}` : '—'} />
                                                    </div>
                                                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                        <h5 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#475569' }}><CheckCircle2 size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Assiduité</h5>
                                                        <Donut pct={pctPresent} color="#6366f1" label={`${child.nb_present}P / ${child.nb_absent}A`} value={`${pctPresent}%`} />
                                                    </div>
                                                    <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                        <h5 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#475569' }}><Wallet size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Paiements</h5>
                                                        <Donut pct={pctPaye} color="#f59e0b" label={`${formatGNF(totalPaye)} payé`} value={`${pctPaye}%`} />
                                                    </div>
                                                </div>
                                                {/* Bar chart — per subject */}
                                                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                    <h5 style={{ margin: '0 0 20px', fontSize: '15px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <BarChart3 size={18} color="#6366f1" /> Moyennes par Matière
                                                    </h5>
                                                    {matieres.length === 0 ? (
                                                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px' }}>Pas encore de notes</p>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                            {topMat.map((m, i) => (
                                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <span style={{ width: '120px', fontSize: '12px', fontWeight: 600, color: '#475569', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                                                                    <div style={{ flex: 1, height: '26px', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                                                                        <div style={{ width: `${(m.avg / 20) * 100}%`, height: '100%', borderRadius: '8px', background: m.avg >= 10 ? `linear-gradient(90deg, ${primaryColor}, #34d399)` : 'linear-gradient(90deg, #ef4444, #f87171)', transition: 'width 0.8s ease' }} />
                                                                        <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>{m.avg}/20</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Best & worst subjects */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                                                    <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                        <h5 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#475569' }}><Trophy size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Meilleures Matières</h5>
                                                        {topMat.length === 0 ? <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>—</p> : topMat.slice(0, 3).map((m, i) => (
                                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', marginBottom: '6px', background: i === 0 ? '#f0fdf4' : '#f8fafc' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '16px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{m.name}</span>
                                                                </div>
                                                                <span style={{ fontSize: '14px', fontWeight: 800, color: primaryColor }}>{m.avg}/20</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div style={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                        <h5 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 700, color: '#475569' }}><TrendingDown size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> À Améliorer</h5>
                                                        {topMat.length === 0 ? <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>—</p> : [...topMat].reverse().slice(0, 3).map((m, i) => (
                                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', marginBottom: '6px', background: m.avg < 10 ? '#fef2f2' : '#f8fafc' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '16px' }}>{m.avg < 10 ? <AlertTriangle size={14} /> : <PenLine size={14} />}</span>
                                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{m.name}</span>
                                                                </div>
                                                                <span style={{ fontSize: '14px', fontWeight: 800, color: m.avg < 10 ? '#ef4444' : '#f59e0b' }}>{m.avg}/20</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Summary stat cards */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                                                    {[
                                                        { label: 'Notes', value: String(child.nb_notes), icon: <PenLine size={20} />, color: '#6366f1', bg: '#ede9fe' },
                                                        { label: 'Présences', value: String(child.nb_present), icon: <CheckCircle2 size={20} />, color: primaryColor, bg: '#d1fae5' },
                                                        { label: 'Absences', value: String(child.nb_absent), icon: <XCircle size={20} />, color: '#ef4444', bg: '#fee2e2' },
                                                        { label: 'Factures', value: String(child.factures.length), icon: <FileText size={20} />, color: '#f59e0b', bg: '#fef3c7' },
                                                    ].map((s, i) => (
                                                        <div key={i} style={{ background: 'white', borderRadius: '14px', padding: '18px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: '18px' }}>{s.icon}</div>
                                                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</p>
                                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{s.label}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* ─── PROFIL TAB ─── */}
                                    {activeTab === 'profil' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {profilLoading ? (
                                                <div style={{ padding: '60px', textAlign: 'center' }}>
                                                    <Loader2 size={32} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
                                                </div>
                                            ) : profilData ? (
                                                <>
                                                    {/* Profile Header Card */}
                                                    <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '20px', padding: '32px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                                                        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                                                        <div style={{ position: 'absolute', bottom: '-40px', left: '30%', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', zIndex: 1 }}>
                                                            <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)' }}>
                                                                {profilData.prenom[0]}{profilData.nom[0]}
                                                            </div>
                                                            <div>
                                                                <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>{profilData.prenom} {profilData.nom}</h3>
                                                                <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.85 }}>{profilData.profession || 'Parent d\'élève'}</p>
                                                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                                                                    <span style={{ padding: '4px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Smartphone size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {profilData.telephone_1}</span>
                                                                    {profilData.email && <span style={{ padding: '4px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {profilData.email}</span>}
                                                                    <span style={{ padding: '4px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: 600 }}><Users size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {profilData.nb_enfants} enfant(s)</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {profileSuccess && (
                                                        <div style={{ padding: '12px 18px', borderRadius: '12px', background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <CheckCircle size={16} /> {profileSuccess}
                                                        </div>
                                                    )}

                                                    {/* Info Cards */}
                                                    {!editingProfile ? (
                                                        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><ClipboardList size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Informations personnelles</h5>
                                                                <button onClick={() => {
                                                                    setProfileForm({
                                                                        prenom: profilData.prenom || '',
                                                                        nom: profilData.nom || '',
                                                                        telephone_1: profilData.telephone_1 || '',
                                                                        telephone_2: profilData.telephone_2 || '',
                                                                        email: profilData.email || '',
                                                                        profession: profilData.profession || '',
                                                                        adresse: profilData.adresse || '',
                                                                    });
                                                                    setEditingProfile(true);
                                                                }}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer' }}>
                                                                    <Pencil size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Modifier
                                                                </button>
                                                            </div>
                                                            <div style={{ padding: '20px 24px' }}>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                                    {[
                                                                        { label: 'Prénom', value: profilData.prenom, icon: 'User' },
                                                                        { label: 'Nom', value: profilData.nom, icon: 'User' },
                                                                        { label: 'Téléphone principal', value: profilData.telephone_1, icon: 'Smartphone' },
                                                                        { label: 'Téléphone secondaire', value: profilData.telephone_2 || '—', icon: 'Smartphone' },
                                                                        { label: 'Email', value: profilData.email || '—', icon: 'Mail' },
                                                                        { label: 'Profession', value: profilData.profession || '—', icon: 'Briefcase' },
                                                                        { label: 'Adresse', value: profilData.adresse || '—', icon: 'MapPin' },
                                                                        { label: 'Mot de passe', value: profilData.has_password ? '••••••••' : 'Non défini', icon: 'Lock' },
                                                                    ].map((f, i) => (
                                                                        <div key={i} style={{ padding: '14px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                                                                            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{f.icon} {f.label}</p>
                                                                            <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{f.value}</p>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Edit Profile Form */
                                                        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><Pencil size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Modifier le profil</h5>
                                                                <button onClick={() => setEditingProfile(false)}
                                                                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer' }}>Annuler</button>
                                                            </div>
                                                            <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                                                {[
                                                                    { key: 'prenom', label: 'Prénom' }, { key: 'nom', label: 'Nom' },
                                                                    { key: 'telephone_1', label: 'Téléphone principal' }, { key: 'telephone_2', label: 'Téléphone secondaire' },
                                                                    { key: 'email', label: 'Email' }, { key: 'profession', label: 'Profession' },
                                                                ].map(f => (
                                                                    <div key={f.key}>
                                                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                                                                        <input value={profileForm[f.key] || ''} onChange={e => setProfileForm({ ...profileForm, [f.key]: e.target.value })}
                                                                            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                                                            onFocus={e => e.currentTarget.style.borderColor = '#6366f1'}
                                                                            onBlur={e => e.currentTarget.style.borderColor = '#e2e8f0'} />
                                                                    </div>
                                                                ))}
                                                                <div style={{ gridColumn: '1 / -1' }}>
                                                                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Adresse</label>
                                                                    <input value={profileForm.adresse || ''} onChange={e => setProfileForm({ ...profileForm, adresse: e.target.value })}
                                                                        style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                                </div>
                                                                <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                                                                    <button onClick={async () => {
                                                                        if (!data) return;
                                                                        setSavingProfile(true);
                                                                        try {
                                                                            await api.put(`/api/portail-parent/${data.parent.parent_id}/profil`, profileForm);
                                                                            setProfileSuccess('Profil mis à jour avec succès !');
                                                                            setTimeout(() => setProfileSuccess(''), 3000);
                                                                            setEditingProfile(false);
                                                                            const r = await api.get(`/api/portail-parent/${data.parent.parent_id}/profil`);
                                                                            setProfilData(r.data);
                                                                        } catch {} finally { setSavingProfile(false); }
                                                                    }} disabled={savingProfile}
                                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, background: savingProfile ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', cursor: savingProfile ? 'not-allowed' : 'pointer', width: '100%' }}>
                                                                        {savingProfile ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
                                                                        {savingProfile ? 'Enregistrement...' : 'Sauvegarder'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Children Section */}
                                                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                                            <h5 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}><GraduationCap size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Mes enfants</h5>
                                                        </div>
                                                        <div style={{ padding: '16px 24px' }}>
                                                            {profilData.enfants.length === 0 ? (
                                                                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Aucun enfant rattaché</p>
                                                            ) : (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                    {profilData.enfants.map((e: any) => (
                                                                        <div key={e.eleve_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fafafa' }}>
                                                                            {/* Photo / Avatar with upload */}
                                                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                                                <div style={{
                                                                                    width: '48px', height: '48px', borderRadius: '12px',
                                                                                    background: e.photo_url ? `url(${API_BASE}${e.photo_url}) center/cover no-repeat` : (e.sexe === 'M' ? 'linear-gradient(135deg, #3b82f6, #60a5fa)' : 'linear-gradient(135deg, #ec4899, #f472b6)'),
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                    color: 'white', fontSize: '14px', fontWeight: 700,
                                                                                }}>
                                                                                    {!e.photo_url && `${e.prenom[0]}${e.nom[0]}`}
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => router.push(`/galerie?tab=eleves&highlight=${e.eleve_id}&search=${encodeURIComponent(e.nom)}`)}
                                                                                    title="Gérer la photo dans la galerie"
                                                                                    style={{
                                                                                        position: 'absolute', bottom: -4, right: -4,
                                                                                        width: '22px', height: '22px', borderRadius: '50%',
                                                                                        background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                        border: '2px solid white', cursor: 'pointer',
                                                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                                                                    }}>
                                                                                    <span style={{ fontSize: '10px' }}><Camera size={10} /></span>
                                                                                </button>
                                                                            </div>
                                                                            <div style={{ flex: 1 }}>
                                                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{e.prenom} {e.nom}</p>
                                                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                                                                    <FileText size={10} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {e.matricule} • <GraduationCap size={10} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> {e.classe} • {e.lien_parente}
                                                                                    {e.date_naissance && ` • ${new Date(e.date_naissance).toLocaleDateString('fr-FR')}`}
                                                                                </p>
                                                                            </div>
                                                                            <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: e.statut === 'ACTIF' ? '#d1fae5' : '#fee2e2', color: e.statut === 'ACTIF' ? '#065f46' : '#dc2626' }}>{e.statut}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                                    <AlertCircle size={32} style={{ marginBottom: '8px' }} />
                                                    <p>Impossible de charger le profil</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── FOURNITURES TAB ─── */}
                                    {activeTab === 'fournitures' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Fournitures Scolaires</h2>
                                            </div>
                                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', padding: '24px' }}>
                                                {fournituresLoading ? (
                                                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Chargement...</div>
                                                ) : fournituresData.length === 0 ? (
                                                    <div style={{ padding: '60px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                                        <ShoppingBag size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                                                        <h3 style={{ margin: 0, fontSize: '16px', color: '#475569' }}>Aucune fourniture trouvée</h3>
                                                        <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#64748b' }}>Aucune fourniture n'est requise pour vos enfants actuellement.</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                                        {fournituresData.map((enf: any) => (
                                                            <div key={enf.eleve_id} style={{ padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                                                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #022c22, #059669)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800 }}>
                                                                        {enf.prenom[0]}{enf.nom[0]}
                                                                    </div>
                                                                    <div>
                                                                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{enf.prenom} {enf.nom}</h4>
                                                                        <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>Classe: {enf.classe}</p>
                                                                    </div>
                                                                </div>
                                                                
                                                                {enf.fournitures.length === 0 ? (
                                                                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Aucune fourniture pour cette classe.</p>
                                                                ) : (
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                                                                        {enf.fournitures.map((f: any) => (
                                                                            <div key={f.fourniture_id} style={{ padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', background: 'white' }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                                                    <h5 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{f.nom}</h5>
                                                                                    <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: f.obligatoire === 'O' ? '#fef2f2' : '#f0fdf4', color: f.obligatoire === 'O' ? '#dc2626' : '#16a34a' }}>
                                                                                        {f.obligatoire === 'O' ? 'Obligatoire' : 'Facultatif'}
                                                                                    </span>
                                                                                </div>
                                                                                {f.description && <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#64748b' }}>{f.description}</p>}
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                                                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Qté: {f.quantite} {f.unite}</span>
                                                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: accentColor }}>{f.prix_unitaire ? `${Number(f.prix_unitaire).toLocaleString('fr-FR')} GNF` : 'Prix n/a'}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── PARAMETRES TAB ─── */}
                                    {activeTab === 'parametres' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
                                            <h5 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Settings size={20} color="#6366f1" /> Paramètres
                                            </h5>

                                            {/* P7: Photo Management Section */}
                                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                                    <h6 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Camera size={16} color="#6366f1" /> Ma Photo de Profil
                                                    </h6>
                                                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Envoyez ou modifiez votre photo de profil</p>
                                                </div>
                                                <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                                    <div onClick={() => { if (data.parent.photo_url) setLightboxUrl(`${API_BASE}${data.parent.photo_url}`); }} style={{
                                                        width: '80px', height: '80px', borderRadius: '50%', flexShrink: 0,
                                                        background: data.parent.photo_url ? `url(${API_BASE}${data.parent.photo_url}) center/cover no-repeat` : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '28px', fontWeight: 800,
                                                        border: '3px solid #e2e8f0', cursor: data.parent.photo_url ? 'pointer' : 'default',
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                    }}>
                                                        {!data.parent.photo_url && `${data.parent.prenom[0]}${data.parent.nom[0]}`}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{data.parent.prenom} {data.parent.nom}</p>
                                                        <p style={{ margin: '0 0 12px', fontSize: '12px', color: data.parent.photo_url ? '#10b981' : '#f59e0b' }}>
                                                            {data.parent.photo_url ? 'Photo de profil définie' : 'Aucune photo de profil'}
                                                        </p>
                                                        <button onClick={() => {
                                                            const input = document.createElement('input');
                                                            input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
                                                            input.onchange = async (e: any) => {
                                                                const file = e.target.files?.[0]; if (!file) return;
                                                                const key = `parent:${data.parent.parent_id}`;
                                                                setPhotoUploading(key);
                                                                try {
                                                                    const fd = new FormData(); fd.append('fichier', file);
                                                                    await api.post(`/api/photos/parent-upload/parent/${data.parent.parent_id}?parent_id=${data.parent.parent_id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

                                                                      setPhotoSuccess('Photo envoyée et en attente de validation !');
                                                                      setTimeout(() => setPhotoSuccess(null), 4000);
                                                                      // Refresh pending
                                                                      setPendingPhotos(prev => new Set(prev).add(key));

                                                                    const dash = await api.get(`/api/portail-parent/${data.parent.parent_id}/dashboard`);
                                                                    setData(dash.data);
                                                                } catch { setPhotoSuccess('Erreur lors de l\'envoi'); }
                                                                finally { setPhotoUploading(null); }
                                                            };
                                                            input.click();
                                                        }} disabled={photoUploading === `parent:${data.parent.parent_id}`}
                                                            style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {photoUploading === `parent:${data.parent.parent_id}` ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={14} />}
                                                            {data.parent.photo_url ? 'Modifier ma photo' : 'Envoyer ma photo'}
                                                        </button>
                                                        {photoSuccess && <p style={{ margin: '8px 0 0', fontSize: '12px', color: primaryColor, fontWeight: 600 }}>{photoSuccess}</p>}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Change Password */}
                                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                                    <h6 style={{ margin: 0, fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Lock size={16} color="#f59e0b" /> Modifier le mot de passe
                                                    </h6>
                                                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>Sécurisez votre compte en définissant un mot de passe fort</p>
                                                </div>
                                                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                                    {pwdSuccess && (
                                                        <div style={{ padding: '10px 16px', borderRadius: '10px', background: '#d1fae5', color: '#065f46', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <CheckCircle size={14} /> {pwdSuccess}
                                                        </div>
                                                    )}
                                                    {pwdError && (
                                                        <div style={{ padding: '10px 16px', borderRadius: '10px', background: '#fee2e2', color: '#dc2626', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <AlertCircle size={14} /> {pwdError}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}><Key size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Ancien mot de passe</label>
                                                        <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="Votre ancien mot de passe"
                                                            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}><Lock size={14} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }} /> Nouveau mot de passe</label>
                                                        <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Minimum 6 caractères"
                                                            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <div>
                                                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}><Lock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> Confirmer le mot de passe</label>
                                                        <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Retapez le nouveau mot de passe"
                                                            style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                                                    </div>
                                                    <button onClick={async () => {
                                                        if (!data) return;
                                                        setPwdError(''); setPwdSuccess('');
                                                        if (newPwd.length < 6) { setPwdError('Le mot de passe doit faire au moins 6 caractères'); return; }
                                                        if (newPwd !== confirmPwd) { setPwdError('Les mots de passe ne correspondent pas'); return; }
                                                        setChangingPwd(true);
                                                        try {
                                                            await api.put(`/api/portail-parent/${data.parent.parent_id}/changer-mot-de-passe`, {
                                                                ancien_mdp: oldPwd || null, nouveau_mdp: newPwd,
                                                            });
                                                            setPwdSuccess('Mot de passe modifié avec succès !');
                                                            setOldPwd(''); setNewPwd(''); setConfirmPwd('');
                                                        } catch (e: any) {
                                                            setPwdError(e.response?.data?.detail || 'Erreur lors du changement');
                                                        } finally { setChangingPwd(false); }
                                                    }} disabled={changingPwd || !newPwd.trim()}
                                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, background: changingPwd ? '#fbbf24' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', border: 'none', cursor: changingPwd ? 'not-allowed' : 'pointer' }}>
                                                        {changingPwd ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Shield size={16} />}
                                                        {changingPwd ? 'Modification...' : 'Modifier le mot de passe'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── PHOTOS TAB ─── */}
                                    {activeTab === 'photos' && data && (() => {
                                        const handlePhotoUpload = async (type: 'eleve' | 'parent', id: number, name: string) => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = 'image/jpeg,image/png,image/webp';
                                            input.onchange = async (e: any) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const key = `${type}:${id}`;
                                                setPhotoUploading(key);
                                                try {
                                                    const fd = new FormData();
                                                    fd.append('fichier', file);
                                                    await api.post(
                                                        `/api/photos/parent-upload/${type}/${id}?parent_id=${data.parent.parent_id}`,
                                                        fd,
                                                        { headers: { 'Content-Type': 'multipart/form-data' } }
                                                    );
                                                    setPhotoSuccess(`Photo de ${name} envoyée avec succès !`);
                                                    // Mark this entity as pending admin approval
                                                    setPendingPhotos(prev => new Set(prev).add(key));
                                                    setTimeout(() => setPhotoSuccess(null), 4000);
                                                    const dash = await api.get(`/api/portail-parent/${data.parent.parent_id}/dashboard`);
                                                    if (dash.data?.parent?.photo_url) dash.data.parent.photo_url += '?t=' + Date.now();
                                                    dash.data?.enfants?.forEach((e: any) => { if (e.photo_url) e.photo_url += '?t=' + Date.now(); });
                                                    setData(dash.data);
                                                    if (type === 'parent') {
                                                        const r = await api.get(`/api/portail-parent/${data.parent.parent_id}/profil`);
                                                        if (r.data?.photo_url) {
                                                            r.data.photo_url += '?t=' + Date.now();
                                                            setPendingPhotos(prev => { const n = new Set(prev); n.delete(key); return n; });
                                                        }
                                                        setProfilData(r.data);
                                                    }
                                                    if (type === 'eleve') {
                                                        const updatedChild = dash.data.enfants.find((e: any) => e.eleve_id === id);
                                                        if (updatedChild?.photo_url) {
                                                            setPendingPhotos(prev => { const n = new Set(prev); n.delete(key); return n; });
                                                        }
                                                    }
                                                } catch {
                                                    setPhotoSuccess(null);
                                                }
                                                setPhotoUploading(null);
                                            };
                                            input.click();
                                        };

                                        return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {/* Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Camera size={20} color="white" />
                                                </div>
                                                <div>
                                                    <h5 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Gestion des Photos</h5>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                                                        Envoyez vos photos — l&apos;administration sera notifiée automatiquement
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Success Toast */}
                                            <AnimatePresence>
                                                {photoSuccess && (
                                                    <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                                        style={{
                                                            padding: '16px 20px', borderRadius: '14px',
                                                            background: `linear-gradient(135deg, ${accentColor}, ${primaryColor})`,
                                                            color: 'white', display: 'flex', alignItems: 'center', gap: '12px',
                                                            boxShadow: '0 8px 24px rgba(16,185,129,0.3)',
                                                        }}>
                                                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            <CheckCircle size={20} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>{photoSuccess}</p>
                                                            <p style={{ margin: '2px 0 0', fontSize: '11px', opacity: 0.85 }}>L&apos;administration a été notifiée.</p>
                                                        </div>
                                                        <button onClick={() => setPhotoSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', opacity: 0.7 }}>
                                                            <X size={16} />
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Ma Photo (parent) */}
                                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <User size={14} color="#6366f1" />
                                                    </div>
                                                    <h6 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Ma Photo de Profil</h6>
                                                </div>
                                                <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                                    <div style={{
                                                        width: '80px', height: '80px', borderRadius: '50%',
                                                        background: data.parent.photo_url
                                                            ? `url(${API_BASE}${data.parent.photo_url}) center/cover no-repeat`
                                                            : 'linear-gradient(135deg, #6366f1, #818cf8)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '24px', fontWeight: 800, color: 'white',
                                                        border: '4px solid #e2e8f0', flexShrink: 0,
                                                        cursor: data.parent.photo_url ? 'zoom-in' : 'default',
                                                        transition: 'transform 0.2s',
                                                    }}
                                                    onClick={() => data.parent.photo_url && setLightboxUrl(`${API_BASE}${data.parent.photo_url}`)}
                                                    onMouseOver={e => { if (data.parent.photo_url) e.currentTarget.style.transform = 'scale(1.05)'; }}
                                                    onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                                                        {!data.parent.photo_url && `${data.parent.prenom[0]}${data.parent.nom[0]}`}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '15px' }}>{data.parent.prenom} {data.parent.nom}</p>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                                                            {pendingPhotos.has(`parent:${data.parent.parent_id}`)
                                                                ? <><Clock size={14} color="#d97706" /><span style={{ fontSize: '12px', color: '#d97706', fontWeight: 600 }}>En attente de validation</span></>
                                                                : data.parent.photo_url
                                                                    ? <><CheckCircle size={14} color={accentColor} /><span style={{ fontSize: '12px', color: accentColor, fontWeight: 600 }}>Photo validée</span></>
                                                                    : <><AlertCircle size={14} color="#dc2626" /><span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>Aucune photo</span></>
                                                            }
                                                        </div>
                                                        <button onClick={() => handlePhotoUpload('parent', data.parent.parent_id, `${data.parent.prenom} ${data.parent.nom}`)}
                                                            disabled={photoUploading === `parent:${data.parent.parent_id}` || pendingPhotos.has(`parent:${data.parent.parent_id}`)}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                                                padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: pendingPhotos.has(`parent:${data.parent.parent_id}`) ? 'not-allowed' : 'pointer',
                                                                background: pendingPhotos.has(`parent:${data.parent.parent_id}`)
                                                                    ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                                                    : data.parent.photo_url ? '#f1f5f9' : 'linear-gradient(135deg, #6366f1, #818cf8)',
                                                                color: pendingPhotos.has(`parent:${data.parent.parent_id}`) ? 'white' : data.parent.photo_url ? '#475569' : 'white',
                                                                fontSize: '13px', fontWeight: 700,
                                                            }}>
                                                            {photoUploading === `parent:${data.parent.parent_id}`
                                                                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Envoi en cours...</>
                                                                : pendingPhotos.has(`parent:${data.parent.parent_id}`)
                                                                    ? <><Clock size={14} /> En attente de validation...</>
                                                                    : <><Camera size={14} /> {data.parent.photo_url ? 'Modifier ma photo' : 'Envoyer ma photo'}</>
                                                            }
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Photos enfants */}
                                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <GraduationCap size={14} color={accentColor} />
                                                    </div>
                                                    <h6 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>Photos de mes enfants</h6>
                                                    <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
                                                        {data.enfants.filter(e => e.photo_url).length}/{data.enfants.length} envoyées
                                                    </span>
                                                </div>
                                                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {data.enfants.map((enf) => (
                                                        <div key={enf.eleve_id} style={{
                                                            display: 'flex', alignItems: 'center', gap: '16px',
                                                            padding: '16px', borderRadius: '14px',
                                                            border: `2px solid ${enf.photo_url ? '#d1fae5' : '#fef3c7'}`,
                                                            background: enf.photo_url ? '#f0fdf4' : '#fffbeb',
                                                            transition: 'all 0.2s',
                                                        }}>
                                                            <div style={{
                                                                width: '56px', height: '56px', borderRadius: '50%',
                                                                background: enf.photo_url
                                                                    ? `url(${API_BASE}${enf.photo_url}) center/cover no-repeat`
                                                                    : (enf.sexe === 'M' ? 'linear-gradient(135deg, #3b82f6, #60a5fa)' : 'linear-gradient(135deg, #ec4899, #f472b6)'),
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: '16px', fontWeight: 800, color: 'white',
                                                                border: '3px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                                                flexShrink: 0,
                                                                cursor: enf.photo_url ? 'zoom-in' : 'default',
                                                                transition: 'transform 0.2s',
                                                            }}
                                                            onClick={() => enf.photo_url && setLightboxUrl(`${API_BASE}${enf.photo_url}`)}
                                                            onMouseOver={e => { if (enf.photo_url) e.currentTarget.style.transform = 'scale(1.08)'; }}
                                                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                                                                {!enf.photo_url && `${enf.prenom[0]}${enf.nom[0]}`}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '14px', color: '#1e293b' }}>
                                                                    {enf.prenom} {enf.nom}
                                                                </p>
                                                                <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#94a3b8' }}>
                                                                    {enf.classe} • {enf.matricule}
                                                                </p>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    {pendingPhotos.has(`eleve:${enf.eleve_id}`)
                                                                        ? <><Clock size={12} color="#d97706" /><span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>En attente de validation</span></>
                                                                        : enf.photo_url
                                                                            ? <><CheckCircle size={12} color={accentColor} /><span style={{ fontSize: '11px', color: accentColor, fontWeight: 600 }}>Photo validée</span></>
                                                                            : <><AlertCircle size={12} color="#d97706" /><span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>Aucune photo</span></>
                                                                    }
                                                                </div>
                                                            </div>
                                                            <button onClick={() => handlePhotoUpload('eleve', enf.eleve_id, enf.prenom)}
                                                                disabled={photoUploading === `eleve:${enf.eleve_id}` || pendingPhotos.has(`eleve:${enf.eleve_id}`)}
                                                                style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                    padding: '10px 16px', borderRadius: '10px', border: 'none',
                                                                    cursor: pendingPhotos.has(`eleve:${enf.eleve_id}`) ? 'not-allowed' : 'pointer',
                                                                    background: pendingPhotos.has(`eleve:${enf.eleve_id}`)
                                                                        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                                                        : enf.photo_url ? '#f1f5f9' : `linear-gradient(135deg, ${primaryColor}, #34d399)`,
                                                                    color: pendingPhotos.has(`eleve:${enf.eleve_id}`) ? 'white' : enf.photo_url ? '#475569' : 'white',
                                                                    fontSize: '12px', fontWeight: 700,
                                                                }}>
                                                                {photoUploading === `eleve:${enf.eleve_id}`
                                                                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                                    : pendingPhotos.has(`eleve:${enf.eleve_id}`)
                                                                        ? <><Clock size={14} /> En attente</>
                                                                        : <>{enf.photo_url ? <Camera size={14} /> : <Upload size={14} />} {enf.photo_url ? 'Modifier' : 'Envoyer'}</>
                                                                }
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div style={{
                                                padding: '16px 20px', borderRadius: '14px',
                                                background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                                                border: '1px solid #bfdbfe',
                                                display: 'flex', alignItems: 'flex-start', gap: '12px',
                                            }}>
                                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <AlertCircle size={16} color="#3b82f6" />
                                                </div>
                                                <div>
                                                    <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 700, color: '#1e40af' }}>
                                                        Comment ça fonctionne ?
                                                    </p>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', lineHeight: 1.6 }}>
                                                        Vos photos seront transmises à l&apos;administration qui les validera dans la galerie
                                                        de l&apos;établissement. Formats : JPG, PNG, WebP (max 5 Mo).
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })()}

                                    {/* ─── EVENEMENTS TAB ─── */}
                                    {activeTab === 'evenements' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #60a5fa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Calendar size={20} color="white" />
                                                </div>
                                                <div>
                                                    <h5 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Événements de l'École</h5>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                                                        Agenda et événements prévus
                                                    </p>
                                                </div>
                                            </div>

                                            {parentEvts.length === 0 ? (
                                                <div style={{ padding: '40px', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Aucun événement publié pour le moment.</p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                                                    {parentEvts.map((evt, idx) => (
                                                        <div key={idx} style={{
                                                            background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px',
                                                            display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                                            position: 'relative', overflow: 'hidden'
                                                        }}>
                                                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
                                                            <div>
                                                                <span style={{ padding: '4px 10px', borderRadius: '8px', background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 700 }}>
                                                                    {evt.type_evenement || 'Événement'}
                                                                </span>
                                                            </div>
                                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{evt.titre}</h4>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                                                                <Clock size={14} /> {new Date(evt.date_debut).toLocaleDateString()}
                                                                {evt.lieu && <><span style={{ margin: '0 4px' }}>•</span> {evt.lieu}</>}
                                                            </div>
                                                            {evt.description && (
                                                                <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                                                                    {evt.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ─── ACTIVITES TAB ─── */}
                                    {activeTab === 'activites' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Activity size={20} color="white" />
                                                </div>
                                                <div>
                                                    <h5 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>Activités du Jour</h5>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                                                        Suivez les activités quotidiennes
                                                    </p>
                                                </div>
                                            </div>

                                            {parentActs.length === 0 ? (
                                                <div style={{ padding: '40px', textAlign: 'center', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px', fontWeight: 500 }}>Aucune activité signalée pour le moment.</p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', left: '19px', top: '20px', bottom: '20px', width: '2px', background: '#e2e8f0', zIndex: 0 }} />
                                                    {parentActs.map((act, idx) => (
                                                        <div key={idx} style={{ display: 'flex', gap: '16px', position: 'relative', zIndex: 1 }}>
                                                            <div style={{
                                                                width: '40px', height: '40px', borderRadius: '50%', background: '#fff',
                                                                border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: '#10b981', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                            }}>
                                                                <Clock size={16} />
                                                            </div>
                                                            <div style={{
                                                                flex: 1, background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
                                                                padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                                            }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>{act.titre}</h4>
                                                                    <span style={{ padding: '4px 8px', borderRadius: '6px', background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 600 }}>
                                                                        {act.heure || 'N/A'}
                                                                    </span>
                                                                </div>
                                                                <span style={{ display: 'inline-block', alignSelf: 'flex-start', padding: '4px 10px', borderRadius: '8px', background: '#d1fae5', color: '#047857', fontSize: '11px', fontWeight: 700 }}>
                                                                    {act.type_activite || 'Général'}
                                                                </span>
                                                                {act.description && (
                                                                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                                                                        {act.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </motion.div>
                            </AnimatePresence>

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
                                            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                                            cursor: 'default',
                                        }} />
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                {[
                                    { icon: <MessageSquare size={22} />, label: 'Messages', color: '#6366f1', bg: '#ede9fe', action: () => setActiveTab('messages') },
                                    { icon: <BarChart3 size={22} />, label: 'Dashboard', color: primaryColor, bg: '#d1fae5', action: () => setActiveTab('dashboard') },
                                    { icon: <BookOpen size={22} />, label: 'Devoirs', color: '#f59e0b', bg: '#fef3c7', action: () => setActiveTab('notes') },
                                ].map((act, i) => (
                                    <div key={i} onClick={act.action} style={{
                                        background: 'white', borderRadius: '14px', padding: '20px', textAlign: 'center',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = act.color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = ''; }}
                                    >
                                        <div style={{
                                            width: '48px', height: '48px', borderRadius: '14px', background: act.bg,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 10px', color: act.color,
                                        }}>
                                            {act.icon}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#475569' }}>{act.label}</p>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    </div>
    );
}
