'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, Loader2, FileText, Download, CheckCircle2, AlertCircle,
    X, Shield, Search, Filter, Clock, Users, BookOpen, Send, Eye,
    XCircle, BarChart3, FileUp, Award, Printer, PenLine, Inbox, Paperclip, UserCheck, Calendar,
    Megaphone, BellRing, ListChecks, Trash2
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface SujetItem {
    sujet_id: number; enseignant_id: number; enseignant_nom: string;
    enseignant_specialite: string | null;
    matiere_id: number; matiere_code: string; matiere_libelle: string;
    classe_id: number | null; classe_libelle: string | null;
    trimestre: number; trimestre_id: number | null; periode_libelle: string;
    titre: string; fichier_nom: string;
    fichier_type: string; fichier_taille: number; duree_minutes: number;
    statut: string; commentaire: string | null;
    date_depot: string | null; date_envoi: string | null;
}

interface StatsData {
    total_sujets: number; brouillons: number; envoyes: number;
    valides: number; rejetes: number; enseignants_soumis: number;
    total_enseignants: number; taux_soumission: number;
}

interface Periode {
    trimestre_id: number; numero: number; libelle: string; statut: string;
}

/** Un sujet attendu mais pas encore reçu, avec le nom de qui doit le déposer. */
interface Manquant {
    enseignant_id: number; enseignant_nom: string; enseignant_telephone: string | null;
    matiere_id: number; matiere_libelle: string; classes: string[];
}

interface Suivi {
    periode: { trimestre_id: number; libelle: string; statut: string } | null;
    attendus: number; recus: number; manquants: Manquant[];
    taux_couverture: number | null; hors_affectation: number;
}

const STATUT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    BROUILLON: { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9', icon: PenLine },
    ENVOYE: { label: 'Reçu', color: '#0d9488', bg: '#ccfbf1', icon: Inbox },
    VALIDE: { label: 'Validé', color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
    REJETE: { label: 'Rejeté', color: '#dc2626', bg: '#fee2e2', icon: XCircle },
};

const SUJETS_PAR_PAGE = 50;

export default function CentreEvaluationPage() {
    const [loading, setLoading] = useState(true);
    const [sujets, setSujets] = useState<SujetItem[]>([]);
    const [stats, setStats] = useState<StatsData | null>(null);
    const [filterStatut, setFilterStatut] = useState('');
    // Périodes réelles de l'établissement : l'écran affichait « T1 T2 T3 »
    // en dur, donc un « T3 » inexistant pour une école à deux semestres.
    const [periodes, setPeriodes] = useState<Periode[]>([]);
    const [filterTrimestre, setFilterTrimestre] = useState<number | null>(null);
    const [suivi, setSuivi] = useState<Suivi | null>(null);
    const [showManquants, setShowManquants] = useState(false);
    const [relanceEnCours, setRelanceEnCours] = useState(false);
    const [demandeOuverte, setDemandeOuverte] = useState(false);
    const [demandePeriode, setDemandePeriode] = useState<number | null>(null);
    const [demandeMessage, setDemandeMessage] = useState('');
    // DE QUELLE ÉPREUVE PARLE-T-ON
    // Une année ne contient pas que des compositions : à TrillionX, quatre
    // évaluations et trois compositions. « Déposez vos sujets pour le 1er
    // Semestre » reçu deux fois en deux mois ne dit pas à l'enseignant s'il
    // s'agit de la même chose.
    const [typesEpreuve, setTypesEpreuve] = useState<{ type_eval_id: number; libelle: string }[]>([]);
    const [demandeType, setDemandeType] = useState<number | null>(null);
    const [demandeEcheance, setDemandeEcheance] = useState('');
    const [envoiDemande, setEnvoiDemande] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [page, setPage] = useState(0);
    const [totalSujets, setTotalSujets] = useState(0);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewSujet, setPreviewSujet] = useState<SujetItem | null>(null);
    const [rejectId, setRejectId] = useState<number | null>(null);
    const [rejectRaison, setRejectRaison] = useState('');

    const showSuccess = (m: string) => { setSuccessMsg(m); setTimeout(() => setSuccessMsg(null), 3500); };
    const showError = (m: string) => { setErrorMsg(m); setTimeout(() => setErrorMsg(null), 4000); };

    const handleDownloadSujet = async (sujetId: number, filename: string) => {
        try {
            const res = await api.get(`/api/examens/sujets/${sujetId}/fichier`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename || `sujet_${sujetId}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            // « Erreur lors du téléchargement » ne disait pas si le fichier
            // manquait, si l'accès était refusé ou si le serveur était
            // injoignable — trois causes, trois gestes différents.
            // La réponse est un blob (responseType: 'blob') : il faut le lire
            // en texte pour retrouver le message du serveur.
            let raison = '';
            const statut = err?.response?.status;
            try {
                const corps = err?.response?.data;
                if (corps instanceof Blob) raison = JSON.parse(await corps.text())?.detail || '';
                else raison = corps?.detail || '';
            } catch { /* réponse illisible : on retombe sur le statut */ }

            if (!statut) showError("Serveur injoignable — le sujet n'a pas pu être demandé.");
            else if (statut === 404) showError(raison || "Ce sujet n'a aucun fichier sur le serveur.");
            else if (statut === 403) showError(raison || "Vous n'avez pas accès à ce sujet.");
            else showError(raison || `Téléchargement refusé (erreur ${statut}).`);
        }
    };

    // Le filtre, la recherche et la pagination partent au serveur. Filtrer
    // 2 674 sujets dans le navigateur demandait de tous les charger d'abord :
    // la page tournait sans jamais s'afficher, et la loupe ne trouvait de
    // toute façon que ce qui était déjà à l'écran.
    const loadData = useCallback(async () => {
        try {
            const filtre = filterTrimestre ? `?trimestre_id=${filterTrimestre}` : '';
            const params: Record<string, string | number> = {
                skip: page * SUJETS_PAR_PAGE, limit: SUJETS_PAR_PAGE,
            };
            if (filterTrimestre) params.trimestre_id = filterTrimestre;
            if (filterStatut) params.statut = filterStatut;
            if (searchQ.trim()) params.q = searchQ.trim();

            const [sujR, statsR, perR, suiviR, typesR] = await Promise.all([
                api.get('/api/examens/sujets', { params }),
                api.get(`/api/examens/admin/stats${filtre}`),
                api.get('/api/examens/periodes').catch(() => ({ data: [] })),
                api.get(`/api/examens/sujets/suivi${filtre}`).catch(() => ({ data: null })),
                api.get('/api/evaluations/types').catch(() => ({ data: [] })),
            ]);
            setSujets(sujR.data);
            setTotalSujets(Number(sujR.headers?.['x-total-count'] ?? sujR.data.length));
            setStats(statsR.data);
            setPeriodes(perR.data || []);
            setSuivi(suiviR.data);
            setTypesEpreuve((typesR.data || []).filter((t: any) => t.statut === 'ACTIF'));
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [filterTrimestre, filterStatut, searchQ, page]);

    useEffect(() => { loadData(); }, [loadData]);

    // Changer de filtre remet à la première page : rester en page 7 d'une
    // liste qui n'en compte plus que 2 affiche un tableau vide, qu'on lit
    // comme « aucun sujet ».
    useEffect(() => { setPage(0); }, [filterTrimestre, filterStatut, searchQ]);

    // Réclamer les sujets se faisait uniquement depuis l'écran Communication :
    // le Centre des Examens, seul endroit où l'on constate l'absence, n'offrait
    // aucun moyen d'agir.
    const envoyerDemande = async () => {
        const periodeId = demandePeriode ?? suivi?.periode?.trimestre_id ?? periodes[0]?.trimestre_id;
        if (!periodeId) { showError('Aucune période configurée.'); return; }
        setEnvoiDemande(true);
        try {
            const res = await api.post('/api/examens/sujets/demander', {
                trimestre_id: periodeId,
                type_eval_id: demandeType || undefined,
                date_limite: demandeEcheance || undefined,
                description: demandeMessage || undefined,
            });
            showSuccess(res.data.message || 'Demande envoyée aux enseignants.');
            setDemandeOuverte(false); setDemandeMessage('');
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
        setEnvoiDemande(false);
    };

    // Relance nominative : écrire à tout le monde use la crédibilité du message.
    const relancer = async (enseignantIds?: number[]) => {
        const periodeId = suivi?.periode?.trimestre_id;
        if (!periodeId) return;
        setRelanceEnCours(true);
        try {
            const res = await api.post('/api/examens/sujets/relancer', {
                trimestre_id: periodeId,
                enseignant_ids: enseignantIds,
            });
            showSuccess(res.data.message);
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
        setRelanceEnCours(false);
    };

    const handleValider = async (id: number) => {
        try {
            await api.put(`/api/examens/sujets/${id}/valider`);
            showSuccess('Sujet validé avec succès.');
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
    };

    const handleRejeter = async () => {
        if (!rejectId) return;
        try {
            await api.put(`/api/examens/sujets/${rejectId}/rejeter?raison=${encodeURIComponent(rejectRaison)}`);
            showSuccess('Sujet rejeté, enseignant notifié.');
            setRejectId(null); setRejectRaison('');
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
    };

    // Suppression définitive d'un sujet reçu (fichier compris). L'admin peut
    // supprimer n'importe quel sujet, quel que soit son statut.
    const handleSupprimer = async (s: SujetItem) => {
        if (!confirm(`Supprimer définitivement le sujet « ${s.titre || s.matiere_libelle || 'sans titre'} » de ${s.enseignant_nom} ?\n\nLe fichier sera effacé. Cette action est irréversible.`)) return;
        try {
            await api.delete(`/api/examens/sujets/${s.sujet_id}`);
            showSuccess('Sujet supprimé.');
            loadData();
        } catch (err: any) { showError(err.response?.data?.detail || 'Erreur'); }
    };

    const formatFileSize = (bytes: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    // Le tri est fait par le serveur (statut, période, recherche, brouillons
    // écartés) : ce qui arrive ici est déjà la page à afficher.
    const filtered = sujets;
    const nbPages = Math.max(1, Math.ceil(totalSujets / SUJETS_PAR_PAGE));

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column', gap: '16px' }}>
            <Loader2 size={40} className="animate-spin" color="var(--brand-primary)" />
            <p style={{ color: 'var(--text-secondary)' }}>Chargement du centre d&apos;évaluation...</p>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Breadcrumb */}
            <div className="breadcrumb">
                <Link href="/">Accueil</Link><ChevronRight size={14} /><span>Centre des Examens</span>
            </div>

            {/* Toasts */}
            <AnimatePresence>
                {successMsg && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#f0fdf4', color: '#166534', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #bbf7d0' }}>
                    <CheckCircle2 size={17} /> {successMsg}
                </motion.div>}
                {errorMsg && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '12px', fontSize: '14px', fontWeight: 500, border: '1px solid #fecaca' }}>
                    <AlertCircle size={17} /> {errorMsg}
                </motion.div>}
            </AnimatePresence>

            {/* Hero Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{
                    padding: '28px 32px', borderRadius: '20px',
                    background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
                    color: 'white', position: 'relative', overflow: 'hidden'
                }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ position: 'absolute', bottom: '-30px', right: '80px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ padding: '14px', borderRadius: '16px', background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
                            <Award size={28} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>Centre des Examens</h1>
                            <p style={{ margin: '4px 0 0', fontSize: '14px', opacity: 0.9 }}>Réception et validation des sujets d&apos;examen</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => { setDemandePeriode(suivi?.periode?.trimestre_id ?? null); setDemandeOuverte(true); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '12px',
                                background: 'white', color: '#b45309', border: 'none',
                                fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                            }}>
                            <Megaphone size={15} /> Demander les sujets
                        </button>
                        <Link href="/examens/emploi" style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', color: 'white',
                            textDecoration: 'none', fontSize: '13px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)'
                        }}>
                            <Clock size={15} /> Calendrier des épreuves
                        </Link>
                    </div>
                </div>
            </motion.div>

            {/* KPI Cards */}
            {stats && (
                <div className="kpi-grid">
                    {[
                        { label: 'Sujets Reçus', value: stats.envoyes + stats.valides, icon: FileUp, color: '#0d9488' },
                        { label: 'Validés', value: stats.valides, icon: CheckCircle2, color: '#16a34a' },
                        { label: 'En Attente', value: stats.envoyes, icon: Clock, color: '#f59e0b' },
                        // « Taux de soumission » ne disait ni qui manquait ni pour quelle
                        // matière. On affiche ce qui reste à obtenir, et on peut cliquer.
                        {
                            label: suivi ? 'Sujets manquants' : 'Taux Soumission',
                            value: suivi ? `${suivi.manquants.length} / ${suivi.attendus}` : `${stats.taux_soumission}%`,
                            icon: suivi ? ListChecks : BarChart3,
                            color: suivi && suivi.manquants.length > 0 ? '#dc2626' : '#3b82f6',
                        },
                    ].map((kpi, i) => (
                        <motion.div key={i} className="kpi-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div><p className="kpi-label">{kpi.label}</p><p className="kpi-value">{kpi.value}</p></div>
                                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${kpi.color}15`, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <kpi.icon size={24} />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}


            {/* ═══ SUJETS ATTENDUS ET MANQUANTS ═══
                Le tableau de bord ne donnait qu'un pourcentage : il ne disait ni
                qui manquait, ni pour quelle matière. On remplace un chiffre que
                l'on subit par une liste sur laquelle on agit. */}
            {suivi && suivi.periode && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
                    className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <ListChecks size={18} color={suivi.manquants.length ? '#dc2626' : '#16a34a'} />
                        <div style={{ flex: 1, minWidth: '220px' }}>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                {suivi.manquants.length === 0
                                    ? `Tous les sujets sont arrivés — ${suivi.periode.libelle}`
                                    : `${suivi.manquants.length} sujet(s) manquant(s) — ${suivi.periode.libelle}`}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                {suivi.recus} reçu(s) sur {suivi.attendus} attendu(s)
                                {suivi.taux_couverture !== null && ` · ${suivi.taux_couverture}% de couverture`}
                                {suivi.hors_affectation > 0 && ` · ${suivi.hors_affectation} hors affectation connue`}
                            </div>
                        </div>
                        {suivi.manquants.length > 0 && (
                            <>
                                <button onClick={() => setShowManquants(v => !v)}
                                    style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'white', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: 'var(--text-primary)' }}>
                                    {showManquants ? 'Masquer la liste' : 'Voir qui manque'}
                                </button>
                                <button onClick={() => relancer()} disabled={relanceEnCours}
                                    style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#d97706', color: 'white', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <BellRing size={14} /> {relanceEnCours ? 'Envoi…' : 'Relancer les retardataires'}
                                </button>
                            </>
                        )}
                    </div>

                    {showManquants && suivi.manquants.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--border-light)', maxHeight: '360px', overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '480px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['MATIÈRE', 'ENSEIGNANT', 'CLASSES', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.4px' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {suivi.manquants.map(m => (
                                        <tr key={`${m.enseignant_id}-${m.matiere_id}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '9px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.matiere_libelle}</td>
                                            <td style={{ padding: '9px 16px', color: 'var(--text-secondary)' }}>
                                                {m.enseignant_nom}
                                                {m.enseignant_telephone && (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}> · {m.enseignant_telephone}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '9px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                                {m.classes.join(', ')}
                                            </td>
                                            <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                                                <button onClick={() => relancer([m.enseignant_id])} disabled={relanceEnCours}
                                                    style={{ padding: '5px 11px', borderRadius: '8px', border: '1px solid #fbbf24', background: 'white', color: '#b45309', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>
                                                    Relancer
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Filters */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '300px' }}>
                        <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                            placeholder="Rechercher enseignant, matière..."
                            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none' }} />
                    </div>
                    {/* Trimestre */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setFilterTrimestre(null)} style={{
                            padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: !filterTrimestre ? '#d97706' : '#f8fafc', color: !filterTrimestre ? 'white' : '#64748b',
                            border: 'none', cursor: 'pointer'
                        }}>Tous</button>
                        {periodes.map(p => (
                            <button key={p.trimestre_id} onClick={() => setFilterTrimestre(p.trimestre_id)} style={{
                                padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                background: filterTrimestre === p.trimestre_id ? '#d97706' : '#f8fafc',
                                color: filterTrimestre === p.trimestre_id ? 'white' : '#64748b',
                                border: 'none', cursor: 'pointer'
                            }}>{p.libelle}</button>
                        ))}
                    </div>
                    {/* Statut */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setFilterStatut('')} style={{
                            padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: !filterStatut ? '#4f46e5' : '#f8fafc', color: !filterStatut ? 'white' : '#64748b',
                            border: 'none', cursor: 'pointer'
                        }}>Tous</button>
                        {['ENVOYE', 'VALIDE', 'REJETE'].map(st => {
                            const cfg = STATUT_CONFIG[st];
                            return (
                                <button key={st} onClick={() => setFilterStatut(st)} style={{
                                    padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                    background: filterStatut === st ? cfg.color : '#f8fafc', color: filterStatut === st ? 'white' : '#64748b',
                                    border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}><cfg.icon size={14} /> {cfg.label}</button>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            {/* Sujets Grid */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                {filtered.length === 0 ? (
                    <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <FileText size={48} style={{ opacity: 0.15, margin: '0 auto 16px' }} />
                        <p style={{ fontWeight: 600, fontSize: '15px' }}>Aucun sujet trouvé.</p>
                        <p style={{ fontSize: '13px' }}>Les sujets des enseignants apparaîtront ici une fois envoyés.</p>
                        {/* Un écran vide doit dire quoi faire, pas seulement
                            constater. */}
                        <button onClick={() => { setDemandePeriode(suivi?.periode?.trimestre_id ?? null); setDemandeOuverte(true); }}
                            style={{ marginTop: '18px', padding: '10px 20px', borderRadius: '12px', border: 'none', background: '#d97706', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                            <Megaphone size={15} /> Demander les sujets aux enseignants
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                        {filtered.map((s, i) => {
                            const stCfg = STATUT_CONFIG[s.statut] || STATUT_CONFIG.ENVOYE;
                            const fileIcon = s.fichier_type === 'pdf' ? <FileText size={22} /> : s.fichier_type === 'docx' || s.fichier_type === 'doc' ? <PenLine size={22} /> : <Paperclip size={22} />;
                            return (
                                <motion.div key={s.sujet_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                                    className="card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                    {/* Top status band */}
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: stCfg.color }} />
                                    
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                                                {fileIcon}
                                            </div>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.titre}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{s.fichier_nom} • {formatFileSize(s.fichier_taille)}</p>
                                            </div>
                                        </div>
                                        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: stCfg.bg, color: stCfg.color, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><stCfg.icon size={12} /> {stCfg.label}</span>
                                    </div>

                                    {/* Info rows */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}><UserCheck size={14} style={{ marginRight: '4px' }} /></span> {s.enseignant_nom}
                                            {s.enseignant_specialite && <span style={{ color: 'var(--text-muted)' }}>({s.enseignant_specialite})</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><BookOpen size={14} /> {s.matiere_libelle}</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {s.duree_minutes} min</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> T{s.trimestre}</span>
                                        </div>
                                        {s.date_envoi && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                Envoyé le {new Date(s.date_envoi).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleDownloadSujet(s.sujet_id, s.fichier_nom || `sujet_${s.sujet_id}`)}
                                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '6px 14px', borderRadius: '8px', border: '1px solid #3b82f6', background: '#eff6ff', color: '#3b82f6', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                            <Download size={13} /> Télécharger
                                        </button>
                                        {s.statut === 'ENVOYE' && (
                                            <>
                                                <button onClick={() => handleValider(s.sujet_id)} style={{
                                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                                    padding: '9px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                                    background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: 'white', border: 'none', cursor: 'pointer'
                                                }}>
                                                    <CheckCircle2 size={13} /> Valider
                                                </button>
                                                <button onClick={() => { setRejectId(s.sujet_id); setRejectRaison(''); }} style={{
                                                    padding: '9px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                                    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer'
                                                }}>
                                                    <XCircle size={13} />
                                                </button>
                                            </>
                                        )}
                                        {/* Suppression définitive — l'admin peut retirer n'importe quel sujet. */}
                                        <button onClick={() => handleSupprimer(s)} title="Supprimer ce sujet" style={{
                                            padding: '9px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                                            background: 'white', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer',
                                            display: 'inline-flex', alignItems: 'center'
                                        }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}

                {/* Combien il y en a vraiment, et où on en est dedans. Sans ça
                    l'écran laisse croire que l'école n'a reçu que 50 sujets. */}
                {totalSujets > 0 && (
                    <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {totalSujets} sujet{totalSujets > 1 ? 's' : ''} déposé{totalSujets > 1 ? 's' : ''}
                            {nbPages > 1 && <> — page {page + 1} sur {nbPages}</>}
                        </span>
                        {nbPages > 1 && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                    style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'white', fontSize: '13px', fontWeight: 600, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.45 : 1 }}>
                                    ← Précédent
                                </button>
                                <button onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))} disabled={page >= nbPages - 1}
                                    style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border-light)', background: 'white', fontSize: '13px', fontWeight: 600, cursor: page >= nbPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= nbPages - 1 ? 0.45 : 1 }}>
                                    Suivant →
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>

            {/* Reject Modal */}
            <AnimatePresence>
                {rejectId && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '24px' }}
                        onClick={() => setRejectId(null)}>
                        <motion.div initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: 0.95 }}
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: 'white' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <XCircle size={18} />
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Rejeter le Sujet</h3>
                                </div>
                            </div>
                            <div style={{ padding: '24px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Raison du rejet</label>
                                <textarea value={rejectRaison} onChange={e => setRejectRaison(e.target.value)} rows={3}
                                    placeholder="Ex: Le format du fichier n'est pas conforme..."
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', outline: 'none', resize: 'vertical' }} />
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setRejectId(null)} style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>Annuler</button>
                                <button onClick={handleRejeter} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                                    background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: 'white', border: 'none', cursor: 'pointer'
                                }}><XCircle size={14} /> Rejeter</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ═══ DEMANDER LES SUJETS ═══
                Ce geste n'existait que dans l'écran Communication : il fallait
                connaître l'astuce et changer d'écran pour réclamer des sujets. */}
            <AnimatePresence>
                {demandeOuverte && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => !envoiDemande && setDemandeOuverte(false)}
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                        <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '520px', overflow: 'hidden' }}>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Megaphone size={19} color="#d97706" />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Demander les sujets</div>
                                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                        Tous les enseignants recevront la demande dans leur portail.
                                    </div>
                                </div>
                                <button onClick={() => setDemandeOuverte(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '20px 24px', display: 'grid', gap: '14px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>PÉRIODE</label>
                                    <select value={demandePeriode ?? ''} onChange={e => setDemandePeriode(Number(e.target.value) || null)}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13.5px', fontWeight: 600 }}>
                                        {periodes.length === 0 && <option value="">Aucune période configurée</option>}
                                        {periodes.map(p => (
                                            <option key={p.trimestre_id} value={p.trimestre_id}>{p.libelle}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>ÉPREUVE</label>
                                        <select value={demandeType ?? ''} onChange={e => setDemandeType(Number(e.target.value) || null)}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13.5px', fontWeight: 600 }}>
                                            <option value="">Toute la période</option>
                                            {typesEpreuve.map(t => (
                                                <option key={t.type_eval_id} value={t.type_eval_id}>{t.libelle}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>À DÉPOSER AVANT LE</label>
                                        <input type="date" value={demandeEcheance} onChange={e => setDemandeEcheance(e.target.value)}
                                            min={new Date().toISOString().slice(0, 10)}
                                            style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13.5px', fontWeight: 600 }} />
                                    </div>
                                </div>
                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '-6px' }}>
                                    Sans échéance, une relance ne s’appuie sur rien. Sans épreuve
                                    précisée, la demande vaut pour toute la période.
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>MESSAGE (FACULTATIF)</label>
                                    <textarea value={demandeMessage} onChange={e => setDemandeMessage(e.target.value)} rows={3}
                                        placeholder="Ex : merci de déposer vos sujets avant le 15 du mois."
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '13px', resize: 'vertical' }} />
                                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Laissé vide, un message standard est envoyé.
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button onClick={() => setDemandeOuverte(false)}
                                    style={{ padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, background: 'white', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                                    Annuler
                                </button>
                                <button onClick={envoyerDemande} disabled={envoiDemande || periodes.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, background: '#d97706', color: 'white', border: 'none', cursor: 'pointer' }}>
                                    <Send size={14} /> {envoiDemande ? 'Envoi…' : 'Envoyer la demande'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
