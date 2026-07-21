'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Delete } from 'lucide-react';
import api from '@/lib/api';

export default function ComptabiliteLogin() {
    const router = useRouter();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (pin.length === 6) {
            handleLogin();
        }
    }, [pin]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isLoading) return;
            
            if (e.key >= '0' && e.key <= '9') {
                handleNumberClick(e.key);
            } else if (e.key === 'Backspace') {
                handleDelete();
            } else if (e.key === 'Enter' && pin.length === 6) {
                handleLogin();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, isLoading]);

    const handleLogin = async () => {
        setIsLoading(true);
        setError('');
        try {
            const res = await api.post('/api/comptabilite/auth', { pin });
            if (res.data.success) {
                sessionStorage.setItem('comptabilite_auth', 'true');
                router.push('/comptabilite/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Code PIN incorrect");
            setPin('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleNumberClick = (num: string) => {
        if (pin.length < 6) {
            setPin(prev => prev + num);
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a', // Dark modern background
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '400px',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
            }}>
                <div style={{
                    width: '60px', height: '60px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '24px',
                    boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.5)'
                }}>
                    <Lock color="white" size={32} />
                </div>
                
                <h1 style={{ color: 'white', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
                    Portail Comptabilité
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '32px' }}>
                    Entrez votre code PIN pour accéder
                </p>

                {/* PIN Dots */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                        <div key={index} style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            border: '2px solid',
                            borderColor: pin.length > index ? '#10b981' : '#334155',
                            backgroundColor: pin.length > index ? '#10b981' : 'transparent',
                            transition: 'all 0.2s ease'
                        }} />
                    ))}
                </div>

                {error && (
                    <div style={{
                        color: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        padding: '12px 20px',
                        borderRadius: '8px',
                        marginBottom: '24px',
                        fontSize: '14px',
                        fontWeight: '500',
                        animation: 'shake 0.5s'
                    }}>
                        {error}
                    </div>
                )}

                {/* Numpad */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '20px',
                    width: '100%',
                    maxWidth: '280px'
                }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                            key={num}
                            onClick={() => handleNumberClick(num.toString())}
                            disabled={isLoading}
                            style={{
                                width: '70px', height: '70px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                fontSize: '28px',
                                fontWeight: '300',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.1s ease',
                                margin: '0 auto'
                            }}
                            onMouseDown={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                            onMouseUp={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                        >
                            {num}
                        </button>
                    ))}
                    
                    <div /> {/* Empty space */}
                    
                    <button
                        onClick={() => handleNumberClick('0')}
                        disabled={isLoading}
                        style={{
                            width: '70px', height: '70px',
                            borderRadius: '50%',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white',
                            fontSize: '28px',
                            fontWeight: '300',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.1s ease',
                            margin: '0 auto'
                        }}
                    >
                        0
                    </button>
                    
                    <button
                        onClick={handleDelete}
                        disabled={isLoading || pin.length === 0}
                        style={{
                            width: '70px', height: '70px',
                            borderRadius: '50%',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: pin.length > 0 ? '#94a3b8' : 'rgba(255,255,255,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: pin.length > 0 ? 'pointer' : 'default',
                            margin: '0 auto'
                        }}
                    >
                        <Delete size={28} />
                    </button>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    50% { transform: translateX(5px); }
                    75% { transform: translateX(-5px); }
                }
            `}} />
        </div>
    );
}
