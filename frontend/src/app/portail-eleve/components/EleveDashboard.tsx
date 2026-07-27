'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
    Award, Calendar, Clock, CheckCircle, 
    BookOpen, CreditCard, MapPin 
} from 'lucide-react';
import styles from '../portail-eleve.module.css';
import { DashboardData, Tab, SUBJECT_COLORS } from '../types';
import DonutChart from './DonutChart';
import SubjectBarChart from './SubjectBarChart';

interface EleveDashboardProps {
    data: DashboardData;
    setActiveTab: (tab: Tab) => void;
    couleurPortail: string;
    messageBienvenue: string;
}

export default function EleveDashboard({ 
    data, 
    setActiveTab, 
    couleurPortail, 
    messageBienvenue 
}: EleveDashboardProps) {
    const eleveData = data.eleve;

    // Calculate indicators
    const pctPresence = data.taux_presence ?? 0;
    const pctPaye = data.finance?.taux ?? 0;
    const moyennePct = data.moyenne ? (data.moyenne / 20) * 100 : 0;

    // Calculate averages per subject from recent notes
    const validNotes = data.notes_recentes.filter(n => n.note !== null && !n.est_absent);
    const byMatiere: Record<string, { total: number; count: number }> = {};
    for (const n of validNotes) {
        if (!byMatiere[n.matiere]) byMatiere[n.matiere] = { total: 0, count: 0 };
        byMatiere[n.matiere].total += n.note || 0;
        byMatiere[n.matiere].count += 1;
    }
    const matieres = Object.entries(byMatiere).map(([name, d]) => ({ 
        name, 
        avg: Math.round((d.total / d.count) * 10) / 10 
    }));
    const topMat = [...matieres].sort((a, b) => b.avg - a.avg);

    const kpis = [
        { label: 'Moyenne Générale', value: data.moyenne ? `${data.moyenne}/20` : '—', icon: Award, color: couleurPortail, bg: `${couleurPortail}15` },
        { label: "Cours Aujourd'hui", value: data.cours_du_jour.length, icon: Calendar, color: '#3b82f6', bg: '#3b82f615' },
        { label: 'Absences', value: data.nb_absent, icon: Clock, color: '#f59e0b', bg: '#f59e0b15' },
        { label: 'Taux de Présence', value: `${data.taux_presence}%`, icon: CheckCircle, color: '#10b981', bg: '#10b98115' },
    ];

    const donuts = [
        { label: 'Moyenne Générale', pct: moyennePct, color: data.moyenne && data.moyenne >= 10 ? '#10b981' : '#ef4444', value: data.moyenne ? `${data.moyenne}` : '—', sub: 'sur 20' },
        { label: 'Assiduité', pct: pctPresence, color: couleurPortail, value: `${pctPresence}%`, sub: `${data.nb_present}P / ${data.nb_absent}A` },
        { label: 'Paiements', pct: pctPaye, color: '#f59e0b', value: `${pctPaye}%`, sub: 'soldé' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Banner */}
            <div 
                className={styles.banner}
                style={{ background: `linear-gradient(135deg, ${couleurPortail} 0%, ${couleurPortail}cc 100%)` }}
            >
                <div className={styles.bannerDecor1} />
                <div className={styles.bannerDecor2} />
                <div className={styles.bannerText}>
                    <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={styles.bannerTitle}>
                        Bonjour, {eleveData.prenom}
                    </motion.h1>
                    <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={styles.bannerSubtitle}>
                        {messageBienvenue}
                    </motion.p>
                </div>
                <div className={styles.bannerBadge}>
                    <div className={styles.statusDot} />
                    <span className={styles.bannerBadgeText}>Portail Actif</span>
                </div>
            </div>

            {/* KPIs */}
            <div className={styles.kpis}>
                {kpis.map((k, i) => (
                    <motion.div 
                        key={i} 
                        initial={{ opacity: 0, y: 12 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: i * 0.06 }}
                        className={styles.kpiCard}
                    >
                        <div>
                            <p className={styles.kpiLabel}>{k.label}</p>
                            <p className={styles.kpiValue}>{k.value}</p>
                        </div>
                        <div className={styles.kpiIconBox} style={{ background: k.bg, color: k.color }}>
                            <k.icon size={22} strokeWidth={2.5} />
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Main content grid (High Density layout) */}
            <div className={styles.grid2col}>
                {/* Left column: schedule of the day + donuts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Today's Classes */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${couleurPortail}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={14} color={couleurPortail} />
                            </div>
                            <h6 className={styles.cardHeaderTitle}>Cours d'aujourd'hui</h6>
                            <button onClick={() => setActiveTab('emploi')} className={styles.cardHeaderLink} style={{ color: couleurPortail }}>Voir planning</button>
                        </div>
                        <div className={styles.cardContent} style={{ padding: '8px 0' }}>
                            {data.cours_du_jour.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Calendar size={24} className={styles.emptyStateIcon} />
                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Aucun cours programmé aujourd'hui</p>
                                </div>
                            ) : (
                                data.cours_du_jour.map((c, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 20px', borderBottom: i < data.cours_du_jour.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: SUBJECT_COLORS[i % SUBJECT_COLORS.length].bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 750, color: SUBJECT_COLORS[i % SUBJECT_COLORS.length].text, flexShrink: 0 }}>
                                            {c.heure_debut}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.matiere}</p>
                                            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{c.heure_debut} – {c.heure_fin} • {c.enseignant}</p>
                                        </div>
                                        {c.salle && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', color: '#64748b', fontWeight: 600, flexShrink: 0 }}><MapPin size={12} /> {c.salle}</span>}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Donut Charts inside side column */}
                    <div className={styles.card} style={{ padding: '20px' }}>
                        <h6 style={{ margin: '0 0 16px 0', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mes Ratios de Réussite</h6>
                        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: '10px' }}>
                            {donuts.map((d, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                    <DonutChart pct={d.pct} color={d.color} value={d.value} label={d.sub} />
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>{d.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right column: recent grades + averages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Recent Grades */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BookOpen size={14} color="#6366f1" />
                            </div>
                            <h6 className={styles.cardHeaderTitle}>Notes récentes</h6>
                            <button onClick={() => setActiveTab('notes')} className={styles.cardHeaderLink} style={{ color: couleurPortail }}>Toutes les notes</button>
                        </div>
                        <div className={styles.cardContent} style={{ padding: '8px 0' }}>
                            {data.notes_recentes.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <BookOpen size={24} className={styles.emptyStateIcon} />
                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Aucune note enregistrée</p>
                                </div>
                            ) : (
                                data.notes_recentes.slice(0, 4).map((n, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: i < 3 ? '1px solid #f8fafc' : 'none' }}>
                                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: n.note !== null && n.note >= 10 ? '#d1fae5' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', color: n.note !== null && n.note >= 10 ? '#059669' : '#dc2626', flexShrink: 0 }}>
                                            {n.est_absent ? 'ABS' : n.note ?? '—'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.matiere}</p>
                                            <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{n.evaluation} • /{n.note_sur}</p>
                                        </div>
                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>{n.date ? new Date(n.date).toLocaleDateString('fr-FR') : ''}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Subject Averages Bar Chart */}
                    {matieres.length > 0 && (
                        <SubjectBarChart data={topMat.slice(0, 4)} primaryColor={couleurPortail} />
                    )}
                </div>
            </div>

            {/* Financial Overview (Scolarité summary) */}
            {data.finance && data.finance.total_factures > 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: 15 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: 0.12 }}
                    className={styles.financeBanner}
                >
                    <div className={styles.financeBannerContent}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CreditCard size={16} color="#ffffff" />
                            </div>
                            <p className={styles.financeBannerTitle} style={{ color: '#ffffff' }}>Situation Scolarité / Factures</p>
                        </div>
                        <div className={styles.financeStatsGrid}>
                            {[
                                { label: 'Total Facturé', value: data.finance.total_factures },
                                { label: 'Montant Payé', value: data.finance.total_paye },
                                { label: 'Reste à Payer', value: data.finance.total_restant },
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
                        <p className={styles.financeTauxValue} style={{ color: data.finance.taux >= 100 ? '#34d399' : '#fbbf24' }}>
                            {data.finance.taux}%
                        </p>
                        <p className={styles.financeTauxLabel}>Taux de paiement</p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
