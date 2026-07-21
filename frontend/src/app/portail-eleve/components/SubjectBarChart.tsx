'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import styles from '../portail-eleve.module.css';

interface SubjectBarChartProps {
    data: { name: string; avg: number }[];
    primaryColor: string;
}

export default function SubjectBarChart({ data, primaryColor }: SubjectBarChartProps) {
    if (data.length === 0) return null;

    const maxVal = 20;

    return (
        <div className={styles.barChartContainer}>
            <h6 className={styles.sectionHeader}>
                <div className={styles.sectionIcon} style={{ background: `${primaryColor}15`, color: primaryColor }}>
                    <BarChart3 size={16} />
                </div>
                Moyennes par matière
            </h6>
            <div className={styles.barList}>
                {data.map((item, i) => {
                    const pct = Math.max(0, Math.min((item.avg / maxVal) * 100, 100));
                    const barColor = item.avg >= 10 ? primaryColor : '#ef4444';

                    return (
                        <div key={i} className={styles.barRow}>
                            <span className={styles.barLabel} title={item.name}>{item.name}</span>
                            <div className={styles.barTrack}>
                                <motion.div
                                    className={styles.barFill}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.6, delay: i * 0.08 }}
                                    style={{ background: `linear-gradient(90deg, ${barColor}cc, ${barColor})` }}
                                />
                                <span className={styles.barValue}>{item.avg}/20</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
