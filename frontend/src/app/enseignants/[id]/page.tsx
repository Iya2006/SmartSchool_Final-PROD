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
    // `null` = le taux de l'enseignant s'applique. `0` = cette heure n'est pas
    // rémunérée (bénévolat, forfait déjà couvert). Les deux ne se confondent pas.
    taux_horaire: number | null;
}
/* Ce que la paie versera réellement, et pourquoi. Vient de
   services/paie.py — jamais recalculé ici, sous peine d'afficher un
   montant que la paie ne verserait pas. */
interface Remuneration {
    base: number; mode: string; total_heures: number; explication?: string;
    taux_reference: number; salaire_mensuel: number;
    lignes: {
        affectation_id: number; classe: string; matiere: string;
        heures_semaine: number; taux_horaire: number;
        taux_specifique: boolean; montant_mensuel: number;
    }[];
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



    const [remu, setRemu] = useState<Remuneration | null>(null);
    // Saisie en cours, par affectation. Tant qu'une ligne n'est pas enregistrée,
    // elle vit ici et pas dans `affectations` : un rechargement ne doit pas
    // faire croire qu'une modification est prise en compte.
    const [edition, setEdition] = useState<Record<number, { heures: string; taux: string }>>({});
    const [enCours, setEnCours] = useState<number | null>(null);
    const [avis, setAvis] = useState<{ texte: string; ok: boolean } | null>(null);

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
        // La rémunération peut échouer seule (comptes sans accès finance) sans
        // priver la page du reste : elle s'affiche alors simplement en moins.
        try {
            const r = await api.get(`/api/finance/remuneration/enseignant/${id}`);
            setRemu(r.data);
        } catch { setRemu(null); }
    }, [id, anneeId]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const montrer = (texte: string, ok: boolean) => {
        setAvis({ texte, ok });
        setTimeout(() => setAvis(null), 4000);
    };

    const valeurEditee = (aff: Affectation) => edition[aff.affectation_id] ?? {
        heures: String(aff.heures ?? 0),
        taux: aff.taux_horaire === null || aff.taux_horaire === undefined ? '' : String(aff.taux_horaire),
    };

    const ligneModifiee = (aff: Affectation) => {
        const e = edition[aff.affectation_id];
        if (!e) return false;
        const tauxInitial = aff.taux_horaire === null || aff.taux_horaire === undefined ? '' : String(aff.taux_horaire);
        return e.heures !== String(aff.heures ?? 0) || e.taux !== tauxInitial;
    };

    /* Les heures relèvent de l'emploi du temps, le tarif de la paie : deux
       routes distinctes, chacune seule à écrire son sujet. On n'appelle que
       celle dont la valeur a réellement changé. */
    const enregistrerLigne = async (aff: Affectation) => {
        const e = edition[aff.affectation_id];
        if (!e) return;
        setEnCours(aff.affectation_id);
        try {
            if (e.heures !== String(aff.heures ?? 0)) {
                await api.put(`/api/enseignants/affectations/${aff.affectation_id}`, {
                    nb_heures_semaine: Number(e.heures || 0),
                });
            }
            const tauxInitial = aff.taux_horaire === null || aff.taux_horaire === undefined ? '' : String(aff.taux_horaire);
            if (e.taux !== tauxInitial) {
                await api.put(`/api/finance/remuneration/affectation/${aff.affectation_id}/taux`, {
                    // Champ vidé = on retire l'exception, le taux de l'enseignant
                    // reprend. Ce n'est pas la même chose que d'y écrire 0.
                    taux_horaire: e.taux === '' ? null : Number(e.taux),
                });
            }
            setEdition(prev => { const c = { ...prev }; delete c[aff.affectation_id]; return c; });
            await loadAll();
            montrer('Enregistré — le salaire est recalculé.', true);
        } catch (err: any) {
            montrer(err?.response?.data?.detail || "Impossible d'enregistrer", false);
        }
        setEnCours(null);
    };



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
                {avis && (
                    <motion.div key="avis" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{
                            position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px',
                            borderRadius: 10, color: '#fff', fontWeight: 600, fontSize: 13, maxWidth: 420,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            background: avis.ok ? '#10b981' : '#ef4444',
                        }}>
                        {avis.texte}
                    </motion.div>
                )}
            </AnimatePresence>
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

                    {/* ─── RÉMUNÉRATION ───────────────────────────────────────
                        Rien, sur cette fiche, ne disait comment cet enseignant
                        est payé — alors que c'est précisément ce que ses heures
                        et son tarif déterminent. Et le tarif d'une heure de
                        Terminale, que le calcul sait porter, ne se saisissait
                        nulle part : le taux du prof s'appliquait partout. */}
                    {remu && (
                        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
                            <div className="card-header">
                                <h5 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Award size={18} color="#10b981" /> Rémunération
                                </h5>
                                <span style={{
                                    padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                                    background: remu.mode === 'HORAIRE' ? '#eff6ff' : '#f0fdf4',
                                    color: remu.mode === 'HORAIRE' ? '#1d4ed8' : '#15803d',
                                }}>
                                    {remu.mode === 'HORAIRE' ? "Payé à l'heure" : 'Mensuel fixe'}
                                </span>
                            </div>
                            <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                                    <div style={{ background: 'var(--bg-body)', borderRadius: 10, padding: 14 }}>
                                        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Salaire du mois</p>
                                        <p style={{ fontSize: 19, fontWeight: 800, color: remu.base > 0 ? '#10b981' : '#b45309', marginTop: 3 }}>
                                            {remu.base > 0 ? `${remu.base.toLocaleString('fr-GN')} GNF` : 'À compléter'}
                                        </p>
                                    </div>
                                    <div style={{ background: 'var(--bg-body)', borderRadius: 10, padding: 14 }}>
                                        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Heures par semaine</p>
                                        <p style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>{remu.total_heures} h</p>
                                    </div>
                                    <div style={{ background: 'var(--bg-body)', borderRadius: 10, padding: 14 }}>
                                        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Tarif de référence</p>
                                        <p style={{ fontSize: 19, fontWeight: 800, marginTop: 3 }}>
                                            {remu.taux_reference > 0 ? `${remu.taux_reference.toLocaleString('fr-GN')} /h` : '—'}
                                        </p>
                                    </div>
                                </div>

                                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{remu.explication}</p>

                                {/* Un enseignant payé à l'heure sans tarif vaut zéro. Le dire
                                    ici évite de le découvrir le jour de la paie. */}
                                {remu.mode === 'HORAIRE' && remu.taux_reference <= 0 && (
                                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#92400e', lineHeight: 1.6 }}>
                                        <strong>Aucun tarif horaire n&apos;est renseigné.</strong> Tant qu&apos;il reste vide,
                                        le salaire de cet enseignant vaut 0 GNF et il apparaîtra « à compléter »
                                        dans la préparation de la paie.
                                        <Link href={`/enseignants/modifier/${id}`} style={{ marginLeft: 6, color: '#b45309', fontWeight: 700 }}>
                                            Renseigner son tarif →
                                        </Link>
                                    </div>
                                )}
                                {remu.mode === 'MENSUEL' && (
                                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        Au primaire, un instituteur assure toutes les matières de sa classe :
                                        il est payé au mois, et ses heures ne servent qu&apos;à mesurer sa charge.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}

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
                                <>
                                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                        Les heures et le tarif se modifient directement dans le tableau.
                                        Laisser le tarif <strong>vide</strong> applique le tarif de référence de
                                        l&apos;enseignant ; écrire <strong>0</strong> signifie que ces heures ne
                                        sont pas rémunérées.
                                    </p>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                {['Classe', 'Matière', 'H / sem', 'Tarif horaire', 'Par mois', 'Horaire', ''].map((h, i, t) => (
                                                    <th key={i} style={{
                                                        padding: '10px 14px', fontSize: '12px', fontWeight: 700, color: 'white',
                                                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                                        textAlign: 'left', whiteSpace: 'nowrap',
                                                        borderRadius: i === 0 ? '10px 0 0 10px' : i === t.length - 1 ? '0 10px 10px 0' : '0',
                                                    }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {affectations.map((aff) => {
                                                const slot = creneaux.find(c => c.classe_id === aff.classe_id && c.matiere_id === aff.matiere_id);
                                                const saisie = valeurEditee(aff);
                                                const modifiee = ligneModifiee(aff);
                                                const ligneCalcul = remu?.lignes.find(l => l.affectation_id === aff.affectation_id);
                                                const majSaisie = (champ: 'heures' | 'taux', v: string) =>
                                                    setEdition(prev => ({ ...prev, [aff.affectation_id]: { ...saisie, [champ]: v } }));
                                                const champStyle: React.CSSProperties = {
                                                    width: 88, padding: '6px 8px', fontSize: 13, borderRadius: 7,
                                                    border: `1px solid ${modifiee ? '#f59e0b' : 'var(--border-light)'}`,
                                                    background: 'var(--bg-card)', outline: 'none',
                                                };
                                                return (
                                                    <tr key={aff.affectation_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                                        <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '13px' }}>{aff.classe}</td>
                                                        <td style={{ padding: '10px 14px', fontSize: '13px' }}>{aff.matiere}</td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <input type="number" min={0} max={40} step="0.5" value={saisie.heures}
                                                                onChange={e => majSaisie('heures', e.target.value)}
                                                                style={champStyle} />
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <input type="number" min={0} value={saisie.taux}
                                                                placeholder={remu?.taux_reference ? String(remu.taux_reference) : 'tarif du prof'}
                                                                onChange={e => majSaisie('taux', e.target.value)}
                                                                style={{ ...champStyle, width: 120 }} />
                                                        </td>
                                                        <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: '#10b981' }}>
                                                            {remu?.mode === 'HORAIRE' && ligneCalcul
                                                                ? `${Math.round(ligneCalcul.montant_mensuel).toLocaleString('fr-GN')} GNF`
                                                                : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                                            {slot ? `${slot.heure_debut} - ${slot.heure_fin}${slot.salle ? ` · ${slot.salle}` : ''}` : '—'}
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            {modifiee && (
                                                                <button onClick={() => enregistrerLigne(aff)}
                                                                    disabled={enCours === aff.affectation_id}
                                                                    style={{
                                                                        padding: '6px 12px', background: '#10b981', color: '#fff',
                                                                        border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                                                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                                                                    }}>
                                                                    {enCours === aff.affectation_id
                                                                        ? <Loader2 size={13} className="animate-spin" />
                                                                        : <CheckCircle size={13} />}
                                                                    Enregistrer
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </>

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
