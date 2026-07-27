'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Eye, EyeOff, Loader2, ArrowRight, Shield } from 'lucide-react';
import api from '@/lib/api';

export default function ComptabiliteLogin() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const session = sessionStorage.getItem('comptabilite_auth');
        const token = localStorage.getItem('smartschool_token');
        if (session && token) {
            router.push('/comptabilite/dashboard');
        }
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError("Veuillez remplir tous les champs");
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const res = await api.post('/api/comptabilite/auth', {
                nom_utilisateur: username.trim(),
                mot_de_passe: password.trim()
            });

            if (res.data.success) {
                // Enregistrer toutes les données du comptable dans la session
                sessionStorage.setItem('comptabilite_auth', JSON.stringify(res.data));
                localStorage.setItem('smartschool_token', res.data.token);
                localStorage.setItem('smartschool_user', JSON.stringify({
                    id: res.data.comptable_id,
                    nom: res.data.nom,
                    prenom: res.data.prenom,
                    nom_utilisateur: username.trim(),
                    email: '',
                    telephone: '',
                    role: 'COMPTABLE'
                }));
                router.push('/comptabilite/dashboard');
            } else {
                setError("Identifiants incorrects");
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.detail || "Nom d'utilisateur ou mot de passe incorrect";
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a', // Dark theme background
            backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(5, 150, 105, 0.05) 0%, transparent 40%)',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            boxSizing: 'border-box'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '420px',
                padding: '40px 24px',
                boxSizing: 'border-box'
            }}>
                {/* Main Card */}
                <div style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.7)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '24px',
                    padding: '40px 32px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <div style={{
                            width: '64px', height: '64px',
                            borderRadius: '18px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px',
                            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)'
                        }}>
                            <Shield color="white" size={32} />
                        </div>
                        <h1 style={{
                            color: 'white',
                            fontSize: '24px',
                            fontWeight: '700',
                            margin: '0 0 8px 0',
                            letterSpacing: '-0.5px'
                        }}>
                            Espace Comptabilité
                        </h1>
                        <p style={{
                            color: '#94a3b8',
                            fontSize: '14px',
                            margin: 0
                        }}>
                            Veuillez vous connecter avec vos identifiants
                        </p>
                    </div>

                    {/* Error message */}
                    {error && (
                        <div style={{
                            color: '#f87171',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            marginBottom: '24px',
                            fontSize: '13px',
                            fontWeight: '500',
                            textAlign: 'center',
                            animation: 'shake 0.4s'
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleLogin} style={{ width: '100%' }}>
                        {/* Username */}
                        <div style={{ marginBottom: '20px' }}>
                            <label htmlFor="username" style={{
                                display: 'block',
                                color: '#cbd5e1',
                                fontSize: '13px',
                                fontWeight: '600',
                                marginBottom: '8px'
                            }}>
                                Identifiant / Nom d'utilisateur
                            </label>
                            <div style={{ position: 'relative' }}>
                                <User size={18} style={{
                                    position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                                    color: '#64748b'
                                }} />
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                                    placeholder="Ex: sams"
                                    disabled={isLoading}
                                    autoComplete="username"
                                    style={{
                                        width: '100%',
                                        padding: '14px 16px 14px 44px',
                                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => { e.target.style.borderColor = '#10b981'; e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)'; }}
                                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div style={{ marginBottom: '32px' }}>
                            <label htmlFor="password" style={{
                                display: 'block',
                                color: '#cbd5e1',
                                fontSize: '13px',
                                fontWeight: '600',
                                marginBottom: '8px'
                            }}>
                                Mot de passe
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{
                                    position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                                    color: '#64748b'
                                }} />
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                    placeholder="••••••••"
                                    disabled={isLoading}
                                    autoComplete="current-password"
                                    style={{
                                        width: '100%',
                                        padding: '14px 48px 14px 44px',
                                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => { e.target.style.borderColor = '#10b981'; e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)'; }}
                                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'; e.target.style.boxShadow = 'none'; }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    disabled={isLoading}
                                    style={{
                                        position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: '#64748b', padding: '4px', display: 'flex', alignItems: 'center'
                                    }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '16px',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                border: 'none',
                                borderRadius: '12px',
                                color: 'white',
                                fontSize: '15px',
                                fontWeight: '700',
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                                transition: 'all 0.2s ease',
                                boxSizing: 'border-box'
                            }}
                            onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                                    Connexion...
                                </>
                            ) : (
                                <>
                                    Se connecter
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>

            {/* In-page animations */}
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-4px); }
                    50% { transform: translateX(4px); }
                    75% { transform: translateX(-4px); }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}} />
        </div>
    );
}
