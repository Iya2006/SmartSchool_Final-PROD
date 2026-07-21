'use client';

import React, { useState } from 'react';
import { BookOpen, Loader2, ChevronRight, Calendar, AlertCircle } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { NotesData, SUBJECT_COLORS } from '../types';

interface EleveNotesProps {
    notesData: NotesData | null;
    loading: boolean;
    couleurPortail: string;
}

export default function EleveNotes({ notesData, loading, couleurPortail }: EleveNotesProps) {
    const [selectedSubjectIndex, setSelectedSubjectIndex] = useState(0);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (!notesData || !notesData.notes_par_matiere || notesData.notes_par_matiere.length === 0) {
        return (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                <BookOpen size={40} className={styles.emptyStateIcon} />
                <p style={{ fontWeight: 600, color: '#94a3b8' }}>Aucune note enregistrée pour le moment</p>
            </div>
        );
    }

    const currentSubject = notesData.notes_par_matiere[selectedSubjectIndex] || notesData.notes_par_matiere[0];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Mes Notes</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Consultez la liste complète de vos notes et évaluations par matière.</p>
                </div>
                <div style={{ padding: '10px 20px', background: `${couleurPortail}15`, borderRadius: '12px', fontWeight: 800, color: couleurPortail, fontSize: '14px' }}>
                    Moyenne Générale : {notesData.moyenne_generale !== null ? `${notesData.moyenne_generale}/20` : '—'}
                </div>
            </div>

            {/* Interactive double panel layout */}
            <div className={styles.doublePanelContainer}>
                {/* Left panel: list of subjects */}
                <div className={styles.panelLeft}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Matières ({notesData.notes_par_matiere.length})
                        </span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        {notesData.notes_par_matiere.map((mat, idx) => {
                            const isSelected = selectedSubjectIndex === idx;
                            const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
                            
                            return (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedSubjectIndex(idx)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: isSelected ? `${couleurPortail}10` : 'transparent',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s ease',
                                        marginBottom: '4px'
                                    }}
                                    onMouseOver={e => !isSelected && (e.currentTarget.style.background = '#f8fafc')}
                                    onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}
                                >
                                    <div 
                                        style={{ 
                                            width: '28px', 
                                            height: '28px', 
                                            borderRadius: '8px', 
                                            background: isSelected ? couleurPortail : color.bg, 
                                            color: isSelected ? 'white' : color.text,
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontWeight: 800, 
                                            fontSize: '11px' 
                                        }}
                                    >
                                        {mat.matiere.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: isSelected ? 700 : 600, color: isSelected ? '#0f172a' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {mat.matiere}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                                            {mat.notes.length} évaluation{mat.notes.length > 1 ? 's' : ''}
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                        {mat.moyenne !== null ? (
                                            <span 
                                                style={{ 
                                                    fontWeight: 800, 
                                                    fontSize: '13px', 
                                                    color: mat.moyenne >= 10 ? '#059669' : '#dc2626' 
                                                }}
                                            >
                                                {mat.moyenne}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>—</span>
                                        )}
                                        <ChevronRight size={14} color={isSelected ? couleurPortail : '#cbd5e1'} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right panel: details of selected subject */}
                <div className={styles.panelRight}>
                    {currentSubject ? (
                        <>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                                        {currentSubject.matiere}
                                    </h4>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                                        Détail de toutes les notes
                                    </p>
                                </div>
                                {currentSubject.moyenne !== null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Moyenne matière :</span>
                                        <span 
                                            style={{ 
                                                fontSize: '18px', 
                                                fontWeight: 900, 
                                                color: currentSubject.moyenne >= 10 ? '#059669' : '#dc2626' 
                                            }}
                                        >
                                            {currentSubject.moyenne}/20
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                {currentSubject.notes.length === 0 ? (
                                    <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                        <AlertCircle size={32} style={{ opacity: 0.25, margin: '0 auto 8px' }} />
                                        <p style={{ fontWeight: 600 }}>Aucune note pour cette matière</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                                        {currentSubject.notes.map((n, idx) => {
                                            const isGood = n.note !== null && n.note >= 10;
                                            const scoreColor = n.est_absent ? '#dc2626' : (isGood ? '#059669' : '#dc2626');
                                            const scoreBg = n.est_absent ? '#fee2e2' : (isGood ? '#d1fae5' : '#fee2e2');

                                            return (
                                                <div 
                                                    key={idx}
                                                    style={{
                                                        padding: '16px',
                                                        borderRadius: '14px',
                                                        border: '1px solid #e2e8f0',
                                                        background: '#f8fafc',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '12px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span 
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '8px',
                                                                fontSize: '13px',
                                                                fontWeight: 900,
                                                                background: scoreBg,
                                                                color: scoreColor
                                                            }}
                                                        >
                                                            {n.est_absent ? 'ABSENT' : `${n.note} / ${n.note_sur}`}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                            <Calendar size={12} />
                                                            {n.date ? new Date(n.date).toLocaleDateString('fr-FR') : 'Date n/a'}
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <h5 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                                                            {n.evaluation}
                                                        </h5>
                                                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                            Coefficient : {n.coefficient}
                                                        </p>
                                                    </div>

                                                    {n.observation && (
                                                        <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'white', border: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                                                            Observation : {n.observation}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            Sélectionnez une matière pour voir ses notes.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
