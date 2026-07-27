'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles, AlertTriangle, BadgeCheck, Users, Briefcase } from 'lucide-react';
import api from '@/lib/api';

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
            const message = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setError(message || 'Identifiants incorrects');
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
                        <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>Plateforme centralisée</p>
                        <h1 style={{ margin: '2px 0 0', fontSize: '28px', fontWeight: 900 }}>{etablissementNom || 'SMARTSCHOOL'}</h1>
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
                            { icon: BadgeCheck, title: 'Redirection fiable', text: 'Chaque compte rejoint automatiquement son interface réelle.' },
                            { icon: Briefcase, title: 'Rôles métier', text: 'Portails dédiés pour les profils opérationnels importants.' },
                            { icon: Users, title: 'Expérience unifiée', text: 'Une seule page de connexion pour toute la communauté scolaire.' },
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
                        <p style={{ margin: 0, color: '#64748b', lineHeight: 1.7 }}>Entrez votre identifiant et votre mot de passe pour accéder à votre espace de travail.</p>
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
                        <div style={{ padding: '16px 18px', borderRadius: '18px', background: 'white', border: '1px solid #e2e8f0' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.08em' }}>Bon à savoir</p>
                            <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>
                                Les personnels sans accès système ne peuvent pas se connecter tant qu’aucun identifiant n’a été créé pour eux dans le module <strong>Personnel</strong>.
                            </p>
                        </div>
                        <p style={{ margin: 0, textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                            Système d’information sécurisé • {etablissementNom || 'SmartSchool'}
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
