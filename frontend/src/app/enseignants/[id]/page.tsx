'use client';
import React from 'react';
import { useApp } from '@/context/AppContext';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Phone, Mail, Briefcase, GraduationCap, Clock, Award,
    CheckCircle, Loader2, Edit, Calendar, BookOpen, Plus,
    X, Trash2, Camera, User, MapPin, Building, Star, TrendingUp, FileText,
    UserCheck, Scan, MessageSquare
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import BadgeCarte from '@/components/BadgeCarte';
import { QRCodeSVG } from 'qrcode.react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/* ─── interfaces ─── */
interface Affectation {
    affectation_id: number; classe_id: number; classe_code: string; classe: string;
    matiere_id: number; matiere_code: string; matiere: string;
    heures: number; est_principal: boolean; statut: string;
}
interface Creneau {
    creneau_id: number; jour: string; heure_debut: string; heure_fin: string;
    classe_id: number; classe: string; classe_code: string;
    matiere_id: number; matiere: string; matiere_code: string; salle: string | null;
}
interface DashStats {
    nb_classes: number; nb_matieres: number; total_heures_semaine: number;
    nb_creneaux: number; classes: string[];
}
interface ClasseItem { classe_id: number; code: string; libelle: string; }
interface MatiereItem { matiere_id: number; code: string; libelle: string; }

const avatarColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300';
const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'];
const JOURS_LABEL: Record<string, string> = { LUNDI: 'Lundi', MARDI: 'Mardi', MERCREDI: 'Mercredi', JEUDI: 'Jeudi', VENDREDI: 'Vendredi' };
const HEURES = [
    { debut: '08:00', fin: '09:00' }, { debut: '09:00', fin: '10:00' },
    { debut: '10:00', fin: '11:00' }, { debut: '11:00', fin: '12:00' },
    { debut: '14:00', fin: '15:00' }, { debut: '15:00', fin: '16:00' },
    { debut: '16:00', fin: '17:00' },
];

export default function ProfilEnseignant() {
    const { id } = useParams();
    const router = useRouter();
    const [ens, setEns] = useState<any>(null);
    const [affectations, setAffectations] = useState<Affectation[]>([]);
    const [creneaux, setCreneaux] = useState<Creneau[]>([]);
    const [stats, setStats] = useState<DashStats | null>(null);
    const { etablissementId, anneeId, anneeLibelle } = useApp();
    const [loading, setLoading] = useState(true);
    const [badgeEns, setBadgeEns] = useState<any>(null);
    const [qrEns, setQrEns] = useState<any>(null);



    const loadAll = useCallback(async () => {
        if (!id) return;
        try {
            const [eRes, aRes, edtRes, sRes] = await Promise.all([
                api.get(`/api/enseignants/${id}`),
                api.get(`/api/enseignants/${id}/affectations?annee_id=${anneeId}`),
                api.get(`/api/enseignants/${id}/emploi-du-temps?annee_id=${anneeId}`),
                api.get(`/api/enseignants/${id}/dashboard-stats?annee_id=${anneeId}`),
            ]);
            setEns(eRes.data); setAffectations(aRes.data); setCreneaux(edtRes.data); setStats(sRes.data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, [id]);

    useEffect(() => { loadAll(); }, [loadAll]);



    const totalHeures = affectations.reduce((s, a) => s + a.heures, 0);
    const uniqueSubjects = [...new Set(affectations.map(a => a.matiere))].join(', ');
    const uniqueClasses = [...new Set(affectations.map(a => a.classe))].join(', ');
    const initials = ens ? ens.prenom.charAt(0) + ens.nom.charAt(0) : '';
    const bgColor = avatarColors[(Number(id) || 0) % avatarColors.length];
    const photoSrc = ens?.photo_url ? `${API_BASE}${ens.photo_url}` : null;

    // Presence data (mock — could be real API later)
    const presenceData = [
        { month: 'Sept', present: 22, absent: 1 }, { month: 'Oct', present: 20, absent: 2 },
        { month: 'Nov', present: 23, absent: 0 }, { month: 'Déc', present: 18, absent: 3 },
        { month: 'Jan', present: 21, absent: 1 }, { month: 'Fév', present: 24, absent: 0 },
    ];

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    if (!ens) return (
        <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <h3>Enseignant non trouvé</h3>
            <Link href="/enseignants" className="btn btn-outline" style={{ marginTop: '16px' }}>Retour</Link>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <AnimatePresence>
                {/* ─── BADGE MODAL ─── */}
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
                {/* ─── QR CODE MODAL ─── */}
                {qrEns && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => setQrEns(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background: 'white', padding: '40px', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', position: 'relative' }}>
                            <button onClick={() => setQrEns(null)} style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={20} color="#475569" />
                            </button>
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800 }}>Code QR de Pointage</h3>
                                <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>{qrEns.prenom} {qrEns.nom} • {qrEns.matricule}</p>
                            </div>
                            <div style={{ padding: '16px', background: 'white', border: '2px dashed #e2e8f0', borderRadius: '16px' }}>
                                <QRCodeSVG value={qrEns.matricule} size={240} level={"Q"} />
                            </div>
                            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', textAlign: 'center', maxWidth: '280px' }}>
                                Vous pouvez scanner ce code avec l'application de pointage (ou avec le téléphone de test) pour valider l'identité.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══════ BREADCRUMB ═══════ */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link> <span>›</span>
                <Link href="/enseignants">Enseignants</Link> <span>›</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Profil Enseignant</span>
            </div>

            {/* ═══════ HEADER: TITLE + QUICK ACTIONS ═══════ */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/enseignants" style={{
                        width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--border-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
                        background: 'white', transition: 'all 0.2s',
                    }}>
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>Profil Enseignant</h1>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setBadgeEns({ ...ens, role: 'ENSEIGNANT' })} className="btn btn-primary btn-sm" style={{ fontSize: '13px', background: '#10b981', borderColor: '#10b981' }}>
                        <UserCheck size={14} /> Voir la Carte
                    </button>
                    <button onClick={() => setQrEns(ens)} className="btn btn-outline btn-sm" style={{ fontSize: '13px', color: '#3b82f6', borderColor: '#3b82f6' }}>
                        <Scan size={14} /> QR Code
                    </button>
                    <Link href={`/enseignants/modifier/${id}`} className="btn btn-outline btn-sm" style={{ fontSize: '13px' }}>
                        <Edit size={14} /> Modifier
                    </Link>
                </div>
            </div>

            {/* ═══════ HERO CARD — STYLE SKILLPATH ═══════ */}
            <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                style={{ padding: '28px 32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                    {/* Avatar with camera icon */}
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
                        <div style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: '30px', height: '30px', borderRadius: '50%',
                            background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '2px solid white',
                        }}>
                            <Camera size={14} color="white" />
                        </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: '0 0 2px', fontSize: '22px', fontWeight: 800 }}>{ens.prenom} {ens.nom}</h2>
                        <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                            Enseignant(e) en {ens.specialite}
                        </p>
                        {/* Tags */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                background: '#6366f120', color: '#6366f1', border: '1px solid #6366f140',
                            }}>{ens.specialite}</span>
                            {stats && stats.nb_classes > 0 && (
                                <span style={{
                                    padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                    background: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f640',
                                }}>{stats.nb_classes} Classe{stats.nb_classes > 1 ? 's' : ''}</span>
                            )}
                            <span style={{
                                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                background: ens.statut === 'ACTIF' ? '#10b98120' : '#ef444420',
                                color: ens.statut === 'ACTIF' ? '#10b981' : '#ef4444',
                                border: `1px solid ${ens.statut === 'ACTIF' ? '#10b98140' : '#ef444440'}`,
                            }}>{ens.statut === 'ACTIF' ? 'Actif' : 'Inactif'}</span>
                        </div>
                        {ens.email && (
                            <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                &quot;Enseignant dévoué contribuant à la réussite des élèves.&quot;
                            </p>
                        )}
                    </div>

                    {/* Quick action buttons */}
                    <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                        <button onClick={() => router.push(`/communication?dest_type=ENSEIGNANT&dest_id=${ens.enseignant_id}`)} className="btn btn-primary btn-sm" style={{ borderRadius: '10px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={14} /> Message
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* ═══════ TWO COLUMN LAYOUT ═══════ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '24px', alignItems: 'start' }}>

                {/* ─── LEFT COLUMN ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Basic Information */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Informations Générales</h5>
                            <Link href={`/enseignants/modifier/${id}`} style={{ padding: '6px', borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-muted)', display: 'flex' }}>
                                <Edit size={16} />
                            </Link>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {[
                                { label: 'Nom Complet', value: `${ens.prenom} ${ens.nom}`, icon: <User size={15} /> },
                                { label: 'Matricule', value: ens.matricule, icon: <Briefcase size={15} /> },
                                { label: 'Téléphone', value: ens.telephone || 'Non renseigné', icon: <Phone size={15} /> },
                                { label: 'Email', value: ens.email || 'Non renseigné', icon: <Mail size={15} /> },
                                { label: 'Date de Naissance', value: ens.date_naissance ? new Date(ens.date_naissance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Non renseignée', icon: <Calendar size={15} /> },
                                { label: 'Date d\'Embauche', value: ens.date_embauche ? new Date(ens.date_embauche).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Non renseignée', icon: <Clock size={15} /> },
                            ].map((item, i) => (
                                <div key={i}>
                                    <p style={{ margin: '0 0 2px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                        {item.label}
                                    </p>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Teaching Information */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Informations Pédagogiques</h5>
                            <div style={{ padding: '6px', borderRadius: '8px', background: 'var(--bg-body)', color: 'var(--text-muted)', display: 'flex' }}>
                                <BookOpen size={16} />
                            </div>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {[
                                { label: 'Qualification', value: ens.diplome_plus_eleve || 'Non renseigné' },
                                { label: 'Spécialité', value: ens.specialite || 'Non renseigné' },
                                { label: 'Type de Contrat', value: ens.type_contrat || 'Non renseigné' },
                                { label: 'Matières Enseignées', value: uniqueSubjects || 'Aucune affectation' },
                                { label: 'Classes Gérées', value: uniqueClasses || 'Aucune affectation' },
                            ].map((item, i) => (
                                <div key={i}>
                                    <p style={{ margin: '0 0 2px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                                        {item.label}
                                    </p>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Points & Rewards */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Points & Récompenses</h5>
                        </div>
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                <div style={{
                                    width: '52px', height: '52px', borderRadius: '50%', background: '#fef3c7',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Award size={26} color="#f59e0b" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>{stats?.nb_creneaux ? stats.nb_creneaux * 30 : 0}</p>
                                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Cours dispensés</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ width: '100px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: '75%', height: '100%', background: 'linear-gradient(90deg, #f59e0b, #10b981)', borderRadius: '3px' }} />
                                    </div>
                                    <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--text-muted)' }}>Objectif mensuel</p>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                {[
                                    { icon: <Award size={20} />, label: 'Distinctions', color: '#f59e0b', bg: '#fef3c7' },
                                    { icon: <Star size={20} />, label: 'Avis Élèves', color: '#6366f1', bg: '#ede9fe' },
                                    { icon: <TrendingUp size={20} />, label: 'Assiduité', color: '#10b981', bg: '#d1fae5' },
                                ].map((r, i) => (
                                    <div key={i} style={{
                                        padding: '16px 10px', borderRadius: '12px', border: '1px solid var(--border-light)',
                                        textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = r.color; e.currentTarget.style.boxShadow = `0 4px 12px ${r.color}20`; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.boxShadow = 'none'; }}
                                    >
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: r.color }}>
                                            {r.icon}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{r.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* ─── RIGHT COLUMN ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Attendance Overview (Bar chart) */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Aperçu Présences</h5>
                        </div>
                        <div style={{ padding: '20px 24px', height: '240px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={presenceData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} style={{ fontSize: '12px', fill: 'var(--text-muted)' }} />
                                    <YAxis axisLine={false} tickLine={false} style={{ fontSize: '12px', fill: 'var(--text-muted)' }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '13px' }} />
                                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '4px' }} />
                                    <Bar dataKey="present" name="Présent" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                    <Bar dataKey="absent" name="Absent" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Classes & Timetable — purple header table */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                        <div className="card-header" style={{ borderBottom: 'none', paddingBottom: '0' }}>
                            <h5 style={{ fontSize: '16px', fontWeight: 700 }}>Classes & Emploi du Temps</h5>
                            <Link href="/salle-des-profs" className="btn btn-outline btn-sm" style={{ fontSize: '12px', borderRadius: '10px', textDecoration: 'none' }}>
                                <Briefcase size={14} /> Salle des Profs
                            </Link>
                        </div>
                        <div style={{ padding: '12px 20px 20px', overflowX: 'auto' }}>
                            {affectations.length === 0 ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <BookOpen size={36} style={{ opacity: 0.15, margin: '0 auto 10px' }} />
                                    <p style={{ fontWeight: 600 }}>Aucune affectation</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            {['Classe', 'Matière', 'Horaire', 'Salle', ''].map((h, i) => (
                                                <th key={i} style={{
                                                    padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: 'white',
                                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                    textAlign: 'left', whiteSpace: 'nowrap',
                                                    borderRadius: i === 0 ? '10px 0 0 10px' : i === 4 ? '0 10px 10px 0' : '0',
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {affectations.map((aff) => {
                                            const slot = creneaux.find(c => c.classe_id === aff.classe_id && c.matiere_id === aff.matiere_id);
                                            return (
                                                <tr key={aff.affectation_id} style={{ borderBottom: '1px solid var(--border-light)' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: '13px' }}>{aff.classe}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px' }}>{aff.matiere}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                        {slot ? `${slot.heure_debut} - ${slot.heure_fin}` : `${aff.heures}h / sem`}
                                                    </td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                                        {slot?.salle || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </motion.div>

                    {/* Full Timetable Grid */}
                    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <div className="card-header">
                            <h5 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={18} color="#6366f1" /> Emploi du Temps Complet
                            </h5>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Année {anneeLibelle || '—'}</span>
                        </div>
                        <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
                            {creneaux.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Calendar size={40} style={{ opacity: 0.15, margin: '0 auto 10px' }} />
                                    <p style={{ fontWeight: 600 }}>Emploi du temps non encore généré</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '65px', padding: '8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid var(--border-light)' }}>
                                                Heure
                                            </th>
                                            {JOURS.map(j => (
                                                <th key={j} style={{ padding: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', borderBottom: '2px solid var(--border-light)' }}>
                                                    {JOURS_LABEL[j]}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {HEURES.map((h, hi) => {
                                            const isPause = h.debut === '14:00' && hi > 0 && HEURES[hi - 1]?.fin === '12:00';
                                            return (
                                                <React.Fragment key={`h-${hi}`}>
                                                    {isPause && (
                                                        <tr>
                                                            <td colSpan={6} style={{ padding: '4px 8px', fontSize: '10px', color: '#94a3b8', textAlign: 'center', background: '#f8fafc', fontWeight: 600, letterSpacing: '1px' }}>
                                                                — PAUSE DÉJEUNER —
                                                            </td>
                                                        </tr>
                                                    )}
                                                    <tr key={hi}>
                                                        <td style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                                                            {h.debut}<br /><span style={{ fontSize: '10px', opacity: 0.5 }}>{h.fin}</span>
                                                        </td>
                                                        {JOURS.map(jour => {
                                                            const slot = creneaux.find(c => c.jour === jour && c.heure_debut === h.debut);
                                                            const colorIdx = slot ? (slot.matiere_id % 6) : 0;
                                                            const COLORS = [
                                                                { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
                                                                { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
                                                                { bg: '#fefce8', border: '#eab308', text: '#a16207' },
                                                                { bg: '#fdf2f8', border: '#ec4899', text: '#be185d' },
                                                                { bg: '#f5f3ff', border: '#8b5cf6', text: '#6d28d9' },
                                                                { bg: '#ecfdf5', border: '#14b8a6', text: '#0f766e' },
                                                            ];
                                                            const c = COLORS[colorIdx];
                                                            return (
                                                                <td key={jour} style={{ padding: '3px', borderBottom: '1px solid var(--border-light)', borderLeft: '1px solid #f1f5f9', verticalAlign: 'top', height: '60px' }}>
                                                                    {slot && (
                                                                        <div style={{
                                                                            background: c.bg, borderLeft: `3px solid ${c.border}`,
                                                                            borderRadius: '8px', padding: '7px 9px', height: '100%',
                                                                            display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                                                            transition: 'transform 0.15s, box-shadow 0.15s',
                                                                        }}
                                                                        onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 12px ${c.border}25`; }}
                                                                        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                                                                        >
                                                                            <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: c.text }}>{slot.matiere}</p>
                                                                            <p style={{ margin: '1px 0 0', fontSize: '10px', color: c.text, opacity: 0.7, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                <MapPin size={10} /> {slot.classe_code} {slot.salle ? `• ${slot.salle}` : ''}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>


        </div>
    );
}
