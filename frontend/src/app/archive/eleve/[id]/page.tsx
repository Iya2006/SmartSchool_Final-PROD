'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Archive, BookOpen, Users, GraduationCap, Calendar,
    ChevronRight, Search, ArrowLeft, FolderOpen, User, FileText,
    Award, Loader2, Building2, Download, Printer, Phone, Mail, MapPin, Activity,
    ShieldAlert, UserCheck
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import api from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

interface Inscription {
    inscription_id: number;
    annee_id: number;
    annee: string;
    annee_statut: string;
    en_cours: boolean;
    classe_id: number;
    classe: string;
    statut_inscription: string;
    type_inscription: string;
    moyenne_annuelle: number | null;
    total_points: number | null;
    rang_final: number | null;
    decision_fin_annee: string | null;
}

interface BulletinResume {
    bulletin_id: number; trimestre: string; moyenne_generale: number | null;
    rang: number | null; effectif_classe: number | null; mention: string | null; statut: string;
}

interface Dossier {
    bulletins: BulletinResume[];
    presence: { total: number; absences: number; retards: number };
    incidents: { incident_id: number; date: string; type: string; gravite: string; description: string; statut: string }[];
}

const DECISION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    ADMIS: { bg: '#d1fae5', color: '#059669', label: 'Admis(e)' },
    REDOUBLANT: { bg: '#fef3c7', color: '#b45309', label: 'Redoublant(e)' },
    DIPLOME: { bg: '#dbeafe', color: '#1d4ed8', label: 'Diplômé(e)' },
    EXCLU: { bg: '#fee2e2', color: '#b91c1c', label: 'Exclu(e)' },
};

export default function EleveArchivePage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const eleveId = params.id as string;
    const anneeIdParam = searchParams.get('annee_id');

    const [eleve, setEleve] = useState<any>(null);
    const [inscriptions, setInscriptions] = useState<Inscription[]>([]);
    const [selectedInscriptionId, setSelectedInscriptionId] = useState<number | null>(null);
    const [dossier, setDossier] = useState<Dossier | null>(null);
    const [dossierLoading, setDossierLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('scolarite');
    const pdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadData = async () => {
            if (!eleveId) return;
            try {
                const [eleveRes, inscRes] = await Promise.all([
                    api.get(`/api/eleves/${eleveId}`),
                    api.get(`/api/eleves/${eleveId}/inscriptions`),
                ]);
                setEleve(eleveRes.data);
                const historique: Inscription[] = inscRes.data || [];
                setInscriptions(historique);

                const parAnnee = anneeIdParam ? historique.find(i => i.annee_id === parseInt(anneeIdParam)) : null;
                const defaut = parAnnee || historique.find(i => i.en_cours) || historique[0];
                if (defaut) setSelectedInscriptionId(defaut.inscription_id);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [eleveId, anneeIdParam]);

    useEffect(() => {
        if (!selectedInscriptionId || !eleveId) { setDossier(null); return; }
        setDossierLoading(true);
        api.get(`/api/eleves/${eleveId}/dossier/${selectedInscriptionId}`)
            .then(res => setDossier(res.data))
            .catch(() => setDossier(null))
            .finally(() => setDossierLoading(false));
    }, [selectedInscriptionId, eleveId]);

    const telechargerBulletin = async (bulletinId: number, trimestre: string) => {
        try {
            const res = await api.get(`/api/evaluations/bulletins/${bulletinId}/pdf`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `bulletin_${eleve?.matricule || eleveId}_${trimestre}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Erreur lors du téléchargement du bulletin.');
        }
    };

    const inscriptionSelectionnee = inscriptions.find(i => i.inscription_id === selectedInscriptionId) || null;

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
        { id: 'bulletins', label: 'Livrets & Bulletins', icon: FileText },
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
                {inscriptionSelectionnee && (
                    <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#64748b' }}>
                        Dossier affiché : <strong>{inscriptionSelectionnee.annee}</strong> ({inscriptionSelectionnee.classe})
                    </span>
                )}
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
                                    <span className="no-print" style={{ fontSize: 12, color: '#94a3b8' }}>Cliquez une ligne pour ouvrir son dossier</span>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Année Scolaire</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Classe</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Statut</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Moyenne</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Rang</th>
                                            <th style={{ padding: '16px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Décision</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inscriptions.map((insc) => {
                                            const style = insc.decision_fin_annee ? (DECISION_STYLE[insc.decision_fin_annee] || null) : null;
                                            const selected = insc.inscription_id === selectedInscriptionId;
                                            return (
                                                <tr key={insc.inscription_id} onClick={() => setSelectedInscriptionId(insc.inscription_id)}
                                                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: selected ? '#eff6ff' : 'transparent' }}>
                                                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}><Calendar size={14} style={{ display: 'inline', marginRight: '6px', color: '#94a3b8' }} />{insc.annee}</td>
                                                    <td style={{ padding: '16px 24px', fontWeight: 600, color: '#334155' }}>{insc.classe}</td>
                                                    <td style={{ padding: '16px 24px' }}>
                                                        <span style={{ background: insc.en_cours ? '#dcfce7' : '#e0f2fe', color: insc.en_cours ? '#16a34a' : '#0284c7', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>
                                                            {insc.en_cours ? 'En cours' : 'Terminée'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '16px 24px', fontWeight: 800, color: insc.moyenne_annuelle != null ? '#0f172a' : '#cbd5e1' }}>{insc.moyenne_annuelle != null ? `${insc.moyenne_annuelle} / 20` : '—'}</td>
                                                    <td style={{ padding: '16px 24px', fontWeight: 700, color: insc.rang_final != null ? '#0f172a' : '#cbd5e1' }}>{insc.rang_final ?? '—'}</td>
                                                    <td style={{ padding: '16px 24px' }}>
                                                        {style ? (
                                                            <span style={{ background: style.bg, color: style.color, padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>{style.label}</span>
                                                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {inscriptions.length === 0 && (
                                            <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Aucune inscription trouvée pour cet élève.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Bulletins */}
                    {activeTab === 'bulletins' && (
                        <motion.div key="bulletins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                                        Bulletins — {inscriptionSelectionnee?.annee || '—'}
                                    </h3>
                                </div>
                                {dossierLoading ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={24} className="animate-spin" color="#3b82f6" /></div>
                                ) : dossier && dossier.bulletins.length > 0 ? (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Trimestre</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Moyenne</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Rang</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Mention</th>
                                                <th style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>Statut</th>
                                                <th className="no-print" style={{ padding: '14px 24px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dossier.bulletins.map(b => (
                                                <tr key={b.bulletin_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '14px 24px', fontWeight: 700 }}>{b.trimestre}</td>
                                                    <td style={{ padding: '14px 24px' }}>{b.moyenne_generale != null ? `${b.moyenne_generale} / 20` : '—'}</td>
                                                    <td style={{ padding: '14px 24px' }}>{b.rang != null ? `${b.rang}${b.effectif_classe ? ` / ${b.effectif_classe}` : ''}` : '—'}</td>
                                                    <td style={{ padding: '14px 24px' }}>{b.mention || '—'}</td>
                                                    <td style={{ padding: '14px 24px' }}>
                                                        <span style={{ background: b.statut === 'PUBLIE' ? '#d1fae5' : '#f1f5f9', color: b.statut === 'PUBLIE' ? '#059669' : '#64748b', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>{b.statut}</span>
                                                    </td>
                                                    <td className="no-print" style={{ padding: '14px 24px', textAlign: 'right' }}>
                                                        <button onClick={() => telechargerBulletin(b.bulletin_id, b.trimestre)}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#3b82f6', fontWeight: 700, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                                            <Download size={14} /> PDF
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                        <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#3b82f6' }} />
                                        <p style={{ margin: 0 }}>Aucun bulletin trouvé pour cette année.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* Tab: Discipline */}
                    {activeTab === 'discipline' && (
                        <motion.div key="discipline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {dossierLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 size={24} className="animate-spin" color="#ef4444" /></div>
                            ) : dossier ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                                        {[
                                            { label: 'Présences enregistrées', value: dossier.presence.total, color: '#3b82f6', icon: UserCheck },
                                            { label: 'Absences', value: dossier.presence.absences, color: '#ef4444', icon: Activity },
                                            { label: 'Retards', value: dossier.presence.retards, color: '#f59e0b', icon: Activity },
                                        ].map((kpi, i) => (
                                            <div key={i} style={{ background: 'white', borderRadius: '14px', padding: '18px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: kpi.color, color: 'white', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <kpi.icon size={18} />
                                                </div>
                                                <div>
                                                    <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{kpi.value}</p>
                                                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{kpi.label}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
                                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Incidents disciplinaires</h3>
                                        </div>
                                        {dossier.incidents.length === 0 ? (
                                            <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                                <ShieldAlert size={32} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                                                <p style={{ margin: 0 }}>Aucun incident disciplinaire enregistré pour cette année.</p>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {dossier.incidents.map(inc => (
                                                    <div key={inc.incident_id} style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                        <div>
                                                            <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{inc.type}</p>
                                                            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{inc.description}</p>
                                                        </div>
                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{inc.date}</p>
                                                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>{inc.gravite}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                    <Activity size={48} style={{ margin: '0 auto 16px', opacity: 0.3, color: '#ef4444' }} />
                                    <p style={{ margin: 0 }}>Sélectionnez une année dans l&apos;onglet Parcours Scolaire.</p>
                                </div>
                            )}
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
