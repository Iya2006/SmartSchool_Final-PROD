'use client';

import React from 'react';
import { ShoppingBag, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { FournitureItem } from '../types';

interface EleveFournituresProps {
    fournituresData: FournitureItem[];
    loading: boolean;
    couleurPortail: string;
}

export default function EleveFournitures({ fournituresData, loading, couleurPortail }: EleveFournituresProps) {
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} color={couleurPortail} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (fournituresData.length === 0) {
        return (
            <div className={styles.card} style={{ textAlign: 'center', padding: '60px' }}>
                <ShoppingBag size={40} className={styles.emptyStateIcon} style={{ color: couleurPortail }} />
                <p style={{ fontWeight: 650, color: '#475569' }}>Aucune fourniture requise</p>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>La liste des fournitures n'a pas encore été publiée.</p>
            </div>
        );
    }

    // Group by category
    const grouped: Record<string, FournitureItem[]> = {};
    for (const f of fournituresData) {
        const cat = f.categorie || 'Général';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(f);
    }

    const obligatoireCount = fournituresData.filter(f => f.obligatoire === 'OUI').length;
    const totalCount = fournituresData.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Fournitures Scolaires</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Liste complète des fournitures requises pour votre classe.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ padding: '6px 14px', borderRadius: '10px', background: '#d1fae5', color: '#059669', fontWeight: 700, fontSize: '12px' }}>
                        {obligatoireCount} obligatoire{obligatoireCount > 1 ? 's' : ''}
                    </span>
                    <span style={{ padding: '6px 14px', borderRadius: '10px', background: '#f1f5f9', color: '#64748b', fontWeight: 700, fontSize: '12px' }}>
                        {totalCount} au total
                    </span>
                </div>
            </div>

            {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${couleurPortail}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShoppingBag size={14} color={couleurPortail} />
                        </div>
                        <h6 className={styles.cardHeaderTitle}>{cat}</h6>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{items.length} article{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.th} style={{ textAlign: 'left' }}>Article</th>
                                    <th className={styles.th} style={{ textAlign: 'center' }}>Qté</th>
                                    <th className={styles.th} style={{ textAlign: 'center' }}>Unité</th>
                                    <th className={styles.th} style={{ textAlign: 'center' }}>Prix</th>
                                    <th className={styles.th} style={{ textAlign: 'center' }}>Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((f, i) => (
                                    <tr key={i} className={styles.tr}>
                                        <td className={styles.td}>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{f.nom}</p>
                                            {f.description && (
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{f.description}</p>
                                            )}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontWeight: 700, fontSize: '13px' }}>{f.quantite}</td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontSize: '12px', color: '#64748b' }}>{f.unite}</td>
                                        <td className={styles.td} style={{ textAlign: 'center', fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>
                                            {f.prix_unitaire ? `${f.prix_unitaire.toLocaleString()} GNF` : '—'}
                                        </td>
                                        <td className={styles.td} style={{ textAlign: 'center' }}>
                                            {f.obligatoire === 'OUI' ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', background: '#fee2e2', color: '#dc2626', fontSize: '10px', fontWeight: 750 }}>
                                                    <AlertCircle size={10} /> Obligatoire
                                                </span>
                                            ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', background: '#f1f5f9', color: '#64748b', fontSize: '10px', fontWeight: 700 }}>
                                                    <CheckCircle size={10} /> Facultatif
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
}
