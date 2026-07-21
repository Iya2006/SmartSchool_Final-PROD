'use client';

import React from 'react';
import { CheckCircle, AlertCircle, Clock, Loader2, Calendar } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { AbsencesData } from '../types';
import DonutChart from './DonutChart';

interface EleveAbsencesProps {
    absData: AbsencesData | null;
    loading: boolean;
    couleurPortail: string;
}

export default function EleveAbsences({ absData, loading, couleurPortail }: EleveAbsencesProps) {
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (!absData) {
        return (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                <AlertCircle size={40} className={styles.emptyStateIcon} />
                <p style={{ fontWeight: 600, color: '#94a3b8' }}>Aucune donnée d'absence enregistrée</p>
            </div>
        );
    }

    const totalDays = absData.total_present + absData.total_absent;
    const rate = totalDays > 0 ? Math.round((absData.total_present / totalDays) * 100) : 100;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Assiduité & Absences</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Suivez votre taux de présence et l'historique de vos absences.</p>
            </div>

            <div className={styles.grid2col}>
                {/* Left panel: Donut attendance rate */}
                <div className={styles.card} style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                    <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', alignSelf: 'flex-start' }}>
                        Taux d'assiduité
                    </h5>
                    
                    <DonutChart pct={rate} color={couleurPortail} value={`${rate}%`} label="Présence" />

                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                        {[
                            { label: 'Jours Présents', value: absData.total_present, bg: '#d1fae5', color: '#059669', icon: CheckCircle },
                            { label: 'Absences Signalées', value: absData.total_absent, bg: '#fee2e2', color: '#dc2626', icon: AlertCircle },
                            { label: 'Total Enregistré', value: totalDays, bg: '#f1f5f9', color: '#475569', icon: Clock },
                        ].map((item, idx) => (
                            <div 
                                key={idx} 
                                style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    padding: '12px 16px', 
                                    borderRadius: '12px', 
                                    background: '#f8fafc',
                                    border: '1px solid #f1f5f9'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <item.icon size={14} />
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>{item.label}</span>
                                </div>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>{item.value} jours</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right panel: Timeline history */}
                <div className={styles.card} style={{ padding: '24px' }}>
                    <h5 style={{ margin: '0 0 20px', fontSize: '13px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Historique des Absences ({absData.presences.filter(p => p.statut !== 'PRESENT').length})
                    </h5>

                    {absData.presences.filter(p => p.statut !== 'PRESENT').length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                            <CheckCircle size={32} style={{ color: '#10b981', opacity: 0.5, margin: '0 auto 8px' }} />
                            <p style={{ fontWeight: 650, color: '#059669' }}>Félicitations, aucune absence enregistrée !</p>
                        </div>
                    ) : (
                        <div className={styles.timeline}>
                            {absData.presences.filter(p => p.statut !== 'PRESENT').map((p, idx) => {
                                const isJustified = p.statut === 'ABSENT_JUSTIFIE';
                                const badgeColor = isJustified ? '#d97706' : '#dc2626';
                                const badgeBg = isJustified ? '#fef3c7' : '#fee2e2';

                                return (
                                    <div key={idx} className={styles.timelineItem}>
                                        <div 
                                            className={styles.timelineDot}
                                            style={{ backgroundColor: badgeColor }}
                                        />
                                        <div 
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '14px',
                                                padding: '16px',
                                                marginLeft: '8px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Calendar size={13} color="#94a3b8" />
                                                    {p.date ? new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                                                </span>
                                                <span 
                                                    style={{ 
                                                        padding: '2px 10px', 
                                                        borderRadius: '20px', 
                                                        fontSize: '10px', 
                                                        fontWeight: 750, 
                                                        background: badgeBg, 
                                                        color: badgeColor 
                                                    }}
                                                >
                                                    {isJustified ? 'JUSTIFIÉ' : 'NON JUSTIFIÉ'}
                                                </span>
                                            </div>

                                            {p.justification && (
                                                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#64748b', fontStyle: 'italic', lineHeight: 1.4 }}>
                                                    Motif : "{p.justification}"
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
