'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Archive, BookOpen, Users, GraduationCap, Calendar,
    ChevronRight, Search, ArrowLeft, FolderOpen, User, FileText,
    Award, Loader2, Building2, Download, Printer, Phone, Mail, MapPin, Activity
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

export default function EleveArchivePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const eleveId = params.id as string;
    const anneeId = searchParams.get('annee_id');
    const classeId = searchParams.get('classe_id');

    const [eleve, setEleve] = useState<any>(null);
    const [annee, setAnnee] = useState<any>(null);
    const [inscriptions, setInscriptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('scolarite');
    const pdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadData = async () => {
            if (!eleveId) return;
            try {
                const res = await api.get(`/api/eleves/${eleveId}`);
                setEleve(res.data);
                
                if (anneeId) {
                    const ansRes = await api.get(`/api/parametrage/annees`);
                    const yearInfo = ansRes.data?.find((a: any) => a.annee_id === parseInt(anneeId));
                    setAnnee(yearInfo);
                }

                // For demonstration, we simulate fetching historical inscriptions
                // In a real system, you'd have an endpoint like /api/eleves/{id}/inscriptions
                setInscriptions([
                    { annee: '2025-2026', classe: 'Terminale SM', statut: 'En cours', moyenne: null, decision: null },
                    { annee: '2024-2025', classe: '11ème SM', statut: 'Terminée', moyenne: 14.5, decision: 'Admis(e)' },
                    { annee: '2023-2024', classe: '10ème', statut: 'Terminée', moyenne: 15.2, decision: 'Admis(e)' }
                ]);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [eleveId]);

    const photoSrc = eleve?.photo_url ? (eleve.photo_url.startsWith('http') ? eleve.photo_url : `${API_BASE}${eleve.photo_url}`) : null;
    const initials = eleve ? `${eleve.prenom.charAt(0)}${eleve.nom.charAt(0)}` : '';

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '16px' }}>
                <Loader2 size={40} color="#f59e0b" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ color: '#64748b' }}>Chargement du dossier...</p>
            </div>
        );
    }

    if (!eleve) {
        return (
            <div style={{ textAlign: 'center', padding: '64px', color: '#64748b' }}>
                <h2 style={{ color: '#0f172a' }}>Élève introuvable</h2>
                <button onClick={() => router.back()} className="btn btn-outline" style={{ marginTop: '16px' }}>Retour</button>
            </div>
        );
    }

    const tabs = [
        { id: 'scolarite', label: 'Parcours Scolaire', icon: GraduationCap },
        { id: 'bulletins', label: 'Livrelets & Bulletins', icon: FileText },
        { id: 'discipline', label: 'Discipline & Présences', icon: Activity },
    ];

    const handlePrint = () => {
        window.print();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }} ref={pdfRef}>
            {/* ── Header Dossier ── */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button onClick={() => router.back()} title="Retour"
                    style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <ArrowLeft size={18} />
                </button>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                        Dossier Archive : {eleve.matricule}
                    </h1>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={handlePrint} className="btn btn-outline" style={{ background: 'white' }}>
                            <Printer size={18} /> Imprimer
                        </button>
                        <button className="btn btn-primary" style={{ background: '#0f172a', color: 'white' }}>
                            <Download size={18} /> Exporter PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Identité (Printable) ── */}
            <div style={{ background: 'white', borderRadius: '20px', padding: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #f59e0b)' }} />
                
                <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                    {/* Photo */}
                    <div style={{ width: '140px', height: '140px', borderRadius: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
                        {photoSrc ? (
                            <img src={photoSrc} alt="Élève" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span style={{ fontSize: '48px', color: '#94a3b8', fontWeight: 800 }}>{initials}</span>
                        )}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '11px', textAlign: 'center', padding: '4px', fontWeight: 700 }}>
                            {eleve.statut}
                        </div>
                    </div>
                    
                    {/* Infos Principales */}
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <h2 style={{ fontSize: '32px', fontWeight: 900, color: '#0f172a', margin: '0 0 4px 0', textTransform: 'uppercase' }}>
                            {eleve.prenom} {eleve.nom}
                        </h2>
                        <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 24px 0', fontWeight: 500, letterSpacing: '0.5px' }}>
                            MATRICULE : <span style={{ color: '#0f172a', fontWeight: 800 }}>{eleve.matricule}</span> • SEXE : <span style={{ color: '#0f172a', fontWeight: 800 }}>{eleve.sexe}</span>
                        </p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                            <div>
                                <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Date & Lieu Naissance</p>
                                <p style={{ margin: 0, fontSize: '14px', color: '#334155', fontWeight: 600 }}>{eleve.date_naissance} à {eleve.lieu_naissance || 'Non renseigné'}</p>
                            </div>
                            <div>
                                <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Contact Parent / Urgence</p>
                                <p style={{ margin: 0, fontSize: '14px', color: '#334155', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Phone size={14} color="#f59e0b" /> {eleve.telephone || eleve.contact_urgence_tel || 'Aucun contact'}
                                </p>
                            </div>
                            <div>
                                <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Adresse</p>
                                <p style={{ margin: 0, fontSize: '14px', color: '#334155', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MapPin size={14} color="#f59e0b" /> {eleve.adresse || 'Non renseignée'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Tabs (No Print) ── */}
            <div className="no-print" style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', overflowX: 'auto' }}>
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
                    
                    {/* Tab: Parcours Scolaire */}
                    {activeTab === 'scolarite' && (
                        <motion.div key="scolarite" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Historique des Inscriptions</h3>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Année Scolaire</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Classe</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Statut</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Moyenne</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Décision</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inscriptions.map((insc, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}><Calendar size={14} style={{ display: 'inline', marginRight: '6px', color: '#94a3b8' }}/>{insc.annee}</td>
                                                <td style={{ padding: '16px 24px', fontWeight: 600, color: '#334155' }}>{insc.classe}</td>
                                                <td style={{ padding: '16px 24px' }}>
                                                    <span style={{ background: insc.statut === 'Terminée' ? '#e0f2fe' : '#dcfce7', color: insc.statut === 'Terminée' ? '#0284c7' : '#16a34a', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                                                        {insc.statut}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px 24px', fontWeight: 800, color: insc.moyenne ? '#0f172a' : '#cbd5e1' }}>{insc.moyenne ? `${insc.moyenne} / 20` : '—'}</td>
                                                <td style={{ padding: '16px 24px', fontWeight: 700, color: insc.decision === 'Admis(e)' ? '#10b981' : (insc.decision ? '#ef4444' : '#cbd5e1') }}>{insc.decision || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Bulletins */}
                    {activeTab === 'bulletins' && (
                        <motion.div key="bulletins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#3b82f6' }} />
                                <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '18px' }}>Livret Scolaire & Bulletins</h3>
                                <p style={{ margin: '0 0 24px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                                    Historique des livrets scolaires. Cliquez pour générer un livret annuel.
                                </p>
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                                    <button className="btn btn-outline" style={{ background: 'white' }}>
                                        <FileText size={18} /> Générer Livret {annee?.libelle}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Discipline */}
                    {activeTab === 'discipline' && (
                        <motion.div key="discipline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#ef4444' }} />
                                <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '18px' }}>Discipline & Assiduité</h3>
                                <p style={{ margin: 0 }}>Aucun incident disciplinaire majeur archivé.</p>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
            
            <style jsx global>{`
                @media print {
                    body { background: white !important; }
                    .no-print { display: none !important; }
                    .btn { display: none !important; }
                    @page { margin: 1cm; size: A4; }
                }
            `}</style>
        </div>
    );
}
