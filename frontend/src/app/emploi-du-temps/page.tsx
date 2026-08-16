'use client';

import { useApp } from '@/context/AppContext';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar, ChevronRight, Loader2, Plus, Trash2, Edit3, X, Clock,
    BookOpen, Wand2, CheckCircle2, AlertCircle, Users, MapPin, Search, Zap, Utensils, User
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { chargerHoraires, creneauxDeLaJournee, HORAIRES_DEFAUT, LIBELLE_JOUR, type Horaires } from '@/lib/horaires';

interface Classe { classe_id: number; libelle: string; code: string; }
interface MatiereOption { matiere_id: number; code: string; libelle: string; categorie: string | null; }
interface EnseignantOption { enseignant_id: number; nom: string; prenom: string; specialite: string | null; }
interface Creneau {
    creneau_id: number; classe_id: number;
    matiere_id: number; matiere_code: string; matiere_libelle: string; matiere_categorie: string | null;
    enseignant: { enseignant_id: number; nom: string; prenom: string; specialite: string | null } | null;
    jour: string; heure_debut: string; heure_fin: string; salle: string;
}

// Les jours ne sont plus figes du lundi au vendredi : ils viennent de
// Parametres > Emploi du temps. Beaucoup d'ecoles ont cours le samedi, et la
// grille ne leur laissait aucun moyen de le poser.
const JOURS_LABEL = LIBELLE_JOUR;

const CAT_COLORS: Record<string, { bg: string; text: string; border: string; light: string }> = {
    'Sciences': { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', light: '#eff6ff' },
    'Langues': { bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd', light: '#faf5ff' },
    'Sciences Sociales': { bg: '#ffedd5', text: '#ea580c', border: '#fdba74', light: '#fff7ed' },
    'Pratique': { bg: '#d1fae5', text: '#059669', border: '#6ee7b7', light: '#ecfdf5' },
};
const DEFAULT_CAT = { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', light: '#f8fafc' };

export default function EmploiDuTempsPage() {
    const [classes, setClasses] = useState<Classe[]>([]);
    const [selectedClasseId, setSelectedClasseId] = useState<number | null>(null);
    const [creneaux, setCreneaux] = useState<Creneau[]>([]);
    const [matieres, setMatieres] = useState<MatiereOption[]>([]);
    const [enseignants, setEnseignants] = useState<EnseignantOption[]>([]);
    const { etablissementId, anneeId } = useApp();
    const [horaires, setHoraires] = useState<Horaires>(HORAIRES_DEFAUT);
    const JOURS = horaires.joursOuvres;
    const [loading, setLoading] = useState(true);
    const [loadingEmploi, setLoadingEmploi] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editCreneau, setEditCreneau] = useState<Creneau | null>(null);
    const [formJour, setFormJour] = useState('LUNDI');
    // L'heure de fin etait DEDUITE de la liste des creneaux : en saisie libre,
    // c'est l'ecole qui la donne.
    const [formHeureFin, setFormHeureFin] = useState('09:00');
    const [formHeure, setFormHeure] = useState('08:00');
    const [formMatiereId, setFormMatiereId] = useState<number | null>(null);
    const [formEnseignantId, setFormEnseignantId] = useState<number | null>(null);
    const [formSalle, setFormSalle] = useState('');
    const [saving, setSaving] = useState(false);

    // Messages
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); };
    const showError = (msg: string) => { setErrorMsg(msg); setTimeout(() => setErrorMsg(null), 4000); };

    // Load classes + enseignants on mount
    useEffect(() => {
        const init = async () => {
            try {
                const [clRes, ensRes, h] = await Promise.all([
                    api.get(`/api/classes?etablissement_id=${etablissementId}&annee_id=${anneeId}`),
                    api.get(`/api/enseignants?etablissement_id=${etablissementId}&skip=0&limit=200`),
                    chargerHoraires(),
                ]);
                setHoraires(h);
                setClasses(clRes.data);
                setEnseignants(ensRes.data);
                if (clRes.data.length > 0) {
                    setSelectedClasseId(clRes.data[0].classe_id);
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        init();
    }, []);

    // Load timetable + matieres when class changes
    const loadEmploi = useCallback(async (classeId: number) => {
        setLoadingEmploi(true);
        try {
            const [emRes, matRes] = await Promise.all([
                api.get(`/api/emploi-du-temps/classe/${classeId}`),
                api.get(`/api/matieres/classe/${classeId}`),
            ]);
            setCreneaux(emRes.data.creneaux);
            setMatieres(matRes.data.matieres || []);
        } catch (err) { console.error(err); }
        finally { setLoadingEmploi(false); }
    }, []);

    useEffect(() => {
        if (selectedClasseId) loadEmploi(selectedClasseId);
    }, [selectedClasseId, loadEmploi]);

    // Les lignes de la grille ne peuvent plus etre une liste figee : depuis que
    // les heures se saisissent librement, un cours a 07:30 ou un TP de 14:00 a
    // 16:00 doit apparaitre. On part des heures reellement posees, completees
    // par les creneaux habituels pour que la grille d'une classe vide reste
    // lisible.
    const lignesHoraires = React.useMemo(() => {
        const debuts = new Map<string, string>();
        // Les lignes de base suivent les horaires REELS de l'ecole (debut, fin,
        // duree d'un cours, pause) au lieu des sept heures pleines codees ici.
        creneauxDeLaJournee(horaires).forEach(h => debuts.set(h.debut, h.fin));
        creneaux.forEach(c => {
            if (c.heure_debut) debuts.set(c.heure_debut, c.heure_fin || '');
        });
        return Array.from(debuts.entries())
            .map(([debut, fin]) => ({ debut, fin }))
            .sort((a, b) => a.debut.localeCompare(b.debut));
    }, [creneaux, horaires]);

    // Get creneau for a specific cell
    const getCreneau = (jour: string, heure: string): Creneau | undefined => {
        return creneaux.find(c => c.jour === jour && c.heure_debut === heure);
    };

    // Open modal for creating/editing
    const openModal = (jour: string, heure: string, existing?: Creneau) => {
        if (existing) {
            setEditCreneau(existing);
            setFormJour(existing.jour);
            setFormHeure(existing.heure_debut);
            setFormHeureFin(existing.heure_fin);
            setFormMatiereId(existing.matiere_id);
            setFormEnseignantId(existing.enseignant?.enseignant_id || null);
            setFormSalle(existing.salle || '');
        } else {
            setEditCreneau(null);
            setFormJour(jour);
            setFormHeure(heure);
            // Une heure par defaut, modifiable : on propose la case cliquee.
            setFormHeureFin(lignesHoraires.find(h => h.debut === heure)?.fin || heure);
            setFormMatiereId(matieres.length > 0 ? matieres[0].matiere_id : null);
            setFormEnseignantId(null);
            setFormSalle('');
        }
        setShowModal(true);
    };

    const closeModal = () => { setShowModal(false); setEditCreneau(null); };

    const handleSave = async () => {
        if (!formMatiereId || !selectedClasseId) {
            showError("Veuillez sélectionner une matière.");
            return;
        }
        if (!formHeure || !formHeureFin) {
            showError("Indiquez l'heure de debut et l'heure de fin.");
            return;
        }
        // Un cours qui finit avant de commencer passait sans broncher tant que
        // les heures venaient d'une liste figee ; en saisie libre, il faut le dire.
        if (formHeureFin <= formHeure) {
            showError("L'heure de fin doit etre apres l'heure de debut.");
            return;
        }

        try {
            setSaving(true);
            if (editCreneau) {
                await api.put(`/api/emploi-du-temps/${editCreneau.creneau_id}`, {
                    jour: formJour, heure_debut: formHeure, heure_fin: formHeureFin,
                    matiere_id: formMatiereId, enseignant_id: formEnseignantId, salle: formSalle
                });
                showSuccess("Créneau modifié !");
            } else {
                await api.post('/api/emploi-du-temps', {
                    classe_id: selectedClasseId, matiere_id: formMatiereId,
                    jour: formJour, heure_debut: formHeure, heure_fin: formHeureFin,
                    enseignant_id: formEnseignantId, salle: formSalle
                });
                showSuccess("Créneau créé !");
            }
            closeModal();
            loadEmploi(selectedClasseId);
        } catch (err: any) {
            showError(err.response?.data?.detail || "Erreur lors de la sauvegarde.");
        } finally { setSaving(false); }
    };

    const handleDelete = async (creneauId: number) => {
        try {
            await api.delete(`/api/emploi-du-temps/${creneauId}`);
            showSuccess("Créneau supprimé.");
            if (selectedClasseId) loadEmploi(selectedClasseId);
        } catch (err: any) {
            showError(err.response?.data?.detail || "Erreur suppression.");
        }
    };

    const handleAutoGenerate = async () => {
        if (!selectedClasseId) return;
        try {
            setGenerating(true);
            const res = await api.post(`/api/emploi-du-temps/auto-generation/${selectedClasseId}`);
            showSuccess(`${res.data.created} créneaux générés automatiquement !`);
            loadEmploi(selectedClasseId);
        } catch (err: any) {
            showError(err.response?.data?.detail || "Erreur génération.");
        } finally { setGenerating(false); }
    };

    const selectedClasse = classes.find(c => c.classe_id === selectedClasseId);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div className="breadcrumb">
                    <Link href="/">Accueil</Link>
                    <ChevronRight size={14} />
                    <span>Emploi du Temps</span>
                </div>
            </div>

            {/* Messages */}
            <AnimatePresence>
                {successMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#f0fdf4', color: '#166534', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #bbf7d0' }}>
                        <CheckCircle2 size={17} /> {successMsg}
                    </motion.div>
                )}
                {errorMsg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #fecaca' }}>
                        <AlertCircle size={17} /> {errorMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header + Class Selector */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)',
                    borderRadius: '24px', padding: '28px 32px', color: 'white', position: 'relative', overflow: 'hidden'
                }}>
                <div style={{ position: 'absolute', top: '-30px', right: '-10px', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ padding: '12px', borderRadius: '16px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                            <Calendar size={26} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Emploi du Temps</h1>
                            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '14px' }}>
                                Gestion complète des créneaux horaires par classe
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Class selector */}
                        <select value={selectedClasseId || ''} onChange={(e) => setSelectedClasseId(Number(e.target.value))}
                            style={{
                                padding: '10px 16px', borderRadius: '12px', border: '2px solid rgba(255,255,255,0.3)',
                                background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: '14px', fontWeight: 600,
                                outline: 'none', cursor: 'pointer', backdropFilter: 'blur(8px)', minWidth: '180px'
                            }}>
                            {classes.map(c => (
                                <option key={c.classe_id} value={c.classe_id} style={{ color: '#1e293b' }}>{c.libelle}</option>
                            ))}
                        </select>
                        {/* Auto-gen button */}
                        <button onClick={handleAutoGenerate} disabled={generating}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '10px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
                                background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)',
                                cursor: generating ? 'not-allowed' : 'pointer', backdropFilter: 'blur(4px)'
                            }}>
                            {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                            Générer Auto
                        </button>
                        {/* Link to generated timetables */}
                        <Link href="/emploi-du-temps/generes" style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 700,
                            background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)',
                            textDecoration: 'none', backdropFilter: 'blur(4px)'
                        }}>
                            <Zap size={14} /> Emplois Générés
                        </Link>
                    </div>
                </div>
            </motion.div>

            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                {[
                    { label: 'Créneaux', value: creneaux.length, icon: <Clock size={20} />, color: '#0d9488' },
                    { label: 'Matières', value: matieres.length, icon: <BookOpen size={20} />, color: '#7c3aed' },
                    { label: 'Heures/Sem', value: creneaux.length, icon: <Calendar size={20} />, color: '#f59e0b' },
                ].map((s, i) => (
                    <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p className="kpi-label">{s.label}</p>
                                <p className="kpi-value">{s.value}</p>
                            </div>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: s.color + '15', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {s.icon}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* ═══════════════════════ TIMETABLE GRID ═══════════════════════ */}
            {loadingEmploi ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                    <Loader2 size={36} className="animate-spin" color="var(--brand-primary)" />
                </div>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ padding: '24px', overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                        <Calendar size={18} color="#0d9488" />
                        {selectedClasse?.libelle || 'Classe'} — Semaine Type
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '4px', minWidth: '800px' }}>
                            <thead>
                                <tr>
                                    <th style={{
                                        padding: '12px 14px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                        borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: 'white', textAlign: 'left', width: '90px'
                                    }}>
                                        <Clock size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} />Heure
                                    </th>
                                    {JOURS.map(j => (
                                        <th key={j} style={{
                                            padding: '12px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                            borderRadius: '10px', fontSize: '13px', fontWeight: 700, color: 'white', textAlign: 'center'
                                        }}>
                                            {JOURS_LABEL[j]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* PAUSE indicator before afternoon */}
                                {lignesHoraires.map((h, hi) => {
                                    // Une école peut avoir plusieurs pauses : on insère un bandeau
                                    // avant CHAQUE créneau qui suit la fin d'une pause.
                                    const pauses = horaires.pauses?.length
                                        ? horaires.pauses
                                        : [{ debut: horaires.pauseDebut, fin: horaires.pauseFin }];
                                    const pauseAvant = pauses.find(p => p.fin === h.debut);
                                    return (
                                        <React.Fragment key={`slot-${h.debut}`}>
                                            {pauseAvant && (
                                                <tr key={`pause-${pauseAvant.debut}`}>
                                                    <td colSpan={JOURS.length + 1} style={{
                                                        padding: '8px', textAlign: 'center', background: '#fef3c7',
                                                        borderRadius: '8px', fontSize: '12px', color: '#92400e', fontWeight: 700
                                                    }}>
                                                        <Utensils size={12} style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}/> {pauseAvant.debut} — {pauseAvant.fin} • Pause
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
                                                {JOURS.map(j => {
                                                    const creneau = getCreneau(j, h.debut);
                                                    const cat = creneau?.matiere_categorie || '';
                                                    const theme = CAT_COLORS[cat] || DEFAULT_CAT;

                                                    if (creneau) {
                                                        return (
                                                            <td key={j} style={{ padding: '3px', verticalAlign: 'middle' }}>
                                                                <div
                                                                    style={{
                                                                        padding: '10px 10px', borderRadius: '10px',
                                                                        background: theme.light, border: `1.5px solid ${theme.border}`,
                                                                        cursor: 'pointer', transition: 'all 0.15s', position: 'relative',
                                                                        minHeight: '58px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
                                                                    }}
                                                                    onClick={() => openModal(j, h.debut, creneau)}
                                                                    onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = `0 4px 12px ${theme.text}20`; }}
                                                                    onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
                                                                >
                                                                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: theme.text }}>{creneau.matiere_code}</p>
                                                                    <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {creneau.matiere_libelle}
                                                                    </p>
                                                                    {creneau.enseignant && (
                                                                        <p style={{ margin: '3px 0 0', fontSize: '9px', color: 'var(--text-muted)' }}>
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {creneau.enseignant.prenom} {creneau.enseignant.nom}</span>
                                                                        </p>
                                                                    )}
                                                                    {creneau.salle && (
                                                                        <p style={{ margin: '2px 0 0', fontSize: '9px', color: 'var(--text-muted)' }}>
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> {creneau.salle}</span>
                                                                        </p>
                                                                    )}
                                                                    {/* Delete button micro */}
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDelete(creneau.creneau_id); }}
                                                                        style={{
                                                                            position: 'absolute', top: '4px', right: '4px',
                                                                            width: '18px', height: '18px', borderRadius: '50%',
                                                                            background: '#fee2e2', color: '#ef4444', border: 'none',
                                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            opacity: 0.6, transition: 'opacity 0.15s'
                                                                        }}
                                                                        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                                                        onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    // Empty cell
                                                    return (
                                                        <td key={j} style={{ padding: '3px', verticalAlign: 'middle' }}>
                                                            <div
                                                                onClick={() => openModal(j, h.debut)}
                                                                style={{
                                                                    padding: '10px', borderRadius: '10px', minHeight: '58px',
                                                                    border: '1.5px dashed #e2e8f0', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    transition: 'all 0.15s', background: 'transparent'
                                                                }}
                                                                onMouseOver={(e) => { e.currentTarget.style.background = '#f0fdfa'; e.currentTarget.style.borderColor = '#14b8a6'; }}
                                                                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                                            >
                                                                <Plus size={16} color="#94a3b8" />
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

                    {/* Legend */}
                    <div style={{ display: 'flex', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
                        {Object.entries(CAT_COLORS).map(([cat, theme]) => (
                            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: theme.text }}></div>
                                <span style={{ fontWeight: 600 }}>{cat}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', border: '1.5px dashed #cbd5e1' }}></div>
                            <span>Cliquer pour ajouter</span>
                        </div>
                    </div>

                    {/* Sans ce renvoi, une ecole qui a cours le samedi n'a aucun
                        moyen de deviner ou l'ajouter : le reglage existe, mais
                        il est dans un autre ecran. */}
                    <p style={{ margin: '14px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Semaine affichée : {JOURS.map(j => JOURS_LABEL[j]).join(', ')}.{' '}
                        <Link href="/parametres/horaires" style={{ color: '#0d9488', fontWeight: 700 }}>
                            Ajouter ou retirer un jour
                        </Link>
                    </p>
                </motion.div>
            )}

            {/* ═══════════════════════ MODAL ═══════════════════════ */}
            <AnimatePresence>
                {showModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1000, padding: '24px'
                        }}
                        onClick={closeModal}>
                        <motion.div
                            initial={{ y: 30, opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 20, opacity: 0, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 25 }}
                            style={{
                                background: 'white', borderRadius: '20px', width: '100%', maxWidth: '480px',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden'
                            }}
                            onClick={(e) => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div style={{
                                padding: '20px 24px', background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                                color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {editCreneau ? <Edit3 size={18} /> : <Plus size={18} />}
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                        {editCreneau ? 'Modifier le créneau' : 'Nouveau créneau'}
                                    </h3>
                                </div>
                                <button onClick={closeModal} style={{
                                    background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
                                    width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', color: 'white'
                                }}>
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Jour</label>
                                        <select value={formJour} onChange={(e) => setFormJour(e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                            {JOURS.map(j => <option key={j} value={j}>{JOURS_LABEL[j]}</option>)}
                                        </select>
                                    </div>
                                    {/* Les heures se SAISISSENT. La liste deroulante n'offrait que
                                        sept creneaux d'une heure pile : impossible de poser un cours
                                        de 7h30, un TP de deux heures, ou la moindre horaire propre a
                                        l'ecole. Chaque etablissement a son rythme. */}
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Début</label>
                                        <input type="time" value={formHeure} onChange={(e) => setFormHeure(e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Fin</label>
                                        <input type="time" value={formHeureFin} onChange={(e) => setFormHeureFin(e.target.value)}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Matière *</label>
                                    <select value={formMatiereId || ''} onChange={(e) => setFormMatiereId(Number(e.target.value))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                        <option value="">— Sélectionner —</option>
                                        {matieres.map(m => <option key={m.matiere_id} value={m.matiere_id}>{m.code} — {m.libelle}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Enseignant (optionnel)</label>
                                    <select value={formEnseignantId || ''} onChange={(e) => setFormEnseignantId(e.target.value ? Number(e.target.value) : null)}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }}>
                                        <option value="">— Aucun —</option>
                                        {enseignants.map(e => <option key={e.enseignant_id} value={e.enseignant_id}>{e.prenom} {e.nom} — {e.specialite || 'Enseignant'}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                                        <MapPin size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Salle (optionnel)
                                    </label>
                                    <input type="text" value={formSalle} onChange={(e) => setFormSalle(e.target.value)}
                                        placeholder="Ex: Salle A3"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div style={{
                                padding: '16px 24px', borderTop: '1px solid var(--border-light)',
                                display: 'flex', justifyContent: 'space-between', gap: '12px'
                            }}>
                                {editCreneau && (
                                    <button onClick={() => { handleDelete(editCreneau.creneau_id); closeModal(); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                            padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                                            background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer'
                                        }}>
                                        <Trash2 size={14} /> Supprimer
                                    </button>
                                )}
                                <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                                    <button onClick={closeModal}
                                        style={{
                                            padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                                            background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer'
                                        }}>
                                        Annuler
                                    </button>
                                    <button onClick={handleSave} disabled={saving}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                            background: 'linear-gradient(135deg, #0f766e, #14b8a6)', color: 'white',
                                            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 4px 12px rgba(15,118,110,0.25)'
                                        }}>
                                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                        {editCreneau ? 'Modifier' : 'Créer'}
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
