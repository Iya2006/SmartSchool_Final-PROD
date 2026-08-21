'use client';

/**
 * TopbarUserMenu — Avatar + dropdown de profil utilisateur (Paramètres + Déconnexion).
 * Extrait de Topbar.tsx pour respecter la règle : 1 composant = 1 responsabilité.
 *
 * refactor(topbar): extraire UserMenu en sous-composant autonome
 */

import { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, ChevronDown, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TopbarUserMenu() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    // Statut « en ligne » porté par une pastille sur l'avatar (remplace le badge
    // « En ligne — à jour » du header, qui masquait l'année en cours).
    const [online, setOnline] = useState(true);
    useEffect(() => {
        setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    // Fermer au clic extérieur
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const displayName = user ? `${user.prenom} ${user.nom}` : 'Administrateur';
    const displayRole = user?.role || 'Superviseur ERP';
    const initials    = user ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}` : 'AD';

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            {/* Bouton profil */}
            <button
                id="topbar-user-menu-btn"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '6px 8px', borderRadius: '12px',
                    transition: 'background 0.2s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                title={displayName}
            >
                {/* Avatar initiales + pastille de statut en ligne */}
                <div style={{
                    position: 'relative',
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '13px', fontWeight: 800,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    flexShrink: 0,
                }}>
                    {initials}
                    <span
                        title={online ? 'En ligne' : 'Hors ligne'}
                        style={{
                            position: 'absolute', bottom: '-2px', right: '-2px',
                            width: '11px', height: '11px', borderRadius: '50%',
                            background: online ? '#22c55e' : '#94a3b8',
                            border: '2px solid var(--bg-elevated, #ffffff)',
                        }}
                    />
                </div>
                <ChevronDown size={13} color="var(--text-muted)" style={{
                    transition: 'transform 0.2s ease',
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                }} />
            </button>

            {/* Menu déroulant */}
            {dropdownOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: '220px', background: 'white',
                    borderRadius: '14px', border: '1px solid var(--border-light)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                    overflow: 'hidden', zIndex: 1000,
                    animation: 'fadeIn 0.15s ease',
                }}>
                    <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>

                    {/* En-tête avec info utilisateur */}
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', background: '#f8fafc' }}>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {displayName}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                            {user?.email || user?.telephone || ''}
                        </p>
                        {/* Statut en ligne écrit directement dans le menu. */}
                        <p style={{ margin: '6px 0 0', fontSize: '12px', fontWeight: 700, color: online ? '#059669' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: online ? '#22c55e' : '#94a3b8', display: 'inline-block' }} />
                            {online ? 'En ligne' : 'Hors ligne'}
                        </p>
                    </div>

                    {/* Items du menu */}
                    <div style={{ padding: '6px' }}>
                        <button
                            id="topbar-profile-btn"
                            onClick={() => { setDropdownOpen(false); router.push('/profil'); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                width: '100%', padding: '10px 12px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                                color: 'var(--text-secondary)', transition: 'all 0.15s ease',
                                textAlign: 'left'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                            <User size={16} /> Mon Profil
                        </button>
                        
                        <button
                            id="topbar-settings-btn"
                            onClick={() => {
                                setDropdownOpen(false);
                                if (user?.role === 'ADMIN') {
                                    router.push('/parametres');
                                } else if (user?.role === 'ENSEIGNANT') {
                                    router.push('/portail-enseignant?tab=profil');
                                } else if (user?.role === 'ELEVE') {
                                    router.push('/portail-eleve?tab=profil');
                                } else if (user?.role === 'PARENT') {
                                    router.push('/portail-parent?tab=profil');
                                } else {
                                    router.push('/parametres');
                                }
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                width: '100%', padding: '10px 12px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                                color: 'var(--text-secondary)', transition: 'all 0.15s ease',
                                textAlign: 'left'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                            <Settings size={16} /> Paramètres
                        </button>

                        <div style={{ height: '1px', background: 'var(--border-light)', margin: '4px 8px' }} />

                        <button
                            id="topbar-logout-btn"
                            onClick={() => { setDropdownOpen(false); logout(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                width: '100%', padding: '10px 12px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                                color: '#ef4444', transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                            <LogOut size={16} /> Se déconnecter
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
