'use client';

import React from 'react';
import { Calendar, Clock, Loader2, MapPin, User } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { CreneauEDT, JOURS_ORDER, JOURS_LABEL, SUBJECT_COLORS } from '../types';

interface EleveEmploiProps {
    edtData: CreneauEDT[];
    loading: boolean;
    couleurPortail: string;
}

export default function EleveEmploi({ edtData, loading, couleurPortail }: EleveEmploiProps) {
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (edtData.length === 0) {
        return (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Calendar size={44} className={styles.emptyStateIcon} style={{ color: couleurPortail }} />
                <p style={{ fontWeight: 700, color: '#475569', fontSize: '15px' }}>Emploi du temps indisponible</p>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>Votre emploi du temps hebdomadaire n'a pas encore été publié.</p>
            </div>
        );
    }

    // Get unique start hours sorted
    const heures = Array.from(new Set(edtData.map(c => c.heure_debut))).sort();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Emploi du Temps</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Retrouvez la répartition hebdomadaire de vos enseignements.</p>
            </div>

            <div className={styles.card} style={{ padding: '20px', overflowX: 'auto', border: '1px solid #cbd5e1' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '8px', tableLayout: 'fixed', minWidth: '850px' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px', background: '#f8fafc', borderRadius: '10px' }}></th>
                            {JOURS_ORDER.map(j => (
                                <th 
                                    key={j} 
                                    style={{ 
                                        padding: '12px 10px', 
                                        fontSize: '12px', 
                                        fontWeight: 800, 
                                        color: 'white', 
                                        textAlign: 'center', 
                                        background: `linear-gradient(135deg, ${couleurPortail} 0%, ${couleurPortail}dd 100%)`,
                                        borderRadius: '10px',
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                        boxShadow: `0 4px 10px ${couleurPortail}15`
                                    }}
                                >
                                    {JOURS_LABEL[j]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {heures.map(h => (
                            <tr key={h}>
                                {/* Time Cell */}
                                <td style={{ 
                                    textAlign: 'center', 
                                    fontSize: '12px', 
                                    fontWeight: 750, 
                                    color: '#475569',
                                    background: '#f8fafc',
                                    borderRadius: '10px',
                                    padding: '12px 6px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.01)'
                                }}>
                                    <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                                    <span style={{ verticalAlign: 'middle' }}>{h}</span>
                                </td>
                                {JOURS_ORDER.map(jour => {
                                    const slot = edtData.find(c => c.jour === jour && c.heure_debut === h);
                                    const ci = slot ? edtData.indexOf(slot) % SUBJECT_COLORS.length : 0;
                                    const c = SUBJECT_COLORS[ci];

                                    return (
                                        <td key={jour} style={{ padding: '0', verticalAlign: 'top', height: '110px' }}>
                                            {slot ? (
                                                <div 
                                                    style={{ 
                                                        background: c.bg, 
                                                        borderLeft: `4px solid ${c.border}`, 
                                                        borderRadius: '10px', 
                                                        padding: '12px', 
                                                        height: '100%',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                                        boxSizing: 'border-box',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        justifyContent: 'space-between',
                                                        borderTop: '1px solid rgba(0,0,0,0.02)',
                                                        borderRight: '1px solid rgba(0,0,0,0.02)',
                                                        borderBottom: '1px solid rgba(0,0,0,0.02)'
                                                    }}
                                                    onMouseOver={e => {
                                                        e.currentTarget.style.transform = 'scale(1.02)';
                                                        e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.04)';
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.transform = 'none';
                                                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                                                    }}
                                                >
                                                    <div>
                                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={slot.matiere}>
                                                            {slot.matiere}
                                                        </p>
                                                        <p style={{ margin: '4px 0 0', fontSize: '10px', color: c.text, opacity: 0.8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                            <Clock size={10} /> {slot.heure_debut} – {slot.heure_fin}
                                                        </p>
                                                    </div>
                                                    
                                                    <div style={{ marginTop: '8px' }}>
                                                        <p style={{ margin: 0, fontSize: '10px', color: c.text, opacity: 0.75, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                                            <User size={10} /> {slot.enseignant}
                                                        </p>
                                                        {slot.salle && (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}>
                                                                <span style={{ 
                                                                    display: 'inline-block',
                                                                    fontSize: '9px', 
                                                                    color: c.border, 
                                                                    fontWeight: 800,
                                                                    background: `${c.border}15`,
                                                                    padding: '1px 6px',
                                                                    borderRadius: '6px'
                                                                }}>
                                                                    📍 {slot.salle}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
