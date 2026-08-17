'use client';

import React from 'react';
import { FileText, Loader2, Printer, CheckCircle } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { BulletinData } from '../types';
import { useApp } from '@/context/AppContext';

interface EleveBulletinProps {
    bulletinData: BulletinData | null;
    // Périodes réelles de l'école : « Trimestre 1 / 2 / 3 » était écrit dans
    // le code, donc faux pour une école à deux semestres — et le numéro
    // affiché était envoyé comme identifiant de période. La valeur « annuel »
    // désigne le bulletin de fin d'année, qui ne porte pas de période.
    bulletinTrimestre: number | 'annuel' | null;
    setBulletinTrimestre: (sel: number | 'annuel') => void;
    periodes: { trimestre_id: number | null; libelle: string; statut: string; annuel?: boolean }[];
    loading: boolean;
    couleurPortail: string;
}

export default function EleveBulletin({
    bulletinData,
    bulletinTrimestre,
    setBulletinTrimestre,
    periodes,
    loading,
    couleurPortail,
}: EleveBulletinProps) {
    // Le bulletin porte le nom RÉEL de l'école (ex. GOTCHA), jamais « SmartSchool ».
    const { etablissementNom } = useApp();
    const nomEcole = etablissementNom || 'Mon École';
    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #bulletin-print, #bulletin-print * { visibility: visible !important; }
                    #bulletin-print { position: absolute; left: 0; top: 0; width: 100%; }
                    .no-print { display: none !important; }
                }
            `}</style>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Bulletin Scolaire</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Téléchargez et imprimez vos bulletins scolaires officiels.</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {periodes.map(p => {
                        const val: number | 'annuel' = p.annuel ? 'annuel' : (p.trimestre_id as number);
                        const actif = bulletinTrimestre === val;
                        return (
                        <button
                            key={p.annuel ? 'annuel' : `t${p.trimestre_id}`}
                            onClick={() => setBulletinTrimestre(val)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '10px',
                                border: p.annuel ? `1.5px solid ${couleurPortail}` : 'none',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '13px',
                                background: actif ? couleurPortail : '#f1f5f9',
                                color: actif ? 'white' : (p.annuel ? couleurPortail : '#64748b'),
                                transition: 'all 0.2s',
                                boxShadow: actif ? `0 4px 12px ${couleurPortail}25` : 'none'
                            }}
                        >
                            {p.libelle}
                        </button>
                        );
                    })}
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
            ) : bulletinData === null ? (
                <div className={styles.card} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <FileText size={40} className={styles.emptyStateIcon} />
                    <p style={{ fontWeight: 700, fontSize: '15px', color: '#475569' }}>Bulletin non disponible</p>
                    <p style={{ fontSize: '13px', margin: '4px 0 0' }}>Les notes de ce trimestre n'ont pas encore été publiées par l'administration.</p>
                </div>
            ) : (
                <div id="bulletin-print" className={styles.card} style={{ border: '1px solid #cbd5e1', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
                    {/* Header bulletin style document officiel */}
                    <div style={{ padding: '28px', borderBottom: '2px solid #e2e8f0', background: '#fafafa', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
                                    {bulletinData.trimestre.toUpperCase()}
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                    Classe : {bulletinData.classe}
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
                                    {nomEcole}
                                </p>
                            </div>
                            <div className="no-print" style={{ textAlign: 'right' }}>
                                <button 
                                    onClick={handlePrint}
                                    style={{ 
                                        padding: '8px 16px', 
                                        background: 'white', 
                                        border: '1px solid #cbd5e1', 
                                        borderRadius: '8px', 
                                        fontSize: '12.5px', 
                                        fontWeight: 700, 
                                        color: '#334155', 
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}
                                >
                                    <Printer size={14} /> Imprimer le bulletin
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table bulletin style pro */}
                    <div className={styles.tableContainer}>
                        <table className={styles.table} style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th className={styles.th} style={{ textAlign: 'left', background: 'white' }}>Enseignements / Matières</th>
                                    <th className={styles.th} style={{ textAlign: 'center', background: 'white' }}>Coef.</th>
                                    <th className={styles.th} style={{ textAlign: 'center', background: 'white', color: couleurPortail }}>Moy. Élève</th>
                                    <th className={styles.th} style={{ textAlign: 'center', background: 'white' }}>Moy. Classe</th>
                                    <th className={styles.th} style={{ textAlign: 'center', background: 'white' }}>Min.</th>
                                    <th className={styles.th} style={{ textAlign: 'center', background: 'white' }}>Max.</th>
                                    <th className={styles.th} style={{ textAlign: 'left', background: 'white' }}>Appréciations des Professeurs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bulletinData.matieres.map((m, i) => (
                                    <tr key={i} className={styles.tr}>
                                        <td className={styles.td} style={{ fontWeight: 700, color: '#1e293b', fontSize: '13px' }}>
                                            {m.matiere}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>
                                            {m.coefficient}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center' }}>
                                            <span 
                                                style={{ 
                                                    fontWeight: 900, 
                                                    fontSize: '14.5px', 
                                                    color: m.moyenne_eleve !== null && m.moyenne_eleve >= 10 ? '#059669' : '#dc2626' 
                                                }}
                                            >
                                                {m.moyenne_eleve !== null ? m.moyenne_eleve.toFixed(2) : '—'}
                                            </span>
                                            {m.lettre && (
                                                <span style={{ marginLeft: '6px', fontWeight: 800, fontSize: '13px', color: '#6366f1' }}>{m.lettre}</span>
                                            )}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>
                                            {m.moyenne_classe !== null ? m.moyenne_classe.toFixed(2) : '—'}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontSize: '12.5px', color: '#94a3b8' }}>
                                            {m.note_min !== null ? m.note_min.toFixed(2) : '—'}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontSize: '12.5px', color: '#94a3b8' }}>
                                            {m.note_max !== null ? m.note_max.toFixed(2) : '—'}
                                        </td>
                                        <td className={styles.td} style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic', maxWidth: '300px', lineHeight: 1.4 }}>
                                            {m.appreciation || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer summary */}
                    <div style={{ padding: '24px', borderTop: '2px solid #e2e8f0', background: '#fafafa', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Résultats Généraux</p>
                            <p style={{ margin: '6px 0 0', fontSize: '24px', fontWeight: 900, color: couleurPortail }}>
                                {bulletinData.moyenne_generale !== null ? `${bulletinData.moyenne_generale.toFixed(2)}/20` : '—'}
                            </p>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Rang et Effectif</p>
                            <p style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                                {bulletinData.rang ? `${bulletinData.rang}e sur ${bulletinData.effectif_classe}` : '—'}
                            </p>
                        </div>
                        {bulletinData.mention && (
                            <div>
                                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Mention</p>
                                <p style={{ margin: '6px 0 0', fontSize: '15px', fontWeight: 800, color: '#10b981' }}>
                                    {bulletinData.mention}
                                </p>
                            </div>
                        )}
                        {bulletinData.decision && (
                            <div>
                                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Décision du Conseil</p>
                                <p style={{ margin: '6px 0 0', fontSize: '14px', fontWeight: 850, color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle size={16} /> {bulletinData.decision}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Note explicative du calcul — transparence pédagogique */}
                    <p style={{ margin: 0, padding: '10px 24px 16px', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
                        Moyenne de chaque matière = somme (moyenne du type × coefficient du type) ÷ somme des coefficients de type.
                        La moyenne d&apos;un type est la moyenne de ses notes.
                        Moyenne générale = somme (moyenne matière × coefficient matière) ÷ somme des coefficients matières.
                    </p>
                </div>
            )}
        </div>
    );
}
