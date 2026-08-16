'use client';

import React, { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
    Users, BookOpen, ChevronRight, Loader2, Eye, Settings, UserCheck,
    Clock, Hash, ArrowLeft, Phone, Crown, Calendar, TrendingUp, Award, Star, AlertTriangle, Utensils, User, RotateCcw, UserRound,
    Edit, Save, X
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import Pagination from '@/components/Pagination';
import { LIBELLE_JOUR } from '@/lib/horaires';
import { useJoursOuvres } from '@/hooks/useJoursOuvres';

interface ClasseProfil {
    classe_id: number;
    code: string;
    libelle: string;
    capacite_max: number;
    effectif_actuel: number;
    statut: string;
    niveau: { niveau_id: number; code: string; libelle: string } | null;
    professeur_principal: {
        enseignant_id: number; matricule: string; nom: string; prenom: string;
        sexe: string; specialite: string | null; telephone: string;
    } | null;
    chefs_de_classe: {
        eleve_id: number; matricule: string; nom: string; prenom: string;
        sexe: string; role_classe: string;
    }[];
    nb_garcons: number;
    nb_filles: number;
    nb_matieres: number;
    eleves: {
        eleve_id: number; matricule: string; nom: string; prenom: string;
        sexe: string; date_naissance: string; statut_inscription: string; role_classe: string | null;
        nb_redoublements: number;
    }[];
    matieres: {
        matiere_id: number; code: string; libelle: string; categorie: string | null;
        coefficient: number; nb_heures_semaine: number;
    }[];
    top10: {
        eleve_id: number; matricule: string; nom: string; prenom: string;
        sexe: string; moyenne_generale: number;
    }[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'Sciences': { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
    'Langues': { bg: '#faf5ff', text: '#7c3aed', border: '#c4b5fd' },
    'Sciences Sociales': { bg: '#fff7ed', text: '#ea580c', border: '#fdba74' },
    'Pratique': { bg: '#ecfdf5', text: '#059669', border: '#6ee7b7' },
};

const TOP_COLORS = [
    '#f59e0b', '#94a3b8', '#b45309', '#3b82f6', '#8b5cf6',
    '#10b981', '#ec4899', '#06b6d4', '#f43f5e', '#6366f1'
];

const studentColors = [
    { bg: '#eff6ff', text: '#3b82f6' }, { bg: '#faf5ff', text: '#8b5cf6' },
    { bg: '#ecfdf5', text: '#10b981' }, { bg: '#fffbeb', text: '#f59e0b' },
    { bg: '#fdf2f8', text: '#ec4899' }, { bg: '#f0f9ff', text: '#06b6d4' },
];

// Les jours viennent de Parametres > Emploi du temps : la liste etait figee
// du lundi au vendredi, et un cours du samedi restait invisible ici.
const JOURS_LABEL = LIBELLE_JOUR;
const HEURES_SLOTS = [
    { debut: '08:00', fin: '09:00' }, { debut: '09:00', fin: '10:00' },
    { debut: '10:00', fin: '11:00' }, { debut: '11:00', fin: '12:00' },
    { debut: '14:00', fin: '15:00' }, { debut: '15:00', fin: '16:00' },
    { debut: '16:00', fin: '17:00' },
];

interface RealCreneau {
    creneau_id: number; matiere_code: string; matiere_libelle: string;
    matiere_categorie: string | null; jour: string; heure_debut: string; heure_fin: string;
    salle: string; enseignant: { nom: string; prenom: string } | null;
}

export default function ClasseProfilPage() {
    const params = useParams();
    const classeId = params.id as string;
    const { etablissementId, anneeId } = useApp();
    const JOURS_API = useJoursOuvres();

    const [profil, setProfil] = useState<ClasseProfil | null>(null);
    const [creneaux, setCreneaux] = useState<RealCreneau[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'eleves' | 'matieres' | 'emploi' | 'stats'>('eleves');
    const [elevesPage, setElevesPage] = useState(1);
    const ELEVES_PAGE_SIZE = 25;

    // Édition de la classe (nom, code, capacité, niveau) — déplacée depuis la
    // page liste : le bouton « Modifier » vit maintenant ici, dans le profil,
    // pas dans la barre au survol des cartes.
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ libelle: '', code: '', capacite_max: 50, niveau_id: 0 });
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const { data: cyclesData } = useQuery({
        queryKey: ['cycles-niveaux'],
        queryFn: async () => {
            const res = await api.get('/api/parametrage/cycles');
            return res.data as { cycle_id: number; libelle: string; niveaux: { niveau_id: number; libelle: string }[] }[];
        },
        enabled: editOpen,
    });

    const fetchData = useCallback(async () => {
        try {
            const [profilRes, emploiRes] = await Promise.all([
                api.get(`/api/classes/${classeId}/profil`),
                api.get(`/api/emploi-du-temps/classe/${classeId}`),
            ]);
            setProfil(profilRes.data);
            setCreneaux(emploiRes.data.creneaux || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [classeId]);

    useEffect(() => {
        if (classeId) fetchData();
    }, [classeId, fetchData]);

    const ouvrirEdition = () => {
        if (!profil) return;
        setEditError(null);
        setEditForm({
            libelle: profil.libelle, code: profil.code,
            capacite_max: profil.capacite_max, niveau_id: profil.niveau?.niveau_id || 0,
        });
        setEditOpen(true);
    };

    const enregistrerEdition = async () => {
        if (!profil) return;
        if (!editForm.libelle.trim() || !editForm.code.trim() || !editForm.niveau_id) {
            setEditError('Le nom, le code et le niveau sont obligatoires.');
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            await api.put(`/api/classes/${profil.classe_id}`, {
                etablissement_id: etablissementId,
                annee_id: anneeId,
                niveau_id: Number(editForm.niveau_id),
                code: editForm.code.trim(),
                libelle: editForm.libelle.trim(),
                capacite_max: Number(editForm.capacite_max) || 1,
                statut: profil.statut || 'ACTIVE',
            });
            setEditOpen(false);
            await fetchData();
        } catch (err: unknown) {
            const detail = typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setEditError(detail || "La modification a échoué. Rien n'a été changé.");
        } finally {
            setEditSaving(false);
        }
    };

    const getCreneauFor = (jour: string, heure: string): RealCreneau | undefined => {
        return creneaux.find(c => c.jour === jour && c.heure_debut === heure);
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '120px' }}>
            <Loader2 size={44} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    if (!profil) return (
        <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '18px', fontWeight: 600 }}>Classe introuvable.</p>
            <Link href="/classes" style={{ color: 'var(--brand-primary)' }}>Retour aux classes</Link>
        </div>
    );

    const occupancy = profil.capacite_max > 0 ? Math.round((profil.eleves.length / profil.capacite_max) * 100) : 0;
    const maxMoyenne = profil.top10.length > 0 ? profil.top10[0].moyenne_generale : 20;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div className="breadcrumb">
                    <Link href="/">Accueil</Link>
                    <ChevronRight size={14} />
                    <Link href="/classes">Classes</Link>
                    <ChevronRight size={14} />
                    <span>{profil.libelle}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <Link href="/classes" style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                        border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none',
                        fontSize: '13px', fontWeight: 600, background: 'white'
                    }}>
                        <ArrowLeft size={15} /> Retour
                    </Link>
                    <button onClick={ouvrirEdition} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                        border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
                        fontSize: '13px', fontWeight: 600, background: 'white', cursor: 'pointer'
                    }}>
                        <Edit size={15} /> Modifier
                    </button>
                    <Link href={`/classes/configurer/${profil.classe_id}`} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', textDecoration: 'none',
                        fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
                    }}>
                        <Settings size={15} /> Configurer
                    </Link>
                </div>
            </div>

            {/* Hero Header — Royal Blue Premium */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #3b82f6 100%)',
                    borderRadius: '20px', padding: '28px 32px', color: 'white', position: 'relative', overflow: 'hidden',
                    boxShadow: '0 12px 36px -8px rgba(37,99,235,0.35)'
                }}>

                {/* Subtle decorative blurs */}
                <div style={{ position: 'absolute', top: '-30px', right: '60px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '-40px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                            <div style={{
                                width: '56px', height: '56px', borderRadius: '16px',
                                background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '17px', fontWeight: 800, color: 'white',
                                letterSpacing: '-0.5px'
                            }}>
                                {profil.code}
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{profil.libelle}</h1>
                                    <span style={{
                                        padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
                                        background: 'rgba(255,255,255,0.18)', color: 'white',
                                        border: '1px solid rgba(255,255,255,0.3)', letterSpacing: '0.5px'
                                    }}>
                                        {profil.statut}
                                    </span>
                                </div>
                                <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: '14px', fontWeight: 500 }}>
                                    {profil.niveau?.libelle || 'Niveau non spécifié'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Stat badges */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Effectif */}
                        <div style={{
                            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: '14px', padding: '10px 18px', textAlign: 'center', minWidth: '78px'
                        }}>
                            <div style={{ fontSize: '21px', fontWeight: 800, color: 'white' }}>{profil.eleves.length}</div>
                            <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                <Users size={13} /> Effectif
                            </div>
                        </div>

                        {/* Garçons */}
                        <div style={{
                            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: '14px', padding: '10px 18px', textAlign: 'center', minWidth: '78px'
                        }}>
                            <div style={{ fontSize: '21px', fontWeight: 800, color: 'white' }}>{profil.nb_garcons}</div>
                            <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                <UserRound size={13} color="#93c5fd" /> Garçons
                            </div>
                        </div>

                        {/* Filles */}
                        <div style={{
                            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: '14px', padding: '10px 18px', textAlign: 'center', minWidth: '78px'
                        }}>
                            <div style={{ fontSize: '21px', fontWeight: 800, color: 'white' }}>{profil.nb_filles}</div>
                            <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                <UserRound size={13} color="#f9a8d4" /> Filles
                            </div>
                        </div>

                        {/* Matières */}
                        <div style={{
                            background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: '14px', padding: '10px 18px', textAlign: 'center', minWidth: '78px'
                        }}>
                            <div style={{ fontSize: '21px', fontWeight: 800, color: 'white' }}>{profil.nb_matieres}</div>
                            <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                <BookOpen size={13} /> Matières
                            </div>
                        </div>
                    </div>
                </div>

                {/* Occupation Bar */}
                <div style={{ marginTop: '20px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', opacity: 0.8, fontWeight: 600 }}>
                        <span>Capacité & Taux d&apos;occupation</span>
                        <span>{occupancy}% ({profil.eleves.length}/{profil.capacite_max} élèves)</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.2)' }}>
                        <div style={{
                            height: '100%', borderRadius: '4px', width: `${Math.min(occupancy, 100)}%`,
                            background: occupancy > 90 ? '#fca5a5' : occupancy > 70 ? '#fde68a' : 'rgba(255,255,255,0.85)',
                            transition: 'width 0.7s ease'
                        }}></div>
                    </div>
                </div>
            </motion.div>

            {/* Two-Column Row: Prof Principal + Chefs de Classe */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {/* Prof Principal */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                        <div style={{ padding: '7px', borderRadius: '9px', background: '#dbeafe', color: '#2563eb' }}><UserCheck size={16} /></div>
                        Professeur Principal
                    </h3>
                    {profil.professeur_principal ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '14px',
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '16px', fontWeight: 700
                                }}>
                                    {profil.professeur_principal.prenom[0]}{profil.professeur_principal.nom[0]}
                                </div>
                                <div>
                                    <p style={{ fontWeight: 700, margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>
                                        {profil.professeur_principal.prenom} {profil.professeur_principal.nom}
                                    </p>
                                    <p style={{ color: 'var(--text-secondary)', margin: '2px 0 0', fontSize: '12px' }}>
                                        {profil.professeur_principal.specialite || 'Enseignant'} • {profil.professeur_principal.matricule}
                                    </p>
                                    <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Phone size={10} /> {profil.professeur_principal.telephone}
                                    </p>
                                </div>
                            </div>
                            <Link href={`/enseignants/${profil.professeur_principal.enseignant_id}`} style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                padding: '7px 14px', borderRadius: '9px', background: '#eff6ff',
                                color: '#2563eb', fontWeight: 600, fontSize: '12px', textDecoration: 'none', border: '1px solid #bfdbfe'
                            }}>
                                <Eye size={13} /> Profil
                            </Link>
                        </div>
                    ) : (
                        <div style={{ padding: '14px', background: '#fef3c7', borderRadius: '10px', border: '1px solid #fde68a' }}>
                            <p style={{ margin: 0, color: '#92400e', fontSize: '13px', fontWeight: 500 }}>
                                Non désigné. <Link href={`/classes/configurer/${profil.classe_id}`} style={{ color: '#d97706', fontWeight: 700 }}>Configurer →</Link>
                            </p>
                        </div>
                    )}
                </motion.div>

                {/* Chefs de Classe */}
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                        <div style={{ padding: '7px', borderRadius: '9px', background: '#fef3c7', color: '#d97706' }}><Crown size={16} /></div>
                        Chefs de Classe
                    </h3>
                    {profil.chefs_de_classe && profil.chefs_de_classe.length > 0 ? (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {profil.chefs_de_classe.map((chef, i) => (
                                <div key={`chef-${chef.eleve_id}-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 14px', borderRadius: '12px', flex: '1 1 160px',
                                    background: chef.sexe === 'F' ? '#fdf2f8' : '#fffbeb',
                                    border: `1px solid ${chef.sexe === 'F' ? '#fbcfe8' : '#fde68a'}`,
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        position: 'absolute', top: '-6px', right: '-4px',
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        background: chef.sexe === 'F' ? '#db2777' : '#f59e0b', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}><Star size={10} fill="white" /></div>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        background: chef.sexe === 'F' ? '#fce7f3' : '#fef3c7',
                                        color: chef.sexe === 'F' ? '#db2777' : '#d97706',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: '12px'
                                    }}>
                                        {chef.prenom[0]}{chef.nom[0]}
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 600, margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
                                            {chef.prenom} {chef.nom}
                                        </p>
                                        <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {chef.sexe === 'F' ? '♀ Fille' : '♂ Garçon'} • Chef {i + 1}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: '14px', background: '#f1f5f9', borderRadius: '10px' }}>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                                Non désignés. <Link href={`/classes/configurer/${profil.classe_id}`} style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>Configurer →</Link>
                            </p>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '14px', padding: '4px', width: 'fit-content', flexWrap: 'wrap' }}>
                {[
                    { key: 'eleves' as const, label: `Élèves (${profil.eleves.length})`, icon: <Users size={15} /> },
                    { key: 'matieres' as const, label: `Matières (${profil.nb_matieres})`, icon: <BookOpen size={15} /> },
                    { key: 'emploi' as const, label: 'Emploi du Temps', icon: <Calendar size={15} /> },
                    { key: 'stats' as const, label: 'Statistiques', icon: <TrendingUp size={15} /> },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                            background: activeTab === tab.key ? 'white' : 'transparent',
                            color: activeTab === tab.key ? 'var(--brand-primary)' : 'var(--text-secondary)',
                            boxShadow: activeTab === tab.key ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                        }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* ═══════════════════════ TAB: ÉLÈVES ═══════════════════════ */}
            {activeTab === 'eleves' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {profil.eleves.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Users size={44} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                            <p style={{ fontWeight: 600 }}>Aucun élève inscrit.</p>
                        </div>
                    ) : (
                        <div className="table-scroll">
                        <table className="sp-table" style={{ margin: 0, minWidth: '680px' }}>
                            <thead>
                                <tr>
                                    <th style={{ background: 'var(--brand-primary)', color: 'white' }}>Élève</th>
                                    <th style={{ background: 'var(--brand-primary)', color: 'white' }}>Matricule</th>
                                    <th style={{ background: 'var(--brand-primary)', color: 'white' }}>Sexe</th>
                                    <th style={{ background: 'var(--brand-primary)', color: 'white' }}>Rôle</th>
                                    <th style={{ background: 'var(--brand-primary)', color: 'white' }}>Naissance</th>
                                    <th style={{ background: 'var(--brand-primary)', color: 'white', textAlign: 'right', paddingRight: '20px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profil.eleves.slice((elevesPage - 1) * ELEVES_PAGE_SIZE, elevesPage * ELEVES_PAGE_SIZE).map((e, i) => {
                                    const sc = studentColors[i % studentColors.length];
                                    const isChef = e.role_classe && e.role_classe.startsWith('CHEF');
                                    return (
                                        <tr key={e.eleve_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{
                                                        width: '34px', height: '34px', borderRadius: '10px',
                                                        background: sc.bg, color: sc.text,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 700, fontSize: '12px', position: 'relative'
                                                    }}>
                                                        {e.prenom[0]}{e.nom[0]}
                                                        {isChef && <Star size={9} fill="#f59e0b" color="#f59e0b" style={{ position: 'absolute', top: '-3px', right: '-3px' }} />}
                                                    </div>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{e.prenom} {e.nom}</span>
                                                    {e.nb_redoublements > 0 && (
                                                        <span title={`A redoublé ${e.nb_redoublements} fois`}
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                                padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 800,
                                                                background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
                                                            }}>
                                                            <RotateCcw size={10} /> ×{e.nb_redoublements}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td><code style={{ background: '#f1f5f9', padding: '2px 7px', borderRadius: '4px', fontSize: '11px' }}>{e.matricule}</code></td>
                                            <td>
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '8px',
                                                    background: e.sexe === 'M' ? '#dbeafe' : '#fce7f3',
                                                    color: e.sexe === 'M' ? '#2563eb' : '#db2777'
                                                }}>
                                                    {e.sexe === 'M' ? '♂ G' : '♀ F'}
                                                </span>
                                            </td>
                                            <td>
                                                {isChef ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '8px', background: '#fef3c7', color: '#92400e' }}>
                                                        <Star size={11} /> Chef
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{e.date_naissance}</td>
                                            <td style={{ textAlign: 'right', paddingRight: '20px' }}>
                                                <Link href={`/eleves/${e.eleve_id}`}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '5px 10px', borderRadius: '7px', fontSize: '11px',
                                                        background: '#f0f9ff', color: '#0284c7', fontWeight: 600,
                                                        textDecoration: 'none', border: '1px solid #bae6fd'
                                                    }}>
                                                    <Eye size={12} /> Profil
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                    )}
                    <Pagination page={elevesPage} pageSize={ELEVES_PAGE_SIZE} total={profil.eleves.length} onPageChange={setElevesPage} />
                </motion.div>
            )}

            {/* ═══════════════════════ TAB: MATIÈRES ═══════════════════════ */}
            {activeTab === 'matieres' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                    {profil.matieres.length === 0 ? (
                        <div className="card" style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <BookOpen size={44} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                            <p style={{ fontWeight: 600 }}>Aucune matière attribuée.</p>
                            <Link href="/matieres" style={{ color: 'var(--brand-primary)', fontWeight: 600, fontSize: '14px' }}>Aller au programme →</Link>
                        </div>
                    ) : profil.matieres.map((m, i) => {
                        const theme = CATEGORY_COLORS[m.categorie || ''] || { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
                        return (
                            <motion.div key={m.matiere_id}
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                                style={{
                                    background: 'white', borderRadius: '14px', padding: '18px',
                                    border: `1px solid ${theme.border}`, position: 'relative', overflow: 'hidden'
                                }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: theme.text }}></div>
                                <span style={{
                                    fontSize: '10px', fontWeight: 800, color: theme.text,
                                    background: theme.bg, padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase'
                                }}>{m.code}</span>
                                <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '8px 0 10px', color: 'var(--text-primary)' }}>{m.libelle}</h4>
                                <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Hash size={11} color={theme.text} /> <strong>Coef {m.coefficient}</strong>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={11} color={theme.text} /> {m.nb_heures_semaine}h/sem
                                    </span>
                                </div>
                            </motion.div>
                        );
                    })}
                </motion.div>
            )}

            {/* ═══════════════════════ TAB: EMPLOI DU TEMPS ═══════════════════════ */}
            {activeTab === 'emploi' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="card" style={{ padding: '28px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                            <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                                <div style={{ padding: '8px', borderRadius: '10px', background: '#ccfbf1', color: '#0d9488' }}><Calendar size={18} /></div>
                                Emploi du Temps — {profil.libelle}
                            </h3>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <span style={{
                                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                    background: creneaux.length > 0 ? '#f0fdf4' : '#fef3c7',
                                    color: creneaux.length > 0 ? '#166534' : '#92400e',
                                    border: `1px solid ${creneaux.length > 0 ? '#bbf7d0' : '#fde68a'}`
                                }}>
                                    {creneaux.length > 0 ? <><Calendar size={12} style={{display:'inline', verticalAlign:'middle'}}/> {creneaux.length} créneaux</> : <><AlertTriangle size={12} style={{display:'inline', verticalAlign:'middle'}}/> Non configuré</>}
                                </span>
                                <Link href="/emploi-du-temps" style={{
                                    display: 'flex', alignItems: 'center', gap: '5px',
                                    padding: '6px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white',
                                    textDecoration: 'none', border: 'none'
                                }}>
                                    <Settings size={12} /> Gérer
                                </Link>
                            </div>
                        </div>

                        {creneaux.length === 0 ? (
                            <div style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '14px' }}>
                                <Calendar size={44} style={{ opacity: 0.2, margin: '0 auto 12px' }} />
                                <p style={{ fontWeight: 600, fontSize: '15px', margin: '0 0 8px' }}>Aucun emploi du temps configuré</p>
                                <p style={{ fontSize: '13px', margin: '0 0 16px' }}>Allez sur la page Emploi du Temps pour générer automatiquement ou créer manuellement les créneaux.</p>
                                <Link href="/emploi-du-temps" style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white',
                                    textDecoration: 'none'
                                }}>
                                    <Calendar size={14} /> Configurer l&apos;emploi du temps
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px', minWidth: '750px' }}>
                                        <thead>
                                            <tr>
                                                <th style={{
                                                    padding: '10px 14px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                                    borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: 'white', textAlign: 'left', width: '90px'
                                                }}>
                                                    <Clock size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Heure
                                                </th>
                                                {JOURS_API.map(j => (
                                                    <th key={j} style={{
                                                        padding: '10px 14px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                                        borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: 'white', textAlign: 'center'
                                                    }}>
                                                        {JOURS_LABEL[j]}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {HEURES_SLOTS.map((h, hi) => {
                                                const isPause = h.debut === '14:00';
                                                return (
                                                    <React.Fragment key={`slot-${h.debut}`}>
                                                        {isPause && (
                                                            <tr key="pause">
                                                                <td colSpan={JOURS_API.length + 1} style={{
                                                                    padding: '8px', textAlign: 'center', background: '#fef3c7',
                                                                    borderRadius: '8px', fontSize: '12px', color: '#92400e', fontWeight: 700
                                                                }}>
                                                                    <Utensils size={12} style={{display:'inline', verticalAlign:'middle'}}/> 12:00 — 14:00 • Pause Déjeuner
                                                                </td>
                                                            </tr>
                                                        )}
                                                        <tr key={h.debut}>
                                                            <td style={{
                                                                padding: '10px 12px', fontWeight: 700, fontSize: '12px',
                                                                color: '#0f766e', background: '#f0fdfa', borderRadius: '8px',
                                                                textAlign: 'center', verticalAlign: 'middle'
                                                            }}>
                                                                {h.debut}<br />
                                                                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>{h.fin}</span>
                                                            </td>
                                                            {JOURS_API.map(j => {
                                                                const cr = getCreneauFor(j, h.debut);
                                                                const cat = cr?.matiere_categorie || '';
                                                                const theme = CATEGORY_COLORS[cat] || { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
                                                                if (cr) {
                                                                    return (
                                                                        <td key={j} style={{ padding: '3px', verticalAlign: 'middle' }}>
                                                                            <div style={{
                                                                                padding: '10px 8px', borderRadius: '10px',
                                                                                background: theme.bg, border: `1.5px solid ${theme.border}`,
                                                                                minHeight: '55px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
                                                                            }}>
                                                                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: theme.text }}>{cr.matiere_code}</p>
                                                                                <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    {cr.matiere_libelle}
                                                                                </p>
                                                                                {cr.enseignant && (
                                                                                    <p style={{ margin: '3px 0 0', fontSize: '9px', color: 'var(--text-muted)' }}>
                                                                                        <User size={10} style={{display:'inline', verticalAlign:'middle'}}/> {cr.enseignant.prenom} {cr.enseignant.nom}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                }
                                                                return (
                                                                    <td key={j} style={{ padding: '3px', verticalAlign: 'middle' }}>
                                                                        <div style={{
                                                                            padding: '10px', borderRadius: '10px', minHeight: '55px',
                                                                            border: '1.5px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                                        }}>
                                                                            <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                                        {Object.entries(CATEGORY_COLORS).map(([cat, th]) => (
                                            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: th.text }}></div>
                                                <span style={{ fontWeight: 600 }}>{cat}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <Link href="/emploi-du-temps" style={{ fontSize: '12px', color: 'var(--brand-primary)', fontWeight: 600, textDecoration: 'none' }}>
                                        Modifier l&apos;emploi du temps →
                                    </Link>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ═══════════════════════ TAB: STATISTIQUES ═══════════════════════ */}
            {activeTab === 'stats' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Gender Distribution */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                        {/* Donut-like Gender Chart */}
                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                                <Users size={16} color="#6366f1" /> Répartition par Genre
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '30px', justifyContent: 'center' }}>
                                {/* SVG Ring */}
                                <svg width="120" height="120" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="14" />
                                    {profil.eleves.length > 0 && (
                                        <>
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="#3b82f6" strokeWidth="14"
                                                strokeDasharray={`${(profil.nb_garcons / profil.eleves.length) * 314} 314`}
                                                strokeDashoffset="0" transform="rotate(-90 60 60)" strokeLinecap="round" />
                                            <circle cx="60" cy="60" r="50" fill="none" stroke="#ec4899" strokeWidth="14"
                                                strokeDasharray={`${(profil.nb_filles / profil.eleves.length) * 314} 314`}
                                                strokeDashoffset={`-${(profil.nb_garcons / profil.eleves.length) * 314}`}
                                                transform="rotate(-90 60 60)" strokeLinecap="round" />
                                        </>
                                    )}
                                    <text x="60" y="56" textAnchor="middle" style={{ fontSize: '22px', fontWeight: 800, fill: 'var(--text-primary)' }}>
                                        {profil.eleves.length}
                                    </text>
                                    <text x="60" y="72" textAnchor="middle" style={{ fontSize: '10px', fill: 'var(--text-muted)' }}>
                                        Élèves
                                    </text>
                                </svg>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#3b82f6' }}></div>
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Garçons: {profil.nb_garcons} ({profil.eleves.length > 0 ? Math.round((profil.nb_garcons / profil.eleves.length) * 100) : 0}%)
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ec4899' }}></div>
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Filles: {profil.nb_filles} ({profil.eleves.length > 0 ? Math.round((profil.nb_filles / profil.eleves.length) * 100) : 0}%)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Matières by Category */}
                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                                <BookOpen size={16} color="#8b5cf6" /> Répartition des Matières
                            </h3>
                            {(() => {
                                const cats: Record<string, number> = {};
                                profil.matieres.forEach(m => { cats[m.categorie || 'Autres'] = (cats[m.categorie || 'Autres'] || 0) + 1; });
                                const total = profil.matieres.length || 1;
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {Object.entries(cats).map(([cat, count]) => {
                                            const theme = CATEGORY_COLORS[cat] || { bg: '#f8fafc', text: '#475569', border: '#e2e8f0' };
                                            const pct = Math.round((count / total) * 100);
                                            return (
                                                <div key={cat}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                                        <span style={{ fontWeight: 600, color: theme.text }}>{cat}</span>
                                                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{count} ({pct}%)</span>
                                                    </div>
                                                    <div style={{ height: '8px', borderRadius: '4px', background: '#f1f5f9' }}>
                                                        <div style={{ height: '100%', borderRadius: '4px', width: `${pct}%`, background: theme.text, transition: 'width 0.6s ease' }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* TOP 10 Students */}
                    <div className="card" style={{ padding: '28px' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                            <div style={{ padding: '8px', borderRadius: '10px', background: '#fef3c7', color: '#d97706' }}><Award size={18} /></div>
                            Top 10 — Meilleurs Élèves
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '0 0 24px' }}>
                            Classement basé sur les moyennes réelles des bulletins déjà calculés.
                        </p>

                        {profil.top10.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>Aucune moyenne calculée pour l&apos;instant. Le classement apparaîtra dès que des bulletins seront calculés.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {profil.top10.map((e, i) => {
                                    const barWidth = maxMoyenne > 0 ? Math.round((e.moyenne_generale / 20) * 100) : 0;
                                    const barColor = TOP_COLORS[i];
                                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                                    return (
                                        <motion.div key={e.eleve_id}
                                            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.06 }}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {/* Rang */}
                                            <div style={{
                                                width: '28px', height: '28px', borderRadius: '50%',
                                                background: i < 3 ? barColor + '20' : '#f1f5f9',
                                                color: i < 3 ? barColor : '#64748b',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 800, fontSize: '12px', flexShrink: 0,
                                                border: i < 3 ? `2px solid ${barColor}` : 'none'
                                            }}>
                                                {medal || `${i + 1}`}
                                            </div>
                                            {/* Name */}
                                            <div style={{ width: '86px', flexShrink: 0, minWidth: 0 }}>
                                                <p style={{ fontWeight: 600, margin: 0, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {e.prenom} {e.nom}
                                                </p>
                                                <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {e.sexe === 'M' ? '♂' : '♀'} {e.matricule}
                                                </p>
                                            </div>
                                            {/* Bar */}
                                            <div style={{ flex: 1, height: '24px', borderRadius: '6px', background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                                                <motion.div
                                                    initial={{ width: 0 }} animate={{ width: `${barWidth}%` }}
                                                    transition={{ delay: i * 0.06 + 0.3, duration: 0.5, ease: 'easeOut' }}
                                                    style={{
                                                        height: '100%', borderRadius: '6px',
                                                        background: `linear-gradient(135deg, ${barColor}, ${barColor}cc)`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px'
                                                    }}>
                                                </motion.div>
                                            </div>
                                            {/* Score */}
                                            <div style={{
                                                fontWeight: 800, fontSize: '14px', width: '42px', textAlign: 'right',
                                                color: i < 3 ? barColor : 'var(--text-primary)', flexShrink: 0
                                            }}>
                                                {e.moyenne_generale}/20
                                            </div>
                                            {/* Profile Button */}
                                            <Link href={`/eleves/${e.eleve_id}`}
                                                title="Notes"
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    width: '26px', height: '26px', borderRadius: '7px',
                                                    background: '#f0f9ff', color: '#0284c7',
                                                    textDecoration: 'none', border: '1px solid #bae6fd', flexShrink: 0
                                                }}>
                                                <Eye size={13} />
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ═══ Modifier la classe ═══ */}
            <AnimatePresence>
                {editOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px'
                        }}
                        onClick={() => !editSaving && setEditOpen(false)}
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
                                <button onClick={() => !editSaving && setEditOpen(false)} style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
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
                                <button onClick={() => setEditOpen(false)} disabled={editSaving}
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
