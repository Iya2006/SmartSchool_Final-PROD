'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, MessageCircle, Loader2, ArrowUpRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, type Message } from '@/hooks/useNotifications';

function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Il y a ${hrs} h`;
    return `Il y a ${Math.floor(hrs / 24)} j`;
}

const TYPE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    EMPLOI:     { bg: '#dbeafe', color: '#2563eb', label: 'Emploi' },
    GENERAL:    { bg: '#f0fdf4', color: '#16a34a', label: 'Général' },
    DISCIPLINE: { bg: '#fef2f2', color: '#dc2626', label: 'Discipline' },
    EXAMENS:    { bg: '#fef3c7', color: '#d97706', label: 'Examens' },
    REUNION:    { bg: '#ede9fe', color: '#7c3aed', label: 'Réunion' },
};

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
            <div style={{ padding: '34px', textAlign: 'center', color: '#64748b' }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#6366f1', marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Chargement des notifications...</p>
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <div style={{ padding: '34px', textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ width: 52, height: 52, margin: '0 auto 12px', borderRadius: '16px', background: '#f8fafc', display: 'grid', placeItems: 'center', border: '1px solid #e2e8f0' }}>
                    <Bell size={22} style={{ opacity: 0.7 }} />
                </div>
                <p style={{ fontSize: '14px', margin: 0, fontWeight: 700, color: '#475569' }}>Aucune notification pour le moment</p>
                <p style={{ fontSize: '12px', margin: '6px 0 0', color: '#94a3b8' }}>Le centre de messages vous alertera ici automatiquement.</p>
            </div>
        );
    }

    return (
        <div style={{ maxHeight: '400px', overflow: 'auto', padding: '8px' }}>
            {messages.map((m) => {
                const tc = TYPE_COLORS[m.objet_type] || TYPE_COLORS.GENERAL;
                const isUnread = m.statut === 'ENVOYE' && m.expediteur_type !== 'ADMIN';
                return (
                    <button
                        key={m.message_id}
                        type="button"
                        style={{
                            width: '100%',
                            textAlign: 'left',
                            cursor: 'pointer',
                            marginBottom: '8px',
                            borderRadius: '18px',
                            padding: '14px',
                            background: isUnread
                                ? 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)'
                                : '#ffffff',
                            boxShadow: isUnread
                                ? '0 14px 26px rgba(37, 99, 235, 0.08)'
                                : '0 8px 18px rgba(15, 23, 42, 0.04)',
                            border: isUnread ? '1px solid #bfdbfe' : '1px solid #eef2f7',
                            transition: 'all 0.18s ease',
                        }}
                        onClick={() => { onClose(); router.push('/communication'); }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 16px 30px rgba(15, 23, 42, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = isUnread
                                ? '0 14px 26px rgba(37, 99, 235, 0.08)'
                                : '0 8px 18px rgba(15, 23, 42, 0.04)';
                        }}
                    >
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '14px',
                                background: tc.bg,
                                color: tc.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <MessageCircle size={18} />
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 9px',
                                        borderRadius: '999px',
                                        background: tc.bg,
                                        color: tc.color,
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                    }}>
                                        {tc.label}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                        {timeAgo(m.date_envoi)}
                                    </span>
                                </div>

                                <p style={{
                                    margin: 0,
                                    fontSize: '13px',
                                    fontWeight: isUnread ? 800 : 700,
                                    color: '#0f172a',
                                    lineHeight: 1.45,
                                }}>
                                    {m.sujet}
                                </p>

                                <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                    {m.expediteur_nom || m.expediteur_type} → {m.destinataire_nom || m.destinataire_type}
                                </p>
                            </div>

                            {isUnread && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', boxShadow: '0 0 0 5px rgba(37,99,235,0.12)' }} />
                                </div>
                            )}
                        </div>
                    </button>
                );
            })}

            <div style={{ padding: '10px 8px 4px' }}>
                <button
                    type="button"
                    onClick={() => { onClose(); router.push('/communication'); }}
                    style={{
                        width: '100%',
                        border: '1px solid #dbeafe',
                        background: '#eff6ff',
                        color: '#2563eb',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                    }}
                >
                    Voir tous les messages <ArrowUpRight size={14} />
                </button>
            </div>
        </div>
    );
}

export default function TopbarNotifications() {
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef<HTMLDivElement>(null);
    const { messages, unreadCount, loading, markAllAsRead } = useNotifications(30000);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const handleToggle = () => {
        const willOpen = !notifOpen;
        setNotifOpen(willOpen);
        if (willOpen && unreadCount > 0) {
            markAllAsRead();
        }
    };

    const unreadLabel = unreadCount > 0 ? `${unreadCount} non lu${unreadCount > 1 ? 's' : ''}` : 'Tout est lu';

    return (
        <div ref={notifRef}>
            <button
                id="topbar-notifications-btn"
                onClick={handleToggle}
                title="Notifications"
                style={{
                    position: 'relative',
                    background: 'rgba(255,255,255,0.7)',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    padding: '10px',
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    transition: 'all 0.2s',
                    boxShadow: notifOpen ? '0 10px 24px rgba(15, 23, 42, 0.08)' : 'none',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.color = 'var(--brand-secondary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = notifOpen ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.7)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                }}
            >
                <Bell size={20} strokeWidth={2} />
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        minWidth: '18px',
                        height: '18px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
                        border: '2px solid white',
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {notifOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 12px)',
                            right: 0,
                            width: 'min(420px, calc(100vw - 32px))',
                            background: 'rgba(255,255,255,0.96)',
                            borderRadius: '24px',
                            border: '1px solid rgba(226,232,240,0.95)',
                            boxShadow: '0 28px 60px rgba(15,23,42,0.16)',
                            zIndex: 2000,
                            overflow: 'hidden',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                        }}
                    >
                        <div style={{
                            padding: '18px 20px',
                            borderBottom: '1px solid #eef2f7',
                            background: 'linear-gradient(135deg, rgba(239,246,255,0.98), rgba(255,255,255,0.92))',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                        <div style={{ width: '38px', height: '38px', borderRadius: '14px', background: '#dbeafe', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                                            <Bell size={18} />
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Centre de notifications</h4>
                                            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{unreadLabel}</p>
                                        </div>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 10px',
                                    borderRadius: '999px',
                                    background: unreadCount > 0 ? '#fef2f2' : '#ecfdf5',
                                    color: unreadCount > 0 ? '#dc2626' : '#16a34a',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                }}>
                                    <Sparkles size={13} />
                                    {unreadCount > 0 ? `${unreadCount} alerte${unreadCount > 1 ? 's' : ''}` : 'Rien à signaler'}
                                </div>
                            </div>
                        </div>

                        <NotifList
                            messages={messages}
                            loading={loading}
                            onClose={() => setNotifOpen(false)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
