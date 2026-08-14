'use client';

import { useApp } from '@/context/AppContext';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    GraduationCap, UserPlus, UserMinus, UserCheck, Plus, Search,
    ChevronRight, ChevronLeft, Eye, Edit, Trash2, Loader2, Camera, X, ArrowLeft
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import BadgeCarte from '@/components/BadgeCarte';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/hooks/useIsMobile';

interface Enseignant {
    enseignant_id: number; matricule: string; nom: string; prenom: string;
    sexe: string; telephone: string; email?: string; specialite?: string;
    type_contrat: string; statut: string; photo_url?: string | null;
    date_naissance?: string | null;
    adresse?: string | null;
    role?: string;
}

const avatarColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#f97316'];
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
const subjects = ['Mathématiques', 'Français', 'Sciences', 'Informatique', 'Design', 'Économie'];

/* ─── Reusable avatar with camera redirect ─── */
function EnsAvatar({ ens, size = 56, idx = 0 }: {
    ens: Enseignant; size?: number; idx?: number; onUploaded?: () => void;
}) {
    const router = useRouter();
    const photoSrc = ens.photo_url ? `${API_BASE}${ens.photo_url}` : null;
    const initials = `${ens.prenom.charAt(0)}${ens.nom.charAt(0)}`;
    const color = avatarColors[idx % avatarColors.length];
    const cam = Math.max(20, Math.round(size * 0.35));

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
            {!photoSrc && (
                <button onClick={e => { e.stopPropagation(); e.preventDefault(); router.push(`/galerie?search=${encodeURIComponent(ens.nom)}&tab=enseignants&highlight=${ens.enseignant_id}`); }}
                    title="Gérer la photo dans la galerie"
                    style={{
                        position: 'absolute', bottom: -2, right: -2,
                        width: cam, height: cam, borderRadius: '50%',
                        background: 'var(--brand-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid white', cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}>
                    <Camera size={cam * 0.55} color="white" />
                </button>
            )}
        </div>
    );
}

/* ─────────── Teacher Photo Lightbox — just photo ─────────── */
function EnsLightbox({ ens, onClose }: { ens: Enseignant; onClose: () => void }) {
    const photoSrc = ens.photo_url ? `${API_BASE}${ens.photo_url}` : null;
    const initials = `${ens.prenom.charAt(0)}${ens.nom.charAt(0)}`;
    const color = avatarColors[ens.enseignant_id % avatarColors.length];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '40px' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: '20px', right: '20px', width: '44px', height: '44px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={22} color="white" />
            </button>
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 20 }}
                onClick={e => e.stopPropagation()}
                style={{
                    width: photoSrc ? 'auto' : '280px', maxWidth: '90vw', maxHeight: '75vh',
                    borderRadius: '16px', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                    aspectRatio: photoSrc ? undefined : '1',
                    background: photoSrc ? 'transparent' : `linear-gradient(135deg, ${color}, ${color}bb)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {photoSrc ? (
                    <img src={photoSrc} alt={`${ens.prenom} ${ens.nom}`}
                        style={{ maxWidth: '90vw', maxHeight: '75vh', objectFit: 'contain', display: 'block', borderRadius: '16px' }} />
                ) : (
                    <span style={{ fontSize: '90px', fontWeight: 900, color: 'white', opacity: 0.4 }}>{initials}</span>
                )}
            </motion.div>
            <div style={{ textAlign: 'center', color: 'white' }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{ens.prenom} {ens.nom}</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.6 }}>{ens.specialite || 'Enseignant'} • {ens.matricule}</p>
            </div>
        </motion.div>
    );
}

export default function EnseignantsPage() {
    const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
    const { etablissementId } = useApp();
    const router = useRouter();
    const isMobile = useIsMobile();
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [previewEns, setPreviewEns] = useState<Enseignant | null>(null);
    const [badgeEns, setBadgeEns] = useState<Enseignant | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState({ total: 0, actifs: 0, vacataires: 0 });
    const pageSize = 10;

    // Paginée + recherchée côté serveur (le backend le supportait déjà,
    // seule cette page ne l'utilisait pas) — avant, un seul lot de 50
    // enseignants était chargé une fois, puis re-tranché par 10 côté client :
    // au-delà du 50e enseignant, aucune page suivante n'affichait quoi que
    // ce soit malgré un pagineur qui laissait croire le contraire.
    const fetchData = () => {
        setLoading(true);
        const skip = (currentPage - 1) * pageSize;
        api.get('/api/enseignants', {
            params: { etablissement_id: etablissementId, search: search || undefined, skip, limit: pageSize },
        })
            .then(res => {
                setEnseignants(res.data);
                const totalCount = res.headers?.['x-total-count'];
                setTotal(totalCount !== undefined ? Number(totalCount) : res.data.length);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => { fetchData(); }, [etablissementId, currentPage, search]);

    // Agrégats globaux (toute l'école, pas seulement la page affichée) —
    // rechargés au montage et après une suppression, pas à chaque page.
    const fetchCounts = () => {
        if (!etablissementId) return;
        api.get('/api/enseignants/count', { params: { etablissement_id: etablissementId } })
            .then(res => setCounts(res.data))
            .catch(() => {});
    };
    useEffect(() => { fetchCounts(); }, [etablissementId]);

    // Recherche : revenir à la page 1 pour éviter une page vide après filtrage
    useEffect(() => { setCurrentPage(1); }, [search]);

    const handleDelete = async (id: number) => {
        if (!window.confirm('Supprimer cet enseignant ?')) return;
        try { await api.delete(`/api/enseignants/${id}`); fetchData(); fetchCounts(); }
        catch { alert('Erreur lors de la suppression'); }
    };

    const paginatedList = enseignants;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const totalTeachers = counts.total;
    const activeTeachers = counts.actifs;
    const onLeave = totalTeachers - activeTeachers;

    const kpis = [
        { label: 'Total Enseignants', value: totalTeachers, icon: GraduationCap, color: '#3b82f6' },
        { label: 'Nouveaux Recrutés', value: Math.min(2, totalTeachers), icon: UserPlus, color: '#10b981' },
        { label: 'En Congé', value: onLeave, icon: UserMinus, color: '#ef4444' },
        { label: 'Présents', value: activeTeachers, icon: UserCheck, color: '#6366f1' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Photo Lightbox */}
            <AnimatePresence>
                {previewEns && <EnsLightbox ens={previewEns} onClose={() => setPreviewEns(null)} />}
                {badgeEns && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setBadgeEns(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background: 'transparent', padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <BadgeCarte agent={badgeEns} id="admin-badge-view" />
                            <button onClick={() => setBadgeEns(null)} className="btn btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>Fermer</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Grid des Cartes (Enseignants) */}
            <AnimatePresence>
                {viewMode === 'grid' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(248,250,252,0.98)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', padding: '32px', overflowY: 'auto' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', background: 'white', padding: '16px 24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'var(--brand-primary)', color: 'white', padding: '8px', borderRadius: '8px' }}>
                                    <UserCheck size={24} />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Cartes des Enseignants</h2>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>{paginatedList.length} carte(s) affichée(s) pour la page courante.</p>
                                </div>
                            </div>
                            <button onClick={() => setViewMode('list')} className="btn btn-outline" style={{ background: 'white', border: '1px solid var(--border-light)' }}>
                                <X size={20} /> Fermer la grille
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', justifyContent: 'center', paddingBottom: '64px' }}>
                            {paginatedList.map(ens => (
                                <BadgeCarte 
                                    key={ens.enseignant_id}
                                    agent={{
                                        nom: ens.nom,
                                        prenom: ens.prenom,
                                        matricule: ens.matricule,
                                        photo_url: ens.photo_url || undefined,
                                        role: 'ENSEIGNANT',
                                        date_naissance: ens.date_naissance,
                                        adresse: ens.adresse,
                                        specialite: ens.specialite,
                                        enseignant_id: ens.enseignant_id
                                    }} 
                                    id={`badge-grid-ens-${ens.enseignant_id}`} 
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
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
                        <Link href="/">Accueil</Link><ChevronRight size={14} />
                        <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>Enseignants</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <button onClick={() => setViewMode('grid')} className="btn btn-outline btn-sm" style={{ color: '#10b981', borderColor: '#10b981' }}>
                        <UserCheck size={16} /> Toutes les Cartes
                    </button>
                    <Link href="/galerie" className="btn btn-outline btn-sm"><Camera size={16} /> Galerie Photos</Link>
                    <Link href="/enseignants/nouveau" className="btn btn-primary"><Plus size={18} /> Ajouter Enseignant</Link>
                </div>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
                {kpis.map((kpi, i) => (
                    <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><p className="kpi-label">{kpi.label}</p><p className="kpi-value">{kpi.value}</p></div>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <kpi.icon size={24} />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Featured Cards — with hover animations like élèves page — masquées sur mobile, redondantes avec la liste en cartes */}
            {!isMobile && (
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '16px' }}>
                    {enseignants.slice(0, 6).map((e, i) => (
                        <motion.div key={e.enseignant_id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ y: -4, boxShadow: '0 8px 25px rgba(0,0,0,0.08)' }}
                            style={{
                                border: '1px solid var(--border-light)',
                                borderRadius: '16px', padding: '24px 16px',
                                textAlign: 'center', position: 'relative',
                                background: 'white', transition: 'all 0.2s',
                            }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', cursor: 'pointer', position: 'relative', zIndex: 2 }}
                                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setPreviewEns(e); }}>
                                <EnsAvatar ens={e} size={64} idx={i} />
                            </div>
                            <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '2px' }}>{e.prenom} {e.nom}</p>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{e.specialite || subjects[i % subjects.length]}</p>
                            <span className={`badge ${e.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px' }}>
                                {e.statut}
                            </span>
                            <Link href={`/enseignants/${e.enseignant_id}`} style={{ position: 'absolute', inset: 0, borderRadius: '16px', zIndex: 0 }} />
                        </motion.div>
                    ))}
                </div>
            </motion.div>
            )}

            {/* Table with photo upload */}
            <motion.div className="card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <div className="card-header">
                    <h5>Annuaire Enseignants</h5>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '8px 14px', gap: '8px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input type="text" placeholder="Rechercher..." value={search}
                            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                            style={{ border: 'none', outline: 'none', fontSize: '14px', width: '180px', background: 'transparent' }} />
                    </div>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                            <Loader2 size={32} className="animate-spin" color="var(--brand-primary)" />
                        </div>
                    ) : (
                        <>
                            {isMobile ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
                                    {paginatedList.map((ens, i) => (
                                        <motion.div key={ens.enseignant_id}
                                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                                            style={{ border: '1px solid var(--border-light)', borderRadius: '14px', padding: '14px', display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'white' }}>
                                            <div style={{ cursor: 'pointer' }} onClick={() => setPreviewEns(ens)}>
                                                <EnsAvatar ens={ens} size={44} idx={i} onUploaded={fetchData} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                    <p style={{ fontWeight: 700, fontSize: '14px' }}>{ens.prenom} {ens.nom}</p>
                                                    <span className={`badge ${ens.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '10px', flexShrink: 0 }}>{ens.statut}</span>
                                                </div>
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 6px' }}>{ens.specialite || subjects[i % subjects.length]}</p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                                    <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{ens.matricule}</code>
                                                    <span className={`badge ${ens.type_contrat === 'PERMANENT' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '10px' }}>{ens.type_contrat}</span>
                                                    {ens.telephone && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ens.telephone}</span>}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <Link href={`/enseignants/${ens.enseignant_id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} title="Voir"><Eye size={14} /></Link>
                                                    <button onClick={() => setBadgeEns({ ...ens, role: 'ENSEIGNANT' })} className="btn btn-outline btn-sm" style={{ padding: '6px 10px', color: '#10b981', borderColor: '#10b981' }} title="Voir la Carte (Badge)"><UserCheck size={14} /></button>
                                                    <Link href={`/enseignants/modifier/${ens.enseignant_id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 10px' }} title="Modifier"><Edit size={14} /></Link>
                                                    <button onClick={() => handleDelete(ens.enseignant_id)} className="btn btn-outline btn-sm" style={{ padding: '6px 10px', color: 'var(--danger)' }} title="Supprimer"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                            <div className="table-scroll">
                            <table className="sp-table" style={{ minWidth: '820px' }}>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Photo</th>
                                        <th>Enseignant</th>
                                        <th>Matricule</th>
                                        <th>Spécialité</th>
                                        <th>Contrat</th>
                                        <th>Téléphone</th>
                                        <th>Statut</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedList.map((ens, i) => (
                                        <motion.tr key={ens.enseignant_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                                            <td style={{ color: 'var(--text-muted)' }}>{(currentPage - 1) * pageSize + i + 1}</td>
                                            <td style={{ cursor: 'pointer' }} onClick={() => setPreviewEns(ens)}><EnsAvatar ens={ens} size={38} idx={i} onUploaded={fetchData} /></td>
                                            <td>
                                                <div>
                                                    <p style={{ fontWeight: 600 }}>{ens.prenom} {ens.nom}</p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{ens.email || ''}</p>
                                                </div>
                                            </td>
                                            <td><code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}>{ens.matricule}</code></td>
                                            <td style={{ fontWeight: 500 }}>{ens.specialite || subjects[i % subjects.length]}</td>
                                            <td><span className={`badge ${ens.type_contrat === 'PERMANENT' ? 'badge-info' : 'badge-warning'}`}>{ens.type_contrat}</span></td>
                                            <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{ens.telephone}</td>
                                            <td><span className={`badge ${ens.statut === 'ACTIF' ? 'badge-success' : 'badge-danger'}`}>{ens.statut}</span></td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <Link href={`/enseignants/${ens.enseignant_id}`} className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Voir"><Eye size={14} /></Link>
                                                    <button onClick={() => setBadgeEns({ ...ens, role: 'ENSEIGNANT' })} className="btn btn-outline btn-sm" style={{ padding: '4px 8px', color: '#10b981', borderColor: '#10b981' }} title="Voir la Carte (Badge)"><UserCheck size={14} /></button>
                                                    <Link href={`/enseignants/modifier/${ens.enseignant_id}`} className="btn btn-outline btn-sm" style={{ padding: '4px 8px' }} title="Modifier"><Edit size={14} /></Link>
                                                    <button onClick={() => handleDelete(ens.enseignant_id)} className="btn btn-outline btn-sm" style={{ padding: '4px 8px', color: 'var(--danger)' }} title="Supprimer"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            )}
                            <div className="pagination">
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={16} /></button>
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
                                    <button key={page} className={currentPage === page ? 'active' : ''} onClick={() => setCurrentPage(page)}>{page}</button>
                                ))}
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={16} /></button>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
