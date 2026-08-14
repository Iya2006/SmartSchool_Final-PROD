'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock, CheckCircle, XCircle, PlayCircle, ClipboardList, Calendar,
    ChevronRight, X, Loader2, AlertTriangle, History, RefreshCw, Users, MapPin,
} from 'lucide-react';

/* ═══ TYPES ═══ */
interface AffectationLike {
    classe_id: number; classe: string; matiere_id: number; matiere: string;
    niveau?: string; effectif?: number;
}
interface Seance {
    seance_id: number;
    classe_id: number;
    classe: string;
    matiere_id: number;
    matiere: string;
    enseignant_prevu: string;
    enseignant_reel: string | null;
    date_seance: string;
    heure_debut_prevue: string;
    heure_fin_prevue: string;
    salle: string | null;
    statut: 'PREVUE' | 'EN_COURS' | 'EFFECTUEE' | 'ANNULEE' | 'REPORTEE' | 'REMPLACEE' | 'NON_EFFECTUEE';
    motif_statut: string | null;
    appel_fait: boolean;
    nb_presents: number | null;
    nb_absents: number | null;
    nb_retards: number | null;
}
interface EleveRoster { eleve_id: number; inscription_id: number; nom: string; prenom: string; matricule: string; }
interface SeanceDetail extends Seance { eleves: { eleve: string; matricule: string | null; statut: string }[]; }

/* ═══ CONSTANTES ═══ */
const CARD_COLORS = [
    { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
    { bg: '#f0fdf4', border: '#10b981', text: '#065f46' },
    { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
    { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
    { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
    { bg: '#ecfdf5', border: '#14b8a6', text: '#134e4a' },
    { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },
];
function couleurClasse(index: number) { return CARD_COLORS[index % CARD_COLORS.length]; }

const STATUT_LABEL: Record<string, string> = {
    PREVUE: 'À venir', EN_COURS: 'En cours', EFFECTUEE: 'Terminée',
    ANNULEE: 'Annulée', REPORTEE: 'Reportée', REMPLACEE: 'Remplacée', NON_EFFECTUEE: 'Non effectuée',
};
const STATUT_COLOR: Record<string, string> = {
    PREVUE: '#f59e0b', EN_COURS: '#10b981', EFFECTUEE: '#3b82f6',
    ANNULEE: '#ef4444', REPORTEE: '#8b5cf6', REMPLACEE: '#0ea5e9', NON_EFFECTUEE: '#94a3b8',
};
const PRESENCE_LABEL: Record<string, string> = { PRESENT: 'P', ABSENT: 'A', ABSENT_JUSTIFIE: 'E', RETARD: 'R' };
const STATUT_PILL_BG: Record<string, string> = { PRESENT: '#10b981', ABSENT: '#ef4444', ABSENT_JUSTIFIE: '#8b5cf6', RETARD: '#f59e0b' };

export default function MesSeances({ enseignantId, primaryColor, accentColor, affectations }: {
    enseignantId: number; primaryColor: string; accentColor: string; affectations: AffectationLike[];
}) {
    const [vue, setVue] = useState<'jour' | 'historique'>('jour');
    const [seances, setSeances] = useState<Seance[]>([]);
    const [loading, setLoading] = useState(false);
    const [historique, setHistorique] = useState<Seance[]>([]);

    const [choixSeances, setChoixSeances] = useState<{ matiere: string; classe: string; options: Seance[] } | null>(null);
    const [seanceActive, setSeanceActive] = useState<Seance | null>(null);
    const [roster, setRoster] = useState<EleveRoster[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [appelStatuts, setAppelStatuts] = useState<Record<number, string>>({});
    const [appelSaving, setAppelSaving] = useState(false);
    const [modeAppel, setModeAppel] = useState(false);

    const [annulerCible, setAnnulerCible] = useState<Seance | null>(null);
    const [motifAnnulation, setMotifAnnulation] = useState('');
    const [detail, setDetail] = useState<SeanceDetail | null>(null);

    const chargerJour = useCallback(() => {
        setLoading(true);
        api.get(`/api/portail-enseignant/${enseignantId}/seances/jour`)
            .then(res => setSeances(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [enseignantId]);

    const chargerHistorique = useCallback(() => {
        setLoading(true);
        api.get(`/api/portail-enseignant/${enseignantId}/seances/historique`)
            .then(res => setHistorique(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [enseignantId]);

    useEffect(() => { if (vue === 'jour') chargerJour(); else chargerHistorique(); }, [vue, chargerJour, chargerHistorique]);

    // Regroupement classe -> matières (toutes les affectations), avec le
    // statut du jour rattaché à chaque matière quand une séance existe.
    const classes = useMemo(() => {
        const parClasse = new Map<number, { classe_id: number; classe: string; matieres: { matiere_id: number; matiere: string; seances: Seance[] }[] }>();
        affectations.forEach(a => {
            if (!parClasse.has(a.classe_id)) parClasse.set(a.classe_id, { classe_id: a.classe_id, classe: a.classe, matieres: [] });
            const c = parClasse.get(a.classe_id)!;
            if (!c.matieres.find(m => m.matiere_id === a.matiere_id)) {
                c.matieres.push({
                    matiere_id: a.matiere_id, matiere: a.matiere,
                    seances: seances.filter(s => s.classe_id === a.classe_id && s.matiere_id === a.matiere_id),
                });
            }
        });
        return Array.from(parClasse.values());
    }, [affectations, seances]);

    const ouvrirMatiere = (classeNom: string, matiereNom: string, options: Seance[]) => {
        if (options.length === 0) return;
        if (options.length === 1) { ouvrirSeance(options[0]); return; }
        setChoixSeances({ classe: classeNom, matiere: matiereNom, options });
    };

    const ouvrirSeance = (s: Seance) => {
        setChoixSeances(null);
        setModeAppel(false);
        // Statuts terminaux : seule la modale de résumé s'ouvre (pas d'action
        // possible). PREVUE/EN_COURS : seule la modale d'action s'ouvre.
        // Les deux ne doivent jamais être affichées en même temps.
        if (['EFFECTUEE', 'ANNULEE', 'NON_EFFECTUEE', 'REPORTEE', 'REMPLACEE'].includes(s.statut)) {
            ouvrirDetail(s.seance_id);
        } else {
            setSeanceActive(s);
        }
    };

    const commencer = (s: Seance) => {
        api.post(`/api/portail-enseignant/${enseignantId}/seances/${s.seance_id}/commencer`)
            .then(res => { setSeanceActive(res.data); chargerJour(); })
            .catch(err => alert(err?.response?.data?.detail || 'Erreur'));
    };

    const ouvrirAppel = (s: Seance) => {
        setModeAppel(true);
        setRosterLoading(true);
        api.get(`/api/portail-enseignant/${enseignantId}/classe/${s.classe_id}/eleves`)
            .then(res => {
                setRoster(res.data);
                const initial: Record<number, string> = {};
                res.data.forEach((e: EleveRoster) => { initial[e.inscription_id] = 'PRESENT'; });
                setAppelStatuts(initial);
            })
            .catch(err => console.error(err))
            .finally(() => setRosterLoading(false));
    };

    const enregistrerAppel = () => {
        if (!seanceActive) return;
        setAppelSaving(true);
        const items = Object.entries(appelStatuts).map(([inscription_id, statut]) => ({ inscription_id: Number(inscription_id), statut }));
        api.post(`/api/portail-enseignant/${enseignantId}/seances/${seanceActive.seance_id}/appel`, { items })
            .then(res => { setSeanceActive({ ...seanceActive, appel_fait: true }); setModeAppel(false); chargerJour(); })
            .catch(err => alert(err?.response?.data?.detail || 'Erreur'))
            .finally(() => setAppelSaving(false));
    };

    const terminer = (s: Seance) => {
        api.post(`/api/portail-enseignant/${enseignantId}/seances/${s.seance_id}/terminer`)
            .then(() => { setSeanceActive(null); chargerJour(); })
            .catch(err => alert(err?.response?.data?.detail || 'Erreur'));
    };

    const confirmerAnnulation = () => {
        if (!annulerCible || !motifAnnulation.trim()) return;
        api.put(`/api/portail-enseignant/${enseignantId}/seances/${annulerCible.seance_id}/annuler`, { motif: motifAnnulation })
            .then(() => { setAnnulerCible(null); setMotifAnnulation(''); setSeanceActive(null); chargerJour(); })
            .catch(err => alert(err?.response?.data?.detail || 'Erreur'));
    };

    const ouvrirDetail = (seanceId: number) => {
        api.get(`/api/portail-enseignant/${enseignantId}/seances/${seanceId}`)
            .then(res => setDetail(res.data))
            .catch(err => console.error(err));
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setVue('jour')} style={toggleBtn(vue === 'jour', primaryColor)}>
                        <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Aujourd&apos;hui
                    </button>
                    <button onClick={() => setVue('historique')} style={toggleBtn(vue === 'historique', primaryColor)}>
                        <History size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Historique
                    </button>
                </div>
                <button onClick={() => vue === 'jour' ? chargerJour() : chargerHistorique()} style={{ padding: '8px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }} title="Rafraîchir">
                    <RefreshCw size={15} color="#64748b" />
                </button>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="animate-spin" size={24} color={primaryColor} /></div>}

            {/* ── VUE JOUR : cartes par classe, matières en puces ── */}
            {!loading && vue === 'jour' && (
                classes.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>Aucune classe affectée.</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
                        {classes.map((c, i) => {
                            const col = couleurClasse(i);
                            const nbAujourdhui = c.matieres.filter(m => m.seances.length > 0).length;
                            return (
                                <div key={c.classe_id} style={{ background: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                                    <div style={{ background: `linear-gradient(135deg, ${col.border}, ${col.text})`, padding: '16px 20px', color: 'white' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>{c.classe}</h3>
                                        <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.85 }}>
                                            {nbAujourdhui > 0 ? `${nbAujourdhui} séance(s) aujourd'hui` : "Pas de séance aujourd'hui"}
                                        </p>
                                    </div>
                                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {c.matieres.map(m => {
                                            const actives = m.seances;
                                            const enCours = actives.some(s => s.statut === 'EN_COURS');
                                            const terminees = actives.length > 0 && actives.every(s => ['EFFECTUEE', 'ANNULEE', 'NON_EFFECTUEE', 'REPORTEE', 'REMPLACEE'].includes(s.statut));
                                            const cliquable = actives.length > 0;
                                            return (
                                                <button key={m.matiere_id} disabled={!cliquable}
                                                    onClick={() => ouvrirMatiere(c.classe, m.matiere, actives)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '10px 14px', borderRadius: '12px', border: `1px solid ${cliquable ? col.border + '33' : '#f1f5f9'}`,
                                                        background: cliquable ? col.bg : '#fafafa', cursor: cliquable ? 'pointer' : 'default',
                                                        textAlign: 'left', width: '100%',
                                                    }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: cliquable ? col.text : '#94a3b8' }}>{m.matiere}</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {actives.length > 0 && !terminees && (
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 800,
                                                                color: enCours ? '#10b981' : '#f59e0b', textTransform: 'uppercase',
                                                            }}>
                                                                <span style={{
                                                                    width: '7px', height: '7px', borderRadius: '50%',
                                                                    background: enCours ? '#10b981' : '#ef4444',
                                                                    animation: enCours ? 'seancePulse 1.4s ease-in-out infinite' : 'none',
                                                                }} />
                                                                {enCours ? 'En cours' : "Aujourd'hui"}
                                                            </span>
                                                        )}
                                                        {terminees && <CheckCircle size={14} color="#3b82f6" />}
                                                        {cliquable && <ChevronRight size={14} color={col.border} />}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* ── VUE HISTORIQUE ── */}
            {!loading && vue === 'historique' && (
                historique.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>Aucun historique de séance.</p>
                ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {historique.map(s => (
                            <div key={s.seance_id} onClick={() => ouvrirDetail(s.seance_id)} style={{
                                background: 'white', borderRadius: '14px', padding: '14px 18px', display: 'flex',
                                alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: `1px solid ${STATUT_COLOR[s.statut]}22`,
                            }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{s.matiere} — {s.classe}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{s.date_seance} · {s.heure_debut_prevue}–{s.heure_fin_prevue}</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {s.nb_presents !== null && (
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                                            <span style={{ color: '#10b981', fontWeight: 700 }}>{s.nb_presents}P</span>{' '}
                                            <span style={{ color: '#ef4444', fontWeight: 700 }}>{s.nb_absents}A</span>{' '}
                                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{s.nb_retards}R</span>
                                        </span>
                                    )}
                                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, background: `${STATUT_COLOR[s.statut]}18`, color: STATUT_COLOR[s.statut] }}>
                                        {STATUT_LABEL[s.statut]}
                                    </span>
                                    <ChevronRight size={14} color="#cbd5e1" />
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* ── Choix parmi plusieurs séances de la même matière/jour ── */}
            <AnimatePresence>
                {choixSeances && (
                    <ModalShell onClose={() => setChoixSeances(null)}>
                        <ModalHeader title={`${choixSeances.matiere} — ${choixSeances.classe}`} subtitle="Plusieurs séances aujourd'hui, laquelle ?" onClose={() => setChoixSeances(null)} />
                        <div style={{ padding: '16px 24px', display: 'grid', gap: '8px' }}>
                            {choixSeances.options.map(s => (
                                <button key={s.seance_id} onClick={() => ouvrirSeance(s)} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer',
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: '13px' }}>{s.heure_debut_prevue}–{s.heure_fin_prevue}</span>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: STATUT_COLOR[s.statut] }}>{STATUT_LABEL[s.statut]}</span>
                                </button>
                            ))}
                        </div>
                    </ModalShell>
                )}
            </AnimatePresence>

            {/* ── Modale principale : Commencer / Appel / Terminer / Résumé ── */}
            <AnimatePresence>
                {seanceActive && !modeAppel && (
                    <ModalShell onClose={() => setSeanceActive(null)}>
                        <ModalHeader
                            title={`${seanceActive.matiere} — ${seanceActive.classe}`}
                            subtitle={`${seanceActive.heure_debut_prevue}–${seanceActive.heure_fin_prevue}${seanceActive.salle ? ` · Salle ${seanceActive.salle}` : ''}`}
                            onClose={() => setSeanceActive(null)}
                        />
                        <div style={{ padding: '20px 24px' }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800,
                                textTransform: 'uppercase', padding: '4px 12px', borderRadius: '20px', marginBottom: '16px',
                                background: `${STATUT_COLOR[seanceActive.statut]}18`, color: STATUT_COLOR[seanceActive.statut],
                            }}>{STATUT_LABEL[seanceActive.statut]}</span>

                            {seanceActive.statut === 'PREVUE' && (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => commencer(seanceActive)} style={{ ...primaryBtn(primaryColor), flex: 1 }}>
                                        <PlayCircle size={16} /> Commencer la séance
                                    </button>
                                    <button onClick={() => setAnnulerCible(seanceActive)} style={secondaryBtn('#ef4444')}>
                                        <XCircle size={16} />
                                    </button>
                                </div>
                            )}

                            {seanceActive.statut === 'EN_COURS' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <button onClick={() => ouvrirAppel(seanceActive)} style={{ ...primaryBtn(accentColor) }}>
                                        <ClipboardList size={16} /> {seanceActive.appel_fait ? "Modifier l'appel" : "Faire l'appel"}
                                    </button>
                                    <button onClick={() => terminer(seanceActive)} style={{ ...primaryBtn('#10b981') }}>
                                        <CheckCircle size={16} /> Terminer la séance
                                    </button>
                                    {!seanceActive.appel_fait && (
                                        <p style={{ margin: 0, fontSize: '11px', color: '#f59e0b', textAlign: 'center' }}>
                                            <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                            Aucun appel enregistré pour l&apos;instant
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </ModalShell>
                )}
            </AnimatePresence>

            {/* ── Modale Appel (P/A/R) ── */}
            <AnimatePresence>
                {seanceActive && modeAppel && (
                    <ModalShell onClose={() => { setModeAppel(false); }}>
                        <ModalHeader title={`Appel — ${seanceActive.matiere}`} subtitle={seanceActive.classe} onClose={() => setModeAppel(false)} />
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px' }}>
                            {rosterLoading && <div style={{ textAlign: 'center', padding: '30px' }}><Loader2 className="animate-spin" size={22} color={primaryColor} /></div>}
                            {!rosterLoading && roster.map(e => (
                                <div key={e.inscription_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{e.prenom} {e.nom}</p>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{e.matricule}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {(['PRESENT', 'ABSENT', 'RETARD'] as const).map(st => (
                                            <button key={st} onClick={() => setAppelStatuts(prev => ({ ...prev, [e.inscription_id]: st }))}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '12px',
                                                    background: appelStatuts[e.inscription_id] === st ? STATUT_PILL_BG[st] : '#f1f5f9',
                                                    color: appelStatuts[e.inscription_id] === st ? 'white' : '#94a3b8',
                                                }}>{PRESENCE_LABEL[st]}</button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                            <button onClick={enregistrerAppel} disabled={appelSaving || rosterLoading} style={{ ...primaryBtn(primaryColor), width: '100%', opacity: appelSaving || rosterLoading ? 0.6 : 1 }}>
                                {appelSaving ? 'Enregistrement…' : "Enregistrer l'appel"}
                            </button>
                        </div>
                    </ModalShell>
                )}
            </AnimatePresence>

            {/* ── Modale Annulation ── */}
            <AnimatePresence>
                {annulerCible && (
                    <ModalShell onClose={() => setAnnulerCible(null)} maxWidth="420px">
                        <div style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <AlertTriangle size={20} color="#ef4444" />
                                <p style={{ margin: 0, fontWeight: 800, fontSize: '15px' }}>Annuler la séance</p>
                            </div>
                            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>{annulerCible.matiere} — {annulerCible.classe}</p>
                            <textarea value={motifAnnulation} onChange={e => setMotifAnnulation(e.target.value)} placeholder="Motif de l'annulation…"
                                style={{ width: '100%', minHeight: '70px', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', resize: 'vertical', marginBottom: '14px' }} />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setAnnulerCible(null)} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Retour</button>
                                <button onClick={confirmerAnnulation} disabled={!motifAnnulation.trim()} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 700, opacity: motifAnnulation.trim() ? 1 : 0.5 }}>Confirmer</button>
                            </div>
                        </div>
                    </ModalShell>
                )}
            </AnimatePresence>

            {/* ── Modale Détail / Résumé (présents ET absents à poids égal) ── */}
            <AnimatePresence>
                {detail && (
                    <ModalShell onClose={() => { setDetail(null); setSeanceActive(null); }}>
                        <ModalHeader title={`${detail.matiere} — ${detail.classe}`} subtitle={`${detail.date_seance} · ${detail.heure_debut_prevue}–${detail.heure_fin_prevue}`} onClose={() => { setDetail(null); setSeanceActive(null); }} />
                        <div style={{ padding: '16px 24px' }}>
                            {detail.motif_statut && (
                                <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>{detail.motif_statut}</p>
                            )}
                            {detail.nb_presents !== null && (
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                                    <StatBox label="Présents" value={detail.nb_presents} color="#10b981" bg="#f0fdf4" />
                                    <StatBox label="Absents" value={detail.nb_absents} color="#ef4444" bg="#fef2f2" />
                                    <StatBox label="Retards" value={detail.nb_retards} color="#f59e0b" bg="#fffbeb" />
                                </div>
                            )}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px' }}>
                            {detail.eleves.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '20px' }}>Aucun appel enregistré.</p>}
                            {detail.eleves.map((e, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                    <span>{e.eleve}</span>
                                    <span style={{
                                        fontWeight: 700, fontSize: '11px', padding: '2px 10px', borderRadius: '20px',
                                        background: `${STATUT_PILL_BG[e.statut] || '#64748b'}18`, color: STATUT_PILL_BG[e.statut] || '#64748b',
                                    }}>{e.statut === 'PRESENT' ? 'Présent' : e.statut === 'ABSENT' ? 'Absent' : e.statut === 'RETARD' ? 'Retard' : e.statut === 'ABSENT_JUSTIFIE' ? 'Excusé' : e.statut}</span>
                                </div>
                            ))}
                        </div>
                    </ModalShell>
                )}
            </AnimatePresence>

            <style>{`@keyframes seancePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.5)}}`}</style>
        </div>
    );
}

/* ═══ SOUS-COMPOSANTS ═══ */
function ModalShell({ children, onClose, maxWidth = '560px' }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            onClick={onClose}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {children}
            </motion.div>
        </motion.div>
    );
}
function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
    return (
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: '#1e293b' }}>{title}</p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{subtitle}</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>
    );
}
function StatBox({ label, value, color, bg }: { label: string; value: number | null; color: string; bg: string }) {
    return (
        <div style={{ flex: 1, background: bg, borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '22px', fontWeight: 800, color }}>{value ?? 0}</p>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color }}>{label}</p>
        </div>
    );
}
function toggleBtn(active: boolean, primaryColor: string): React.CSSProperties {
    return { padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '13px', background: active ? primaryColor : '#f1f5f9', color: active ? 'white' : '#64748b' };
}
function primaryBtn(color: string): React.CSSProperties {
    return { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: color, color: 'white', fontWeight: 700, fontSize: '14px' };
}
function secondaryBtn(color: string): React.CSSProperties {
    return { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `${color}18`, color, fontWeight: 700 };
}
