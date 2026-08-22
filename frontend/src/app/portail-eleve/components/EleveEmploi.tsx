'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Calendar, Clock, Loader2, MapPin, User, Utensils } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { CreneauEDT, SUBJECT_COLORS } from '../types';
import { chargerHoraires, creneauxDeLaJournee, joursAffichesEmploi, LIBELLE_JOUR, HORAIRES_DEFAUT, type Horaires } from '@/lib/horaires';

interface EleveEmploiProps {
    edtData: CreneauEDT[];
    loading: boolean;
    couleurPortail: string;
}

export default function EleveEmploi({ edtData, loading, couleurPortail }: EleveEmploiProps) {
    // Mêmes horaires configurés que l'admin, l'enseignant et le parent : tout
    // le monde voit exactement la même grille (mêmes créneaux, mêmes pauses).
    const [horaires, setHoraires] = useState<Horaires>(HORAIRES_DEFAUT);
    useEffect(() => { chargerHoraires().then(setHoraires).catch(() => {}); }, []);
    // Colonnes = jours ouvrés de l'école (samedi inclus si configuré), plus tout
    // jour où un cours existe réellement. Fini le lundi→vendredi figé.
    const joursAffiches = useMemo(
        () => joursAffichesEmploi(horaires.joursOuvres, edtData.map(c => c.jour)),
        [horaires, edtData]
    );
    const lignes = useMemo(() => {
        const debuts = new Map<string, string>();
        creneauxDeLaJournee(horaires).forEach(h => debuts.set(h.debut, h.fin));
        edtData.forEach(c => { if (c.heure_debut) debuts.set(c.heure_debut.slice(0, 5), (c.heure_fin || '').slice(0, 5)); });
        return Array.from(debuts.entries()).map(([debut, fin]) => ({ debut, fin })).sort((a, b) => a.debut.localeCompare(b.debut));
    }, [edtData, horaires]);

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

    const pauses = horaires.pauses?.length ? horaires.pauses : [{ debut: horaires.pauseDebut, fin: horaires.pauseFin }];

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
                            {joursAffiches.map(j => (
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
                                    {LIBELLE_JOUR[j]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lignes.map(({ debut: h, fin: endH }) => {
                          const pauseAvant = pauses.find(p => p.fin === h);
                          return (
                            <React.Fragment key={h}>
                            {pauseAvant && (
                                <tr>
                                    <td colSpan={joursAffiches.length + 1} style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#92400e', fontWeight: 700, background: '#fef3c7', borderRadius: '10px' }}>
                                        <Utensils size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> {pauseAvant.debut} — {pauseAvant.fin} • Pause
                                    </td>
                                </tr>
                            )}
                            <tr>
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
                                    <span style={{ verticalAlign: 'middle' }}>{h}<br /><span style={{ fontSize: '10px', opacity: 0.7 }}>{endH}</span></span>
                                </td>
                                {joursAffiches.map(jour => {
                                    const slot = edtData.find(c => c.jour === jour && c.heure_debut.slice(0, 5) === h);
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
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px',
                                                                        fontSize: '9px', 
                                                                        color: c.border, 
                                                                        fontWeight: 800,
                                                                        background: `${c.border}15`,
                                                                        padding: '1px 6px',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <MapPin size={9} /> {slot.salle}
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
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
