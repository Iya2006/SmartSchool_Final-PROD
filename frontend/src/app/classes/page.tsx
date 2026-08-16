'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, X, Eye, Edit, ChevronRight, ChevronLeft, Loader2, BookOpen, UserCheck, Plus, Settings, Search, ArrowLeft, Save } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Pagination from '@/components/Pagination';

interface Classe {
    classe_id: number;
    libelle: string;
    code: string;
    niveau_id: number;
    capacite_max: number;
    effectif_actuel: number;
    statut: string;
}

interface EleveDeClasse {
    eleve_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    date_naissance: string;
    statut_inscription: string;
}

const colorPalette = [
    { border: '#06b6d4', bg: '#06b6d410', text: '#06b6d4' },
    { border: '#8b5cf6', bg: '#8b5cf610', text: '#8b5cf6' },
    { border: '#10b981', bg: '#10b98110', text: '#10b981' },
    { border: '#f59e0b', bg: '#f59e0b10', text: '#f59e0b' },
    { border: '#ec4899', bg: '#ec489910', text: '#ec4899' },
    { border: '#3b82f6', bg: '#3b82f610', text: '#3b82f6' }
];

export default function ClassesPage() {
    const { etablissementId, anneeId } = useApp();
    const [search, setSearch] = useState('');
    const router = useRouter();
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    // Modal state
    const [selectedClass, setSelectedClass] = useState<Classe | null>(null);
    const [classStudents, setClassStudents] = useState<EleveDeClasse[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // Édition d'une classe existante (nom, code, capacité, niveau).
    const queryClient = useQueryClient();
    const [editClass, setEditClass] = useState<Classe | null>(null);
    const [editForm, setEditForm] = useState({ libelle: '', code: '', capacite_max: 50, niveau_id: 0 });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    // Cycles + niveaux pour le sélecteur de niveau (les niveaux appartiennent à
    // l'école via leur cycle : on les charge, jamais on ne les devine).
    const { data: cyclesData } = useQuery({
        queryKey: ['cycles-niveaux', etablissementId],
        queryFn: async () => {
            const res = await api.get('/api/parametrage/cycles');
            return res.data as { cycle_id: number; libelle: string; niveaux: { niveau_id: number; libelle: string }[] }[];
        },
        enabled: !!etablissementId,
    });

    const ouvrirEdition = (c: Classe) => {
        setEditError(null);
        setEditForm({ libelle: c.libelle, code: c.code, capacite_max: c.capacite_max, niveau_id: c.niveau_id });
        setEditClass(c);
    };

    const enregistrerEdition = async () => {
        if (!editClass) return;
        if (!editForm.libelle.trim() || !editForm.code.trim() || !editForm.niveau_id) {
            setEditError('Le nom, le code et le niveau sont obligatoires.');
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            await api.put(`/api/classes/${editClass.classe_id}`, {
                etablissement_id: etablissementId,
                annee_id: anneeId,
                niveau_id: Number(editForm.niveau_id),
                code: editForm.code.trim(),
                libelle: editForm.libelle.trim(),
                capacite_max: Number(editForm.capacite_max) || 1,
                statut: editClass.statut || 'ACTIVE',
            });
            setEditClass(null);
            await queryClient.invalidateQueries({ queryKey: ['classes'] });
            await queryClient.invalidateQueries({ queryKey: ['classes-stats'] });
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setEditError(detail || "La modification a échoué. Rien n'a été changé.");
        } finally {
            setEditSaving(false);
        }
    };

    // Carousel ref
    const carouselRef = useRef<HTMLDivElement>(null);

    // React Query (déjà monté à la racine, voir components/QueryProvider.tsx) :
    // cache persisté + `networkMode: 'offlineFirst'` (lib/queryClient.ts) —
    // affiche instantanément la dernière liste connue puis revalide en
    // arrière-plan, au lieu d'un fetch unique à l'ancien useEffect qui ne se
    // rejouait jamais tant que le composant restait monté (voir le correctif
    // de dépendances manquantes fait plus tôt cette session).
    //
    // Paginée côté serveur (recherche envoyée en paramètre, plus filtrée en
    // mémoire) — un établissement à grand nombre de classes ne doit jamais
    // tout charger d'un coup. Le total réel vient de X-Total-Count, comme
    // useEleves.ts (même convention pour les listes React Query de ce projet).
    const { data, isLoading: loading } = useQuery({
        queryKey: ['classes', etablissementId, anneeId, currentPage, search],
        queryFn: async () => {
            const skip = (currentPage - 1) * pageSize;
            const res = await api.get('/api/classes', {
                params: {
                    etablissement_id: etablissementId, annee_id: anneeId,
                    skip, limit: pageSize, search: search || undefined,
                },
            });
            return {
                classes: res.data as Classe[],
                total: Number(res.headers?.['x-total-count'] ?? res.data.length),
            };
        },
        enabled: !!etablissementId && !!anneeId,
    });
    const classes = data?.classes ?? [];
    const total = data?.total ?? 0;

    // Recherche : revenir à la page 1 pour éviter une page vide après filtrage
    useEffect(() => { setCurrentPage(1); }, [search]);

    // Auto-scroll carousel
    useEffect(() => {
        const el = carouselRef.current;
        if (!el || classes.length === 0) return;

        let scrollPos = el.scrollLeft;
        let direction = 1;
        const speed = 0.5;
        let animId: number;

        const animate = () => {
            if (el) {
                if (el.dataset.paused !== 'true') {
                    scrollPos += speed * direction;
                    if (scrollPos >= el.scrollWidth - el.clientWidth) {
                        direction = -1;
                    }
                    if (scrollPos <= 0) {
                        direction = 1;
                    }
                    el.scrollLeft = scrollPos;
                } else {
                    scrollPos = el.scrollLeft;
                }
            }
            animId = requestAnimationFrame(animate);
        };
        animId = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animId);
    }, [classes]);

    // Carousel scroll buttons
    const scrollCarousel = (dir: 'left' | 'right') => {
        const el = carouselRef.current;
        if (!el) return;
        const amount = 250;
        el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
    };

    const handleClassClick = async (c: Classe) => {
        setSelectedClass(c);
        setLoadingStudents(true);
        setClassStudents([]);

        try {
            const res = await api.get(`/api/classes/${c.classe_id}/eleves`);
            setClassStudents(res.data);
        } catch (error) {
            console.error("Erreur chargement des élèves:", error);
        } finally {
            setLoadingStudents(false);
        }
    };

    const closeModal = () => {
        setSelectedClass(null);
    };

    // La recherche part désormais au serveur (voir queryFn ci-dessus) — la
    // page affichée est déjà filtrée, plus besoin de refiltrer côté client.
    const filteredClasses = classes;

    // Agrégats globaux (toutes les classes de l'école, pas seulement la page
    // affichée) — sinon "Effectif Global"/"Taux d'Occupation" n'auraient
    // reflété que les 50 classes visibles à l'écran au lieu de l'école entière.
    const { data: statsData } = useQuery({
        queryKey: ['classes-stats', etablissementId, anneeId],
        queryFn: async () => {
            const res = await api.get('/api/classes/stats', {
                params: { etablissement_id: etablissementId, annee_id: anneeId },
            });
            return res.data as { total_classes: number; total_effectif: number; total_capacite: number };
        },
        enabled: !!etablissementId && !!anneeId,
    });
    const totalStudents = statsData?.total_effectif ?? 0;
    const totalCapacity = statsData?.total_capacite || 1;
    const occupationRate = total > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ═══ Header / Breadcrumb ═══ */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '0 0 16px', flexShrink: 0 }}>
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
                        <span>Classes & Effectifs</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <Link href="/classes/cloture-annee" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'white', color: '#b45309', border: '1px solid #fde68a',
                        padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                        textDecoration: 'none', transition: 'all 0.2s ease',
                    }}>
                        <UserCheck size={18} />
                        <span>Assistant de fin d&apos;année</span>
                    </Link>
                    <Link href="/classes/nouveau" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        background: 'var(--brand-primary)', color: 'white',
                        padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                        textDecoration: 'none', transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                    }}>
                        <Plus size={18} />
                        <span>Nouvelle Classe</span>
                    </Link>
                </div>
            </div>

            {/* ═══ Statistics Row - Compact ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <motion.div className="kpi-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p className="kpi-label" style={{ fontSize: '11px', margin: '0 0 2px' }}>Total Classes</p>
                            <p className="kpi-value" style={{ fontSize: '22px', margin: 0 }}>{statsData?.total_classes ?? total}</p>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#3b82f615', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BookOpen size={18} />
                        </div>
                    </div>
                </motion.div>
                <motion.div className="kpi-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p className="kpi-label" style={{ fontSize: '11px', margin: '0 0 2px' }}>Effectif Global</p>
                            <p className="kpi-value" style={{ fontSize: '22px', margin: 0 }}>{totalStudents}</p>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#10b98115', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={18} />
                        </div>
                    </div>
                </motion.div>
                <motion.div className="kpi-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p className="kpi-label" style={{ fontSize: '11px', margin: '0 0 2px' }}>Taux d&apos;Occupation</p>
                            <p className="kpi-value" style={{ fontSize: '22px', margin: 0 }}>{occupationRate}%</p>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f59e0b15', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <UserCheck size={18} />
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* ═══ Search Field ═══ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', flex: 1, maxWidth: '420px',
                    border: '1px solid var(--border-light)', borderRadius: '12px',
                    padding: '10px 16px', gap: '10px', background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.2s',
                }}>
                    <Search size={18} color="var(--text-muted)" />
                    <input
                        type="text"
                        placeholder="Rechercher une classe..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            border: 'none', outline: 'none', fontSize: '14px',
                            width: '100%', background: 'transparent',
                            fontFamily: 'inherit',
                        }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
                            <X size={16} />
                        </button>
                    )}
                </div>
                {search && (
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {total} résultat{total !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* ═══ Auto-scrolling Class Carousel with Navigation Arrows ═══ */}
            {!loading && classes.length > 0 && (
                <div style={{ position: 'relative' }}
                    onMouseEnter={() => { if (carouselRef.current) carouselRef.current.dataset.paused = 'true'; }}
                    onMouseLeave={() => { if (carouselRef.current) carouselRef.current.dataset.paused = 'false'; }}
                >
                    {/* Fade edges */}
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to right, var(--bg-page), transparent)', zIndex: 2, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to left, var(--bg-page), transparent)', zIndex: 2, pointerEvents: 'none' }} />

                    {/* ◀ Arrow Left */}
                    <button
                        onClick={() => scrollCarousel('left')}
                        style={{
                            position: 'absolute', left: '2px', top: '50%', transform: 'translateY(-50%)',
                            zIndex: 5, width: '32px', height: '32px', borderRadius: '50%',
                            background: 'white', border: '1px solid var(--border-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary)'; e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'inherit'; }}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    {/* ▶ Arrow Right */}
                    <button
                        onClick={() => scrollCarousel('right')}
                        style={{
                            position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)',
                            zIndex: 5, width: '32px', height: '32px', borderRadius: '50%',
                            background: 'white', border: '1px solid var(--border-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary)'; e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'inherit'; }}
                    >
                        <ChevronRight size={18} />
                    </button>

                    <div
                        ref={carouselRef}
                        style={{
                            display: 'flex', gap: '10px', overflowX: 'hidden', padding: '4px 40px',
                            scrollBehavior: 'auto'
                        }}
                    >
                        {classes.map(cls => (
                            <button
                                key={`pill-${cls.classe_id}`}
                                onClick={() => handleClassClick(cls)}
                                style={{
                                    flex: '0 0 auto',
                                    padding: '8px 18px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-light)',
                                    background: 'white',
                                    color: 'var(--text-secondary)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--brand-primary)';
                                    e.currentTarget.style.color = 'var(--brand-primary)';
                                    e.currentTarget.style.background = '#eef2ff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border-light)';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                    e.currentTarget.style.background = 'white';
                                }}
                            >
                                {cls.libelle}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══ Scrollable Class Cards Grid - 3 columns ═══ */}
            <div>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                        <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
                    </div>
                ) : filteredClasses.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                        <BookOpen size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
                        <p style={{ fontSize: '16px', fontWeight: 500 }}>Aucune classe trouvée</p>
                        <p style={{ fontSize: '13px' }}>
                            {search ? 'Essayez un autre terme de recherche' : 'Commencez par créer une classe'}
                        </p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '16px',
                        paddingBottom: '24px'
                    }}>
                        {filteredClasses.map((cls, idx) => {
                            const styleIdx = idx % colorPalette.length;
                            const pTheme = colorPalette[styleIdx];

                            return (
                                <motion.div
                                    key={cls.classe_id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.03 }}
                                    onClick={() => handleClassClick(cls)}
                                    style={{
                                        background: 'white',
                                        borderRadius: '14px',
                                        border: `1px solid ${pTheme.border}40`,
                                        padding: '20px',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '10px',
                                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        minHeight: '160px',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-3px)';
                                        e.currentTarget.style.boxShadow = `0 8px 20px ${pTheme.border}20`;
                                        const bar = e.currentTarget.querySelector('.hover-bar') as HTMLElement;
                                        if (bar) bar.style.transform = 'translateY(0)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';
                                        const bar = e.currentTarget.querySelector('.hover-bar') as HTMLElement;
                                        if (bar) bar.style.transform = 'translateY(100%)';
                                    }}
                                >
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        background: pTheme.bg, color: pTheme.text,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '18px', fontWeight: 800, border: `2px solid ${pTheme.border}`
                                    }}>
                                        {idx + 1}
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 3px 0', color: 'var(--text-primary)' }}>{cls.libelle}</h3>
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                                            {cls.effectif_actuel || 0} Élèves Inscrits
                                        </p>
                                    </div>
                                    <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                        Capacité: {cls.capacite_max}
                                    </span>

                                    {/* Hover Action Bar */}
                                    <div className="hover-bar" style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                        padding: '8px 12px',
                                        display: 'flex', justifyContent: 'center', gap: '8px',
                                        transform: 'translateY(100%)',
                                        transition: 'transform 0.25s ease'
                                    }}>
                                        <Link href={`/classes/${cls.classe_id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '5px 12px', borderRadius: '7px',
                                                background: 'rgba(255,255,255,0.2)', color: 'white',
                                                fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                                                backdropFilter: 'blur(4px)', transition: 'background 0.15s'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                        >
                                            <Eye size={12} /> Profil
                                        </Link>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); ouvrirEdition(cls); }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '5px 12px', borderRadius: '7px', border: 'none',
                                                background: 'rgba(255,255,255,0.2)', color: 'white',
                                                fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                                backdropFilter: 'blur(4px)', transition: 'background 0.15s'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                        >
                                            <Edit size={12} /> Modifier
                                        </button>
                                        <Link href={`/classes/configurer/${cls.classe_id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '5px 12px', borderRadius: '7px',
                                                background: 'rgba(255,255,255,0.2)', color: 'white',
                                                fontSize: '11px', fontWeight: 600, textDecoration: 'none',
                                                backdropFilter: 'blur(4px)', transition: 'background 0.15s'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                        >
                                            <Settings size={12} /> Configurer
                                        </Link>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {!loading && classes.length > 0 && (
                <Pagination page={currentPage} pageSize={pageSize} total={total} onPageChange={setCurrentPage} />
            )}

            {/* ═══ Student List Modal ═══ */}
            <AnimatePresence>
                {selectedClass && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.4)',
                            backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1000, padding: '24px'
                        }}
                        onClick={closeModal}
                    >
                        <motion.div
                            initial={{ y: 50, opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 20, opacity: 0, scale: 0.95 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            style={{
                                background: 'white',
                                borderRadius: '16px',
                                width: '100%',
                                maxWidth: '1000px',
                                maxHeight: '85vh',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                overflow: 'hidden'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid var(--border-light)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: '#f8fafc'
                            }}>
                                <div>
                                    <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                                        Liste des élèves — {selectedClass.libelle}
                                    </h2>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                                        {classStudents.length} / {selectedClass.capacite_max} Élèves
                                    </p>
                                </div>
                                <button
                                    onClick={closeModal}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-light)',
                                        background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', color: 'var(--text-secondary)'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div style={{ overflowY: 'auto', flex: 1, padding: '0' }}>
                                {loadingStudents ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                                        <Loader2 size={32} className="animate-spin" color="var(--brand-primary)" />
                                    </div>
                                ) : classStudents.length === 0 ? (
                                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <Users size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
                                        <p style={{ fontSize: '16px', fontWeight: 500 }}>Cette classe est vide.</p>
                                        <p style={{ fontSize: '14px' }}>Aucun élève n&apos;est encore inscrit dans {selectedClass.libelle}.</p>
                                    </div>
                                ) : (
                                    <table className="sp-table" style={{ margin: 0, borderBottom: 'none' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                            <tr>
                                                <th style={{ background: 'var(--brand-primary)', color: 'white', border: 'none' }}>Élève</th>
                                                <th style={{ background: 'var(--brand-primary)', color: 'white', border: 'none' }}>Matricule</th>
                                                <th style={{ background: 'var(--brand-primary)', color: 'white', border: 'none' }}>Sexe</th>
                                                <th style={{ background: 'var(--brand-primary)', color: 'white', border: 'none' }}>Statut</th>
                                                <th style={{ background: 'var(--brand-primary)', color: 'white', border: 'none', textAlign: 'right', paddingRight: '24px' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {classStudents.map((eleve, i) => (
                                                <tr key={eleve.eleve_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div className="avatar" style={{ background: colorPalette[i % colorPalette.length].bg, color: colorPalette[i % colorPalette.length].text, fontWeight: 700 }}>
                                                                {eleve.prenom.charAt(0)}{eleve.nom.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <p style={{ fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{eleve.prenom} {eleve.nom}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td><code style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '13px' }}>{eleve.matricule}</code></td>
                                                    <td>
                                                        <span style={{ color: eleve.sexe === 'M' ? '#3b82f6' : '#ec4899', fontWeight: 600, fontSize: '13px' }}>
                                                            {eleve.sexe === 'M' ? 'Garçon' : 'Fille'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${eleve.statut_inscription === 'ACTIVE' ? 'badge-subtle-success' : 'badge-subtle-danger'}`}>
                                                            {eleve.statut_inscription === 'ACTIVE' ? 'Actif' : eleve.statut_inscription}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                            <Link href={`/eleves/${eleve.eleve_id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 8px' }} title="Profile">
                                                                <Eye size={14} />
                                                            </Link>
                                                            <Link href={`/eleves/modifier/${eleve.eleve_id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 8px' }} title="Modifier">
                                                                <Edit size={14} />
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ Modifier une classe ═══ */}
            <AnimatePresence>
                {editClass && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px'
                        }}
                        onClick={() => !editSaving && setEditClass(null)}
                    >
                        <motion.div
                            initial={{ y: 30, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.97 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Edit size={17} /> Modifier la classe
                                </h2>
                                <button onClick={() => !editSaving && setEditClass(null)} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                    <X size={16} />
                                </button>
                            </div>

                            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {editError && (
                                    <div style={{ padding: '11px 14px', background: '#fef2f2', color: '#b91c1c', borderRadius: '10px', fontSize: '13px', border: '1px solid #fecaca' }}>
                                        {editError}
                                    </div>
                                )}
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Nom de la classe</span>
                                    <input value={editForm.libelle} onChange={e => setEditForm(f => ({ ...f, libelle: e.target.value }))}
                                        style={champStyle} placeholder="Ex : 6ème A" />
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Code</span>
                                        <input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))}
                                            style={champStyle} placeholder="Ex : 6A" />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Capacité</span>
                                        <input type="number" min={1} value={editForm.capacite_max} onChange={e => setEditForm(f => ({ ...f, capacite_max: Number(e.target.value) }))}
                                            style={champStyle} />
                                    </label>
                                </div>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>Niveau</span>
                                    <select value={editForm.niveau_id} onChange={e => setEditForm(f => ({ ...f, niveau_id: Number(e.target.value) }))} style={champStyle}>
                                        <option value={0}>Choisissez un niveau</option>
                                        {(cyclesData || []).map(cycle => (
                                            <optgroup key={cycle.cycle_id} label={cycle.libelle}>
                                                {(cycle.niveaux || []).map(n => (
                                                    <option key={n.niveau_id} value={n.niveau_id}>{n.libelle}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setEditClass(null)} disabled={editSaving}
                                    style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'white', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                    Annuler
                                </button>
                                <button onClick={enregistrerEdition} disabled={editSaving}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'var(--brand-primary)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.6 : 1 }}>
                                    {editSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

const champStyle: CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '10px',
    border: '1px solid var(--border-light)', fontSize: '13.5px', outline: 'none',
    color: 'var(--text-primary)', background: 'white', fontFamily: 'inherit',
};
