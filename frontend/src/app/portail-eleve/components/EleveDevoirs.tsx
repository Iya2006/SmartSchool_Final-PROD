'use client';

import React from 'react';
import { BookMarked, ExternalLink, Loader2, Calendar, User, FileText, AlertTriangle } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { DevoirItem, SUBJECT_COLORS } from '../types';

interface EleveDevoirsProps {
    devoirsData: DevoirItem[];
    loading: boolean;
    apiBase: string;
    couleurPortail: string;
}

export default function EleveDevoirs({ 
    devoirsData, 
    loading, 
    apiBase, 
    couleurPortail 
}: EleveDevoirsProps) {
    const typeColors: Record<string, string> = { 
        EXERCICE: '#2563eb', 
        RECHERCHE: '#d97706', 
        LECTURE: '#7c3aed', 
        PROJET: '#059669' 
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mes Devoirs</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Consultez et téléchargez les devoirs à rendre pour votre classe.</p>
                </div>
            </div>
            
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
            ) : devoirsData.length === 0 ? (
                <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                    <BookMarked size={40} className={styles.emptyStateIcon} style={{ color: couleurPortail }} />
                    <p style={{ fontWeight: 650, color: '#475569' }}>Aucun devoir enregistré</p>
                    <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>Aucune tâche ou exercice n'a été publié pour votre classe.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {devoirsData.map((d, i) => {
                        const typeColor = typeColors[d.type_devoir] || '#64748b';
                        const subjectColor = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
                        
                        // Check if deadline is close (less than 3 days)
                        let isUrgent = false;
                        if (d.date_limite) {
                            const limit = new Date(d.date_limite).getTime();
                            const now = new Date().getTime();
                            const diffDays = (limit - now) / (1000 * 60 * 60 * 24);
                            if (diffDays >= 0 && diffDays <= 3) {
                                isUrgent = true;
                            }
                        }

                        return (
                            <div 
                                key={i} 
                                className={styles.premiumCard} 
                                style={{ 
                                    padding: '20px', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '14px',
                                    borderLeft: isUrgent ? '4px solid #ef4444' : `4px solid ${subjectColor.border}`
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                    <span 
                                        style={{ 
                                            fontSize: '10.5px', 
                                            fontWeight: 800, 
                                            padding: '4px 10px', 
                                            borderRadius: '20px', 
                                            background: `${typeColor}15`, 
                                            color: typeColor,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.3px'
                                        }}
                                    >
                                        {d.type_devoir}
                                    </span>
                                    
                                    {isUrgent && (
                                        <span style={{ fontSize: '10px', background: '#fee2e2', color: '#ef4444', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <AlertTriangle size={10} /> Urgent
                                        </span>
                                    )}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b', lineHeight: 1.4 }}>
                                        {d.titre}
                                    </h4>
                                    <p style={{ margin: '4px 0 10px', fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                                        {d.matiere}
                                    </p>
                                    
                                    {d.description && (
                                        <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5, textOverflow: 'ellipsis' }} title={d.description}>
                                            {d.description}
                                        </p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                            <User size={12} color="#cbd5e1" /> {d.enseignant}
                                        </span>
                                        {d.date_limite && (
                                            <span style={{ fontSize: '11.5px', color: isUrgent ? '#ef4444' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                                                <Calendar size={12} /> Limite: {new Date(d.date_limite).toLocaleDateString('fr-FR')}
                                            </span>
                                        )}
                                    </div>

                                    {d.fichier_path && (
                                        <a 
                                            href={`${apiBase}${d.fichier_path}`} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            style={{ 
                                                background: '#f8fafc', 
                                                padding: '8px 12px', 
                                                borderRadius: '8px', 
                                                textDecoration: 'none', 
                                                color: '#3b82f6', 
                                                fontSize: '12px', 
                                                fontWeight: 700, 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                gap: '6px', 
                                                border: '1px solid #e2e8f0',
                                                marginTop: '4px',
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                            onMouseOut={e => e.currentTarget.style.background = '#f8fafc'}
                                        >
                                            <FileText size={13} /> 
                                            <span>Télécharger la ressource</span>
                                            <ExternalLink size={11} style={{ marginLeft: 'auto' }} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

