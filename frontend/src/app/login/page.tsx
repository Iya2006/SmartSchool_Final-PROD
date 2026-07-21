'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage() {
    const [identifiant, setIdentifiant] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const { login } = useAuth();
    const { etablissementNom, etablissementLogo } = useApp();
    const router = useRouter();
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
    const logoSrc = etablissementLogo ? (etablissementLogo.startsWith('http') ? etablissementLogo : `${API_BASE}${etablissementLogo}`) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await api.post('/api/auth/login', { identifiant, mot_de_passe: password });
            login(res.data.token, res.data.user);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Identifiants incorrects');
            setLoading(false);
        }
    };

    return (
        <div style={{ 
            minHeight: '100vh', 
            display: 'flex', 
            background: '#f8fafc',
            fontFamily: 'Inter, sans-serif'
        }}>
            {/* Left Side - Brand & Illustration */}
            <div style={{
                flex: '1',
                display: 'none',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '4rem',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                color: 'white',
                position: 'relative',
                overflow: 'hidden'
            }} className="lg-flex">
                {/* Decorative circles */}
                <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
                
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    style={{ position: 'relative', zIndex: 10, maxWidth: '600px' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
                        <div style={{ 
                            width: '48px', height: '48px', 
                            background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
                            borderRadius: '12px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 32px rgba(99,102,241,0.3)'
                        }}>
                            <ShieldCheck size={28} color="white" />
                        </div>
                        <h1 style={{ fontSize: '32px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
                            {etablissementNom || 'SMARTSCHOOL'}
                        </h1>
                    </div>
                    
                    <h2 style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.5rem', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        L'éducation connectée pour l'excellence.
                    </h2>
                    
                    <p style={{ fontSize: '1.125rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: '3rem' }}>
                        Connectez-vous à votre espace centralisé pour gérer la scolarité, la pédagogie, et la comptabilité en toute simplicité.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {[1,2,3,4].map((i) => (
                                <div key={i} style={{ 
                                    width: '32px', height: '32px', borderRadius: '50%', 
                                    background: '#334155', border: '2px solid #0f172a',
                                    marginLeft: i === 1 ? 0 : '-12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '10px'
                                }}>👤</div>
                            ))}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#cbd5e1', fontWeight: 500 }}>
                            Rejoignez +10,000 utilisateurs quotidiens
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Right Side - Login Form */}
            <div style={{
                flex: '1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '2rem',
                position: 'relative'
            }}>
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    style={{ width: '100%', maxWidth: '440px' }}
                >
                    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                        <div style={{ display: 'inline-flex', padding: '8px 16px', background: '#eff6ff', borderRadius: '20px', color: '#2563eb', fontSize: '13px', fontWeight: 600, gap: '6px', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <Sparkles size={14} /> Portail d'Authentification
                        </div>
                        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0', letterSpacing: '-0.5px' }}>
                            Bienvenue sur {etablissementNom || 'SmartSchool'}
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
                            Entrez vos identifiants pour accéder à votre espace
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ 
                        background: 'white', 
                        padding: '2.5rem', 
                        borderRadius: '24px', 
                        boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.05)',
                        border: '1px solid #f1f5f9'
                    }}>
                        <AnimatePresence>
                            {error && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10, height: 0 }} 
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0, y: -10, height: 0 }}
                                    style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 500, marginBottom: '24px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <AlertTriangle size={18} /> {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                                Identifiant, Email ou Téléphone
                            </label>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={identifiant}
                                    onChange={(e) => setIdentifiant(e.target.value)}
                                    placeholder="ex: admin.ecole"
                                    required
                                    style={{
                                        width: '100%', padding: '14px 16px 14px 44px',
                                        background: '#f8fafc', border: '1px solid #e2e8f0',
                                        borderRadius: '12px', fontSize: '15px', color: '#0f172a',
                                        outline: 'none', transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = 'white'; e.target.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.1)'; }}
                                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                                    Mot de passe
                                </label>
                                <a href="#" style={{ fontSize: '13px', color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>
                                    Mot de passe oublié ?
                                </a>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%', padding: '14px 44px',
                                        background: '#f8fafc', border: '1px solid #e2e8f0',
                                        borderRadius: '12px', fontSize: '15px', color: '#0f172a',
                                        outline: 'none', transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.background = 'white'; e.target.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.1)'; }}
                                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                        padding: 0, display: 'flex', alignItems: 'center'
                                    }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading || !identifiant || !password}
                            style={{
                                width: '100%', padding: '16px',
                                background: loading || !identifiant || !password ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                color: 'white', border: 'none', borderRadius: '12px',
                                fontSize: '16px', fontWeight: 600, cursor: loading || !identifiant || !password ? 'not-allowed' : 'pointer',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px',
                                transition: 'all 0.3s',
                                boxShadow: loading || !identifiant || !password ? 'none' : '0 10px 25px -5px rgba(37, 99, 235, 0.4)'
                            }}
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" /> Connexion en cours...
                                </>
                            ) : (
                                <>
                                    Se connecter <ArrowRight size={20} />
                                </>
                            )}
                        </button>
                    </form>
                    
                    <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: '#94a3b8' }}>
                        Système d'Information Sécurisé • {etablissementNom || 'SmartSchool'} v2.0
                    </div>
                </motion.div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @media (min-width: 1024px) {
                    .lg-flex { display: flex !important; }
                }
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}} />
        </div>
    );
}

const AlertTriangle = ({ size = 24, ...props }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
);
