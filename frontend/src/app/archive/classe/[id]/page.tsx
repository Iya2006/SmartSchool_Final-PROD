'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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

interface BulletinRow {
    bulletin_id: number; eleve_id: number; nom: string; prenom: string; matricule: string;
    moyenne_generale: number | null; rang: number | null; effectif_classe: number | null;
    mention: string | null; decision: string | null; statut: string;
}
interface PresenceRow {
    presence_id: number; date: string; demi_journee: string; statut: string; justifie: string; matricule: string; eleve: string;
}
interface Trimestre { trimestre_id: number; libelle: string; numero: number; }

export default function ClasseArchivePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const classeId = params.id as string;
    const anneeIdParam = searchParams.get('annee_id');

    const [classe, setClasse] = useState<any>(null);
    const [annee, setAnnee] = useState<any>(null);
    const [eleves, setEleves] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('eleves');

    const [trimestres, setTrimestres] = useState<Trimestre[]>([]);
    const [selectedTrimestreId, setSelectedTrimestreId] = useState<number | null>(null);
    const [bulletins, setBulletins] = useState<BulletinRow[]>([]);
    const [bulletinsLoading, setBulletinsLoading] = useState(false);

    const [presences, setPresences] = useState<PresenceRow[]>([]);
    const [presencesLoading, setPresencesLoading] = useState(false);
    const [presencesLoaded, setPresencesLoaded] = useState(false);

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

                const anneeIdReel = clsRes.data?.annee_id || (anneeIdParam ? parseInt(anneeIdParam) : null);
                if (anneeIdReel) {
                    const [ansRes, trimRes] = await Promise.all([
                        api.get(`/api/parametrage/annees`),
                        api.get(`/api/parametrage/trimestres?annee_id=${anneeIdReel}`),
                    ]);
                    const yearInfo = ansRes.data?.find((a: any) => a.annee_id === anneeIdReel);
                    setAnnee(yearInfo);
                    const trims: Trimestre[] = trimRes.data || [];
                    setTrimestres(trims);
                    if (trims.length > 0) setSelectedTrimestreId(trims[0].trimestre_id);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [classeId, anneeIdParam]);

    useEffect(() => {
        if (!selectedTrimestreId || !classeId) { setBulletins([]); return; }
        setBulletinsLoading(true);
        api.get(`/api/evaluations/classe/${classeId}/bulletins?trimestre_id=${selectedTrimestreId}&limit=300`)
            .then(res => setBulletins(res.data || []))
            .catch(() => setBulletins([]))
            .finally(() => setBulletinsLoading(false));
    }, [selectedTrimestreId, classeId]);

    const chargerPresences = useCallback(() => {
        if (presencesLoaded || !classeId) return;
        setPresencesLoading(true);
        api.get(`/api/vie-scolaire/presences?classe_id=${classeId}`)
            .then(res => { setPresences(res.data || []); setPresencesLoaded(true); })
            .catch(() => setPresences([]))
            .finally(() => setPresencesLoading(false));
    }, [classeId, presencesLoaded]);

    useEffect(() => {
        if (activeTab === 'presences') chargerPresences();
    }, [activeTab, chargerPresences]);

    const presenceParEleve = useMemo(() => {
        const parMatricule = new Map<string, { eleve: string; absences: number; retards: number; total: number }>();
        for (const p of presences) {
            const entry = parMatricule.get(p.matricule) || { eleve: p.eleve, absences: 0, retards: 0, total: 0 };
            entry.total += 1;
            if (p.statut === 'ABSENT') entry.absences += 1;
            if (p.statut === 'RETARD') entry.retards += 1;
            parMatricule.set(p.matricule, entry);
        }
        return Array.from(parMatricule.entries()).map(([matricule, v]) => ({ matricule, ...v }));
    }, [presences]);

    const telechargerBulletin = async (bulletinId: number, nomEleve: string) => {
        try {
            const res = await api.get(`/api/evaluations/bulletins/${bulletinId}/pdf`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `bulletin_${nomEleve.replace(/\s+/g, '_')}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Erreur lors du téléchargement du bulletin.');
        }
    };

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
                                                    <Link href={`/archive/eleve/${el.eleve_id}?annee_id=${anneeIdParam || classe.annee_id}&classe_id=${classeId}`}
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
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Bulletins de la classe</h3>
                                    {trimestres.length > 0 && (
                                        <select value={selectedTrimestreId ?? ''} onChange={e => setSelectedTrimestreId(Number(e.target.value))}
                                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                                            {trimestres.map(t => <option key={t.trimestre_id} value={t.trimestre_id}>{t.libelle}</option>)}
                                        </select>
                                    )}
                                </div>
                                {bulletinsLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={24} className="animate-spin" color="#3b82f6" /></div>
                                ) : trimestres.length === 0 ? (
                                    <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                        <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#3b82f6' }} />
                                        <p style={{ margin: 0 }}>Aucun trimestre configuré pour cette année.</p>
                                    </div>
                                ) : bulletins.length === 0 ? (
                                    <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                        <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#3b82f6' }} />
                                        <p style={{ margin: 0 }}>Aucun bulletin généré pour ce trimestre.</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Élève</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Moyenne</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Rang</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Mention</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Statut</th>
                                                <th className="no-print" style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulletins.map(b => (
                                                <tr key={b.bulletin_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '14px 24px', fontWeight: 700 }}>{b.prenom} {b.nom} <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>({b.matricule})</span></td>
                                                    <td style={{ padding: '14px 24px' }}>{b.moyenne_generale != null ? `${b.moyenne_generale} / 20` : '—'}</td>
                                                    <td style={{ padding: '14px 24px' }}>{b.rang != null ? `${b.rang}${b.effectif_classe ? ` / ${b.effectif_classe}` : ''}` : '—'}</td>
                                                    <td style={{ padding: '14px 24px' }}>{b.mention || '—'}</td>
                                                    <td style={{ padding: '14px 24px' }}>
                                                        <span style={{ background: b.statut === 'PUBLIE' ? '#d1fae5' : '#f1f5f9', color: b.statut === 'PUBLIE' ? '#059669' : '#64748b', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>{b.statut}</span>
                                                    </td>
                                                    <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                                                        <button onClick={() => telechargerBulletin(b.bulletin_id, `${b.prenom}_${b.nom}`)}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#3b82f6', fontWeight: 700, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                                            <Download size={14} /> PDF
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Présences */}
                    {activeTab === 'presences' && (
                        <motion.div key="presences" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Résumé des présences — {annee?.libelle || ''}</h3>
                                </div>
                                {presencesLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={24} className="animate-spin" color="#10b981" /></div>
                                ) : presenceParEleve.length === 0 ? (
                                    <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                        <Calendar size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#10b981' }} />
                                        <p style={{ margin: 0 }}>Aucune présence enregistrée pour cette classe.</p>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Matricule</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Élève</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Présences enregistrées</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Absences</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Retards</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {presenceParEleve.map(row => (
                                                <tr key={row.matricule} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '14px 24px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{row.matricule}</td>
                                                    <td style={{ padding: '14px 24px', fontWeight: 700 }}>{row.eleve}</td>
                                                    <td style={{ padding: '14px 24px' }}>{row.total}</td>
                                                    <td style={{ padding: '14px 24px', color: row.absences > 0 ? '#b91c1c' : '#94a3b8', fontWeight: row.absences > 0 ? 700 : 400 }}>{row.absences}</td>
                                                    <td style={{ padding: '14px 24px', color: row.retards > 0 ? '#b45309' : '#94a3b8', fontWeight: row.retards > 0 ? 700 : 400 }}>{row.retards}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
