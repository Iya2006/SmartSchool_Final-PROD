'use client';

import React, { useState } from 'react';
import { Send, Inbox, Loader2, Mail, MessageSquare, ChevronRight, User } from 'lucide-react';
import api from '@/lib/api';
import styles from '../portail-eleve.module.css';
import { MessagesData } from '../types';

interface EleveMessagesProps {
    eleveId: number;
    msgData: MessagesData | null;
    loading: boolean;
    refetchMessages: () => void;
    couleurPortail: string;
}

export default function EleveMessages({
    eleveId,
    msgData,
    loading,
    refetchMessages,
    couleurPortail,
}: EleveMessagesProps) {
    const [selectedMsgIndex, setSelectedMsgIndex] = useState(0);
    const [composeMode, setComposeMode] = useState(false);

    // Composer states
    const [msgSubject, setMsgSubject] = useState('');
    const [msgContent, setMsgContent] = useState('');
    const [msgSending, setMsgSending] = useState(false);
    const [msgSuccess, setMsgSuccess] = useState('');
    const [msgError, setMsgError] = useState('');

    const sendMessage = async () => {
        if (!msgSubject || !msgContent) return;
        setMsgSending(true);
        setMsgSuccess('');
        setMsgError('');
        try {
            await api.post(`/api/portail-eleve/${eleveId}/messages/envoyer`, {
                sujet: msgSubject,
                contenu: msgContent
            });
            setMsgSuccess('Message envoyé à l\'administration.');
            setMsgSubject('');
            setMsgContent('');
            setComposeMode(false);
            refetchMessages();
        } catch (err: any) {
            setMsgError(err.response?.data?.detail || "Erreur lors de l'envoi.");
        } finally {
            setMsgSending(false);
        }
    };

    const receivedCount = msgData?.received?.length || 0;
    const currentMessage = msgData?.received?.[selectedMsgIndex];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mes Messages</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Consultez et communiquez avec la direction de l'établissement.</p>
                </div>
                <button
                    onClick={() => { setComposeMode(!composeMode); setMsgSuccess(''); setMsgError(''); }}
                    style={{
                        padding: '10px 20px',
                        background: composeMode ? '#f1f5f9' : couleurPortail,
                        color: composeMode ? '#475569' : 'white',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: composeMode ? 'none' : `0 4px 12px ${couleurPortail}25`,
                        transition: 'all 0.2s'
                    }}
                >
                    <MessageSquare size={15} />
                    <span>{composeMode ? 'Voir la boîte' : 'Nouveau message'}</span>
                </button>
            </div>

            {composeMode ? (
                /* Composer Panel */
                <div className={styles.card} style={{ padding: '24px', maxWidth: '650px', margin: '0 auto', width: '100%' }}>
                    <h5 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                        ✍️ Écrire à l'administration
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Sujet / Objet</label>
                            <input 
                                value={msgSubject} 
                                onChange={e => setMsgSubject(e.target.value)} 
                                placeholder="Ex: Justificatif d'absence, Demande de document..."
                                style={{ 
                                    width: '100%', 
                                    padding: '12px 14px', 
                                    borderRadius: '10px', 
                                    border: '1px solid #e2e8f0', 
                                    fontSize: '13px', 
                                    boxSizing: 'border-box', 
                                    outline: 'none',
                                    fontFamily: 'inherit'
                                }} 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Contenu du message</label>
                            <textarea 
                                value={msgContent} 
                                onChange={e => setMsgContent(e.target.value)} 
                                placeholder="Saisissez votre message ici..." 
                                rows={6}
                                style={{ 
                                    width: '100%', 
                                    padding: '12px 14px', 
                                    borderRadius: '10px', 
                                    border: '1px solid #e2e8f0', 
                                    fontSize: '13px', 
                                    resize: 'vertical', 
                                    boxSizing: 'border-box', 
                                    outline: 'none', 
                                    fontFamily: 'inherit',
                                    lineHeight: 1.5
                                }} 
                            />
                        </div>

                        {msgSuccess && <p style={{ color: '#10b981', fontWeight: 700, fontSize: '13px', margin: '4px 0' }}>✓ {msgSuccess}</p>}
                        {msgError && <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '13px', margin: '4px 0' }}>⚠️ {msgError}</p>}
                        
                        <button 
                            onClick={sendMessage} 
                            disabled={msgSending || !msgSubject || !msgContent}
                            style={{ 
                                padding: '12px', 
                                background: couleurPortail, 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '10px', 
                                cursor: (msgSending || !msgSubject || !msgContent) ? 'not-allowed' : 'pointer', 
                                fontWeight: 700, 
                                fontSize: '14px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                gap: '8px',
                                opacity: (msgSending || !msgSubject || !msgContent) ? 0.6 : 1,
                                transition: 'opacity 0.2s',
                                boxShadow: `0 4px 12px ${couleurPortail}20`
                            }}
                        >
                            {msgSending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                            <span>Envoyer le message</span>
                        </button>
                    </div>
                </div>
            ) : (
                /* Interactive double panel mailbox layout */
                <div className={styles.doublePanelContainer}>
                    {/* Left: Message selection list */}
                    <div className={styles.panelLeft}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Boîte de réception ({receivedCount})
                            </span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                                    <Loader2 size={24} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
                                </div>
                            ) : receivedCount === 0 ? (
                                <div style={{ padding: '40px 10px', textAlign: 'center', color: '#94a3b8' }}>
                                    <Inbox size={28} className={styles.emptyStateIcon} />
                                    <p style={{ fontWeight: 600, fontSize: '12px' }}>Aucun message reçu</p>
                                </div>
                            ) : (
                                msgData?.received.map((m, idx) => {
                                    const isSelected = selectedMsgIndex === idx;
                                    const isUnread = m.statut === 'ENVOYE';

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => setSelectedMsgIndex(idx)}
                                            style={{
                                                width: '100%',
                                                padding: '12px 14px',
                                                borderRadius: '10px',
                                                border: 'none',
                                                background: isSelected ? `${couleurPortail}10` : 'transparent',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px',
                                                marginBottom: '4px',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseOver={e => !isSelected && (e.currentTarget.style.background = '#f8fafc')}
                                            onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 800, color: isSelected ? couleurPortail : '#64748b' }}>
                                                    {m.expediteur_type === 'ADMIN' ? '🏫 Administration' : m.expediteur_type}
                                                </span>
                                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                    {m.date_envoi ? new Date(m.date_envoi).toLocaleDateString('fr-FR') : ''}
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '12.5px', fontWeight: isUnread ? 800 : 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.sujet}
                                            </p>
                                            <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.contenu}
                                            </p>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right: Message details view */}
                    <div className={styles.panelRight}>
                        {currentMessage ? (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                {/* Message details header */}
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                            <User size={18} />
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 750, color: '#1e293b' }}>
                                                {currentMessage.expediteur_type === 'ADMIN' ? 'Administration Scolaire' : currentMessage.expediteur_type}
                                            </p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                                Reçu le {currentMessage.date_envoi ? new Date(currentMessage.date_envoi).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Message subject & body */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', lineHeight: 1.4 }}>
                                        {currentMessage.sujet}
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                        {currentMessage.contenu}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', padding: '40px' }}>
                                <Mail size={48} style={{ marginBottom: '12px' }} />
                                <p style={{ fontSize: '13px', fontWeight: 650 }}>Sélectionnez un message pour l'afficher.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
