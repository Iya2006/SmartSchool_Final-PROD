'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UserCheck, Search, ChevronRight, CheckCircle2,
    Loader2, Users, Banknote, Clock, XCircle, LogOut, UserX, GraduationCap
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import AnneeFilter from '@/components/AnneeFilter';
import Pagination from '@/components/Pagination';

interface EleveCampagne {
    eleve_id: number;
    inscription_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    decision_fin_annee: string | null;
    moyenne_annuelle: number | null;
    statut_reinscription: string;
    nouvelle_inscription_id: number | null;
    montant_du: number;
    montant_paye: number;
}

interface EleveEnAttenteFiliere {
    eleve_id: number;
    inscription_id: number;
    matricule: string;
    nom: string;
    prenom: string;
    sexe: string;
    classe_actuelle: string;
    moyenne_annuelle: number | null;
}

interface NiveauLycee { niveau_id: number; libelle: string; }

const fmt = (n: number) => (n || 0).toLocaleString('fr-GN') + ' GNF';

const STATUT_STYLE: Record<string, { bg: string; color: string; label: string; icon: any }> = {
    A_REINSCRIRE: { bg: '#fef3c7', color: '#b45309', label: 'En attente', icon: Clock },
    REINSCRIT: { bg: '#d1fae5', color: '#059669', label: 'Réinscrit', icon: CheckCircle2 },
    NON_REINSCRIT: { bg: '#f1f5f9', color: '#475569', label: 'Non réinscrit', icon: XCircle },
    TRANSFERE: { bg: '#dbeafe', color: '#1d4ed8', label: 'Transféré', icon: LogOut },
    ABANDON: { bg: '#fee2e2', color: '#b91c1c', label: 'Abandon', icon: UserX },
};

export default function ReinscriptionPage() {
    const { anneeId: anneeCouranteId } = useApp();
    const searchParams = useSearchParams();
    // Lien direct depuis l'assistant de clôture (étape "Ouverture de la
    // campagne de réinscription") : préremplit l'année cible visée plutôt que
    // l'année courante par défaut.
    const anneeIdParam = searchParams.get('annee_id');
    const [filterAnnee, setFilterAnnee] = useState<number>(anneeIdParam ? parseInt(anneeIdParam) : anneeCouranteId);
    useEffect(() => {
        if (!anneeIdParam) setFilterAnnee(anneeCouranteId);
    }, [anneeCouranteId, anneeIdParam]);

    const [mode, setMode] = useState<'classe' | 'filiere'>('classe');

    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClasse, setSelectedClasse] = useState<number | null>(null);
    const [eleves, setEleves] = useState<EleveCampagne[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const PAGE_SIZE = 25;

    // Onglet "Choix de filière" : les élèves de 10e admis (EN_ATTENTE_FILIERE)
    // viennent de l'année qui vient d'être clôturée (année source), pas de
    // l'année cible sélectionnée ci-dessus pour la campagne par classe.
    const [filiereSourceId, setFiliereSourceId] = useState<number>(anneeCouranteId);
    useEffect(() => { setFiliereSourceId(anneeCouranteId); }, [anneeCouranteId]);
    const [eleveFiliere, setEleveFiliere] = useState<EleveEnAttenteFiliere[]>([]);
    const [loadingFiliere, setLoadingFiliere] = useState(false);
    const [filiereBusyId, setFiliereBusyId] = useState<number | null>(null);
    const [niveauxLycee, setNiveauxLycee] = useState<NiveauLycee[]>([]);

    useEffect(() => {
        api.get('/api/parametrage/cycles?etablissement_id=1').then(res => {
            const cycles = res.data || [];
            const lycee = cycles.find((c: any) => c.code === 'LYC');
            const premiereAnneeLycee = (lycee?.niveaux || []).filter((n: any) => n.ordre >= 11 && n.ordre <= 13);
            setNiveauxLycee(premiereAnneeLycee.map((n: any) => ({ niveau_id: n.niveau_id, libelle: n.libelle })));
        }).catch(() => {});
    }, []);

    const showMsg = (text: string, type: 'success' | 'error') => {
        setMsg({ text, type });
        setTimeout(() => setMsg(null), 6000);
    };

    // Classes de l'année cible (celle où les élèves promus/redoublants sont
    // proposés par la clôture — voir /classes/cloture-annee) : la campagne de
    // réinscription est indépendante de la promotion mais se lit par classe
    // cible, comme avant.
    useEffect(() => {
        api.get(`/api/classes?etablissement_id=1&annee_id=${filterAnnee}`)
            .then(res => setClasses(res.data || []))
            .catch(() => showMsg('Impossible de charger les classes.', 'error'));
    }, [filterAnnee]);

    const loadEleves = useCallback(async () => {
        if (!selectedClasse) { setEleves([]); return; }
        setLoading(true);
        try {
            const res = await api.get(`/api/reinscription/classe-cible/${selectedClasse}`);
            setEleves(res.data || []);
        } catch {
            showMsg('Impossible de charger la campagne de réinscription.', 'error');
            setEleves([]);
        } finally {
            setLoading(false);
        }
    }, [selectedClasse]);

    useEffect(() => { loadEleves(); }, [loadEleves]);
    useEffect(() => { setPage(1); }, [search, selectedClasse]);

    const loadEnAttenteFiliere = useCallback(async () => {
        if (!filiereSourceId) { setEleveFiliere([]); return; }
        setLoadingFiliere(true);
        try {
            const res = await api.get(`/api/reinscription/en-attente-filiere/${filiereSourceId}`);
            setEleveFiliere(res.data || []);
        } catch {
            showMsg('Impossible de charger la liste des élèves en attente de filière.', 'error');
            setEleveFiliere([]);
        } finally {
            setLoadingFiliere(false);
        }
    }, [filiereSourceId]);

    useEffect(() => { if (mode === 'filiere') loadEnAttenteFiliere(); }, [mode, loadEnAttenteFiliere]);

    const choisirFiliere = async (inscriptionId: number, niveauId: number) => {
        if (!filterAnnee) return;
        setFiliereBusyId(inscriptionId);
        try {
            await api.put(`/api/promotion/eleve/${inscriptionId}/choisir-filiere`, { niveau_id: niveauId, annee_cible_id: filterAnnee });
            showMsg('Filière choisie avec succès — l\'élève est maintenant confirmable depuis l\'onglet « Par classe ».', 'success');
            await loadEnAttenteFiliere();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec du choix de filière.', 'error');
        } finally {
            setFiliereBusyId(null);
        }
    };

    const confirmer = async (eleve: EleveCampagne) => {
        setBusyId(eleve.inscription_id);
        try {
            const res = await api.post(`/api/reinscription/${eleve.inscription_id}/confirmer`);
            showMsg(res.data?.message || `${eleve.prenom} ${eleve.nom} réinscrit(e) avec succès.`, 'success');
            await loadEleves();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la réinscription.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const changerStatut = async (eleve: EleveCampagne, statut: 'NON_REINSCRIT' | 'TRANSFERE' | 'ABANDON') => {
        const labels: Record<string, string> = { NON_REINSCRIT: 'Non réinscrit', TRANSFERE: 'Transféré', ABANDON: 'Abandon' };
        if (!confirm(`Marquer ${eleve.prenom} ${eleve.nom} comme "${labels[statut]}" ?`)) return;
        setBusyId(eleve.inscription_id);
        try {
            await api.put(`/api/reinscription/${eleve.inscription_id}/statut`, { statut });
            showMsg(`${eleve.prenom} ${eleve.nom} marqué(e) "${labels[statut]}".`, 'success');
            await loadEleves();
        } catch (e: any) {
            showMsg(e.response?.data?.detail || 'Échec de la mise à jour.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const filtered = eleves.filter(e =>
        `${e.prenom} ${e.nom} ${e.matricule}`.toLowerCase().includes(search.toLowerCase())
    );
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const nbEnAttente = eleves.filter(e => e.statut_reinscription === 'A_REINSCRIRE').length;
    const nbReinscrits = eleves.filter(e => e.statut_reinscription === 'REINSCRIT').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b' }}>
                    <Link href="/comptabilite" style={{ color: '#10b981' }}>Comptabilité</Link><ChevronRight size={14} />
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Réinscriptions</span>
                </div>
                <AnneeFilter value={filterAnnee} onChange={setFilterAnnee} />
            </div>

            <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <UserCheck size={24} color="#10b981" /> Réinscriptions
                </h1>
                <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
                    Élèves admis ou redoublants (promotion déjà validée) en attente de réinscription. Confirmer crée le
                    dossier de la nouvelle année et génère les frais obligatoires — indépendant du paiement, qui suit
                    ensuite le circuit normal (Encaissement).
                </p>
            </div>

            <AnimatePresence>
                {msg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ padding: '12px 16px', borderRadius: 10, background: msg.type === 'error' ? '#fee2e2' : '#d1fae5', color: msg.type === 'error' ? '#b91c1c' : '#047857', fontWeight: 600, fontSize: 14 }}>
                        {msg.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Onglets */}
            <div className="no-print" style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0' }}>
                <button onClick={() => setMode('classe')}
                    style={{ padding: '10px 16px', border: 'none', borderBottom: mode === 'classe' ? '2px solid #10b981' : '2px solid transparent', background: 'transparent', color: mode === 'classe' ? '#059669' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserCheck size={15} /> Par classe
                </button>
                <button onClick={() => setMode('filiere')}
                    style={{ padding: '10px 16px', border: 'none', borderBottom: mode === 'filiere' ? '2px solid #10b981' : '2px solid transparent', background: 'transparent', color: mode === 'filiere' ? '#059669' : '#64748b', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GraduationCap size={15} /> Choix de filière
                </button>
            </div>

            {mode === 'classe' && (
            <>
            {/* Sélection classe */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={selectedClasse ?? ''} onChange={e => setSelectedClasse(Number(e.target.value) || null)}
                    style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 600, minWidth: 280, background: 'white', cursor: 'pointer' }}>
                    <option value="">— Sélectionner une classe —</option>
                    {classes.map((c: any) => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                </select>
                {selectedClasse && !loading && (
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#475569' }}>
                        <span><strong>{nbEnAttente}</strong> en attente</span>
                        <span style={{ color: '#059669' }}><strong>{nbReinscrits}</strong> réinscrit(s)</span>
                    </div>
                )}
                {eleves.length > 0 && (
                    <div style={{ position: 'relative', marginLeft: 'auto' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un élève..."
                            style={{ padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, width: 240 }} />
                    </div>
                )}
            </div>

            {!selectedClasse ? (
                <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                    <Users size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p style={{ fontSize: 15, fontWeight: 600 }}>Sélectionnez une classe pour voir sa campagne de réinscription.</p>
                </div>
            ) : loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={32} className="animate-spin" color="#10b981" /></div>
            ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div className="table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: '700px' }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderBottom: '2px solid #e2e8f0' }}>
                                {['Élève', 'Matricule', 'Décision', 'Frais générés', 'Statut', 'Action'].map(h => (
                                    <th key={h} style={{ padding: '13px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                                    <CheckCircle2 size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                                    Aucun élève en campagne de réinscription pour cette classe.
                                </td></tr>
                            ) : paginated.map(e => {
                                const style = STATUT_STYLE[e.statut_reinscription] || { bg: '#f1f5f9', color: '#475569', label: e.statut_reinscription, icon: Clock };
                                const StatutIcon = style.icon;
                                const peutAgir = e.statut_reinscription === 'A_REINSCRIRE' || e.statut_reinscription === 'NON_REINSCRIT';
                                return (
                                    <tr key={e.eleve_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>{e.prenom} {e.nom}</td>
                                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{e.matricule}</td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#eef2ff', color: '#4f46e5' }}>
                                                {e.decision_fin_annee === 'ADMIS' ? 'Admis' : e.decision_fin_annee === 'REDOUBLANT' ? 'Redoublant' : (e.decision_fin_annee || '—')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            {e.statut_reinscription === 'REINSCRIT' ? (
                                                <span>{fmt(e.montant_paye)} <span style={{ color: '#94a3b8' }}>/ {fmt(e.montant_du)}</span></span>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color }}>
                                                <StatutIcon size={12} /> {style.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                            {e.statut_reinscription === 'REINSCRIT' ? (
                                                <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                                            ) : peutAgir ? (
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    <button onClick={() => confirmer(e)} disabled={busyId === e.inscription_id}
                                                        style={{ padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer' }}>
                                                        {busyId === e.inscription_id ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                                                        Confirmer
                                                    </button>
                                                    <button onClick={() => changerStatut(e, 'TRANSFERE')} disabled={busyId === e.inscription_id}
                                                        title="Transféré vers une autre école"
                                                        style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 11, fontWeight: 700, background: '#fff', color: '#1d4ed8', cursor: 'pointer' }}>
                                                        Transféré
                                                    </button>
                                                    <button onClick={() => changerStatut(e, 'ABANDON')} disabled={busyId === e.inscription_id}
                                                        title="Abandon scolaire"
                                                        style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #fecaca', fontSize: 11, fontWeight: 700, background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>
                                                        Abandon
                                                    </button>
                                                    {e.statut_reinscription !== 'NON_REINSCRIT' && (
                                                        <button onClick={() => changerStatut(e, 'NON_REINSCRIT')} disabled={busyId === e.inscription_id}
                                                            title="Pas encore réinscrit, à relancer"
                                                            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                                                            Non réinscrit
                                                        </button>
                                                    )}
                                                </div>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                    <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
                </div>
            )}

            <div style={{ padding: '12px 18px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12.5, color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Banknote size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                    « Confirmer » crée le dossier de l&apos;élève pour cette année et génère automatiquement les
                    factures des frais obligatoires (grille tarifaire de la classe). Le paiement se fait ensuite
                    normalement depuis <Link href="/comptabilite/encaissement" style={{ color: '#1e40af', fontWeight: 700 }}>Encaissement</Link> —
                    il n&apos;est plus une condition préalable à la réinscription elle-même.
                </span>
            </div>
            </>
            )}

            {mode === 'filiere' && (
            <>
            {/* Sélection année source */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Année source (élèves promus depuis) :</span>
                <AnneeFilter value={filiereSourceId} onChange={setFiliereSourceId} />
                {eleveFiliere.length > 0 && !loadingFiliere && (
                    <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>{eleveFiliere.length} élève(s) en attente</span>
                )}
            </div>

            {loadingFiliere ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Loader2 size={32} className="animate-spin" color="#10b981" /></div>
            ) : eleveFiliere.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                    <GraduationCap size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p style={{ fontSize: 15, fontWeight: 600 }}>Aucun élève en attente de choix de filière pour cette année source.</p>
                </div>
            ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div className="table-scroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: '600px' }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', borderBottom: '2px solid #e2e8f0' }}>
                                {['Élève', 'Matricule', 'Classe actuelle', 'Moyenne', 'Filière'].map(h => (
                                    <th key={h} style={{ padding: '13px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12, textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {eleveFiliere.map(el => (
                                <tr key={el.eleve_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>{el.prenom} {el.nom}</td>
                                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{el.matricule}</td>
                                    <td style={{ padding: '12px 14px', color: '#475569' }}>{el.classe_actuelle}</td>
                                    <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>{el.moyenne_annuelle ?? '—'}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <select disabled={filiereBusyId === el.inscription_id} defaultValue=""
                                            onChange={e => e.target.value && choisirFiliere(el.inscription_id, Number(e.target.value))}
                                            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600 }}>
                                            <option value="">-- Choisir --</option>
                                            {niveauxLycee.map(n => <option key={n.niveau_id} value={n.niveau_id}>{n.libelle}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            <div style={{ padding: '12px 18px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12.5, color: '#1e40af', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <GraduationCap size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                    Ces élèves de 10e année sont admis et déjà promus — leur promotion ne dépend pas de ce choix.
                    Une fois la filière choisie, l&apos;élève sort de cette liste et devient confirmable depuis
                    l&apos;onglet « Par classe » (classe {niveauxLycee.length > 0 ? '11e' : ''} correspondant à la filière choisie).
                </span>
            </div>
            </>
            )}
        </div>
    );
}
