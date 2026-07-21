'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Archive, BookOpen, Users, GraduationCap, Calendar,
    ChevronRight, Search, ArrowLeft, FolderOpen, User, FileText,
    Award, Loader2, Building2, Download, CheckCircle, XCircle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

export default function ClasseArchivePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const classeId = params.id as string;
    const anneeId = searchParams.get('annee_id');

    const [classe, setClasse] = useState<any>(null);
    const [annee, setAnnee] = useState<any>(null);
    const [eleves, setEleves] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('eleves');

    useEffect(() => {
        const loadData = async () => {
            if (!classeId) return;
            try {
                const [clsRes, elvRes] = await Promise.all([
                    api.get(`/api/classes/${classeId}`),
                    api.get(`/api/classes/${classeId}/eleves`)
                ]);
                setClasse(clsRes.data);
                setEleves(elvRes.data);

                // Fetch year detail if anneeId is present
                if (anneeId) {
                    const ansRes = await api.get(`/api/parametrage/annees`);
                    const yearInfo = ansRes.data?.find((a: any) => a.annee_id === parseInt(anneeId));
                    setAnnee(yearInfo);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [classeId, anneeId]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
                <Loader2 size={40} color="#f59e0b" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ color: '#64748b' }}>Ouverture du classeur...</p>
            </div>
        );
    }

    if (!classe) {
        return (
            <div style={{ textAlign: 'center', padding: '64px', color: '#64748b' }}>
                <h2 style={{ color: '#0f172a' }}>Classe introuvable</h2>
                <button onClick={() => router.back()} className="btn btn-outline" style={{ marginTop: '16px' }}>Retour</button>
            </div>
        );
    }

    const tabs = [
        { id: 'eleves', label: 'Élèves & Dossiers', icon: Users },
        { id: 'bulletins', label: 'Bulletins', icon: FileText },
        { id: 'presences', label: 'Présences', icon: Calendar },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* ── Header ── */}
            <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '20px', padding: '32px', color: 'white', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(0,0,0,0) 70%)', borderRadius: '50%' }}></div>
                <div style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                    
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                        <button onClick={() => router.back()} title="Retour"
                            style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', border: 'none', backdropFilter: 'blur(4px)', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <FolderOpen size={28} color="#f59e0b" />
                                <h1 style={{ fontSize: '32px', fontWeight: 800, margin: 0 }}>Classeur : {classe.libelle}</h1>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', opacity: 0.8 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={16} /> {annee?.libelle || 'Année inconnue'}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={16} /> {eleves.length} Élèves inscrits</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn" style={{ background: 'white', color: '#0f172a', fontWeight: 600, border: 'none' }}>
                            <Download size={18} /> Exporter le Registre
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', overflowX: 'auto' }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                            background: activeTab === tab.id ? '#1e293b' : 'transparent',
                            color: activeTab === tab.id ? 'white' : '#64748b',
                            borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}>
                        <tab.icon size={18} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Content ── */}
            <div style={{ minHeight: '400px' }}>
                <AnimatePresence mode="wait">
                    
                    {/* Tab: Élèves */}
                    {activeTab === 'eleves' && (
                        <motion.div key="eleves" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Matricule</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Élève</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Statut</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {eleves.map(el => (
                                            <tr key={el.eleve_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px 24px', fontWeight: 600, color: '#0f172a' }}>{el.matricule}</td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 700, fontSize: '14px' }}>
                                                            {el.prenom.charAt(0)}{el.nom.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>{el.prenom} {el.nom}</p>
                                                            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>{el.sexe}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: el.statut_inscription === 'ACTIVE' ? '#dcfce7' : '#f1f5f9', color: el.statut_inscription === 'ACTIVE' ? '#16a34a' : '#64748b', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
                                                        {el.statut_inscription === 'ACTIVE' ? <CheckCircle size={14} /> : <XCircle size={14} />} {el.statut_inscription}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                    <Link href={`/archive/eleve/${el.eleve_id}?annee_id=${anneeId}&classe_id=${classeId}`}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f8fafc', color: '#0f172a', padding: '8px 16px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '13px', border: '1px solid #e2e8f0' }}>
                                                        <User size={16} /> Ouvrir Dossier
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {eleves.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                                        <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                        <p style={{ margin: 0, fontWeight: 600 }}>Aucun élève trouvé pour cette classe.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Bulletins */}
                    {activeTab === 'bulletins' && (
                        <motion.div key="bulletins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#3b82f6' }} />
                                <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '18px' }}>Archives des Bulletins</h3>
                                <p style={{ margin: '0 0 24px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                                    Pour générer ou consulter les bulletins de cette classe pour cette année, veuillez utiliser le module standard de gestion des bulletins.
                                </p>
                                <Link href={`/bulletins?classe_id=${classeId}&annee_id=${anneeId}`} className="btn btn-primary" style={{ display: 'inline-flex' }}>
                                    Aller aux Bulletins
                                </Link>
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Présences */}
                    {activeTab === 'presences' && (
                        <motion.div key="presences" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                <Calendar size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#10b981' }} />
                                <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '18px' }}>Registre d'Appel</h3>
                                <p style={{ margin: 0 }}>Bientôt disponible. Les registres d'appel passés seront affichés ici.</p>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
