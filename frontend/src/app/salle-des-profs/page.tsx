'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Briefcase, BookOpen, Clock, Loader2, Search, ChevronDown, ChevronUp,
    Plus, X, Trash2, CheckCircle2, AlertCircle, UserCheck, Building, GraduationCap,
    ArrowLeft, TrendingUp
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

/* ─── Types ─── */
interface EnseignantInfo {
    enseignant_id: number;
    nom_complet: string;
    matricule: string;
    affectation_id: number;
}
interface MatiereClasse {
    matiere_id: number; code: string; libelle: string; categorie: string;
    coefficient: number; nb_heures: number;
    enseignant: EnseignantInfo | null;
}
interface ClasseAvecMatieres {
    classe_id: number; code: string; libelle: string;
    cycle: string; cycle_code: string; niveau: string;
    nb_matieres: number; nb_affectes: number;
    matieres: MatiereClasse[];
}
interface Stats {
    total_enseignants: number; enseignants_affectes: number; enseignants_non_affectes: number;
    total_affectations: number; total_heures_semaine: number;
    total_postes: number; postes_pourvus: number; postes_vacants: number; taux_couverture: number;
}
interface EnseignantItem {
    enseignant_id: number; matricule: string; nom: string; prenom: string; specialite: string | null;
}

const CYCLE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; gradient: string }> = {
    'PRM': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', badge: '🏫 Primaire', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
    'CLG': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', badge: '📘 Collège', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
    'LYC': { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6', badge: '🎓 Lycée', gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
};

export default function SalleDesProfsPage() {
    const { etablissementId, anneeId } = useApp();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);
    const [classesData, setClassesData] = useState<ClasseAvecMatieres[]>([]);
    const [enseignants, setEnseignants] = useState<EnseignantItem[]>([]);
    const [search, setSearch] = useState('');
    const [filterCycle, setFilterCycle] = useState('');
    const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalClasse, setModalClasse] = useState<ClasseAvecMatieres | null>(null);
    const [modalMatiere, setModalMatiere] = useState<MatiereClasse | null>(null);
    const [selectedEnseignantId, setSelectedEnseignantId] = useState(0);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [searchEns, setSearchEns] = useState('');

    const loadData = useCallback(async () => {
        try {
            const [statsRes, classesRes, ensRes] = await Promise.all([
                api.get(`/api/enseignants/salle-des-profs/stats?annee_id=${anneeId}`),
                api.get(`/api/enseignants/salle-des-profs/classes-matieres?etablissement_id=${etablissementId}`),
                api.get(`/api/enseignants?etablissement_id=${etablissementId}&skip=0&limit=200`),
            ]);
            setStats(statsRes.data);
            setClassesData(classesRes.data);
            setEnseignants(ensRes.data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [etablissementId, anneeId]);

    useEffect(() => { loadData(); }, [loadData]);

    const toggleExpand = (classId: number) => {
        setExpandedClasses(prev => {
            const next = new Set(prev);
            next.has(classId) ? next.delete(classId) : next.add(classId);
            return next;
        });
    };

    const expandAll = () => {
        setExpandedClasses(new Set(filteredClasses.map(c => c.classe_id)));
    };
    const collapseAll = () => setExpandedClasses(new Set());

    const openAssignModal = (classe: ClasseAvecMatieres, matiere: MatiereClasse) => {
        setModalClasse(classe);
        setModalMatiere(matiere);
        setSelectedEnseignantId(0);
        setSearchEns('');
        setShowModal(true);
    };

    const handleAssign = async () => {
        if (!modalClasse || !modalMatiere || !selectedEnseignantId) return;
        setSaving(true);
        try {
            await api.post(`/api/enseignants/${selectedEnseignantId}/affectations`, {
                classe_id: modalClasse.classe_id,
                matiere_id: modalMatiere.matiere_id,
                annee_id: anneeId,
            });
            setShowModal(false);
            setSuccessMsg('✅ Enseignant affecté avec succès !');
            setTimeout(() => setSuccessMsg(null), 3000);
            await loadData();
        } catch (e: any) {
            setErrorMsg(e.response?.data?.detail || 'Erreur lors de l\'affectation');
            setTimeout(() => setErrorMsg(null), 4000);
        } finally { setSaving(false); }
    };

    const handleRemove = async (affectationId: number) => {
        if (!confirm('Retirer cette affectation ?')) return;
        try {
            await api.delete(`/api/enseignants/affectations/${affectationId}`);
            setSuccessMsg('Affectation retirée.');
            setTimeout(() => setSuccessMsg(null), 2000);
            await loadData();
        } catch (e) { console.error(e); }
    };

    // Filters
    const filteredClasses = classesData.filter(c => {
        const matchSearch = !search || c.libelle.toLowerCase().includes(search.toLowerCase());
        const matchCycle = !filterCycle || c.cycle_code === filterCycle;
        return matchSearch && matchCycle;
    });

    // Group by cycle
    const groupedByCycle: Record<string, ClasseAvecMatieres[]> = {};
    filteredClasses.forEach(c => {
        const key = c.cycle_code || '—';
        if (!groupedByCycle[key]) groupedByCycle[key] = [];
        groupedByCycle[key].push(c);
    });
    const cycleOrder = ['PRM', 'CLG', 'LYC'];

    const filteredEnseignants = enseignants.filter(e =>
        `${e.prenom} ${e.nom} ${e.matricule} ${e.specialite || ''}`.toLowerCase().includes(searchEns.toLowerCase())
    );

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <Loader2 size={44} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link> <span>›</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Salle des Profs</span>
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Briefcase size={26} color="#6366f1" /> Salle des Profs
                    </h1>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                        Gérez les affectations des enseignants aux classes et matières
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={expandAll} className="btn btn-outline btn-sm" style={{ fontSize: '12px' }}>
                        <ChevronDown size={14} /> Tout Déplier
                    </button>
                    <button onClick={collapseAll} className="btn btn-outline btn-sm" style={{ fontSize: '12px' }}>
                        <ChevronUp size={14} /> Tout Replier
                    </button>
                </div>
            </div>

            {/* Notifications */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ padding: '12px 20px', borderRadius: '12px', background: '#d1fae5', color: '#065f46', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={16} /> {successMsg}
                    </motion.div>
                )}
                {errorMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ padding: '12px 20px', borderRadius: '12px', background: '#fee2e2', color: '#991b1b', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} /> {errorMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════ KPI STATS ═══════ */}
            {stats && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                    {[
                        { label: 'Enseignants Actifs', value: stats.total_enseignants, icon: <Users size={20} />, color: '#6366f1', bg: '#ede9fe' },
                        { label: 'Affectés', value: stats.enseignants_affectes, icon: <UserCheck size={20} />, color: '#10b981', bg: '#d1fae5' },
                        { label: 'Total Affectations', value: stats.total_affectations, icon: <Briefcase size={20} />, color: '#3b82f6', bg: '#dbeafe' },
                        { label: 'Postes Vacants', value: stats.postes_vacants, icon: <AlertCircle size={20} />, color: stats.postes_vacants > 0 ? '#ef4444' : '#10b981', bg: stats.postes_vacants > 0 ? '#fee2e2' : '#d1fae5' },
                        { label: 'Taux Couverture', value: `${stats.taux_couverture}%`, icon: <TrendingUp size={20} />, color: stats.taux_couverture >= 80 ? '#10b981' : '#f59e0b', bg: stats.taux_couverture >= 80 ? '#d1fae5' : '#fef3c7' },
                    ].map((kpi, i) => (
                        <div key={i} className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color, flexShrink: 0 }}>
                                {kpi.icon}
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{kpi.value}</p>
                                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</p>
                            </div>
                        </div>
                    ))}
                </motion.div>
            )}

            {/* ═══════ FILTERS ═══════ */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '400px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une classe..."
                        style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1.5px solid var(--border-light)', fontSize: '13px', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {[{ code: '', label: 'Tous' }, { code: 'PRM', label: '🏫 Primaire' }, { code: 'CLG', label: '📘 Collège' }, { code: 'LYC', label: '🎓 Lycée' }].map(f => (
                        <button key={f.code} onClick={() => setFilterCycle(f.code)}
                            style={{
                                padding: '7px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                border: filterCycle === f.code ? '2px solid #6366f1' : '1px solid var(--border-light)',
                                background: filterCycle === f.code ? '#ede9fe' : 'white',
                                color: filterCycle === f.code ? '#6366f1' : 'var(--text-secondary)',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, marginLeft: 'auto' }}>
                    {filteredClasses.length} classe{filteredClasses.length > 1 ? 's' : ''}
                </span>
            </div>

            {/* ═══════ CLASSES GROUPED BY CYCLE ═══════ */}
            {cycleOrder.filter(c => groupedByCycle[c]).map(cycleCode => {
                const classes = groupedByCycle[cycleCode];
                const colors = CYCLE_COLORS[cycleCode] || CYCLE_COLORS['CLG'];
                return (
                    <motion.div key={cycleCode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                        {/* Cycle Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
                            padding: '8px 16px', borderRadius: '10px', background: colors.bg,
                            borderLeft: `4px solid ${colors.border}`
                        }}>
                            <span style={{ fontWeight: 800, fontSize: '15px', color: colors.text }}>{colors.badge}</span>
                            <span style={{ fontSize: '12px', color: colors.text, opacity: 0.7 }}>
                                — {classes.length} classe{classes.length > 1 ? 's' : ''}
                            </span>
                        </div>

                        {/* Class Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                            {classes.map(cls => {
                                const isExpanded = expandedClasses.has(cls.classe_id);
                                const coverage = cls.nb_matieres > 0 ? Math.round(cls.nb_affectes / cls.nb_matieres * 100) : 0;
                                return (
                                    <div key={cls.classe_id} className="card" style={{ overflow: 'hidden' }}>
                                        {/* Class Row Header */}
                                        <div
                                            onClick={() => toggleExpand(cls.classe_id)}
                                            style={{
                                                padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px',
                                                cursor: 'pointer', transition: 'background 0.15s',
                                            }}
                                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '10px',
                                                background: colors.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontWeight: 800, fontSize: '14px', flexShrink: 0
                                            }}>
                                                {cls.code.substring(0, 3)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{cls.libelle}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                    {cls.nb_matieres} matière{cls.nb_matieres > 1 ? 's' : ''} • {cls.nb_affectes}/{cls.nb_matieres} affecté{cls.nb_affectes > 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            {/* Coverage bar */}
                                            <div style={{ width: '100px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: coverage === 100 ? '#10b981' : coverage > 50 ? '#f59e0b' : '#ef4444' }}>
                                                    {coverage}%
                                                </span>
                                                <div style={{ width: '100%', height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${coverage}%`, height: '100%', borderRadius: '3px',
                                                        background: coverage === 100 ? '#10b981' : coverage > 50 ? '#f59e0b' : '#ef4444',
                                                        transition: 'width 0.3s'
                                                    }} />
                                                </div>
                                            </div>
                                            {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                                        </div>

                                        {/* Expanded: Matières with affectation */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                                                    style={{ overflow: 'hidden', borderTop: '1px solid var(--border-light)' }}
                                                >
                                                    <div style={{ padding: '12px 20px' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                            <thead>
                                                                <tr>
                                                                    {['Matière', 'Catégorie', 'Coef', 'H/sem', 'Enseignant Affecté', ''].map((h, i) => (
                                                                        <th key={i} style={{
                                                                            padding: '8px 10px', fontSize: '11px', fontWeight: 700,
                                                                            color: 'var(--text-muted)', textAlign: 'left',
                                                                            borderBottom: '2px solid var(--border-light)',
                                                                            textTransform: 'uppercase', letterSpacing: '0.5px'
                                                                        }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {cls.matieres.map(mat => (
                                                                    <tr key={mat.matiere_id} style={{ borderBottom: '1px solid #f1f5f9' }}
                                                                        onMouseOver={e => e.currentTarget.style.background = '#fafbfd'}
                                                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                                                        <td style={{ padding: '10px', fontWeight: 600, fontSize: '13px' }}>{mat.libelle}</td>
                                                                        <td style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>{mat.categorie}</td>
                                                                        <td style={{ padding: '10px', fontSize: '12px', fontWeight: 600 }}>{mat.coefficient}</td>
                                                                        <td style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>{mat.nb_heures}h</td>
                                                                        <td style={{ padding: '10px' }}>
                                                                            {mat.enseignant ? (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    <div style={{
                                                                                        width: '28px', height: '28px', borderRadius: '50%',
                                                                                        background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                        color: 'white', fontWeight: 700, fontSize: '10px'
                                                                                    }}>
                                                                                        {mat.enseignant.nom_complet.split(' ').map(n => n[0]).join('').substring(0, 2)}
                                                                                    </div>
                                                                                    <div>
                                                                                        <p style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>{mat.enseignant.nom_complet}</p>
                                                                                        <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)' }}>{mat.enseignant.matricule}</p>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <button onClick={() => openAssignModal(cls, mat)}
                                                                                    style={{
                                                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                                                        padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                                                                                        background: '#fff7ed', color: '#ea580c', border: '1px dashed #fdba74',
                                                                                        cursor: 'pointer', transition: 'all 0.15s'
                                                                                    }}
                                                                                    onMouseOver={e => { e.currentTarget.style.background = '#ea580c'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderStyle = 'solid'; }}
                                                                                    onMouseOut={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.color = '#ea580c'; e.currentTarget.style.borderStyle = 'dashed'; }}
                                                                                >
                                                                                    <Plus size={12} /> Affecter
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '10px', width: '30px' }}>
                                                                            {mat.enseignant && (
                                                                                <button onClick={() => handleRemove(mat.enseignant!.affectation_id)}
                                                                                    style={{ padding: '4px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', opacity: 0.4, transition: 'opacity 0.15s' }}
                                                                                    onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                                                                    onMouseOut={e => e.currentTarget.style.opacity = '0.4'}
                                                                                    title="Retirer l'affectation">
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                );
            })}

            {filteredClasses.length === 0 && (
                <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
                    <Building size={48} style={{ opacity: 0.15, margin: '0 auto 12px' }} />
                    <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Aucune classe trouvée.</p>
                </div>
            )}

            {/* ═══════ MODAL: AFFECTER UN ENSEIGNANT ═══════ */}
            <AnimatePresence>
                {showModal && modalClasse && modalMatiere && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px'
                        }}
                        onClick={e => e.target === e.currentTarget && setShowModal(false)}
                    >
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                            {/* Modal Header */}
                            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '20px 24px', color: 'white' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Affecter un Enseignant</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.85 }}>
                                            {modalMatiere.libelle} → {modalClasse.libelle}
                                        </p>
                                    </div>
                                    <button onClick={() => setShowModal(false)}
                                        style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'white' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div style={{ padding: '20px 24px' }}>
                                {/* Info Box */}
                                <div style={{ background: '#f5f3ff', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#5b21b6', marginBottom: '16px', lineHeight: 1.6 }}>
                                    📘 <strong>{modalMatiere.libelle}</strong> — Coef {modalMatiere.coefficient} • {modalMatiere.nb_heures}h/sem
                                    <br/>🏫 Classe : <strong>{modalClasse.libelle}</strong> ({modalClasse.cycle})
                                </div>

                                {/* Search dans la liste */}
                                <div style={{ position: 'relative', marginBottom: '12px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input value={searchEns} onChange={e => setSearchEns(e.target.value)} placeholder="Rechercher un enseignant..."
                                        style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: '8px', border: '1.5px solid var(--border-light)', fontSize: '12px', outline: 'none', fontFamily: 'Inter, sans-serif' }} />
                                </div>

                                {/* Liste enseignants */}
                                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {filteredEnseignants.map(ens => (
                                        <button key={ens.enseignant_id}
                                            onClick={() => setSelectedEnseignantId(ens.enseignant_id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '10px 12px', borderRadius: '10px', textAlign: 'left',
                                                border: selectedEnseignantId === ens.enseignant_id ? '2px solid #6366f1' : '1px solid var(--border-light)',
                                                background: selectedEnseignantId === ens.enseignant_id ? '#ede9fe' : 'white',
                                                cursor: 'pointer', transition: 'all 0.15s', width: '100%'
                                            }}
                                        >
                                            <div style={{
                                                width: '32px', height: '32px', borderRadius: '50%',
                                                background: selectedEnseignantId === ens.enseignant_id ? '#6366f1' : '#e2e8f0',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: selectedEnseignantId === ens.enseignant_id ? 'white' : '#64748b',
                                                fontWeight: 700, fontSize: '11px', flexShrink: 0
                                            }}>
                                                {ens.prenom[0]}{ens.nom[0]}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                                                    {ens.prenom} {ens.nom}
                                                </p>
                                                <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    {ens.matricule} • {ens.specialite || 'Pas de spécialité'}
                                                </p>
                                            </div>
                                            {selectedEnseignantId === ens.enseignant_id && (
                                                <CheckCircle2 size={16} color="#6366f1" />
                                            )}
                                        </button>
                                    ))}
                                    {filteredEnseignants.length === 0 && (
                                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '12px' }}>Aucun enseignant trouvé.</p>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setShowModal(false)} className="btn btn-outline btn-sm">Annuler</button>
                                <button onClick={handleAssign}
                                    disabled={!selectedEnseignantId || saving}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                        background: !selectedEnseignantId ? '#e2e8f0' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                        color: !selectedEnseignantId ? '#94a3b8' : 'white',
                                        border: 'none', cursor: !selectedEnseignantId ? 'not-allowed' : 'pointer',
                                        boxShadow: selectedEnseignantId ? '0 4px 12px rgba(99,102,241,0.3)' : 'none'
                                    }}
                                >
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                                    {saving ? 'Affectation...' : 'Affecter'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
