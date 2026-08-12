'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock, CheckCircle, XCircle, Calendar, Loader2, X, Search,
    RefreshCw, User, ArrowLeftRight, Printer, ClipboardList, PlayCircle,
    AlertTriangle, Filter, Users2, MapPin,
} from 'lucide-react';
import api from '@/lib/api';

interface Seance {
    seance_id: number;
    classe_id: number;
    classe: string;
    matiere_id: number;
    matiere: string;
    enseignant_prevu_id: number;
    enseignant_prevu: string;
    enseignant_reel: string | null;
    date_seance: string;
    heure_debut_prevue: string;
    heure_fin_prevue: string;
    salle: string | null;
    statut: string;
    motif_statut: string | null;
    appel_fait: boolean;
    nb_presents: number | null;
    nb_absents: number | null;
    nb_retards: number | null;
}
interface SeanceDetail extends Seance {
    eleves: { eleve: string; matricule: string | null; statut: string }[];
}
interface Enseignant { enseignant_id: number; nom: string; prenom: string; }
interface Classe { classe_id: number; libelle: string; }
interface Matiere { matiere_id: number; libelle: string; }

const STATUT_LABEL: Record<string, string> = {
    PREVUE: 'À venir', EN_COURS: 'En cours', EFFECTUEE: 'Effectuée',
    ANNULEE: 'Annulée', REPORTEE: 'Reportée', REMPLACEE: 'Remplacée', NON_EFFECTUEE: 'Non effectuée',
};
const STATUT_COLOR: Record<string, string> = {
    PREVUE: '#f59e0b', EN_COURS: '#10b981', EFFECTUEE: '#3b82f6',
    ANNULEE: '#ef4444', REPORTEE: '#8b5cf6', REMPLACEE: '#0ea5e9', NON_EFFECTUEE: '#94a3b8',
};
const PRESENCE_LABEL: Record<string, string> = { PRESENT: 'Présent', ABSENT: 'Absent', ABSENT_JUSTIFIE: 'Excusé', RETARD: 'Retard' };
const STATUT_PILL_COLOR: Record<string, string> = { PRESENT: '#10b981', ABSENT: '#ef4444', ABSENT_JUSTIFIE: '#8b5cf6', RETARD: '#f59e0b' };

const PALETTE = [
    { border: '#3b82f6', text: '#1e40af', bg: '#eff6ff' },
    { border: '#10b981', text: '#065f46', bg: '#f0fdf4' },
    { border: '#f59e0b', text: '#92400e', bg: '#fffbeb' },
    { border: '#ec4899', text: '#9d174d', bg: '#fdf2f8' },
    { border: '#8b5cf6', text: '#5b21b6', bg: '#f5f3ff' },
    { border: '#14b8a6', text: '#115e59', bg: '#f0fdfa' },
    { border: '#f97316', text: '#9a3412', bg: '#fff7ed' },
    { border: '#0ea5e9', text: '#075985', bg: '#f0f9ff' },
];
function couleurPour(cle: string) {
    let hash = 0;
    for (let i = 0; i < cle.length; i++) { hash = cle.charCodeAt(i) + ((hash << 5) - hash); hash |= 0; }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function VieScolaireSeancesPage() {
    const [seances, setSeances] = useState<Seance[]>([]);
    const [loading, setLoading] = useState(true);
    const [detail, setDetail] = useState<SeanceDetail | null>(null);

    const [enseignants, setEnseignants] = useState<Enseignant[]>([]);
    const [classes, setClasses] = useState<Classe[]>([]);
    const [matieres, setMatieres] = useState<Matiere[]>([]);

    const [fDate, setFDate] = useState('');
    const [fDateDebut, setFDateDebut] = useState('');
    const [fDateFin, setFDateFin] = useState('');
    const [fEnseignant, setFEnseignant] = useState('');
    const [fClasse, setFClasse] = useState('');
    const [fMatiere, setFMatiere] = useState('');
    const [fStatut, setFStatut] = useState('');

    useEffect(() => {
        Promise.all([
            api.get('/api/enseignants').then(r => setEnseignants(r.data || [])).catch(() => {}),
            api.get('/api/classes').then(r => setClasses(r.data || [])).catch(() => {}),
            api.get('/api/matieres').then(r => setMatieres(r.data || [])).catch(() => {}),
        ]);
    }, []);

    const charger = useCallback(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (fDate) params.set('date', fDate);
        if (fDateDebut) params.set('date_debut', fDateDebut);
        if (fDateFin) params.set('date_fin', fDateFin);
        if (fEnseignant) params.set('enseignant_id', fEnseignant);
        if (fClasse) params.set('classe_id', fClasse);
        if (fMatiere) params.set('matiere_id', fMatiere);
        if (fStatut) params.set('statut', fStatut);

        api.get(`/api/seances?${params.toString()}`)
            .then(res => setSeances(res.data || []))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [fDate, fDateDebut, fDateFin, fEnseignant, fClasse, fMatiere, fStatut]);

    useEffect(() => { charger(); }, [charger]);

    const ouvrirDetail = (seanceId: number) => {
        api.get(`/api/seances/${seanceId}`)
            .then(res => setDetail(res.data))
            .catch(err => console.error(err));
    };

    const stats = useMemo(() => {
        const c: Record<string, number> = {};
        seances.forEach(s => { c[s.statut] = (c[s.statut] || 0) + 1; });
        const presents = seances.reduce((sum, s) => sum + (s.nb_presents || 0), 0);
        const absents = seances.reduce((sum, s) => sum + (s.nb_absents || 0), 0);
        return {
            total: seances.length,
            prevues: c['PREVUE'] || 0,
            enCours: c['EN_COURS'] || 0,
            effectuees: (c['EFFECTUEE'] || 0) + (c['REMPLACEE'] || 0),
            annulees: (c['ANNULEE'] || 0) + (c['NON_EFFECTUEE'] || 0),
            presents, absents,
        };
    }, [seances]);

    const detailColor = detail ? couleurPour(detail.classe) : PALETTE[0];

    return (
        <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* ── Bannière ── */}
            <div className="no-print" style={{
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', borderRadius: '20px', padding: '26px 30px',
                marginBottom: '20px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 8px 24px rgba(79,70,229,0.25)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '14px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ClipboardList size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Séances pédagogiques</h1>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.85 }}>
                            Cours prévus, en cours et effectués — distinct du pointage physique du personnel.
                        </p>
                    </div>
                </div>
                <button onClick={charger} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                    borderRadius: '12px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)',
                    color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
                }}>
                    <RefreshCw size={14} /> Rafraîchir
                </button>
            </div>

            {/* ── Bandeau de stats ── */}
            <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <StatCard icon={<ClipboardList size={16} />} label="Total" value={stats.total} color="#4f46e5" bg="#eef2ff" />
                <StatCard icon={<Clock size={16} />} label="À venir" value={stats.prevues} color="#f59e0b" bg="#fffbeb" />
                <StatCard icon={<PlayCircle size={16} />} label="En cours" value={stats.enCours} color="#10b981" bg="#f0fdf4" />
                <StatCard icon={<CheckCircle size={16} />} label="Effectuées" value={stats.effectuees} color="#3b82f6" bg="#eff6ff" />
                <StatCard icon={<XCircle size={16} />} label="Annulées" value={stats.annulees} color="#ef4444" bg="#fef2f2" />
                <StatCard icon={<Users2 size={16} />} label="Présents / Absents" value={`${stats.presents} / ${stats.absents}`} color="#8b5cf6" bg="#f5f3ff" />
            </div>

            {/* ── Filtres ── */}
            <div className="no-print" style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px',
                background: 'white', borderRadius: '18px', padding: '18px 20px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: '1 / -1', marginBottom: '-4px' }}>
                    <Filter size={13} color="#94a3b8" />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Filtres</span>
                </div>
                <FilterField label="Date exacte"><input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inputStyle} /></FilterField>
                <FilterField label="Du"><input type="date" value={fDateDebut} onChange={e => setFDateDebut(e.target.value)} style={inputStyle} /></FilterField>
                <FilterField label="Au"><input type="date" value={fDateFin} onChange={e => setFDateFin(e.target.value)} style={inputStyle} /></FilterField>
                <FilterField label="Enseignant">
                    <select value={fEnseignant} onChange={e => setFEnseignant(e.target.value)} style={inputStyle}>
                        <option value="">Tous</option>
                        {enseignants.map(e => <option key={e.enseignant_id} value={e.enseignant_id}>{e.prenom} {e.nom}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Classe">
                    <select value={fClasse} onChange={e => setFClasse(e.target.value)} style={inputStyle}>
                        <option value="">Toutes</option>
                        {classes.map(c => <option key={c.classe_id} value={c.classe_id}>{c.libelle}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Matière">
                    <select value={fMatiere} onChange={e => setFMatiere(e.target.value)} style={inputStyle}>
                        <option value="">Toutes</option>
                        {matieres.map(m => <option key={m.matiere_id} value={m.matiere_id}>{m.libelle}</option>)}
                    </select>
                </FilterField>
                <FilterField label="Statut">
                    <select value={fStatut} onChange={e => setFStatut(e.target.value)} style={inputStyle}>
                        <option value="">Tous</option>
                        {Object.entries(STATUT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </FilterField>
            </div>

            {/* ── Tableau ── */}
            <div className="no-print" style={{ background: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {loading && <div style={{ textAlign: 'center', padding: '60px' }}><Loader2 className="animate-spin" size={26} color="#7c3aed" /></div>}
                {!loading && seances.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontSize: '14px' }}>Aucune séance pour ces filtres.</p>
                )}
                {!loading && seances.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ ...thStyle, width: '4px', padding: 0 }}></th>
                                    <th style={thStyle}>Date</th>
                                    <th style={thStyle}>Horaire</th>
                                    <th style={thStyle}>Classe</th>
                                    <th style={thStyle}>Matière</th>
                                    <th style={thStyle}>Enseignant</th>
                                    <th style={thStyle}>Statut</th>
                                    <th style={thStyle}>Appel</th>
                                    <th style={thStyle}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {seances.map(s => {
                                    const col = couleurPour(s.classe);
                                    return (
                                        <tr key={s.seance_id} className="seance-row" onClick={() => ouvrirDetail(s.seance_id)} style={{ cursor: 'pointer' }}>
                                            <td style={{ padding: 0, background: col.border, width: '4px' }}></td>
                                            <td style={tdStyle}>{s.date_seance}</td>
                                            <td style={tdStyle}>{s.heure_debut_prevue}–{s.heure_fin_prevue}</td>
                                            <td style={tdStyle}><span style={{ fontWeight: 700, color: col.text }}>{s.classe}</span></td>
                                            <td style={tdStyle}>
                                                <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: col.bg, color: col.text }}>{s.matiere}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                {s.enseignant_reel && s.enseignant_reel !== s.enseignant_prevu ? (
                                                    <span title={`Prévu : ${s.enseignant_prevu}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <ArrowLeftRight size={12} color="#0ea5e9" /> {s.enseignant_reel}
                                                    </span>
                                                ) : s.enseignant_prevu}
                                            </td>
                                            <td style={tdStyle}>
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                                    background: `${STATUT_COLOR[s.statut]}18`, color: STATUT_COLOR[s.statut],
                                                }}>{STATUT_LABEL[s.statut] || s.statut}</span>
                                            </td>
                                            <td style={tdStyle}>
                                                {s.appel_fait ? (
                                                    <span style={{ display: 'flex', gap: '5px', fontSize: '11px', fontWeight: 700 }}>
                                                        <span style={{ color: '#10b981' }}>{s.nb_presents}P</span>
                                                        <span style={{ color: '#ef4444' }}>{s.nb_absents}A</span>
                                                        <span style={{ color: '#f59e0b' }}>{s.nb_retards}R</span>
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#cbd5e1', fontSize: '11px' }}>—</span>
                                                )}
                                            </td>
                                            <td style={tdStyle}><Search size={14} color="#cbd5e1" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Détail ── */}
            <AnimatePresence>
                {detail && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="seance-modal-overlay"
                        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                        onClick={() => setDetail(null)}>
                        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
                            onClick={e => e.stopPropagation()} className="seance-modal-card"
                            style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                            <div id="print-area" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                <div style={{ background: `linear-gradient(135deg, ${detailColor.border}, ${detailColor.text})`, padding: '22px 26px', color: 'white', flexShrink: 0 }}>
                                    <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '10px' }}>
                                        <button onClick={() => window.print()} style={{
                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '10px',
                                            border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.15)', cursor: 'pointer', fontWeight: 700, fontSize: '12px', color: 'white',
                                        }}>
                                            <Printer size={13} /> Imprimer
                                        </button>
                                        <button onClick={() => setDetail(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '10px', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <X size={16} color="white" />
                                        </button>
                                    </div>
                                    <p style={{ margin: 0, fontWeight: 800, fontSize: '19px' }}>{detail.matiere}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '14px', opacity: 0.9 }}>{detail.classe}</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '12px', fontSize: '12px', opacity: 0.9 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Calendar size={13} /> {detail.date_seance}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Clock size={13} /> {detail.heure_debut_prevue}–{detail.heure_fin_prevue}</span>
                                        {detail.salle && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MapPin size={13} /> Salle {detail.salle}</span>}
                                    </div>
                                    <p style={{ margin: '8px 0 0', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', opacity: 0.9 }}>
                                        <User size={13} /> {detail.enseignant_reel || detail.enseignant_prevu}
                                        {detail.enseignant_reel && detail.enseignant_reel !== detail.enseignant_prevu && ` (remplace ${detail.enseignant_prevu})`}
                                    </p>
                                    {detail.motif_statut && (
                                        <p style={{ margin: '8px 0 0', fontSize: '12px', opacity: 0.85, fontStyle: 'italic' }}>{detail.motif_statut}</p>
                                    )}
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    <div style={{ padding: '18px 24px 4px' }}>
                                        {detail.nb_presents !== null && (
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                                <StatBox label="Présents" value={detail.nb_presents} color="#10b981" bg="#f0fdf4" />
                                                <StatBox label="Absents" value={detail.nb_absents} color="#ef4444" bg="#fef2f2" />
                                                <StatBox label="Retards" value={detail.nb_retards} color="#f59e0b" bg="#fffbeb" />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: '4px 24px 20px' }}>
                                        {detail.eleves.length === 0 && (
                                            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <AlertTriangle size={20} color="#cbd5e1" /> Aucun appel enregistré pour cette séance.
                                            </p>
                                        )}
                                        {detail.eleves.map((e, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 600, color: '#1e293b' }}>{e.eleve}</p>
                                                    {e.matricule && <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{e.matricule}</p>}
                                                </div>
                                                <span style={{
                                                    fontWeight: 700, fontSize: '11px', padding: '3px 12px', borderRadius: '20px',
                                                    background: `${STATUT_PILL_COLOR[e.statut] || '#64748b'}18`, color: STATUT_PILL_COLOR[e.statut] || '#64748b',
                                                }}>{PRESENCE_LABEL[e.statut] || e.statut}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .seance-row { border-top: 1px solid #f1f5f9; transition: background 0.12s; }
                .seance-row:hover { background: #f8fafc; }

                /* globals.css gère déjà : sidebar/nav/header/boutons masqués,
                   .no-print retiré du flux (display:none, pas juste
                   invisible — important, sinon l'espace reste réservé et
                   produit des pages blanches), dégradés aplatis pour
                   l'encre, @page en paysage. Ici, seul le chrome propre à
                   CETTE modale (position fixe, hauteur/largeur plafonnées à
                   l'écran) a besoin d'être neutralisé pour que la fiche
                   s'imprime en entier plutôt que tronquée à la portion
                   visible à l'écran. */
                @media print {
                    .seance-modal-overlay {
                        position: static !important; background: none !important;
                        padding: 0 !important; display: block !important;
                    }
                    .seance-modal-card {
                        position: static !important; overflow: visible !important;
                        max-height: none !important; max-width: none !important;
                        width: 100% !important; box-shadow: none !important; border-radius: 0 !important;
                    }
                    #print-area { overflow: visible !important; }
                }
            `}</style>
        </div>
    );
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number | string; color: string; bg: string }) {
    return (
        <div style={{ background: bg, borderRadius: '14px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ color }}>{icon}</div>
            <div>
                <p style={{ margin: 0, fontSize: '17px', fontWeight: 800, color }}>{value}</p>
                <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, color, opacity: 0.8, whiteSpace: 'nowrap' }}>{label}</p>
            </div>
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
function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</label>
            {children}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px',
};
const thStyle: React.CSSProperties = { padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '12px 14px', color: '#1e293b' };
