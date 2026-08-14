'use client';

import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import api from '@/lib/api';
import { useApp } from '@/context/AppContext';
import { getRoleInterfaceSummary } from '@/lib/roleAccess';
import Pagination from '@/components/Pagination';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BookOpen,
    Briefcase,
    Building2,
    CheckCircle2,
    Crown,
    DollarSign,
    Edit,
    Eye,
    GraduationCap,
    Key,
    Lock,
    Mail,
    MoreVertical,
    Monitor,
    Phone,
    Search,
    Shield,
    Sparkles,
    Star,
    ToggleLeft,
    ToggleRight,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
    XCircle,
} from 'lucide-react';

const ROLES_CONFIG: Record<string, {
    label: string;
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    color: string;
    bg: string;
    gradient: string;
    description: string;
    hasAccess: boolean;
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

interface Stats {
    role: string;
    total: number;
    masse_salariale: number;
    actifs: number;
    avec_acces: number;
}

function formatMoney(n: number) {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n || 0) + ' GNF';
}

function formatCompactMoney(value: number) {
    const n = Number(value || 0);
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Md`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
    return `${n}`;
}

function formatDate(dateValue?: string | null) {
    if (!dateValue) return 'Non précisée';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function getStatusTone(statut: string) {
    switch (statut) {
        case 'ACTIF':
            return { bg: '#dcfce7', color: '#166534', label: 'Actif' };
        case 'INACTIF':
            return { bg: '#fee2e2', color: '#991b1b', label: 'Inactif' };
        case 'SUSPENDU':
            return { bg: '#fef3c7', color: '#92400e', label: 'Suspendu' };
        case 'CONGE':
            return { bg: '#dbeafe', color: '#1d4ed8', label: 'En congé' };
        default:
            return { bg: '#e2e8f0', color: '#475569', label: statut };
    }
}

export default function PersonnelPage() {
    const { etablissementId } = useApp();
    const isMobile = useIsMobile();
    const [personnel, setPersonnel] = useState<PersonnelMember[]>([]);
    const [stats, setStats] = useState<Stats[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQ, setSearchQ] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatut, setFilterStatut] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<PersonnelMember | null>(null);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [openMenu, setOpenMenu] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [total, setTotal] = useState(0);
    const pageSize = 50;

    // Paginé côté serveur — un établissement à grand effectif ne doit jamais
    // tout charger d'un coup (avant, /api/personnel n'avait aucune limite).
    const loadAll = useCallback(async () => {
        if (!etablissementId) return;
        setLoading(true);
        try {
            const skip = (currentPage - 1) * pageSize;
            const [pRes, sRes] = await Promise.all([
                api.get('/api/personnel', {
                    params: {
                        etablissement_id: etablissementId,
                        role: filterRole || undefined,
                        statut: filterStatut || undefined,
                        q: searchQ || undefined,
                        skip,
                        limit: pageSize,
                    }
                }),
                api.get('/api/personnel/stats', { params: { etablissement_id: etablissementId } })
            ]);
            setPersonnel(pRes.data);
            const totalCount = pRes.headers?.['x-total-count'];
            setTotal(totalCount !== undefined ? Number(totalCount) : pRes.data.length);
            setStats(sRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [etablissementId, filterRole, filterStatut, searchQ, currentPage]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // Recherche/filtre : revenir à la page 1 pour éviter une page vide après filtrage
    useEffect(() => { setCurrentPage(1); }, [filterRole, filterStatut, searchQ]);

    const handleToggleStatut = async (p: PersonnelMember) => {
        setActionLoading(p.utilisateur_id);
        const newStatut = p.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
        try {
            await api.patch(`/api/personnel/${p.utilisateur_id}/statut`, null, {
                params: { statut: newStatut }
            });
            loadAll();
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(deleteTarget.utilisateur_id);
        try {
            await api.delete(`/api/personnel/${deleteTarget.utilisateur_id}`);
            setDeleteTarget(null);
            loadAll();
        } finally {
            setActionLoading(null);
        }
    };

    // Agrégats calculés sur `stats` (toujours global, un total par rôle sur
    // TOUT l'établissement) et non plus sur `personnel` (désormais une seule
    // page de 50 lignes) — sinon ces chiffres n'auraient reflété que la page
    // affichée à l'écran au lieu de l'effectif réel de l'école.
    const totalPersonnel = stats.reduce((s, r) => s + r.total, 0);
    const totalMasse = stats.reduce((s, r) => s + r.masse_salariale, 0);
    const totalActifs = stats.reduce((s, r) => s + (r.actifs || 0), 0);
    const totalInactifs = totalPersonnel - totalActifs;
    const totalAvecAcces = stats.reduce((s, r) => s + (r.avec_acces || 0), 0);
    const totalSansAcces = totalPersonnel - totalAvecAcces;
    const totalSansInterface = stats.reduce((s, r) => {
        return s + (!getRoleInterfaceSummary(r.role).hasSystemAccess ? r.total : 0);
    }, 0);
    const totalPortailsMetier = stats.reduce((s, r) => {
        const summary = getRoleInterfaceSummary(r.role);
        const estPortailMetier = summary.hasSystemAccess && summary.redirectPath !== '/dashboard' && !summary.redirectPath.startsWith('/portail-parent') && !summary.redirectPath.startsWith('/portail-eleve') && !summary.redirectPath.startsWith('/portail-enseignant');
        return s + (estPortailMetier ? r.total : 0);
    }, 0);

    const getRoleConfig = (role: string) => ROLES_CONFIG[role] || ROLES_CONFIG.AUTRE;

    const dominantRoles = useMemo(() => {
        return [...stats]
            .sort((a, b) => b.total - a.total)
            .slice(0, 4)
            .map((item) => {
                const cfg = getRoleConfig(item.role);
                return {
                    ...item,
                    cfg,
                };
            });
    }, [stats]);

    const accessDistribution = useMemo(() => {
        return [
            { label: 'Avec accès', value: totalAvecAcces, color: '#16a34a' },
            { label: 'Sans accès', value: totalSansAcces, color: '#f59e0b' },
            { label: 'RH uniquement', value: totalSansInterface, color: '#64748b' },
        ];
    }, [totalAvecAcces, totalSansAcces, totalSansInterface]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section
                style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '32px',
                    padding: '28px',
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 38%, #1d4ed8 100%)',
                    color: 'white',
                    boxShadow: '0 28px 70px rgba(15, 23, 42, 0.18)',
                }}
            >
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(255,255,255,0.14), transparent 24%), radial-gradient(circle at bottom left, rgba(16,185,129,0.18), transparent 28%)' }} />
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.35fr) minmax(320px, 0.9fr)', gap: '24px', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            <Sparkles size={14} /> Centre de contrôle RH
                        </span>

                        <div>
                            <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 3vw, 3rem)', fontWeight: 900, letterSpacing: '-0.04em' }}>
                                Pilotage premium du personnel
                            </h1>
                            <p style={{ margin: '12px 0 0', fontSize: '15px', lineHeight: 1.8, color: 'rgba(255,255,255,0.8)', maxWidth: '760px' }}>
                                Supervisez les effectifs, les accès système, les rôles métier et la distribution des interfaces depuis une vue RH plus moderne, plus claire et réellement décisionnelle.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                            {[
                                {
                                    label: 'Effectif total',
                                    value: totalPersonnel,
                                    note: `${totalActifs} actifs`,
                                    icon: Users,
                                },
                                {
                                    label: 'Accès système',
                                    value: totalAvecAcces,
                                    note: `${totalSansAcces} hors système`,
                                    icon: Key,
                                },
                                {
                                    label: 'Portails métier',
                                    value: totalPortailsMetier,
                                    note: 'interfaces dédiées',
                                    icon: Activity,
                                },
                                {
                                    label: 'Masse salariale',
                                    value: formatCompactMoney(totalMasse),
                                    note: 'GNF consolidés',
                                    icon: DollarSign,
                                },
                            ].map((item) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} style={{ padding: '18px', borderRadius: '22px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)' }}>
                                        <div style={{ width: 44, height: 44, borderRadius: '14px', background: 'rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center', marginBottom: '12px' }}>
                                            <Icon size={18} />
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.64)' }}>{item.label}</p>
                                        <p style={{ margin: '8px 0 2px', fontSize: '26px', fontWeight: 900 }}>{item.value}</p>
                                        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.74)' }}>{item.note}</p>
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <Link href="/personnel/nouveau" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 18px', borderRadius: '16px', background: 'white', color: '#0f172a', fontWeight: 800, textDecoration: 'none', boxShadow: '0 16px 34px rgba(255,255,255,0.16)' }}>
                                <UserPlus size={18} /> Nouveau recrutement
                            </Link>
                            <button type="button" onClick={loadAll} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 18px', borderRadius: '16px', background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.14)', fontWeight: 700, cursor: 'pointer' }}>
                                <Eye size={18} /> Actualiser la vue
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ padding: '20px', borderRadius: '24px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.65)', fontWeight: 800 }}>Santé opérationnelle RH</p>
                                    <h3 style={{ margin: '6px 0 0', fontSize: '22px', fontWeight: 900 }}>{totalActifs >= totalInactifs ? 'Structure stable' : 'Réorganisation recommandée'}</h3>
                                </div>
                                <div style={{ padding: '10px 14px', borderRadius: 999, background: totalActifs >= totalInactifs ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)', color: totalActifs >= totalInactifs ? '#bbf7d0' : '#fde68a', fontSize: '12px', fontWeight: 800 }}>
                                    {totalActifs >= totalInactifs ? 'Opérations stables' : 'À surveiller'}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {accessDistribution.map((item) => {
                                    const width = totalPersonnel > 0 ? `${Math.max(8, (item.value / totalPersonnel) * 100)}%` : '0%';
                                    return (
                                        <div key={item.label}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                                                <span style={{ color: 'rgba(255,255,255,0.76)' }}>{item.label}</span>
                                                <strong style={{ color: 'white' }}>{item.value}</strong>
                                            </div>
                                            <div style={{ height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                                <div style={{ width, height: '100%', borderRadius: '999px', background: item.color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ padding: '20px', borderRadius: '24px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Rôles dominants</h3>
                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>Répartition active</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {dominantRoles.length > 0 ? dominantRoles.map((item) => {
                                    const Icon = item.cfg.icon;
                                    return (
                                        <div key={item.role} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', borderRadius: '16px', background: 'rgba(15,23,42,0.18)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: 38, height: 38, borderRadius: '12px', background: item.cfg.gradient, display: 'grid', placeItems: 'center' }}>
                                                    <Icon size={16} style={{ color: 'white' }} />
                                                </div>
                                                <div>
                                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>{item.cfg.label}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.68)' }}>{formatMoney(item.masse_salariale)} cumulés</p>
                                                </div>
                                            </div>
                                            <strong style={{ fontSize: '20px' }}>{item.total}</strong>
                                        </div>
                                    );
                                }) : (
                                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: '13px' }}>Aucune donnée de rôle disponible pour le moment.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                {[
                    { label: 'Personnel total', value: totalPersonnel, note: `${totalActifs} actifs • ${totalInactifs} non actifs`, bg: 'linear-gradient(135deg, #eff6ff, #ffffff)', color: '#2563eb', icon: Users },
                    { label: 'Accès système', value: totalAvecAcces, note: `${totalSansAcces} sans accès logiciel`, bg: 'linear-gradient(135deg, #f0fdf4, #ffffff)', color: '#16a34a', icon: Key },
                    { label: 'RH uniquement', value: totalSansInterface, note: 'sans portail numérique', bg: 'linear-gradient(135deg, #f8fafc, #ffffff)', color: '#475569', icon: Lock },
                    { label: 'Masse salariale', value: formatMoney(totalMasse), note: 'vision RH consolidée', bg: 'linear-gradient(135deg, #fff7ed, #ffffff)', color: '#c2410c', icon: DollarSign },
                ].map((card) => {
                    const Icon = card.icon;
                    return (
                        <motion.div key={card.label} whileHover={{ y: -4 }} style={{ padding: '18px', borderRadius: '24px', background: card.bg, border: '1px solid #e2e8f0', boxShadow: '0 16px 32px rgba(15,23,42,0.05)' }}>
                            <div style={{ width: 42, height: 42, borderRadius: '14px', background: `${card.color}14`, color: card.color, display: 'grid', placeItems: 'center', marginBottom: '12px' }}>
                                <Icon size={18} />
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>{card.label}</p>
                            <p style={{ margin: '10px 0 4px', fontSize: '24px', fontWeight: 900, color: card.color }}>{card.value}</p>
                            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{card.note}</p>
                        </motion.div>
                    );
                })}
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '18px' }}>
                <div style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', padding: '22px', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', backdropFilter: 'blur(18px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Segmentation</p>
                            <h2 style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Répartition par rôle</h2>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', background: '#f8fafc', color: '#64748b', fontSize: '12px', fontWeight: 700 }}>
                            <Activity size={14} /> Filtrage par rôle
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                        <motion.button
                            whileHover={{ y: -3 }}
                            onClick={() => setFilterRole('')}
                            style={{
                                padding: '16px', borderRadius: '18px', cursor: 'pointer', textAlign: 'left', border: '1px solid',
                                background: filterRole === '' ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'white',
                                borderColor: filterRole === '' ? 'transparent' : '#e2e8f0',
                                boxShadow: filterRole === '' ? '0 18px 32px rgba(59,130,246,0.28)' : '0 8px 18px rgba(15,23,42,0.05)'
                            }}
                        >
                            <Users size={18} style={{ color: filterRole === '' ? 'white' : '#64748b' }} />
                            <p style={{ margin: '10px 0 2px', fontSize: '24px', fontWeight: 900, color: filterRole === '' ? 'white' : '#0f172a' }}>{totalPersonnel}</p>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: filterRole === '' ? 'rgba(255,255,255,0.78)' : '#64748b' }}>Tout le personnel</p>
                        </motion.button>

                        {stats.map((stat) => {
                            const cfg = getRoleConfig(stat.role);
                            const Icon = cfg.icon;
                            const isActive = filterRole === stat.role;
                            return (
                                <motion.button
                                    key={stat.role}
                                    whileHover={{ y: -3 }}
                                    onClick={() => setFilterRole(isActive ? '' : stat.role)}
                                    style={{
                                        padding: '16px', borderRadius: '18px', cursor: 'pointer', textAlign: 'left', border: '1px solid',
                                        background: isActive ? cfg.gradient : 'white',
                                        borderColor: isActive ? 'transparent' : '#e2e8f0',
                                        boxShadow: isActive ? `0 18px 32px ${cfg.color}33` : '0 8px 18px rgba(15,23,42,0.05)'
                                    }}
                                >
                                    <Icon size={18} style={{ color: isActive ? 'white' : cfg.color }} />
                                    <p style={{ margin: '10px 0 2px', fontSize: '24px', fontWeight: 900, color: isActive ? 'white' : '#0f172a' }}>{stat.total}</p>
                                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.78)' : '#64748b' }}>{cfg.label}</p>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', padding: '22px', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', backdropFilter: 'blur(18px)' }}>
                    <div style={{ marginBottom: '18px' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lecture métier</p>
                        <h2 style={{ margin: '6px 0 0', fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Accès & interfaces</h2>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[
                            {
                                icon: CheckCircle2,
                                title: 'Comptes connectables',
                                desc: `${totalAvecAcces} membres disposent déjà d’un accès système et d’une route de redirection connue.`,
                                tone: { bg: '#f0fdf4', color: '#166534' },
                            },
                            {
                                icon: AlertTriangle,
                                title: 'Profils sans accès',
                                desc: `${totalSansAcces} profils restent gérés côté RH sans authentification active.`,
                                tone: { bg: '#fff7ed', color: '#9a3412' },
                            },
                            {
                                icon: Activity,
                                title: 'Portails spécialisés',
                                desc: `${totalPortailsMetier} profils sont orientés vers des interfaces métier dédiées.`,
                                tone: { bg: '#eff6ff', color: '#1d4ed8' },
                            },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px', borderRadius: '18px', background: item.tone.bg }}>
                                    <div style={{ width: 42, height: 42, borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'white', color: item.tone.color, flexShrink: 0 }}>
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{item.title}</h3>
                                        <p style={{ margin: '6px 0 0', fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>{item.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(226,232,240,0.92)', borderRadius: '28px', padding: '18px', boxShadow: '0 24px 54px rgba(15,23,42,0.06)', backdropFilter: 'blur(18px)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(260px, 1.4fr) minmax(200px, 0.8fr) minmax(170px, 0.7fr) auto', gap: '12px', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={17} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            value={searchQ}
                            onChange={(e) => setSearchQ(e.target.value)}
                            placeholder="Rechercher un membre, un téléphone, un email ou une unité métier..."
                            style={{ width: '100%', padding: '14px 16px 14px 42px', borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: '#ffffff', color: '#0f172a' }}
                        />
                    </div>

                    <select
                        value={filterStatut}
                        onChange={(e) => setFilterStatut(e.target.value)}
                        style={{ padding: '14px 14px', borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: '14px', cursor: 'pointer', background: '#fff', color: '#0f172a' }}
                    >
                        <option value="">Tous les statuts</option>
                        <option value="ACTIF">Actif</option>
                        <option value="INACTIF">Inactif</option>
                        <option value="SUSPENDU">Suspendu</option>
                        <option value="CONGE">En congé</option>
                    </select>

                    <div style={{ padding: '14px 16px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>Filtre actif</p>
                        <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{filterRole ? getRoleConfig(filterRole).label : 'Tous les rôles'}</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setSearchQ('');
                            setFilterRole('');
                            setFilterStatut('');
                        }}
                        style={{ padding: '14px 16px', borderRadius: '16px', border: '1px solid #e2e8f0', background: 'white', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
                    >
                        Réinitialiser
                    </button>
                </div>
            </section>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '70px' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '50%', border: '3px solid #dbeafe', borderTopColor: '#2563eb', animation: 'spin 0.8s linear infinite' }} />
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            ) : personnel.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '84px 40px', background: 'white', borderRadius: '28px', border: '1px solid #e2e8f0', boxShadow: '0 24px 54px rgba(15,23,42,0.06)' }}>
                    <div style={{ width: '84px', height: '84px', borderRadius: '24px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <Users size={38} style={{ color: '#94a3b8' }} />
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>
                        {filterRole || searchQ || filterStatut ? 'Aucun résultat trouvé' : 'Aucun personnel enregistré'}
                    </h3>
                    <p style={{ margin: '0 0 24px', color: '#64748b', lineHeight: 1.7 }}>
                        {filterRole || searchQ || filterStatut ? 'Modifiez vos filtres pour retrouver les profils attendus.' : 'Commencez par recruter un premier membre du personnel pour alimenter ce centre de contrôle RH.'}
                    </p>
                    {!filterRole && !searchQ && !filterStatut && (
                        <Link href="/personnel/nouveau" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 22px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontWeight: 700, textDecoration: 'none', fontSize: '14px' }}>
                            <UserPlus size={16} /> Recruter un membre
                        </Link>
                    )}
                </div>
            ) : (
                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 340px))', gap: '18px', alignItems: 'start', justifyContent: 'start' }}>
                    <AnimatePresence>
                        {personnel.map((p, index) => {
                            const cfg = getRoleConfig(p.role);
                            const Icon = cfg.icon;
                            const interfaceSummary = getRoleInterfaceSummary(p.role);
                            const isActif = p.statut === 'ACTIF';
                            const initiales = `${p.prenom?.[0] || ''}${p.nom?.[0] || ''}`.toUpperCase();
                            const statusTone = getStatusTone(p.statut);

                            return (
                                <motion.article
                                    key={p.utilisateur_id}
                                    layout
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96 }}
                                    transition={{ delay: index * 0.02 }}
                                    style={{
                                        position: 'relative',
                                        overflow: 'hidden',
                                        background: 'rgba(255,255,255,0.95)',
                                        borderRadius: '26px',
                                        border: '1px solid rgba(226,232,240,0.92)',
                                        boxShadow: '0 24px 54px rgba(15,23,42,0.07)',
                                        opacity: isActif ? 1 : 0.88,
                                    }}
                                >
                                    <div style={{ height: '6px', background: cfg.gradient }} />

                                    <div style={{ padding: '22px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                                            <div style={{ width: '58px', height: '58px', borderRadius: '18px', flexShrink: 0, background: cfg.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '18px', fontWeight: 900, boxShadow: `0 10px 24px ${cfg.color}35` }}>
                                                {initiales}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {p.prenom} {p.nom}
                                                    </h3>
                                                    <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, background: statusTone.bg, color: statusTone.color }}>
                                                        {statusTone.label}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                                    <div style={{ padding: '5px 10px', borderRadius: '10px', background: cfg.bg, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                        <Icon size={12} style={{ color: cfg.color }} />
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                                                    </div>
                                                    {p.roles_secondaires?.map((rs) => {
                                                        const rsCfg = getRoleConfig(rs);
                                                        return (
                                                            <div key={rs} style={{ padding: '5px 10px', borderRadius: '10px', background: rsCfg.bg, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: 700, color: rsCfg.color }}>+ {rsCfg.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={() => setOpenMenu(openMenu === p.utilisateur_id ? null : p.utilisateur_id)}
                                                    style={{ padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', borderRadius: '12px', color: '#64748b' }}
                                                >
                                                    <MoreVertical size={18} />
                                                </button>
                                                <AnimatePresence>
                                                    {openMenu === p.utilisateur_id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95, y: -6 }}
                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                            exit={{ opacity: 0, scale: 0.95, y: -6 }}
                                                            style={{ position: 'absolute', right: 0, top: '44px', zIndex: 100, background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 18px 40px rgba(15,23,42,0.12)', minWidth: '210px', overflow: 'hidden' }}
                                                        >
                                                            <Link
                                                                href={`/personnel/modifier/${p.utilisateur_id}`}
                                                                onClick={() => setOpenMenu(null)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', color: '#0f172a', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}
                                                            >
                                                                <Edit size={15} style={{ color: '#3b82f6' }} /> Modifier le dossier
                                                            </Link>
                                                            <button
                                                                onClick={() => { handleToggleStatut(p); setOpenMenu(null); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', color: '#0f172a', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}
                                                            >
                                                                {isActif ? <ToggleLeft size={15} style={{ color: '#f59e0b' }} /> : <ToggleRight size={15} style={{ color: '#10b981' }} />}
                                                                {isActif ? 'Désactiver le compte' : 'Réactiver le compte'}
                                                            </button>
                                                            <div style={{ height: '1px', background: '#f1f5f9' }} />
                                                            <button
                                                                onClick={() => { setDeleteTarget(p); setOpenMenu(null); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}
                                                            >
                                                                <Trash2 size={15} /> Supprimer
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                                            <div style={{ padding: '11px 12px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #eef2f7' }}>
                                                <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>Contrat</p>
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{p.type_contrat || 'Non défini'}</p>
                                            </div>
                                            <div style={{ padding: '11px 12px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #eef2f7' }}>
                                                <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>Embauche</p>
                                                <p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{formatDate(p.date_embauche)}</p>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
                                            {(p.telephone || p.email) && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', borderRadius: '18px', background: '#fcfdff', border: '1px solid #edf2f7' }}>
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
                                                </div>
                                            )}

                                            <div style={{ padding: '14px', borderRadius: '18px', background: 'linear-gradient(135deg, #f8fafc, #ffffff)', border: '1px solid #edf2f7', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        {p.nom_utilisateur ? (
                                                            <span style={{ padding: '5px 10px', background: '#f0fdf4', color: '#166534', borderRadius: '10px', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                <Key size={12} /> Accès
                                                            </span>
                                                        ) : (
                                                            <span style={{ padding: '5px 10px', background: '#fef9c3', color: '#854d0e', borderRadius: '10px', fontWeight: 700, fontSize: '11px' }}>
                                                                Sans accès
                                                            </span>
                                                        )}
                                                        <span style={{ padding: '5px 10px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '10px', fontWeight: 700, fontSize: '11px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {interfaceSummary.interfaceLabel}
                                                        </span>
                                                    </div>
                                                    {p.salaire_base > 0 && (
                                                        <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                                                            {formatMoney(p.salaire_base)}/mois
                                                        </span>
                                                    )}
                                                </div>

                                                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                                                    {p.nom_utilisateur ? (
                                                        <>
                                                            Route : <strong style={{ color: '#334155' }}>{interfaceSummary.redirectPath}</strong>
                                                        </>
                                                    ) : (
                                                        'Profil RH sans interface de connexion.'
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#64748b', fontWeight: 700, maxWidth: '75%' }}>
                                                <ArrowRight size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cfg.description}</span>
                                            </div>
                                            {interfaceSummary.hasSystemAccess && (
                                                <Link href={interfaceSummary.redirectPath} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 800 }}>
                                                    Ouvrir <Eye size={14} />
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </motion.article>
                            );
                        })}
                    </AnimatePresence>
                </section>
            )}

            {!loading && personnel.length > 0 && (
                <Pagination page={currentPage} pageSize={pageSize} total={total} onPageChange={setCurrentPage} />
            )}

            <AnimatePresence>
                {deleteTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setDeleteTarget(null)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.56)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
                    >
                        <motion.div
                            initial={{ scale: 0.94, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.94, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ background: 'white', borderRadius: '28px', padding: '30px', width: '440px', maxWidth: '94vw', boxShadow: '0 28px 70px rgba(0,0,0,0.22)' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                                <div style={{ width: '58px', height: '58px', borderRadius: '18px', background: '#fef2f2', display: 'grid', placeItems: 'center' }}>
                                    <XCircle size={26} style={{ color: '#ef4444' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a' }}>Confirmer la suppression</h3>
                                    <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#64748b' }}>Cette action retirera définitivement le membre de l’annuaire RH.</p>
                                </div>
                            </div>

                            <p style={{ margin: '0 0 24px', color: '#475569', fontSize: '14px', lineHeight: 1.7 }}>
                                Voulez-vous vraiment supprimer <strong>{deleteTarget.prenom} {deleteTarget.nom}</strong> du personnel ?
                            </p>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => setDeleteTarget(null)}
                                    style={{ padding: '12px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '14px', color: '#334155' }}
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={actionLoading !== null}
                                    style={{ padding: '12px 18px', borderRadius: '14px', border: 'none', background: '#ef4444', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: '14px', boxShadow: '0 14px 28px rgba(239,68,68,0.24)' }}
                                >
                                    Supprimer définitivement
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {openMenu !== null && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpenMenu(null)} />
            )}
        </div>
    );
}
