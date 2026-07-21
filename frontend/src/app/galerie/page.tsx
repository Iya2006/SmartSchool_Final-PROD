'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Camera, Users, GraduationCap, Heart, Loader2, Clock,
    Search, ChevronRight, Image, CheckCircle, X,
    Eye, Edit, Upload
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
const avatarColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6'];


interface PendingPhoto {
    photo_id: number;
    entity_type: string;
    entity_id: number;
    name: string;
    uploader_name: string;
    file_path: string;
    date_upload: string;
}

interface PersonPhoto {
    eleve_id?: number; enseignant_id?: number; parent_id?: number;
    nom: string; prenom: string; sexe: string; matricule?: string;
    photo_url: string | null; statut?: string; specialite?: string;
    telephone_1?: string; profession?: string;
}
interface ClasseGroup { code: string; libelle: string; eleves: PersonPhoto[]; }
interface GalerieData {
    eleves_par_classe: ClasseGroup[];
    enseignants: PersonPhoto[];
    parents: PersonPhoto[];
    stats: {
        total_eleves: number; eleves_avec_photo: number;
        total_enseignants: number; enseignants_avec_photo: number;
        total_parents: number; parents_avec_photo: number;
    };
}

/* ═══════════════════════════════════════════════════════════
   LIGHTBOX MODAL — plein écran pour voir la photo
   ═══════════════════════════════════════════════════════════ */
function Lightbox({ person, onClose }: {
    person: PersonPhoto; onClose: () => void;
}) {
    const id = person.eleve_id || person.enseignant_id || person.parent_id || 0;
    const photoSrc = person.photo_url ? `${API_BASE}${person.photo_url}` : null;
    const initials = `${person.prenom.charAt(0)}${person.nom.charAt(0)}`;
    const color = avatarColors[id % avatarColors.length];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '16px', padding: '40px',
            }}>
            {/* Close button */}
            <button onClick={onClose} style={{
                position: 'absolute', top: '20px', right: '20px', zIndex: 10,
                width: '44px', height: '44px', borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.1)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <X size={22} color="white" />
            </button>

            {/* Photo — full screen */}
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 20 }}
                onClick={e => e.stopPropagation()}
                style={{
                    width: photoSrc ? 'auto' : '280px',
                    maxWidth: '90vw', maxHeight: '75vh',
                    borderRadius: '16px', overflow: 'hidden',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                    aspectRatio: photoSrc ? undefined : '1',
                    background: photoSrc ? 'transparent' : `linear-gradient(135deg, ${color}, ${color}bb)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {photoSrc ? (
                    <img src={photoSrc} alt={`${person.prenom} ${person.nom}`}
                        style={{ maxWidth: '90vw', maxHeight: '75vh', objectFit: 'contain', display: 'block', borderRadius: '16px' }} />
                ) : (
                    <span style={{ fontSize: '90px', fontWeight: 900, color: 'white', opacity: 0.4 }}>{initials}</span>
                )}
            </motion.div>

            {/* Name label */}
            <div style={{ textAlign: 'center', color: 'white' }}>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{person.prenom} {person.nom}</p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.6 }}>
                    {person.matricule || person.specialite || person.profession || ''}
                    {photoSrc ? '' : ' • Photo manquante'}
                </p>
            </div>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════
   PHOTO CARD — click = preview, hover = actions
   ═══════════════════════════════════════════════════════════ */
function PhotoCard({ person, type, onUploaded, onPreview, isHighlighted }: {
    person: PersonPhoto; type: 'eleve' | 'enseignant' | 'parent';
    onUploaded: () => void; onPreview: () => void; isHighlighted?: boolean;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [uploading, setUploading] = useState(false);
    const [justUploaded, setJustUploaded] = useState(false);
    const [hovered, setHovered] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const id = person.eleve_id || person.enseignant_id || person.parent_id || 0;
    const rawPhotoSrc = person.photo_url ? `${API_BASE}${person.photo_url}` : null;
    const [imgError, setImgError] = useState(false);
    const photoSrc = imgError ? null : rawPhotoSrc;
    const initials = `${(person.prenom || '').charAt(0)}${(person.nom || '').charAt(0)}`;
    const color = avatarColors[id % avatarColors.length];
    const hasPhoto = !!photoSrc;
    const profileUrl = type === 'eleve' ? `/eleves/${id}` : type === 'enseignant' ? `/enseignants/${id}` : `/familles/${id}`;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData(); fd.append('fichier', file);
            await api.post(`/api/photos/upload/${type}/${id}`, fd,
                { headers: { 'Content-Type': 'multipart/form-data' } });
            setJustUploaded(true); setTimeout(() => setJustUploaded(false), 2000);
            onUploaded();
        } catch { }
        finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
    };

    const handleAssignClick = (e: any) => {
        e.stopPropagation();
        if(inputRef.current) inputRef.current.click();
    };

    return (
        <motion.div
            id={isHighlighted ? `highlight-${type}-${id}` : undefined}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isHighlighted ? { opacity: 1, scale: [1, 1.03, 1], boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.4)' } : { opacity: 1, scale: 1 }}
            transition={isHighlighted ? { repeat: Infinity, duration: 1.5 } : {}}
            whileHover={{ y: -4, boxShadow: '0 12px 28px rgba(0,0,0,0.1)' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: '16px', overflow: 'hidden',
                border: `2px solid ${isHighlighted ? '#ef4444' : (hasPhoto ? '#d1fae5' : '#fee2e2')}`,
                background: 'white', cursor: 'pointer', position: 'relative',
            }}>
            {isHighlighted && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#ef4444', color: 'white', fontSize: '10px', fontWeight: 800, textAlign: 'center', padding: '4px 0', zIndex: 10, letterSpacing: '0.5px' }}>
                    ⚠️ PHOTO À ATTRIBUER
                </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleUpload} />

            {/* Photo area — click to preview */}
            <div onClick={onPreview} style={{
                width: '100%', aspectRatio: '1', position: 'relative',
                background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden'
            }}>
                {photoSrc ? (
                    <img src={photoSrc} onError={() => setImgError(true)} alt="Profile"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <span style={{ fontSize: '32px', fontWeight: 900, color: 'white', opacity: 0.9 }}>
                        {initials}
                    </span>
                )}

                {/* Status badge */}
                <div style={{
                    position: 'absolute', top: '8px', right: '8px',
                    padding: '3px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                    background: hasPhoto ? '#d1fae5' : '#fee2e2',
                    color: hasPhoto ? '#065f46' : '#dc2626',
                }}>
                    {hasPhoto ? '✓ Photo' : '✗ Manquante'}
                </div>

                {/* Hover overlay — click anywhere to preview, Attribuer button for highlighted */}
                <AnimatePresence>
                    {(hovered || isHighlighted) && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={(e) => { e.stopPropagation(); onPreview(); }}
                            style={{
                                position: 'absolute', inset: 0,
                                background: isHighlighted ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '10px',
                                cursor: 'zoom-in',
                            }}>
                            {isHighlighted ? (
                                <>
                                    <button onClick={(e) => {
                                        e.stopPropagation();
                                        setJustUploaded(true);
                                        setTimeout(() => {
                                            setJustUploaded(false);
                                            const params = new URLSearchParams(searchParams.toString());
                                            params.delete('highlight');
                                            params.delete('assign_id');
                                            router.push(`${pathname}?${params.toString()}`);
                                        }, 1500);
                                    }}
                                        style={{
                                            padding: '8px 16px', borderRadius: '10px', border: 'none',
                                            background: '#ef4444', color: 'white', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700,
                                            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                                        }}>
                                        <CheckCircle size={16} /> Attribuer
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onPreview(); }}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px', border: 'none',
                                            background: 'rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600,
                                        }}>
                                        <Eye size={12} /> Voir la photo
                                    </button>
                                </>
                            ) : (
                                <button onClick={(e) => { e.stopPropagation(); onPreview(); }}
                                    style={{
                                        width: '48px', height: '48px', borderRadius: '50%', border: 'none',
                                        background: 'rgba(255,255,255,0.9)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                    }} title="Voir la photo">
                                    <Eye size={22} color="#6366f1" />
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Success animation */}
                <AnimatePresence>
                    {justUploaded && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                            style={{
                                position: 'absolute', inset: 0, background: 'rgba(16,185,129,0.7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                            <CheckCircle size={40} color="white" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Name */}
            <div style={{ padding: '10px 14px' }}>
                <p style={{ fontWeight: 700, fontSize: '13px', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {person.prenom} {person.nom}
                </p>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                    {person.matricule || person.specialite || person.profession || ''}
                </p>
            </div>
        </motion.div>
    );
}

/* ─── Progress bar ─── */
function PhotoProgress({ done, total, label, color }: { done: number; total: number; label: string; color: string }) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color }}>{done}/{total} ({pct}%)</span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: '4px', background: `linear-gradient(135deg, ${color}, ${color}bb)` }} />
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function GaleriePage() {
    return (
        <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '12px' }}>
                <Loader2 size={40} className="animate-spin" color="#6366f1" />
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>Chargement...</p>
            </div>
        }>
            <GalerieContent />
        </Suspense>
    );
}

function GalerieContent() {
    const searchParams = useSearchParams();
    const [data, setData] = useState<GalerieData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<'eleves' | 'enseignants' | 'parents' | 'attente'>((searchParams.get('tab') as any) || 'eleves');
    const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [filterPhoto, setFilterPhoto] = useState<'all' | 'with' | 'without'>('all');
    const [selectedClasse, setSelectedClasse] = useState<string | null>(null);
    const [previewPerson, setPreviewPerson] = useState<{ person: PersonPhoto; type: 'eleve' | 'enseignant' | 'parent' } | null>(null);
    
    // Check URL for Highlight / Assignment modes
    const highlightId = searchParams.get('highlight') || searchParams.get('assign_id');

    // Auto-scroll vers la carte surlignée après chargement
    useEffect(() => {
        if (!data || !highlightId) return;
        const timeout = setTimeout(() => {
            const el = document.getElementById(`highlight-${tab}-${highlightId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 400);
        return () => clearTimeout(timeout);
    }, [data, highlightId, tab]);

    const fetchData = async () => {
        try {
            setError('');
            const res = await api.get('/api/photos/galerie/all');
            setData(res.data);
            const pendingRes = await api.get('/api/photos/pending/all');
            setPendingPhotos(pendingRes.data);
        } catch (err: any) {
            console.error('Galerie load error:', err);
            const detail = err?.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail
                : Array.isArray(detail) ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
                : err?.message || 'Erreur de connexion au serveur';
            setError(msg);
        }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '12px' }}>
            <Loader2 size={40} className="animate-spin" color="#6366f1" />
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Chargement de la galerie...</p>
        </div>
    );

    if (error || !data) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '16px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image size={32} color="#ef4444" />
            </div>
            <h3 style={{ margin: 0, color: '#1e293b' }}>Impossible de charger la galerie</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', maxWidth: '400px', textAlign: 'center' }}>
                {error || 'Vérifiez que le serveur backend est bien démarré.'}
            </p>
            <button onClick={() => { setLoading(true); fetchData(); }}
                style={{
                    padding: '10px 24px', borderRadius: '10px', border: 'none',
                    background: '#6366f1', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}>
                Réessayer
            </button>
        </div>
    );

    const s = data.stats;
    const totalPhotos = s.eleves_avec_photo + s.enseignants_avec_photo + s.parents_avec_photo;
    const totalPersonnes = s.total_eleves + s.total_enseignants + s.total_parents;

    const matchSearch = (p: PersonPhoto) => {
        if (!search) return true;
        const q = search.toLowerCase();
        // Chercher dans le prénom, nom, matricule, et le nom complet combiné dans les deux sens
        const fullName = `${p.prenom} ${p.nom}`.toLowerCase();
        const fullNameRev = `${p.nom} ${p.prenom}`.toLowerCase();
        return fullName.includes(q) || fullNameRev.includes(q)
            || p.nom.toLowerCase().includes(q)
            || p.prenom.toLowerCase().includes(q)
            || (p.matricule || '').toLowerCase().includes(q);
    };
    const matchFilter = (p: PersonPhoto) => {
        if (filterPhoto === 'all') return true;
        return filterPhoto === 'with' ? !!p.photo_url : !p.photo_url;
    };

    const tabs = [
        { id: 'attente' as const, label: 'En Attente', icon: Clock, count: pendingPhotos.length, photos: pendingPhotos.length, color: '#ef4444' },
        { id: 'eleves' as const, label: 'Élèves', icon: Users, count: s.total_eleves, photos: s.eleves_avec_photo, color: '#6366f1' },
        { id: 'enseignants' as const, label: 'Enseignants', icon: GraduationCap, count: s.total_enseignants, photos: s.enseignants_avec_photo, color: '#10b981' },
        { id: 'parents' as const, label: 'Parents', icon: Heart, count: s.total_parents, photos: s.parents_avec_photo, color: '#f59e0b' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Lightbox */}
            <AnimatePresence>
                {previewPerson && (
                    <Lightbox person={previewPerson.person}
                        onClose={() => setPreviewPerson(null)} />
                )}
            </AnimatePresence>

            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link><ChevronRight size={14} />
                <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>Galerie Photos</span>
            </div>

            {/* Hero */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    padding: '32px', background: 'linear-gradient(135deg, #1e1b4b, #4338ca)',
                    color: 'white', borderRadius: '20px', position: 'relative', overflow: 'hidden',
                }}>
                <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ position: 'absolute', bottom: '-60px', left: '-30px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', position: 'relative' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Image size={24} />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Galerie Photos</h1>
                                <p style={{ margin: 0, fontSize: '14px', opacity: 0.8 }}>Gérez toutes les photos de l&apos;établissement</p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        {[
                            { val: totalPhotos, lbl: 'Photos' },
                            { val: totalPersonnes - totalPhotos, lbl: 'Manquantes' },
                            { val: `${totalPersonnes > 0 ? Math.round(totalPhotos / totalPersonnes * 100) : 0}%`, lbl: 'Complet' },
                        ].map((s, i) => (
                            <div key={i} style={{ textAlign: 'center', padding: '12px 20px', borderRadius: '12px', background: 'rgba(255,255,255,0.12)' }}>
                                <p style={{ margin: 0, fontSize: '26px', fontWeight: 800 }}>{s.val}</p>
                                <p style={{ margin: 0, fontSize: '11px', opacity: 0.7 }}>{s.lbl}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '24px', marginTop: '24px', position: 'relative' }}>
                    <PhotoProgress done={data.stats.eleves_avec_photo} total={data.stats.total_eleves} label="Élèves" color="#818cf8" />
                    <PhotoProgress done={data.stats.enseignants_avec_photo} total={data.stats.total_enseignants} label="Enseignants" color="#34d399" />
                    <PhotoProgress done={data.stats.parents_avec_photo} total={data.stats.total_parents} label="Parents" color="#fbbf24" />
                </div>
            </motion.div>

            {/* Tabs + Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', borderRadius: '12px', padding: '4px' }}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => { setTab(t.id); setSelectedClasse(null); }}
                            style={{
                                padding: '10px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                                fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px',
                                background: tab === t.id ? 'white' : 'transparent',
                                color: tab === t.id ? t.color : '#64748b',
                                boxShadow: tab === t.id ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                                transition: 'all 0.2s',
                            }}>
                            <t.icon size={16} /> {t.label}
                            <span style={{
                                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                                background: tab === t.id ? `${t.color}15` : '#e2e8f0',
                                color: tab === t.id ? t.color : '#94a3b8',
                            }}>{t.photos}/{t.count}</span>
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', gap: '8px', background: 'white' }}>
                        <Search size={16} color="#94a3b8" />
                        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ border: 'none', outline: 'none', fontSize: '13px', width: '150px', background: 'transparent' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '3px', background: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
                        {[
                            { key: 'all' as const, label: 'Tous' },
                            { key: 'with' as const, label: '✓ Photos' },
                            { key: 'without' as const, label: '✗ Manquantes' },
                        ].map(f => (
                            <button key={f.key} onClick={() => setFilterPhoto(f.key)} style={{
                                padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                fontSize: '11px', fontWeight: 600,
                                background: filterPhoto === f.key ? 'white' : 'transparent',
                                color: filterPhoto === f.key ? '#1e293b' : '#94a3b8',
                                boxShadow: filterPhoto === f.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                            }}>{f.label}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══ ÉLÈVES PAR CLASSE ═══ */}
            {tab === 'eleves' && (
                <>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => setSelectedClasse(null)}
                            className={`btn ${!selectedClasse ? 'btn-primary' : 'btn-outline'} btn-sm`} style={{ fontSize: '12px' }}>
                            Toutes les classes
                        </button>
                        {data.eleves_par_classe.map(c => (
                            <button key={c.code} onClick={() => setSelectedClasse(c.code)}
                                className={`btn ${selectedClasse === c.code ? 'btn-primary' : 'btn-outline'} btn-sm`} style={{ fontSize: '12px' }}>
                                {c.code} ({c.eleves.filter(e => matchFilter(e)).length})
                            </button>
                        ))}
                    </div>
                    {data.eleves_par_classe
                        .filter(c => !selectedClasse || c.code === selectedClasse)
                        .map((classe, ci) => {
                            const filtered = classe.eleves.filter(e => matchSearch(e) && matchFilter(e));
                            if (filtered.length === 0) return null;
                            return (
                                <motion.div key={classe.code} className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.04 }}>
                                    <div className="card-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                                <GraduationCap size={18} />
                                            </div>
                                            <div>
                                                <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{classe.libelle || classe.code}</h5>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                                                    {classe.eleves.filter(e => !!e.photo_url).length}/{classe.eleves.length} photos
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ padding: '16px 20px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
                                            {filtered.map(eleve => (
                                                <PhotoCard key={eleve.eleve_id} person={eleve} type="eleve" onUploaded={fetchData}
                                                    isHighlighted={eleve.eleve_id?.toString() === highlightId}
                                                    onPreview={() => setPreviewPerson({ person: eleve, type: 'eleve' })} />
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                </>
            )}

            
            {/* ═══ EN ATTENTE ═══ */}
            {tab === 'attente' && (
                <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #ef4444, #f87171)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                <Clock size={18} />
                            </div>
                            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                                Photos en attente de validation ({pendingPhotos.length})
                            </h5>
                        </div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                        {pendingPhotos.length === 0 ? (
                            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Aucune photo en attente.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                                {pendingPhotos.map(p => (
                                    <div key={p.photo_id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#f8fafc' }}>
                                        <div style={{ height: '180px', width: '100%', background: '#cbd5e1', position: 'relative' }}>
                                            <img src={`${API_BASE}${p.file_path}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>
                                                {p.entity_type.toUpperCase()}
                                            </div>
                                        </div>
                                        <div style={{ padding: '12px' }}>
                                            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '14px' }}>{p.name}</p>
                                            <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#64748b' }}>Envoyé par: {p.uploader_name}</p>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={async () => {
                                                    try {
                                                        await api.post(`/api/photos/validate/${p.photo_id}`);
                                                        fetchData();
                                                    } catch (e) { alert('Erreur'); }
                                                }} style={{ flex: 1, padding: '6px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Valider</button>
                                                <button onClick={async () => {
                                                    if(!confirm('Rejeter cette photo ?')) return;
                                                    try {
                                                        await api.post(`/api/photos/reject/${p.photo_id}`);
                                                        fetchData();
                                                    } catch (e) { alert('Erreur'); }
                                                }} style={{ flex: 1, padding: '6px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Rejeter</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ═══ ENSEIGNANTS ═══ */}
            {tab === 'enseignants' && (
                <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                <GraduationCap size={18} />
                            </div>
                            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                                Enseignants ({data.enseignants.filter(e => matchSearch(e) && matchFilter(e)).length})
                            </h5>
                        </div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
                            {data.enseignants.filter(e => matchSearch(e) && matchFilter(e)).map(ens => (
                                <PhotoCard key={ens.enseignant_id} person={ens} type="enseignant" onUploaded={fetchData}
                                    isHighlighted={ens.enseignant_id?.toString() === highlightId}
                                    onPreview={() => setPreviewPerson({ person: ens, type: 'enseignant' })} />
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ═══ PARENTS ═══ */}
            {tab === 'parents' && (
                <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                <Heart size={18} />
                            </div>
                            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                                Parents ({data.parents.filter(p => matchSearch(p) && matchFilter(p)).length})
                            </h5>
                        </div>
                    </div>
                    <div style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
                            {data.parents.filter(p => matchSearch(p) && matchFilter(p)).map(par => (
                                <PhotoCard key={par.parent_id} person={par} type="parent" onUploaded={fetchData}
                                    isHighlighted={par.parent_id?.toString() === highlightId}
                                    onPreview={() => setPreviewPerson({ person: par, type: 'parent' })} />
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
