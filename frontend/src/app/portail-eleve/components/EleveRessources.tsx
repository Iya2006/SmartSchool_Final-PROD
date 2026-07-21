'use client';

import React from 'react';
import { ExternalLink, Loader2, Globe, BookOpen, Video, FileText } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { RessourceItem, SUBJECT_COLORS } from '../types';

interface EleveRessourcesProps {
    ressourcesData: RessourceItem[];
    loading: boolean;
    couleurPortail: string;
}

export default function EleveRessources({ ressourcesData, loading, couleurPortail }: EleveRessourcesProps) {
    const typeIcons: Record<string, React.ReactNode> = {
        LIEN: <Globe size={16} />,
        DOCUMENT: <FileText size={16} />,
        VIDEO: <Video size={16} />,
        COURS: <BookOpen size={16} />,
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (ressourcesData.length === 0) {
        return (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                <Globe size={40} className={styles.emptyStateIcon} style={{ color: couleurPortail }} />
                <p style={{ fontWeight: 650, color: '#475569' }}>Aucune ressource disponible</p>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>Les ressources pédagogiques seront publiées ici par vos enseignants.</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Ressources Pédagogiques</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Liens et documents utiles partagés par vos enseignants.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {ressourcesData.map((r, i) => {
                    const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
                    const icon = typeIcons[r.type] || <Globe size={16} />;

                    return (
                        <a
                            key={i}
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                            <div 
                                className={styles.premiumCard}
                                style={{ 
                                    padding: '20px', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '12px',
                                    borderLeft: `4px solid ${color.border}`,
                                    cursor: 'pointer',
                                    height: '100%'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: color.bg, color: color.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {icon}
                                    </div>
                                    <ExternalLink size={14} color="#cbd5e1" />
                                </div>

                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 750, color: '#1e293b', lineHeight: 1.4 }}>
                                        {r.titre}
                                    </h4>
                                    {r.description && (
                                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                                            {r.description}
                                        </p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: color.text, padding: '2px 8px', borderRadius: '6px', background: color.bg, textTransform: 'uppercase' }}>
                                        {r.categorie || r.type}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                                        {r.auteur}
                                    </span>
                                </div>
                            </div>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}
