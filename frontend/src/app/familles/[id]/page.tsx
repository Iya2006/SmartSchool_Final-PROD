'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Phone, Mail, Briefcase, GraduationCap, Clock,
    CheckCircle, Loader2, Edit3, Camera, User, MapPin, Shield,
    Heart, Hash, Save, X, KeyRound, Lock, Users, Calendar,
    ChevronRight, Eye, Star, TrendingUp, Award, BookOpen, MessageSquare
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useIsMobile } from '@/hooks/useIsMobile';

/* ─── interfaces ─── */
interface Enfant {
    eleve_id: number; nom: string; prenom: string; matricule: string;
    sexe: string; date_naissance: string | null; lieu_naissance: string | null;
    classe: string; classe_code: string; lien_parente: string; statut: string;
    photo_url: string | null;
}
interface ParentProfil {
    parent_id: number; nom: string; prenom: string;
    telephone_1: string; telephone_2: string | null;
    email: string | null; profession: string | null; adresse: string | null;
    quartier: string | null; sexe: string | null;
    statut: string; photo_url: string | null;
    has_password: boolean; nb_enfants: number; enfants: Enfant[];
}

const avatarColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6'];
const LIEN_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    PERE: { bg: '#dbeafe', color: '#2563eb', label: 'Père' },
    MERE: { bg: '#fce7f3', color: '#db2777', label: 'Mère' },
    TUTEUR: { bg: '#fef3c7', color: '#d97706', label: 'Tuteur' },
    TUTRICE: { bg: '#ede9fe', color: '#7c3aed', label: 'Tutrice' },
};
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';

export default function ProfilParent() {
    const { id } = useParams();
    const router = useRouter();
    const isMobile = useIsMobile();
    const [parent, setParent] = useState<ParentProfil | null>(null);
    const [loading, setLoading] = useState(true);

    // Edit modal
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const loadParent = useCallback(async () => {
        if (!id) return;
        try {
            const res = await api.get(`/api/portail-parent/${id}/profil`);
            setParent(res.data);
        } catch { }
        finally { setLoading(false); }
    }, [id]);

    useEffect(() => { loadParent(); }, [loadParent]);


    const openEdit = () => {
        if (!parent) return;
        setEditForm({
            nom: parent.nom, prenom: parent.prenom,
            telephone_1: parent.telephone_1, telephone_2: parent.telephone_2 || '',
            email: parent.email || '', profession: parent.profession || '',
            adresse: parent.adresse || '', mot_de_passe: '',
        });
        setEditMode(true);
    };

    const handleSave = async () => {
        if (!parent) return;
        setSaving(true);
        try {
            await api.put(`/api/portail-parent/${parent.parent_id}/profil`, editForm);
            setSuccessMsg('Profil mis à jour avec succès !');
            setTimeout(() => setSuccessMsg(''), 3000);
            setEditMode(false);
            loadParent();
        } catch { }
        finally { setSaving(false); }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    if (!parent) return (
        <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <h3>Parent non trouvé</h3>
            <Link href="/familles" className="btn btn-outline" style={{ marginTop: '16px' }}>Retour</Link>
        </div>
    );

    const initials = parent.prenom.charAt(0) + parent.nom.charAt(0);
    const bgColor = avatarColors[(parent.parent_id || 0) % avatarColors.length];
    const photoSrc = parent.photo_url ? `${API_BASE}${parent.photo_url}` : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Success Toast */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ padding: '14px 20px', borderRadius: '12px', background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', position: 'fixed', top: '20px', right: '20px', zIndex: 99999 }}>
                        <CheckCircle size={16} /> {successMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ BREADCRUMB ═══ */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link> <ChevronRight size={14} />
                <Link href="/familles">Familles</Link> <ChevronRight size={14} />
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Profil Parent</span>
            </div>

            {/* ═══ HEADER ═══ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/familles" style={{
                        width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--border-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                        background: 'white', transition: 'all 0.2s',
                    }}>
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>Profil Parent</h1>
                </div>
                <button onClick={openEdit} className="btn btn-outline btn-sm" style={{ fontSize: '13px' }}>
                    <Edit3 size={14} /> Modifier
                </button>
            </div>

            {/* ═══ HERO CARD ═══ */}
            <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                style={{ padding: '28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                    {/* Avatar with camera */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                            width: '100px', height: '100px', borderRadius: '50%',
                            background: photoSrc ? `url(${photoSrc}) center/cover no-repeat` : bgColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '34px', fontWeight: 800, color: 'white',
                            boxShadow: `0 8px 24px ${bgColor}50`, border: '4px solid white',
                        }}>
                            {!photoSrc && initials}
                        </div>
                        {/* Camera button → galerie */}
                        <button
                            onClick={() => router.push(`/galerie?tab=parents&highlight=${parent.parent_id}&search=${encodeURIComponent(parent.nom)}`)}
                            title="Gérer la photo dans la galerie"
                            style={{
                                position: 'absolute', bottom: 0, right: 0,
                                width: '30px', height: '30px', borderRadius: '50%',
                                background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid white', cursor: 'pointer', color: 'white',
                            }}>
                            <Camera size={14} />
                        </button>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: '0 0 2px', fontSize: '22px', fontWeight: 800 }}>{parent.prenom} {parent.nom}</h2>
                        <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            {parent.profession || 'Parent d\'élève'} — {parent.nb_enfants} enfant{parent.nb_enfants > 1 ? 's' : ''}
                        </p>
                        {/* Tags */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {parent.sexe && (
                                <span style={{
                                    padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                    background: parent.sexe === 'M' ? '#dbeafe' : '#fce7f3',
                                    color: parent.sexe === 'M' ? '#2563eb' : '#db2777',
                                    border: `1px solid ${parent.sexe === 'M' ? '#93c5fd' : '#f9a8d4'}`,
                                }}>{parent.sexe === 'M' ? 'Père' : 'Mère'}</span>
                            )}
                            <span style={{
                                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                background: parent.has_password ? '#d1fae5' : '#fee2e2',
                                color: parent.has_password ? '#065f46' : '#dc2626',
                                border: `1px solid ${parent.has_password ? '#6ee7b7' : '#fecaca'}`,
                            }}>{parent.has_password ? 'Compte actif' : 'MdP non configuré'}</span>
                            <span style={{
                                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                background: parent.statut === 'ACTIF' ? '#d1fae5' : '#fee2e2',
                                color: parent.statut === 'ACTIF' ? '#065f46' : '#dc2626',
                                border: `1px solid ${parent.statut === 'ACTIF' ? '#6ee7b7' : '#fecaca'}`,
                            }}>● {parent.statut}</span>
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                        <Link href={`/communication?tab=parents&dest_type=PARENT&dest_id=${parent.parent_id}&dest_nom=${encodeURIComponent(parent.nom + ' ' + parent.prenom)}`} className="btn btn-primary btn-sm" style={{ borderRadius: '10px', fontSize: '13px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={14} /> Message
                        </Link>
                        <button onClick={openEdit} className="btn btn-outline btn-sm" style={{ borderRadius: '10px', fontSize: '13px' }}>
                            <Edit3 size={14} /> Modifier
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* ═══ TWO COLUMN LAYOUT ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.8fr', gap: '24px', alignItems: 'start' }}>

                {/* ─── LEFT COLUMN ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Informations Générales */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Informations Générales</h5>
                            <button onClick={openEdit} style={{ padding: '6px', borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-muted)', display: 'flex', border: 'none', cursor: 'pointer' }}>
                                <Edit3 size={16} />
                            </button>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {[
                                { label: 'Nom Complet', value: `${parent.prenom} ${parent.nom}`, icon: <User size={15} /> },
                                { label: 'Téléphone Principal', value: parent.telephone_1, icon: <Phone size={15} /> },
                                { label: 'Téléphone Secondaire', value: parent.telephone_2 || 'Non renseigné', icon: <Phone size={15} /> },
                                { label: 'Email', value: parent.email || 'Non renseigné', icon: <Mail size={15} /> },
                                { label: 'Profession', value: parent.profession || 'Non renseignée', icon: <Briefcase size={15} /> },
                                { label: 'Adresse', value: parent.adresse || 'Non renseignée', icon: <MapPin size={15} /> },
                                { label: 'Quartier', value: parent.quartier || 'Non renseigné', icon: <MapPin size={15} /> },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}>
                                        {item.icon}
                                    </div>
                                    <div>
                                        <p style={{ margin: '0 0 2px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                            {item.label}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Sécurité */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Sécurité du Compte</h5>
                            <div style={{ padding: '6px', borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-muted)', display: 'flex' }}>
                                <Shield size={16} />
                            </div>
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '12px', background: parent.has_password ? '#f0fdf4' : '#fef2f2', border: `1px solid ${parent.has_password ? '#bbf7d0' : '#fecaca'}` }}>
                                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: parent.has_password ? '#d1fae5' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {parent.has_password ? <Lock size={20} color="#16a34a" /> : <KeyRound size={20} color="#dc2626" />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: parent.has_password ? '#166534' : '#991b1b' }}>
                                        {parent.has_password ? 'Mot de passe configuré' : 'Mot de passe non défini'}
                                    </p>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: parent.has_password ? '#15803d' : '#b91c1c' }}>
                                        {parent.has_password ? 'Le parent peut se connecter au portail' : 'Configurez un mot de passe pour activer le portail'}
                                    </p>
                                </div>
                                {!parent.has_password && (
                                    <button onClick={openEdit} style={{
                                        padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                                        background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer',
                                    }}>Configurer</button>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* KPI Cards */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Statistiques</h5>
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {[
                                    { icon: <Users size={20} />, label: 'Enfants inscrits', value: parent.nb_enfants, color: '#6366f1', bg: '#eef2ff' },
                                    { icon: <GraduationCap size={20} />, label: 'Classes', value: [...new Set(parent.enfants.map(e => e.classe))].length, color: '#10b981', bg: '#ecfdf5' },
                                    { icon: <Award size={20} />, label: 'Enfants actifs', value: parent.enfants.filter(e => e.statut === 'ACTIF').length, color: '#f59e0b', bg: '#fffbeb' },
                                    { icon: <Shield size={20} />, label: 'Portail', value: parent.has_password ? 'Actif' : 'Inactif', color: parent.has_password ? '#16a34a' : '#dc2626', bg: parent.has_password ? '#f0fdf4' : '#fef2f2' },
                                ].map((s, i) => (
                                    <div key={i} style={{
                                        padding: '16px', borderRadius: '12px', border: '1px solid var(--border-light)',
                                        textAlign: 'center', transition: 'all 0.2s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.boxShadow = `0 4px 12px ${s.color}20`; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: s.color }}>
                                            {s.icon}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: s.color }}>{s.value}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* ─── RIGHT COLUMN ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Liste des Enfants */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Heart size={18} color="#ec4899" /> Enfants ({parent.enfants.length})
                            </h5>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {parent.enfants.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Users size={36} style={{ opacity: 0.15, margin: '0 auto 10px' }} />
                                    <p style={{ fontWeight: 600 }}>Aucun enfant inscrit</p>
                                </div>
                            ) : parent.enfants.map((enfant, i) => {
                                const lc = LIEN_COLORS[enfant.lien_parente] || LIEN_COLORS.TUTEUR;
                                const childPhoto = enfant.photo_url ? `${API_BASE}${enfant.photo_url}` : null;
                                const childInitials = enfant.prenom.charAt(0) + enfant.nom.charAt(0);
                                const childColor = avatarColors[(enfant.eleve_id || 0) % avatarColors.length];
                                return (
                                    <motion.div key={enfant.eleve_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '16px', padding: '18px 22px',
                                            borderRadius: '16px', border: '1px solid var(--border-light)', background: 'white',
                                            transition: 'all 0.2s', cursor: 'pointer',
                                        }}
                                        onClick={() => router.push(`/eleves/${enfant.eleve_id}`)}
                                        onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.1)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                        onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateX(0)'; }}>

                                        {/* Child Avatar */}
                                        <div style={{
                                            width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
                                            background: childPhoto ? `url(${childPhoto}) center/cover no-repeat` : (enfant.sexe === 'M' ? 'linear-gradient(135deg, #3b82f6, #60a5fa)' : 'linear-gradient(135deg, #ec4899, #f472b6)'),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontSize: '16px', fontWeight: 700,
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        }}>
                                            {!childPhoto && childInitials}
                                        </div>

                                        {/* Child Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {enfant.prenom} {enfant.nom}
                                            </p>
                                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Hash size={11} /> {enfant.matricule}
                                                </span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <GraduationCap size={11} /> {enfant.classe}
                                                </span>
                                                {enfant.date_naissance && (
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Calendar size={11} /> {new Date(enfant.date_naissance).toLocaleDateString('fr-FR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Tags */}
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                            <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: lc.bg, color: lc.color }}>
                                                {lc.label}
                                            </span>
                                            <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: enfant.statut === 'ACTIF' ? '#d1fae5' : '#fee2e2', color: enfant.statut === 'ACTIF' ? '#065f46' : '#dc2626' }}>
                                                {enfant.statut}
                                            </span>
                                            <ChevronRight size={16} color="var(--text-muted)" />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>

                    {/* Résumé des Classes */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BookOpen size={18} color="#6366f1" /> Répartition par Classe
                            </h5>
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {[...new Set(parent.enfants.map(e => e.classe))].map((classe, i) => {
                                const enfantsDansClasse = parent.enfants.filter(e => e.classe === classe);
                                return (
                                    <div key={i} style={{
                                        padding: '18px 22px', borderRadius: '16px', border: '1px solid var(--border-light)',
                                        flex: '1 1 200px', minWidth: '200px', transition: 'all 0.2s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.1)'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '12px' }}>
                                                <GraduationCap size={18} />
                                            </div>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{classe}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{enfantsDansClasse.length} élève{enfantsDansClasse.length > 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {enfantsDansClasse.map(e => (
                                                <span key={e.eleve_id} style={{
                                                    padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                                    background: e.sexe === 'M' ? '#dbeafe' : '#fce7f3',
                                                    color: e.sexe === 'M' ? '#2563eb' : '#db2777',
                                                }}>{e.prenom} {e.nom}</span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* ═══════ EDIT MODAL ═══════ */}
            <AnimatePresence>
                {editMode && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                        onClick={e => { if (e.target === e.currentTarget) setEditMode(false); }}>
                        <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25 }}
                            className="card" style={{ width: '720px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
                            {/* Modal Header */}
                            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #1e1b4b, #4338ca)', color: 'white', borderRadius: '16px 16px 0 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Edit3 size={20} />
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Modifier le profil</h2>
                                        <p style={{ margin: '2px 0 0', fontSize: '13px', opacity: 0.8 }}>{parent.prenom} {parent.nom}</p>
                                    </div>
                                </div>
                                <button onClick={() => setEditMode(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'white' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Modal Body */}
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
                                            <input type={f.type} value={editForm[f.key] || ''} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })}
                                                style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit' }} />
                                        </div>
                                    ))}
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Adresse</label>
                                        <input type="text" value={editForm.adresse || ''} onChange={e => setEditForm({ ...editForm, adresse: e.target.value })}
                                            style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit' }} />
                                    </div>

                                    {/* Mot de passe */}
                                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-light)', paddingTop: '20px', marginTop: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                            <KeyRound size={16} color="#f59e0b" />
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Sécurité du compte</span>
                                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, background: parent.has_password ? '#d1fae5' : '#fee2e2', color: parent.has_password ? '#065f46' : '#dc2626' }}>
                                                {parent.has_password ? 'Configuré' : 'Non configuré'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                {parent.has_password ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Définir un mot de passe *'}
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                                <input type="password" value={editForm.mot_de_passe || ''} onChange={e => setEditForm({ ...editForm, mot_de_passe: e.target.value })}
                                                    placeholder={parent.has_password ? '••••••••' : 'Entrez un mot de passe'}
                                                    style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: '8px', border: '1px solid var(--border-focus)', outline: 'none', background: 'var(--bg-body)', fontSize: '14px', fontFamily: 'inherit' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '24px', paddingTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                    <button onClick={() => setEditMode(false)}
                                        style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
                                        Annuler
                                    </button>
                                    <button onClick={handleSave} disabled={saving}
                                        style={{ padding: '12px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #4338ca, #6366f1)', color: 'white', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', border: 'none', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', fontSize: '14px' }}>
                                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
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
