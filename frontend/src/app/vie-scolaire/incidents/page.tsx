'use client';

/**
 * Vie scolaire › Incidents (discipline) — vue ADMIN.
 *
 * Les incidents remontés par la surveillance (portail surveillant) n'avaient
 * aucun écran côté direction : ils partaient dans le vide. Cette page les
 * liste (filtrables par gravité et statut) et permet de les marquer traités.
 * Alimentée par les routes déjà existantes : GET /vie-scolaire/incidents,
 * PUT /vie-scolaire/incidents/{id}/traiter.
 */
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Filter, Loader2, User } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface IncidentItem {
    incident_id: number;
    eleve_id: number;
    eleve_nom: string | null;
    matricule: string | null;
    classe: string | null;
    type_incident: string;
    gravite: string;
    description: string;
    signale_par: string;
    date_incident: string | null;
    statut: string;
}

const COULEUR_GRAVITE: Record<string, { bg: string; fg: string }> = {
    FAIBLE: { bg: '#ecfdf5', fg: '#059669' },
    MOYENNE: { bg: '#fffbeb', fg: '#b45309' },
    GRAVE: { bg: '#fef2f2', fg: '#b91c1c' },
    ELEVEE: { bg: '#fef2f2', fg: '#b91c1c' },
};

export default function IncidentsDisciplinePage() {
    const { user } = useAuth();
    const [incidents, setIncidents] = useState<IncidentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [gravite, setGravite] = useState('');
    const [statut, setStatut] = useState('');
    const [traitementEnCours, setTraitementEnCours] = useState<number | null>(null);

    const charger = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (gravite) params.set('gravite', gravite);
            if (statut) params.set('statut', statut);
            params.set('limit', '200');
            const res = await api.get(`/api/vie-scolaire/incidents?${params.toString()}`);
            setIncidents(res.data || []);
        } catch { setIncidents([]); }
        setLoading(false);
    }, [gravite, statut]);

    useEffect(() => { charger(); }, [charger]);

    const traiter = async (inc: IncidentItem) => {
        if (!confirm(`Marquer comme traité l'incident de ${inc.eleve_nom || 'cet élève'} ?`)) return;
        setTraitementEnCours(inc.incident_id);
        try {
            const par = `${user?.prenom || ''} ${user?.nom || ''}`.trim() || user?.role || 'Direction';
            await api.put(`/api/vie-scolaire/incidents/${inc.incident_id}/traiter?decision=TRAITE&traite_par=${encodeURIComponent(par)}`);
            charger();
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Traitement impossible');
        }
        setTraitementEnCours(null);
    };

    const enAttente = incidents.filter(i => i.statut !== 'TRAITE').length;

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <ShieldAlert size={22} />
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>Incidents (discipline)</h1>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>Ce que la surveillance a signalé — {enAttente} en attente de traitement.</p>
                </div>
            </div>

            {/* Filtres */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '18px 0' }}>
                <Filter size={16} style={{ color: '#94a3b8' }} />
                <select value={gravite} onChange={e => setGravite(e.target.value)} style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}>
                    <option value="">Toutes gravités</option>
                    <option value="FAIBLE">Faible</option>
                    <option value="MOYENNE">Moyenne</option>
                    <option value="GRAVE">Grave</option>
                </select>
                <select value={statut} onChange={e => setStatut(e.target.value)} style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}>
                    <option value="">Tous statuts</option>
                    <option value="SIGNALE">À traiter</option>
                    <option value="TRAITE">Traités</option>
                </select>
            </div>

            <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Date', 'Élève', 'Type', 'Gravité', 'Description', 'Signalé par', 'Statut', ''].map((h, i) => (
                                    <th key={i} style={{ textAlign: i === 4 ? 'left' : i <= 1 ? 'left' : 'center', padding: '11px 14px', fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}><Loader2 size={24} className="animate-spin" /></td></tr>
                            ) : incidents.length === 0 ? (
                                <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                                    <AlertTriangle size={28} style={{ color: '#cbd5e1', marginBottom: '8px' }} /><br />
                                    Aucun incident pour ces filtres.
                                </td></tr>
                            ) : incidents.map(inc => {
                                const c = COULEUR_GRAVITE[inc.gravite] || { bg: '#f1f5f9', fg: '#475569' };
                                const traite = inc.statut === 'TRAITE';
                                return (
                                    <tr key={inc.incident_id} style={{ borderTop: '1px solid #f1f5f9', background: traite ? '#fbfefc' : 'white' }}>
                                        <td style={{ padding: '12px 14px', fontSize: '12.5px', color: '#475569', whiteSpace: 'nowrap' }}>{inc.date_incident || '—'}</td>
                                        <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                                            <div style={{ fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '5px' }}><User size={13} style={{ color: '#94a3b8' }} /> {inc.eleve_nom || `#${inc.eleve_id}`}</div>
                                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{[inc.matricule, inc.classe].filter(Boolean).join(' · ')}</div>
                                        </td>
                                        <td style={{ padding: '12px 14px', fontSize: '12.5px', textAlign: 'center', color: '#475569' }}>{inc.type_incident}</td>
                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 11px', borderRadius: '999px', background: c.bg, color: c.fg }}>{inc.gravite}</span>
                                        </td>
                                        <td style={{ padding: '12px 14px', fontSize: '12.5px', color: '#334155', maxWidth: '320px' }}>{inc.description}</td>
                                        <td style={{ padding: '12px 14px', fontSize: '12px', textAlign: 'center', color: '#64748b', whiteSpace: 'nowrap' }}>{inc.signale_par}</td>
                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                            {traite ? (
                                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 11px', borderRadius: '999px', background: '#ecfdf5', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Traité</span>
                                            ) : (
                                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 11px', borderRadius: '999px', background: '#fffbeb', color: '#b45309' }}>À traiter</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                            {!traite && (
                                                <button onClick={() => traiter(inc)} disabled={traitementEnCours === inc.incident_id}
                                                    style={{ padding: '7px 14px', borderRadius: '9px', border: 'none', background: '#7c3aed', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                    {traitementEnCours === inc.incident_id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Traiter
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
