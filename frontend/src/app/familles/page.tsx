'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Users, Phone, Mail, Briefcase, MapPin, ChevronRight, X, Edit3,
    Save, Loader2, Heart, GraduationCap, User2, Shield, Eye, CheckCircle,
    AlertCircle, Calendar, Hash, UserCheck, Filter, UserPlus, Home, Lock, KeyRound, ArrowLeft, Camera, ClipboardList
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Pagination from '@/components/Pagination';

interface Enfant {
    eleve_id: number; nom: string; prenom: string; matricule: string;
    sexe: string; date_naissance: string | null; lieu_naissance: string | null;
    classe: string; classe_code: string; lien_parente: string; statut: string;
}
interface ParentItem {
    parent_id: number; nom: string; prenom: string;
    telephone_1: string; telephone_2: string | null;
    email: string | null; profession: string | null; adresse: string | null;
    statut: string; has_password: boolean; nb_enfants: number; enfants: Enfant[];
    date_creation: string | null;
}

const avatarColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];
const LIEN_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
    PERE: { bg: '#dbeafe', color: '#2563eb', icon: '' },
    MERE: { bg: '#fce7f3', color: '#db2777', icon: '' },
    TUTEUR: { bg: '#fef3c7', color: '#d97706', icon: '' },
    TUTRICE: { bg: '#ede9fe', color: '#7c3aed', icon: '' },
};

export default function FamillesPage() {
    const router = useRouter();
    const [parents, setParents] = useState<ParentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedParent, setSelectedParent] = useState<ParentItem | null>(null);
    const [editParent, setEditParent] = useState<ParentItem | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState({ total_parents: 0, total_enfants: 0, avec_password: 0, avec_email: 0 });
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Chargée en une requête paginée + agrégats globaux côté serveur — avant,
    // les 2753 familles réelles de la base étaient TOUTES chargées d'un coup
    // (jusqu'à 4 requêtes SQL par parent côté backend), ce qui faisait timeout
    // la page ("0 enfant(s)" affiché car le fetch échouait silencieusement).
    const loadParents = useCallback(async () => {
        setLoading(true);
        try {
            const skip = (currentPage - 1) * pageSize;
            const res = await api.get(`/api/communication/parents/annuaire?skip=${skip}&limit=${pageSize}&search=${encodeURIComponent(search)}`);
            setParents(res.data.map((p: any) => ({
                ...p,
                date_creation: null,
            })));
            const totalCount = res.headers?.['x-total-count'];
            setTotal(totalCount !== undefined ? Number(totalCount) : res.data.length);
        } catch { setParents([]); setTotal(0); }
        finally { setLoading(false); }
    }, [currentPage, search]);

    useEffect(() => { loadParents(); }, [loadParents]);

    // Recherche : revenir à la page 1 pour éviter une page vide après filtrage
    useEffect(() => { setCurrentPage(1); }, [search]);

    useEffect(() => {
        api.get('/api/communication/parents/stats').then(res => setStats(res.data)).catch(() => {});
    }, []);

    const paginatedList = parents;

    // KPI stats — agrégats globaux (indépendants de la page/recherche courante)
    const totalParents = stats.total_parents;
    const totalEnfants = stats.total_enfants;
    const avecMdp = stats.avec_password;
    const avecEmail = stats.avec_email;

    const handleSave = async () => {
        if (!editParent) return;
        setSaving(true);
        try {
            await api.put(`/api/portail-parent/${editParent.parent_id}/profil`, editForm);
            setSuccessMsg('Profil mis à jour avec succès !');
            setTimeout(() => setSuccessMsg(''), 3000);
            setEditParent(null);
            loadParents();
        } catch { }
        finally { setSaving(false); }
    };

    const openEdit = (p: ParentItem) => {
        setEditForm({
            nom: p.nom, prenom: p.prenom,
            telephone_1: p.telephone_1, telephone_2: p.telephone_2 || '',
            email: p.email || '', profession: p.profession || '', adresse: p.adresse || '',
            mot_de_passe: '',
        });
        setEditParent(p);
    };

    const kpis = [
        { label: 'Total Familles', value: totalParents, icon: Users, color: '#6366f1' },
        { label: 'Total Enfants', value: totalEnfants, icon: GraduationCap, color: '#10b981' },
        { label: 'Comptes Sécurisés', value: avecMdp, icon: Shield, color: '#f59e0b' },
        { label: 'Avec Email', value: avecEmail, icon: Mail, color: '#3b82f6' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Breadcrumb + Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* ← Back button */}
                    <button
                        onClick={() => router.back()}
                        title="Retour"
                        style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            border: '1px solid var(--border-light)', background: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--text-secondary)',
                            transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--brand-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-light)'; }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="breadcrumb">
                        <Link href="/">Accueil</Link>
                        <ChevronRight size={14} />
                        <span>Académique</span>
                        <ChevronRight size={14} />
                        <span>Familles</span>
                    </div>
                </div>
            </div>

            {/* Success Toast */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ padding: '14px 20px', borderRadius: '12px', background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={16} /> {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* KPI Cards */}
            <div className="kpi-grid">
                {kpis.map((kpi, i) => (
                    <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p className="kpi-label">{kpi.label}</p>
                                <p className="kpi-value">{kpi.value}</p>
                            </div>
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <kpi.icon size={24} />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Featured Parent Cards */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '16px' }}>
                    {parents.slice(0, 6).map((p, i) => (
                        <motion.div key={p.parent_id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ y: -4, boxShadow: '0 8px 25px rgba(0,0,0,0.08)' }}
                            style={{
                                border: '1px solid var(--border-light)',
                                borderRadius: '16px', padding: '24px 16px',
                                textAlign: 'center', cursor: 'pointer',
                                background: 'white', transition: 'all 0.2s',
                            }}
                            onClick={() => setSelectedParent(p)}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: avatarColors[i % avatarColors.length],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '18px', fontWeight: 800, color: 'white',
                                margin: '0 auto 12px',
                                border: '3px solid white', boxShadow: `0 4px 12px ${avatarColors[i % avatarColors.length]}40`,
                            }}>
                                {p.prenom.charAt(0)}{p.nom.charAt(0)}
                            </div>
                            <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px' }}>{p.prenom} {p.nom}</p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{p.profession || 'Parent d\'élève'}</p>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '8px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: '#ede9fe', color: '#6366f1' }}>
                                    {p.nb_enfants} enfant(s)
                                </span>
                            </div>
                            <span className={`badge ${p.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px', marginTop: '6px' }}>
                                {p.statut}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* Parents Directory Table */}
            <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <div className="card-header">
                    <h5 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ClipboardList size={18} /> Répertoire des Familles</h5>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 14px', gap: '8px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input
                            type="text"
                            placeholder="Rechercher un parent..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                            style={{ border: 'none', outline: 'none', fontSize: '14px', width: '220px', background: 'transparent' }}
                        />
                    </div>
                </div>

                <div className="card-body" style={{ padding: 0 }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={32} className="animate-spin" color="var(--brand-primary)" />
                        </div>
                    ) : parents.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Users size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                            <p>Aucun parent trouvé</p>
                        </div>
                    ) : (
                        <>
                            <div className="table-scroll">
                            <table className="sp-table" style={{ minWidth: '640px' }}>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Parent</th>
                                        <th>Téléphone</th>
                                        <th>Profession</th>
                                        <th>Enfants</th>
                                        <th>Compte</th>
                                        <th>Statut</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedList.map((p, i) => (
                                        <motion.tr key={p.parent_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                                            <td style={{ color: 'var(--text-muted)' }}>{(currentPage - 1) * pageSize + i + 1}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '36px', height: '36px', borderRadius: '50%',
                                                        background: avatarColors[i % avatarColors.length],
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '13px', fontWeight: 700, color: 'white', flexShrink: 0,
                                                    }}>
                                                        {p.prenom.charAt(0)}{p.nom.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p style={{ fontWeight: 600 }}>{p.prenom} {p.nom}</p>
                                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.email || ''}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.telephone_1}</td>
                                            <td style={{ fontWeight: 500 }}>{p.profession || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {p.enfants.slice(0, 2).map(e => {
                                                        const lc = LIEN_COLORS[e.lien_parente] || LIEN_COLORS.TUTEUR;
                                                        return (
                                                            <span key={e.eleve_id} style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: lc.bg, color: lc.color }}>
                                                                {e.prenom}
                                                            </span>
                                                        );
                                                    })}
                                                    {p.enfants.length > 2 && (
                                                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: '#f1f5f9', color: '#64748b' }}>
                                                            +{p.enfants.length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${p.has_password ? 'badge-success' : 'badge-warning'}`}>
                                                    {p.has_password ? 'Sécurisé' : 'Non défini'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${p.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`}>{p.statut}</span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <Link href={`/familles/${p.parent_id}`} className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Voir le profil">
                                                        <Eye size={14} />
                                                    </Link>
                                                    <button onClick={() => openEdit(p)} className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Modifier">
                                                        <Edit3 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>

                            <Pagination page={currentPage} pageSize={pageSize} total={total} onPageChange={setCurrentPage} />
                        </>
                    )}
                </div>
            </motion.div>

            {/* ═══ DETAIL MODAL ═══ */}
            <AnimatePresence>
                {selectedParent && !editParent && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                        onClick={e => { if (e.target === e.currentTarget) setSelectedParent(null); }}>
                        <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
                            style={{ background: 'white', borderRadius: '24px', width: '700px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '32px', position: 'relative', color: 'white' }}>
                                <button onClick={() => setSelectedParent(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'white', backdropFilter: 'blur(10px)' }}>
                                    <X size={18} />
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800, backdropFilter: 'blur(10px)', border: '2px solid rgba(255,255,255,0.3)' }}>
                                            {selectedParent.prenom[0]}{selectedParent.nom[0]}
                                        </div>
                                        <button onClick={() => router.push(`/galerie?search=${encodeURIComponent(selectedParent.nom)}&tab=parents&highlight=${selectedParent.parent_id}`)}
                                            title="Gérer la photo dans la galerie"
                                            style={{
                                                position: 'absolute', bottom: -5, right: -5,
                                                width: '28px', height: '28px', borderRadius: '50%',
                                                background: '#f59e0b',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: '2px solid white', cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                            }}>
                                            <Camera size={14} color="white" />
                                        </button>
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>{selectedParent.prenom} {selectedParent.nom}</h2>
                                        <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.85 }}>{selectedParent.profession || 'Parent d\'élève'}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                                    {[
                                        { icon: <Phone size={14} />, label: selectedParent.telephone_1 },
                                        selectedParent.telephone_2 && { icon: <Phone size={14} />, label: selectedParent.telephone_2 },
                                        selectedParent.email && { icon: <Mail size={14} />, label: selectedParent.email },
                                        selectedParent.adresse && { icon: <MapPin size={14} />, label: selectedParent.adresse },
                                    ].filter(Boolean).map((item: any, i) => (
                                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', fontSize: '12px', fontWeight: 600, backdropFilter: 'blur(5px)' }}>
                                            {item.icon} {item.label}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{ padding: '16px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '10px' }}>
                                <button onClick={() => openEdit(selectedParent)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 700, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    <Edit3 size={14} /> Modifier le profil
                                </button>
                                <span style={{ padding: '10px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: selectedParent.has_password ? '#d1fae5' : '#fef3c7', color: selectedParent.has_password ? '#065f46' : '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Shield size={14} /> {selectedParent.has_password ? 'Mot de passe configuré' : 'Pas de mot de passe'}
                                </span>
                            </div>

                            {/* Children */}
                            <div style={{ padding: '24px 32px 32px' }}>
                                <h4 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <GraduationCap size={18} color="#6366f1" /> Enfants ({selectedParent.nb_enfants})
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {selectedParent.enfants.length === 0 ? (
                                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '12px' }}>
                                            <Users size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                                            <p style={{ fontSize: '13px', margin: 0 }}>Aucun enfant rattaché</p>
                                        </div>
                                    ) : selectedParent.enfants.map(e => {
                                        const lc = LIEN_COLORS[e.lien_parente] || LIEN_COLORS.TUTEUR;
                                        return (
                                            <div key={e.eleve_id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', borderRadius: '14px', border: '1px solid var(--border-light)', background: '#fafafa', transition: 'all 0.15s' }}
                                                onMouseOver={e2 => { e2.currentTarget.style.borderColor = '#6366f1'; e2.currentTarget.style.background = '#f5f3ff'; }}
                                                onMouseOut={e2 => { e2.currentTarget.style.borderColor = ''; e2.currentTarget.style.background = '#fafafa'; }}>
                                                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: e.sexe === 'M' ? 'linear-gradient(135deg, #3b82f6, #60a5fa)' : 'linear-gradient(135deg, #ec4899, #f472b6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                                                    {e.prenom[0]}{e.nom[0]}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{e.prenom} {e.nom}</p>
                                                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><Hash size={10} /> {e.matricule}</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><GraduationCap size={10} /> {e.classe}</span>
                                                    </div>
                                                </div>
                                                <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: lc.bg, color: lc.color }}>
                                                    {lc.icon} {e.lien_parente}
                                                </span>
                                                <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, background: e.statut === 'ACTIF' ? '#d1fae5' : '#fee2e2', color: e.statut === 'ACTIF' ? '#065f46' : '#dc2626' }}>
                                                    {e.statut}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ EDIT MODAL — PREMIUM ═══ */}
            <AnimatePresence>
                {editParent && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                        onClick={e => { if (e.target === e.currentTarget) setEditParent(null); }}>
                        <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25 }}
                            className="card" style={{ width: '720px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
                            {/* Card Header */}
                            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ padding: '10px', background: 'var(--brand-primary)', color: 'white', borderRadius: '10px' }}>
                                        <Edit3 size={20} />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            Modifier le profil parent
                                        </h2>
                                        <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                                            {editParent.prenom} {editParent.nom}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setEditParent(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Form Body */}
                            <div style={{ padding: '32px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    {[
                                        { key: 'prenom', label: 'Prénom *', type: 'text' },
                                        { key: 'nom', label: 'Nom de famille *', type: 'text' },
                                        { key: 'telephone_1', label: 'Téléphone principal *', type: 'tel' },
                                        { key: 'telephone_2', label: 'Téléphone secondaire', type: 'tel' },
                                        { key: 'email', label: 'Email', type: 'email' },
                                        { key: 'profession', label: 'Profession', type: 'text' },
                                    ].map(f => (
                                        <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>{f.label}</label>
                                            <input
                                                type={f.type}
                                                value={editForm[f.key] || ''}
                                                onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit' }}
                                            />
                                        </div>
                                    ))}
                                    {/* Adresse prend toute la largeur */}
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Adresse</label>
                                        <input
                                            type="text"
                                            value={editForm.adresse || ''}
                                            onChange={e => setEditForm({ ...editForm, adresse: e.target.value })}
                                            style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit' }}
                                        />
                                    </div>

                                    {/* Mot de passe — section séparée */}
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '20px', marginTop: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                            <KeyRound size={16} color="#f59e0b" />
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Sécurité du compte</span>
                                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, background: editParent.has_password ? '#d1fae5' : '#fee2e2', color: editParent.has_password ? '#065f46' : '#dc2626' }}>
                                                {editParent.has_password ? 'Configuré' : 'Non configuré'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {editParent.has_password ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Définir un mot de passe *'}
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                <input
                                                    type="password"
                                                    value={editForm.mot_de_passe || ''}
                                                    onChange={e => setEditForm({ ...editForm, mot_de_passe: e.target.value })}
                                                    placeholder={editParent.has_password ? '••••••••' : 'Entrez un mot de passe'}
                                                    style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '24px', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                    <button
                                        onClick={() => setEditParent(null)}
                                        style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
                                        Annuler
                                    </button>
                                    <button
                                        onClick={handleSave} disabled={saving}
                                        style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--brand-primary)', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', border: 'none', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', fontSize: '14px' }}>
                                        {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                                        {saving ? 'Enregistrement...' : 'Mettre à jour'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
