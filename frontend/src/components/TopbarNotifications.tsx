'use client';

/**
 * TopbarNotifications — Cloche de notification avec dropdown des messages.
 *
 * Utilise le hook useNotifications pour toute la logique de données.
 * Ce composant ne gère QUE l'affichage et les interactions UI.
 *
 * refactor(topbar): utiliser useNotifications hook + séparer UI et logique
 */

import { useState, useRef, useEffect } from 'react';
import { Bell, MessageCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotifications, type Message } from '@/hooks/useNotifications';

// ─── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Il y a ${hrs}h`;
    return `Il y a ${Math.floor(hrs / 24)}j`;
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
    EMPLOI:     { bg: '#dbeafe', color: '#2563eb' },
    GENERAL:    { bg: '#f0fdf4', color: '#16a34a' },
    DISCIPLINE: { bg: '#fef2f2', color: '#dc2626' },
    EXAMENS:    { bg: '#fef3c7', color: '#d97706' },
    REUNION:    { bg: '#ede9fe', color: '#7c3aed' },
};

// ─── Sous-composant : liste des messages ─────────────────────────────────────
function NotifList({
    messages,
    loading,
    onClose,
}: {
    messages: Message[];
    loading: boolean;
    onClose: () => void;
}) {
    const router = useRouter();

    if (loading) {
        return (
            <div style={{ padding: '30px', textAlign: 'center' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                <Bell size={24} style={{ marginBottom: '8px', opacity: 0.4 }} />
                <p style={{ fontSize: '13px', margin: 0 }}>Aucune notification</p>
            </div>
        );
    }

    return (
        <div style={{ maxHeight: '360px', overflow: 'auto' }}>
            {messages.map(m => {
                const tc = TYPE_COLORS[m.objet_type] || TYPE_COLORS.GENERAL;
                const isUnread = m.statut === 'ENVOYE' && m.expediteur_type !== 'ADMIN';
                return (
                    <div
                        key={m.message_id}
                        style={{
                            padding: '14px 20px',
                            borderBottom: '1px solid #f8fafc',
                            background: isUnread ? '#f0f9ff' : 'white',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                        onClick={() => { onClose(); router.push('/communication'); }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = '#f1f5f9';
                            e.currentTarget.style.paddingLeft = '24px';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = isUnread ? '#f0f9ff' : 'white';
                            e.currentTarget.style.paddingLeft = '20px';
                        }}
                    >
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                background: tc.bg, color: tc.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                                <MessageCircle size={16} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                    <p style={{
                                        margin: 0, fontSize: '13px',
                                        fontWeight: isUnread ? 700 : 600,
                                        color: 'var(--text-primary)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {m.sujet}
                                    </p>
                                    <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                        {timeAgo(m.date_envoi)}
                                    </span>
                                </div>
                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                                    {m.expediteur_nom || m.expediteur_type} → {m.destinataire_nom || m.destinataire_type}
                                </p>
                            </div>
                            {isUnread && (
                                <div style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: '#3b82f6', flexShrink: 0, marginTop: '6px',
                                }} />
                            )}
                        </div>
                    </div>
                );
            })}
            <div style={{ padding: '12px', textAlign: 'center', borderTop: '1px solid var(--border-light)' }}>
                <a href="/communication" onClick={onClose}
                    style={{ fontSize: '12px', fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>
                    Voir tous les messages →
                </a>
            </div>
        </div>
    );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function TopbarNotifications() {
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement>(null);

    // ✅ Logique de données déléguée au hook
    const { messages, unreadCount, loading, markAllAsRead } = useNotifications(30000);

    // Fermer au clic extérieur
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        const willOpen = !notifOpen;
        setNotifOpen(willOpen);
        if (willOpen && unreadCount > 0) {
            markAllAsRead();
        }
    };

    return (
        <div ref={notifRef} style={{ position: 'relative' }}>
            {/* 🔔 Bouton cloche */}
            <button
                id="topbar-notifications-btn"
                onClick={handleToggle}
                title="Notifications"
                style={{
                    position: 'relative', background: 'none', border: 'none',
                    cursor: 'pointer', padding: '8px', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
                <Bell size={20} strokeWidth={2} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute', top: '-4px', right: '-4px',
                        minWidth: '18px', height: '18px', borderRadius: '9px',
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: 'white', fontSize: '10px', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
                        border: '2px solid white',
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* 🗂️ Panel notifications */}
            {notifOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: '-80px',
                    width: '380px', background: 'white', borderRadius: '16px',
                    border: '1px solid var(--border-light)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                    zIndex: 2000, overflow: 'hidden',
                    animation: 'fadeIn 0.15s ease',
                }}>
                    <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>
                    <div style={{
                        padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            🔔 Notifications
                        </h4>
                        {unreadCount > 0 && (
                            <span style={{
                                padding: '3px 10px', borderRadius: '10px',
                                fontSize: '11px', fontWeight: 700,
                                background: '#fef2f2', color: '#ef4444',
                            }}>
                                {unreadCount} non lu{unreadCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <NotifList
                        messages={messages}
                        loading={loading}
                        onClose={() => setNotifOpen(false)}
                    />
                </div>
            )}
        </div>
    );
}
