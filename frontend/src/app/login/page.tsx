'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles, AlertTriangle, BadgeCheck, Users, Briefcase } from 'lucide-react';
import api, { API_BASE_URL } from '@/lib/api';

export default function LoginPage() {
    const [identifiant, setIdentifiant] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const { etablissementNom, etablissementLogo } = useApp();

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const logoSrc = useMemo(
        () => etablissementLogo ? (etablissementLogo.startsWith('http') ? etablissementLogo : `${API_BASE}${etablissementLogo}`) : null,
        [API_BASE, etablissementLogo]
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setError('');
        setLoading(true);

        try {
            const res = await api.post('/api/auth/login', {
                identifiant: identifiant.trim(),
                mot_de_passe: password,
            });
            login(res.data.token, res.data.user);
        } catch (err: unknown) {
            // « Identifiants incorrects » s'affichait AUSSI quand le serveur ne
            // répondait pas : origine CORS refusée, backend arrêté, mauvais
            // port. On cherche alors son mot de passe pendant que la panne est
            // ailleurs. Un problème de réseau doit se dire comme tel.
            const e = err as {
                response?: { status?: number; data?: { detail?: string } };
                code?: string;
            };
            const statut = e?.response?.status;
            const detail = e?.response?.data?.detail;

            if (!e?.response) {
                setError(
                    e?.code === 'ECONNABORTED'
                        ? "Le serveur met trop de temps à répondre. Réessayez dans un instant."
                        : `Serveur injoignable (${API_BASE_URL}). Vérifiez qu'il est démarré.`
                );
            } else if (statut === 401) {
                setError(detail || 'Identifiant ou mot de passe incorrect.');
            } else if (statut === 403) {
                setError(detail || "Ce compte n'a pas accès à l'application.");
            } else if (statut === 429) {
                setError('Trop de tentatives. Patientez une minute avant de réessayer.');
            } else {
                setError(detail || `Le serveur a refusé la connexion (erreur ${statut}).`);
            }
            setLoading(false);
        }
    };

    const canSubmit = identifiant.trim().length > 0 && password.length > 0 && !loading;

    return (
        <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(420px, 0.85fr)', background: '#f8fafc' }}>
            <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0f172a 0%, #111827 52%, #1e3a8a 100%)', color: 'white', padding: '48px clamp(28px, 5vw, 72px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 34%), radial-gradient(circle at bottom right, rgba(16,185,129,0.18), transparent 28%)' }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: 58, height: 58, borderRadius: '18px', background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.14)', display: 'grid', placeItems: 'center', backdropFilter: 'blur(16px)', overflow: 'hidden' }}>
                        {logoSrc ? (
                            <img src={logoSrc} alt="Logo établissement" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <ShieldCheck size={28} />
                        )}
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>Gestion scolaire</p>
                        <h1 style={{ margin: '2px 0 0', fontSize: '28px', fontWeight: 900 }}>SMARTSCHOOL</h1>
                    </div>
                </div>

                <div style={{ position: 'relative', zIndex: 1, maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    <div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            <Sparkles size={14} /> Authentification unifiée
                        </span>
                        <h2 style={{ margin: '20px 0 14px', fontSize: 'clamp(2.5rem, 5vw, 4.2rem)', lineHeight: 1.02, fontWeight: 900, letterSpacing: '-0.04em' }}>
                            Connectez chaque rôle à la bonne interface.
                        </h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.78)', fontSize: '1.05rem', lineHeight: 1.8, maxWidth: '640px' }}>
                            Administration, personnel, enseignants, parents et élèves accèdent désormais à un parcours plus fiable avec redirection métier contrôlée et espaces dédiés selon le rôle.
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                        {[
                            { icon: BadgeCheck, title: 'Chaque école chez elle', text: 'Vos élèves, vos notes, votre comptabilité : rien n\u2019est visible par une autre école.' },
                            { icon: Briefcase, title: 'Votre façon de noter', text: 'Barème, coefficients, mentions, périodes : vous les réglez, le système suit.' },
                            { icon: Users, title: 'Toute l\u2019école connectée', text: 'Direction, enseignants, élèves et parents \u2014 une seule adresse pour tous.' },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.title} style={{ padding: '18px', borderRadius: '20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(14px)' }}>
                                    <div style={{ width: 42, height: 42, borderRadius: '14px', background: 'rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center', marginBottom: '14px' }}>
                                        <Icon size={18} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{item.title}</h3>
                                    <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.7, color: 'rgba(255,255,255,0.72)' }}>{item.text}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255,255,255,0.68)', fontSize: '13px' }}>
                    <span>Sécurité renforcée</span>
                    <span>•</span>
                    <span>Contrôle d’accès par rôle</span>
                    <span>•</span>
                    <span>Parcours premium</span>
                </div>
            </section>

            <section style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} style={{ width: '100%', maxWidth: '480px' }}>
                    <div style={{ marginBottom: '24px' }}>
                        <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3b82f6', fontWeight: 800 }}>Portail sécurisé</p>
                        <h2 style={{ margin: '10px 0 8px', fontSize: '2rem', fontWeight: 900, color: '#0f172a' }}>Connexion</h2>
                        <p style={{ margin: 0, color: '#64748b', lineHeight: 1.7 }}>Entrez vos identifiants. Vous serez dirigé automatiquement vers l\u2019espace de votre établissement.</p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(226,232,240,0.92)', boxShadow: '0 30px 70px rgba(15, 23, 42, 0.08)', borderRadius: '28px', padding: '28px', backdropFilter: 'blur(18px)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <AnimatePresence>
                            {error && (
                                <motion.div initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -10, height: 0 }} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 16px', borderRadius: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '14px', lineHeight: 1.6 }}>
                                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 700, color: '#334155' }}>Identifiant, email ou téléphone</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    value={identifiant}
                                    onChange={(e) => setIdentifiant(e.target.value)}
                                    placeholder="Ex: admin.ecole"
                                    required
                                    style={{ width: '100%', borderRadius: '16px', border: '1px solid #dbe4f0', background: '#f8fafc', color: '#0f172a', padding: '15px 16px 15px 46px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Mot de passe</label>
                                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Accès réservé</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{ width: '100%', borderRadius: '16px', border: '1px solid #dbe4f0', background: '#f8fafc', color: '#0f172a', padding: '15px 48px 15px 46px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <button type="button" onClick={() => setShowPassword((prev) => !prev)} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'grid', placeItems: 'center' }}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            style={{ marginTop: '6px', width: '100%', border: 'none', borderRadius: '18px', padding: '16px 18px', background: canSubmit ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#94a3b8', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '15px', fontWeight: 800, cursor: canSubmit ? 'pointer' : 'not-allowed', boxShadow: canSubmit ? '0 16px 36px rgba(37, 99, 235, 0.32)' : 'none' }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" /> Connexion en cours...
                                </>
                            ) : (
                                <>
                                    Accéder à mon espace <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                        <div style={{ padding: '16px 18px', borderRadius: '18px', background: 'linear-gradient(135deg,#eff6ff,#f8fafc)', border: '1px solid #bfdbfe' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#1d4ed8', letterSpacing: '0.08em' }}>Votre école n’est pas encore sur SmartSchool ?</p>
                            <p style={{ margin: '8px 0 12px', fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>
                                Inscrivez votre établissement en trois étapes. Vous en devenez l’administrateur et créez ensuite vos enseignants, élèves, parents et personnels.
                            </p>
                            <Link href="/inscription" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '11px', background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: 'white', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
                                Inscrire mon établissement <ArrowRight size={15} />
                            </Link>
                        </div>
                        {/* Enseignants et parents : espace distinct, parce qu'eux
                            seuls peuvent relever de plusieurs ecoles et ont donc
                            besoin du code de l'etablissement. */}
                        <Link href="/login/ecole" style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: '12px', padding: '14px 16px', borderRadius: '14px',
                            background: 'white', border: '1px solid #e2e8f0', textDecoration: 'none',
                        }}>
                            <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                                    Vous êtes enseignant ou parent d’élève ?
                                </span>
                                <span style={{ display: 'block', fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                                    Connectez-vous à l’espace de votre établissement
                                </span>
                            </span>
                            <span style={{ flexShrink: 0, color: '#2563eb' }}><ArrowRight size={18} /></span>
                        </Link>
                        <p style={{ margin: 0, textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                            SmartSchool • Système d’information scolaire sécurisé
                        </p>
                    </div>
                </motion.div>
            </section>

            <style dangerouslySetInnerHTML={{ __html: `
                @media (max-width: 1080px) {
                    body { overflow-x: hidden; }
                    div[style*="grid-template-columns: minmax(0, 1.15fr) minmax(420px, 0.85fr)"] {
                        grid-template-columns: 1fr !important;
                    }
                }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            ` }} />
        </div>
    );
}
