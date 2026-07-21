'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import {
    ArrowLeft, UserPlus, CheckCircle2, Loader2, Crown, Building2,
    GraduationCap, Shield, DollarSign, BookOpen, Monitor, UserCheck,
    Key, Lock, Users, Star, Briefcase, ChevronRight, Copy, Check,
    Eye, EyeOff, Plus, X, Info
} from 'lucide-react';

// ─── Rôles disponibles ──────────────────────────────────────────────────────
const ROLES_CONFIG = [
    { value: 'FONDATEUR',       label: 'Fondateur',            icon: Crown,        color: '#7c3aed', bg: '#f5f3ff', hasAccess: true,  desc: 'Propriétaire et fondateur de l\'établissement' },
    { value: 'DG',              label: 'Directeur Général',    icon: Building2,    color: '#1d4ed8', bg: '#eff6ff', hasAccess: true,  desc: 'Direction générale de l\'établissement' },
    { value: 'DIRECTEUR_NIVEAU',label: 'Directeur de Niveau',  icon: GraduationCap,color: '#0369a1', bg: '#f0f9ff', hasAccess: true,  desc: 'Responsable d\'un cycle ou niveau scolaire' },
    { value: 'ADMIN',           label: 'Administrateur',       icon: Shield,       color: '#0f766e', bg: '#f0fdfa', hasAccess: true,  desc: 'Accès complet à l\'administration' },
    { value: 'COMPTABLE',       label: 'Comptable',            icon: DollarSign,   color: '#b45309', bg: '#fffbeb', hasAccess: true,  desc: 'Gestion financière et comptabilité' },
    { value: 'BIBLIOTHECAIRE',  label: 'Bibliothécaire',       icon: BookOpen,     color: '#7e22ce', bg: '#faf5ff', hasAccess: true,  desc: 'Gestion de la bibliothèque scolaire' },
    { value: 'INFORMATICIEN',   label: 'Informaticien',        icon: Monitor,      color: '#0284c7', bg: '#f0f9ff', hasAccess: true,  desc: 'Support technique et informatique' },
    { value: 'SURVEILLANT',     label: 'Surveillant',          icon: UserCheck,    color: '#16a34a', bg: '#f0fdf4', hasAccess: true,  desc: 'Surveillance et discipline scolaire' },
    { value: 'OPERATEUR',       label: 'Opérateur / Secrétaire', icon: Key,        color: '#475569', bg: '#f8fafc', hasAccess: true,  desc: 'Opérations de saisie et secrétariat' },
    { value: 'AGENT_ENTRETIEN', label: 'Agent d\'Entretien',   icon: Briefcase,    color: '#92400e', bg: '#fff7ed', hasAccess: false, desc: 'Nettoyage et entretien des locaux' },
    { value: 'GARDIEN',         label: 'Gardien',              icon: Lock,         color: '#374151', bg: '#f9fafb', hasAccess: false, desc: 'Sécurité et gardiennage' },
    { value: 'CHAUFFEUR',       label: 'Chauffeur',            icon: Star,         color: '#0369a1', bg: '#f0f9ff', hasAccess: false, desc: 'Transport scolaire' },
    { value: 'AUTRE',           label: 'Autre Personnel',      icon: Users,        color: '#6b7280', bg: '#f9fafb', hasAccess: false, desc: 'Autre catégorie de personnel' },
];

type Step = 'role' | 'identite' | 'contrat' | 'acces' | 'recap';

export default function NouveauPersonnel() {
    const router = useRouter();
    const { etablissementId } = useApp();

    const [step, setStep] = useState<Step>('role');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [createdInfo, setCreatedInfo] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const [showPwd, setShowPwd] = useState(false);
    const [rolesSecDropdown, setRolesSecDropdown] = useState(false);

    const [form, setForm] = useState({
        // Rôle
        role: '',
        roles_secondaires: [] as string[],
        // Identité
        nom: '', prenom: '', sexe: 'M',
        telephone: '', email: '',
        date_naissance: '', lieu_naissance: '',
        adresse: '', numero_cni: '',
        // Contrat
        type_contrat: 'PERMANENT',
        date_embauche: '',
        salaire_base: 0, taux_horaire: 0,
        prime_mensuelle: 0, heures_hebdo: 0,
        mode_paiement_salaire: 'ESPECES', rib: '',
        // Accès
        accesSysteme: false,
        nom_utilisateur: '', mot_de_passe: '',
    });

    const selectedRoleConfig = ROLES_CONFIG.find(r => r.value === form.role);

    const ch = (field: string, val: any) => setForm(f => ({ ...f, [field]: val }));

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

    const toggleRoleSecondaire = (r: string) => {
        if (r === form.role) return; // Pas ajouter le rôle principal
        const curr = form.roles_secondaires;
        if (curr.includes(r)) {
            ch('roles_secondaires', curr.filter(x => x !== r));
        } else {
            ch('roles_secondaires', [...curr, r]);
        }
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
            const payload: any = {
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
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Une erreur est survenue.');
        } finally {
            setLoading(false);
        }
    };

    const STEPS: { key: Step; label: string; done: boolean }[] = [
        { key: 'role',     label: 'Rôle',         done: !!form.role },
        { key: 'identite', label: 'Identité',      done: !!(form.nom && form.prenom) },
        { key: 'contrat',  label: 'Contrat & RH',  done: true },
        { key: 'acces',    label: 'Accès Système', done: true },
        { key: 'recap',    label: 'Récapitulatif', done: false },
    ];

    const inputStyle = {
        padding: '11px 14px', borderRadius: '10px',
        border: '1.5px solid #e2e8f0', outline: 'none',
        fontSize: '14px', width: '100%', boxSizing: 'border-box' as const,
        transition: 'border-color 0.2s',
        fontFamily: 'Inter, sans-serif',
    };
    const labelStyle = { fontSize: '13px', fontWeight: 600 as const, color: '#475569', display: 'block' as const, marginBottom: '6px' };
    const sectionHdr = (icon: string, title: string, sub: string, gradient: string) => (
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '14px', background: 'linear-gradient(135deg, #f8fafc, white)' }}>
            <div style={{ padding: '10px', background: gradient, borderRadius: '12px', fontSize: '20px', lineHeight: 1 }}>{icon}</div>
            <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{title}</h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{sub}</p>
            </div>
        </div>
    );

    // ─── SUCCESS ────────────────────────────────────────────────────────────
    if (success && createdInfo) {
        const cfg = ROLES_CONFIG.find(r => r.value === createdInfo.role);
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ textAlign: 'center', padding: '40px 24px', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                        <CheckCircle2 size={72} style={{ color: '#10b981', margin: '0 auto 20px' }} />
                    </motion.div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                        {createdInfo.prenom} {createdInfo.nom}
                    </h2>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '99px', background: cfg?.bg || '#f1f5f9', marginBottom: '24px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: cfg?.color || '#64748b' }}>{cfg?.label || createdInfo.role}</span>
                    </div>
                    <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '14px' }}>
                        Le membre a été ajouté avec succès à l'équipe.
                    </p>

                    {createdInfo.nom_utilisateur && (
                        <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '14px', padding: '20px', marginBottom: '24px', textAlign: 'left' }}>
                            <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#166534' }}>🔑 Identifiants système générés</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', color: '#374151' }}>Login :</span>
                                    <code style={{ fontSize: '14px', fontWeight: 700, color: '#166534', background: '#bbf7d0', padding: '2px 8px', borderRadius: '6px' }}>{createdInfo.nom_utilisateur}</code>
                                </div>
                                {createdInfo.mot_de_passe_clair && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '13px', color: '#374151' }}>Mot de passe :</span>
                                        <code style={{ fontSize: '14px', fontWeight: 700, color: '#166534', background: '#bbf7d0', padding: '2px 8px', borderRadius: '6px' }}>{createdInfo.mot_de_passe_clair}</code>
                                    </div>
                                )}
                            </div>
                            <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#16a34a', fontStyle: 'italic' }}>
                                ⚠️ Notez ces identifiants — le mot de passe ne sera plus visible après cette page.
                            </p>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {createdInfo.nom_utilisateur && (
                            <button onClick={copyCredentials}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', borderRadius: '10px', border: '1px solid #d1fae5', background: '#f0fdf4', color: '#166534', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copié !' : 'Copier les identifiants'}
                            </button>
                        )}
                        <button onClick={() => { setSuccess(false); setCreatedInfo(null); setForm({ role: '', roles_secondaires: [], nom: '', prenom: '', sexe: 'M', telephone: '', email: '', date_naissance: '', lieu_naissance: '', adresse: '', numero_cni: '', type_contrat: 'PERMANENT', date_embauche: '', salaire_base: 0, taux_horaire: 0, prime_mensuelle: 0, heures_hebdo: 0, mode_paiement_salaire: 'ESPECES', rib: '', accesSysteme: false, nom_utilisateur: '', mot_de_passe: '' }); setStep('role'); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}>
                            <UserPlus size={16} /> Nouveau recrutement
                        </button>
                        <Link href="/personnel"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#374151', fontWeight: 600, textDecoration: 'none', fontSize: '14px' }}>
                            Voir l'annuaire
                        </Link>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div style={{ maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* ─── HEADER ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/personnel"
                    style={{ padding: '10px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>Nouveau Recrutement</h1>
                    <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '14px' }}>Renseignez le dossier complet du nouvel membre du personnel.</p>
                </div>
            </div>

            {/* ─── STEPPER ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
                {STEPS.map((s, i) => {
                    const isActive = s.key === step;
                    const isPast = STEPS.findIndex(x => x.key === step) > i;
                    return (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={() => { if (isPast || s.key === step) setStep(s.key); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 14px', borderRadius: '99px', border: 'none',
                                    cursor: isPast || isActive ? 'pointer' : 'not-allowed',
                                    background: isActive ? '#3b82f6' : isPast ? '#f0fdf4' : 'white',
                                    color: isActive ? 'white' : isPast ? '#16a34a' : '#94a3b8',
                                    fontWeight: 600, fontSize: '13px',
                                    transition: 'all 0.2s',
                                    boxShadow: isActive ? '0 4px 12px rgba(59,130,246,0.3)' : 'none',
                                    whiteSpace: 'nowrap'
                                }}>
                                <span style={{
                                    width: '20px', height: '20px', borderRadius: '50%',
                                    background: isActive ? 'rgba(255,255,255,0.3)' : isPast ? '#16a34a' : '#e2e8f0',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '11px', fontWeight: 800, color: isActive ? 'white' : isPast ? 'white' : '#94a3b8',
                                    flexShrink: 0
                                }}>
                                    {isPast ? '✓' : i + 1}
                                </span>
                                {s.label}
                            </button>
                            {i < STEPS.length - 1 && (
                                <div style={{ width: '20px', height: '2px', background: isPast ? '#bbf7d0' : '#e2e8f0', borderRadius: '2px' }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {error && (
                <div style={{ padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#b91c1c', fontSize: '14px', fontWeight: 500 }}>
                    ⚠️ {error}
                </div>
            )}

            <AnimatePresence mode="wait">
                {/* ═══════════════════════════════════════════════════════════════════
                   ÉTAPE 1 : CHOIX DU RÔLE
                   ═══════════════════════════════════════════════════════════════════ */}
                {step === 'role' && (
                    <motion.div key="role" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                        <div className="card" style={{ overflow: 'visible' }}>
                            {sectionHdr('🎭', 'Sélection du Rôle Principal', 'Quel poste va occuper ce membre du personnel ?', 'linear-gradient(135deg, #7c3aed22, #3b82f622)')}
                            <div style={{ padding: '24px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
                                    {ROLES_CONFIG.map(r => {
                                        const Icon = r.icon;
                                        const isSelected = form.role === r.value;
                                        return (
                                            <motion.button
                                                key={r.value}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => ch('role', r.value)}
                                                style={{
                                                    padding: '16px', borderRadius: '14px', border: '2px solid',
                                                    borderColor: isSelected ? r.color : '#e2e8f0',
                                                    background: isSelected ? r.bg : 'white',
                                                    cursor: 'pointer', textAlign: 'left',
                                                    boxShadow: isSelected ? `0 4px 14px ${r.color}30` : 'none',
                                                    transition: 'all 0.2s'
                                                }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                    <div style={{ padding: '8px', background: isSelected ? r.color : '#f1f5f9', borderRadius: '10px', display: 'inline-flex' }}>
                                                        <Icon size={18} style={{ color: isSelected ? 'white' : '#64748b' }} />
                                                    </div>
                                                    {!r.hasAccess && (
                                                        <span style={{ fontSize: '10px', padding: '2px 6px', background: '#fef9c3', color: '#854d0e', borderRadius: '4px', fontWeight: 600 }}>Sans accès</span>
                                                    )}
                                                    {isSelected && (
                                                        <CheckCircle2 size={18} style={{ color: r.color }} />
                                                    )}
                                                </div>
                                                <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 700, color: isSelected ? r.color : '#0f172a' }}>{r.label}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>{r.desc}</p>
                                            </motion.button>
                                        );
                                    })}
                                </div>

                                {/* Rôles secondaires */}
                                {form.role && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                                            Rôles secondaires (cumul de responsabilités) :
                                        </p>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {ROLES_CONFIG.filter(r => r.value !== form.role).map(r => {
                                                const isChosen = form.roles_secondaires.includes(r.value);
                                                return (
                                                    <button key={r.value} onClick={() => toggleRoleSecondaire(r.value)}
                                                        style={{
                                                            padding: '5px 12px', borderRadius: '99px',
                                                            border: '1.5px solid',
                                                            borderColor: isChosen ? r.color : '#e2e8f0',
                                                            background: isChosen ? r.bg : 'white',
                                                            color: isChosen ? r.color : '#64748b',
                                                            cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                                            transition: 'all 0.15s'
                                                        }}>
                                                        {isChosen ? '✓ ' : '+ '}{r.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button disabled={!form.role} onClick={() => setStep('identite')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '12px 24px', borderRadius: '12px', border: 'none',
                                    background: form.role ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#e2e8f0',
                                    color: form.role ? 'white' : '#94a3b8',
                                    fontWeight: 700, cursor: form.role ? 'pointer' : 'not-allowed', fontSize: '14px',
                                    boxShadow: form.role ? '0 4px 14px rgba(59,130,246,0.4)' : 'none'
                                }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                   ÉTAPE 2 : IDENTITÉ
                   ═══════════════════════════════════════════════════════════════════ */}
                {step === 'identite' && (
                    <motion.div key="identite" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                        <div className="card" style={{ overflow: 'visible' }}>
                            {sectionHdr('🪪', 'Informations Personnelles', 'État civil et coordonnées du membre', 'linear-gradient(135deg, #10b98122, #3b82f622)')}
                            <div style={{ padding: '24px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Nom de famille *</label>
                                        <input value={form.nom} onChange={e => ch('nom', e.target.value)} required placeholder="Ex: CAMARA" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Prénom(s) *</label>
                                        <input value={form.prenom} onChange={e => ch('prenom', e.target.value)} required placeholder="Ex: Mariama" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Sexe *</label>
                                        <select value={form.sexe} onChange={e => ch('sexe', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                            <option value="M">Masculin</option>
                                            <option value="F">Féminin</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Téléphone</label>
                                        <input value={form.telephone} onChange={e => ch('telephone', e.target.value)} placeholder="Ex: 622 00 00 00" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={labelStyle}>Email (optionnel)</label>
                                        <input value={form.email} onChange={e => ch('email', e.target.value)} type="email" placeholder="contact@ecole.com" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Date de naissance</label>
                                        <input type="date" value={form.date_naissance} onChange={e => ch('date_naissance', e.target.value)} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Lieu de naissance</label>
                                        <input value={form.lieu_naissance} onChange={e => ch('lieu_naissance', e.target.value)} placeholder="Conakry, Guinée" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Numéro CNI / Passeport</label>
                                        <input value={form.numero_cni} onChange={e => ch('numero_cni', e.target.value)} placeholder="N° Pièce d'identité" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={labelStyle}>Adresse de résidence</label>
                                        <input value={form.adresse} onChange={e => ch('adresse', e.target.value)} placeholder="Quartier, Rue, N°..." style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                            <button onClick={() => setStep('role')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                                <ArrowLeft size={16} /> Retour
                            </button>
                            <button disabled={!form.nom || !form.prenom} onClick={() => setStep('contrat')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', border: 'none', background: form.nom && form.prenom ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : '#e2e8f0', color: form.nom && form.prenom ? 'white' : '#94a3b8', fontWeight: 700, cursor: form.nom && form.prenom ? 'pointer' : 'not-allowed', fontSize: '14px', boxShadow: form.nom && form.prenom ? '0 4px 14px rgba(59,130,246,0.4)' : 'none' }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                   ÉTAPE 3 : CONTRAT & RÉMUNÉRATION
                   ═══════════════════════════════════════════════════════════════════ */}
                {step === 'contrat' && (
                    <motion.div key="contrat" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                        <div className="card" style={{ overflow: 'visible' }}>
                            {sectionHdr('📄', 'Contrat & Rémunération', 'Détails contractuels, salaire et mode de paiement', 'linear-gradient(135deg, #f59e0b22, #3b82f622)')}
                            <div style={{ padding: '24px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={labelStyle}>Type de contrat</label>
                                        <select value={form.type_contrat} onChange={e => ch('type_contrat', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                            <option value="PERMANENT">PERMANENT</option>
                                            <option value="CONTRACTUEL">CONTRACTUEL</option>
                                            <option value="VACATAIRE">VACATAIRE</option>
                                            <option value="STAGE">STAGE</option>
                                            <option value="JOURNALIER">JOURNALIER</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Date d'embauche</label>
                                        <input type="date" value={form.date_embauche} onChange={e => ch('date_embauche', e.target.value)} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>💵 Salaire Mensuel de Base (GNF)</label>
                                        <input type="number" min="0" value={form.salaire_base} onChange={e => ch('salaire_base', parseFloat(e.target.value) || 0)} placeholder="0" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>⏰ Taux Horaire (GNF/heure)</label>
                                        <input type="number" min="0" value={form.taux_horaire} onChange={e => ch('taux_horaire', parseFloat(e.target.value) || 0)} placeholder="0" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>🎁 Prime Mensuelle Fixe (GNF)</label>
                                        <input type="number" min="0" value={form.prime_mensuelle} onChange={e => ch('prime_mensuelle', parseFloat(e.target.value) || 0)} placeholder="0" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>📅 Heures hebdomadaires prévues</label>
                                        <input type="number" min="0" value={form.heures_hebdo} onChange={e => ch('heures_hebdo', parseInt(e.target.value) || 0)} placeholder="Ex: 40" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Mode de paiement préféré</label>
                                        <select value={form.mode_paiement_salaire} onChange={e => ch('mode_paiement_salaire', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                            <option value="ESPECES">Espèces</option>
                                            <option value="VIREMENT">Virement bancaire</option>
                                            <option value="MOBILE_MONEY">Mobile Money (Orange / MTN)</option>
                                            <option value="CHEQUE">Chèque</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>RIB / Numéro Mobile</label>
                                        <input value={form.rib} onChange={e => ch('rib', e.target.value)} placeholder="IBAN ou N° de téléphone Mobile Money" style={inputStyle}
                                            onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                                    </div>
                                </div>
                                {/* Résumé salaire */}
                                {(form.salaire_base > 0 || form.prime_mensuelle > 0) && (
                                    <div style={{ marginTop: '20px', padding: '16px', background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                                        <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: '#166534' }}>💰 Coût mensuel estimé</p>
                                        <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#166534' }}>
                                            {new Intl.NumberFormat('fr-FR').format(form.salaire_base + form.prime_mensuelle)} GNF/mois
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                            <button onClick={() => setStep('identite')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                                <ArrowLeft size={16} /> Retour
                            </button>
                            <button onClick={() => setStep('acces')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                   ÉTAPE 4 : ACCÈS SYSTÈME
                   ═══════════════════════════════════════════════════════════════════ */}
                {step === 'acces' && (
                    <motion.div key="acces" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                        <div className="card" style={{ overflow: 'visible' }}>
                            {sectionHdr('🔐', 'Accès au Système', 'Définissez si ce membre aura accès à la plateforme SmartSchool', 'linear-gradient(135deg, #fbbf2422, #3b82f622)')}
                            <div style={{ padding: '24px' }}>
                                {/* Toggle accès */}
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                    <button
                                        onClick={() => ch('accesSysteme', false)}
                                        style={{
                                            flex: 1, padding: '18px', borderRadius: '14px', border: '2px solid',
                                            borderColor: !form.accesSysteme ? '#ef4444' : '#e2e8f0',
                                            background: !form.accesSysteme ? '#fef2f2' : 'white',
                                            cursor: 'pointer', textAlign: 'left' as const
                                        }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                            <X size={20} style={{ color: !form.accesSysteme ? '#ef4444' : '#94a3b8' }} />
                                            <span style={{ fontWeight: 700, fontSize: '15px', color: !form.accesSysteme ? '#ef4444' : '#374151' }}>Sans accès</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                            Ce membre n'a pas de compte sur la plateforme (agents d'entretien, gardiens, chauffeurs…)
                                        </p>
                                    </button>
                                    <button
                                        onClick={() => { ch('accesSysteme', true); generateLogin(); }}
                                        style={{
                                            flex: 1, padding: '18px', borderRadius: '14px', border: '2px solid',
                                            borderColor: form.accesSysteme ? '#3b82f6' : '#e2e8f0',
                                            background: form.accesSysteme ? '#eff6ff' : 'white',
                                            cursor: 'pointer', textAlign: 'left' as const
                                        }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                            <Key size={20} style={{ color: form.accesSysteme ? '#3b82f6' : '#94a3b8' }} />
                                            <span style={{ fontWeight: 700, fontSize: '15px', color: form.accesSysteme ? '#3b82f6' : '#374151' }}>Avec accès</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                            Ce membre peut se connecter à SmartSchool selon son rôle (Directeurs, Admins, Comptables…)
                                        </p>
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {form.accesSysteme && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                            <div style={{ padding: '14px 16px', background: '#eff6ff', borderRadius: '10px', marginBottom: '20px', display: 'flex', gap: '10px', border: '1px solid #bfdbfe' }}>
                                                <Info size={16} style={{ color: '#1d4ed8', flexShrink: 0, marginTop: '2px' }} />
                                                <p style={{ margin: 0, fontSize: '12px', color: '#1d4ed8', lineHeight: 1.5 }}>
                                                    L'utilisateur se connectera avec son <strong>nom d'utilisateur</strong> (ou son téléphone si configuré) et son <strong>mot de passe</strong>.
                                                    Les permissions dépendent du rôle sélectionné.
                                                </p>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                                <div>
                                                    <label style={labelStyle}>Nom d'utilisateur (login) *</label>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <input
                                                            value={form.nom_utilisateur}
                                                            onChange={e => ch('nom_utilisateur', e.target.value)}
                                                            placeholder="Ex: ma.camara"
                                                            style={{ ...inputStyle, flex: 1 }}
                                                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                                        />
                                                        <button type="button" onClick={generateLogin}
                                                            style={{ padding: '0 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                                                            Auto
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Mot de passe *</label>
                                                    <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                                                        <div style={{ position: 'relative', flex: 1 }}>
                                                            <input
                                                                type={showPwd ? 'text' : 'password'}
                                                                value={form.mot_de_passe}
                                                                onChange={e => ch('mot_de_passe', e.target.value)}
                                                                placeholder="Mot de passe"
                                                                style={{ ...inputStyle, paddingRight: '40px' }}
                                                                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                                                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                                            />
                                                            <button type="button" onClick={() => setShowPwd(!showPwd)}
                                                                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                                                                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                                                            </button>
                                                        </div>
                                                        <button type="button" onClick={generatePassword}
                                                            style={{ padding: '0 12px', borderRadius: '10px', border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#3b82f6', whiteSpace: 'nowrap' }}>
                                                            🎲 Générer
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                            <button onClick={() => setStep('contrat')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                                <ArrowLeft size={16} /> Retour
                            </button>
                            <button onClick={() => setStep('recap')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '14px', boxShadow: '0 4px 14px rgba(59,130,246,0.4)' }}>
                                Continuer <ChevronRight size={18} />
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                   ÉTAPE 5 : RÉCAPITULATIF & VALIDATION
                   ═══════════════════════════════════════════════════════════════════ */}
                {step === 'recap' && (
                    <motion.div key="recap" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
                        <div className="card" style={{ overflow: 'visible' }}>
                            {sectionHdr('✅', 'Récapitulatif du Dossier', 'Vérifiez les informations avant de confirmer l\'embauche', 'linear-gradient(135deg, #10b98122, #3b82f622)')}
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {/* Bloc identité */}
                                {(() => {
                                    const cfg = ROLES_CONFIG.find(r => r.value === form.role);
                                    const Icon = cfg?.icon || Users;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'linear-gradient(135deg, #f8fafc, white)', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: cfg?.color ? `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)` : 'linear-gradient(135deg, #64748b, #475569)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '20px', fontWeight: 800, flexShrink: 0 }}>
                                                {form.prenom[0]}{form.nom[0]}
                                            </div>
                                            <div>
                                                <h3 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{form.prenom} {form.nom}</h3>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <span style={{ padding: '3px 10px', borderRadius: '99px', background: cfg?.bg || '#f1f5f9', fontSize: '12px', fontWeight: 700, color: cfg?.color || '#64748b' }}>
                                                        {cfg?.label || form.role}
                                                    </span>
                                                    {form.roles_secondaires.map(rs => {
                                                        const rsCfg = ROLES_CONFIG.find(r => r.value === rs);
                                                        return <span key={rs} style={{ padding: '3px 10px', borderRadius: '99px', background: rsCfg?.bg || '#f1f5f9', fontSize: '12px', fontWeight: 700, color: rsCfg?.color || '#64748b' }}>+{rsCfg?.label || rs}</span>;
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    {[
                                        { label: 'Sexe', value: form.sexe === 'M' ? 'Masculin' : 'Féminin' },
                                        { label: 'Téléphone', value: form.telephone || '—' },
                                        { label: 'Email', value: form.email || '—' },
                                        { label: 'Date de naissance', value: form.date_naissance || '—' },
                                        { label: 'Lieu de naissance', value: form.lieu_naissance || '—' },
                                        { label: 'CNI', value: form.numero_cni || '—' },
                                        { label: 'Type de contrat', value: form.type_contrat },
                                        { label: 'Date d\'embauche', value: form.date_embauche || '—' },
                                        { label: 'Salaire de base', value: form.salaire_base > 0 ? `${new Intl.NumberFormat('fr-FR').format(form.salaire_base)} GNF/mois` : '—' },
                                        { label: 'Prime mensuelle', value: form.prime_mensuelle > 0 ? `${new Intl.NumberFormat('fr-FR').format(form.prime_mensuelle)} GNF` : '—' },
                                        { label: 'Mode paiement', value: form.mode_paiement_salaire },
                                        { label: 'Accès système', value: form.accesSysteme ? `✅ ${form.nom_utilisateur || 'Login auto'}` : '❌ Aucun accès' },
                                    ].map(({ label, value }) => (
                                        <div key={label} style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                                            <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</p>
                                            <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' }}>
                            <button onClick={() => setStep('acces')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                                <ArrowLeft size={16} /> Retour
                            </button>
                            <button onClick={handleSubmit} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 32px', borderRadius: '12px', border: 'none', background: loading ? '#94a3b8' : 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px', boxShadow: loading ? 'none' : '0 6px 20px rgba(16,185,129,0.4)' }}>
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                {loading ? 'Enregistrement…' : 'Confirmer l\'embauche'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
