'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Search, Users, School, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ClasseAppel {
    classe_id: number;
    classe_code: string;
    classe_libelle: string;
    effectif: number;
    enseignant_principal: string;
    appel_fait: boolean;
    nb_presents: number;
    nb_absents: number;
    demi_journee: string | null;
    taux_presence: number | null;
}

interface StatsAppel {
    date: string;
    total_classes: number;
    classes_appelees: number;
    classes_non_appelees: number;
}

export default function AppelDuJourPage() {
    const router = useRouter();
    const [dateCible, setDateCible] = useState<string>(new Date().toISOString().split('T')[0]);
    const [classes, setClasses] = useState<ClasseAppel[]>([]);
    const [stats, setStats] = useState<StatsAppel | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'TOUTES' | 'FAIT' | 'NON_FAIT'>('TOUTES');

    const fetchAppels = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/pointage-eleves/appel-du-jour?date_cible=${dateCible}`);
            setClasses(res.data.classes || []);
            setStats(res.data.stats || null);
        } catch (error) {
            console.error("Erreur lors de la récupération de l'appel du jour:", error);
            toast.error("Impossible de charger les données");
        } finally {
            setLoading(false);
        }
    }, [dateCible]);

    useEffect(() => {
        fetchAppels();
    }, [fetchAppels]);

    const filteredClasses = classes.filter(c => {
        const matchSearch = c.classe_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            c.enseignant_principal.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = filterStatus === 'TOUTES' ? true : 
                            (filterStatus === 'FAIT' ? c.appel_fait : !c.appel_fait);
        return matchSearch && matchStatus;
    });

    const getStatusColor = (taux: number | null) => {
        if (taux === null) return '#94a3b8'; // gris
        if (taux >= 90) return '#10b981'; // vert
        if (taux >= 75) return '#f59e0b'; // orange
        return '#ef4444'; // rouge
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: '"Inter", sans-serif' }}>
            {/* EN-TÊTE */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
                        Suivi de l'Appel du Jour
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '15px', margin: 0 }}>
                        Vérifiez si les enseignants ont effectué l'appel dans leurs classes.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input 
                            type="date" 
                            value={dateCible}
                            onChange={(e) => setDateCible(e.target.value)}
                            style={{ 
                                padding: '10px 14px 10px 38px', 
                                borderRadius: '12px', 
                                border: '1px solid #cbd5e1', 
                                fontSize: '14px', 
                                fontWeight: 600,
                                color: '#334155',
                                outline: 'none',
                                cursor: 'pointer',
                                background: 'white'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* KPI STATS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                            <School size={24} />
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Total Classes</p>
                            <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>{stats?.total_classes || 0}</h3>
                        </div>
                    </div>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                            <CheckCircle size={24} />
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Appel Fait</p>
                            <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>{stats?.classes_appelees || 0}</h3>
                        </div>
                    </div>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                            <XCircle size={24} />
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Appel Non Fait</p>
                            <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#1e293b' }}>{stats?.classes_non_appelees || 0}</h3>
                        </div>
                    </div>
                </div>
            </div>

            {/* FILTRES & RECHERCHE */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                        { id: 'TOUTES', label: 'Toutes les classes' },
                        { id: 'FAIT', label: 'Appel fait' },
                        { id: 'NON_FAIT', label: 'Appel non fait' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilterStatus(f.id as any)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                background: filterStatus === f.id ? '#1e293b' : '#f1f5f9',
                                color: filterStatus === f.id ? 'white' : '#64748b',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                
                <div style={{ position: 'relative', width: '300px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        type="text"
                        placeholder="Rechercher une classe, un prof..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 14px 10px 40px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            fontSize: '14px',
                            outline: 'none',
                            color: '#334155'
                        }}
                    />
                </div>
            </div>

            {/* LISTE DES CLASSES */}
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', background: 'white', borderRadius: '16px' }}>
                    <Loader2 size={40} className="animate-spin" color="#3b82f6" style={{ marginBottom: '16px' }} />
                    <p style={{ color: '#64748b', fontWeight: 500 }}>Chargement de l'appel du jour...</p>
                </div>
            ) : filteredClasses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                    <AlertTriangle size={48} color="#94a3b8" style={{ marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '18px', color: '#334155', marginBottom: '8px' }}>Aucune donnée</h3>
                    <p style={{ color: '#64748b', fontSize: '14px' }}>Aucune classe ne correspond à vos filtres pour cette date.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                    <AnimatePresence>
                        {filteredClasses.map((cls) => (
                            <motion.div
                                key={cls.classe_id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                style={{
                                    background: 'white',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    border: `1px solid ${cls.appel_fait ? '#ecfdf5' : '#fef2f2'}`,
                                    borderLeft: `4px solid ${cls.appel_fait ? '#10b981' : '#ef4444'}`,
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}
                            >
                                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{cls.classe_code}</h3>
                                            <span style={{ 
                                                padding: '4px 8px', 
                                                borderRadius: '6px', 
                                                fontSize: '11px', 
                                                fontWeight: 700, 
                                                background: cls.appel_fait ? '#ecfdf5' : '#fef2f2', 
                                                color: cls.appel_fait ? '#10b981' : '#ef4444' 
                                            }}>
                                                {cls.appel_fait ? 'FAIT' : 'NON FAIT'}
                                            </span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Users size={14} /> Prof. Principal: <span style={{ fontWeight: 600, color: '#334155' }}>{cls.enseignant_principal}</span>
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '10px' }}>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Effectif</p>
                                        <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{cls.effectif}</h4>
                                    </div>
                                </div>
                                
                                {cls.appel_fait ? (
                                    <div style={{ padding: '20px', background: '#fafafa', flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Présents</p>
                                                <h4 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#10b981' }}>{cls.nb_presents}</h4>
                                            </div>
                                            <div style={{ width: '1px', height: '30px', background: '#e2e8f0' }}></div>
                                            <div style={{ textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Absents/Retards</p>
                                                <h4 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>{cls.nb_absents}</h4>
                                            </div>
                                            <div style={{ width: '1px', height: '30px', background: '#e2e8f0' }}></div>
                                            <div style={{ textAlign: 'center' }}>
                                                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Taux</p>
                                                <h4 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: getStatusColor(cls.taux_presence) }}>{cls.taux_presence}%</h4>
                                            </div>
                                        </div>
                                        {/* Barre de progression */}
                                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${cls.taux_presence || 0}%`, 
                                                height: '100%', 
                                                background: getStatusColor(cls.taux_presence),
                                                borderRadius: '4px'
                                            }}></div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, background: '#fafafa' }}>
                                        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>
                                            En attente de saisie par le professeur
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
