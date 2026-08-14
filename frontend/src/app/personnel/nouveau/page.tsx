'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import { getRoleInterfaceSummary } from '@/lib/roleAccess';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
    ArrowLeft,
    Briefcase,
    Building2,
    Calendar,
    Check,
    CheckCircle2,
    ChevronRight,
    Copy,
    Crown,
    DollarSign,
    Eye,
    EyeOff,
    FileText as FileTextIcon,
    BookOpen,
    GraduationCap,
    Info,
    Key,
    Loader2,
    Lock,
    Monitor,
    RefreshCw,
    Shield,
    Sparkles,
    Star,
    User,
    UserCheck,
    UserPlus,
    Users,
    Wallet,
    AlertTriangle,
    X,
} from 'lucide-react';

const ROLES_CONFIG = [
    { value: 'FONDATEUR', label: 'Fondateur', icon: Crown, color: '#7c3aed', bg: '#f5f3ff', hasAccess: true, desc: 'Propriétaire et fondateur de l\'établissement' },
    { value: 'DG', label: 'Directeur Général', icon: Building2, color: '#1d4ed8', bg: '#eff6ff', hasAccess: true, desc: 'Direction générale de l\'établissement' },
    { value: 'DIRECTEUR_NIVEAU', label: 'Directeur de Niveau', icon: GraduationCap, color: '#0369a1', bg: '#f0f9ff', hasAccess: true, desc: 'Responsable d\'un cycle ou niveau scolaire' },
    { value: 'ADMIN', label: 'Administrateur', icon: Shield, color: '#0f766e', bg: '#f0fdfa', hasAccess: true, desc: 'Accès complet à l\'administration' },
    { value: 'COMPTABLE', label: 'Comptable', icon: DollarSign, color: '#b45309', bg: '#fffbeb', hasAccess: true, desc: 'Gestion financière et comptabilité' },
    { value: 'BIBLIOTHECAIRE', label: 'Bibliothécaire', icon: BookOpen, color: '#7e22ce', bg: '#faf5ff', hasAccess: true, desc: 'Gestion de la bibliothèque scolaire' },
    { value: 'INFORMATICIEN', label: 'Informaticien', icon: Monitor, color: '#0284c7', bg: '#f0f9ff', hasAccess: true, desc: 'Support technique et informatique' },
    { value: 'SURVEILLANT', label: 'Surveillant', icon: UserCheck, color: '#16a34a', bg: '#f0fdf4', hasAccess: true, desc: 'Surveillance et discipline scolaire' },
    { value: 'OPERATEUR', label: 'Opérateur / Secrétaire', icon: Key, color: '#475569', bg: '#f8fafc', hasAccess: true, desc: 'Opérations de saisie et secrétariat' },
    { value: 'AGENT_ENTRETIEN', label: 'Agent d\'Entretien', icon: Briefcase, color: '#92400e', bg: '#fff7ed', hasAccess: false, desc: 'Nettoyage et entretien des locaux' },
    { value: 'GARDIEN', label: 'Gardien', icon: Lock, color: '#374151', bg: '#f9fafb', hasAccess: false, desc: 'Sécurité et gardiennage' },
    { value: 'CHAUFFEUR', label: 'Chauffeur', icon: Star, color: '#0369a1', bg: '#f0f9ff', hasAccess: false, desc: 'Transport scolaire' },
    { value: 'AUTRE', label: 'Autre Personnel', icon: Users, color: '#6b7280', bg: '#f9fafb', hasAccess: false, desc: 'Autre catégorie de personnel' },
] as const;

type Step = 'role' | 'identite' | 'contrat' | 'acces' | 'recap';

interface CreatedInfo {
    role: string;
    nom: string;
    prenom: string;
    nom_utilisateur?: string | null;
    mot_de_passe_clair?: string | null;
}

export default function NouveauPersonnel() {
    const { etablissementId } = useApp();
    const isMobile = useIsMobile();

    const [step, setStep] = useState<Step>('role');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [createdInfo, setCreatedInfo] = useState<CreatedInfo | null>(null);
    const [copied, setCopied] = useState(false);
    const [showPwd, setShowPwd] = useState(false);

    const [form, setForm] = useState({
        role: '',
        roles_secondaires: [] as string[],
        nom: '',
        prenom: '',
        sexe: 'M',
        telephone: '',
        email: '',
        date_naissance: '',
        lieu_naissance: '',
        adresse: '',
        numero_cni: '',
        type_contrat: 'PERMANENT',
        date_embauche: '',
        salaire_base: 0,
        taux_horaire: 0,
        prime_mensuelle: 0,
        heures_hebdo: 0,
        mode_paiement_salaire: 'ESPECES',
        rib: '',
        accesSysteme: false,
        nom_utilisateur: '',
        mot_de_passe: '',
    });

    const selectedRoleConfig = ROLES_CONFIG.find((r) => r.value === form.role);
    const selectedInterface = getRoleInterfaceSummary(form.role || null);
    const monthlyCost = Number(form.salaire_base || 0) + Number(form.prime_mensuelle || 0);

    const progress = useMemo(() => {
        const stepIndex = ['role', 'identite', 'contrat', 'acces', 'recap'].indexOf(step);
        return ((stepIndex + 1) / 5) * 100;
    }, [step]);

    const ch = (field: string, val: string | number | boolean | string[]) => {
        setForm((prev) => ({ ...prev, [field]: val }));
    };

    const generatePassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#';
        let pwd = '';
        for (let i = 0; i < 10; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
        ch('mot_de_passe', pwd);
        setShowPwd(true);
    };

    const generateLogin = () => {
        if (form.prenom && form.nom) {
            const login = `${form.prenom.slice(0, 2).toLowerCase()}.${form.nom.toLowerCase().replace(/\s+/g, '')}`;
            ch('nom_utilisateur', login);
        }
    };

    const toggleRoleSecondaire = (role: string) => {
        if (role === form.role) return;
        const current = form.roles_secondaires;
        if (current.includes(role)) {
            ch('roles_secondaires', current.filter((x) => x !== role));
        } else {
            ch('roles_secondaires', [...current, role]);
        }
    };

    const resetForm = () => {
        setSuccess(false);
        setCreatedInfo(null);
        setError(null);
        setCopied(false);
        setShowPwd(false);
        setStep('role');
        setForm({
            role: '',
            roles_secondaires: [],
            nom: '',
            prenom: '',
            sexe: 'M',
            telephone: '',
            email: '',
            date_naissance: '',
            lieu_naissance: '',
            adresse: '',
            numero_cni: '',
            type_contrat: 'PERMANENT',
            date_embauche: '',
            salaire_base: 0,
            taux_horaire: 0,
            prime_mensuelle: 0,
            heures_hebdo: 0,
            mode_paiement_salaire: 'ESPECES',
            rib: '',
            accesSysteme: false,
            nom_utilisateur: '',
            mot_de_passe: '',
        });
    };

    const copyCredentials = () => {
        if (!createdInfo) return;
        const text = `SMARTSCHOOL — Identifiants Système\nNom : ${createdInfo.prenom} ${createdInfo.nom}\nRôle : ${selectedRoleConfig?.label || createdInfo.role}\nLogin : ${createdInfo.nom_utilisateur || 'N/A'}\nMot de passe : ${createdInfo.mot_de_passe_clair || 'Non défini'}\n--- Confidentiel ---`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSubmit = async () => {
        if (!etablissementId) return;
        setLoading(true);
        setError(null);
        try {
            const payload = {
                etablissement_id: etablissementId,
                nom: form.nom,
                prenom: form.prenom,
                sexe: form.sexe,
                telephone: form.telephone || null,
                email: form.email || null,
                role: form.role,
                roles_secondaires: form.roles_secondaires.length > 0 ? form.roles_secondaires : null,
                statut: 'ACTIF',
                type_contrat: form.type_contrat,
                date_embauche: form.date_embauche || null,
                salaire_base: form.salaire_base,
                taux_horaire: form.taux_horaire,
                prime_mensuelle: form.prime_mensuelle,
                heures_hebdo: form.heures_hebdo,
                mode_paiement_salaire: form.mode_paiement_salaire,
                rib: form.rib || null,
                date_naissance: form.date_naissance || null,
                lieu_naissance: form.lieu_naissance || null,
                adresse: form.adresse || null,
                numero_cni: form.numero_cni || null,
                nom_utilisateur: form.accesSysteme && form.nom_utilisateur ? form.nom_utilisateur : null,
                mot_de_passe: form.accesSysteme && form.mot_de_passe ? form.mot_de_passe : null,
            };
            const res = await api.post('/api/personnel', payload);
            setCreatedInfo(res.data);
            setSuccess(true);
        } catch (e: unknown) {
            const message = typeof e === 'object' && e !== null && 'response' in e
                ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setError(message || 'Une erreur est survenue.');
        } finally {
            setLoading(false);
        }
    };

    const STEPS: { key: Step; label: string; short: string; done: boolean }[] = [
        { key: 'role', label: 'Rôle principal', short: 'Rôle', done: !!form.role },
        { key: 'identite', label: 'Identité & contact', short: 'Identité', done: !!(form.nom && form.prenom) },
        { key: 'contrat', label: 'Contrat & rémunération', short: 'Contrat', done: true },
        { key: 'acces', label: 'Accès système', short: 'Accès', done: true },
        { key: 'recap', label: 'Validation finale', short: 'Récap', done: false },
    ];

    const inputStyle = {
        padding: '13px 14px',
        borderRadius: '16px',
        border: '1.5px solid #e2e8f0',
        outline: 'none',
        fontSize: '14px',
        width: '100%',
        boxSizing: 'border-box' as const,
        transition: 'all 0.2s ease',
        fontFamily: 'Inter, sans-serif',
        background: '#fff',
        color: '#0f172a',
    };

    const labelStyle = {
        fontSize: '13px',
        fontWeight: 700 as const,
        color: '#475569',
        display: 'block' as const,
        marginBottom: '7px',
    };

    const sectionHdr = (icon: React.ReactNode, title: string, sub: string, accent: string) => (
        <div style={{ padding: '22px 24px', borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', gap: '14px', background: 'linear-gradient(135deg, #fcfdff, #f8fafc)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '16px', background: accent, display: 'grid', placeItems: 'center', color: '#0f172a' }}>{icon}</div>
            <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{title}</h2>
                <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>{sub}</p>
            </div>
        </div>
    );

    const nextButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '13px 24px',
        borderRadius: '16px',
        border: 'none',
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: 'white',
        fontWeight: 800,
        cursor: 'pointer',
        fontSize: '14px',
        boxShadow: '0 14px 30px rgba(37,99,235,0.22)',
    };

    if (success && createdInfo) {
        const cfg = ROLES_CONFIG.find((r) => r.value === createdInfo.role);
        return (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '32px', padding: '30px', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)', color: 'white', boxShadow: '0 30px 70px rgba(15,23,42,0.18)' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(255,255,255,0.16), transparent 22%), radial-gradient(circle at bottom left, rgba(16,185,129,0.22), transparent 28%)' }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: '22px', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                <CheckCircle2 size={14} /> Recrutement validé
                            </span>
                            <div>
                                <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 3vw, 2.8rem)', fontWeight: 900, letterSpacing: '-0.04em' }}>{createdInfo.prenom} {createdInfo.nom}</h1>
                                <p style={{ margin: '10px 0 0', fontSize: '15px', lineHeight: 1.8, color: 'rgba(255,255,255,0.8)', maxWidth: '700px' }}>
                                    Le dossier du membre du personnel a été créé avec succès et intégré dans l’écosystème RH SmartSchool.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', fontWeight: 700, fontSize: '13px' }}>{cfg?.label || createdInfo.role}</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: 999, background: 'rgba(16,185,129,0.18)', color: '#bbf7d0', fontWeight: 700, fontSize: '13px' }}>{selectedInterface.interfaceLabel}</span>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', backdropFilter: 'blur(18px)' }}>
                            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.68)', fontWeight: 800 }}>Synthèse d’intégration</p>
                            <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                                {[
                                    { label: 'Rôle principal', value: cfg?.label || createdInfo.role },
                                    { label: 'Accès système', value: createdInfo.nom_utilisateur ? 'Compte créé' : 'Aucun accès' },
                                    { label: 'Interface', value: selectedInterface.interfaceLabel },
                                    { label: 'Redirection', value: selectedInterface.redirectPath },
                                ].map((item) => (
                                    <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: 'rgba(15,23,42,0.18)' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.58)', fontWeight: 800 }}>{item.label}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800 }}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section style={{ background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', padding: '28px' }}>
                    {createdInfo.nom_utilisateur ? (
                        <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0', borderRadius: '22px', padding: '22px', marginBottom: '22px' }}>
                            <p style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={15} /> Identifiants système générés</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                                <div style={{ padding: '14px', borderRadius: '16px', background: 'rgba(255,255,255,0.6)' }}>
                                    <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#166534', fontWeight: 800 }}>Login</p>
                                    <code style={{ display: 'block', marginTop: '6px', fontSize: '15px', fontWeight: 800, color: '#166534' }}>{createdInfo.nom_utilisateur}</code>
                                </div>
                                {createdInfo.mot_de_passe_clair && (
                                    <div style={{ padding: '14px', borderRadius: '16px', background: 'rgba(255,255,255,0.6)' }}>
                                        <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#166534', fontWeight: 800 }}>Mot de passe</p>
                                        <code style={{ display: 'block', marginTop: '6px', fontSize: '15px', fontWeight: 800, color: '#166534' }}>{createdInfo.mot_de_passe_clair}</code>
                                    </div>
                                )}
                            </div>
                            <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={14} /> Conservez ces informations maintenant : elles ne seront plus affichées ensuite.
                            </p>
                        </div>
                    ) : null}

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {createdInfo.nom_utilisateur && (
                            <button onClick={copyCredentials} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderRadius: '14px', border: '1px solid #d1fae5', background: '#f0fdf4', color: '#166534', fontWeight: 800, cursor: 'pointer' }}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Identifiants copiés' : 'Copier les identifiants'}
                            </button>
                        )}
                        <button onClick={resetForm} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderRadius: '14px', border: 'none', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', fontWeight: 800, cursor: 'pointer' }}>
                            <UserPlus size={16} /> Nouveau recrutement
                        </button>
                        <Link href="/personnel" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', color: '#334155', fontWeight: 800, textDecoration: 'none' }}>
                            Retour annuaire
                        </Link>
                    </div>
                </section>
            </motion.div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '32px', padding: '28px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 38%, #1d4ed8 100%)', color: 'white', boxShadow: '0 28px 70px rgba(15,23,42,0.18)' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(255,255,255,0.14), transparent 24%), radial-gradient(circle at bottom left, rgba(16,185,129,0.18), transparent 28%)' }} />
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.25fr) minmax(320px, 0.8fr)', gap: '22px', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            <Link href="/personnel" style={{ width: 46, height: 46, borderRadius: '16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', color: 'white', display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
                                <ArrowLeft size={20} />
                            </Link>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                <Sparkles size={14} /> Recrutement premium RH
                            </span>
                        </div>

                        <div>
                            <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 3vw, 3rem)', fontWeight: 900, letterSpacing: '-0.04em' }}>Nouveau recrutement</h1>
                            <p style={{ margin: '12px 0 0', fontSize: '15px', lineHeight: 1.8, color: 'rgba(255,255,255,0.82)', maxWidth: '760px' }}>
                                Créez un dossier de personnel complet, attribuez un rôle principal, définissez les accès et préparez une redirection métier fiable dès la création du compte.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                            {[
                                { label: 'Étape actuelle', value: STEPS.find((s) => s.key === step)?.short || 'Rôle', note: `${Math.round(progress)}% complété`, icon: FileTextIcon },
                                { label: 'Rôle sélectionné', value: selectedRoleConfig?.label || 'À définir', note: selectedRoleConfig?.hasAccess ? 'accès possible' : 'RH uniquement', icon: Users },
                                { label: 'Interface cible', value: selectedInterface.interfaceLabel, note: selectedInterface.redirectPath, icon: Key },
                            ].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} style={{ padding: '18px', borderRadius: '22px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)' }}>
                                        <div style={{ width: 44, height: 44, borderRadius: '14px', background: 'rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center', marginBottom: '12px' }}>
                                            <Icon size={18} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.64)' }}>{item.label}</p>
                                        <p style={{ margin: '8px 0 2px', fontSize: '20px', fontWeight: 900 }}>{item.value}</p>
                                        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.74)' }}>{item.note}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '26px', border: '1px solid rgba(255,255,255,0.1)', padding: '22px', backdropFilter: 'blur(18px)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.65)', fontWeight: 800 }}>Progression dossier</p>
                            <h3 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 900 }}>{Math.round(progress)}%</h3>
                        </div>
                        <div style={{ height: '10px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                            <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #34d399, #60a5fa)' }} />
                        </div>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {STEPS.map((item, index) => {
                                const isActive = item.key === step;
                                const isPast = ['role', 'identite', 'contrat', 'acces', 'recap'].indexOf(step) > index;
                                return (
                                    <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '16px', background: isActive ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)' }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '12px', background: isActive ? 'white' : isPast ? '#10b981' : 'rgba(255,255,255,0.12)', color: isActive ? '#1d4ed8' : 'white', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '13px' }}>
                                            {isPast ? '✓' : index + 1}
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>{item.short}</p>
                                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.72)' }}>{item.label}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div style={{ padding: '15px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '18px', color: '#b91c1c', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(300px, 0.85fr)', gap: '20px', alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <AnimatePresence mode="wait">
                        {step === 'role' && (
                            <motion.div key="role" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
                                <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 54px rgba(15,23,42,0.06)' }}>
                                    {sectionHdr(<Users size={20} />, 'Sélection du rôle principal', 'Choisissez la mission principale du membre et les accès attendus.', 'linear-gradient(135deg, #ede9fe, #dbeafe)')}
                                    <div style={{ padding: '24px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                                            {ROLES_CONFIG.map((r) => {
                                                const Icon = r.icon;
                                                const isSelected = form.role === r.value;
                                                const roleInterface = getRoleInterfaceSummary(r.value);
                                                return (
                                                    <motion.button
                                                        key={r.value}
                                                        whileHover={{ y: -4 }}
                                                        whileTap={{ scale: 0.99 }}
                                                        onClick={() => ch('role', r.value)}
                                                        style={{ padding: '18px', borderRadius: '22px', border: '1.5px solid', borderColor: isSelected ? r.color : '#e2e8f0', background: isSelected ? `linear-gradient(135deg, ${r.bg}, white)` : 'white', cursor: 'pointer', textAlign: 'left', boxShadow: isSelected ? `0 16px 30px ${r.color}22` : '0 8px 18px rgba(15,23,42,0.04)' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                                                            <div style={{ width: 42, height: 42, borderRadius: '14px', background: isSelected ? r.color : '#f1f5f9', display: 'grid', placeItems: 'center' }}>
                                                                <Icon size={18} style={{ color: isSelected ? 'white' : '#64748b' }} />
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                                {!r.hasAccess && <span style={{ fontSize: '10px', padding: '4px 7px', background: '#fef9c3', color: '#854d0e', borderRadius: '999px', fontWeight: 700 }}>Sans accès</span>}
                                                                {isSelected && <CheckCircle2 size={18} style={{ color: r.color }} />}
                                                            </div>
                                                        </div>
                                                        <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 800, color: isSelected ? r.color : '#0f172a' }}>{r.label}</p>
                                                        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>{r.desc}</p>
                                                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>Interface : {roleInterface.interfaceLabel}</div>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>

                                        {form.role && (
                                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: '20px', padding: '18px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                                                <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 800, color: '#334155' }}>Rôles secondaires et cumul de responsabilités</p>
                                                {/* Les rôles secondaires sont désormais réellement appliqués
                                                    (`require_roles` les lit depuis le JWT). Il faut le dire clairement :
                                                    ce ne sont pas de simples étiquettes, chacun ouvre de vrais accès. */}
                                                <p style={{ margin: '0 0 12px', fontSize: '12px', lineHeight: 1.5, color: '#475569' }}>
                                                    Chaque rôle secondaire <strong>ouvre réellement les accès de ce
                                                    rôle</strong>, en plus de ceux du rôle principal. À n&apos;attribuer
                                                    que si la personne exerce effectivement cette responsabilité — la
                                                    prise en compte est immédiate à sa prochaine connexion.
                                                </p>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    {ROLES_CONFIG.filter((r) => r.value !== form.role).map((r) => {
                                                        const isChosen = form.roles_secondaires.includes(r.value);
                                                        return (
                                                            <button key={r.value} type="button" onClick={() => toggleRoleSecondaire(r.value)} style={{ padding: '7px 12px', borderRadius: '999px', border: '1.5px solid', borderColor: isChosen ? r.color : '#e2e8f0', background: isChosen ? r.bg : 'white', color: isChosen ? r.color : '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                                                                {isChosen ? '✓ ' : '+ '}{r.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 'identite' && (
                            <motion.div key="identite" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
                                <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 54px rgba(15,23,42,0.06)' }}>
                                    {sectionHdr(<User size={20} />, 'Identité & informations personnelles', 'Collecte RH premium : état civil, contact et données d’identification.', 'linear-gradient(135deg, #dcfce7, #dbeafe)')}
                                    <div style={{ padding: '24px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px' }}>
                                            <div>
                                                <label style={labelStyle}>Nom de famille *</label>
                                                <input value={form.nom} onChange={(e) => ch('nom', e.target.value)} placeholder="Ex: CAMARA" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Prénom(s) *</label>
                                                <input value={form.prenom} onChange={(e) => ch('prenom', e.target.value)} placeholder="Ex: Mariama" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Sexe *</label>
                                                <select value={form.sexe} onChange={(e) => ch('sexe', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                                    <option value="M">Masculin</option>
                                                    <option value="F">Féminin</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Téléphone</label>
                                                <input value={form.telephone} onChange={(e) => ch('telephone', e.target.value)} placeholder="Ex: 622 00 00 00" style={inputStyle} />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={labelStyle}>Email</label>
                                                <input type="email" value={form.email} onChange={(e) => ch('email', e.target.value)} placeholder="contact@ecole.com" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Date de naissance</label>
                                                <input type="date" value={form.date_naissance} onChange={(e) => ch('date_naissance', e.target.value)} style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Lieu de naissance</label>
                                                <input value={form.lieu_naissance} onChange={(e) => ch('lieu_naissance', e.target.value)} placeholder="Conakry, Guinée" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Numéro CNI / Passeport</label>
                                                <input value={form.numero_cni} onChange={(e) => ch('numero_cni', e.target.value)} placeholder="Numéro de pièce" style={inputStyle} />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label style={labelStyle}>Adresse de résidence</label>
                                                <input value={form.adresse} onChange={(e) => ch('adresse', e.target.value)} placeholder="Quartier, rue, secteur, ville..." style={inputStyle} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 'contrat' && (
                            <motion.div key="contrat" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
                                <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 54px rgba(15,23,42,0.06)' }}>
                                    {sectionHdr(<FileTextIcon size={20} />, 'Contrat & rémunération', 'Cadre contractuel, coût RH et mode de paiement préférentiel.', 'linear-gradient(135deg, #fef3c7, #dbeafe)')}
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px' }}>
                                            <div>
                                                <label style={labelStyle}>Type de contrat</label>
                                                <select value={form.type_contrat} onChange={(e) => ch('type_contrat', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                                    <option value="PERMANENT">PERMANENT</option>
                                                    <option value="CONTRACTUEL">CONTRACTUEL</option>
                                                    <option value="VACATAIRE">VACATAIRE</option>
                                                    <option value="STAGE">STAGE</option>
                                                    <option value="JOURNALIER">JOURNALIER</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Date d’embauche</label>
                                                <input type="date" value={form.date_embauche} onChange={(e) => ch('date_embauche', e.target.value)} style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Salaire mensuel de base (GNF)</label>
                                                <input type="number" min="0" value={form.salaire_base} onChange={(e) => ch('salaire_base', parseFloat(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Taux horaire (GNF/heure)</label>
                                                <input type="number" min="0" value={form.taux_horaire} onChange={(e) => ch('taux_horaire', parseFloat(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Prime mensuelle fixe (GNF)</label>
                                                <input type="number" min="0" value={form.prime_mensuelle} onChange={(e) => ch('prime_mensuelle', parseFloat(e.target.value) || 0)} placeholder="0" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Calendar size={14} /> Heures hebdomadaires prévues</label>
                                                <input type="number" min="0" value={form.heures_hebdo} onChange={(e) => ch('heures_hebdo', parseInt(e.target.value, 10) || 0)} placeholder="Ex: 40" style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Mode de paiement</label>
                                                <select value={form.mode_paiement_salaire} onChange={(e) => ch('mode_paiement_salaire', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                                    <option value="ESPECES">Espèces</option>
                                                    <option value="VIREMENT">Virement bancaire</option>
                                                    <option value="MOBILE_MONEY">Mobile Money</option>
                                                    <option value="CHEQUE">Chèque</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>RIB / Numéro Mobile</label>
                                                <input value={form.rib} onChange={(e) => ch('rib', e.target.value)} placeholder="IBAN ou numéro Mobile Money" style={inputStyle} />
                                            </div>
                                        </div>

                                        {(form.salaire_base > 0 || form.prime_mensuelle > 0) && (
                                            <div style={{ padding: '18px', borderRadius: '20px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                                                <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}><Wallet size={14} /> Coût mensuel estimé</p>
                                                <p style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#166534' }}>{new Intl.NumberFormat('fr-FR').format(monthlyCost)} GNF / mois</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 'acces' && (
                            <motion.div key="acces" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
                                <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 54px rgba(15,23,42,0.06)' }}>
                                    {sectionHdr(<Lock size={20} />, 'Accès système & identifiants', 'Déterminez l’accès à SmartSchool et préparez l’expérience de connexion.', 'linear-gradient(135deg, #fde68a, #dbeafe)')}
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                            <button type="button" onClick={() => ch('accesSysteme', false)} style={{ padding: '18px', borderRadius: '22px', border: '1.5px solid', borderColor: !form.accesSysteme ? '#ef4444' : '#e2e8f0', background: !form.accesSysteme ? '#fef2f2' : 'white', cursor: 'pointer', textAlign: 'left' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                    <X size={20} style={{ color: !form.accesSysteme ? '#ef4444' : '#94a3b8' }} />
                                                    <span style={{ fontWeight: 800, fontSize: '15px', color: !form.accesSysteme ? '#ef4444' : '#334155' }}>Sans accès</span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>Le profil reste visible en RH sans compte applicatif.</p>
                                            </button>
                                            <button type="button" onClick={() => { ch('accesSysteme', true); generateLogin(); }} style={{ padding: '18px', borderRadius: '22px', border: '1.5px solid', borderColor: form.accesSysteme ? '#2563eb' : '#e2e8f0', background: form.accesSysteme ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'left' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                    <Key size={20} style={{ color: form.accesSysteme ? '#2563eb' : '#94a3b8' }} />
                                                    <span style={{ fontWeight: 800, fontSize: '15px', color: form.accesSysteme ? '#2563eb' : '#334155' }}>Avec accès</span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>Le membre pourra se connecter et rejoindre son interface selon le rôle.</p>
                                            </button>
                                        </div>

                                        <div style={{ padding: '16px 18px', background: '#eff6ff', borderRadius: '18px', border: '1px solid #bfdbfe', display: 'flex', gap: '10px' }}>
                                            <Info size={16} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: '2px' }} />
                                            <p style={{ margin: 0, fontSize: '13px', color: '#1d4ed8', lineHeight: 1.6 }}>
                                                Interface prévue : <strong>{selectedInterface.interfaceLabel}</strong> • destination <strong>{selectedInterface.redirectPath}</strong>.
                                            </p>
                                        </div>

                                        <AnimatePresence>
                                            {form.accesSysteme && (
                                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px' }}>
                                                        <div>
                                                            <label style={labelStyle}>Nom d'utilisateur *</label>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <input value={form.nom_utilisateur} onChange={(e) => ch('nom_utilisateur', e.target.value)} placeholder="Ex: ma.camara" style={{ ...inputStyle, flex: 1 }} />
                                                                <button type="button" onClick={generateLogin} style={{ padding: '0 14px', borderRadius: '14px', border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 800, color: '#2563eb', whiteSpace: 'nowrap' }}>Auto</button>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label style={labelStyle}>Mot de passe *</label>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <div style={{ position: 'relative', flex: 1 }}>
                                                                    <input type={showPwd ? 'text' : 'password'} value={form.mot_de_passe} onChange={(e) => ch('mot_de_passe', e.target.value)} placeholder="Mot de passe" style={{ ...inputStyle, paddingRight: '42px' }} />
                                                                    <button type="button" onClick={() => setShowPwd((prev) => !prev)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                                                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                                                    </button>
                                                                </div>
                                                                <button type="button" onClick={generatePassword} style={{ padding: '0 14px', borderRadius: '14px', border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 800, color: '#2563eb', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <RefreshCw size={14} /> Générer
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 'recap' && (
                            <motion.div key="recap" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
                                <div style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 24px 54px rgba(15,23,42,0.06)' }}>
                                    {sectionHdr(<CheckCircle2 size={20} />, 'Validation finale du dossier', 'Vérifiez toutes les données avant d’enregistrer le membre.', 'linear-gradient(135deg, #dcfce7, #dbeafe)')}
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '18px', background: 'linear-gradient(135deg, #f8fafc, white)', borderRadius: '22px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: selectedRoleConfig?.color ? `linear-gradient(135deg, ${selectedRoleConfig.color}, ${selectedRoleConfig.color}cc)` : 'linear-gradient(135deg, #64748b, #475569)', display: 'grid', placeItems: 'center', color: 'white', fontSize: '22px', fontWeight: 900, flexShrink: 0 }}>
                                                {(form.prenom[0] || '').toUpperCase()}{(form.nom[0] || '').toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{form.prenom || 'Prénom'} {form.nom || 'Nom'}</h3>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ padding: '5px 10px', borderRadius: '999px', background: selectedRoleConfig?.bg || '#f1f5f9', fontSize: '12px', fontWeight: 800, color: selectedRoleConfig?.color || '#64748b' }}>{selectedRoleConfig?.label || 'Rôle à définir'}</span>
                                                    {form.roles_secondaires.map((rs) => {
                                                        const rsCfg = ROLES_CONFIG.find((r) => r.value === rs);
                                                        return <span key={rs} style={{ padding: '5px 10px', borderRadius: '999px', background: rsCfg?.bg || '#f1f5f9', fontSize: '12px', fontWeight: 800, color: rsCfg?.color || '#64748b' }}>+ {rsCfg?.label || rs}</span>;
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                            {[
                                                { label: 'Sexe', value: form.sexe === 'M' ? 'Masculin' : 'Féminin' },
                                                { label: 'Téléphone', value: form.telephone || '—' },
                                                { label: 'Email', value: form.email || '—' },
                                                { label: 'Date de naissance', value: form.date_naissance || '—' },
                                                { label: 'Lieu de naissance', value: form.lieu_naissance || '—' },
                                                { label: 'CNI', value: form.numero_cni || '—' },
                                                { label: 'Type de contrat', value: form.type_contrat },
                                                { label: 'Date d’embauche', value: form.date_embauche || '—' },
                                                { label: 'Salaire de base', value: form.salaire_base > 0 ? `${new Intl.NumberFormat('fr-FR').format(form.salaire_base)} GNF/mois` : '—' },
                                                { label: 'Prime mensuelle', value: form.prime_mensuelle > 0 ? `${new Intl.NumberFormat('fr-FR').format(form.prime_mensuelle)} GNF` : '—' },
                                                { label: 'Mode paiement', value: form.mode_paiement_salaire },
                                                { label: 'Accès système', value: form.accesSysteme ? form.nom_utilisateur || 'Login auto' : 'Aucun accès' },
                                                { label: 'Interface assignée', value: form.accesSysteme ? `${selectedInterface.interfaceLabel}` : 'Visible RH uniquement' },
                                                { label: 'Route cible', value: form.accesSysteme ? selectedInterface.redirectPath : 'Aucune' },
                                            ].map(({ label, value }) => (
                                                <div key={label} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '18px', border: '1px solid #eef2f7' }}>
                                                    <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        {step !== 'role' ? (
                            <button onClick={() => setStep(step === 'identite' ? 'role' : step === 'contrat' ? 'identite' : step === 'acces' ? 'contrat' : 'acces')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '13px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '14px', color: '#334155' }}>
                                <ArrowLeft size={16} /> Retour
                            </button>
                        ) : <div />}

                        {step === 'role' && (
                            <button disabled={!form.role} onClick={() => setStep('identite')} style={{ ...nextButtonStyle, opacity: form.role ? 1 : 0.55, cursor: form.role ? 'pointer' : 'not-allowed' }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        )}
                        {step === 'identite' && (
                            <button disabled={!form.nom || !form.prenom} onClick={() => setStep('contrat')} style={{ ...nextButtonStyle, opacity: form.nom && form.prenom ? 1 : 0.55, cursor: form.nom && form.prenom ? 'pointer' : 'not-allowed' }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        )}
                        {step === 'contrat' && (
                            <button onClick={() => setStep('acces')} style={nextButtonStyle}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        )}
                        {step === 'acces' && (
                            <button onClick={() => setStep('recap')} style={nextButtonStyle}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        )}
                        {step === 'recap' && (
                            <button onClick={handleSubmit} disabled={loading} style={{ ...nextButtonStyle, background: loading ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)', boxShadow: loading ? 'none' : '0 14px 30px rgba(16,185,129,0.24)' }}>
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                {loading ? 'Enregistrement…' : 'Confirmer l’embauche'}
                            </button>
                        )}
                    </div>
                </div>

                <aside style={{ position: 'sticky', top: '118px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', padding: '22px', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', backdropFilter: 'blur(18px)' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Résumé instantané</p>
                        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: selectedRoleConfig?.color ? `linear-gradient(135deg, ${selectedRoleConfig.color}, ${selectedRoleConfig.color}cc)` : 'linear-gradient(135deg, #cbd5e1, #94a3b8)', display: 'grid', placeItems: 'center', color: 'white', fontSize: '18px', fontWeight: 900 }}>
                                {(form.prenom[0] || 'N').toUpperCase()}{(form.nom[0] || 'P').toUpperCase()}
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>{form.prenom || 'Nouveau'} {form.nom || 'personnel'}</h3>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>{selectedRoleConfig?.label || 'Rôle non défini'}</p>
                            </div>
                        </div>

                        <div style={{ marginTop: '18px', display: 'grid', gap: '10px' }}>
                            {[
                                { label: 'Rôle principal', value: selectedRoleConfig?.label || 'À sélectionner' },
                                { label: 'Rôles secondaires', value: form.roles_secondaires.length > 0 ? form.roles_secondaires.length.toString() : 'Aucun' },
                                { label: 'Accès système', value: form.accesSysteme ? 'Activé' : 'Désactivé' },
                                { label: 'Interface', value: selectedInterface.interfaceLabel },
                                { label: 'Redirection', value: selectedInterface.redirectPath },
                            ].map((item) => (
                                <div key={item.label} style={{ padding: '12px 14px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #eef2f7' }}>
                                    <p style={{ margin: 0, fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>{item.label}</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#0f172a', fontWeight: 800 }}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', padding: '22px', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', backdropFilter: 'blur(18px)' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lecture RH</p>
                        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ padding: '14px', borderRadius: '18px', background: selectedRoleConfig?.hasAccess ? '#eff6ff' : '#fff7ed' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{selectedRoleConfig?.hasAccess ? 'Compte possible' : 'RH uniquement'}</p>
                                <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.7, color: '#475569' }}>
                                    {selectedRoleConfig?.hasAccess ? 'Ce rôle peut bénéficier d’un accès système complet selon les informations saisies.' : 'Ce rôle reste principalement administratif/RH sans portail de connexion par défaut.'}
                                </p>
                            </div>
                            <div style={{ padding: '14px', borderRadius: '18px', background: '#f8fafc' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>Coût mensuel estimé</p>
                                <p style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>{new Intl.NumberFormat('fr-FR').format(monthlyCost)} GNF</p>
                            </div>
                        </div>
                    </div>
                </aside>
            </section>

            <style dangerouslySetInnerHTML={{ __html: `
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            ` }} />
        </div>
    );
}
