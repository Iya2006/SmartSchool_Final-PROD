'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Archive, BookOpen, Users, GraduationCap, Calendar,
    ChevronRight, Search, ArrowLeft, FolderOpen, TrendingUp,
    Award, Loader2, Building2
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

export default function ArchivePage() {
    const router = useRouter();
    const { etablissementId } = useApp();

    const [annees, setAnnees] = useState<any[]>([]);
    const [selectedAnnee, setSelectedAnnee] = useState<any>(null);
    const [classes, setClasses] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingClasses, setLoadingClasses] = useState(false);
    const [stats, setStats] = useState({ totalEleves: 0, totalClasses: 0, totalAnnees: 0 });

    // Load all academic years
    useEffect(() => {
        const loadAnnees = async () => {
            try {
                const res = await api.get(`/api/parametrage/annees?etablissement_id=${etablissementId}`);
                const data = res.data || [];
                setAnnees(data.sort((a: any, b: any) => b.annee_id - a.annee_id));
                if (data.length > 0) {
                    setSelectedAnnee(data.sort((a: any, b: any) => b.annee_id - a.annee_id)[0]);
                }
                setStats(s => ({ ...s, totalAnnees: data.length }));
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadAnnees();
    }, []);

    // Load classes for selected year
    useEffect(() => {
        if (!selectedAnnee) return;
        const loadClasses = async () => {
            setLoadingClasses(true);
            try {
                const res = await api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${selectedAnnee.annee_id}&statut=`);
                const data = res.data || [];
                setClasses(data);
                setStats(s => ({ ...s, totalClasses: data.length }));
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingClasses(false);
            }
        };
        loadClasses();
    }, [selectedAnnee, etablissementId]);

    const filtered = classes.filter(c =>
        c.libelle?.toLowerCase().includes(search.toLowerCase()) ||
        c.code?.toLowerCase().includes(search.toLowerCase())
    );

    const cycleColors: Record<string, string> = {
        'PRIMAIRE': '#10b981',
        'SECONDAIRE': '#3b82f6',
        'LYCEE': '#8b5cf6',
        'COLLEGE': '#f59e0b',
        'DEFAULT': '#6366f1',
    };

    const getColor = (libelle: string = '') => {
        const up = libelle.toUpperCase();
        for (const key of Object.keys(cycleColors)) {
            if (up.includes(key)) return cycleColors[key];
        }
        return cycleColors['DEFAULT'];
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
                <Loader2 size={40} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ color: '#64748b' }}>Chargement des archives...</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={() => router.back()} title="Retour"
                        style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ background: 'linear-gradient(135deg, #1e293b, #334155)', color: 'white', padding: '10px', borderRadius: '12px' }}>
                                <Archive size={22} />
                            </div>
                            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Archive Scolaire</h1>
                        </div>
                        <p style={{ margin: '4px 0 0 52px', fontSize: '14px', color: '#64748b' }}>
                            Classeur numérique permanent — {stats.totalAnnees} année(s) archivée(s)
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Global KPIs ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                {[
                    { label: 'Années Scolaires', value: annees.length, icon: Calendar, color: '#1e293b', bg: '#f8fafc' },
                    { label: 'Classes (année sél.)', value: classes.length, icon: Building2, color: '#3b82f6', bg: '#eff6ff' },
                    { label: 'Effectif Total', value: classes.reduce((s, c) => s + (c.effectif_actuel || 0), 0), icon: Users, color: '#10b981', bg: '#f0fdf4' },
                    { label: 'Bulletins Générés', value: '—', icon: GraduationCap, color: '#8b5cf6', bg: '#faf5ff' },
                ].map((kpi, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                        style={{ background: kpi.bg, borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ background: kpi.color, color: 'white', width: '42px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <kpi.icon size={20} />
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>{kpi.value}</p>
                            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{kpi.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* ── Year Selector ── */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '20px 24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <Calendar size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Sélectionner l'Année Scolaire
                </h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {annees.map((annee) => (
                        <button key={annee.annee_id} onClick={() => setSelectedAnnee(annee)}
                            style={{
                                padding: '8px 18px', borderRadius: '50px', border: '2px solid',
                                borderColor: selectedAnnee?.annee_id === annee.annee_id ? '#1e293b' : '#e2e8f0',
                                background: selectedAnnee?.annee_id === annee.annee_id ? '#1e293b' : 'white',
                                color: selectedAnnee?.annee_id === annee.annee_id ? 'white' : '#475569',
                                cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}>
                            {annee.est_courante === 'O' && <span style={{ fontSize: '10px', background: '#10b981', color: 'white', padding: '1px 6px', borderRadius: '10px' }}>EN COURS</span>}
                            {annee.libelle || annee.code}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Classes Grid ── */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                        <FolderOpen size={20} style={{ marginRight: '8px', verticalAlign: 'middle', color: '#f59e0b' }} />
                        Classeurs des Classes — {selectedAnnee?.libelle || selectedAnnee?.code || ''}
                    </h2>
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Rechercher une classe..."
                            style={{ paddingLeft: '36px', paddingRight: '16px', height: '38px', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', outline: 'none', width: '220px', background: 'white' }}
                        />
                    </div>
                </div>

                {loadingClasses ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: '#94a3b8' }}>
                        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '64px 24px', background: 'white', borderRadius: '16px', border: '1px dashed #e2e8f0', color: '#94a3b8' }}>
                        <Archive size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Aucune classe trouvée</p>
                        <p style={{ margin: '4px 0 0', fontSize: '13px' }}>Sélectionnez une autre année scolaire</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                        {filtered.map((cls, i) => {
                            const color = getColor(cls.libelle);
                            return (
                                <motion.div key={cls.classe_id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    style={{
                                        background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0',
                                        overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                        cursor: 'default'
                                    }}
                                    whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                                    {/* Color bar top */}
                                    <div style={{ height: '5px', background: `linear-gradient(90deg, ${color}, ${color}99)` }} />
                                    <div style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${color}30`, flexShrink: 0 }}>
                                                    <BookOpen size={20} color={color} />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{cls.libelle}</h3>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Code: {cls.code}</p>
                                                </div>
                                            </div>
                                            <span style={{ background: cls.statut === 'ACTIVE' ? '#dcfce7' : '#fef2f2', color: cls.statut === 'ACTIVE' ? '#16a34a' : '#dc2626', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>
                                                {cls.statut}
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                                            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                                <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{cls.effectif_actuel || 0}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Élèves</p>
                                            </div>
                                            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                                <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{cls.capacite_max || '—'}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Capacité</p>
                                            </div>
                                        </div>
                                        <Link href={`/archive/classe/${cls.classe_id}?annee_id=${selectedAnnee?.annee_id}`}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                                background: '#0f172a', color: 'white', textDecoration: 'none',
                                                padding: '10px', borderRadius: '10px', fontWeight: 600, fontSize: '14px',
                                                transition: 'background 0.2s'
                                            }}>
                                            <FolderOpen size={16} /> Ouvrir le Classeur
                                            <ChevronRight size={16} />
                                        </Link>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
