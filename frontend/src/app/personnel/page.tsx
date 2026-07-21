'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import {
    Users, UserPlus, Search, Filter, Crown, Briefcase, BookOpen,
    Monitor, Shield, Building2, ChevronRight, Phone,
    Mail, Edit, Trash2, ToggleLeft, ToggleRight, X, AlertTriangle,
    TrendingUp, DollarSign, UserCheck, UserX, MoreVertical,
    GraduationCap, Key, Lock, Star, ChevronDown
} from 'lucide-react';

// ─── Définition des rôles SmartSchool V2 ───────────────────────────────────
const ROLES_CONFIG: Record<string, {
    label: string; icon: any; color: string; bg: string;
    gradient: string; description: string; hasAccess: boolean;
}> = {
    FONDATEUR: {
        label: 'Fondateur', icon: Crown,
        color: '#7c3aed', bg: '#f5f3ff', gradient: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
        description: 'Propriétaire et fondateur de l\'établissement', hasAccess: true
    },
    DG: {
        label: 'Directeur Général', icon: Building2,
        color: '#1d4ed8', bg: '#eff6ff', gradient: 'linear-gradient(135deg, #1d4ed8, #1e40af)',
        description: 'Direction générale de l\'établissement', hasAccess: true
    },
    DIRECTEUR_NIVEAU: {
        label: 'Directeur de Niveau', icon: GraduationCap,
        color: '#0369a1', bg: '#f0f9ff', gradient: 'linear-gradient(135deg, #0369a1, #075985)',
        description: 'Responsable d\'un cycle ou niveau scolaire', hasAccess: true
    },
    ADMIN: {
        label: 'Administrateur', icon: Shield,
        color: '#0f766e', bg: '#f0fdfa', gradient: 'linear-gradient(135deg, #0f766e, #134e4a)',
        description: 'Accès complet à l\'administration', hasAccess: true
    },
    COMPTABLE: {
        label: 'Comptable', icon: DollarSign,
        color: '#b45309', bg: '#fffbeb', gradient: 'linear-gradient(135deg, #b45309, #92400e)',
        description: 'Gestion financière et comptabilité', hasAccess: true
    },
    BIBLIOTHECAIRE: {
        label: 'Bibliothécaire', icon: BookOpen,
        color: '#7e22ce', bg: '#faf5ff', gradient: 'linear-gradient(135deg, #7e22ce, #6b21a8)',
        description: 'Gestion de la bibliothèque scolaire', hasAccess: true
    },
    INFORMATICIEN: {
        label: 'Informaticien', icon: Monitor,
        color: '#0284c7', bg: '#f0f9ff', gradient: 'linear-gradient(135deg, #0284c7, #0369a1)',
        description: 'Support technique et informatique', hasAccess: true
    },
    SURVEILLANT: {
        label: 'Surveillant', icon: UserCheck,
        color: '#16a34a', bg: '#f0fdf4', gradient: 'linear-gradient(135deg, #16a34a, #166534)',
        description: 'Surveillance et discipline scolaire', hasAccess: true
    },
    OPERATEUR: {
        label: 'Opérateur', icon: Key,
        color: '#475569', bg: '#f8fafc', gradient: 'linear-gradient(135deg, #475569, #334155)',
        description: 'Opérations de saisie et secrétariat', hasAccess: true
    },
    AGENT_ENTRETIEN: {
        label: 'Agent d\'Entretien', icon: Briefcase,
        color: '#92400e', bg: '#fff7ed', gradient: 'linear-gradient(135deg, #92400e, #78350f)',
        description: 'Nettoyage et entretien des locaux', hasAccess: false
    },
    GARDIEN: {
        label: 'Gardien', icon: Lock,
        color: '#374151', bg: '#f9fafb', gradient: 'linear-gradient(135deg, #374151, #1f2937)',
        description: 'Sécurité et gardiennage', hasAccess: false
    },
    CHAUFFEUR: {
        label: 'Chauffeur', icon: Star,
        color: '#0369a1', bg: '#f0f9ff', gradient: 'linear-gradient(135deg, #0369a1, #075985)',
        description: 'Transport scolaire', hasAccess: false
    },
    AUTRE: {
        label: 'Autre Personnel', icon: Users,
        color: '#6b7280', bg: '#f9fafb', gradient: 'linear-gradient(135deg, #6b7280, #4b5563)',
        description: 'Autre catégorie de personnel', hasAccess: false
    },
};

const ROLES_LIST = Object.keys(ROLES_CONFIG);

interface PersonnelMember {
    utilisateur_id: number;
    nom: string;
    prenom: string;
    sexe: string;
    telephone: string;
    email: string;
    role: string;
    roles_secondaires: string[];
    statut: string;
    nom_utilisateur: string | null;
    type_contrat: string;
    salaire_base: number;
    date_embauche: string | null;
}

interface Stats { role: string; total: number; masse_salariale: number; }

export default function PersonnelPage() {
    const { etablissementId } = useApp();
    const [personnel, setPersonnel] = useState<PersonnelMember[]>([]);
    const [stats, setStats] = useState<Stats[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQ, setSearchQ] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatut, setFilterStatut] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<PersonnelMember | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [openMenu, setOpenMenu] = useState<number | null>(null);

    const loadAll = useCallback(async () => {
        if (!etablissementId) return;
        setLoading(true);
        try {
            const [pRes, sRes] = await Promise.all([
                api.get('/api/personnel', {
                    params: {
                        etablissement_id: etablissementId,
                        role: filterRole || undefined,
                        statut: filterStatut || undefined,
                        q: searchQ || undefined,
                    }
                }),
                api.get('/api/personnel/stats', { params: { etablissement_id: etablissementId } })
            ]);
            setPersonnel(pRes.data);
            setStats(sRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [etablissementId, filterRole, filterStatut, searchQ]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleToggleStatut = async (p: PersonnelMember) => {
        setActionLoading(p.utilisateur_id);
        const newStatut = p.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
        try {
            await api.patch(`/api/personnel/${p.utilisateur_id}/statut`, null, {
                params: { statut: newStatut }
            });
            loadAll();
        } finally { setActionLoading(null); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(deleteTarget.utilisateur_id);
        try {
            await api.delete(`/api/personnel/${deleteTarget.utilisateur_id}`);
            setDeleteTarget(null);
            loadAll();
        } finally { setActionLoading(null); }
    };

    const formatMoney = (n: number) =>
        new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' GNF';

    const totalPersonnel = stats.reduce((s, r) => s + r.total, 0);
    const totalMasse = stats.reduce((s, r) => s + r.masse_salariale, 0);
    const totalActifs = personnel.filter(p => p.statut === 'ACTIF').length;
    const totalInactifs = personnel.filter(p => p.statut !== 'ACTIF').length;

    const getRoleConfig = (role: string) =>
        ROLES_CONFIG[role] || ROLES_CONFIG['AUTRE'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* ─── HEADER ─── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, background: 'linear-gradient(135deg, #1e293b, #475569)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Gestion du Personnel
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
                        {totalPersonnel} membre{totalPersonnel !== 1 ? 's' : ''} • {totalActifs} actif{totalActifs !== 1 ? 's' : ''} • Masse salariale : {formatMoney(totalMasse)}
                    </p>
                </div>
                <Link href="/personnel/nouveau" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '12px 22px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white', fontWeight: 700, fontSize: '14px',
                    textDecoration: 'none', boxShadow: '0 4px 14px rgba(59,130,246,0.4)',
                    transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(59,130,246,0.5)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,130,246,0.4)'; }}>
                    <UserPlus size={18} /> Nouveau Recrutement
                </Link>
            </div>

            {/* ─── STATS RÔLES ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                {/* Carte Tous */}
                <motion.div
                    whileHover={{ y: -3 }}
                    onClick={() => setFilterRole('')}
                    style={{
                        padding: '16px', borderRadius: '14px', cursor: 'pointer',
                        background: filterRole === '' ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'white',
                        border: '1px solid', borderColor: filterRole === '' ? 'transparent' : '#e2e8f0',
                        boxShadow: filterRole === '' ? '0 8px 20px rgba(59,130,246,0.3)' : '0 2px 6px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s'
                    }}>
                    <Users size={20} style={{ color: filterRole === '' ? 'rgba(255,255,255,0.9)' : '#64748b' }} />
                    <p style={{ margin: '8px 0 2px', fontSize: '22px', fontWeight: 800, color: filterRole === '' ? 'white' : '#0f172a' }}>{totalPersonnel}</p>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: filterRole === '' ? 'rgba(255,255,255,0.75)' : '#64748b' }}>Tout le personnel</p>
                </motion.div>

                {stats.map(stat => {
                    const cfg = getRoleConfig(stat.role);
                    const Icon = cfg.icon;
                    const isActive = filterRole === stat.role;
                    return (
                        <motion.div key={stat.role} whileHover={{ y: -3 }}
                            onClick={() => setFilterRole(isActive ? '' : stat.role)}
                            style={{
                                padding: '16px', borderRadius: '14px', cursor: 'pointer',
                                background: isActive ? cfg.gradient : 'white',
                                border: '1px solid', borderColor: isActive ? 'transparent' : '#e2e8f0',
                                boxShadow: isActive ? `0 8px 20px ${cfg.color}40` : '0 2px 6px rgba(0,0,0,0.05)',
                                transition: 'all 0.2s'
                            }}>
                            <Icon size={20} style={{ color: isActive ? 'rgba(255,255,255,0.9)' : cfg.color }} />
                            <p style={{ margin: '8px 0 2px', fontSize: '22px', fontWeight: 800, color: isActive ? 'white' : '#0f172a' }}>{stat.total}</p>
                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.75)' : '#64748b' }}>{cfg.label}</p>
                        </motion.div>
                    );
                })}
            </div>

            {/* ─── FILTRES ─── */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        placeholder="Rechercher par nom, téléphone…"
                        style={{
                            width: '100%', padding: '10px 10px 10px 36px',
                            borderRadius: '10px', border: '1px solid #e2e8f0',
                            fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                            background: 'white'
                        }}
                    />
                </div>
                <select
                    value={filterStatut}
                    onChange={e => setFilterStatut(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', cursor: 'pointer', background: 'white' }}>
                    <option value="">Tous les statuts</option>
                    <option value="ACTIF">Actif</option>
                    <option value="INACTIF">Inactif</option>
                    <option value="SUSPENDU">Suspendu</option>
                    <option value="CONGE">En congé</option>
                </select>
            </div>

            {/* ─── LISTE ─── */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', animation: 'spin 0.8s linear infinite' }} />
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            ) : personnel.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 40px', background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <Users size={36} style={{ color: '#94a3b8' }} />
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                        {filterRole || searchQ ? 'Aucun résultat trouvé' : 'Aucun personnel enregistré'}
                    </h3>
                    <p style={{ margin: '0 0 24px', color: '#64748b' }}>
                        {filterRole || searchQ ? 'Essayez de modifier vos filtres.' : 'Commencez par ajouter un premier membre du personnel.'}
                    </p>
                    {!filterRole && !searchQ && (
                        <Link href="/personnel/nouveau" style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '12px 22px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                            color: 'white', fontWeight: 600, textDecoration: 'none', fontSize: '14px'
                        }}>
                            <UserPlus size={16} /> Recruter un membre
                        </Link>
                    )}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                    <AnimatePresence>
                        {personnel.map(p => {
                            const cfg = getRoleConfig(p.role);
                            const Icon = cfg.icon;
                            const isActif = p.statut === 'ACTIF';
                            const initiales = `${p.prenom[0]}${p.nom[0]}`.toUpperCase();

                            return (
                                <motion.div
                                    key={p.utilisateur_id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    style={{
                                        background: 'white', borderRadius: '18px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                        overflow: 'hidden',
                                        transition: 'box-shadow 0.2s, transform 0.2s',
                                        opacity: isActif ? 1 : 0.7,
                                    }}
                                    onMouseOver={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)')}
                                    onMouseOut={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)')}
                                >
                                    {/* Bande colorée en haut */}
                                    <div style={{ height: '5px', background: cfg.gradient }} />

                                    <div style={{ padding: '20px' }}>
                                        {/* Header carte */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                            {/* Avatar */}
                                            <div style={{
                                                width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
                                                background: cfg.gradient,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: 'white', fontSize: '16px', fontWeight: 800,
                                                boxShadow: `0 4px 10px ${cfg.color}40`
                                            }}>
                                                {initiales}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {p.prenom} {p.nom}
                                                    </h3>
                                                    {/* Badge statut */}
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600,
                                                        background: isActif ? '#dcfce7' : '#fee2e2',
                                                        color: isActif ? '#166534' : '#991b1b'
                                                    }}>
                                                        {isActif ? '● Actif' : '● ' + p.statut}
                                                    </span>
                                                </div>
                                                {/* Rôle principal */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                    <div style={{ padding: '3px 8px', borderRadius: '6px', background: cfg.bg, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                        <Icon size={12} style={{ color: cfg.color }} />
                                                        <span style={{ fontSize: '12px', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                                                    </div>
                                                    {/* Rôles secondaires */}
                                                    {p.roles_secondaires?.map(rs => {
                                                        const rsCfg = getRoleConfig(rs);
                                                        return (
                                                            <div key={rs} style={{ padding: '3px 8px', borderRadius: '6px', background: rsCfg.bg, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: 600, color: rsCfg.color }}>+{rsCfg.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Menu actions */}
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={() => setOpenMenu(openMenu === p.utilisateur_id ? null : p.utilisateur_id)}
                                                    style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px', color: '#94a3b8', transition: 'background 0.15s' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                                    <MoreVertical size={18} />
                                                </button>
                                                <AnimatePresence>
                                                    {openMenu === p.utilisateur_id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.9, y: -5 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.9, y: -5 }}
                                                            style={{
                                                                position: 'absolute', right: 0, top: '36px', zIndex: 100,
                                                                background: 'white', borderRadius: '12px',
                                                                border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                                                minWidth: '180px', overflow: 'hidden'
                                                            }}>
                                                            <Link href={`/personnel/modifier/${p.utilisateur_id}`}
                                                                onClick={() => setOpenMenu(null)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', color: '#0f172a', textDecoration: 'none', fontSize: '14px', fontWeight: 500, transition: 'background 0.15s' }}
                                                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                                                <Edit size={15} style={{ color: '#3b82f6' }} /> Modifier
                                                            </Link>
                                                            <button
                                                                onClick={() => { handleToggleStatut(p); setOpenMenu(null); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', color: '#0f172a', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontSize: '14px', fontWeight: 500, transition: 'background 0.15s' }}
                                                                onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                                                {isActif ? <ToggleLeft size={15} style={{ color: '#f59e0b' }} /> : <ToggleRight size={15} style={{ color: '#10b981' }} />}
                                                                {isActif ? 'Désactiver' : 'Activer'}
                                                            </button>
                                                            <div style={{ height: '1px', background: '#f1f5f9' }} />
                                                            <button
                                                                onClick={() => { setDeleteTarget(p); setOpenMenu(null); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontSize: '14px', fontWeight: 500, transition: 'background 0.15s' }}
                                                                onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
                                                                onMouseOut={e => e.currentTarget.style.background = 'none'}>
                                                                <Trash2 size={15} /> Supprimer
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        {/* Infos contact */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                            {p.telephone && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569' }}>
                                                    <Phone size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                    <span>{p.telephone}</span>
                                                </div>
                                            )}
                                            {p.email && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569' }}>
                                                    <Mail size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                                    {p.nom_utilisateur ? (
                                                        <span style={{ padding: '3px 8px', background: '#f0fdf4', color: '#166534', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Key size={11} /> Accès système
                                                        </span>
                                                    ) : (
                                                        <span style={{ padding: '3px 8px', background: '#fef9c3', color: '#854d0e', borderRadius: '6px', fontWeight: 600 }}>
                                                            Sans accès
                                                        </span>
                                                    )}
                                                </div>
                                                {p.salaire_base > 0 && (
                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                                                        {formatMoney(p.salaire_base)}/mois
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* ─── MODAL SUPPRESSION ─── */}
            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setDeleteTarget(null)}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'white', borderRadius: '20px', padding: '32px',
                                width: '400px', maxWidth: '90vw',
                                boxShadow: '0 25px 50px rgba(0,0,0,0.2)'
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                                <div style={{ padding: '14px', background: '#fef2f2', borderRadius: '14px' }}>
                                    <AlertTriangle size={24} style={{ color: '#ef4444' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Confirmer la suppression</h3>
                                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>Cette action est irréversible.</p>
                                </div>
                            </div>
                            <p style={{ margin: '0 0 24px', color: '#475569', fontSize: '14px' }}>
                                Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget.prenom} {deleteTarget.nom}</strong> du personnel ?
                            </p>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
                                    Annuler
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={actionLoading !== null}
                                    style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#ef4444', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>
                                    Supprimer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Close menus on outside click */}
            {openMenu !== null && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                    onClick={() => setOpenMenu(null)}
                />
            )}
        </div>
    );
}
