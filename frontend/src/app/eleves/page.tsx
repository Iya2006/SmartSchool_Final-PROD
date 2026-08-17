'use client';

/**
 * Page Élèves — Répertoire complet des élèves avec filtre par classe.
 *
 * Refactorisé pour utiliser le hook useEleves (logique API externalisée).
 * Ce composant ne gère QUE l'affichage et les interactions UI.
 *
 * refactor(eleves): utiliser useEleves hook + séparer EleveAvatar et PhotoLightbox
 */

import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Plus, Users, UserCheck, UserX, Clock,
    Loader2, ChevronRight, ChevronLeft, Eye, Edit, Trash2, Camera, X, ArrowLeft, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEleves, type Eleve } from '@/hooks/useEleves';
import api from '@/lib/api';
import BadgeCarte from '@/components/BadgeCarte';
import { useIsMobile } from '@/hooks/useIsMobile';

// ─── Constantes ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];
const API_BASE      = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
const PAGE_SIZE     = 8;

// ─── Sous-composant : Avatar élève ───────────────────────────────────────────
function EleveAvatar({
    eleve, size = 56, colorIndex = 0, showCamera = true,
}: {
    eleve: Eleve; size?: number; colorIndex?: number; showCamera?: boolean;
}) {
    const router   = useRouter();
    const photoSrc = eleve.photo_url ? `${API_BASE}${eleve.photo_url}` : null;
    const initials = `${eleve.prenom.charAt(0)}${eleve.nom.charAt(0)}`;
    const color    = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
    const camSize  = Math.max(20, Math.round(size * 0.35));

    return (
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <div style={{
                width: size, height: size, borderRadius: '50%',
                background: photoSrc ? `url(${photoSrc}) center/cover no-repeat` : color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: size * 0.3, fontWeight: 800, color: 'white',
                border: '3px solid white', boxShadow: `0 4px 12px ${color}40`,
                cursor: 'pointer',
            }}>
                {!photoSrc && initials}
            </div>
            {showCamera && !photoSrc && (
                <button
                    onClick={e => {
                        e.stopPropagation(); e.preventDefault();
                        router.push(`/galerie?search=${encodeURIComponent(eleve.nom)}&tab=eleves&highlight=${eleve.eleve_id}`);
                    }}
                    title="Gérer la photo dans la galerie"
                    style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: camSize, height: camSize, borderRadius: '50%',
                        background: 'var(--brand-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid white', cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)', transition: 'all 0.2s',
                    }}>
                    <Camera size={camSize * 0.55} color="white" />
                </button>
            )}
        </div>
    );
}

// ─── Sous-composant : Lightbox photo fullscreen ───────────────────────────────
function PhotoLightbox({ eleve, onClose }: { eleve: Eleve; onClose: () => void }) {
    const photoSrc = eleve.photo_url ? `${API_BASE}${eleve.photo_url}` : null;
    const initials = `${eleve.prenom.charAt(0)}${eleve.nom.charAt(0)}`;
    const color    = AVATAR_COLORS[eleve.eleve_id % AVATAR_COLORS.length];

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '16px', padding: '40px',
            }}>
            <button onClick={onClose} style={{
                position: 'absolute', top: '20px', right: '20px',
                width: '44px', height: '44px', borderRadius: '50%',
                border: 'none', background: 'rgba(255,255,255,0.1)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <X size={22} color="white" />
            </button>

            <motion.div
                initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 20 }}
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: '90vw', maxHeight: '75vh', borderRadius: '16px',
                    overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                    background: photoSrc ? 'transparent' : `linear-gradient(135deg, ${color}, ${color}bb)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: photoSrc ? 'auto' : '280px', aspectRatio: photoSrc ? undefined : '1',
                }}>
                {photoSrc
                    ? <img src={photoSrc} alt={`${eleve.prenom} ${eleve.nom}`} /* eslint-disable-line @next/next/no-img-element */
                        style={{ maxWidth: '90vw', maxHeight: '75vh', objectFit: 'contain', display: 'block', borderRadius: '16px' }} />
                    : <span style={{ fontSize: '90px', fontWeight: 900, color: 'white', opacity: 0.4 }}>{initials}</span>
                }
            </motion.div>

            <div style={{ textAlign: 'center', color: 'white' }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{eleve.prenom} {eleve.nom}</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.6 }}>
                    {eleve.classe_code || '—'} • {eleve.matricule}
                </p>
            </div>
        </motion.div>
    );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ElevesPage() {
    const { etablissementId, anneeId } = useApp();
    const router = useRouter();
    const isMobile = useIsMobile();

    // ── État UI local (filtres, pagination, sélection) ──
    const [search, setSearch]               = useState('');
    const [currentPage, setCurrentPage]     = useState(1);
    const [selectedClasse, setSelectedClasse] = useState<string | null>(null);
    const [previewEleve, setPreviewEleve]   = useState<Eleve | null>(null);
    const [badgeEleve, setBadgeEleve]       = useState<Eleve | null>(null);
    const [viewMode, setViewMode]           = useState<'list' | 'grid'>('list');
    const carouselRef                       = useRef<HTMLDivElement>(null);

    // ✅ Logique API déléguée au hook
    const {
        eleves, classes, loading, error,
        totalCount, activeCount, inactiveCount, nouvellesInscriptions,
        totalPages, fetchEleves, deleteEleve,
    } = useEleves({
        etablissementId,
        anneeId,
        page: currentPage,
        pageSize: PAGE_SIZE,
        search,
        classeCode: selectedClasse,
    });

    // ── Carousel auto-scroll ──
    useEffect(() => {
        const el = carouselRef.current;
        if (!el || classes.length === 0) return;
        let scrollPos = el.scrollLeft;
        let direction = 1;
        const speed = 0.5;
        let animId: number;
        const animate = () => {
            if (el && el.dataset.paused !== 'true') {
                scrollPos += speed * direction;
                if (scrollPos >= el.scrollWidth - el.clientWidth) direction = -1;
                if (scrollPos <= 0) direction = 1;
                el.scrollLeft = scrollPos;
            } else { scrollPos = el.scrollLeft; }
            animId = requestAnimationFrame(animate);
        };
        animId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animId);
    }, [classes]);

    const scrollCarousel = (dir: 'left' | 'right') => {
        carouselRef.current?.scrollBy({ left: dir === 'left' ? -250 : 250, behavior: 'smooth' });
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet élève définitivement ?')) return;
        try { await deleteEleve(id); }
        catch { alert('Erreur lors de la suppression'); }
    };

    // Activer = confirmer la réinscription d'un élève promu pré-placé : ça crée
    // son inscription de l'année en cours (dans sa classe cible) et le rend actif.
    const [activatingId, setActivatingId] = useState<number | null>(null);
    const handleActiver = async (eleve: Eleve) => {
        if (!eleve.inscription_a_confirmer) return;
        if (!window.confirm(`Activer ${eleve.prenom} ${eleve.nom} dans ${eleve.classe_code || 'sa classe'} pour cette année ?`)) return;
        setActivatingId(eleve.eleve_id);
        try {
            const res = await api.post(`/api/reinscription/${eleve.inscription_a_confirmer}/confirmer`);
            await fetchEleves();
            // Garde-fou : si aucun frais n'a été généré, la classe n'a pas de
            // tarifs configurés — l'élève est actif mais rien ne sera à payer.
            if (res.data?.factures_generees === 0) {
                alert(`${eleve.prenom} ${eleve.nom} est activé(e), mais AUCUN frais n'a été généré : la classe « ${eleve.classe_code || ''} » n'a pas de tarifs configurés. Configurez ses frais (Comptabilité → Frais), sinon rien ne sera facturé.`);
            }
        } catch (e: unknown) {
            const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            alert(detail || "L'activation a échoué. Réessayez.");
        } finally {
            setActivatingId(null);
        }
    };

    const kpis = [
        { label: 'Total Élèves',          value: totalCount.toLocaleString(), icon: Users,      color: '#3b82f6' },
        { label: 'Nouvelles Inscriptions', value: nouvellesInscriptions.toLocaleString(), icon: UserCheck, color: '#10b981' },
        { label: "Absents Aujourd'hui",    value: inactiveCount,               icon: UserX,      color: '#ef4444' },
        { label: "Présents Aujourd'hui",   value: activeCount.toLocaleString(), icon: Clock,      color: '#6366f1' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Photo Lightbox */}
            <AnimatePresence>
                {previewEleve && <PhotoLightbox eleve={previewEleve} onClose={() => setPreviewEleve(null)} />}
                {badgeEleve && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setBadgeEleve(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background: 'transparent', padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <BadgeCarte 
                                agent={{
                                    nom: badgeEleve.nom,
                                    prenom: badgeEleve.prenom,
                                    matricule: badgeEleve.matricule,
                                    photo_url: badgeEleve.photo_url,
                                    role: 'ÉLÈVE',
                                    classe: badgeEleve.classe_code || undefined,
                                    date_naissance: badgeEleve.date_naissance,
                                    adresse: badgeEleve.adresse,
                                    groupe_sanguin: badgeEleve.groupe_sanguin
                                }} 
                                id="admin-badge-view" 
                            />
                            <button onClick={() => setBadgeEleve(null)} className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>Fermer</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Grid des Cartes */}
            <AnimatePresence>
                {viewMode === 'grid' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(248,250,252,0.98)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', padding: '32px', overflowY: 'auto' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', background: 'white', padding: '16px 24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'var(--brand-primary)', color: 'white', padding: '8px', borderRadius: '8px' }}>
                                    <Users size={24} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Cartes des Élèves</h2>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>{eleves.length} carte(s) affichée(s) pour la page courante.</p>
                                </div>
                            </div>
                            <button onClick={() => setViewMode('list')} className="btn btn-outline" style={{ background: 'white', border: '1px solid var(--border-light)' }}>
                                <X size={20} /> Fermer la grille
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'center', paddingBottom: '64px' }}>
                            {eleves.map(eleve => (
                                <BadgeCarte 
                                    key={eleve.eleve_id}
                                    agent={{
                                        nom: eleve.nom,
                                        prenom: eleve.prenom,
                                        matricule: eleve.matricule,
                                        photo_url: eleve.photo_url,
                                        role: 'ÉLÈVE',
                                        classe: eleve.classe_code || undefined,
                                        date_naissance: eleve.date_naissance,
                                        adresse: eleve.adresse,
                                        groupe_sanguin: eleve.groupe_sanguin
                                    }} 
                                    id={`badge-grid-${eleve.eleve_id}`} 
                                />
                            ))}
                        </div>

                        {/* Pagination dans la modal */}
                        <div className="pagination" style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', justifyContent: 'center' }}>
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                <ChevronLeft size={16} />
                            </button>
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                let page: number;
                                if (totalPages <= 5)           page = i + 1;
                                else if (currentPage <= 3)     page = i + 1;
                                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                                else                           page = currentPage - 2 + i;
                                return (
                                    <button key={page} className={currentPage === page ? 'active' : ''} onClick={() => setCurrentPage(page)}>
                                        {page}
                                    </button>
                                );
                            })}
                            <button onClick={() => setCurrentPage(p => Math.max(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Breadcrumb + Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => router.back()} title="Retour" style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        border: '1px solid var(--border-light)', background: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary)'; e.currentTarget.style.color = 'white'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="breadcrumb">
                        <Link href="/">Accueil</Link>
                        <ChevronRight size={14} />
                        <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>Élèves</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <button onClick={() => setViewMode('grid')} className="btn btn-outline btn-sm" style={{ color: '#10b981', borderColor: '#10b981' }}>
                        <Users size={16} /> Toutes les Cartes
                    </button>
                    <Link href="/galerie" className="btn btn-outline btn-sm"><Camera size={16} /> Galerie Photos</Link>
                    <Link href="/eleves/nouveau" className="btn btn-primary"><Plus size={18} /> Ajouter Élève</Link>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                {kpis.map((kpi, i) => (
                    <motion.div key={i} className="kpi-card"
                        initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08 }}>
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

            {/* Carousel de classes */}
            {!loading && classes.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                    style={{ position: 'relative' }}
                    onMouseEnter={() => { if (carouselRef.current) carouselRef.current.dataset.paused = 'true'; }}
                    onMouseLeave={() => { if (carouselRef.current) carouselRef.current.dataset.paused = 'false'; }}>
                    {/* Dégradés bords */}
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to right, var(--bg-page), transparent)', zIndex: 2, pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40px', background: 'linear-gradient(to left, var(--bg-page), transparent)', zIndex: 2, pointerEvents: 'none' }} />
                    {/* Flèches navigation */}
                    {(['left', 'right'] as const).map(dir => (
                        <button key={dir} onClick={() => scrollCarousel(dir)} style={{
                            position: 'absolute', [dir]: '2px', top: '50%', transform: 'translateY(-50%)',
                            zIndex: 5, width: '32px', height: '32px', borderRadius: '50%',
                            background: 'white', border: '1px solid var(--border-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', transition: 'all 0.2s',
                        }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-primary)'; e.currentTarget.style.color = 'white'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'inherit'; }}>
                            {dir === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                        </button>
                    ))}
                    <div ref={carouselRef} style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '4px 40px', scrollBehavior: 'smooth', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                        {/* Bouton "Toutes" */}
                        <button onClick={() => { setSelectedClasse(null); setCurrentPage(1); }} style={{
                            flex: '0 0 auto', padding: '8px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                            border: !selectedClasse ? '2px solid var(--brand-primary)' : '1px solid var(--border-light)',
                            background: !selectedClasse ? '#eef2ff' : 'white',
                            color: !selectedClasse ? 'var(--brand-primary)' : 'var(--text-secondary)',
                        }}>
                            Toutes ({totalCount})
                        </button>
                        {classes.map(cls => (
                            <button key={cls.classe_id} onClick={() => { setSelectedClasse(cls.code); setCurrentPage(1); }} style={{
                                flex: '0 0 auto', padding: '8px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                                border: selectedClasse === cls.code ? '2px solid var(--brand-primary)' : '1px solid var(--border-light)',
                                background: selectedClasse === cls.code ? '#eef2ff' : 'white',
                                color: selectedClasse === cls.code ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            }}
                                onMouseEnter={e => { if (selectedClasse !== cls.code) { e.currentTarget.style.borderColor = 'var(--brand-primary)'; e.currentTarget.style.color = 'var(--brand-primary)'; e.currentTarget.style.background = '#eef2ff'; } }}
                                onMouseLeave={e => { if (selectedClasse !== cls.code) { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'white'; } }}>
                                {cls.libelle} ({cls.effectif_actuel})
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* Répertoire élèves */}
            <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <div className="card-header">
                    <h5>
                        Répertoire Élèves
                        {selectedClasse && (
                            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--brand-primary)', marginLeft: '10px' }}>
                                — {classes.find(c => c.code === selectedClasse)?.libelle || selectedClasse}
                            </span>
                        )}
                    </h5>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 14px', gap: '8px', background: 'white' }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input type="text" placeholder="Rechercher un élève..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                                style={{ border: 'none', outline: 'none', fontSize: '14px', width: '200px', background: 'transparent' }} />
                        </div>
                    </div>
                </div>

                <div className="card-body">
                    {/* Message d'erreur */}
                    {error && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', textAlign: 'center', padding: '24px', color: '#ef4444', background: '#fef2f2', borderRadius: '8px' }}>
                            <AlertTriangle size={14} /> {error}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={32} className="animate-spin" color="var(--brand-primary)" />
                        </div>
                    ) : eleves.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            Aucun élève trouvé
                        </div>
                    ) : (
                        <>
                            {/* TOP 5 CARTES — masquées sur mobile, redondantes avec la liste en cartes juste en dessous */}
                            {!isMobile && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                                {eleves.slice(0, 5).map((eleve, i) => (
                                    <motion.div key={eleve.eleve_id}
                                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: i * 0.05 }}
                                        style={{ border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px 16px', textAlign: 'center', position: 'relative', background: 'white', transition: 'all 0.2s' }}
                                        whileHover={{ y: -4, boxShadow: '0 8px 25px rgba(0,0,0,0.08)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', cursor: 'pointer', position: 'relative', zIndex: 2 }}
                                            onClick={e => { e.preventDefault(); e.stopPropagation(); setPreviewEleve(eleve); }}>
                                            <EleveAvatar eleve={eleve} size={64} colorIndex={i} />
                                        </div>
                                        <p style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px' }}>{eleve.prenom} {eleve.nom}</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{eleve.classe_code || '—'}</p>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{eleve.matricule}</p>
                                        <span className={`badge ${eleve.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px' }}>{eleve.statut}</span>
                                        <Link href={`/eleves/${eleve.eleve_id}`} style={{ position: 'absolute', inset: 0, borderRadius: '16px', zIndex: 0 }} aria-label={`Profil ${eleve.prenom} ${eleve.nom}`} />
                                    </motion.div>
                                ))}
                            </div>
                            )}

                            {/* LISTE — cartes empilées sur mobile, tableau sur tablette/desktop */}
                            {isMobile ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {eleves.map((eleve, i) => (
                                        <motion.div key={eleve.eleve_id}
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            transition={{ delay: i * 0.02 }}
                                            style={{ border: '1px solid var(--border-light)', borderRadius: '14px', padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'white' }}>
                                            <div style={{ cursor: 'pointer' }} onClick={() => setPreviewEleve(eleve)}>
                                                <EleveAvatar eleve={eleve} size={44} colorIndex={i} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                    <p style={{ fontWeight: 700, fontSize: '14px' }}>{eleve.prenom} {eleve.nom}</p>
                                                    {eleve.a_reinscrire
                                                        ? <span className="badge" style={{ fontSize: '10px', flexShrink: 0, background: '#fef3c7', color: '#92400e' }}>À activer</span>
                                                        : <span className={`badge ${eleve.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px', flexShrink: 0 }}>{eleve.statut}</span>}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '6px 0 10px' }}>
                                                    <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{eleve.matricule}</code>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{eleve.classe_code || '—'}</span>
                                                    <span className={`badge ${eleve.sexe === 'M' ? 'badge-info' : 'badge-subtle-danger'}`} style={{ fontSize: '10px' }}>
                                                        {eleve.sexe === 'M' ? '♂' : '♀'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {eleve.a_reinscrire && (
                                                        <button onClick={() => handleActiver(eleve)} disabled={activatingId === eleve.eleve_id} className="btn btn-sm" style={{ padding: '6px 12px', background: '#059669', color: 'white', fontWeight: 700 }} title="Activer (réinscrire pour cette année)">
                                                            {activatingId === eleve.eleve_id ? <Loader2 size={14} className="animate-spin" /> : 'Activer'}
                                                        </button>
                                                    )}
                                                    <button onClick={() => setBadgeEleve(eleve)} className="btn btn-outline btn-sm" style={{ padding: '6px 10px', color: '#10b981', borderColor: '#10b981' }} title="Voir la Carte (Badge)"><UserCheck size={14} /></button>
                                                    <Link href={`/eleves/${eleve.eleve_id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} title="Voir"><Eye size={14} /></Link>
                                                    <Link href={`/eleves/modifier/${eleve.eleve_id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} title="Modifier"><Edit size={14} /></Link>
                                                    <button onClick={() => handleDelete(eleve.eleve_id)} className="btn btn-outline btn-sm" style={{ padding: '6px 10px', color: 'var(--danger)' }} title="Supprimer"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                            <div className="table-scroll">
                            <table className="sp-table" style={{ minWidth: '760px' }}>
                                <thead>
                                    <tr>
                                        <th>#</th><th>Photo</th><th>Élève</th><th>Matricule</th>
                                        <th>Sexe</th><th>Classe</th><th>Statut</th><th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {eleves.map((eleve, i) => (
                                        <motion.tr key={eleve.eleve_id}
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                            transition={{ delay: i * 0.02 }}>
                                            <td style={{ color: 'var(--text-muted)' }}>{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                                            <td style={{ cursor: 'pointer' }} onClick={() => setPreviewEleve(eleve)}>
                                                <EleveAvatar eleve={eleve} size={38} colorIndex={i} />
                                            </td>
                                            <td>
                                                <div>
                                                    <p style={{ fontWeight: 600 }}>{eleve.prenom} {eleve.nom}</p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{eleve.niveau || ''}</p>
                                                </div>
                                            </td>
                                            <td><code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}>{eleve.matricule}</code></td>
                                            <td>
                                                <span className={`badge ${eleve.sexe === 'M' ? 'badge-info' : 'badge-subtle-danger'}`}>
                                                    {eleve.sexe === 'M' ? '♂ Masculin' : '♀ Féminin'}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>
                                                {eleve.classe_code || '—'}
                                                {eleve.a_reinscrire && <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 500, marginLeft: '6px' }}>(pré-placé)</span>}
                                            </td>
                                            <td>
                                                {eleve.a_reinscrire
                                                    ? <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>À activer</span>
                                                    : <span className={`badge ${eleve.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`}>{eleve.statut}</span>}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {eleve.a_reinscrire && (
                                                        <button onClick={() => handleActiver(eleve)} disabled={activatingId === eleve.eleve_id} className="btn btn-sm" style={{ padding: '4px 10px', background: '#059669', color: 'white', fontWeight: 700 }} title="Activer (réinscrire pour cette année)">
                                                            {activatingId === eleve.eleve_id ? <Loader2 size={14} className="animate-spin" /> : <>Activer</>}
                                                        </button>
                                                    )}
                                                    <button onClick={() => setBadgeEleve(eleve)} className="btn btn-outline btn-sm" style={{ padding: '4px 8px', color: '#10b981', borderColor: '#10b981' }} title="Voir la Carte (Badge)"><UserCheck size={14} /></button>
                                                    <Link href={`/eleves/${eleve.eleve_id}`} className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Voir"><Eye size={14} /></Link>
                                                    <Link href={`/eleves/modifier/${eleve.eleve_id}`} className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Modifier"><Edit size={14} /></Link>
                                                    <button onClick={() => handleDelete(eleve.eleve_id)} className="btn btn-outline btn-sm" style={{ padding: '4px 8px', color: 'var(--danger)' }} title="Supprimer"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            )}

                            {/* Pagination */}
                            <div className="pagination">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    let page: number;
                                    if (totalPages <= 5)           page = i + 1;
                                    else if (currentPage <= 3)     page = i + 1;
                                    else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                                    else                           page = currentPage - 2 + i;
                                    return (
                                        <button key={page} className={currentPage === page ? 'active' : ''} onClick={() => setCurrentPage(page)}>
                                            {page}
                                        </button>
                                    );
                                })}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
