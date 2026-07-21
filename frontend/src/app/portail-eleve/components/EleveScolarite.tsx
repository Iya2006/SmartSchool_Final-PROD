'use client';

import React from 'react';
import { CreditCard, Loader2, CheckCircle, Clock, AlertCircle, FileText, Download } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { FinanceData } from '../types';

interface EleveScolariteProps {
    financeData: FinanceData | null;
    loading: boolean;
    couleurPortail: string;
}

export default function EleveScolarite({ financeData, loading, couleurPortail }: EleveScolariteProps) {
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (!financeData) {
        return (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                <CreditCard size={40} className={styles.emptyStateIcon} />
                <p style={{ fontWeight: 650, color: '#475569' }}>Aucune donnée de scolarité disponible</p>
            </div>
        );
    }

    const pctPaye = financeData.taux;
    const statusColor = pctPaye >= 100 ? '#10b981' : pctPaye >= 50 ? '#f59e0b' : '#ef4444';

    const getStatutBadge = (statut: string) => {
        const map: Record<string, { color: string; bg: string; label: string }> = {
            PAYEE: { color: '#059669', bg: '#d1fae5', label: 'Payée' },
            PARTIELLE: { color: '#d97706', bg: '#fef3c7', label: 'Partielle' },
            IMPAYEE: { color: '#dc2626', bg: '#fee2e2', label: 'Impayée' },
        };
        return map[statut] || { color: '#64748b', bg: '#f1f5f9', label: statut };
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Scolarité & Finances</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Suivez vos factures et historique de paiements scolaires.</p>
            </div>

            {/* Finance summary banner */}
            <div className={styles.financeBanner}>
                <div className={styles.financeBannerContent}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CreditCard size={16} color="#ffffff" />
                        </div>
                        <p className={styles.financeBannerTitle} style={{ color: '#94a3b8' }}>Résumé Financier</p>
                    </div>
                    <div className={styles.financeStatsGrid}>
                        {[
                            { label: 'Total Facturé', value: financeData.total_factures },
                            { label: 'Montant Payé', value: financeData.total_paye },
                            { label: 'Reste à Payer', value: financeData.total_restant },
                        ].map((f, i) => (
                            <div key={i}>
                                <p className={styles.financeStatLabel}>{f.label}</p>
                                <p className={styles.financeStatValue}>
                                    {f.value.toLocaleString()} <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>GNF</span>
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className={styles.financeTauxWrapper}>
                    <p className={styles.financeTauxValue} style={{ color: statusColor }}>{pctPaye}%</p>
                    <p className={styles.financeTauxLabel}>Taux de paiement</p>
                    {/* Progress bar */}
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pctPaye, 100)}%`, height: '100%', background: statusColor, borderRadius: '3px', transition: 'width 0.6s ease' }} />
                    </div>
                </div>
            </div>

            <div className={styles.grid2col}>
                {/* Factures */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={14} color="#d97706" />
                        </div>
                        <h6 className={styles.cardHeaderTitle}>Mes Factures ({financeData.factures.length})</h6>
                    </div>
                    <div className={styles.cardContent}>
                        {financeData.factures.length === 0 ? (
                            <div className={styles.emptyState}>
                                <FileText size={24} className={styles.emptyStateIcon} />
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Aucune facture émise</p>
                            </div>
                        ) : (
                            financeData.factures.map((f, i) => {
                                const badge = getStatutBadge(f.statut);
                                const pct = f.montant_total > 0 ? Math.round((f.montant_paye / f.montant_total) * 100) : 0;

                                return (
                                    <div key={i} style={{ padding: '16px 20px', borderBottom: i < financeData.factures.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                            <div>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>Facture #{f.numero}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                                    {f.date ? new Date(f.date).toLocaleDateString('fr-FR') : ''}
                                                </p>
                                            </div>
                                            <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 750, background: badge.bg, color: badge.color }}>
                                                {badge.label}
                                            </span>
                                        </div>
                                        {/* Progress bar */}
                                        <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#10b981' : '#f59e0b', borderRadius: '3px', transition: 'width 0.6s ease' }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                                            <span>Payé: {f.montant_paye.toLocaleString()} GNF</span>
                                            <span>Total: {f.montant_total.toLocaleString()} GNF</span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Paiements */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={14} color="#059669" />
                        </div>
                        <h6 className={styles.cardHeaderTitle}>Historique des Paiements ({financeData.paiements.length})</h6>
                    </div>
                    <div className={styles.cardContent}>
                        {financeData.paiements.length === 0 ? (
                            <div className={styles.emptyState}>
                                <CreditCard size={24} className={styles.emptyStateIcon} />
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Aucun paiement enregistré</p>
                            </div>
                        ) : (
                            financeData.paiements.map((p, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', borderBottom: i < financeData.paiements.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <CheckCircle size={16} color="#059669" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                                            Reçu #{p.numero_recu}
                                        </p>
                                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
                                            {p.date ? new Date(p.date).toLocaleDateString('fr-FR') : ''} • {p.mode}
                                        </p>
                                    </div>
                                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#059669', flexShrink: 0 }}>
                                        {p.montant.toLocaleString()} GNF
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
