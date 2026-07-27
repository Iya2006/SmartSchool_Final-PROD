'use client';

import React, { useState } from 'react';
import { Send, Inbox, Loader2, Mail, MessageSquare, User, AlertTriangle, SendHorizonal } from 'lucide-react';
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
    const [mailboxTab, setMailboxTab] = useState<'received' | 'sent'>('received');

    // Recipient selection states
    const [enseignants, setEnseignants] = useState<any[]>([]);
    const [destinataireType, setDestinataireType] = useState<'ADMIN' | 'ENSEIGNANT'>('ADMIN');
    const [selectedEnseignantId, setSelectedEnseignantId] = useState<number | null>(null);

    // Composer states
    const [msgSubject, setMsgSubject] = useState('');
    const [msgContent, setMsgContent] = useState('');
    const [msgSending, setMsgSending] = useState(false);
    const [msgSuccess, setMsgSuccess] = useState('');
    const [msgError, setMsgError] = useState('');

    React.useEffect(() => {
        if (!eleveId) return;
        api.get(`/api/portail-eleve/${eleveId}/enseignants`)
            .then(res => setEnseignants(res.data))
            .catch(() => setEnseignants([]));
    }, [eleveId]);

    const sendMessage = async () => {
        if (!msgSubject || !msgContent) return;
        if (destinataireType === 'ENSEIGNANT' && !selectedEnseignantId) {
            setMsgError('Veuillez sélectionner un enseignant.');
            return;
        }
        setMsgSending(true);
        setMsgSuccess('');
        setMsgError('');
        try {
            await api.post(`/api/portail-eleve/${eleveId}/messages/envoyer`, {
                sujet: msgSubject,
                contenu: msgContent,
                destinataire_type: destinataireType,
                destinataire_id: destinataireType === 'ENSEIGNANT' ? selectedEnseignantId : null,
            });
            const destLabel = destinataireType === 'ENSEIGNANT' ? 'au professeur.' : 'à l\'administration.';
            setMsgSuccess(`Message envoyé ${destLabel}`);
            setMsgSubject('');
            setMsgContent('');
            setComposeMode(false);
            setMailboxTab('sent');
            setSelectedMsgIndex(0);
            refetchMessages();
        } catch (err: any) {
            setMsgError(err.response?.data?.detail || "Erreur lors de l'envoi.");
        } finally {
            setMsgSending(false);
        }
    };

    // Current message list based on active tab
    const activeList = mailboxTab === 'received' ? (msgData?.received || []) : (msgData?.sent || []);
    const currentMessage = activeList[selectedMsgIndex];

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontSize: '12px', fontWeight: 700,
        background: active ? couleurPortail : 'transparent',
        color: active ? 'white' : '#64748b',
        display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s',
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mes Messages</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Consultez et communiquez avec la direction ou vos professeurs.</p>
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
                        Nouveau Message
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Destinataire</label>
                            <select
                                value={destinataireType === 'ADMIN' ? 'ADMIN' : (selectedEnseignantId ? `ENS_${selectedEnseignantId}` : '')}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'ADMIN') {
                                        setDestinataireType('ADMIN');
                                        setSelectedEnseignantId(null);
                                    } else if (val.startsWith('ENS_')) {
                                        setDestinataireType('ENSEIGNANT');
                                        setSelectedEnseignantId(Number(val.replace('ENS_', '')));
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '13px',
                                    boxSizing: 'border-box',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    background: 'white'
                                }}
                            >
                                <option value="ADMIN">Administration / Direction</option>
                                {enseignants.length > 0 && (
                                    <optgroup label="Professeurs de ma classe">
                                        {enseignants.map(ens => (
                                            <option key={ens.enseignant_id} value={`ENS_${ens.enseignant_id}`}>
                                                {ens.prenom} {ens.nom} ({ens.matiere})
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>Sujet / Objet</label>
                            <input 
                                value={msgSubject} 
                                onChange={e => setMsgSubject(e.target.value)} 
                                placeholder="Ex: Question sur le cours, Justificatif d'absence..."
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
                        {msgError && <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '13px', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={14} /> {msgError}</p>}
                        
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
                        {/* Tab bar */}
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '6px', background: '#fafafa' }}>
                            <button style={tabStyle(mailboxTab === 'received')} onClick={() => { setMailboxTab('received'); setSelectedMsgIndex(0); }}>
                                <Inbox size={13} /> Reçus ({msgData?.received?.length || 0})
                            </button>
                            <button style={tabStyle(mailboxTab === 'sent')} onClick={() => { setMailboxTab('sent'); setSelectedMsgIndex(0); }}>
                                <SendHorizonal size={13} /> Envoyés ({msgData?.sent?.length || 0})
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                                    <Loader2 size={24} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
                                </div>
                            ) : activeList.length === 0 ? (
                                <div style={{ padding: '40px 10px', textAlign: 'center', color: '#94a3b8' }}>
                                    {mailboxTab === 'received' ? <Inbox size={28} className={styles.emptyStateIcon} /> : <SendHorizonal size={28} className={styles.emptyStateIcon} />}
                                    <p style={{ fontWeight: 600, fontSize: '12px' }}>{mailboxTab === 'received' ? 'Aucun message reçu' : 'Aucun message envoyé'}</p>
                                </div>
                            ) : (
                                activeList.map((m, idx) => {
                                    const isSelected = selectedMsgIndex === idx;
                                    const isUnread = mailboxTab === 'received' && m.statut === 'ENVOYE';

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
                                                    {mailboxTab === 'received'
                                                        ? (m.expediteur_nom || (m.expediteur_type === 'ADMIN' ? 'Administration' : m.expediteur_type))
                                                        : (m.destinataire_nom || (m.destinataire_type === 'ADMIN' ? 'Administration' : m.destinataire_type === 'ENSEIGNANT' ? 'Professeur' : m.destinataire_type))
                                                    }
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
                                            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                                {mailboxTab === 'received' ? 'De' : 'À'}
                                            </p>
                                            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 750, color: '#1e293b' }}>
                                                {mailboxTab === 'received'
                                                    ? (currentMessage.expediteur_nom || (currentMessage.expediteur_type === 'ADMIN' ? 'Administration Scolaire' : currentMessage.expediteur_type))
                                                    : (currentMessage.destinataire_nom || (currentMessage.destinataire_type === 'ADMIN' ? 'Administration Scolaire' : 'Professeur'))
                                                }
                                            </p>
                                            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                                {mailboxTab === 'received' ? 'Reçu' : 'Envoyé'} le {currentMessage.date_envoi ? new Date(currentMessage.date_envoi).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
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
